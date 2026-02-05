import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Camera, ExternalLink } from 'lucide-react';

const formatCurrency = (amount) => {
  if (amount === 0) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

const getAbsoluteUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Convert relative API path to absolute URL
  const apiBase = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
  return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
};

const DayTradeModal = ({ isOpen, onClose, selectedDate, trades = [] }) => {
  const dayTrades = useMemo(() => {
    if (!selectedDate || !trades.length) return [];
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    return trades.filter(trade => {
      try {
        // Handle different date formats and field names
        let tradeDate;
        const dateField = trade.entry_date || trade.date || trade.timestamp || trade.created_at;
        
        if (typeof dateField === 'string') {
          if (dateField.includes('T')) {
            // ISO format with time
            tradeDate = format(parseISO(dateField), 'yyyy-MM-dd');
          } else {
            // Date only format
            tradeDate = dateField;
          }
        } else if (dateField instanceof Date) {
          tradeDate = format(dateField, 'yyyy-MM-dd');
        } else {
          return false;
        }
        
        return tradeDate === dateStr;
      } catch (error) {
        console.error('Error parsing trade date:', trade.entry_date || trade.date || trade.timestamp, error);
        return false;
      }
    });
  }, [selectedDate, trades]);

  const dayStats = useMemo(() => {
    if (!dayTrades.length) return null;

    const totalPnL = dayTrades.reduce((sum, trade) => sum + parseFloat(trade.pnl || 0), 0);
    const winningTrades = dayTrades.filter(trade => parseFloat(trade.pnl || 0) > 0);
    const losingTrades = dayTrades.filter(trade => parseFloat(trade.pnl || 0) < 0);
    const winRate = dayTrades.length > 0 ? (winningTrades.length / dayTrades.length) * 100 : 0;

    return {
      totalTrades: dayTrades.length,
      totalPnL,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, trade) => sum + parseFloat(trade.pnl || 0), 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, trade) => sum + parseFloat(trade.pnl || 0), 0) / losingTrades.length : 0,
    };
  }, [dayTrades]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden border border-blue-200/60" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-6 border-b border-blue-200/60 relative">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#040028] mb-1">
                📊 Trading Summary
              </h2>
              <div className="text-sm text-slate-600">
                {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : ''}
              </div>
            </div>
            <button 
              className="p-2 text-slate-400 hover:text-[#040028] hover:bg-slate-100 rounded-lg transition-colors"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {dayTrades.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-[#040028] mb-2">No trades on this day</h3>
              <p className="text-slate-600">You didn't execute any trades on this date.</p>
            </div>
          ) : (
            <>
              {/* Day Statistics */}
              {dayStats && (
                <div className="mb-8">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-blue-200/60 text-center">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Total P&L
                      </div>
                      <div className={`text-lg font-bold ${
                        dayStats.totalPnL >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}>
                        {formatCurrency(dayStats.totalPnL)}
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-xl p-4 border border-blue-200/60 text-center">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Total Trades
                      </div>
                      <div className="text-lg font-bold text-[#040028]">
                        {dayStats.totalTrades}
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-xl p-4 border border-blue-200/60 text-center">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Win Rate
                      </div>
                      <div className="text-lg font-bold text-[#040028]">
                        {formatPercent(dayStats.winRate)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Trades List */}
              <div>
                <h3 className="text-lg font-semibold text-[#040028] mb-4">Trade Details</h3>
                <div className="space-y-4">
                  {dayTrades.map((trade, index) => (
                    <div key={index} className="bg-white border border-blue-200/60 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-[#040028]">{trade.symbol}</span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-lg uppercase ${
                            trade.direction === 'long' 
                              ? 'bg-green-100 text-[#10B981]' 
                              : 'bg-red-100 text-[#EF4444]'
                          }`}>
                            {trade.direction === 'long' ? '' : ''} {trade.direction?.toUpperCase()}
                          </span>
                        </div>
                        <div className={`text-lg font-bold ${
                          parseFloat(trade.pnl || 0) >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                        }`}>
                          {formatCurrency(parseFloat(trade.pnl || 0))}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 font-medium">Strategy:</span>
                          <span className="text-sm text-[#040028] font-semibold">{trade.strategy || 'N/A'}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 font-medium">Entry:</span>
                          <span className="text-sm text-[#040028] font-semibold">{formatCurrency(parseFloat(trade.entry_price || 0))}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 font-medium">Exit:</span>
                          <span className="text-sm text-[#040028] font-semibold">{formatCurrency(parseFloat(trade.exit_price || 0))}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 font-medium">Quantity:</span>
                          <span className="text-sm text-[#040028] font-semibold">{trade.quantity || 'N/A'}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 font-medium">R:R Ratio:</span>
                          <span className="text-sm text-[#040028] font-semibold">
                            {trade.rr ? `${parseFloat(trade.rr).toFixed(2)}:1` : 'N/A'}
                          </span>
                        </div>
                        
                        {trade.notes && (
                          <div className="sm:col-span-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm text-slate-600 font-medium">Notes:</span>
                              <span className="text-sm text-[#040028] font-medium">{trade.notes}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Screenshots Section */}
                        {(trade.entry_screenshot || trade.exit_screenshot) && (
                          <div className="sm:col-span-2">
                            <div className="flex flex-col gap-3">
                              <span className="text-sm text-slate-600 font-medium">Screenshots:</span>
                              <div className="flex gap-3">
                                {trade.entry_screenshot && (
                                  <div className="flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-blue-600" />
                                    <a
                                      href={getAbsoluteUrl(trade.entry_screenshot)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline"
                                    >
                                      Entry
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                                {trade.exit_screenshot && (
                                  <div className="flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-blue-600" />
                                    <a
                                      href={getAbsoluteUrl(trade.exit_screenshot)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline"
                                    >
                                      Exit
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayTradeModal;

