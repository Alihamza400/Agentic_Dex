import { useContext, useEffect, useState } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { motion } from "framer-motion";
import PairDetails from "./PairDetails";

export default function PairList() {
  const { factory } = useContext(Web3Context);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);

  useEffect(() => {
    const fetchPairs = async () => {
      if (!factory) return;
      try {
        setLoading(true);
        const list = [];
        // try to read sequentially until revert/out-of-bounds
        for (let i = 0; i < 1000; i++) {
          try {
            const p = await factory.allPairs(i);
            if (!p || p === "0x0000000000000000000000000000000000000000") break;
            list.push(p);
          } catch {
            break;
          }
        }
        setPairs(list);
      } catch (err) {
        console.error("fetchPairs error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPairs();
  }, [factory]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          Trading Pairs
        </h2>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        )}

        {!loading && pairs.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No trading pairs found.</p>
            <p className="text-sm mt-2">Create your first pair to get started!</p>
          </div>
        )}

        {!loading && pairs.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-300">Active Pairs ({pairs.length})</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pairs.map((p, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`bg-gray-700/50 rounded-xl p-4 border border-gray-600 hover:bg-gray-600/50 transition-colors cursor-pointer ${
                      selectedPair === p ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => setSelectedPair(selectedPair === p ? null : p)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm text-gray-400">Pair #{idx + 1}</div>
                        <div className="font-mono text-sm text-white break-all mt-1">{p}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(p);
                        }}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy address"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div>
                <PairDetails pairAddress={selectedPair} />
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
