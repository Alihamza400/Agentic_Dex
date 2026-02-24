import { useContext, useState, useEffect } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import TokenSelector from "./TokenSelector";
import { TOKEN_LIST } from '../constants/tokens';

export default function SwapTokens() {
  const { router, factory, account, provider, createTokenContract } = useContext(Web3Context);
  const [tokenIn, setTokenIn] = useState(null);
  const [tokenOut, setTokenOut] = useState(null);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [loading, setLoading] = useState(false);
  const [balanceIn, setBalanceIn] = useState("0");
  const [balanceOut, setBalanceOut] = useState("0");

  // Get token balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (account && tokenIn?.address && provider) {
        try {
          // Handle ETH separately
          if (tokenIn.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            const balance = await provider.getBalance(account);
            setBalanceIn(ethers.formatEther(balance));
          } else {
            const tokenContract = await createTokenContract(tokenIn.address);
            const balance = await tokenContract.balanceOf(account);
            const decimals = tokenIn.decimals || 18; // Use stored decimal or default to 18
            setBalanceIn(ethers.formatUnits(balance, decimals));
          }
        } catch (error) {
          console.error("Error fetching token in balance:", error);
          setBalanceIn("0");
        }
      }

      if (account && tokenOut?.address && provider) {
        try {
          // Handle ETH separately
          if (tokenOut.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            const balance = await provider.getBalance(account);
            setBalanceOut(ethers.formatEther(balance));
          } else {
            const tokenContract = await createTokenContract(tokenOut.address);
            const balance = await tokenContract.balanceOf(account);
            const decimals = tokenOut.decimals || 18; // Use stored decimal or default to 18
            setBalanceOut(ethers.formatUnits(balance, decimals));
          }
        } catch (error) {
          console.error("Error fetching token out balance:", error);
          setBalanceOut("0");
        }
      }
    };

    fetchBalances();
  }, [account, tokenIn, tokenOut, provider, createTokenContract]);

  // Calculate amount out
  useEffect(() => {
    const calculateAmountOut = async () => {
      if (router && amountIn && tokenIn?.address && tokenOut?.address) {
        try {
          // This is a simplified calculation - in reality you'd call the router's quote function
          // For now, we'll simulate the calculation
          const simulatedAmountOut = parseFloat(amountIn) * 0.997; // Simulate 0.3% fee
          setAmountOut(simulatedAmountOut.toFixed(6));
        } catch (error) {
          setAmountOut("");
        }
      } else {
        setAmountOut("");
      }
    };

    calculateAmountOut();
  }, [amountIn, tokenIn, tokenOut, router]);

  const swap = async () => {
    if (!router) return toast.error("Connect wallet first");
    if (!tokenIn || !tokenOut || !amountIn) return toast.error("Select tokens and enter amount");

    try {
      setLoading(true);

      // Check if pair exists
      if (factory) {
        const pairAddress = await factory.getPair(tokenIn.address, tokenOut.address);
        if (pairAddress === "0x0000000000000000000000000000000000000000") {
          toast.error("Pair does not exist");
          return;
        }
      }

      const tokenInAddr = tokenIn.address;
      const tokenOutAddr = tokenOut.address;

      // Parse amount with proper decimals
      const decimals = tokenIn.decimals || 18;
      const aIn = ethers.parseUnits(amountIn.toString(), decimals);
      const minAmountOut = ethers.parseUnits(((parseFloat(amountOut) * (1 - parseFloat(slippage) / 100)).toString()), tokenOut.decimals || 18);

      const tx = await router.swapExactTokensForTokensSingle(
        tokenInAddr,
        tokenOutAddr,
        aIn,
        minAmountOut
      );
      await tx.wait();
      toast.success("Swap successful!");
      setAmountIn("");
      setAmountOut("");
    } catch (err) {
      console.error("swap error:", err);
      toast.error(err.reason || "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmount = () => {
    setAmountIn(balanceIn);
  };

  const handleTokenInChange = (token) => {
    // Prevent selecting the same token for both sides
    if (tokenOut && token.address === tokenOut.address) {
      toast.error("Please select different tokens");
      return;
    }
    setTokenIn(token);
  };

  const handleTokenOutChange = (token) => {
    // Prevent selecting the same token for both sides
    if (tokenIn && token.address === tokenIn.address) {
      toast.error("Please select different tokens");
      return;
    }
    setTokenOut(token);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Swap Tokens
        </h2>

        <div className="space-y-6">
          {/* Token In */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">From</span>
              <span className="text-gray-400 text-sm">Balance: {balanceIn.slice(0, 10)}</span>
            </div>
            <div className="mb-3">
              <TokenSelector
                value={tokenIn}
                onChange={handleTokenInChange}
                placeholder="Select input token"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={setMaxAmount}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Swap Arrow */}
          <div className="flex justify-center">
            <div className="bg-gray-600 p-2 rounded-full">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* Token Out */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">To</span>
              <span className="text-gray-400 text-sm">Balance: {balanceOut.slice(0, 10)}</span>
            </div>
            <div className="mb-3">
              <TokenSelector
                value={tokenOut}
                onChange={handleTokenOutChange}
                placeholder="Select output token"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="mt-3">
              <input
                placeholder="Amount"
                value={amountOut}
                readOnly
                className="w-full bg-gray-600 text-white p-3 rounded-lg border border-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Slippage Tolerance */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">Slippage Tolerance</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-blue-500 focus:outline-none"
                min="0.1"
                max="50"
                step="0.1"
              />
              <span className="self-center text-gray-300">%</span>
            </div>
          </div>

          {/* Swap Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={swap}
            disabled={loading || !router || !tokenIn || !tokenOut || !amountIn}
            className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${loading || !router || !tokenIn || !tokenOut || !amountIn
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg"
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Swapping...
              </div>
            ) : (
              "Swap Tokens"
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
