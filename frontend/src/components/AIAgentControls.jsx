import React, { useContext, useState, useEffect, useCallback } from 'react';
import { Web3Context } from '../context/Web3Context.jsx';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  API_UNAVAILABLE_MESSAGE,
  getAgentStatus,
  isUnreachable,
  setAgentConfig,
} from '../api/agentApi';

const AIAgentControls = () => {
  const { account } = useContext(Web3Context);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [strategy, setStrategy] = useState('arbitrage');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const [analytics, setAnalytics] = useState({ trades: 0, decisions: 0, profit: null, successRate: 0 });

  const fetchAgentData = useCallback(async () => {
    try {
      const data = await getAgentStatus();
      setBackendOnline(true);
      setAnalytics({
        trades: data.analytics?.trades ?? 0,
        decisions: data.analytics?.decisions ?? 0,
        profit: data.analytics?.profit ?? null,
        successRate: data.analytics?.successRate ?? 0,
      });

      if (data.config) {
        setIsAgentActive(!!Number(data.config.is_active));
        setStrategy(data.config.strategy ?? 'arbitrage');
        setRiskLevel(data.config.risk_level ?? 'medium');
      }

      if (data.latestDecision?.action) {
        setAgentStatus(`Last action: ${data.latestDecision.action} (${data.latestDecision.agentName})`);
      } else {
        setAgentStatus('No agent activity recorded yet');
      }
    } catch (error) {
      setBackendOnline(false);
      setAgentStatus(isUnreachable(error) ? API_UNAVAILABLE_MESSAGE : error.message);
    }
  }, []);

  useEffect(() => {
    fetchAgentData();
    const interval = setInterval(fetchAgentData, 5000);
    return () => clearInterval(interval);
  }, [fetchAgentData]);

  const pushConfig = async (isActive) => {
    await setAgentConfig({ is_active: isActive ? 1 : 0, strategy, risk_level: riskLevel });
  };

  const connectToAgent = async () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      await pushConfig(true);
      setIsAgentActive(true);
      setAgentStatus('running');
      toast.success('AI Agent activated!');
    } catch (error) {
      toast.error(`Failed to activate the agent: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const disconnectAgent = async () => {
    try {
      await pushConfig(false);
      setIsAgentActive(false);
      setAgentStatus('idle');
      toast.info('AI Agent deactivated');
    } catch (error) {
      toast.error(`Failed to deactivate the agent: ${error.message}`);
    }
  };

  const executeStrategy = async () => {
    try {
      await pushConfig(true);
      setIsAgentActive(true);
      toast.success('Strategy updated - the agent applies it on the next cycle');
    } catch (error) {
      toast.error(`Failed to update the strategy: ${error.message}`);
    }
  };

  const profitLabel = analytics.profit === null ? 'n/a' : `$${Number(analytics.profit).toFixed(2)}`;

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
            <div className="flex items-center gap-2">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${backendOnline ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                <span className="text-xs font-medium">{backendOnline ? 'BACKEND ONLINE' : 'BACKEND OFFLINE'}</span>
              </div>
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${isAgentActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                <div className={`w-2 h-2 rounded-full ${isAgentActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm font-medium">{isAgentActive ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-600">
            <p className="text-sm text-gray-300 font-mono break-words">
              {agentStatus === 'idle' ? 'Awaiting connection...' : agentStatus}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-cyan-400">{analytics.trades}</div>
              <div className="text-sm text-gray-400">Actions Executed</div>
            </div>
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{profitLabel}</div>
              <div className="text-sm text-gray-400">Profit/Loss</div>
            </div>
            <div className="bg-gray-600/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{Number(analytics.successRate).toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Avg Confidence</div>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            {analytics.decisions} agent decisions recorded.
            {analytics.profit === null && ' PnL is not derived on-chain yet.'}
          </p>
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
              {loading ? 'Connecting...' : 'Connect AI Agent'}
            </motion.button>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={executeStrategy}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-4 rounded-xl font-semibold text-lg transition-all shadow-lg"
              >
                Apply Strategy
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

        <div className="text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3 border border-gray-700">
          The agent process reads <span className="font-mono">agent_config</span> every cycle. Run it with{' '}
          <span className="font-mono">npm run agent</span> (or <span className="font-mono">npm run mcp</span> for the
          MCP server).
        </div>
      </div>
    </motion.div>
  );
};

export default AIAgentControls;
