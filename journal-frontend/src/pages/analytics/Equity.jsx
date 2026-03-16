import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { subDays, isAfter, format } from 'date-fns';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { fetchWithAuth } from '../../utils/fetchUtils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  Brush,
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  AlertCircle,
  ChevronDown,
  GitCompare,
  Check,
  X,
  DollarSign,
  Target,
  BarChart3,
  PieChart,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { calculateSharpeRatio, validateMetricsInputs, calculateSQN, calculateSQNWithRMultiples } from '../../utils/metrics';

// Professional color palette
const colors = {
  primary: '#1e40af',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  purple: '#8b5cf6',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a'
  }
};

// Helper functions
const formatCurrency = (val) =>
  val == null ? 'N/A' : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

const formatPercent = (val) =>
  val == null ? 'N/A' : new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(val / 100);

const formatNumber = (val) =>
  val == null ? 'N/A' : new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(val);

// Get color based on Sharpe Ratio value
const getSharpeRatioColor = (value) => {
  if (value === null || value === undefined) return 'gray';
  if (value >= 2) return 'green';  // Excellent
  if (value >= 1.5) return 'teal';  // Very Good
  if (value >= 1) return 'blue';    // Good
  if (value >= 0.5) return 'yellow'; // Fair
  return 'red';                      // Poor
};

// Timeframes for filtering
const timeframes = [
  { value: 'week', label: 'Last Week', days: 7 },
  { value: 'month', label: 'Last Month', days: 30 },
  { value: 'quarter', label: 'Last Quarter', days: 90 },
  { value: 'year', label: 'Last Year', days: 365 },
  { value: 'all', label: 'All Time', days: null },
];

// Chart types
const chartTypes = [
  { value: 'area', label: 'Area Chart', icon: BarChart3 },
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
];

// Benchmark options
const benchmarkOptions = [
  { value: 'sp500', label: 'S&P 500', color: colors.success },
  { value: 'nasdaq', label: 'NASDAQ', color: colors.info },
  { value: 'dowjones', label: 'Dow Jones', color: colors.purple },
  { value: 'crypto', label: 'Crypto Index', color: colors.warning },
];

// Enhanced Performance Metric Card Component
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

// Enhanced Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="bg-white p-4 shadow-xl rounded-xl border border-slate-200 min-w-[220px]">
      <p className="text-sm font-semibold text-[#040028] mb-3">
        {format(new Date(label), 'MMM d, yyyy')}
      </p>
      
      {payload.map((entry, index) => (
        <div key={index} className="mb-2 last:mb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {entry.name}
              </span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(entry.value)}
            </span>
          </div>
          {entry.payload?.dailyReturn !== undefined && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5">
              Daily: {entry.payload.dailyReturn > 0 ? '+' : ''}
              {entry.payload.dailyReturn.toFixed(2)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Loading Skeleton Component
const LoadingSkeleton = () => (
  <div className="min-h-screen bg-slate-50">
    <div className="w-full px-6 py-4 space-y-6">
      <div className="animate-pulse">
        <div className="flex justify-between items-center mb-8">
          <div className="h-8 bg-slate-200 rounded-lg w-64"></div>
          <div className="flex gap-4">
            <div className="h-10 bg-slate-200 rounded-lg w-32"></div>
            <div className="h-10 bg-slate-200 rounded-lg w-40"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white border border-blue-200/60 rounded-xl"></div>
          ))}
        </div>
        
        <div className="h-96 bg-white border border-blue-200/60 rounded-xl"></div>
      </div>
    </div>
  </div>
);

// Error Component
const ErrorDisplay = ({ error, onRetry }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="w-full px-6 py-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Error Loading Equity Data
            </h3>
            <p className="text-red-700 mb-4">{error}</p>
            <Button 
              onClick={onRetry}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function Equitys() {
  const { stats, loading, error, refetch, trades } = useAnalyticsData();
  
  // Chart and display state
  const [chartType, setChartType] = useState('area');
  const [timeframe, setTimeframe] = useState('all');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [expandedView, setExpandedView] = useState(true);
  const [returnsPeriod, setReturnsPeriod] = useState(30); // Default to showing last 30 days
  
  // Symbol and equity data state
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [symbols, setSymbols] = useState([]);
  const [symbolEquityData, setSymbolEquityData] = useState([]);

  // Always use the initial balance from localStorage (set by Dashboard)
  const initialBalance = localStorage.getItem('initialBalance') || '';

  // Fetch symbols for comparison
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const data = await fetchWithAuth('/api/journal/symbol-analysis');
        const symbolList = data.map(item => item.symbol);
        setSymbols(symbolList);
      } catch (err) {
        console.error('Error fetching symbols:', err);
      }
    };
    
    fetchSymbols();
  }, []);

  // Fetch symbol equity data
  useEffect(() => {
    const fetchSymbolEquity = async () => {
      if (!selectedSymbol) return;
      
      try {
        const trades = await fetchWithAuth(`/api/journal/entries?symbol=${selectedSymbol}`);
        
        if (!trades || !Array.isArray(trades)) {
          setSymbolEquityData([]);
          return;
        }
        
        const sortedTrades = [...trades].sort((a, b) => 
          new Date(a.entry_time || a.date || a.created_at) - 
          new Date(b.entry_time || b.date || b.created_at)
        );
        
        let cumulativePnl = 0;
        const equityData = sortedTrades.map(trade => {
          cumulativePnl += trade.pnl || 0;
          return {
            date: trade.entry_time || trade.date || trade.created_at,
            cumulative_pnl: parseFloat(cumulativePnl.toFixed(2))
          };
        });
        
        setSymbolEquityData(equityData);
      } catch (err) {
        console.error('Error fetching symbol equity:', err);
        setSymbolEquityData([]);
      }
    };
    
    fetchSymbolEquity();
  }, [selectedSymbol]);

  // Process equity curve data with improved daily returns calculation
  const processedEquityCurve = useMemo(() => {
    if (!stats?.equity_curve?.length) return [];
    
    // Sort by date to ensure correct calculation
    const sortedCurve = [...stats.equity_curve].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    return sortedCurve.map((pt, i, arr) => {
      // Calculate daily return as percentage change from previous day's equity
      let dailyReturn = 0;
      if (i > 0) {
        const prevEquity = arr[i-1].cumulative_pnl;
        const currentEquity = pt.cumulative_pnl;
        
        // Calculate return based on previous day's equity
        // If previous equity was zero, we can't calculate a meaningful percentage
        if (Math.abs(prevEquity) > 0.0001) { // Small threshold to avoid division by near-zero
          dailyReturn = ((currentEquity - prevEquity) / Math.abs(prevEquity)) * 100;
        }
      }
      
      return {
        ...pt,
        date: new Date(pt.date),
        dailyReturn: parseFloat(dailyReturn.toFixed(4)), // Round to 4 decimal places
        absoluteReturn: i > 0 ? (pt.cumulative_pnl - arr[i-1].cumulative_pnl) : 0
      };
    });
  }, [stats?.equity_curve]);

  // Filter data by timeframe
  const filterDataByTimeframe = useCallback((data) => {
    if (!data || !data.length) return [];

    const timeframeConfig = timeframes.find(tf => tf.value === timeframe);
    if (!timeframeConfig || !timeframeConfig.days) return data;

    const cutoffDate = subDays(new Date(), timeframeConfig.days);
    return data.filter(item => isAfter(new Date(item.date), cutoffDate));
  }, [timeframe]);

  const filteredEquityCurve = useMemo(
    () => filterDataByTimeframe(processedEquityCurve),
    [processedEquityCurve, filterDataByTimeframe]
  );

  // Calculate metrics based on filtered data (timeframe)
  const metrics = useMemo(() => {
    if (!stats) return {};

    // Use filtered equity curve and trades for metrics
    const equityCurve = filteredEquityCurve;
    let filteredTrades = [];
    let allTrades = trades && trades.length > 0 ? trades : (stats && stats.trades && stats.trades.length > 0 ? stats.trades : []);
    if (allTrades.length > 0) {
      if (timeframe === 'all') {
        filteredTrades = allTrades;
      } else {
        const firstDate = new Date(equityCurve[0].date);
        const lastDate = new Date(equityCurve[equityCurve.length - 1].date);
        filteredTrades = allTrades.filter(trade => {
          const dateStr = trade.date || trade.entry_date || trade.timestamp || trade.created_at;
          if (!dateStr) return false;
          const tradeDate = new Date(dateStr);
          return tradeDate >= firstDate && tradeDate <= lastDate;
        });
      }
    }
    if (!equityCurve.length) {
      return {
        totalPnl: 0,
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        winRate: 0,
        profitFactor: 0,
        bestDay: 0,
        bestDayDate: '',
        worstDay: 0,
        worstDayDate: '',
        avgTradeSize: 0,
        recoveryFactor: 0,
        avgDailyReturn: 0,
        volatility: null,
        maxDrawdown: 0,
        maxDrawdownPct: 0,
        sharpeRatio: null,
        avgTradePnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        expectancy: 0,
        avgWin: 0,
        avgLoss: 0,
        sqn: null
      };
    }
    
    // Calculate OVERALL total P&L from ALL data (not filtered by timeframe)
    const overallTotalPnl = allTrades.reduce((sum, trade) => sum + (parseFloat(trade.pnl) || 0), 0);
    
    // Calculate timeframe-specific total P&L for other calculations
    const firstEquity = equityCurve[0].cumulative_pnl;
    const lastEquity = equityCurve[equityCurve.length - 1].cumulative_pnl;
    const timeframeTotalPnl = lastEquity - firstEquity;
    // Return % relative to starting equity (initial balance + starting cumulative PnL)
    const initialBalNum = parseFloat(initialBalance) || 0;
    const startEquityValue = initialBalNum + firstEquity;
    const endEquityValue = initialBalNum + lastEquity;
    let totalReturn = startEquityValue > 0 ? ((endEquityValue - startEquityValue) / startEquityValue) * 100 : 0;
    // If viewing all time and backend provided total_pnl_percent, use it for exact consistency with Dashboard
    if (timeframe === 'all' && typeof stats?.total_pnl_percent === 'number') {
      totalReturn = stats.total_pnl_percent;
    }
    // Calculate metrics from equity curve data if available
    let bestDay = 0;
    let bestDayDate = '';
    let worstDay = 0;
    let worstDayDate = '';
    let totalTrades = filteredTrades.length;
    let totalTradeSize = 0;
    let totalLoss = 0;
    let maxDrawdown = 0;
    let peak = 0;
    if (equityCurve && equityCurve.length > 1) {
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = equityCurve[i-1].cumulative_pnl;
        const currentEquity = equityCurve[i].cumulative_pnl;
        const dailyReturn = currentEquity - prevEquity;
        if (dailyReturn > bestDay) {
          bestDay = dailyReturn;
          bestDayDate = equityCurve[i].date;
        }
        if (dailyReturn < worstDay) {
          worstDay = dailyReturn;
          worstDayDate = equityCurve[i].date;
        }
        if (currentEquity > peak) peak = currentEquity;
        const drawdown = peak - currentEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (dailyReturn !== 0) {
          totalTradeSize += Math.abs(dailyReturn);
          if (dailyReturn < 0) totalLoss += Math.abs(dailyReturn);
        }
      }
    }
    const avgTradeSize = totalTrades > 0 ? totalTradeSize / totalTrades : 0;
    const recoveryFactor = maxDrawdown > 0 ? timeframeTotalPnl / maxDrawdown : 0;
    // Max Drawdown Percent: prefer backend value if present, else compute from filtered equity
    const maxDrawdownPercent = (typeof stats?.max_drawdown_percent === 'number' && Number.isFinite(stats.max_drawdown_percent))
      ? stats.max_drawdown_percent
      : (peak > 0 ? (maxDrawdown / peak) * 100 : 0);
    // Calculate SQN (System Quality Number) using R-Multiples
    let sqn = null;
    if (filteredTrades.length > 0) {
      // Try R-multiples first, fallback to regular SQN if no risk data
      sqn = calculateSQNWithRMultiples(filteredTrades);
      if (sqn === null) {
        sqn = calculateSQN(filteredTrades);
      }
    }
    let winningTrades = filteredTrades.filter(t => t.pnl > 0).length;
    let winRate = 0;
    if (totalTrades > 0) {
      winRate = (winningTrades / totalTrades) * 100;
    } else if (equityCurve.length > 1) {
      // Estimate win rate from equity curve if no trades are available
      let wins = 0, losses = 0;
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = equityCurve[i-1].cumulative_pnl;
        const currentEquity = equityCurve[i].cumulative_pnl;
        if (currentEquity > prevEquity) wins++;
        else if (currentEquity < prevEquity) losses++;
      }
      winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
      winningTrades = wins;
    }
    let avgDailyReturn = 0;
    if (equityCurve.length > 1) {
      const returns = [];
      let currentEquity = parseFloat(initialBalance) || 0;
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = i === 1 ? currentEquity : (equityCurve[i-1].cumulative_pnl + currentEquity);
        const currentEquityValue = equityCurve[i].cumulative_pnl + currentEquity;
        const dailyReturn = (currentEquityValue - prevEquity) / prevEquity;
        returns.push(dailyReturn);
      }
      if (returns.length > 0) {
        avgDailyReturn = (returns.reduce((a, b) => a + b, 0) / returns.length) * 100;
      }
    }
    let volatility = 0;
    if (equityCurve.length > 1) {
      const returns = [];
      let currentEquity = parseFloat(initialBalance) || 0;
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = i === 1 ? currentEquity : (equityCurve[i-1].cumulative_pnl + currentEquity);
        const currentEquityValue = equityCurve[i].cumulative_pnl + currentEquity;
        const dailyReturn = (currentEquityValue - prevEquity) / prevEquity;
        returns.push(dailyReturn);
      }
      if (returns.length > 0) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
        volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualize volatility
      }
    }
    // Prefer backend-provided Sharpe (same as AllMetrics), fallback to local calculation
    let sharpeRatio = (typeof stats?.sharpe_ratio === 'number' && Number.isFinite(stats.sharpe_ratio))
      ? stats.sharpe_ratio
      : null;
    if (sharpeRatio === null) {
      if (filteredTrades.length > 0) {
        const result = calculateSharpeRatio(filteredTrades, parseFloat(initialBalance) || 0);
        sharpeRatio = result.value;
      } else if (equityCurve.length > 1 && parseFloat(initialBalance) > 0) {
        // Estimate Sharpe Ratio from equity curve if no trades are available
        const returns = [];
        let currentEquity = parseFloat(initialBalance) || 0;
        for (let i = 1; i < equityCurve.length; i++) {
          const prevEquity = i === 1 ? currentEquity : (equityCurve[i-1].cumulative_pnl + currentEquity);
          const currentEquityValue = equityCurve[i].cumulative_pnl + currentEquity;
          const dailyReturn = (currentEquityValue - prevEquity) / prevEquity;
          returns.push(dailyReturn);
        }
        if (returns.length > 1) {
          const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
          const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
          const volatility = Math.sqrt(variance);
          sharpeRatio = volatility > 0 ? (mean / volatility) * Math.sqrt(252) : null;
        }
      }
    }
    const bestTrade = filteredTrades.reduce((max, t) => t.pnl > (max?.pnl || -Infinity) ? t : max, null);
    const worstTrade = filteredTrades.reduce((min, t) => t.pnl < (min?.pnl || Infinity) ? t : min, null);
    const avgTradePnl = totalTrades > 0 ? filteredTrades.reduce((acc, t) => acc + (t.pnl || 0), 0) / totalTrades : 0;
    const avgWin = winningTrades > 0 ? filteredTrades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0) / winningTrades : 0;
    const avgLoss = (totalTrades - winningTrades) > 0 ? filteredTrades.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0) / (totalTrades - winningTrades) : 0;
    const expectancy = avgWin + avgLoss;
    let grossProfit = 0;
    let grossLoss = 0;
    let profitFactor = 0;
    if (filteredTrades.length > 0) {
      grossProfit = filteredTrades.reduce((acc, t) => acc + (t.pnl > 0 ? t.pnl : 0), 0);
      grossLoss = filteredTrades.reduce((acc, t) => acc + (t.pnl < 0 ? Math.abs(t.pnl) : 0), 0);
      profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 100 : 0);
    } else if (equityCurve.length > 1) {
      // Estimate profit factor from equity curve if no trades are available
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = equityCurve[i-1].cumulative_pnl;
        const currentEquity = equityCurve[i].cumulative_pnl;
        const change = currentEquity - prevEquity;
        if (change > 0) grossProfit += change;
        else if (change < 0) grossLoss += Math.abs(change);
      }
      profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 100 : 0);
    }
    return {
      totalPnl: overallTotalPnl, // Always show overall total P&L
      totalReturn,
      totalTrades,
      winningTrades,
      winRate,
      profitFactor,
      bestDay,
      bestDayDate,
      worstDay,
      worstDayDate,
      avgTradeSize,
      recoveryFactor,
      avgDailyReturn,
      volatility: parseFloat(initialBalance) > 0 ? volatility : null,
      maxDrawdown,
      maxDrawdownPct: maxDrawdownPercent,
      sharpeRatio: sharpeRatio,
      avgTradePnl,
      bestTrade: bestTrade ? bestTrade.pnl : 0,
      worstTrade: worstTrade ? worstTrade.pnl : 0,
      expectancy,
      avgWin,
      avgLoss,
      sqn
    };
  }, [filteredEquityCurve, trades, initialBalance, calculateSharpeRatio, timeframe]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!filteredEquityCurve || filteredEquityCurve.length === 0) return [];
    
    return filteredEquityCurve.map((point, index) => ({
      ...point,
      date: point.date.toISOString(),
      // Add benchmark data if available
      ...(showBenchmark && stats?.benchmark_data?.sp500 && {
        benchmark: stats.benchmark_data.sp500[index]?.value || 0
      })
    }));
  }, [filteredEquityCurve, showBenchmark, stats]);

  // Chart rendering function
  const renderChart = () => {
    if (!chartData || chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <BarChart3 className="h-12 w-12 mb-4 text-gray-300" />
          <p className="text-lg font-medium">No data available</p>
          <p className="text-sm">Try adjusting your time range or check your trading data</p>
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 },
    };

    const chartComponents = {
      xAxis: (
        <XAxis 
          dataKey="date" 
          tick={{ fill: colors.gray[500], fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(date) => format(new Date(date), 'MMM d')}
        />
      ),
      yAxis: (
        <YAxis 
          tickFormatter={formatCurrency}
          tick={{ fill: colors.gray[500], fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
      ),
      tooltip: (
        <Tooltip 
          content={<CustomTooltip />}
          cursor={{ stroke: colors.gray[200], strokeWidth: 1 }}
        />
      ),
      referenceLine: <ReferenceLine y={0} stroke={colors.gray[300]} strokeDasharray="2 2" />,
      cartesianGrid: <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.gray[100]} />
    };

    switch(chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity={0.4} />
                <stop offset="50%" stopColor={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity={0.2} />
                <stop offset="100%" stopColor={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.success} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={colors.success} stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            {chartComponents.cartesianGrid}
            {chartComponents.xAxis}
            {chartComponents.yAxis}
            {chartComponents.tooltip}
            <Area 
              type="monotone" 
              dataKey="cumulative_pnl" 
              name="Your Equity"
              stroke={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'}
              fillOpacity={1} 
              fill="url(#equityGradient)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2, fill: 'white', stroke: metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e' }}
            />
            {showBenchmark && (
              <Area 
                type="monotone" 
                dataKey="benchmark" 
                name="Benchmark"
                stroke={colors.success}
                fillOpacity={1} 
                fill="url(#benchmarkGradient)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: 'white', stroke: colors.success }}
              />
            )}
            {chartComponents.referenceLine}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity={0.8}/>
                <stop offset="95%" stopColor={metrics.totalPnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
              </linearGradient>
            </defs>
            {chartComponents.cartesianGrid}
            {chartComponents.xAxis}
            {chartComponents.yAxis}
            {chartComponents.tooltip}
            <Bar 
              dataKey="cumulative_pnl" 
              name="Equity"
              fill="url(#barGradient)"
              radius={[4, 4, 0, 0]}
            />
            {chartComponents.referenceLine}
          </BarChart>
        );

      default:
        return renderChart();
    }
  };

  // Automatic data refresh effect
  useEffect(() => {
    // Initial data fetch
    const fetchData = async () => {
      try {
        await refetch();
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    };

    // Set up interval to refresh data every 30 seconds
    const refreshInterval = setInterval(fetchData, 30000);

    // Clean up interval on component unmount
    return () => clearInterval(refreshInterval);
  }, [refetch]);

  // Balance input component
  // const renderBalanceInput = () => (
  //   <div className="mb-6 p-4">
      
  //   </div>
  // );

  // Show loading state
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Show error state
  if (error) {
    return <ErrorDisplay error={error} onRetry={refetch} />;
  }

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#040028] flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
              Equity
            </h1>
            <p className="text-slate-600 mt-2">
              Comprehensive analysis of your trading performance and equity curve
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-4 py-2 bg-white border border-blue-200/60 rounded-lg text-sm font-medium text-[#040028] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              {timeframes.map((tf) => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
            
            <div className="text-xs text-slate-600 flex items-center">
              <RefreshCw className="h-3 w-3 mr-1" />
              Auto-updating every 30s
            </div>
          </div>
        </div>

        {/* Balance Input */}
        {/* {showBalanceInput && renderBalanceInput()} */}
      
        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Total P&L */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Total P&L</h4>
                </div>
                <p className={`text-lg font-bold ${metrics.totalPnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {formatCurrency(metrics.totalPnl || 0)}
                </p>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  {formatPercent(metrics.totalReturn || 0)} return
                </p>
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
                <span className="text-lg font-bold text-[#040028] mb-1">{formatPercent(metrics.winRate || 0)}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-[#10B981] font-normal">{metrics.winningTrades || 0} wins</span>
                  <span className="text-[#EF4444] font-normal">{metrics.totalTrades - metrics.winningTrades || 0} losses</span>
                </div>
              </div>
            </div>
          </MetricCard>
          
          {/* Profit Factor */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Profit Factor</h4>
                </div>
                <div>
                  <span className={`text-lg font-bold ${metrics.profitFactor >= 1 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                    {formatNumber(metrics.profitFactor || 0)}
                  </span>
                  <p className="text-xs font-normal text-slate-600 mt-1">
                    Gross profit / Gross loss
                  </p>
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
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Max Drawdown</h4>
                </div>
                <span className="text-lg font-bold text-[#EF4444]">{formatCurrency(metrics.maxDrawdown || 0)}</span>
                <span className="text-sm text-red-500 font-medium">{formatPercent(metrics.maxDrawdownPct || 0)}</span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  Maximum peak-to-trough decline
                </p>
              </div>
            </div>
          </MetricCard>
        
          {/* Sharpe Ratio */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Sharpe Ratio</h4>
                </div>
                <span className={`text-lg font-bold ${metrics.sharpeRatio !== null ? (metrics.sharpeRatio >= 2 ? 'text-[#10B981]' : metrics.sharpeRatio >= 1 ? 'text-blue-600' : 'text-[#EF4444]') : 'text-slate-600'}`}>
                  {metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : 'N/A'}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  {metrics.sharpeRatio !== null ? (
                    metrics.sharpeRatio >= 2 ? "Excellent" :
                    metrics.sharpeRatio >= 1.5 ? "Very Good" :
                    metrics.sharpeRatio >= 1 ? "Good" :
                    metrics.sharpeRatio >= 0.5 ? "Needs Improvement" : "High Risk"
                  ) : "Enter initial balance"}
                </p>
              </div>
            </div>
          </MetricCard>

          {/* Volatility */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Volatility</h4>
                </div>
                <span className="text-lg font-bold text-[#040028]">
                  {metrics.volatility !== null ? formatPercent(metrics.volatility) : 'N/A'}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  {!initialBalance ? "Enter initial balance" : "Annualized volatility"}
                </p>
              </div>
            </div>
          </MetricCard>

          {/* Avg Daily Return */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Avg Daily Return</h4>
                </div>
                <span className={`text-lg font-bold ${metrics.avgDailyReturn >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {formatPercent(metrics.avgDailyReturn || 0)}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  Average daily performance
                </p>
              </div>
            </div>
          </MetricCard>

          {/* Total Trades */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <GitCompare className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Total Trades</h4>
                </div>
                <span className="text-lg font-bold text-[#040028]">
                  {formatNumber(metrics.totalTrades || 0)}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  Number of completed trades
                </p>
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
                <span className={`text-lg font-bold ${metrics.recoveryFactor >= 1 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {metrics.recoveryFactor ? metrics.recoveryFactor.toFixed(2) : 'N/A'}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  Total P&L / Max Drawdown
                </p>
              </div>
            </div>
          </MetricCard>

          {/* SQN */}
          <MetricCard>
            <div className="flex items-center justify-between h-full">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">SQN</h4>
                </div>
                <span className={`text-lg font-bold ${metrics.sqn !== null && metrics.sqn >= 2 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {metrics.sqn !== null ? metrics.sqn.toFixed(2) : 'N/A'}
                </span>
                <p className="text-xs font-normal text-slate-600 mt-1">
                  System Quality Number
                </p>
              </div>
            </div>
          </MetricCard>
        </div>
        

        {/* Equity Curve Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#040028] flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Equity Curve
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Track your portfolio performance over time
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                
                {/* Chart Type Selector */}
                <div className="flex bg-slate-100 rounded-lg p-1">
                  {chartTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setChartType(type.value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        chartType === type.value
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <type.icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
                
                
                

              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="w-full h-[600px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Additional Charts Section (if expanded) */}
        {expandedView && (
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            

            {/* Performance Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 overflow-hidden">
              <div className="p-6 border-b border-blue-200/60">
                <h2 className="text-2xl font-bold text-[#040028] flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-600" />
                  Performance Summary
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="py-2 border-b border-slate-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600">Best Day</span>
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(metrics.bestDay || metrics.bestTrade || 0)}
                      </span>
                    </div>
                    {metrics.bestDayDate && (
                      <div className="text-xs text-slate-500 text-right mt-1">
                        {format(new Date(metrics.bestDayDate), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                  <div className="py-2 border-b border-slate-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600">Worst Day</span>
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency(metrics.worstDay || metrics.worstTrade || 0)}
                      </span>
                    </div>
                    {metrics.worstDayDate && (
                      <div className="text-xs text-slate-500 text-right mt-1">
                        {format(new Date(metrics.worstDayDate), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-sm font-medium text-slate-600">Avg Trade Size</span>
                    <span className="text-sm font-semibold text-[#040028]">
                      {formatCurrency(metrics.avgTradeSize || metrics.avgTradePnl || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium text-slate-600">Recovery Factor</span>
                    <span className="text-sm font-semibold text-blue-600">
                      {formatNumber(metrics.recoveryFactor || 0)}
                      {metrics.recoveryFactor > 1 ? ' (Good)' : metrics.recoveryFactor > 0 ? ' (Needs Improvement)' : ' (High Risk)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

