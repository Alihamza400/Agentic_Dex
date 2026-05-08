import os
import json
import time
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:7545/")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# ── Load ABIs ─────────────────────────────────────────────────────────────────
_root = Path(__file__).resolve().parents[4]  # project root
_contracts = _root / "frontend" / "src" / "contracts"

def _load_abi(name: str) -> list:
    p = _contracts / f"{name}ABI.json"
    if p.exists():
        return json.loads(p.read_text())
    return []

ROUTER_ABI = _load_abi("DexRouter")
ERC20_ABI  = _load_abi("TestToken") # Standard ERC20 for approvals

ROUTER_ADDRESS = os.getenv("Router_Address", "")
PRIVATE_KEY    = os.getenv("Private_Key")

if not PRIVATE_KEY:
    print("Warning: Private_Key not found in .env")

account = w3.eth.account.from_key(PRIVATE_KEY) if PRIVATE_KEY else None

def _send_transaction(func, value=0):
    if not account:
        return {"error": "Account not initialized (check Private_Key)"}
    
    try:
        tx = func.build_transaction({
            'from': account.address,
            'value': value,
            'gas': 2000000,
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(account.address),
            'chainId': w3.eth.chain_id
        })
        
        signed_tx = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        return {
            "status": "success",
            "transactionHash": tx_hash.hex(),
            "blockNumber": receipt.blockNumber
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def approve_token(token_address: str, spender: str, amount: int):
    """Grant allowance to a spender (e.g., the Router)."""
    token = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    func = token.functions.approve(Web3.to_checksum_address(spender), amount)
    return _send_transaction(func)

def swap_tokens(token_in: str, token_out: str, amount_in: int, min_amount_out: int = 0):
    """Swap tokens using the single-hop router function."""
    if not ROUTER_ADDRESS:
        return {"error": "Router_Address not configured"}
        
    router = w3.eth.contract(address=Web3.to_checksum_address(ROUTER_ADDRESS), abi=ROUTER_ABI)
    deadline = int(time.time()) + 600 # 10 mins
    
    # First, ensure approval
    approve_token(token_in, ROUTER_ADDRESS, amount_in)
    
    func = router.functions.swapExactTokensForTokensSingle(
        Web3.to_checksum_address(token_in),
        Web3.to_checksum_address(token_out),
        amount_in,
        min_amount_out,
        deadline
    )
    return _send_transaction(func)

def add_liquidity(token_a: str, token_b: str, amount_a: int, amount_b: int):
    """Add liquidity to a pool."""
    if not ROUTER_ADDRESS:
        return {"error": "Router_Address not configured"}
        
    router = w3.eth.contract(address=Web3.to_checksum_address(ROUTER_ADDRESS), abi=ROUTER_ABI)
    deadline = int(time.time()) + 600
    
    # Approve both tokens
    approve_token(token_a, ROUTER_ADDRESS, amount_a)
    approve_token(token_b, ROUTER_ADDRESS, amount_b)
    
    func = router.functions.addLiquidity(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
        amount_a,
        amount_b,
        deadline
    )
    return _send_transaction(func)

def remove_liquidity(token_a: str, token_b: str, liquidity: int):
    ...
    func = router.functions.removeLiquidity(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
        liquidity,
        0, 
        0,
        deadline
    )
    return _send_transaction(func)

def get_balances(token_addresses: list[str]):
    """Fetch the agent's balance for multiple tokens."""
    if not account:
        return {"error": "Account not initialized"}
    
    balances = {}
    # Native ETH
    balances["ETH"] = str(w3.from_wei(w3.eth.get_balance(account.address), 'ether'))
    
    for addr in token_addresses:
        try:
            token = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=ERC20_ABI)
            symbol = token.functions.symbol().call()
            raw_bal = token.functions.balanceOf(account.address).call()
            # Standardize to string for Gemini
            balances[symbol] = str(raw_bal)
        except:
            balances[addr] = "Error"
            
    return balances

def execute_multi_hop_swap(path: list[str], amount_in: int, min_amount_out: int = 0):
    """Execute a multi-hop swap (e.g. for arbitrage)."""
    if not ROUTER_ADDRESS:
        return {"error": "Router_Address not configured"}
        
    router = w3.eth.contract(address=Web3.to_checksum_address(ROUTER_ADDRESS), abi=ROUTER_ABI)
    deadline = int(time.time()) + 600
    
    # Approve the first token in path
    approve_token(path[0], ROUTER_ADDRESS, amount_in)
    
    func = router.functions.swapExactTokensForTokens(
        amount_in,
        min_amount_out,
        [Web3.to_checksum_address(addr) for addr in path],
        deadline
    )
    return _send_transaction(func)
