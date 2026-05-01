// Utility function to build filter query parameters
export const buildFilterParams = (filters) => {
  const queryParams = new URLSearchParams();
  
  // Ensure filters is not undefined
  const safeFilters = filters || {};
  
  console.log('buildFilterParams called with:', filters);
  console.log('safeFilters:', safeFilters);
  
  // Add filter parameters with safe property access
  if (safeFilters.dateRange?.start) {
    queryParams.append('from_date', safeFilters.dateRange.start);
    console.log('Added from_date:', safeFilters.dateRange.start);
  }
  if (safeFilters.dateRange?.end) {
    queryParams.append('to_date', safeFilters.dateRange.end);
    console.log('Added to_date:', safeFilters.dateRange.end);
  }
  if (safeFilters.symbol && safeFilters.symbol.length > 0) {
    queryParams.append('symbols', safeFilters.symbol.join(','));
    console.log('Added symbols:', safeFilters.symbol.join(','));
  }
  if (safeFilters.direction && safeFilters.direction.length > 0) {
    queryParams.append('directions', safeFilters.direction.join(','));
    console.log('Added directions:', safeFilters.direction.join(','));
  }
  if (safeFilters.strategy && safeFilters.strategy.length > 0) {
    queryParams.append('strategies', safeFilters.strategy.join(','));
    console.log('Added strategies:', safeFilters.strategy.join(','));
  }
  if (safeFilters.setup && safeFilters.setup.length > 0) {
    queryParams.append('setups', safeFilters.setup.join(','));
    console.log('Added setups:', safeFilters.setup.join(','));
  }
  // Check pnlRange and rrRange (now properly structured)
  if (safeFilters.pnlRange?.min !== undefined && safeFilters.pnlRange.min !== '') {
    queryParams.append('min_pnl', safeFilters.pnlRange.min);
    console.log('Added min_pnl:', safeFilters.pnlRange.min);
  }
  if (safeFilters.pnlRange?.max !== undefined && safeFilters.pnlRange.max !== '') {
    queryParams.append('max_pnl', safeFilters.pnlRange.max);
    console.log('Added max_pnl:', safeFilters.pnlRange.max);
  }
  if (safeFilters.rrRange?.min !== undefined && safeFilters.rrRange.min !== '') {
    queryParams.append('min_rr', safeFilters.rrRange.min);
    console.log('Added min_rr:', safeFilters.rrRange.min);
  }
  if (safeFilters.rrRange?.max !== undefined && safeFilters.rrRange.max !== '') {
    queryParams.append('max_rr', safeFilters.rrRange.max);
    console.log('Added max_rr:', safeFilters.rrRange.max);
  }
  if (safeFilters.importBatch && safeFilters.importBatch.length > 0) queryParams.append('batch_ids', safeFilters.importBatch.join(','));
  if (safeFilters.timeOfDay && safeFilters.timeOfDay.length > 0) queryParams.append('time_of_day', safeFilters.timeOfDay.join(','));
  if (safeFilters.dayOfWeek && safeFilters.dayOfWeek.length > 0) queryParams.append('day_of_week', safeFilters.dayOfWeek.join(','));
  if (safeFilters.month && safeFilters.month.length > 0) queryParams.append('month', safeFilters.month.join(','));
  if (safeFilters.year && safeFilters.year.length > 0) queryParams.append('year', safeFilters.year.join(','));
  if (safeFilters.variables && Object.keys(safeFilters.variables).length > 0) queryParams.append('variables', JSON.stringify(safeFilters.variables));
  if (safeFilters.variableCombinations?.enabled) queryParams.append('combine_vars', 'true');
  if (safeFilters.variableCombinations?.level) queryParams.append('combination_level', safeFilters.variableCombinations.level);
  if (safeFilters.variableCombinations?.combinations && safeFilters.variableCombinations.combinations.length > 0) queryParams.append('combinations', safeFilters.variableCombinations.combinations.join(','));
  
  console.log('Final queryParams:', queryParams.toString());
  console.log('Final queryParams entries:', Array.from(queryParams.entries()));
  
  return queryParams;
};

// Utility function to add filters to an existing URL
export const addFiltersToUrl = (baseUrl, filters) => {
  const queryParams = buildFilterParams(filters);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${queryParams.toString()}`;
}; 