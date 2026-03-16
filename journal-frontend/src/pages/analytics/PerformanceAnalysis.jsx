import React, { useCallback } from 'react';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import BestPerformers from '../../components/analytics/BestPerformers';
import PerformanceByTime from '../../components/analytics/PerformanceByTime';
import PerformanceByWeek from '../../components/analytics/PerformanceByWeek';
import { 
  RefreshCw,
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


  const handleRefresh = useCallback(() => {
    refreshPerformanceData();
  }, [refreshPerformanceData]);

  // Loading state
  if (loading || performanceLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4 space-y-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-white rounded-xl border border-blue-200/60 p-6"></div>
              ))}
            </div>
            <div className="h-96 bg-white rounded-xl border border-blue-200/60 p-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-80 bg-white rounded-xl border border-blue-200/60 p-6"></div>
              <div className="h-80 bg-white rounded-xl border border-blue-200/60 p-6"></div>
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
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Error Loading Performance Data
                </h3>
                <p className="text-red-700 mb-4">{errorMessage}</p>
                <button
                  onClick={handleRefresh}
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

  // Validate performance data
  if (!performanceData) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                  No Performance Data Available
                </h3>
                <p className="text-yellow-700 mb-4">
                  Please import some trades first to see performance analysis.
                </p>
                <button
                  onClick={handleRefresh}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#040028]">Performance Analysis</h1>
            <p className="mt-1 text-sm text-slate-600">
              Analyze your trading performance and identify your strengths and weaknesses
            </p>
          </div>
          <div className="flex items-center space-x-2 mt-4 md:mt-0">
            <button 
              onClick={() => console.log('Performance Data:', performanceData)}
              className="p-2 text-slate-600 hover:text-[#040028] hover:bg-slate-100 rounded-lg transition-colors"
              title="Debug Data"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button 
              onClick={handleRefresh}
              disabled={loading || performanceLoading}
              className={`inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${(loading || performanceLoading) ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`-ml-1 mr-2 h-4 w-4 ${(loading || performanceLoading) ? 'animate-spin' : ''}`} />
              {(loading || performanceLoading) ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      
        {/* Performance Charts */}
        <div className="space-y-6">
          {/* Interactive Performance Chart */}
          
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            <PerformanceByTime 
              hourlyPerformance={performanceData.hourly_performance} 
              loading={performanceLoading} 
            />
            <PerformanceByWeek 
              weeklyPerformance={performanceData.weekly_performance}
              dailyPerformance={performanceData.daily_performance}
              trades={stats?.trades || []}
              loading={performanceLoading}
            />
          </div>
          
          <BestPerformers 
            bestSetup={performanceData.best_setup}
            bestInstrument={performanceData.best_instrument}
            bestTimeOfDay={performanceData.best_time_of_day}
            bestWeek={performanceData.best_week}
            loading={performanceLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default PerformanceAnalysis;
