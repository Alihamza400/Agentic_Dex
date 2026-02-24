import React, { useState } from 'react';
import { motion } from 'framer-motion';
import AddLiquidity from './AddLiquidity';
import RemoveLiquidity from './RemoveLiquidity';

export default function LiquidityManagement() {
  const [activeTab, setActiveTab] = useState('add');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto p-4"
    >
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
        <div className="border-b border-gray-700">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'add'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/30'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/20'
              }`}
            >
              Add Liquidity
            </button>
            <button
              onClick={() => setActiveTab('remove')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'remove'
                  ? 'text-red-400 border-b-2 border-red-400 bg-gray-700/30'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/20'
              }`}
            >
              Remove Liquidity
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'add' ? <AddLiquidity /> : <RemoveLiquidity />}
        </div>
      </div>
    </motion.div>
  );
}