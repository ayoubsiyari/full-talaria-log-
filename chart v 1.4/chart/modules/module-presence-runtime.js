/**
 * module-presence-runtime.js — resilient module ledger and correctness tripwire.
 * Contract source: scripts/module-contracts.json.
 */
(function (global) {
    'use strict';
    var MAX_MODULES = 32;
    var ID = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
    var VERSION = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
    var loaded = Array.isArray(global.__TALARIA_LOADED_MODULES)
        ? global.__TALARIA_LOADED_MODULES : [];
    var priorDegraded = global.__TALARIA_DEGRADED_STATE__ || global.__TALARIA_DEGRADED_MODE__;
    var priorModules = priorDegraded && Array.isArray(priorDegraded.degradedModules)
        ? priorDegraded.degradedModules : [];
    var degraded = { degradedModules: priorModules };
    var degradedCompat = { active: priorModules.length > 0, degradedModules: priorModules };
    global.__TALARIA_LOADED_MODULES = loaded;
    // Lane-5 consumer contract: publish this exact shape before order scripts load.
    global.__TALARIA_DEGRADED_STATE__ = degraded;
    global.__TALARIA_DEGRADED_MODE__ = degradedCompat;

    function bounded(value) {
        value = String(value || '');
        return ID.test(value) ? value : null;
    }

    global.__talariaRegisterModule = function (record) {
        var id = bounded(record && record.module);
        var rawVersion = String(record && record.version || '');
        var version = VERSION.test(rawVersion) ? rawVersion : null;
        var klass = bounded(record && record.class);
        var status = bounded(record && record.status);
        if (!id || !version || !klass || !status) return false;
        var duplicate = loaded.some(function (item) { return item.module === id; });
        if (duplicate || loaded.length >= MAX_MODULES) return false;
        loaded.push({ module: id, version: version, class: klass, status: status });
        return true;
    };

    function showIndicator() {
        if (typeof document === 'undefined' || document.getElementById('talaria-degraded-indicator')) return;
        var badge = document.createElement('div');
        badge.id = 'talaria-degraded-indicator';
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', 'Chart running in degraded mode');
        badge.title = 'A required chart component did not load. Support diagnostics include details.';
        badge.textContent = 'Degraded';
        badge.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483000;padding:3px 7px;border:1px solid rgba(245,158,11,.45);border-radius:4px;background:rgba(24,18,8,.88);color:#d8a84e;font:600 10px system-ui;pointer-events:none;opacity:.85';
        (document.body || document.documentElement).appendChild(badge);
    }

    function markMissing(id) {
        id = bounded(id);
        if (!id || degraded.degradedModules.indexOf(id) >= 0) return;
        degradedCompat.active = true;
        degraded.degradedModules.push(id);
        degraded.degradedModules = degraded.degradedModules.slice(0, MAX_MODULES);
        degradedCompat.degradedModules = degraded.degradedModules;
        try {
            console.error('[TALARIA][CORRECTNESS-DEGRADED] Required module absent:', id);
            global.dispatchEvent(new CustomEvent('talaria:correctness-degraded', {
                detail: { module: id, class: 'correctness' }
            }));
        } catch (_) {}
        showIndicator();
    }
    global.__talariaMarkMissingModule = markMissing;
    global.__talariaRegisterModule({
        module: 'ModulePresenceRuntime',
        version: '20260727b80',
        class: 'correctness',
        status: 'loaded'
    });

    function tripwirePasses() {
        var perf = global.IndicatorPerf;
        var required = ['rollingSmaFast', 'rollingWmaFast', 'packBarsRangeCompact',
            'mergeIndicatorTailWindow', 'estimateTailLookback', 'hashIndicatorParams'];
        var ledger = loaded.filter(function (item) { return item.module === 'IndicatorPerf'; });
        var symbolsOk = perf && required.every(function (name) { return typeof perf[name] === 'function'; });
        var consumer = document.querySelector('script[src*="chart-indicators-full.js"]');
        var provider = document.querySelector('script[src*="indicator-performance.js"]');
        var orderOk = provider && consumer &&
            !!(provider.compareDocumentPosition(consumer) & Node.DOCUMENT_POSITION_FOLLOWING);
        return ledger.length === 1 && symbolsOk && orderOk;
    }

    function runTripwire(attempt) {
        if (tripwirePasses()) return;
        if (attempt < 20) {
            setTimeout(function () { runTripwire(attempt + 1); }, 25);
            return;
        }
        markMissing('IndicatorPerf');
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(function () { runTripwire(0); }, 0);
            }, { once: true });
        }
        else setTimeout(function () { runTripwire(0); }, 0);
    }
})(typeof window !== 'undefined' ? window : self);
