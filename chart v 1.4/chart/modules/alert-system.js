/**
 * Alert System Module
 * TradingView-style price alerts with visual lines, notifications, and sounds
 */

function injectAlertSystemStyles() {
    // Always refresh — drop legacy navy/glow alert chrome so Obsidian tokens win.
    document.querySelectorAll('style#alert-system-styles, style#alert-system-styles-v2').forEach((el) => el.remove());
    const style = document.createElement('style');
    style.id = 'alert-system-styles-v2';
    style.textContent = `
/* ── Create / Edit Alert — Obsidian chrome ── */
.talaria-alert-overlay {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 100050;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: var(--overlay, rgba(0, 0, 0, 0.55));
    font-family: var(--font-ui, "Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif);
    color: var(--text, #f4f4f5);
}
.talaria-alert-overlay[data-v9-chrome] button,
.talaria-alert-overlay[data-v9-chrome] [role="button"] {
    cursor: default !important;
}
[data-alert-win] {
    width: min(420px, 100%);
    max-height: min(88vh, 640px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius-panel, 8px);
    background: var(--surface, #0a0a0b) !important;
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22)) !important;
    box-shadow: none !important;
    filter: none !important;
    color: var(--text, #f4f4f5);
    animation: tlrAlertIn 0.16s ease-out;
}
@keyframes tlrAlertIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}
[data-alert-win] [data-win-header] {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    background: var(--surface, #0a0a0b);
    flex-shrink: 0;
}
[data-alert-win] [data-win-icon] {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-quiet, rgba(48, 144, 255, 0.16));
    color: var(--accent, #3090ff);
    flex-shrink: 0;
}
[data-alert-win] [data-win-icon] svg { width: 16px; height: 16px; display: block; }
[data-alert-win] [data-win-title-wrap] {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
[data-alert-win] [data-win-title] {
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--text, #f4f4f5);
    line-height: 1.2;
}
[data-alert-win] [data-win-sub] {
    font-size: 11px;
    font-weight: 550;
    color: var(--text-faint, rgba(244, 244, 245, 0.45));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
[data-alert-win] [data-win-close] {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, rgba(244, 244, 245, 0.64));
    padding: 0;
    flex-shrink: 0;
}
[data-alert-win] [data-win-close]:hover {
    background: var(--surface-raised, #141416);
    color: var(--text, #f4f4f5);
}
[data-alert-win] [data-win-close] svg { width: 14px; height: 14px; display: block; }
[data-alert-win] [data-alert-body] {
    padding: 14px;
    overflow-x: hidden;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
[data-alert-win] [data-alert-row] {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
[data-alert-win] [data-alert-field] {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
[data-alert-win] [data-alert-field][data-span="2"] { grid-column: 1 / -1; }
[data-alert-win] [data-alert-field] > label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint, rgba(244, 244, 245, 0.45));
}
[data-alert-win] [data-alert-input],
[data-alert-win] [data-alert-select] {
    width: 100%;
    box-sizing: border-box;
    height: 34px;
    padding: 0 10px;
    background: var(--surface-sunken, #050505);
    color: var(--text, #f4f4f5);
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    border-radius: var(--radius-control, 6px);
    font: inherit;
    font-size: 13px;
    font-weight: 550;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
}
[data-alert-win] [data-alert-select] {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23a2a1cd' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
}
[data-alert-win] [data-alert-input]:focus,
[data-alert-win] [data-alert-select]:focus {
    border-color: color-mix(in oklab, var(--accent, #3090ff) 55%, var(--line, rgba(162,161,205,0.22)));
    background: var(--surface-raised, #141416);
}
[data-alert-win] [data-alert-input][readonly] {
    color: var(--text-muted, rgba(244, 244, 245, 0.64));
    background: var(--surface, #0a0a0b);
}
[data-alert-win] [data-alert-input]::placeholder {
    color: var(--text-faint, rgba(244, 244, 245, 0.4));
}
[data-alert-win] [data-alert-price] {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
}
[data-alert-win] [data-alert-swatches] {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}
[data-alert-win] [data-alert-swatch] {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    padding: 0;
    background: var(--swatch, #ff9800);
    flex-shrink: 0;
}
[data-alert-win] [data-alert-swatch]:hover {
    border-color: var(--line-strong, rgba(162, 161, 205, 0.42));
}
[data-alert-win] [data-alert-swatch][data-on="1"] {
    border-color: var(--text, #f4f4f5);
    outline: 1px solid color-mix(in oklab, var(--text, #f4f4f5) 35%, transparent);
    outline-offset: 1px;
}
[data-alert-win] [data-alert-swatch][data-custom] {
    position: relative;
    overflow: hidden;
    background: var(--swatch, var(--surface-raised, #141416));
}
[data-alert-win] [data-alert-swatch][data-custom]::after {
    content: "+";
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-muted, rgba(244,244,245,0.64));
    pointer-events: none;
}
[data-alert-win] [data-alert-swatch][data-custom][data-on="1"]::after {
    color: var(--text, #f4f4f5);
}
[data-alert-win] [data-alert-swatch][data-custom] input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    border: none;
    padding: 0;
    cursor: default;
}
[data-alert-win] [data-alert-togs] {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
[data-alert-win] [data-alert-tog] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    background: var(--surface, #0a0a0b);
    color: var(--text-muted, rgba(244, 244, 245, 0.64));
    font: inherit;
    font-size: 12px;
    font-weight: 600;
}
[data-alert-win] [data-alert-tog]:hover {
    background: var(--surface-raised, #141416);
    color: var(--text, #f4f4f5);
}
[data-alert-win] [data-alert-tog][data-on="1"] {
    background: var(--accent-quiet, rgba(48, 144, 255, 0.16));
    border-color: color-mix(in oklab, var(--accent, #3090ff) 35%, var(--line, rgba(162,161,205,0.22)));
    color: var(--accent, #3090ff);
}
[data-alert-win] [data-alert-tog] i {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
[data-alert-win] [data-alert-tog] i svg { width: 14px; height: 14px; display: block; }
[data-alert-win] [data-win-foot] {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    background: var(--surface, #0a0a0b);
    flex-shrink: 0;
}
[data-alert-win] [data-alert-btn] {
    height: 32px;
    padding: 0 14px;
    border-radius: var(--radius-cta, 6px);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid transparent;
}
[data-alert-win] [data-alert-btn="ghost"] {
    background: transparent;
    border-color: var(--line, rgba(162, 161, 205, 0.22));
    color: var(--text-muted, rgba(244, 244, 245, 0.64));
}
[data-alert-win] [data-alert-btn="ghost"]:hover {
    background: var(--surface-raised, #141416);
    color: var(--text, #f4f4f5);
}
[data-alert-win] [data-alert-btn="primary"] {
    background: var(--cta-bg, #ffffff);
    color: var(--cta-fg, #000000);
    border-color: var(--cta-bg, #ffffff);
}
[data-alert-win] [data-alert-btn="primary"]:hover {
    background: var(--cta-hover, #ebe9fe);
    border-color: var(--cta-hover, #ebe9fe);
}
/* Context menu + toast — same Obsidian surface */
.alert-context-menu {
    position: fixed;
    min-width: 180px;
    max-height: calc(100vh - 16px);
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px 0 6px;
    background: var(--surface, #0a0a0b);
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    border-radius: 8px;
    box-shadow: none;
    z-index: 100001;
    font-family: var(--font-ui, "Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif);
    font-size: 12px;
}
.alert-context-menu::before { content: none; display: none; }
.alert-context-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 1px 4px;
    padding: 7px 10px;
    border-radius: 6px;
    color: var(--text-muted, rgba(244, 244, 245, 0.64));
    cursor: default;
}
.alert-context-item:hover {
    background: var(--surface-raised, #141416);
    color: var(--text, #f4f4f5);
}
.alert-notification {
    position: fixed;
    top: 20px;
    right: 70px;
    max-width: 320px;
    background: var(--surface, #0a0a0b);
    border: 1px solid var(--line, rgba(162, 161, 205, 0.22));
    border-radius: 8px;
    box-shadow: none;
    z-index: 100003;
    opacity: 0;
    transform: translateX(12px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-sizing: border-box;
    font-family: var(--font-ui, "Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif);
    overflow: hidden;
}
.alert-notification.show { opacity: 1; transform: translateX(0); }
.alert-notification-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border-bottom: 1px solid var(--line, rgba(162, 161, 205, 0.22));
}
.alert-notification-icon { font-size: 14px; color: var(--warn, #e8b84a); }
.alert-notification-symbol { flex: 1; font-weight: 700; color: var(--text, #f4f4f5); font-size: 12px; }
.alert-notification-close {
    width: 24px; height: 24px; border: none; background: transparent;
    color: var(--text-faint, rgba(244,244,245,0.45)); font-size: 16px; cursor: default;
    border-radius: 6px;
}
.alert-notification-close:hover {
    background: var(--surface-raised, #141416);
    color: var(--text, #f4f4f5);
}
.alert-notification-body { padding: 9px 10px 11px; }
.alert-notification-message { font-size: 12px; color: var(--text-muted, rgba(244,244,245,0.64)); margin-bottom: 6px; }
.alert-notification-price { font-size: 11px; color: var(--text-faint, rgba(244,244,245,0.45)); font-variant-numeric: tabular-nums; }
.alert-notification-price span:last-child { color: var(--warn, #e8b84a); font-weight: 700; }
`;
    document.head.appendChild(style);
}

class AlertSystem {
    constructor(chart) {
        this.chart = chart;
        this.alerts = [];
        this.storageKey = 'chart_alerts';
        this.isVisible = false;
        this.alertSound = null;
        this.checkInterval = null;
        this.lastPrices = {}; // Track last prices for crossing detection
        
        // Alert conditions
        this.conditions = {
            CROSSING: 'crossing',
            CROSSING_UP: 'crossing_up',
            CROSSING_DOWN: 'crossing_down',
            GREATER_THAN: 'greater_than',
            LESS_THAN: 'less_than',
            ENTERING_CHANNEL: 'entering_channel',
            EXITING_CHANNEL: 'exiting_channel'
        };
        
        // Alert expiration options
        this.expirations = {
            ONCE: 'once',
            EVERY_TIME: 'every_time',
            ONCE_PER_BAR: 'once_per_bar'
        };
        
        this.init();
    }
    
    init() {
        console.log('🔔 Initializing Alert System...');

        injectAlertSystemStyles();
        this.loadAlerts();
        this.setupUI();
        this.setupEventListeners();
        // M20-Q8: start only when alerts exist (kill-switch restores always-on 500ms).
        this.startAlertChecker();
        this.initAlertSound();
        
        console.log('✅ Alert System initialized with', this.alerts.length, 'alerts');
    }

    /**
     * M20-Q8 — default ON. Kill-switch:
     *   window.__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1 = true
     */
    _m20Q8AlertCheckerIdleFixEnabled() {
        return typeof window === 'undefined'
            || window.__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1 !== true;
    }

    /** Keep the 500ms checker running iff there is at least one alert (fix ON). */
    syncAlertCheckerWithAlerts() {
        if (!this._m20Q8AlertCheckerIdleFixEnabled()) {
            // Legacy owns one always-on checker created during init. New alert
            // mutations must not add extra intervals while the fix is disabled.
            return;
        }
        this._m20Q8InstallTransactionalOwnership();
        return this._m20Q8ReconcileAlertChecker();
    }

    _m20Q8InstallTransactionalOwnership() {
        if (Object.prototype.hasOwnProperty.call(this, '_m20Q8CheckerHandles')) return;

        Object.defineProperty(this, '_m20Q8CheckerHandles', {
            configurable: true,
            enumerable: false,
            writable: false,
            value: new Set()
        });

        const aliases = {
            createAlert: '_m20Q8CreateAlertTransactional',
            updateAlert: '_m20Q8UpdateAlertTransactional',
            deleteAlert: '_m20Q8DeleteAlertTransactional',
            toggleAlert: '_m20Q8ToggleAlertTransactional',
            clearAllAlerts: '_m20Q8ClearAllAlertsTransactional',
            startAlertChecker: '_m20Q8StartAlertCheckerTransactional',
            stopAlertChecker: '_m20Q8StopAlertCheckerTransactional',
            syncAlertCheckerWithAlerts: '_m20Q8SyncAlertCheckerTransactional'
        };
        Object.entries(aliases).forEach(([publicName, fixedName]) => {
            Object.defineProperty(this, publicName, {
                configurable: true,
                enumerable: false,
                writable: true,
                value: this[fixedName]
            });
        });
    }

    _m20Q8ReportSecondaryFailure(context, error) {
        try {
            console.error(`[M20-Q8] ${context}`, error);
        } catch (_) {
            // Diagnostics must never replace the operation's primary exception.
        }
    }

    _m20Q8CaptureCheckerOwnership() {
        const handles = this._m20Q8CheckerHandles instanceof Set
            ? [...this._m20Q8CheckerHandles]
            : [];
        return {
            checkInterval: this.checkInterval == null ? null : this.checkInterval,
            handles
        };
    }

    _m20Q8ClearCheckerHandle(handle) {
        let firstError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                clearInterval(handle);
                return;
            } catch (error) {
                if (!firstError) firstError = error;
            }
        }
        throw firstError;
    }

    _m20Q8RestoreCheckerOwnership(snapshot) {
        const ledger = this._m20Q8CheckerHandles;
        let firstError = null;
        if (!(ledger instanceof Set)) return;

        for (const handle of [...ledger]) {
            if (snapshot.handles.includes(handle)) continue;
            try {
                this._m20Q8ClearCheckerHandle(handle);
                ledger.delete(handle);
            } catch (error) {
                if (!firstError) firstError = error;
            }
        }

        try {
            ledger.clear();
            snapshot.handles.forEach((handle) => ledger.add(handle));
            this.checkInterval = snapshot.checkInterval;
        } catch (error) {
            if (!firstError) firstError = error;
        }

        if (firstError) throw firstError;
    }

    _m20Q8StartOwnedChecker() {
        const ledger = this._m20Q8CheckerHandles;
        let handle = null;
        try {
            handle = setInterval(() => {
                this.checkAlerts();
            }, 500);
            if (handle == null) throw new Error('Alert checker did not return a timer handle');
            ledger.add(handle);
            this.checkInterval = handle;
            return handle;
        } catch (error) {
            if (handle != null) {
                try {
                    this._m20Q8ClearCheckerHandle(handle);
                } catch (clearError) {
                    this._m20Q8ReportSecondaryFailure('failed to clear rejected checker start', clearError);
                }
                ledger.delete(handle);
            }
            throw error;
        }
    }

    _m20Q8ApplyCheckerOwnership(desiredRunning) {
        const ledger = this._m20Q8CheckerHandles;
        const primary = this.checkInterval == null ? null : this.checkInterval;

        if (primary != null && !ledger.has(primary)) {
            this._m20Q8ClearCheckerHandle(primary);
            this.checkInterval = null;
        }

        if (!desiredRunning) {
            const handles = [...ledger];
            for (const handle of handles) {
                this._m20Q8ClearCheckerHandle(handle);
                ledger.delete(handle);
            }
            this.checkInterval = null;
            return null;
        }

        if (ledger.size === 0) {
            return this._m20Q8StartOwnedChecker();
        }

        const handles = [...ledger];
        const keeper = ledger.has(this.checkInterval) ? this.checkInterval : handles[0];
        for (const handle of handles) {
            if (handle === keeper) continue;
            this._m20Q8ClearCheckerHandle(handle);
            ledger.delete(handle);
        }
        this.checkInterval = keeper;
        return keeper;
    }

    _m20Q8ReconcileAlertChecker(desiredRunning) {
        const desired = typeof desiredRunning === 'boolean'
            ? desiredRunning
            : !!(this.alerts && this.alerts.length > 0);
        const before = this._m20Q8CaptureCheckerOwnership();
        try {
            return this._m20Q8ApplyCheckerOwnership(desired);
        } catch (error) {
            try {
                this._m20Q8RestoreCheckerOwnership(before);
            } catch (restoreError) {
                this._m20Q8ReportSecondaryFailure('checker ownership rollback failed', restoreError);
            }
            throw error;
        }
    }

    _m20Q8DescriptorsEqual(left, right) {
        const leftKeys = Reflect.ownKeys(left);
        const rightKeys = Reflect.ownKeys(right);
        if (leftKeys.length !== rightKeys.length) return false;
        for (const key of leftKeys) {
            if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
            const a = left[key];
            const b = right[key];
            if (
                a.configurable !== b.configurable
                || a.enumerable !== b.enumerable
                || a.writable !== b.writable
                || a.value !== b.value
                || a.get !== b.get
                || a.set !== b.set
            ) {
                return false;
            }
        }
        return true;
    }

    _m20Q8CaptureAlertState() {
        const alertsRef = this.alerts;
        const entries = Array.prototype.slice.call(alertsRef);
        const seen = new Set();
        const objects = [];
        entries.forEach((entry) => {
            if (!entry || (typeof entry !== 'object' && typeof entry !== 'function') || seen.has(entry)) {
                return;
            }
            seen.add(entry);
            objects.push({
                object: entry,
                descriptors: Object.getOwnPropertyDescriptors(entry)
            });
        });
        return { alertsRef, entries, objects };
    }

    _m20Q8AlertStateEquals(snapshot) {
        if (this.alerts !== snapshot.alertsRef) return false;
        if (this.alerts.length !== snapshot.entries.length) return false;
        for (let index = 0; index < snapshot.entries.length; index += 1) {
            if (this.alerts[index] !== snapshot.entries[index]) return false;
        }
        for (const record of snapshot.objects) {
            if (!this._m20Q8DescriptorsEqual(
                Object.getOwnPropertyDescriptors(record.object),
                record.descriptors
            )) {
                return false;
            }
        }
        return true;
    }

    _m20Q8RestoreAlertState(snapshot) {
        for (const record of snapshot.objects) {
            const currentKeys = Reflect.ownKeys(record.object);
            for (const key of currentKeys) {
                if (Object.prototype.hasOwnProperty.call(record.descriptors, key)) continue;
                if (!Reflect.deleteProperty(record.object, key)) {
                    throw new Error(`Unable to remove partial alert property ${String(key)}`);
                }
            }
            Object.defineProperties(record.object, record.descriptors);
        }

        if (this.alerts !== snapshot.alertsRef) {
            this.alerts = snapshot.alertsRef;
        }
        Array.prototype.splice.call(
            snapshot.alertsRef,
            0,
            snapshot.alertsRef.length,
            ...snapshot.entries
        );
    }

    _m20Q8SaveAlertsTransactionally() {
        const beforeSave = this._m20Q8CaptureAlertState();
        try {
            return this.saveAlerts();
        } catch (error) {
            try {
                if (!this._m20Q8AlertStateEquals(beforeSave)) {
                    this._m20Q8RestoreAlertState(beforeSave);
                }
            } catch (restoreError) {
                this._m20Q8ReportSecondaryFailure('partial save rollback failed', restoreError);
            }
            throw error;
        }
    }

    _m20Q8RunAlertMutation(mutate, effects) {
        const beforeState = this._m20Q8CaptureAlertState();
        const beforeOwnership = this._m20Q8CaptureCheckerOwnership();
        let mutationReturned = false;
        let mutationChanged = false;
        let primaryError = null;
        let result;

        try {
            mutate();
            mutationReturned = true;
            mutationChanged = !this._m20Q8AlertStateEquals(beforeState);
            result = effects();
        } catch (error) {
            primaryError = error;
        }

        if (!mutationReturned) {
            try {
                if (!this._m20Q8AlertStateEquals(beforeState)) {
                    this._m20Q8RestoreAlertState(beforeState);
                }
            } catch (restoreError) {
                this._m20Q8ReportSecondaryFailure('partial mutation rollback failed', restoreError);
            }
            throw primaryError;
        }

        if (mutationChanged) {
            try {
                this._m20Q8ReconcileAlertChecker();
            } catch (reconcileError) {
                try {
                    this._m20Q8RestoreAlertState(beforeState);
                } catch (restoreError) {
                    this._m20Q8ReportSecondaryFailure('alert state rollback failed', restoreError);
                }
                try {
                    this._m20Q8RestoreCheckerOwnership(beforeOwnership);
                } catch (restoreError) {
                    this._m20Q8ReportSecondaryFailure('checker rollback after mutation failed', restoreError);
                }
                if (primaryError) {
                    this._m20Q8ReportSecondaryFailure('checker reconciliation failed', reconcileError);
                    throw primaryError;
                }
                throw reconcileError;
            }
        }

        if (primaryError) throw primaryError;
        return result;
    }

    _m20Q8CreateAlertTransactional(options) {
        const alert = {
            id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            symbol: options.symbol || this.getSymbolName(),
            price: parseFloat(options.price),
            condition: options.condition || this.conditions.CROSSING,
            message: options.message || `Price ${options.condition || 'crossing'} ${options.price}`,
            expiration: options.expiration || this.expirations.EVERY_TIME,
            active: true,
            triggered: false,
            triggeredCount: 0,
            lastTriggeredBar: null,
            color: options.color || '#ff9800',
            lineStyle: options.lineStyle || 'dashed',
            showPopup: options.showPopup !== false,
            playSound: options.playSound !== false,
            createdAt: Date.now(),
            upperPrice: options.upperPrice || null,
            lowerPrice: options.lowerPrice || null
        };

        return this._m20Q8RunAlertMutation(
            () => {
                this.alerts.push(alert);
            },
            () => {
                this._m20Q8SaveAlertsTransactionally();
                this.renderAlertLines();
                this.refreshAlertsList();
                this.updateBadge();
                if (this.chart && typeof this.chart.showNotification === 'function') {
                    this.chart.showNotification(`Alert created at ${this.formatPrice(alert.price)} ✓`);
                }
                console.log('🔔 Alert created:', alert);
                return alert;
            }
        );
    }

    _m20Q8UpdateAlertTransactional(alertId, updates) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (!alert) return;
        return this._m20Q8RunAlertMutation(
            () => {
                Object.assign(alert, updates);
            },
            () => {
                this._m20Q8SaveAlertsTransactionally();
                this.renderAlertLines();
                this.refreshAlertsList();
                console.log('🔔 Alert updated:', alert);
            }
        );
    }

    _m20Q8DeleteAlertTransactional(alertId) {
        const index = this.alerts.findIndex(a => a.id === alertId);
        if (index < 0) return;
        return this._m20Q8RunAlertMutation(
            () => {
                this.alerts.splice(index, 1);
            },
            () => {
                this._m20Q8SaveAlertsTransactionally();
                this.renderAlertLines();
                this.refreshAlertsList();
                this.updateBadge();
                if (this.chart && typeof this.chart.showNotification === 'function') {
                    this.chart.showNotification('Alert deleted');
                }
            }
        );
    }

    _m20Q8ToggleAlertTransactional(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (!alert) return;
        return this._m20Q8RunAlertMutation(
            () => {
                alert.active = !alert.active;
            },
            () => {
                this._m20Q8SaveAlertsTransactionally();
                this.renderAlertLines();
                this.refreshAlertsList();
                this.updateBadge();
            }
        );
    }

    _m20Q8ClearAllAlertsTransactional() {
        if (!confirm('Delete all alerts? This cannot be undone.')) return;
        return this._m20Q8RunAlertMutation(
            () => {
                this.alerts = [];
            },
            () => {
                this._m20Q8SaveAlertsTransactionally();
                this.renderAlertLines();
                this.refreshAlertsList();
                this.updateBadge();
            }
        );
    }

    _m20Q8StartAlertCheckerTransactional() {
        return this._m20Q8ReconcileAlertChecker();
    }

    _m20Q8StopAlertCheckerTransactional() {
        return this._m20Q8ReconcileAlertChecker(false);
    }

    _m20Q8SyncAlertCheckerTransactional() {
        return this._m20Q8ReconcileAlertChecker();
    }
    
    /**
     * Initialize alert sound
     */
    initAlertSound() {
        // Create audio context for alert sounds
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio context not available');
        }
    }
    
    /**
     * Play alert sound
     */
    playAlertSound(type = 'default') {
        if (!this.audioContext) return;
        
        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Different sounds for different alert types
            switch (type) {
                case 'crossing_up':
                    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(1100, this.audioContext.currentTime + 0.1);
                    break;
                case 'crossing_down':
                    oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime + 0.1);
                    break;
                default:
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            }
            
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (e) {
            console.warn('Could not play alert sound:', e);
        }
    }
    
    /**
     * Setup UI elements
     */
    setupUI() {
        this.iconBtn = document.getElementById('alertsIconBtn');
        this.panel = document.getElementById('alertsContent');
        this.alertsList = document.getElementById('alertsList');
        this.alertBadge = document.getElementById('alertsBadge');
        
        // Create alert lines container if not exists
        if (!this.chart.svg.select('#alertLinesGroup').node()) {
            this.chart.svg.append('g')
                .attr('id', 'alertLinesGroup')
                .attr('class', 'alert-lines-group')
                .style('pointer-events', 'all');
        } else {
            // Ensure pointer-events is enabled
            this.chart.svg.select('#alertLinesGroup')
                .style('pointer-events', 'all');
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Icon button click
        if (this.iconBtn) {
            this.iconBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }
        
        // Add alert button
        const addAlertBtn = document.getElementById('addAlertBtn');
        if (addAlertBtn) {
            addAlertBtn.addEventListener('click', () => {
                this.showCreateAlertModal();
            });
        }
        
        // Close panel button
        const closeBtn = document.getElementById('closeAlertsPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hidePanel();
            });
        }
        
        // Listen for chart context menu events
        document.addEventListener('chartContextMenu', (e) => {
            if (e.detail && e.detail.price) {
                this.addContextMenuOption(e.detail);
            }
        });
    }
    
    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (this.isVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }
    
    /**
     * Show alerts panel
     */
    showPanel() {
        const unifiedPanel = document.getElementById('unifiedRightPanel');
        const panelTitle = document.getElementById('unifiedPanelTitle');
        
        // Hide all content panels
        document.querySelectorAll('.unified-panel-content').forEach(c => {
            c.classList.remove('active');
        });
        
        // Remove active from all sidebar buttons
        document.querySelectorAll('.right-sidebar-icon-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show alerts content
        if (this.panel) {
            this.panel.classList.add('active');
        }
        
        // Show unified panel
        if (unifiedPanel) {
            unifiedPanel.classList.add('visible');
        }
        
        // Update title
        if (panelTitle) {
            panelTitle.textContent = 'Alerts';
        }
        
        // Mark button as active
        if (this.iconBtn) {
            this.iconBtn.classList.add('active');
        }
        
        this.isVisible = true;
        this.refreshAlertsList();
    }
    
    /**
     * Hide alerts panel
     */
    hidePanel() {
        const unifiedPanel = document.getElementById('unifiedRightPanel');
        
        if (this.panel) {
            this.panel.classList.remove('active');
        }
        
        if (unifiedPanel) {
            unifiedPanel.classList.remove('visible');
        }
        
        if (this.iconBtn) {
            this.iconBtn.classList.remove('active');
        }
        
        this.isVisible = false;
    }
    
    /**
     * Create a new alert
     */
    createAlert(options) {
        const alert = {
            id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            symbol: options.symbol || this.getSymbolName(),
            price: parseFloat(options.price),
            condition: options.condition || this.conditions.CROSSING,
            message: options.message || `Price ${options.condition || 'crossing'} ${options.price}`,
            expiration: options.expiration || this.expirations.EVERY_TIME,
            active: true,
            triggered: false,
            triggeredCount: 0,
            lastTriggeredBar: null,
            color: options.color || '#ff9800',
            lineStyle: options.lineStyle || 'dashed',
            showPopup: options.showPopup !== false,
            playSound: options.playSound !== false,
            createdAt: Date.now(),
            upperPrice: options.upperPrice || null,
            lowerPrice: options.lowerPrice || null
        };
        
        this.alerts.push(alert);
        this.saveAlerts();
        this.renderAlertLines();
        this.refreshAlertsList();
        this.updateBadge();
        if (typeof this.syncAlertCheckerWithAlerts === 'function') {
            this.syncAlertCheckerWithAlerts();
        }
        
        if (this.chart && typeof this.chart.showNotification === 'function') {
            this.chart.showNotification(`Alert created at ${this.formatPrice(alert.price)} ✓`);
        }
        
        console.log('🔔 Alert created:', alert);
        return alert;
    }
    
    /**
     * Get current symbol name
     */
    getSymbolName() {
        const ch = this.chart;
        if (!ch) return 'SYMBOL';

        const sym = ch.currentSymbol;
        if (sym != null && String(sym).trim()) {
            return String(sym).trim();
        }

        const fileId = ch.currentFileId;
        if (fileId != null && fileId !== '') {
            const raw = String(fileId);
            if (raw.includes('_')) {
                const tail = raw.split('_').pop();
                if (tail) return tail;
            }
            if (!/^\d+$/.test(raw)) return raw;
        }

        try {
            const el = document.getElementById('ohlcSymbol')
                || document.querySelector('[id^="ohlcSymbol"]');
            if (el && el.textContent && el.textContent.trim()) {
                return el.textContent.trim();
            }
        } catch (_) {}

        return 'SYMBOL';
    }
    
    /**
     * Update an existing alert
     */
    updateAlert(alertId, updates) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            Object.assign(alert, updates);
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            console.log('🔔 Alert updated:', alert);
        }
    }
    
    /**
     * Delete an alert
     */
    deleteAlert(alertId) {
        const index = this.alerts.findIndex(a => a.id === alertId);
        if (index > -1) {
            this.alerts.splice(index, 1);
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
            if (typeof this.syncAlertCheckerWithAlerts === 'function') {
                this.syncAlertCheckerWithAlerts();
            }
            
            if (this.chart && typeof this.chart.showNotification === 'function') {
                this.chart.showNotification('Alert deleted');
            }
        }
    }
    
    /**
     * Toggle alert active state
     */
    toggleAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.active = !alert.active;
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
        }
    }
    
    /**
     * Check all alerts against current price
     */
    checkAlerts() {
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) return;
        
        const currentBar = this.chart.data[this.chart.data.length - 1];
        const currentPrice = currentBar.c;
        const symbol = this.getSymbolName();
        
        // Get last price for crossing detection
        const lastPrice = this.lastPrices[symbol] || currentPrice;
        
        this.alerts.forEach(alert => {
            if (!alert.active) return;
            
            let triggered = false;
            let triggerType = null;
            
            switch (alert.condition) {
                case this.conditions.CROSSING:
                    if ((lastPrice < alert.price && currentPrice >= alert.price) ||
                        (lastPrice > alert.price && currentPrice <= alert.price)) {
                        triggered = true;
                        triggerType = currentPrice > lastPrice ? 'crossing_up' : 'crossing_down';
                    }
                    break;
                    
                case this.conditions.CROSSING_UP:
                    if (lastPrice < alert.price && currentPrice >= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_up';
                    }
                    break;
                    
                case this.conditions.CROSSING_DOWN:
                    if (lastPrice > alert.price && currentPrice <= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_down';
                    }
                    break;
                    
                case this.conditions.GREATER_THAN:
                    if (currentPrice > alert.price && lastPrice <= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_up';
                    }
                    break;
                    
                case this.conditions.LESS_THAN:
                    if (currentPrice < alert.price && lastPrice >= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_down';
                    }
                    break;
                    
                case this.conditions.ENTERING_CHANNEL:
                    if (alert.upperPrice && alert.lowerPrice) {
                        const wasOutside = lastPrice > alert.upperPrice || lastPrice < alert.lowerPrice;
                        const isInside = currentPrice <= alert.upperPrice && currentPrice >= alert.lowerPrice;
                        if (wasOutside && isInside) {
                            triggered = true;
                            triggerType = 'default';
                        }
                    }
                    break;
                    
                case this.conditions.EXITING_CHANNEL:
                    if (alert.upperPrice && alert.lowerPrice) {
                        const wasInside = lastPrice <= alert.upperPrice && lastPrice >= alert.lowerPrice;
                        const isOutside = currentPrice > alert.upperPrice || currentPrice < alert.lowerPrice;
                        if (wasInside && isOutside) {
                            triggered = true;
                            triggerType = currentPrice > alert.upperPrice ? 'crossing_up' : 'crossing_down';
                        }
                    }
                    break;
            }
            
            // Handle trigger based on expiration type
            if (triggered) {
                const currentBarTime = currentBar.t;
                
                if (alert.expiration === this.expirations.ONCE && alert.triggered) {
                    return; // Already triggered, ignore
                }
                
                if (alert.expiration === this.expirations.ONCE_PER_BAR && 
                    alert.lastTriggeredBar === currentBarTime) {
                    return; // Already triggered this bar
                }
                
                // Trigger the alert
                this.triggerAlert(alert, currentPrice, triggerType);
                alert.triggered = true;
                alert.triggeredCount++;
                alert.lastTriggeredBar = currentBarTime;
                
                // Deactivate if one-time alert
                if (alert.expiration === this.expirations.ONCE) {
                    alert.active = false;
                }
                
                this.saveAlerts();
                this.refreshAlertsList();
                this.updateBadge();
            }
        });
        
        // Update last price
        this.lastPrices[symbol] = currentPrice;
    }
    
    /**
     * Trigger an alert (show notification, play sound)
     */
    triggerAlert(alert, currentPrice, triggerType) {
        console.log('🔔 ALERT TRIGGERED:', alert.message, 'at price', currentPrice);
        
        // Play sound
        if (alert.playSound) {
            this.playAlertSound(triggerType);
        }
        
        // Show popup notification
        if (alert.showPopup) {
            this.showAlertNotification(alert, currentPrice);
        }
        
        // Flash the alert line
        this.flashAlertLine(alert);
        
        // Browser notification (if permitted)
        this.showBrowserNotification(alert, currentPrice);
    }
    
    /**
     * Show alert notification popup
     */
    showAlertNotification(alert, currentPrice) {
        const wrap = document.createElement('div');
        wrap.className = 'tlr-alert-toast-wrap';

        const notification = document.createElement('div');
        notification.className = 'alert-notification chart-toast-tooltip';

        const header = document.createElement('div');
        header.className = 'alert-notification-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'alert-notification-icon';
        iconSpan.textContent = '🔔';

        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'alert-notification-symbol';
        symbolSpan.textContent = String(alert.symbol != null ? alert.symbol : '');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'alert-notification-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';

        header.appendChild(iconSpan);
        header.appendChild(symbolSpan);
        header.appendChild(closeBtn);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'alert-notification-body';

        const msg = document.createElement('div');
        msg.className = 'alert-notification-message';
        msg.textContent = String(alert.message != null ? alert.message : '');

        const priceRow = document.createElement('div');
        priceRow.className = 'alert-notification-price';
        const spanAlert = document.createElement('span');
        spanAlert.textContent = 'Alert: ' + this.formatPrice(alert.price);
        const spanCur = document.createElement('span');
        spanCur.textContent = 'Current: ' + this.formatPrice(currentPrice);
        priceRow.appendChild(spanAlert);
        priceRow.appendChild(spanCur);

        bodyEl.appendChild(msg);
        bodyEl.appendChild(priceRow);
        notification.appendChild(header);
        notification.appendChild(bodyEl);
        wrap.appendChild(notification);

        const fadeOutRemove = (dismissStack) => {
            notification.classList.remove('show');
            if (typeof dismissStack === 'function') {
                setTimeout(() => {
                    try {
                        dismissStack();
                    } catch (e) {
                        console.error(e);
                    }
                }, 280);
            } else {
                setTimeout(() => {
                    try {
                        wrap.remove();
                    } catch (e) {
                        /* ignore */
                    }
                }, 300);
            }
        };

        if (typeof window !== 'undefined' && window.__TalariaToastStack) {
            wrap.style.maxWidth = 'min(92vw, 340px)';
            wrap.style.margin = '0 auto';
            const dismiss = window.__TalariaToastStack.pushElement(wrap, { duration: 5000 });
            closeBtn.addEventListener('click', () => fadeOutRemove(dismiss));
            requestAnimationFrame(() => notification.classList.add('show'));
        } else {
            document.body.appendChild(wrap);
            setTimeout(() => notification.classList.add('show'), 10);
            closeBtn.addEventListener('click', () => fadeOutRemove(null));
            setTimeout(() => fadeOutRemove(null), 5000);
        }
    }
    
    /**
     * Format price for display
     */
    formatPrice(price) {
        if (price === null || price === undefined) return '—';
        if (this.chart && typeof this.chart.getPriceDecimals === 'function' && this.chart.yScale) {
            const range = Math.abs(this.chart.yScale.domain()[1] - this.chart.yScale.domain()[0]);
            return price.toFixed(this.chart.getPriceDecimals(range));
        }
        const decimals = price < 100 ? 5 : 2;
        return price.toFixed(decimals);
    }
    
    /**
     * Flash alert line when triggered
     */
    flashAlertLine(alert) {
        const line = this.chart.svg.select(`#alert-line-${alert.id}`);
        if (line.node()) {
            line.classed('alert-line-flash', true);
            setTimeout(() => line.classed('alert-line-flash', false), 1000);
        }
    }
    
    /**
     * Show browser notification
     */
    showBrowserNotification(alert, currentPrice) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            new Notification(`${alert.symbol} Alert`, {
                body: `${alert.message}\nCurrent: ${this.formatPrice(currentPrice)}`,
                icon: 'modules/logo-08.png',
                tag: alert.id
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
    
    /**
     * Start the alert checker interval.
     * M20-Q8 (default ON): clear-before-restart; skip when zero alerts.
     * Kill-switch __TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1 = true restores
     * always-on 500ms (and may stack if start is called twice — legacy RED).
     */
    startAlertChecker() {
        const fixOn = this._m20Q8AlertCheckerIdleFixEnabled();
        if (fixOn) {
            this._m20Q8InstallTransactionalOwnership();
            return this._m20Q8ReconcileAlertChecker();
        }
        // Legacy kill-switch path: permanent 500ms wakeups, no clear-before-restart.
        this.checkInterval = setInterval(() => {
            this.checkAlerts();
        }, 500);
    }
    
    /**
     * Stop the alert checker
     */
    stopAlertChecker() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    
    /**
     * Render alert lines on the chart using HTML overlay for interactivity
     */
    renderAlertLines() {
        if (!this.chart || !this.chart.svg) return;
        
        // Get the container element
        let containerEl = null;
        if (this.chart.container) {
            containerEl = typeof this.chart.container.node === 'function' 
                ? this.chart.container.node() 
                : this.chart.container;
        }
        if (!containerEl) {
            containerEl = document.getElementById('chart-container');
        }
        if (!containerEl) return;
        
        // Get or create HTML overlay container
        let overlay = document.getElementById('alertLinesOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'alertLinesOverlay';
            overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 50;';
            containerEl.appendChild(overlay);
        }
        
        // Clear existing overlays
        overlay.innerHTML = '';
        
        // Also render SVG lines (non-interactive, just visual)
        let group = this.chart.svg.select('#alertLinesGroup');
        if (group.empty()) {
            group = this.chart.svg.append('g')
                .attr('id', 'alertLinesGroup')
                .attr('class', 'alert-lines-group');
        }
        group.selectAll('*').remove();
        
        const yScale = this.chart.yScale;
        const width = this.chart.w;
        const margin = this.chart.margin;
        
        if (!yScale) return;
        
        const alertSystem = this;
        
        this.alerts.forEach(alert => {
            if (!alert.active) return;
            
            const y = yScale(alert.price);
            
            // Skip if price is outside visible range
            if (y < margin.t || y > this.chart.h - margin.b) return;
            
            // SVG line (visual only)
            const dashArray = alert.lineStyle === 'dashed' ? '8,4' : 
                              alert.lineStyle === 'dotted' ? '2,2' : 'none';
            
            group.append('line')
                .attr('class', 'alert-line')
                .attr('x1', margin.l)
                .attr('x2', width - margin.r)
                .attr('y1', y)
                .attr('y2', y)
                .attr('stroke', alert.color)
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', dashArray);
            
            // HTML overlay for label (interactive)
            const labelEl = document.createElement('div');
            labelEl.className = 'alert-label-overlay';
            labelEl.dataset.alertId = alert.id;
            const _axisLeft = !!(this.chart && this.chart.priceAxisLeft);
            const _posStyle = _axisLeft
                ? `left: 2px;`
                : `right: ${margin.r + 5}px;`;
            labelEl.style.cssText = `
                position: absolute;
                ${_posStyle}
                top: ${y - 11}px;
                height: 22px;
                display: flex;
                align-items: center;
                background: ${alert.color};
                border-radius: 3px;
                padding: 0 6px 0 8px;
                gap: 6px;
                pointer-events: all;
                cursor: ns-resize;
                user-select: none;
                z-index: 51;
            `;
            
            labelEl.innerHTML = `
                <span style="color: #fff; font-size: 11px; font-weight: 600; white-space: nowrap;">🔔 ${this.formatPrice(alert.price)}</span>
                <button class="alert-delete-x" style="
                    width: 16px;
                    height: 16px;
                    border: none;
                    background: rgba(0,0,0,0.3);
                    color: #fff;
                    border-radius: 3px;
                    cursor:default;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    padding: 0;
                    line-height: 1;
                    transition: background 0.15s;
                ">✕</button>
            `;
            
            overlay.appendChild(labelEl);
            
            // Delete button click
            const deleteBtn = labelEl.querySelector('.alert-delete-x');
            deleteBtn.addEventListener('mouseenter', () => {
                deleteBtn.style.background = 'rgba(239, 68, 68, 0.9)';
            });
            deleteBtn.addEventListener('mouseleave', () => {
                deleteBtn.style.background = 'rgba(0,0,0,0.3)';
            });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                alertSystem.deleteAlert(alert.id);
            });
            
            // Drag to move alert - line moves with label in real-time
            const svgLine = group.select(`line.alert-line-${alert.id}`).node() 
                || group.selectAll('line').nodes().find((_, i) => i === this.alerts.filter(a => a.active).indexOf(alert));
            
            labelEl.addEventListener('mousedown', (e) => {
                if (e.target === deleteBtn) return;
                e.preventDefault();
                
                const currentAlert = alert;
                let startY = e.clientY;
                let currentTop = parseFloat(labelEl.style.top);
                
                // Find the corresponding SVG line
                const alertIndex = alertSystem.alerts.filter(a => a.active).indexOf(currentAlert);
                const lines = group.selectAll('line').nodes();
                const lineEl = lines[alertIndex];
                
                labelEl.style.opacity = '0.8';
                document.body.style.cursor = 'ns-resize';
                
                const priceSpan = labelEl.querySelector('span');
                
                const onMouseMove = (moveEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    const newTop = currentTop + deltaY;
                    const newY = newTop + 11; // Center of label
                    
                    // Move label
                    labelEl.style.top = newTop + 'px';
                    
                    // Move SVG line in real-time
                    if (lineEl) {
                        lineEl.setAttribute('y1', newY);
                        lineEl.setAttribute('y2', newY);
                    }
                    
                    // Update price text in real-time
                    const livePrice = yScale.invert(newY);
                    if (priceSpan) {
                        priceSpan.textContent = `🔔 ${alertSystem.formatPrice(livePrice)}`;
                    }
                };
                
                const onMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    
                    labelEl.style.opacity = '1';
                    document.body.style.cursor = '';
                    
                    // Calculate new price from Y position
                    const finalY = parseFloat(labelEl.style.top) + 11;
                    const newPrice = yScale.invert(finalY);
                    
                    // Update alert price
                    currentAlert.price = newPrice;
                    alertSystem.saveAlerts();
                    alertSystem.renderAlertLines();
                    alertSystem.refreshAlertsList();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            
            // Double-click to edit
            labelEl.addEventListener('dblclick', (e) => {
                if (e.target !== deleteBtn) {
                    alertSystem.showEditAlertModal(alert);
                }
            });
            
            // Right-click context menu
            labelEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                alertSystem.showAlertContextMenu(e, alert);
            });
        });
    }
    
    /**
     * Show context menu for alert line
     */
    showAlertContextMenu(event, alert) {
        // Remove existing context menu
        document.querySelectorAll('.alert-context-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'alert-context-menu';
        menu.innerHTML = `
            <div class="alert-context-item" data-action="edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Alert
            </div>
            <div class="alert-context-item" data-action="toggle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    ${alert.active ? 
                        '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>' :
                        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
                </svg>
                ${alert.active ? 'Disable Alert' : 'Enable Alert'}
            </div>
            <div class="alert-context-divider"></div>
            <div class="alert-context-item delete" data-action="delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
                Delete Alert
            </div>
        `;
        
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        document.body.appendChild(menu);
        
        // Handle actions
        menu.querySelectorAll('.alert-context-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                switch (action) {
                    case 'edit':
                        this.showEditAlertModal(alert);
                        break;
                    case 'toggle':
                        this.toggleAlert(alert.id);
                        break;
                    case 'delete':
                        this.deleteAlert(alert.id);
                        break;
                }
                menu.remove();
            });
        });
        
        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    }
    
    /**
     * Show create alert modal
     */
    showCreateAlertModal(defaultPrice = null) {
        // Get current price if not provided
        if (defaultPrice === null && this.chart && this.chart.data && this.chart.data.length > 0) {
            defaultPrice = this.chart.data[this.chart.data.length - 1].c;
        }
        
        this.showAlertModal({
            title: 'Create Alert',
            price: defaultPrice,
            condition: this.conditions.CROSSING,
            expiration: this.expirations.EVERY_TIME,
            color: '#ff9800',
            showPopup: true,
            playSound: true
        });
    }
    
    /**
     * Show edit alert modal
     */
    showEditAlertModal(alert) {
        this.showAlertModal({
            title: 'Edit Alert',
            isEdit: true,
            alertId: alert.id,
            price: alert.price,
            condition: alert.condition,
            expiration: alert.expiration,
            message: alert.message,
            color: alert.color,
            showPopup: alert.showPopup,
            playSound: alert.playSound
        });
    }
    
    /**
     * Show alert modal (create/edit).
     * Prefer V9 React window via `talaria-v9-open-alert`; DOM Obsidian markup is fallback only.
     */
    showAlertModal(options) {
        document.querySelectorAll(
            '.talaria-alert-overlay, .alert-settings-popup, .alert-modal-overlay'
        ).forEach((m) => m.remove());

        const symbol = this.getSymbolName();
        const priceVal = options.price != null && options.price !== ''
            ? this.formatPrice(options.price)
            : '';

        try {
            window.__TALARIA_V9_ALERT_MODAL_OPEN__ = false;
            const ev = new CustomEvent('talaria-v9-open-alert', {
                cancelable: true,
                detail: {
                    title: options.title || (options.isEdit ? 'Edit Alert' : 'Create Alert'),
                    isEdit: !!options.isEdit,
                    alertId: options.alertId,
                    symbol,
                    priceText: priceVal,
                    condition: options.condition || 'crossing',
                    expiration: options.expiration || 'every_time',
                    message: options.message || '',
                    color: options.color || '#ff9800',
                    showPopup: options.showPopup !== false,
                    playSound: options.playSound !== false,
                },
            });
            window.dispatchEvent(ev);
            if (ev.defaultPrevented || window.__TALARIA_V9_ALERT_MODAL_OPEN__) {
                return;
            }
        } catch (_) {}

        // Fallback when V9 React shell is not mounted (legacy chart hosts).
        injectAlertSystemStyles();
        const colorVal = String(options.color || '#ff9800').toLowerCase();
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
        const presets = [
            ['#ff9800', 'Orange'],
            ['#ffc107', 'Amber'],
            ['#f44336', 'Red'],
            ['#00d4a1', 'Green'],
            ['#3090ff', 'Blue'],
            ['#a78bfa', 'Purple'],
        ];
        const presetActive = presets.some(([c]) => c === colorVal);
        const condLabel = {
            crossing: 'Crossing',
            crossing_up: 'Crossing up',
            crossing_down: 'Crossing down',
            greater_than: 'Greater than',
            less_than: 'Less than',
        };
        const subBits = [
            symbol || 'SYMBOL',
            priceVal ? String(priceVal) : null,
            condLabel[options.condition] || null,
        ].filter(Boolean).join(' · ');

        const overlay = document.createElement('div');
        overlay.className = 'talaria-alert-overlay';
        overlay.setAttribute('data-v9-chrome', '1');
        overlay.innerHTML = `
            <div data-alert-win="" data-chrome-win="alert" role="dialog" aria-modal="true" aria-label="${esc(options.title)}">
                <div data-win-header="">
                    <div data-win-icon="" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                    </div>
                    <div data-win-title-wrap="">
                        <div data-win-title="">${esc(options.title)}</div>
                        <div data-win-sub="" data-alert-sub="">${esc(subBits)}</div>
                    </div>
                    <button type="button" data-win-close="" aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div data-alert-body="">
                    <div data-alert-row="">
                        <div data-alert-field="">
                            <label for="alertSymbol">Symbol</label>
                            <input data-alert-input="" type="text" id="alertSymbol" value="${esc(symbol)}" readonly tabindex="-1">
                        </div>
                        <div data-alert-field="">
                            <label for="alertPrice">Price</label>
                            <input data-alert-input="" data-alert-price="" type="number" step="any" id="alertPrice" value="${esc(priceVal)}" inputmode="decimal" autocomplete="off">
                        </div>
                    </div>
                    <div data-alert-row="">
                        <div data-alert-field="">
                            <label for="alertCondition">Condition</label>
                            <select data-alert-select="" id="alertCondition">
                                <option value="crossing" ${options.condition === 'crossing' ? 'selected' : ''}>Crossing</option>
                                <option value="crossing_up" ${options.condition === 'crossing_up' ? 'selected' : ''}>Crossing up</option>
                                <option value="crossing_down" ${options.condition === 'crossing_down' ? 'selected' : ''}>Crossing down</option>
                                <option value="greater_than" ${options.condition === 'greater_than' ? 'selected' : ''}>Greater than</option>
                                <option value="less_than" ${options.condition === 'less_than' ? 'selected' : ''}>Less than</option>
                            </select>
                        </div>
                        <div data-alert-field="">
                            <label for="alertExpiration">Trigger</label>
                            <select data-alert-select="" id="alertExpiration">
                                <option value="every_time" ${options.expiration === 'every_time' ? 'selected' : ''}>Every time</option>
                                <option value="once" ${options.expiration === 'once' ? 'selected' : ''}>Only once</option>
                                <option value="once_per_bar" ${options.expiration === 'once_per_bar' ? 'selected' : ''}>Once per bar</option>
                            </select>
                        </div>
                    </div>
                    <div data-alert-field="" data-span="2">
                        <label for="alertMessage">Message</label>
                        <input data-alert-input="" type="text" id="alertMessage" value="${esc(options.message || '')}" placeholder="Optional note for this alert">
                    </div>
                    <div data-alert-field="">
                        <label>Line color</label>
                        <div data-alert-swatches="">
                            ${presets.map(([c, name]) => `
                                <button type="button" data-alert-swatch="" data-color="${c}" data-on="${c === colorVal ? '1' : undefined}" style="--swatch:${c}" aria-label="${name}"></button>
                            `).join('')}
                            <label data-alert-swatch="" data-custom="" data-on="${presetActive ? undefined : '1'}" style="${presetActive ? '' : `--swatch:${esc(colorVal)}`}" aria-label="Custom color">
                                <input type="color" id="alertColor" value="${esc(colorVal)}">
                            </label>
                        </div>
                    </div>
                    <div data-alert-field="">
                        <label>Notify</label>
                        <div data-alert-togs="">
                            <button type="button" data-alert-tog="popup" data-on="${options.showPopup ? '1' : undefined}" aria-pressed="${options.showPopup ? 'true' : 'false'}">
                                <i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="16" height="12" rx="2"/><path d="M8 21h8"/></svg></i>
                                Popup
                            </button>
                            <button type="button" data-alert-tog="sound" data-on="${options.playSound ? '1' : undefined}" aria-pressed="${options.playSound ? 'true' : 'false'}">
                                <i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a4 4 0 0 1 0 7"/><path d="M18 6a7 7 0 0 1 0 12"/></svg></i>
                                Sound
                            </button>
                        </div>
                    </div>
                </div>
                <div data-win-foot="">
                    <button type="button" data-alert-btn="ghost" data-alert-cancel="">Cancel</button>
                    <button type="button" data-alert-btn="primary" data-alert-submit="">${options.isEdit ? 'Update' : 'Create'}</button>
                </div>
            </div>
        `;

        // Clean undefined attrs from template
        overlay.querySelectorAll('[data-on="undefined"]').forEach((el) => el.removeAttribute('data-on'));

        document.body.appendChild(overlay);

        const win = overlay.querySelector('[data-alert-win]');
        const priceEl = overlay.querySelector('#alertPrice');
        const condEl = overlay.querySelector('#alertCondition');
        const subEl = overlay.querySelector('[data-alert-sub]');
        const colorEl = overlay.querySelector('#alertColor');
        const customSwatch = overlay.querySelector('[data-alert-swatch][data-custom]');

        const syncSub = () => {
            if (!subEl) return;
            const p = priceEl?.value?.trim();
            const c = condLabel[condEl?.value] || condEl?.value || '';
            subEl.textContent = [symbol || 'SYMBOL', p || null, c || null].filter(Boolean).join(' · ');
        };
        priceEl?.addEventListener('input', syncSub);
        condEl?.addEventListener('change', syncSub);

        const setActiveSwatch = (hex) => {
            const h = String(hex || '').toLowerCase();
            overlay.querySelectorAll('[data-alert-swatch]').forEach((b) => {
                const isCustom = b.hasAttribute('data-custom');
                const match = isCustom
                    ? !presets.some(([c]) => c === h)
                    : String(b.getAttribute('data-color') || '').toLowerCase() === h;
                if (match) b.setAttribute('data-on', '1');
                else b.removeAttribute('data-on');
            });
            if (customSwatch && !presets.some(([c]) => c === h)) {
                customSwatch.style.setProperty('--swatch', h);
            }
        };

        overlay.querySelectorAll('[data-alert-swatch]:not([data-custom])').forEach((btn) => {
            btn.addEventListener('click', () => {
                const c = btn.getAttribute('data-color');
                if (colorEl) colorEl.value = c;
                setActiveSwatch(c);
            });
        });
        colorEl?.addEventListener('input', () => setActiveSwatch(colorEl.value));

        overlay.querySelectorAll('[data-alert-tog]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const on = btn.getAttribute('data-on') === '1';
                if (on) {
                    btn.removeAttribute('data-on');
                    btn.setAttribute('aria-pressed', 'false');
                } else {
                    btn.setAttribute('data-on', '1');
                    btn.setAttribute('aria-pressed', 'true');
                }
            });
        });

        const closeModal = () => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            } else if (e.key === 'Enter' && e.target && e.target.id !== 'alertMessage') {
                if (e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                submit();
            }
        };
        document.addEventListener('keydown', onKey);

        overlay.querySelector('[data-win-close]')?.addEventListener('click', closeModal);
        overlay.querySelector('[data-alert-cancel]')?.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        win?.addEventListener('click', (e) => e.stopPropagation());

        const submit = () => {
            const price = parseFloat(priceEl?.value);
            const condition = condEl?.value;
            const expiration = overlay.querySelector('#alertExpiration')?.value;
            const message = overlay.querySelector('#alertMessage')?.value || '';
            const color = colorEl?.value || '#ff9800';
            const showPopup = overlay.querySelector('[data-alert-tog="popup"]')?.getAttribute('data-on') === '1';
            const playSound = overlay.querySelector('[data-alert-tog="sound"]')?.getAttribute('data-on') === '1';

            if (!Number.isFinite(price)) {
                if (this.chart && typeof this.chart.showNotification === 'function') {
                    this.chart.showNotification('Enter a valid price');
                }
                priceEl?.focus();
                return;
            }

            document.removeEventListener('keydown', onKey);
            const payload = {
                price,
                condition,
                expiration,
                message: message || `Price ${condition} ${price}`,
                color,
                showPopup,
                playSound,
            };
            if (options.isEdit) this.updateAlert(options.alertId, payload);
            else this.createAlert(payload);
            overlay.remove();
        };

        overlay.querySelector('[data-alert-submit]')?.addEventListener('click', submit);

        // Keep fully on-screen on short viewports.
        try {
            if (win && typeof window !== 'undefined') {
                const maxH = Math.max(240, window.innerHeight - 32);
                win.style.maxHeight = `${maxH}px`;
            }
        } catch (_) {}

        setTimeout(() => {
            priceEl?.focus();
            priceEl?.select?.();
        }, 40);
    }
    
    /**
     * Refresh the alerts list in the panel
     */
    refreshAlertsList() {
        if (!this.alertsList) return;
        
        if (this.alerts.length === 0) {
            this.alertsList.innerHTML = `
                <div class="alerts-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <p>No alerts</p>
                    <span>Create your first alert using the button above or right-click on the chart</span>
                </div>
            `;
            return;
        }
        
        this.alertsList.innerHTML = this.alerts.map(alert => `
            <div class="alert-item ${alert.active ? '' : 'inactive'}" data-alert-id="${alert.id}">
                <div class="alert-item-color" style="background: ${alert.color}"></div>
                <div class="alert-item-content">
                    <div class="alert-item-header">
                        <span class="alert-item-symbol">${alert.symbol}</span>
                        <span class="alert-item-condition">${this.formatCondition(alert.condition)}</span>
                    </div>
                    <div class="alert-item-price">${this.formatPrice(alert.price)}</div>
                    ${alert.message ? `<div class="alert-item-message">${alert.message}</div>` : ''}
                    <div class="alert-item-meta">
                        <span class="alert-item-expiration">${this.formatExpiration(alert.expiration)}</span>
                        ${alert.triggeredCount > 0 ? `<span class="alert-item-count">Triggered ${alert.triggeredCount}x</span>` : ''}
                    </div>
                </div>
                <div class="alert-item-actions">
                    <button class="alert-item-btn toggle" title="${alert.active ? 'Disable' : 'Enable'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            ${alert.active ? 
                                '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' :
                                '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
                        </svg>
                    </button>
                    <button class="alert-item-btn edit" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="alert-item-btn delete" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        this.alertsList.querySelectorAll('.alert-item').forEach(item => {
            const alertId = item.dataset.alertId;
            
            item.querySelector('.toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleAlert(alertId);
            });
            
            item.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                const alert = this.alerts.find(a => a.id === alertId);
                if (alert) this.showEditAlertModal(alert);
            });
            
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteAlert(alertId);
            });
            
            // Click to jump to price
            item.addEventListener('click', () => {
                const alert = this.alerts.find(a => a.id === alertId);
                if (alert && this.chart && typeof this.chart.jumpToPrice === 'function') {
                    // Center on alert price
                    this.chart.centerOnPrice(alert.price);
                }
            });
        });
    }
    
    /**
     * Format condition for display
     */
    formatCondition(condition) {
        const names = {
            crossing: 'Crossing',
            crossing_up: 'Crossing Up',
            crossing_down: 'Crossing Down',
            greater_than: 'Greater Than',
            less_than: 'Less Than',
            entering_channel: 'Entering Channel',
            exiting_channel: 'Exiting Channel'
        };
        return names[condition] || condition;
    }
    
    /**
     * Format expiration for display
     */
    formatExpiration(expiration) {
        const names = {
            once: 'Once',
            every_time: 'Every time',
            once_per_bar: 'Once per bar'
        };
        return names[expiration] || expiration;
    }
    
    /**
     * Update badge count
     */
    updateBadge() {
        if (!this.alertBadge) return;
        
        const activeCount = this.alerts.filter(a => a.active).length;
        
        if (activeCount > 0) {
            this.alertBadge.textContent = activeCount;
            this.alertBadge.style.display = 'flex';
        } else {
            this.alertBadge.style.display = 'none';
        }
    }
    
    /**
     * Load alerts from storage
     */
    loadAlerts() {
        try {
            const stored = userStorage.getItem(this.storageKey);
            if (stored) {
                this.alerts = JSON.parse(stored);
                console.log('📂 Loaded', this.alerts.length, 'alerts from storage');
            }
        } catch (e) {
            console.error('Failed to load alerts:', e);
            this.alerts = [];
        }
    }
    
    /**
     * Save alerts to storage
     */
    saveAlerts() {
        try {
            userStorage.setItem(this.storageKey, JSON.stringify(this.alerts));
        } catch (e) {
            console.error('Failed to save alerts:', e);
        }
    }
    
    /**
     * Create alert from right-click on chart
     */
    createAlertAtPrice(price) {
        this.showCreateAlertModal(price);
    }
    
    /**
     * Get all active alerts
     */
    getActiveAlerts() {
        return this.alerts.filter(a => a.active);
    }
    
    /**
     * Clear all alerts
     */
    clearAllAlerts() {
        if (confirm('Delete all alerts? This cannot be undone.')) {
            this.alerts = [];
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
            if (typeof this.syncAlertCheckerWithAlerts === 'function') {
                this.syncAlertCheckerWithAlerts();
            }
        }
    }
    
    /**
     * Destroy the alert system
     * M20-Q8: always clear the checker handle (stopAlertChecker nulls checkInterval).
     */
    destroy() {
        this.stopAlertChecker();
        try {
            if (this.chart && this.chart.svg && typeof this.chart.svg.select === 'function') {
                this.chart.svg.select('#alertLinesGroup').remove();
            }
        } catch (_) {}
    }
}

// Make globally available
window.AlertSystem = AlertSystem;

console.log('🔔 alert-system.js loaded');
