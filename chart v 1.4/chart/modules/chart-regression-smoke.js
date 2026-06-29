/**
 * chart-regression-smoke.js
 *
 * Quick regression gate — run BEFORE every handoff to testers.
 *
 * Usage (chart loaded with session data):
 *   await ChartRegressionSmoke.run()
 *   ChartRegressionSmoke.runSync()          // no async cases
 *
 * Auto-run on page load:
 *   /chart/?regression=1   (or ?smoke=1)
 *
 * While fixing a bug (catch "fix A, break B"):
 *   const snap = ChartRegressionSmoke.snapshotInvariants(window.chart);
 *   // ... apply your fix / reload ...
 *   ChartRegressionSmoke.assertInvariantsUnchanged(window.chart, snap, 'my change');
 *
 * When you close a bug: add ONE case to chart-regression-cases.js (copy template at bottom).
 */
(function (global) {
    'use strict';

    const VERSION = '2026-06-29';

    function getChart() {
        return global.chart || global.mainChart || null;
    }

    function getCases() {
        const list = global.ChartRegressionCases;
        return Array.isArray(list) ? list : [];
    }

    function waitForChart(timeoutMs) {
        const limit = timeoutMs == null ? 120000 : timeoutMs;
        const start = Date.now();
        return new Promise(function (resolve, reject) {
            function tick() {
                const ch = getChart();
                if (ch && Array.isArray(ch.data) && ch.data.length > 0) {
                    resolve(ch);
                    return;
                }
                if (Date.now() - start > limit) {
                    reject(new Error('ChartRegressionSmoke: timed out waiting for window.chart with candle data'));
                    return;
                }
                setTimeout(tick, 250);
            }
            tick();
        });
    }

    /** Capture cheap invariants — use before/after every risky edit. */
    function snapshotInvariants(chart) {
        if (!chart) return null;
        const ps = chart.priceScale || {};
        const dtm = chart.drawingToolsManager;
        const ur = chart.undoRedoManager || (dtm && dtm.undoRedoManager);
        return {
            buildId: global.__TALARIA_CHART_BUILD_ID || null,
            dataLen: Array.isArray(chart.data) ? chart.data.length : 0,
            symbol: chart.symbol || chart.currentSymbol || null,
            timeframe: chart.timeframe || chart.currentTimeframe || null,
            priceMin: ps.min,
            priceMax: ps.max,
            priceAutoScale: ps.autoScale,
            priceLocked: ps.locked,
            drawingCount: dtm && Array.isArray(dtm.drawings) ? dtm.drawings.length : null,
            undoDepth: ur && Array.isArray(ur.undoStack) ? ur.undoStack.length : null,
            indicatorCount: Array.isArray(chart.indicators) ? chart.indicators.length : null,
        };
    }

    function invariantFailures(before, after, label) {
        const failures = [];
        if (!before || !after) {
            failures.push((label || 'invariants') + ': missing snapshot');
            return failures;
        }
        const keys = Object.keys(before);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (k === 'buildId') continue;
            if (before[k] !== after[k]) {
                failures.push(
                    (label || 'invariants') + ': ' + k + ' changed (' + before[k] + ' → ' + after[k] + ')'
                );
            }
        }
        return failures;
    }

    function assertInvariantsUnchanged(chart, beforeSnap, label) {
        const after = snapshotInvariants(chart);
        const failures = invariantFailures(beforeSnap, after, label);
        if (failures.length) {
            const err = new Error(failures.join('; '));
            err.failures = failures;
            throw err;
        }
        return after;
    }

    const CORE_CASES = [
        {
            id: 'CORE-001',
            title: 'Chart instance and candle data loaded',
            tags: ['core'],
            run: function (ctx) {
                if (!ctx.chart) throw new Error('window.chart is missing');
                if (!Array.isArray(ctx.chart.data) || ctx.chart.data.length < 2) {
                    throw new Error('expected chart.data with at least 2 candles');
                }
            },
        },
        {
            id: 'CORE-002',
            title: 'Price scale min/max are finite and ordered',
            tags: ['core', 'viewport'],
            run: function (ctx) {
                const ps = ctx.chart.priceScale;
                if (!ps) throw new Error('chart.priceScale missing');
                if (!Number.isFinite(ps.min) || !Number.isFinite(ps.max)) {
                    throw new Error('priceScale min/max not finite');
                }
                if (ps.min >= ps.max) {
                    throw new Error('priceScale min must be < max (got ' + ps.min + ', ' + ps.max + ')');
                }
            },
        },
        {
            id: 'CORE-003',
            title: 'Drawing tools manager initialized',
            tags: ['core', 'drawing'],
            run: function (ctx) {
                const dtm = ctx.chart.drawingToolsManager;
                if (!dtm) throw new Error('chart.drawingToolsManager missing');
                if (!Array.isArray(dtm.drawings)) throw new Error('drawingToolsManager.drawings is not an array');
            },
        },
        {
            id: 'CORE-004',
            title: 'Undo/redo manager present',
            tags: ['core', 'undo'],
            run: function (ctx) {
                const ur = ctx.chart.undoRedoManager || (ctx.chart.drawingToolsManager && ctx.chart.drawingToolsManager.undoRedoManager);
                if (!ur) throw new Error('undoRedoManager missing');
                if (!Array.isArray(ur.undoStack) || !Array.isArray(ur.redoStack)) {
                    throw new Error('undo/redo stacks not initialized');
                }
            },
        },
        {
            id: 'CORE-005',
            title: 'Drawing export produces valid JSON (non-destructive)',
            tags: ['core', 'drawing', 'persistence'],
            run: function (ctx) {
                const dtm = ctx.chart.drawingToolsManager;
                if (!dtm || typeof dtm.exportDrawings !== 'function') {
                    throw new Error('exportDrawings not available');
                }
                const exported = dtm.exportDrawings();
                if (typeof exported !== 'string') {
                    throw new Error('exportDrawings must return a string');
                }
                const parsed = JSON.parse(exported);
                if (!Array.isArray(parsed)) {
                    throw new Error('exportDrawings JSON root must be an array');
                }
                if (parsed.length !== dtm.drawings.length) {
                    throw new Error('export array length mismatch (' + parsed.length + ' vs ' + dtm.drawings.length + ')');
                }
            },
        },
        {
            id: 'CORE-006',
            title: 'Multichart price-axis guards (if loaded)',
            tags: ['core', 'multichart'],
            run: function (ctx) {
                const guards = global.MultichartGuards;
                if (!guards || typeof guards.runGuardSelfTest !== 'function') return;
                const result = guards.runGuardSelfTest(ctx.chart);
                if (!result.ok) {
                    throw new Error('MultichartGuards: ' + (result.failures || []).join('; '));
                }
            },
        },
    ];

    function mergeCases(options) {
        const custom = getCases();
        const all = CORE_CASES.concat(custom);
        const only = options && options.only;
        const tags = options && options.tags;
        return all.filter(function (c) {
            if (only && only.length && only.indexOf(c.id) === -1) return false;
            if (tags && tags.length) {
                const ct = c.tags || [];
                for (let i = 0; i < tags.length; i++) {
                    if (ct.indexOf(tags[i]) !== -1) return true;
                }
                return false;
            }
            return true;
        });
    }

    async function runOne(testCase, chart) {
        const ctx = {
            chart: chart,
            snapshot: snapshotInvariants(chart),
            assert: function (cond, msg) {
                if (!cond) throw new Error(msg || 'assertion failed');
            },
            snapshotInvariants: snapshotInvariants,
            assertInvariantsUnchanged: assertInvariantsUnchanged,
        };
        const fn = testCase.run;
        if (typeof fn !== 'function') throw new Error('case has no run()');
        const out = fn(ctx);
        if (out && typeof out.then === 'function') await out;
    }

    async function run(options) {
        const chart = await waitForChart(options && options.timeoutMs);
        const cases = mergeCases(options || {});
        const passed = [];
        const failures = [];

        for (let i = 0; i < cases.length; i++) {
            const tc = cases[i];
            try {
                await runOne(tc, chart);
                passed.push(tc.id + ' — ' + tc.title);
            } catch (e) {
                failures.push({
                    id: tc.id,
                    title: tc.title,
                    message: (e && e.message) || String(e),
                });
            }
        }

        const result = {
            ok: failures.length === 0,
            version: VERSION,
            buildId: global.__TALARIA_CHART_BUILD_ID || null,
            ran: cases.length,
            passed: passed,
            failures: failures,
        };

        if (result.ok) {
            console.info('[ChartRegressionSmoke] PASS — ' + cases.length + ' cases, build ' + result.buildId);
        } else {
            console.error('[ChartRegressionSmoke] FAIL — ' + failures.length + ' of ' + cases.length, failures);
        }

        return result;
    }

    function runSync(options) {
        const chart = getChart();
        if (!chart || !Array.isArray(chart.data) || !chart.data.length) {
            return Promise.reject(new Error('ChartRegressionSmoke.runSync: chart not ready — use await run()'));
        }
        const syncOnly = Object.assign({}, options || {}, {
            only: (options && options.only) || CORE_CASES.map(function (c) { return c.id; }),
        });
        return run(syncOnly);
    }

    function showBanner(result) {
        try {
            var el = document.getElementById('chart-regression-banner');
            if (!el) {
                el = document.createElement('div');
                el.id = 'chart-regression-banner';
                el.style.cssText =
                    'position:fixed;bottom:12px;right:12px;z-index:999999;max-width:420px;padding:12px 14px;' +
                    'font:13px/1.4 system-ui,sans-serif;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.35);';
                document.body.appendChild(el);
            }
            if (result.ok) {
                el.style.background = '#0d3d2a';
                el.style.color = '#b8f5d4';
                el.textContent = 'Regression smoke PASS (' + result.ran + ' cases) · build ' + (result.buildId || '?');
            } else {
                el.style.background = '#4a1212';
                el.style.color = '#ffd4d4';
                el.textContent =
                    'Regression smoke FAIL — ' +
                    result.failures.length +
                    ' case(s). See console. First: ' +
                    (result.failures[0] && result.failures[0].id) +
                    ' ' +
                    (result.failures[0] && result.failures[0].message);
            }
        } catch (_) {}
    }

    function maybeAutoRun() {
        try {
            var p = new URLSearchParams(global.location && global.location.search);
            if (p.get('regression') !== '1' && p.get('smoke') !== '1') return;
            run().then(showBanner).catch(function (e) {
                console.error('[ChartRegressionSmoke] auto-run error', e);
                showBanner({ ok: false, ran: 0, failures: [{ id: 'BOOT', message: (e && e.message) || String(e) }], buildId: null });
            });
        } catch (_) {}
    }

    global.ChartRegressionSmoke = {
        VERSION: VERSION,
        CORE_CASES: CORE_CASES,
        waitForChart: waitForChart,
        snapshotInvariants: snapshotInvariants,
        assertInvariantsUnchanged: assertInvariantsUnchanged,
        run: run,
        runSync: runSync,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeAutoRun);
    } else {
        maybeAutoRun();
    }
})(typeof window !== 'undefined' ? window : globalThis);
