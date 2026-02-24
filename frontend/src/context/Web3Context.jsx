import { createContext, useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import DexFactory from "../contracts/DexFactoryABI.json";
import DexRouter from "../contracts/DexRouterABI.json";
import DexPair from "../contracts/DexPairABI.json";
import LPToken from "../contracts/LPTokenABI.json";
import TestToken from "../contracts/TestTokenABI.json";
import addresses from "../contracts/addresses.json";

export const Web3Context = createContext();

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [factory, setFactory] = useState(null);
  const [router, setRouter] = useState(null);
  const [ethBalance, setEthBalance] = useState("0");
  const [chainId, setChainId] = useState(null);

  const FACTORY_ADDRESS = addresses.DexFactory;
  const ROUTER_ADDRESS = addresses.DexRouter;

  const disconnectWallet = useCallback(() => {
    console.log("Web3Context: Manual disconnect initiated.");
    setAccount(null);
    setProvider(null);
    setFactory(null);
    setRouter(null);
    setEthBalance("0");
    setChainId(null);
    localStorage.removeItem("isWalletConnected");
    console.log("Web3Context: Disconnected and storage cleared.");
  }, []);

  const refreshBalance = useCallback(async (prov, accountAddr) => {
    if (!prov || !accountAddr) return;
    try {
      console.log("Web3Context: Fetching balance for:", accountAddr);
      const balance = await prov.getBalance(accountAddr);
      const formattedBalance = ethers.formatEther(balance);
      setEthBalance(formattedBalance);
      console.log("Web3Context: Balance retrieved:", formattedBalance, "ETH");
    } catch (err) {
      console.error("Web3Context: Error fetching balance:", err);
    }
  }, []);

  const initContracts = useCallback(async (prov, accountAddr) => {
    try {
      console.log("Web3Context: Initializing contracts and data...");
      const signer = await prov.getSigner();

      setFactory(new ethers.Contract(FACTORY_ADDRESS, DexFactory, signer));
      setRouter(new ethers.Contract(ROUTER_ADDRESS, DexRouter, signer));

      await refreshBalance(prov, accountAddr);

      const network = await prov.getNetwork();
      setChainId(network.chainId);
      console.log("Web3Context: Contracts initialized, chainId:", network.chainId);
    } catch (err) {
      console.error("Web3Context: Error in initContracts:", err);
    }
  }, [FACTORY_ADDRESS, refreshBalance]);

  const connectWallet = useCallback(async () => {
    console.log("Web3Context: Manual connect initiated (Forcing credentials)...");
    try {
      if (!window.ethereum) {
        return alert("Please install MetaMask or another wallet.");
      }

      // Force account selection/re-auth by requesting permissions
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const prov = new ethers.BrowserProvider(window.ethereum);

      setAccount(accounts[0]);
      setProvider(prov);
      await initContracts(prov, accounts[0]);

      localStorage.setItem("isWalletConnected", "true");
      console.log("Web3Context: Manual connection successful:", accounts[0]);
    } catch (err) {
      console.error("Web3Context: connectWallet error:", err);
    }
  }, [initContracts]);

  const autoConnect = useCallback(async () => {
    console.log("Web3Context: Auto-connecting...");
    if (localStorage.getItem("isWalletConnected") !== "true") return;

    try {
      if (!window.ethereum) return;

      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        const prov = new ethers.BrowserProvider(window.ethereum);
        setAccount(accounts[0]);
        setProvider(prov);
        await initContracts(prov, accounts[0]);
        console.log("Web3Context: Auto-connection successful:", accounts[0]);
      } else {
        console.log("Web3Context: Auto-connect: site authorized but wallet locked/no accounts accessible.");
      }
    } catch (err) {
      console.error("Web3Context: autoConnect error:", err);
    }
  }, [initContracts]);

  // Helper functions to create contracts - Updated to be async for Ethers v6
  const createPairContract = useCallback(async (pairAddress) => {
    if (!provider) return null;
    const signer = await provider.getSigner();
    return new ethers.Contract(pairAddress, DexPair, signer);
  }, [provider]);

  const createLPTokenContract = useCallback(async (lpTokenAddress) => {
    if (!provider) return null;
    const signer = await provider.getSigner();
    return new ethers.Contract(lpTokenAddress, LPToken, signer);
  }, [provider]);

  const createTokenContract = useCallback(async (tokenAddress) => {
    if (!provider) return null;
    const signer = await provider.getSigner();
    return new ethers.Contract(tokenAddress, TestToken, signer);
  }, [provider]);

  useEffect(() => {
    autoConnect();

    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      console.log("Web3Context: accountsChanged", accounts);
      if (accounts.length === 0) {
        setAccount(null);
        setProvider(null);
        setFactory(null);
        setRouter(null);
        setEthBalance("0");
        setChainId(null);
      } else {
        setAccount(accounts[0]);
        const prov = new ethers.BrowserProvider(window.ethereum);
        setProvider(prov);
        await initContracts(prov, accounts[0]);
      }
    };

    const handleChainChanged = (chainIdHex) => {
      console.log("Web3Context: chainChanged", chainIdHex);
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [autoConnect, initContracts]);

  return (
    <Web3Context.Provider value={{
      account,
      provider,
      factory,
      router,
      connectWallet,
      disconnectWallet,
      refreshBalance: () => refreshBalance(provider, account),
      ethBalance,
      chainId,
      createPairContract,
      createLPTokenContract,
      createTokenContract,
      DexFactoryABI: DexFactory,
      DexRouterABI: DexRouter,
      DexPairABI: DexPair,
      LPTokenABI: LPToken,
      TestTokenABI: TestToken
    }}>
      {children}
    </Web3Context.Provider>
  );
}
