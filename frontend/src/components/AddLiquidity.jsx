import { useContext, useState, useEffect } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import TokenSelector from "./TokenSelector";
import { TOKEN_LIST } from '../constants/tokens';

export default function AddLiquidity() {
  const { router, factory, account, provider, createTokenContract } = useContext(Web3Context);
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [loading, setLoading] = useState(false);
  const [balanceA, setBalanceA] = useState("0");
  const [balanceB, setBalanceB] = useState("0");
  const [pairExists, setPairExists] = useState(false);
  const [shareOfPool, setShareOfPool] = useState("0");

  // Get token balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (account && tokenA?.address && provider) {
        try {
          // Handle ETH separately
          if (tokenA.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            const balance = await provider.getBalance(account);
            setBalanceA(ethers.formatEther(balance));
          } else {
            const tokenContract = await createTokenContract(tokenA.address);
            const balance = await tokenContract.balanceOf(account);
            const decimals = tokenA.decimals || 18; // Use stored decimal or default to 18
            setBalanceA(ethers.formatUnits(balance, decimals));
          }
        } catch (error) {
          console.error("Error fetching token A balance:", error);
          setBalanceA("0");
        }
      }

      if (account && tokenB?.address && provider) {
        try {
          // Handle ETH separately
          if (tokenB.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            const balance = await provider.getBalance(account);
            setBalanceB(ethers.formatEther(balance));
          } else {
            const tokenContract = await createTokenContract(tokenB.address);
            const balance = await tokenContract.balanceOf(account);
            const decimals = tokenB.decimals || 18; // Use stored decimal or default to 18
            setBalanceB(ethers.formatUnits(balance, decimals));
          }
        } catch (error) {
          console.error("Error fetching token B balance:", error);
          setBalanceB("0");
        }
      }
    };

    fetchBalances();
  }, [account, tokenA, tokenB, provider, createTokenContract]);

  // Check if pair exists
  useEffect(() => {
    const checkPair = async () => {
      if (factory && tokenA?.address && tokenB?.address) {
        try {
          const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
          setPairExists(pairAddress !== "0x0000000000000000000000000000000000000000");
        } catch (error) {
          console.error("Error checking pair:", error);
          setPairExists(false);
        }
      } else {
        setPairExists(false);
      }
    };

    checkPair();
  }, [tokenA, tokenB, factory]);

  // Calculate share of pool
  useEffect(() => {
    // Simplified calculation - in reality you'd get the current reserves
    if (amountA && amountB) {
      const share = Math.min(parseFloat(amountA) / 100, parseFloat(amountB) / 100) * 100; // Simplified
      setShareOfPool(share.toFixed(2));
    } else {
      setShareOfPool("0");
    }
  }, [amountA, amountB]);

  const addLiquidity = async () => {
    if (!router) return toast.error("Connect wallet first");
    if (!tokenA || !tokenB || !amountA || !amountB) return toast.error("Select tokens and enter amounts");

    try {
      setLoading(true);

      // Parse amounts with proper decimals
      const decimalsA = tokenA.decimals || 18;
      const decimalsB = tokenB.decimals || 18;
      const aA = ethers.parseUnits(amountA, decimalsA);
      const aB = ethers.parseUnits(amountB, decimalsB);

      // If pair doesn't exist, it will be created automatically
      const tx = await router.addLiquidity(tokenA.address, tokenB.address, aA, aB);
      await tx.wait();

      toast.success("Liquidity added successfully!");
      setAmountA("");
      setAmountB("");
    } catch (err) {
      console.error("addLiquidity error:", err);
      toast.error(err.reason || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmountA = () => {
    setAmountA(balanceA);
  };

  const setMaxAmountB = () => {
    setAmountB(balanceB);
  };

  const handleTokenAChange = (token) => {
    // Prevent selecting the same token for both sides
    if (tokenB && token.address === tokenB.address) {
      toast.error("Please select different tokens");
      return;
    }
    setTokenA(token);
  };

  const handleTokenBChange = (token) => {
    // Prevent selecting the same token for both sides
    if (tokenA && token.address === tokenA.address) {
      toast.error("Please select different tokens");
      return;
    }
    setTokenB(token);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-green-400 to-teal-500 bg-clip-text text-transparent">
          Add Liquidity
        </h2>

        <div className="space-y-6">
          {/* Token A */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">Token A</span>
              <span className="text-gray-400 text-sm">Balance: {balanceA.slice(0, 10)}</span>
            </div>
            <div className="mb-3">
              <TokenSelector
                value={tokenA}
                onChange={handleTokenAChange}
                placeholder="Select token A"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={setMaxAmountA}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Plus Symbol */}
          <div className="flex justify-center">
            <div className="bg-gray-600 p-2 rounded-full">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
          </div>

          {/* Token B */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">Token B</span>
              <span className="text-gray-400 text-sm">Balance: {balanceB.slice(0, 10)}</span>
            </div>
            <div className="mb-3">
              <TokenSelector
                value={tokenB}
                onChange={handleTokenBChange}
                placeholder="Select token B"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={setMaxAmountB}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Pool Information */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-300">Pair Exists:</span>
                <span className={pairExists ? "text-green-400" : "text-red-400"}>
                  {pairExists ? "Yes" : "No (Will be created)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Your Share of Pool:</span>
                <span className="text-blue-400">{shareOfPool}%</span>
              </div>
            </div>
          </div>

          {/* Add Liquidity Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={addLiquidity}
            disabled={loading || !router || !tokenA || !tokenB || !amountA || !amountB}
            className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${loading || !router || !tokenA || !tokenB || !amountA || !amountB
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 shadow-lg"
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </div>
            ) : (
              "Add Liquidity"
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
