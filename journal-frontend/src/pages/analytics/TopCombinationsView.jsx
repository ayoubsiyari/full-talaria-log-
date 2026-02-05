import React, { useEffect, useState, useMemo } from 'react';
import { useFilter } from '../../context/FilterContext';
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
} from 'recharts';
import {
  ArrowLeft,
  Settings,
  Filter,
  RefreshCw,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Award,
  Activity,
  Info,
  Download,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Format helpers
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

// Enhanced Block-Style Y-Axis Tick Component with Responsive Text
const CustomYAxisTick = ({ x, y, payload }) => {
  const value = payload.value;
  
  // Parse the combination string to extract variable names and values
  const parseCombination = (comboString) => {
    if (!comboString) return { variables: [], displayText: 'Unknown' };
    
    // Try different formats
    let parts;
    let variables = [];
    
    if (comboString.includes(' & ') && comboString.includes(':')) {
      // Format: "variable1:value1 & variable2:value2"
      parts = comboString.split(' & ');
      variables = parts.map(part => {
        const [varName, varValue] = part.split(':').map(s => s.trim());
        return { name: varName || 'Unknown', value: varValue || 'N/A' };
      });
    } else if (comboString.includes('+') && comboString.includes(':')) {
      // Format: "variable1:value1+variable2:value2" (new backend format)
      parts = comboString.split('+').map(s => s.trim());
      variables = parts.map(part => {
        const [varName, varValue] = part.split(':').map(s => s.trim());
        return { name: varName || 'Unknown', value: varValue || 'N/A' };
      });
    } else if (comboString.includes('+')) {
      // Format: "variable1+variable2" (old backend format)
      parts = comboString.split('+').map(s => s.trim());
      variables = parts.map(part => {
        return { name: part, value: 'Present' };
      });
    } else {
      // Single variable
      variables = [{ name: comboString, value: 'Present' }];
    }
    
    return { variables };
  };
  
  const { variables } = parseCombination(value);
  
  // Get the current combination level from the component state
  // We need to access the combinationLevel state from the parent component
  // For now, we'll use a global variable or pass it as a prop
  const currentCombinationLevel = window.currentCombinationLevel || 2;
  
  // Filter variables to show only the first N variables based on combination level
  const filteredVariables = variables.slice(0, currentCombinationLevel);
  
  // Responsive text calculation function
  const calculateResponsiveText = (text, maxWidth, maxHeight) => {
    const baseFontSize = Math.min(maxWidth / 8, maxHeight / 2, 16); // Base calculation
    const textLength = text.length;
    
    // Adjust font size based on text length
    let fontSize = baseFontSize;
    if (textLength > 15) fontSize = Math.max(fontSize * 0.7, 8);
    else if (textLength > 10) fontSize = Math.max(fontSize * 0.85, 10);
    else if (textLength > 5) fontSize = Math.max(fontSize * 0.95, 12);
    
    // Truncate text if it's too long
    const maxChars = Math.floor(maxWidth / (fontSize * 0.6));
    const displayText = text.length > maxChars ? text.substring(0, maxChars - 2) + '...' : text;
    
    return { fontSize, displayText };
  };
  
  // Enhanced color palette for different variable types
  const colorPalette = [
    { primary: '#3b82f6', secondary: '#1d4ed8' }, // Blue
    { primary: '#10b981', secondary: '#059669' }, // Green
    { primary: '#f59e0b', secondary: '#d97706' }, // Amber
    { primary: '#ef4444', secondary: '#dc2626' }, // Red
    { primary: '#8b5cf6', secondary: '#7c3aed' }, // Purple
    { primary: '#06b6d4', secondary: '#0891b2' }, // Cyan
    { primary: '#84cc16', secondary: '#65a30d' }, // Lime
    { primary: '#f97316', secondary: '#ea580c' }, // Orange
  ];
  
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{value}</title>
      
             {/* Render blocks for each variable side by side */}
       {filteredVariables.map((variable, index) => (
         <g key={index} transform={`translate(${index * 160 - (filteredVariables.length - 1) * 60 - 350}, 0)`}>
                     {/* Variable name (larger block) */}
           <rect
             x={-70}
             y={-12}
             width={90}
             height={24}
             fill="#3b82f6"
             rx={6}
           />
           <text
             x={-25}
             y={0}
             textAnchor="middle"
             fill="white"
             fontSize={13}
             fontWeight="600"
           >
             {variable.name}
           </text>
           
           {/* Connecting line */}
           <line
             x1={20}
             y1={0}
             x2={25}
             y2={0}
             stroke="#64748b"
             strokeWidth={2}
           />
           
           {/* Variable value (smaller block) */}
           <rect
             x={25}
             y={-10}
             width={50}
             height={20}
             fill="#f8fafc"
             stroke="#e2e8f0"
             strokeWidth={1}
             rx={4}
           />
           <text
             x={50}
             y={0}
             textAnchor="middle"
             fill="#1e293b"
             fontSize={11}
             fontWeight="500"
           >
             {variable.value}
           </text>
        </g>
      ))}
      
      
    </g>
  );
};

// Enhanced Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  
  // Parse combination for better display
  const parseCombination = (comboString) => {
    if (!comboString) return [];
    const parts = comboString.split(' & ');
    return parts.map(part => {
      const [varName, varValue] = part.split(':').map(s => s.trim());
      return { name: varName, value: varValue };
    });
  };
  
  const variables = parseCombination(data.name);
  
  return (
    <div className="bg-white/95 backdrop-blur-sm p-6 border border-slate-200 rounded-xl shadow-2xl text-sm max-w-md">
      
    </div>
  );
};

export default function TopCombinationsView() {
  console.log('TopCombinationsView: Component mounted');
  
  const navigate = useNavigate();
  const { filters } = useFilter();
  const [combinationsData, setCombinationsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [combinationLevel, setCombinationLevel] = useState(2);
  const [minTrades, setMinTrades] = useState(10);
  const [showTop, setShowTop] = useState(20);
  const [sortBy, setSortBy] = useState('pnl');
  const [sortDirection, setSortDirection] = useState('desc');

  // Update global variable when combination level changes
  useEffect(() => {
    window.currentCombinationLevel = combinationLevel;
  }, [combinationLevel]);

  // Fetch combinations data
  useEffect(() => {
    const fetchCombinationsData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        if (!token) {
          throw new Error('No authentication token found');
        }
        
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
        
        // Add combination parameters
        queryParams.append('combine_vars', 'true');
        queryParams.append('combination_level', combinationLevel.toString());
        queryParams.append('min_trades', minTrades.toString());
        
        const url = `${API_BASE_URL}/journal/combinations-filter?${queryParams.toString()}`;
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to fetch combinations data: ${res.status} ${errorText}`);
        }
        
        const json = await res.json();
        console.log('TopCombinationsView: API Response:', json);
        console.log('TopCombinationsView: Combinations data:', json.combinations);
        
        if (json && Array.isArray(json.combinations)) {
          console.log('TopCombinationsView: Setting combinations data:', json.combinations.length, 'combinations');
          setCombinationsData(json.combinations);
        } else {
          console.warn('TopCombinationsView: No combinations data found in API response');
          setCombinationsData(json.combinations || []);
        }
        
        setError('');
      } catch (err) {
        console.error('Error loading combinations data:', err);
        setError(err.message || 'Error loading combinations data');
        setCombinationsData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCombinationsData();
  }, [filters, combinationLevel, minTrades]);

  // Sort and filter data
  const sortedData = useMemo(() => {
    console.log('TopCombinationsView: Processing combinations data:', combinationsData.length, 'combinations');
    console.log('TopCombinationsView: Combination level:', combinationLevel);
    
    // Filter combinations to only include those with exactly the selected number of variables
    const filteredCombinations = combinationsData.filter(combo => {
      if (!combo.combination) {
        console.log('TopCombinationsView: Skipping combo without combination field:', combo);
        return false;
      }
      
      // Count variables based on the format
      let variableCount = 1; // Default for single variable
      
      if (combo.combination.includes('+')) {
        // Format: "variable1:value1+variable2:value2" or "variable1+variable2"
        variableCount = combo.combination.split('+').length;
      } else if (combo.combination.includes(' & ')) {
        // Format: "variable1:value1 & variable2:value2"
        variableCount = combo.combination.split(' & ').length;
      }
      
      const matches = variableCount === combinationLevel;
      console.log(`TopCombinationsView: Combo "${combo.combination}" has ${variableCount} variables, matches level ${combinationLevel}: ${matches}`);
      
      return matches;
    });
    
    console.log('TopCombinationsView: Filtered combinations:', filteredCombinations.length, 'combinations');

    return [...filteredCombinations]
      .sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (aValue === bValue) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;
        
        const direction = sortDirection === 'asc' ? 1 : -1;
        return aValue > bValue ? direction : -direction;
      })
      .slice(0, showTop)
      .map(combo => ({
        name: combo.combination_with_values || combo.combination,
        pnl: combo.pnl,
        trades: combo.trades,
        winRate: combo.win_rate,
        combination_with_values: combo.combination_with_values,
        profitFactor: combo.profit_factor,
        avgRR: combo.avg_rr,
      }));
  }, [combinationsData, sortBy, sortDirection, showTop, combinationLevel]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (sortedData.length === 0) return null;
    
    const totalPnl = sortedData.reduce((sum, item) => sum + (item.pnl || 0), 0);
    const avgWinRate = sortedData.reduce((sum, item) => sum + (item.winRate || 0), 0) / sortedData.length;
    const totalTrades = sortedData.reduce((sum, item) => sum + (item.trades || 0), 0);
    const profitableCount = sortedData.filter(item => (item.pnl || 0) > 0).length;
    
    return {
      totalPnl,
      avgWinRate,
      totalTrades,
      profitableCount,
      totalCount: sortedData.length,
      profitablePercentage: (profitableCount / sortedData.length) * 100
    };
  }, [sortedData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-sm p-12 rounded-3xl shadow-2xl border border-slate-200/50">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-gradient-to-r from-blue-600 to-blue-700 mx-auto mb-6"></div>
          <p className="text-slate-700 font-semibold text-lg">Loading top combinations...</p>
          <p className="text-slate-500 text-sm mt-2">Analyzing variable performance data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-red-50 to-red-100/50 border-l-4 border-red-500 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-xl font-bold text-red-800 mb-3">Error Loading Data</h3>
                <p className="text-sm text-red-700 leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/analytics/variables')}
                className="group p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-200"
              >
                <ArrowLeft className="h-5 w-5 group-hover:transform group-hover:-translate-x-1 transition-transform duration-200" />
              </button>
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg">
                  <BarChart3 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Top Combinations Analysis</h1>
                  <p className="text-slate-600 font-medium">Full view of the best performing variable combinations</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => window.print()}
                className="group flex items-center space-x-2 bg-white/80 hover:bg-white text-slate-700 font-semibold py-3 px-5 rounded-xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Download className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                <span>Export</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="group flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-5 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
              >
                <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-all duration-300" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

             <div className="max-w-full mx-auto px-6 py-4">
                 {/* Controls */}
         <div className="bg-gradient-to-br from-white to-slate-50/50 p-6 rounded-xl shadow-lg border border-slate-200/60 backdrop-blur-sm mb-4">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-indigo-600 rounded-full"></div>
            <h3 className="text-xl font-bold text-slate-900">Analysis Controls</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Combination Level
              </label>
              <div className="relative">
                <select
                  value={combinationLevel}
                  onChange={(e) => setCombinationLevel(parseInt(e.target.value))}
                  className="appearance-none bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-3.5 shadow-sm hover:border-slate-300 transition-colors duration-200 font-medium"
                >
                  <option value={2}>Pairs (2 variables)</option>
                  <option value={3}>Trios (3 variables)</option>
                  <option value={4}>Quads (4 variables)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Minimum Trades: <span className="text-blue-600 font-bold">{minTrades}</span>
              </label>
              <input
                type="number"
                min="1"
                value={minTrades}
                onChange={(e) => setMinTrades(parseInt(e.target.value) || 1)}
                className="bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-3.5 shadow-sm hover:border-slate-300 transition-colors duration-200 font-medium"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Show Top: <span className="text-purple-600 font-bold">{showTop}</span>
              </label>
              <div className="relative">
                <select
                  value={showTop}
                  onChange={(e) => setShowTop(parseInt(e.target.value))}
                  className="appearance-none bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-3.5 shadow-sm hover:border-slate-300 transition-colors duration-200 font-medium"
                >
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                  <option value={50}>Top 50</option>
                  <option value={100}>Top 100</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Sort By
              </label>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-3.5 shadow-sm hover:border-slate-300 transition-colors duration-200 font-medium"
                >
                  <option value="pnl">P&L</option>
                  <option value="winRate">Win Rate</option>
                  <option value="trades">Trades</option>
                  <option value="profitFactor">Profit Factor</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

                 {/* Summary Stats */}
         {summaryStats && (
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            
          </div>
        )}

                 {/* Main Chart */}
         <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                     <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Top Combinations by P&L</h2>
              <p className="text-gray-600">
                Showing top {sortedData.length} of {combinationsData.length} combinations
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="w-4 h-4 bg-emerald-500 rounded-sm"></div>
                <span>Profitable</span>
                <div className="w-4 h-4 bg-red-500 rounded-sm ml-3"></div>
                <span>Loss</span>
              </div>
            </div>
          </div>
          
                     <div className="h-[800px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedData}
                layout="vertical"
                                 margin={{ top: 40, right: 10, left:555, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  axisLine={false} 
                  tickLine={false}
                  tickFormatter={(value) => formatCurrency(value).replace('$', '')}
                  tick={{ fontSize: 14, fill: '#64748b', fontWeight: 500 }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                                     width={100}
                  axisLine={false} 
                  tickLine={false}
                  tick={<CustomYAxisTick />}
                  interval={0}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="pnl" 
                  name="P&L" 
                  radius={[0, 8, 8, 0]}
                  barSize={32}
                  barGap={6}
                >
                  {sortedData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

                 {/* Data Table */}
         <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-4">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Detailed Results</h3>
            <p className="text-sm text-gray-600 mt-1">
              Complete breakdown of all combinations
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Combination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Trades
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    P&L
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Profit Factor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Avg R:R
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedData.map((combo, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 max-w-md truncate">
                        {combo.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {combo.trades}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {formatPercent(combo.winRate)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${combo.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(combo.pnl)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {combo.profitFactor ? combo.profitFactor.toFixed(2) : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {combo.avgRR ? `${combo.avgRR.toFixed(2)}:1` : 'N/A'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
