import React, { useCallback } from 'react';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import BestPerformers from '../../components/analytics/BestPerformers';
import PerformanceByTime from '../../components/analytics/PerformanceByTime';
import PerformanceByWeek from '../../components/analytics/PerformanceByWeek';
import InteractivePerformanceChart from '../../components/analytics/InteractivePerformanceChart';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Target, 
  Award,
  Calendar,
  RefreshCw,
  Download,
  Filter,
  Settings
} from 'lucide-react';

const PerformanceAnalysis = () => {
  const { 
    loading, 
    error,
    stats,
    performanceData,
    performanceLoading,
    performanceError,
    refreshPerformanceData 
  } = useAnalyticsData();

  // Process weekly performance data for the interactive chart
  const chartData = React.useMemo(() => {
    if (!performanceData?.weekly_performance?.length) {
      console.log('No weekly performance data available');
      return [];
    }
    
    const processedData = performanceData.weekly_performance.map(week => {
      // Create a proper date string in YYYY-MM-DD format
      const dateStr = week.week_start || (week.formatted_range ? week.formatted_range.split(' - ')[0] : null);
      let date = new Date();
      
      try {
        if (dateStr) {
          // Try to parse the date string
          date = new Date(dateStr);
          // If invalid date, use current date as fallback
          if (isNaN(date.getTime())) date = new Date();
        }
      } catch (e) {
        console.error('Error parsing date:', dateStr, e);
        date = new Date();
      }
      
      return {
        date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        timestamp: date.getTime(), // For proper sorting
        pnl: Number(week.pnl) || 0,
        winRate: Number(week.win_rate) || 0,
        trades: Number(week.trades) || 0,
        weekNumber: week.week_num,
        year: week.year,
        formatted_range: week.formatted_range || `Week ${week.week_num}, ${week.year}`
      };
    });
    
    // Sort by timestamp to ensure correct order
    processedData.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log('Processed chart data:', processedData);
    return processedData;
  }, [performanceData?.weekly_performance]);

  const handleRefresh = useCallback(() => {
    refreshPerformanceData();
  }, [refreshPerformanceData]);

  // Loading state
  if (loading || performanceLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-8">
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"></div>
            ))}
          </div>
          <div className="h-96 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || performanceError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Error loading performance data
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                <p>{error?.message || performanceError?.message || 'An unknown error occurred'}</p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-md bg-red-50 dark:bg-red-900/30 px-2 py-1.5 text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-red-50 dark:focus:ring-offset-red-900/30"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
    

  // Error state
  if (error || performanceError) {
    const errorMessage = error || performanceError;
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">
                Error loading performance data: {errorMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={handleRefresh}
                className="text-red-700 dark:text-red-300 hover:text-red-500 dark:hover:text-red-200"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Analysis</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Track and analyze your trading performance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            
          </div>
        </div>
        
        {/* Performance Charts */}
        <div className="space-y-6">
          
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PerformanceByTime 
              hourlyPerformance={performanceData?.hourly_performance || []} 
              loading={performanceLoading} 
            />
            <PerformanceByWeek 
              weeklyPerformance={performanceData?.weekly_performance || []}
              dailyPerformance={performanceData?.daily_performance || []}
              trades={stats?.trades || []}
              loading={performanceLoading}
            />
          </div>
          
          <BestPerformers 
            bestSetup={performanceData?.best_setup}
            bestInstrument={performanceData?.best_instrument}
            bestTimeOfDay={performanceData?.best_time_of_day}
            bestWeek={performanceData?.best_week}
            loading={performanceLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default PerformanceAnalysis;
