import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fetchWithAuth } from '../../utils/fetchUtils';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  ReferenceLine,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  Tooltip as RechartsTooltip
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  PieChart,
  Filter,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
  Settings,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { useFilter } from '../../context/FilterContext';
import { useProfile } from '../../context/ProfileContext';
import { buildFilterParams } from '../../utils/filterUtils';
import { API_BASE_URL } from '../../config';

// Dashboard-style color palette
const colors = {
  primary: '#3090FF',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
  orange: '#F97316',
  pink: '#EC4899',
  indigo: '#6366F1',
     gray: {
     50: '#F8FAFC',
     100: '#F1F5F9',
     200: '#E2E8F0',
     300: '#CBD5E1',
     400: '#94A3B8',
     500: '#64748B',
     600: '#475569',
     700: '#334155',
     800: '#1E293B',
     900: '#0F172A'
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

// Get color based on RR value
const getRRColor = (rr) => {
  if (rr >= 3) return colors.success;
  if (rr >= 2) return colors.info;
  if (rr >= 1.5) return colors.warning;
  return colors.danger;
};

// Get color based on PnL
const getPnLColor = (pnl) => {
  return pnl >= 0 ? colors.success : colors.danger;
};

const MetricCard = ({ children, className = "" }) => (
  <div className={`bg-white border border-gray-200 rounded-xl p-6 shadow-lg ${className}`}>
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-gray-200">
        <p className="font-semibold text-gray-900 mb-2">
          {data.symbol} ({data.direction})
        </p>
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            Date: {format(parseISO(data.date), 'MMM dd, yyyy')}
          </p>
          <p className="text-sm text-gray-600">
            RR: <span className="font-medium">{formatNumber(data.rr)}</span>
          </p>
          <p className="text-sm text-gray-600">
            PnL: <span className={`font-medium ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.pnl)}
            </span>
          </p>
          {data.strategy && (
            <p className="text-sm text-gray-600">
              Strategy: <span className="font-medium">{data.strategy}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const LoadingSkeleton = () => (
  <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-200" />
        ))}
      </div>
      <div className="h-96 bg-white rounded-xl animate-pulse border border-gray-200" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-white rounded-xl animate-pulse border border-gray-200" />
        <div className="h-80 bg-white rounded-xl animate-pulse border border-gray-200" />
      </div>
  </div>
);

const ErrorDisplay = ({ error, onRetry }) => (
  <div className="text-center py-12">
    <div className="bg-white rounded-xl p-8 border border-red-200">
      <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Error Loading Data
      </h3>
      <p className="text-gray-600 mb-4">{error}</p>
      <Button onClick={onRetry} variant="outline" className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700">
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </Button>
    </div>
  </div>
);

export default function Amelioration() {
  const { filters } = useFilter();
  const { activeProfile } = useProfile();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customRRThreshold, setCustomRRThreshold] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!activeProfile) return;
    
    setLoading(true);
    setError('');
    
    try {
      const queryParams = buildFilterParams(filters);
      queryParams.set('profile_id', activeProfile.id);
      
      const url = `${API_BASE_URL}/journal/risk-reward-amelioration?${queryParams.toString()}`;
      const response = await fetchWithAuth(url);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      setData(response);
    } catch (err) {
      console.error('Error fetching amelioration data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate performance with custom threshold
  const performanceWithThreshold = useMemo(() => {
    if (!data?.trades) return null;
    
    const threshold = customRRThreshold ?? data.summary.avg_rr;
    
    const aboveThreshold = data.trades.filter(trade => trade.rr >= threshold);
    const belowThreshold = data.trades.filter(trade => trade.rr < threshold);
    
    const abovePnL = aboveThreshold.reduce((sum, trade) => sum + trade.pnl, 0);
    const belowPnL = belowThreshold.reduce((sum, trade) => sum + trade.pnl, 0);
    
    const aboveWins = aboveThreshold.filter(trade => trade.pnl > 0).length;
    const belowWins = belowThreshold.filter(trade => trade.pnl > 0).length;
    
    return {
      threshold,
      aboveThreshold: {
        trades: aboveThreshold.length,
        pnl: abovePnL,
        winRate: aboveThreshold.length > 0 ? (aboveWins / aboveThreshold.length) * 100 : 0,
        avgRR: aboveThreshold.length > 0 ? aboveThreshold.reduce((sum, t) => sum + t.rr, 0) / aboveThreshold.length : 0
      },
      belowThreshold: {
        trades: belowThreshold.length,
        pnl: belowPnL,
        winRate: belowThreshold.length > 0 ? (belowWins / belowThreshold.length) * 100 : 0,
        avgRR: belowThreshold.length > 0 ? belowThreshold.reduce((sum, t) => sum + t.rr, 0) / belowThreshold.length : 0
      }
    };
  }, [data, customRRThreshold]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data?.trades) return [];
    
    return data.trades.map(trade => ({
      ...trade,
      rr: parseFloat(trade.rr),
      pnl: parseFloat(trade.pnl),
      color: getRRColor(trade.rr)
    }));
  }, [data]);

  // Performance by RR range data
  const performanceByRRData = useMemo(() => {
    if (!data?.performance_by_rr) return [];
    
    return data.performance_by_rr.map(item => ({
      ...item,
      color: getRRColor(parseFloat(item.avg_rr))
    }));
  }, [data]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={fetchData} />;
  if (!data) return <div>No data available</div>;

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Risk/Reward Amelioration
          </h1>
          <p className="text-gray-600 mt-2">
            Analyze and optimize your risk/reward performance with interactive insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <Card className="bg-white border-gray-200 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Settings className="h-5 w-5 text-[#3090FF]" />
              Analysis Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="custom-rr" className="text-gray-700">Custom RR Threshold</Label>
                <Input
                  id="custom-rr"
                  type="number"
                  step="0.1"
                  min="0"
                  value={customRRThreshold || ''}
                  onChange={(e) => setCustomRRThreshold(e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder={`Current avg: ${formatNumber(data.summary.avg_rr)}`}
                  className="bg-white border-gray-200 focus:ring-[#3090FF] focus:border-[#3090FF] text-gray-900 placeholder-gray-400"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Set a custom risk/reward threshold to analyze performance
                </p>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => setCustomRRThreshold(null)}
                  disabled={!customRRThreshold}
                  className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                >
                  Reset to Average
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Trades</p>
              <p className="text-2xl font-bold text-[#3090FF]">
                {data.summary.total_trades}
              </p>
            </div>
            <div className="p-2 bg-[#3090FF] rounded-lg">
              <BarChart3 className="h-8 w-8 text-white" />
            </div>
          </div>
        </MetricCard>

        <MetricCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg RR</p>
              <p className="text-2xl font-bold text-[#10B981]">
                {formatNumber(data.summary.avg_rr)}
              </p>
            </div>
            <div className="p-2 bg-[#10B981] rounded-lg">
              <Target className="h-8 w-8 text-white" />
            </div>
          </div>
        </MetricCard>

        <MetricCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Win Rate</p>
              <p className="text-2xl font-bold text-[#8B5CF6]">
                {formatPercent(data.summary.win_rate)}
              </p>
            </div>
            <div className="p-2 bg-[#8B5CF6] rounded-lg">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
          </div>
        </MetricCard>

        <MetricCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Best RR</p>
              <p className="text-2xl font-bold text-[#F59E0B]">
                {formatNumber(data.summary.best_rr)}
              </p>
            </div>
            <div className="p-2 bg-[#F59E0B] rounded-lg">
              <Zap className="h-8 w-8 text-white" />
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Threshold Performance Analysis */}
      {performanceWithThreshold && (
        <Card className="bg-white border-gray-200 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Target className="h-5 w-5 text-[#3090FF]" />
              Performance Analysis (RR ≥ {formatNumber(performanceWithThreshold.threshold)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 p-4 bg-green-50 rounded-xl border border-green-200">
                <h4 className="font-semibold text-green-700 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Above Threshold ({performanceWithThreshold.aboveThreshold.trades} trades)
                </h4>
                                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total PnL</p>
                      <p className={`text-lg font-semibold ${performanceWithThreshold.aboveThreshold.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(performanceWithThreshold.aboveThreshold.pnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Win Rate</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatPercent(performanceWithThreshold.aboveThreshold.winRate)}
                      </p>
                    </div>
                  </div>
              </div>

              <div className="space-y-4 p-4 bg-red-50 rounded-xl border border-red-200">
                <h4 className="font-semibold text-red-700 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Below Threshold ({performanceWithThreshold.belowThreshold.trades} trades)
                </h4>
                                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total PnL</p>
                      <p className={`text-lg font-semibold ${performanceWithThreshold.belowThreshold.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(performanceWithThreshold.belowThreshold.pnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Win Rate</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatPercent(performanceWithThreshold.belowThreshold.winRate)}
                      </p>
                    </div>
                  </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main RR vs PnL Scatter Chart */}
      <Card className="bg-white border-gray-200 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <PieChart className="h-5 w-5 text-[#3090FF]" />
            Risk/Reward vs PnL Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart
              data={chartData}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
              <XAxis
                type="number"
                dataKey="rr"
                name="Risk/Reward"
                domain={[0, 'dataMax + 1']}
                label={{ value: 'Risk/Reward Ratio', position: 'insideBottom', offset: -10 }}
                tick={{ fill: '#374151' }}
              />
              <YAxis
                type="number"
                dataKey="pnl"
                name="PnL"
                label={{ value: 'Profit/Loss ($)', angle: -90, position: 'insideLeft' }}
                tick={{ fill: '#374151' }}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend />
              {performanceWithThreshold && (
                <ReferenceLine
                  x={performanceWithThreshold.threshold}
                  stroke="#8b5cf6"
                  strokeDasharray="3 3"
                  strokeWidth={2}
                  label={{ value: `Threshold: ${formatNumber(performanceWithThreshold.threshold)}`, position: 'top' }}
                />
              )}
              <Scatter
                dataKey="pnl"
                fill="#3b82f6"
                shape="circle"
                data={chartData}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Performance by RR Range */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white border-gray-200 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <BarChart3 className="h-5 w-5 text-[#3090FF]" />
              Performance by RR Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceByRRData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis dataKey="rr_range" tick={{ fill: '#374151' }} />
                <YAxis tick={{ fill: '#374151' }} />
                <RechartsTooltip />
                <Bar dataKey="pnl" fill="#3b82f6">
                  {performanceByRRData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <TrendingUp className="h-5 w-5 text-[#10B981]" />
              Win Rate by RR Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceByRRData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis dataKey="rr_range" tick={{ fill: '#374151' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#374151' }} />
                <RechartsTooltip />
                <Bar dataKey="win_rate" fill="#10b981">
                  {performanceByRRData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <Card className="bg-white border-gray-200 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <Info className="h-5 w-5 text-[#3090FF]" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.summary.avg_rr < 2 && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-yellow-800">
                    Low Average Risk/Reward
                  </h4>
                  <p className="text-yellow-700">
                    Your average RR of {formatNumber(data.summary.avg_rr)} is below the recommended 2:1 ratio. 
                    Consider adjusting your take profit levels to improve your risk/reward profile.
                  </p>
                </div>
              </div>
            )}

            {performanceWithThreshold && performanceWithThreshold.aboveThreshold.pnl > performanceWithThreshold.belowThreshold.pnl && (
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-800">
                    Higher RR Trades Perform Better
                  </h4>
                  <p className="text-green-700">
                    Trades with RR ≥ {formatNumber(performanceWithThreshold.threshold)} are generating 
                    {formatCurrency(performanceWithThreshold.aboveThreshold.pnl - performanceWithThreshold.belowThreshold.pnl)} more profit 
                    than lower RR trades. Focus on setups that offer better risk/reward ratios.
                  </p>
                </div>
              </div>
            )}

            {data.summary.win_rate < 50 && (
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <Info className="h-5 w-5 text-[#3090FF] mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-800">
                    Win Rate Optimization Opportunity
                  </h4>
                  <p className="text-blue-700">
                    With a {formatPercent(data.summary.win_rate)} win rate, focus on improving entry quality 
                    and risk management. Consider using the RR threshold analysis to filter out low-quality setups.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
