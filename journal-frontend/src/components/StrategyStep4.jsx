import React from 'react';

export default function StrategyStep4({ strategy, updateStrategy }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Risk Management</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="position-sizing" className="block text-sm font-medium text-gray-300 mb-1">Position Sizing</label>
          <input
            type="text"
            id="position-sizing"
            value={strategy.positionSizing || ''}
            onChange={(e) => updateStrategy({ ...strategy, positionSizing: e.target.value })}
            placeholder="e.g., '1% of account balance'"
            className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="stop-loss" className="block text-sm font-medium text-gray-300 mb-1">Stop Loss Rule</label>
          <input
            type="text"
            id="stop-loss"
            value={strategy.stopLoss || ''}
            onChange={(e) => updateStrategy({ ...strategy, stopLoss: e.target.value })}
            placeholder="e.g., 'ATR-based trailing stop'"
            className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="max-drawdown" className="block text-sm font-medium text-gray-300 mb-1">Max Drawdown</label>
          <input
            type="text"
            id="max-drawdown"
            value={strategy.maxDrawdown || ''}
            onChange={(e) => updateStrategy({ ...strategy, maxDrawdown: e.target.value })}
            placeholder="e.g., '20% of account'"
            className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
