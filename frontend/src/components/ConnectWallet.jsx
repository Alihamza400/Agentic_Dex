import { useContext, useState } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { motion, AnimatePresence } from "framer-motion";

export default function ConnectWallet() {
  const { account, connectWallet, disconnectWallet, ethBalance, chainId } = useContext(Web3Context);
  const [copied, setCopied] = useState(false);

  const getChainName = (chainId) => {
    switch (chainId) {
      case 1: return "Ethereum";
      case 5: return "Goerli";
      case 1337: return "Localhost";
      case 31337: return "Hardhat";
      default: return `Chain ${chainId}`;
    }
  };

  const copyToClipboard = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = (e) => {
    e.stopPropagation();
    console.log("ConnectWallet: Disconnect button clicked.");
    disconnectWallet();
  };

  return (
    <div className="relative z-50">
      <AnimatePresence mode="wait">
        {!account ? (
          <motion.div
            key="connect-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            <motion.button
              whileHover={{
                scale: 1.02,
                boxShadow: "0 0 25px rgba(34, 211, 238, 0.4)"
              }}
              whileTap={{ scale: 0.98 }}
              onClick={connectWallet}
              className="relative group overflow-hidden bg-gray-900 px-8 py-4 rounded-2xl font-bold text-white shadow-2xl transition-all duration-300 w-full"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

              <span className="relative flex items-center justify-center space-x-3 drop-shadow-md pointer-events-none">
                <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="tracking-wider uppercase text-sm font-bold">Connect Wallet</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] backdrop-blur-sm border border-white/30">Web3</span>
              </span>
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="connected-view"
            initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            className="relative group p-1"
          >
            {/* Animated border glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-blue-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200 pointer-events-none"></div>

            <div className="relative bg-gray-900/90 backdrop-blur-2xl px-5 py-5 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              {/* Background ambient light */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 blur-[60px] rounded-full pointer-events-none"></div>

              <div className="flex flex-col space-y-4">
                {/* Header Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.8)]"></div>
                      <div className="absolute inset-0 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75"></div>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">{getChainName(chainId)}</span>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-all duration-300 group/exit relative z-[60]"
                    title="Disconnect Wallet"
                  >
                    <svg className="w-4 h-4 shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>

                {/* Account Section */}
                <div
                  className="group/acc relative bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-300"
                  onClick={copyToClipboard}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/10 shadow-lg">
                        {account.slice(2, 4).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 font-medium">Active Account</span>
                        <span className="text-sm font-mono text-white tracking-wider">
                          {account.slice(0, 6)}...{account.slice(-4)}
                        </span>
                      </div>
                    </div>
                    <div className="text-white/40 group-hover/acc:text-cyan-400 transition-colors">
                      {copied ? (
                        <span className="text-[10px] text-green-400 font-bold uppercase">Copied!</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* Balance Section */}
                <div className="flex items-end justify-between px-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Available Balance</span>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        {Number(ethBalance).toFixed(4)}
                      </span>
                      <span className="text-xs font-black text-cyan-400">ETH</span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/10"></div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Portfolio</span>
                    <span className="text-sm font-bold text-white">Active</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
