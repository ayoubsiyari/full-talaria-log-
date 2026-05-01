import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Award, TrendingUp, Target, Calculator, Activity, Shield, Star, BarChart3, Brain, BookOpen, Upload, Play, ArrowRight, Crown } from 'lucide-react';
import AISummary from '../components/AISummary';
import EnhancedCalendar from '../components/calendar/EnhancedCalendar';
import { Link } from 'react-router-dom';

import { API_BASE_URL } from '../config';
import { Tooltip as RechartsTooltip } from 'recharts';
import { calculateSharpeRatio, calculateSortinoRatio, calculateProfitFactor, calculateMaxDrawdown } from '../utils/metrics';
import { useFilter } from '../context/FilterContext';
import { useProfile } from '../context/ProfileContext';
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
  Line,
  LineChart,
} from 'recharts';

const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${API_BASE_URL}${url}`;
  return url;
};

const formatCurrency = (val) => {
  if (val == null) return 'N/A';
  const num = parseFloat(val);
  if (Math.abs(num) >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (Math.abs(num) >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
};
const formatPercent = (val) =>
  val == null ? 'N/A' : `${parseFloat(val).toFixed(1)}%`;

const MetricCard = ({ children, className = "" }) => (
  <div className={`
    group relative overflow-hidden rounded-xl
    bg-cyan-950/40/[0.03] border border-white/[0.08]
    hover:border-white/[0.15] hover:bg-cyan-950/40/[0.05]
    transition-all duration-300 ease-out
    p-5 min-h-[100px] font-['Inter']
    ${className}
  `}>
    <div className="relative z-10">{children}</div>
  </div>
);

const QuickActionCard = ({ icon: Icon, title, description, href, color }) => (
  <a
    href={href}
    className="group flex items-center gap-4 rounded-xl bg-cyan-950/40/[0.03] border border-white/[0.08] hover:border-white/[0.15] hover:bg-cyan-950/40/[0.05] transition-all duration-300 p-4"
  >
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">{title}</div>
      <div className="text-xs text-white/30">{description}</div>
    </div>
    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
  </a>
);

export default function Dashboard() {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
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
  const [portfolioChartType, setPortfolioChartType] = useState('area');
  const [backtestSessions, setBacktestSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
    } catch (e) { return {}; }
  }, []);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const pnlData = useMemo(() => {
    if (!stats?.pnl_by_date) return [];
    return Array.isArray(stats.pnl_by_date) && stats.pnl_by_date.length > 0
      ? stats.pnl_by_date.map(([dateStr, pnlValue]) => ({
          date: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          pnl: pnlValue,
        }))
      : [];
  }, [stats?.pnl_by_date]);

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

    const aggregate = (keyFn, dateFn, type) => {
      const map = new Map();
      dailyData.forEach(item => {
        const key = keyFn(item);
        if (!map.has(key)) {
          map.set(key, { date: dateFn(item), cumulative_pnl: 0, period_pnl: 0, type });
        }
        const d = map.get(key);
        d.period_pnl += item.period_pnl;
        d.cumulative_pnl = item.cumulative_pnl;
      });
      return Array.from(map.values());
    };

    return {
      daily: dailyData,
      weekly: aggregate(
        item => { const d = new Date(item.date); return `${d.getFullYear()}-W${getWeekNumber(d)}`; },
        item => getFirstDayOfWeek(new Date(item.date)),
        'weekly'
      ),
      monthly: aggregate(
        item => { const d = new Date(item.date); return `${d.getFullYear()}-${d.getMonth()}`; },
        item => new Date(new Date(item.date).getFullYear(), new Date(item.date).getMonth(), 1).toISOString(),
        'monthly'
      ),
      yearly: aggregate(
        item => new Date(item.date).getFullYear().toString(),
        item => new Date(new Date(item.date).getFullYear(), 0, 1).toISOString(),
        'yearly'
      ),
    };
  }, [stats?.equity_curve]);

  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
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
    if (chartData && chartData.length > 0) setEquityCurveData(chartData);
  }, [chartData]);

  const calculatedMetrics = useMemo(() => {
    if (!stats) return { sharpeRatio: null, sortinoRatio: null, profitFactor: null, maxDrawdown: null };
    const dailyData = processEquityCurveData?.daily || [];
    const tradesForMetrics = dailyData.map(day => ({ pnl: day.period_pnl, date: day.date }));
    const savedBalance = localStorage.getItem('initialBalance');
    const initialBalance = savedBalance ? parseFloat(savedBalance) : 10000;
    const { value: sharpeRatio } = calculateSharpeRatio(tradesForMetrics, initialBalance);
    const { value: sortinoRatio } = calculateSortinoRatio(tradesForMetrics, initialBalance);
    const profitFactor = calculateProfitFactor(tradesForMetrics);
    const maxDrawdown = calculateMaxDrawdown(tradesForMetrics, initialBalance);
    return { sharpeRatio, sortinoRatio, profitFactor, maxDrawdown };
  }, [stats, processEquityCurveData]);

  const drawdownHistory = useMemo(() => {
    if (!equityCurveData || equityCurveData.length === 0) return [];
    let peak = -Infinity;
    return equityCurveData.map(point => {
      if (point.cumulative_pnl > peak) peak = point.cumulative_pnl;
      return { date: point.date, drawdown: -(peak - point.cumulative_pnl) };
    }).filter(p => p.drawdown < 0);
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

  const fetchStats = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams();
      queryParams.append('timeframe', timeframe);
      queryParams.append('profile_id', activeProfile.id);
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
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
      setStats(await res.json());
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, timeframe, filters]);

  useEffect(() => { if (activeProfile) fetchStats(); }, [activeProfile, fetchStats]);

  const fetchBacktestSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/sessions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBacktestSessions((data.sessions || []).slice(0, 3));
      }
    } catch (e) { /* silent */ }
    finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { fetchBacktestSessions(); }, [fetchBacktestSessions]);

  const fetchAiSummary = useCallback(async () => {
    if (!stats) return;
    setLoadingAiSummary(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/journal/ai-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stats, language }),
      });
      if (!res.ok) throw new Error('Failed to fetch AI summary');
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (err) {
      setAiSummary('Could not load AI summary.');
    } finally {
      setLoadingAiSummary(false);
    }
  }, [stats, language]);

  const winningDaysMetrics = useMemo(() => {
    if (!stats?.pnl_by_date || stats.pnl_by_date.length === 0) {
      const individualWins = stats?.win_loss?.wins || 0;
      const individualLosses = stats?.win_loss?.losses || 0;
      const totalTrades = individualWins + individualLosses;
      const percent = totalTrades > 0 ? (individualWins / totalTrades) * 100 : 0;
      return { count: individualWins, percent, losingDays: individualLosses, totalTradingDays: totalTrades, breakEvenDays: 0 };
    }
    const winningDays = stats.pnl_by_date.filter(([, pnl]) => pnl > 0).length;
    const losingDays = stats.pnl_by_date.filter(([, pnl]) => pnl < 0).length;
    const breakEvenDays = stats.pnl_by_date.filter(([, pnl]) => pnl === 0).length;
    const totalTradingDays = winningDays + losingDays + breakEvenDays;
    const percent = totalTradingDays > 0 ? (winningDays / totalTradingDays) * 100 : 0;
    return { count: winningDays, percent, losingDays, totalTradingDays, breakEvenDays };
  }, [stats?.pnl_by_date, stats?.win_loss]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#030014] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-cyan-400/20 rounded-full animate-pulse"></div>
            <div className="absolute inset-2 border-4 border-cyan-400/40 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h3 className="text-xl font-semibold text-white/80 mb-2">Loading Dashboard</h3>
          <p className="text-white/30 text-sm">Preparing your analytics...</p>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="min-h-screen bg-[#030014] text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/10 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>
          <p className="text-red-400/80 text-sm mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-cyan-500/10 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-cyan-500/12 transition-all">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (!stats || stats.total_trades === 0) {
    return (
      <div className="min-h-screen bg-[#030014] text-white flex items-center justify-center">
        <div className="text-center max-w-lg mx-auto p-8">
          <div className="w-20 h-20 mx-auto mb-8 bg-cyan-500/10 rounded-2xl flex items-center justify-center">
            <BarChart3 className="w-10 h-10 text-cyan-300" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Welcome to Trading Analytics</h2>
          <p className="text-white/40 text-base mb-8 leading-relaxed">Start by adding your first trade to unlock performance insights and analytics.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/import-trades" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500/100 transition-all">
              <Upload className="w-4 h-4" /> Import Trades
            </Link>
            <Link to="/journal" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white/60 bg-cyan-950/40/[0.05] border border-white/[0.08] hover:bg-cyan-950/40/[0.08] transition-all">
              <BookOpen className="w-4 h-4" /> Add Manually
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Computed values for main render ---
  const totalPnl = stats?.total_pnl || 0;
  const maxDD = calculatedMetrics.maxDrawdown || 0;
  const recoveryFactor = maxDD > 0 ? totalPnl / maxDD : 0;

  const getMaxDDPercent = () => {
    if (calculatedMetrics.maxDrawdown == null) return 'N/A';
    const savedBalance = localStorage.getItem('initialBalance');
    const initialBalance = savedBalance ? parseFloat(savedBalance) : 10000;
    const dailyData = processEquityCurveData?.daily || [];
    let peak = initialBalance;
    let cumulativePnl = 0;
    dailyData.forEach(day => {
      cumulativePnl += day.period_pnl;
      const currentEquity = initialBalance + cumulativePnl;
      if (currentEquity > peak) peak = currentEquity;
    });
    const pct = peak > 0 ? (calculatedMetrics.maxDrawdown / peak) * 100 : 0;
    return `-${pct.toFixed(1)}%`;
  };

  const tooltipStyle = {
    backgroundColor: '#0f1629',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.75rem',
    fontSize: '0.8rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  };

  const tickFormatter = (value) => {
    const date = new Date(value);
    if (timePeriod === 'weekly') return `W${getWeekNumber(date)}`;
    if (timePeriod === 'monthly') return date.toLocaleDateString('en-US', { month: 'short' });
    if (timePeriod === 'yearly') return date.getFullYear();
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const labelFormatter = (label, props) => {
    const date = new Date(label);
    const periodType = props?.[0]?.payload?.type || 'daily';
    if (periodType === 'weekly') {
      const endDate = new Date(date); endDate.setDate(endDate.getDate() + 6);
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (periodType === 'monthly') return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (periodType === 'yearly') return date.getFullYear().toString();
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const valueFormatter = (value, name, props) => {
    const pt = props.payload?.type || 'daily';
    const pl = pt === 'daily' ? 'Daily' : pt === 'weekly' ? 'Weekly' : pt === 'monthly' ? 'Monthly' : 'Yearly';
    return [`$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, showCumulative ? 'Portfolio Value' : `${pl} P&L`];
  };

  const chartDataKey = showCumulative ? 'cumulative_pnl' : 'period_pnl';

  return (
    <div className="min-h-screen bg-[#030014]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_55%)]" />
      </div>

      {showAiSummary && (
        <AISummary summary={aiSummary} language={language} onClose={() => setShowAiSummary(false)} />
      )}

      <div className="w-full px-6 lg:px-8 py-6 relative z-10">

        {/* ═══ WELCOME HEADER ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {greeting}, <span className="text-white/80">{currentUser.name || 'Trader'}</span>
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              {currentUser.subscription?.plan_name ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                  <Crown className="w-3 h-3" />
                  {currentUser.subscription.plan_name}
                </span>
              ) : currentUser.has_journal_access ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Active
                </span>
              ) : null}
              {currentUser.created_at && (
                <span className="text-xs text-white/25">
                  Member since {new Date(currentUser.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/settings" className="text-xs text-white/30 hover:text-white/60 border border-white/[0.08] rounded-lg px-3 py-2 transition-colors">
              Manage Subscription
            </Link>
          </div>
        </div>

        {/* ═══ QUICK ACTIONS ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <QuickActionCard icon={BarChart3} title="Backtesting" description="Practice strategies" href="/backtest" color="bg-cyan-600/80" />
          <QuickActionCard icon={BookOpen} title="Trade Journal" description="Log your trades" href="/journal/journal" color="bg-indigo-600/80" />
          <QuickActionCard icon={Upload} title="Import Trades" description="CSV, Excel & more" href="/journal/import-trades" color="bg-violet-600/80" />
          <QuickActionCard icon={Brain} title="AI Assistant" description="Get trading insights" href="/journal/ai-dashboard" color="bg-cyan-600/80" />
        </div>

        {/* ═══ METRIC CARDS ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {/* Net PNL */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><TrendingUp className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Net P&L</h4>
                </div>
                <p className={`text-lg font-bold ${stats.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(stats.total_pnl)}</p>
                <p className="text-xs text-white/25 mt-0.5">{stats.total_pnl_percent ? formatPercent(stats.total_pnl_percent) : ''}</p>
              </div>
              <div className="w-16 h-12">
                {pnlData.length > 0 && (
                  <ResponsiveContainer><AreaChart data={pnlData}><Area type="monotone" dataKey="pnl" stroke={stats.total_pnl >= 0 ? '#34d399' : '#f87171'} fill={stats.total_pnl >= 0 ? '#34d39915' : '#f8717115'} strokeWidth={1.5} /></AreaChart></ResponsiveContainer>
                )}
              </div>
            </div>
          </MetricCard>

          {/* Win Rate */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><Target className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Win Rate</h4>
                </div>
                <span className="text-lg font-bold text-white mb-0.5">{formatPercent(stats.win_rate)}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400/70">{stats.win_loss?.wins || 0}W</span>
                  <span className="text-red-400/70">{stats.win_loss?.losses || 0}L</span>
                </div>
              </div>
              <div className="w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: stats.win_loss?.wins || 0 }, { value: stats.win_loss?.losses || 0 }]} dataKey="value" cx="50%" cy="50%" innerRadius={12} outerRadius={20} stroke="none" paddingAngle={2}>
                    <Cell fill="#34d399" /><Cell fill="#f87171" />
                  </Pie>
                </PieChart>
              </div>
            </div>
          </MetricCard>

          {/* Profit Factor */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><Calculator className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Profit Factor</h4>
                </div>
                <span className={`text-lg font-bold ${(stats.profit_factor || 0) >= 1.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.profit_factor === Infinity ? '\u221E' : stats.profit_factor?.toFixed(2) || 'N/A'}
                </span>
                <div className="text-xs text-white/25 mt-0.5">+{formatCurrency(stats.gross_profit)} / -{formatCurrency(stats.gross_loss)}</div>
              </div>
              <div className="w-16 h-12 flex items-center">
                <div className="relative w-full h-1.5 bg-cyan-950/40/[0.06] rounded-full">
                  <div className={`absolute left-0 top-0 h-1.5 rounded-full ${(stats.profit_factor || 0) >= 1.5 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, ((stats.profit_factor || 0) / 3) * 100)}%` }}></div>
                </div>
              </div>
            </div>
          </MetricCard>

          {/* Day Win % */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><Award className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Day Win {winningDaysMetrics.percent?.toFixed(0) || 0}%</h4>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400/70">{winningDaysMetrics.count || 0}W</span>
                  <span className="text-red-400/70">{winningDaysMetrics.losingDays || 0}L</span>
                </div>
              </div>
              <div className="w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: winningDaysMetrics.count || 0 }, { value: winningDaysMetrics.losingDays || 0 }, ...(winningDaysMetrics.breakEvenDays > 0 ? [{ value: winningDaysMetrics.breakEvenDays }] : [])]} dataKey="value" cx={24} cy={24} innerRadius={12} outerRadius={20} paddingAngle={2} strokeWidth={0}>
                    <Cell fill="#34d399" /><Cell fill="#f87171" />{winningDaysMetrics.breakEvenDays > 0 && <Cell fill="#6b7280" />}
                  </Pie>
                </PieChart>
              </div>
            </div>
          </MetricCard>

          {/* Best & Worst */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><Activity className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Best / Worst</h4>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-sm font-bold text-emerald-400 block">{formatCurrency(stats.best_trade?.pnl)}</span><span className="text-white/25">Best</span></div>
                  <div><span className="text-sm font-bold text-red-400 block">{formatCurrency(stats.worst_trade?.pnl)}</span><span className="text-white/25">Worst</span></div>
                </div>
              </div>
              <div className="w-16 h-12">
                <ResponsiveContainer><BarChart data={[{ name: 'Best', value: stats.best_trade?.pnl || 0 }, { name: 'Worst', value: stats.worst_trade?.pnl || 0 }]}><Bar dataKey="value" radius={[2, 2, 2, 2]}><Cell fill="#34d399" /><Cell fill="#f87171" /></Bar></BarChart></ResponsiveContainer>
              </div>
            </div>
          </MetricCard>

          {/* Avg Win/Loss */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><TrendingUp className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Avg Win/Loss</h4>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-sm font-bold text-emerald-400 block">{formatCurrency(stats.avg_win)}</span><span className="text-white/25">Win</span></div>
                  <div><span className="text-sm font-bold text-red-400 block">{formatCurrency(stats.avg_loss)}</span><span className="text-white/25">Loss</span></div>
                </div>
              </div>
              <div className="w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: Math.abs(stats.avg_win || 0) }, { value: Math.abs(stats.avg_loss || 0) }]} cx="50%" cy="50%" innerRadius={12} outerRadius={20} paddingAngle={2} dataKey="value" stroke="none">
                    <Cell fill="#34d399" /><Cell fill="#f87171" />
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
                  <div className="p-1.5 rounded bg-cyan-500/10"><Calculator className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Expectancy</h4>
                </div>
                <span className={`text-lg font-bold ${(stats.expectancy || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.expectancy != null ? formatCurrency(stats.expectancy) : 'N/A'}</span>
                <span className="text-xs text-white/25">Per Trade</span>
              </div>
              <div className="w-10 h-10 flex items-center justify-center">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${(stats.expectancy || 0) >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                  <div className={`w-3 h-3 rounded-full ${(stats.expectancy || 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                </div>
              </div>
            </div>
          </MetricCard>

          {/* Max Drawdown */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><Shield className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Max DD</h4>
                </div>
                <p className="text-lg font-bold text-red-400">{formatCurrency(calculatedMetrics.maxDrawdown)}</p>
                <p className="text-xs text-red-400/60">{getMaxDDPercent()}</p>
              </div>
              <div className="w-16 h-12">
                {drawdownHistory.length > 0 && (
                  <ResponsiveContainer><AreaChart data={drawdownHistory}><Area type="monotone" dataKey="drawdown" stroke="#f87171" fill="#f8717115" strokeWidth={1.5} /></AreaChart></ResponsiveContainer>
                )}
              </div>
            </div>
          </MetricCard>

          {/* Rating */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-amber-500/10"><Star className="w-3.5 h-3.5 text-amber-400" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Rating</h4>
                </div>
                <p className="text-lg font-bold text-amber-400 mb-0.5">{performanceRating.charAt(0).toUpperCase() + performanceRating.slice(1)}</p>
                <div className="flex space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < ({ elite: 5, expert: 4, advanced: 3, intermediate: 2, beginner: 1 }[performanceRating] || 1) ? 'bg-amber-400' : 'bg-cyan-500/10'}`}></div>
                  ))}
                </div>
              </div>
            </div>
          </MetricCard>

          {/* Recovery Factor */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-cyan-500/10"><TrendingUp className="w-3.5 h-3.5 text-cyan-300" /></div>
                  <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wide">Recovery</h4>
                </div>
                <p className={`text-lg font-bold ${recoveryFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{recoveryFactor ? recoveryFactor.toFixed(2) : 'N/A'}</p>
                <p className="text-xs text-white/25">P&L / Max DD</p>
              </div>
              <div className="w-10 h-10 flex items-center justify-center">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${recoveryFactor >= 1 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                  <div className={`w-3 h-3 rounded-full ${recoveryFactor >= 1 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                </div>
              </div>
            </div>
          </MetricCard>
        </div>

        {/* ═══ BACKTEST SESSIONS PREVIEW ═══ */}
        {backtestSessions.length > 0 && (
          <div className="mb-6 rounded-xl bg-cyan-950/40/[0.03] border border-white/[0.08] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/70">Recent Backtest Sessions</h3>
              <a href="/backtest" className="text-xs text-cyan-300/70 hover:text-cyan-300 transition-colors">View all &rarr;</a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {backtestSessions.map(s => (
                <a
                  key={s.id}
                  href={`/chart/index.html?mode=${s.session_type === 'propfirm' ? 'propfirm' : 'backtest'}&sessionId=${s.id}`}
                  className="flex items-center gap-3 rounded-lg bg-cyan-950/40/[0.02] border border-white/[0.06] hover:border-white/[0.12] p-3 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <Play className="w-3.5 h-3.5 text-cyan-300 ml-0.5" fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">{s.name}</div>
                    <div className="text-xs text-white/25">{s.session_type === 'propfirm' ? 'Prop Firm' : 'Personal'} &middot; {s.symbol || 'N/A'}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CALENDAR ═══ */}
        <div className="mb-6">
          <EnhancedCalendar stats={stats} />
        </div>

        {/* ═══ PORTFOLIO GROWTH CHART ═══ */}
        <div className="rounded-xl bg-cyan-950/40/[0.03] border border-white/[0.08] p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
            <h3 className="text-lg font-semibold text-white/90">Portfolio Growth</h3>
            <div className="flex flex-wrap gap-2">
              {[['area', 'Area'], ['line', 'Line'], ['bar', 'Bar']].map(([val, label]) => (
                <button key={val} onClick={() => setPortfolioChartType(val)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${portfolioChartType === val ? 'bg-cyan-500/10 text-white border border-white/[0.12]' : 'text-white/30 hover:text-white/60 border border-transparent'}`}>{label}</button>
              ))}
              <select value={showCumulative ? 'cumulative' : 'period'} onChange={e => setShowCumulative(e.target.value === 'cumulative')} className="bg-cyan-950/40/[0.05] border border-white/[0.08] text-white/70 px-3 py-1.5 rounded-lg text-xs">
                <option value="cumulative">Cumulative</option>
                <option value="period">{timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}</option>
              </select>
              <select value={timePeriod} onChange={e => setTimePeriod(e.target.value)} className="bg-cyan-950/40/[0.05] border border-white/[0.08] text-white/70 px-3 py-1.5 rounded-lg text-xs">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {portfolioChartType === 'bar' ? (
              <BarChart data={equityCurveData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} domain={!showCumulative ? [dataMin => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']} width={60} />
                <RechartsTooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0', fontWeight: 600 }} formatter={valueFormatter} labelFormatter={labelFormatter} />
                <Bar dataKey={chartDataKey} barSize={24} radius={[4, 4, 0, 0]}>
                  {equityCurveData.map((entry, i) => <Cell key={i} fill={entry[chartDataKey] >= 0 ? '#3b82f6' : '#8b5cf6'} />)}
                </Bar>
              </BarChart>
            ) : portfolioChartType === 'area' ? (
              <AreaChart data={equityCurveData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stats.total_pnl >= 0 ? '#34d399' : '#f87171'} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={stats.total_pnl >= 0 ? '#34d399' : '#f87171'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} domain={!showCumulative ? [dataMin => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']} width={60} />
                <RechartsTooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0', fontWeight: 600 }} formatter={valueFormatter} labelFormatter={labelFormatter} />
                <Area type="monotone" dataKey={chartDataKey} stroke={stats.total_pnl >= 0 ? '#34d399' : '#f87171'} fill="url(#dashGradient)" strokeWidth={2} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            ) : (
              <LineChart data={equityCurveData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} domain={!showCumulative ? [dataMin => Math.min(0, dataMin), 'dataMax + 1'] : ['auto', 'auto']} width={60} />
                <RechartsTooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0', fontWeight: 600 }} formatter={valueFormatter} labelFormatter={labelFormatter} />
                <Line type="monotone" dataKey={chartDataKey} stroke={stats.total_pnl >= 0 ? '#34d399' : '#f87171'} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* ═══ RECENT ACTIVITY TABLE ═══ */}
        <div className="rounded-xl bg-cyan-950/40/[0.03] border border-white/[0.08] p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-5">Recent Activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Symbol', 'Type', 'Date', 'Strategy', 'Entry', 'Exit', 'Qty', 'Status', 'P&L', 'R:R'].map(h => (
                    <th key={h} className={`py-3 px-3 text-xs font-semibold text-white/25 uppercase tracking-wider ${['Entry', 'Exit', 'Qty', 'P&L', 'R:R'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {stats.recent_trades?.slice(0, 8).map((trade, idx) => {
                  const isLong = ['Long', 'long', 'buy', 'LONG', 'BUY'].includes(trade.direction);
                  return (
                    <tr key={idx} className="hover:bg-cyan-950/40/[0.02] transition-colors">
                      <td className="py-3 px-3 font-semibold text-white/80 text-sm">{trade.symbol || 'N/A'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-white/30">{trade.date || 'N/A'}</td>
                      <td className="py-3 px-3 text-xs text-white/30">{trade.strategy || 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs text-white/30">{trade.entry_price !== undefined ? `$${parseFloat(trade.entry_price).toFixed(2)}` : 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs text-white/30">{trade.exit_price !== undefined ? `$${parseFloat(trade.exit_price).toFixed(2)}` : 'N/A'}</td>
                      <td className="py-3 px-3 text-right text-xs text-white/30">{trade.quantity !== undefined ? trade.quantity : 'N/A'}</td>
                      <td className="py-3 px-3">
                        {trade.pnl > 0 ? (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400">Win</span>
                        ) : trade.pnl < 0 ? (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/10 text-red-400">Loss</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-950/15 text-white/30">BE</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={`font-bold text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(trade.pnl)}</span>
                      </td>
                      <td className="py-3 px-3 text-right text-xs font-medium text-white/30">{trade.rr != null ? trade.rr : 'N/A'}</td>
                    </tr>
                  );
                }) || []}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
