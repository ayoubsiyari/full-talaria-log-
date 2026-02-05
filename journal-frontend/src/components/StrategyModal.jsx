import React from 'react';
import { X } from 'lucide-react';
import StrategyStep1 from './StrategyStep1';
import StrategyStep2 from './StrategyStep2';
import StrategyStep3 from './StrategyStep3';
import StrategyStep4 from './StrategyStep4';

const steps = [
  { id: 1, title: 'Setup', component: StrategyStep1 },
  { id: 2, title: 'Entry Rules', component: StrategyStep2 },
  { id: 3, title: 'Exit Rules', component: StrategyStep3 },
  { id: 4, title: 'Risk Management', component: StrategyStep4 },
];

export default function StrategyModal({ isOpen, onClose, onSave }) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [strategy, setStrategy] = React.useState({});

  if (!isOpen) return null;

  const CurrentStepComponent = steps.find(s => s.id === currentStep).component;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = () => {
    onSave(strategy);
    onClose();
    setCurrentStep(1);
    setStrategy({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] rounded-lg shadow-xl w-full max-w-2xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Create New Strategy</h2>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-700"><X size={20} /></button>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between mb-1">
            {steps.map(step => (
              <div key={step.id} className={`text-sm ${currentStep >= step.id ? 'text-blue-400' : 'text-gray-500'}`}>
                {step.title}
              </div>
            ))}
          </div>
          <div className="bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="min-h-[300px]">
          <CurrentStepComponent strategy={strategy} updateStrategy={setStrategy} />
        </div>

        <div className="flex justify-between mt-6">
          <button 
            onClick={handleBack} 
            disabled={currentStep === 1}
            className="px-4 py-2 text-sm font-medium bg-gray-600 rounded-lg hover:bg-gray-500 disabled:opacity-50"
          >
            Back
          </button>
          {currentStep < steps.length ? (
            <button onClick={handleNext} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Next
            </button>
          ) : (
            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
              Save Strategy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
