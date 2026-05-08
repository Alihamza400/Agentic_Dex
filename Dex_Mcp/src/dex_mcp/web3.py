"""
web3.py – Live blockchain reader for MCP_Server.py
Reads directly from Ganache when DB data is unavailable or stale.
"""

import json
import os
import time
from pathlib import Path

from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# ── Load ABIs from frontend/src/contracts/ ────────────────────────────────────
_root = Path(__file__).resolve().parents[4]  # project root
_contracts = _root / "frontend" / "src" / "contracts"


def _load_abi(name: str) -> list:
    p = _contracts / f"{name}ABI.json"
    if p.exists():
        return json.loads(p.read_text())
    return []


PAIR_ABI    = _load_abi("DexPair")
FACTORY_ABI = _load_abi("DexFactory")
LP_ABI      = _load_abi("LPToken")

FACTORY_ADDRESS = os.getenv("Factory_Address", "")


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_all_pairs() -> list[str]:
    """Return all pair addresses registered in the Factory."""
    if not FACTORY_ADDRESS or not FACTORY_ABI:
        return []
    factory = w3.eth.contract(address=Web3.to_checksum_address(FACTORY_ADDRESS), abi=FACTORY_ABI)
    length = factory.functions.allPairsLength().call()
    return [factory.functions.allPairs(i).call() for i in range(length)]


def get_pool_state(pair_address: str) -> dict:
    """Read live reserves, spot price, and TWAP from a DexPair contract."""
    if not PAIR_ABI:
        return {"error": "DexPair ABI not loaded"}

    addr = Web3.to_checksum_address(pair_address)
    pair = w3.eth.contract(address=addr, abi=PAIR_ABI)

    try:
        r0, r1       = pair.functions.getReserves().call()
        spot_price   = (r1 * 10**18 // r0) if r0 else 0
        p0cum, p1cum = pair.functions.getTWAP().call()
        token0       = pair.functions.token0().call()
        token1       = pair.functions.token1().call()

        return {
            "pair":            pair_address,
            "token0":          token0,
            "token1":          token1,
            "reserve0":        r0,
            "reserve1":        r1,
            "spotPrice":       spot_price,
            "price0Cumulative": p0cum,
            "price1Cumulative": p1cum,
            "timestamp":       int(time.time()),
        }
    except Exception as e:
        return {"pair": pair_address, "error": str(e)}


def get_all_pool_states() -> list[dict]:
    """Fetch live state for all known pairs."""
    return [get_pool_state(p) for p in get_all_pairs()]


def is_connected() -> bool:
    return w3.is_connected()


def broadcast_agent_decision_on_chain(decision: dict) -> str:
    """
    Physically executes an on-chain transaction to prove the AI agent's work 
    and create a new block in Ganache, storing the decision as the transaction data.
    """
    private_key = os.getenv("Private_Key")
    if not private_key:
        return ""
        
    try:
        account = w3.eth.account.from_key(private_key)
        
        # Convert decision to hex data
        memo = json.dumps(decision).encode('utf-8')
        
        tx = {
            'nonce': w3.eth.get_transaction_count(account.address),
            'to': account.address, # Send to self
            'value': 0,
            'gas': 2000000,
            'gasPrice': w3.eth.gas_price,
            'data': memo,
            'chainId': w3.eth.chain_id
        }
        
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction) # type: ignore
        return tx_hash.hex()
    except Exception as e:
        print(f"Failed to broadcast to chain: {e}")
        return ""
