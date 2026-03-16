import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFilter } from '../../context/FilterContext';
import { Info, RefreshCw, Move, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
  ReferenceLine,
} from 'recharts';
import { fetchWithAuth } from '../../utils/fetchUtils';

const StatCard = ({ title, value, tooltip, isOptimized = false }) => (
  <div className={`border rounded-xl p-6 text-center h-full flex flex-col justify-center transition-all duration-300 ${
    isOptimized 
      ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-lg' 
      : 'bg-white border-blue-200/60'
  }`}>
    <div className="flex items-center justify-center mb-2">
      <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wider">{title}</h4>
      {tooltip && (
        <div className="ml-1 group relative">
          <Info size={16} className="text-slate-400 cursor-pointer" />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      )}
    </div>
    <p className={`text-2xl font-bold leading-none ${
      isOptimized ? 'text-emerald-700' : 'text-[#040028]'
    }`}>{value}</p>
  </div>
);

const ExitAnalysisAmelioration = () => {
  const { filters } = useFilter();
  const safeFilters = filters || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('all');
  const [calcMode, setCalcMode] = useState('average');
  
  // Interactive TP/SL state
  const [tpLevel, setTpLevel] = useState(100); // Default 100% - reasonable TP level
  const [slLevel, setSlLevel] = useState(-100); // Default -100% - reasonable SL level
  const [hasMovedLevels, setHasMovedLevels] = useState(false); // Track if user has moved TP/SL levels
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null); // 'tp' or 'sl'
  const [amelioratedTrades, setAmelioratedTrades] = useState([]); // Store ameliorated trades for debug
  const chartRef = useRef(null);

  // Get trades data for use in render
  const trades = data?.chart_data || [];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      queryParams.append('timeframe', timeframe);
      queryParams.append('mode', calcMode);
      
      // Add filter parameters
      if (safeFilters.dateRange?.start) queryParams.append('from_date', safeFilters.dateRange.start);
      if (safeFilters.dateRange?.end) queryParams.append('to_date', safeFilters.dateRange.end);
      if (safeFilters.symbol && safeFilters.symbol.length > 0) queryParams.append('symbols', safeFilters.symbol.join(','));
      if (safeFilters.direction && safeFilters.direction.length > 0) queryParams.append('directions', safeFilters.direction.join(','));
      if (safeFilters.strategy && safeFilters.strategy.length > 0) queryParams.append('strategies', safeFilters.strategy.join(','));
      if (safeFilters.setup && safeFilters.setup.length > 0) queryParams.append('setups', safeFilters.setup.join(','));
      if (safeFilters.pnlRange?.min !== '') queryParams.append('min_pnl', safeFilters.pnlRange.min);
      if (safeFilters.pnlRange?.max !== '') queryParams.append('max_pnl', safeFilters.pnlRange.max);
      if (safeFilters.rrRange?.min !== '') queryParams.append('min_rr', safeFilters.rrRange.min);
      if (safeFilters.rrRange?.max !== '') queryParams.append('max_rr', safeFilters.rrRange.max);
      if (safeFilters.importBatch && safeFilters.importBatch.length > 0) queryParams.append('batch_ids', safeFilters.importBatch.join(','));
      if (safeFilters.timeOfDay && safeFilters.timeOfDay.length > 0) queryParams.append('time_of_day', safeFilters.timeOfDay.join(','));
      if (safeFilters.dayOfWeek && safeFilters.dayOfWeek.length > 0) queryParams.append('day_of_week', safeFilters.dayOfWeek.join(','));
      if (safeFilters.month && safeFilters.month.length > 0) queryParams.append('month', safeFilters.month.join(','));
      if (safeFilters.year && safeFilters.year.length > 0) queryParams.append('year', safeFilters.year.join(','));
      if (safeFilters.variables && Object.keys(safeFilters.variables).length > 0) queryParams.append('variables', JSON.stringify(safeFilters.variables));
      
      const url = `/api/journal/exit-analysis-summary?${queryParams.toString()}`;
      console.log('ExitAnalysisAmelioration: Fetching with filters:', url);
      
      const result = await fetchWithAuth(url);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeframe, calcMode, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Detect when TP/SL levels are at default values
  useEffect(() => {
    if (!data || !data.chart_data) return;
    
    // Check if levels are at default values (100%/-100%)
    const isAtDefaultLevels = tpLevel === 100 && slLevel === -100;
    
    console.log('🔍 USE EFFECT - DEFAULT DETECTION:', {
      tpLevel,
      slLevel,
      isAtDefaultLevels,
      hasMovedLevels: !isAtDefaultLevels,
      totalTrades: data.chart_data.length
    });
    
    setHasMovedLevels(!isAtDefaultLevels);
  }, [tpLevel, slLevel, data]);

  // Calculate ameliorated metrics based on new TP/SL levels
  // When TP/SL levels are moved, we calculate how many trades would hit those levels
  // and assign the corresponding P&L values:
  // - TP hits: P&L = TP level percentage (positive)
  // - SL hits: P&L = SL level percentage (negative) 
  // - No hits: P&L = actual trade result
  const calculateAmelioratedMetrics = useCallback(() => {
    if (!data || !data.chart_data) return null;

    // Check if levels are at default values (100%/-100%)
    const isAtDefaultLevels = tpLevel === 100 && slLevel === -100;
    
    // Debug: Log the default detection
    console.log('🔍 DEFAULT DETECTION:', {
      tpLevel,
      slLevel,
      isAtDefaultLevels,
      totalTrades: trades.length
    });

    // If levels are at default values, return original performance data (regardless of whether trades hit them)
    if (isAtDefaultLevels) {
      const originalWins = trades.filter(t => t.actual_pnl > 0).length;
      const originalWinRate = (originalWins / trades.length) * 100;
      const originalTotalPnl = trades.reduce((sum, t) => sum + t.actual_pnl, 0);
      const originalAvgPnl = originalTotalPnl / trades.length;
      
      return {
        amelioratedTrades: trades.map(t => ({ ...t, amelioratedPnl: t.actual_pnl })),
        totalPnl: originalTotalPnl,
        winRate: originalWinRate,
        avgRR: Math.abs(tpLevel / slLevel),
        avgPnl: originalAvgPnl,
        wins: originalWins,
        losses: trades.length - originalWins,
        totalTrades: trades.length,
        tradesHitTp: 0,
        tradesHitSl: 0,
        calculationsMatch: true,
        isOriginal: true
      };
    }

    // Use trades from component scope
    let amelioratedTrades = [];
    let totalPnl = 0;
    let wins = 0;
    let losses = 0;

    // Debug: Log original data for verification
    console.log('🔍 VERIFICATION: Original trades data:', trades.slice(0, 3));
    console.log('🔍 VERIFICATION: Current TP Level:', tpLevel, 'SL Level:', slLevel);
    console.log('🔍 VERIFICATION: Summary stats from backend:', data?.summary_stats);
    
    // Debug: Analyze updraw/drawdown ranges
    const updrawValues = trades.map(t => t.updraw).filter(v => v > 0);
    const drawdownValues = trades.map(t => t.drawdown).filter(v => v < 0);
    console.log('🔍 UPDRAW ANALYSIS:', {
      min: Math.min(...updrawValues),
      max: Math.max(...updrawValues),
      avg: updrawValues.reduce((sum, v) => sum + v, 0) / updrawValues.length,
      count: updrawValues.length
    });
    console.log('🔍 DRAWDOWN ANALYSIS:', {
      min: Math.min(...drawdownValues),
      max: Math.max(...drawdownValues),
      avg: drawdownValues.reduce((sum, v) => sum + v, 0) / drawdownValues.length,
      count: drawdownValues.length
    });

    trades.forEach((trade, index) => {
      let newPnl = 0;
      let hitTp = false;
      let hitSl = false;
      let exitReason = 'actual';

      // Check if trade would hit TP or SL based on updraw/drawdown
      if (trade.updraw >= tpLevel) {
        // Trade would hit TP at the specified level
        // Calculate P&L based on the TP level percentage
        // If TP is hit, it's a winning trade with P&L equal to the TP level
        newPnl = tpLevel; // TP level represents the percentage gain
        hitTp = true;
        exitReason = 'TP';
      } else if (trade.drawdown <= slLevel) {
        // Trade would hit SL at the specified level
        // Calculate P&L based on the SL level percentage
        // If SL is hit, it's a losing trade with P&L equal to the SL level
        newPnl = slLevel; // SL level represents the percentage loss
        hitSl = true;
        exitReason = 'SL';
      } else {
        // Use actual P&L if didn't hit TP or SL
        newPnl = trade.actual_pnl;
        exitReason = 'actual';
      }

             // Debug: Log win rate calculation details
       if (index < 5) {
         console.log(`🔍 WIN RATE DEBUG - Trade ${index + 1}:`, {
           symbol: trade.symbol,
           originalPnl: trade.actual_pnl,
           originalWasWin: trade.actual_pnl > 0,
           newPnl: newPnl,
           newIsWin: newPnl > 0,
           exitReason: exitReason,
           updraw: trade.updraw,
           drawdown: trade.drawdown,
           tpLevel: tpLevel,
           slLevel: slLevel,
           hitTp: hitTp,
           hitSl: hitSl,
           pnlCalculation: hitTp ? `TP hit: ${tpLevel}%` : hitSl ? `SL hit: ${slLevel}%` : `Actual: ${trade.actual_pnl}%`
         });
       }

      amelioratedTrades.push({
        ...trade,
        amelioratedPnl: newPnl,
        hitTp,
        hitSl,
        exitReason,
        originalPnl: trade.exit
      });

      totalPnl += newPnl;
      if (newPnl > 0) wins++;
      else if (newPnl < 0) losses++;

      // Note: R:R is now calculated based on TP/SL levels, not per trade

      // Debug: Log first few trades for verification
      if (index < 3) {
        console.log(`🔍 VERIFICATION: Trade ${index + 1}:`, {
          symbol: trade.symbol,
          originalPnl: trade.actual_pnl,
          updraw: trade.updraw,
          drawdown: trade.drawdown,
          newPnl: newPnl,
          exitReason: exitReason,
          hitTp: hitTp,
          hitSl: hitSl,
          pnlCalculation: hitTp ? `TP hit: ${tpLevel}%` : hitSl ? `SL hit: ${slLevel}%` : `Actual: ${trade.actual_pnl}%`
        });
      }
    });

    const totalTrades = trades.length;
    const tradesHitTp = amelioratedTrades.filter(t => t.hitTp).length;
    const tradesHitSl = amelioratedTrades.filter(t => t.hitSl).length;
    
         // Calculate win rate based on TP hits vs SL hits
     // Win rate = (TP hits) / (TP hits + SL hits) * 100
     // Only consider trades that actually hit TP or SL levels
     const tradesWithTpOrSl = tradesHitTp + tradesHitSl;
     const winRate = tradesWithTpOrSl > 0 ? (tradesHitTp / tradesWithTpOrSl) * 100 : 0;
     
     // Calculate average R:R based on TP and SL levels
     // R:R = |TP Level| / |SL Level|
     const avgRR = Math.abs(tpLevel / slLevel);
    
    // Debug: Count trades hitting TP/SL
    console.log('🔍 TP/SL HIT ANALYSIS:', {
      totalTrades,
      tradesHitTp,
      tradesHitSl,
      tradesWithTpOrSl,
      tradesUsingActual: totalTrades - tradesHitTp - tradesHitSl,
      tpHitPercentage: (tradesHitTp / totalTrades) * 100,
      slHitPercentage: (tradesHitSl / totalTrades) * 100,
      actualExitPercentage: ((totalTrades - tradesHitTp - tradesHitSl) / totalTrades) * 100,
      newWinRate: winRate.toFixed(2) + '%',
      winRateCalculation: `(${tradesHitTp} TP hits / ${tradesWithTpOrSl} TP+SL hits) * 100`
    });

    // Verification calculations
    const verificationTotalPnl = amelioratedTrades.reduce((sum, t) => sum + t.amelioratedPnl, 0);
    const verificationWins = amelioratedTrades.filter(t => t.amelioratedPnl > 0).length;
    const verificationLosses = amelioratedTrades.filter(t => t.amelioratedPnl < 0).length;
    const verificationWinRate = (verificationWins / totalTrades) * 100;

         // Debug: Log verification results
     console.log('🔍 VERIFICATION RESULTS:', {
       totalTrades: totalTrades,
       calculatedTotalPnl: totalPnl,
       verificationTotalPnl: verificationTotalPnl,
       calculatedWins: wins,
       verificationWins: verificationWins,
       calculatedLosses: losses,
       verificationLosses: verificationLosses,
               calculatedWinRate: winRate,
        verificationWinRate: verificationWinRate,
        tradesHitTp: tradesHitTp,
        tradesHitSl: tradesHitSl,
        avgRR: avgRR
     });

     // Debug: Win rate analysis
     // New win rate is based on TP hits vs SL hits
     const originalWins = trades.filter(t => t.actual_pnl > 0).length;
     const originalWinRate = (originalWins / totalTrades) * 100;
     console.log('🔍 WIN RATE ANALYSIS:', {
       originalWins: originalWins,
       originalWinRate: originalWinRate.toFixed(2) + '%',
       newTpHits: tradesHitTp,
       newSlHits: tradesHitSl,
       newWinRate: winRate.toFixed(2) + '%',
       winRateCalculation: `TP hits: ${tradesHitTp}, SL hits: ${tradesHitSl}, Win Rate: (${tradesHitTp}/${tradesWithTpOrSl})*100`,
       tradesChanged: amelioratedTrades.filter(t => t.amelioratedPnl !== t.originalPnl).length,
       tradesHitTp: tradesHitTp,
       tradesHitSl: tradesHitSl
     });

    // Verify calculations match
    const calculationsMatch = 
      Math.abs(totalPnl - verificationTotalPnl) < 0.01 &&
      wins === verificationWins &&
      losses === verificationLosses &&
      Math.abs(winRate - verificationWinRate) < 0.01;

    console.log('🔍 VERIFICATION: Calculations match?', calculationsMatch);

    // Store ameliorated trades in state for debug access
    setAmelioratedTrades(amelioratedTrades);

    return {
      amelioratedTrades,
      totalPnl,
              winRate,
        avgRR,
        wins,
        losses,
      totalTrades,
      tradesHitTp,
      tradesHitSl,
      calculationsMatch,
      isOriginal: false
    };
  }, [trades, tpLevel, slLevel, hasMovedLevels]);

  // Use useMemo to prevent infinite re-renders
  const amelioratedMetrics = useMemo(() => {
    return calculateAmelioratedMetrics();
  }, [calculateAmelioratedMetrics]);

  // Mathematical verification function
  const verifyCalculations = useCallback(() => {
    if (!data || !data.chart_data || !amelioratedMetrics) return null;

    const trades = data.chart_data;
    let verificationResults = {
      totalPnl: 0,
      wins: 0,
      losses: 0,
      tradesHitTp: 0,
      tradesHitSl: 0,
      tradesWithActualExit: 0
    };

    trades.forEach(trade => {
      let newPnl = 0;
      let hitTp = false;
      let hitSl = false;

      // Apply the same logic as in calculateAmelioratedMetrics
      if (trade.updraw >= tpLevel) {
        // If TP is hit, it's a winning trade with P&L equal to the TP level
        newPnl = tpLevel; // TP level represents the percentage gain
        hitTp = true;
        verificationResults.tradesHitTp++;
      } else if (trade.drawdown <= slLevel) {
        // If SL is hit, it's a losing trade with P&L equal to the SL level
        newPnl = slLevel; // SL level represents the percentage loss
        hitSl = true;
        verificationResults.tradesHitSl++;
      } else {
        newPnl = trade.actual_pnl;
        verificationResults.tradesWithActualExit++;
      }

      verificationResults.totalPnl += newPnl;
      if (newPnl > 0) verificationResults.wins++;
      else if (newPnl < 0) verificationResults.losses++;
    });

    // Calculate win rate based on TP hits vs SL hits (same as in calculateAmelioratedMetrics)
         const verificationTradesWithTpOrSl = verificationResults.tradesHitTp + verificationResults.tradesHitSl;
     const verificationWinRate = verificationTradesWithTpOrSl > 0 ? (verificationResults.tradesHitTp / verificationTradesWithTpOrSl) * 100 : 0;

    // Compare with calculated results
    const pnlMatch = Math.abs(verificationResults.totalPnl - amelioratedMetrics.totalPnl) < 0.01;
    const winsMatch = verificationResults.wins === amelioratedMetrics.wins;
         const lossesMatch = verificationResults.losses === amelioratedMetrics.losses;
     const winRateMatch = Math.abs(verificationWinRate - amelioratedMetrics.winRate) < 0.01;
     const tpMatch = verificationResults.tradesHitTp === amelioratedMetrics.tradesHitTp;
     const slMatch = verificationResults.tradesHitSl === amelioratedMetrics.tradesHitSl;

     const allMatch = pnlMatch && winsMatch && lossesMatch && winRateMatch && tpMatch && slMatch;

    console.log('🔍 MATHEMATICAL VERIFICATION:', {
      verificationResults,
      amelioratedMetrics,
      matches: {
        pnlMatch,
        winsMatch,
        lossesMatch,
        winRateMatch,
        tpMatch,
        slMatch,
        allMatch
      }
    });

    return {
      verificationResults,
      allMatch,
              matches: { pnlMatch, winsMatch, lossesMatch, winRateMatch, tpMatch, slMatch }
    };
  }, [data, amelioratedMetrics, tpLevel, slLevel]);

  // Use useMemo to prevent infinite re-renders
  const verificationResults = useMemo(() => {
    return verifyCalculations();
  }, [verifyCalculations]);

  // Mouse event handlers for dragging
  const handleMouseDown = (e, type) => {
    setIsDragging(true);
    setDragType(type);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // Convert pixel position to chart value
    const chartValue = ((height - y) / height) * 500 - 250; // Assuming chart range is -250 to 250
    
    if (dragType === 'tp') {
      const newTpLevel = Math.max(0, Math.min(500, chartValue));
      setTpLevel(newTpLevel);
      // Check if moved from default position - will be updated by useEffect
      setHasMovedLevels(true);
    } else if (dragType === 'sl') {
      const newSlLevel = Math.max(-500, Math.min(0, chartValue));
      setSlLevel(newSlLevel);
      // Check if moved from default position - will be updated by useEffect
      setHasMovedLevels(true);
    }
  }, [isDragging, dragType]);

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4 space-y-6">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 text-red-500">⚠️</div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Error Loading Data
                </h3>
                <p className="text-red-700 mb-4">{error}</p>
                <button
                  onClick={fetchData}
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

  if (!data || !data.chart_data || data.chart_data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="w-full px-6 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 text-blue-500">📊</div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">
                  No Data Available
                </h3>
                <p className="text-blue-700 mb-4">
                  No exit analysis data available for the current filters.
                </p>
                <button
                  onClick={fetchData}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="h-4 w-4 inline mr-2" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { chart_data, summary_stats } = data;

  const formattedChartData = chart_data.map((trade, index) => ({
    ...trade,
    name: `${index + 1}`,
    updraw: trade.updraw > 0 ? trade.updraw : 0,
    drawdown: trade.drawdown < 0 ? trade.drawdown : 0,
    exitY: trade.exit,
    symbol: trade.symbol || trade.ticker || ''
  }));

  const allValues = chart_data.flatMap(d => [d.updraw, d.drawdown, d.exit]);
  const yMax = Math.ceil(Math.max(...allValues, 0) / 25) * 25 || 50;
  const yMin = Math.floor(Math.min(...allValues, 0) / 25) * 25 || -50;

  const avgUpdrawWinner = summary_stats.avg_updraw_winner;
  const avgDrawdownLoser = summary_stats.avg_drawdown_loser;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#040028] mb-2">
              Exit Analysis Amelioration
            </h1>
            <p className="text-slate-600">
              Interactive tool to optimize your TP/SL levels and see real-time performance changes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Calculation Mode Toggle */}
            <div className="bg-slate-100 rounded-lg p-1">
              <div className="flex">
                <button
                  onClick={() => setCalcMode('average')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    calcMode === 'average'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Average
                </button>
                <button
                  onClick={() => setCalcMode('median')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    calcMode === 'median'
                      ? 'bg-white shadow text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Median
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Move className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-[#040028]">Interactive TP/SL Controls</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Reset Button */}
            <div className="md:col-span-2 flex justify-center">
                              <button
                  onClick={() => {
                    console.log('🔍 RESET BUTTON CLICKED - Setting levels to default');
                    setTpLevel(100);
                    setSlLevel(-100);
                    // hasMovedLevels will be updated by useEffect
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset to Default (TP: 100%, SL: -100%)
                </button>
            </div>
            
            {/* TP Control */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-green-600" />
                <label className="text-sm font-medium text-slate-700">Take Profit Level</label>
                <span className="text-lg font-bold text-green-600">{tpLevel.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="0.5"
                value={tpLevel}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setTpLevel(newValue);
                  // Check if moved from default position - will be updated by useEffect
                  setHasMovedLevels(true);
                }}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10B981 0%, #10B981 ${(tpLevel/500)*100}%, #e2e8f0 ${(tpLevel/500)*100}%, #e2e8f0 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>0%</span>
                <span>250%</span>
                <span>500%</span>
              </div>
            </div>

            {/* SL Control */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <label className="text-sm font-medium text-slate-700">Stop Loss Level</label>
                <span className="text-lg font-bold text-red-600">{slLevel.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="-500"
                max="0"
                step="0.5"
                value={slLevel}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setSlLevel(newValue);
                  // Check if moved from default position - will be updated by useEffect
                  setHasMovedLevels(true);
                }}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #e2e8f0 0%, #e2e8f0 ${((slLevel+500)/500)*100}%, #EF4444 ${((slLevel+500)/500)*100}%, #EF4444 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>-500%</span>
                <span>-250%</span>
                <span>0%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <h2 className="text-xl font-bold text-[#040028]">Interactive Exit Analysis Chart</h2>
            <p className="text-sm text-slate-600 mt-1">
              {hasMovedLevels 
                ? `Current TP: ${tpLevel.toFixed(1)}%, SL: ${slLevel.toFixed(1)}% - Drag lines or use controls to optimize`
                : "Drag the TP/SL lines or use the controls above to see real-time changes"
              }
            </p>
          </div>
          <div className="p-6" ref={chartRef}>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart
                data={formattedChartData}
                margin={{
                  top: 20,
                  right: 40,
                  left: 20,
                  bottom: 5,
                }}
                barSize={25}
                barGap={-25}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  label={{ value: 'Trades', position: 'insideBottom', offset: -5 }}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
                  tickLine={{ stroke: '#64748b', strokeWidth: 1 }}
                />
                <YAxis 
                  label={{ value: 'Updraw / Drawdown (%)', angle: -90, position: 'insideLeft' }}
                  domain={[yMin, yMax]} 
                  tickFormatter={(tick) => `${tick}%`}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
                  tickLine={{ stroke: '#64748b', strokeWidth: 1 }}
                />
                
                {/* Interactive TP Line */}
                <ReferenceLine
                  y={tpLevel}
                  label={{
                    value: `TP: ${tpLevel.toFixed(1)}%`,
                    position: 'right',
                    fill: '#10B981',
                    fontSize: 11,
                    dx: 10
                  }}
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  cursor="ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'tp')}
                />
                
                {/* Interactive SL Line */}
                <ReferenceLine
                  y={slLevel}
                  label={{
                    value: `SL: ${slLevel.toFixed(1)}%`,
                    position: 'right',
                    fill: '#EF4444',
                    fontSize: 11,
                    dx: 10
                  }}
                  stroke="#EF4444"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  cursor="ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'sl')}
                />
                
                <Tooltip
                  formatter={(value, name) => [`${value.toFixed(2)}%`, name]}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid rgb(35, 36, 37)',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ 
                          fontWeight: 600, 
                          marginBottom: '8px',
                          color: '#040028',
                          fontSize: '13px',
                          borderBottom: '1px solid #e2e8f0',
                          paddingBottom: '4px'
                        }}>
                          {`Trade ${label}${data.symbol ? ` (${data.symbol})` : ''}`}
                        </div>
                        {payload.map((entry, i) => (
                          <div key={`item-${i}`} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            margin: '4px 0',
                            color: entry.color,
                            fontSize: '12px'
                          }}>
                            <span>{entry.name}:</span>
                            <span style={{ marginLeft: '10px', color: '#040028' }}>
                              {entry.value.toFixed(2)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                  contentStyle={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    padding: 0
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="rect"
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                {avgUpdrawWinner > 0 && (
                  <ReferenceLine
                    y={avgUpdrawWinner}
                    stroke="#22c55e"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    label={{
                      value: `${calcMode === 'average' ? 'Avg' : 'Median'} Win: ${avgUpdrawWinner.toFixed(1)}%`,
                      position: 'right',
                      fill: '#6b7280',
                      fontSize: 10,
                      dx: 10
                    }}
                  />
                )}
                {avgDrawdownLoser < 0 && (
                  <ReferenceLine
                    y={avgDrawdownLoser}
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    label={{
                      value: `${calcMode === 'average' ? 'Avg' : 'Median'} Loss: ${avgDrawdownLoser.toFixed(1)}%`,
                      position: 'right',
                      fill: '#6b7280',
                      fontSize: 10,
                      dx: 10
                    }}
                  />
                )}

                <Bar 
                  dataKey="updraw" 
                  fill="#10B981" 
                  name="Updraw"
                  radius={[2, 2, 0, 0]}
                  stroke="#059669"
                  strokeWidth={0.5}
                />
                <Bar 
                  dataKey="drawdown" 
                  fill="#EF4444" 
                  name="Drawdown"
                  radius={[0, 0, 2, 2]}
                  stroke="#DC2626"
                  strokeWidth={0.5}
                />
                <Scatter 
                  dataKey="exitY" 
                  fill="#040028" 
                  shape="circle"
                  name="Exit Point"
                  r={4}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Original vs Ameliorated Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Stats */}
          <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-[#040028]">Original Performance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatCard 
                title="Win Rate" 
                value={`${trades.length > 0 ? (trades.filter(t => t.actual_pnl > 0).length / trades.length * 100).toFixed(2) : '0.00'}%`} 
                tooltip="Original win rate from actual exits."
              />
              
              <StatCard 
                title="Trades Hit TP" 
                value={`${summary_stats.trades_hit_tp?.toFixed(2) || '0.00'}%`}
                tooltip="Percentage of trades that reached their take-profit target."
              />
              <StatCard 
                title="Trades Hit SL" 
                value={`${summary_stats.trades_hit_sl?.toFixed(2) || '0.00'}%`}
                tooltip="Percentage of trades that reached their stop-loss target."
              />
            </div>
          </div>

          {/* Ameliorated Stats */}
          <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-[#040028]">
                {hasMovedLevels ? 'Optimized Performance' : 'Original Performance (Default TP/SL)'}
              </h3>
            </div>
            {amelioratedMetrics ? (
              <div className="grid grid-cols-2 gap-4">
                <StatCard 
                  title="Win Rate" 
                  value={`${amelioratedMetrics.winRate.toFixed(2)}%`} 
                  tooltip={hasMovedLevels 
                    ? `Win rate based on TP hits vs SL hits: (${amelioratedMetrics.tradesHitTp} TP hits / ${amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl} TP+SL hits) * 100. Only considers trades that hit TP or SL levels.`
                    : "Original win rate from actual exits."
                  }
                  isOptimized={hasMovedLevels && amelioratedMetrics.winRate > (trades.filter(t => t.actual_pnl > 0).length / trades.length * 100)}
                />
                
                <StatCard 
                  title="Trades Hit TP" 
                  value={hasMovedLevels 
                    ? `${((amelioratedMetrics.tradesHitTp / amelioratedMetrics.totalTrades) * 100).toFixed(2)}%`
                    : `${summary_stats.trades_hit_tp?.toFixed(2) || '0.00'}%`
                  }
                  tooltip={hasMovedLevels 
                    ? `Percentage of trades that would hit TP at ${tpLevel.toFixed(1)}% level.`
                    : "Percentage of trades that reached their take-profit target."
                  }
                  isOptimized={hasMovedLevels}
                />
                <StatCard 
                  title="Trades Hit SL" 
                  value={hasMovedLevels 
                    ? `${((amelioratedMetrics.tradesHitSl / amelioratedMetrics.totalTrades) * 100).toFixed(2)}%`
                    : `${summary_stats.trades_hit_sl?.toFixed(2) || '0.00'}%`
                  }
                  tooltip={hasMovedLevels 
                    ? `Percentage of trades that would hit SL at ${slLevel.toFixed(1)}% level.`
                    : "Percentage of trades that reached their stop-loss target."
                  }
                  isOptimized={false}
                />
              </div>
            ) : (
              <div className="text-center text-slate-500">Calculating optimized metrics...</div>
            )}
            
            {/* Show message when levels haven't been moved */}
            {!hasMovedLevels && amelioratedMetrics && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <Info className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Move the TP/SL levels above to see optimized performance results
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

                 {/* Detailed Ameliorated Stats */}
         {amelioratedMetrics && hasMovedLevels && (
           <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-6">
             <h3 className="text-lg font-semibold text-[#040028] mb-4">Detailed TP/SL Optimization Results</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               
               <StatCard 
                 title="TP Hit Rate" 
                 value={`${amelioratedMetrics.tradesHitTp}/${amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl}`}
                 tooltip="Win rate based on TP hits vs SL hits. Shows the ratio of successful target hits (TP) to failed target hits (SL)."
               />
               <StatCard 
                 title="Avg R:R" 
                 value={`${amelioratedMetrics.avgRR.toFixed(2)}:1`}
                 tooltip="Risk-to-reward ratio based on current TP/SL levels: |TP Level| / |SL Level|."
               />
               <StatCard 
                 title="Improvement" 
                 value={`${((amelioratedMetrics.avgPnl - (trades.reduce((sum, t) => sum + t.actual_pnl, 0) / trades.length || 0)) / Math.abs(trades.reduce((sum, t) => sum + t.actual_pnl, 0) / trades.length || 1) * 100).toFixed(1)}%`}
                 tooltip="Percentage improvement in average P&L."
               />
             </div>
           </div>
         )}

         {/* Win Rate Change Analysis */}
         {amelioratedMetrics && hasMovedLevels && (
           <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-4">
             <div className="flex items-center gap-2 mb-3">
               <div className="h-5 w-5 text-blue-600">📊</div>
               <h4 className="text-sm font-semibold text-slate-700">Win Rate Change Analysis</h4>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
               <div>
                 <div className="font-medium">Original Win Rate:</div>
                 <div className="text-lg font-bold text-blue-600">
                   {(trades.filter(t => t.actual_pnl > 0).length / trades.length * 100).toFixed(2)}%
                 </div>
                 <div className="text-xs text-slate-500 mt-1">
                   ({trades.filter(t => t.actual_pnl > 0).length} wins / {trades.length} trades)
                 </div>
               </div>
               <div>
                 <div className="font-medium">Optimized Win Rate:</div>
                 <div className="text-lg font-bold text-emerald-600">
                   {amelioratedMetrics.winRate.toFixed(2)}%
                 </div>
                 <div className="text-xs text-slate-500 mt-1">
                   ({amelioratedMetrics.tradesHitTp} TP hits / {amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl} TP+SL hits)
                 </div>
               </div>
               <div>
                 <div className="font-medium">Change:</div>
                 <div className={`text-lg font-bold ${amelioratedMetrics.winRate > (trades.filter(t => t.actual_pnl > 0).length / trades.length * 100) ? 'text-green-600' : 'text-red-600'}`}>
                   {(amelioratedMetrics.winRate - (trades.filter(t => t.actual_pnl > 0).length / trades.length * 100)).toFixed(2)}%
                 </div>
                 <div className="text-xs text-slate-500 mt-1">
                   (TP-based vs P&L-based win rate)
                 </div>
               </div>
             </div>
             <div className="mt-3 text-xs text-slate-500">
               <div>• Trades that hit TP: {amelioratedMetrics.tradesHitTp} ({((amelioratedMetrics.tradesHitTp / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
               <div>• Trades that hit SL: {amelioratedMetrics.tradesHitSl} ({((amelioratedMetrics.tradesHitSl / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
               <div>• Trades using actual exit: {amelioratedMetrics.totalTrades - amelioratedMetrics.tradesHitTp - amelioratedMetrics.tradesHitSl} ({(((amelioratedMetrics.totalTrades - amelioratedMetrics.tradesHitTp - amelioratedMetrics.tradesHitSl) / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
             </div>
             
             {/* New Win Rate Calculation Explanation */}
             <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
               <div className="flex items-center gap-2 text-emerald-700 mb-2">
                 <Info className="h-4 w-4" />
                 <span className="text-sm font-medium">New Win Rate Calculation</span>
               </div>
               <div className="text-xs text-emerald-600 space-y-1">
                 <div>• <strong>Formula:</strong> Win Rate = (TP Hits / (TP Hits + SL Hits)) × 100</div>
                 <div>• <strong>Logic:</strong> Only considers trades that hit TP or SL levels</div>
                 <div>• <strong>TP Hits:</strong> All counted as wins (100% win rate)</div>
                 <div>• <strong>SL Hits:</strong> All counted as losses (0% win rate)</div>
                 <div>• <strong>Actual Exits:</strong> Not included in win rate calculation</div>
                 <div>• <strong>Current Result:</strong> {amelioratedMetrics.tradesHitTp} TP hits ÷ {amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl} TP+SL hits = {amelioratedMetrics.winRate.toFixed(2)}%</div>
               </div>
             </div>
             
                           {/* Detailed Win Rate Debug Info - Side by Side */}
              <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
                <div className="text-xs font-semibold text-slate-700 mb-3">🔍 Detailed Win Rate Debug Info - Side by Side Comparison:</div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Original Performance */}
                  <div className="text-xs text-slate-600">
                    <div className="font-semibold text-blue-600 mb-2">📊 Original Performance:</div>
                    <div className="space-y-1">
                      <div>• <strong>Total Trades:</strong> {trades.length}</div>
                      <div>• <strong>Wins:</strong> {trades.filter(t => t.actual_pnl > 0).length} ({((trades.filter(t => t.actual_pnl > 0).length / trades.length) * 100).toFixed(1)}%)</div>
                      <div>• <strong>Losses:</strong> {trades.filter(t => t.actual_pnl < 0).length} ({((trades.filter(t => t.actual_pnl < 0).length / trades.length) * 100).toFixed(1)}%)</div>
                      <div>• <strong>Win Rate:</strong> {(trades.filter(t => t.actual_pnl > 0).length / trades.length * 100).toFixed(2)}%</div>
                      <div>• <strong>Total P&L:</strong> ${trades.reduce((sum, t) => sum + t.actual_pnl, 0).toFixed(2)}</div>
                    </div>
                  </div>
                  
                  {/* Optimized Performance */}
                  <div className="text-xs text-slate-600">
                    <div className="font-semibold text-emerald-600 mb-2">🎯 Optimized Performance:</div>
                    <div className="space-y-1">
                      <div>• <strong>Total Trades:</strong> {amelioratedMetrics.totalTrades}</div>
                      <div>• <strong>TP Hits:</strong> {amelioratedMetrics.tradesHitTp} ({((amelioratedMetrics.tradesHitTp / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                      <div>• <strong>SL Hits:</strong> {amelioratedMetrics.tradesHitSl} ({((amelioratedMetrics.tradesHitSl / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                      <div>• <strong>TP+SL Hits:</strong> {amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl} ({(((amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl) / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                      <div>• <strong>Win Rate:</strong> {amelioratedMetrics.winRate.toFixed(2)}% (TP hits / TP+SL hits)</div>
                      <div>• <strong>Total P&L:</strong> ${amelioratedMetrics.totalPnl.toFixed(2)}</div>
                      <div>• <strong>Actual Exits:</strong> {amelioratedMetrics.totalTrades - amelioratedMetrics.tradesHitTp - amelioratedMetrics.tradesHitSl} ({(((amelioratedMetrics.totalTrades - amelioratedMetrics.tradesHitTp - amelioratedMetrics.tradesHitSl) / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                    </div>
                  </div>
                </div>
                
                {/* Breakdown by Exit Type */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2">📈 Breakdown by Exit Type (Optimized):</div>
                  <div className="grid grid-cols-3 gap-4 text-xs text-slate-600">
                    <div>
                      <div className="font-medium text-green-600">TP Hits:</div>
                      <div>Count: {amelioratedTrades.filter(t => t.hitTp).length}</div>
                      <div>P&L: {amelioratedTrades.filter(t => t.hitTp).reduce((sum, t) => sum + t.amelioratedPnl, 0).toFixed(2)}%</div>
                      <div>Win Rate: 100% (all TP hits are wins)</div>
                    </div>
                    <div>
                      <div className="font-medium text-red-600">SL Hits:</div>
                      <div>Count: {amelioratedTrades.filter(t => t.hitSl).length}</div>
                      <div>P&L: {amelioratedTrades.filter(t => t.hitSl).reduce((sum, t) => sum + t.amelioratedPnl, 0).toFixed(2)}%</div>
                      <div>Win Rate: 0% (all SL hits are losses)</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-600">Actual Exits:</div>
                      <div>Count: {amelioratedTrades.filter(t => !t.hitTp && !t.hitSl).length}</div>
                      <div>Wins: {amelioratedTrades.filter(t => !t.hitTp && !t.hitSl && t.amelioratedPnl > 0).length}</div>
                      <div>Losses: {amelioratedTrades.filter(t => !t.hitTp && !t.hitSl && t.amelioratedPnl < 0).length}</div>
                    </div>
                  </div>
                </div>
                
                {/* Current Settings */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2">⚙️ Current Settings:</div>
                  <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
                    <div><strong>TP Level:</strong> {tpLevel}%</div>
                    <div><strong>SL Level:</strong> {slLevel}%</div>
                  </div>
                </div>
              </div>
           </div>
         )}

         {/* Calculation Verification */}
         {amelioratedMetrics && verificationResults && hasMovedLevels && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Internal Verification */}
             <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-4">
               <div className="flex items-center gap-2 mb-2">
                 {amelioratedMetrics.calculationsMatch ? (
                   <div className="h-5 w-5 text-green-600">✅</div>
                 ) : (
                   <div className="h-5 w-5 text-red-600">❌</div>
                 )}
                 <h4 className="text-sm font-semibold text-slate-700">
                   Internal Verification: {amelioratedMetrics.calculationsMatch ? 'PASSED' : 'FAILED'}
                 </h4>
               </div>
               <div className="text-xs text-slate-600 space-y-1">
                 <div>• Total Trades: {amelioratedMetrics.totalTrades}</div>
                                   <div>• Trades Hit TP: {amelioratedMetrics.tradesHitTp} ({((amelioratedMetrics.tradesHitTp / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                  <div>• Trades Hit SL: {amelioratedMetrics.tradesHitSl} ({((amelioratedMetrics.tradesHitSl / amelioratedMetrics.totalTrades) * 100).toFixed(1)}%)</div>
                  <div>• R:R Ratio: {amelioratedMetrics.avgRR.toFixed(2)}:1 (TP: {tpLevel}% / SL: {slLevel}%)</div>
                  <div>• Win Rate: {amelioratedMetrics.winRate.toFixed(2)}% ({amelioratedMetrics.tradesHitTp} TP hits / {amelioratedMetrics.tradesHitTp + amelioratedMetrics.tradesHitSl} TP+SL hits)</div>
               </div>
             </div>

             {/* Mathematical Verification */}
             <div className="bg-white border border-blue-200/60 rounded-xl shadow-sm p-4">
               <div className="flex items-center gap-2 mb-2">
                 {verificationResults.allMatch ? (
                   <div className="h-5 w-5 text-green-600">✅</div>
                 ) : (
                   <div className="h-5 w-5 text-red-600">❌</div>
                 )}
                 <h4 className="text-sm font-semibold text-slate-700">
                   Mathematical Verification: {verificationResults.allMatch ? 'PASSED' : 'FAILED'}
                 </h4>
               </div>
               <div className="text-xs text-slate-600 space-y-1">
                 <div>• P&L Match: {verificationResults.matches.pnlMatch ? '✅' : '❌'}</div>
                 <div>• Wins Match: {verificationResults.matches.winsMatch ? '✅' : '❌'}</div>
                 <div>• Losses Match: {verificationResults.matches.lossesMatch ? '✅' : '❌'}</div>
                 <div>• Win Rate Match: {verificationResults.matches.winRateMatch ? '✅' : '❌'}</div>
                 
                 <div>• TP Count Match: {verificationResults.matches.tpMatch ? '✅' : '❌'}</div>
                 <div>• SL Count Match: {verificationResults.matches.slMatch ? '✅' : '❌'}</div>
                                   <div className="mt-2 pt-2 border-t border-slate-200">
                    <div>Verification Win Rate: {((verificationResults.verificationResults.tradesHitTp / (verificationResults.verificationResults.tradesHitTp + verificationResults.verificationResults.tradesHitSl)) * 100).toFixed(2)}% (TP hits / TP+SL hits)</div>
                  </div>
               </div>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default ExitAnalysisAmelioration; 