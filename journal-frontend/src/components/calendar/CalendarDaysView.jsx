import React, { useMemo } from 'react';
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
  isSameDay
} from 'date-fns';
import CalendarDay from './CalendarDay';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MockCalendarDay = ({ day, onClick }) => {
  const { day: dayNumber, pnl, trades, isCurrentMonth } = day;
  
  return (
    <div className="w-full h-full p-3 flex flex-col items-center justify-between relative" onClick={onClick}>
      <div className="text-sm font-semibold text-[#040028] text-center leading-none">
        {dayNumber}
      </div>
      {isCurrentMonth && trades > 0 && (
        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-semibold shadow-sm">
          <span className="text-[10px]">{trades}</span>
        </div>
      )}
      {isCurrentMonth && pnl !== 0 && (
        <div className={`text-xs font-semibold text-center px-2 py-1 rounded-lg leading-tight shadow-sm ${
          pnl > 0 
            ? 'bg-green-100 text-[#10B981] border border-green-200' 
            : 'bg-red-100 text-[#EF4444] border border-red-200'
        }`}>
          {pnl > 0 ? '+' : ''}{Math.abs(pnl) >= 1000 ? `${(pnl/1000).toFixed(1)}k` : pnl.toFixed(0)}
        </div>
      )}
    </div>
  );
};

const CalendarDaysView = ({ stats }) => {
  const currentDate = new Date();
  const yesterday = subDays(currentDate, 1);
  
  const calendarMatrix = useMemo(() => {
    if (!stats?.pnl_by_date) return [];

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const pnlDataMap = new Map();
    
    // Process P&L data
    if (Array.isArray(stats.pnl_by_date)) {
      stats.pnl_by_date.forEach(([date, pnl]) => {
        if (date && pnl !== undefined) {
          pnlDataMap.set(date, pnl);
        }
      });
    }
    
    // Create a map of trade counts per day
    const tradeCounts = new Map();
    if (stats.trades && Array.isArray(stats.trades)) {
      stats.trades.forEach(trade => {
        try {
          let dateKey;
          if (trade.entry_date) {
            if (typeof trade.entry_date === 'string') {
              dateKey = trade.entry_date.includes('T') 
                ? trade.entry_date.split('T')[0]
                : trade.entry_date;
            } else if (trade.entry_date instanceof Date) {
              dateKey = format(trade.entry_date, 'yyyy-MM-dd');
            }
            
            if (dateKey) {
              tradeCounts.set(dateKey, (tradeCounts.get(dateKey) || 0) + 1);
            }
          }
        } catch (error) {
          console.error('Error processing trade date:', trade.entry_date, error);
        }
      });
    }
    
    const calendarWeeks = [];
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    // Create a fixed date for comparison to avoid modifying the original
    const fixedCurrentDate = new Date(currentDate);
    
    // Iterate through each week
    let currentWeekStart = new Date(calendarStart);
    
    while (currentWeekStart <= calendarEnd) {
      const week = [];
      // For each day in the week
      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentDay.getDate() + i);
        
        const dateKey = format(currentDay, 'yyyy-MM-dd');
        const pnl = pnlDataMap.get(dateKey) || 0;
        const tradesCount = tradeCounts.get(dateKey) || 0;
        
        week.push({
          day: currentDay.getDate(),
          date: new Date(currentDay),
          dateKey,
          pnl: Number(pnl) || 0,
          trades: tradesCount,
          isCurrentMonth: isSameMonth(currentDay, fixedCurrentDate),
          isToday: isToday(currentDay),
          isFuture: isFuture(currentDay),
          isPreviousDay: isSameDay(currentDay, yesterday)
        });
      }
      
      calendarWeeks.push(week);
      // Move to the start of the next week
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    return calendarWeeks;
  }, [stats, currentDate, yesterday]);

  // Generate empty matrix if no data
  if (calendarMatrix.length === 0) {
    // Create empty weeks for the current month
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    let currentDate = new Date(startDate);
    const weeks = [];
    
    while (currentDate <= endDate) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentDate);
        const dateKey = format(dayDate, 'yyyy-MM-dd');
        
        week.push({
          day: dayDate.getDate(),
          date: dayDate,
          dateKey,
          pnl: 0,
          trades: 0,
          isCurrentMonth: isSameMonth(dayDate, currentDate),
          isToday: isToday(dayDate),
          isFuture: isFuture(dayDate),
          isPreviousDay: isSameDay(dayDate, yesterday)
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate = new Date(currentDate); // Create new date object to avoid reference issues
      }
      weeks.push(week);
    }
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 overflow-hidden">
        <div className="p-6 border-b border-blue-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-2xl font-bold text-[#040028]">{format(currentDate, 'MMMM yyyy')}</h2>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
                <span className="text-sm font-medium text-slate-600">Profit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]"></div>
                <span className="text-sm font-medium text-slate-600">Loss</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                <span className="text-sm font-medium text-slate-600">Trades</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-sm font-semibold text-slate-600 uppercase tracking-wide">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-rows-6 gap-2">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-2">
                {week.map((day, dayIndex) => (
                  <div 
                    key={dayIndex}
                    className={`h-24 bg-white border border-blue-200/60 rounded-lg transition-all duration-200 cursor-default ${
                      !day.isCurrentMonth ? 'bg-slate-50 text-slate-400' : ''
                    } ${
                      day.isToday ? 'border-blue-500 bg-blue-50' : ''
                    } ${
                      day.isPreviousDay ? 'bg-blue-50 border-blue-200' : ''
                    } ${
                      day.isFuture ? 'bg-slate-50 text-slate-400' : ''
                    }`}
                  >
                    <MockCalendarDay day={day} onClick={() => {}} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 overflow-hidden">
      <div className="p-6 border-b border-blue-200/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-bold text-[#040028]">{format(currentDate, 'MMMM yyyy')}</h2>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
              <span className="text-sm font-medium text-slate-600">Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#EF4444]"></div>
              <span className="text-sm font-medium text-slate-600">Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-600"></div>
              <span className="text-sm font-medium text-slate-600">Trades</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-sm font-semibold text-slate-600 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="grid grid-rows-6 gap-2">
          {calendarMatrix.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-2">
              {week.map((day, dayIndex) => (
                <div 
                  key={dayIndex} 
                  className={`h-24 bg-white border border-blue-200/60 rounded-lg transition-all duration-200 cursor-default hover:transform hover:-translate-y-1 hover:shadow-md hover:border-blue-300 ${
                    !day.isCurrentMonth ? 'bg-slate-50 text-slate-400' : ''
                  } ${
                    day.isToday ? 'border-blue-500 bg-blue-50' : ''
                  } ${
                    day.isPreviousDay ? 'bg-blue-50 border-blue-200' : ''
                  } ${
                    day.isFuture ? 'bg-slate-50 text-slate-400' : ''
                  } ${
                    day.isCurrentMonth && day.trades > 0 ? 'cursor-pointer' : ''
                  }`}
                >
                  <MockCalendarDay 
                    day={day} 
                    onClick={() => {}} 
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarDaysView;