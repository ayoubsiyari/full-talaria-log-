import React, { useState, useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isToday, 
  isFuture, 
  subDays,
  isSameDay,
  parseISO,
  isWithinInterval,
  addDays,
  isSameWeek,
  getMonth,
  getYear,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  startOfDay,
  endOfDay
} from 'date-fns';
import { 
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'WEEK'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const formatCurrency = (val) => {
  if (val == null) return 'N/A';
  const num = parseFloat(val);
  if (Math.abs(num) >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(2)}`;
};

const formatPercent = (val) =>
  val == null ? 'N/A' : `${parseFloat(val).toFixed(1)}%`;

const EnhancedCalendar = ({ stats }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectionType, setSelectionType] = useState(null); // 'day', 'week', 'month'
  const [selectedMonth, setSelectedMonth] = useState(getMonth(new Date()));
  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));

  const calendarMatrix = useMemo(() => {
    if (!stats?.pnl_by_date) return [];

    const pnlDataMap = new Map();
    if (Array.isArray(stats.pnl_by_date)) {
      stats.pnl_by_date.forEach(([date, pnl]) => {
        if (date && pnl !== undefined) {
          pnlDataMap.set(date, pnl);
        }
      });
    }
    
    const tradeCounts = new Map();
    if (stats.trades && Array.isArray(stats.trades)) {
      stats.trades.forEach(trade => {
        try {
          let dateKey;
          if (trade.date) {
            if (typeof trade.date === 'string') {
              dateKey = trade.date.includes('T') 
                ? trade.date.split('T')[0]
                : trade.date;
            } else if (trade.date instanceof Date) {
              dateKey = format(trade.date, 'yyyy-MM-dd');
            }
            
            if (dateKey) {
              tradeCounts.set(dateKey, (tradeCounts.get(dateKey) || 0) + 1);
            }
          }
        } catch (error) {
          console.error('Error processing trade date:', trade.date, error);
        }
      });
    }

    const monthDate = new Date(selectedYear, selectedMonth, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const weeks = [];
    let currentDay = calendarStart;

    while (currentDay <= calendarEnd) {
      const week = [];
      let weeklyPnl = 0;
      let weeklyTrades = 0;

      for (let i = 0; i < 7; i++) {
        const day = addDays(currentDay, i);
        const dateKey = format(day, 'yyyy-MM-dd');
        const pnl = pnlDataMap.get(dateKey) || 0;
        const trades = tradeCounts.get(dateKey) || 0;

        weeklyPnl += pnl;
        weeklyTrades += trades;

        week.push({
          day: day.getDate(),
          date: day,
          dateKey,
          pnl: Number(pnl) || 0,
          trades,
          isCurrentMonth: isSameMonth(day, monthDate),
          isToday: isToday(day),
          month: getMonth(day),
          monthName: format(day, 'MMM'),
        });
      }

      week.push({
        isWeekSummary: true,
        pnl: weeklyPnl,
        trades: weeklyTrades,
        date: currentDay, // Represents the start of the week
      });

      weeks.push(week);
      currentDay = addDays(currentDay, 7);
    }
    
    return weeks;

  }, [stats, selectedMonth, selectedYear]);

  const selectedPeriodData = useMemo(() => {
    if (!selectionType || !selectedDate || !stats?.trades) return null;

    let interval;
    let title;

    if (selectionType === 'day') {
      interval = { start: startOfDay(selectedDate), end: endOfDay(selectedDate) };
      title = `Details for ${format(selectedDate, 'MMMM d, yyyy')}`;
    } else if (selectionType === 'week') {
      interval = { start: startOfWeek(selectedDate, { weekStartsOn: 0 }), end: endOfWeek(selectedDate, { weekStartsOn: 0 }) };
      title = `Details for Week of ${format(interval.start, 'MMM d')}`;
    } else if (selectionType === 'month') {
      interval = { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
      title = `Details for ${format(selectedDate, 'MMMM yyyy')}`;
    }

    const filteredTrades = stats.trades.filter(trade => {
      const tradeDate = parseISO(trade.date);
      return isWithinInterval(tradeDate, interval);
    });

    const totalPnL = filteredTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
    const winningTrades = filteredTrades.filter(t => t.pnl > 0).length;
    const losingTrades = filteredTrades.filter(t => t.pnl < 0).length;
    const totalTrades = filteredTrades.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const equityCurve = filteredTrades
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .reduce((acc, trade, index) => {
        const prevPnl = acc.length > 0 ? acc[acc.length - 1].cumulativePnL : 0;
        acc.push({ 
          trade: index + 1, 
          cumulativePnL: prevPnl + (trade.pnl || 0),
          date: trade.date
        });
        return acc;
      }, []);

    return {
      title,
      totalPnL,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      equityCurve,
    };
  }, [selectedDate, selectionType, stats?.trades]);

  const handleDayClick = (day, isWeek = false, isMonth = false) => {
    if (isMonth) {
      setSelectedMonth(getMonth(day));
      setSelectedDate(day);
      setSelectionType('month');
    } else if (isWeek) {
      setSelectedDate(day);
      setSelectionType('week');
    } else {
      if (day.trades > 0 || day.pnl !== 0) {
        setSelectedDate(day.date);
        setSelectionType('day');
      }
    }
  };

  const navigateYear = (direction) => {
    const newYear = direction === 'next' ? selectedYear + 1 : selectedYear - 1;
    setSelectedYear(newYear);
    const newDate = new Date(newYear, selectedMonth, 1);
    setSelectedDate(newDate);
    setSelectionType('month');
  };

  const handleMonthChange = (event) => {
    const newMonth = parseInt(event.target.value, 10);
    setSelectedMonth(newMonth);
    const newDate = new Date(selectedYear, newMonth, 1);
    setSelectedDate(newDate);
    setSelectionType('month');
  };

  let chartData = selectedPeriodData?.equityCurve || [];
  if (chartData.length === 1) {
    chartData = [
      { trade: 0, cumulativePnL: 0 },
      ...chartData
    ];
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-[#3090FF]/20 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-[#040028] flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#3090FF]" />
          Calendar
        </h3>
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={handleMonthChange}
            className="px-3 py-1.5 rounded-md bg-white border border-[#3090FF]/30 text-[#040028] text-sm font-medium cursor-pointer focus:ring-2 focus:ring-[#3090FF] outline-none transition-all duration-200"
          >
            {MONTHS.map((month, index) => (
              <option key={index} value={index}>{month}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-[#3090FF]/10 rounded-md p-1">
            <button 
              onClick={() => navigateYear('prev')}
              className="p-1.5 rounded-md bg-white hover:bg-[#3090FF]/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-[#3090FF]" />
            </button>
            <span className="font-bold text-[#040028] w-18 text-center text-sm">{selectedYear}</span>
            <button 
              onClick={() => navigateYear('next')}
              className="p-1.5 rounded-md bg-white hover:bg-[#3090FF]/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[#3090FF]" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="calendar-days-container">
            <div className="grid grid-cols-8 gap-1 mb-1">
              {WEEKDAYS.map(day => (
                <div key={day} className="text-center py-1 text-xs font-bold text-[#040028]/60">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {calendarMatrix.map((week, weekIndex) => (
                <React.Fragment key={weekIndex}>
                  {week.map((day) => {
                    if (day.isWeekSummary) return null;
                    
                    const isSelected = 
                      (selectionType === 'day' && selectedDate && isSameDay(day.date, selectedDate)) ||
                      (selectionType === 'week' && selectedDate && isSameWeek(day.date, selectedDate, { weekStartsOn: 0 })) ||
                      (selectionType === 'month' && selectedDate && isSameMonth(day.date, selectedDate));

                    const cellClass = `relative aspect-square flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${day.isCurrentMonth ? 'text-[#040028]' : 'text-[#040028]/40'} ${isSelected ? (selectionType === 'day' ? 'bg-[#10B981]/20 text-[#10B981]' : selectionType === 'week' ? 'bg-[#EF4444]/20 text-[#EF4444]' : 'bg-[#10B981]/20 text-[#10B981]') : ''}`;
                    const pnlIndicatorClass = day.pnl > 0 ? 'bg-[#10B981]' : 'bg-[#EF4444]';

                    return (
                      <div key={day.dateKey} className={cellClass} onClick={() => handleDayClick(day)}>
                        <div className="flex flex-col items-center">
                          <span className="text-xs">{day.day}</span>
                          <span className="text-[6px] text-[#040028]/60 font-medium">{day.trades} Trades</span>
                          <span className={`text-[6px] font-semibold ${day.pnl > 0 ? 'text-[#10B981]' : day.pnl < 0 ? 'text-[#EF4444]' : 'text-[#040028]/40'}`}>{formatCurrency(day.pnl)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div 
                    className={`relative aspect-square flex items-center justify-center rounded-lg transition-all duration-200 bg-[#3090FF]/5 cursor-pointer hover:bg-[#3090FF]/10 ${(selectionType === 'week' && selectedDate && isSameWeek(week[0].date, selectedDate, { weekStartsOn: 0 })) ? 'bg-[#3090FF]/20 ring-1 ring-[#3090FF]' : ''}`}
                    onClick={() => handleDayClick(week.find(d => d.isWeekSummary).date, true, false)}
                  >
                    <div className="text-center">
                      <div className={`text-xs font-bold ${week.find(d => d.isWeekSummary).pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                        {formatCurrency(week.find(d => d.isWeekSummary).pnl)}
                      </div>
                      <div className="text-[8px] text-[#040028]/60">{week.find(d => d.isWeekSummary).trades} trades</div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Period Details */}
        <div className="lg:col-span-2">
          {selectedPeriodData ? (
            <div className="bg-white rounded-lg shadow-sm border border-[#3090FF]/20 p-4 h-full">
              <h4 className="text-lg font-bold text-[#040028] mb-4">{selectedPeriodData.title}</h4>
              
              {/* Chart Container */}
              <div className="h-64 mb-4">
                {chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={selectedPeriodData.totalPnL >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={selectedPeriodData.totalPnL >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="trade" 
                          tick={{ fill: '#6b7280', fontSize: 11 }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={{ stroke: '#e5e7eb' }}
                        />
                        <YAxis 
                          tickFormatter={formatCurrency} 
                          tick={{ fill: '#6b7280', fontSize: 11 }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={{ stroke: '#e5e7eb' }}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'white',
                            borderColor: '#e5e7eb',
                            color: '#374151',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                          }}
                          labelStyle={{ fontWeight: 'bold' }}
                          formatter={(value, name) => [formatCurrency(value), 'Cumulative P&L']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="cumulativePnL" 
                          stroke={selectedPeriodData.totalPnL >= 0 ? "#10B981" : "#EF4444"}
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorPnl)"

                        />
                      </AreaChart>
                    </ResponsiveContainer>
                )}

              </div>

              {/* Metrics under the chart */}
              <div className="grid grid-cols-5 gap-3 mt-4">
                <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3 h-3 text-[#3090FF]" />
                    <span className="text-xs font-medium text-[#040028]/60">Total P&L</span>
                  </div>
                  <div className={`text-sm font-bold ${selectedPeriodData.totalPnL >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>{formatCurrency(selectedPeriodData.totalPnL)}</div>
                </div>
                <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-3 h-3 text-[#3090FF]" />
                    <span className="text-xs font-medium text-[#040028]/60">Total Trades</span>
                  </div>
                  <div className="text-sm font-bold text-[#040028]">{selectedPeriodData.totalTrades}</div>
                </div>
                <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3 h-3 text-[#3090FF]" />
                    <span className="text-xs font-medium text-[#040028]/60">Winning</span>
                  </div>
                  <div className="text-sm font-bold text-[#3090FF]">{selectedPeriodData.winningTrades}</div>
                </div>
                <div className="bg-[#232CF4]/5 p-3 rounded-lg border border-[#232CF4]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-3 h-3 text-[#232CF4]" />
                    <span className="text-xs font-medium text-[#040028]/60">Losing</span>
                  </div>
                  <div className="text-sm font-bold text-[#232CF4]">{selectedPeriodData.losingTrades}</div>
                </div>
                <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-3 h-3 text-[#3090FF]" />
                    <span className="text-xs font-medium text-[#040028]/60">Win Rate</span>
                  </div>
                  <div className="text-sm font-bold text-[#3090FF]">{formatPercent(selectedPeriodData.winRate)}</div>
                </div>
              </div>
            </div>
          ) : (
            stats?.trades && stats.trades.length > 0 ? (
              (() => {
                // Calculate all-trades summary
                const allTrades = stats.trades;
                const totalPnL = allTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
                const winningTrades = allTrades.filter(t => t.pnl > 0).length;
                const losingTrades = allTrades.filter(t => t.pnl < 0).length;
                const totalTrades = allTrades.length;
                const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
                // Build equity curve for all trades
                const sortedTrades = [...allTrades].sort((a, b) => new Date(a.date) - new Date(b.date));
                const equityCurve = sortedTrades.reduce((acc, trade, index) => {
                  const prevPnl = acc.length > 0 ? acc[acc.length - 1].cumulativePnL : 0;
                  acc.push({ 
                    trade: index + 1, 
                    cumulativePnL: prevPnl + (trade.pnl || 0),
                    date: trade.date
                  });
                  return acc;
                }, []);
                let chartData = equityCurve;
                if (chartData.length === 1) {
                  chartData = [
                    { trade: 0, cumulativePnL: 0 },
                    ...chartData
                  ];
                }
                return (
                  <div className="bg-white rounded-lg shadow-sm border border-[#3090FF]/20 p-4 h-full">
                    <h4 className="text-lg font-bold text-[#040028] mb-4">All Trades Summary</h4>
                    {/* Chart Container */}
                    <div className="h-64 mb-4">
                      {chartData.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={chartData}
                            margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient id="colorPnlAll" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={totalPnL >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={totalPnL >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis 
                              dataKey="trade" 
                              tick={{ fill: '#6b7280', fontSize: 11 }}
                              axisLine={{ stroke: '#e5e7eb' }}
                              tickLine={{ stroke: '#e5e7eb' }}
                            />
                            <YAxis 
                              tickFormatter={formatCurrency} 
                              tick={{ fill: '#6b7280', fontSize: 11 }}
                              axisLine={{ stroke: '#e5e7eb' }}
                              tickLine={{ stroke: '#e5e7eb' }}
                              domain={['auto', 'auto']}
                            />
                            <Tooltip
                              contentStyle={{ 
                                backgroundColor: 'white',
                                borderColor: '#e5e7eb',
                                color: '#374151',
                                borderRadius: '8px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                              }}
                              labelStyle={{ fontWeight: 'bold' }}
                              formatter={(value, name) => [formatCurrency(value), 'Cumulative P&L']}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="cumulativePnL" 
                              stroke={totalPnL >= 0 ? "#10B981" : "#EF4444"}
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorPnlAll)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-3 mt-4">
                      <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-3 h-3 text-[#3090FF]" />
                          <span className="text-xs font-medium text-[#040028]/60">Total P&L</span>
                        </div>
                        <div className={`text-sm font-bold ${totalPnL >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>{formatCurrency(totalPnL)}</div>
                      </div>
                      <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-3 h-3 text-[#3090FF]" />
                          <span className="text-xs font-medium text-[#040028]/60">Total Trades</span>
                        </div>
                        <div className="text-sm font-bold text-[#040028]">{totalTrades}</div>
                      </div>
                      <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-3 h-3 text-[#3090FF]" />
                          <span className="text-xs font-medium text-[#040028]/60">Winning</span>
                        </div>
                        <div className="text-sm font-bold text-[#3090FF]">{winningTrades}</div>
                      </div>
                      <div className="bg-[#232CF4]/5 p-3 rounded-lg border border-[#232CF4]/10">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingDown className="w-3 h-3 text-[#232CF4]" />
                          <span className="text-xs font-medium text-[#040028]/60">Losing</span>
                        </div>
                        <div className="text-sm font-bold text-[#232CF4]">{losingTrades}</div>
                      </div>
                      <div className="bg-[#3090FF]/5 p-3 rounded-lg border border-[#3090FF]/10">
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="w-3 h-3 text-[#3090FF]" />
                          <span className="text-xs font-medium text-[#040028]/60">Win Rate</span>
                        </div>
                        <div className="text-sm font-bold text-[#3090FF]">{formatPercent(winRate)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <AlertCircle className="w-10 h-10 text-[#040028]/40 mb-3" />
                <h4 className="text-base font-semibold text-[#040028] mb-2">
                  Select a Day, Week, or Month
                </h4>
                <p className="text-sm text-[#040028]/60">
                  Click on any day, week summary, or month to view detailed metrics and equity curve.
                </p>
              </div>
            )
          )}
        </div>
      </div>
      
    </div>
  );
};

export default EnhancedCalendar; 