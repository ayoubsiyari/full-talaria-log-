import React from 'react';
import { X } from 'lucide-react';

const DetailSection = ({ title, children }) => (
  <div className="mb-4">
    <h4 className="text-lg font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">{title}</h4>
    {children}
  </div>
);

const RuleList = ({ rules }) => (
  <ul className="list-disc list-inside space-y-1 text-gray-300">
    {(rules || []).map((rule, index) => (
      <li key={index}>{rule}</li>
    ))}
  </ul>
);

export default function StrategyDetailModal({ isOpen, onClose, strategy }) {
  if (!isOpen || !strategy) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] rounded-lg shadow-xl w-full max-w-2xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold truncate">{strategy.name}</h2>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-700"><X size={20} /></button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto pr-4">
          <DetailSection title="Description">
            <p className="text-gray-300 whitespace-pre-wrap">{strategy.description}</p>
          </DetailSection>

          <DetailSection title="Entry Rules">
            <RuleList rules={strategy.entryRules} />
          </DetailSection>

          <DetailSection title="Exit Rules">
            <RuleList rules={strategy.exitRules} />
          </DetailSection>

          <DetailSection title="Risk Management">
            <div className="text-gray-300 space-y-1">
              <p><strong>Position Sizing:</strong> {strategy.positionSizing}</p>
              <p><strong>Stop Loss:</strong> {strategy.stopLoss}</p>
              <p><strong>Max Drawdown:</strong> {strategy.maxDrawdown}</p>
            </div>
          </DetailSection>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-gray-600 rounded-lg hover:bg-gray-500">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
