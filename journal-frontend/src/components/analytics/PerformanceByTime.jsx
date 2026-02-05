import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  CartesianGrid
} from 'recharts';
import { Clock, Loader2 } from 'lucide-react';

const PerformanceByTime = ({ hourlyPerformance = [], loading = false }) => {
  // Process the hourly performance data for the chart
  const chartData = useMemo(() => {
    if (!hourlyPerformance || hourlyPerformance.length === 0) {
      return [];
    }
    
    // Sort by hour and format the data
    return [...hourlyPerformance]
      .sort((a, b) => a.hour - b.hour)
      .map(hourData => ({
        hour: `${hourData.hour % 12 === 0 ? 12 : hourData.hour % 12} ${hourData.hour >= 12 ? 'PM' : 'AM'}`,
        pnl: hourData.pnl || 0,
        trades: hourData.trades || 0,
        winRate: hourData.win_rate || 0,
        hourNumber: hourData.hour
      }));
  }, [hourlyPerformance]);
  
  // Find the best performing hour
  const bestHour = useMemo(() => {
    if (!hourlyPerformance || hourlyPerformance.length === 0) return null;
    
    return hourlyPerformance.reduce((best, current) => {
      return (current.pnl > (best?.pnl || -Infinity)) ? current : best;
    }, null);
  }, [hourlyPerformance]);
  
  // Format time range for display
  const formatTimeRange = (hour) => {
    if (hour === null || hour === undefined) return 'N/A';
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    const nextHour = (hour + 1) % 24;
    const nextPeriod = nextHour >= 12 ? 'PM' : 'AM';
    const displayNextHour = nextHour % 12 || 12;
    
    return `${displayHour}:00 ${period} - ${displayNextHour}:00 ${nextPeriod}`;
  };
  
  // Calculate average PnL per trade for the best hour
  const avgPnlPerTrade = bestHour 
    ? bestHour.trades > 0 
      ? (bestHour.pnl / bestHour.trades)
      : 0
    : 0;

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-blue-200/60 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-[#040028]">Performance by Time of Day</h3>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Loading...
            </span>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse w-full h-full bg-slate-100 rounded-lg"></div>
        </div>
      </div>
    );
  }
  
  // No data state
  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-blue-200/60 p-6">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-slate-600 mb-2">No performance data available</p>
          <p className="text-sm text-slate-500">Trade during different hours to see performance metrics</p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
          <p className="font-semibold text-[#040028]">{label}</p>
          <p className="text-sm">
            <span className="text-slate-600">P&L: </span>
            <span className={data.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>
              {data.pnl >= 0 ? '+' : ''}{data.pnl.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
            </span>
          </p>
          <p className="text-sm text-slate-600">
            {data.trades} {data.trades === 1 ? 'Trade' : 'Trades'}
          </p>
          {data.winRate > 0 && (
            <p className="text-sm text-slate-600">
              {data.winRate.toFixed(1)}% Win Rate
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200/60 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[#040028]">Performance by Time of Day</h3>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Clock className="mr-1.5 h-3 w-3" />
            24-Hour View
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            barCategoryGap={4}
          >
            <defs>
              <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              width={40}
              tickFormatter={(value) => `$${value}`}
            />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}
              background={{ fill: 'transparent' }}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.pnl >= 0 ? 'url(#positiveGradient)' : 'url(#negativeGradient)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {bestHour && (
        <div className="mt-6 pt-6 border-t border-blue-200/60">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Best Performing Hour</p>
              <p className="text-lg font-semibold text-[#10B981]">
                {formatTimeRange(bestHour.hour)}
              </p>
              <p className="text-sm text-slate-600">
                {bestHour.pnl >= 0 ? '+' : ''}{bestHour.pnl.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} P&L
              </p>
            </div>
            <div className="text-right sm:text-left">
              <p className="text-sm font-medium text-slate-600">Win Rate</p>
              <p className="text-lg font-semibold text-[#10B981]">
                {bestHour.win_rate ? bestHour.win_rate.toFixed(1) + '%' : 'N/A'}
              </p>
              <p className="text-sm text-slate-600">
                {bestHour.trades} {bestHour.trades === 1 ? 'Trade' : 'Trades'}
              </p>
            </div>
            <div className="text-right sm:text-left">
              <p className="text-sm font-medium text-slate-600">Avg. P&L per Trade</p>
              <p className={`text-lg font-semibold ${avgPnlPerTrade >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {avgPnlPerTrade >= 0 ? '+' : ''}{avgPnlPerTrade.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
              </p>
              <p className="text-sm text-slate-600">
                {bestHour.avg_win ? `Avg. Win: $${bestHour.avg_win.toFixed(2)}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceByTime;
