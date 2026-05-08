from eth_utils import keccak
print('Swap:', '0x' + keccak(text='Swap(address,uint256,uint256)').hex())
print('Mint:', '0x' + keccak(text='Mint(address,uint256,uint256,uint256)').hex())
print('Burn:', '0x' + keccak(text='Burn(address,uint256,uint256,uint256)').hex())
print('Sync:', '0x' + keccak(text='Sync(uint112,uint112,uint256,uint256)').hex())
