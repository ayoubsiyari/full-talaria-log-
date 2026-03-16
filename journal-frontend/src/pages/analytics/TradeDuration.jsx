import React, { useState, useEffect, useCallback } from 'react';
import { useFilter } from '../../context/FilterContext';
import { useProfile } from '../../context/ProfileContext';
import { Info, RefreshCw, HelpCircle, Clock, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
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
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { fetchWithAuth } from '../../utils/fetchUtils';

// Helper function to calculate average and median win rates
const calculateStats = (winRates) => {
  if (!winRates || winRates.length === 0) return { average: 0, median: 0 };
  
  const rates = winRates
    .map(item => item?.win_rate)
    .filter(rate => !isNaN(rate) && rate !== null && rate !== undefined);
    
  if (rates.length === 0) return { average: 0, median: 0 };
  
  // Calculate average
  const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  
  // Calculate median
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
    
  return { average, median };
};

const TradeDuration = () => {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
  const safeFilters = filters || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('all');
  const [direction, setDirection] = useState('all');
  const [winRateStats, setWinRateStats] = useState({ average: 0, median: 0 });
  const [perfStats, setPerfStats] = useState({ average: 0, median: 0 });
  const [countStats, setCountStats] = useState({ average: 0, median: 0 });

  // Update all stats whenever data changes
  useEffect(() => {
    if (data) {
      if (data.win_rate_by_duration) {
        setWinRateStats(calculateStats(data.win_rate_by_duration));
      }
      if (data.performance_by_duration) {
        const perfData = data.performance_by_duration.map(p => ({ win_rate: p.pnl }));
        setPerfStats(calculateStats(perfData));
      }
      if (data.count_by_duration) {
        const countData = data.count_by_duration.map(c => ({ win_rate: c.count }));
        setCountStats(calculateStats(countData));
      }
    }
  }, [data]);
  const fetchData = useCallback(async () => {
    if (!activeProfile) {
      setError('No profile selected. Please select a profile to view analytics.');
      setLoading(false);
      setData(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 TradeDuration: Starting fetchData for profile:', activeProfile.id);
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      queryParams.append('profile_id', activeProfile.id);
      queryParams.append('timeframe', timeframe);
      queryParams.append('direction', direction);
      
      // Add filter parameters
      if (safeFilters.dateRange?.start) queryParams.append('from_date', safeFilters.dateRange.start);
      if (safeFilters.dateRange?.end) queryParams.append('to_date', safeFilters.dateRange.end);
      if (safeFilters.symbol && safeFilters.symbol.length > 0) queryParams.append('symbols', safeFilters.symbol.join(','));
      if (safeFilters.direction && safeFilters.direction.length > 0) queryParams.append('directions', safeFilters.direction.join(','));
      if (safeFilters.strategy && safeFilters.strategy.length > 0) queryParams.append('strategies', safeFilters.strategy.join(','));
      if (safeFilters.setup && safeFilters.setup.length > 0) queryParams.append('setups', safeFilters.setup.join(','));
      if (safeFilters.pnlRange?.min !== '') queryParams.append('min_pnl', safeFilters.pnlRange.min);
      if (safeFilters.pnlRange?.max !== '') queryParams.append('max_pnl', safeFilters.pnlRange.max);
      if (safeFilters.rrRange?.min !== '') queryParams.append('min_rr', safeFilters.rrRange.min);
      if (safeFilters.rrRange?.max !== '') queryParams.append('max_rr', safeFilters.rrRange.max);
      if (safeFilters.importBatch && safeFilters.importBatch.length > 0) queryParams.append('batch_ids', safeFilters.importBatch.join(','));
      if (safeFilters.timeOfDay && safeFilters.timeOfDay.length > 0) queryParams.append('time_of_day', safeFilters.timeOfDay.join(','));
      if (safeFilters.dayOfWeek && safeFilters.dayOfWeek.length > 0) queryParams.append('day_of_week', safeFilters.dayOfWeek.join(','));
      if (safeFilters.month && safeFilters.month.length > 0) queryParams.append('month', safeFilters.month.join(','));
      if (safeFilters.year && safeFilters.year.length > 0) queryParams.append('year', safeFilters.year.join(','));
      if (safeFilters.variables && Object.keys(safeFilters.variables).length > 0) queryParams.append('variables', JSON.stringify(safeFilters.variables));

      const url = `/api/journal/trade-duration-analysis?${queryParams.toString()}`;
      console.log('TradeDuration: Fetching with filters:', url);
      
      const result = await fetchWithAuth(url);
      console.log('TradeDuration: API Response:', result);
      
      // Clean and validate the data before setting it
      if (result && result.success && result.data) {
        console.log('TradeDuration: Processing data...');
        const responseData = result.data;
        
        const performanceMap = new Map(responseData.performance_by_duration.map(d => [d.duration, d.pnl]));

        const mergedCountData = responseData.count_by_duration.map(d => ({
          ...d,
          pnl: performanceMap.get(d.duration) || 0,
        }));

        const cleanedData = {
          ...responseData,
          count_by_duration: mergedCountData,
          win_rate_by_duration: responseData.win_rate_by_duration || [],
          total_trades: isNaN(responseData.total_trades) ? 0 : (responseData.total_trades || 0),
          total_pnl: isNaN(responseData.total_pnl) ? 0 : (responseData.total_pnl || 0),
          overall_win_rate: isNaN(responseData.overall_win_rate) ? 0 : (responseData.overall_win_rate || 0),
        };
        
        console.log('TradeDuration: Cleaned and merged data:', cleanedData);
        setData(cleanedData);
      } else {
        console.log('TradeDuration: No data in response');
        setData(null); // Set to null when no data is received
      }
    } catch (err) {
      console.error('TradeDuration: Fetch error:', err);
      setError(err.message || 'Failed to fetch trade duration data.');
    } finally {
      setLoading(false);
    }
  }, [safeFilters, timeframe, direction, activeProfile]);

  useEffect(() => {
    if (activeProfile) {
      fetchData();
    } else {
      // Clear data and show message when no profile is selected
      setData(null);
      setLoading(false);
      setError('No profile selected. Please select a profile to view analytics.');
    }
  }, [fetchData, activeProfile]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '$0';
    }
    if (value === 0) return '$0';
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.0%';
    }
    return `${value.toFixed(1)}%`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const pnlValue = payload.find(p => p.dataKey === 'pnl')?.value;
      const winRateValue = payload.find(p => p.dataKey === 'win_rate')?.value;
      
      let headerColor = 'text-theme-text-primary-light dark:text-theme-text-primary-dark';
      if (pnlValue !== undefined) {
        headerColor = pnlValue >= 0 ? 'text-emerald-500' : 'text-rose-500';
      } else if (winRateValue !== undefined) {
        headerColor = winRateValue >= 50 ? 'text-emerald-500' : 'text-rose-500';
      }

      return (
        <div className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-3 border border-theme-divider-light dark:border-theme-divider-dark rounded-lg shadow-lg text-theme-text-secondary-light dark:text-theme-text-secondary-dark">
          <p className={`font-bold text-lg ${headerColor}`}>{label}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry, index) => {
              let valueColor = 'text-theme-text-primary-light dark:text-theme-text-primary-dark';
              if (entry.dataKey === 'pnl') {
                valueColor = entry.value >= 0 ? 'text-emerald-500' : 'text-rose-500';
              } else if (entry.dataKey === 'win_rate') {
                valueColor = entry.value >= 50 ? 'text-emerald-500' : 'text-rose-500';
              } else if (entry.dataKey === 'count') {
                valueColor = 'text-primary';
              }

              return (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-theme-text-secondary-light dark:text-theme-text-secondary-dark">{entry.name}:</span>
                  <span className={`font-semibold ${valueColor}`}>
                    {entry.name === 'P&L' ? formatCurrency(entry.value) : 
                     entry.name === 'Win Rate' ? formatPercent(entry.value) : 
                     entry.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="w-full px-6 py-4 space-y-6">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="w-full px-6 py-4">
          <div className="bg-red-900 border border-red-700 rounded-lg p-4">
            <p className="text-red-200">Error loading trade duration data: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-slate-100 dark:bg-theme-bg-dark text-slate-800 dark:text-theme-text-primary-dark min-h-screen">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-theme-text-primary-dark">Trade Duration Analysis</h1>
              <p className="text-slate-600 dark:text-theme-text-secondary-dark">Analyze your performance based on how long you hold your trades.</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-theme-divider-dark text-slate-800 dark:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-900/20 border border-rose-500 text-rose-300 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-96 text-theme-text-secondary-light dark:text-theme-text-secondary-dark">
            <RefreshCw className="h-8 w-8 animate-spin mr-4" />
            <span className="text-lg">Loading Analytics...</span>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center justify-center h-96 bg-theme-card-bg-light dark:bg-theme-card-bg-dark rounded-xl p-8 border border-theme-divider-light dark:border-theme-divider-dark">
            <HelpCircle className="h-12 w-12 text-theme-text-secondary-light dark:text-theme-text-secondary-dark mb-4" />
            <h3 className="text-xl font-semibold text-theme-text-primary-light dark:text-theme-text-primary-dark">No Data Available</h3>
            <p className="text-theme-text-secondary-light dark:text-theme-text-secondary-dark mt-2">There is no trade data to analyze for the selected profile and filters.</p>
            <p className="text-sm mt-1">Try adjusting your filters or selecting a different profile.</p>
          </div>
        )}

        {data && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-primary hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out p-5 shadow-md">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 dark:bg-primary/20 rounded-lg">
                    <TrendingUp className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-theme-text-secondary-light dark:text-theme-text-secondary-dark">Total Trades</p>
                    <p className="text-2xl font-bold text-theme-text-primary-light dark:text-theme-text-primary-dark">{data.total_trades}</p>
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-emerald-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out p-5 shadow-md">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${data.total_pnl >= 0 ? 'bg-emerald-500/10 dark:bg-emerald-500/20' : 'bg-rose-500/10 dark:bg-rose-500/20'}`}>
                    <TrendingUp className={`h-7 w-7 ${data.total_pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-theme-text-secondary-light dark:text-theme-text-secondary-dark">Total P&L</p>
                    <p className={`text-2xl font-bold ${data.total_pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {formatCurrency(data.total_pnl)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-emerald-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out p-5 shadow-md">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${data.overall_win_rate >= 50 ? 'bg-emerald-500/10 dark:bg-emerald-500/20' : 'bg-rose-500/10 dark:bg-rose-500/20'}`}>
                    <TrendingUp className={`h-7 w-7 ${data.overall_win_rate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-theme-text-secondary-light dark:text-theme-text-secondary-dark">Overall Win Rate</p>
                    <p className={`text-2xl font-bold ${data.overall_win_rate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {formatPercent(data.overall_win_rate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Performance By Trade Duration Chart (Full Width) */}
              <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-primary/50 hover:shadow-lg transition-all duration-300 ease-out p-6 shadow-md">
                <h3 className="text-lg font-semibold text-theme-text-primary-light dark:text-theme-text-primary-dark mb-4">Performance By Trade Duration</h3>
                <div className="h-72">
                  {data?.performance_by_duration && data.performance_by_duration.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.performance_by_duration} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-theme-divider-dark" />
                        <XAxis type="number" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} domain={['dataMin', 'dataMax']} tickFormatter={formatCurrency} />
                        <YAxis dataKey="duration" type="category" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} width={120} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke="#cbd5e0" className="dark:stroke-slate-600" />
                        
                        <Legend 
                          wrapperStyle={{ paddingTop: '10px' }}
                          payload={[
                            { value: 'P&L', type: 'rect', color: '#10b981' },
                            { value: `Median (${formatCurrency(perfStats.median)})`, type: 'line', color: '#FF6B6B' },
                            { value: `Average (${formatCurrency(perfStats.average)})`, type: 'line', color: '#4ECDC4' }
                          ]} 
                        />
                        <Bar dataKey="pnl" name="P&L" radius={[0, 15, 15, 0]}>
                          {data.performance_by_duration.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                        <ReferenceLine 
                          x={perfStats.median} 
                          stroke="#FF6B6B" 
                          strokeDasharray="4 2"
                          label={{
                            value: `Median: ${formatCurrency(perfStats.median)}`,
                            position: 'right',
                            fill: '#FF6B6B',
                            fontSize: 12
                          }}
                        />
                        <ReferenceLine 
                          x={perfStats.average} 
                          stroke="#4ECDC4" 
                          strokeDasharray="2 2"
                          label={{
                            value: `Avg: ${formatCurrency(perfStats.average)}`,
                            position: 'right',
                            fill: '#4ECDC4',
                            fontSize: 12,
                            dy: 20
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-theme-text-secondary-light dark:text-theme-text-secondary-dark">No performance data available</div>
                  )}
                </div>
              </div>

              {/* Bottom row with two charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Trade Count By Trade Duration Chart */}
                <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-primary/50 hover:shadow-lg transition-all duration-300 ease-out p-6 shadow-md">
                  <h3 className="text-lg font-semibold text-theme-text-primary-light dark:text-theme-text-primary-dark mb-4">Trade Count By Trade Duration</h3>
                  <div className="h-72">
                    {data?.count_by_duration && data.count_by_duration.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.count_by_duration} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-theme-divider-dark" />
                          <XAxis type="number" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} />
                          <YAxis dataKey="duration" type="category" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} width={120} />
                          <Tooltip content={<CustomTooltip />} />
                          
                          <Legend 
                            wrapperStyle={{ paddingTop: '10px' }}
                            payload={[
                              { value: 'Trade Count', type: 'rect', color: '#3090FF' },
                              { value: `Median (${Math.round(countStats.median)})`, type: 'line', color: '#FF6B6B' },
                              { value: `Avg (${countStats.average.toFixed(1)})`, type: 'line', color: '#4ECDC4' }
                            ]} 
                          />
                          <Bar dataKey="count" name="Trade Count" radius={[0, 15, 15, 0]}>
                            {data.count_by_duration.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill="#3090FF" />
                            ))}
                          </Bar>
                          <ReferenceLine 
                            x={countStats.median} 
                            stroke="#FF6B6B" 
                            strokeDasharray="4 2"
                            label={{
                              value: `Median: ${Math.round(countStats.median)}`,
                              position: 'right',
                              fill: '#FF6B6B',
                              fontSize: 12
                            }}
                          />
                          <ReferenceLine 
                            x={countStats.average} 
                            stroke="#4ECDC4" 
                            strokeDasharray="2 2"
                            label={{
                              value: `Avg: ${countStats.average.toFixed(1)}`,
                              position: 'right',
                              fill: '#4ECDC4',
                              fontSize: 12,
                              dy: 20
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-theme-text-secondary-light dark:text-theme-text-secondary-dark">No trade count data available</div>
                    )}
                  </div>
                </div>

                {/* Win Rate By Trade Duration Chart */}
                <div className="group relative overflow-hidden rounded-xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark border border-theme-divider-light dark:border-theme-divider-dark hover:border-primary/50 hover:shadow-lg transition-all duration-300 ease-out p-6 shadow-md">
                  <h3 className="text-lg font-semibold text-theme-text-primary-light dark:text-theme-text-primary-dark mb-4">Win Rate By Trade Duration</h3>
                  <div className="h-72">
                    {data?.win_rate_by_duration && data.win_rate_by_duration.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.win_rate_by_duration} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                           
                          
                          
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-theme-divider-dark" />
                          <XAxis type="number" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                          <YAxis dataKey="duration" type="category" stroke="#718096" className="dark:stroke-theme-text-secondary-dark" fontSize={12} width={120} />
                          <Tooltip content={<CustomTooltip />} />
                         
                          <Legend 
                            wrapperStyle={{ paddingTop: '10px' }}
                            payload={[
                              { value: 'Win Rate', type: 'rect', color: '#10b981' },
                              { value: `Overall (${formatPercent(data.overall_win_rate)})`, type: 'line', color: '#3090FF' },
                              { value: `Median (${formatPercent(winRateStats.median)})`, type: 'line', color: '#FF6B6B' },
                              { value: `Average (${formatPercent(winRateStats.average)})`, type: 'line', color: '#4ECDC4' }
                            ]} 
                          />
                          <Bar dataKey="win_rate" name="Win Rate" radius={[0, 15, 15, 0]}>
                            {data.win_rate_by_duration.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.win_rate >= 50 ? '#10b981' : '#ef4444'} />
                            ))}
                          </Bar>
                          <ReferenceLine 
                            x={winRateStats.average} 
                            stroke="#4ECDC4" 
                            strokeDasharray="2 2"
                            label={{ 
                              value: `Avg: ${formatPercent(winRateStats.average)}`, 
                              position: 'insideTopRight', 
                              fill: '#4ECDC4',
                              fontSize: 12,
                              dy: 40
                            }} 
                          />
                          <ReferenceLine 
                            x={winRateStats.median} 
                            stroke="#FF6B6B" 
                            strokeDasharray="4 2" 
                            label={{ 
                              value: `Median: ${formatPercent(winRateStats.median)}`, 
                              position: 'insideTopRight', 
                              fill: '#FF6B6B',
                              fontSize: 12,
                              dy: 20
                            }} 
                          />
                          <ReferenceLine 
                            x={data.overall_win_rate} 
                            stroke="#3090FF" 
                            strokeDasharray="3 3" 
                            label={{ 
                              value: `Overall: ${formatPercent(data.overall_win_rate)}`, 
                              position: 'insideTopRight', 
                              fill: '#3090FF',
                              fontSize: 12
                            }} 
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-theme-text-secondary-light dark:text-theme-text-secondary-dark">No win rate data available</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TradeDuration;