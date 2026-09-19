import React, { useContext, useState, useEffect, useCallback } from 'react';
import { Web3Context } from '../context/Web3Context.jsx';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { ethers } from 'ethers';
import deployedTokens from '../constants/deployedTokens.json';

const TestTokenABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const FAUCET_AMOUNT = '10000';

const TokenFaucet = () => {
  const { account, provider } = useContext(Web3Context);
  const [balances, setBalances] = useState({});
  const [claiming, setClaiming] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!provider || !account) return;
    const newBalances = {};
    for (const token of deployedTokens) {
      try {
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(token.address, TestTokenABI, signer);
        const bal = await contract.balanceOf(account);
        newBalances[token.symbol] = (Number(bal) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });
      } catch {
        newBalances[token.symbol] = 'Error';
      }
    }
    setBalances(newBalances);
  }, [provider, account]);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  const claimTokens = async () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }
    setClaiming(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/Scripts/api_agent.php';
      const response = await fetch(`${API_BASE}?action=faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: account }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success(`Claimed ${FAUCET_AMOUNT} of each token!`);
        setTimeout(fetchBalances, 2000);
      } else {
        toast.error(data.message || 'Faucet failed');
      }
    } catch {
      toast.error(`Faucet API unreachable. Run: FAUCET_ADDRESS=${account} npm run faucet`);
    } finally {
      setClaiming(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(account);
    toast.info('Address copied!');
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(`FAUCET_ADDRESS=${account} npm run faucet`);
    toast.info('Command copied! Paste in terminal and run.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl"
    >
      <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
        Token Faucet
      </h2>

      {!account ? (
        <div className="text-center text-gray-400 py-8">
          Connect your wallet to claim test tokens
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connected Address */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Connected Wallet</div>
            <div className="flex items-center gap-2">
              <code className="text-cyan-400 text-sm font-mono break-all flex-1">{account}</code>
              <button onClick={copyAddress} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white transition-colors">
                Copy
              </button>
            </div>
          </div>

          {/* Token Balances */}
          <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
            <h3 className="text-lg font-semibold text-gray-300 mb-4">Your Balances</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {deployedTokens.map((token) => (
                <div key={token.symbol} className="bg-gray-600/30 rounded-lg p-3">
                  <div className="text-sm text-gray-400">{token.symbol}</div>
                  <div className="text-lg font-bold text-white">{balances[token.symbol] ?? '...'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Claim Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={claimTokens}
            disabled={claiming}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-4 rounded-xl font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {claiming ? 'Claiming...' : `Claim ${FAUCET_AMOUNT} of Each Token`}
          </motion.button>

          {/* CLI Fallback */}
          <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-2">Or run this in the project terminal:</div>
            <div className="flex items-center gap-2">
              <code className="text-green-400 text-xs font-mono flex-1 bg-gray-800 px-3 py-2 rounded">
                FAUCET_ADDRESS={account} npm run faucet
              </code>
              <button onClick={copyCommand} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white transition-colors">
                Copy
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Each claim sends {FAUCET_AMOUNT} tokens of every type to your wallet.
            <br />Powered by the deployer account on the local Ganache chain.
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default TokenFaucet;
