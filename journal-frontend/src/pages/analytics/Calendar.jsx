import React from 'react';
import CalendarComponent from '../../components/calendar/Calendar';
import useAnalyticsData from '../../hooks/useAnalyticsData';

const Calendar = () => {
  const { stats, loading, error, refreshData } = useAnalyticsData('calendar');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600 mb-2">
               Calendar
            </h1>
            <p className="text-slate-600">
              Visualize your trading activity and performance by date
            </p>
          </div>
        </div>
        
        <CalendarComponent />
      </div>
    </div>
  );
};

export default Calendar;
