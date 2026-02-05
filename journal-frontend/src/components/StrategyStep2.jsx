import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function StrategyStep2({ strategy, updateStrategy }) {
  const handleAddRule = () => {
    const rules = strategy.entryRules || [];
    updateStrategy({ ...strategy, entryRules: [...rules, ''] });
  };

  const handleRuleChange = (index, value) => {
    const rules = [...(strategy.entryRules || [])];
    rules[index] = value;
    updateStrategy({ ...strategy, entryRules: rules });
  };

  const handleRemoveRule = (index) => {
    const rules = [...(strategy.entryRules || [])];
    rules.splice(index, 1);
    updateStrategy({ ...strategy, entryRules: rules });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Entry Rules</h2>
      <div className="space-y-3">
        {(strategy.entryRules || []).map((rule, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={rule}
              onChange={(e) => handleRuleChange(index, e.target.value)}
              placeholder={`e.g., 'RSI < 30 and price crosses above 20 EMA'`}
              className="w-full bg-[#1f1f1f] border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => handleRemoveRule(index)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-md">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={handleAddRule} className="mt-4 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
        <Plus size={16} />
        Add Entry Rule
      </button>
    </div>
  );
}
