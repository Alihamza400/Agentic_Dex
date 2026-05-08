import React, { useContext, useState, useEffect } from 'react';
import { Web3Context } from '../context/Web3Context.jsx';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';

const AIAgentControls = () => {
  const { account, provider } = useContext(Web3Context);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [strategy, setStrategy] = useState('arbitrage');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState({
    trades: 0,
    profit: 0,
    successRate: 0
  });

  // Fetch real analytics and config from backend
  useEffect(() => {
    const fetchAgentData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/Scripts/api_agent.php?action=get_status');
        const data = await res.json();
        if (data.status === 'success') {
          setAnalytics({
            trades: data.analytics.trades,
            profit: data.analytics.profit,
            successRate: data.analytics.successRate
          });
          
          // Sync state with DB config
          if (data.config) {
            setIsAgentActive(!!parseInt(data.config.is_active));
            setStrategy(data.config.strategy);
            setRiskLevel(data.config.risk_level);
          }

          if (data.latestDecision && data.latestDecision.action) {
            setAgentStatus(`Last action: ${data.latestDecision.action} by ${data.latestDecision.agentName}`);
          }
        }
      } catch (e) {
        console.error("Failed to fetch agent data", e);
      }
    };

    fetchAgentData();
    const interval = setInterval(fetchAgentData, 5000);
    return () => clearInterval(interval);
  }, []);

  const connectToAgent = async () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('http://127.0.0.1:8000/Scripts/api_agent.php?action=set_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 1, strategy, risk_level: riskLevel })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setIsAgentActive(true);
        setAgentStatus('running');
        toast.success('AI Agent connected and activated!');
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
      toast.error('Failed to connect to AI Agent');
    }
  };

  const disconnectAgent = async () => {
    try {
      await fetch('http://127.0.0.1:8000/Scripts/api_agent.php?action=set_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 0, strategy, risk_level: riskLevel })
      });
      setIsAgentActive(false);
      setAgentStatus('idle');
      toast.info('AI Agent deactivated');
    } catch (e) {
      toast.error('Failed to disconnect agent');
    }
  };

  const executeStrategy = async () => {
    try {
      toast.info(`Updating strategy to ${strategy}...`);
      await fetch('http://127.0.0.1:8000/Scripts/api_agent.php?action=set_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 1, strategy, risk_level: riskLevel })
      });
      toast.success(`Strategy updated! Agent will apply it in the next cycle.`);
    } catch (e) {
      toast.error('Failed to update strategy');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl"
    >
      <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
        AI Trading Agent
      </h2>

      <div className="space-y-6">
        {/* Agent Status Card */}
        <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-300">Agent Status</h3>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${isAgentActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
              <div className={`w-2 h-2 rounded-full ${isAgentActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-sm font-medium">{isAgentActive ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-600">
            <p className="text-sm text-gray-300 font-mono">
              {agentStatus === 'idle' ? 'Awaiting connection...' : agentStatus}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-cyan-400">{analytics.trades}</div>
              <div className="text-sm text-gray-400">Trades Executed</div>
            </div>
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">${analytics.profit.toFixed(2)}</div>
              <div className="text-sm text-gray-400">Profit/Loss</div>
            </div>
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{analytics.successRate.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Success Rate</div>
            </div>
          </div>
        </div>

        {/* Strategy Controls */}
        <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
          <h3 className="text-xl font-semibold text-gray-300 mb-4">Trading Strategy</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Strategy Type</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
              >
                <option value="arbitrage">Arbitrage</option>
                <option value="liquidity">Liquidity Provision</option>
                <option value="market-making">Market Making</option>
                <option value="trend-following">Trend Following</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Risk Level</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="w-full bg-gray-600 text-white p-3 rounded-lg border border-gray-500 focus:border-cyan-500 focus:outline-none"
              >
                <option value="low">Low Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="high">High Risk</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          {!isAgentActive ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={connectToAgent}
              disabled={loading || !account}
              className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white py-4 rounded-xl font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </div>
              ) : (
                'Connect AI Agent'
              )}
            </motion.button>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={executeStrategy}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-4 rounded-xl font-semibold text-lg transition-all shadow-lg"
              >
                Execute Strategy
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={disconnectAgent}
                className="flex-1 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white py-4 rounded-xl font-semibold text-lg transition-all shadow-lg"
              >
                Disconnect
              </motion.button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AIAgentControls;