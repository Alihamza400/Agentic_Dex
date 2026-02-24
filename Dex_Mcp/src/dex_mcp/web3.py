from web3 import Web3
web3 = Web3(Web3.HTTPProvider(RPC_URL))

PAIR_ABI = [...]  # include getReserves, getTWAP/getters if present
LP_ABI = [...]    # totalSupply

def get_pool_state(pair_address):
    pair = web3.eth.contract(address=pair_address, abi=PAIR_ABI)
    r0, r1 = pair.functions.getReserves().call()
    total = pair.functions.lpToken().call()  # if pair exposes lpToken, or call LP token contract
    spot_price = (r1 * 10**18) // r0 if r0 else 0
    # read TWAP cumulatives (if implemented)
    twap = pair.functions.getTWAP().call()  # returns (p0cum, p1cum)
    return {
        "pair": pair_address, "reserve0": r0, "reserve1": r1,
        "totalSupply": total, "spot_price": spot_price, "twap": twap,
        "timestamp": int(time.time())
    }
