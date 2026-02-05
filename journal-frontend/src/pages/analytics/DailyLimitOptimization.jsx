import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFilter } from '../../context/FilterContext';
import { RefreshCw, Move, Target, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { fetchWithAuth } from '../../utils/fetchUtils';
import { API_BASE_URL } from '../../config';
import FilterToggle from '../../components/FilterToggle';
import AdvancedFilter from '../../components/AdvancedFilter';

const StatCard = ({ title, value, tooltip, isOptimized = false }) => (
  <div className={`border rounded-xl p-6 text-center h-full flex flex-col justify-center transition-all duration-300 ${
    isOptimized 
      ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-lg' 
      : 'bg-white border-blue-200/60'
  }`}>
    <div className="flex items-center justify-center mb-2">
      <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wider">{title}</h4>
      {tooltip && (
        <div className="ml-1 group relative">
          <div className="h-4 w-4 text-slate-400 cursor-pointer">ℹ️</div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      )}
    </div>
    <p className={`text-2xl font-bold leading-none ${
      isOptimized ? 'text-emerald-700' : 'text-[#040028]'
    }`}>{value}</p>
  </div>
);

const CustomTooltip = ({ active, payload, label, timeframe, initialBalance = 10000 }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    let labelContent;

    if (timeframe === 'all') {
      labelContent = (
        <>
          <div className="font-semibold text-[#040028]">
            {`Trade #${data.trade_number}`}
          </div>
          <div className="text-slate-600 text-sm">
            {`Date: ${data.date}`}
          </div>
        </>
      );
    } else {
      labelContent = (
        <>
          <div className="font-semibold text-[#040028]">
            {`Period: ${label}`}
          </div>
          <div className="text-slate-600 text-sm">
            {`Trades: ${data.trade_count}`}
          </div>
        </>
      );
    }

    // Calculate percentage based on initial balance
    const pnlPercentage = (data.pnl / initialBalance) * 100;

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg">
        {labelContent}
        <div className="border-t border-slate-200 my-2"></div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`font-bold text-lg ${data.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {`${data.pnl >= 0 ? '+' : ''}$${data.pnl.toFixed(2)}`}
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
              data.pnl >= 0 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}>
              {data.pnl >= 0 ? 'Profit' : 'Loss'}
            </span>
          </div>
          <div className="text-sm text-slate-600">
            {`${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}% of account`}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const DailyLimitOptimization = () => {
  const { filters } = useFilter();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('daily');
  const [statLine, setStatLine] = useState('average');
  
  // Interactive daily limit levels
  const [upperLimit, setUpperLimit] = useState(10); // Default 10% upper limit
  const [lowerLimit, setLowerLimit] = useState(-10); // Default -10% lower limit
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null);
  const [initialBalance, setInitialBalance] = useState(10000); // Default initial balance
  const chartRef = useRef(null);

  // Filter visibility state
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // Load initial balance from backend and localStorage (same as Journal.jsx)
  useEffect(() => {
    const loadInitialBalance = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        // Try to get from backend first
        try {
          const balanceResponse = await fetch(`${API_BASE_URL}/journal/initial-balance`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            setInitialBalance(balanceData.initial_balance || 10000);
          } else {
            // Fallback to localStorage
            const savedBalance = localStorage.getItem('initialBalance');
            if (savedBalance) {
              const balance = parseFloat(savedBalance);
              setInitialBalance(balance);
            }
          }
        } catch (error) {
          console.error('Error fetching initial balance:', error);
          // Fallback to localStorage
          const savedBalance = localStorage.getItem('initialBalance');
          if (savedBalance) {
            const balance = parseFloat(savedBalance);
            setInitialBalance(balance);
          }
        }
      } catch (error) {
        console.error('Error loading initial balance:', error);
      }
    };

    loadInitialBalance();

    // Listen for balance updates from Journal.jsx
    const handleBalanceUpdate = () => {
      loadInitialBalance();
    };

    window.addEventListener('balanceUpdated', handleBalanceUpdate);
    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate);
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('DailyLimitOptimization: Starting data fetch...');
      console.log('DailyLimitOptimization: Current filters:', filters);
      console.log('DailyLimitOptimization: Current timeframe:', timeframe);
      console.log('DailyLimitOptimization: API_BASE_URL:', API_BASE_URL);
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      queryParams.append('timeframe', timeframe);
      
      // Add filter parameters with safe property access
      if (filters.dateRange?.start) queryParams.append('from_date', filters.dateRange.start);
      if (filters.dateRange?.end) queryParams.append('to_date', filters.dateRange.end);
      if (filters.symbol && filters.symbol.length > 0) queryParams.append('symbols', filters.symbol.join(','));
      if (filters.direction && filters.direction.length > 0) queryParams.append('directions', filters.direction.join(','));
      if (filters.strategy && filters.strategy.length > 0) queryParams.append('strategies', filters.strategy.join(','));
      if (filters.setup && filters.setup.length > 0) queryParams.append('setups', filters.setup.join(','));
      if (filters.pnlRange?.min !== undefined && filters.pnlRange.min !== '') queryParams.append('min_pnl', filters.pnlRange.min);
      if (filters.pnlRange?.max !== undefined && filters.pnlRange.max !== '') queryParams.append('max_pnl', filters.pnlRange.max);
      if (filters.rrRange?.min !== undefined && filters.rrRange.min !== '') queryParams.append('min_rr', filters.rrRange.min);
      if (filters.rrRange?.max !== undefined && filters.rrRange.max !== '') queryParams.append('max_rr', filters.rrRange.max);
      if (filters.importBatch && filters.importBatch.length > 0) queryParams.append('batch_ids', filters.importBatch.join(','));
      if (filters.timeOfDay && filters.timeOfDay.length > 0) queryParams.append('time_of_day', filters.timeOfDay.join(','));
      if (filters.dayOfWeek && filters.dayOfWeek.length > 0) queryParams.append('day_of_week', filters.dayOfWeek.join(','));
      if (filters.month && filters.month.length > 0) queryParams.append('month', filters.month.join(','));
      if (filters.year && filters.year.length > 0) queryParams.append('year', filters.year.join(','));
      if (filters.variables && Object.keys(filters.variables).length > 0) {
        console.log('DailyLimitOptimization: Variables filter:', filters.variables);
        queryParams.append('variables', JSON.stringify(filters.variables));
      }
      
      const url = `${API_BASE_URL}/journal/pnl-distribution?${queryParams.toString()}`;
      console.log('DailyLimitOptimization: Fetching with URL:', url);
      console.log('DailyLimitOptimization: Query parameters:', queryParams.toString());
      
      const result = await fetchWithAuth(url);
      console.log('DailyLimitOptimization: Received result:', result);
      
      if (!result) {
        throw new Error('No data received from server');
      }
      
      setData(result);
    } catch (err) {
      console.error('DailyLimitOptimization: Error fetching data:', err);
      setError(err.message || 'Failed to load daily limit optimization data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [timeframe, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter toggle functions
  const toggleFilterVisibility = () => {
    setIsFilterVisible(!isFilterVisible);
  };

  const updateFilters = (newFilters) => {
    // This will trigger a re-fetch when filters change
    console.log('DailyLimitOptimization: Filters updated:', newFilters);
  };

  // Detect when levels are at default values
  useEffect(() => {
    if (!data || !data.pnl_data) return;
    
    // Check if levels are at default values (10%/-10%)
    const isAtDefaultLevels = upperLimit === 10 && lowerLimit === -10;
    
    console.log('🔍 USE EFFECT - DEFAULT DETECTION:', {
      upperLimit,
      lowerLimit,
      isAtDefaultLevels,
      hasMovedLevels: !isAtDefaultLevels,
      totalTrades: data.pnl_data.length
    });
    
    // setHasMovedLevels(!isAtDefaultLevels); // Removed as per edit hint
  }, [upperLimit, lowerLimit, data]);

  // Calculate optimized metrics based on new daily limits
  const calculateOptimizedMetrics = useCallback(() => {
    if (!data || !data.pnl_data) return null;

    // Check if levels are at default values (10%/-10%)
    const isAtDefaultLevels = upperLimit === 10 && lowerLimit === -10;
    
    // Debug: Log the default detection
    console.log('🔍 DEFAULT DETECTION:', {
      upperLimit,
      lowerLimit,
      isAtDefaultLevels,
      totalTrades: data.pnl_data.length
    });

    // If levels are at default values, return original performance data
    if (isAtDefaultLevels) {
      // For default levels, we need to calculate which trades would hit the default limits
      const defaultUpperLimitDollar = (upperLimit / 100) * initialBalance;
      const defaultLowerLimitDollar = (lowerLimit / 100) * initialBalance;
      
      let defaultTradesHitUpperLimit = 0;
      let defaultTradesHitLowerLimit = 0;
      let defaultTotalPnl = 0;
      let defaultWins = 0;
      let defaultLosses = 0;
      
      data.pnl_data.forEach(trade => {
        if (trade.pnl >= defaultUpperLimitDollar) {
          defaultTradesHitUpperLimit++;
          defaultTotalPnl += defaultUpperLimitDollar;
          if (defaultUpperLimitDollar > 0) defaultWins++;
          else if (defaultUpperLimitDollar < 0) defaultLosses++;
        } else if (trade.pnl <= defaultLowerLimitDollar) {
          defaultTradesHitLowerLimit++;
          defaultTotalPnl += defaultLowerLimitDollar;
          if (defaultLowerLimitDollar > 0) defaultWins++;
          else if (defaultLowerLimitDollar < 0) defaultLosses++;
        }
      });
      
      const defaultTradesWithUpperOrLowerLimit = defaultTradesHitUpperLimit + defaultTradesHitLowerLimit;
      const defaultWinRate = defaultTradesWithUpperOrLowerLimit > 0 ? (defaultTradesHitUpperLimit / defaultTradesWithUpperOrLowerLimit) * 100 : 0;
      const defaultAvgPnl = defaultTradesWithUpperOrLowerLimit > 0 ? defaultTotalPnl / defaultTradesWithUpperOrLowerLimit : 0;
      
      return {
        optimizedTrades: data.pnl_data.map(t => ({ ...t, optimizedPnl: t.pnl })),
        totalPnl: defaultTotalPnl,
        winRate: defaultWinRate,
        avgPnl: defaultAvgPnl,
        wins: defaultWins,
        losses: defaultLosses,
        totalTrades: data.pnl_data.length,
        tradesHitUpperLimit: defaultTradesHitUpperLimit,
        tradesHitLowerLimit: defaultTradesHitLowerLimit,
        calculationsMatch: true,
        isOriginal: true
      };
    }

    let optimizedTrades = [];
    let totalPnl = 0;
    let wins = 0;
    let losses = 0;
    let tradesHitUpperLimit = 0;
    let tradesHitLowerLimit = 0;

    // Calculate the total account value or use a reasonable default for percentage calculation
    const totalAccountValue = initialBalance; // Use user-defined account value
    const upperLimitDollar = (upperLimit / 100) * totalAccountValue;
    const lowerLimitDollar = (lowerLimit / 100) * totalAccountValue;

    data.pnl_data.forEach((trade, index) => {
      let newPnl = 0;
      let hitUpperLimit = false;
      let hitLowerLimit = false;
      let exitReason = 'actual';

      // Check if trade would hit upper or lower daily limits (in dollar terms)
      if (trade.pnl >= upperLimitDollar) {
        // Trade would hit upper daily limit
        newPnl = upperLimitDollar; // Cap at upper limit
        hitUpperLimit = true;
        exitReason = 'Upper Limit';
      } else if (trade.pnl <= lowerLimitDollar) {
        // Trade would hit lower daily limit
        newPnl = lowerLimitDollar; // Cap at lower limit
        hitLowerLimit = true;
        exitReason = 'Lower Limit';
      } else {
        // Use actual P&L if didn't hit limits
        newPnl = trade.pnl;
        exitReason = 'actual';
      }

      // Debug: Log first few trades for verification
      if (index < 5) {
        console.log(`🔍 VERIFICATION: Trade ${index + 1}:`, {
          originalPnl: trade.pnl,
          newPnl: newPnl,
          exitReason: exitReason,
          hitUpperLimit: hitUpperLimit,
          hitLowerLimit: hitLowerLimit,
          upperLimitDollar: upperLimitDollar,
          lowerLimitDollar: lowerLimitDollar,
          upperLimit: upperLimit,
          lowerLimit: lowerLimit,
          initialBalance: initialBalance
        });
      }

      optimizedTrades.push({
        ...trade,
        optimizedPnl: newPnl,
        hitUpperLimit,
        hitLowerLimit,
        exitReason,
        originalPnl: trade.pnl
      });

      // Only count P&L for trades that hit limits (consistent with win rate calculation)
      if (hitUpperLimit || hitLowerLimit) {
        totalPnl += newPnl;
        if (newPnl > 0) wins++;
        else if (newPnl < 0) losses++;
      }

      if (hitUpperLimit) tradesHitUpperLimit++;
      if (hitLowerLimit) tradesHitLowerLimit++;
    });

    const totalTrades = data.pnl_data.length;
    
    // Calculate win rate based on upper limit hits vs lower limit hits
    // Win rate = (upper limit hits) / (upper limit hits + lower limit hits) * 100
    // Only consider trades that actually hit upper or lower limits
    const tradesWithUpperOrLowerLimit = tradesHitUpperLimit + tradesHitLowerLimit;
    const winRate = tradesWithUpperOrLowerLimit > 0 ? (tradesHitUpperLimit / tradesWithUpperOrLowerLimit) * 100 : 0;
    
    // Calculate average P&L only for trades that hit limits (consistent with win rate)
    const avgPnl = tradesWithUpperOrLowerLimit > 0 ? totalPnl / tradesWithUpperOrLowerLimit : 0;
    
    // Debug: Count trades hitting limits
    console.log('🔍 LIMIT HIT ANALYSIS:', {
      totalTrades,
      tradesHitUpperLimit,
      tradesHitLowerLimit,
      tradesWithUpperOrLowerLimit,
      tradesUsingActual: totalTrades - tradesHitUpperLimit - tradesHitLowerLimit,
      upperLimitHitPercentage: (tradesHitUpperLimit / totalTrades) * 100,
      lowerLimitHitPercentage: (tradesHitLowerLimit / totalTrades) * 100,
      actualExitPercentage: ((totalTrades - tradesHitUpperLimit - tradesHitLowerLimit) / totalTrades) * 100,
      newWinRate: winRate.toFixed(2) + '%',
      winRateCalculation: `(${tradesHitUpperLimit} upper limit hits / ${tradesWithUpperOrLowerLimit} upper+lower limit hits) * 100`,
      upperLimitDollar: upperLimitDollar,
      lowerLimitDollar: lowerLimitDollar,
      totalPnl: totalPnl,
      avgPnl: avgPnl,
      originalTotalPnl: data.pnl_data.reduce((sum, t) => sum + t.pnl, 0),
      originalAvgPnl: data.pnl_data.reduce((sum, t) => sum + t.pnl, 0) / data.pnl_data.length,
      upperLimit: upperLimit,
      lowerLimit: lowerLimit,
      initialBalance: initialBalance,
      pnlImprovement: totalPnl - data.pnl_data.reduce((sum, t) => sum + t.pnl, 0),
      avgPnlImprovement: avgPnl - (data.pnl_data.reduce((sum, t) => sum + t.pnl, 0) / data.pnl_data.length),
      calculationNote: 'P&L and win rate now calculated only for trades that hit limits (consistent logic)'
    });

    // Verification calculations - only for trades that hit limits
    const verificationTotalPnl = optimizedTrades
      .filter(t => t.hitUpperLimit || t.hitLowerLimit)
      .reduce((sum, t) => sum + t.optimizedPnl, 0);
    const verificationWins = optimizedTrades
      .filter(t => (t.hitUpperLimit || t.hitLowerLimit) && t.optimizedPnl > 0)
      .length;
    const verificationLosses = optimizedTrades
      .filter(t => (t.hitUpperLimit || t.hitLowerLimit) && t.optimizedPnl < 0)
      .length;
    // Calculate win rate based on upper limit hits vs lower limit hits (same as in calculateOptimizedMetrics)
    const verificationTradesWithUpperOrLowerLimit = tradesHitUpperLimit + tradesHitLowerLimit;
    const verificationWinRate = verificationTradesWithUpperOrLowerLimit > 0 ? (tradesHitUpperLimit / verificationTradesWithUpperOrLowerLimit) * 100 : 0;

    // Verify calculations match
    const calculationsMatch = 
      Math.abs(totalPnl - verificationTotalPnl) < 0.01 &&
      wins === verificationWins &&
      losses === verificationLosses &&
      Math.abs(winRate - verificationWinRate) < 0.01;

    console.log('🔍 VERIFICATION: Calculations match?', calculationsMatch);

    return {
      optimizedTrades,
      totalPnl,
      winRate,
      avgPnl,
      wins,
      losses,
      totalTrades,
      tradesHitUpperLimit,
      tradesHitLowerLimit,
      calculationsMatch,
      isOriginal: false
    };
  }, [data, upperLimit, lowerLimit, initialBalance]);

  // Use useMemo to prevent infinite re-renders
  const optimizedMetrics = useMemo(() => {
    return calculateOptimizedMetrics();
  }, [calculateOptimizedMetrics]);

  // Mouse event handlers for dragging
  const handleMouseDown = (e, type) => {
    setIsDragging(true);
    setDragType(type);
    e.preventDefault();
  };

     const handleMouseMove = useCallback((e) => {
     if (!isDragging || !chartRef.current || !data?.pnl_data || data.pnl_data.length === 0) return;

     const rect = chartRef.current.getBoundingClientRect();
     const y = e.clientY - rect.top;
     const height = rect.height;
     
     // Get the chart's Y-axis range from the data
     const maxPnl = Math.max(...data.pnl_data.map(t => t.pnl));
     const minPnl = Math.min(...data.pnl_data.map(t => t.pnl));
     const chartRange = maxPnl - minPnl;
     
     // Convert pixel position to dollar value
     const chartValue = maxPnl - (y / height) * chartRange;
     
     // Convert dollar value to percentage
     const percentageValue = (chartValue / initialBalance) * 100;
     
     if (dragType === 'upper') {
       const newUpperLimit = Math.max(0, Math.min(25, percentageValue));
       setUpperLimit(newUpperLimit);
       // setHasMovedLevels(true); // Removed as per edit hint
     } else if (dragType === 'lower') {
       const newLowerLimit = Math.max(-25, Math.min(0, percentageValue));
       setLowerLimit(newLowerLimit);
       // setHasMovedLevels(true); // Removed as per edit hint
     }
   }, [isDragging, dragType, data, initialBalance]);

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4 space-y-6">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 text-red-500">⚠️</div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Error Loading Data
                </h3>
                <p className="text-red-700 mb-4">{error}</p>
                <button
                  onClick={fetchData}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="h-4 w-4 inline mr-2" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.pnl_data || data.pnl_data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 text-blue-500">📊</div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">
                  No Data Available
                </h3>
                <p className="text-blue-700 mb-4">
                  No daily limit optimization data available for the current filters.
                </p>
                <button
                  onClick={fetchData}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="h-4 w-4 inline mr-2" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { pnl_data } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with Filter Toggle */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              onClick={toggleFilterVisibility} 
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors duration-200"
              aria-label="Toggle sidebar"
            >
              <Move className="h-5 w-5 text-[#040028]" />
            </button>
            <div className="flex justify-end">
              <FilterToggle />
            </div>
          </div>
        </div>
        <AdvancedFilter
          isVisible={isFilterVisible}
          onFilterChange={updateFilters}
          onToggleVisibility={toggleFilterVisibility}
        />
      </div>
      
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600 mb-2">
              Daily Limit Optimization
            </h1>
            <p className="text-slate-600">
              Optimize your daily profit and loss limits with interactive controls
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {/* Statistical Reference Toggle */}
            <div className="bg-slate-100 rounded-lg p-1">
              <label className="block text-xs font-medium text-slate-600 mb-2 text-center">
                Statistical Reference
              </label>
              <div className="flex">
                <button
                  onClick={() => setStatLine('average')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    statLine === 'average'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Average
                </button>
                <button
                  onClick={() => setStatLine('median')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    statLine === 'median'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Median
                </button>
              </div>
            </div>
            
            {/* Time Period Toggle */}
            <div className="bg-slate-100 rounded-lg p-1">
              <label className="block text-xs font-medium text-slate-600 mb-2 text-center">
                Time Period
              </label>
              <div className="flex">
                <button
                  onClick={() => setTimeframe('daily')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    timeframe === 'daily'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setTimeframe('weekly')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    timeframe === 'weekly'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setTimeframe('monthly')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    timeframe === 'monthly'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Move className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-[#040028]">Interactive Daily Limit Controls</h3>
          </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Account Value Input - Hidden as it's redundant with Journal.jsx */}
             {/* <div className="space-y-3">
               <div className="flex items-center gap-2">
                 <DollarSign className="h-4 w-4 text-blue-600" />
                 <label className="text-sm font-medium text-slate-700">Account Value</label>
                 <span className="text-lg font-bold text-blue-600">${initialBalance.toLocaleString()}</span>
                 <button
                   onClick={() => {
                     const token = localStorage.getItem('token');
                     if (token) {
                       fetchWithAuth(`${API_BASE_URL}/journal/initial-balance`)
                         .then(res => res.json())
                         .then(data => {
                           if (data.initial_balance) {
                             setInitialBalance(data.initial_balance);
                             window.dispatchEvent(new CustomEvent('balanceUpdated'));
                           }
                         })
                         .catch(err => {
                           console.error('Failed to sync initial balance:', err);
                           alert('Failed to sync initial balance. Please try again.');
                         });
                     } else {
                       alert('Please log in to sync initial balance.');
                     }
                   }}
                   className="ml-2 p-1 text-blue-600 hover:text-blue-800 transition-colors"
                   title="Sync with journal balance"
                 >
                   <RefreshCw className="h-3 w-3" />
                 </button>
               </div>
               <input
                 type="number"
                 min="1000"
                 max="1000000"
                 step="1000"
                 value={initialBalance}
                 onChange={(e) => {
                   const newValue = parseInt(e.target.value);
                   setInitialBalance(newValue);
                 }}
                 className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                 placeholder="Enter account value"
               />
               <div className="text-xs text-slate-500">
                 Used to calculate percentage limits. Click sync button to use journal balance.
               </div>
             </div> */}
             
             {/* Reset Button */}
             <div className="md:col-span-2 flex justify-center">
               <button
                 onClick={() => {
                   console.log('🔍 RESET BUTTON CLICKED - Setting levels to default');
                   setUpperLimit(10);
                   setLowerLimit(-10);
                 }}
                 className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
               >
                 <RefreshCw className="h-4 w-4" />
                 Reset to Default (Upper: 10%, Lower: -10%)
               </button>
             </div>
            
            {/* Upper Limit Control */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                                 <label className="text-sm font-medium text-slate-700">Upper Daily Limit</label>
                 <span className="text-lg font-bold text-green-600">{upperLimit.toFixed(1)}%</span>
              </div>
                             <input
                 type="range"
                 min="0"
                 max="25"
                 step="0.5"
                 value={upperLimit}
                 onChange={(e) => {
                   const newValue = parseFloat(e.target.value);
                   setUpperLimit(newValue);
                   // setHasMovedLevels(true); // Removed as per edit hint
                 }}
                 className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                 style={{
                   background: `linear-gradient(to right, #10B981 0%, #10B981 ${(upperLimit/25)*100}%, #e2e8f0 ${(upperLimit/25)*100}%, #e2e8f0 100%)`
                 }}
               />
               <div className="flex justify-between text-xs text-slate-500">
                 <span>0%</span>
                 <span>12.5%</span>
                 <span>25%</span>
               </div>
            </div>

            {/* Lower Limit Control */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                                 <label className="text-sm font-medium text-slate-700">Lower Daily Limit</label>
                 <span className="text-lg font-bold text-red-600">{lowerLimit.toFixed(1)}%</span>
              </div>
                             <input
                 type="range"
                 min="-25"
                 max="0"
                 step="0.5"
                 value={lowerLimit}
                 onChange={(e) => {
                   const newValue = parseFloat(e.target.value);
                   setLowerLimit(newValue);
                   // setHasMovedLevels(true); // Removed as per edit hint
                 }}
                 className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                 style={{
                   background: `linear-gradient(to right, #e2e8f0 0%, #e2e8f0 ${((lowerLimit+25)/25)*100}%, #EF4444 ${((lowerLimit+25)/25)*100}%, #EF4444 100%)`
                 }}
               />
               <div className="flex justify-between text-xs text-slate-500">
                 <span>-25%</span>
                 <span>-12.5%</span>
                 <span>0%</span>
               </div>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <h2 className="text-xl font-bold text-[#040028]">Daily Limit Optimization Chart</h2>
                                     <p className="text-sm text-slate-600 mt-1">
              Current Upper Limit: {upperLimit.toFixed(1)}%, Lower Limit: {lowerLimit.toFixed(1)}% - Drag lines or use controls to optimize
            </p>
          </div>
          <div className="p-6" ref={chartRef}>
            <ResponsiveContainer width="100%" height={450}>
              <BarChart
                data={pnl_data}
                margin={{
                  top: 20,
                  right: 40,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <XAxis 
                  dataKey={timeframe === 'all' ? 'trade_number' : 'period'} 
                  label={{ 
                    value: timeframe === 'all' ? 'Trade Number' : 'Period', 
                    position: 'insideBottom', 
                    offset: -5,
                    style: { fontWeight: 600, fill: '#64748b' }
                  }}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
                />
                                                  <YAxis 
                   label={{ 
                     value: 'P&L ($)', 
                     angle: -90, 
                     position: 'insideLeft',
                     style: { fontWeight: 600, fill: '#64748b' }
                   }}
                   tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                   axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
                 />
                 <Tooltip content={<CustomTooltip timeframe={timeframe} initialBalance={initialBalance} />} />
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '20px', 
                    fontWeight: 600,
                    color: '#64748b'
                  }}
                />
                
                                 {/* Interactive Upper Limit Line */}
                 <ReferenceLine
                   y={(upperLimit / 100) * initialBalance}
                   label={{
                     value: `Upper: $${((upperLimit / 100) * initialBalance).toFixed(0)} (${upperLimit.toFixed(1)}%)`,
                     position: 'right',
                     fill: '#10B981',
                     fontSize: 11,
                     dx: 10
                   }}
                   stroke="#10B981"
                   strokeWidth={2}
                   strokeDasharray="4 4"
                   cursor="ns-resize"
                   onMouseDown={(e) => handleMouseDown(e, 'upper')}
                 />
                 
                 {/* Interactive Lower Limit Line */}
                 <ReferenceLine
                   y={(lowerLimit / 100) * initialBalance}
                   label={{
                     value: `Lower: $${((lowerLimit / 100) * initialBalance).toFixed(0)} (${lowerLimit.toFixed(1)}%)`,
                     position: 'right',
                     fill: '#EF4444',
                     fontSize: 11,
                     dx: 10
                   }}
                   stroke="#EF4444"
                   strokeWidth={2}
                   strokeDasharray="4 4"
                   cursor="ns-resize"
                   onMouseDown={(e) => handleMouseDown(e, 'lower')}
                 />
                 
                 {/* Statistical Reference Line */}
                 {statLine === 'average' && (
                   <ReferenceLine
                     y={pnl_data.reduce((sum, t) => sum + t.pnl, 0) / pnl_data.length}
                     label={{
                       value: `Avg: $${(pnl_data.reduce((sum, t) => sum + t.pnl, 0) / pnl_data.length).toFixed(0)}`,
                       position: 'left',
                       fill: '#6366f1',
                       fontSize: 11,
                       dx: -10
                     }}
                     stroke="#6366f1"
                     strokeWidth={1.5}
                     strokeDasharray="3 3"
                   />
                 )}
                 
                 {statLine === 'median' && (
                   <ReferenceLine
                     y={(() => {
                       const sortedPnl = [...pnl_data].sort((a, b) => a.pnl - b.pnl);
                       const mid = Math.floor(sortedPnl.length / 2);
                       return sortedPnl.length % 2 === 0 
                         ? (sortedPnl[mid - 1].pnl + sortedPnl[mid].pnl) / 2 
                         : sortedPnl[mid].pnl;
                     })()}
                     label={{
                       value: `Median: $${(() => {
                         const sortedPnl = [...pnl_data].sort((a, b) => a.pnl - b.pnl);
                         const mid = Math.floor(sortedPnl.length / 2);
                         const median = sortedPnl.length % 2 === 0 
                           ? (sortedPnl[mid - 1].pnl + sortedPnl[mid].pnl) / 2 
                           : sortedPnl[mid].pnl;
                         return median.toFixed(0);
                       })()}`,
                       position: 'left',
                       fill: '#6366f1',
                       fontSize: 11,
                       dx: -10
                     }}
                     stroke="#6366f1"
                     strokeWidth={1.5}
                     strokeDasharray="3 3"
                   />
                 )}
                
                <Bar 
                  dataKey="pnl" 
                  name=""
                  radius={[2, 2, 0, 0]}
                >
                  {pnl_data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.pnl >= 0 ? 
                        'url(#positiveGradient)' : 
                        'url(#negativeGradient)'
                      } 
                    />
                  ))}
                </Bar>
                
                <defs>
                  <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#059669" stopOpacity={1}/>
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#DC2626" stopOpacity={1}/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Original vs Optimized Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Stats */}
          <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-[#040028]">Original Performance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatCard 
                title="Win Rate" 
                value={`${pnl_data.length > 0 ? (pnl_data.filter(t => t.pnl > 0).length / pnl_data.length * 100).toFixed(2) : '0.00'}%`} 
                tooltip="Original win rate from actual P&L."
              />
                             <StatCard 
                 title="Avg P&L" 
                 value={`$${pnl_data.length > 0 ? (pnl_data.reduce((sum, t) => sum + t.pnl, 0) / pnl_data.length).toFixed(2) : '0.00'}`}
                 tooltip="Original average P&L per trade."
               />
               <StatCard 
                 title="Total P&L" 
                 value={`$${pnl_data.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)}`}
                 tooltip="Total P&L across all trades."
               />
               <StatCard 
                 title="Max P&L" 
                 value={`$${Math.max(...pnl_data.map(t => t.pnl)).toFixed(2)}`}
                 tooltip="Maximum single trade P&L."
               />
            </div>
          </div>

          {/* Optimized Stats */}
          <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-[#040028]">
                {/* hasMovedLevels */}
                {/* hasMovedLevels ? 'Optimized Performance' : 'Original Performance (Default Limits)' */}
                Optimized Performance
              </h3>
            </div>
            {optimizedMetrics ? (
              <div className="grid grid-cols-2 gap-4">
                <StatCard 
                  title="Win Rate" 
                  value={`${optimizedMetrics.winRate.toFixed(2)}%`} 
                  tooltip={`Win rate based on upper limit hits vs lower limit hits: (${optimizedMetrics.tradesHitUpperLimit} upper hits / ${optimizedMetrics.tradesHitUpperLimit + optimizedMetrics.tradesHitLowerLimit} upper+lower hits) * 100. Only considers trades that hit daily limits.`}
                  isOptimized={optimizedMetrics.winRate > (pnl_data.filter(t => t.pnl > 0).length / pnl_data.length * 100)}
                />
                                 <StatCard 
                   title="Avg P&L" 
                   value={`$${optimizedMetrics.avgPnl.toFixed(2)}`}
                   tooltip="Average P&L per trade that hits daily limits. Only considers trades that hit upper or lower limits (consistent with win rate calculation)."
                   isOptimized={optimizedMetrics.avgPnl > (pnl_data.reduce((sum, t) => sum + t.pnl, 0) / pnl_data.length || 0)}
                 />
                 <StatCard 
                   title="Total P&L" 
                   value={`$${optimizedMetrics.totalPnl.toFixed(2)}`}
                   tooltip="Total P&L for trades that hit daily limits. Only includes trades that hit upper or lower limits (consistent with win rate calculation)."
                   isOptimized={optimizedMetrics.totalPnl > pnl_data.reduce((sum, t) => sum + t.pnl, 0)}
                 />
                <StatCard 
                  title="Upper Limit Hit Rate" 
                  value={`${optimizedMetrics.tradesHitUpperLimit}/${optimizedMetrics.tradesHitUpperLimit + optimizedMetrics.tradesHitLowerLimit} (${optimizedMetrics.winRate.toFixed(1)}%)`}
                  tooltip="Win rate based on upper limit hits vs lower limit hits. Shows the ratio of successful limit hits (upper) to failed limit hits (lower)."
                  isOptimized={true}
                />
              </div>
            ) : (
              <div className="text-center text-slate-500">Calculating optimized metrics...</div>
            )}
            
            {/* Show message when levels haven't been moved */}
            {/* !hasMovedLevels && optimizedMetrics && ( */}
            {optimizedMetrics && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <div className="h-4 w-4">ℹ️</div>
                  <span className="text-sm font-medium">
                    Move the daily limit levels above to see optimized performance results
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

                 {/* Detailed Optimization Results */}
         {optimizedMetrics && (
           <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
             <h3 className="text-lg font-semibold text-[#040028] mb-4">Detailed Daily Limit Optimization Results</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               <StatCard 
                 title="Upper Limit Hits" 
                 value={`${optimizedMetrics.tradesHitUpperLimit} (${((optimizedMetrics.tradesHitUpperLimit / optimizedMetrics.totalTrades) * 100).toFixed(1)}%)`} 
                 tooltip="Number of trades that hit the upper daily limit."
               />
               <StatCard 
                 title="Lower Limit Hits" 
                 value={`${optimizedMetrics.tradesHitLowerLimit} (${((optimizedMetrics.tradesHitLowerLimit / optimizedMetrics.totalTrades) * 100).toFixed(1)}%)`}
                 tooltip="Number of trades that hit the lower daily limit."
               />
               <StatCard 
                 title="Improvement" 
                 value={`${((optimizedMetrics.totalPnl - pnl_data.reduce((sum, t) => sum + t.pnl, 0)) / Math.abs(pnl_data.reduce((sum, t) => sum + t.pnl, 0) || 1) * 100).toFixed(1)}%`}
                 tooltip="Percentage improvement in total P&L."
               />
               <StatCard 
                 title="Risk Reduction" 
                 value={`${((Math.min(...pnl_data.map(t => t.pnl)) - ((lowerLimit / 100) * initialBalance)) / Math.abs(Math.min(...pnl_data.map(t => t.pnl))) * 100).toFixed(1)}%`}
                 tooltip="Percentage reduction in maximum loss per trade (dollar terms)."
               />
             </div>
             
             {/* Percentage Equivalents */}
             <div className="mt-6 p-4 bg-slate-50 rounded-lg">
               <h4 className="text-sm font-semibold text-slate-700 mb-3">Percentage Equivalents (Based on ${initialBalance.toLocaleString()} Account)</h4>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                 <div>
                   <div className="font-medium text-slate-600">Upper Limit:</div>
                   <div className="text-lg font-bold text-green-600">${((upperLimit / 100) * initialBalance).toFixed(0)} ({upperLimit.toFixed(1)}%)</div>
                 </div>
                 <div>
                   <div className="font-medium text-slate-600">Lower Limit:</div>
                   <div className="text-lg font-bold text-red-600">${((lowerLimit / 100) * initialBalance).toFixed(0)} ({lowerLimit.toFixed(1)}%)</div>
                 </div>
                 <div>
                   <div className="font-medium text-slate-600">Original Total P&L:</div>
                   <div className="text-lg font-bold text-blue-600">${pnl_data.reduce((sum, t) => sum + t.pnl, 0).toFixed(0)} ({(pnl_data.reduce((sum, t) => sum + t.pnl, 0) / initialBalance * 100).toFixed(2)}%)</div>
                 </div>
                 <div>
                   <div className="font-medium text-slate-600">Optimized Total P&L:</div>
                   <div className="text-lg font-bold text-emerald-600">${optimizedMetrics.totalPnl.toFixed(0)} ({(optimizedMetrics.totalPnl / initialBalance * 100).toFixed(2)}%)</div>
                 </div>
               </div>
             </div>
             
             {/* Win Rate Change Analysis */}
             <div className="mt-6 p-4 bg-white rounded-lg border border-blue-200">
               <div className="flex items-center gap-2 mb-3">
                 <div className="h-5 w-5 text-blue-600">📊</div>
                 <h4 className="text-sm font-semibold text-slate-700">Win Rate Change Analysis</h4>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                 <div>
                   <div className="font-medium">Original Win Rate:</div>
                   <div className="text-lg font-bold text-blue-600">
                     {(pnl_data.filter(t => t.pnl > 0).length / pnl_data.length * 100).toFixed(2)}%
                   </div>
                   <div className="text-xs text-slate-500 mt-1">
                     ({pnl_data.filter(t => t.pnl > 0).length} wins / {pnl_data.length} trades)
                   </div>
                 </div>
                 <div>
                   <div className="font-medium">Optimized Win Rate:</div>
                   <div className="text-lg font-bold text-emerald-600">
                     {optimizedMetrics.winRate.toFixed(2)}%
                   </div>
                   <div className="text-xs text-slate-500 mt-1">
                     ({optimizedMetrics.tradesHitUpperLimit} upper hits / {optimizedMetrics.tradesHitUpperLimit + optimizedMetrics.tradesHitLowerLimit} upper+lower hits)
                   </div>
                 </div>
                 <div>
                   <div className="font-medium">Change:</div>
                   <div className={`text-lg font-bold ${optimizedMetrics.winRate > (pnl_data.filter(t => t.pnl > 0).length / pnl_data.length * 100) ? 'text-green-600' : 'text-red-600'}`}>
                     {(optimizedMetrics.winRate - (pnl_data.filter(t => t.pnl > 0).length / pnl_data.length * 100)).toFixed(2)}%
                   </div>
                   <div className="text-xs text-slate-500 mt-1">
                     (Upper limit-based vs P&L-based win rate)
                   </div>
                 </div>
               </div>
               <div className="mt-3 text-xs text-slate-500">
                 <div>• Trades that hit upper limit: {optimizedMetrics.tradesHitUpperLimit} ({((optimizedMetrics.tradesHitUpperLimit / optimizedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                 <div>• Trades that hit lower limit: {optimizedMetrics.tradesHitLowerLimit} ({((optimizedMetrics.tradesHitLowerLimit / optimizedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                 <div>• Trades using actual exit: {optimizedMetrics.totalTrades - optimizedMetrics.tradesHitUpperLimit - optimizedMetrics.tradesHitLowerLimit} ({(((optimizedMetrics.totalTrades - optimizedMetrics.tradesHitUpperLimit - optimizedMetrics.tradesHitLowerLimit) / optimizedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
               </div>
               
               {/* New Win Rate Calculation Explanation */}
               <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                 <div className="flex items-center gap-2 text-emerald-700 mb-2">
                   <div className="h-4 w-4">ℹ️</div>
                   <span className="text-sm font-medium">New Win Rate Calculation</span>
                 </div>
                 <div className="text-xs text-emerald-600 space-y-1">
                   <div>• <strong>Formula:</strong> Win Rate = (Upper Limit Hits / (Upper Limit Hits + Lower Limit Hits)) × 100</div>
                   <div>• <strong>Logic:</strong> Only considers trades that hit upper or lower daily limits</div>
                   <div>• <strong>Upper Limit Hits:</strong> All counted as wins (100% win rate)</div>
                   <div>• <strong>Lower Limit Hits:</strong> All counted as losses (0% win rate)</div>
                   <div>• <strong>Actual Exits:</strong> Not included in win rate calculation</div>
                   <div>• <strong>Current Result:</strong> {optimizedMetrics.tradesHitUpperLimit} upper hits ÷ {optimizedMetrics.tradesHitUpperLimit + optimizedMetrics.tradesHitLowerLimit} upper+lower hits = {optimizedMetrics.winRate.toFixed(2)}%</div>
                 </div>
               </div>
               
               {/* New P&L Calculation Explanation */}
               <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                 <div className="flex items-center gap-2 text-blue-700 mb-2">
                   <div className="h-4 w-4">💰</div>
                   <span className="text-sm font-medium">New P&L Calculation</span>
                 </div>
                 <div className="text-xs text-blue-600 space-y-1">
                   <div>• <strong>Total P&L:</strong> Sum of P&L for trades that hit upper or lower limits only</div>
                   <div>• <strong>Avg P&L:</strong> Average P&L per trade that hits limits (Total P&L ÷ Number of limit hits)</div>
                   <div>• <strong>Upper Limit Hits:</strong> P&L capped at ${((upperLimit / 100) * initialBalance).toFixed(0)}</div>
                   <div>• <strong>Lower Limit Hits:</strong> P&L capped at ${((lowerLimit / 100) * initialBalance).toFixed(0)}</div>
                   <div>• <strong>Actual Exits:</strong> Not included in P&L calculation (consistent with win rate)</div>
                   <div>• <strong>Current Result:</strong> ${optimizedMetrics.totalPnl.toFixed(2)} total ÷ {optimizedMetrics.tradesHitUpperLimit + optimizedMetrics.tradesHitLowerLimit} limit hits = ${optimizedMetrics.avgPnl.toFixed(2)} avg</div>
                 </div>
               </div>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default DailyLimitOptimization;
