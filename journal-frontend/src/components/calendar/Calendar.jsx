import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  isToday,
  isSameDay,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  subMonths,
  addMonths,
  parseISO,
} from 'date-fns';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import {
  toDateKey,
  formatCurrency,
  exportToCSV,
} from '../../utils/dateUtils';
import CalendarDay from './CalendarDay';
import DayTradeModal from './DayTradeModal';
import './Calendar.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  // Remove theme state and logic
  // const [theme, setTheme] = useState('dark');

  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterStrategy, setFilterStrategy] = useState('');

  const { stats, loading, error } = useAnalyticsData();

  const uniqueSymbols = useMemo(() => {
    const trades = stats?.trades || [];
    return [...new Set(trades.map(t => t.symbol))];
  }, [stats]);

  const uniqueStrategies = useMemo(() => {
    const trades = stats?.trades || [];
    return [...new Set(trades.map(t => t.strategy))];
  }, [stats]);

  const calendarMatrix = useMemo(() => {
    if (loading || !stats?.pnl_by_date) return [];

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const pnlDataMap = new Map();
    const tradesByDateMap = new Map();

    const filteredTrades = (stats.trades || []).filter(trade => {
      const symbolMatch = filterSymbol ? trade.symbol === filterSymbol : true;
      const strategyMatch = filterStrategy ? trade.strategy === filterStrategy : true;
      return symbolMatch && strategyMatch;
    });

    filteredTrades.forEach(trade => {
      const dateKey = toDateKey(parseISO(trade.entry_date));
      const pnl = parseFloat(trade.pnl || 0);
      if (!pnlDataMap.has(dateKey)) {
        pnlDataMap.set(dateKey, 0);
        tradesByDateMap.set(dateKey, []);
      }
      pnlDataMap.set(dateKey, pnlDataMap.get(dateKey) + pnl);
      tradesByDateMap.get(dateKey).push(trade);
    });

    const calendarWeeks = [];
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    let currentDay = new Date(calendarStart);

    while (currentDay <= calendarEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const dateKey = toDateKey(currentDay);
        const pnl = pnlDataMap.get(dateKey) || 0;
        const trades = tradesByDateMap.get(dateKey) || [];

        week.push({
          day: currentDay.getDate(),
          date: new Date(currentDay),
          dateKey,
          pnl,
          trades: trades.length,
          isToday: isToday(currentDay),
          isCurrentMonth: isSameMonth(currentDay, currentDate),
          isSelected: selectedDate ? isSameDay(currentDay, selectedDate) : false,
          isFuture: currentDay > new Date(),
          isWin: pnl > 0,
          isLoss: pnl < 0
        });
        currentDay.setDate(currentDay.getDate() + 1);
      }
      calendarWeeks.push(week);
    }

    return calendarWeeks;
  }, [currentDate, loading, selectedDate, stats, filterSymbol, filterStrategy]);

  const weeklyStats = useMemo(() => {
    if (!calendarMatrix || calendarMatrix.length === 0) return [];

    return calendarMatrix.map((week, index) => {
      const weeklyPnl = week.reduce((acc, day) => acc + (day.isCurrentMonth ? day.pnl : 0), 0);
      const tradingDays = week.filter(day => day.isCurrentMonth && day.trades > 0).length;
      const totalTrades = week.reduce((acc, day) => acc + (day.isCurrentMonth ? day.trades : 0), 0);

      return {
        weekNumber: index + 1,
        totalPnl: weeklyPnl,
        tradingDays,
        totalTrades,
      };
    });
  }, [calendarMatrix]);

  const handleDateClick = useCallback(day => {
    if (!day || day.isFuture || day.trades === 0) return;
    setSelectedDate(day.date);
    setModalDate(day.date);
    setIsModalOpen(true);
  }, []);

  // Remove theme-related useEffect and toggleTheme

  const navigateToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  }, []);

  const navigateToPreviousMonth = useCallback(() => {
    setCurrentDate(prev => subMonths(prev, 1));
  }, []);

  const navigateToNextMonth = useCallback(() => {
    setCurrentDate(prev => addMonths(prev, 1));
  }, []);

  const handleDataExport = useCallback(() => {
    if (!stats?.trades) return;
    const exportData = stats.trades.map(t => ({ ...t, pnl: formatCurrency(t.pnl) }));
    exportToCSV(exportData, `trading-performance-${format(currentDate, 'yyyy-MM')}.csv`);
  }, [stats, currentDate]);

  const formatWeeklyPnl = (pnl) => {
    const absPnl = Math.abs(pnl);
    if (absPnl === 0) return '$0';
    const sign = pnl < 0 ? '-' : '';
    if (absPnl >= 1000) {
      return `${sign}$${(absPnl / 1000).toFixed(1)}K`;
    }
    return `${sign}$${absPnl.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="h-6 w-6 text-red-500">⚠️</div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Error Loading Data
            </h3>
            <p className="text-red-700">{error.toString()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-blue-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-[#040028]">Calendar View</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={navigateToPreviousMonth} 
                  className="p-2 text-slate-600 hover:text-[#040028] hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-lg font-semibold text-[#040028] px-4">
                  {format(currentDate, 'MMMM yyyy')}
                </span>
                <button 
                  onClick={navigateToNextMonth} 
                  className="p-2 text-slate-600 hover:text-[#040028] hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Next month"
                >
                  ›
                </button>
                <button 
                  onClick={navigateToToday}
                  className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Today
                </button>
              </div>
            </div>
            <button 
              onClick={handleDataExport} 
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        

        {/* Calendar Grid */}
        <div className="p-6">
          <div className="grid grid-cols-8 gap-1 mb-4">
            {WEEKDAYS.map(day => (
              <div key={day} className="p-3 text-center text-sm font-semibold text-slate-600 bg-slate-50 rounded-lg">
                {day}
              </div>
            ))}
            <div className="p-3 text-center text-sm font-semibold text-slate-600 bg-slate-50 rounded-lg">
              Week
            </div>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {calendarMatrix.map((week, i) => (
              <React.Fragment key={i}>
                {week.map((day, j) =>
                  day.isCurrentMonth ? (
                    <CalendarDay
                      key={`${i}-${j}`}
                      day={day}
                      onClick={() => handleDateClick(day)}
                    />
                  ) : (
                    <div key={`${i}-${j}`} className="h-24 bg-slate-50 rounded-lg" />
                  )
                )}
                {/* Weekly Summary Card */}
                <div className={`h-24 p-2 border border-blue-200/60 rounded-lg transition-all duration-200 cursor-pointer hover:transform hover:-translate-y-1 hover:shadow-md hover:border-blue-300 ${
                  (() => {
                    const weekStat = weeklyStats.find(ws => ws.weekNumber === i + 1);
                    if (!weekStat || (weekStat.tradingDays === 0 && weekStat.totalPnl === 0)) {
                      return 'bg-white';
                    }
                    const isProfit = weekStat.totalPnl > 0;
                    const isLoss = weekStat.totalPnl < 0;
                    return isProfit ? 'bg-gradient-to-b from-green-50 to-white' : isLoss ? 'bg-gradient-to-b from-red-50 to-white' : 'bg-white';
                  })()
                }`}>
                  {(() => {
                    const weekStat = weeklyStats.find(ws => ws.weekNumber === i + 1);
                    const weekNumber = i + 1;
                    
                    if (!weekStat || (weekStat.tradingDays === 0 && weekStat.totalPnl === 0)) {
                      return (
                        <div className="flex flex-col justify-center h-full">
                          <div className="text-xs font-semibold text-slate-400 text-center mb-1">
                            Week {weekNumber}
                          </div>
                          <div className="text-xs text-slate-400 text-center">
                            No trades
                          </div>
                        </div>
                      );
                    }
                    
                    const isProfit = weekStat.totalPnl > 0;
                    const isLoss = weekStat.totalPnl < 0;
                    return (
                      <div className="flex flex-col justify-center h-full">
                        <div className="text-xs font-semibold text-[#040028] text-center mb-1">
                          Week {weekStat.weekNumber}
                        </div>
                        <div className={`text-lg font-bold text-center ${isProfit ? 'text-[#10B981]' : isLoss ? 'text-[#EF4444]' : 'text-slate-600'}`}>
                          {formatWeeklyPnl(weekStat.totalPnl)}
                        </div>
                        <div className="text-xs text-slate-600 text-center bg-slate-100 px-2 py-1 rounded-full mt-1">
                          {weekStat.totalTrades} {weekStat.totalTrades === 1 ? 'trade' : 'trades'}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <DayTradeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedDate={modalDate}
          trades={stats?.trades || []}
        />
      )}
    </div>
  );
};

export default Calendar;

