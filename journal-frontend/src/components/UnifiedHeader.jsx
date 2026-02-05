import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Brain, DollarSign, TrendingUp, CheckCircle, X, Loader2, RefreshCw, User } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import TalariaLogo from './TalariaLogo';
import { API_BASE_URL } from '../config';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';

export default function UnifiedHeader() {
  const { activeProfile } = useProfile();
  const { user } = useAuth();
  
  // Balance state
  const [initialBalance, setInitialBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [trades, setTrades] = useState([]);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [timeframe, setTimeframe] = useState('all');

  // Function to load balance data
  const loadBalanceData = useCallback(async () => {
    try {
      setIsLoadingBalance(true);
      
      const token = localStorage.getItem('token');
      if (!token || !activeProfile) return;
      
      // Get initial balance from backend
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
            const balance = parseFloat(savedBalance).toFixed(2);
            setInitialBalance(balance);
          }
        }
      } catch (error) {
        console.error('Error fetching initial balance:', error);
        // Fallback to localStorage
        const savedBalance = localStorage.getItem('initialBalance');
        if (savedBalance) {
          const balance = parseFloat(savedBalance).toFixed(2);
          setInitialBalance(balance);
        }
      }
      
      // Fetch trades for PnL calculation
      const response = await fetch(`${API_BASE_URL}/journal/list?profile_id=${activeProfile.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const tradesData = await response.json();
        setTrades(tradesData || []);
      }
    } catch (error) {
      console.error('Error loading balance data:', error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [activeProfile]);

  // Load initial balance and trades from localStorage and API
  useEffect(() => {
    loadBalanceData();

    // Listen for balance updates from Journal component
    const handleBalanceUpdate = () => {
      loadBalanceData();
    };

    // Listen for custom event when balance is updated
    window.addEventListener('balanceUpdated', handleBalanceUpdate);
    
    // Listen for storage changes (when localStorage is updated)
    const handleStorageChange = (e) => {
      if (e.key === 'initialBalance') {
        loadBalanceData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);

    // Set up periodic refresh every 30 seconds to keep balance current
    const intervalId = setInterval(() => {
      loadBalanceData();
    }, 30000);

    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, [activeProfile, loadBalanceData]); // Add activeProfile as dependency

  // Calculate current balance (initial balance + net PnL)
  useEffect(() => {
    console.log('Balance calculation debug:', {
      initialBalance,
      tradesCount: trades.length,
      trades: trades.slice(0, 3) // Show first 3 trades for debugging
    });
    
    if (initialBalance && trades.length >= 0) {
      const netPnL = trades.reduce((sum, trade) => {
        const pnl = parseFloat(trade.pnl) || 0;
        console.log(`Trade PnL: ${trade.symbol} - ${pnl}`);
        return sum + pnl;
      }, 0);
      
      const current = parseFloat(initialBalance) + netPnL;
      console.log('Balance calculation:', {
        initialBalance: parseFloat(initialBalance),
        netPnL,
        currentBalance: current
      });
      
      setCurrentBalance(current);
    } else if (initialBalance) {
      setCurrentBalance(parseFloat(initialBalance));
    }
  }, [initialBalance, trades]);

  // Format currency helper
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Handle manual refresh
  const handleRefreshBalance = () => {
    loadBalanceData();
  };

  return (
    <div className="relative bg-gradient-to-br from-blue-50 via-white to-blue-50/30 border-b border-slate-200/60 shadow-lg shadow-slate-100/50 backdrop-blur-sm">
      {/* Subtle background pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10"></div>
      </div>
      
      <div className="relative max-w-full mx-auto px-8 py-6">
        {/* Main Header Row */}
        <div className="flex items-center justify-between">
          
          {/* Left Side - Enhanced Brand & Title */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-4">
              
                <TalariaLogo size="large" className="text-white drop-shadow-sm" />
              
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                    Talaria-Log
                  </h1>
                  <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-medium text-slate-600"> Trading Analytics</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Current Balance Display */}
          <div className="flex items-center space-x-6">
            
            {/* Admin Login Indicator - Hidden as requested */}
            {/* {user && localStorage.getItem('admin_login_session') && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg">
                <User className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  Admin Session: {user.email}
                </span>
              </div>
            )} */}
            
            {/* Enhanced Current Balance Display */}
            <div className="flex items-center space-x-4">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-300"></div>
                <div className="relative flex items-center space-x-4 bg-white/80 backdrop-blur-sm px-6 py-4 rounded-2xl border border-white/50 shadow-xl shadow-slate-200/50">
                  
                  {/* Balance Icon & Label */}
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-sm">
                      <DollarSign className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Balance</span>
                      <div className="text-sm font-bold text-slate-700">Portfolio Value</div>
                    </div>
                  </div>

                  {/* Current Balance Display */}
                  <div className="relative">
                    {isLoadingBalance ? (
                      <div className="w-36 h-12 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                      </div>
                    ) : (
                      <div className="w-36 h-12 flex items-center justify-center">
                        <span className="text-2xl font-bold text-emerald-600">
                          {formatCurrency(currentBalance)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Balance Breakdown */}
                  {!isLoadingBalance && initialBalance && (
                    <div className="text-xs text-slate-500">
                      <div>Initial: {formatCurrency(parseFloat(initialBalance))}</div>
                      <div className={`font-semibold ${currentBalance >= parseFloat(initialBalance) ? 'text-green-600' : 'text-red-600'}`}>
                        PnL: {formatCurrency(currentBalance - parseFloat(initialBalance))}
                      </div>
                    </div>
                  )}

                
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-60"></div>
    </div>
  );
}