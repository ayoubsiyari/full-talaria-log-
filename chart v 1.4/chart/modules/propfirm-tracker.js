/**
 * Prop Firm Challenge Tracker
 * Monitors trading activity and validates against prop firm rules
 */

class PropFirmTracker {
    constructor() {
        this.sessionData = null;
        this.startBalance = 10000;
        this.currentBalance = 10000;
        this.peakBalance = 10000;
        this.tradingDays = new Set();
        this.dailyTrades = {};
        this.allTrades = [];
        this.rules = {
            minTradingDays: 1,
            profitTarget: 10,
            maxDailyLoss: 5,
            maxTotalLoss: 10,
            maxDailyLossUsd: null,
            maxTotalLossUsd: null,
            trailingDrawdown: false,
            dailyLossEnabled: true,
            consistencyRule: false,
            consistencyPct: 0,
            numPhases: 1,
            weekendHold: false
        };
        this.currentPhase = 1;
        this.phaseStartBalance = null;
        this.violations = {
            dailyLoss: false,
            totalLoss: false,
            consistency: false
        };
        this.tradingDisabled = false;
        this.profitTargetReachedShown = false;
        this.failedModalShown = false;
        this._persistTimer = null;
        this._lastPersistKey = '';

        this.loadSession();
    }

    /** Only prop-firm evaluation sessions should run challenge rules, modals, and toolbar updates. */
    _isPropFirmChallenge() {
        return !!(this.sessionData && this.sessionData.type === 'propfirm');
    }

    // Load prop firm session from localStorage
    loadSession() {
        try {
            let mode = null;
            try {
                mode = typeof window !== 'undefined' && window.location && window.location.search
                    ? new URLSearchParams(window.location.search).get('mode')
                    : null;
            } catch (e) {}
            if (mode === 'backtest') {
                this.sessionData = null;
                return false;
            }

            const session = userStorage.getItem('backtestingSession');
            if (!session) {
                this.sessionData = null;
                return false;
            }

            const parsed = JSON.parse(session);
            if (parsed.type !== 'propfirm') {
                // Personal / standard backtest sessions share the same key; do not treat them as challenges.
                this.sessionData = null;
                return false;
            }

            this.sessionData = parsed;
            const sb = Number.parseFloat(this.sessionData.startBalance ?? this.sessionData.balance);
            this.startBalance = Number.isFinite(sb) && sb > 0 ? sb : 10000;
            this.currentBalance = this.startBalance;
            this.peakBalance = this.startBalance;
            this.currentPhase = 1;
            this.phaseStartBalance = null;
            this._applyPhaseRulesFromSession(this.sessionData, 1);

            console.log('✅ Prop Firm Tracker initialized:', {
                startBalance: this.startBalance,
                rules: this.rules,
                phase: this.currentPhase
            });
            return true;
        } catch (e) {
            console.error('Error loading prop firm session:', e);
            this.sessionData = null;
            return false;
        }
    }

    _applyPhaseRulesFromSession(session, phase) {
        const pr = session.prop_rules || {};
        const phaseNum = phase === 2 ? 2 : 1;
        let md;
        let mt;
        let minDays;
        let profitTarget;

        if (phaseNum === 2 && Number(pr.numPhases) >= 2) {
            const p2 = pr.p2Pct || {};
            const p2a = pr.p2Amt || {};
            md = { percent: p2.dl, dollar: p2a.dl };
            mt = { percent: p2.dd, dollar: p2a.dd };
            profitTarget = Number(p2.pt);
            minDays = pr.p2MinDays ?? 0;
        } else {
            md = session.maxDailyLoss || {};
            mt = session.maxTotalLoss || {};
            const p1 = pr.p1Pct || {};
            minDays = session.minTradingDays ?? pr.minTradingDays ?? pr.p1MinDays ?? 1;
            profitTarget = session.profitTarget ?? p1.pt ?? 10;
        }

        const mdp = Number(md.percent);
        const mtp = Number(mt.percent);
        const mdd = Number(md.dollar);
        const mtd = Number(mt.dollar);
        const dailyPct = Number.isFinite(mdp) ? mdp : 5;
        const totalPct = Number.isFinite(mtp) ? mtp : 10;
        const profitPct = Number.isFinite(Number(profitTarget)) ? Number(profitTarget) : 10;

        this.rules = {
            minTradingDays: minDays,
            profitTarget: profitPct,
            maxDailyLoss: dailyPct,
            maxTotalLoss: totalPct,
            maxDailyLossUsd: Number.isFinite(mdd) ? mdd : (this.startBalance * dailyPct / 100),
            maxTotalLossUsd: Number.isFinite(mtd) ? mtd : (this.startBalance * totalPct / 100),
            trailingDrawdown: !!(session.trailingDrawdown ?? pr.trailingDrawdown),
            dailyLossEnabled: session.dailyLossEnabled !== false && pr.dailyLossEnabled !== false,
            consistencyRule: !!(session.consistencyRule ?? pr.consistencyRule),
            consistencyPct: Number(session.consistencyPct ?? pr.consistencyPct) || 0,
            numPhases: Number(pr.numPhases) || 1,
            weekendHold: !!(session.weekendHold ?? pr.weekendHold)
        };
    }

    // Record a trade
    recordTrade(trade, options = {}) {
        if (!this.sessionData || this.sessionData.type !== 'propfirm') {
            console.log('⚠️ Not a prop firm session, skipping trade tracking');
            return;
        }

        // Check for duplicates
        const isDuplicate = this.allTrades.some(t => 
            t.id === trade.id && 
            t.closeTime === trade.closeTime && 
            t.profit === trade.profit
        );
        
        if (isDuplicate) {
            console.log('⚠️ Duplicate trade detected, skipping:', trade.id);
            return;
        }

        const tradeTimestamp = trade.timestamp || trade.closeTime || Date.now();
        const dateKey = this.getDateKey(tradeTimestamp);
        const isImport = options.isImport || false;
        
        console.log('📝 Recording trade:', {
            id: trade.id,
            profit: trade.profit,
            timestamp: tradeTimestamp,
            dateKey: dateKey,
            todayKey: this.getTodayKey(),
            isImport: isImport
        });

        // Add to all trades
        this.allTrades.push({
            ...trade,
            timestamp: tradeTimestamp,
            date: dateKey
        });

        // Track trading day
        this.tradingDays.add(dateKey);

        // Track daily trades
        if (!this.dailyTrades[dateKey]) {
            this.dailyTrades[dateKey] = [];
        }
        this.dailyTrades[dateKey].push({
            ...trade,
            timestamp: tradeTimestamp,
            date: dateKey
        });

        // Update balance is now handled separately via updateBalance()
        // This allows for more accurate tracking
        console.log(`📊 Current balance: $${this.currentBalance.toFixed(2)} | Peak: $${this.peakBalance.toFixed(2)} | P&L: ${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}`);

        // Check rules after each trade
        // Skip modal trigger if this is an imported trade (during sync)
        this.checkRules(isImport);
        
        // Update UI
        this.updateUI();
    }

    // Get date key (YYYY-MM-DD) - Using UTC to avoid timezone issues
    getDateKey(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Get today's date key
    getTodayKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Calculate trading days count
    getTradingDaysCount() {
        return this.tradingDays.size;
    }

    // Calculate profit percentage (phase 2 measures from phase baseline)
    getProfitPercent() {
        const baseline = (this.currentPhase >= 2 && Number.isFinite(this.phaseStartBalance))
            ? this.phaseStartBalance
            : this.startBalance;
        return ((this.currentBalance - baseline) / this.startBalance) * 100;
    }

    // Calculate daily P&L for specific day
    getDailyPnL(dateKey) {
        const trades = this.dailyTrades[dateKey] || [];
        const total = trades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
        console.log(`📅 Daily P&L for ${dateKey}: $${total.toFixed(2)} (${trades.length} trades)`);
        return total;
    }

    // Calculate daily P&L percentage for specific day
    getDailyPnLPercent(dateKey) {
        const dailyPnL = this.getDailyPnL(dateKey);
        return (dailyPnL / this.startBalance) * 100;
    }

    // Calculate today's P&L percentage
    getTodayPnLPercent() {
        // In replay/backtest mode, "today" means the most recent trading day in the simulation
        // not the actual calendar date
        const tradingDaysArray = Array.from(this.tradingDays).sort();
        const latestTradingDay = tradingDaysArray[tradingDaysArray.length - 1];
        
        // Use the latest trading day if we have one, otherwise use real today
        const dateKeyToUse = latestTradingDay || this.getTodayKey();
        
        const todayPercent = this.getDailyPnLPercent(dateKeyToUse);
        console.log(`📅 Latest trading day: ${dateKeyToUse} P&L: ${todayPercent.toFixed(2)}%`);
        console.log(`📅 All trading days:`, tradingDaysArray);
        console.log(`📅 Daily trades:`, this.dailyTrades);
        return todayPercent;
    }

    // Calculate max drawdown from peak
    getMaxDrawdown() {
        const drawdown = this.peakBalance - this.currentBalance;
        return (drawdown / this.startBalance) * 100;
    }

    // Calculate total loss from starting balance or peak (trailing drawdown)
    getTotalLossPercent() {
        if (this.rules.trailingDrawdown) {
            const drawdown = this.peakBalance - this.currentBalance;
            if (drawdown <= 0) return 0;
            return (drawdown / this.startBalance) * 100;
        }
        if (this.currentBalance >= this.startBalance) {
            return 0;
        }
        const loss = this.startBalance - this.currentBalance;
        return (loss / this.startBalance) * 100;
    }

    getTotalLossUsd() {
        if (this.rules.trailingDrawdown) {
            return Math.max(0, this.peakBalance - this.currentBalance);
        }
        return this.currentBalance < this.startBalance ? (this.startBalance - this.currentBalance) : 0;
    }

    // Consistency rule: best profitable day cannot exceed X% of total profits
    isConsistencyBreached() {
        if (!this.rules.consistencyRule || !(this.rules.consistencyPct > 0)) {
            return false;
        }
        const totalProfit = this.allTrades.reduce((sum, t) => sum + Math.max(0, t.profit || 0), 0);
        if (totalProfit <= 0) return false;

        let bestDayProfit = 0;
        Object.keys(this.dailyTrades).forEach((dateKey) => {
            const dayPnL = this.getDailyPnL(dateKey);
            if (dayPnL > bestDayProfit) bestDayProfit = dayPnL;
        });

        if (bestDayProfit <= 0) return false;
        return (bestDayProfit / totalProfit) * 100 > this.rules.consistencyPct;
    }

    // Check if trading days requirement is met
    isTradingDaysComplete() {
        const req = this._getTradingDaysRequired();
        if (req <= 0) return true;
        return this.getTradingDaysCount() >= req;
    }

    // Check if profit target is met
    isProfitTargetReached() {
        return this.getProfitPercent() >= this.rules.profitTarget;
    }

    // Check if daily loss limit is breached
    isDailyLossBreached() {
        if (!this.rules.dailyLossEnabled) return false;
        const tradingDaysArray = Array.from(this.tradingDays).sort();
        const latest = tradingDaysArray[tradingDaysArray.length - 1];
        if (!latest) return false;
        const dailyPnL = this.getDailyPnL(latest);
        const lossUsd = dailyPnL < 0 ? Math.abs(dailyPnL) : 0;
        const lossPct = Math.abs(Math.min(0, this.getDailyPnLPercent(latest)));
        const usdCap = this.rules.maxDailyLossUsd != null ? this.rules.maxDailyLossUsd : (this.startBalance * this.rules.maxDailyLoss / 100);
        return lossPct >= this.rules.maxDailyLoss || lossUsd >= usdCap;
    }

    // Check if total loss limit is breached
    isTotalLossBreached() {
        const lossPct = this.getTotalLossPercent();
        const lossUsd = this.getTotalLossUsd();
        const usdCap = this.rules.maxTotalLossUsd != null ? this.rules.maxTotalLossUsd : (this.startBalance * this.rules.maxTotalLoss / 100);
        return lossPct >= this.rules.maxTotalLoss || lossUsd >= usdCap;
    }

    _getTradingDaysRequired() {
        const n = this.rules.minTradingDays;
        return typeof n === 'number' && n >= 0 ? n : 1;
    }

    // Check all rules and update violations
    checkRules(skipModalTrigger = false) {
        if (!this._isPropFirmChallenge()) {
            return true;
        }
        const dailyBreached = this.isDailyLossBreached();
        const totalBreached = this.isTotalLossBreached();
        const consistencyBreached = this.isConsistencyBreached();
        this.violations.dailyLoss = dailyBreached;
        this.violations.totalLoss = totalBreached;
        this.violations.consistency = consistencyBreached;

        if (!skipModalTrigger && !this.failedModalShown) {
            if (dailyBreached) {
                this.showChallengeFailedModal('Daily Loss Limit');
            } else if (totalBreached) {
                this.showChallengeFailedModal('Maximum Total Loss');
            } else if (consistencyBreached) {
                this.showChallengeFailedModal('Consistency Rule');
            }
        }

        if (!dailyBreached && !totalBreached && !consistencyBreached) {
            this._tryAdvancePhaseOrPass(skipModalTrigger);
        }

        return !dailyBreached && !totalBreached && !consistencyBreached;
    }

    _tryAdvancePhaseOrPass(skipModalTrigger) {
        const req = this._getTradingDaysRequired();
        const daysOk = req <= 0 || this.getTradingDaysCount() >= req;
        if (!this.isProfitTargetReached() || !daysOk) return;

        const numPhases = this.rules.numPhases || 1;
        if (this.currentPhase < 2 && numPhases >= 2) {
            this._advanceToPhase2();
            if (!skipModalTrigger && typeof window.showNotification === 'function') {
                window.showNotification('Phase 1 complete — Phase 2 challenge started', 'success', 6000);
            }
            return;
        }

        if (!skipModalTrigger && !this.profitTargetReachedShown) {
            this.showChallengePassedModal();
            this.profitTargetReachedShown = true;
        }
    }

    _advanceToPhase2() {
        this.currentPhase = 2;
        this.phaseStartBalance = this.currentBalance;
        this.profitTargetReachedShown = false;
        this.tradingDays = new Set();
        this.dailyTrades = {};
        this._applyPhaseRulesFromSession(this.sessionData, 2);
        this.updateUI();
    }

    _getActiveSessionIdForApi() {
        try {
            const u = new URLSearchParams(window.location.search);
            const fromUrl = u.get('sessionId');
            if (fromUrl) return String(fromUrl);
        } catch (e) {}
        try {
            const sid = userStorage.getItem('active_trading_session_id');
            if (sid) return String(sid);
        } catch (e) {}
        return null;
    }

    _queuePersistChallengeSnapshot() {
        if (!this.sessionData || this.sessionData.type !== 'propfirm') return;
        const sessionId = this._getActiveSessionIdForApi();
        if (!sessionId) return;

        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
        }
        const self = this;
        this._persistTimer = setTimeout(function () {
            self._persistTimer = null;
            self._flushPersistChallengeSnapshot(sessionId);
        }, 800);
    }

    _flushPersistChallengeSnapshot(sessionId) {
        const summary = this.getProgressSummary();
        const snapshot = {
            updatedAt: new Date().toISOString(),
            simulationPresetId: this.sessionData.simulationPresetId || null,
            simulationPresetLabel: this.sessionData.simulationPresetLabel || null,
            startBalance: this.startBalance,
            currentBalance: this.currentBalance,
            profitPercent: this.getProfitPercent(),
            tradingDaysCount: this.getTradingDaysCount(),
            violations: { ...this.violations },
            summary: summary,
            status: (this.violations.dailyLoss || this.violations.totalLoss || this.violations.consistency)
                ? 'breached'
                : (this.isProfitTargetReached() && (this._getTradingDaysRequired() <= 0 || this.isTradingDaysComplete())
                    ? 'passed'
                    : 'active'),
            currentPhase: this.currentPhase,
            phaseStartBalance: this.phaseStartBalance
        };
        const key = JSON.stringify({
            b: snapshot.currentBalance,
            v: snapshot.violations,
            s: snapshot.status,
            t: snapshot.tradingDaysCount
        });
        if (key === this._lastPersistKey) return;
        this._lastPersistKey = key;

        const patch = { propfirm_challenge: snapshot };
        try {
            const chart = typeof window !== 'undefined' ? window.chart : null;
            if (chart && typeof chart.scheduleSessionStateSave === 'function') {
                chart.scheduleSessionStateSave(patch);
                return;
            }
        } catch (_e) { /* ignore */ }

        fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/state', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch)
        }).catch(function (err) {
            console.warn('Prop firm challenge snapshot persist failed', err);
        });
    }

    // Alert when a rule is breached
    alertRuleBreached(ruleName) {
        console.error(`🚨 PROP FIRM RULE BREACHED: ${ruleName}`);
        
        // Show visual alert
        if (typeof window.showNotification === 'function') {
            window.showNotification(`❌ ${ruleName} Breached!`, 'error');
        }

        // Update badge to red
        const badgeEl = document.getElementById('challengeStatusBadge');
        if (badgeEl) {
            badgeEl.style.background = '#ef4444';
            badgeEl.textContent = '⚠️';
        }

        // Don't show modal here - it will be shown after trade journal modal is closed
        // This prevents the modal from appearing while the trade journal is still open
        console.log('⚠️ Rule breached - modal will show after trade journal is closed');
    }

    // Get progress summary
    getProgressSummary() {
        const reqDays = this._getTradingDaysRequired();
        const daysPct = reqDays <= 0
            ? 100
            : Math.min((this.getTradingDaysCount() / reqDays) * 100, 100);
        return {
            tradingDays: {
                current: this.getTradingDaysCount(),
                required: reqDays,
                completed: this.isTradingDaysComplete(),
                percent: daysPct
            },
            profit: {
                current: this.getProfitPercent(),
                target: this.rules.profitTarget,
                completed: this.isProfitTargetReached(),
                percent: this.getProfitPercent() >= 0 
                    ? Math.min((this.getProfitPercent() / this.rules.profitTarget) * 100, 100)
                    : 0
            },
            dailyLoss: {
                current: Math.abs(Math.min(0, this.getTodayPnLPercent())),
                limit: this.rules.maxDailyLoss,
                breached: this.violations.dailyLoss,
                percent: Math.min((Math.abs(Math.min(0, this.getTodayPnLPercent())) / Math.max(0.0001, this.rules.maxDailyLoss)) * 100, 100)
            },
            totalLoss: {
                current: this.getTotalLossPercent(),
                limit: this.rules.maxTotalLoss,
                breached: this.violations.totalLoss,
                percent: Math.min((this.getTotalLossPercent() / Math.max(0.0001, this.rules.maxTotalLoss)) * 100, 100)
            },
            balance: {
                start: this.startBalance,
                current: this.currentBalance,
                peak: this.peakBalance
            }
        };
    }

    // Update UI with current progress
    updateUI() {
        if (!this._isPropFirmChallenge()) {
            return;
        }
        const summary = this.getProgressSummary();
        
        console.log('📊 Updating Challenge Progress UI:', summary);
        
        // Update trading days
        const tradingDaysEl = document.getElementById('challengeTradingDaysDropdown');
        const tradingDaysBar = document.getElementById('challengeTradingDaysBar');
        if (tradingDaysEl) {
            const req = summary.tradingDays.required;
            tradingDaysEl.textContent = req <= 0
                ? `${summary.tradingDays.current} (no minimum)`
                : `${summary.tradingDays.current}/${req}`;
        }
        if (tradingDaysBar) {
            tradingDaysBar.style.width = summary.tradingDays.percent + '%';
        }

        // Update profit target
        const profitEl = document.getElementById('challengeProfitDropdown');
        const profitBar = document.getElementById('challengeProfitBar');
        if (profitEl) {
            profitEl.textContent = `${summary.profit.current.toFixed(2)}% / ${summary.profit.target}%`;
        }
        if (profitBar) {
            profitBar.style.width = Math.max(0, Math.abs(summary.profit.percent)) + '%';
        }

        // Update daily loss
        const dailyLossEl = document.getElementById('challengeDailyLossDropdown');
        const dailyLossBar = document.getElementById('challengeDailyLossBar');
        if (dailyLossEl) {
            dailyLossEl.textContent = `${summary.dailyLoss.current.toFixed(2)}% / ${summary.dailyLoss.limit}%`;
        }
        if (dailyLossBar) {
            dailyLossBar.style.width = summary.dailyLoss.percent + '%';
        }

        // Update total loss
        const totalLossEl = document.getElementById('challengeTotalLossDropdown');
        const totalLossBar = document.getElementById('challengeTotalLossBar');
        if (totalLossEl) {
            totalLossEl.textContent = `${summary.totalLoss.current.toFixed(2)}% / ${summary.totalLoss.limit}%`;
        }
        if (totalLossBar) {
            totalLossBar.style.width = summary.totalLoss.percent + '%';
        }

        // Update balance
        const balanceEl = document.getElementById('challengeBalanceDropdown');
        if (balanceEl) {
            balanceEl.textContent = `$${summary.balance.current.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        // Update status icons
        this.updateStatusIcons(summary);

        // Update badge
        this.updateBadge(summary);

        this._queuePersistChallengeSnapshot();
    }

    // Update status icons based on completion
    updateStatusIcons(summary) {
        // Trading Days icon
        const tradingDaysIcon = document.querySelector('.challenge-dropdown-item:nth-child(1) .challenge-dropdown-icon');
        if (tradingDaysIcon) {
            if (summary.tradingDays.completed) {
                tradingDaysIcon.classList.remove('pending');
                tradingDaysIcon.classList.add('success');
            } else {
                tradingDaysIcon.classList.remove('success');
                tradingDaysIcon.classList.add('pending');
            }
        }

        // Profit Target icon
        const profitIcon = document.querySelector('.challenge-dropdown-item:nth-child(2) .challenge-dropdown-icon');
        if (profitIcon) {
            if (summary.profit.completed) {
                profitIcon.classList.remove('pending');
                profitIcon.classList.add('success');
            } else {
                profitIcon.classList.remove('success');
                profitIcon.classList.add('pending');
            }
        }

        // Daily Loss icon
        const dailyLossIcon = document.querySelector('.challenge-dropdown-item:nth-child(3) .challenge-dropdown-icon');
        if (dailyLossIcon) {
            if (summary.dailyLoss.breached) {
                dailyLossIcon.classList.remove('pending');
                dailyLossIcon.classList.add('danger');
            } else {
                dailyLossIcon.classList.remove('danger');
                dailyLossIcon.classList.add('pending');
            }
        }

        // Total Loss icon
        const totalLossIcon = document.querySelector('.challenge-dropdown-item:nth-child(4) .challenge-dropdown-icon');
        if (totalLossIcon) {
            if (summary.totalLoss.breached) {
                totalLossIcon.classList.remove('pending');
                totalLossIcon.classList.add('danger');
            } else {
                totalLossIcon.classList.remove('danger');
                totalLossIcon.classList.add('pending');
            }
        }
    }

    // Update status badge
    updateBadge(summary) {
        const badgeEl = document.getElementById('challengeStatusBadge');
        if (!badgeEl) return;

        // Count completed tasks
        let completedTasks = 0;
        if (summary.tradingDays.completed) completedTasks++;
        if (summary.profit.completed) completedTasks++;
        if (!summary.dailyLoss.breached) completedTasks++;
        if (!summary.totalLoss.breached) completedTasks++;

        // Check if any rules are breached
        if (summary.dailyLoss.breached || summary.totalLoss.breached) {
            badgeEl.textContent = '⚠️';
            badgeEl.style.background = '#ef4444';
        } else {
            badgeEl.textContent = `${completedTasks}/4`;
            
            if (completedTasks === 4) {
                badgeEl.style.background = '#22c55e';
            } else if (completedTasks >= 2) {
                badgeEl.style.background = '#f59e0b';
            } else {
                badgeEl.style.background = '#3b82f6';
            }
        }
    }

    // Update balance (called externally when balance changes)
    updateBalance(newBalance) {
        if (!this._isPropFirmChallenge()) {
            return;
        }
        console.log(`💰 Balance updated: $${this.currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
        this.currentBalance = newBalance;
        this.peakBalance = Math.max(this.peakBalance, this.currentBalance);
        this.checkRules();
        this.updateUI();
    }

    // Show challenge failed modal
    showChallengeFailedModal(ruleName) {
        if (!this._isPropFirmChallenge()) {
            return;
        }
        // Don't show if already shown
        if (this.failedModalShown) {
            console.log('⚠️ Failed modal already shown, skipping');
            return;
        }
        
        const modal = document.getElementById('challengeFailedModal');
        if (!modal) return;

        const summary = this.getProgressSummary();
        const pnl = this.currentBalance - this.startBalance;
        const pnlPercent = this.getProfitPercent();

        // Update modal content
        const reasonMessages = {
            'Daily Loss Limit': 'You have exceeded the maximum daily loss limit for this challenge.',
            'Maximum Total Loss': 'You have exceeded the maximum total loss limit for this challenge.',
            'Consistency Rule': 'Your largest profitable day exceeds the allowed share of total profits for this challenge.'
        };
        document.getElementById('challengeFailedReason').textContent =
            reasonMessages[ruleName] || 'A challenge rule was violated.';

        document.getElementById('challengeFailedBalance').textContent = 
            `$${this.currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        document.getElementById('challengeFailedPnL').textContent = 
            `${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`;

        document.getElementById('challengeFailedRule').textContent = ruleName;
        document.getElementById('challengeFailedDays').textContent = summary.tradingDays.current;

        // Show modal
        modal.classList.add('active');
        this.failedModalShown = true;

        // Pause replay if active
        if (window.chart && window.chart.replaySystem && window.chart.replaySystem.isActive) {
            window.chart.replaySystem.pause();
        }

        // Disable trading
        this.tradingDisabled = true;
        console.log('🚫 Trading disabled due to rule violation');
    }

    // Show challenge passed modal
    showChallengePassedModal() {
        if (!this._isPropFirmChallenge()) {
            return;
        }
        // Don't show if already shown (but this is already handled by profitTargetReachedShown flag)
        const modal = document.getElementById('challengePassedModal');
        if (!modal) return;

        const summary = this.getProgressSummary();
        const profit = this.currentBalance - this.startBalance;
        const profitPercent = this.getProfitPercent();

        // Update modal content
        document.getElementById('challengePassedBalance').textContent = 
            `$${this.currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        document.getElementById('challengePassedProfit').textContent = 
            `+$${profit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (+${profitPercent.toFixed(2)}%)`;

        document.getElementById('challengePassedTarget').textContent = 
            `${this.rules.profitTarget.toFixed(2)}%`;

        document.getElementById('challengePassedDays').textContent = summary.tradingDays.current;

        // Show modal
        modal.classList.add('active');

        // Pause replay if active
        if (window.chart && window.chart.replaySystem && window.chart.replaySystem.isActive) {
            window.chart.replaySystem.pause();
        }

        console.log('🎉 Profit target reached! Challenge passed!');
    }

    // Reset tracker (for new day, new challenge, etc.)
    reset() {
        if (!this._isPropFirmChallenge()) {
            return;
        }
        this.currentBalance = this.startBalance;
        this.peakBalance = this.startBalance;
        this.tradingDays.clear();
        this.dailyTrades = {};
        this.allTrades = [];
        this.currentPhase = 1;
        this.phaseStartBalance = null;
        this.violations = {
            dailyLoss: false,
            totalLoss: false,
            consistency: false
        };
        if (this.sessionData) {
            this._applyPhaseRulesFromSession(this.sessionData, 1);
        }
        this.updateUI();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPropFirmTracker);
} else {
    initPropFirmTracker();
}

function initPropFirmTracker() {
    // Create global instance
    window.propFirmTracker = new PropFirmTracker();
    
    // Expose functions globally
    window.updateChallengeProgressCompact = function() {
        if (window.propFirmTracker) {
            window.propFirmTracker.updateUI();
        }
    };
    
    // Debug helper function
    window.debugPropFirmTracker = function() {
        if (!window.propFirmTracker) {
            console.log('❌ Prop Firm Tracker not initialized');
            return;
        }
        
        const tracker = window.propFirmTracker;
        console.log('=== Prop Firm Tracker Debug ===');
        console.log('Session Data:', tracker.sessionData);
        console.log('Rules:', tracker.rules);
        console.log('Start Balance:', tracker.startBalance);
        console.log('Current Balance:', tracker.currentBalance);
        console.log('Peak Balance:', tracker.peakBalance);
        console.log('Trading Days Count:', tracker.tradingDays.size);
        console.log('Trading Days:', Array.from(tracker.tradingDays));
        console.log('All Trades:', tracker.allTrades);
        console.log('Daily Trades:', tracker.dailyTrades);
        console.log('Violations:', tracker.violations);
        
        // Calculate and show daily P&L
        const tradingDaysArray = Array.from(tracker.tradingDays).sort();
        tradingDaysArray.forEach(day => {
            const dayTrades = tracker.dailyTrades[day] || [];
            const dayPnL = dayTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
            console.log(`  Day ${day}: ${dayTrades.length} trades, P&L: $${dayPnL.toFixed(2)} (${(dayPnL / tracker.startBalance * 100).toFixed(2)}%)`);
        });
        
        console.log('Progress Summary:', tracker.getProgressSummary());
        console.log('Order Manager Balance:', window.chart?.orderManager?.balance);
        console.log('Order Manager Closed Positions:', window.chart?.orderManager?.closedPositions?.length);
        
        // Force UI update
        tracker.updateUI();
    };
    
    // Manual sync function
    window.syncPropFirmTracker = function() {
        if (!window.propFirmTracker) {
            console.log('❌ Prop Firm Tracker not initialized');
            return;
        }
        
        // Reload session
        const success = window.propFirmTracker.loadSession();
        if (!success) {
            console.log('⚠️ Not a prop firm session or session not found');
            return;
        }

        const om = window.chart && window.chart.orderManager;
        const DEFAULT_OM_START = 10000;
        let sessionStartFromStorage = NaN;
        try {
            const raw = userStorage.getItem('backtestingSession');
            if (raw) {
                const s = JSON.parse(raw);
                sessionStartFromStorage = Number.parseFloat(s.startBalance ?? s.balance);
            }
        } catch (e) {}
        const omInit = om ? om.initialBalance : NaN;
        // Timed sync can run before checkBacktestingMode() finishes — OM may still be at default $10k while
        // localStorage has the real challenge size. Do not copy that default onto the tracker.
        const sessionNotAppliedToOmYet =
            Number.isFinite(omInit) && omInit === DEFAULT_OM_START &&
            Number.isFinite(sessionStartFromStorage) && sessionStartFromStorage > 0 &&
            Math.abs(sessionStartFromStorage - omInit) > 0.01;

        if (om && Number.isFinite(omInit) && omInit > 0 && !sessionNotAppliedToOmYet) {
            window.propFirmTracker.startBalance = omInit;
            window.propFirmTracker._applyPhaseRulesFromSession(
                window.propFirmTracker.sessionData,
                window.propFirmTracker.currentPhase || 1
            );
        }

        if (!om) {
            return;
        }

        if (sessionNotAppliedToOmYet) {
            window.propFirmTracker.currentBalance = window.propFirmTracker.startBalance;
            window.propFirmTracker.peakBalance = window.propFirmTracker.startBalance;
            window.propFirmTracker.updateUI();
            return;
        }

        // Sync balance
        {
            const orderBalance = window.chart.orderManager.balance;
            
            // IMPORTANT: Don't override start balance - it should stay as configured
            // Only update current and peak balance
            window.propFirmTracker.currentBalance = orderBalance;
            window.propFirmTracker.peakBalance = Math.max(window.propFirmTracker.startBalance, orderBalance);
            
            // Import existing trades (avoid duplicates)
            const closedPositions = window.chart.orderManager.closedPositions || [];
            console.log(`📥 Importing ${closedPositions.length} closed positions...`);
            closedPositions.forEach((trade, index) => {
                const tradeTimestamp = trade.closeTime || Date.now();
                console.log(`  Trade #${index + 1}: ID=${trade.id}, P&L=$${trade.pnl?.toFixed(2)}, Time=${new Date(tradeTimestamp).toISOString()}`);
                window.propFirmTracker.recordTrade({
                    id: trade.id,
                    type: trade.type,
                    openPrice: trade.openPrice,
                    closePrice: trade.closePrice,
                    openTime: trade.openTime,
                    closeTime: tradeTimestamp,
                    timestamp: tradeTimestamp,
                    quantity: trade.quantity,
                    profit: trade.pnl,
                    pnl: trade.pnl
                }, { isImport: true }); // Mark as import to prevent modal trigger
            });
            
            console.log('✅ Synced tracker with:', {
                startBalance: window.propFirmTracker.startBalance,
                currentBalance: orderBalance,
                peakBalance: window.propFirmTracker.peakBalance,
                profitPercent: window.propFirmTracker.getProfitPercent().toFixed(2) + '%',
                closedTrades: closedPositions.length
            });
            
            window.propFirmTracker.updateUI();
        }
    };
    
    // Auto-sync with delays to ensure everything is loaded
    setTimeout(() => {
        if (window.chart && window.chart.orderManager && window.propFirmTracker) {
            window.syncPropFirmTracker();
        }
    }, 1000);
    
    setTimeout(() => {
        if (window.chart && window.chart.orderManager && window.propFirmTracker) {
            window.syncPropFirmTracker();
        }
    }, 3000);
    
    console.log('✅ Prop Firm Tracker initialized');
    console.log('💡 Use debugPropFirmTracker() to check status');
    console.log('💡 Use syncPropFirmTracker() to manually sync with order manager');
    console.log('💡 Use testChallengeFailedModal() to test failure modal');
    console.log('💡 Use testChallengePassedModal() to test success modal');
}

// Global functions for modal buttons
window.exitToSessionDashboard = function() {
    console.log('🚪 Exiting to dashboard...');
    
    // Clear the session (optional - user may want to review it later)
    // localStorage.removeItem('backtestingSession');
    
    // Redirect to homepage
    window.location.href = '/';
};

window.continueTrading = function() {
    console.log('✅ Continuing trading...');
    
    const modal = document.getElementById('challengePassedModal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    // Resume replay if it was active
    if (window.chart && window.chart.replaySystem && window.chart.replaySystem.isActive) {
        window.chart.replaySystem.play();
    }
};

// Test functions to manually trigger modals
window.testChallengeFailedModal = function() {
    console.log('🧪 Testing Challenge Failed Modal...');
    if (window.propFirmTracker) {
        window.propFirmTracker.showChallengeFailedModal('Daily Loss Limit');
    } else {
        console.error('❌ Prop Firm Tracker not initialized');
    }
};

window.testChallengePassedModal = function() {
    console.log('🧪 Testing Challenge Passed Modal...');
    if (window.propFirmTracker) {
        window.propFirmTracker.showChallengePassedModal();
    } else {
        console.error('❌ Prop Firm Tracker not initialized');
    }
};

console.log('✅ Prop Firm Tracker module loaded');
