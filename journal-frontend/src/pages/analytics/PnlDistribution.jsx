import React, { useState, useEffect, useCallback } from 'react';
import { useFilter } from '../../context/FilterContext';
import { RefreshCw } from 'lucide-react';
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

const CustomTooltip = ({ active, payload, label, timeframe }) => {
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

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg">
        {labelContent}
        <div className="border-t border-slate-200 my-2"></div>
        <div className="flex items-center gap-2">
          <div className={`font-bold text-lg ${data.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {`${data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}`}
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
            data.pnl >= 0 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {data.pnl >= 0 ? 'Profit' : 'Loss'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

const PnlDistribution = () => {
  const { filters } = useFilter();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('daily');
  const [positiveAveragePnl, setPositiveAveragePnl] = useState(0);
  const [negativeAveragePnl, setNegativeAveragePnl] = useState(0);
  const [positiveMedianPnl, setPositiveMedianPnl] = useState(0);
  const [negativeMedianPnl, setNegativeMedianPnl] = useState(0);
  const [statLine, setStatLine] = useState('average');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('PnlDistribution: Starting data fetch...');
      console.log('PnlDistribution: Current filters:', filters);
      console.log('PnlDistribution: Current timeframe:', timeframe);
      console.log('PnlDistribution: API_BASE_URL:', API_BASE_URL);
      
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
        console.log('PnlDistribution: Variables filter:', filters.variables);
        queryParams.append('variables', JSON.stringify(filters.variables));
      }
      
      const url = `${API_BASE_URL}/journal/pnl-distribution?${queryParams.toString()}`;
      console.log('PnlDistribution: Fetching with URL:', url);
      console.log('PnlDistribution: Query parameters:', queryParams.toString());
      
      const result = await fetchWithAuth(url);
      console.log('PnlDistribution: Received result:', result);
      
      if (!result) {
        throw new Error('No data received from server');
      }
      
      setData(result);

      if (result && result.pnl_data) {
        const pnls = result.pnl_data.map(d => d.pnl);
        const positivePnls = pnls.filter(pnl => pnl > 0);
        const negativePnls = pnls.filter(pnl => pnl < 0);

        // Calculate Averages
        setPositiveAveragePnl(positivePnls.length > 0 ? positivePnls.reduce((a, b) => a + b, 0) / positivePnls.length : 0);
        setNegativeAveragePnl(negativePnls.length > 0 ? negativePnls.reduce((a, b) => a + b, 0) / negativePnls.length : 0);

        // Calculate Medians
        const calculateMedian = (arr) => {
          if (arr.length === 0) return 0;
          const sorted = [...arr].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        setPositiveMedianPnl(calculateMedian(positivePnls));
        setNegativeMedianPnl(calculateMedian(negativePnls));
      }
    } catch (err) {
      console.error('PnlDistribution: Error fetching data:', err);
      setError(err.message || 'Failed to load P&L distribution data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [timeframe, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
                  No P&L distribution data available for the current filters.
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
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600 mb-2">
              P&L Returns Distribution
            </h1>
            <p className="text-slate-600">
              Track your trading performance over time
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

        {/* Chart Container */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <h2 className="text-xl font-bold text-[#040028]">P&L Distribution Chart</h2>
            <p className="text-sm text-slate-600 mt-1">
              Visual representation of profit and loss distribution over time
            </p>
          </div>
          <div className="p-6">
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
            <Tooltip content={<CustomTooltip timeframe={timeframe} />} />
            <Legend 
              wrapperStyle={{ 
                paddingTop: '20px', 
                fontWeight: 600,
                color: '#64748b'
              }}
            />
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
            {statLine === 'average' && positiveAveragePnl > 0 && (
              <ReferenceLine 
                y={positiveAveragePnl} 
                label={{ 
                  value: `Positive Avg: ${positiveAveragePnl.toFixed(2)}`, 
                  position: 'insideTopRight',
                  style: { fontWeight: 600, fill: '#000403' }
                }} 
                stroke="#10B981" 
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            )}
            {statLine === 'average' && negativeAveragePnl < 0 && (
              <ReferenceLine 
                y={negativeAveragePnl} 
                label={{ 
                  value: `Negative Avg: ${negativeAveragePnl.toFixed(2)}`, 
                  position: 'insideTopRight',
                  style: { fontWeight: 600, fill: '#000403' }
                }} 
                stroke="#EF4444" 
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            )}
            {statLine === 'median' && positiveMedianPnl > 0 && (
              <ReferenceLine 
                y={positiveMedianPnl} 
                label={{ 
                  value: `Positive Median: ${positiveMedianPnl.toFixed(2)}`, 
                  position: 'insideTopRight',
                  style: { fontWeight: 600, fill: '#000403' }
                }} 
                stroke="#10B981" 
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            )}
            {statLine === 'median' && negativeMedianPnl < 0 && (
              <ReferenceLine 
                y={negativeMedianPnl} 
                label={{ 
                  value: `Negative Median: ${negativeMedianPnl.toFixed(2)}`, 
                  position: 'insideTopRight',
                  style: { fontWeight: 600, fill: '#000403' }
                }} 
                stroke="#EF4444" 
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            )}
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
      </div>
    </div>
  );
};

export default PnlDistribution;