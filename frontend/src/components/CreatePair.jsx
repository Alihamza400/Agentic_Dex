import { useContext, useState } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import TokenSelector from "./TokenSelector";
import { TOKEN_LIST } from '../constants/tokens';

export default function CreatePair() {
  const { factory } = useContext(Web3Context);
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [loading, setLoading] = useState(false);

  const createPair = async () => {
    if (!factory) return toast.error("Connect wallet first");
    if (!tokenA || !tokenB) return toast.error("Select both tokens");
    if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) return toast.error("Tokens must be different");

    try {
      setLoading(true);
      const tx = await factory.createPair(tokenA.address, tokenB.address);
      const receipt = await tx.wait();

      // Try to find PairCreated event in receipt
      let pairAddress = null;
      if (receipt?.logs && receipt.logs.length > 0) {
        // Some ABIs may populate events in receipt.events, but we use logs fallback
        // If your ABI is included in the contract instance, receipt.events might be available:
        if (receipt.events) {
          const ev = receipt.events.find((e) => e.event === "PairCreated");
          pairAddress = ev?.args?.pair;
        } else {
          // fallback: decode via factory.interface if available
          try {
            for (const log of receipt.logs) {
              try {
                const parsed = factory.interface.parseLog(log);
                if (parsed && parsed.name === "PairCreated") {
                  pairAddress = parsed.args.pair;
                  break;
                }
              } catch {}
            }
          } catch {}
        }
      }

      toast.success(`Pair created ${pairAddress ?? ""}`);
      setTokenA(null);
      setTokenB(null);
    } catch (err) {
      console.error("createPair error:", err);
      toast.error("Create pair failed: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
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
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Create New Pair
        </h2>

        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-blue-200 text-sm">
              <strong>Note:</strong> Anyone can create trading pairs. Make sure both tokens are valid.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <label className="block text-gray-300 text-sm mb-2">Token A</label>
            <TokenSelector
              value={tokenA}
              onChange={handleTokenAChange}
              placeholder="Select token A"
              tokens={TOKEN_LIST}
            />
          </div>

          <div className="flex justify-center">
            <div className="bg-gray-600 p-2 rounded-full">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
            <label className="block text-gray-300 text-sm mb-2">Token B</label>
            <TokenSelector
              value={tokenB}
              onChange={handleTokenBChange}
              placeholder="Select token B"
              tokens={TOKEN_LIST}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={loading || !tokenA || !tokenB}
            onClick={createPair}
            className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all ${
              loading || !tokenA || !tokenB
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
                Creating...
              </div>
            ) : (
              "Create Pair"
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
