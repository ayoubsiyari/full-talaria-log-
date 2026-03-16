import React from 'react';
import { Filter, X } from 'lucide-react';
import { useFilter } from '../context/FilterContext';

const FilterToggle = () => {
  const { isFilterVisible, toggleFilterVisibility, filters } = useFilter();

  // Count active variables
  const activeVariablesCount = Object.keys(filters.variables || {}).filter(varName => 
    filters.variables[varName] && filters.variables[varName].length > 0
  ).length; 

  return (
    <div className="flex items-center space-x-2">
      {activeVariablesCount > 0 && (
        <div className="flex items-center px-2 py-1 bg-purple-900/30 text-purple-200 rounded-md text-xs font-medium border border-purple-700/50">
          <span className="w-2 h-2 bg-purple-500 rounded-full mr-1 animate-pulse"></span>
          {activeVariablesCount} var{activeVariablesCount !== 1 ? 's' : ''}
        </div>
      )}
      <button
        onClick={toggleFilterVisibility}
        className={`group relative inline-flex items-center px-4 py-2 border border-white/10 text-sm leading-4 font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-[#0a0a0f] ${isFilterVisible
            ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
            : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'}
        `}
      >
        <div className="relative flex items-center">
          {isFilterVisible ? (
            <>
              <X className="h-4 w-4 mr-2" />
              <span>Hide Filters</span>
            </>
          ) : (
            <>
              <Filter className="h-4 w-4 mr-2" />
              <span>Show Filters</span>
            </>
          )}
        </div>
      </button>
    </div>
  );
};

export default FilterToggle;





