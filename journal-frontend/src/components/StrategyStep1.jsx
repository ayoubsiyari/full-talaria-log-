import React from 'react';

export default function StrategyStep1({ strategy, updateStrategy }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Strategy Setup</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="strategy-name" className="block text-sm font-medium text-gray-300 mb-1">Strategy Name</label>
          <input
            type="text"
            id="strategy-name"
            value={strategy.name || ''}
            onChange={(e) => updateStrategy({ ...strategy, name: e.target.value })}
            placeholder="e.g., 'My Golden Cross Strategy'"
            className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="strategy-description" className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            id="strategy-description"
            value={strategy.description || ''}
            onChange={(e) => updateStrategy({ ...strategy, description: e.target.value })}
            rows="4"
            placeholder="Describe the core idea of your strategy..."
            className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
