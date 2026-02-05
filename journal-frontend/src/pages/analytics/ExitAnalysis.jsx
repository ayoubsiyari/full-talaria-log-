import React, { useState, useEffect, useCallback } from 'react';
import { useFilter } from '../../context/FilterContext';
import { Info, RefreshCw } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
  ReferenceLine,
} from 'recharts';
import { fetchWithAuth } from '../../utils/fetchUtils';

const StatCard = ({ title, value, tooltip }) => (
  <div className="bg-white border border-blue-200/60 rounded-xl p-6 text-center h-full flex flex-col justify-center">
    <div className="flex items-center justify-center mb-2">
      <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wider">{title}</h4>
      {tooltip && (
        <div className="ml-1 group relative">
          <Info size={16} className="text-slate-400 cursor-pointer" />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      )}
    </div>
    <p className="text-2xl font-bold text-[#040028] leading-none">{value}</p>
  </div>
);

const ExitAnalysis = () => {
  const { filters } = useFilter();
  const safeFilters = filters || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('all');
  const [calcMode, setCalcMode] = useState('average');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      queryParams.append('timeframe', timeframe);
      queryParams.append('mode', calcMode);
      
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
      
      const url = `/api/journal/exit-analysis-summary?${queryParams.toString()}`;
      console.log('ExitAnalysis: Fetching with filters:', url);
      
      const result = await fetchWithAuth(url);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeframe, calcMode, filters]);

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

  if (!data || !data.chart_data || data.chart_data.length === 0) {
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
                  No exit analysis data available for the current filters.
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

  const { chart_data, summary_stats } = data;

  const formattedChartData = chart_data.map((trade, index) => {
    console.log('Trade data:', { index, trade, hasSymbol: !!trade.symbol, hasTicker: !!trade.ticker });
    return {
      ...trade,
      name: `${index + 1}`,
      // For diverging bars from center: positive updraw, negative drawdown
      updraw: trade.updraw > 0 ? trade.updraw : 0,
      drawdown: trade.drawdown < 0 ? trade.drawdown : 0,
      exitY: trade.exit,
      // Ensure symbol is included in the data
      symbol: trade.symbol || trade.ticker || ''
    };
  });

  // Log the first trade's data structure
  if (formattedChartData.length > 0) {
    console.log('First trade data structure:', formattedChartData[0]);
  }

  const allValues = chart_data.flatMap(d => [d.updraw, d.drawdown, d.exit]);
  const yMax = Math.ceil(Math.max(...allValues, 0) / 25) * 25 || 50;
  const yMin = Math.floor(Math.min(...allValues, 0) / 25) * 25 || -50;

  const avgUpdrawWinner = summary_stats.avg_updraw_winner;
  const avgDrawdownLoser = summary_stats.avg_drawdown_loser;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#040028] mb-2">
              Exit Analysis Summary
            </h1>
            <p className="text-slate-600">
              Analyze your trade exit patterns and performance
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Calculation Mode Toggle */}
            <div className="bg-slate-100 rounded-lg p-1">
              <div className="flex">
                <button
                  onClick={() => setCalcMode('average')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    calcMode === 'average'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Average
                </button>
                <button
                  onClick={() => setCalcMode('median')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    calcMode === 'median'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Median
                </button>
              </div>
            </div>
            
            
          </div>
        </div>

        {/* Chart Container */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <h2 className="text-xl font-bold text-[#040028]">Exit Analysis Chart</h2>
            <p className="text-sm text-slate-600 mt-1">
              Visual representation of trade updraw, drawdown, and exit points
            </p>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={formattedChartData}
            margin={{
              top: 20,
              right: 40,
              left: 20,
              bottom: 5,
            }}
            barSize={25}
            barGap={-25}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="name" 
              label={{ value: 'Trades', position: 'insideBottom', offset: -5 }}
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
              tickLine={{ stroke: '#64748b', strokeWidth: 1 }}
            />
            <YAxis 
              label={{ value: 'Updraw / Drawdown (%)', angle: -90, position: 'insideLeft' }}
              domain={[yMin, yMax]} 
              tickFormatter={(tick) => `${tick}%`}
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
              tickLine={{ stroke: '#64748b', strokeWidth: 1 }}
            />
            <ReferenceLine
              y={100}
              label={{
                value: 'TP',
                position: 'right',
                fill: '#64748b',
                fontSize: 11,
                dx: 10
              }}
              stroke="#10B981"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={-100}
              label={{
                value: 'SL',
                position: 'right',
                fill: '#64748b',
                fontSize: 11,
                dx: 10
              }}
              stroke="#EF4444"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <Tooltip
              formatter={(value, name) => [`${value.toFixed(2)}%`, name]}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                
                const data = payload[0].payload;
                return (
                  <div style={{
                    backgroundColor: 'white',
                    border: '1px solid rgb(35, 36, 37)',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ 
                      fontWeight: 600, 
                      marginBottom: '8px',
                      color: '#040028',
                      fontSize: '13px',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: '4px'
                    }}>
                      {`Trade ${label}${data.symbol ? ` (${data.symbol})` : ''}`}
                    </div>
                    {payload.map((entry, i) => (
                      <div key={`item-${i}`} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        margin: '4px 0',
                        color: entry.color,
                        fontSize: '12px'
                      }}>
                        <span>{entry.name}:</span>
                        <span style={{ marginLeft: '10px', color: '#040028' }}>
                          {entry.value.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
              contentStyle={{
                backgroundColor: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: 0
              }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
            {avgUpdrawWinner > 0 && (
              <ReferenceLine
                y={avgUpdrawWinner}
                stroke="#22c55e"
                strokeWidth={1}
                strokeDasharray="2 2"
                label={{
                  value: `${calcMode === 'average' ? 'Avg' : 'Median'} Win: ${avgUpdrawWinner.toFixed(1)}%`,
                  position: 'right',
                  fill: '#6b7280',
                  fontSize: 10,
                  dx: 10
                }}
              />
            )}
            {avgDrawdownLoser < 0 && (
              <ReferenceLine
                y={avgDrawdownLoser}
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="2 2"
                label={{
                  value: `${calcMode === 'average' ? 'Avg' : 'Median'} Loss: ${avgDrawdownLoser.toFixed(1)}%`,
                  position: 'right',
                  fill: '#6b7280',
                  fontSize: 10,
                  dx: 10
                }}
              />
            )}

            <Bar 
              dataKey="updraw" 
              fill="#10B981" 
              name="Updraw"
              radius={[2, 2, 0, 0]}
              stroke="#059669"
              strokeWidth={0.5}
            />
            <Bar 
              dataKey="drawdown" 
              fill="#EF4444" 
              name="Drawdown"
              radius={[0, 0, 2, 2]}
              stroke="#DC2626"
              strokeWidth={0.5}
            />
            <Scatter 
              dataKey="exitY" 
              fill="#040028" 
              shape="circle"
              name="Exit Point"
              r={4}
              stroke="#ffffff"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Trades Hit TP" 
            value={`${summary_stats.trades_hit_tp.toFixed(2)}%`} 
            tooltip="Percentage of trades that reached their take-profit target."
          />
          <StatCard 
            title="Trades Hit SL" 
            value={`${summary_stats.trades_hit_sl.toFixed(2)}%`}
            tooltip="Percentage of trades that reached their stop-loss target."
          />
          <StatCard 
            title="Avg. Updraw Winner" 
            value={`${summary_stats.avg_updraw_winner.toFixed(2)}%`}
            tooltip="Average maximum potential profit on winning trades."
          />
          <StatCard 
            title="Avg. Updraw Loser" 
            value={`${summary_stats.avg_updraw_loser.toFixed(2)}%`}
            tooltip="Average maximum potential profit on losing trades."
          />
          <StatCard 
            title="Avg. Drawdown Winner" 
            value={`${summary_stats.avg_drawdown_winner.toFixed(2)}%`}
            tooltip="Average maximum adverse excursion on winning trades."
          />
          <StatCard 
            title="Avg. Drawdown Loser" 
            value={`${summary_stats.avg_drawdown_loser.toFixed(2)}%`}
            tooltip="Average maximum adverse excursion on losing trades."
          />
          <StatCard 
            title="Avg. Exit Winner" 
            value={`${summary_stats.avg_exit_winner.toFixed(2)}%`}
            tooltip="Average exit profit percentage for winning trades."
          />
          <StatCard 
            title="Avg. Exit Loser" 
            value={`${summary_stats.avg_exit_loser.toFixed(2)}%`}
            tooltip="Average exit loss percentage for losing trades."
          />
        </div>
      </div>
    </div>
  );
};

export default ExitAnalysis;