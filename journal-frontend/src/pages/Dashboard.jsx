// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Award, AlertCircle, Info, Check, X, Brain, TrendingUp, Target, Calculator, BarChart3, Activity, Shield, Star } from 'lucide-react';
import { colors, colorUtils } from '../config/colors';
import AISummary from '../components/AISummary';
import EnhancedCalendar from '../components/calendar/EnhancedCalendar';
import { useNavigate } from 'react-router-dom';

import { API_BASE_URL } from '../config';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { calculateSharpeRatio, validateMetricsInputs, calculateSortinoRatio, calculateProfitFactor, calculateMaxDrawdown, calculateSQNWithRMultiples } from '../utils/metrics';
import { useFilter } from '../context/FilterContext';
import { useProfile } from '../context/ProfileContext';
import DarkModeToggle from '../components/DarkModeToggle';
import { 
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ComposedChart,
  Line,
  LineChart,
  RadialBarChart,
  RadialBar,
} from 'recharts';

// Function to convert relative URLs to absolute URLs
const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Convert relative API URLs to absolute URLs
  if (url.startsWith('/api/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
};

const colorClasses = {
  profit: 'text-emerald-600 dark:text-emerald-400',
  loss: 'text-rose-600 dark:text-rose-400',
  neutral: 'text-slate-500 dark:text-slate-400',
};

// Utility formatters - memoized for performance
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
const formatNumber = (val) =>
  val == null ? 'N/A' : parseFloat(val).toFixed(2);

const MetricCard = ({ children, className = "" }) => (
  <div className={`
    group relative overflow-hidden rounded-xl 
    bg-white border border-blue-200/60
    hover:border-blue-300 hover:shadow-lg hover:-translate-y-1
    transition-all duration-300 ease-out
    p-5 min-h-[100px] font-['Inter'] shadow-sm
    ${className}
  `}>
    {/* Content */}
    <div className="relative z-10">
      {children}
    </div>
  </div>
);

export default function Dashboard() {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('all');
  const [error, setError] = useState('');
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [loadingAiSummary, setLoadingAiSummary] = useState(false);
  const [language, setLanguage] = useState('en');
  const [timePeriod, setTimePeriod] = useState('daily');
  const [showCumulative, setShowCumulative] = useState(true);
  const [equityCurveData, setEquityCurveData] = useState([]);
  const [chartType, setChartType] = useState('pie');
  const [portfolioChartType, setPortfolioChartType] = useState('area');


  
  const pnlData = useMemo(() => {
    if (!stats?.pnl_by_date) return [];
    return Array.isArray(stats.pnl_by_date) && stats.pnl_by_date.length > 0
      ? stats.pnl_by_date.map(([dateStr, pnlValue]) => ({
          date: new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          pnl: pnlValue,
        }))
      : [];
  }, [stats?.pnl_by_date]);





  // Process equity curve data - optimized
  const processEquityCurveData = useMemo(() => {
    if (!stats?.equity_curve || !Array.isArray(stats.equity_curve) || stats.equity_curve.length === 0) return [];
    
    const dailyData = stats.equity_curve.map((pt, index, array) => {
      const prevPnl = index > 0 ? array[index - 1].cumulative_pnl : 0;
      const dailyPnl = index > 0 ? pt.cumulative_pnl - prevPnl : pt.cumulative_pnl;
      
      return {
        date: pt.date,
        cumulative_pnl: pt.cumulative_pnl,
        period_pnl: dailyPnl,
        period_return: (dailyPnl / (prevPnl || 1)) * 100,
        type: 'daily'
      };
    });

    const weeklyData = [];
    const weeklyMap = new Map();
    
    dailyData.forEach(item => {
      const date = new Date(item.date);
      const year = date.getFullYear();
      const weekNum = getWeekNumber(date);
      const weekKey = `${year}-W${weekNum.toString().padStart(2, '0')}`;
      
      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          date: getFirstDayOfWeek(date),
          cumulative_pnl: 0,
          period_pnl: 0,
          week: weekNum,
          year: year,
          type: 'weekly'
        });
      }
      
      const weekData = weeklyMap.get(weekKey);
      weekData.period_pnl += item.period_pnl;
      weekData.cumulative_pnl = item.cumulative_pnl;
    });
    
    const monthlyData = [];
    const monthlyMap = new Map();
    
    dailyData.forEach(item => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          date: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(),
          cumulative_pnl: 0,
          period_pnl: 0,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          type: 'monthly'
        });
      }
      
      const monthData = monthlyMap.get(monthKey);
      monthData.period_pnl += item.period_pnl;
      monthData.cumulative_pnl = item.cumulative_pnl;
    });
    
    const yearlyData = [];
    const yearlyMap = new Map();
    
    dailyData.forEach(item => {
      const date = new Date(item.date);
      const yearKey = date.getFullYear().toString();
      
      if (!yearlyMap.has(yearKey)) {
        yearlyMap.set(yearKey, {
          date: new Date(date.getFullYear(), 0, 1).toISOString(),
          cumulative_pnl: 0,
          period_pnl: 0,
          year: date.getFullYear(),
          type: 'yearly'
        });
      }
      
      const yearData = yearlyMap.get(yearKey);
      yearData.period_pnl += item.period_pnl;
      yearData.cumulative_pnl = item.cumulative_pnl;
    });
    
    return {
      daily: dailyData,
      weekly: Array.from(weeklyMap.values()),
      monthly: Array.from(monthlyMap.values()),
      yearly: Array.from(yearlyMap.values())
    };
  }, [stats?.equity_curve]);
  
  // Helper functions
  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  
  function getFirstDayOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString();
  }
  
  const chartData = useMemo(() => {
    if (!processEquityCurveData) return [];
    return processEquityCurveData[timePeriod] || [];
  }, [processEquityCurveData, timePeriod]);
  
  useEffect(() => {
    if (chartData && chartData.length > 0) {
      setEquityCurveData(chartData);
    }
  }, [chartData]);
  
  // Calculate metrics - optimized
  const calculatedMetrics = useMemo(() => {
    if (!stats) return { sharpeRatio: null, sortinoRatio: null, profitFactor: null, maxDrawdown: null };
    
    const dailyData = processEquityCurveData?.daily || [];
    const tradesForMetrics = dailyData.map(day => ({
      pnl: day.period_pnl,
      date: day.date
    }));
    
    // Get initial balance from localStorage
    const savedBalance = localStorage.getItem('initialBalance');
    const initialBalance = savedBalance ? parseFloat(savedBalance) : 10000; // Default to 10000 if not set
    
    const { value: sharpeRatio } = calculateSharpeRatio(tradesForMetrics, initialBalance);
    const { value: sortinoRatio } = calculateSortinoRatio(tradesForMetrics, initialBalance);
    const profitFactor = calculateProfitFactor(tradesForMetrics);
    const maxDrawdown = calculateMaxDrawdown(tradesForMetrics, initialBalance);
    
    return { sharpeRatio, sortinoRatio, profitFactor, maxDrawdown };
  }, [stats, processEquityCurveData]);

  const drawdownHistory = useMemo(() => {
    if (!equityCurveData || equityCurveData.length === 0) return [];

    let peak = -Infinity;
    const history = equityCurveData.map(point => {
      if (point.cumulative_pnl > peak) {
        peak = point.cumulative_pnl;
      }
      const drawdown = peak - point.cumulative_pnl;
      return {
        date: point.date,
        drawdown: -drawdown, // Make drawdown negative
      };
    });

    // Filter to only show periods with actual drawdown
    return history.filter(p => p.drawdown < 0);
  }, [equityCurveData]);

  const performanceRating = useMemo(() => {
    if (!stats) return 'beginner';
    
    const pnl = parseFloat(stats.total_pnl || 0);
    const winRate = parseFloat(stats.win_rate || 0);
    
    if (pnl > 10000 && winRate > 70) return 'elite';
    if (pnl > 5000 && winRate > 60) return 'expert';
    if (pnl > 1000 && winRate > 50) return 'advanced';
    if (pnl > 0 && winRate > 40) return 'intermediate';
    return 'beginner';
  }, [stats]);

  const ratingConfig = useMemo(() => {
    const configs = {
      elite: {
        bgColor: 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/20',
        borderColor: 'border-[#3090FF]',
        textColor: 'text-[#3090FF]',
      },
      expert: {
        bgColor: 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/20',
        borderColor: 'border-[#3090FF]',
        textColor: 'text-[#3090FF]',
      },
      advanced: {
        bgColor: 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/20',
        borderColor: 'border-[#3090FF]',
        textColor: 'text-[#3090FF]',
      },
      intermediate: {
        bgColor: 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/20',
        borderColor: 'border-[#3090FF]',
        textColor: 'text-[#3090FF]',
      },
      beginner: {
        bgColor: 'bg-gradient-to-r from-[#040028]/20 to-[#232CF4]/20',
        borderColor: 'border-[#040028]',
        textColor: 'text-white',
      },
    };
    
    return configs[performanceRating] || configs.beginner;
  }, [performanceRating]);

  const fetchStats = useCallback(async () => {
    if (!activeProfile) return;

    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      
      // Build query parameters from filters (like other pages)
      const queryParams = new URLSearchParams();
      queryParams.append('timeframe', timeframe);
      queryParams.append('profile_id', activeProfile.id);
          
      // Add filter parameters with safe property access
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
      if (filters.variableCombinations?.enabled) queryParams.append('combine_vars', 'true');
      if (filters.variableCombinations?.level) queryParams.append('combination_level', filters.variableCombinations.level);
      if (filters.variableCombinations?.combinations && filters.variableCombinations.combinations.length > 0) queryParams.append('combinations', filters.variableCombinations.combinations.join(','));

      const url = `${API_BASE_URL}/journal/stats?${queryParams.toString()}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('❌ Error fetching stats:', err);
      setError('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, timeframe, filters]);

  useEffect(() => {
    if (activeProfile) {
      fetchStats();
    }
  }, [activeProfile, fetchStats]);

  const fetchAiSummary = useCallback(async () => {
    if (!stats) return;
    setLoadingAiSummary(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/journal/ai-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stats, language }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch AI summary');
      }
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (err) {
      console.error('Error fetching AI summary:', err);
      setAiSummary('Could not load AI summary.');
    } finally {
      setLoadingAiSummary(false);
    }
  }, [stats, language]);

  const winningDaysMetrics = useMemo(() => {
    // If pnl_by_date is empty or has issues, fall back to individual trade calculation
    if (!stats?.pnl_by_date || stats.pnl_by_date.length === 0) {
      console.log('❌ No P&L by date data available, using individual trade data as fallback');
      
      // Use individual trade wins/losses as fallback
      const individualWins = stats?.win_loss?.wins || 0;
      const individualLosses = stats?.win_loss?.losses || 0;
      const totalTrades = individualWins + individualLosses;
      
      const percent = totalTrades > 0 ? (individualWins / totalTrades) * 100 : 0;
      
      console.log(`📈 Fallback Win/Loss Summary (individual trades):`);
      console.log(`  - Individual wins: ${individualWins}`);
      console.log(`  - Individual losses: ${individualLosses}`);
      console.log(`  - Win percentage: ${percent.toFixed(1)}%`);
      
      return { 
        count: individualWins, 
        percent, 
        losingDays: individualLosses, 
        totalTradingDays: totalTrades, 
        breakEvenDays: 0 
      };
    }
    
    console.log('🔍 P&L by date data:', stats.pnl_by_date);
    
    // Calculate win/loss days from pnl_by_date (which contains aggregated daily P&L)
    const winningDays = stats.pnl_by_date.filter(([date, pnl]) => pnl > 0).length;
    const losingDays = stats.pnl_by_date.filter(([date, pnl]) => pnl < 0).length;
    const breakEvenDays = stats.pnl_by_date.filter(([date, pnl]) => pnl === 0).length;
    const totalTradingDays = winningDays + losingDays + breakEvenDays;
    
    console.log(`📈 Win/Loss Days Summary:`);
    console.log(`  - Winning days: ${winningDays}`);
    console.log(`  - Losing days: ${losingDays}`);
    console.log(`  - Break-even days: ${breakEvenDays}`);
    console.log(`  - Total trading days: ${totalTradingDays}`);
    
    const percent = totalTradingDays > 0 ? (winningDays / totalTradingDays) * 100 : 0;
    console.log(`  - Win percentage: ${percent.toFixed(1)}%`);
    
    return { count: winningDays, percent, losingDays, totalTradingDays, breakEvenDays };
  }, [stats?.pnl_by_date, stats?.win_loss]);
  if (loading) {
    return (
      <div className="min-h-screen bg-[#040028] text-white relative flex items-center justify-center">
        <div className="text-center relative z-10">
          <div className="relative w-28 h-28 mx-auto mb-8">
            <div className="absolute inset-0 border-4 border-[#3090FF]/20 rounded-full animate-pulse"></div>
            <div className="absolute inset-2 border-4 border-[#3090FF]/40 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-4 border-2 border-[#232CF4]/30 border-t-transparent rounded-full animate-spin animation-delay-150"></div>
          </div>
          <h3 className="text-3xl font-bold bg-gradient-to-r from-[#3090FF] to-[#232CF4] bg-clip-text text-transparent mb-4">Loading Analytics</h3>
          <p className="text-white/60 text-lg">Preparing your trading dashboard...</p>
          <div className="mt-6 flex justify-center space-x-2">
            <div className="w-2 h-2 bg-[#3090FF] rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-[#232CF4] rounded-full animate-bounce animation-delay-75"></div>
            <div className="w-2 h-2 bg-[#3090FF] rounded-full animate-bounce animation-delay-150"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#040028] text-white relative flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8 relative z-10">
          <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-red-900/30 to-red-900/30 rounded-3xl flex items-center justify-center shadow-xl">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Connection Error</h2>
          <p className="text-lg text-red-400 font-medium mb-8">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-8 py-4 bg-gradient-to-r from-red-600 to-red-600 hover:from-red-700 hover:to-red-700 text-white font-semibold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  if (!stats || stats.total_trades === 0) {
    return (
      <div className="min-h-screen bg-[#040028] text-white relative flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto p-8 relative z-10">
          <div className="w-36 h-36 mx-auto mb-12 bg-gradient-to-br from-[#3090FF]/30 via-[#232CF4]/30 to-[#040028]/30 rounded-3xl flex items-center justify-center shadow-2xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-20 w-20 text-[#3090FF]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-[#3090FF] to-[#232CF4] bg-clip-text text-transparent mb-6">Welcome to Trading Analytics</h2>
          <p className="text-xl text-white/60 mb-12 leading-relaxed">Start by adding your first trade to unlock comprehensive performance insights and advanced analytics.</p>
          <div className="flex items-center justify-center space-x-8 text-sm text-white/60">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-lg"></div>
              <span className="font-medium">Performance Tracking</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-gradient-to-r from-[#3090FF] to-[#232CF4] rounded-full shadow-lg"></div>
              <span className="font-medium">AI Insights</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-gradient-to-r from-[#3090FF] to-[#040028] rounded-full shadow-lg"></div>
              <span className="font-medium">Risk Analysis</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const winLossData = [
    { name: 'Wins', value: stats.win_loss?.wins || 0, color: '#10b981' },
    { name: 'Losses', value: stats.win_loss?.losses || 0, color: '#f43f5e' },
  ];

  const directionData = [
    { name: 'Long Trades', pnl: stats.buy_pnl || 0, trades: Math.floor(stats.total_trades * 0.6) },
    { name: 'Short Trades', pnl: stats.sell_pnl || 0, trades: Math.floor(stats.total_trades * 0.4) },
  ];

  // Calculate Recovery Factor
  const totalPnl = stats?.total_pnl || 0;
  const maxDrawdown = calculatedMetrics.maxDrawdown || 0;
  const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : 0;

  // Calculate SQN (System Quality Number) using R-Multiples
  let sqn = null;
  const tradesForMetrics = stats?.trades || [];
  if (tradesForMetrics.length > 0) {
    sqn = calculateSQNWithRMultiples(tradesForMetrics);
  }

  return (
    <div className="flex min-h-screen bg-gradient-reflect dark bg-slate-50">

      {showAiSummary && (
        <AISummary summary={aiSummary} language={language} onClose={() => setShowAiSummary(false)} />
      )}

      {/* MAIN DASHBOARD CONTENT */}
      <div className="w-full px-8 py-4 relative z-10 bg-slate-50">
      <div className="grid grid-cols-5 gap-4 mt-2">
      {/* Net PNL */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Net P&L</h4>
            </div>
                         <p className={`text-lg font-bold ${stats.total_pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
               {formatCurrency(stats.total_pnl)}
             </p>
            <p className="text-xs font-normal text-slate-600 mt-1">
              {stats.total_pnl_percent ? formatPercent(stats.total_pnl_percent) : ''}
            </p>
          </div>
          <div className="w-16 h-12">
            {pnlData && pnlData.length > 0 && (
              <ResponsiveContainer>
                <AreaChart data={pnlData}>
                  <Area 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke={stats.total_pnl >= 0 ? '#059669' : '#DC2626'} 
                    fill={stats.total_pnl >= 0 ? '#05966920' : '#DC262620'}
                    strokeWidth={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </MetricCard>

      {/* Win Rate */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Win Rate</h4>
            </div>
            <span className="text-lg font-bold text-[#040028] mb-1">{formatPercent(stats.win_rate)}</span>
                          <div className="flex gap-3 text-xs">
                <span className="text-[#10B981] font-normal">{stats.win_loss?.wins || 0} wins</span>
                <span className="text-[#EF4444] font-normal">{stats.win_loss?.losses || 0} losses</span>
              </div>
          </div>
          {/* Simple pie chart */}
          {(() => {
            const winCount = stats.win_loss?.wins || 0;
            const lossCount = stats.win_loss?.losses || 0;
                          const winLossData = [
                { name: 'Wins', value: winCount, color: '#10B981' },
                { name: 'Losses', value: lossCount, color: '#EF4444' },
              ];
            return (
              <div className="w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie
                    data={winLossData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={12}
                    outerRadius={20}
                    stroke="none"
                    paddingAngle={1}
                  >
                    {winLossData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
            );
          })()}
        </div>
      </MetricCard>

      {/* Profit Factor */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Profit Factor</h4>
            </div>
            <div>
              {(() => {
                const pf = stats.profit_factor;
                const isGood = pf >= 1.5;
                                  return (
                    <span className={`text-lg font-bold ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pf === Infinity ? '∞' : pf?.toFixed(2) || 'N/A'}
                    </span>
                  );
              })()}
              <div className="text-xs font-normal text-slate-600 mt-1">
                +{formatCurrency(stats.gross_profit)} / -{formatCurrency(stats.gross_loss)}
              </div>
            </div>
          </div>
          {/* Simple progress bar */}
          <div className="w-16 h-12 flex items-center">
            {(() => {
              const pf = stats.profit_factor;
              const isGood = pf >= 1.5;
              const percent = Math.max(0, Math.min(1, pf / 3)); // Clamp for bar fill
              return (
                <div className="relative w-full h-1.5 bg-[#040028]/20 rounded-full">
                  <div 
                    className={`absolute left-0 top-0 h-1.5 rounded-full ${isGood ? 'bg-emerald-500' : 'bg-red-500'}`} 
                    style={{ width: `${percent * 100}%` }}
                  ></div>
                </div>
              );
            })()}
          </div>
        </div>
      </MetricCard>

      {/* Winning Days */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Award className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">
                Day Win {winningDaysMetrics.percent != null ? winningDaysMetrics.percent.toFixed(0) + '%' : 'N/A'}
              </h4>
            </div>
                          <div className="flex gap-4 text-xs">
              <span className="text-emerald-600 font-normal">{winningDaysMetrics.count || 0} wins</span>
              <span className="text-red-600 font-normal">{winningDaysMetrics.losingDays || 0} losses</span>
            </div>
          </div>
          <div className="w-12 h-12">
            <PieChart width={48} height={48}>
              <Pie
                data={[
                  {value: winningDaysMetrics.count || 0, name: 'Winning Days'},
                  {value: winningDaysMetrics.losingDays || 0, name: 'Losing Days'},
                  ...(winningDaysMetrics.breakEvenDays > 0 ? [{value: winningDaysMetrics.breakEvenDays, name: 'Break-even Days'}] : [])
                ]}
                dataKey="value"
                cx={24}
                cy={24}
                innerRadius={12}
                outerRadius={20}
                paddingAngle={1}
                cornerRadius={2}
                strokeWidth={0}
              >
                <Cell fill="#059669" />
                <Cell fill="#DC2626" />
                {winningDaysMetrics.breakEvenDays > 0 && <Cell fill="#6B7280" />}
              </Pie>
            </PieChart>
          </div>
        </div>
      </MetricCard>

            {/* Best & Worst Trade */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Best / Worst</h4>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-sm font-bold text-emerald-600 block">{formatCurrency(stats.best_trade?.pnl)}</span>
                <span className="text-slate-600 font-normal">Best</span>
              </div>
              <div>
                <span className="text-sm font-bold text-red-600 block">{formatCurrency(stats.worst_trade?.pnl)}</span>
                <span className="text-slate-600 font-normal">Worst</span>
              </div>
            </div>
          </div>
          <div className="w-16 h-12">
            <ResponsiveContainer>
              <BarChart data={[
                { name: 'Best', value: stats.best_trade?.pnl || 0 },
                { name: 'Worst', value: stats.worst_trade?.pnl || 0 }
              ]}>
                <Bar dataKey="value" radius={[1, 1, 1, 1]}>
                  <Cell fill="#059669" />
                  <Cell fill="#DC2626" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </MetricCard>

      {/* Avg Win/Loss */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Avg Win/Loss</h4>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-sm font-bold text-emerald-600 block">{formatCurrency(stats.avg_win)}</span>
                <span className="text-slate-600 font-normal">Avg Win</span>
              </div>
              <div>
                <span className="text-sm font-bold text-red-600 block">{formatCurrency(stats.avg_loss)}</span>
                <span className="text-slate-600 font-normal">Avg Loss</span>
              </div>
            </div>
          </div>
          <div className="w-12 h-12">
            <PieChart width={48} height={48}>
              <Pie
                data={[
                  { name: 'Win', value: Math.abs(stats.avg_win || 0) },
                  { name: 'Loss', value: Math.abs(stats.avg_loss || 0) },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={12}
                outerRadius={20}
                paddingAngle={1}
                dataKey="value"
                stroke="none"
              >
                <Cell key="win" fill="#059669" />
                <Cell key="loss" fill="#DC2626" />
              </Pie>
            </PieChart>
          </div>
        </div>
      </MetricCard>

      {/* Expectancy */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Expectancy</h4>
            </div>
            <div>
              <span className={`text-lg font-bold block ${stats.expectancy >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {stats.expectancy != null ? formatCurrency(stats.expectancy) : 'N/A'}
                
              </span>
              <span className="text-xs font-normal text-slate-600">Per Trade</span>
            </div>
          </div>
          <div className="w-12 h-12 flex items-center justify-center">
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${stats.expectancy >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
              <div className={`w-4 h-4 rounded-full ${stats.expectancy >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            </div>
          </div>
        </div>
      </MetricCard>

      {/* Max Drawdown */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Shield className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Max DD</h4>
            </div>
            <p className="text-lg font-bold text-red-600">
              {(() => {
                if (calculatedMetrics.maxDrawdown == null) return 'N/A';
                
                // Get initial balance from localStorage
                const savedBalance = localStorage.getItem('initialBalance');
                const initialBalance = savedBalance ? parseFloat(savedBalance) : 10000;
                
                // Calculate the peak value (initial balance + max cumulative P&L)
                const dailyData = processEquityCurveData?.daily || [];
                let peak = initialBalance;
                let cumulativePnl = 0;
                
                dailyData.forEach(day => {
                  cumulativePnl += day.period_pnl;
                  const currentEquity = initialBalance + cumulativePnl;
                  if (currentEquity > peak) {
                    peak = currentEquity;
                  }
                });
                
                // Calculate max drawdown as percentage
                const maxDDPercent = peak > 0 ? (calculatedMetrics.maxDrawdown / peak) * 100 : 0;
                
                return formatCurrency(calculatedMetrics.maxDrawdown);
              })()}
            </p>
            <p className="text-sm text-red-500 font-medium">
              {(() => {
                if (calculatedMetrics.maxDrawdown == null) return 'N/A';
                
                // Get initial balance from localStorage
                const savedBalance = localStorage.getItem('initialBalance');
                const initialBalance = savedBalance ? parseFloat(savedBalance) : 10000;
                
                // Calculate the peak value (initial balance + max cumulative P&L)
                const dailyData = processEquityCurveData?.daily || [];
                let peak = initialBalance;
                let cumulativePnl = 0;
                
                dailyData.forEach(day => {
                  cumulativePnl += day.period_pnl;
                  const currentEquity = initialBalance + cumulativePnl;
                  if (currentEquity > peak) {
                    peak = currentEquity;
                  }
                });
                
                // Calculate max drawdown as percentage
                const maxDDPercent = peak > 0 ? (calculatedMetrics.maxDrawdown / peak) * 100 : 0;
                
                return `-${maxDDPercent.toFixed(1)}%`;
              })()}
            </p>
          </div>
          <div className="w-16 h-12">
            {drawdownHistory && drawdownHistory.length > 0 && (
              <ResponsiveContainer>
                <AreaChart data={drawdownHistory}>
                  <Area 
                    type="monotone" 
                    dataKey="drawdown" 
                    stroke="#DC2626" 
                    fill="#DC262620"
                    strokeWidth={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </MetricCard>

      {/* Talaria Score */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <Star className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Rating</h4>
            </div>
            <p className="text-lg font-bold text-amber-600 mb-1">
              {performanceRating ? performanceRating.charAt(0).toUpperCase() + performanceRating.slice(1) : 'N/A'}
            </p>
            <div className="flex space-x-1">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                    i < (performanceRating === 'excellent' ? 5 : performanceRating === 'good' ? 4 : 3) 
                      ? 'bg-amber-500' 
                      : 'bg-[#040028]/20'
                  }`}
                ></div>
              ))}
            </div>
          </div>
          <div className="w-12 h-12 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-amber-500"></div>
            </div>
          </div>
        </div>
      </MetricCard>

      {/* Recovery Factor */}
      <MetricCard>
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Recovery Factor</h4>
            </div>
            <p className={`text-lg font-bold ${recoveryFactor >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
              {recoveryFactor ? recoveryFactor.toFixed(2) : 'N/A'}
            </p>
            <p className="text-xs font-normal text-slate-600">Total P&L / Max DD</p>
          </div>
          <div className="w-12 h-12 flex items-center justify-center">
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${recoveryFactor >= 1 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
              <div className={`w-4 h-4 rounded-full ${recoveryFactor >= 1 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            </div>
          </div>
        </div>
      </MetricCard>
      
    </div>
        <div className="mb-4">
          
        </div>

        {/* ENHANCED CALENDAR SECTION */}
        <div className="mb-6 pt-6 border-t border-slate-200">
          <EnhancedCalendar stats={stats} />
        </div>
        
        {/* ENHANCED CHARTS SECTION */}
        <div className="pt-6 border-t border-slate-200">
          <div className="grid grid-cols-1 gap-6 mb-8">
          {/* Portfolio Equity Curve */}
          <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 hover:shadow-md transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <h3 className="text-xl font-bold text-[#040028]">Portfolio Growth</h3>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <select
                  value={portfolioChartType}
                  onChange={e => setPortfolioChartType(e.target.value)}
                  className="bg-white border border-[#3090FF]/30 text-[#040028] px-3 py-1.5 rounded-md text-sm font-medium focus:ring-2 focus:ring-[#3090FF] focus:border-[#3090FF] shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <option value="area">Area</option>
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                </select>
                <select
                  value={showCumulative ? 'cumulative' : 'period'}
                  onChange={e => setShowCumulative(e.target.value === 'cumulative')}
                  className="bg-white border border-[#3090FF]/30 text-[#040028] px-3 py-1.5 rounded-md text-sm font-medium focus:ring-2 focus:ring-[#3090FF] focus:border-[#3090FF] shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <option value="cumulative">Cumulative</option>
                  <option value="period">{timePeriod === 'daily' ? 'Daily' : timePeriod === 'weekly' ? 'Weekly' : timePeriod === 'monthly' ? 'Monthly' : 'Yearly'}</option>
                </select>
                <select
                  value={timePeriod}
                  onChange={e => setTimePeriod(e.target.value)}
                  className="bg-white border border-[#3090FF]/30 text-[#040028] px-3 py-1.5 rounded-md text-sm font-medium focus:ring-2 focus:ring-[#3090FF] focus:border-[#3090FF] shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              {portfolioChartType === 'bar' ? (
                <BarChart
                  data={equityCurveData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      if (timePeriod === 'weekly') {
                        return `W${getWeekNumber(date)}`;
                      } else if (timePeriod === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'short' });
                      } else if (timePeriod === 'yearly') {
                        return date.getFullYear();
                      }
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${Math.abs(value).toLocaleString()}`}
                    domain={!showCumulative ? [(dataMin) => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']}
                    width={60}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none',
                      borderRadius: '1rem',
                      fontSize: '0.875rem',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                    formatter={(value, name, props) => {
                      const periodType = props.payload?.type || 'daily';
                      const periodLabel = periodType === 'daily' ? 'Daily' : 
                                        periodType === 'weekly' ? 'Weekly' :
                                        periodType === 'monthly' ? 'Monthly' : 'Yearly';
                                        
                      return [
                        `$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                        showCumulative ? 'Portfolio Value' : `${periodLabel} P&L`
                      ];
                    }}
                    labelFormatter={(label, props) => {
                      const date = new Date(label);
                      const periodType = props?.[0]?.payload?.type || 'daily';
                      
                      if (periodType === 'weekly') {
                        const endDate = new Date(date);
                        endDate.setDate(endDate.getDate() + 6);
                        return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      } else if (periodType === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      } else if (periodType === 'yearly') {
                        return date.getFullYear().toString();
                      }
                      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }}
                  />
                  <Bar 
                    dataKey={showCumulative ? 'cumulative_pnl' : 'period_pnl'}
                    fill={stats.total_pnl >= 0 ? '#3090FF' : '#232CF4'}
                    barSize={24}
                    radius={[6, 6, 0, 0]}
                  >
                    {equityCurveData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry[showCumulative ? 'cumulative_pnl' : 'period_pnl'] >= 0 ? '#3090FF' : '#232CF4'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : portfolioChartType === 'area' ? (
                <AreaChart
                  data={equityCurveData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="heroGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stats.total_pnl >= 0 ? '#3090FF' : '#232CF4'} stopOpacity={0.4} />
                      <stop offset="50%" stopColor={stats.total_pnl >= 0 ? '#3090FF' : '#232CF4'} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={stats.total_pnl >= 0 ? '#3090FF' : '#232CF4'} stopOpacity={0} />
                    </linearGradient>
                    
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      if (timePeriod === 'weekly') {
                        return `W${getWeekNumber(date)}`;
                      } else if (timePeriod === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'short' });
                      } else if (timePeriod === 'yearly') {
                        return date.getFullYear();
                      }
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${Math.abs(value).toLocaleString()}`}
                    domain={!showCumulative ? [(dataMin) => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']}
                    width={60}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none',
                      borderRadius: '1rem',
                      fontSize: '0.875rem',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                    formatter={(value, name, props) => {
                      const periodType = props.payload?.type || 'daily';
                      const periodLabel = periodType === 'daily' ? 'Daily' : 
                                        periodType === 'weekly' ? 'Weekly' :
                                        periodType === 'monthly' ? 'Monthly' : 'Yearly';
                                        
                      return [
                        `$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                        showCumulative ? 'Portfolio Value' : `${periodLabel} P&L`
                      ];
                    }}
                    labelFormatter={(label, props) => {
                      const date = new Date(label);
                      const periodType = props?.[0]?.payload?.type || 'daily';
                      
                      if (periodType === 'weekly') {
                        const endDate = new Date(date);
                        endDate.setDate(endDate.getDate() + 6);
                        return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      } else if (periodType === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      } else if (periodType === 'yearly') {
                        return date.getFullYear().toString();
                      }
                      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={showCumulative ? 'cumulative_pnl' : 'period_pnl'}
                    stroke={stats.total_pnl >= 0 ? '#10b981' : '#f43f5e'}
                    fill="url(#heroGradient)"
                    strokeWidth={3}
                    dot={timePeriod === 'daily' && !showCumulative}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              ) : (
                <LineChart
                  data={equityCurveData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      if (timePeriod === 'weekly') {
                        return `W${getWeekNumber(date)}`;
                      } else if (timePeriod === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'short' });
                      } else if (timePeriod === 'yearly') {
                        return date.getFullYear();
                      }
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${Math.abs(value).toLocaleString()}`}
                    domain={!showCumulative ? [(dataMin) => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']}
                    width={60}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none',
                      borderRadius: '1rem',
                      fontSize: '0.875rem',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                    formatter={(value, name, props) => {
                      const periodType = props.payload?.type || 'daily';
                      const periodLabel = periodType === 'daily' ? 'Daily' : 
                                        periodType === 'weekly' ? 'Weekly' :
                                        periodType === 'monthly' ? 'Monthly' : 'Yearly';
                                        
                      return [
                        `$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                        showCumulative ? 'Portfolio Value' : `${periodLabel} P&L`
                      ];
                    }}
                    labelFormatter={(label, props) => {
                      const date = new Date(label);
                      const periodType = props?.[0]?.payload?.type || 'daily';
                      
                      if (periodType === 'weekly') {
                        const endDate = new Date(date);
                        endDate.setDate(endDate.getDate() + 6);
                        return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      } else if (periodType === 'monthly') {
                        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      } else if (periodType === 'yearly') {
                        return date.getFullYear().toString();
                      }
                      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={showCumulative ? 'cumulative_pnl' : 'period_pnl'}
                    stroke={stats.total_pnl >= 0 ? '#059669' : '#DC2626'}
                    strokeWidth={3}
                    dot={timePeriod === 'daily' && !showCumulative}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {/* Recent Trades Table */}
          <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 hover:shadow-md transition-all duration-300">
            <h3 className="text-xl font-bold text-[#040028] mb-6">Recent Activity</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#3090FF]/20">
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Symbol</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Strategy</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Entry Price</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Exit Price</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Quantity</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Notes</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">Screenshots</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">P&L</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-[#040028]/60 uppercase tracking-wider">R:R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3090FF]/10">
                  {stats.recent_trades?.slice(0, 8).map((trade, idx) => (
                    <tr key={idx} className="hover:bg-[#3090FF]/5 transition-colors duration-200">
                      <td className="py-3 px-3 font-bold text-[#040028] text-sm">{trade.symbol || 'N/A'}</td>
                                              <td className="py-3 px-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            (trade.direction === 'Long' || trade.direction === 'long' || trade.direction === 'buy' || trade.direction === 'LONG' || trade.direction === 'BUY') 
                              ? 'bg-[#10B981]/10 text-[#10B981]' 
                              : 'bg-[#EF4444]/10 text-[#EF4444]'
                          }`}>
                            {(trade.direction === 'Long' || trade.direction === 'long' || trade.direction === 'buy' || trade.direction === 'LONG' || trade.direction === 'BUY') ? 'LONG' : 'SHORT'}
                          </span>
                        </td>
                      <td className="py-3 px-3 text-xs font-medium text-[#040028]/60">{trade.date || 'N/A'}</td>
                      <td className="py-3 px-3 text-xs font-medium text-[#040028]/60">{trade.strategy || 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs font-medium text-[#040028]/60">{trade.entry_price !== undefined ? `$${parseFloat(trade.entry_price).toFixed(2)}` : 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs font-medium text-[#040028]/60">{trade.exit_price !== undefined ? `$${parseFloat(trade.exit_price).toFixed(2)}` : 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs font-medium text-[#040028]/60">{trade.quantity !== undefined ? trade.quantity : 'N/A'}</td>
                      <td className="py-3 px-3 text-xs font-medium text-[#040028]/60">{trade.notes || '—'}</td>
                                                                      <td className="py-3 px-3 text-xs font-medium text-[#040028]/60">
                          {trade.pnl > 0 ? (
                            <span className="px-2 py-1 rounded-md font-bold bg-[#10B981]/10 text-[#10B981]">Win</span>
                          ) : trade.pnl < 0 ? (
                            <span className="px-2 py-1 rounded-md font-bold bg-[#EF4444]/10 text-[#EF4444]">Loss</span>
                          ) : (
                            <span className="px-2 py-1 rounded-md font-bold bg-[#040028]/10 text-[#040028]/60">BE</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1">
                            {trade.entry_screenshot && (
                              <a
                                href={getAbsoluteUrl(trade.entry_screenshot)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-xs"
                                title="View Entry Screenshot"
                              >
                                📷
                              </a>
                            )}
                            {trade.exit_screenshot && (
                              <a
                                href={getAbsoluteUrl(trade.exit_screenshot)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-xs"
                                title="View Exit Screenshot"
                              >
                                📷
                              </a>
                            )}
                            {!trade.entry_screenshot && !trade.exit_screenshot && (
                              <span className="text-[#040028]/40 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className={`font-bold text-sm ${trade.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>{formatCurrency(trade.pnl)}</span>
                        </td>
                      <td className="py-3 px-3 text-right text-xs font-bold text-[#040028]/60">{trade.rr != null ? trade.rr : 'N/A'}</td>
                    </tr>
                  )) || []}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}