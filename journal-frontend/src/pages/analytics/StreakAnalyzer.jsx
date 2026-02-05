import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { useFilter } from '../../context/FilterContext';
import { useProfile } from '../../context/ProfileContext';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart2,
  RefreshCw,
  AlertCircle,
  Activity,
  Shield,
  Star,
  Minus,
  Plus,
  Target
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';

// Helper functions
const formatCurrency = (val) =>
  val == null ? 'N/A' : `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;



const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch (e) {
    return dateStr;
  }
};

// Minimal Card Component
const MinimalCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendText, 
  isLoading = false,
  className = '',
  children
}) => {
  if (isLoading) {
    return (
      <div className={`bg-white border border-blue-200/60 rounded-xl p-6 animate-pulse ${className}`}>
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
        <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-slate-100 rounded w-5/6"></div>
      </div>
    );
  }

  return (
    <div className={`group bg-white border border-blue-200/60 rounded-xl p-6 hover:shadow-md transition-all duration-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">{title}</h3>
        {Icon && (
          <div className="p-1.5 rounded-lg bg-slate-100">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
        )}
      </div>

      {/* Main Value */}
      <div className="flex items-baseline space-x-2 mb-2">
        <p className="text-2xl font-bold text-[#040028] leading-none">{value}</p>
        {trend && (
          <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            trend > 0 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-slate-600 text-sm leading-relaxed mb-3">{subtitle}</p>
      )}

      {/* Trend Text */}
      {trendText && (
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Activity className="h-3 w-3 text-slate-400" />
          <span>{trendText}</span>
        </div>
      )}

      {/* Additional Content */}
      {children}
    </div>
  );
};

// Minimal Progress Bar
const MinimalProgressBar = ({ value, max = 100, className = '' }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-xs text-slate-600">
        <span>Progress</span>
        <span className="font-medium">{Math.round(percentage)}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <div 
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

/**
 * Prepares streak distribution data for charting
 * @param {Array} streaks - Array of streak objects
 * @returns {Array} Array of objects with length and count for each streak length
 */
const prepareStreakDistributionData = (streaks) => {
  console.log('Preparing distribution data for streaks:', JSON.parse(JSON.stringify(streaks)));
  
  if (!streaks || !Array.isArray(streaks) || streaks.length === 0) {
    console.log('No streak data provided to prepareStreakDistributionData');
    return [];
  }

  // Count streaks by length (include all streaks)
  const distribution = {};
  
  streaks.forEach((streak, index) => {
    try {
      // Log the structure of the first few streaks for debugging
      if (index < 3) {
        console.log(`Streak ${index + 1} structure:`, {
          keys: Object.keys(streak),
          values: Object.entries(streak).map(([key, value]) => `${key}: ${value}`)
        });
      }
      
      // Check both 'length' and 'count' properties for backward compatibility
      const streakLength = streak.length || streak.count || streak.streak_length || 0;
      console.log(`Streak ${index + 1} length:`, streakLength);
      
      if (streakLength >= 1) {
        distribution[streakLength] = (distribution[streakLength] || 0) + 1;
      }
    } catch (error) {
      console.error(`Error processing streak at index ${index}:`, error, streak);
    }
  });

  // Get all streak lengths that exist in the data
  const allLengths = Object.keys(distribution).map(Number).sort((a, b) => a - b);
  
  if (allLengths.length === 0) {
    console.log('No valid streak lengths found');
    return [];
  }
  
  // Create a data point for each streak length from 1 up to the maximum length found
  const maxLength = Math.max(...allLengths);
  const result = [];
  
  console.log('Streak length distribution:', distribution);
  console.log('All lengths:', allLengths);
  console.log('Max length:', maxLength);
  
  // Only show streak lengths that repeat more than 2 times (count >= 3)
  for (let length = 1; length <= maxLength; length++) {
    const count = distribution[length] || 0;
    if (count >= 2) { // Only include streaks that repeat 3 or more times
      result.push({
        length: length,
        count: count,
        label: length.toString(),
        isHighlighted: length % 5 === 0 // Highlight every 5th bar for better readability
      });
    }
  }
  
  console.log('Processed distribution data:', result);
  return result;
};

const StreakAnalyzer = () => {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streakData, setStreakData] = useState(null);
  const [timeframe] = useState('all');
  const [showDetails, setShowDetails] = useState(false);
  
  const isBacktest = activeProfile?.mode === 'backtest';

  const processStreakData = (data) => {
    console.log('Raw API response:', JSON.parse(JSON.stringify(data)));
    
    // Calculate win rate from the API data
    const totalTrades = data.total_trades || 0;
    const winningTrades = data.winning_trades || 0;
    const winRate = data.win_rate || 0;
    
    console.log('Calculated metrics:', { totalTrades, winningTrades, winRate });

    return {
      ...data,
      win_rate: winRate,
      total_trades: totalTrades,
      winning_trades: winningTrades
    };
  };

  const fetchStreakData = React.useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      
              // Add filter parameters
        if (filters.dateRange?.start) queryParams.append('from_date', filters.dateRange.start);
        if (filters.dateRange?.end) queryParams.append('to_date', filters.dateRange.end);
        if (filters.symbol && filters.symbol.length > 0) queryParams.append('symbols', filters.symbol.join(','));
        if (filters.direction && filters.direction.length > 0) queryParams.append('directions', filters.direction.join(','));
        if (filters.strategy && filters.strategy.length > 0) queryParams.append('strategies', filters.strategy.join(','));
        if (filters.setup && filters.setup.length > 0) queryParams.append('setups', filters.setup.join(','));
        if (filters.pnlRange?.min !== '') queryParams.append('min_pnl', filters.pnlRange.min);
        if (filters.pnlRange?.max !== '') queryParams.append('max_pnl', filters.pnlRange.max);
        if (filters.rrRange?.min !== '') queryParams.append('min_rr', filters.rrRange.min);
        if (filters.rrRange?.max !== '') queryParams.append('max_rr', filters.rrRange.max);
        if (filters.importBatch && filters.importBatch.length > 0) queryParams.append('batch_ids', filters.importBatch.join(','));
        if (filters.timeOfDay && filters.timeOfDay.length > 0) queryParams.append('time_of_day', filters.timeOfDay.join(','));
        if (filters.dayOfWeek && filters.dayOfWeek.length > 0) queryParams.append('day_of_week', filters.dayOfWeek.join(','));
        if (filters.month && filters.month.length > 0) queryParams.append('month', filters.month.join(','));
        if (filters.year && filters.year.length > 0) queryParams.append('year', filters.year.join(','));
        if (filters.variables && Object.keys(filters.variables).length > 0) queryParams.append('variables', JSON.stringify(filters.variables));
      
      const url = `${API_BASE_URL}/journal/streaks?${queryParams.toString()}`;
      console.log('StreakAnalyzer: Fetching with filters:', url);
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch streak data');
      }
      
      const data = await response.json();
      console.log('Raw Streak API Response:', data);
      
      // Process the streak data
      const processedData = processStreakData(data);
      setStreakData(processedData);
      setError('');
    } catch (err) {
      console.error('Error fetching streak data:', err);
      setError('Failed to load streak data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStreakData();
  }, [fetchStreakData]);

  // Function to render a single streak history item
  const renderStreakHistoryItem = (streak, index, type) => {
    if (!streak) return null;
    
    const isWin = type === 'winning';
    
    return (
      <div key={`${type}-${index}`} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {isWin ? (
                <TrendingUp className="h-4 w-4 text-green-700 dark:text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-700 dark:text-red-400" />
              )}
            </div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">
                {streak.count} {streak.count === 1 ? 'Trade' : 'Trades'}
              </span>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatDate(streak.start_date)} - {formatDate(streak.end_date)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-bold ${isWin ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(streak.pnl || 0)}
            </div>
            <div className={`text-xs rounded-full px-2 py-0.5 mt-1 ${isWin ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
              {streak.count} {streak.count === 1 ? 'day' : 'days'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Winning Streak Distribution Chart
  const WinningStreakDistributionChart = () => {
    if (!streakData) return null;

    const winningStreaks = streakData.winning_streaks || [];
    const distributionData = prepareStreakDistributionData(winningStreaks);

    if (distributionData.length === 0) {
      return (
        <div className="bg-white border border-blue-200/60 rounded-xl p-8 text-center">
          <TrendingUp className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#040028] mb-2">No Winning Streak Data</h3>
          <p className="text-slate-600 text-sm">Start winning trades to see your winning streak distribution</p>
        </div>
      );
    }

    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg">
            <p className="text-[#040028] font-medium">{`Win Streak Length: ${label}`}</p>
            <p className="text-slate-600">{`Count: ${payload[0].value}`}</p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="bg-white border border-blue-200/60 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-medium text-[#040028] mb-1 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
              Winning Streak Distribution
            </h3>
            <p className="text-slate-600 text-sm">Frequency of different winning streak lengths</p>
          </div>
          <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            {distributionData.reduce((sum, item) => sum + item.count, 0)} winning streaks
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="length" 
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]}
                background={{ fill: 'transparent' }}
              >
                {distributionData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isHighlighted ? "#10B981" : "#10B981"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // Losing Streak Distribution Chart
  const LosingStreakDistributionChart = () => {
    if (!streakData) return null;

    const losingStreaks = streakData.losing_streaks || [];
    const distributionData = prepareStreakDistributionData(losingStreaks);

    if (distributionData.length === 0) {
      return (
        <div className="bg-white border border-blue-200/60 rounded-xl p-8 text-center">
          <TrendingDown className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#040028] mb-2">No Losing Streak Data</h3>
          <p className="text-slate-600 text-sm">Great! No losing streaks to display</p>
        </div>
      );
    }

    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 shadow-lg">
            <p className="text-gray-900 dark:text-white font-medium">{`Loss Streak Length: ${label}`}</p>
            <p className="text-gray-600 dark:text-gray-400">{`Count: ${payload[0].value}`}</p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1 flex items-center">
              <TrendingDown className="h-5 w-5 mr-2 text-red-500 dark:text-red-400" />
              Losing Streak Distribution
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Frequency of different losing streak lengths</p>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            {distributionData.reduce((sum, item) => sum + item.count, 0)} losing streaks
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-800" />
              <XAxis 
                dataKey="length" 
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]}
                className="fill-red-500 dark:fill-red-600"
              >
                {distributionData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    className={entry.isHighlighted ? "fill-red-600 dark:fill-red-500" : "fill-red-500 dark:fill-red-600"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderStreakCards = () => {
    if (!streakData) return null;

    // Provide safe defaults for all streak data
    const current_streak = streakData.current_streak || { type: null, count: 0, start_date: null, end_date: null };
    const longest_winning_streak = streakData.longest_winning_streak || { count: 0, pnl: 0, start_date: null, end_date: null };
    const longest_losing_streak = streakData.longest_losing_streak || { count: 0, pnl: 0, start_date: null, end_date: null };
    
    // Get recent streaks (up to 5 each)
    const recentWinningStreaks = (streakData.winning_streaks || []).slice(0, 5);
    const recentLosingStreaks = (streakData.losing_streaks || []).slice(0, 5);
    
    const isWinningStreak = current_streak?.type === 'winning';
    const isLosingStreak = current_streak?.type === 'losing';

    return (
      <div className="space-y-6">

        {/* Main Stats Grid */}
        <div className={`grid gap-6 mb-8 ${isBacktest ? 'grid-cols-1 md:grid-cols-1 lg:grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2'}`}>
          {/* Current Streak - Hidden in backtest mode */}
          {!isBacktest && (
            <MinimalCard
              title="Current Streak"
              value={
                isWinningStreak ? `${current_streak.count} Wins` :
                isLosingStreak ? `${current_streak.count} Losses` :
                "No Active Streak"
              }
              subtitle={
                isWinningStreak || isLosingStreak 
                  ? formatDate(current_streak.start_date)
                  : 'No active streak'
              }
              icon={isWinningStreak ? TrendingUp : isLosingStreak ? TrendingDown : Target}
              trendText={
                isWinningStreak ? `${current_streak.count} consecutive wins` :
                isLosingStreak ? `${current_streak.count} consecutive losses` :
                'Start trading'
              }
              isLoading={loading}
            />
          )}

         
           

          
        </div>

        {/* Separate Bar Charts Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          <WinningStreakDistributionChart />
          <LosingStreakDistributionChart />
        </div>

        {/* Detailed Analysis */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Winning Streaks */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#040028] flex items-center">
                <div className="p-2 rounded-md bg-slate-100 mr-3">
                  <TrendingUp className="h-5 w-5 text-slate-600" />
                </div>
                Winning Streaks
              </h2>
              <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded">
                {recentWinningStreaks.length} recent
              </div>
            </div>

            <MinimalCard
              title="Longest Win Streak"
              value={`${longest_winning_streak.count} Consecutive Wins`}
              subtitle={
                longest_winning_streak.start_date 
                  ? `${formatDate(longest_winning_streak.start_date)} - ${formatDate(longest_winning_streak.end_date)}`
                  : 'No winning streaks recorded'
              }
              icon={Star}
              trendText={`Generated ${formatCurrency(longest_winning_streak.pnl)} in profits`}
              isLoading={loading}
            />

            {/* Recent Wins - Hidden in backtest mode */}
            {!isBacktest && (
              <div className="bg-white border border-blue-200/60 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-[#040028]">Recent Wins</h3>
                  <button 
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center space-x-1 text-xs text-slate-600 hover:text-[#040028] transition-colors"
                  >
                    {showDetails ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    <span>{showDetails ? 'Show Less' : 'Show More'}</span>
                  </button>
                </div>
                
                <div className="space-y-3">
                  {recentWinningStreaks.length > 0 ? (
                    recentWinningStreaks.slice(0, showDetails ? 5 : 3).map((streak, index) => 
                      renderStreakHistoryItem(streak, index, 'winning')
                    )
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No winning streaks yet</p>
                      <p className="text-xs">Start trading to build your first winning streak</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Losing Streaks */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#040028] flex items-center">
                <div className="p-2 rounded-md bg-slate-100 mr-3">
                  <TrendingDown className="h-5 w-5 text-slate-600" />
                </div>
                Losing Streaks
              </h2>
              <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded">
                {recentLosingStreaks.length} recent
              </div>
            </div>

            <MinimalCard
              title="Longest Loss Streak"
              value={`${longest_losing_streak.count} Consecutive Losses`}
              subtitle={
                longest_losing_streak.start_date 
                  ? `${formatDate(longest_losing_streak.start_date)} - ${formatDate(longest_losing_streak.end_date)}`
                  : 'No losing streaks recorded'
              }
              icon={Shield}
              trendText={`Total loss: ${formatCurrency(longest_losing_streak.pnl)}`}
              isLoading={loading}
            />

            {/* Recent Losses - Hidden in backtest mode */}
            {!isBacktest && (
              <div className="bg-white border border-blue-200/60 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-[#040028]">Recent Losses</h3>
                  <div className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    Risk Analysis
                  </div>
                </div>
                
                <div className="space-y-3">
                  {recentLosingStreaks.length > 0 ? (
                    recentLosingStreaks.slice(0, showDetails ? 5 : 3).map((streak, index) => 
                      renderStreakHistoryItem(streak, index, 'losing')
                    )
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No losing streaks</p>
                      <p className="text-xs">Excellent risk management</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        
      </div>
    );
  };

  // Render main component
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Unable to Load Data
                </h3>
                <p className="text-red-700 mb-4">{error}</p>
                <button
                  onClick={fetchStreakData}
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#040028]">Streak Analysis</h1>
            <p className="mt-1 text-sm text-slate-600">
              Track your trading consistency and performance patterns
            </p>
          </div>
          <div className="flex items-center space-x-2 mt-4 md:mt-0">
            <button 
              onClick={fetchStreakData}
              disabled={loading}
              className={`inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`-ml-1 mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Main Content */}
        {renderStreakCards()}
      </div>
    </div>
  );
};

export default StreakAnalyzer;

