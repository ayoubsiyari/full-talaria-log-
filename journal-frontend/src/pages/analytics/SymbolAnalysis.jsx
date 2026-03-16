import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '../../config';
import { useFilter } from '../../context/FilterContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
  PieChart,
  Pie,
  LineChart,
  Line,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { 
  Settings, 
  ChevronUp, 
  ChevronDown, 
  Info, 
  TrendingUp, 
  TrendingDown, 
  Download, 
  Filter, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Activity, 
  Target, 
  Database, 
  Search,
  Sparkles,
  DollarSign,
  Award,

} from 'lucide-react';

// ─── Format helpers ─────────────────────────────────────────────────────────────
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
const formatRiskReward = (val) =>
  val == null ? 'N/A' : `${parseFloat(val).toFixed(2)}:1`;

export default function SymbolAnalysis() {
  const { filters, clearFilters } = useFilter();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('pnl');
  const [sortDirection, setSortDirection] = useState('desc');
  const [symbolFilter, setSymbolFilter] = useState('');

  const [showCols, setShowCols] = useState({ profit_factor: true, gross_profit: true, gross_loss: true });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [compareMode, setCompareMode] = useState(true); // true for compare, false for accumulative
  const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
  const symbolDropdownRef = useRef(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // Light theme colors
  const tickColor = '#4b5563';
  const gridColor = '#e5e7eb';
  const tooltipBg = 'rgba(255, 255, 255, 0.95)';
  const tooltipBorder = '#d1d5db';
  const legendColor = '#374151';

  // holders for lazy PDF libs (module-scope refs)
  let jsPDFRef = null;
  let html2canvasRef = null;

  // ─── Fetch per-symbol stats ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchSymbolStats = async () => {
      try {
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
        if (filters.variables && Object.keys(filters.variables || {}).length > 0) queryParams.append('variables', JSON.stringify(filters.variables));
        if (filters.variableCombinations && filters.variableCombinations.enabled && filters.variableCombinations.combinations.length > 0) {
          queryParams.append('combinations', JSON.stringify(filters.variableCombinations.combinations));
        }
        
        const url = `${API_BASE_URL}/journal/symbol-analysis?${queryParams.toString()}`;
        console.log('SymbolAnalysis: Fetching with filters:', url);
        console.log('SymbolAnalysis: Current filters:', filters);
        console.log('SymbolAnalysis: Query params:', queryParams.toString());
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch symbol data');
        const json = await res.json();
        console.log('SymbolAnalysis: Received data:', json);
        console.log('SymbolAnalysis: Number of symbols received:', json.length);
        console.log('SymbolAnalysis: Symbols received:', json.map(item => item.symbol));
        setData(json);
      } catch (err) {
        console.error('❌ Error loading symbol data:', err);
        setError(err.message || 'Error loading data');
      } finally {
        setLoading(false);
      }
    };
    fetchSymbolStats();
  }, [filters]);

  // fetch all entries once for equity
  useEffect(()=>{
    const fetchEntries = async () => {
      try{
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
        if (filters.variables && Object.keys(filters.variables || {}).length > 0) queryParams.append('variables', JSON.stringify(filters.variables));
        if (filters.variableCombinations && filters.variableCombinations.enabled && filters.variableCombinations.combinations.length > 0) {
          queryParams.append('combinations', JSON.stringify(filters.variableCombinations.combinations));
        }
        
        const url = `${API_BASE_URL}/journal/list?${queryParams.toString()}`;
        console.log('SymbolAnalysis: Fetching entries with filters:', url);
        
        const res = await fetch(url, {headers:{Authorization:`Bearer ${token}`}});
        if(res.ok){
          const j= await res.json();
          setEntries(j);
        }
      }catch(e){console.error('entries fetch',e)}
    }
    fetchEntries();
  },[filters]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target)) {
        setIsSymbolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // ─── Sorting helpers ─────────────────────────────────────────────────────────
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };
  const sortIcon = (column) => {
    if (sortBy === column) {
      return sortDirection === 'asc' ? (
        <ChevronUp className="h-4 w-4 text-blue-600" />
      ) : (
        <ChevronDown className="h-4 w-4 text-blue-600" />
      );
    }
    return null;
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const handleSymbolSelection = (event) => {
    const { value, checked } = event.target;
    setSelectedSymbols(prev =>
        checked ? [...prev, value] : prev.filter(symbol => symbol !== value)
    );
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allSymbolIds = symbolsForDropdown.map(d => d.symbol);
      setSelectedSymbols(allSymbolIds);
    } else {
      setSelectedSymbols([]);
    }
  };

  const filteredData = data
    .filter((d) =>
      symbolFilter ? d.symbol.toLowerCase().includes(symbolFilter.toLowerCase()) : true,
    );

  const sortedData = () => {
    if (!filteredData) return [];
    return [...filteredData].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      if (sortBy === 'symbol') return dir * a.symbol.localeCompare(b.symbol);
      return dir * (a[sortBy] - b[sortBy]);
    });
  };

  const symbolsForDropdown = React.useMemo(() => {
    if (!filteredData) return [];
    return [...filteredData].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [filteredData]);

  // Get all unique symbols from the original data for the dropdown
  const allAvailableSymbols = React.useMemo(() => {
    if (!data) return [];
    const uniqueSymbols = [...new Set(data.map(d => d.symbol))];
    return uniqueSymbols.sort((a, b) => a.localeCompare(b));
  }, [data]);

  // equity curve data
  const equityData = React.useMemo(() => {
    if (selectedSymbols.length === 0) return [];

    if (compareMode) {
      // COMPARE MODE LOGIC
      const individualCurves = selectedSymbols.reduce((acc, symbol) => {
          const trades = entries
              .filter(e => e.symbol?.toUpperCase() === symbol.toUpperCase())
              .sort((a, b) => new Date(a.date) - new Date(b.date));

          let runningPnl = 0;
          acc[symbol] = trades.map(trade => {
              runningPnl += trade.pnl || 0;
              const tradeDate = trade.date.split('T')[0];
              return { date: tradeDate, [symbol]: runningPnl };
          });
          return acc;
      }, {});

      const allDates = [
          ...new Set(Object.values(individualCurves).flat().map(d => d.date))
      ].sort((a, b) => new Date(a) - new Date(b));

      const mergedData = allDates.map(date => {
          const dataPoint = { date };
          selectedSymbols.forEach(symbol => {
              const curve = individualCurves[symbol];
              const relevantPoints = curve.filter(p => p.date <= date);
              if (relevantPoints.length > 0) {
                  dataPoint[symbol] = relevantPoints[relevantPoints.length - 1][symbol];
              } else {
                  dataPoint[symbol] = 0;
              }
          });
          return dataPoint;
      });
      return mergedData;
    } else {
      // ACCUMULATIVE MODE LOGIC
      const allTrades = entries
        .filter(e => selectedSymbols.some(s => s.toUpperCase() === e.symbol?.toUpperCase()));

      if (allTrades.length === 0) return [];

      const dailyPnl = new Map();
      allTrades.forEach(trade => {
        const tradeDate = trade.date.split('T')[0];
        const pnl = trade.pnl || 0;
        dailyPnl.set(tradeDate, (dailyPnl.get(tradeDate) || 0) + pnl);
      });

      const sortedDates = [...dailyPnl.keys()].sort((a, b) => new Date(a) - new Date(b));

      let runningPnl = 0;
      return sortedDates.map(date => {
        runningPnl += dailyPnl.get(date);
        return { date, equity: runningPnl };
      });
    }
  }, [entries, selectedSymbols, compareMode]);

  // Get top 5 symbols by trades (for best performers)
  const top5Symbols = filteredData.slice(0, 5);
  const top5SymbolNames = new Set(top5Symbols.map(d => d.symbol));

  // Get worst 5 symbols by P&L, excluding those already in top 5
  const worst5Symbols = [...filteredData]
    .filter(d => !top5SymbolNames.has(d.symbol)) // Exclude symbols already in top 5
    .sort((a, b) => a.pnl - b.pnl) // Sort by P&L ascending (worst first)
    .slice(0, 5); // Take worst 5

  // radar data (top 5 by trades) - normalized to 0-100 scale
  const radarData = top5Symbols.map(d => {
    // Normalize values to 0-100 scale for better radar chart visualization
    const normalizedWinRate = d.win_rate || 0; // Already 0-100
    const normalizedRR = Math.min(100, Math.max(0, (d.avg_rr || 0) * 20)); // Scale R:R to 0-100 (5:1 = 100)
    const normalizedPF = Math.min(100, Math.max(0, (d.profit_factor || 0) * 33.33)); // Scale PF to 0-100 (3:1 = 100)
    
    return {
      symbol: d.symbol,
      win_rate: normalizedWinRate,
      rr: normalizedRR,
      pf: normalizedPF
    };
  });

  // radar data (worst 5 by P&L) - normalized to 0-100 scale
  const worstRadarData = worst5Symbols.map(d => {
    // Normalize values to 0-100 scale for better radar chart visualization
    const normalizedWinRate = d.win_rate || 0; // Already 0-100
    const normalizedRR = Math.min(100, Math.max(0, (d.avg_rr || 0) * 20)); // Scale R:R to 0-100 (5:1 = 100)
    const normalizedPF = Math.min(100, Math.max(0, (d.profit_factor || 0) * 33.33)); // Scale PF to 0-100 (3:1 = 100)
    
    return {
      symbol: d.symbol,
      win_rate: normalizedWinRate,
      rr: normalizedRR,
      pf: normalizedPF
    };
  });

  // ─── UI States ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 p-12">
            <div className="animate-pulse space-y-8">
              <div className="flex items-center space-x-6">
                <div className="h-16 w-16 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-2xl animate-pulse"></div>
                <div className="space-y-3">
                  <div className="h-10 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl w-80 animate-pulse"></div>
                  <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg w-64 animate-pulse"></div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl animate-pulse"></div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-96 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-orange-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-red-200 p-12">
            <div className="flex items-center justify-center space-x-6 text-red-600">
              <div className="p-4 bg-red-100 rounded-2xl border border-red-200">
                <Info className="h-10 w-10" />
              </div>
              <div>
                <h2 className="text-3xl font-bold">Error Loading Data</h2>
                <p className="text-xl mt-3 text-red-500">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Derived helpers ────────────────────────────────────────────────────────
  const totalPairs = data.length;
  const bestPair = [...data].sort((a, b) => b.pnl - a.pnl)[0];
  const worstPair = [...data].sort((a, b) => a.pnl - b.pnl)[0];
  const tradesPie = data.map((d) => ({ name: d.symbol, value: d.trades }));

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null; // Do not render label for small slices
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontWeight="bold" fontSize="14">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <div className="p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 mb-8 p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-indigo-50/50"></div>
            <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="flex items-center space-x-6">
                <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-blue-700 to-indigo-700 bg-clip-text text-transparent">
                    Symbol Analysis
                  </h1>
                  <p className="text-gray-600 mt-3 text-lg">Advanced trading performance insights & analytics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => window.location.reload()}
                  className="group inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <Settings className="h-6 w-6 mr-3 group-hover:rotate-90 transition-transform duration-300" />
                  Refresh Data
                </button>
                <button
                  onClick={clearFilters}
                  className="group inline-flex items-center px-8 py-4 bg-gradient-to-r from-red-600 to-pink-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <Filter className="h-6 w-6 mr-3 group-hover:rotate-90 transition-transform duration-300" />
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 mb-8 p-8">
            <div className="flex flex-wrap gap-4 mb-8">
              {[
                { key: 'dashboard', label: 'Dashboard', icon: BarChart3, gradient: 'from-blue-500 to-cyan-500' },
                { key: 'equity', label: 'Equity Curve', icon: Activity, gradient: 'from-emerald-500 to-teal-500' },
                { key: 'radar', label: 'Performance Radar', icon: Target, gradient: 'from-orange-500 to-red-500' }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`group inline-flex items-center px-8 py-4 rounded-2xl font-semibold transition-all duration-300 ${
                      activeTab === tab.key
                        ? `bg-gradient-to-r ${tab.gradient} text-white shadow-xl transform scale-105`
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-lg hover:scale-105'
                    }`}
                  >
                    <Icon className={`h-6 w-6 mr-3 transition-transform duration-300 ${activeTab === tab.key ? 'scale-110' : 'group-hover:scale-110'}`} />
                    {tab.label}
                  </button>
                );
              })}
              <button
                onClick={async () => {
                  if (!jsPDFRef) {
                    const pdfMod = await import('jspdf');
                    jsPDFRef = pdfMod.jsPDF;
                    const h2cMod = await import('html2canvas');
                    html2canvasRef = h2cMod.default;
                  }
                  const node = document.getElementById('symbol-dashboard');
                  if (!node) return;
                  const canvas = await html2canvasRef(node);
                  const img = canvas.toDataURL('image/png');
                  const pdf = new jsPDFRef('p', 'mm', 'a4');
                  const width = pdf.internal.pageSize.getWidth();
                  const height = (canvas.height * width) / canvas.width;
                  pdf.addImage(img, 'PNG', 0, 0, width, height);
                  pdf.save('symbol-analysis.pdf');
                }}
                className="ml-auto group inline-flex items-center px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
              >
                <Download className="h-6 w-6 mr-3 group-hover:translate-y-1 transition-transform duration-300" />
                Export PDF
              </button>
            </div>

            
          </div>

          {activeTab === 'dashboard' && (
            <div id="symbol-dashboard" className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                {/* Pairs Traded */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-cyan-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Pairs Traded</h3>
                      <div className="p-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl shadow-lg">
                        <Database className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-4xl font-bold text-gray-800">{totalPairs}</p>
                    <p className="text-sm text-gray-500 mt-1">Showing: {filteredData.length}</p>
                  </div>
                </div>

                {/* Total P&L */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total P&L</h3>
                      <div className="p-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl shadow-lg">
                        <DollarSign className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-4xl font-bold text-emerald-600">
                      {formatCurrency(data.reduce((sum, d) => sum + d.pnl, 0))}
                    </p>
                  </div>
                </div>

                {/* Avg Win Rate */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-pink-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Avg Win Rate</h3>
                      <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg">
                        <Target className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-4xl font-bold text-purple-600">
                      {formatPercent(data.reduce((s, d) => s + (d.win_rate || 0), 0) / data.length)}
                    </p>
                  </div>
                </div>

                {/* Avg R:R */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Avg R:R</h3>
                      <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-xl shadow-lg">
                        <Activity className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-4xl font-bold text-indigo-600">
                      {formatRiskReward(data.reduce((s, d) => s + (d.avg_rr || 0), 0) / data.length)}
                    </p>
                  </div>
                </div>

                {/* Best Pair */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Best Pair</h3>
                      <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl shadow-lg">
                        <Award className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{bestPair?.symbol || '—'}</p>
                    <p className="text-sm text-gray-500 mt-2">P&L: {formatCurrency(bestPair?.pnl)}</p>
                  </div>
                </div>

                {/* Worst Pair */}
                <div className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-orange-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Worst Pair</h3>
                      <div className="p-3 bg-gradient-to-r from-red-500 to-orange-500 rounded-xl shadow-lg">
                        <TrendingDown className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{worstPair?.symbol || '—'}</p>
                    <p className="text-sm text-gray-500 mt-2">P&L: {formatCurrency(worstPair?.pnl)}</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200 hover:shadow-3xl transition-all duration-300">
                {/* Gross Profit vs Loss */}
                

                {/* Win Rate by Symbol */}
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200 hover:shadow-3xl transition-all duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-800">Win Rate by Symbol ({filteredData.length} symbols)</h3>
                    <div className="p-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl shadow-lg">
                      <Target className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={filteredData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis 
                        dataKey="symbol" 
                        tick={{ fontSize: 12, fill: tickColor, angle: -45, textAnchor: 'end' }} 
                        axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                        tickLine={{ stroke: '#d1d5db' }}
                        interval={0}
                        height={70}
                        dy={5}
                      />
                      <YAxis 
                        tick={{ fontSize: 13, fill: tickColor, fontWeight: 500 }} 
                        axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                        tickLine={{ stroke: '#d1d5db' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          backdropFilter: 'blur(16px)',
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '16px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                          color: '#374151',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                        formatter={(v) => [formatPercent(v), 'Win Rate']}
                      />
                      <Bar dataKey="win_rate" fill="url(#winRateGradient)" radius={[8, 8, 0, 0]} />
                      <defs>
                        <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#1d4ed8" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* P&L by Symbol */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200 hover:shadow-3xl transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-800">P&L by Symbol ({filteredData.length} symbols)</h3>
                  <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={filteredData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis 
                      dataKey="symbol" 
                      tick={{ fontSize: 12, fill: tickColor, angle: -45, textAnchor: 'end' }} 
                      axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                      tickLine={{ stroke: '#d1d5db' }}
                      interval={0}
                      height={70}
                      dy={5}
                    />
                    <YAxis 
                      tick={{ fontSize: 13, fill: tickColor, fontWeight: 500 }} 
                      axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                      tickLine={{ stroke: '#d1d5db' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: '16px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                      formatter={(value) => [formatCurrency(value), 'P&L']}
                    />
                    <Bar dataKey="pnl" radius={[8, 8, 0, 0]}>
                      {filteredData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Trade Distribution */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200 hover:shadow-3xl transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-800">Trade Distribution ({data.length} symbols)</h3>
                  <div className="p-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shadow-lg">
                    <PieChartIcon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={tradesPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      fill="#8884d8"
                      paddingAngle={3}
                      labelLine={false}
                      label={renderCustomizedLabel}
                    >
                      {tradesPie.map((entry, index) => (
                        <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: '16px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: '14px', color: legendColor, fontWeight: '500' }} 
                      iconType="rect"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Data Table */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="p-8 flex items-center justify-between border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-800">Detailed Symbol Data ({filteredData.length} symbols)</h3>
                  <div className="p-3 bg-gradient-to-r from-gray-600 to-gray-700 rounded-xl shadow-lg">
                    <Database className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200">
                        <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('symbol')}>
                          <div className="flex items-center space-x-2"><span>Symbol</span>{sortIcon('symbol')}</div>
                        </th>
                        <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('trades')}>
                          <div className="flex items-center space-x-2"><span>Trades</span>{sortIcon('trades')}</div>
                        </th>
                        <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('pnl')}>
                          <div className="flex items-center space-x-2"><span>P&L</span>{sortIcon('pnl')}</div>
                        </th>
                        <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('win_rate')}>
                          <div className="flex items-center space-x-2"><span>Win Rate</span>{sortIcon('win_rate')}</div>
                        </th>
                        <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('avg_rr')}>
                          <div className="flex items-center space-x-2"><span>Avg R:R</span>{sortIcon('avg_rr')}</div>
                        </th>
                        {showCols.profit_factor && (
                          <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('profit_factor')}>
                            <div className="flex items-center space-x-2"><span>Profit Factor</span>{sortIcon('profit_factor')}</div>
                          </th>
                        )}
                        {showCols.gross_profit && (
                          <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('gross_profit')}>
                            <div className="flex items-center space-x-2"><span>Gross Profit</span>{sortIcon('gross_profit')}</div>
                          </th>
                        )}
                        {showCols.gross_loss && (
                          <th className="py-4 px-6 text-sm font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-800 transition-colors" onClick={() => handleSort('gross_loss')}>
                            <div className="flex items-center space-x-2"><span>Gross Loss</span>{sortIcon('gross_loss')}</div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortedData().map((row, index) => (
                        <tr key={row.symbol} className="hover:bg-gray-50/60 transition-colors duration-200">
                          <td className="py-4 px-6 font-bold text-gray-800">{row.symbol}</td>
                          <td className="py-4 px-6 text-gray-600 font-medium">{row.trades}</td>
                          <td className={`py-4 px-6 font-bold ${row.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(row.pnl)}</td>
                          <td className="py-4 px-6 text-gray-600 font-medium">{formatPercent(row.win_rate)}</td>
                          <td className="py-4 px-6 text-gray-600 font-medium">{formatRiskReward(row.avg_rr)}</td>
                          {showCols.profit_factor && (
                            <td className="py-4 px-6 text-gray-600 font-medium">{row.profit_factor?.toFixed(2) || 'N/A'}</td>
                          )}
                          {showCols.gross_profit && (
                            <td className="py-4 px-6 text-emerald-600 font-bold">{formatCurrency(row.gross_profit)}</td>
                          )}
                          {showCols.gross_loss && (
                            <td className="py-4 px-6 text-red-600 font-bold">{formatCurrency(row.gross_loss)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'equity' && (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-6">
                <div className="flex items-center">
                  <div className="p-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl shadow-lg mr-4">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Equity Curve by Symbol</h2>
                </div>
                <div className="flex flex-col lg:flex-row items-start lg:items-center space-y-4 lg:space-y-0 lg:space-x-6">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-gray-600">Accumulative</span>
                    <button
                      onClick={() => setCompareMode(!compareMode)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${compareMode ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ease-in-out ${compareMode ? 'translate-x-6' : 'translate-x-1'} shadow-lg`}/>
                    </button>
                    <span className="text-sm font-medium text-gray-600">Compare</span>
                  </div>
                  <div className="relative" ref={symbolDropdownRef}>
                    <label className="text-sm font-medium text-gray-600 block mb-2">Symbols:</label>
                    <button
                        onClick={() => setIsSymbolDropdownOpen(!isSymbolDropdownOpen)}
                        className="w-full lg:w-64 flex justify-between items-center px-4 py-3 border border-gray-300 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-gray-800"
                    >
                        <span className="block truncate">{selectedSymbols.length > 0 ? selectedSymbols.join(', ') : 'Select symbols'}</span>
                        {isSymbolDropdownOpen ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />} 
                    </button>
                    {isSymbolDropdownOpen && (
                        <div className="absolute z-10 mt-2 w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 p-4">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <input
                                        id="select-all"
                                        type="checkbox"
                                        onChange={handleSelectAll}
                                        checked={selectedSymbols.length === symbolsForDropdown.length && symbolsForDropdown.length > 0}
                                        className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor="select-all" className="ml-3 text-sm font-medium text-gray-800 cursor-pointer">
                                        Select All
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2">
                                {symbolsForDropdown.map((d) => (
                                    <div key={d.symbol} className="flex items-center p-2 rounded-lg hover:bg-gray-100 transition-colors">
                                        <input
                                            id={`symbol-${d.symbol}`}
                                            type="checkbox"
                                            value={d.symbol}
                                            checked={selectedSymbols.includes(d.symbol)}
                                            onChange={handleSymbolSelection}
                                            className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                        />
                                        <label htmlFor={`symbol-${d.symbol}`} title={d.symbol} className="ml-3 text-sm font-medium text-gray-800 cursor-pointer">
                                            {d.symbol}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
              {equityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={450}>
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: tickColor, angle: -45, textAnchor: 'end' }} 
                      axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                      tickLine={{ stroke: '#d1d5db' }}
                      interval="preserveStartEnd"
                      height={70}
                      dy={5}
                    />
                    <YAxis 
                      tick={{ fontSize: 13, fill: tickColor, fontWeight: 500 }} 
                      axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
                      tickLine={{ stroke: '#d1d5db' }}
                    />
                    <Tooltip 
                      formatter={(value, name) => [formatCurrency(value), name]}
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: '16px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    />
                    <Legend wrapperStyle={{ color: legendColor, fontSize: '14px', fontWeight: '500' }} />
                    {compareMode ? (
                      selectedSymbols.map((symbol, index) => (
                        <Line 
                          key={symbol}
                          type="monotone" 
                          dataKey={symbol} 
                          stroke={COLORS[index % COLORS.length]} 
                          strokeWidth={3} 
                          dot={false} 
                          name={symbol}
                        />
                      ))
                    ) : (
                      <Line 
                        type="monotone" 
                        dataKey="equity" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        dot={false} 
                        name="Accumulated Equity"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  <p className="text-lg">Select one or more symbols to view equity curves</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'radar' && (
            <>
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200 mb-8">
                <div className="flex items-center mb-8">
                  <div className="p-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shadow-lg mr-4">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Performance Radar (Top 5 Symbols)</h2>
                </div>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={550}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={gridColor} />
                      <PolarAngleAxis 
                        dataKey="symbol" 
                        tick={{ fontSize: 13, fill: tickColor, fontWeight: 500 }} 
                      />
                      <PolarRadiusAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: tickColor }} 
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          backdropFilter: 'blur(16px)',
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '16px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                          color: '#374151',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                        formatter={(value, name) => {
                          // Convert normalized values back to original format for tooltip
                          if (name === 'Win Rate') return [`${value.toFixed(1)}%`, name];
                          if (name === 'Risk Reward') return [`${(value / 20).toFixed(2)}:1`, name];
                          if (name === 'Profit Factor') return [`${(value / 33.33).toFixed(2)}:1`, name];
                          return [value, name];
                        }}
                      />
                      <Radar name="Win Rate" dataKey="win_rate" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={3} />
                      <Radar name="Risk Reward" dataKey="rr" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={3} />
                      <Radar name="Profit Factor" dataKey="pf" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={3} />
                      <Legend wrapperStyle={{ color: legendColor, fontSize: '14px', fontWeight: '500' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <p className="text-lg">No data available for radar chart</p>
                  </div>
                )}
              </div>

              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-gray-200">
                <div className="flex items-center mb-8">
                  <div className="p-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl shadow-lg mr-4">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Performance Radar (Worst 5 Symbols)</h2>
                </div>
                {worstRadarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={550}>
                    <RadarChart data={worstRadarData}>
                      <PolarGrid stroke={gridColor} />
                      <PolarAngleAxis 
                        dataKey="symbol" 
                        tick={{ fontSize: 13, fill: tickColor, fontWeight: 500 }} 
                      />
                      <PolarRadiusAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: tickColor }} 
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          backdropFilter: 'blur(16px)',
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '16px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                          color: '#374151',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                        formatter={(value, name) => {
                          // Convert normalized values back to original format for tooltip
                          if (name === 'Win Rate') return [`${value.toFixed(1)}%`, name];
                          if (name === 'Risk Reward') return [`${(value / 20).toFixed(2)}:1`, name];
                          if (name === 'Profit Factor') return [`${(value / 33.33).toFixed(2)}:1`, name];
                          return [value, name];
                        }}
                      />
                      <Radar name="Win Rate" dataKey="win_rate" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={3} />
                      <Radar name="Risk Reward" dataKey="rr" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={3} />
                      <Radar name="Profit Factor" dataKey="pf" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={3} />
                      <Legend wrapperStyle={{ color: legendColor, fontSize: '14px', fontWeight: '500' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <p className="text-lg">No data available for radar chart</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

