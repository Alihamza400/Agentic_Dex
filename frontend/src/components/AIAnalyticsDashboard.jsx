import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const AIAnalyticsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState({
    totalTrades: 1247,
    totalProfit: 2345.67,
    avgProfit: 1.88,
    successRate: 78.5,
    activeStrategies: 3,
    totalVolume: 123456.78,
    roi: 12.34
  });

  const [chartData, setChartData] = useState([
    { day: 'Mon', profit: 120 },
    { day: 'Tue', profit: 80 },
    { day: 'Wed', profit: 200 },
    { day: 'Thu', profit: 150 },
    { day: 'Fri', profit: 180 },
    { day: 'Sat', profit: 90 },
    { day: 'Sun', profit: 160 }
  ]);

  // Simulate live data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setAnalyticsData(prev => ({
        ...prev,
        totalTrades: prev.totalTrades + Math.floor(Math.random() * 5),
        totalProfit: prev.totalProfit + (Math.random() * 100 - 20),
        successRate: Math.max(50, Math.min(100, prev.successRate + (Math.random() * 2 - 1)))
      }));

      setChartData(prev => {
        const newData = [...prev];
        newData.shift();
        newData.push({
          day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(new Date()).getDay()],
          profit: Math.max(0, prev[prev.length - 1].profit + (Math.random() * 50 - 25))
        });
        return newData;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const maxProfit = Math.max(...chartData.map(d => d.profit));

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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total Trades', value: analyticsData.totalTrades.toLocaleString(), color: 'cyan' },
          { label: 'Total Profit', value: `$${analyticsData.totalProfit.toFixed(2)}`, color: 'green' },
          { label: 'Avg Profit', value: `$${analyticsData.avgProfit.toFixed(2)}`, color: 'blue' },
          { label: 'Success Rate', value: `${analyticsData.successRate.toFixed(1)}%`, color: 'purple' },
          { label: 'Active Strategies', value: analyticsData.activeStrategies, color: 'yellow' },
          { label: 'ROI', value: `${analyticsData.roi.toFixed(1)}%`, color: 'pink' }
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-gray-700/50 rounded-xl p-4 border border-gray-600 text-center"
          >
            <div className={`text-2xl font-bold text-${stat.color}-400 mb-1`}>{stat.value}</div>
            <div className="text-sm text-gray-400">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600 mb-8">
        <h3 className="text-xl font-semibold text-gray-300 mb-6">Weekly Performance</h3>
        <div className="flex items-end justify-between h-48">
          {chartData.map((data, index) => (
            <motion.div
              key={index}
              initial={{ height: 0 }}
              animate={{ height: `${(data.profit / maxProfit) * 100}%` }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="flex-1 mx-1 bg-gradient-to-t from-cyan-500 to-blue-500 rounded-t-lg min-w-8"
              title={`${data.day}: $${data.profit.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          {chartData.map((data, index) => (
            <span key={index}>{data.day}</span>
          ))}
        </div>
      </div>

      {/* Strategy Performance */}
      <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
        <h3 className="text-xl font-semibold text-gray-300 mb-6">Strategy Performance</h3>
        <div className="space-y-4">
          {[
            { name: 'Arbitrage', profit: 45.67, trades: 234, success: 85 },
            { name: 'Market Making', profit: 32.45, trades: 189, success: 78 },
            { name: 'Trend Following', profit: 28.91, trades: 156, success: 72 },
            { name: 'Liquidity Provision', profit: 15.23, trades: 89, success: 92 }
          ].map((strategy, index) => (
            <motion.div
              key={strategy.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-4 bg-gray-600/30 rounded-lg"
            >
              <div>
                <div className="font-medium text-white">{strategy.name}</div>
                <div className="text-sm text-gray-400">{strategy.trades} trades</div>
              </div>
              <div className="text-right">
                <div className="text-green-400 font-semibold">${strategy.profit.toFixed(2)}</div>
                <div className="text-sm text-gray-400">{strategy.success}% success</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default AIAnalyticsDashboard;