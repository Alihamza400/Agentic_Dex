import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ConnectWallet from './ConnectWallet';

const Header = ({ sidebarOpen, setSidebarOpen }) => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 shadow-2xl shadow-cyan-500/10 sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-lg">
                <span className="inline-flex items-center">
                  <span className="mr-2 animate-pulse">⚡</span>
                  Agentic DEX
                  <span className="ml-2 animate-pulse">🤖</span>
                </span>
              </h1>
              </Link>
          </div>

          {/* Center decorative elements */}
          <div className="flex-1 flex justify-center hidden md:block">
            <div className="flex items-center space-x-1 px-4 py-2 rounded-full bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/30 backdrop-blur-sm">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-1 text-gray-400">
                  <span className="text-sm">💧</span>
                  <span className="text-xs font-medium">DeFi</span>
                </div>
                <div className="w-px h-6 bg-gradient-to-b from-cyan-500/50 to-purple-500/50"></div>
                <div className="flex items-center space-x-1 text-gray-400">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs font-medium">AI Powered</span>
                </div>
                <div className="w-px h-6 bg-gradient-to-b from-cyan-500/50 to-purple-500/50"></div>
                <div className="flex items-center space-x-1 text-gray-400">
                  <span className="text-sm">⚡</span>
                  <span className="text-xs font-medium">Fast</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden md:block flex items-center space-x-3">
            <ConnectWallet />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            <ConnectWallet />
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="text-gray-400 hover:text-white focus:outline-none p-1 rounded-lg hover:bg-gray-700/50 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {sidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;