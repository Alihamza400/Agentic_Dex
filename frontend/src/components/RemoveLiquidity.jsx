import { useContext, useState, useEffect } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import addresses from "../contracts/addresses.json";

export default function RemoveLiquidity() {
  const {
    factory,
    router,
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
  const [slippage, setSlippage] = useState("0.5");
  const [minAmounts, setMinAmounts] = useState({ amount0: "0", amount1: "0" });

  // Get LP token balance when pair is selected
  useEffect(() => {
    const fetchLpTokenBalance = async () => {
      if (!account || !pairAddress || !provider) return;

      try {
        // First get the LP token address from the pair
        const pairContract = await createPairContract(pairAddress);
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

  // Calculate expected output and min amounts when LP amount changes
  useEffect(() => {
    if (lpTokenAmount && pairInfo && lpTokenBalance !== "0") {
      const amount = parseFloat(lpTokenAmount);
      const totalLp = parseFloat(lpTokenBalance); // This is just the user's balance, but we need total supply
      // Wait, we need the total supply of LP tokens to calculate correctly
    }
  }, [lpTokenAmount, pairInfo]);

  // Updated fetchPairInfo to include total supply
  useEffect(() => {
    const fetchPairInfo = async () => {
      if (!pairAddress || !provider) return;

      try {
        const pairContract = await createPairContract(pairAddress);
        if (!pairContract) return;

        const [reserve0, reserve1] = await pairContract.getReserves();
        const lpTokenAddr = await pairContract.lpToken();
        const lpTokenContract = await createLPTokenContract(lpTokenAddr);
        const totalSupply = await lpTokenContract.totalSupply();
        const t0 = await pairContract.token0();
        const t1 = await pairContract.token1();

        setPairInfo({
          reserve0,
          reserve1,
          totalSupply,
          token0: t0,
          token1: t1,
          lpTokenAddress: lpTokenAddr
        });
      } catch (error) {
        console.error("Error fetching pair info:", error);
        setPairInfo(null);
      }
    };

    fetchPairInfo();
  }, [pairAddress, provider, createPairContract, createLPTokenContract]);

  // Calculate min amounts
  useEffect(() => {
    if (lpTokenAmount && pairInfo) {
      try {
        const amountLP = ethers.parseUnits(lpTokenAmount, 18);
        const expected0 = (amountLP * pairInfo.reserve0) / pairInfo.totalSupply;
        const expected1 = (amountLP * pairInfo.reserve1) / pairInfo.totalSupply;

        const slip = 1 - parseFloat(slippage) / 100;

        setMinAmounts({
          amount0: (parseFloat(ethers.formatUnits(expected0, 18)) * slip).toFixed(6),
          amount1: (parseFloat(ethers.formatUnits(expected1, 18)) * slip).toFixed(6)
        });
      } catch (e) {
        setMinAmounts({ amount0: "0", amount1: "0" });
      }
    } else {
      setMinAmounts({ amount0: "0", amount1: "0" });
    }
  }, [lpTokenAmount, pairInfo, slippage]);

  const removeLiquidity = async () => {
    if (!router || !pairAddress || !lpTokenAmount) {
      return toast.error("Please connect wallet, enter pair address and LP token amount");
    }

    try {
      setLoading(true);

      const amountLP = ethers.parseUnits(lpTokenAmount, 18);
      const minA = ethers.parseUnits(minAmounts.amount0, 18);
      const minB = ethers.parseUnits(minAmounts.amount1, 18);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // 1. Approve router to spend LP tokens
      toast.info("Approving LP tokens...");
      const lpTokenContract = await createLPTokenContract(pairInfo.lpTokenAddress);
      const approveTx = await lpTokenContract.approve(addresses.DexRouter, amountLP);
      await approveTx.wait();

      // 2. Remove liquidity via router
      toast.info("Removing liquidity...");
      const tx = await router.removeLiquidity(
        pairInfo.token0,
        pairInfo.token1,
        amountLP,
        minA,
        minB,
        deadline
      );
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
                <div className="text-sm text-gray-300">Expected Output (Estimated):</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-gray-400">Token 0:</div>
                  <div className="text-white">{minAmounts.amount0} (min)</div>
                  <div className="text-gray-400">Token 1:</div>
                  <div className="text-white">{minAmounts.amount1} (min)</div>
                </div>
              </div>
            </div>
          )}

          {/* Remove Liquidity Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={removeLiquidity}
            disabled={loading || !router || !pairInfo || !lpTokenAmount}
            className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${loading || !router || !pairInfo || !lpTokenAmount
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