
import { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '../utils/fetchUtils';
import { useFilter } from '../context/FilterContext';
import { useProfile } from '../context/ProfileContext';
import { buildFilterParams } from '../utils/filterUtils';
import { API_BASE_URL } from '../config';

// Helper formatters
const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper to get week number in the year
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    weekNumber: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
    year: d.getUTCFullYear()
  };
};

export default function useAnalyticsData() {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
  
  // Ensure filters is properly initialized
  const safeFilters = useMemo(() => filters || {}, [filters]);
  const [stats, setStats] = useState(null);
  const [equityMetrics, setEquityMetrics] = useState(null);
  const [equityMetricsLoading, setEquityMetricsLoading] = useState(true);
  const [equityMetricsError, setEquityMetricsError] = useState('');
  const [performanceData, setPerformanceData] = useState({
    best_setup: null,
    best_instrument: null,
    best_time_of_day: null,
    best_week: null,
    daily_performance: [],
    weekly_performance: [],
    monthly_performance: [],
    quarterly_performance: [],
    yearly_performance: [],
    hourly_performance: []
  });
  const [loading, setLoading] = useState(true);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [error, setError] = useState('');
  const [performanceError, setPerformanceError] = useState('');
  const [importHistory, setImportHistory] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [referenceDate, setReferenceDate] = useState(new Date());

  const fetchPerformanceData = useCallback(async () => {
    setPerformanceLoading(true);
    setPerformanceError('');
    try {
      // Build filter query parameters
      if (!activeProfile) return;
      const queryParams = buildFilterParams(safeFilters);
      queryParams.set('profile_id', activeProfile.id);
      const url = `${API_BASE_URL}/journal/performance-highlights?${queryParams.toString()}`;
      console.log('Performance API URL with filters:', url);
      console.log('Current filters:', safeFilters);
      console.log('Query params string:', queryParams.toString());
      console.log('Query params entries:', Array.from(queryParams.entries()));
      
      const data = await fetchWithAuth(url);
      console.log('Raw performance data from API:', data);
      
      // Debug: Log the structure of the response
      if (data) {
        console.log('Performance data structure:', {
          hasBestSetup: !!data.best_setup,
          hasBestInstrument: !!data.best_instrument,
          hasBestTimeOfDay: !!data.best_time_of_day,
          hasBestWeek: !!data.best_week,
          hourlyLength: data.hourly_performance?.length || 0,
          weeklyLength: data.weekly_performance?.length || 0,
          dailyLength: data.daily_performance?.length || 0
        });
      }
      
      // Ensure we have valid data before processing
      if (!data) {
        console.warn('No data received from performance highlights API');
        return;
      }
      
      // Helper to generate empty time frame data
      const emptyTimeFrameData = (type) => {
        switch(type) {
          case 'hourly':
            return Array(24).fill(0).map((_, i) => ({
              hour: i,
              formatted_time: `${i.toString().padStart(2, '0')}:00`,
              pnl: 0,
              win_rate: 0,
              trades: 0
            }));
          case 'weekly':
            // Return last 12 weeks empty data
            return Array(12).fill(0).map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - ((11 - i) * 7));
              const weekStart = new Date(date);
              weekStart.setDate(date.getDate() - date.getDay());
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekStart.getDate() + 6);
              
              const weekNum = getWeekNumber(weekStart);
              
              return {
                week_num: weekNum.weekNumber,
                year: weekNum.year,
                week_start: weekStart.toISOString().split('T')[0],
                formatted_range: `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
                pnl: 0,
                win_rate: 0,
                trades: 0
              };
            });
          case 'daily':
            // Return last 30 days empty data
            return Array(30).fill(0).map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (29 - i));
              return {
                date: date.toISOString().split('T')[0],
                pnl: 0,
                win_rate: 0,
                trades: 0
              };
            });
          case 'monthly':
            // Return last 12 months empty data
            return Array(12).fill(0).map((_, i) => {
              const date = new Date();
              date.setMonth(date.getMonth() - (11 - i));
              return {
                month: date.getMonth() + 1,
                year: date.getFullYear(),
                month_start: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`,
                pnl: 0,
                win_rate: 0,
                trades: 0
              };
            });
          case 'quarterly':
            // Return last 8 quarters empty data
            return Array(8).fill(0).map((_, i) => {
              const date = new Date();
              date.setMonth(date.getMonth() - (7 - i) * 3);
              const quarter = Math.floor(date.getMonth() / 3) + 1;
              return {
                quarter,
                year: date.getFullYear(),
                quarter_start: `${date.getFullYear()}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`,
                pnl: 0,
                win_rate: 0,
                trades: 0
              };
            });
          case 'yearly':
            // Return last 5 years empty data
            return Array(5).fill(0).map((_, i) => ({
              year: new Date().getFullYear() - (4 - i),
              pnl: 0,
              win_rate: 0,
              trades: 0
            }));
          default:
            return [];
        }
      };

      // Process best week data
      const bestWeek = data.best_week || {};
      const processedBestWeek = {
        ...bestWeek,
        pnl: Number(bestWeek.pnl) || 0,
        win_rate: Number(bestWeek.win_rate) || 0,
        trades: Number(bestWeek.trades) || 0,
        week: bestWeek.week || 'No data',
        formatted_range: bestWeek.formatted_range || 'No data',
        week_num: bestWeek.week_num || 0,
        year: bestWeek.year || new Date().getFullYear()
      };

      // Process best time of day
      const bestTimeOfDay = data.best_time_of_day || {};
      const hourNum = Number(bestTimeOfDay.hour) || 0;
      const processedBestTimeOfDay = {
        ...bestTimeOfDay,
        hour: hourNum,
        pnl: Number(bestTimeOfDay.pnl) || 0,
        win_rate: Number(bestTimeOfDay.win_rate) || 0,
        trades: Number(bestTimeOfDay.trades) || 0,
        formatted_time: bestTimeOfDay.formatted_time || `${hourNum % 12 || 12} ${hourNum >= 12 ? 'PM' : 'AM'}`
      };

      // Process best setup
      const bestSetup = data.best_setup || {};
      const processedBestSetup = {
        ...bestSetup,
        name: bestSetup.name || 'No data',
        pnl: Number(bestSetup.pnl) || 0,
        win_rate: Number(bestSetup.win_rate) || 0,
        trades: Number(bestSetup.trades) || 0
      };

      // Process best instrument
      const bestInstrument = data.best_instrument || {};
      const processedBestInstrument = {
        ...bestInstrument,
        symbol: bestInstrument.symbol || 'No data',
        pnl: Number(bestInstrument.pnl) || 0,
        win_rate: Number(bestInstrument.win_rate) || 0,
        trades: Number(bestInstrument.trades) || 0
      };

      // Initialize performance arrays from data or use empty data
      const processedWeeklyPerformance = Array.isArray(data.weekly_performance) 
        ? data.weekly_performance.map(item => ({
            ...item,
            pnl: Number(item.pnl) || 0,
            win_rate: Number(item.win_rate) || 0,
            trades: Number(item.trades) || 0
          }))
        : [];

      const processedHourlyPerformance = Array.isArray(data.hourly_performance)
        ? data.hourly_performance.map(item => ({
            ...item,
            pnl: Number(item.pnl) || 0,
            win_rate: Number(item.win_rate) || 0,
            trades: Number(item.trades) || 0
          }))
        : [];

      const performanceData = {
        best_setup: processedBestSetup,
        best_instrument: processedBestInstrument,
        best_time_of_day: processedBestTimeOfDay,
        best_week: processedBestWeek,
        daily_performance: Array.isArray(data.daily_performance) 
          ? data.daily_performance.map(item => ({
              ...item,
              pnl: Number(item.pnl) || 0,
              win_rate: Number(item.win_rate) || 0,
              trades: Number(item.trades) || 0
            }))
          : emptyTimeFrameData('daily'),
        weekly_performance: processedWeeklyPerformance.length > 0 
          ? processedWeeklyPerformance 
          : emptyTimeFrameData('weekly'),
        monthly_performance: Array.isArray(data.monthly_performance)
          ? data.monthly_performance.map(item => ({
              ...item,
              pnl: Number(item.pnl) || 0,
              win_rate: Number(item.win_rate) || 0,
              trades: Number(item.trades) || 0
            }))
          : emptyTimeFrameData('monthly'),
        quarterly_performance: Array.isArray(data.quarterly_performance)
          ? data.quarterly_performance.map(item => ({
              ...item,
              pnl: Number(item.pnl) || 0,
              win_rate: Number(item.win_rate) || 0,
              trades: Number(item.trades) || 0
            }))
          : emptyTimeFrameData('quarterly'),
        yearly_performance: Array.isArray(data.yearly_performance)
          ? data.yearly_performance.map(item => ({
              ...item,
              pnl: Number(item.pnl) || 0,
              win_rate: Number(item.win_rate) || 0,
              trades: Number(item.trades) || 0
            }))
          : emptyTimeFrameData('yearly'),
        hourly_performance: processedHourlyPerformance.length > 0 
          ? processedHourlyPerformance 
          : emptyTimeFrameData('hourly')
      };
      
      console.log('Processed performance data:', performanceData);
      setPerformanceData(performanceData);
    } catch (err) {
      console.error('❌ Failed to load performance data:', err);
      setPerformanceError('Failed to load performance data. Please try again later.');
    } finally {
      setPerformanceLoading(false);
    }
  }, [safeFilters, activeProfile]);

  // Create a stable reference for the fetch function
  const stableFetchPerformanceData = useCallback(() => {
    return fetchPerformanceData();
  }, [fetchPerformanceData]);

  // Only fetch on mount and when explicitly refreshed
  useEffect(() => {
    // Initial fetch
    stableFetchPerformanceData();
    
    // Set up auto-refresh every 5 minutes (300000 ms)
    const intervalId = setInterval(() => {
      stableFetchPerformanceData();
    }, 300000);
    
    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [stableFetchPerformanceData]);
  
  // Expose a manual refresh function
  const refreshPerformanceData = useCallback(() => {
    return stableFetchPerformanceData();
  }, [stableFetchPerformanceData]);

  const fetchStats = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Token from localStorage:', token ? 'Token found' : 'No token found');
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      const url = new URL(`${API_BASE_URL}/journal/stats`, window.location.origin);
      url.searchParams.set('profile_id', activeProfile.id);
      if (selectedBatch) url.searchParams.set('batch_id', selectedBatch);
      
      // Add filter parameters
      if (filters.dateRange?.start) url.searchParams.set('from_date', filters.dateRange.start);
      if (filters.dateRange?.end) url.searchParams.set('to_date', filters.dateRange.end);
      if (filters.symbol && filters.symbol.length > 0) url.searchParams.set('symbols', filters.symbol.join(','));
      if (filters.direction && filters.direction.length > 0) url.searchParams.set('directions', filters.direction.join(','));
      if (filters.strategy && filters.strategy.length > 0) url.searchParams.set('strategies', filters.strategy.join(','));
      if (filters.setup && filters.setup.length > 0) url.searchParams.set('setups', filters.setup.join(','));
      if (filters.pnlRange?.min !== '') url.searchParams.set('min_pnl', filters.pnlRange.min);
      if (filters.pnlRange?.max !== '') url.searchParams.set('max_pnl', filters.pnlRange.max);
      if (filters.rrRange?.min !== '') url.searchParams.set('min_rr', filters.rrRange.min);
      if (filters.rrRange?.max !== '') url.searchParams.set('max_rr', filters.rrRange.max);
      if (filters.importBatch && filters.importBatch.length > 0) url.searchParams.set('batch_ids', filters.importBatch.join(','));
      if (filters.timeOfDay && filters.timeOfDay.length > 0) url.searchParams.set('time_of_day', filters.timeOfDay.join(','));
      if (filters.dayOfWeek && filters.dayOfWeek.length > 0) url.searchParams.set('day_of_week', filters.dayOfWeek.join(','));
      if (filters.month && filters.month.length > 0) url.searchParams.set('month', filters.month.join(','));
      if (filters.year && filters.year.length > 0) url.searchParams.set('year', filters.year.join(','));
      if (filters.variables && Object.keys(filters.variables).length > 0) url.searchParams.set('variables', JSON.stringify(filters.variables));
      if (filters.variableCombinations?.enabled) url.searchParams.set('combine_vars', 'true');
      if (filters.variableCombinations?.level) url.searchParams.set('combination_level', filters.variableCombinations.level);
      if (filters.variableCombinations?.combinations && filters.variableCombinations.combinations.length > 0) {
        url.searchParams.set('combinations', JSON.stringify(filters.variableCombinations.combinations));
        console.log('🔍 useAnalyticsData: Applying combinations filter:', filters.variableCombinations.combinations);
      }
      
      console.log('📊 Fetching stats from:', url.toString());
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token.replace(/^"|"$/g, '')}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include cookies for session-based auth if needed
      });
      
      if (response.status === 401) {
        console.error('❌ Authentication failed. Token might be invalid or expired.');
        // Redirect to login or refresh token here if needed
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📥 Raw API response:', data);
      
      // Convert pnl_by_date from array of arrays to object if needed
      let pnlByDate = {};
      if (Array.isArray(data?.pnl_by_date)) {
        console.log('Converting pnl_by_date from array to object format');
        data.pnl_by_date.forEach(([date, pnl]) => {
          if (date) {
            pnlByDate[date] = pnl;
          }
        });
      } else if (data?.pnl_by_date && typeof data.pnl_by_date === 'object') {
        pnlByDate = data.pnl_by_date;
      }
      
      const processedData = {
        ...data,
        pnl_by_date: pnlByDate
      };
      
      console.log('📥 Processed stats data:', {
        hasTrades: !!processedData?.trades,
        tradesCount: processedData?.trades?.length || 0,
        pnlByDateType: Array.isArray(data.pnl_by_date) ? 'array' : 
                       (data.pnl_by_date ? 'object' : 'none'),
        pnlByDateCount: Object.keys(pnlByDate).length,
        samplePnlByDate: Object.entries(pnlByDate).slice(0, 3)
      });
      
      // Log a few sample trades for debugging
      if (processedData?.trades?.length > 0) {
        console.log('🔍 Sample trades:', processedData.trades.slice(0, 3).map(t => ({
          id: t.id,
          symbol: t.symbol,
          pnl: t.pnl,
          date: t.date || t.entry_date || t.timestamp || 'no-date',
          direction: t.direction
        })));
      }
      
      setStats(processedData);
      
      if (selectedBatch) {
        await fetchPerformanceData();
      }
    } catch (err) {
      console.error('❌ fetchStats error:', err);
      setError(err.message || 'Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatch, fetchPerformanceData, filters, activeProfile]);

  // Fetch import history on mount
  const fetchImportHistory = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const url = `${API_BASE_URL}/journal/import-history?profile_id=${activeProfile.id}`;
      const data = await fetchWithAuth(url);
      setImportHistory(data.history || []);
    } catch (err) {
      console.error('Error fetching import history:', err);
    }
  }, [activeProfile]);

  // Refetch performance data when filters change
  useEffect(() => {
    console.log('Filters changed, refetching performance data:', safeFilters);
    fetchPerformanceData();
  }, [safeFilters, fetchPerformanceData]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const calendarStats = useMemo(() => {
    console.log('Calculating calendar stats...');
    console.log('Stats:', stats);
    console.log('Performance Data:', performanceData);
    const dailyMap = new Map();
    const trades = [];

    // Get current date in local timezone for comparison
    const now = new Date();
    const todayKey = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`📅 Current local date key: ${todayKey}`);

    if (stats?.trades?.length) {
      console.log(`Found ${stats.trades.length} trades to process`);
      
      // Log sample of trades for debugging
      const sampleTrades = stats.trades.slice(0, 3);
      console.log('🔍 Sample trades:', sampleTrades);
      
      stats.trades.forEach(trade => {
        try {
          // Skip weekly/monthly summary data
          if (trade.is_week || trade.is_month) {
            console.log('Skipping weekly/monthly summary trade:', trade);
            return;
          }
          
          // Get the trade date from the most likely fields
          let tradeDate = trade.date || trade.entry_date || trade.timestamp || trade.created_at;
          let dateObj;
          let dateKey;
          
          // If no date is found, use current date
          if (!tradeDate) {
            console.warn('⚠️ Trade missing date field, using current date:', trade);
            dateObj = new Date();
            dateKey = dateObj.toISOString().split('T')[0];
          } else {
            // Parse the date
            dateObj = new Date(tradeDate);
            
            // Validate the date
            if (isNaN(dateObj.getTime())) {
              console.warn('⚠️ Invalid date in trade, using current date:', tradeDate, trade);
              dateObj = new Date();
              dateKey = dateObj.toISOString().split('T')[0];
            } else {
              // Format as YYYY-MM-DD using local timezone
              dateKey = dateObj.toLocaleDateString('en-CA');
            }
          }
          
          // Get PnL value, ensuring it's a number
          const pnl = typeof trade.pnl === 'number' ? trade.pnl : parseFloat(trade.pnl || 0) || 0;
          
          // Log date conversion for debugging
          console.log('Trade date conversion:', {
            originalDate: tradeDate,
            parsedDate: dateObj.toISOString(),
            localDate: dateKey,
            tradeId: trade.id || 'unknown'
          });
          
          // Initialize day in map if it doesn't exist
          if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, { 
              pnl: 0, 
              trades: 0, 
              date: dateKey,
              dateObj: new Date(dateKey) // Store Date object for sorting
            });
          }
          
          // Update day stats
          const dayStats = dailyMap.get(dateKey);
          dayStats.pnl += pnl;
          dayStats.trades += 1;
          
          // Add trade to trades array with consistent date format
          trades.push({
            ...trade,
            id: trade.id || `trade-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: dateObj.toISOString(),
            date: dateKey,
            entry_date: dateKey,
            pnl: pnl,
            direction: trade.direction || 'long' // Ensure direction has a default value
          });
          
          console.log(`✅ Processed trade ${trade.id || 'unknown'}:`, {
            originalDate: tradeDate,
            processedDate: dateKey,
            pnl: pnl,
            symbol: trade.symbol || 'unknown'
          });
        } catch (error) {
          console.error('Error processing trade:', error, trade);
        }
      });
    }

    // Don't include weekly performance in the main trades array
    // This prevents them from showing up in the calendar
    // Weekly summaries are handled separately in the performance components
    if (performanceData.weekly_performance?.length) {
      console.log('Skipping weekly performance data for calendar view');
    }

    if (performanceData.monthly_performance?.length) {
      performanceData.monthly_performance.forEach(month => {
        if (!month.month) return;
        trades.push({
          id: `month-${month.month}-${month.year || new Date().getFullYear()}`,
          timestamp: month.start_date || `${month.year}-${String(month.month).padStart(2, '0')}-01`,
          pnl: parseFloat(month.pnl || 0) || 0,
          win_rate: parseFloat(month.win_rate) || 0,
          trades_count: parseInt(month.trades) || 0,
          is_month: true,
          month: month.month,
          year: month.year,
          label: month.label || `${month.year}-${String(month.month).padStart(2, '0')}`
        });
      });
    }

    const pnlByDate = Object.fromEntries(
      Array.from(dailyMap.entries()).map(([date, stats]) => [date, stats.pnl])
    );

    return {
      pnl_by_date: pnlByDate,
      trades: trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    };
  }, [stats, performanceData]);

  // Function to fetch equity metrics
  const fetchEquityMetrics = useCallback(async () => {
    if (!activeProfile) return;
    const endpoint = `${API_BASE_URL}/journal/equities?profile_id=${activeProfile.id}`;
    console.log(`[Equity] Fetching equity metrics from ${endpoint}`);
    
    try {
      setEquityMetricsLoading(true);
      setEquityMetricsError('');
      
      const startTime = Date.now();
      const data = await fetchWithAuth(endpoint);
      const duration = Date.now() - startTime;
      
      console.log(`[Equity] Successfully fetched equity metrics in ${duration}ms`, data);
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      setEquityMetrics(data.metrics || {});
    } catch (err) {
      console.error('❌ Failed to load equity metrics:', {
        error: err,
        message: err.message,
        stack: err.stack,
        endpoint
      });
      
      // Provide more specific error message
      let errorMessage = 'Failed to load equity metrics. Some statistics may be unavailable.';
      if (err.message.includes('NetworkError')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (err.message.includes('401')) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (err.message.includes('404')) {
        errorMessage = 'Equity metrics endpoint not found. Please check the backend service.';
      }
      
      setEquityMetricsError(errorMessage);
      setEquityMetrics({});
    } finally {
      setEquityMetricsLoading(false);
    }
  }, [activeProfile]);

  // Fetch equity metrics on mount and set up auto-refresh
  useEffect(() => {
    fetchEquityMetrics();
    
    const interval = setInterval(fetchEquityMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchEquityMetrics]);

  // Main data fetching effect
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setPerformanceLoading(true);
      setError('');
      setPerformanceError('');

      try {
        // Fetch stats and performance data in parallel
        await Promise.all([fetchStats(), fetchPerformanceData()]);
      } catch (err) {
        console.error('Error fetching initial analytics data:', err);
        setError('Failed to load primary analytics data.');
      } finally {
        // Loading states are managed inside individual fetch functions
      }
    };

    fetchAllData();
  }, [safeFilters, fetchStats, fetchPerformanceData]);


  return {
    loading,
    error,
    stats: {
      ...stats,
      ...calendarStats,
      equity_metrics: equityMetrics
    },
    performanceData,
    performanceLoading,
    performanceError,
    equityMetrics,
    equityMetricsLoading,
    equityMetricsError,
    importHistory,
    selectedBatch,
    setSelectedBatch,
    referenceDate,
    setReferenceDate,
    refreshPerformanceData,
    refreshStats: fetchStats,
    refreshEquityMetrics: fetchEquityMetrics
  };
}
