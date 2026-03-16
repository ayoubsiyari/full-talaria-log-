import React, { useState } from 'react';
import VariableSelector from '../components/VariableSelector';

const VariableSelectorExample = () => {
  const [selectedVariables, setSelectedVariables] = useState({});

  const handleVariableSelection = (selections) => {
    setSelectedVariables(selections);
    console.log('Selected variables:', selections);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Custom Variables Selector Example
          </h1>
          
          <p className="text-gray-600 mb-8">
            This example demonstrates how to use the CustomVariablesManager component in selection mode 
            to provide a checklist interface for selecting custom variables.
          </p>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Select Your Custom Variables
            </h2>
            <VariableSelector
              onSelectionChange={handleVariableSelection}
              initialSelections={selectedVariables}
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Selected Variables Summary
            </h3>
            {Object.keys(selectedVariables).length === 0 ? (
              <p className="text-gray-500">No variables selected yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(selectedVariables).map(([varName, values]) => (
                  <div key={varName} className="bg-white rounded-lg p-4 border">
                    <h4 className="font-medium text-gray-900 capitalize mb-2">{varName}</h4>
                    <div className="flex flex-wrap gap-2">
                      {values.map((value, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              How to Use This Component
            </h3>
            <div className="text-blue-800 text-sm space-y-2">
              <p>• Check the boxes next to the variable values you want to select</p>
              <p>• You can select multiple values from each variable</p>
              <p>• The selected values will be displayed in the summary below</p>
              <p>• Use this component in filters, analysis, or trade entry forms</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariableSelectorExample; 