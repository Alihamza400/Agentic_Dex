import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const AIRecommendations = () => {
  const [recommendations, setRecommendations] = useState([
    {
      id: 1,
      type: 'buy',
      token: 'ETH',
      pair: 'ETH/USDC',
      confidence: 92,
      reason: 'Strong bullish momentum detected',
      targetPrice: '3200.00',
      timeFrame: '24h',
      status: 'active'
    },
    {
      id: 2,
      type: 'sell',
      token: 'BTC',
      pair: 'BTC/USDT',
      confidence: 87,
      reason: 'Overbought conditions detected',
      targetPrice: '68000.00',
      timeFrame: '48h',
      status: 'pending'
    },
    {
      id: 3,
      type: 'hold',
      token: 'SOL',
      pair: 'SOL/USDC',
      confidence: 78,
      reason: 'Consolidation phase',
      targetPrice: '180.00',
      timeFrame: '1w',
      status: 'completed'
    },
    {
      id: 4,
      type: 'add-liquidity',
      token: 'ETH/WETH',
      pair: 'ETH/WETH',
      confidence: 95,
      reason: 'Arbitrage opportunity detected',
      targetPrice: '1.002',
      timeFrame: '1h',
      status: 'active'
    }
  ]);

  const [selectedRecommendation, setSelectedRecommendation] = useState(null);

  // Simulate new recommendations
  useEffect(() => {
    const interval = setInterval(() => {
      const newRec = {
        id: Date.now(),
        type: ['buy', 'sell', 'hold', 'add-liquidity'][Math.floor(Math.random() * 4)],
        token: ['ETH', 'BTC', 'SOL', 'ADA', 'DOT', 'LINK'][Math.floor(Math.random() * 6)],
        pair: ['ETH/USDC', 'BTC/USDT', 'SOL/USDC', 'ADA/USDC', 'DOT/USDC', 'LINK/USDC'][Math.floor(Math.random() * 6)],
        confidence: Math.floor(Math.random() * 20) + 75,
        reason: ['Strong momentum', 'Technical breakout', 'Arbitrage opportunity', 'Market inefficiency'][Math.floor(Math.random() * 4)],
        targetPrice: (Math.random() * 1000).toFixed(2),
        timeFrame: ['1h', '24h', '48h', '1w'][Math.floor(Math.random() * 4)],
        status: 'active'
      };

      setRecommendations(prev => [newRec, ...prev.slice(0, 4)]);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const getTypeColor = (type) => {
    switch (type) {
      case 'buy': return 'bg-green-500/20 text-green-400 border-green-500';
      case 'sell': return 'bg-red-500/20 text-red-400 border-red-500';
      case 'hold': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
      case 'add-liquidity': return 'bg-blue-500/20 text-blue-400 border-blue-500';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'completed': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl"
    >
      <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
        AI Trading Recommendations
      </h2>

      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => setSelectedRecommendation(rec)}
            className="bg-gray-700/50 rounded-xl p-4 border border-gray-600 hover:bg-gray-600/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full border text-sm font-medium ${getTypeColor(rec.type)}`}>
                  {rec.type.toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-white">{rec.pair}</div>
                  <div className="text-sm text-gray-400">{rec.reason}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-bold text-white">${rec.targetPrice}</div>
                <div className="text-sm text-gray-400">{rec.timeFrame}</div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm text-gray-400">Confidence</div>
                  <div className="text-sm font-semibold text-cyan-400">{rec.confidence}%</div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(rec.status)}`}>
                  {rec.status.toUpperCase()}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detailed View Modal */}
      {selectedRecommendation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRecommendation(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-800 rounded-2xl p-6 border border-gray-700 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Recommendation Details</h3>
              <button
                onClick={() => setSelectedRecommendation(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Token:</span>
                <span className="text-white font-medium">{selectedRecommendation.token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pair:</span>
                <span className="text-white font-medium">{selectedRecommendation.pair}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Action:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(selectedRecommendation.type)}`}>
                  {selectedRecommendation.type.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Target Price:</span>
                <span className="text-white font-medium">${selectedRecommendation.targetPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time Frame:</span>
                <span className="text-white font-medium">{selectedRecommendation.timeFrame}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Confidence:</span>
                <span className="text-cyan-400 font-medium">{selectedRecommendation.confidence}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Reason:</span>
                <span className="text-white font-medium">{selectedRecommendation.reason}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AIRecommendations;