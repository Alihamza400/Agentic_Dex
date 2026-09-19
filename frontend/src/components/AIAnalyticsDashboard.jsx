import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { API_UNAVAILABLE_MESSAGE, getDecisions, getMarket, isUnreachable } from '../api/agentApi';

const COLOR_CLASSES = {
  cyan: 'text-cyan-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  yellow: 'text-yellow-400',
  pink: 'text-pink-400',
};

const AIAnalyticsDashboard = () => {
  const [pools, setPools] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [status, setStatus] = useState({ loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const [market, decisionData] = await Promise.all([getMarket(), getDecisions(25)]);
      setPools(market.pools ?? []);
      setSwaps(market.recentSwaps ?? []);
      setDecisions(decisionData.decisions ?? []);
      setStatus({ loading: false, error: null });
    } catch (error) {
      setStatus({
        loading: false,
        error: isUnreachable(error) ? API_UNAVAILABLE_MESSAGE : error.message,
      });
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const avgConfidence =
    decisions.length > 0
      ? (decisions.reduce((sum, d) => sum + (Number(d.confidence) || 0), 0) / decisions.length) * 100
      : 0;

  const indexedBlocks = Math.max(0, ...pools.map((p) => Number(p.blockNumber) || 0));
  const swapVolumes = swaps.slice(0, 12).map((s) => Number(ethers.formatEther(s.data?.amountIn ?? '0')));
  const maxVolume = Math.max(1, ...swapVolumes);

  const stats = [
    { label: 'Indexed Pools', value: pools.length, color: 'cyan' },
    { label: 'Recent Swaps', value: swaps.length, color: 'green' },
    { label: 'Agent Decisions', value: decisions.length, color: 'purple' },
    { label: 'Avg Confidence', value: `${avgConfidence.toFixed(1)}%`, color: 'blue' },
    { label: 'Latest Block', value: indexedBlocks, color: 'yellow' },
    { label: 'Backend', value: status.error ? 'Offline' : 'Online', color: 'pink' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl"
    >
      <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
        AI Analytics Dashboard
      </h2>

      {status.error && (
        <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-200 text-sm">
          {status.error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-gray-700/50 rounded-xl p-4 border border-gray-600 text-center"
          >
            <div className={`text-2xl font-bold mb-1 ${COLOR_CLASSES[stat.color]}`}>{stat.value}</div>
            <div className="text-sm text-gray-400">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Swap volume chart */}
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 mb-8">
        <h3 className="text-xl font-semibold text-gray-300 mb-2">Recent Swap Sizes</h3>
        <p className="text-xs text-gray-500 mb-6">token amounts swapped in, newest first (indexed from chain events)</p>
        {swapVolumes.length === 0 ? (
          <div className="text-gray-400 text-sm py-8 text-center">
            No swaps indexed yet. Trade once, or start the indexer with <span className="font-mono">npm run index</span>.
          </div>
        ) : (
          <div className="flex items-end justify-between h-48 gap-2">
            {swapVolumes.map((volume, index) => (
              <div key={index} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="text-[10px] text-gray-400 mb-1">{volume.toFixed(2)}</div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(volume / maxVolume) * 100}%` }}
                  transition={{ delay: index * 0.05, duration: 0.5 }}
                  className="w-full bg-gradient-to-t from-cyan-500 to-blue-500 rounded-t-lg"
                  title={`Swap #${index + 1}: ${volume} tokens in`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pools table */}
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 mb-8">
        <h3 className="text-xl font-semibold text-gray-300 mb-6">Pools</h3>
        {pools.length === 0 ? (
          <div className="text-gray-400 text-sm">No pool snapshots yet.</div>
        ) : (
          <div className="space-y-3">
            {pools.map((pool) => (
              <div
                key={pool.pairAddress}
                className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 bg-gray-600/30 rounded-lg"
              >
                <div className="font-mono text-xs text-blue-300 break-all">{pool.pairAddress}</div>
                <div className="grid grid-cols-3 gap-6 text-sm">
                  <div>
                    <div className="text-gray-400">Spot price</div>
                    <div className="text-white">{ethers.formatEther(pool.spotPrice ?? '0')}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Block</div>
                    <div className="text-white">{pool.blockNumber}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Reserve 0</div>
                    <div className="text-white">{ethers.formatEther(pool.reserve0 ?? '0')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent decisions */}
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
        <h3 className="text-xl font-semibold text-gray-300 mb-6">Latest Agent Decisions</h3>
        {decisions.length === 0 ? (
          <div className="text-gray-400 text-sm">
            No decisions recorded yet. Start the orchestrator with <span className="font-mono">npm run agent</span>.
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {decisions.map((decision, index) => (
              <motion.div
                key={decision.id ?? index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between gap-4 p-4 bg-gray-600/30 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="font-medium text-white">
                    {decision.action}
                    <span className="text-gray-400 font-normal"> · {decision.agentName}</span>
                  </div>
                  <div className="text-sm text-gray-400 truncate max-w-2xl">{decision.reason}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-cyan-400 font-semibold">
                    {(Number(decision.confidence) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">confidence</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AIAnalyticsDashboard;
