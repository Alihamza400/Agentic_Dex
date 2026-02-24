import "@nomicfoundation/hardhat-toolbox";

export default {
  solidity: "0.8.20",
  networks: {
    ganache: {
      url:"http://127.0.0.1:7545",
      accounts:["0xbc9cb91597c456ba71ac42f366417893e4f55d6c2631b479c446314befc854b4"]
    },
  }
};

