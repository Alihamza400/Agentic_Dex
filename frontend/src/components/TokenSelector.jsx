import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TOKEN_LIST, searchTokens } from '../constants/tokens';

export default function TokenSelector({
  value,
  onChange,
  placeholder = "Select token",
  tokens = TOKEN_LIST,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTokens, setFilteredTokens] = useState(tokens);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredTokens(tokens);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = tokens.filter(token =>
        token.name.toLowerCase().includes(term) ||
        token.symbol.toLowerCase().includes(term) ||
        token.address.toLowerCase().includes(term)
      );
      setFilteredTokens(filtered);
    }
  }, [searchTerm, tokens]);

  const handleSelect = (token) => {
    onChange(token);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-4 py-3 bg-gray-600 text-white rounded-lg border ${
          disabled ? 'border-gray-500 opacity-50 cursor-not-allowed' : 'border-gray-500 hover:border-blue-500 focus:border-blue-500 focus:outline-none'
        }`}
      >
        {value ? (
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-2">
              <span className="text-xs font-bold">{value.symbol.charAt(0)}</span>
            </div>
            <div className="text-left">
              <div className="font-medium">{value.symbol}</div>
              <div className="text-xs text-gray-400 truncate max-w-[100px]">{value.name}</div>
            </div>
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <svg
          className={`w-5 h-5 text-gray-400 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-20 mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-hidden"
          >
            <div className="p-2">
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-gray-600 text-white rounded border border-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-40 overflow-y-auto">
              {filteredTokens.length > 0 ? (
                filteredTokens.map((token, index) => (
                  <motion.div
                    key={index}
                    whileHover={{ backgroundColor: 'rgba(75, 85, 99, 0.5)' }}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-600/50 border-b border-gray-600 last:border-b-0"
                    onClick={() => handleSelect(token)}
                  >
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                        <span className="text-xs font-bold">{token.symbol.charAt(0)}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{token.symbol}</div>
                        <div className="text-xs text-gray-400">{token.name}</div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="px-4 py-3 text-gray-400 text-center text-sm">No tokens found</div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}