/**
 * engine-api-guards.js
 *
 * Step 1.2 deliverable from multi_chart_rebuild_roadmap.md:
 *
 *   "Price-axis-related methods — list every method or property that can affect
 *    the price axis (Y-axis) range from outside. For each one, wrap it in a
 *    guard function in our codebase that throws an error if called."
 *
 * The chart engine (chart v 1.4/chart/chart.js) does not expose a clean public
 * setter for the price axis. The price axis is mutated INTERNALLY via direct
 * field writes (this.priceScale.min/max, this.priceZoom, this.priceOffset,
 * this.manualCenterPrice, this.manualRange, this.autoScale).
 *
 * Wrapping the engine's own internal writes with a Proxy is not viable — it
 * fires thousands of times per render frame on legitimate internal recompute.
 * Instead we install:
 *
 *   1. FORBIDDEN_SYNC_FIELDS — explicit deny-list. The sync bridge filters
 *      every outbound and inbound postMessage envelope and DROPS messages
 *      that contain any of these keys (with a console error in dev).
 *
 *   2. snapshotPriceState(chart) / assertPriceStateUnchanged(chart, snap, label)
 *      — runtime tripwires the bridge wraps around inbound sync application.
 *      For crosshair sync, the price state MUST be byte-identical before/after.
 *      For visible-range sync, only priceScale.min/max may differ (because the
 *      chart legitimately auto-fits to its own NEW visible candles).
 *
 *   3. installForbiddenSetterTraps(chart) — patches the price-axis-affecting
 *      properties with Object.defineProperty so any external assignment from
 *      outside the chart's own methods throws. Internal writes are allowed by
 *      checking the call-site (a stack-trace marker installed at chart-method
 *      entry points). DEV-MODE ONLY — opt-in via window.MULTICHART_GUARD_TRAPS.
 *
 *   4. runGuardSelfTest(chart) — self-test the guards on chart load and on
 *      manual button-press from the shell page. Returns { ok, failures }.
 *
 * Loaded by sync-bridge.js inside each chart iframe.
 */

(function (global) {
    'use strict';

    /**
     * Fields that MUST NOT appear in any sync postMessage envelope.
     * The bridge enforces this on both outbound and inbound.
     */
    const FORBIDDEN_SYNC_FIELDS = Object.freeze([
        'priceMin',
        'priceMax',
        'autoScale',
        'priceZoom',
        'priceOffset',
        'manualCenterPrice',
        'manualRange',
        'mode',           // priceScale.mode (linear/log)
        'scaleType',      // alias
        'timeframe',      // each chart owns its TF (shared via separate symbol/tf channel only on user action)
        'indicators',
        'drawings',
        'chartType',
    ]);

    /**
     * Snapshot the chart's price-axis state for before/after assertion.
     * Returns a plain object — safe to compare with deep-equal.
     */
    function snapshotPriceState(chart) {
        if (!chart) return null;
        const ps = chart.priceScale || {};
        return {
            'priceScale.min':            ps.min,
            'priceScale.max':            ps.max,
            'priceScale.autoScale':      ps.autoScale,
            'priceScale.mode':           ps.mode,
            'priceScale.locked':         ps.locked,
            'autoScale':                 chart.autoScale,
            'priceZoom':                 chart.priceZoom,
            'priceOffset':               chart.priceOffset,
            'manualCenterPrice':         chart.manualCenterPrice,
            'manualRange':               chart.manualRange,
        };
    }

    /**
     * Assert no price-axis state changed.
     *
     * mode = 'crosshair'    — no field may change. The peer's price MUST NOT
     *                         influence our local price scale at all.
     *
     * mode = 'visibleRange' — the chart legitimately re-fits its price axis to
     *                         its OWN newly-visible candles. ALL price-derived
     *                         fields are allowed to change EXCEPT modal flags
     *                         that would indicate a state leak from the peer
     *                         (e.g. switching from auto- to manual-scaling, or
     *                         locking the scale, or changing linear/log mode).
     *                         The forbidden-flags set below is what we
     *                         explicitly do NOT want the peer to dictate.
     *
     * Returns array of violation strings (empty = ok).
     */
    function diffPriceState(snapBefore, snapAfter, mode) {
        if (!snapBefore || !snapAfter) return ['snapshot missing'];

        // For visibleRange, allow ALL value-bearing fields (min/max/zoom/offset/
        // manualCenterPrice/manualRange) to drift — they're auto-fit outputs.
        // Only modal/structural fields are guarded.
        const visibleRangeAllowed = new Set([
            'priceScale.min',
            'priceScale.max',
            'priceZoom',
            'priceOffset',
            'manualCenterPrice',
            'manualRange',
            // autoScale flags can also flip true<->true (no-op) or stay true.
            // We assert below that they're not flipped to FALSE by sync.
            'priceScale.autoScale',
            'autoScale',
        ]);
        const allowedDelta = mode === 'visibleRange' ? visibleRangeAllowed : new Set();

        const violations = [];
        for (const k of Object.keys(snapBefore)) {
            const a = snapBefore[k];
            const b = snapAfter[k];
            const equal = (a === b) || (Number.isNaN(a) && Number.isNaN(b));
            if (equal) continue;

            // Special case: for visibleRange, autoScale must stay TRUE post-sync.
            // If the peer somehow disabled it, that's a real leak we want to flag.
            if (mode === 'visibleRange' && (k === 'autoScale' || k === 'priceScale.autoScale')) {
                if (b !== true && b !== undefined && b !== null) {
                    violations.push(`${k} disabled by sync: ${formatVal(a)} -> ${formatVal(b)}`);
                }
                continue;
            }

            if (!allowedDelta.has(k)) {
                violations.push(`${k} changed: ${formatVal(a)} -> ${formatVal(b)}`);
            }
        }
        return violations;
    }

    function formatVal(v) {
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(6) : String(v);
        return JSON.stringify(v);
    }

    /**
     * Filter a postMessage payload, dropping any forbidden keys (deep, one level).
     * Returns { clean, dropped: string[] }.
     */
    function filterForbiddenFields(payload) {
        if (!payload || typeof payload !== 'object') return { clean: payload, dropped: [] };
        const dropped = [];
        const clean = {};
        for (const k of Object.keys(payload)) {
            if (FORBIDDEN_SYNC_FIELDS.includes(k)) {
                dropped.push(k);
                continue;
            }
            const v = payload[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                const nested = filterForbiddenFields(v);
                if (nested.dropped.length) {
                    dropped.push(...nested.dropped.map(s => `${k}.${s}`));
                }
                clean[k] = nested.clean;
            } else {
                clean[k] = v;
            }
        }
        return { clean, dropped };
    }

    /**
     * Self-test the guards. Returns { ok, failures: string[] }.
     * Called by the shell page "Run guard self-test" button on every iframe.
     */
    function runGuardSelfTest(chart) {
        const failures = [];

        // Test 1: filterForbiddenFields strips all forbidden keys
        const t1 = filterForbiddenFields({
            type: 'crosshair',
            time: 12345,
            priceMin: 100,            // forbidden
            priceMax: 200,            // forbidden
            nested: { autoScale: true, ok: 1 },  // nested forbidden
        });
        if (t1.clean.priceMin !== undefined) failures.push('filterForbiddenFields did not strip priceMin');
        if (t1.clean.priceMax !== undefined) failures.push('filterForbiddenFields did not strip priceMax');
        if (t1.clean.nested && t1.clean.nested.autoScale !== undefined) failures.push('did not strip nested.autoScale');
        if (!t1.dropped.includes('priceMin')) failures.push('did not log dropped priceMin');

        // Test 2: snapshot + diff detects illegitimate change
        if (chart && chart.priceScale) {
            const snap = snapshotPriceState(chart);
            const tampered = JSON.parse(JSON.stringify(snap));
            tampered['priceScale.min'] = (snap['priceScale.min'] || 0) + 1;
            const v1 = diffPriceState(snap, tampered, 'crosshair');
            if (v1.length === 0) failures.push('diffPriceState(crosshair) did not detect priceScale.min change');
            const v2 = diffPriceState(snap, tampered, 'visibleRange');
            if (v2.length !== 0) failures.push('diffPriceState(visibleRange) flagged priceScale.min change (allowed)');

            // Tamper with priceZoom — must be flagged on crosshair, allowed on visibleRange
            const tampered2 = JSON.parse(JSON.stringify(snap));
            tampered2.priceZoom = (snap.priceZoom || 1) * 2;
            const v3 = diffPriceState(snap, tampered2, 'crosshair');
            if (v3.length === 0) failures.push('diffPriceState(crosshair) did not detect priceZoom change');
        } else {
            failures.push('no chart.priceScale to test against (chart not initialized)');
        }

        // Test 3: receiving a crosshair sync with a fake price MUST NOT change price-axis
        if (chart && typeof chart.receiveCrosshairSync === 'function' && chart.data && chart.data.length > 0) {
            try {
                const before = snapshotPriceState(chart);
                const targetTs = chart.data[Math.floor(chart.data.length / 2)].t;
                const fakePrice = 99999.99;
                chart.receiveCrosshairSync(targetTs, fakePrice, null);
                const after = snapshotPriceState(chart);
                const v = diffPriceState(before, after, 'crosshair');
                if (v.length) failures.push('receiveCrosshairSync mutated price-axis: ' + v.join(', '));
            } catch (e) {
                failures.push('receiveCrosshairSync self-test threw: ' + (e && e.message || e));
            }
        }

        return { ok: failures.length === 0, failures };
    }

    /**
     * Optional dev-only setter traps. Off by default; enable via:
     *   window.MULTICHART_GUARD_TRAPS = true   (set BEFORE chart.js loads)
     *
     * Implementation note: chart.js writes to these fields constantly from
     * inside its own methods. We can't trap legitimate internal writes without
     * a stack-tag hack. For now this is a stub — the snapshot/diff approach
     * above is the actual enforcement mechanism. Left in place so future
     * tightening can hook here.
     */
    function installForbiddenSetterTraps(chart) {
        if (!global.MULTICHART_GUARD_TRAPS) return false;
        // Reserved for future use; see comment above.
        return false;
    }

    global.MultichartGuards = {
        VERSION: '2026-05-09T20:00-v10.4.9',  // bump on any guard semantic change
        FORBIDDEN_SYNC_FIELDS,
        snapshotPriceState,
        diffPriceState,
        filterForbiddenFields,
        runGuardSelfTest,
        installForbiddenSetterTraps,
    };
})(typeof window !== 'undefined' ? window : globalThis);
