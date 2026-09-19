import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { API_UNAVAILABLE_MESSAGE, getDecisions, getMarket, isUnreachable } from '../api/agentApi';

const TYPE_STYLES = {
  buy: 'bg-green-500/20 text-green-400 border-green-500',
  sell: 'bg-red-500/20 text-red-400 border-red-500',
  hold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
  'add-liquidity': 'bg-blue-500/20 text-blue-400 border-blue-500',
};

/** Maps an agent action string onto a display type. */
function classify(action = '') {
  const value = action.toUpperCase();
  if (value.includes('LIQUIDITY') || value.includes('MINT')) return 'add-liquidity';
  if (value.includes('ARBITRAGE') || value.includes('SWAP') || value.includes('TRADE')) return 'buy';
  if (value.includes('HOLD') || value.includes('ANALYSIS') || value.includes('LOOP')) return 'hold';
  if (value.includes('RISK') || value.includes('ALERT')) return 'sell';
  return 'hold';
}

/** Pulls the traded pair out of the stored decision context, when present. */
function pairFromContext(decision) {
  const calls = decision?.contextJSON?.toolCalls ?? [];
  for (const call of calls) {
    const args = call?.args ?? {};
    if (call.tool === 'execute_trade') return `${shorten(args.token_in)} → ${shorten(args.token_out)}`;
    if (call.tool === 'execute_arbitrage' && Array.isArray(args.path)) {
      return args.path.map(shorten).join(' → ');
    }
    if (call.tool === 'manage_liquidity') return `${shorten(args.token_a)} / ${shorten(args.token_b)}`;
  }
  return '—';
}

function shorten(value) {
  if (typeof value !== 'string') return '';
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

const AIRecommendations = () => {
  const [decisions, setDecisions] = useState([]);
  const [pools, setPools] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const [decisionData, market] = await Promise.all([getDecisions(20), getMarket()]);
      setDecisions(decisionData.decisions ?? []);
      setPools(market.pools ?? []);
      setError(null);
    } catch (err) {
      setError(isUnreachable(err) ? API_UNAVAILABLE_MESSAGE : err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const asRecommendation = (decision) => {
    const type = classify(decision.action);
    return {
      id: decision.id,
      type,
      action: decision.action,
      agent: decision.agentName,
      pair: pairFromContext(decision),
      confidence: Math.round((Number(decision.confidence) || 0) * 100),
      reason: decision.reason?.slice(0, 240) ?? '',
      fullReason: decision.reason ?? '',
      time: decision.createdAt,
    };
  };

  const recommendations = decisions.map(asRecommendation);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl"
    >
      <h2 className="text-3xl font-bold text-center mb-4 bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
        AI Trading Recommendations
      </h2>
      <p className="text-center text-sm text-gray-400 mb-8">
        Recorded agent decisions ({pools.length} indexed pools)
      </p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-200 text-sm">
          {error}
        </div>
      )}

      {recommendations.length === 0 && !error && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No recommendations yet. Start the orchestrator with{' '}
          <span className="font-mono text-cyan-300">npm run agent</span> to generate decisions, then refresh.
        </div>
      )}

      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.id ?? index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => setSelected(rec)}
            className="bg-gray-700/50 rounded-xl p-4 border border-gray-600 hover:bg-gray-600/50 cursor-pointer transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4 min-w-0">
                <div className={`px-3 py-1 rounded-full border text-sm font-medium shrink-0 ${TYPE_STYLES[rec.type]}`}>
                  {rec.type.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{rec.action} · {rec.agent}</div>
                  <div className="text-sm text-gray-400 truncate">{rec.reason || 'No reasoning stored'}</div>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right">
                  <div className="text-sm text-gray-400">Path</div>
                  <div className="text-sm font-mono text-blue-300">{rec.pair}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Confidence</div>
                  <div className="text-sm font-semibold text-cyan-400">{rec.confidence}%</div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-800 rounded-2xl p-6 border border-gray-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Decision Details</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Action</span>
                <span className="text-white font-medium">{selected.action}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Agent</span>
                <span className="text-white font-medium">{selected.agent}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Path</span>
                <span className="text-white font-mono">{selected.pair}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Confidence</span>
                <span className="text-cyan-400 font-medium">{selected.confidence}%</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Recorded at</span>
                <span className="text-white font-medium">{selected.time}</span>
              </div>
              <div>
                <div className="text-gray-400 mb-2">Reasoning</div>
                <pre className="whitespace-pre-wrap text-gray-200 bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                  {selected.fullReason || "No reasoning stored for this decision."}
                </pre>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AIRecommendations;
