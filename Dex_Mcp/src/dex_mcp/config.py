"""
config.py -- single source of truth for the agent layer.

Loads .env, project paths, contract ABIs and the deployed token list, so the
live reader (web3.py), the transaction writer (web3_actions.py) and the MCP
server all agree on addresses.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Dex_Mcp/src/dex_mcp/config.py -> parents[3] is the repository root
PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_DIR.parents[2]
FRONTEND_CONTRACTS = PROJECT_ROOT / "frontend" / "src" / "contracts"
FRONTEND_CONSTANTS = PROJECT_ROOT / "frontend" / "src" / "constants"
ENV_PATH = PROJECT_ROOT / ".env"

load_dotenv(ENV_PATH)
load_dotenv()  # also pick up a local CWD .env if present

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:7545")
PRIVATE_KEY = os.getenv("PRIVATE_KEY") or os.getenv("Private_Key", "")
OPENROUTER_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
AGENT_INTERVAL_SECONDS = int(os.getenv("AGENT_INTERVAL_SECONDS", "60"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "db": os.getenv("DB_NAME", "AI_Autonomus_dex"),
    "autocommit": True,
}


def _env_address(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return ""


FACTORY_ADDRESS = _env_address("Factory_Address", "FACTORY_ADDRESS")
ROUTER_ADDRESS = _env_address("Router_Address", "ROUTER_ADDRESS")


@lru_cache(maxsize=None)
def load_abi(name: str) -> list:
    """Load a contract ABI saved by Scripts/deploy.js into the frontend folder."""
    path = FRONTEND_CONTRACTS / f"{name}ABI.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return []


@lru_cache(maxsize=1)
def load_tokens() -> dict[str, dict]:
    """
    Deployed test tokens as {SYMBOL: {"address": ..., "decimals": ...}}.
    Written by Scripts/deploy_tokens.js; falls back to .env values.
    """
    tokens: dict[str, dict] = {}

    path = FRONTEND_CONSTANTS / "deployedTokens.json"
    if path.exists():
        try:
            for token in json.loads(path.read_text()):
                tokens[token["symbol"].upper()] = {
                    "address": token["address"],
                    "decimals": token.get("decimals", 18),
                    "name": token.get("name", token["symbol"]),
                }
        except (json.JSONDecodeError, KeyError):
            pass

    for symbol in ("USDC", "DAI", "WBTC", "WETH", "LINK", "UNI"):
        address = _env_address(f"{symbol}_Address", f"{symbol}_ADDRESS")
        if address and symbol not in tokens:
            tokens[symbol] = {"address": address, "decimals": 18, "name": symbol}

    return tokens


def token_address(symbol: str) -> str:
    token = load_tokens().get(symbol.upper())
    return token["address"] if token else ""


def tracked_token_addresses() -> list[str]:
    """Every address the agents are allowed to trade, for balance lookups."""
    return [t["address"] for t in load_tokens().values()]


def require_abi(name: str) -> list:
    abi = load_abi(name)
    if not abi:
        raise RuntimeError(
            f"{name} ABI not found in {FRONTEND_CONTRACTS}. "
            "Run `npm run deploy` (or `npm run abis`) first."
        )
    return abi


def describe() -> str:
    tokens = load_tokens()
    lines = [
        f"RPC_URL          : {RPC_URL}",
        f"Factory_Address  : {FACTORY_ADDRESS or '(not set)'}",
        f"Router_Address   : {ROUTER_ADDRESS or '(not set)'}",
        f"Private key      : {'set' if PRIVATE_KEY else '(missing)'}",
        f"OpenRouter key   : {'set' if OPENROUTER_API_KEY else '(missing)'}",
        f"OpenRouter model : {OPENROUTER_MODEL}",
        f"Tokens           : {', '.join(sorted(tokens)) or '(none deployed)'}",
    ]
    return "\n".join(lines)
