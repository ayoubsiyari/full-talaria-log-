import React, { useState } from 'react';
import CustomVariablesManager from './CustomVariablesManager';

const VariableSelector = ({ onSelectionChange, initialSelections = {} }) => {
  const [selectedValues, setSelectedValues] = useState(initialSelections);

  const handleSelectionChange = (newSelections) => {
    setSelectedValues(newSelections);
    if (onSelectionChange) {
      onSelectionChange(newSelections);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Select Custom Variables
        </h3>
        <p className="text-blue-700 text-sm">
          Check the boxes below to select which custom variable values you want to include in your analysis or filters.
        </p>
      </div>
      
      <CustomVariablesManager
        selectionMode={true}
        selectedValues={selectedValues}
        onSelectionChange={handleSelectionChange}
      />
      
      {Object.keys(selectedValues).length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-md font-semibold text-green-900 mb-2">
            Selected Variables:
          </h4>
          <div className="space-y-2">
            {Object.entries(selectedValues).map(([varName, values]) => (
              <div key={varName} className="text-sm">
                <span className="font-medium text-green-800 capitalize">{varName}:</span>
                <span className="text-green-700 ml-2">
                  {values.length > 0 ? values.join(', ') : 'None selected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableSelector; 