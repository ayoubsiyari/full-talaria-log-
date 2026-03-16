import React, { useEffect, useState, useMemo } from 'react';
import { subYears, endOfDay } from 'date-fns';
import { useFilter } from '../../context/FilterContext';
import { API_BASE_URL } from '../../config';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
  LineChart,
  Line,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  Treemap,
  LabelList,
  Rectangle,
  PieChart,
  Pie
} from 'recharts';
import {
  Settings,
  ChevronUp,
  ChevronDown,
  Target,
  X,
  Filter,
  RefreshCw,
  Layers,
  AlertTriangle,
  Minus,
  Plus,
  TrendingUp,
  TrendingDown,
  Activity,
  Compass,
  BarChart3,
  Info,
  Calendar,
  Search,
  Gauge,
  BarChart2,
  Star,
  Shield,
  PieChart as PieChartIcon,
  Award,
  Maximize2
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
const formatNumber = (val) =>
  val == null ? 'N/A' : parseFloat(val).toFixed(2);

// Minimalist color palette
const COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#84cc16", "#f97316", "#ec4899", "#14b8a6"
];

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
  
  // Puzzle-style dimensions
  const blockHeight = 32;
  const bigBlockWidth = 180;
  const smallBlockWidth = 70;
  const blockGap = 2; // Reduced gap for puzzle effect
  const puzzleTabSize = 8; // Size of puzzle tabs
  const totalWidth = variables.length * (bigBlockWidth + smallBlockWidth + blockGap) - blockGap;
  
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{value}</title>
      
      {/* Render puzzle blocks for each variable */}
      {variables.map((variable, index) => {
        const startX = -totalWidth / 2 + index * (bigBlockWidth + smallBlockWidth + blockGap);
        const colors = colorPalette[index % colorPalette.length];
        
        return (
          <g key={index}>
            {/* Big puzzle block for variable name */}
            <path 
              d={`
                M ${startX} ${-blockHeight/2}
                L ${startX + bigBlockWidth - puzzleTabSize} ${-blockHeight/2}
                L ${startX + bigBlockWidth - puzzleTabSize} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth} ${blockHeight/2 - puzzleTabSize}
                L ${startX + bigBlockWidth - puzzleTabSize} ${blockHeight/2 - puzzleTabSize}
                L ${startX + bigBlockWidth - puzzleTabSize} ${blockHeight/2}
                L ${startX} ${blockHeight/2}
                Z
              `}
              fill={colors.primary} 
              stroke={colors.secondary} 
              strokeWidth={1.5}
              opacity={0.9}
            />
            
            {/* Small puzzle block for variable value */}
            <path 
              d={`
                M ${startX + bigBlockWidth} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth + puzzleTabSize} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth + puzzleTabSize} ${-blockHeight/2}
                L ${startX + bigBlockWidth + smallBlockWidth} ${-blockHeight/2}
                L ${startX + bigBlockWidth + smallBlockWidth} ${blockHeight/2}
                L ${startX + bigBlockWidth + puzzleTabSize} ${blockHeight/2}
                L ${startX + bigBlockWidth + puzzleTabSize} ${blockHeight/2 - puzzleTabSize}
                L ${startX + bigBlockWidth} ${blockHeight/2 - puzzleTabSize}
                Z
              `}
              fill="#f8fafc" 
              stroke="#e2e8f0" 
              strokeWidth={1}
              opacity={0.95}
            />
            
            {/* Variable name text */}
            <text 
              x={startX + bigBlockWidth/2} 
              y={0} 
              dy={6} 
              textAnchor="middle" 
              fill="white" 
              fontSize={50} 
              fontWeight={800}
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {variable.name.length > 15 ? `${variable.name.substring(0, 15)}...` : variable.name}
            </text>
            
            {/* Variable value text */}
            <text 
              x={startX + bigBlockWidth + smallBlockWidth/2} 
              y={0} 
              dy={6} 
              textAnchor="middle" 
              fill="#6b7280" 
              fontSize={11} 
              fontWeight={500}
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {variable.value.length > 8 ? `${variable.value.substring(0, 8)}...` : variable.value}
            </text>
            
            {/* Subtle shadow effect for puzzle pieces */}
            <path 
              d={`
                M ${startX + 1} ${-blockHeight/2}
                L ${startX + bigBlockWidth - puzzleTabSize + 1} ${-blockHeight/2}
                L ${startX + bigBlockWidth - puzzleTabSize + 1} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth + 1} ${-blockHeight/2 + puzzleTabSize}
                L ${startX + bigBlockWidth + 1} ${blockHeight/2 - puzzleTabSize}
                L ${startX + bigBlockWidth - puzzleTabSize + 1} ${blockHeight/2 - puzzleTabSize}
                L ${startX + bigBlockWidth - puzzleTabSize + 1} ${blockHeight/2}
                L ${startX + 1} ${blockHeight/2}
                Z
              `}
              fill="rgba(0,0,0,0.1)" 
              opacity={0.3}
            />
          </g>
        );
      })}
      
      {/* Enhanced variable count indicator */}
      {variables.length > 0 && (
        <g>
          <circle 
            cx={-totalWidth/2 - 30} 
            cy={0} 
            r={14} 
            fill="#6b7280" 
            stroke="#4b5563"
            strokeWidth={1}
            opacity={0.9}
          />
          <text 
            x={-totalWidth/2 - 30} 
            y={0} 
            dy={6} 
            textAnchor="middle" 
            fill="white" 
            fontSize={12} 
            fontWeight={600}
          >
            {variables.length}
          </text>
        </g>
      )}
    </g>
  );
};

// Enhanced Summary Card Component with minimalist design
function SummaryCard({ title, value, icon: Icon, trend, color = "slate", subtitle, size = "normal", sparkline }) {
  const sizeClasses = size === "large" ? "p-6" : "p-4";
  const titleSize = size === "large" ? "text-base" : "text-sm";
  const valueSize = size === "large" ? "text-2xl" : "text-xl";
  
  const colorClasses = {
    slate: "bg-white border-slate-200 text-slate-900",
    green: "bg-white border-emerald-200 text-emerald-900",
    red: "bg-white border-red-200 text-red-900",
    blue: "bg-white border-blue-200 text-blue-900",
    purple: "bg-white border-purple-200 text-purple-900",
    gray: "bg-white border-gray-200 text-gray-900"
  };
  
  const iconColors = {
    slate: "text-slate-600",
    green: "text-emerald-600",
    red: "text-red-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
    gray: "text-gray-600"
  };
  
  return (
    <div className={`${colorClasses[color]} rounded-lg ${sizeClasses} border shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden`}>
      {sparkline && (
        <div className="absolute top-0 right-0 w-20 h-10 opacity-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Icon className={`h-4 w-4 ${iconColors[color]}`} />
            <p className={`${titleSize} font-medium text-gray-600`}>{title}</p>
          </div>
          <p className={`${valueSize} font-bold mb-1`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        {trend && (
          <div className={`flex items-center space-x-1 text-xs font-medium ${
            trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : 
             trend < 0 ? <TrendingDown className="h-3 w-3" /> : 
             <Minus className="h-3 w-3" />}
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

const CustomCombinationTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    console.log('Tooltip Payload:', payload);
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-xl text-sm" style={{ color: '#333' }}>
        <p className="font-bold text-gray-900 mb-2" style={{ maxWidth: '300px', whiteWhite: 'normal' }}>{data.name}</p>
        <p className="text-gray-800">
          <span className="font-semibold">P&L:</span>
          <span className={`ml-2 font-bold ${data.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {formatCurrency(data.pnl)}
          </span>
        </p>
        <p className="text-gray-800">
          <span className="font-semibold">Trades:</span>
          <span className="ml-2 font-bold text-gray-900">
            {data.trades ?? 'N/A'}
          </span>
        </p>
        <p className="text-gray-800">
          <span className="font-semibold">Win Rate:</span>
          <span className="ml-2 font-bold text-gray-900">
            {formatPercent(data.win_rate)}
          </span>
        </p>
      </div>
    );
  }
  return null;
};

// Performance Distribution Chart Component
function PerformanceDistribution({ data, title }) {
  // Add error handling and data validation
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">No data available for performance distribution</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate profitable and unprofitable counts from the variable values
  const profitableCount = data.filter(item => (item.pnl || 0) >= 0).length;
  const unprofitableCount = data.filter(item => (item.pnl || 0) < 0).length;
  const totalCount = data.length;

  const chartData = [
    { name: 'Profitable', count: profitableCount, fill: '#10b981', percentage: totalCount > 0 ? ((profitableCount / totalCount) * 100).toFixed(1) : 0 },
    { name: 'Unprofitable', count: unprofitableCount, fill: '#ef4444', percentage: totalCount > 0 ? ((unprofitableCount / totalCount) * 100).toFixed(1) : 0 },
  ];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-2xl border border-gray-200 text-sm">
          <p className="font-bold text-gray-800 mb-2">{`${label} Variables`}</p>
          <div className="space-y-1">
            <p className="text-gray-600">
              <span className="font-semibold">Count:</span> {data.count}
            </p>
            <p className="text-gray-600">
              <span className="font-semibold">Percentage:</span> {data.percentage}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <span>Profitable</span>
          <div className="w-3 h-3 bg-red-500 rounded-full ml-3"></div>
          <span>Unprofitable</span>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">{profitableCount}</div>
            <div className="text-sm text-emerald-600">Profitable</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{unprofitableCount}</div>
            <div className="text-sm text-red-600">Unprofitable</div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis 
            dataKey="name" 
            type="category" 
            tick={{ fontSize: 13, fill: '#64748b', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            type="number" 
            allowDecimals={false} 
            tick={{ fontSize: 13, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            cursor={{ fill: 'rgba(243, 244, 246, 0.3)' }}
            content={<CustomTooltip />}
          />
          <Bar 
            dataKey="count" 
            name="Count" 
            barSize={60}
            radius={[4, 4, 0, 0]}
          >
            <LabelList 
              dataKey="count" 
              position="top" 
              style={{ fill: '#374151', fontSize: 14, fontWeight: '600' }} 
            />
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Risk-Return Bubble Chart Component
function RiskReturnBubble({ data, title }) {
  const bubbleData = useMemo(() => {
    return data.map(item => ({
      x: item.avg_rr || 0,
      y: item.win_rate || 0,
      z: item.trades || 1,
      name: item.variable ? item.variable.split(':').pop().trim() : 'Unknown',
      pnl: item.pnl || 0,
      profitFactor: item.profit_factor || 0
    }));
  }, [data]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <Activity className="h-5 w-5 text-gray-400" />
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid stroke="#f1f5f9" />
            <XAxis 
              type="number" 
              dataKey="x" 
              name="Risk/Reward Ratio"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <YAxis 
              type="number" 
              dataKey="y" 
              name="Win Rate %"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <ZAxis type="number" dataKey="z" range={[50, 400]} name="Trades" />
            <Tooltip 
              formatter={(value, name) => [
                name === 'x' ? `${value.toFixed(2)}:1` :
                name === 'y' ? `${value.toFixed(1)}%` :
                name === 'z' ? `${value} trades` : value,
                name === 'x' ? 'Risk/Reward' :
                name === 'y' ? 'Win Rate' :
                name === 'z' ? 'Trade Count' : name
              ]}
              labelFormatter={(label) => `Variable: ${label}`}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Scatter name="Variables" data={bubbleData} fill="#6366f1" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Performance Radar Chart Component
function PerformanceRadar({ data, title }) {
  const radarData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const topVariables = data
      .filter(v => v.trades >= 3) // Only include variables with sufficient data
      .sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
      .slice(0, 5);
    
    return topVariables.map(variable => {
        // Get variable name (last part after colon if it exists)
        const varName = variable.variable ? 
          variable.variable.split(':').pop().trim() : 'Unknown';
        
        // Calculate metrics with proper scaling
        const winRate = parseFloat(variable.win_rate || 0);
        const avgRR = parseFloat(variable.avg_rr || 0);
        const profitFactor = parseFloat(variable.profit_factor || 0);
        const trades = parseInt(variable.trades || 0);
        const expectancy = parseFloat(variable.expectancy || 0);
        
        return {
          variable: varName,
          'Win Rate %': winRate,
          'Avg R:R': avgRR,
          'Profit Factor': profitFactor,
          'Trades': trades,
          'Expectancy': expectancy,
          // Store original values for tooltip
          _original: {
            winRate,
            avgRR,
            profitFactor,
            trades,
            expectancy
          }
        };
      });
  }, [data]);
  
  // Custom tooltip formatter
  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    const original = data._original || {};
    
    return (
      <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
        <div className="font-semibold text-gray-900 mb-2">{data.variable}</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Win Rate:</span>
            <span className="font-medium">{original.winRate ? original.winRate.toFixed(1) + '%' : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Avg R:R:</span>
            <span className="font-medium">{original.avgRR ? original.avgRR.toFixed(2) : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Profit Factor:</span>
            <span className="font-medium">{original.profitFactor ? original.profitFactor.toFixed(2) : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Trades:</span>
            <span className="font-medium">{original.trades || '0'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Expectancy:</span>
            <span className="font-medium">${original.expectancy ? original.expectancy.toFixed(2) : '0.00'}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <Compass className="h-5 w-5 text-gray-400" />
      </div>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart 
            data={radarData}
            margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
          >
            <PolarGrid stroke="#f1f5f9" />
            <PolarAngleAxis 
              dataKey="variable" 
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(value) => 
                value.length > 15 ? `${value.substring(0, 15)}...` : value
              }
            />
            <PolarRadiusAxis 
              angle={90} 
              tick={false}
              axisLine={false}
            />
            <Tooltip content={renderTooltip} />
            {radarData.length > 0 && [
              { key: 'Win Rate %', domain: [0, 100], formatter: (v) => `${v}%` },
              { key: 'Avg R:R', domain: [0, 5], formatter: (v) => v.toFixed(2) },
              { key: 'Profit Factor', domain: [0, 10], formatter: (v) => v.toFixed(2) },
              { key: 'Trades', domain: [0, Math.max(10, ...radarData.map(d => d['Trades']))], formatter: (v) => v },
              { key: 'Expectancy', domain: [
                Math.min(0, ...radarData.map(d => d['Expectancy'])),
                Math.max(0, ...radarData.map(d => d['Expectancy']))
              ], formatter: (v) => `$${v.toFixed(2)}` }
            ].map((metric, index) => (
              <Radar
                key={metric.key}
                name={metric.key}
                dataKey={metric.key}
                stroke={COLORS[index % COLORS.length]}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={0.1}
                strokeWidth={2}
                // Scale each metric to 0-100 for better visualization
                scale={(value) => {
                  const [min, max] = metric.domain;
                  if (min === max) return 50; // Avoid division by zero
                  return ((value - min) / (max - min)) * 100;
                }}
                domain={metric.domain}
              />
            ))}
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => {
                const metric = value.replace(' %', '');
                return (
                  <span className="text-xs text-gray-600">
                    {metric}
                  </span>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Treemap Chart Component for Variable Hierarchy
function VariableTreemap({ data, title }) {
  const treemapData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Calculate the absolute max P&L for scaling purposes
    const maxPnl = Math.max(...data.map(item => Math.abs(item.pnl || 0)), 1);
    const minSize = 10; // Minimum size for visibility
    
    return data
      .filter(item => item.trades > 0 && item.pnl !== undefined)
      .map(item => {
        const pnl = parseFloat(item.pnl) || 0;
        const winRate = parseFloat(item.win_rate) || 0;
        const trades = parseInt(item.trades) || 0;
        
        // Calculate size based on P&L relative to max P&L, with a minimum size
        const size = Math.max(minSize, (Math.abs(pnl) / maxPnl) * 100);
        
        // Extract the actual variable name from the _var_mapping if it exists
        let displayName = 'Unknown';
        if (item.variable) {
          if (item.variable.startsWith('var') && item.extra_data?._var_mapping?.[item.variable]) {
            // Use the original CSV header name from _var_mapping
            displayName = item.extra_data._var_mapping[item.variable].name;
          } else {
            // Fall back to the variable name
            displayName = item.variable.split(':').pop().trim();
          }
        }
        
        return {
          name: displayName,
          size: size,
          pnl: pnl,
          trades: trades,
          winRate: winRate,
          fill: pnl >= 0 ? '#10b981' : '#ef4444',
          // Store original values for tooltip
          originalPnl: pnl,
          originalWinRate: winRate,
          // Store the original variable name for reference
          originalVariable: item.variable
        };
      })
      .sort((a, b) => Math.abs(b.originalPnl) - Math.abs(a.originalPnl))
      .slice(0, 15); // Limit to top 15 for better visualization
  }, [data]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <Layers className="h-5 w-5 text-gray-400" />
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            aspectRatio={4/3}
            stroke="#fff"
            fill="#8884d8"
            animationDuration={500}
            isAnimationActive={true}
          >
            {treemapData.map((entry, index) => (
              <Rectangle
                key={`rectangle-${index}`}
                name={entry.name}
                fill={entry.fill}
                stroke="#fff"
                style={{
                  strokeWidth: 1,
                }}
              >
                <text
                  x={0}
                  y={18}
                  textAnchor="start"
                  fill="#000"
                  fontSize={12}
                  style={{
                    pointerEvents: 'none',
                    fontWeight: 500,
                    padding: '0 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: '100%',
                    display: 'inline-block'
                  }}
                >
                  {entry.name}
                </text>
              </Rectangle>
            ))}
            <Tooltip 
              formatter={(value, name, props) => {
                if (name === 'P&L') return formatCurrency(props.payload.originalPnl);
                if (name === 'Win Rate') return `${props.payload.originalWinRate.toFixed(1)}%`;
                if (name === 'Trades') return props.payload.trades;
                return value;
              }}
              labelFormatter={(label) => `Variable: ${label}`}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                padding: '12px'
              }}
              itemStyle={{
                margin: '4px 0',
                color: '#1f2937',
                fontSize: '13px',
                fontWeight: 500
              }}
              labelStyle={{
                color: '#111827',
                fontWeight: 600,
                marginBottom: '8px',
                fontSize: '14px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '6px'
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Enhanced Filter Sidebar Component
function FilterSidebar({
  showFilters,
  setShowFilters,
  availableVariables,
  combinationFilters,
  setCombinationFilters,
  activeFilterCount
}) {
  return (
    <>
      {/* Backdrop */}
      {showFilters && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
          onClick={() => setShowFilters(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${
        showFilters ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Filter Combinations</h3>
            </div>
            <button 
              onClick={() => setShowFilters(false)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            </div>
          )}
        </div>
        
        {/* Filter Content */}
        <div className="p-6 space-y-6">
          {Object.entries(availableVariables || {}).map(([varName, values]) => (
            <div key={varName} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">{varName}</h4>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {values.length} options
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {values.map(value => (
                  <label key={value} className="flex items-center space-x-3 p-2 hover:bg-white rounded-md transition-colors duration-150 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={combinationFilters[varName]?.includes(value) || false}
                      onChange={() => {
                        setCombinationFilters(prev => {
                          const currentValues = prev[varName] || [];
                          const newValues = currentValues.includes(value)
                            ? currentValues.filter(v => v !== value)
                            : [...currentValues, value];
                          
                          return {
                            ...prev,
                            [varName]: newValues.length ? newValues : undefined
                          };
                        });
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="text-sm text-gray-700 flex-1">{value}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
          <div className="flex space-x-3">
            <button
              onClick={() => setCombinationFilters({})}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors duration-200"
              disabled={activeFilterCount === 0}
            >
              Reset All
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function VariablesAnalysis() {
  const navigate = useNavigate();
  const { filters } = useFilter();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('pnl');
  const [sortDirection, setSortDirection] = useState('desc');
  const [activeTab, setActiveTab] = useState('overview');
  const [apiResponse, setApiResponse] = useState(null);
  const [combinationsData, setCombinationsData] = useState([]);
  const [combinationsLoading, setCombinationsLoading] = useState(false);
  const [combinationsError, setCombinationsError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [combinationFilters, setCombinationFilters] = useState({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');
  const [variableFilter, setVariableFilter] = useState('');
  const [combinationLevel, setCombinationLevel] = useState(2);
  const [minTrades, setMinTrades] = useState(3);
  const [combinationStats, setCombinationStats] = useState(null);
  const [availableVariables, setAvailableVariables] = useState({});

  // ─── Fetch variables analysis data ──────────────────────────────────────────
  useEffect(() => {
    const fetchVariablesData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }
        
        // Build query parameters from filters
        const queryParams = new URLSearchParams();
        
        // Add filter parameters (dates handled below to avoid duplicates)
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
        
        // Determine effective dates: prefer global filters, then local state if provided
        const effectiveFrom = (filters.dateRange?.start) || (fromDate ? (typeof fromDate === 'string' ? fromDate : fromDate.toISOString().slice(0, 10)) : '');
        const effectiveTo = (filters.dateRange?.end) || (toDate ? (typeof toDate === 'string' ? toDate : toDate.toISOString().slice(0, 10)) : '');
        if (effectiveFrom) queryParams.append('from_date', effectiveFrom);
        if (effectiveTo) queryParams.append('to_date', effectiveTo);
        if (selectedTimeframe !== 'all') queryParams.append('timeframe', selectedTimeframe);
        
        const url = `${API_BASE_URL}/journal/variables-analysis?${queryParams.toString()}`;
        console.log('VariablesAnalysis: Fetching with filters:', url);
        
        const res = await fetch(url, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
        
        console.log('Response status:', res.status, res.statusText);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Error response:', errorText);
          throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorText}`);
        }
        
        const json = await res.json();
        console.log('API Response:', json);
        
        // Store full response for debugging
        setApiResponse(json);
        
        // Handle the data structure from API
        if (json && json.variables && Array.isArray(json.variables)) {
          console.log(`Found ${json.variables.length} variables`);
          setData(json.variables);
        } else {
          console.warn('No variables data found in API response');
          setData([]);
        }
        
        setError('');
      } catch (err) {
        console.error('❌ Error in fetchVariablesData:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        setError(`Error: ${err.message}. Please check the console for more details.`);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVariablesData();
  }, [filters, fromDate, toDate, selectedTimeframe]);

  // ─── Fetch combinations analysis data ───────────────────────────────────────
  useEffect(() => {
    const fetchCombinationsData = async () => {
      // This useEffect should always run to fetch combinations data for the overview tab
      
      try {
        setCombinationsLoading(true);
        const token = localStorage.getItem('token');
        
        // Build query parameters from filters
        const queryParams = new URLSearchParams();
        
        // Add filter parameters (dates handled below to avoid duplicates)
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
        
        // Add existing parameters
        queryParams.append('combine_vars', 'true');
        queryParams.append('combination_level', combinationLevel.toString());
        queryParams.append('min_trades', minTrades.toString());
        
        console.log('VariablesAnalysis: API request parameters:', {
          combination_level: combinationLevel,
          min_trades: minTrades,
          combine_vars: 'true'
        });
        const effectiveFrom2 = (filters.dateRange?.start) || (fromDate ? (typeof fromDate === 'string' ? fromDate : fromDate.toISOString().slice(0, 10)) : '');
        const effectiveTo2 = (filters.dateRange?.end) || (toDate ? (typeof toDate === 'string' ? toDate : toDate.toISOString().slice(0, 10)) : '');
        if (effectiveFrom2) queryParams.append('from_date', effectiveFrom2);
        if (effectiveTo2) queryParams.append('to_date', effectiveTo2);
        if (selectedTimeframe !== 'all') queryParams.append('timeframe', selectedTimeframe);
        
        const url = `${API_BASE_URL}/journal/combinations-filter?${queryParams.toString()}`;
        console.log('VariablesAnalysis: Fetching combinations with filters:', url);
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to fetch combinations data: ${res.status} ${errorText}`);
        }
        
        const json = await res.json();
        console.log('VariablesAnalysis: Combinations API Response:', json);
        
        if (json && Array.isArray(json.combinations)) {
          console.log('✅ VariablesAnalysis: Combinations data found:', json.combinations.length, 'combinations');
          console.log('VariablesAnalysis: Sample combinations:', json.combinations.slice(0, 3));
          setCombinationsData(json.combinations);
          setCombinationStats(json.stats_summary);
        } else {
          console.warn('❌ VariablesAnalysis: No combinations data found in API response');
          console.log('VariablesAnalysis: Response structure:', Object.keys(json || {}));
          setCombinationsData(json.combinations || []);
          setCombinationStats(json.stats_summary || null);
        }
        
        setError('');
      } catch (err) {
        console.error('❌ Error loading combinations data:', err);
        setError(err.message || 'Error loading combinations data');
        setCombinationsData([]);
        setCombinationStats(null);
      } finally {
        setCombinationsLoading(false);
      }
    };
    
    fetchCombinationsData();
  }, [filters, combinationLevel, minTrades, fromDate, toDate, selectedTimeframe]); // Added filters to dependency array

  useEffect(() => {
    if (!combinationsData || combinationsData.length === 0) {
      setAvailableVariables({});
      return;
    }
  
    const vars = {};
  
    combinationsData.forEach(combo => {
      // Handle different formats for variable combinations
      let comboString = combo.combination_with_values || combo.combination;
      
      if (comboString.includes(' & ') && comboString.includes(':')) {
        // Format: "variable1:value & variable2:value"
        const parts = comboString.split(' & ');
        parts.forEach(part => {
          const [varName, varValue] = part.split(':').map(s => s.trim());
          if (!vars[varName]) {
            vars[varName] = new Set();
          }
          if (varValue) {
            vars[varName].add(varValue);
          }
        });
      } else if (comboString.includes('+') && comboString.includes(':')) {
        // Format: "variable1:value+variable2:value" (new backend format)
        const parts = comboString.split('+').map(s => s.trim());
        parts.forEach(part => {
          const [varName, varValue] = part.split(':').map(s => s.trim());
          if (!vars[varName]) {
            vars[varName] = new Set();
          }
          if (varValue) {
            vars[varName].add(varValue);
          }
        });
      } else if (comboString.includes('+')) {
        // Format: "variable1+variable2" (old backend format)
        const parts = comboString.split('+').map(s => s.trim());
        parts.forEach(part => {
          if (!vars[part]) {
            vars[part] = new Set();
          }
          vars[part].add('Present');
        });
      } else {
        // Single variable
        if (!vars[comboString]) {
          vars[comboString] = new Set();
        }
        vars[comboString].add('Present');
      }
    });
  
    // Convert Sets to arrays for rendering
    const processedVars = {};
            Object.keys(vars || {}).forEach(key => {
      processedVars[key] = Array.from(vars[key]);
    });
  
    setAvailableVariables(processedVars);
  }, [combinationsData]);

  // ─── Sorting and filtering helpers ─────────────────────────────────────────
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
        <ChevronUp className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      );
    }
    return null;
  };
  
  // Sort and filter data
  const sortedAndFilteredData = Array.isArray(data) 
    ? [...data]
        .filter(item => 
          item.variable && item.variable.toLowerCase().includes(variableFilter.toLowerCase())
        )
        .sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          
          if (aValue === bValue) return 0;
          if (aValue == null) return 1;
          if (bValue == null) return -1;
          
          const direction = sortDirection === 'asc' ? 1 : -1;
          return aValue > bValue ? direction : -direction;
        })
    : [];

  const filterCombinations = useMemo(() => {
    if (!combinationsData || combinationsData.length === 0) return [];

    let filtered = combinationsData;

    // Apply minTrades filter
    if (minTrades > 1) {
      filtered = filtered.filter(c => c.trades >= minTrades);
    }

    // Apply include/exclude filters from sidebar
    if (combinationFilters.include && combinationFilters.include.length > 0) {
      filtered = filtered.filter(c => 
        combinationFilters.include.every(val => c.combination.includes(val))
      );
    }
    if (combinationFilters.exclude && combinationFilters.exclude.length > 0) {
      filtered = filtered.filter(c => 
        !combinationFilters.exclude.some(val => c.combination.includes(val))
      );
    }

    return filtered;
  }, [combinationsData, minTrades, combinationFilters]);

  const bubbleChartData = useMemo(() => {
    // Prepare data for the Win Rate vs P&L Bubble Chart.
    // It uses the filtered combinations and ensures all data is in the correct numeric format.
    return filterCombinations.map(c => ({
      ...c,
      // The backend sends win_rate as a percentage (0-100)
      win_rate: parseFloat(c.win_rate) || 0,
      pnl: parseFloat(c.pnl) || 0,
      trades: parseInt(c.trades, 10) || 0,
    }));
  }, [filterCombinations]);
  
  // Count active filters
  const activeFilterCount = useMemo(() => {
    return Object.values(combinationFilters || {}).reduce(
      (count, values) => count + (values ? values.length : 0),
      0
    );
  }, [combinationFilters]);
  
  // Helper to render filter pills
  const renderActiveFilters = () => {
    const filters = [];
    
    Object.entries(combinationFilters || {}).forEach(([varName, values]) => {
      if (!values || !values.length) return;
      
      values.forEach(value => {
        filters.push({
          varName,
          value,
          key: `${varName}:${value}`
        });
      });
    });
    
    if (filters.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-2 mt-3">
        {filters.map(filter => (
          <span 
            key={filter.key}
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
          >
            <span className="font-semibold">{filter.varName}:</span>
            <span className="ml-1">{filter.value}</span>
            <button
              onClick={() => {
                setCombinationFilters(prev => {
                  const currentValues = prev[filter.varName] || [];
                  const newValues = currentValues.filter(v => v !== filter.value);
                  
                  return {
                    ...prev,
                    [filter.varName]: newValues.length ? newValues : undefined
                  };
                });
              }}
              className="ml-2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-200 hover:bg-blue-300 text-blue-600 hover:text-blue-900 focus:outline-none transition-colors duration-150"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
    );
  };

  // Enhanced summary stats with additional metrics
  const summaryStats = useMemo(() => {
    console.log('VariablesAnalysis: Calculating summary stats from combinationsData:', combinationsData.length, 'combinations');
    console.log('VariablesAnalysis: Sample combinations data:', combinationsData.slice(0, 3));
    
    // Find best combination
    const bestCombination = combinationsData.length > 0
      ? combinationsData.reduce((best, current) => 
          (current.pnl || 0) > (best.pnl || 0) ? current : best, 
          { pnl: 0 }
        )
      : null;
    
    console.log('VariablesAnalysis: Best combination found:', bestCombination);

    const worstCombination = combinationsData.length > 0
      ? combinationsData.reduce((worst, current) => 
          (current.pnl || 0) < (worst.pnl || 0) ? current : worst, 
          combinationsData.find(c => c.pnl) || { pnl: 0 }
        )
      : null;

    // If we have combinations data, use the best combination for metrics
    if (bestCombination && bestCombination.pnl !== 0) {
      const drawdown = bestCombination.max_drawdown || 0;
      const avgWinRate = bestCombination.win_rate || 0;
      const profitFactor = bestCombination.profit_factor || 0;
      const expectancy = bestCombination.expectancy || 0;
      
      // Calculate realistic returns for the best combination
      let returns = [];
      
      if (bestCombination.returns?.length > 0) {
        // Use actual returns if available, but cap extreme values
        returns = bestCombination.returns.map(r => {
          // Cap daily returns at ±5% to prevent extreme values
          const capped = Math.max(-0.05, Math.min(0.05, r));
          // Add small random noise to prevent zero std dev
          return capped + (Math.random() * 0.0001 - 0.00005);
        });
      } else if (bestCombination.trades > 0) {
        // Estimate returns based on P&L, but scale down to be more realistic
        const avgReturnPerTrade = (bestCombination.pnl || 0) / bestCombination.trades;
        // Scale down to a more realistic daily return (0.1% to 1% per trade)
        const scaledReturn = Math.sign(avgReturnPerTrade) * 
          Math.min(0.01, Math.max(0.001, Math.abs(avgReturnPerTrade) / 100));
        returns = Array(bestCombination.trades).fill(scaledReturn);
      }
      
      // Calculate average return and standard deviation with bounds
      const avgReturn = returns.length > 0 
        ? returns.reduce((a, b) => a + b, 0) / returns.length 
        : 0;
        
      // Calculate standard deviation with minimum threshold
      let stdDev = 0.01; // Default minimum 1% std dev
      if (returns.length > 1) {
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        stdDev = Math.sqrt(variance);
        // Ensure std dev is never zero and has a reasonable minimum
        stdDev = Math.max(0.005, stdDev);
      }
      
      // Calculate annualized metrics with realistic bounds
      const tradingDaysPerYear = 252;
      const annualRiskFreeRate = 0.05; // 5% annual risk-free rate
      const dailyRiskFreeRate = Math.pow(1 + annualRiskFreeRate, 1/252) - 1; // Convert to daily
      
      // Calculate Sharpe ratio with realistic bounds
      let sharpeRatio = 0;
      if (stdDev > 0) {
        const excessReturn = (avgReturn - dailyRiskFreeRate) * tradingDaysPerYear;
        sharpeRatio = excessReturn / (stdDev * Math.sqrt(tradingDaysPerYear));
        // Cap Sharpe ratio at 5.0 to prevent unrealistic values
        sharpeRatio = Math.min(Math.max(-5, sharpeRatio), 5);
      }

      // Calculate annualized volatility with realistic bounds
      let returnVolatility = stdDev * Math.sqrt(252); // Annualized volatility (daily std dev * sqrt(252))
      // Cap volatility at 200% (2.0) to prevent unrealistic values
      returnVolatility = Math.min(returnVolatility, 2.0);
      const metrics = {
        total_trades: bestCombination.trades || 0,
        total_pnl: bestCombination.pnl || 0,
        avg_win_rate: avgWinRate,
        avg_profit_factor: profitFactor,
        profitableVariables: 1, // Since it's the best single combination
        totalVariables: 1,
        profitablePercentage: avgWinRate,
        bestVariable: {
          variable: bestCombination.combination || 'Best Combination',
          pnl: bestCombination.pnl || 0,
          win_rate: avgWinRate,
          trades: bestCombination.trades || 0
        },
        worstVariable: {
          variable: worstCombination?.combination || 'Worst Combination',
          pnl: worstCombination?.pnl || 0,
          win_rate: worstCombination?.win_rate || 0,
          trades: worstCombination?.trades || 0
        },
        avgExpectancy: expectancy,
        avgMaxDrawdown: drawdown < 0 ? drawdown : -Math.abs(drawdown),
        sharpeRatio,
        returnVolatility,
        consistencyScore: avgWinRate * (profitFactor / 100),
        // Add raw values for debugging
        _metrics: {
          avgReturn,
          stdDev,
          returnsCount: returns.length,
          annualizedVolatility: returnVolatility,
          hasReturns: Array.isArray(bestCombination.returns),
          returnsSample: bestCombination.returns ? bestCombination.returns.slice(0, 3) : 'no returns',
          pnlPerTrade: bestCombination.trades ? (bestCombination.pnl || 0) / bestCombination.trades : 0
        }
      };
      
      // Debug log
      console.log('🔍 Best Combination Metrics Debug:', {
        combination: bestCombination.combination,
        trades: bestCombination.trades,
        pnl: bestCombination.pnl,
        win_rate: bestCombination.win_rate,
        profit_factor: bestCombination.profit_factor,
        expectancy: bestCombination.expectancy,
        max_drawdown: bestCombination.max_drawdown,
        returns: {
          hasReturns: Array.isArray(bestCombination.returns),
          count: bestCombination.returns?.length || 0,
          sample: bestCombination.returns?.slice(0, 3) || 'none'
        },
        calculated: {
          avgReturn,
          stdDev,
          returnVolatility,
          isReasonable: returnVolatility < 10
        }
      });
      
      return metrics;
    }

    // Fallback to variable-based metrics if no combinations data
    const baseStats = apiResponse?.stats_summary || {
      total_trades: data.reduce((sum, item) => sum + (item.trades || 0), 0),
      total_pnl: data.reduce((sum, item) => sum + (item.pnl || 0), 0),
      avg_win_rate: data.length > 0 
        ? data.reduce((sum, item) => sum + (item.win_rate || 0), 0) / data.length 
        : 0,
      avg_profit_factor: data.length > 0 
        ? data.reduce((sum, item) => sum + (item.profit_factor || 0), 0) / data.length 
        : 0
    };

    const profitableVariables = data.filter(item => (item.pnl || 0) > 0).length;
    const totalVariables = data.length;
    const profitablePercentage = totalVariables > 0 ? (profitableVariables / totalVariables) * 100 : 0;
    
    const bestVariable = data.reduce((best, current) => 
      (current.pnl || 0) > (best.pnl || 0) ? current : best, 
      { pnl: 0 }
    );
    
    const worstVariable = data.length > 0 
      ? data.reduce((worst, current) => 
          (current.pnl || 0) < (worst.pnl || 0) ? current : worst,
          data[0]
        )
      : { pnl: 0, variable: 'N/A' };

    const avgExpectancy = data.length > 0 
      ? data.reduce((sum, item) => sum + (item.expectancy || 0), 0) / data.length 
      : 0;

    const avgMaxDrawdown = data.length > 0 
      ? data.reduce((sum, item) => {
          const drawdown = item.max_drawdown || 0;
          return sum + (drawdown < 0 ? drawdown : -Math.abs(drawdown));
        }, 0) / data.length 
      : 0;

    const returns = data.map(item => (item.pnl || 0) / (item.risk_amount || 1));
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 1 
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;
    
    const riskFreeRate = 0.02;
    const sharpeRatio = stdDev !== 0 
      ? ((avgReturn - (riskFreeRate / 252)) / stdDev) * Math.sqrt(252)
      : 0;

    return {
      ...baseStats,
      profitableVariables,
      totalVariables,
      profitablePercentage,
      bestVariable,
      worstVariable,
      avgExpectancy,
      avgMaxDrawdown,
      sharpeRatio,
      returnVolatility: stdDev * Math.sqrt(252),
      consistencyScore: profitablePercentage * (baseStats.avg_win_rate / 100)
    };
  }, [data, apiResponse, combinationsData]);
  
  // Chart data preparation
  const chartData = sortedAndFilteredData
    .slice(0, 10) // Limit to top 10 for better visualization
    .map(item => ({
      name: item.variable ? item.variable.split(':').pop().trim() : 'Unknown',
      pnl: item.pnl || 0,
      winRate: item.win_rate || 0,
      trades: item.trades || 0,
      avgRR: item.avg_rr || 0,
    }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading variables analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-6 shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show message if no data available
  if (!data || data.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-3 bg-blue-100 rounded-lg">
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Variables Analysis</h1>
                <p className="text-gray-600">Analyze performance by trading variables and patterns</p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-6 shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <Info className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-yellow-800 mb-2">No Variables Data Found</h3>
                <div className="text-sm text-yellow-700">
                  <p className="mb-3">No trading variables found in your imported data. To see analysis results:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Import trades with variable columns mapped (Setup, Strategy, etc.)</li>
                    <li>Make sure your CSV contains variable data in the mapped columns</li>
                    <li>Check that trades were imported successfully</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Filter Sidebar */}
      <FilterSidebar 
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        availableVariables={availableVariables}
        combinationFilters={combinationFilters}
        setCombinationFilters={setCombinationFilters}
        activeFilterCount={activeFilterCount}
      />

      <div className="p-6 max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Variables Analysis</h1>
                <p className="text-gray-600 mt-1">Comprehensive analysis of trading variables and performance patterns</p>
              </div>
            </div>
            
            {/* Enhanced Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range */}
              <div className="flex items-center space-x-2 bg-white rounded-lg p-2 shadow-sm border border-gray-200">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border-0 focus:ring-0 text-sm"
                  placeholder="From"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border-0 focus:ring-0 text-sm"
                  placeholder="To"
                />
              </div>
              
              {/* Timeframe Selector */}
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 px-3 py-2 shadow-sm"
              >
                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="365">Last Year</option>
              </select>
              
              {/* Search Filter */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter variables..."
                  value={variableFilter}
                  onChange={(e) => setVariableFilter(e.target.value)}
                  className="bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 pl-10 pr-4 py-2 w-48 shadow-sm"
                />
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={() => window.location.reload()}
                className="flex items-center space-x-2 bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg border border-gray-200 shadow-sm transition-colors duration-200"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        

        {/* Enhanced Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`${activeTab === 'overview' 
                  ? 'border-blue-500 text-blue-600 bg-blue-50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-4 border-b-2 font-medium text-sm rounded-t-lg transition-all duration-200 flex items-center space-x-2`}
              >
                <Gauge className="h-4 w-4" />
                <span>Overview</span>
              </button>
              <button
                onClick={() => setActiveTab('table')}
                className={`${activeTab === 'table' 
                  ? 'border-blue-500 text-blue-600 bg-blue-50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-4 border-b-2 font-medium text-sm rounded-t-lg transition-all duration-200 flex items-center space-x-2`}
              >
                <BarChart2 className="h-4 w-4" />
                <span>Data Table</span>
              </button>
              
              {/* Removed Combinations tab button */}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' ? (
          /* New Overview Tab with Key Insights */
          <div className="space-y-8">
            {/* Top Performers Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-6 border border-emerald-200 shadow-sm">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Star className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Best Performer</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 font-medium">
                    {summaryStats.bestVariable.variable || 'N/A'}
                  </p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(summaryStats.bestVariable.pnl)}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-600">
                    <span>Win Rate: {formatPercent(summaryStats.bestVariable.win_rate)}</span>
                    <span>Trades: {summaryStats.bestVariable.trades || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border border-red-200 shadow-sm">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Worst Performer</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 font-medium">
                    {summaryStats.worstVariable.variable || 'N/A'}
                  </p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(summaryStats.worstVariable.pnl)}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-600">
                    <span>Win Rate: {formatPercent(summaryStats.worstVariable.win_rate)}</span>
                    <span>Trades: {summaryStats.worstVariable.trades || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border border-blue-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Shield className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Best Combination Metrics</h3>
                      {summaryStats.bestVariable && summaryStats.bestVariable.variable && (
                        <div className="text-xs text-blue-600 mt-1">
                          {summaryStats.bestVariable.variable}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Top Performer
                  </span>
                </div>
                
                <div className="space-y-3">
                  <div className="group relative">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-700">Avg Expectancy</span>
                        <div className="ml-1 text-gray-400 group-hover:text-gray-600 cursor-help">
                          <Info className="h-3.5 w-3.5" />
                          <div className="hidden group-hover:block absolute z-10 w-64 p-2 mt-1 -ml-2 text-xs text-gray-600 bg-white border border-gray-200 rounded shadow-lg">
                            Average profit per trade relative to risk. Higher values indicate better risk-adjusted returns.
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(summaryStats.avgExpectancy)}
                      </span>
                    </div>
                  </div>

                  <div className="group relative">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-700">Avg Drawdown</span>
                        <div className="ml-1 text-gray-400 group-hover:text-gray-600 cursor-help">
                          <Info className="h-3.5 w-3.5" />
                          <div className="hidden group-hover:block absolute z-10 w-64 p-2 mt-1 -ml-2 text-xs text-gray-600 bg-white border border-gray-200 rounded shadow-lg">
                            Average peak-to-trough decline. Lower (more negative) values indicate larger losses from peak values.
                          </div>
                        </div>
                      </div>
                      <span className={`text-sm font-medium ${
                        summaryStats.avgMaxDrawdown < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {formatCurrency(summaryStats.avgMaxDrawdown)}
                      </span>
                    </div>
                  </div>

                  <div className="group relative pt-1 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="text-xs font-medium text-gray-600">Ann. Volatility</span>
                        <div className="ml-1 text-gray-400 group-hover:text-gray-600 cursor-help">
                          <Info className="h-3 w-3" />
                          <div className="hidden group-hover:block absolute z-10 w-64 p-2 mt-1 -ml-2 text-xs text-gray-600 bg-white border border-gray-200 rounded shadow-lg">
                            Annualized standard deviation of returns. Measures the dispersion of returns.
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-gray-900">
                          {summaryStats.returnVolatility < 10 
                            ? (summaryStats.returnVolatility * 100).toFixed(1) + '%' 
                            : 'N/A'}
                        </span>
                        {summaryStats._metrics && (
                          <div className="text-xs text-gray-500">
                            <div>Based on {summaryStats._metrics.returnsCount} trades</div>
                            {summaryStats.returnVolatility >= 10 && (
                              <div className="text-amber-600">
                                High volatility detected
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Top 10 Variables by P&L</h3>
                  <BarChart2 className="h-5 w-5 text-gray-400" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip 
                        formatter={(value) => [formatCurrency(value), 'P&L']}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Bar dataKey="pnl" fill="#6366f1" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Performance Distribution</h3>
                  <PieChartIcon className="h-5 w-5 text-gray-400" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Profitable', value: summaryStats.profitableVariables, fill: '#10b981' },
                          { name: 'Unprofitable', value: summaryStats.totalVariables - summaryStats.profitableVariables, fill: '#ef4444' }
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        strokeWidth={2}
                        stroke="#fff"
                      >
                        <LabelList dataKey="value" position="center" />
                      </Pie>
                      <Tooltip 
                        formatter={(value, name) => [`${value} variables`, name]}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-2xl shadow-lg border border-slate-200/60 hover:shadow-xl transition-all duration-300">
  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
    <div className="flex items-center space-x-3">
      <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
      <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Top Combinations by P&L</h3>
    </div>
    
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center space-x-3 bg-slate-100/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200/50">
        <span className="text-sm font-medium text-slate-600">
          Top 10 of {combinationsData.length}
        </span>
        <div className="w-px h-4 bg-slate-300"></div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full shadow-sm"></div>
            <span className="text-xs font-medium text-slate-600">Profitable</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-3 bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-sm"></div>
            <span className="text-xs font-medium text-slate-600">Loss</span>
          </div>
        </div>
      </div>
      
      <button
        onClick={() => navigate('/analytics/top-combinations')}
        className="group flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
      >
        <Maximize2 className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
        <span>Full View</span>
      </button>
    </div>
  </div>
  
  <div className="mb-4 flex items-center justify-between bg-white/30 backdrop-blur-sm rounded-lg border border-slate-200/30 p-3">
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium text-slate-700">Min Trades:</label>
        <select 
          value={minTrades} 
          onChange={(e) => setMinTrades(parseInt(e.target.value))}
          className="bg-white/80 border border-slate-200 rounded-md px-2 py-1 text-sm"
        >
          <option value={3}>3+</option>
          <option value={5}>5+</option>
          <option value={10}>10+</option>
          <option value={20}>20+</option>
        </select>
      </div>
      <div className="text-sm text-slate-600">
        Showing top 10 of {combinationsData.filter(combo => (combo.trades || 0) >= minTrades).length} combinations
      </div>
    </div>
  </div>
  
  <div className="h-[700px] bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/50 p-4">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={(() => {
          console.log('VariablesAnalysis: Preparing chart data from combinationsData:', combinationsData.length, 'combinations');
          console.log('VariablesAnalysis: minTrades filter:', minTrades);
          
          const filteredData = [...combinationsData]
            // Filter out combinations with too few trades for reliability
            .filter(combo => {
              const hasEnoughTrades = (combo.trades || 0) >= minTrades;
              console.log(`VariablesAnalysis: Combo "${combo.combination}" has ${combo.trades} trades, passes filter: ${hasEnoughTrades}`);
              return hasEnoughTrades;
            });
          
          console.log('VariablesAnalysis: After minTrades filter:', filteredData.length, 'combinations');
          
          const sortedData = filteredData
            // Sort by a combination of factors for better ranking
            .sort((a, b) => {
              // Primary sort: P&L (descending)
              const pnlDiff = (b.pnl || 0) - (a.pnl || 0);
              if (Math.abs(pnlDiff) > 100) return pnlDiff;
              
              // Secondary sort: Win rate (descending) for similar P&L
              const winRateDiff = (b.win_rate || 0) - (a.win_rate || 0);
              if (Math.abs(winRateDiff) > 5) return winRateDiff;
              
              // Tertiary sort: Number of trades (descending) for more reliable data
              return (b.trades || 0) - (a.trades || 0);
            })
            .slice(0, 10)
            .map(combo => ({
              name: combo.combination_with_values || combo.combination,
              pnl: combo.pnl,
              trades: combo.trades,
              winRate: combo.win_rate,
              combination_with_values: combo.combination_with_values,
            }));
          
          console.log('VariablesAnalysis: Final chart data:', sortedData.length, 'items');
          return sortedData;
        })()}
        layout="vertical"
        margin={{ top: 20, right: 40, left: 80, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
        <XAxis 
          type="number" 
          axisLine={false} 
          tickLine={false}
          tickFormatter={(value) => formatCurrency(value).replace('$', '')}
          tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
        />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={550}
          axisLine={false} 
          tickLine={false}
                     tick={({ payload, x, y }) => {
             if (!payload || !payload.value) return null;
             
             // Parse combination string
             let comboString = payload.payload?.combination_with_values || payload.value;
             let variables = [];
             
             if (comboString.includes(' & ') && comboString.includes(':')) {
               // Format: "variable1:value & variable2:value"
               const parts = comboString.split(' & ');
               variables = parts.map(part => {
                 const [varName, varValue] = part.split(':').map(s => s.trim());
                 return { name: varName || 'Unknown', value: varValue || 'N/A' };
               });
             } else if (comboString.includes('+') && comboString.includes(':')) {
               // Format: "variable1:value+variable2:value" (new backend format)
               const parts = comboString.split('+').map(s => s.trim());
               variables = parts.map(part => {
                 const [varName, varValue] = part.split(':').map(s => s.trim());
                 return { name: varName || 'Unknown', value: varValue || 'N/A' };
               });
             } else if (comboString.includes('+')) {
               // Format: "variable1+variable2" (old backend format)
               const parts = comboString.split('+').map(s => s.trim());
               variables = parts.map(part => {
                 return { name: part, value: 'Present' };
               });
             } else {
               // Single variable
               variables = [{ name: comboString, value: 'Present' }];
             }
             
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
             
             return (
               <g transform={`translate(${x},${y})`}>
                 {variables.map((variable, index) => {
                   // Calculate responsive text for variable name (larger block)
                   const nameBlock = { width: 120, height: 50 };
                   const nameText = calculateResponsiveText(variable.name, nameBlock.width, nameBlock.height);
                   
                   // Calculate responsive text for variable value (smaller block)
                   const valueBlock = { width: 80, height: 30 };
                   const valueText = calculateResponsiveText(variable.value, valueBlock.width, valueBlock.height);
                   
                   return (
                     <g key={index} transform={`translate(${index * 220 - (variables.length - 1) * 100 - 250}, 0)`}>
                       {/* Variable name block */}
                       <rect
                         x={-150}
                         y={-10}
                         width={nameBlock.width}
                         height={nameBlock.height}
                         fill="#3b82f6"
                         rx={12}
                       />
                       <text
                         x={-150 + nameBlock.width/2}
                         y={-10 + nameBlock.height/2}
                         textAnchor="middle"
                         fill="white"
                         fontSize={nameText.fontSize}
                         fontWeight="600"
                         dominantBaseline="middle"
                       >
                         {nameText.displayText}
                       </text>
                       
                       {/* Connecting line */}
                       <line
                         x1={-150 + nameBlock.width}
                         y1={-10 + nameBlock.height/2}
                         x2={30}
                         y2={-10 + nameBlock.height/2}
                         stroke="#64748b"
                         strokeWidth={2}
                       />
                       
                       {/* Variable value block */}
                       <rect
                         x={-15 }
                         y={0}
                         width={valueBlock.width}
                         height={valueBlock.height}
                         fill="#f8fafc"
                         stroke="#e2e8f0"
                         strokeWidth={1}
                         rx={6}
                       />
                       <text
                         x={-9 + valueBlock.width/2}
                         y={0+ valueBlock.height/2}
                         textAnchor="middle"
                         fill="#1e293b"
                         fontSize={valueText.fontSize}
                         fontWeight="500"
                         dominantBaseline="middle"
                       >
                         {valueText.displayText}
                       </text>
                     </g>
                   );
                 })}
               </g>
             );
           }}
          interval={0}
        />
        <Tooltip 
          content={({ active, payload }) => {
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
              <div className="bg-white/95 backdrop-blur-sm p-5 border border-slate-200 rounded-xl shadow-2xl text-sm max-w-sm">
                <div className="mb-4 pb-3 border-b border-slate-100">
                  <p className="font-bold text-slate-900 text-base leading-relaxed">
                    {data.name}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">P&L:</span>
                    <span className={`font-bold text-lg ${data.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(data.pnl)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Trades:</span>
                    <span className="font-semibold text-slate-800">{data.trades ?? 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Win Rate:</span>
                    <span className="font-semibold text-slate-800">
                      {typeof data.winRate === 'number' ? `${data.winRate.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  {variables.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-xs text-slate-500 mb-2 font-medium">Variables ({variables.length}):</div>
                      <div className="space-y-2">
                        {variables.map((v, idx) => (
                          <div key={idx} className="flex justify-between text-xs bg-slate-50 px-2 py-1 rounded-md">
                            <span className="text-slate-600 font-medium">{v.name}:</span>
                            <span className="text-slate-800 font-semibold">{v.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }}
        />
        <Bar 
          dataKey="pnl" 
          name="P&L" 
          radius={[0, 10, 10, 0]}
          barSize={40}
          barGap={25}
        >
          {combinationsData
            .sort((a, b) => b.pnl - a.pnl)
            .slice(0, 10)
            .map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.pnl >= 0 ? 'url(#emeraldGradient)' : 'url(#redGradient)'} 
              />
            ))}
        </Bar>
        <defs>
          <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <Bar dataKey="trades" visibility="hidden" />
        <Bar dataKey="winRate" visibility="hidden" />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>

{/* Combination Controls */}
<div className="bg-gradient-to-br from-white to-slate-50/50 p-8 rounded-2xl shadow-lg border border-slate-200/60 backdrop-blur-sm">
  <div className="flex items-center justify-between mb-8">
    <div className="flex items-center space-x-3">
      <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-indigo-600 rounded-full"></div>
      <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Combination Settings</h3>
    </div>
    <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/50">
      <Settings className="h-5 w-5 text-slate-500" />
    </div>
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
        Minimum Trades: <span className="text-blue-600 font-bold">{minTrades}</span> trade{minTrades !== 1 ? 's' : ''}
      </label>
      <input
        type="number"
        min="1"
        value={minTrades}
        onChange={(e) => setMinTrades(parseInt(e.target.value) || 1)}
        className="bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-3.5 shadow-sm hover:border-slate-300 transition-colors duration-200 font-medium"
      />
    </div>
    
    <div className="flex items-end">
      <button
        onClick={() => setShowFilters(true)}
        className="group relative flex items-center justify-center space-x-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-3.5 px-4 rounded-xl text-sm transition-all duration-200 shadow-sm hover:shadow-md w-full"
      >
        <Filter className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
        <span>Filter Combinations</span>
        {activeFilterCount > 0 && (
          <div className="absolute -top-2 -right-2 inline-flex items-center justify-center h-6 min-w-6 px-2 py-1 text-xs font-bold bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full shadow-lg">
            {activeFilterCount}
          </div>
        )}
      </button>
    </div>
    
    <div className="flex items-end">
      <button
        onClick={() => {
          const event = new Event('refresh-combinations');
          window.dispatchEvent(event);
        }}
        className="group flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3.5 px-4 rounded-xl text-sm transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 w-full"
      >
        <RefreshCw className="h-4 w-4 group-hover:rotate-180 group-hover:scale-110 transition-all duration-300" />
        <span>Refresh Analysis</span>
      </button>
    </div>
  </div>
</div>

            {combinationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
                  <span className="text-gray-600 font-medium">Analyzing combinations...</span>
                </div>
              </div>
            ) : combinationsData.length === 0 ? (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-6 shadow-sm">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <Info className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-yellow-800 mb-2">No Combinations Found</h3>
                    <div className="text-sm text-yellow-700">
                      <p className="mb-3">No variable combinations found with the current filters. Try:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Reducing the minimum trades requirement</li>
                        <li>Changing the combination level</li>
                        <li>Adjusting the date range</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Active Filters */}
                {activeFilterCount > 0 && (
                  <div className="bg-blue-50 border-l-4 border-blue-400 rounded-lg p-4 shadow-sm">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H4a1 1 0 01-.8-1.6L5.75 8 3.2 4.6A1 1 0 013 3zm4 8a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm text-blue-700 font-medium">
                          Showing {filterCombinations.length} of {combinationsData.length} combinations matching {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                        </p>
                        {renderActiveFilters()}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Best Combinations Summary */}
                {combinationStats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {combinationStats.best_by_pnl && (
                      <SummaryCard
                        title="Best by P&L"
                        value={formatCurrency(combinationStats.best_by_pnl.pnl)}
                        icon={Award}
                        color="green"
                        subtitle={combinationStats.best_by_pnl.combination}
                        size="large"
                      />
                    )}
                    
                    {combinationStats.best_by_win_rate && (
                      <SummaryCard
                        title="Best Win Rate"
                        value={formatPercent(combinationStats.best_by_win_rate.win_rate)}
                        icon={TrendingUp}
                        color="blue"
                        subtitle={combinationStats.best_by_win_rate.combination}
                        size="large"
                      />
                    )}
                    
                    {combinationStats.best_by_profit_factor && (
                      <SummaryCard
                        title="Best Profit Factor"
                        value={combinationStats.best_by_profit_factor.profit_factor?.toFixed(2) || 'N/A'}
                        icon={BarChart3}
                        color="purple"
                        subtitle={combinationStats.best_by_profit_factor.combination}
                        size="large"
                      />
                    )}
                  </div>
                )}

                {/* Combination Performance Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 gap-4 col-span-full">
                    <SummaryCard
                      title="Total Combinations"
                      value={combinationsData.length.toLocaleString()}
                      icon={Layers}
                      color="blue"
                      subtitle="Analyzed patterns"
                    />
                    <SummaryCard
                      title="Total Trades"
                      value={combinationsData.reduce((sum, c) => sum + c.trades, 0).toLocaleString()}
                      icon={Activity}
                      color="green"
                      subtitle="Across all combinations"
                    />
                  </div>

                  
                </div>
                  

                  {/* Win Rate vs P&L Scatter Plot */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-gray-900">Win Rate vs P&L (Trades as Bubble Size)</h3>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                {bubbleChartData.length} combinations
                            </span>
                        </div>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart
                                data={bubbleChartData}
                                margin={{ top: 20, right: 20, bottom: 20, left: 20, }}
                            >
                                <CartesianGrid stroke="#f1f5f9" />
                                <XAxis 
                                    type="number" 
                                    dataKey="win_rate" 
                                    name="Win Rate" 
                                    unit="%" 
                                    domain={[0, 100]}
                                    tickFormatter={(val) => `${Math.round(val)}%`}
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                />
                                <YAxis 
                                    type="number" 
                                    dataKey="pnl" 
                                    name="P&L" 
                                    tickFormatter={(value) => formatCurrency(value)}
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                />
                                <ZAxis type="number" dataKey="trades" range={[20, 500]} name="Trades" />
                                <Tooltip 
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-xl text-sm">
                                                    <p className="font-bold text-gray-900 mb-2" style={{ maxWidth: '300px', whiteSpace: 'normal' }}>
                                                        {data.combination}
                                                    </p>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-gray-600">P&L:</span>
                                                            <span className={`font-semibold ${data.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {formatCurrency(data.pnl)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-gray-600">Win Rate:</span>
                                                            <span className="font-semibold text-gray-800">
                                                                {data.win_rate.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-gray-600">Trades:</span>
                                                            <span className="font-semibold text-gray-800">{data.trades}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Scatter name="Combinations" fill="#8884d8">
                                    {bubbleChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                  </div>
                

                {/* Combinations Table */}
                <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">All Combinations</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Showing {filterCombinations.length} of {combinationsData.length} combinations
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
                            Avg R:R
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Profit Factor
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filterCombinations
                          .sort((a, b) => b.pnl - a.pnl)
                          .slice(0, 50) // Limit to top 50 for performance
                          .map((combo, index) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                                {combo.combination}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">
                                {combo.trades}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">
                                {formatPercent(combo.win_rate)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`text-sm font-semibold ${combo.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(combo.pnl)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">
                                {formatRiskReward(combo.avg_rr)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">
                                {combo.profit_factor ? combo.profit_factor.toFixed(2) : 'N/A'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filterCombinations.length > 50 && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                      <p className="text-sm text-gray-600 text-center">
                        Showing top 50 results. Use filters to narrow down the results.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'table' ? (
          /* Enhanced Data Table */
          <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('variable')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Variable</span>
                        {sortIcon('variable')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('trades')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Trades</span>
                        {sortIcon('trades')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('win_rate')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Win Rate</span>
                        {sortIcon('win_rate')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('avg_rr')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Avg. R:R</span>
                        {sortIcon('avg_rr')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('pnl')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>P&L</span>
                        {sortIcon('pnl')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('profit_factor')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Profit Factor</span>
                        {sortIcon('profit_factor')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('max_drawdown')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Max Drawdown</span>
                        {sortIcon('max_drawdown')}
                      </div>
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => handleSort('expectancy')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Expectancy</span>
                        {sortIcon('expectancy')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedAndFilteredData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {item.variable || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {item.trades || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {formatPercent(item.win_rate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {formatRiskReward(item.avg_rr)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${(item.pnl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(item.pnl)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {item.profit_factor ? item.profit_factor.toFixed(2) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {formatCurrency(item.max_drawdown)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {formatCurrency(item.expectancy)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'charts' ? (
          /* Enhanced Charts */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            
            
          </div>
        ) : activeTab === 'advanced' ? (
          /* New Advanced Analytics Tab */
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <PerformanceDistribution data={data} title="Performance Distribution" />
              <RiskReturnBubble data={data} title="Risk-Return Analysis" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <PerformanceRadar data={data} title="Top 5 Variables Radar" />
              <VariableTreemap data={data} title="Variable Impact Treemap" />
            </div>
          </div>
        ) : (
          null
        )}
      </div>
    </div>
  );
}
