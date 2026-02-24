import { useContext, useState, useEffect } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";

export default function RemoveLiquidity() {
  const {
    factory,
    account,
    provider,
    createPairContract,
    createLPTokenContract
  } = useContext(Web3Context);
  const [pairAddress, setPairAddress] = useState("");
  const [lpTokenAmount, setLpTokenAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [lpTokenBalance, setLpTokenBalance] = useState("0");
  const [pairInfo, setPairInfo] = useState(null);

  // Get LP token balance when pair is selected
  useEffect(() => {
    const fetchLpTokenBalance = async () => {
      if (!account || !pairAddress || !provider) return;

      try {
        // First get the LP token address from the pair
        const pairContract = createPairContract(pairAddress);
        if (!pairContract) return;

        // Get the LP token address from the pair contract
        // In our DexPair contract, the lpToken is a public property
        const lpTokenAddr = await pairContract.lpToken();
        const lpTokenContract = await createLPTokenContract(lpTokenAddr);

        const balance = await lpTokenContract.balanceOf(account);
        const decimals = await lpTokenContract.decimals();
        setLpTokenBalance(ethers.formatUnits(balance, decimals));
      } catch (error) {
        console.error("Error fetching LP token balance:", error);
        setLpTokenBalance("0");
      }
    };

    fetchLpTokenBalance();
  }, [account, pairAddress, provider, createPairContract, createLPTokenContract]);

  // Get pair info when pair is selected
  useEffect(() => {
    const fetchPairInfo = async () => {
      if (!pairAddress || !provider) return;

      try {
        const pairContract = createPairContract(pairAddress);
        if (!pairContract) return;

        const [reserve0, reserve1] = await pairContract.getReserves();
        const lpTokenAddr = await pairContract.lpToken();

        setPairInfo({
          reserve0: reserve0.toString(),
          reserve1: reserve1.toString(),
          lpTokenAddress: lpTokenAddr
        });
      } catch (error) {
        console.error("Error fetching pair info:", error);
        setPairInfo(null);
      }
    };

    fetchPairInfo();
  }, [pairAddress, provider, createPairContract]);

  const removeLiquidity = async () => {
    if (!factory || !pairAddress || !lpTokenAmount) {
      return toast.error("Please connect wallet, enter pair address and LP token amount");
    }

    try {
      setLoading(true);

      // Get the pair contract
      const pairContract = createPairContract(pairAddress);
      if (!pairContract) {
        throw new Error("Could not create pair contract");
      }

      // Convert amount to proper units (assuming 18 decimals for LP tokens)
      const amount = ethers.parseUnits(lpTokenAmount, 18);

      // Call removeLiquidity on the pair contract
      const tx = await pairContract.removeLiquidity(amount);
      await tx.wait();

      toast.success("Liquidity removed successfully!");
      setLpTokenAmount("");
    } catch (err) {
      console.error("removeLiquidity error:", err);
      toast.error(err.reason || "Failed to remove liquidity");
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmount = () => {
    setLpTokenAmount(lpTokenBalance);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
          Remove Liquidity
        </h2>

        <div className="space-y-6">
          {/* Pair Address */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">Pair Address</span>
            </div>
            <input
              placeholder="0x..."
              value={pairAddress}
              onChange={(e) => setPairAddress(e.target.value)}
              className="w-full bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-red-500 focus:outline-none"
            />
          </div>

          {/* LP Token Amount */}
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">LP Tokens to Remove</span>
              <span className="text-gray-400 text-sm">Balance: {lpTokenBalance.slice(0, 10)}</span>
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={lpTokenAmount}
                onChange={(e) => setLpTokenAmount(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-red-500 focus:outline-none"
              />
              <button
                onClick={setMaxAmount}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Pair Information */}
          {pairInfo && (
            <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
              <div className="space-y-2">
                <div className="text-sm text-gray-300">Pair Info:</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-gray-400">Reserve 0:</div>
                  <div className="text-white truncate">{pairInfo.reserve0.slice(0, 10)}...</div>
                  <div className="text-gray-400">Reserve 1:</div>
                  <div className="text-white truncate">{pairInfo.reserve1.slice(0, 10)}...</div>
                  <div className="text-gray-400">LP Token:</div>
                  <div className="text-blue-400 text-xs truncate">{pairInfo.lpTokenAddress.slice(0, 10)}...</div>
                </div>
              </div>
            </div>
          )}

          {/* Remove Liquidity Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={removeLiquidity}
            disabled={loading || !factory}
            className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${loading || !factory
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-lg"
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Removing...
              </div>
            ) : (
              "Remove Liquidity"
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}