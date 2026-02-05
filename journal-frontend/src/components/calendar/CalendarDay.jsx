import React from 'react';

const formatCurrency = (amount) => {
  if (amount === 0) return '-';
  const absAmount = Math.abs(amount);
  return `${amount >= 0 ? '+' : '-'}$${absAmount.toFixed(2)}`;
};

const CalendarDay = React.memo(({ day, onClick = () => {} }) => {
  if (!day) return <div className="calendar-day empty" />;

  const isProfit = day.pnl > 0;
  const isLoss = day.pnl < 0;
  const hasTrades = day.trades > 0;
  const pnlFormatted = formatCurrency(day.pnl);
  
  const dayClasses = [
    'calendar-day',
    !day.isCurrentMonth ? 'other-month' : '',
    day.isToday ? 'today' : '',
    hasTrades ? 'has-trades' : '',
    isProfit ? 'profit-bg' : '',
    isLoss ? 'loss-bg' : '',
  ].filter(Boolean).join(' ');

  const pnlClasses = [
    'pnl-amount',
    isProfit ? 'profit' : '',
    isLoss ? 'loss' : '',
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={`h-24 p-2 bg-white border border-blue-200/60 rounded-lg transition-all duration-200 cursor-default ${
        !day.isCurrentMonth ? 'bg-slate-50 text-slate-400' : ''
      } ${
        day.isToday ? 'border-blue-500 bg-blue-50' : ''
      } ${
        hasTrades ? 'cursor-pointer hover:transform hover:-translate-y-1 hover:shadow-md hover:border-blue-300' : ''
      } ${
        isProfit ? 'bg-gradient-to-b from-green-50 to-white' : ''
      } ${
        isLoss ? 'bg-gradient-to-b from-red-50 to-white' : ''
      }`}
      onClick={() => !day.isFuture && hasTrades && onClick(day)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !day.isFuture && hasTrades && onClick(day)}
    >
      <div className="flex justify-between items-start">
        <span className={`text-sm font-semibold ${
          !day.isCurrentMonth ? 'text-slate-400' : 
          day.isToday ? 'text-blue-600 font-bold' : 
          'text-slate-700'
        }`}>
          {day.day}
        </span>
      </div>
      
      <div className="flex flex-col justify-center items-center h-full gap-1">
        {hasTrades && (
          <>
            <span className={`text-lg font-bold ${
              isProfit ? 'text-[#10B981]' : 
              isLoss ? 'text-[#EF4444]' : 
              'text-slate-600'
            }`}>
              {pnlFormatted}
            </span>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
              {day.trades} {day.trades === 1 ? 'trade' : 'trades'}
            </span>
          </>
          
        )}
        <div className="flex flex-col justify-center items-center h-full gap-1">
            
            </div>
      </div>
    </div>
  );
});

CalendarDay.displayName = 'CalendarDay';
export default CalendarDay;

