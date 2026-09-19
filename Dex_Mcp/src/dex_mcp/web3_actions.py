"""
web3_actions.py -- on-chain writes for the AI agents (swap, liquidity, approvals).

All functions return a plain dict so they can be handed straight back to the LLM
as a tool result: {"status": "success", "transactionHash": ..., "blockNumber": ...}
or {"status": "error", "message": ...}
"""

from __future__ import annotations

import sys
import time

from web3 import Web3

from dex_mcp.config import (
    FACTORY_ADDRESS,
    PRIVATE_KEY,
    ROUTER_ADDRESS,
    load_abi,
    load_tokens,
)
from dex_mcp.web3 import w3, get_token_balances, get_pool_state, find_pair

ROUTER_ABI = load_abi("DexRouter")
ERC20_ABI = load_abi("TestToken")
FACTORY_ABI = load_abi("DexFactory")

account = w3.eth.account.from_key(PRIVATE_KEY) if PRIVATE_KEY else None

DEADLINE_SECONDS = 600

# ── Risk enforcement ──────────────────────────────────────────────────────────
# Circuit breaker: after CONSECUTIVE_FAILURE_LIMIT failures, refuse further trades.
CONSECUTIVE_FAILURE_LIMIT = 3
_consecutive_failures = 0

# Risk-level -> max fraction of wallet balance per trade
RISK_MAX_TRADE_FRACTION = {
    "low": 0.05,      # 5% of wallet
    "medium": 0.10,   # 10% of wallet
    "high": 0.20,     # 20% of wallet
}

# Risk-level -> max allowed slippage (as fraction of expected output)
RISK_MAX_SLIPPAGE = {
    "low": 0.005,     # 0.5%
    "medium": 0.01,   # 1%
    "high": 0.03,     # 3%
}


def _record_failure() -> None:
    global _consecutive_failures
    _consecutive_failures += 1
    if _consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
        print(
            f"[risk] Circuit breaker tripped after {_consecutive_failures} consecutive failures. "
            "No more trades until the agent restarts or resets the counter.",
            file=sys.stderr,
        )


def _record_success() -> None:
    global _consecutive_failures
    _consecutive_failures = 0


def _circuit_breaker_active() -> bool:
    return _consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT


async def _get_risk_level() -> str:
    """Read the current risk_level from agent_config, defaulting to 'medium'."""
    try:
        from dex_mcp.MCP_Server import get_pool
        import aiomysql
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT risk_level FROM agent_config WHERE id = 1")
                row = await cur.fetchone()
        if row and row.get("risk_level"):
            return row["risk_level"].lower()
    except Exception:
        pass
    return "medium"


def _check_trade_size(token_in: str, amount_in: int, risk_level: str) -> dict | None:
    """Reject trades exceeding the risk-adjusted max fraction of token balance.
    Returns an error dict if rejected, None if OK."""
    if account is None:
        return None  # can't check without an account; let the send fail later

    try:
        token_contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_in), abi=ERC20_ABI
        )
        balance = token_contract.functions.balanceOf(account.address).call()
    except Exception:
        return None  # can't check; let it proceed

    max_fraction = RISK_MAX_TRADE_FRACTION.get(risk_level, 0.10)
    max_allowed = int(balance * max_fraction)

    if amount_in > max_allowed:
        return {
            "status": "error",
            "message": (
                f"Trade rejected: {amount_in} wei exceeds {max_fraction*100:.0f}% "
                f"of token balance ({balance} wei). Max allowed: {max_allowed} wei. "
                f"Risk level: {risk_level}."
            ),
        }
    return None


def _check_slippage(amount_out: int, min_amount_out: int, risk_level: str) -> dict | None:
    """Reject if min_amount_out is too far below the expected output (>max slippage).
    Returns an error dict if rejected, None if OK."""
    if min_amount_out <= 0 or amount_out <= 0:
        return None  # can't check without valid amounts

    max_slippage = RISK_MAX_SLIPPAGE.get(risk_level, 0.01)
    slippage = (amount_out - min_amount_out) / amount_out
    if slippage > max_slippage:
        return {
            "status": "error",
            "message": (
                f"Slippage rejected: {slippage*100:.2f}% exceeds max {max_slippage*100:.1f}% "
                f"for risk level '{risk_level}'. Expected: {amount_out}, Min: {min_amount_out}."
            ),
        }
    return None


def _deadline() -> int:
    return int(time.time()) + DEADLINE_SECONDS


def router():
    if not ROUTER_ADDRESS or not ROUTER_ABI:
        raise RuntimeError("Router_Address missing or DexRouter ABI not exported. Run `npm run deploy`.")
    return w3.eth.contract(address=Web3.to_checksum_address(ROUTER_ADDRESS), abi=ROUTER_ABI)


def _send_transaction(func, value: int = 0) -> dict:
    if _circuit_breaker_active():
        return {
            "status": "error",
            "message": (
                f"Circuit breaker active: {_consecutive_failures} consecutive failures. "
                "Restart the agent or reset the failure counter to resume trading."
            ),
        }

    if account is None:
        return {"status": "error", "message": "PRIVATE_KEY not configured in .env"}

    try:
        # Account for transactions we already broadcast but that are still unmined
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        base = {
            "from": account.address,
            "value": value,
            "nonce": nonce,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        }

        try:
            gas = func.estimate_gas({"from": account.address, "value": value})
            base["gas"] = int(gas * 1.2) + 5000
        except Exception:
            base["gas"] = 2_000_000

        tx = func.build_transaction(base)
        signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
        tx_hash = w3.eth.send_raw_transaction(raw)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)

        if receipt.status != 1:
            _record_failure()
            return {
                "status": "error",
                "message": "Transaction reverted on-chain",
                "transactionHash": tx_hash.hex(),
            }

        _record_success()
        return {
            "status": "success",
            "transactionHash": tx_hash.hex(),
            "blockNumber": receipt.blockNumber,
            "gasUsed": receipt.gasUsed,
        }
    except Exception as exc:
        _record_failure()
        message = str(exc)
        if "insufficient funds" in message.lower():
            message += " (the agent wallet has no ETH - fund the Ganache account)"
        return {"status": "error", "message": message}


# ── Approvals ─────────────────────────────────────────────────────────────────

def approve_token(token_address: str, spender: str, amount: int) -> dict:
    """Grant an ERC-20 allowance (skipped when one already exists)."""
    try:
        token = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    except Exception as exc:
        return {"status": "error", "message": f"Invalid token address: {exc}"}

    if account is None:
        return {"status": "error", "message": "PRIVATE_KEY not configured in .env"}

    try:
        current = token.functions.allowance(account.address, Web3.to_checksum_address(spender)).call()
        if current >= amount:
            return {"status": "success", "message": "Allowance already sufficient", "skipped": True}
    except Exception:
        pass

    return _send_transaction(token.functions.approve(Web3.to_checksum_address(spender), amount))


# ── Trading ───────────────────────────────────────────────────────────────────

def ensure_pair(token_a: str, token_b: str) -> dict:
    """Create the pair if it does not exist yet."""
    if find_pair(token_a, token_b) and int(find_pair(token_a, token_b), 16) != 0:
        return {"status": "success", "message": "Pair already exists"}

    if not FACTORY_ADDRESS or not FACTORY_ABI:
        return {"status": "error", "message": "Factory_Address missing in .env"}

    factory = w3.eth.contract(address=Web3.to_checksum_address(FACTORY_ADDRESS), abi=FACTORY_ABI)
    result = _send_transaction(
        factory.functions.createPair(
            Web3.to_checksum_address(token_a), Web3.to_checksum_address(token_b)
        )
    )
    if result.get("status") == "success":
        result["pair"] = find_pair(token_a, token_b)
    return result


def swap_tokens(token_in: str, token_out: str, amount_in: int, min_amount_out: int = 0) -> dict:
    """Single-hop swap through the router (approves first)."""
    try:
        contract = router()
    except RuntimeError as exc:
        return {"status": "error", "message": str(exc)}

    # Risk: check trade size against wallet balance
    risk_level = "medium"
    try:
        import asyncio
        risk_level = asyncio.get_event_loop().run_until_complete(_get_risk_level())
    except Exception:
        pass

    size_check = _check_trade_size(token_in, amount_in, risk_level)
    if size_check:
        return size_check

    approval = approve_token(token_in, ROUTER_ADDRESS, amount_in)
    if approval.get("status") != "success":
        return approval

    func = contract.functions.swapExactTokensForTokensSingle(
        Web3.to_checksum_address(token_in),
        Web3.to_checksum_address(token_out),
        amount_in,
        min_amount_out,
        _deadline(),
    )

    result = _send_transaction(func)
    if result.get("status") == "success":
        result["quote"] = quote(token_in, token_out, amount_in)
        # Risk: verify actual slippage against quote
        if result.get("quote", {}).get("amountOut"):
            expected_out = int(result["quote"]["amountOut"])
            slippage_check = _check_slippage(expected_out, min_amount_out, risk_level)
            if slippage_check:
                return slippage_check
        # Record the trade for PnL tracking
        _record_trade_async(
            agent="Quant_Orchestrator",
            action="SWAP",
            tx_hash=result.get("transactionHash", ""),
            block_number=result.get("blockNumber", 0),
            token_in=token_in,
            token_out=token_out,
            amount_in=str(amount_in),
            amount_out=str(result.get("quote", {}).get("amountOut", "")),
            quote_amount=str(result.get("quote", {}).get("amountOut", "")),
            status="success",
            gas_used=result.get("gasUsed", 0),
        )
    return result


def execute_multi_hop_swap(path: list[str], amount_in: int, min_amount_out: int = 0) -> dict:
    """Multi-hop swap used for arbitrage (e.g. A -> B -> C -> A)."""
    if len(path) < 2:
        return {"status": "error", "message": "Path needs at least two tokens"}

    try:
        contract = router()
    except RuntimeError as exc:
        return {"status": "error", "message": str(exc)}

    # Risk: check trade size against wallet balance
    risk_level = "medium"
    try:
        import asyncio
        risk_level = asyncio.get_event_loop().run_until_complete(_get_risk_level())
    except Exception:
        pass

    size_check = _check_trade_size(path[0], amount_in, risk_level)
    if size_check:
        return size_check

    approval = approve_token(path[0], ROUTER_ADDRESS, amount_in)
    if approval.get("status") != "success":
        return approval

    func = contract.functions.swapExactTokensForTokens(
        amount_in,
        min_amount_out,
        [Web3.to_checksum_address(address) for address in path],
        _deadline(),
    )
    result = _send_transaction(func)
    if result.get("status") == "success":
        # Record the multi-hop trade for PnL tracking
        _record_trade_async(
            agent="Quant_Orchestrator",
            action="ARBITRAGE",
            tx_hash=result.get("transactionHash", ""),
            block_number=result.get("blockNumber", 0),
            token_in=path[0],
            token_out=path[-1],
            amount_in=str(amount_in),
            amount_out="",
            quote_amount="",
            status="success",
            gas_used=result.get("gasUsed", 0),
        )
    return result


def quote(token_in: str, token_out: str, amount_in: int) -> dict:
    """Off-chain quote for a single hop, matching the pair's 0.3% fee formula."""
    pair_address = find_pair(token_in, token_out)
    if not pair_address or int(pair_address, 16) == 0:
        return {"error": "Pair does not exist"}

    state = get_pool_state(pair_address)
    try:
        r0, r1 = int(state["reserve0"]), int(state["reserve1"])
        is_token0_in = state["token0"].lower() == token_in.lower()
        reserve_in, reserve_out = (r0, r1) if is_token0_in else (r1, r0)
        if reserve_in == 0 or reserve_out == 0:
            return {"error": "Pool has no liquidity"}

        amount_in_with_fee = amount_in * 997
        amount_out = (amount_in_with_fee * reserve_out) // (reserve_in * 1000 + amount_in_with_fee)
        return {
            "pair": pair_address,
            "amountIn": str(amount_in),
            "amountOut": str(amount_out),
            "effectivePrice": (amount_out * 10**18 // amount_in) if amount_in else 0,
        }
    except (KeyError, TypeError, ZeroDivisionError) as exc:
        return {"error": f"Quote failed: {exc}"}


# ── Liquidity ─────────────────────────────────────────────────────────────────

def add_liquidity(token_a: str, token_b: str, amount_a: int, amount_b: int) -> dict:
    """Add liquidity, creating the pair when needed."""
    try:
        contract = router()
    except RuntimeError as exc:
        return {"status": "error", "message": str(exc)}

    if not find_pair(token_a, token_b) or int(find_pair(token_a, token_b), 16) == 0:
        created = ensure_pair(token_a, token_b)
        if created.get("status") == "error":
            return created

    for token_address, amount in ((token_a, amount_a), (token_b, amount_b)):
        approval = approve_token(token_address, ROUTER_ADDRESS, amount)
        if approval.get("status") != "success":
            return approval

    func = contract.functions.addLiquidity(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
        amount_a,
        amount_b,
        _deadline(),
    )
    return _send_transaction(func)


def remove_liquidity(
    token_a: str,
    token_b: str,
    liquidity: int,
    min_amount_a: int = 0,
    min_amount_b: int = 0,
) -> dict:
    """Burn LP tokens and receive both underlying tokens back."""
    try:
        contract = router()
    except RuntimeError as exc:
        return {"status": "error", "message": str(exc)}

    pair_address = find_pair(token_a, token_b)
    if not pair_address or int(pair_address, 16) == 0:
        return {"status": "error", "message": "Pair does not exist"}

    pair = w3.eth.contract(address=Web3.to_checksum_address(pair_address), abi=load_abi("DexPair"))
    try:
        lp_address = pair.functions.lpToken().call()
    except Exception as exc:
        return {"status": "error", "message": f"Cannot read LP token: {exc}"}

    approval = approve_token(lp_address, ROUTER_ADDRESS, liquidity)
    if approval.get("status") != "success":
        return approval

    func = contract.functions.removeLiquidity(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
        liquidity,
        min_amount_a,
        min_amount_b,
        _deadline(),
    )
    return _send_transaction(func)


# ── Reads (re-exported for the MCP tools) ─────────────────────────────────────

def get_balances(token_addresses: list[str] | None = None) -> dict:
    """Agent wallet balances, human readable, keyed by token symbol."""
    return get_token_balances(token_addresses)


def get_deployed_tokens() -> dict:
    """Symbol -> address/decimals for every token the agents may trade."""
    return {symbol: {"address": meta["address"], "decimals": meta.get("decimals", 18)}
            for symbol, meta in load_tokens().items()}


# ── Trade recording (async helper) ───────────────────────────────────────────

def _record_trade_async(
    agent: str,
    action: str,
    tx_hash: str,
    block_number: int,
    token_in: str,
    token_out: str,
    amount_in: str,
    amount_out: str,
    quote_amount: str = "",
    status: str = "success",
    gas_used: int = 0,
) -> None:
    """Fire-and-forget trade recording. Never blocks the caller."""
    import asyncio
    from dex_mcp.MCP_Server import _record_agent_trade

    async def _do_record():
        await _record_agent_trade(
            agent=agent,
            action=action,
            tx_hash=tx_hash,
            block_number=block_number,
            token_in=token_in,
            token_out=token_out,
            amount_in=amount_in,
            amount_out=amount_out,
            quote_amount=quote_amount,
            status=status,
            gas_used=gas_used,
        )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_do_record())
        else:
            loop.run_until_complete(_do_record())
    except RuntimeError:
        # No event loop running - create one
        asyncio.run(_do_record())
