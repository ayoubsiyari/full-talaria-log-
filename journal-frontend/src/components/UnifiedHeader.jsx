import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Loader2 } from 'lucide-react';
import TalariaLogo from './TalariaLogo';
import { API_BASE_URL } from '../config';
import { useProfile } from '../context/ProfileContext';

export default function UnifiedHeader() {
  const { activeProfile } = useProfile();

  const [initialBalance, setInitialBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [trades, setTrades] = useState([]);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  const loadBalanceData = useCallback(async () => {
    try {
      setIsLoadingBalance(true);

      const token = localStorage.getItem('token');
      if (!token || !activeProfile) return;

      try {
        const balanceResponse = await fetch(`${API_BASE_URL}/journal/initial-balance`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setInitialBalance(balanceData.initial_balance || 0);
        } else {
          const savedBalance = localStorage.getItem('initialBalance');
          if (savedBalance) {
            setInitialBalance(parseFloat(savedBalance).toFixed(2));
          }
        }
      } catch {
        const savedBalance = localStorage.getItem('initialBalance');
        if (savedBalance) {
          setInitialBalance(parseFloat(savedBalance).toFixed(2));
        }
      }

      const response = await fetch(`${API_BASE_URL}/journal/list?profile_id=${activeProfile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
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

  useEffect(() => {
    loadBalanceData();

    const handleBalanceUpdate = () => loadBalanceData();
    window.addEventListener('balanceUpdated', handleBalanceUpdate);

    const handleStorageChange = (e) => {
      if (e.key === 'initialBalance') loadBalanceData();
    };
    window.addEventListener('storage', handleStorageChange);

    const intervalId = setInterval(() => loadBalanceData(), 30000);

    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, [activeProfile, loadBalanceData]);

  useEffect(() => {
    if (initialBalance && trades.length >= 0) {
      const netPnL = trades.reduce((sum, trade) => sum + (parseFloat(trade.pnl) || 0), 0);
      setCurrentBalance(parseFloat(initialBalance) + netPnL);
    } else if (initialBalance) {
      setCurrentBalance(parseFloat(initialBalance));
    }
  }, [initialBalance, trades]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <div className="relative border-b border-cyan-500/20 bg-[#050a10]/85 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_20%_0%,rgba(34,211,238,0.1),transparent_55%)]"
        aria-hidden
      />

      <div className="relative max-w-full mx-auto px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <TalariaLogo size="large" className="text-cyan-200 shrink-0" />
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
                  Talaria-Log
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-medium text-cyan-200/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse" />
                  Live
                </span>
              </div>
              <div className="flex items-center gap-2 text-cyan-200/50">
                <TrendingUp className="w-4 h-4 text-cyan-400/70 shrink-0" />
                <p className="text-sm font-medium">Trading analytics</p>
              </div>
            </div>
          </div>

          <div className="flex items-stretch lg:items-center">
            <div className="flex items-center gap-4 rounded-lg border border-cyan-400/20 bg-cyan-950/35 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)] w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10">
                  <DollarSign className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-cyan-400/75">
                    Current balance
                  </div>
                  <div className="text-xs text-cyan-200/40">Portfolio value</div>
                </div>
              </div>

              <div className="flex-1 lg:flex-initial flex justify-center lg:justify-end min-w-[7rem]">
                {isLoadingBalance ? (
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400/70" />
                ) : (
                  <span className="text-xl sm:text-2xl font-semibold tabular-nums text-cyan-100">
                    {formatCurrency(currentBalance)}
                  </span>
                )}
              </div>

              {!isLoadingBalance && initialBalance && (
                <div className="hidden sm:block text-xs text-cyan-200/45 border-l border-cyan-500/15 pl-4">
                  <div>Initial: {formatCurrency(parseFloat(initialBalance))}</div>
                  <div
                    className={`font-semibold ${
                      currentBalance >= parseFloat(initialBalance) ? 'text-emerald-400/85' : 'text-red-400/85'
                    }`}
                  >
                    PnL: {formatCurrency(currentBalance - parseFloat(initialBalance))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
