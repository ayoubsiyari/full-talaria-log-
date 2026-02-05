import React, { useEffect, useState } from 'react';
import { API_BASE_URL, STORAGE_KEYS } from '../../config';
import { useFilter } from '../../context/FilterContext';
import { useProfile } from '../../context/ProfileContext';
import FilterToggle from '../../components/FilterToggle';
import AdvancedFilter from '../../components/AdvancedFilter';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import {
  DollarSign,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Award,
  AlertCircle,
  Target,
  Calendar,
  Clock,
  Zap,
  Gauge,
  Briefcase,
  Percent,
  FileText,
  BarChartHorizontal,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
} from 'lucide-react';

const formatCurrency = (val) =>
  val == null ? 'N/A' : `$${parseFloat(val).toFixed(2)}`;
const formatPercent = (val) =>
  val == null ? 'N/A' : `${parseFloat(val).toFixed(1)}%`;
const formatNumber = (val) =>
  val == null ? 'N/A' : parseFloat(val).toFixed(2);

// Defensive helpers for nested stats
const safe = (obj, path, fallback = 'N/A') => {
  try {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
};

// Generate sample chart data for visualization
const generateChartData = (value, type = 'line', trend = 'positive') => {
  // Handle infinite values
  if (value === Infinity || value === 'Infinity' || value === 'inf' || value === '∞') {
    const data = [];
    for (let i = 0; i < 8; i++) {
      data.push({
        name: `P${i + 1}`,
        value: 100 + (i * 10), // High increasing values
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][i] || `M${i + 1}`
      });
    }
    return data;
  }
  
  if (value === -Infinity || value === '-Infinity' || value === '-inf' || value === '-∞') {
    const data = [];
    for (let i = 0; i < 8; i++) {
      data.push({
        name: `P${i + 1}`,
        value: -100 - (i * 10), // Low decreasing values
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][i] || `M${i + 1}`
      });
    }
    return data;
  }
  
  const baseValue = Math.abs(parseFloat(value)) || 10; // Use absolute value and ensure minimum
  const points = 8; // Reduced points for better performance
  const data = [];
  
  for (let i = 0; i < points; i++) {
    const variance = (Math.random() - 0.5) * 0.2; // Reduced variance
    const trendFactor = trend === 'positive' ? (i / points) * 0.15 : -(i / points) * 0.15;
    const calculatedValue = Math.max(0.1, baseValue * (1 + variance + trendFactor));
    
    data.push({
      name: `P${i + 1}`,
      value: calculatedValue,
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][i] || `M${i + 1}`
    });
  }
  
  return data;
};

// Mini chart components with unique gradient IDs
const MiniLineChart = ({ data, color = '#3B82F6', id }) => (
  <ResponsiveContainer width="100%" height={50}>
    <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
      <Line 
        type="monotone" 
        dataKey="value" 
        stroke={color} 
        strokeWidth={2} 
        dot={false}
        strokeDasharray="0"
      />
    </LineChart>
  </ResponsiveContainer>
);

const MiniAreaChart = ({ data, color = '#10B981', id }) => {
  const gradientId = `gradient-${id}-${color.replace('#', '')}`;
  
  return (
    <ResponsiveContainer width="100%" height={50}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={color} stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        <Area 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const MiniBarChart = ({ data, color = '#8B5CF6' }) => (
  <ResponsiveContainer width="100%" height={50}>
    <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
      <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

const MiniPieChart = ({ value, total, color = '#F59E0B' }) => {
  const percentage = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const data = [
    { name: 'Value', value: percentage, fill: color },
    { name: 'Remaining', value: 100 - percentage, fill: '#E5E7EB' }
  ];
  
  return (
    <ResponsiveContainer width="100%" height={50}>
      <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={12}
          outerRadius={20}
          paddingAngle={1}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
};

export default function AllMetrics() {
  const { filters, isFilterVisible, toggleFilterVisibility } = useFilter();
  const { activeProfile } = useProfile();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ensure filters is defined
  const safeFilters = filters || {};

  useEffect(() => {
    const fetchAllMetrics = async () => {
      try {
        setLoading(true);
        
        // Check if active profile is available
        if (!activeProfile) {
          console.log('No active profile available, skipping metrics fetch');
          setStats(null);
          return;
        }
        
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        // Get initial balance from localStorage (like Equity.jsx)
        const initialBalance = localStorage.getItem('initialBalance') || '';
        
        // Build query params from filters (like VariablesAnalysis)
        const queryParams = new URLSearchParams();
        if (safeFilters.dateRange?.start) queryParams.append('from_date', safeFilters.dateRange.start);
        if (safeFilters.dateRange?.end) queryParams.append('to_date', safeFilters.dateRange.end);
        if (safeFilters.symbol && safeFilters.symbol.length > 0) queryParams.append('symbols', safeFilters.symbol.join(','));
        if (safeFilters.direction && safeFilters.direction.length > 0) queryParams.append('directions', safeFilters.direction.join(','));
        if (safeFilters.strategy && safeFilters.strategy.length > 0) queryParams.append('strategies', safeFilters.strategy.join(','));
        if (safeFilters.setup && safeFilters.setup.length > 0) queryParams.append('setups', safeFilters.setup.join(','));
        if (safeFilters?.pnlRange?.min !== undefined && safeFilters.pnlRange.min !== '') queryParams.append('min_pnl', safeFilters.pnlRange.min);
        if (safeFilters?.pnlRange?.max !== undefined && safeFilters.pnlRange.max !== '') queryParams.append('max_pnl', safeFilters.pnlRange.max);
        if (safeFilters?.rrRange?.min !== undefined && safeFilters.rrRange.min !== '') queryParams.append('min_rr', safeFilters.rrRange.min);
        if (safeFilters?.rrRange?.max !== undefined && safeFilters.rrRange.max !== '') queryParams.append('max_rr', safeFilters.rrRange.max);
        if (safeFilters.importBatch && safeFilters.importBatch.length > 0) queryParams.append('batch_ids', safeFilters.importBatch.join(','));
        if (safeFilters.timeOfDay && safeFilters.timeOfDay.length > 0) queryParams.append('time_of_day', safeFilters.timeOfDay.join(','));
        if (safeFilters.dayOfWeek && safeFilters.dayOfWeek.length > 0) queryParams.append('day_of_week', safeFilters.dayOfWeek.join(','));
        if (safeFilters.month && safeFilters.month.length > 0) queryParams.append('month', safeFilters.month.join(','));
        if (safeFilters.year && safeFilters.year.length > 0) queryParams.append('year', safeFilters.year.join(','));
        if (safeFilters.variables && Object.keys(safeFilters.variables || {}).length > 0) queryParams.append('variables', JSON.stringify(safeFilters.variables));
        
        // Add initial balance parameter to match Equity.jsx calculations
        if (initialBalance && parseFloat(initialBalance) > 0) {
            queryParams.append('initial_balance', initialBalance);
        }
        
        const url = `/api/journal/stats/all?${queryParams.toString()}`;
        console.log('Fetching metrics for profile:', activeProfile.name, 'Profile ID:', activeProfile.id);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        console.log('AllMetrics received data for profile:', activeProfile.name, 'Data:', data);
        
        // Debug Advanced & Efficiency Metrics specifically
        console.log('Advanced & Efficiency Metrics Debug:', {
          avg_mae: data.avg_mae,
          avg_mfe: data.avg_mfe,
          avg_winning_mae: data.avg_winning_mae,
          avg_losing_mae: data.avg_losing_mae,
          avg_winning_mfe: data.avg_winning_mfe,
          avg_losing_mfe: data.avg_losing_mfe,
          k_ratio: data.k_ratio,
          z_score: data.z_score,
          gpr: data.gpr,
          etd: data.etd,
          total_trades: data.total_trades,
          entry_price_sample: (data.trades && Array.isArray(data.trades) ? data.trades.slice(0, 3).map(t => ({ 
            entry: t.entry_price, 
            exit: t.exit_price, 
            high: t.high_price, 
            low: t.low_price 
          })) : []) || 'No trades data'
        });
        
        setStats(data);
      } catch (err) {
        setError(err.message);
        console.error('❌ Failed to load all metrics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllMetrics();
  }, [filters, activeProfile]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-600 font-medium">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (!activeProfile) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
          <Briefcase className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-xl text-gray-600 font-medium mb-2">No Profile Selected</p>
          <p className="text-gray-500">Please select a profile to view metrics.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-red-50 to-pink-50">
        <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <p className="text-xl text-red-600 font-semibold">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-50 to-slate-50">
        <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-xl text-gray-600 font-medium">No metrics data available.</p>
        </div>
      </div>
    );
  }

  // Calculate loss rate safely
  const winRate = safe(stats, 'win_rate');
  const lossRate = winRate !== 'N/A' && winRate !== null ? Math.max(0, 100 - winRate) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4">
      <div className="">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 mb-4">
            Trading Analytics Dashboard
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-4">
            Comprehensive analysis of your trading performance with advanced metrics and visualizations
          </p>
          {activeProfile && (
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              <Briefcase className="w-4 h-4 mr-2" />
              Profile: {activeProfile.name}
            </div>
          )}
        </div>

        {/* SUMMARY METRICS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Summary Metrics</h2>
            <Activity className="ml-3 h-8 w-8 text-blue-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <MetricCard 
              icon={<DollarSign className="h-7 w-7 text-blue-600" />} 
              label="Total Trades" 
              value={safe(stats, 'total_trades', 'N/A')} 
              desc="Total number of trades executed."
              chart={<MiniBarChart data={generateChartData(safe(stats, 'total_trades', 0), 'bar')} color="#3B82F6" />}
              gradient="from-blue-500 to-blue-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Total number of completed trades in your journal.</div>
                  <div><strong>Calculation:</strong> Count of all journal entries with entry and exit prices.</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<ArrowUpRight className="h-7 w-7 text-green-600" />} 
              label="Total Net P&L" 
              value={formatCurrency(safe(stats, 'total_pnl'))} 
              desc="Sum of profit and loss across all trades."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'total_pnl', 0), 'area', safe(stats, 'total_pnl', 0) > 0 ? 'positive' : 'negative')} color="#10B981" id="total-pnl" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Overall profit or loss from all trades combined.</div>
                  <div><strong>Calculation:</strong> Σ(Exit Price - Entry Price) × Quantity × Direction</div>
                  <div><strong>Direction:</strong> +1 for Long, -1 for Short</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<ArrowUpRight className="h-7 w-7 text-purple-600" />} 
              label="Avg P&L per Trade" 
              value={formatCurrency(safe(stats, 'avg_pnl'))} 
              desc="Average profit or loss per trade."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'avg_pnl', 0), 'line')} color="#8B5CF6" id="avg-pnl" />}
              gradient="from-purple-500 to-purple-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average profit or loss per individual trade.</div>
                  <div><strong>Calculation:</strong> Total P&L ÷ Total Number of Trades</div>
                  <div><strong>Formula:</strong> (Σ Trade P&L) / N</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingUp className="h-7 w-7 text-emerald-600" />} 
              label="Win Rate (%)" 
              value={formatPercent(safe(stats, 'win_rate'))} 
              desc="Percentage of trades closed for a profit."
              chart={<MiniPieChart value={safe(stats, 'win_rate', 0)} total={100} color="#059669" />}
              gradient="from-emerald-500 to-emerald-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Percentage of profitable trades.</div>
                  <div><strong>Calculation:</strong> (Winning Trades ÷ Total Trades) × 100</div>
                  <div><strong>Formula:</strong> (Wins / Total) × 100%</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingDown className="h-7 w-7 text-red-600" />} 
              label="Loss Rate (%)" 
              value={lossRate != null ? formatPercent(lossRate) : 'N/A'} 
              desc="Percentage of trades closed for a loss."
              chart={<MiniPieChart value={lossRate || 0} total={100} color="#DC2626" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Percentage of losing trades.</div>
                  <div><strong>Calculation:</strong> (Losing Trades ÷ Total Trades) × 100</div>
                  <div><strong>Formula:</strong> (Losses / Total) × 100%</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
          </div>
        </section>

        {/* RISK-REWARD & TRADE-LEVEL METRICS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Risk-Reward & Trade-Level Metrics</h2>
            <Target className="ml-3 h-8 w-8 text-purple-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <MetricCard 
              icon={<TrendingUp className="h-7 w-7 text-green-600" />}
              label="Avg Win" 
              value={formatCurrency(safe(stats, 'avg_win'))} 
              desc="Mean profit of all winning trades."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'avg_win', 0), 'area', 'positive')} color="#10B981" id="avg-win" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average profit from winning trades only.</div>
                  <div><strong>Calculation:</strong> Sum of all winning trades ÷ Number of wins</div>
                  <div><strong>Formula:</strong> Σ(Winning Trades) / Win Count</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingDown className="h-7 w-7 text-red-600" />}
              label="Avg Loss" 
              value={formatCurrency(safe(stats, 'avg_loss'))} 
              desc="Mean loss of all losing trades."
              chart={<MiniAreaChart data={generateChartData(Math.abs(safe(stats, 'avg_loss', 0)), 'area', 'negative')} color="#EF4444" id="avg-loss" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average loss from losing trades only.</div>
                  <div><strong>Calculation:</strong> Sum of all losing trades ÷ Number of losses</div>
                  <div><strong>Formula:</strong> Σ(Losing Trades) / Loss Count</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Gauge className="h-7 w-7 text-indigo-600" />}
              label="Avg R:R" 
              value={formatNumber(safe(stats, 'avg_rr'))} 
              desc="Average risk-reward ratio per trade."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'avg_rr', 0), 'line')} color="#6366F1" id="avg-rr" />}
              gradient="from-indigo-500 to-indigo-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average ratio of potential reward to risk per trade.</div>
                  <div><strong>Calculation:</strong> Average of (Potential Reward ÷ Risk Amount)</div>
                  <div><strong>Formula:</strong> Avg(Exit Target - Entry) / (Entry - Stop Loss)</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Risk Amount</div>
                </>
              }
            />
            <MetricCard 
              icon={<Award className="h-7 w-7 text-yellow-600" />}
              label="Best Trade (P&L)" 
              value={formatCurrency(safe(stats, 'best_trade.pnl'))} 
              desc={`Best trade: ${safe(stats, 'best_trade.symbol', '')} on ${safe(stats, 'best_trade.date', '')}`}
              chart={<MiniBarChart data={generateChartData(safe(stats, 'best_trade.pnl', 0), 'bar', 'positive')} color="#F59E0B" />}
              gradient="from-yellow-500 to-yellow-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Your most profitable single trade.</div>
                  <div><strong>Calculation:</strong> Trade with highest P&L value</div>
                  <div><strong>Formula:</strong> Max(Exit Price - Entry Price) × Quantity</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<AlertCircle className="h-7 w-7 text-red-600" />}
              label="Worst Trade (P&L)" 
              value={formatCurrency(safe(stats, 'worst_trade.pnl'))} 
              desc={`Worst trade: ${safe(stats, 'worst_trade.symbol', '')} on ${safe(stats, 'worst_trade.date', '')}`}
              chart={<MiniBarChart data={generateChartData(Math.abs(safe(stats, 'worst_trade.pnl', 0)), 'bar', 'negative')} color="#EF4444" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Your largest losing single trade.</div>
                  <div><strong>Calculation:</strong> Trade with lowest P&L value</div>
                  <div><strong>Formula:</strong> Min(Exit Price - Entry Price) × Quantity</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
          </div>
        </section>

        {/* PROFITABILITY & EFFICIENCY METRICS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Profitability & Efficiency Metrics</h2>
            <BarChart3 className="ml-3 h-8 w-8 text-green-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <MetricCard 
              icon={<Gauge className="h-7 w-7 text-blue-600" />}
              label="Profit Factor" 
              value={formatNumber(safe(stats, 'profit_factor'))} 
              desc="Gross profit divided by gross loss."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'profit_factor', 0), 'line')} color="#3B82F6" id="profit-factor" />}
              gradient="from-blue-500 to-blue-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Ratio of gross profits to gross losses.</div>
                  <div><strong>Calculation:</strong> Gross Profit ÷ Gross Loss</div>
                  <div><strong>Formula:</strong> Σ(Wins) / |Σ(Losses)|</div>
                  <div><strong>Interpretation:</strong> &gt;1 = profitable, &gt;2 = excellent</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Target className="h-7 w-7 text-purple-600" />}
              label="Expectancy" 
              value={formatCurrency(safe(stats, 'expectancy'))} 
              desc="Average expected return per trade."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'expectancy', 0), 'area')} color="#8B5CF6" id="expectancy" />}
              gradient="from-purple-500 to-purple-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Expected profit/loss per trade on average.</div>
                  <div><strong>Calculation:</strong> (Win Rate × Avg Win) - (Loss Rate × Avg Loss)</div>
                  <div><strong>Formula:</strong> (W% × Avg Win) - (L% × Avg Loss)</div>
                  <div><strong>Interpretation:</strong> Positive = profitable strategy</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingUp className="h-7 w-7 text-green-600" />}
              label="Gross Profit" 
              value={formatCurrency(safe(stats, 'gross_profit'))} 
              desc="Sum of all winning-trade profits."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'gross_profit', 0), 'area', 'positive')} color="#10B981" id="gross-profit" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Total profit from all winning trades.</div>
                  <div><strong>Calculation:</strong> Sum of all positive P&L values</div>
                  <div><strong>Formula:</strong> Σ(P&L where P&L &gt; 0)</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingDown className="h-7 w-7 text-red-600" />}
              label="Gross Loss" 
              value={formatCurrency(safe(stats, 'gross_loss'))} 
              desc="Sum of all losing-trade losses (absolute value)."
              chart={<MiniAreaChart data={generateChartData(Math.abs(safe(stats, 'gross_loss', 0)), 'area', 'negative')} color="#EF4444" id="gross-loss" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Total loss from all losing trades (absolute).</div>
                  <div><strong>Calculation:</strong> Absolute sum of all negative P&L values</div>
                  <div><strong>Formula:</strong> |Σ(P&L where P&L &lt; 0)|</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Activity className="h-7 w-7 text-indigo-600" />}
              label="Sharpe Ratio" 
              value={formatNumber(safe(stats, 'sharpe_ratio'))} 
              desc="Risk-adjusted return (annualized)."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'sharpe_ratio', 0), 'line')} color="#6366F1" id="sharpe-ratio" />}
              gradient="from-indigo-500 to-indigo-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Risk-adjusted return relative to volatility.</div>
                  <div><strong>Calculation:</strong> (Return - Risk Free Rate) ÷ Standard Deviation</div>
                  <div><strong>Formula:</strong> (R - Rf) / σ</div>
                  <div><strong>Interpretation:</strong> {'>'}1 = good, {'>'}2 = excellent</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Activity className="h-7 w-7 text-teal-600" />}
              label="Sortino Ratio" 
              value={(() => {
                const sortino = safe(stats, 'sortino_ratio');
                if (sortino === Infinity || sortino === 'Infinity' || sortino === 'inf') {
                  return '∞';
                } else if (sortino === -Infinity || sortino === '-Infinity' || sortino === '-inf') {
                  return '-∞';
                } else if (sortino === 0 || sortino === null || sortino === undefined) {
                  return 'N/A';
                } else {
                  const numValue = parseFloat(sortino);
                  // If the value is capped at 5, show just the cap value
                  if (numValue >= 5.0) {
                    return '5.0';
                  }
                  return formatNumber(sortino);
                }
              })()} 
              desc="Downside risk-adjusted return."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'sortino_ratio', 0), 'line')} color="#0D9488" id="sortino-ratio" />}
              gradient="from-teal-500 to-teal-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Risk-adjusted return using only downside deviation.</div>
                  <div><strong>Calculation:</strong> (Return - Risk Free Rate) ÷ Downside Deviation</div>
                  <div><strong>Formula:</strong> (R - Rf) / σd</div>
                  <div><strong>Interpretation:</strong> ∞ = no downside risk, &gt;1 = good, &gt;2 = excellent</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Percent className="h-7 w-7 text-orange-600" />}
              label="Kelly %" 
              value={formatPercent(safe(stats, 'kelly_percentage'))} 
              desc="Optimal risk per trade as a percentage."
              chart={<MiniPieChart value={safe(stats, 'kelly_percentage', 0)} total={100} color="#EA580C" />}
              gradient="from-orange-500 to-orange-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Optimal percentage of capital to risk per trade.</div>
                  <div><strong>Calculation:</strong> (Win Rate × Avg Win - Loss Rate × Avg Loss) ÷ Avg Win</div>
                  <div><strong>Formula:</strong> (W% × Avg Win - L% × Avg Loss) / Avg Win</div>
                  <div><strong>Interpretation:</strong> Conservative: use 25% of Kelly %</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
          </div>
        </section>

        {/* RISK METRICS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Risk Metrics</h2>
            <AlertCircle className="ml-3 h-8 w-8 text-red-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <MetricCard 
              icon={<TrendingDown className="h-7 w-7 text-red-600" />}
              label="Max Drawdown" 
              value={
                <div>
                  <div className="text-2xl font-bold">{formatCurrency(safe(stats, 'max_drawdown'))}</div>
                  <div className="text-sm text-red-500 font-medium">{formatPercent(safe(stats, 'max_drawdown_percent'))}</div>
                </div>
              }
              desc="Largest equity drop from peak to trough."
              chart={<MiniAreaChart data={generateChartData(Math.abs(safe(stats, 'max_drawdown', 0)), 'area', 'negative')} color="#EF4444" id="max-drawdown" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Largest peak-to-trough decline in equity.</div>
                  <div><strong>Calculation:</strong> Maximum cumulative loss from any peak</div>
                  <div><strong>Formula:</strong> Max(Peak - Current Value)</div>
                  <div><strong>Interpretation:</strong> Lower is better, shows risk tolerance</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingUp className="h-7 w-7 text-green-600" />}
              label="Max Consecutive Wins" 
              value={safe(stats, 'max_consecutive_wins')} 
              desc="Longest winning streak."
              chart={<MiniBarChart data={generateChartData(safe(stats, 'max_consecutive_wins', 0), 'bar', 'positive')} color="#10B981" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Longest sequence of consecutive winning trades.</div>
                  <div><strong>Calculation:</strong> Count of longest streak of positive P&L trades</div>
                  <div><strong>Formula:</strong> Max consecutive count where P&L &gt; 0</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<TrendingDown className="h-7 w-7 text-red-600" />}
              label="Max Consecutive Losses" 
              value={safe(stats, 'max_consecutive_losses')} 
              desc="Longest losing streak."
              chart={<MiniBarChart data={generateChartData(safe(stats, 'max_consecutive_losses', 0), 'bar', 'negative')} color="#EF4444" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Longest sequence of consecutive losing trades.</div>
                  <div><strong>Calculation:</strong> Count of longest streak of negative P&L trades</div>
                  <div><strong>Formula:</strong> Max consecutive count where P&L &lt; 0</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<Activity className="h-7 w-7 text-blue-600" />}
              label="Recovery Factor" 
              value={formatNumber(safe(stats, 'recovery_factor'))} 
              desc="Net profit divided by max drawdown."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'recovery_factor', 0), 'line')} color="#3B82F6" id="recovery-factor" />}
              gradient="from-blue-500 to-blue-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> How quickly profits recover from drawdowns.</div>
                  <div><strong>Calculation:</strong> Net Profit ÷ Maximum Drawdown</div>
                  <div><strong>Formula:</strong> Net Profit / Max DD</div>
                  <div><strong>Interpretation:</strong> &gt;1 = profitable, &gt;2 = excellent recovery</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
          </div>
        </section>

        {/* ADVANCED & EFFICIENCY METRICS */}
        

        {/* TIME & COST METRICS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Time & Cost Metrics</h2>
            <Clock className="ml-3 h-8 w-8 text-purple-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <MetricCard 
              icon={<Clock className="w-7 h-7 text-purple-500" />} 
              label="Avg. Trade Duration (sec)" 
              value={formatNumber(safe(stats, 'avg_trade_duration_seconds'))} 
              desc="Average time a position is held."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'avg_trade_duration_seconds', 0), 'line')} color="#8B5CF6" id="avg-duration" />}
              gradient="from-purple-500 to-purple-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average time from entry to exit.</div>
                  <div><strong>Calculation:</strong> Sum of all trade durations ÷ Number of trades</div>
                  <div><strong>Formula:</strong> Σ(Close Time - Open Time) / N</div>
                  <div><strong>Interpretation:</strong> Helps identify trading style (scalping vs swing)</div>
                  <div><strong>Required fields:</strong> Open Time, Close Time</div>
                </>
              }
            />
            <MetricCard 
              icon={<Clock className="w-7 h-7 text-indigo-500" />} 
              label="Avg. Holding Time/Unit" 
              value={formatNumber(safe(stats, 'avg_holding_time_per_unit'))} 
              desc="Average holding time per unit of trade."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'avg_holding_time_per_unit', 0), 'line')} color="#6366F1" id="avg-holding" />}
              gradient="from-indigo-500 to-indigo-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average time held per unit of quantity.</div>
                  <div><strong>Calculation:</strong> Total holding time ÷ Total quantity traded</div>
                  <div><strong>Formula:</strong> Σ(Duration × Quantity) / Σ(Quantity)</div>
                  <div><strong>Interpretation:</strong> Weighted average considering position size</div>
                  <div><strong>Required fields:</strong> Open Time, Close Time, Quantity</div>
                </>
              }
            />
            <MetricCard 
              icon={<Percent className="w-7 h-7 text-blue-500" />} 
              label="Win/Loss Ratio" 
              value={formatNumber(safe(stats, 'win_loss_ratio'))} 
              desc="Ratio of winning to losing trades."
              chart={<MiniLineChart data={generateChartData(safe(stats, 'win_loss_ratio', 0), 'line')} color="#3B82F6" id="win-loss-ratio" />}
              gradient="from-blue-500 to-blue-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Ratio of number of wins to number of losses.</div>
                  <div><strong>Calculation:</strong> Number of winning trades ÷ Number of losing trades</div>
                  <div><strong>Formula:</strong> Win Count / Loss Count</div>
                  <div><strong>Interpretation:</strong> &gt;1 = more wins than losses</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction</div>
                </>
              }
            />
            <MetricCard 
              icon={<DollarSign className="w-7 h-7 text-green-500" />} 
              label="Avg. Commission" 
              value={formatCurrency(safe(stats, 'avg_commission'))} 
              desc="Average commission per trade."
              chart={<MiniBarChart data={generateChartData(safe(stats, 'avg_commission', 0), 'bar')} color="#10B981" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average commission cost per trade.</div>
                  <div><strong>Calculation:</strong> Total commission ÷ Number of trades</div>
                  <div><strong>Formula:</strong> Σ(Commission) / N</div>
                  <div><strong>Interpretation:</strong> Lower = better cost efficiency</div>
                  <div><strong>Required fields:</strong> Commission field in journal entries</div>
                </>
              }
            />
            <MetricCard 
              icon={<DollarSign className="w-7 h-7 text-emerald-500" />} 
              label="Total Commission" 
              value={formatCurrency(safe(stats, 'total_commission'))} 
              desc="Total commission paid."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'total_commission', 0), 'area')} color="#059669" id="total-commission" />}
              gradient="from-emerald-500 to-emerald-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Total commission costs across all trades.</div>
                  <div><strong>Calculation:</strong> Sum of all commission costs</div>
                  <div><strong>Formula:</strong> Σ(Commission)</div>
                  <div><strong>Interpretation:</strong> Direct impact on net profitability</div>
                  <div><strong>Required fields:</strong> Commission field in journal entries</div>
                </>
              }
            />
            <MetricCard 
              icon={<DollarSign className="w-7 h-7 text-orange-500" />} 
              label="Avg. Slippage" 
              value={formatCurrency(safe(stats, 'avg_slippage'))} 
              desc="Average slippage per trade."
              chart={<MiniBarChart data={generateChartData(safe(stats, 'avg_slippage', 0), 'bar')} color="#EA580C" />}
              gradient="from-orange-500 to-orange-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Average slippage cost per trade.</div>
                  <div><strong>Calculation:</strong> Total slippage ÷ Number of trades</div>
                  <div><strong>Formula:</strong> Σ(Slippage) / N</div>
                  <div><strong>Interpretation:</strong> Lower = better execution quality</div>
                  <div><strong>Required fields:</strong> Slippage field in journal entries</div>
                </>
              }
            />
            <MetricCard 
              icon={<DollarSign className="w-7 h-7 text-red-500" />} 
              label="Total Slippage" 
              value={formatCurrency(safe(stats, 'total_slippage'))} 
              desc="Total slippage costs."
              chart={<MiniAreaChart data={generateChartData(safe(stats, 'total_slippage', 0), 'area')} color="#EF4444" id="total-slippage" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Total slippage costs across all trades.</div>
                  <div><strong>Calculation:</strong> Sum of all slippage costs</div>
                  <div><strong>Formula:</strong> Σ(Slippage)</div>
                  <div><strong>Interpretation:</strong> Direct impact on net profitability</div>
                  <div><strong>Required fields:</strong> Slippage field in journal entries</div>
                </>
              }
            />
          </div>
        </section>

        {/* TIME-BASED HIGHLIGHTS */}
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <div className="h-1 w-12 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full mr-4"></div>
            <h2 className="text-3xl font-bold text-gray-800">Time-Based Highlights</h2>
            <Calendar className="ml-3 h-8 w-8 text-yellow-600" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
              icon={<Calendar className="w-7 h-7 text-green-500" />}
              label="Best Day (Week)" 
              value={safe(stats, 'best_day_of_week.day')} 
              desc={`Best day: ${formatCurrency(safe(stats, 'best_day_of_week.pnl'))}`}
              chart={<MiniBarChart data={generateChartData(safe(stats, 'best_day_of_week.pnl', 0), 'bar', 'positive')} color="#10B981" />}
              gradient="from-green-500 to-green-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Day of week with highest average P&L.</div>
                  <div><strong>Calculation:</strong> Day with highest average P&L per trade</div>
                  <div><strong>Formula:</strong> Day with Max(Avg P&L by day)</div>
                  <div><strong>Interpretation:</strong> Your most profitable trading day</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction, Date</div>
                </>
              }
            />
            <MetricCard 
              icon={<Calendar className="w-7 h-7 text-red-500" />}
              label="Worst Day (Week)" 
              value={safe(stats, 'worst_day_of_week.day')} 
              desc={`Worst day: ${formatCurrency(safe(stats, 'worst_day_of_week.pnl'))}`}
              chart={<MiniBarChart data={generateChartData(Math.abs(safe(stats, 'worst_day_of_week.pnl', 0)), 'bar', 'negative')} color="#EF4444" />}
              gradient="from-red-500 to-red-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Day of week with lowest average P&L.</div>
                  <div><strong>Calculation:</strong> Day with lowest average P&L per trade</div>
                  <div><strong>Formula:</strong> Day with Min(Avg P&L by day)</div>
                  <div><strong>Interpretation:</strong> Your least profitable trading day</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction, Date</div>
                </>
              }
            />
            <MetricCard 
              icon={<Clock className="w-7 h-7 text-blue-500" />}
              label="Best Hour" 
              value={safe(stats, 'best_hour.hour') != null ? `${safe(stats, 'best_hour.hour')}:00` : 'N/A'} 
              desc={`Best hour: ${formatCurrency(safe(stats, 'best_hour.pnl'))}`}
              chart={<MiniBarChart data={generateChartData(safe(stats, 'best_hour.pnl', 0), 'bar', 'positive')} color="#3B82F6" />}
              gradient="from-blue-500 to-blue-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Hour of day with highest average P&L.</div>
                  <div><strong>Calculation:</strong> Hour with highest average P&L per trade</div>
                  <div><strong>Formula:</strong> Hour with Max(Avg P&L by hour)</div>
                  <div><strong>Interpretation:</strong> Your most profitable trading hour</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction, Date</div>
                </>
              }
            />
            <MetricCard 
              icon={<Clock className="w-7 h-7 text-orange-500" />}
              label="Worst Hour" 
              value={safe(stats, 'worst_hour.hour') != null ? `${safe(stats, 'worst_hour.hour')}:00` : 'N/A'} 
              desc={`Worst hour: ${formatCurrency(safe(stats, 'worst_hour.pnl'))}`}
              chart={<MiniBarChart data={generateChartData(Math.abs(safe(stats, 'worst_hour.pnl', 0)), 'bar', 'negative')} color="#EA580C" />}
              gradient="from-orange-500 to-orange-600"
              tooltip={
                <>
                  <div><strong>What it measures:</strong> Hour of day with lowest average P&L.</div>
                  <div><strong>Calculation:</strong> Hour with lowest average P&L per trade</div>
                  <div><strong>Formula:</strong> Hour with Min(Avg P&L by hour)</div>
                  <div><strong>Interpretation:</strong> Your least profitable trading hour</div>
                  <div><strong>Required fields:</strong> Entry Price, Exit Price, Quantity, Direction, Date</div>
                </>
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, desc, chart, gradient, tooltip }) {
  return (
    <div className="flip-card min-h-[220px] w-full h-[280px]" style={{ perspective: '1000px' }}>
      <div 
        className="flip-card-inner group cursor-pointer w-full h-full" 
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          transition: 'transform 0.6s',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* FRONT SIDE */}
        <div 
          className={`flip-card-front bg-white rounded-3xl shadow-lg p-6 flex flex-col min-h-[220px] border border-gray-100`} 
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            textAlign: 'left',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          {/* Header with icon and gradient accent */}
          <div className="flex items-center justify-between mb-4 relative">
            <div className={`p-3 rounded-2xl bg-gradient-to-r ${gradient} shadow-lg flex-shrink-0`}>
              <div className="w-7 h-7 flex items-center justify-center text-white">
                {icon}
              </div>
            </div>
            <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${gradient} opacity-60 flex-shrink-0`}></div>
          </div>
          
          {/* Label */}
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 relative z-10">{label}</p>
          
          {/* Value */}
          <p className="text-2xl font-black text-gray-900 mb-2 leading-tight relative z-10">{value}</p>
          
          {/* Description */}
          <p className="text-xs text-gray-500 mb-3 flex-grow leading-relaxed relative z-10">{desc}</p>
          
          {/* Chart Container */}
          <div className="mt-auto relative z-10 w-full h-[50px] overflow-hidden bg-gray-50 rounded-lg p-1">
            <div className="w-full h-full">
              {chart}
            </div>
          </div>
          
          {/* Hover indicator */}
          <div className="absolute bottom-2 right-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
            Hover for details
          </div>
        </div>

        {/* BACK SIDE */}
        <div 
          className={`flip-card-back bg-gradient-to-br ${gradient} rounded-3xl shadow-2xl p-6 flex flex-col min-h-[220px] text-white`} 
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            textAlign: 'left',
            transform: 'rotateY(180deg)',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          {/* Header - Fixed at top */}
          <div className="flex items-center mb-4 flex-shrink-0">
            <div className="p-2 bg-white/20 rounded-xl mr-3">
              <div className="w-7 h-7 flex items-center justify-center">
                {icon}
              </div>
            </div>
            <h3 className="text-lg font-bold text-white truncate">{label}</h3>
          </div>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent pr-2 pb-2">
            {tooltip ? (
              <div className="text-sm leading-relaxed space-y-3 text-white/90">
                {tooltip}
              </div>
            ) : (
              <div className="text-sm text-white/80 space-y-2">
                <p><strong>Value:</strong> {value}</p>
                <p>{desc}</p>
              </div>
            )}
          </div>
          
          {/* Back indicator - Fixed at bottom */}
          <div className="text-xs text-white/60 text-center mt-4 flex-shrink-0">
            Hover away to return
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .flip-card {
          background-color: transparent;
          width: 100%;
          height: 100%;
        }
        
        .flip-card:hover .flip-card-inner {
          transform: rotateY(180deg);
        }
        
        .flip-card-front,
        .flip-card-back {
          border-radius: 1.5rem;
        }
        
        .flip-card-front * {
          position: relative;
          z-index: 1;
        }
        
        .flip-card-back * {
          position: relative;
          z-index: 1;
        }
        
        /* Custom scrollbar for the back side */
        .flip-card-back .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        
        .flip-card-back .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .flip-card-back .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }
        
        .flip-card-back .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        /* Ensure smooth scrolling */
        .flip-card-back .overflow-y-auto {
          scroll-behavior: smooth;
        }
      `}</style>
    </div>
  );
}
