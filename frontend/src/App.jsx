import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Web3Provider } from './context/Web3Context';
import Header from './components/Header';
import CreatePair from './components/CreatePair';
import AddLiquidity from './components/AddLiquidity';
import RemoveLiquidity from './components/RemoveLiquidity';
import LiquidityManagement from './components/LiquidityManagement';
import SwapTokens from './components/SwapTokens';
import PairList from './components/PairList';
import AIAgentControls from './components/AIAgentControls';
import AIAnalyticsDashboard from './components/AIAnalyticsDashboard';
import AIRecommendations from './components/AIRecommendations';
import ConnectWallet from './components/ConnectWallet';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


// Main App Component
function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)}></div>
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-gradient-to-b from-gray-800 to-gray-900">
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                  Agentic DEX
                </h1>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                <Link
                  to="/"
                  className={`${isActive('/')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/trade"
                  className={`${isActive('/trade')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Trade
                </Link>
                <Link
                  to="/create-pair"
                  className={`${isActive('/create-pair')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Create Pair
                </Link>
                <Link
                  to="/liquidity"
                  className={`${isActive('/liquidity')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Liquidity
                </Link>
                <Link
                  to="/pools"
                  className={`${isActive('/pools')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  Pools
                </Link>
                <Link
                  to="/ai-agent"
                  className={`${isActive('/ai-agent')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  AI Agent
                </Link>
                <Link
                  to="/ai-analytics"
                  className={`${isActive('/ai-analytics')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  AI Analytics
                </Link>
                <Link
                  to="/ai-recommendations"
                  className={`${isActive('/ai-recommendations')
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                    block px-3 py-3 rounded-lg text-base font-medium transition-all duration-300 border border-transparent`}
                  onClick={() => setSidebarOpen(false)}
                >
                  AI Recs
                </Link>
              </nav>
            </div>
            <div className="flex-shrink-0 p-4 border-t border-gray-700">
              <ConnectWallet />
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-6">
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                Agentic DEX
              </h1>
            </div>
            <nav className="mt-8 flex-1 px-4 space-y-1">
              <Link
                to="/"
                className={`${isActive('/')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/') ? 'text-cyan-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
                </svg>
                Dashboard
              </Link>
              <Link
                to="/trade"
                className={`${isActive('/trade')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/trade') ? 'text-blue-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Trade
              </Link>
              <Link
                to="/create-pair"
                className={`${isActive('/create-pair')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/create-pair') ? 'text-purple-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Create Pair
              </Link>
              <Link
                to="/liquidity"
                className={`${isActive('/liquidity')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/liquidity') ? 'text-green-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Liquidity
              </Link>
              <Link
                to="/pools"
                className={`${isActive('/pools')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/pools') ? 'text-purple-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Pools
              </Link>
              <Link
                to="/ai-agent"
                className={`${isActive('/ai-agent')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/ai-agent') ? 'text-purple-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Agent
              </Link>
              <Link
                to="/ai-analytics"
                className={`${isActive('/ai-analytics')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/ai-analytics') ? 'text-pink-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                AI Analytics
              </Link>
              <Link
                to="/ai-recommendations"
                className={`${isActive('/ai-recommendations')
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg border border-cyan-500/30'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:border-gray-600'}
                  group flex items-center px-4 py-3 text-sm font-medium rounded-lg mb-2 transition-all duration-300 border border-transparent`}
              >
                <svg className={`mr-3 h-5 w-5 ${isActive('/ai-recommendations') ? 'text-orange-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI Recs
              </Link>
            </nav>
          </div>
          <div className="flex-shrink-0 p-4 border-t border-gray-700">
            <ConnectWallet />
          </div>
        </div>
      </div>

      <div className="md:pl-72 flex flex-col flex-1">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <Routes>
                <Route path="/" element={
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6"
                  >
                    {/* Hero Section */}
                    <div className="text-center mb-12">
                      <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-4"
                      >
                        Welcome to Agentic DEX
                      </motion.h1>
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-xl text-gray-300 mb-8"
                      >
                        The future of decentralized trading powered by AI agents
                      </motion.p>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-xl p-6 border border-cyan-500/30 backdrop-blur-sm"
                      >
                        <h3 className="text-lg font-semibold text-cyan-300 mb-2">Total Value Locked <span className="text-[10px] opacity-60">(Simulated)</span></h3>
                        <p className="text-3xl font-bold text-white">$1.2M</p>
                        <div className="text-sm text-green-400 mt-1">+12.5% (24h)</div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded-xl p-6 border border-green-500/30 backdrop-blur-sm"
                      >
                        <h3 className="text-lg font-semibold text-green-300 mb-2">24h Volume <span className="text-[10px] opacity-60">(Simulated)</span></h3>
                        <p className="text-3xl font-bold text-white">$456K</p>
                        <div className="text-sm text-green-400 mt-1">+8.3% (24h)</div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.6 }}
                        className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-xl p-6 border border-purple-500/30 backdrop-blur-sm"
                      >
                        <h3 className="text-lg font-semibold text-purple-300 mb-2">Active Pools</h3>
                        <p className="text-3xl font-bold text-white">24</p>
                        <div className="text-sm text-blue-400 mt-1">+3 New (24h)</div>
                      </motion.div>
                    </div>

                    {/* AI Agent Stats */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm"
                      >
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                          <svg className="w-5 h-5 text-purple-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          AI Agent Activity
                        </h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Active Strategies</span>
                            <span className="text-white font-medium">3</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Trades Executed</span>
                            <span className="text-white font-medium">1,247</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Success Rate</span>
                            <span className="text-green-400 font-medium">78.5%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Total Profit</span>
                            <span className="text-green-400 font-medium">$2,345.67</span>
                          </div>
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 }}
                        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm"
                      >
                        <h3 className="text-xl font-semibold text-white mb-4">Recent Activity</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                              <span className="text-white">ETH/USDC Swap</span>
                            </div>
                            <span className="text-green-400">+$120.50</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                              <span className="text-white">BTC/USDT Liquidity</span>
                            </div>
                            <span className="text-blue-400">+$45.23</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                              <span className="text-white">AI Arbitrage</span>
                            </div>
                            <span className="text-purple-400">+$78.91</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                } />

                <Route path="/trade" element={<SwapTokens />} />
                <Route path="/liquidity" element={<LiquidityManagement />} />
                <Route path="/create-pair" element={<CreatePair />} />
                <Route path="/pools" element={<PairList />} />
                <Route path="/ai-agent" element={<AIAgentControls />} />
                <Route path="/ai-analytics" element={<AIAnalyticsDashboard />} />
                <Route path="/ai-recommendations" element={<AIRecommendations />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
    </div>
  );
}

// Main App wrapper with Router
export default function App() {
  return (
    <Web3Provider>
      <Router>
        <AppContent />
      </Router>
    </Web3Provider>
  );
}
