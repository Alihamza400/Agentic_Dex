import { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import TokenSelector from "./TokenSelector";
import { TOKEN_LIST } from '../constants/tokens';
import addresses from "../contracts/addresses.json";

// Slippage presets
const SLIPPAGE_OPTIONS = [
  { label: "0.1%", value: "0.1" },
  { label: "0.5%", value: "0.5" },
  { label: "1.0%", value: "1.0" },
  { label: "Custom", value: "custom" },
];

export default function SwapTokens() {
  const { router, factory, account, provider, createTokenContract, createPairContract } = useContext(Web3Context);
  const [tokenIn, setTokenIn] = useState(null);
  const [tokenOut, setTokenOut] = useState(null);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [balanceIn, setBalanceIn] = useState("0");
  const [balanceOut, setBalanceOut] = useState("0");
  const [allowanceIn, setAllowanceIn] = useState("0");
  const [reserves, setReserves] = useState({ reserve0: 0n, reserve1: 0n, token0: "" });

  const ROUTER_ADDRESS = addresses.DexRouter;

  // Calculate effective slippage
  const effectiveSlippage = useMemo(() => {
    if (slippage === "custom") {
      return parseFloat(customSlippage) || 0.5;
    }
    return parseFloat(slippage);
  }, [slippage, customSlippage]);

  // Calculate price impact
  const priceImpact = useMemo(() => {
    if (!amountIn || !tokenIn || !tokenOut || !reserves.reserve0 || !reserves.reserve1) {
      return null;
    }

    try {
      const aIn = parseFloat(amountIn);
      const rIn = parseFloat(ethers.formatUnits(
        tokenIn.address.toLowerCase() === reserves.token0.toLowerCase() ? reserves.reserve0 : reserves.reserve1,
        tokenIn.decimals || 18
      ));
      const rOut = parseFloat(ethers.formatUnits(
        tokenIn.address.toLowerCase() === reserves.token0.toLowerCase() ? reserves.reserve1 : reserves.reserve0,
        tokenOut.decimals || 18
      ));

      if (rIn === 0 || rOut === 0 || aIn === 0) return null;

      // Price impact = (amountIn / (reserveIn + amountIn)) * 100
      const impact = (aIn / (rIn + aIn)) * 100;
      return Math.min(impact, 100);
    } catch {
      return null;
    }
  }, [amountIn, tokenIn, tokenOut, reserves]);

  // Get price impact color
  const getImpactColor = (impact) => {
    if (impact === null) return "text-gray-400";
    if (impact < 1) return "text-green-400";
    if (impact < 3) return "text-yellow-400";
    if (impact < 5) return "text-orange-400";
    return "text-red-400";
  };

  // Get price impact warning
  const getImpactWarning = (impact) => {
    if (impact === null) return null;
    if (impact >= 5) return "High price impact - consider smaller trade size";
    if (impact >= 3) return "Moderate price impact";
    return null;
  };

  const fetchBalancesAndAllowance = useCallback(async () => {
    if (!account || !provider) return;

    if (tokenIn?.address) {
      try {
        if (tokenIn.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
          const balance = await provider.getBalance(account);
          setBalanceIn(ethers.formatEther(balance));
          setAllowanceIn(ethers.MaxUint256.toString());
        } else {
          const tokenContract = await createTokenContract(tokenIn.address);
          const [balance, allowance] = await Promise.all([
            tokenContract.balanceOf(account),
            tokenContract.allowance(account, ROUTER_ADDRESS)
          ]);
          setBalanceIn(ethers.formatUnits(balance, tokenIn.decimals || 18));
          setAllowanceIn(allowance.toString());
        }
      } catch (error) {
        console.error("Error fetching token in data:", error);
      }
    }

    if (tokenOut?.address) {
      try {
        if (tokenOut.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
          const balance = await provider.getBalance(account);
          setBalanceOut(ethers.formatEther(balance));
        } else {
          const tokenContract = await createTokenContract(tokenOut.address);
          const balance = await tokenContract.balanceOf(account);
          setBalanceOut(ethers.formatUnits(balance, tokenOut.decimals || 18));
        }
      } catch (error) {
        console.error("Error fetching token out data:", error);
      }
    }
  }, [account, provider, tokenIn, tokenOut, createTokenContract, ROUTER_ADDRESS]);

  useEffect(() => {
    fetchBalancesAndAllowance();
  }, [fetchBalancesAndAllowance]);

  // Calculate amount out via pair reserves
  useEffect(() => {
    const calculateAmountOut = async () => {
      if (factory && amountIn && tokenIn?.address && tokenOut?.address) {
        try {
          const pairAddress = await factory.getPair(tokenIn.address, tokenOut.address);
          if (pairAddress === "0x0000000000000000000000000000000000000000") {
            setAmountOut("");
            setReserves({ reserve0: 0n, reserve1: 0n, token0: "" });
            return;
          }

          const pairContract = await createPairContract(pairAddress);
          const [reserve0, reserve1] = await pairContract.getReserves();
          const token0 = await pairContract.token0();

          setReserves({ reserve0, reserve1, token0 });

          const isToken0 = tokenIn.address.toLowerCase() === token0.toLowerCase();
          const resIn = isToken0 ? reserve0 : reserve1;
          const resOut = isToken0 ? reserve1 : reserve0;

          if (resIn === 0n || resOut === 0n) {
            setAmountOut("0");
            return;
          }

          const aIn = ethers.parseUnits(amountIn, tokenIn.decimals || 18);
          const aOut = await pairContract.getAmountOut(aIn, resIn, resOut);

          setAmountOut(ethers.formatUnits(aOut, tokenOut.decimals || 18));
        } catch (error) {
          console.error("Error calculating amount out:", error);
          setAmountOut("");
        }
      } else {
        setAmountOut("");
      }
    };
    calculateAmountOut();
  }, [amountIn, tokenIn, tokenOut, factory, createPairContract]);

  const handleApprove = async () => {
    if (!tokenIn || !account) return;
    try {
      setApproving(true);
      const tokenContract = await createTokenContract(tokenIn.address);
      const tx = await tokenContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
      toast.info(`Approving ${tokenIn.symbol}...`);
      await tx.wait();
      toast.success(`${tokenIn.symbol} approved!`);
      await fetchBalancesAndAllowance();
    } catch (err) {
      console.error("Approve error:", err);
      toast.error(`Approval failed: ${err.reason || err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const swap = async () => {
    if (!router) return toast.error("Connect wallet first");
    if (!tokenIn || !tokenOut || !amountIn) return toast.error("Select tokens and enter amount");

    try {
      setLoading(true);

      if (factory) {
        const pairAddress = await factory.getPair(tokenIn.address, tokenOut.address);
        if (pairAddress === "0x0000000000000000000000000000000000000000") {
          toast.error("Pair does not exist");
          return;
        }
      }

      const aIn = ethers.parseUnits(amountIn, tokenIn.decimals || 18);
      const minAmountOut = ethers.parseUnits(
        (parseFloat(amountOut) * (1 - effectiveSlippage / 100)).toFixed(tokenOut.decimals || 18),
        tokenOut.decimals || 18
      );

      // Set deadline to 20 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const tx = await router.swapExactTokensForTokensSingle(
        tokenIn.address,
        tokenOut.address,
        aIn,
        minAmountOut,
        deadline
      );
      toast.info("Swapping...");
      await tx.wait();

      toast.success("Swap successful!");
      setAmountIn("");
      setAmountOut("");
      await fetchBalancesAndAllowance();
    } catch (err) {
      console.error("swap error:", err);
      toast.error(err.reason || "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  const needsApproval = tokenIn && tokenIn.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' &&
    amountIn && ethers.parseUnits(amountIn, tokenIn.decimals || 18) > BigInt(allowanceIn);

  const impactColor = getImpactColor(priceImpact);
  const impactWarning = getImpactWarning(priceImpact);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Swap Tokens
          </h2>
          <button
            onClick={() => setShowSlippageSettings(!showSlippageSettings)}
            className="text-gray-400 hover:text-white transition-colors p-2"
            title="Slippage Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Slippage Settings Panel */}
        {showSlippageSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 bg-gray-700/50 rounded-xl border border-gray-600"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-300">Slippage Tolerance</span>
              <span className="text-sm text-white font-medium">{effectiveSlippage}%</span>
            </div>
            <div className="flex gap-2">
              {SLIPPAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSlippage(option.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    slippage === option.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {slippage === "custom" && (
              <div className="mt-3">
                <input
                  type="number"
                  placeholder="Enter custom slippage %"
                  value={customSlippage}
                  onChange={(e) => setCustomSlippage(e.target.value)}
                  className="w-full bg-gray-600 text-white p-2 rounded-lg border border-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                  min="0"
                  max="50"
                  step="0.1"
                />
              </div>
            )}
          </motion.div>
        )}

        <div className="space-y-6">
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">From</span>
              <span className="text-gray-400 text-sm">Balance: {balanceIn.slice(0, 10)}</span>
            </div>
            <TokenSelector
              value={tokenIn}
              onChange={setTokenIn}
              placeholder="Select input token"
              tokens={TOKEN_LIST}
            />
            <div className="flex gap-2 mt-3">
              <input
                placeholder="Amount"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => setAmountIn(balanceIn)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors text-xs font-bold"
              >
                MAX
              </button>
            </div>
          </div>

          <div className="flex justify-center -my-3 relative z-10">
            <motion.button
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                const tempToken = tokenIn;
                const tempBalance = balanceIn;
                setTokenIn(tokenOut);
                setTokenOut(tempToken);
                setBalanceIn(balanceOut);
                setBalanceOut(tempBalance);
                setAmountIn(amountOut);
              }}
              className="bg-gray-800 p-2 rounded-full border border-gray-600 shadow-xl hover:border-blue-500 transition-colors"
            >
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </motion.button>
          </div>

          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-300 text-sm">To</span>
              <span className="text-gray-400 text-sm">Balance: {balanceOut.slice(0, 10)}</span>
            </div>
            <TokenSelector
              value={tokenOut}
              onChange={setTokenOut}
              placeholder="Select output token"
              tokens={TOKEN_LIST}
            />
            <input
              placeholder="Amount"
              value={amountOut}
              readOnly
              className="w-full bg-gray-600 text-white p-3 rounded-lg border border-gray-500 mt-3 cursor-not-allowed"
            />
          </div>

          {/* Price Impact Display */}
          {amountIn && amountOut && tokenIn && tokenOut && (
            <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600/50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Price Impact</span>
                  <span className={`font-medium ${impactColor}`}>
                    {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Minimum Received</span>
                  <span className="text-white font-medium">
                    {amountOut ? `${(parseFloat(amountOut) * (1 - effectiveSlippage / 100)).toFixed(6)} ${tokenOut.symbol}` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Slippage Tolerance</span>
                  <span className="text-white font-medium">{effectiveSlippage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-gray-300">~0.001 ETH</span>
                </div>
              </div>
              {impactWarning && (
                <div className={`mt-3 p-2 rounded-lg text-xs ${
                  priceImpact >= 5 ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"
                }`}>
                  {impactWarning}
                </div>
              )}
            </div>
          )}

          {needsApproval ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleApprove}
              disabled={approving}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-bold shadow-lg flex items-center justify-center space-x-2"
            >
              {approving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : null}
              <span>Approve {tokenIn.symbol}</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={swap}
              disabled={loading || !router || !tokenIn || !tokenOut || !amountIn || tokenIn.symbol === 'ETH' || tokenOut.symbol === 'ETH'}
              className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${
                loading || !router || !tokenIn || !tokenOut || !amountIn || tokenIn.symbol === 'ETH' || tokenOut.symbol === 'ETH'
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600"
              }`}
            >
              {loading ? "Swapping..." : (tokenIn?.symbol === 'ETH' || tokenOut?.symbol === 'ETH' ? "Use WETH for ETH swaps" : "Swap Tokens")}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
