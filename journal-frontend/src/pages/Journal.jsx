// src/components/ProfessionalTradingJournal.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PlusCircle, CheckSquare, DollarSign, CheckCircle, X, Loader2, Info } from 'lucide-react';
import { colors, colorUtils } from '../config/colors';

import { API_BASE_URL } from '../config';
import DarkModeToggle from '../components/DarkModeToggle';
import CustomVariablesManager from '../components/CustomVariablesManager';
import VariableSelector from '../components/VariableSelector';
import CustomTimePicker from '../components/CustomTimePicker';
import { ThemeContext } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useFilter } from '../context/FilterContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { getCurrentUserToken } from '../utils/authUtils';

const initialFormState = {
  symbol: "",
  symbol_category: "",
  custom_symbol: "",
  direction: "long",
  entry_price: "",
  exit_price: "",
  stop_loss: "",
  take_profit: "",
  high_price: "",
  low_price: "",
  quantity: "",
  pnl: "",
  rr: "",
  instrument_type: "crypto",
  contract_size: "",
  risk_amount: "",
  strategy: "",
  setup: "",
  notes: "",
  variables: {},
  commission: '',
  slippage: '',
  open_time: '',
  close_time: '',
  entry_datetime: '',
  entry_screenshot: '',
  exit_screenshot: '',
  extraData: {},
  validationErrors: {},
};


const formatCurrency = (val) => `$${parseFloat(val || 0).toFixed(2)}`;
const formatNumber = (val) => (val == null ? 'N/A' : parseFloat(val).toFixed(2));
const formatPercent = (val) => `${parseFloat(val || 0).toFixed(2)}%`;

// MetricCard component matching Dashboard design
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

// Helper function to calculate percentage of initial balance
const calculatePercentageOfBalance = (amount, initialBalance) => {
  if (!amount || !initialBalance || Number(initialBalance) <= 0) return null;
  const percentage = (Number(amount) / Number(initialBalance)) * 100;
  return percentage.toFixed(2);
};

export default function ProfessionalTradingJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProfile } = useProfile();
  const { filters } = useFilter();
  const { isDarkMode } = React.useContext(ThemeContext);
  
  // Add initial balance state
  const [initialBalance, setInitialBalance] = useState('');
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [saveBalanceStatus, setSaveBalanceStatus] = useState({ success: null, message: '' });
  
  // Feature locked notification state
  const [featureLockedNotification, setFeatureLockedNotification] = useState(null);
  
  const [form, setForm] = useState({
    symbol: '',
    direction: 'long',
    entry_price: '',
    exit_price: '',
    stop_loss: '',
    take_profit: '',
    high_price: '',
    low_price: '',
    quantity: '',
    pnl: '',
    rr: '',
    instrument_type: 'crypto',
    contract_size: '',
    risk_amount: '',
    strategy: '',
    setup: '',
    notes: '',
    variables: {},
    commission: '',
    slippage: '',
    open_time: '',
    close_time: '',
    entry_datetime: '',
    entry_screenshot: '',
    exit_screenshot: '',
    extraData: {},
  });



  const [trades, setTrades] = useState([]);
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [editingTrade, setEditingTrade] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  // Add state for advanced input toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Add state for custom variables
  const [showVariablesManager, setShowVariablesManager] = useState(false);
  const [showVariableSelector, setShowVariableSelector] = useState(false);
  const [selectedCustomVariables, setSelectedCustomVariables] = useState({});
  const [showAllSymbols, setShowAllSymbols] = useState(false);

  // Function to toggle symbol categories visibility
  const toggleSymbolCategories = () => {
    setShowAllSymbols(!showAllSymbols);
  };

  // Load initial balance from backend and localStorage
  useEffect(() => {
    const loadInitialBalance = async () => {
      try {
        const token = getCurrentUserToken();
        if (!token) return;
        
        // Try to get from backend first
        try {
          const balanceResponse = await fetch(`${API_BASE_URL}/journal/initial-balance`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            setInitialBalance(balanceData.initial_balance || 0);
          } else {
            // Fallback to localStorage
            const savedBalance = localStorage.getItem('initialBalance');
            if (savedBalance) {
              const balance = Number(savedBalance).toFixed(2);
              setInitialBalance(balance);
            }
          }
        } catch (error) {
          console.error('Error fetching initial balance:', error);
          // Fallback to localStorage
          const savedBalance = localStorage.getItem('initialBalance');
          if (savedBalance) {
            const balance = Number(savedBalance).toFixed(2);
            setInitialBalance(balance);
          }
        }
      } catch (error) {
        console.error('Error loading initial balance:', error);
      }
    };

    loadInitialBalance();
  }, []);

  // Handle balance change
  const handleBalanceChange = (e) => {
    setInitialBalance(e.target.value);
  };

  // Handle balance save
  const handleSaveBalance = async () => {
    const balance = Number(initialBalance);
    if (isNaN(balance) || balance <= 0) return;
    
    setIsSavingBalance(true);
    setSaveBalanceStatus({ success: null, message: 'Saving balance...' });
    
    try {
      const token = getCurrentUserToken();
      const response = await fetch(`${API_BASE_URL}/journal/initial-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          initial_balance: balance
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Also save to localStorage for backward compatibility
        localStorage.setItem('initialBalance', balance.toString());
        setSaveBalanceStatus({ success: true, message: 'Balance saved!' });
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
        
        setTimeout(() => setSaveBalanceStatus({ success: null, message: '' }), 2000);
      } else {
        setSaveBalanceStatus({ success: false, message: data.error || 'Failed to save balance' });
      }
    } catch (error) {
      console.error('Error saving balance:', error);
      setSaveBalanceStatus({ success: false, message: 'Error saving balance' });
    } finally {
      setIsSavingBalance(false);
    }
  };

  // Handle key press for balance input
  const handleBalanceKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveBalance();
    }
  };

  const resetFormForNewTrade = () => {
    console.log('ACTION: resetFormForNewTrade - Resetting form for new trade');
    setEditingTrade(null);
    setForm({ ...initialFormState, validationErrors: {} });
    setSelectedCustomVariables({});
    setShowVariableSelector(false);
    setShowForm(true);
    
    // Automatically show advanced fields in backtest mode
    if (activeProfile?.mode === 'backtest') {
      setShowAdvanced(true);
    } else {
      setShowAdvanced(false);
    }
  };

  // ─── Pagination State ───────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20); // can be number or 'all'

  // ─── Fetch Trades & Import History ───────────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const token = localStorage.getItem("token");
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      queryParams.append('profile_id', activeProfile.id);
      
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
      if (filters.variables && Object.keys(filters.variables).length > 0) queryParams.append('variables', JSON.stringify(filters.variables));
      
      const url = `${API_BASE_URL}/journal/list?${queryParams.toString()}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch trades');
      }

      const data = await res.json();
      console.log('Fetched trades data:', data);
      
      // Check if data is an object with trades property or direct array
      const tradesData = data.trades || data;
      console.log('Trades data to use:', tradesData);
      
      if (tradesData && tradesData.length > 0) {
        console.log('Sample trade data:', tradesData[0]);
        console.log('Sample trade advanced fields:', {
          high_price: tradesData[0].high_price,
          low_price: tradesData[0].low_price,
          stop_loss: tradesData[0].stop_loss,
          take_profit: tradesData[0].take_profit,
          open_time: tradesData[0].open_time,
          close_time: tradesData[0].close_time
        });
      }
      setTrades(tradesData || []);
      setError('');
      setCurrentPage(1);
    } catch (err) {
      setError('❌ Failed to load trades');
      console.error('Fetch trades error:', err);
    }
  }, [activeProfile, filters]);

  const fetchImportHistory = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/journal/import/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setImportHistory(data);
      setError("");
    } catch (err) {
      setError("❌ Failed to load import history");
      console.error("Fetch import history error:", err);
    }
  }, [activeProfile]);

  const fetchStrategies = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/strategies`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setSavedStrategies(data.strategies);
      } else {
        console.error('Failed to fetch strategies:', data.error);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  }, []);

  useEffect(() => {
    if (activeProfile) {
      fetchTrades();
      fetchImportHistory();
      fetchStrategies();
    }
  }, [activeProfile, filters, fetchTrades, fetchImportHistory, fetchStrategies]);

  // Handle feature locked notification from location state
  useEffect(() => {
    if (location.state?.featureLocked) {
      const featureName = location.state.featureName || 'That feature';
      setFeatureLockedNotification(`${featureName} is currently locked. You're now in the Journal where you can focus on building your trading foundation.`);
      
      // Clear the location state
      navigate('/journal', { replace: true, state: {} });
      
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setFeatureLockedNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state, navigate]);

  // ─── Statistics Calculation ───────────────────────────────────────────────────
  const stats = {
    totalTrades: trades.length,
    winningTrades: trades.filter((t) => parseFloat(t.pnl) > 0).length,
    totalPnL: trades.reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0),
    // Calculate win rate excluding break-even trades
    winRate: trades.length > 0
      ? (trades.filter((t) => parseFloat(t.pnl) > 0).length /
          trades.filter((t) => parseFloat(t.pnl) !== 0).length) *
        100
      : 0,
    avgRR:
      trades.length > 0
        ? trades.reduce((sum, t) => sum + parseFloat(t.rr || 0), 0) /
          trades.length
        : 0,
    avgWin: trades
      .filter((t) => parseFloat(t.pnl) > 0)
      .reduce((sum, t, _, arr) => sum + parseFloat(t.pnl) / arr.length, 0),
    avgLoss: Math.abs(
      trades
        .filter((t) => parseFloat(t.pnl) < 0)
        .reduce((sum, t, _, arr) => sum + parseFloat(t.pnl) / arr.length, 0)
    ),
  };

  // ─── Handle Input Changes & Auto-Calculate P&L & R:R ─────────────────────────
  const handleChange = (e) => {
    console.log(`ACTION: handleChange - Field: ${e.target.name}, Value: ${e.target.value}`);
    const { name, value } = e.target;
    setForm(prevForm => {
      const newForm = { ...prevForm, [name]: value };
      const isBacktest = activeProfile?.mode === 'backtest';
      
      // Auto-sync entry_datetime with open_time
      if (name === 'open_time' && value) {
        newForm.entry_datetime = value;
      }
      
      // Clear any previous validation errors for this field when user starts typing
      if (newForm.validationErrors) {
        delete newForm.validationErrors[name];
      }
      
      // Validate price relationships
      const validationErrors = { ...newForm.validationErrors };
      
      // Parse numeric values - use Number for better precision
      const entryPrice = Number(newForm.entry_price);
      const highPrice = Number(newForm.high_price);
      const lowPrice = Number(newForm.low_price);
      const stopLoss = Number(newForm.stop_loss);
      const takeProfit = Number(newForm.take_profit);
      const direction = newForm.direction;
      
      // Validate high price vs low price
      if (!isNaN(highPrice) && !isNaN(lowPrice) && highPrice <= lowPrice) {
        validationErrors.high_price = "High price must be greater than low price";
        validationErrors.low_price = "Low price must be less than high price";
      } else {
        // Clear errors if validation passes
        delete validationErrors.high_price;
        delete validationErrors.low_price;
      }
      
      // Validate entry price is between high and low
      if (!isNaN(entryPrice)) {
        if (!isNaN(highPrice) && !isNaN(lowPrice)) {
          if (entryPrice > highPrice || entryPrice < lowPrice) {
            validationErrors.entry_price = "Entry price must be between high and low prices";
          } else {
            delete validationErrors.entry_price;
          }
        } else if (!isNaN(highPrice) && entryPrice > highPrice) {
          validationErrors.entry_price = "Entry price cannot be higher than high price";
        } else if (!isNaN(lowPrice) && entryPrice < lowPrice) {
          validationErrors.entry_price = "Entry price cannot be lower than low price";
        } else {
          delete validationErrors.entry_price;
        }
      } else {
        delete validationErrors.entry_price;
      }
      
      // Validate stop loss and take profit based on direction
      if (!isNaN(stopLoss) && !isNaN(takeProfit)) {
        if (direction === 'long') {
          if (takeProfit <= stopLoss) {
            validationErrors.take_profit = "For long trades, take profit must be higher than stop loss";
            validationErrors.stop_loss = "For long trades, stop loss must be lower than take profit";
          } else {
            delete validationErrors.take_profit;
            delete validationErrors.stop_loss;
          }
        } else if (direction === 'short') {
          if (stopLoss <= takeProfit) {
            validationErrors.stop_loss = "For short trades, stop loss must be higher than take profit";
            validationErrors.take_profit = "For short trades, take profit must be lower than stop loss";
          } else {
            delete validationErrors.stop_loss;
            delete validationErrors.take_profit;
          }
        }
      } else {
        // Clear errors if either field is empty
        delete validationErrors.take_profit;
        delete validationErrors.stop_loss;
      }
      
      // Validate stop loss relative to entry price for long trades
      if (direction === 'long' && !isNaN(entryPrice) && !isNaN(stopLoss)) {
        if (stopLoss >= entryPrice) {
          validationErrors.stop_loss = "For long trades, stop loss must be below entry price";
        } else {
          // Only clear if there's no other stop loss error
          if (!validationErrors.stop_loss || validationErrors.stop_loss.includes("take profit")) {
            delete validationErrors.stop_loss;
          }
        }
      }
      
      // Validate stop loss relative to entry price for short trades
      if (direction === 'short' && !isNaN(entryPrice) && !isNaN(stopLoss)) {
        if (stopLoss <= entryPrice) {
          validationErrors.stop_loss = "For short trades, stop loss must be above entry price";
        } else {
          // Only clear if there's no other stop loss error
          if (!validationErrors.stop_loss || validationErrors.stop_loss.includes("take profit")) {
            delete validationErrors.stop_loss;
          }
        }
      }
      
      // Validate take profit relative to entry price for long trades
      if (direction === 'long' && !isNaN(entryPrice) && !isNaN(takeProfit)) {
        if (takeProfit <= entryPrice) {
          validationErrors.take_profit = "For long trades, take profit must be above entry price";
        } else {
          // Only clear if there's no other take profit error
          if (!validationErrors.take_profit || validationErrors.take_profit.includes("stop loss")) {
            delete validationErrors.take_profit;
          }
        }
      }
      
      // Validate take profit relative to entry price for short trades
      if (direction === 'short' && !isNaN(entryPrice) && !isNaN(takeProfit)) {
        if (takeProfit >= entryPrice) {
          validationErrors.take_profit = "For short trades, take profit must be below entry price";
        } else {
          // Only clear if there's no other take profit error
          if (!validationErrors.take_profit || validationErrors.take_profit.includes("stop loss")) {
            delete validationErrors.take_profit;
          }
        }
      }
      
      // Add validation errors to form state
      newForm.validationErrors = validationErrors;
      
      if (isBacktest) {
        // Parse as numbers for calculation - use Number for better precision
        const riskAmount = Number(newForm.risk_amount);
        const rr = Number(newForm.rr);
        const pnl = Number(newForm.pnl);
        // Only allow risk amount to be set by user, do not auto-update it
        // If user changes risk_amount or rr, recalculate pnl
        if ((name === 'risk_amount' || name === 'rr') && !isNaN(riskAmount) && !isNaN(rr)) {
          newForm.pnl = (riskAmount * rr).toFixed(2);
        }
        // If user changes pnl and risk_amount is present, recalculate rr
        if (name === 'pnl' && !isNaN(riskAmount) && riskAmount !== 0 && !isNaN(pnl)) {
          newForm.rr = (pnl / riskAmount).toFixed(2);
        }
        // Do NOT update risk_amount automatically in any case
        return newForm;
      }
      // Default logic for other modes
      const entry = Number(newForm.entry_price);
      const exit = Number(newForm.exit_price);
      const stop_loss = Number(newForm.stop_loss);
      const quantity = Number(newForm.quantity);

      if (!isNaN(entry) && !isNaN(exit) && !isNaN(quantity)) {
        const pnl = (direction === 'long' ? exit - entry : entry - exit) * quantity;
        newForm.pnl = pnl.toFixed(2);

        if (!isNaN(stop_loss)) {
          const risk = Math.abs(entry - stop_loss);
          if (risk > 0) {
            const reward = Math.abs(exit - entry);
            const rr = reward / risk;
            newForm.rr = rr.toFixed(2);
          }
        }
      }
      return newForm;
    });
  };

  // ─── Edit & Delete Handlers ────────────────────────────────────────────────────
   const handleEdit = (trade) => {
    console.log('ACTION: handleEdit - Populating form for trade:', trade);
    setEditingTrade(trade);
    
    // Use open_time for entry_datetime if available, otherwise use trade.date
    const entryDateTime = trade.open_time || trade.date || '';
    
    // Determine symbol category based on the symbol
    const determineSymbolCategory = (symbol) => {
      if (!symbol) return '';
      
      const popularSymbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'ETH/USD', 'XAU/USD', 'SPX', 'AAPL', 'TSLA'];
      if (popularSymbols.includes(symbol)) return 'popular';
      
      const forexMajor = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'];
      if (forexMajor.includes(symbol)) return 'forex_major';
      
      const forexMinor = ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/CHF', 'AUD/JPY', 'AUD/CAD', 'NZD/JPY', 'GBP/CHF'];
      if (forexMinor.includes(symbol)) return 'forex_minor';
      
      const forexExotic = ['USD/TRY', 'USD/ZAR', 'USD/BRL', 'USD/MXN', 'USD/INR', 'USD/RUB', 'EUR/TRY', 'GBP/ZAR'];
      if (forexExotic.includes(symbol)) return 'forex_exotic';
      
      const crypto = ['BTC/USD', 'ETH/USD', 'BNB/USD', 'ADA/USD', 'SOL/USD', 'DOT/USD', 'MATIC/USD', 'LINK/USD', 'AVAX/USD', 'UNI/USD', 'XRP/USD', 'DOGE/USD', 'SHIB/USD', 'LTC/USD', 'BCH/USD'];
      if (crypto.includes(symbol)) return 'crypto';
      
      const commodities = ['XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD', 'WTI/USD', 'BRENT/USD', 'NATURAL_GAS/USD', 'COPPER/USD'];
      if (commodities.includes(symbol)) return 'commodities';
      
      const indices = ['SPX', 'NDX', 'DJI', 'RUT', 'VIX', 'FTSE', 'DAX', 'CAC', 'NIKKEI', 'HANG_SENG'];
      if (indices.includes(symbol)) return 'indices';
      
      const futures = ['ES', 'NQ', 'YM', 'RTY', 'CL', 'GC', 'SI', 'ZB', 'ZN', 'ZC', 'ZS', 'ZW'];
      if (futures.includes(symbol)) return 'futures';
      
      const stocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.A', 'JNJ', 'V', 'JPM', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'ADBE', 'CRM'];
      if (stocks.includes(symbol)) return 'stocks';
      
      return 'custom';
    };
    
    setForm({
      symbol: trade.symbol,
      symbol_category: determineSymbolCategory(trade.symbol),
      custom_symbol: trade.symbol,
      direction: trade.direction,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      stop_loss: trade.stop_loss || '',
      take_profit: trade.take_profit || '',
      high_price: trade.high_price || '',
      low_price: trade.low_price || '',
      quantity: trade.quantity || '',
      pnl: trade.pnl,
      rr: trade.rr,
      instrument_type: trade.instrument_type || 'crypto',
      contract_size: trade.contract_size || '',
      risk_amount: trade.risk_amount || '',
      strategy: trade.strategy || '',
      setup: trade.setup || '',
      notes: trade.notes || '',
      variables: trade.variables || {},
      commission: trade.commission || '',
      slippage: trade.slippage || '',
      open_time: trade.open_time || '',
      close_time: trade.close_time || '',
      entry_datetime: entryDateTime,
      entry_screenshot: trade.entry_screenshot || '',
      exit_screenshot: trade.exit_screenshot || '',
      extraData: trade.extra_data || {},
      validationErrors: {}
    });
    
    // Load custom variables from the trade
    if (trade.variables && typeof trade.variables === 'object') {
      setSelectedCustomVariables(trade.variables);
    } else {
      setSelectedCustomVariables({});
    }
    
    // Check if trade has advanced fields and show advanced input if needed
    const hasAdvancedFields = (trade.stop_loss && trade.stop_loss !== '') || 
                             (trade.take_profit && trade.take_profit !== '') || 
                             (trade.high_price && trade.high_price !== '') || 
                             (trade.low_price && trade.low_price !== '') || 
                             (trade.contract_size && trade.contract_size !== '') || 
                             (trade.risk_amount && trade.risk_amount !== '') || 
                             (trade.strategy && trade.strategy !== '') || 
                             (trade.setup && trade.setup !== '') || 
                             (trade.commission && trade.commission !== '') || 
                             (trade.slippage && trade.slippage !== '') || 
                             (trade.open_time && trade.open_time !== '') || 
                             (trade.close_time && trade.close_time !== '') ||
                             (trade.entry_screenshot && trade.entry_screenshot !== '') || 
                             (trade.exit_screenshot && trade.exit_screenshot !== '') ||
                             (trade.notes && trade.notes !== '') ||
                             (trade.variables && Object.keys(trade.variables).length > 0);
    
    setShowAdvanced(hasAdvancedFields);
    setShowForm(true);
  };


  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this trade?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
                `${API_BASE_URL}/journal/delete/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        await fetchTrades();
        
        // Dispatch custom event to notify other components about trade changes
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
        
        setError("");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete trade");
      }
    } catch (err) {
      setError("❌ Failed to delete trade");
      console.error("Delete trade error:", err);
    }
  };

  // ─── Delete Import Batch ───────────────────────────────────────────────────────
  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm("Delete this import batch and all its trades?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
                `${API_BASE_URL}/journal/import/${batchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchTrades();
        await fetchImportHistory();
        
        // Dispatch custom event to notify other components about trade changes
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
        
        setError("");
      } else {
        setError(data.error || "Failed to delete import batch");
      }
    } catch (err) {
      setError("❌ Failed to delete import batch");
      console.error("Delete batch error:", err);
    }
  };

  // ─── Add / Update Trade ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    console.log('ACTION: handleSubmit - Submitting form with state:', form);
    
    // Check for validation errors
    if (form.validationErrors && Object.keys(form.validationErrors).length > 0) {
      setError("Please fix the validation errors before submitting the trade.");
      return;
    }
    
    setLoading(true);
    setError("");

    // 1) Build payload
    const token = localStorage.getItem("token");
    if (!activeProfile) {
      setError("No active profile selected. Cannot save trade.");
      setLoading(false);
      return;
    }

    const numericFields = [
      'entry_price', 'exit_price', 'stop_loss', 'take_profit', 'high_price', 'low_price',
      'quantity', 'pnl', 'rr', 'contract_size', 'risk_amount', 'commission', 'slippage'
    ];

    const cleanedForm = { ...form };
    numericFields.forEach(field => {
      if (cleanedForm[field] === '') {
        cleanedForm[field] = null;
      }
    });

    const tradeData = { ...cleanedForm, profile_id: activeProfile.id };

    // Use entry_datetime from the form state for the backend payload.
    // If entry_datetime is not set but open_time is, use open_time
    // Preserve local time without timezone conversion
    if (form.entry_datetime) {
      tradeData.date = form.entry_datetime;
    } else if (form.open_time) {
      tradeData.date = form.open_time;
    } else {
      // Default to now if no date is provided - use local time format
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      tradeData.date = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    const payload = {
      ...tradeData,
      symbol: tradeData.symbol === 'CUSTOM' ? tradeData.custom_symbol.toUpperCase() : tradeData.symbol.toUpperCase(),
      entry_price: tradeData.entry_price ? Number(tradeData.entry_price) : 0.0,
      exit_price: tradeData.exit_price ? Number(tradeData.exit_price) : 0.0,
      stop_loss: tradeData.stop_loss && tradeData.stop_loss !== '' ? Number(tradeData.stop_loss) : null,
      take_profit: tradeData.take_profit && tradeData.take_profit !== '' ? Number(tradeData.take_profit) : null,
      high_price: tradeData.high_price && tradeData.high_price !== '' ? Number(tradeData.high_price) : null,
      low_price: tradeData.low_price && tradeData.low_price !== '' ? Number(tradeData.low_price) : null,
      quantity: tradeData.quantity ? Number(tradeData.quantity) : 1.0,
      risk_amount: tradeData.risk_amount ? Number(tradeData.risk_amount) : 1.0,
      pnl: tradeData.pnl ? Number(tradeData.pnl) : 0.0,
      rr: tradeData.rr ? Number(tradeData.rr) : 0.0,
      commission: tradeData.commission && tradeData.commission !== '' ? Number(tradeData.commission) : null,
      slippage: tradeData.slippage && tradeData.slippage !== '' ? Number(tradeData.slippage) : null,
      open_time: tradeData.open_time && tradeData.open_time !== '' ? tradeData.open_time : null,
      close_time: tradeData.close_time && tradeData.close_time !== '' ? tradeData.close_time : null,
      variables: selectedCustomVariables, // Include selected custom variables

    };

    console.log("▶️ Saving trade, payload:", payload);
    console.log("▶️ Selected custom variables:", selectedCustomVariables);
    console.log("▶️ Variables type:", typeof selectedCustomVariables);
    console.log("▶️ Advanced fields in payload:", {
      high_price: payload.high_price,
      low_price: payload.low_price,
      stop_loss: payload.stop_loss,
      take_profit: payload.take_profit,
      open_time: payload.open_time,
      close_time: payload.close_time
    });

    // 2) Send POST or PUT
    const url = editingTrade
            ? `${API_BASE_URL}/journal/${editingTrade.id}`
            : `${API_BASE_URL}/journal/add`;
    const method = editingTrade ? "PUT" : "POST";

    let res, text, data;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      console.log(`⬅️ ${method} ${url} returned status`, res.status);

      // read raw text first, then try JSON
      text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
      console.log("⬅️ Response JSON:", data);

      if (res.ok) {
        // 3) On success, clear form and re‐fetch trades
        setEditingTrade(null);
        setForm({ ...initialFormState, validationErrors: {} });
        setShowForm(false);
        setSelectedCustomVariables({});
        await fetchTrades(); // ← repopulate the table
        
        // Dispatch custom event to notify other components about trade changes
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
        
        setError("");
      } else {
        setError(data.error || `Server returned ${res.status}`);
      }
    } catch (err) {
      console.error("❌ handleSubmit threw:", err);
      setError(err.message || "Failed to save trade");
    } finally {
      setLoading(false);
    }
  };

  // ─── Filter & Search ───────────────────────────────────────────────────────────
  const filteredTrades = trades.filter((trade) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "wins" && parseFloat(trade.pnl) > 0) ||
      (filter === "losses" && parseFloat(trade.pnl) < 0) ||
      (filter === "long" && trade.direction === "long") ||
      (filter === "short" && trade.direction === "short");

    const matchesSearch =
      trade.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ((trade.strategy || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase())) ||
      ((trade.setup || "").toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // ─── Pagination Calculations ───────────────────────────────────────────────────
  const totalTrades = filteredTrades.length;
  const isAll = pageSize === "all";
  const effectivePageSize = isAll ? totalTrades : pageSize;
  const totalPages = isAll ? 1 : Math.ceil(totalTrades / effectivePageSize);
  const startIndex = isAll ? 0 : (currentPage - 1) * effectivePageSize;
  const endIndex = isAll ? totalTrades : startIndex + effectivePageSize;
  const displayedTrades = filteredTrades.slice(startIndex, endIndex);

  const changePageSize = (e) => {
    const value = e.target.value;
    if (value === "all") {
      setPageSize("all");
    } else {
      setPageSize(parseInt(value, 10));
    }
    setCurrentPage(1);
  };



  // Helper to determine if a field should be locked
  // Handle custom variables selection
  const handleCustomVariablesChange = (variables) => {
    setSelectedCustomVariables(variables);
    // Update form variables with selected custom variables
    setForm(prev => ({
      ...prev,
      variables: variables // Replace with the new variables completely
    }));
  };

  const isLocked = (field) => {
    if (!activeProfile) return false; // Guard clause
    const { mode } = activeProfile;

    if (mode === 'backtest') return false;

    if (mode === 'journal_live') {
      // For live journals, only allow editing notes and tags
      return !['notes', 'variables', 'setup', 'emotion', 'mistake'].includes(field);
    }

    if (mode === 'journal' && editingTrade) {
      // For standard journals, lock core fields after the trade is created
      // But allow editing advanced fields for backtest-like functionality
      const lockedFields = [
        'symbol', 'direction', 'entry_price', 'exit_price', 'quantity', 'instrument_type', 'contract_size', 'risk_amount', 'pnl', 'rr'
      ];
      return lockedFields.includes(field);
    }

    return false;
  };



  // Function to check if URL is an image
  const isImageUrl = (url) => {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.includes(ext)) || 
           lowerUrl.includes('/screenshot/') ||
           lowerUrl.includes('image/');
  };

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

  return (
    <div className="flex min-h-screen bg-gradient-reflect dark bg-slate-50">
      <div className="w-full px-8 py-4 relative z-10 bg-slate-50">
        {/* ─── Header ──────────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#040028] mb-2">
              Trading Journal
            </h1>
            <p className="text-[#040028]/60 text-sm">
              Track, analyze, and optimize your trading performance
            </p>
            {activeProfile && (
              <div className="mt-2">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                  activeProfile.mode === 'backtest' 
                    ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                    : activeProfile.mode === 'journal_live'
                    ? 'bg-green-100 text-green-800 border border-green-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}>
                  {activeProfile.mode === 'backtest' ? '🔬 Backtest Mode' : 
                   activeProfile.mode === 'journal_live' ? '📡 Live Journal Mode' : 
                   '📝 Journal Mode'}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-4 items-center">
            {/* Import Input */}
            <label className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer">
              📂 Import
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    const file = e.target.files[0];
                    const formData = new FormData();
                    formData.append("file", file);
                    const token = localStorage.getItem("token");
                                        fetch(`${API_BASE_URL}/journal/import/excel`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      body: formData,
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.imported != null) {
                          fetchTrades();
                          fetchImportHistory();
                          setError("");
                        } else {
                          setError(data.error || "❌ Import failed");
                        }
                      })
                      .catch((err) => {
                        console.error("Import error:", err);
                        setError("❌ Import failed");
                      });
                  }
                }}
              />
            </label>

            {/* Export Button */}
            <button
              onClick={async () => {
                if (exportLoading) return; // Prevent multiple clicks
                
                try {
                  setExportLoading(true);
                  setError(null); // Clear previous errors
                  
                  const token = localStorage.getItem("token");
                  if (!token) {
                    setError("❌ Authentication required. Please log in again.");
                    return;
                  }
                  
                  console.log("Starting export...");
                  const res = await fetch(
                    `${API_BASE_URL}/journal/export`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    }
                  );
                  
                  if (!res.ok) {
                    const errorText = await res.text();
                    console.error("Export failed with status:", res.status, errorText);
                    throw new Error(`Export failed: ${res.status} - ${errorText}`);
                  }
                  
                  const blob = await res.blob();
                  if (blob.size === 0) {
                    throw new Error("Export returned empty file");
                  }
                  
                  console.log("Export successful, file size:", blob.size, "bytes");
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "trading_journal_complete.xlsx";
                  a.click();
                  window.URL.revokeObjectURL(url);
                  
                  // Clear any previous errors
                  setError(null);
                } catch (err) {
                  console.error("Export error:", err);
                  setError(`❌ Export failed: ${err.message}`);
                } finally {
                  setExportLoading(false);
                }
              }}
              disabled={exportLoading}
              className={`bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all duration-200 hover:shadow-lg flex items-center gap-2 ${
                exportLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title="Export all trades with complete data including variables, custom fields, and metadata"
            >
              <span>{exportLoading ? '⏳' : '⬇️'}</span>
              <span>{exportLoading ? 'Exporting...' : 'Export All Data'}</span>
            </button>

            {/* Toggle Form */}
            <button
              onClick={resetFormForNewTrade}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all duration-200 hover:shadow-lg flex items-center gap-2"
            >
              <span className="text-lg">+</span> Add Trade
            </button>
          </div>
        </div>

        {/* Feature Locked Notification */}
        {featureLockedNotification && (
          <div className="mb-6 bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Info className="h-5 w-5 text-orange-400" />
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm text-orange-700 font-medium">
                  {featureLockedNotification}
                </p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setFeatureLockedNotification(null)}
                  className="inline-flex text-orange-400 hover:text-orange-600 focus:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Focus Mode Notice - Keep existing if present */}

        {/* ─── Error Message ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        )}

{/* ─── Account Setup ────────────────────────────────────────────────────────── */}
<div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 mb-8">
          <h2 className="text-2xl font-bold text-[#040028] mb-6">Account Setup</h2>
          
          {/* Initial Balance Section */}
          <div className="bg-slate-50 rounded-xl p-6 border border-blue-200/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500 rounded-lg shadow-sm">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#040028]">Initial Account Balance</h3>
                  <p className="text-sm text-slate-600">Set your starting balance for accurate performance calculations</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg font-bold text-emerald-600">
                  $
                </div>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="10,000.00"
                  value={initialBalance}
                  onChange={handleBalanceChange}
                  onKeyDown={handleBalanceKeyDown}
                  className="w-48 h-12 pl-8 pr-4 text-lg font-bold text-[#040028] placeholder-slate-600 bg-white border-2 border-blue-200/60 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 shadow-sm"
                />
              </div>
              
              <Button 
                type="button"
                size="lg"
                onClick={handleSaveBalance}
                disabled={isSavingBalance || !initialBalance || isNaN(Number(initialBalance)) || Number(initialBalance) <= 0}
                className={`h-12 px-6 font-semibold transition-all duration-300 rounded-lg ${
                  isSavingBalance 
                    ? 'bg-slate-200 text-slate-600 cursor-not-allowed' 
                    : saveBalanceStatus.success === true 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : saveBalanceStatus.success === false 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isSavingBalance ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving</span>
                  </div>
                ) : saveBalanceStatus.success === true ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Saved</span>
                  </div>
                ) : saveBalanceStatus.success === false ? (
                  <div className="flex items-center space-x-2">
                    <X className="w-4 h-4" />
                    <span>Failed</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4" />
                    <span>Save Balance</span>
                  </div>
                )}
              </Button>
            </div>
            
            {/* Status Message */}
            {saveBalanceStatus.message && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                saveBalanceStatus.success === true 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : saveBalanceStatus.success === false 
                    ? 'bg-red-50 text-red-700 border border-red-200' 
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {saveBalanceStatus.success === true ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : saveBalanceStatus.success === false ? (
                    <X className="w-4 h-4" />
                  ) : null}
                  <span>{saveBalanceStatus.message}</span>
                </div>
              </div>
            )}
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>Why set an initial balance?</strong> This value is used to calculate accurate performance metrics including Sharpe ratio, drawdown analysis, and equity curves. Set this to your actual starting account balance for precise analytics.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Custom Variables Manager ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
                          <h2 className="text-2xl font-bold text-[#040028]">Custom Variables</h2>
            <button
              onClick={() => setShowVariablesManager(!showVariablesManager)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              {showVariablesManager ? 'Hide Variables' : 'Manage Variables'}
            </button>
          </div>
          
          {showVariablesManager && (
            <CustomVariablesManager />
          )}
        </div>

        

        {/* ─── Import History ───────────────────────────────────────────────────────── */}
<div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 mb-8">
  <h2 className="text-2xl font-bold text-[#040028] mb-4">
    Import History
  </h2>

  {importHistory.length === 0 ? (
    <p className="text-slate-600">No import history available.</p>
  ) : (
    <table className="w-full mb-4">
      <thead className="bg-white border-b border-blue-200/60">
        <tr>
          <th className="text-left p-3 font-semibold text-[#040028]">
            Filename
          </th>
          <th className="text-left p-3 font-semibold text-[#040028]">
            Imported At
          </th>
          <th className="text-left p-3 font-semibold text-[#040028]">
            # Trades
          </th>
          <th className="text-left p-3 font-semibold text-[#040028]">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {importHistory.map((batch, idx) => (
          <tr
            key={batch.id}
            className={`${
              idx % 2 === 0 ? "bg-white" : "bg-slate-50"
            } border-b border-blue-200/60`}
          >
            <td className="p-3 text-[#040028]">{batch.filename}</td>
            <td className="p-3 text-[#040028]">
              {new Date(batch.imported_at).toLocaleString()}
            </td>
            <td className="p-3 text-[#040028]">{batch.trade_count}</td>
            <td className="p-3 text-right flex justify-end items-center gap-2">
              {/* ─── Download Button ─────────────────────────── */}
              <button
                onClick={async () => {
                  const token = localStorage.getItem("token");
                  if (!token) {
                    alert("You are not logged in. Please log in again.");
                    return;
                  }

                  try {
                    const res = await fetch(
                                            `${API_BASE_URL}/journal/import/file/${batch.id}`,
                      {
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                      }
                    );

                    if (!res.ok) {
                      // Read JSON body if possible to see backend error
                      let errMsg = `HTTP ${res.status}`;
                      try {
                        const body = await res.json();
                        if (body.error) {
                          errMsg = body.error;
                        }
                      } catch (_) {
                        // ignore if response isn't JSON
                      }
                      throw new Error(errMsg);
                    }

                    // If backend responded with a file blob:
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = batch.filename;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error("Download failed:", err);
                    alert(`Failed to download file:\n${err.message}`);
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200"
              >
                Download
              </button>

              {/* ─── Delete Button ────────────────────────────── */}
              <button
                onClick={() => handleDeleteBatch(batch.id)}
                className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>


        {/* ─── Trade Form ───────────────────────────────────────────────────────────── */}
        {showForm && (
          <>
            {/* Modal Backdrop */}
            <div className="fixed inset-0 bg-black bg-opacity-40 z-40" onClick={() => { setShowForm(false); setEditingTrade(null); }} />
            {/* Modal Content */}
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="bg-white rounded-xl shadow-xl border border-blue-200/60 p-8 mb-8 max-w-4xl w-full relative max-h-[90vh] overflow-y-auto">
                <button
                  className="absolute top-4 right-4 text-[#040028] text-2xl font-bold hover:text-red-500 focus:outline-none"
                  onClick={() => { setShowForm(false); setEditingTrade(null); }}
                >
                  &times;
                </button>
                <h2 className="text-2xl font-bold text-[#040028] mb-6">
                  {editingTrade ? "Edit Trade" : "Add New Trade"}
                </h2>
                <form className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Entry Date & Time field is now hidden and synced with Open Time */}
                    <div className="col-span-1">
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Symbol Category
                      </label>
                      <select
                        name="symbol_category"
                        value={form.symbol_category || ''}
                        onChange={(e) => {
                          setForm(prev => ({
                            ...prev,
                            symbol_category: e.target.value,
                            symbol: '' // Reset symbol when category changes
                          }));
                        }}
                        className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        disabled={isLocked('symbol_category')}
                      >
                        <option value="">Select a category</option>
                        <option value="popular">⭐ Popular</option>
                        <option value="forex_major">📈 Forex - Major Pairs</option>
                        <option value="forex_minor">📊 Forex - Minor Pairs</option>
                        <option value="forex_exotic">🌍 Forex - Exotic Pairs</option>
                        <option value="crypto">₿ Cryptocurrencies</option>
                        <option value="commodities">🪙 Commodities</option>
                        <option value="indices">📊 Stock Indices</option>
                        <option value="futures">📈 Futures</option>
                        <option value="stocks">🏢 Major Stocks</option>
                        <option value="custom">🔧 Custom/Other</option>
                      </select>
                    </div>

                    {/* Symbol Selection - shown when category is selected */}
                    {form.symbol_category && form.symbol_category !== 'custom' && (
                      <div className="col-span-1">
                        <label className="block text-sm font-semibold text-[#040028] mb-2">
                          Symbol
                        </label>
                        <select
                          name="symbol"
                          value={form.symbol}
                          onChange={handleChange}
                          className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          disabled={isLocked('symbol')}
                        >
                          <option value="">Select a symbol</option>
                          {form.symbol_category === 'popular' && (
                            <>
                              <option value="EUR/USD">EUR/USD</option>
                              <option value="GBP/USD">GBP/USD</option>
                              <option value="USD/JPY">USD/JPY</option>
                              <option value="BTC/USD">BTC/USD</option>
                              <option value="ETH/USD">ETH/USD</option>
                              <option value="XAU/USD">XAU/USD</option>
                              <option value="SPX">SPX</option>
                              <option value="AAPL">AAPL</option>
                              <option value="TSLA">TSLA</option>
                            </>
                          )}
                          {form.symbol_category === 'forex_major' && (
                            <>
                              <option value="EUR/USD">EUR/USD</option>
                              <option value="GBP/USD">GBP/USD</option>
                              <option value="USD/JPY">USD/JPY</option>
                              <option value="USD/CHF">USD/CHF</option>
                              <option value="AUD/USD">AUD/USD</option>
                              <option value="USD/CAD">USD/CAD</option>
                              <option value="NZD/USD">NZD/USD</option>
                            </>
                          )}
                          {form.symbol_category === 'forex_minor' && (
                            <>
                              <option value="EUR/GBP">EUR/GBP</option>
                              <option value="EUR/JPY">EUR/JPY</option>
                              <option value="GBP/JPY">GBP/JPY</option>
                              <option value="EUR/CHF">EUR/CHF</option>
                              <option value="AUD/JPY">AUD/JPY</option>
                              <option value="AUD/CAD">AUD/CAD</option>
                              <option value="NZD/JPY">NZD/JPY</option>
                              <option value="GBP/CHF">GBP/CHF</option>
                            </>
                          )}
                          {form.symbol_category === 'forex_exotic' && (
                            <>
                              <option value="USD/TRY">USD/TRY</option>
                              <option value="USD/ZAR">USD/ZAR</option>
                              <option value="USD/BRL">USD/BRL</option>
                              <option value="USD/MXN">USD/MXN</option>
                              <option value="USD/INR">USD/INR</option>
                              <option value="USD/RUB">USD/RUB</option>
                              <option value="EUR/TRY">EUR/TRY</option>
                              <option value="GBP/ZAR">GBP/ZAR</option>
                            </>
                          )}
                          {form.symbol_category === 'crypto' && (
                            <>
                              <option value="BTC/USD">BTC/USD</option>
                              <option value="ETH/USD">ETH/USD</option>
                              <option value="BNB/USD">BNB/USD</option>
                              <option value="ADA/USD">ADA/USD</option>
                              <option value="SOL/USD">SOL/USD</option>
                              <option value="DOT/USD">DOT/USD</option>
                              <option value="MATIC/USD">MATIC/USD</option>
                              <option value="LINK/USD">LINK/USD</option>
                              <option value="AVAX/USD">AVAX/USD</option>
                              <option value="UNI/USD">UNI/USD</option>
                              <option value="XRP/USD">XRP/USD</option>
                              <option value="DOGE/USD">DOGE/USD</option>
                              <option value="SHIB/USD">SHIB/USD</option>
                              <option value="LTC/USD">LTC/USD</option>
                              <option value="BCH/USD">BCH/USD</option>
                            </>
                          )}
                          {form.symbol_category === 'commodities' && (
                            <>
                              <option value="XAU/USD">XAU/USD</option>
                              <option value="XAG/USD">XAG/USD</option>
                              <option value="XPT/USD">XPT/USD</option>
                              <option value="XPD/USD">XPD/USD</option>
                              <option value="WTI/USD">WTI/USD</option>
                              <option value="BRENT/USD">BRENT/USD</option>
                              <option value="NATURAL_GAS/USD">NATURAL_GAS/USD</option>
                              <option value="COPPER/USD">COPPER/USD</option>
                            </>
                          )}
                          {form.symbol_category === 'indices' && (
                            <>
                              <option value="SPX">SPX</option>
                              <option value="NDX">NDX</option>
                              <option value="DJI">DJI</option>
                              <option value="RUT">RUT</option>
                              <option value="VIX">VIX</option>
                              <option value="FTSE">FTSE</option>
                              <option value="DAX">DAX</option>
                              <option value="CAC">CAC</option>
                              <option value="NIKKEI">NIKKEI</option>
                              <option value="HANG_SENG">HANG_SENG</option>
                            </>
                          )}
                          {form.symbol_category === 'futures' && (
                            <>
                              <option value="ES">ES</option>
                              <option value="NQ">NQ</option>
                              <option value="YM">YM</option>
                              <option value="RTY">RTY</option>
                              <option value="CL">CL</option>
                              <option value="GC">GC</option>
                              <option value="SI">SI</option>
                              <option value="ZB">ZB</option>
                              <option value="ZN">ZN</option>
                              <option value="ZC">ZC</option>
                              <option value="ZS">ZS</option>
                              <option value="ZW">ZW</option>
                            </>
                          )}
                          {form.symbol_category === 'stocks' && (
                            <>
                              <option value="AAPL">AAPL</option>
                              <option value="MSFT">MSFT</option>
                              <option value="GOOGL">GOOGL</option>
                              <option value="AMZN">AMZN</option>
                              <option value="TSLA">TSLA</option>
                              <option value="META">META</option>
                              <option value="NVDA">NVDA</option>
                              <option value="BRK.A">BRK.A</option>
                              <option value="JNJ">JNJ</option>
                              <option value="V">V</option>
                              <option value="JPM">JPM</option>
                              <option value="PG">PG</option>
                              <option value="UNH">UNH</option>
                              <option value="HD">HD</option>
                              <option value="MA">MA</option>
                              <option value="DIS">DIS</option>
                              <option value="PYPL">PYPL</option>
                              <option value="ADBE">ADBE</option>
                              <option value="CRM">CRM</option>
                            </>
                          )}
                        </select>
                      </div>
                    )}

                    {/* Direction */}
                    <div>
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Direction*
                      </label>
                      <select
                        name="direction"
                        value={form.direction}
                        onChange={handleChange}
                        className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                        disabled={isLocked('direction')}
                      >
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </div>

                    {/* Instrument Type - Hidden in backtest mode */}
                    {activeProfile?.mode !== 'backtest' && (
                      <div>
                        <label className="block text-sm font-semibold text-[#040028] mb-2">
                          Instrument Type*
                        </label>
                        <select
                          name="instrument_type"
                          value={form.instrument_type}
                          onChange={handleChange}
                          className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          disabled={isLocked('instrument_type')}
                        >
                          <option value="crypto">Crypto</option>
                          <option value="stock">Stock</option>
                          <option value="forex">Forex</option>
                          <option value="future">Future</option>
                        </select>
                      </div>
                    )}

                    {/* Custom Symbol Input - shown when CUSTOM is selected */}
                    {form.symbol === 'CUSTOM' && (
                      <div className="col-span-1">
                        <label className="block text-sm font-semibold text-[#040028] mb-2">
                          Custom Symbol
                        </label>
                        <input
                          name="custom_symbol"
                          value={form.custom_symbol || ''}
                          onChange={handleChange}
                          placeholder="Enter your custom symbol (e.g., BTCUSDT, EURUSD)"
                          className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          disabled={isLocked('custom_symbol')}
                        />
                      </div>
                    )}

                    {/* Quantity - Hidden in backtest mode */}
                    {activeProfile?.mode !== 'backtest' && (
                      <div>
                        <label className="block text-sm font-semibold text-[#040028] mb-2">
                          Quantity*
                        </label>
                        <input
                          name="quantity"
                          value={form.quantity}
                          onChange={handleChange}
                          type="number"
                          step="any"
                          className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          required
                          disabled={isLocked('quantity')}
                        />
                      </div>
                    )}

                    {/* Contract Size (only for forex/future) */}
                    {(form.instrument_type === "forex" ||
                      form.instrument_type === "future") && (
                      <div>
                        <label className="block text-sm font-semibold text-[#040028] mb-2">
                          {form.instrument_type === "forex"
                            ? "Lot Size (e.g., 100000)"
                            : "Contract Size"}
                        </label>
                        <input
                          name="contract_size"
                          value={form.contract_size}
                          onChange={handleChange}
                          type="number"
                          step="any"
                          className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          required
                          disabled={isLocked('contract_size')}
                        />
                      </div>
                    )}

                    {/* Risk Amount */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-sm font-semibold text-[#040028]">
                          Risk Amount ($)*
                        </label>
                        
                      </div>
                                              <input
                          name="risk_amount"
                          value={form.risk_amount}
                          onChange={handleChange}
                          type="number"
                          step="any"
                          className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          required
                          disabled={isLocked('risk_amount')}
                        />
                      {initialBalance && form.risk_amount && (
                        <div className="mt-1">
                          <span className="text-xs text-slate-600">
                            {calculatePercentageOfBalance(form.risk_amount, initialBalance)}% of balance
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Entry Price */}
                    <div>
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Entry Price*
                      </label>
                                              <input
                          name="entry_price"
                          value={form.entry_price}
                          onChange={handleChange}
                          type="number"
                          step="any"
                          className={`w-full p-3 border bg-white rounded-lg focus:ring-2 focus:border-blue-500 text-[#040028] transition-all duration-200 ${
                            form.validationErrors?.entry_price 
                              ? 'border-red-500 focus:ring-red-500' 
                              : 'border-blue-200/60 focus:ring-blue-500 focus:border-blue-500'
                          }`}
                          required
                          disabled={isLocked('entry_price')}
                        />
                      {form.validationErrors?.entry_price && (
                        <p className="mt-1 text-sm text-red-600">{form.validationErrors.entry_price}</p>
                      )}
                    </div>

                    {/* Exit Price */}
                    <div>
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Exit Price*
                      </label>
                                              <input
                          name="exit_price"
                          value={form.exit_price}
                          onChange={handleChange}
                          type="number"
                          step="any"
                          className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          required
                          disabled={isLocked('exit_price')}
                        />
                    </div>

                    {/* P&L (read-only) */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-sm font-semibold text-[#040028]">
                          P&L
                        </label>
                        
                      </div>
                      <input
                        name="pnl"
                        value={form.pnl}
                        onChange={handleChange}
                        type="number"
                        step="any"
                        className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                        disabled={isLocked('pnl')}
                      />
                      {initialBalance && form.pnl && (
                        <div className="mt-1">
                          <span className="text-xs text-slate-600">
                            {calculatePercentageOfBalance(form.pnl, initialBalance)}% of balance
                          </span>
                        </div>
                      )}
                    </div>
<div>
  <label className="block text-sm font-semibold text-[#040028] mb-2">
    Risk:Reward
  </label>
  <input
    name="rr"
    value={form.rr}
    onChange={handleChange}
    type="number"
    step="any"
    className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
    disabled={isLocked('rr')}
  />
</div>
                  </div>

                  {/* Strategy / Setup */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Strategy
                      </label>
                      <select
                        name="strategy"
                        value={form.strategy}
                        onChange={handleChange}
                        className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                        disabled={isLocked('strategy')}
                      >
                        <option value="">Select a Strategy</option>
                        {savedStrategies.map((strategy) => (
                          <option key={strategy.id} value={strategy.name}>
                            {strategy.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Setup
                      </label>
                      <input
                        name="setup"
                        value={form.setup}
                        onChange={handleChange}
                        className="w-full p-3 border bg-white border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                        disabled={isLocked('setup')}
                      />
                    </div>
                  </div>

                  {/* Custom Variables */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-[#040028] mb-2">
                        Custom Variables
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowVariableSelector(!showVariableSelector)}
                        className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        <CheckSquare className="w-4 h-4 mr-1" />
                        {showVariableSelector ? 'Hide Selector' : 'Select Variables'}
                      </button>
                    </div>
                    
                    {showVariableSelector && (
                      <div className="border border-blue-200/60 rounded-lg p-4 bg-white">
                        <VariableSelector
                          onSelectionChange={handleCustomVariablesChange}
                          initialSelections={selectedCustomVariables}
                        />
                      </div>
                    )}
                    
                    {/* Display selected variables */}
                    {Object.keys(selectedCustomVariables).length > 0 && (
                      <div className="bg-white border border-blue-200/60 rounded-lg p-3">
                        <h4 className="text-sm font-semibold text-[#040028] mb-2">Selected Variables:</h4>
                        <div className="space-y-2">
                          {Object.entries(selectedCustomVariables).map(([varName, values]) => (
                            <div key={varName} className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[#040028] capitalize">{varName}:</span>
                              <div className="flex flex-wrap gap-1">
                                {values.map((value, index) => (
                                  <span
                                    key={index}
                                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                                  >
                                    {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Advanced Input Toggle - always visible after simple fields */}
                  <div className="my-4">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-white text-[#040028] border border-blue-200/60 hover:bg-blue-50 font-medium transition-all duration-200"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      {showAdvanced ? 'Hide Advanced Input' : 'Show Advanced Input'}
                    </button>
                  </div>
                  {/* Advanced Input Section */}
                  {showAdvanced && (
                    <div className="space-y-6 border border-blue-200/60 rounded-lg p-4 bg-white">
                      {/* High Price, Low Price, Take Profit, Stop Loss */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* High Price */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            High Price
                          </label>
                          <input
                            name="high_price"
                            value={form.high_price}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className={`w-full p-3 border bg-white rounded-lg focus:ring-2 focus:border-blue-500 text-[#040028] transition-all duration-200 ${
                              form.validationErrors?.high_price 
                                ? 'border-red-500 focus:ring-red-500' 
                                : 'border-blue-200/60 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            disabled={isLocked('high_price')}
                          />
                          {form.validationErrors?.high_price && (
                            <p className="mt-1 text-sm text-red-600">{form.validationErrors.high_price}</p>
                          )}
                        </div>
                        {/* Low Price */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Low Price
                          </label>
                          <input
                            name="low_price"
                            value={form.low_price}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className={`w-full p-3 border bg-white rounded-lg focus:ring-2 focus:border-blue-500 text-[#040028] transition-all duration-200 ${
                              form.validationErrors?.low_price 
                                ? 'border-red-500 focus:ring-red-500' 
                                : 'border-blue-200/60 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            disabled={isLocked('low_price')}
                          />
                          {form.validationErrors?.low_price && (
                            <p className="mt-1 text-sm text-red-600">{form.validationErrors.low_price}</p>
                          )}
                        </div>
                        {/* Take Profit */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Take Profit
                          </label>
                          <input
                            name="take_profit"
                            value={form.take_profit}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className={`w-full p-3 border bg-white rounded-lg focus:ring-2 focus:border-blue-500 text-[#040028] transition-all duration-200 ${
                              form.validationErrors?.take_profit 
                                ? 'border-red-500 focus:ring-red-500' 
                                : 'border-blue-200/60 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            disabled={isLocked('take_profit')}
                          />
                          {form.validationErrors?.take_profit && (
                            <p className="mt-1 text-sm text-red-600">{form.validationErrors.take_profit}</p>
                          )}
                        </div>
                        {/* Stop Loss */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Stop Loss
                          </label>
                          <input
                            name="stop_loss"
                            value={form.stop_loss}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className={`w-full p-3 border bg-white rounded-lg focus:ring-2 focus:border-blue-500 text-[#040028] transition-all duration-200 ${
                              form.validationErrors?.stop_loss 
                                ? 'border-red-500 focus:ring-red-500' 
                                : 'border-blue-200/60 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            disabled={isLocked('stop_loss')}
                          />
                          {form.validationErrors?.stop_loss && (
                            <p className="mt-1 text-sm text-red-600">{form.validationErrors.stop_loss}</p>
                          )}
                        </div>
                      </div>


                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* Commission */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Commission
                          </label>
                          <input
                            name="commission"
                            value={form.commission}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                            disabled={isLocked('commission')}
                          />
                        </div>
                        {/* Slippage */}
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Slippage
                          </label>
                          <input
                            name="slippage"
                            value={form.slippage}
                            onChange={handleChange}
                            type="number"
                            step="any"
                            className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                            disabled={isLocked('slippage')}
                          />
                        </div>
                        {/* Open Time */}
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Open Time
                          </label>
                          <CustomTimePicker
                            name="open_time"
                            value={form.open_time}
                            onChange={handleChange}
                            disabled={isLocked('open_time')}
                            placeholder="Select open date and time"
                          />
                        </div>
                        {/* Close Time */}
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Close Time
                          </label>
                          <CustomTimePicker
                            name="close_time"
                            value={form.close_time}
                            onChange={handleChange}
                            disabled={isLocked('close_time')}
                            placeholder="Select close date and time"
                          />
                        </div>
                      </div>
                      

                      
                      <div>
                        <label className="block text-sm font-semibold text-theme-primary mb-2">
                          Notes
                        </label>
                        <textarea
                          name="notes"
                          value={form.notes}
                          onChange={handleChange}
                          placeholder="Add your trading notes, observations, and lessons learned..."
                          rows="4"
                          className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                          disabled={isLocked('notes')}
                        />
                      </div>
                      
                      {/* Screenshot Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Entry Screenshot
                          </label>
                          <div className="space-y-2">
                            {/* URL Input */}
                            <input
                              name="entry_screenshot"
                              value={form.entry_screenshot}
                              onChange={handleChange}
                              type="url"
                              placeholder="https://example.com/screenshot1.jpg"
                              className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                              disabled={isLocked('entry_screenshot')}
                            />

                            
                                                        {/* Image Preview */}
                            {form.entry_screenshot && isImageUrl(form.entry_screenshot) && (
                              <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-blue-700">
                                      <span className="text-sm font-medium">📷 Image Preview</span>
                                    </div>
                                      <div className="mt-2">
                                        <img 
                                          src={getAbsoluteUrl(form.entry_screenshot)} 
                                          alt="Entry screenshot preview" 
                                          className="max-w-full h-32 object-contain rounded border"
                                          onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'block';
                                          }}
                                        />
                                        <div className="hidden text-xs text-gray-500 mt-1">
                                          Image preview not available
                                        </div>
                                      </div>
                                  </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-semibold text-[#040028] mb-2">
                            Exit Screenshot
                          </label>
                          <div className="space-y-2">
                            {/* URL Input */}
                            <input
                              name="exit_screenshot"
                              value={form.exit_screenshot}
                              onChange={handleChange}
                              type="url"
                              placeholder="https://example.com/screenshot2.jpg"
                              className="w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200"
                              disabled={isLocked('exit_screenshot')}
                            />

                            
                                                        {/* Image Preview */}
                            {form.exit_screenshot && isImageUrl(form.exit_screenshot) && (
                              <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-blue-700">
                                      <span className="text-sm font-medium">📷 Image Preview</span>
                                    </div>
                                      <div className="mt-2">
                                        <img 
                                          src={getAbsoluteUrl(form.exit_screenshot)} 
                                          alt="Exit screenshot preview" 
                                          className="max-w-full h-32 object-contain rounded border"
                                          onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'block';
                                          }}
                                        />
                                        <div className="hidden text-xs text-gray-500 mt-1">
                                          Image preview not available
                                        </div>
                                      </div>
                                  </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading}
                      className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-6 py-2 rounded-lg font-medium text-sm shadow-md transition-all duration-200 hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                      {loading
                        ? "Saving..."
                        : editingTrade
                        ? "Update Trade"
                        : "Save Trade"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditingTrade(null);
                        setForm({ ...initialFormState, validationErrors: {} });
                        setSelectedCustomVariables({});

                      }}
                      className="bg-white hover:bg-blue-50 text-[#040028] px-6 py-2 rounded-lg font-medium text-sm border border-blue-200/60 transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* ─── Filters & Search ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6 mb-4">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {["all", "wins", "losses", "long", "short"].map((filterType) => (
                <button
                  key={filterType}
                  onClick={() => setFilter(filterType)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 capitalize ${
                    filter === filterType
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-white text-[#040028] hover:bg-blue-50 border border-blue-200/60"
                  }`}
                >
                  {filterType}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-600">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search trades..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64 text-[#040028] placeholder-slate-600 transition-all duration-200"
              />
            </div>
          </div>
        </div>

        {/* ─── Page Size Selector ─────────────────────────────────────────────────────── */}
        <div className="flex items-center mb-4 space-x-2">
          <label className="text-sm font-medium text-theme-primary">
            Rows per page:
          </label>
          <select
            value={pageSize}
            onChange={changePageSize}
            className="pl-3 pr-10 py-2 bg-theme-secondary border border-theme-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-theme-primary"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* ─── Trade History Table ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 overflow-hidden">
          <div className="p-6 border-b border-blue-200/60">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#040028]">
                Trade History
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white border-b border-blue-200/60">
                <tr>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Date
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Symbol
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Direction
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Entry
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Exit
                  </th>
                  {activeProfile?.mode !== 'backtest' && (
                    <th className="text-left p-4 font-semibold text-[#040028]">
                      Qty
                    </th>
                  )}
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    P&L
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    R:R
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    High
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Low
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    SL
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    TP
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Open
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Close
                  </th>
                  {activeProfile?.mode !== 'backtest' && (
                    <th className="text-left p-4 font-semibold text-[#040028]">
                      Instrument
                    </th>
                  )}
                  {activeProfile?.mode === 'backtest' && (
                    <th className="text-left p-4 font-semibold text-[#040028]">
                      Details
                    </th>
                  )}
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Screenshots
                  </th>
                  <th className="text-left p-4 font-semibold text-[#040028]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedTrades.map((trade, index) => (
                  <tr
                    key={trade.id}
                    className={`border-b border-blue-200/60 hover:bg-blue-50 transition-all duration-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50"
                    }`}
                  >
                    <td className="p-4 text-[#040028]">
                      {new Date(trade.date).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-[#040028]">
                        {trade.symbol}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {trade.direction === "long" ? (
                          <span className="text-green-600 font-bold">↗</span>
                        ) : (
                          <span className="text-red-600 font-bold">↘</span>
                        )}
                        <span
                          className={`font-medium capitalize ${
                            trade.direction === "long"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {trade.direction}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-[#040028]">
                      {formatCurrency(trade.entry_price)}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {formatCurrency(trade.exit_price)}
                    </td>
                    {activeProfile?.mode !== 'backtest' && (
                      <td className="p-4 text-[#040028]">
                        {trade.quantity || "N/A"}
                      </td>
                    )}
                    <td className="p-4">
                      <span
                        className={`font-bold ${
                          parseFloat(trade.pnl) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(trade.pnl)}
                      </span>
                    </td>
                    <td className="p-4 text-[#040028]">
                      {formatNumber(trade.rr)}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.high_price ? formatCurrency(trade.high_price) : '-'}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.low_price ? formatCurrency(trade.low_price) : '-'}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.stop_loss ? formatCurrency(trade.stop_loss) : '-'}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.take_profit ? formatCurrency(trade.take_profit) : '-'}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.open_time ? new Date(trade.open_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </td>
                    <td className="p-4 text-[#040028]">
                      {trade.close_time ? new Date(trade.close_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </td>
                    {activeProfile?.mode !== 'backtest' && (
                      <td className="p-4 text-[#040028] capitalize">
                        {trade.instrument_type}
                      </td>
                    )}
                    {activeProfile?.mode === 'backtest' && (
                      <td className="p-4">
                        <div className="text-xs space-y-1">
                          {trade.strategy && (
                            <div><strong>Strategy:</strong> {trade.strategy}</div>
                          )}
                          {trade.setup && (
                            <div><strong>Setup:</strong> {trade.setup}</div>
                          )}
                          {trade.commission && (
                            <div><strong>Commission:</strong> {formatCurrency(trade.commission)}</div>
                          )}
                          {trade.slippage && (
                            <div><strong>Slippage:</strong> {formatCurrency(trade.slippage)}</div>
                          )}
                          {trade.notes && (
                            <div><strong>Notes:</strong> {trade.notes.substring(0, 50)}{trade.notes.length > 50 ? '...' : ''}</div>
                          )}
                          {trade.variables && Object.keys(trade.variables).length > 0 && (
                            <div><strong>Variables:</strong> {Object.keys(trade.variables).join(', ')}</div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="p-4">
                      <div className="flex gap-2">
                        {trade.entry_screenshot && (
                          <a
                            href={getAbsoluteUrl(trade.entry_screenshot)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="View Entry Screenshot"
                          >
                            📷 Entry
                          </a>
                        )}
                        {trade.exit_screenshot && (
                          <a
                            href={getAbsoluteUrl(trade.exit_screenshot)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="View Exit Screenshot"
                          >
                            📷 Exit
                          </a>
                        )}
                        {!trade.entry_screenshot && !trade.exit_screenshot && (
                          <span className="text-slate-600 text-sm">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(trade)}
                          className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-all duration-200"
                        >
                          <span className="text-sm">✏️</span>
                        </button>
                        <button
                          onClick={() => handleDelete(trade.id)}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-all duration-200"
                        >
                          <span className="text-sm">🗑️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={activeProfile?.mode === 'backtest' ? 16 : 17} className="text-center py-12">
                    <div className="text-slate-600 mb-2">
                      <span className="text-6xl">📊</span>
                    </div>
                    <p className="text-[#040028] text-lg">No trades found</p>
                    <p className="text-slate-600">
                      Add your first trade to get started
                    </p>
                  </td>
                </tr>
              )}
            </table>
          </div>

          {/* ─── Pagination Controls ─────────────────────────────────────────────────── */}
          {!isAll && totalTrades > effectivePageSize && (
            <div className="flex items-center justify-between bg-white border-t border-blue-200/60 p-4">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg ${
                  currentPage === 1
                    ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Previous
              </button>

              <span className="text-[#040028]">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg ${
                  currentPage === totalPages
                    ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
