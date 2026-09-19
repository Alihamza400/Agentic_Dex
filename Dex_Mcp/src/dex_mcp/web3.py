"""
web3.py -- live blockchain reader for the agent layer.

Used directly by the agents and as a fallback by MCP_Server when the MySQL
index has no data yet, so the agents always see real on-chain state.
"""

from __future__ import annotations

import json
import sys
import time

from web3 import Web3

from dex_mcp.config import (
    FACTORY_ADDRESS,
    PRIVATE_KEY,
    RPC_URL,
    load_abi,
    load_tokens,
)

w3 = Web3(Web3.HTTPProvider(RPC_URL))

PAIR_ABI = load_abi("DexPair")
FACTORY_ABI = load_abi("DexFactory")
LP_ABI = load_abi("LPToken")
ERC20_ABI = load_abi("TestToken") or LP_ABI

SWAP_TOPIC = Web3.keccak(text="Swap(address,uint256,uint256)").hex()
if not SWAP_TOPIC.startswith("0x"):
    SWAP_TOPIC = "0x" + SWAP_TOPIC


def is_connected() -> bool:
    try:
        return w3.is_connected()
    except Exception:
        return False


def _account():
    if not PRIVATE_KEY:
        return None
    return w3.eth.account.from_key(PRIVATE_KEY)


# ── Pairs ─────────────────────────────────────────────────────────────────────

def get_factory():
    if not FACTORY_ADDRESS or not FACTORY_ABI:
        return None
    return w3.eth.contract(address=Web3.to_checksum_address(FACTORY_ADDRESS), abi=FACTORY_ABI)


def get_all_pairs() -> list[str]:
    """Every pair address registered in the Factory."""
    factory = get_factory()
    if factory is None:
        return []
    try:
        length = factory.functions.allPairsLength().call()
        return [factory.functions.allPairs(i).call() for i in range(length)]
    except Exception:
        return []


def get_pair_tokens(pair_address: str) -> tuple[str, str]:
    pair = w3.eth.contract(address=Web3.to_checksum_address(pair_address), abi=PAIR_ABI) if PAIR_ABI else None
    if pair is None:
        return ("", "")
    try:
        return (pair.functions.token0().call(), pair.functions.token1().call())
    except Exception:
        return ("", "")


def find_pair(token_a: str, token_b: str) -> str:
    factory = get_factory()
    if factory is None:
        return ""
    try:
        return factory.functions.getPair(
            Web3.to_checksum_address(token_a), Web3.to_checksum_address(token_b)
        ).call()
    except Exception:
        return ""


def pair_exists(token_a: str, token_b: str) -> bool:
    address = find_pair(token_a, token_b)
    return bool(address) and int(address, 16) != 0


# ── Pool state ────────────────────────────────────────────────────────────────

def get_pool_state(pair_address: str) -> dict:
    """Live reserves, spot price and TWAP cumulative prices for one pair."""
    if not PAIR_ABI:
        return {"pair": pair_address, "error": "DexPair ABI not loaded - run `npm run deploy`"}

    pair = w3.eth.contract(address=Web3.to_checksum_address(pair_address), abi=PAIR_ABI)
    try:
        r0, r1 = pair.functions.getReserves().call()
        token0 = pair.functions.token0().call()
        token1 = pair.functions.token1().call()

        spot = (r1 * 10**18) // r0 if r0 else 0
        try:
            p0cum, p1cum = pair.functions.getTWAP().call()
        except Exception:
            p0cum, p1cum = 0, 0

        return {
            "pair": pair_address,
            "token0": token0,
            "token1": token1,
            "token0Symbol": token_symbol(token0),
            "token1Symbol": token_symbol(token1),
            "reserve0": str(r0),
            "reserve1": str(r1),
            "spotPrice": str(spot),
            "price0Cumulative": str(p0cum),
            "price1Cumulative": str(p1cum),
            "blockNumber": w3.eth.block_number,
            "timestamp": int(time.time()),
            "source": "chain",
        }
    except Exception as exc:  # pair may not be initialized yet
        return {"pair": pair_address, "error": str(exc), "source": "chain"}


def get_all_pool_states() -> list[dict]:
    """Live state for every pair known to the factory."""
    if not is_connected():
        return [{"error": f"Cannot reach the blockchain at {RPC_URL}"}]
    return [get_pool_state(pair) for pair in get_all_pairs()]


# ── Tokens ────────────────────────────────────────────────────────────────────

_token_cache: dict[str, dict] = {}


def token_meta(address: str) -> dict:
    """symbol/decimals for an ERC-20, cached per process."""
    key = address.lower()
    if key in _token_cache:
        return _token_cache[key]

    meta = {"address": address, "symbol": address[:10], "decimals": 18}
    for symbol, token in load_tokens().items():
        if token["address"].lower() == key:
            meta.update({"symbol": symbol, "decimals": token.get("decimals", 18)})
            break

    if ERC20_ABI and not meta["symbol"].startswith("0x"):
        _token_cache[key] = meta
        return meta

    try:
        contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=ERC20_ABI)
        meta["symbol"] = contract.functions.symbol().call()
        meta["decimals"] = contract.functions.decimals().call()
    except Exception:
        pass

    _token_cache[key] = meta
    return meta


def token_symbol(address: str) -> str:
    return token_meta(address)["symbol"]


def get_token_balances(addresses: list[str] | None = None) -> dict:
    """Live balances for the agent's wallet, keyed by token symbol (plus ETH)."""
    account = _account()
    if account is None:
        return {"error": "PRIVATE_KEY missing in .env - cannot read or sign agent transactions"}

    if not is_connected():
        return {"error": f"Cannot reach the blockchain at {RPC_URL}"}

    balances: dict[str, str] = {
        "ETH": str(w3.from_wei(w3.eth.get_balance(account.address), "ether")),
        "wallet": account.address,
    }

    for address in addresses or [t["address"] for t in load_tokens().values()]:
        if not address:
            continue
        try:
            contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=ERC20_ABI)
            raw = contract.functions.balanceOf(account.address).call()
            meta = token_meta(address)
            balances[meta["symbol"]] = str(w3.from_wei(raw, "ether"))
        except Exception as exc:
            balances[address[:10]] = f"error: {exc}"

    return balances


# ── Events ────────────────────────────────────────────────────────────────────

def get_recent_swaps(limit: int = 20, lookback_blocks: int = 5000) -> list[dict]:
    """Live Swap events across all pairs (newest first)."""
    if not PAIR_ABI or not is_connected():
        return []

    pairs = get_all_pairs()
    if not pairs:
        return []

    head = w3.eth.block_number
    from_block = max(0, head - lookback_blocks)

    try:
        logs = w3.eth.get_logs(
            {
                "fromBlock": from_block,
                "toBlock": "latest",
                "address": [Web3.to_checksum_address(p) for p in pairs],
                "topics": [SWAP_TOPIC],
            }
        )
    except Exception:
        return []

    contract = w3.eth.contract(abi=PAIR_ABI)
    swap_event = contract.events.Swap()
    block_times: dict[int, int] = {}
    swaps: list[dict] = []

    for log in logs[-limit:]:
        try:
            decoded = swap_event.process_log(log)
            block_number = decoded["blockNumber"]
            if block_number not in block_times:
                block_times[block_number] = w3.eth.get_block(block_number)["timestamp"]
            swaps.append(
                {
                    "blockNumber": block_number,
                    "transactionHash": decoded["transactionHash"].hex(),
                    "contractAddress": decoded["address"],
                    "eventName": "Swap",
                    "data": {
                        "sender": decoded["args"]["sender"],
                        "amountIn": str(decoded["args"]["amountIn"]),
                        "amountOut": str(decoded["args"]["amountOut"]),
                    },
                    "createdAt": block_times[block_number],
                    "source": "chain",
                }
            )
        except Exception:
            continue

    return list(reversed(swaps))


# ── Writes ────────────────────────────────────────────────────────────────────

def broadcast_agent_decision_on_chain(decision: dict) -> str:
    """
    Anchors an agent decision on-chain as a self-transaction with the decision
    JSON in the calldata, so every decision leaves an audit trail in a block.
    """
    account = _account()
    if account is None:
        return ""

    try:
        payload = json.dumps(decision, default=str).encode("utf-8")
        tx = {
            "nonce": w3.eth.get_transaction_count(account.address),
            "to": account.address,
            "value": 0,
            "gas": 2000000,
            "gasPrice": w3.eth.gas_price,
            "data": payload,
            "chainId": w3.eth.chain_id,
        }
        signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
        tx_hash = w3.eth.send_raw_transaction(raw)
        return tx_hash.hex()
    except Exception as exc:
        print(f"Failed to broadcast decision on-chain: {exc}", file=sys.stderr)
        return ""
