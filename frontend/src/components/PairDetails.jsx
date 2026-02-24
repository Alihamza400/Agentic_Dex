import { useContext, useEffect, useState } from "react";
import { Web3Context } from "../context/Web3Context.jsx";
import { ethers } from "ethers";
import { motion } from "framer-motion";

export default function PairDetails({ pairAddress }) {
  const { createPairContract } = useContext(Web3Context);
  const [pairData, setPairData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPairData = async () => {
      if (!pairAddress || !createPairContract) return;

      try {
        setLoading(true);
        const pairContract = await createPairContract(pairAddress);
        if (!pairContract) return;

        // Get reserves
        const [reserve0, reserve1] = await pairContract.getReserves();

        // Get token addresses
        const token0 = await pairContract.token0();
        const token1 = await pairContract.token1();

        // Get LP token address
        const lpToken = await pairContract.lpToken();

        // Get TWAP data if available
        let twapData = null;
        try {
          const [price0Cum, price1Cum] = await pairContract.getTWAP();
          twapData = { price0Cumulative: price0Cum.toString(), price1Cumulative: price1Cum.toString() };
        } catch (e) {
          // TWAP might not be implemented yet
          twapData = null;
        }

        setPairData({
          token0,
          token1,
          reserve0: reserve0.toString(),
          reserve1: reserve1.toString(),
          lpToken,
          twap: twapData
        });
      } catch (error) {
        console.error("Error fetching pair data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPairData();
  }, [pairAddress, createPairContract]);

  if (!pairAddress) {
    return (
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 text-center text-gray-400">
        Select a pair to view details
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!pairData) {
    return (
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 text-center text-gray-400">
        Error loading pair data
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl"
    >
      <h3 className="text-xl font-bold text-center mb-4 text-blue-400">Pair Details</h3>

      <div className="space-y-4">
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Token 0</div>
          <div className="font-mono text-sm break-all text-white">{pairData.token0}</div>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Token 1</div>
          <div className="font-mono text-sm break-all text-white">{pairData.token1}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Reserve 0</div>
            <div className="text-white truncate">{ethers.formatUnits(pairData.reserve0, 18)}</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Reserve 1</div>
            <div className="text-white truncate">{ethers.formatUnits(pairData.reserve1, 18)}</div>
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">LP Token</div>
          <div className="font-mono text-sm break-all text-blue-400">{pairData.lpToken}</div>
        </div>

        {pairData.twap && (
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">TWAP Data</div>
            <div className="text-xs space-y-1">
              <div>Cumulative Price 0: {pairData.twap.price0Cumulative}</div>
              <div>Cumulative Price 1: {pairData.twap.price1Cumulative}</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}