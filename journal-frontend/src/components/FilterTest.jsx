import React from 'react';
import { useFilter } from '../context/FilterContext';

const FilterTest = () => {
  const { filters, updateFilters } = useFilter();

  const testFilter = () => {
    const testFilters = {
      dateRange: {
        start: '2024-01-01',
        end: '2024-12-31'
      },
      symbol: ['BTCUSD'],
      direction: ['long'],
      strategy: [],
      setup: [],
      pnlRange: {
        min: '100',
        max: ''
      },
      rrRange: {
        min: '',
        max: ''
      },
      variables: {},
      variableCombinations: {
        enabled: false,
        level: 2,
        combinations: []
      },
      importBatch: [],
      timeOfDay: [],
      dayOfWeek: [],
      month: [],
      year: []
    };
    
    console.log('Setting test filters:', testFilters);
    updateFilters(testFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      dateRange: { start: '', end: '' },
      symbol: [],
      direction: [],
      strategy: [],
      setup: [],
      pnlRange: { min: '', max: '' },
      rrRange: { min: '', max: '' },
      variables: {},
      variableCombinations: {
        enabled: false,
        level: 2,
        combinations: []
      },
      importBatch: [],
      timeOfDay: [],
      dayOfWeek: [],
      month: [],
      year: []
    };
    
    console.log('Clearing filters');
    updateFilters(clearedFilters);
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Filter Test</h2>
      
      <div className="mb-4">
        <button 
          onClick={testFilter}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Set Test Filters
        </button>
        <button 
          onClick={clearFilters}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Clear Filters
        </button>
      </div>
      
      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded">
        <h3 className="font-bold mb-2">Current Filter State:</h3>
        <pre className="text-sm overflow-auto">
          {JSON.stringify(filters, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default FilterTest; 