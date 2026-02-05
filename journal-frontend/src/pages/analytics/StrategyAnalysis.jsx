import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Settings, TrendingUp, TrendingDown, BarChart3, Activity, Target, DollarSign, ArrowUpDown } from 'lucide-react';

const formatCurrency = (v) => (v == null ? 'N/A' : `$${v.toFixed(2)}`);
const formatPercent = (v) => (v == null ? 'N/A' : `${v.toFixed(1)}%`);
const formatRR = (v) => (v == null ? 'N/A' : v.toFixed(2));

export default function StrategyAnalysis() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('pnl');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('${API_BASE_URL}/journal/strategy-analysis', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const sorted = [...data].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'strategy') return dir * a.strategy.localeCompare(b.strategy);
    return dir * (a[sortBy] - b[sortBy]);
  });

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-slate-600 dark:text-slate-400 font-medium">Loading strategy analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="flex items-center justify-center h-96">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                  <span className="text-red-600 dark:text-red-400 text-sm font-semibold">!</span>
                </div>
              </div>
              <div>
                <h3 className="text-red-800 dark:text-red-200 font-semibold">Error Loading Data</h3>
                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalStrategies = data.length;
  const best = data.reduce((p, c) => (c.pnl > p.pnl ? c : p), data[0] || {});
  const worst = data.reduce((p, c) => (c.pnl < p.pnl ? c : p), data[0] || {});
  const totalPnL = data.reduce((sum, item) => sum + (item.pnl || 0), 0);
  const avgWinRate = data.length > 0 ? data.reduce((sum, item) => sum + (item.win_rate || 0), 0) / data.length : 0;

  const getSortIcon = (column) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4 text-slate-400" />;
    return sortDir === 'asc' ? 
      <TrendingUp className="h-4 w-4 text-blue-600" /> : 
      <TrendingDown className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Strategy Analytics</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            Comprehensive analysis of your trading strategies performance
          </p>
        </div>

        {/* Key Metrics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalStrategies}</span>
            </div>
            <h3 className="text-slate-600 dark:text-slate-400 font-medium">Total Strategies</h3>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Active trading strategies</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(best?.pnl || 0)}</span>
            </div>
            <h3 className="text-slate-600 dark:text-slate-400 font-medium">Best Performer</h3>
            <p className="text-sm text-slate-900 dark:text-white font-semibold mt-1">{best?.strategy || 'N/A'}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(worst?.pnl || 0)}</span>
            </div>
            <h3 className="text-slate-600 dark:text-slate-400 font-medium">Worst Performer</h3>
            <p className="text-sm text-slate-900 dark:text-white font-semibold mt-1">{worst?.strategy || 'N/A'}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <span className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(totalPnL)}
              </span>
            </div>
            <h3 className="text-slate-600 dark:text-slate-400 font-medium">Total P&L</h3>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Avg Win Rate: {formatPercent(avgWinRate)}</p>
          </div>
        </div>

        {/* Strategy Performance Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span>Strategy Performance Overview</span>
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  {[
                    { key: 'strategy', label: 'Strategy' },
                    { key: 'trades', label: 'Trades' },
                    { key: 'win_rate', label: 'Win Rate' },
                    { key: 'avg_rr', label: 'Avg R:R' },
                    { key: 'pnl', label: 'P&L' }
                  ].map(col => (
                    <th 
                      key={col.key}
                      className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200"
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center space-x-2">
                        <span>{col.label}</span>
                        {getSortIcon(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {sorted.map((row, i) => (
                  <tr 
                    key={i} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.strategy}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{row.trades}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-3">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(row.win_rate || 0, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{formatPercent(row.win_rate)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${(row.avg_rr || 0) >= 1 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {formatRR(row.avg_rr)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`text-sm font-bold ${(row.pnl || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(row.pnl)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Win Rate vs Risk Reward Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-6">
              <Target className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Win Rate vs Risk:Reward</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="avg_rr" 
                    name="Avg R:R" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis 
                    dataKey="win_rate" 
                    name="Win Rate %" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'Avg R:R' ? formatRR(value) : formatPercent(value), 
                      name
                    ]}
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f1f5f9'
                    }}
                  />
                  <Scatter data={data} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* P&L by Strategy Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-6">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">P&L by Strategy</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="strategy" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value) => [formatCurrency(value), 'P&L']}
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f1f5f9'
                    }}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

