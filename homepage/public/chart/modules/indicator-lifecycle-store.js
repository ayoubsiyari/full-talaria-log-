/**
 * IndicatorLifecycleStore — central indicator lifecycle event bus (RC-6 Phase 1).
 *
 * Authoritative registry for add / update / remove / rehydrate / visibility.
 */
(function (global) {
    'use strict';

    function rc6IndicatorLifecycleStoreEnabled(scope) {
        const g = scope || global;
        return !!(g && g.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE !== false);
    }

    function snapshotIndicator(indicator, chartSettings) {
        if (!indicator) return null;
        const id = indicator.id != null ? String(indicator.id) : null;
        if (!id) return null;
        const shown = (typeof global.resolveIndicatorShown === 'function')
            ? global.resolveIndicatorShown(indicator, chartSettings)
            : (indicator.visible !== false && indicator.hidePlot !== true);
        return {
            id: id,
            type: String(indicator.type || '').toLowerCase(),
            name: indicator.name || '',
            visible: indicator.visible !== false,
            hidePlot: indicator.hidePlot === true,
            hideValues: indicator.hideValues === true,
            shown: shown,
            overlay: indicator.overlay,
            separatePanel: indicator.separatePanel === true,
            isVolume: !!(indicator.isVolume || indicator.type === 'volume'),
        };
    }

    class IndicatorLifecycleStore {
        constructor(chart) {
            this.chart = chart;
            this.listeners = new Map();
            this.state = {
                activeById: new Map(),
                activeOrder: [],
                version: 0,
            };
        }

        isEnabled() {
            return rc6IndicatorLifecycleStoreEnabled(global);
        }

        on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') return () => {};
            if (!this.listeners.has(eventName)) {
                this.listeners.set(eventName, new Set());
            }
            const handlers = this.listeners.get(eventName);
            handlers.add(handler);
            return () => handlers.delete(handler);
        }

        emit(eventName, detail = {}) {
            if (!this.isEnabled()) return false;
            this._reduce(eventName, detail);
            const handlers = this.listeners.get(eventName);
            if (!handlers || handlers.size === 0) return true;
            const payload = {
                ...detail,
                chart: detail.chart || this.chart,
                store: this,
                eventName: eventName,
                snapshot: this.getSnapshot(),
            };
            handlers.forEach((handler) => {
                handler(payload);
            });
            return true;
        }

        getSnapshot() {
            const active = this.state.activeOrder
                .map((id) => {
                    const entry = this.state.activeById.get(id);
                    return entry ? Object.assign({}, entry) : null;
                })
                .filter(Boolean);
            return {
                active: active,
                count: active.length,
                version: this.state.version,
            };
        }

        getRegistrySize() {
            return this.state.activeOrder.length;
        }

        getIndicatorEntry(id) {
            if (id == null) return null;
            const entry = this.state.activeById.get(String(id));
            return entry ? Object.assign({}, entry) : null;
        }

        _bumpVersion() {
            this.state.version += 1;
        }

        _setEntry(indicator) {
            const chartSettings = this.chart && this.chart.chartSettings;
            const entry = snapshotIndicator(indicator, chartSettings);
            if (!entry) return;
            const id = entry.id;
            if (!this.state.activeById.has(id)) {
                this.state.activeOrder.push(id);
            }
            this.state.activeById.set(id, entry);
            this._bumpVersion();
        }

        _removeEntry(indicator) {
            const id = indicator && indicator.id != null ? String(indicator.id) : null;
            if (!id) return;
            this.state.activeById.delete(id);
            this.state.activeOrder = this.state.activeOrder.filter((x) => x !== id);
            this._bumpVersion();
        }

        _syncFromIndicatorsList(indicators) {
            this.state.activeById.clear();
            this.state.activeOrder = [];
            if (!Array.isArray(indicators)) {
                this._bumpVersion();
                return;
            }
            indicators.forEach((indicator) => {
                const entry = snapshotIndicator(indicator, this.chart && this.chart.chartSettings);
                if (!entry) return;
                this.state.activeById.set(entry.id, entry);
                this.state.activeOrder.push(entry.id);
            });
            this._bumpVersion();
        }

        _reduce(eventName, detail) {
            const indicator = detail && detail.indicator ? detail.indicator : null;
            if (eventName === 'indicatorAdded') {
                this._setEntry(indicator);
            } else if (eventName === 'indicatorUpdated' || eventName === 'indicatorVisibilityChanged'
                || eventName === 'indicatorSettingsApplied') {
                this._setEntry(indicator);
            } else if (eventName === 'indicatorRemoved') {
                this._removeEntry(indicator);
            } else if (eventName === 'indicatorCleared') {
                this._syncFromIndicatorsList([]);
            } else if (eventName === 'indicatorRehydrated') {
                const list = Array.isArray(detail.indicators)
                    ? detail.indicators
                    : (this.chart && this.chart.indicators && Array.isArray(this.chart.indicators.active)
                        ? this.chart.indicators.active
                        : []);
                this._syncFromIndicatorsList(list);
            }
        }
    }

    global.IndicatorLifecycleStore = IndicatorLifecycleStore;
    global.rc6IndicatorLifecycleStoreEnabled = rc6IndicatorLifecycleStoreEnabled;
    global.snapshotIndicatorLifecycleEntry = snapshotIndicator;
})(typeof window !== 'undefined' ? window : globalThis);
