import { useContext, useState, useEffect, useCallback } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import TokenSelector from "./TokenSelector";
import { TOKEN_LIST } from '../constants/tokens';
import addresses from "../contracts/addresses.json";

export default function AddLiquidity() {
  const { router, factory, account, provider, createTokenContract, createPairContract } = useContext(Web3Context);
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvingA, setApprovingA] = useState(false);
  const [approvingB, setApprovingB] = useState(false);
  const [balanceA, setBalanceA] = useState("0");
  const [balanceB, setBalanceB] = useState("0");
  const [allowanceA, setAllowanceA] = useState("0");
  const [allowanceB, setAllowanceB] = useState("0");
  const [pairExists, setPairExists] = useState(false);
  const [shareOfPool, setShareOfPool] = useState("0");
  const [reserves, setReserves] = useState({ r0: 0n, r1: 0n, isToken0A: true });

  const ROUTER_ADDRESS = addresses.DexRouter;

  const fetchBalancesAndAllowances = useCallback(async () => {
    if (!account || !provider) return;

    if (tokenA?.address) {
      try {
        if (tokenA.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
          const balance = await provider.getBalance(account);
          setBalanceA(ethers.formatEther(balance));
          setAllowanceA(ethers.MaxUint256.toString()); // ETH doesn't need approval
        } else {
          const tokenContract = await createTokenContract(tokenA.address);
          const [balance, allowance] = await Promise.all([
            tokenContract.balanceOf(account),
            tokenContract.allowance(account, ROUTER_ADDRESS)
          ]);
          const decimals = tokenA.decimals || 18;
          setBalanceA(ethers.formatUnits(balance, decimals));
          setAllowanceA(allowance.toString());
        }
      } catch (error) {
        console.error("Error fetching token A data:", error);
      }
    }

    if (tokenB?.address) {
      try {
        if (tokenB.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
          const balance = await provider.getBalance(account);
          setBalanceB(ethers.formatEther(balance));
          setAllowanceB(ethers.MaxUint256.toString()); // ETH doesn't need approval
        } else {
          const tokenContract = await createTokenContract(tokenB.address);
          const [balance, allowance] = await Promise.all([
            tokenContract.balanceOf(account),
            tokenContract.allowance(account, ROUTER_ADDRESS)
          ]);
          const decimals = tokenB.decimals || 18;
          setBalanceB(ethers.formatUnits(balance, decimals));
          setAllowanceB(allowance.toString());
        }
      } catch (error) {
        console.error("Error fetching token B data:", error);
      }
    }
  }, [account, provider, tokenA, tokenB, createTokenContract, ROUTER_ADDRESS]);

  useEffect(() => {
    fetchBalancesAndAllowances();
  }, [fetchBalancesAndAllowances]);

  // Check if pair exists and fetch reserves
  useEffect(() => {
    const checkPairAndReserves = async () => {
      if (factory && tokenA?.address && tokenB?.address) {
        try {
          const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
          const exists = pairAddress !== "0x0000000000000000000000000000000000000000";
          setPairExists(exists);

          if (exists) {
            const pairContract = await createPairContract(pairAddress);
            const [r0, r1] = await pairContract.getReserves();
            const t0 = await pairContract.token0();
            setReserves({
              r0,
              r1,
              isToken0A: tokenA.address.toLowerCase() === t0.toLowerCase()
            });
          } else {
            setReserves({ r0: 0n, r1: 0n, isToken0A: true });
          }
        } catch (error) {
          console.error("Error checking pair/reserves:", error);
          setPairExists(false);
        }
      } else {
        setPairExists(false);
        setReserves({ r0: 0n, r1: 0n, isToken0A: true });
      }
    };

    checkPairAndReserves();
  }, [tokenA, tokenB, factory, createPairContract]);

  const handleAmountAChange = (val) => {
    setAmountA(val);
    if (pairExists && val && reserves.r0 > 0n && reserves.r1 > 0n) {
      const resA = reserves.isToken0A ? reserves.r0 : reserves.r1;
      const resB = reserves.isToken0A ? reserves.r1 : reserves.r0;
      const amountAInUnits = ethers.parseUnits(val, tokenA.decimals || 18);
      const amountBResult = (amountAInUnits * resB) / resA;
      setAmountB(ethers.formatUnits(amountBResult, tokenB.decimals || 18));
    }
  };

  const handleAmountBChange = (val) => {
    setAmountB(val);
    if (pairExists && val && reserves.r0 > 0n && reserves.r1 > 0n) {
      const resA = reserves.isToken0A ? reserves.r0 : reserves.r1;
      const resB = reserves.isToken0A ? reserves.r1 : reserves.r0;
      const amountBInUnits = ethers.parseUnits(val, tokenB.decimals || 18);
      const amountAResult = (amountBInUnits * resA) / resB;
      setAmountA(ethers.formatUnits(amountAResult, tokenA.decimals || 18));
    }
  };

  // Calculate share of pool
  useEffect(() => {
    if (amountA && tokenA) {
      const resA = reserves.isToken0A ? reserves.r0 : reserves.r1;
      if (resA === 0n) {
        setShareOfPool("100.00");
      } else {
        const valA = parseFloat(amountA);
        const resAFloat = parseFloat(ethers.formatUnits(resA, tokenA.decimals || 18));
        const share = (valA / (resAFloat + valA)) * 100;
        setShareOfPool(share.toFixed(2));
      }
    } else {
      setShareOfPool("0.00");
    }
  }, [amountA, tokenA, reserves]);

  const handleApprove = async (token, setApproving) => {
    if (!token || !account) return;
    try {
      setApproving(true);
      const tokenContract = await createTokenContract(token.address);
      const tx = await tokenContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
      toast.info(`Approving ${token.symbol}...`);
      await tx.wait();
      toast.success(`${token.symbol} approved!`);
      await fetchBalancesAndAllowances();
    } catch (err) {
      console.error("Approve error:", err);
      toast.error(`Approval failed: ${err.reason || err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const addLiquidity = async () => {
    if (!router) return toast.error("Connect wallet first");
    if (!tokenA || !tokenB || !amountA || !amountB) return toast.error("Select tokens and enter amounts");

    try {
      setLoading(true);

      const decimalsA = tokenA.decimals || 18;
      const decimalsB = tokenB.decimals || 18;
      const aA = ethers.parseUnits(amountA, decimalsA);
      const aB = ethers.parseUnits(amountB, decimalsB);

      // Set deadline to 20 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const tx = await router.addLiquidity(tokenA.address, tokenB.address, aA, aB, deadline);
      toast.info("Transaction submitted...");
      await tx.wait();

      toast.success("Liquidity added successfully!");
      setAmountA("");
      setAmountB("");
      await fetchBalancesAndAllowances();
    } catch (err) {
      console.error("addLiquidity error:", err);
      toast.error(err.reason || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const needsApprovalA = tokenA && tokenA.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' &&
    amountA && ethers.parseUnits(amountA, tokenA.decimals || 18) > BigInt(allowanceA);
  const needsApprovalB = tokenB && tokenB.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' &&
    amountB && ethers.parseUnits(amountB, tokenB.decimals || 18) > BigInt(allowanceB);

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
                onChange={setTokenA}
                placeholder="Select token A"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={amountA}
                onChange={(e) => handleAmountAChange(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={() => handleAmountAChange(balanceA)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

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
                onChange={setTokenB}
                placeholder="Select token B"
                tokens={TOKEN_LIST}
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Amount"
                value={amountB}
                onChange={(e) => handleAmountBChange(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-green-500 focus:outline-none"
              />
              <button
                onClick={() => handleAmountBChange(balanceB)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-300">Pair Exists:</span>
                <span className={pairExists ? "text-green-400" : "text-red-400"}>
                  {pairExists ? "Yes" : "No (Will be created)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Pool Share:</span>
                <span className="text-blue-400">{shareOfPool}%</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {needsApprovalA && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleApprove(tokenA, setApprovingA)}
                disabled={approvingA}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg"
              >
                {approvingA ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : null}
                <span>Approve {tokenA.symbol}</span>
              </motion.button>
            )}

            {needsApprovalB && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleApprove(tokenB, setApprovingB)}
                disabled={approvingB}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg"
              >
                {approvingB ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : null}
                <span>Approve {tokenB.symbol}</span>
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={addLiquidity}
              disabled={loading || needsApprovalA || needsApprovalB || !tokenA || !tokenB || !amountA || !amountB || tokenA.symbol === 'ETH' || tokenB.symbol === 'ETH'}
              className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${loading || needsApprovalA || needsApprovalB || !tokenA || !tokenB || !amountA || !amountB || tokenA.symbol === 'ETH' || tokenB.symbol === 'ETH'
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-green-600 to-teal-600 shadow-lg"
                }`}
            >
              {loading ? "Adding..." : (tokenA?.symbol === 'ETH' || tokenB?.symbol === 'ETH' ? "Use WETH for ETH pairs" : "Add Liquidity")}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
