// Predefined token list for the DEX
// These are the addresses from the deployed test tokens

export const TOKEN_LIST = [
  {
    name: 'Ether',
    symbol: 'ETH',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Standard placeholder for ETH
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
  },
  {
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0xe216Bd07251b69F2328a7A5f525348f9cdbf6338', // Actual deployed address
    decimals: 18, // USDC typically has 6 decimals, but our TestToken uses 18
    logoURI: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png'
  },
  {
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    address: '0xe10106e6FB793d52Fc91B1A1045112813863142a', // Actual deployed address
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/9956/large/4948.png'
  },
  {
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    address: '0x9a59e5F6E905791cB87633b7cd416257FF20800D', // Actual deployed address
    decimals: 18, // Our TestToken uses 18 decimals
    logoURI: 'https://assets.coingecko.com/coins/images/7598/large/wrapped_bitcoin_wbtc.png'
  },
  {
    name: 'Wrapped Ether',
    symbol: 'WETH',
    address: '0x67e45d921ba7ac69fa38D4064711da3bf599b028', // Actual deployed address
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/2518/large/weth.png'
  },
  {
    name: 'Chainlink',
    symbol: 'LINK',
    address: '0x1BCB6AB76CDd9A593b73Ef3fE72cac28F4f73175', // Actual deployed address
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png'
  },
  {
    name: 'Uniswap',
    symbol: 'UNI',
    address: '0x27B9e704cf55BDbB8C07B63b851d675B91c7d24A', // Actual deployed address
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png'
  }
];

// Helper function to get token by symbol
export const getTokenBySymbol = (symbol) => {
  return TOKEN_LIST.find(token => token.symbol.toLowerCase() === symbol.toLowerCase());
};

// Helper function to get token by address
export const getTokenByAddress = (address) => {
  return TOKEN_LIST.find(token => token.address.toLowerCase() === address.toLowerCase());
};

// Helper function to search tokens
export const searchTokens = (query) => {
  if (!query) return TOKEN_LIST;
  const lowerQuery = query.toLowerCase();
  return TOKEN_LIST.filter(token =>
    token.name.toLowerCase().includes(lowerQuery) ||
    token.symbol.toLowerCase().includes(lowerQuery) ||
    token.address.toLowerCase().includes(lowerQuery)
  );
};