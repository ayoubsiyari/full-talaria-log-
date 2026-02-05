import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config';
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  TrendingUp,
  Tag,
  Hash,
  Clock,
  MapPin,
  Layers,
  CheckSquare,
  Square,
  Search,
  SlidersHorizontal,
  BarChart3,
  Sparkles,
  Target,
  Activity,
  Settings,
  Zap,
  Filter as FilterIcon,
  Plus,
  Minus,
  ArrowRight,
  Star,
  Flame,
  Cpu,
  Palette,
  Wand2
} from 'lucide-react';
import { fetchWithAuth } from '../utils/fetchUtils';
import { useFilter } from '../context/FilterContext';

const AdvancedFilter = ({ onFilterChange, isVisible, onToggleVisibility }) => {
  const { filters, updateFilters } = useFilter();

  const [availableOptions, setAvailableOptions] = useState({
    symbols: [],
    strategies: [],
    setups: [],
    importBatches: [],
    variables: {},
    variableValues: {},
    customVariables: {},
    combinations: []
  });

  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const debounceTimeoutRef = useRef(null);

  // Fetch available filter options
  const fetchFilterOptions = useCallback(async () => {
    setLoading(true);
    try {
              const [statsData, importHistoryData, variablesData, customVariablesData] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/journal/stats`),
          fetchWithAuth(`${API_BASE_URL}/journal/import/history`),
          fetchWithAuth(`${API_BASE_URL}/journal/variables-analysis?combine_vars=true&combination_level=2`),
          fetchWithAuth(`${API_BASE_URL}/journal/custom-variables`)
        ]);

      if (statsData) {
        console.log('Stats data received:', statsData);
        console.log('Symbols from stats:', statsData.symbols);
        console.log('Strategies from stats:', statsData.strategies);
        console.log('Setups from stats:', statsData.setups);
        
        setAvailableOptions(prev => ({
          ...prev,
          symbols: (statsData.symbols || []).sort(),
          strategies: (statsData.strategies || []).sort(),
          setups: (statsData.setups || []).sort()
        }));
      }

      if (importHistoryData) {
        setAvailableOptions(prev => ({
          ...prev,
          importBatches: importHistoryData.map(batch => ({
            id: batch.id,
            name: batch.filename,
            date: batch.imported_at
          })).sort((a, b) => new Date(b.date) - new Date(a.date))
        }));
      }

      if (variablesData) {
        console.log('Variables data received:', variablesData);
        
        // Extract variable names and their possible values
        const variableNames = new Set();
        const variableValues = {};

        // Process individual variables
        if (variablesData.variables) {
          console.log('Processing individual variables:', variablesData.variables);
          variablesData.variables.forEach(variable => {
            console.log('Processing variable:', variable);
            const [varName, varValue] = variable.variable.split(': ');
            console.log('Split result:', { varName, varValue });
            if (varName && varValue) {
              variableNames.add(varName);
              if (!variableValues[varName]) {
                variableValues[varName] = new Set();
              }
              variableValues[varName].add(varValue);
            }
          });
        }

        // Process combinations
        if (variablesData.combinations) {
          console.log('Processing combinations:', variablesData.combinations);
          variablesData.combinations.forEach(combination => {
            const components = combination.variable_components || [];
            components.forEach(component => {
              const [varName, varValue] = component.split(': ');
              if (varName && varValue) {
                variableNames.add(varName);
                if (!variableValues[varName]) {
                  variableValues[varName] = new Set();
                }
                variableValues[varName].add(varValue);
              }
            });
          });
        }

        // Convert Sets to Arrays and sort
        const variablesArray = Array.from(variableNames).sort();
        const variableValuesArray = {};
        Object.keys(variableValues).forEach(varName => {
          variableValuesArray[varName] = Array.from(variableValues[varName]).sort();
        });

        console.log('Final variables array:', variablesArray);
        console.log('Final variable values:', variableValuesArray);

        setAvailableOptions(prev => ({
          ...prev,
          variables: variablesArray,
          variableValues: variableValuesArray
        }));
      }

      // Process custom variables data
      if (customVariablesData) {
        console.log('Custom variables data received:', customVariablesData);
        setAvailableOptions(prev => ({
          ...prev,
          customVariables: customVariablesData
        }));
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Debug: Log available options when they change
  useEffect(() => {
    console.log('Available options updated:', availableOptions);
    console.log('Variables count:', availableOptions.variables.length);
    console.log('Variables array:', availableOptions.variables);
    console.log('Variable values:', availableOptions.variableValues);
  }, [availableOptions]);



  // Fetch combinations data when combination filter is enabled
  const fetchCombinationsData = useCallback(async () => {
    if (!filters.variableCombinations.enabled) {
      setAvailableOptions(prev => ({ ...prev, combinations: [] }));
      return;
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.append('combination_level', filters.variableCombinations.level.toString());
      queryParams.append('min_trades', '3');
      
      // Add all current filters to the query
      if (filters.dateRange.start) queryParams.append('from_date', filters.dateRange.start);
      if (filters.dateRange.end) queryParams.append('to_date', filters.dateRange.end);
      if (filters.symbol.length > 0) queryParams.append('symbols', filters.symbol.join(','));
      if (filters.direction.length > 0) queryParams.append('directions', filters.direction.join(','));
      if (filters.strategy.length > 0) queryParams.append('strategies', filters.strategy.join(','));
      if (filters.setup.length > 0) queryParams.append('setups', filters.setup.join(','));
      if (filters.pnlRange.min !== '') queryParams.append('min_pnl', filters.pnlRange.min);
      if (filters.pnlRange.max !== '') queryParams.append('max_pnl', filters.pnlRange.max);
      if (filters.rrRange.min !== '') queryParams.append('min_rr', filters.rrRange.min);
      if (filters.rrRange.max !== '') queryParams.append('max_rr', filters.rrRange.max);
      if (filters.importBatch.length > 0) queryParams.append('batch_ids', filters.importBatch.join(','));
      
      // Add variables filter
      const variables = Object.entries(filters.variables)
        .filter(([_, value]) => value && value.length > 0)
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      
      if (Object.keys(variables).length > 0) {
        queryParams.append('variables', JSON.stringify(variables));
      }

      // Add selected combinations if any
      if (filters.variableCombinations.combinations.length > 0) {
        queryParams.append('combinations', JSON.stringify(filters.variableCombinations.combinations));
        console.log('🔍 AdvancedFilter: Applying combinations filter:', filters.variableCombinations.combinations);
      }

      const url = `${API_BASE_URL}/journal/combinations-filter?${queryParams.toString()}`;
      const combinationsData = await fetchWithAuth(url);
      
      if (combinationsData && combinationsData.combinations) {
        setAvailableOptions(prev => ({
          ...prev,
          combinations: combinationsData.combinations || []
        }));
      }
    } catch (error) {
      console.error('Error fetching combinations data:', error);
      setAvailableOptions(prev => ({ ...prev, combinations: [] }));
    }
  }, [filters.variableCombinations.enabled, filters.variableCombinations.level, filters.variableCombinations.combinations, filters]);

  // Fetch combinations when combination filter settings change
  useEffect(() => {
    fetchCombinationsData();
  }, [fetchCombinationsData]);

  // Generate filter query string
  const generateFilterQuery = useCallback(() => {
    const query = {};
    
    // Date range
    if (filters.dateRange.start) query.start_date = filters.dateRange.start;
    if (filters.dateRange.end) query.end_date = filters.dateRange.end;
    
    // Arrays
    if (filters.symbol.length > 0) query.symbols = filters.symbol.join(',');
    if (filters.direction.length > 0) query.directions = filters.direction.join(',');
    if (filters.strategy.length > 0) query.strategies = filters.strategy.join(',');
    if (filters.setup.length > 0) query.setups = filters.setup.join(',');
    if (filters.importBatch.length > 0) query.batch_ids = filters.importBatch.join(',');
    
    // Ranges
    if (filters.pnlRange.min !== '') query.min_pnl = filters.pnlRange.min;
    if (filters.pnlRange.max !== '') query.max_pnl = filters.pnlRange.max;
    if (filters.rrRange.min !== '') query.min_rr = filters.rrRange.min;
    if (filters.rrRange.max !== '') query.max_rr = filters.rrRange.max;
    
    // Variables
    const variables = Object.entries(filters.variables)
      .filter(([_, value]) => value && value.length > 0)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    
    if (Object.keys(variables).length > 0) {
      query.variables = JSON.stringify(variables);
    }

    // Variable Combinations
    if (filters.variableCombinations.enabled) {
      query.combine_vars = 'true';
      query.combination_level = filters.variableCombinations.level;
      if (filters.variableCombinations.combinations.length > 0) {
        query.combinations = JSON.stringify(filters.variableCombinations.combinations);
      }
      // Add min_trades for combinations
      query.min_trades = '3';
    }
    
    return query;
  }, [filters]);

  // Update filters and notify parent
  const updateFiltersCallback = useCallback((newFilters) => {
    updateFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  }, [updateFilters, onFilterChange]);

  // Handle individual filter changes
  const handleFilterChange = (filterType, value) => {
    console.log('AdvancedFilter: Filter change:', filterType, value);
    console.log('AdvancedFilter: Current filters before change:', filters);
    
    // Only update if the value actually changed
    if (filterType.includes('.')) {
      const [parent, child] = filterType.split('.');
      const currentValue = filters[parent]?.[child];
      if (JSON.stringify(currentValue) === JSON.stringify(value)) {
        return; // No change
      }
    } else {
      if (JSON.stringify(filters[filterType]) === JSON.stringify(value)) {
        return; // No change
      }
    }
    
    const newFilters = { ...filters };
    
    if (filterType.includes('.')) {
      const [parent, child] = filterType.split('.');
      newFilters[parent] = { ...newFilters[parent], [child]: value };
    } else {
      newFilters[filterType] = value;
    }
    
    console.log('AdvancedFilter: New filters state:', newFilters);
    console.log('AdvancedFilter: Calling updateFilters with:', newFilters);
    updateFilters(newFilters);
    if (onFilterChange) {
      console.log('AdvancedFilter: Also calling onFilterChange with:', newFilters);
      onFilterChange(newFilters);
    }
  };

  // Handle variable filter changes
  const handleVariableFilterChange = (variableName, value) => {
    const currentValue = filters.variables?.[variableName] || '';
    if (currentValue !== value) {
      const newVariables = { ...filters.variables, [variableName]: value };
      handleFilterChange('variables', newVariables);
    }
  };

  // Handle debounced filter changes for text inputs
  const handleDebouncedFilterChange = (filterType, value) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set new timeout for debounced update
    debounceTimeoutRef.current = setTimeout(() => {
      handleFilterChange(filterType, value);
    }, 500); // 500ms debounce for text inputs
  };

  // Clear all filters
  const clearAllFilters = () => {
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
        combinations: [],
        manualInput: ''
      },
      importBatch: [],
      timeOfDay: [],
      dayOfWeek: [],
      month: [],
      year: []
    };
    updateFilters(clearedFilters);
    if (onFilterChange) {
      onFilterChange(clearedFilters);
    }
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return (
      filters.dateRange.start || filters.dateRange.end ||
      filters.symbol.length > 0 || filters.direction.length > 0 ||
      filters.strategy.length > 0 || filters.setup.length > 0 ||
      filters.pnlRange.min !== '' || filters.pnlRange.max !== '' ||
      filters.rrRange.min !== '' || filters.rrRange.max !== '' ||
      Object.keys(filters.variables).length > 0 ||
      filters.variableCombinations.enabled ||
      filters.variableCombinations.combinations.length > 0 ||
      filters.importBatch.length > 0
    );
  };

  if (!isVisible) return null;

  const tabs = [
    { id: 'basic', label: 'Basic', icon: Zap, gradient: 'from-blue-500 to-cyan-500' },
    { id: 'performance', label: 'Performance', icon: Flame, gradient: 'from-orange-500 to-red-500' },
    { id: 'variables', label: 'Variables', icon: Cpu, gradient: 'from-purple-500 to-pink-500' },
    { id: 'advanced', label: 'Advanced', icon: Wand2, gradient: 'from-emerald-500 to-teal-500' }
  ];

  return (
    <div className="relative bg-white border-b border-blue-200/60 shadow-sm">
      {/* Header */}
      <div className="relative bg-white border-b border-blue-200/60">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <SlidersHorizontal className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#040028]">
                  Trading Filters
                </h1>
                <p className="text-sm text-slate-600">Advanced analytics</p>
              </div>
              {hasActiveFilters() && (
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 rounded-full border border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs font-semibold text-green-700">
                    {Object.values(filters).flat().filter(Boolean).length}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {hasActiveFilters() && (
                <button
                  onClick={clearAllFilters}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-all duration-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={onToggleVisibility}
                className="p-2 text-slate-600 hover:text-[#040028] hover:bg-slate-100 rounded-lg transition-all duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative px-6 py-3 bg-slate-50 border-b border-blue-200/60">
        <div className="flex items-center space-x-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-[#040028] hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* Basic Filters */}
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Date Range */}
            <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center space-x-2 mb-3">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-[#040028]">Date Range</h3>
              </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) => handleFilterChange('dateRange.start', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) => handleFilterChange('dateRange.end', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

            {/* Symbols */}
            <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-[#040028]">Symbols</h3>
                </div>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                  {filters.symbol.length}/{availableOptions.symbols.length}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => handleFilterChange('symbol', availableOptions.symbols)}
                    className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-white transition-colors"
                  >
                    All
                  </button>
                  <button
                    onClick={() => handleFilterChange('symbol', [])}
                    className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {availableOptions.symbols.map(symbol => {
                    const isSelected = filters.symbol.includes(symbol);
                    return (
                      <label key={symbol} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSymbols = e.target.checked
                              ? [...filters.symbol, symbol]
                              : filters.symbol.filter(s => s !== symbol);
                            handleFilterChange('symbol', newSymbols);
                          }}
                          className="rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500 focus:ring-2 w-3 h-3"
                        />
                        <span className="text-xs text-[#040028]">{symbol}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>


          </div>
        )}

        {/* Performance Filters */}
        {activeTab === 'performance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* P&L Range */}
            <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center space-x-2 mb-3">
                <div className="p-1.5 bg-orange-100 rounded-lg">
                  <DollarSign className="w-4 h-4 text-orange-600" />
                </div>
                <h3 className="text-sm font-bold text-[#040028]">P&L Range</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={filters.pnlRange.min}
                  onChange={(e) => handleFilterChange('pnlRange.min', e.target.value)}
                  placeholder="Min"
                  className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={filters.pnlRange.max}
                  onChange={(e) => handleFilterChange('pnlRange.max', e.target.value)}
                  placeholder="Max"
                  className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* R:R Range */}
            <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center space-x-2 mb-3">
                <div className="p-1.5 bg-yellow-100 rounded-lg">
                  <BarChart3 className="w-4 h-4 text-yellow-600" />
                </div>
                <h3 className="text-sm font-bold text-[#040028]">R:R Range</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={filters.rrRange.min}
                  onChange={(e) => handleFilterChange('rrRange.min', e.target.value)}
                  placeholder="Min"
                  className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                <input
                  type="number"
                  step="0.1"
                  value={filters.rrRange.max}
                  onChange={(e) => handleFilterChange('rrRange.max', e.target.value)}
                  placeholder="Max"
                  className="w-full px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Variables */}
        {activeTab === 'variables' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-purple-100 rounded-lg">
                <Cpu className="w-4 h-4 text-purple-600" />
              </div>
              <h2 className="text-sm font-bold text-[#040028]">Variables</h2>
              <span className="text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200">
                {Object.keys(filters.variables).filter(varName => 
                  filters.variables[varName] && filters.variables[varName].length > 0
                ).length}/{availableOptions.variables.length + Object.keys(availableOptions.customVariables).length}
              </span>
            </div>

            {/* Direction */}
            <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center space-x-2 mb-3">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <Target className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-bold text-[#040028]">Direction</h3>
              </div>
              <div className="space-y-2">
                {['long', 'short'].map(direction => {
                  const isSelected = filters.direction.includes(direction);
                  return (
                    <label key={direction} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-50 rounded p-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newDirections = e.target.checked
                            ? [...filters.direction, direction]
                            : filters.direction.filter(d => d !== direction);
                          handleFilterChange('direction', newDirections);
                        }}
                        className="rounded border-slate-300 bg-white text-purple-600 focus:ring-purple-500 focus:ring-2 w-3 h-3"
                      />
                      <span className="text-xs text-[#040028] capitalize">{direction}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Existing Variables from Trades */}
            {availableOptions.variables.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-100 rounded-lg">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-bold text-[#040028]">Variables from Trades</h3>
                  <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                    {Object.keys(filters.variables).filter(varName => 
                      filters.variables[varName] && filters.variables[varName].length > 0
                    ).length}/{availableOptions.variables.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableOptions.variables.map(varName => (
                    <div key={varName} className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="p-1 bg-indigo-100 rounded-lg">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                        </div>
                        <h3 className="text-sm font-bold text-[#040028] truncate">{varName}</h3>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                        {availableOptions.variableValues[varName]?.map(value => {
                          const isSelected = filters.variables[varName]?.includes(value) || false;
                          return (
                            <label key={value} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentValues = filters.variables[varName] || [];
                                  const newValues = e.target.checked
                                    ? [...currentValues, value]
                                    : currentValues.filter(v => v !== value);
                                  handleFilterChange('variables', {
                                    ...filters.variables,
                                    [varName]: newValues
                                  });
                                }}
                                className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 focus:ring-2 w-3 h-3"
                              />
                              <span className="text-xs text-[#040028] truncate">{value}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Variables */}
            {Object.keys(availableOptions.customVariables).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-green-100 rounded-lg">
                    <CheckSquare className="w-4 h-4 text-green-600" />
                  </div>
                  <h3 className="text-sm font-bold text-[#040028]">Custom Variables</h3>
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                    {Object.keys(filters.variables).filter(varName => 
                      filters.variables[varName] && filters.variables[varName].length > 0
                    ).length}/{Object.keys(availableOptions.customVariables).length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(availableOptions.customVariables).map(([varName, values]) => (
                    <div key={varName} className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="p-1 bg-green-100 rounded-lg">
                          <CheckSquare className="w-3 h-3 text-green-600" />
                        </div>
                        <h3 className="text-sm font-bold text-[#040028] truncate capitalize">{varName}</h3>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                        {values.map(value => {
                          const isSelected = filters.variables[varName]?.includes(value) || false;
                          return (
                            <label key={value} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentValues = filters.variables[varName] || [];
                                  const newValues = e.target.checked
                                    ? [...currentValues, value]
                                    : currentValues.filter(v => v !== value);
                                  handleFilterChange('variables', {
                                    ...filters.variables,
                                    [varName]: newValues
                                  });
                                }}
                                className="rounded border-slate-300 bg-white text-green-600 focus:ring-green-500 focus:ring-2 w-3 h-3"
                              />
                              <span className="text-xs text-[#040028] truncate">{value}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Variables Message */}
            {availableOptions.variables.length === 0 && Object.keys(availableOptions.customVariables).length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Cpu className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-[#040028] mb-2">No Variables Available</h3>
                <p className="text-slate-600 text-sm">
                  Create custom variables in the Journal page to start filtering by them.
                </p>
              </div>
            )}

            {/* Variable Combinations */}
            {availableOptions.variables.length > 1 && (
              <div className="bg-white border border-blue-200/60 rounded-lg p-6 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-violet-100 rounded-lg">
                      <Layers className="w-4 h-4 text-violet-600" />
                    </div>
                    <h2 className="text-sm font-bold text-[#040028]">Variable Combinations</h2>
                  </div>
                  <span className="text-xs text-violet-700 bg-violet-50 px-2 py-1 rounded border border-violet-200">
                    {filters.variableCombinations.combinations.length} selected
                  </span>
                </div>
                  
                <div className="space-y-4">
                  {/* Enable Toggle and Level Selector */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={filters.variableCombinations.enabled}
                            onChange={(e) => handleFilterChange('variableCombinations.enabled', e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-8 h-4 rounded-full transition-all duration-300 ${
                            filters.variableCombinations.enabled 
                              ? 'bg-violet-600' 
                              : 'bg-slate-200'
                          }`}>
                            <div className={`w-3 h-3 bg-white rounded-full shadow-lg transform transition-transform duration-300 ${
                              filters.variableCombinations.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            } mt-0.5`}></div>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#040028]">Enable Combinations</span>
                      </label>
                      {filters.variableCombinations.enabled && (
                        <div className="flex items-center space-x-2">
                          <select
                            value={filters.variableCombinations.level}
                            onChange={(e) => handleFilterChange('variableCombinations.level', parseInt(e.target.value))}
                            className="px-3 py-2 bg-white border border-blue-200/60 rounded-lg text-[#040028] text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          >
                            <option value={2}>Pairs (2 variables)</option>
                            <option value={3}>Trios (3 variables)</option>
                            <option value={4}>Quartets (4 variables)</option>
                            <option value={5}>Quintets (5 variables)</option>
                          </select>
                          <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            {availableOptions.combinations.length} combinations
                          </div>
                        </div>
                      )}
                    </div>
                    {filters.variableCombinations.enabled && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            const allCombinations = availableOptions.combinations.map(combo => combo.combination);
                            handleFilterChange('variableCombinations.combinations', allCombinations);
                          }}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => handleFilterChange('variableCombinations.combinations', [])}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                    )}
                  </div>

                  {filters.variableCombinations.enabled && (
                    <div className="space-y-4">
                      {/* Manual Input */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="p-1 bg-violet-100 rounded-lg">
                            <Plus className="w-3 h-3 text-violet-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-[#040028]">Add Custom Combination</h3>
                        </div>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={filters.variableCombinations.manualInput || ''}
                            onChange={(e) => handleFilterChange('variableCombinations.manualInput', e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && filters.variableCombinations.manualInput?.trim()) {
                                e.preventDefault();
                                const manualInput = filters.variableCombinations.manualInput;
                                // Basic validation for format
                                const isValidFormat = /^[^=]+=[^,]+(?:,[^=]+=[^,]+)*$/.test(manualInput.trim());
                                if (!isValidFormat) {
                                  alert('Invalid format. Please use: VariableName=Value,VariableName=Value');
                                  return;
                                }
                                
                                // Check for duplicates
                                const currentCombinations = filters.variableCombinations.combinations;
                                if (currentCombinations.includes(manualInput.trim())) {
                                  alert('This combination already exists.');
                                  return;
                                }
                                
                                const newCombinations = [...currentCombinations, manualInput.trim()];
                                handleFilterChange('variableCombinations.combinations', newCombinations);
                                handleFilterChange('variableCombinations.manualInput', '');
                              }
                            }}
                            placeholder="Variable1=Value1,Variable2=Value2"
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[#040028] text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => {
                              const manualInput = filters.variableCombinations.manualInput;
                              if (manualInput && manualInput.trim()) {
                                // Basic validation for format
                                const isValidFormat = /^[^=]+=[^,]+(?:,[^=]+=[^,]+)*$/.test(manualInput.trim());
                                if (!isValidFormat) {
                                  alert('Invalid format. Please use: VariableName=Value,VariableName=Value');
                                  return;
                                }
                                
                                // Check for duplicates
                                const currentCombinations = filters.variableCombinations.combinations;
                                if (currentCombinations.includes(manualInput.trim())) {
                                  alert('This combination already exists.');
                                  return;
                                }
                                
                                const newCombinations = [...currentCombinations, manualInput.trim()];
                                handleFilterChange('variableCombinations.combinations', newCombinations);
                                handleFilterChange('variableCombinations.manualInput', '');
                              }
                            }}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!filters.variableCombinations.manualInput?.trim()}
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add</span>
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Format: VariableName=Value,VariableName=Value (e.g., Market=Bullish,Timeframe=1H)
                        </p>
                      </div>

                      {/* Selected Combinations */}
                      {filters.variableCombinations.combinations.length > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className="p-1 bg-emerald-100 rounded-lg">
                                <CheckSquare className="w-3 h-3 text-emerald-600" />
                              </div>
                              <h3 className="text-sm font-semibold text-[#040028]">Selected Combinations</h3>
                            </div>
                            <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
                              {filters.variableCombinations.combinations.length} selected
                            </span>
                          </div>
                          <div className="space-y-2">
                            {filters.variableCombinations.combinations.map((combo, index) => (
                              <div key={index} className="flex items-center justify-between bg-white border border-emerald-200 rounded-lg p-3">
                                <span className="text-sm text-[#040028] font-medium">{combo}</span>
                                <button
                                  onClick={() => {
                                    const newCombinations = filters.variableCombinations.combinations.filter((_, i) => i !== index);
                                    handleFilterChange('variableCombinations.combinations', newCombinations);
                                  }}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Available Combinations */}
                      {availableOptions.combinations.length > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className="p-1 bg-violet-100 rounded-lg">
                                <Layers className="w-3 h-3 text-violet-600" />
                              </div>
                              <h3 className="text-sm font-semibold text-[#040028]">Available Combinations</h3>
                            </div>
                            <span className="text-xs text-violet-700 bg-violet-100 px-2 py-1 rounded">
                              {availableOptions.combinations.length} available
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-2">
                            {availableOptions.combinations.map((combo, index) => {
                              const isSelected = filters.variableCombinations.combinations.includes(combo.combination);
                              return (
                                <label key={index} className="flex items-start space-x-3 cursor-pointer hover:bg-white rounded-lg p-3 border border-transparent hover:border-slate-200 transition-all">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const currentCombinations = filters.variableCombinations.combinations;
                                      const newCombinations = e.target.checked
                                        ? [...currentCombinations, combo.combination]
                                        : currentCombinations.filter(c => c !== combo.combination);
                                      handleFilterChange('variableCombinations.combinations', newCombinations);
                                    }}
                                    className="rounded border-slate-300 bg-white text-violet-600 focus:ring-violet-500 focus:ring-2 w-4 h-4 mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-[#040028] break-words">
                                      {combo.combination}
                                    </div>
                                    <div className="flex items-center space-x-4 mt-1">
                                      <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                        {combo.trades || 0} trades
                                      </span>
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        combo.pnl >= 0 
                                          ? 'text-emerald-700 bg-emerald-100' 
                                          : 'text-red-700 bg-red-100'
                                      }`}>
                                        {combo.pnl >= 0 ? '+' : ''}{combo.pnl?.toFixed(2) || '0.00'} P&L
                                      </span>
                                      <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                                        {combo.win_rate ? `${(combo.win_rate * 100).toFixed(1)}%` : '0%'} WR
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* No Combinations Available */}
                      {availableOptions.combinations.length === 0 && (
                        <div className="text-center py-6 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Layers className="w-6 h-6 text-violet-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-[#040028] mb-1">No Combinations Available</h3>
                          <p className="text-xs text-slate-600">
                            Change the combination level or add custom combinations above.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Advanced Filters */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            {/* Strategy, Setup, Import Batch */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Strategy */}
              <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-teal-100 rounded-lg">
                      <Activity className="w-4 h-4 text-teal-600" />
                    </div>
                    <h3 className="text-sm font-bold text-[#040028]">Strategy</h3>
                  </div>
                  <span className="text-xs text-teal-700 bg-teal-50 px-2 py-1 rounded border border-teal-200">
                    {filters.strategy.length}/{availableOptions.strategies.length}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => handleFilterChange('strategy', availableOptions.strategies)}
                      className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 rounded text-white transition-colors"
                    >
                      All
                    </button>
                    <button
                      onClick={() => handleFilterChange('strategy', [])}
                      className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {availableOptions.strategies.map(strategy => {
                      const isSelected = filters.strategy.includes(strategy);
                      return (
                        <label key={strategy} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newStrategies = e.target.checked
                                ? [...filters.strategy, strategy]
                                : filters.strategy.filter(s => s !== strategy);
                              handleFilterChange('strategy', newStrategies);
                            }}
                            className="rounded border-slate-300 bg-white text-teal-600 focus:ring-teal-500 focus:ring-2 w-3 h-3"
                          />
                          <span className="text-xs text-[#040028]">{strategy}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Setup */}
              <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-rose-100 rounded-lg">
                      <Target className="w-4 h-4 text-rose-600" />
                    </div>
                    <h3 className="text-sm font-bold text-[#040028]">Setup</h3>
                  </div>
                  <span className="text-xs text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                    {filters.setup.length}/{availableOptions.setups.length}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => handleFilterChange('setup', availableOptions.setups)}
                      className="text-xs px-2 py-1 bg-rose-600 hover:bg-rose-700 rounded text-white transition-colors"
                    >
                      All
                    </button>
                    <button
                      onClick={() => handleFilterChange('setup', [])}
                      className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {availableOptions.setups.map(setup => {
                      const isSelected = filters.setup.includes(setup);
                      return (
                        <label key={setup} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSetups = e.target.checked
                                ? [...filters.setup, setup]
                                : filters.setup.filter(s => s !== setup);
                              handleFilterChange('setup', newSetups);
                            }}
                            className="rounded border-slate-300 bg-white text-rose-600 focus:ring-rose-500 focus:ring-2 w-3 h-3"
                          />
                          <span className="text-xs text-[#040028]">{setup}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Import Batch */}
              <div className="bg-white border border-blue-200/60 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-amber-100 rounded-lg">
                      <Hash className="w-4 h-4 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-bold text-[#040028]">Batch</h3>
                  </div>
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    {filters.importBatch.length}/{availableOptions.importBatches.length}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => handleFilterChange('importBatch', availableOptions.importBatches.map(b => b.id))}
                      className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 rounded text-white transition-colors"
                    >
                      All
                    </button>
                    <button
                      onClick={() => handleFilterChange('importBatch', [])}
                      className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {availableOptions.importBatches.map(batch => {
                      const isSelected = filters.importBatch.includes(batch.id);
                      return (
                        <label key={batch.id} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 rounded p-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newBatches = e.target.checked
                                ? [...filters.importBatch, batch.id]
                                : filters.importBatch.filter(b => b !== batch.id);
                              handleFilterChange('importBatch', newBatches);
                            }}
                            className="rounded border-slate-300 bg-white text-amber-600 focus:ring-amber-500 focus:ring-2 w-3 h-3"
                          />
                          <span className="text-xs text-[#040028] truncate">
                            {batch.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>


          </div>
        )}
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
};

export default AdvancedFilter;

