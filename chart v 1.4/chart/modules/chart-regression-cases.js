/**
 * chart-regression-cases.js
 *
 * ADD ONE CASE HERE FOR EVERY BUG YOU FIX — then it can never silently come back.
 *
 * Workflow:
 *   1. Reproduce the bug once.
 *   2. Fix it in chart.js / drawing-tools-*.js / etc.
 *   3. Paste a case below that FAILS on the old build and PASSES on the fixed build.
 *   4. Before each tester handoff: open chart with ?regression=1 OR run in console:
 *        await ChartRegressionSmoke.run()
 *   5. While editing risky code:
 *        const s = ChartRegressionSmoke.snapshotInvariants(window.chart);
 *        // ... your change ...
 *        ChartRegressionSmoke.assertInvariantsUnchanged(window.chart, s, 'ticket-123');
 *
 * Template — copy/paste and edit:
 *
 *   {
 *     id: 'BUG-###',
 *     title: 'Short description of what broke',
 *     tags: ['drawing'],  // drawing | undo | viewport | indicators | orders | replay
 *     run: function (ctx) {
 *       var chart = ctx.chart;
 *       var dtm = chart.drawingToolsManager;
 *       // throw new Error('...') when broken
 *     },
 *   },
 */
(function (global) {
    'use strict';

    global.ChartRegressionCases = [
        // ── Paste fixed-bug cases below (newest at top) ──────────────────────

        // Example (delete or replace when you add real cases):
        // {
        //     id: 'BUG-001',
        //     title: 'Trend line count stable after export/import',
        //     tags: ['drawing', 'persistence'],
        //     run: function (ctx) {
        //         var dtm = ctx.chart.drawingToolsManager;
        //         var n = dtm.drawings.length;
        //         var json = dtm.exportDrawings();
        //         dtm.importDrawings(json);
        //         if (dtm.drawings.length !== n) {
        //             throw new Error('drawing count changed after round-trip');
        //         }
        //     },
        // },
    ];
})(typeof window !== 'undefined' ? window : globalThis);
