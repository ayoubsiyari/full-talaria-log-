import React, { useMemo, useState } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  CartesianGrid,
  LabelList
} from 'recharts';
import { Calendar, Loader2, TrendingUp, BarChart3, Target, Clock, CalendarDays, CalendarRange, CalendarCheck } from 'lucide-react';

const PERIOD_TYPES = {
  DAY_OF_WEEK: 'day_of_week',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year'
};

const getMonthName = (month) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '';
};

const getDayOfWeekName = (dayOfWeek) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || '';
};

const getQuarter = (month) => Math.ceil(month / 3);

const PerformanceByWeek = ({ weeklyPerformance = [], dailyPerformance = [], trades = [], loading = false }) => {
  const [periodType, setPeriodType] = useState(PERIOD_TYPES.WEEK);
  // Process the performance data based on selected period type
  const chartData = useMemo(() => {
    // For day of week, use individual trades data if available
    if (periodType === PERIOD_TYPES.DAY_OF_WEEK) {
      if (Array.isArray(trades) && trades.length > 0) {
        // Use individual trades data for day of week analysis
        const groupedData = {};
        
        trades.forEach(trade => {
          if (!trade) return;
          
          // Get the trade date from various possible fields
          let tradeDate = trade.date || trade.entry_date || trade.timestamp || trade.created_at;
          if (!tradeDate) return;
          
          const date = new Date(tradeDate);
          if (isNaN(date.getTime())) return; // Skip invalid dates
          
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const periodKey = `${dayOfWeek}`;
          
          if (!groupedData[periodKey]) {
            groupedData[periodKey] = {
              periodKey,
              label: getDayOfWeekName(dayOfWeek),
              year: date.getFullYear(),
              periodNum: dayOfWeek,
              pnl: 0,
              winRate: 0,
              trades: 0,
              wins: 0,
              formatted_range: getDayOfWeekName(dayOfWeek)
            };
          }
          
          // Aggregate the data
          const period = groupedData[periodKey];
          const pnl = parseFloat(trade.pnl || 0);
          
          period.pnl += pnl;
          period.trades += 1;
          if (pnl > 0) period.wins += 1;
        });
        
        // Calculate win rates
        Object.values(groupedData).forEach(period => {
          period.winRate = period.trades > 0 ? (period.wins / period.trades) * 100 : 0;
        });
        
        // Ensure all 7 days are shown even if no data
        const allDays = [];
        for (let i = 0; i < 7; i++) {
          const existingDay = groupedData[`${i}`];
          if (existingDay) {
            allDays.push(existingDay);
          } else {
            // Create empty day entry
            allDays.push({
              periodKey: `${i}`,
              label: getDayOfWeekName(i),
              year: new Date().getFullYear(),
              periodNum: i,
              pnl: 0,
              winRate: 0,
              trades: 0,
              wins: 0,
              formatted_range: getDayOfWeekName(i)
            });
          }
        }
        
        return allDays;
      } else if (Array.isArray(dailyPerformance) && dailyPerformance.length > 0) {
        // Fallback to daily performance data if no trades data
        const groupedData = {};
        
        dailyPerformance.forEach(dayData => {
          if (!dayData) return;
          
          const safeDayData = {
            date: dayData.date || new Date().toISOString().split('T')[0],
            pnl: dayData.pnl || 0,
            win_rate: dayData.win_rate || 0,
            trades: dayData.trades || 0
          };
          
          const date = new Date(safeDayData.date);
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const periodKey = `${dayOfWeek}`;
          
          if (!groupedData[periodKey]) {
            groupedData[periodKey] = {
              periodKey,
              label: getDayOfWeekName(dayOfWeek),
              year: date.getFullYear(),
              periodNum: dayOfWeek,
              pnl: 0,
              winRate: 0,
              trades: 0,
              days: 0,
              formatted_range: getDayOfWeekName(dayOfWeek)
            };
          }
          
          // Aggregate the data
          const period = groupedData[periodKey];
          const dayTrades = dayData.trades || 0;
          const totalTrades = period.trades + dayTrades;
          
          period.pnl += dayData.pnl || 0;
          period.winRate = ((period.winRate * period.days) + (dayData.win_rate || 0)) / (period.days + 1);
          period.trades = totalTrades;
          period.days += 1;
        });
        
        // Ensure all 7 days are shown even if no data
        const allDays = [];
        for (let i = 0; i < 7; i++) {
          const existingDay = groupedData[`${i}`];
          if (existingDay) {
            allDays.push(existingDay);
          } else {
            // Create empty day entry
            allDays.push({
              periodKey: `${i}`,
              label: getDayOfWeekName(i),
              year: new Date().getFullYear(),
              periodNum: i,
              pnl: 0,
              winRate: 0,
              trades: 0,
              days: 0,
              formatted_range: getDayOfWeekName(i)
            });
          }
        }
        
        return allDays;
      } else {
        // Fallback to weekly data if no daily data or trades
        if (!Array.isArray(weeklyPerformance) || weeklyPerformance.length === 0) {
          return [];
        }
      }
    }
    
    // For other period types, use weekly performance data
    if (!Array.isArray(weeklyPerformance) || weeklyPerformance.length === 0) {
      return [];
    }

    // Group data based on period type
    const groupedData = {};
    
    weeklyPerformance.forEach(weekData => {
      // Skip if weekData is null or undefined
      if (!weekData) return;
      
      // Ensure required fields have default values
      const safeWeekData = {
        year: weekData.year || new Date().getFullYear(),
        week_num: weekData.week_num || 1,
        pnl: weekData.pnl || 0,
        win_rate: weekData.win_rate || 0,
        trades: weekData.trades || 0,
        formatted_range: weekData.formatted_range || ''
      };
      
      const date = new Date(safeWeekData.year, 0, 1 + (safeWeekData.week_num - 1) * 7);
      let periodKey, label, year, periodNum;
      
      switch (periodType) {
        case PERIOD_TYPES.DAY_OF_WEEK:
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          periodKey = `${dayOfWeek}`;
          label = getDayOfWeekName(dayOfWeek);
          year = weekData.year;
          periodNum = dayOfWeek;
          break;
          
        case PERIOD_TYPES.MONTH:
          const month = date.getMonth() + 1;
          periodKey = `${weekData.year}-${String(month).padStart(2, '0')}`;
          label = `${getMonthName(month)} ${weekData.year}`;
          year = weekData.year;
          periodNum = month;
          break;
          
        case PERIOD_TYPES.QUARTER:
          const quarter = getQuarter(date.getMonth() + 1);
          periodKey = `${weekData.year}-Q${quarter}`;
          label = `Q${quarter} ${weekData.year}`;
          year = weekData.year;
          periodNum = quarter;
          break;
          
        case PERIOD_TYPES.YEAR:
          periodKey = `${weekData.year}`;
          label = `${weekData.year}`;
          year = weekData.year;
          periodNum = weekData.year;
          break;
          
        case PERIOD_TYPES.WEEK:
        default:
          periodKey = `${weekData.year}-W${String(weekData.week_num).padStart(2, '0')}`;
          label = `W${weekData.week_num} ${weekData.year}`;
          year = weekData.year;
          periodNum = weekData.week_num;
      }
      
      if (!groupedData[periodKey]) {
        groupedData[periodKey] = {
          periodKey,
          label,
          year,
          periodNum,
          pnl: 0,
          winRate: 0,
          trades: 0,
          weeks: 0,
          formatted_range: periodType === PERIOD_TYPES.WEEK ? weekData.formatted_range : label
        };
      }
      
      // Aggregate the data
      const period = groupedData[periodKey];
      const weekTrades = weekData.trades || 0;
      const totalTrades = period.trades + weekTrades;
      
      period.pnl += weekData.pnl || 0;
      period.winRate = ((period.winRate * period.weeks) + (weekData.win_rate || 0)) / (period.weeks + 1);
      period.trades = totalTrades;
      period.weeks += 1;
    });
    
    // Convert to array and sort
    let result = Object.values(groupedData).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.periodNum - b.periodNum;
    });

    // For day of week, ensure all 7 days are shown even if no data
    if (periodType === PERIOD_TYPES.DAY_OF_WEEK) {
      const allDays = [];
      for (let i = 0; i < 7; i++) {
        const existingDay = result.find(day => day.periodNum === i);
        if (existingDay) {
          allDays.push(existingDay);
        } else {
          // Create empty day entry
          allDays.push({
            periodKey: `${i}`,
            label: getDayOfWeekName(i),
            year: new Date().getFullYear(),
            periodNum: i,
            pnl: 0,
            winRate: 0,
            trades: 0,
            weeks: 0,
            formatted_range: getDayOfWeekName(i)
          });
        }
      }
      result = allDays;
    }

    return result;
  }, [weeklyPerformance, dailyPerformance, trades, periodType]);
  
  // Find the best and worst performing periods
  const { bestPeriod, worstPeriod } = useMemo(() => {
    if (!chartData || chartData.length === 0) return { bestPeriod: null, worstPeriod: null };
    
    return chartData.reduce((acc, current) => ({
      bestPeriod: (current.pnl > (acc.bestPeriod?.pnl || -Infinity)) ? current : acc.bestPeriod,
      worstPeriod: (current.pnl < (acc.worstPeriod?.pnl || Infinity)) ? current : acc.worstPeriod
    }), { bestPeriod: null, worstPeriod: null });
  }, [chartData]);

  // Loading state
  const getPeriodTitle = () => {
    switch (periodType) {
      case PERIOD_TYPES.DAY_OF_WEEK: return 'Day of Week Performance';
      case PERIOD_TYPES.MONTH: return 'Monthly Performance';
      case PERIOD_TYPES.QUARTER: return 'Quarterly Performance';
      case PERIOD_TYPES.YEAR: return 'Yearly Performance';
      case PERIOD_TYPES.WEEK:
      default:
        return 'Weekly Performance';
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{getPeriodTitle()}</h3>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Loading...
            </span>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }
  
  // No data state
  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">No {periodType}ly performance data available</p>
          <p className="text-sm text-gray-400">Trade during different periods to see performance metrics</p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white">{data.formatted_range}</p>
          <p className="text-sm">
            <span className="text-gray-500">P&L: </span>
            <span className={data.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
              ${data.pnl.toFixed(2)}
            </span>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Win Rate: </span>
            <span className="font-medium">{data.winRate.toFixed(1)}%</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Trades: </span>
            <span className="font-medium">{data.trades}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate chart domain for better visualization
  const maxPnl = Math.max(...chartData.map(d => Math.abs(d.pnl)));
  const domain = [-maxPnl * 1.1, maxPnl * 1.1];

  // Get the appropriate icon based on period type
  const getPeriodIcon = () => {
    switch (periodType) {
      case PERIOD_TYPES.DAY_OF_WEEK: return <Calendar className="w-5 h-5 mr-2 text-blue-500" />;
      case PERIOD_TYPES.MONTH: return <CalendarDays className="w-5 h-5 mr-2 text-blue-500" />;
      case PERIOD_TYPES.QUARTER: return <CalendarRange className="w-5 h-5 mr-2 text-blue-500" />;
      case PERIOD_TYPES.YEAR: return <CalendarCheck className="w-5 h-5 mr-2 text-blue-500" />;
      case PERIOD_TYPES.WEEK:
      default:
        return <Calendar className="w-5 h-5 mr-2 text-blue-500" />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200/60 p-6">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#040028] flex items-center">
              {getPeriodIcon()}
              {getPeriodTitle()}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Track your performance across different {periodType === PERIOD_TYPES.DAY_OF_WEEK ? 'days of the week' : periodType === PERIOD_TYPES.WEEK ? 'weeks' : periodType + 's'}
            </p>
          </div>
          
          {/* Period Selector */}
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <div className="flex bg-slate-100 rounded-md p-1">
            <button
              onClick={() => setPeriodType(PERIOD_TYPES.DAY_OF_WEEK)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center ${
                periodType === PERIOD_TYPES.DAY_OF_WEEK 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" /> Day of Week
            </button>
            <button
              onClick={() => setPeriodType(PERIOD_TYPES.WEEK)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center ${
                periodType === PERIOD_TYPES.WEEK 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" /> Week
            </button>
            <button
              onClick={() => setPeriodType(PERIOD_TYPES.MONTH)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center ${
                periodType === PERIOD_TYPES.MONTH 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 mr-1.5" /> Month
            </button>
            <button
              onClick={() => setPeriodType(PERIOD_TYPES.QUARTER)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center ${
                periodType === PERIOD_TYPES.QUARTER 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5 mr-1.5" /> Quarter
            </button>
            <button
              onClick={() => setPeriodType(PERIOD_TYPES.YEAR)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center ${
                periodType === PERIOD_TYPES.YEAR 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 mr-1.5" /> Year
            </button>
            </div>
          </div>
          
        
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              barCategoryGap={4}
              layout="horizontal"
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
                dataKey="label" 
                type="category" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis 
                type="number" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                width={40}
                tickFormatter={(value) => `$${value}`}
              />
              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#e2e8f0" />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}
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
        
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center text-sm text-slate-600 mb-1">
              <BarChart3 className="w-4 h-4 mr-1.5" />
              <span>Total Trades</span>
            </div>
            <p className="text-xl font-semibold text-[#040028]">
              {chartData.reduce((sum, week) => sum + week.trades, 0)}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center text-sm text-slate-600 mb-1">
              <TrendingUp className="w-4 h-4 mr-1.5" />
              <span>Avg. {periodType === PERIOD_TYPES.DAY_OF_WEEK ? 'Day of Week' : periodType === PERIOD_TYPES.WEEK ? 'Weekly' : periodType === PERIOD_TYPES.MONTH ? 'Monthly' : periodType === PERIOD_TYPES.QUARTER ? 'Quarterly' : 'Yearly'} P&L</span>
            </div>
            <p className="text-xl font-semibold text-[#040028]">
              {chartData.length > 0 
                ? `$${(chartData.reduce((sum, week) => sum + week.pnl, 0) / chartData.length).toFixed(2)}`
                : '$0.00'}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center text-sm text-slate-600 mb-1">
              <Target className="w-4 h-4 mr-1.5" />
              <span>Win Rate</span>
            </div>
            <p className="text-xl font-semibold text-[#040028]">
              {chartData.length > 0 
                ? `${(chartData.reduce((sum, week) => sum + week.winRate, 0) / chartData.length).toFixed(1)}%`
                : '0%'}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center text-sm text-slate-600 mb-1">
              <CalendarDays className="w-4 h-4 mr-1.5" />
              <span>{periodType === PERIOD_TYPES.DAY_OF_WEEK ? 'Days of Week' : periodType === PERIOD_TYPES.WEEK ? 'Weeks' : periodType === PERIOD_TYPES.MONTH ? 'Months' : periodType === PERIOD_TYPES.QUARTER ? 'Quarters' : 'Years'}</span>
            </div>
            <p className="text-xl font-semibold text-[#040028]">
              {chartData.length}
            </p>
          </div>
        </div>

        {/* Best and Worst Periods */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-slate-600 mb-2">Performance Extremes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestPeriod && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center text-sm text-slate-600 mb-1">
                  <TrendingUp className="w-4 h-4 mr-1.5 text-blue-500" />
                  <span>Best {periodType === PERIOD_TYPES.DAY_OF_WEEK ? 'Day of Week' : periodType === PERIOD_TYPES.WEEK ? 'Week' : periodType === PERIOD_TYPES.MONTH ? 'Month' : periodType === PERIOD_TYPES.QUARTER ? 'Quarter' : 'Year'}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium text-blue-900">
                    {bestPeriod.formatted_range}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    bestPeriod.pnl >= 0 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {bestPeriod.pnl >= 0 ? '+' : ''}{bestPeriod.pnl.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            {worstPeriod && (
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-center text-sm text-slate-600 mb-1">
                  <TrendingUp className="w-4 h-4 mr-1.5 transform rotate-180 text-red-500" />
                  <span>Worst {periodType === PERIOD_TYPES.DAY_OF_WEEK ? 'Day of Week' : periodType === PERIOD_TYPES.WEEK ? 'Week' : periodType === PERIOD_TYPES.MONTH ? 'Month' : periodType === PERIOD_TYPES.QUARTER ? 'Quarter' : 'Year'}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium text-red-900">
                    {worstPeriod.formatted_range}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    worstPeriod.pnl >= 0 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {worstPeriod.pnl >= 0 ? '+' : ''}{worstPeriod.pnl.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceByWeek;
