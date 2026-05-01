/**
 * Financial metrics calculation utilities
 * 
 * Required Inputs:
 * - initialBalance: Starting account balance (required for accurate return calculations)
 * - trades: Array of trade objects with pnl, date, etc.
 */

/**
 * Calculate Sharpe Ratio
 * @param {Array} trades - Array of trade objects with pnl and date
 * @param {number} initialBalance - Initial account balance
 * @param {number} riskFreeRate - Optional risk-free rate (per period, e.g. daily). Default 0.
 * @returns {Object} { value: number, missingInputs: string[] }
 */
export const calculateSharpeRatio = (trades, initialBalance, riskFreeRate = 0) => {
    const missingInputs = [];
    if (!initialBalance || initialBalance <= 0) {
        missingInputs.push('Initial account balance');
    }
    if (!trades || trades.length === 0) {
        missingInputs.push('Trade history');
    }
    
    if (missingInputs.length > 0) {
        return { 
            value: null, 
            missingInputs,
            error: `Missing required inputs: ${missingInputs.join(', ')}`
        };
    }

    try {
        // Group trades by date
        const tradesByDate = {};
        trades.forEach(trade => {
            const date = trade.date ? new Date(trade.date).toISOString().split('T')[0] : 
                         trade.created_at ? new Date(trade.created_at).toISOString().split('T')[0] : 
                         'unknown';
            if (!tradesByDate[date]) {
                tradesByDate[date] = [];
            }
            tradesByDate[date].push(trade);
        });

        // Sort dates and calculate daily returns
        const sortedDates = Object.keys(tradesByDate).sort();
        const dailyReturns = [];
        let currentEquity = initialBalance;

        for (const date of sortedDates) {
            const dailyPnL = tradesByDate[date].reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            const dailyReturn = dailyPnL / currentEquity;
            dailyReturns.push(dailyReturn);
            currentEquity += dailyPnL;
        }

        // Calculate Sharpe Ratio (annualized, assuming 252 trading days)
        if (dailyReturns.length < 2) {
            return { value: null, missingInputs: ['Sufficient trading history'] };
        }

        const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const stdDev = Math.sqrt(
            dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / 
            (dailyReturns.length - 1)
        );

        // Use the formula: (Average Trade Return - Risk-Free Rate) / Std Dev of Trade Returns
        const sharpeRatio = ((meanReturn - riskFreeRate) / (stdDev || 1)) * Math.sqrt(252);
        return { 
            value: isFinite(sharpeRatio) ? sharpeRatio : 0,
            missingInputs: []
        };
    } catch (error) {
        console.error('Error calculating Sharpe ratio:', error);
        return { 
            value: null, 
            missingInputs: ['Valid trade data'],
            error: 'Error calculating Sharpe ratio'
        };
    }
};

/**
 * Calculate Sortino Ratio
 * @param {Array} trades - Array of trade objects with pnl and date
 * @param {number} initialBalance - Initial account balance
 * @returns {Object} { value: number, missingInputs: string[] }
 */
export const calculateSortinoRatio = (trades, initialBalance) => {
    const missingInputs = [];
    if (!initialBalance || initialBalance <= 0) {
        missingInputs.push('Initial account balance');
    }
    if (!trades || trades.length === 0) {
        missingInputs.push('Trade history');
    }
    if (missingInputs.length > 0) {
        return {
            value: null,
            missingInputs,
            error: `Missing required inputs: ${missingInputs.join(', ')}`
        };
    }
    try {
        // Group trades by date
        const tradesByDate = {};
        trades.forEach(trade => {
            const date = trade.date ? new Date(trade.date).toISOString().split('T')[0] :
                trade.created_at ? new Date(trade.created_at).toISOString().split('T')[0] :
                    'unknown';
            if (!tradesByDate[date]) {
                tradesByDate[date] = [];
            }
            tradesByDate[date].push(trade);
        });
        // Sort dates and calculate daily returns
        const sortedDates = Object.keys(tradesByDate).sort();
        const dailyReturns = [];
        let currentEquity = initialBalance;
        for (const date of sortedDates) {
            const dailyPnL = tradesByDate[date].reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            const dailyReturn = dailyPnL / currentEquity;
            dailyReturns.push(dailyReturn);
            currentEquity += dailyPnL;
        }
        if (dailyReturns.length < 2) {
            return { value: null, missingInputs: ['Sufficient trading history'] };
        }
        const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        // Downside deviation (only negative returns)
        const downsideReturns = dailyReturns.filter(r => r < 0);
        if (downsideReturns.length === 0) {
            return { value: null, missingInputs: ['No negative returns (downside deviation)'] };
        }
        const downsideDev = Math.sqrt(downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length);
        const sortinoRatio = (meanReturn / downsideDev) * Math.sqrt(252);
        return {
            value: isFinite(sortinoRatio) ? sortinoRatio : null,
            missingInputs: []
        };
    } catch (error) {
        console.error('Error calculating Sortino ratio:', error);
        return {
            value: null,
            missingInputs: ['Valid trade data'],
            error: 'Error calculating Sortino ratio'
        };
    }
};

/**
 * Calculate Profit Factor
 * @param {Array} trades - Array of trade objects with pnl
 * @returns {number|null}
 */
export const calculateProfitFactor = (trades) => {
    if (!trades || trades.length === 0) return null;
    let grossProfit = 0;
    let grossLoss = 0;
    trades.forEach(trade => {
        const pnl = trade.pnl || 0;
        if (pnl > 0) grossProfit += pnl;
        if (pnl < 0) grossLoss += Math.abs(pnl);
    });
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : null;
    return grossProfit / grossLoss;
};

/**
 * Calculate Max Drawdown
 * @param {Array} trades - Array of trade objects with pnl and date
 * @param {number} initialBalance - Initial account balance
 * @returns {number|null} Max drawdown as a positive number (absolute value)
 */
export const calculateMaxDrawdown = (trades, initialBalance) => {
    if (!initialBalance || initialBalance <= 0 || !trades || trades.length === 0) return null;
    // Build equity curve
    let equity = initialBalance;
    const equityCurve = [equity];
    trades.forEach(trade => {
        equity += trade.pnl || 0;
        equityCurve.push(equity);
    });
    let peak = equityCurve[0];
    let maxDD = 0;
    for (let i = 1; i < equityCurve.length; i++) {
        if (equityCurve[i] > peak) peak = equityCurve[i];
        const drawdown = peak - equityCurve[i];
        if (drawdown > maxDD) maxDD = drawdown;
    }
    return maxDD;
};

/**
 * Calculate System Quality Number (SQN) using PnL values
 * @param {Array} trades - Array of trade objects with pnl
 * @returns {number|null}
 */
export const calculateSQN = (trades) => {
    if (!trades || trades.length < 2) return null; // Need at least 2 trades for stdev

    const pnlValues = trades.map(t => t.pnl || 0);
    const tradeCount = pnlValues.length;
    const avgPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0) / tradeCount;
    
    const stdDev = Math.sqrt(
        pnlValues.reduce((sum, pnl) => sum + Math.pow(pnl - avgPnl, 2), 0) / (tradeCount - 1)
    );

    if (stdDev === 0) return null; // Avoid division by zero

    const sqn = (Math.sqrt(tradeCount) * avgPnl) / stdDev;
    return isFinite(sqn) ? sqn : null;
};

/**
 * Calculate System Quality Number (SQN) using R-Multiples
 * @param {Array} trades - Array of trade objects with pnl and risk_amount
 * @returns {number|null}
 */
export const calculateSQNWithRMultiples = (trades) => {
    if (!trades || trades.length < 2) return null; // Need at least 2 trades for stdev

    // R-Multiple = trade.pnl / abs(trade.risk_amount)
    const rMultiples = trades
        .map(t => (t.risk_amount && Math.abs(t.risk_amount) > 0) ? (t.pnl / Math.abs(t.risk_amount)) : null)
        .filter(r => r !== null && !isNaN(r));

    if (rMultiples.length < 2) return null; // Need at least 2 valid R-multiples

    const mean = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
    const variance = rMultiples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rMultiples.length - 1);
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return null; // Avoid division by zero

    const sqn = (mean / stddev) * Math.sqrt(rMultiples.length);
    return isFinite(sqn) ? sqn : null;
};

/**
 * Check for missing required inputs for all metrics
 * @returns {Object} { hasMissingInputs: boolean, messages: string[] }
 */
export const validateMetricsInputs = (initialBalance, trades) => {
    const messages = [];
    
    if (!initialBalance || initialBalance <= 0) {
        messages.push('Initial account balance is required for accurate metrics calculation');
    }
    
    if (!trades || trades.length === 0) {
        messages.push('No trade history available');
    }
    
    return {
        hasMissingInputs: messages.length > 0,
        messages
    };
};
