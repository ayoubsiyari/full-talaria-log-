import React, { createContext, useContext, useState, useCallback } from 'react';

const FilterContext = createContext();

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
};

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState({
    pnlRange: { min: '', max: '' },
    rrRange: { min: '', max: '' },
    dateRange: { start: '', end: '' },
    symbol: [],
    direction: [],
    strategy: [],
    setup: [],
    importBatch: [],
    timeOfDay: [],
    dayOfWeek: [],
    month: [],
    year: [],
    variables: {},
    variableCombinations: { enabled: false, level: 1, combinations: [] }
  });
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const updateFilters = useCallback((newFilters) => {
    console.log('FilterContext: Updating filters:', newFilters);
    console.log('FilterContext: Previous filters:', filters);
    setFilters(newFilters);
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters({
      pnlRange: { min: '', max: '' },
      rrRange: { min: '', max: '' },
      dateRange: { start: '', end: '' },
      symbol: [],
      direction: [],
      strategy: [],
      setup: [],
      importBatch: [],
      timeOfDay: [],
      dayOfWeek: [],
      month: [],
      year: [],
      variables: {},
      variableCombinations: { enabled: false, level: 1, combinations: [] }
    });
  }, []);

  const toggleFilterVisibility = useCallback(() => {
    setIsFilterVisible(prev => !prev);
  }, []);

  const value = {
    filters,
    updateFilters,
    clearFilters,
    isFilterVisible,
    toggleFilterVisibility
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}; 