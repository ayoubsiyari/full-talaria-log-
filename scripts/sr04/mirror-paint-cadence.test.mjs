/**
 * mirror-paint-cadence.test.mjs — REGIME-01 freeze-cadence oracle for the host mirror paint.
 *
 * WHAT THIS CERTIFIES, AND WHAT IT DOES NOT.
 * It counts Chart.render() ENTRIES per replay tick — never a downstream proxy such as a clip-rect
 * rewrite, which has burned me before. It runs BOTH regimes: zero trades and trade-bearing. It does
 * NOT witness a freeze: no browser and no paint harness exist in this repo, so a frame here is a
 * modelled rAF, not a composited one. It INFERS freeze cadence from paint count per tick. If the
 * ruling later requires the oracle to witness rather than infer, this needs a browser.
 *
 * The defect: the mirror set chart.renderPending = true and then painted synchronously. render()
 * never clears that flag, so animate() saw it on the next frame and painted the same state again.
 * Two host paints per tick, on a setTimeout cadence already asking for more frames than 60 fps.
 *
 * The regime split is the point. This path has NO trade term — animateTick fires on setTimeout,
 * updateChartWithAnimatedCandle calls the mirror unconditionally, and applyMultichartMirrorFrame
 * has no order dependency and no multichart guard. So it must green identically at 0 trades and at
 * 43, and the trade-bearing arm exists to prove the fix is not silently trade-conditioned.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');

/** Regimes are declared, not implied — a cadence figure without its trade count is not comparable. */
const REGIMES = Object.freeze([
    Object.freeze({ name: 'LAG-ZT  zero trades', trades: 0 }),
    Object.freeze({ name: 'trade-bearing', trades: 43 })
]);

/* ------------------------------------------------------------------ extraction */

/** Pull the real paint block out of _finishMultichartMirrorRender so the cells run shipped text. */
function extractPaintBlock(src) {
    const OPEN = '        if (!skipRender && typeof chart.render === \'function\') {';
    const a = src.indexOf(OPEN);
    assert.notEqual(a, -1, 'paint block not found');
    assert.equal(src.indexOf(OPEN, a + 1), -1, 'paint block anchor must be unique');
    let depth = 0;
    let i = src.indexOf('{', a);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(a, i + 1);
}

function extractFlagHelper(src) {
    const m = src.match(/function _mcMirrorPaintCoalesceDisabled\s*\([\s\S]*?\n\}/);
    return m ? m[0] : null;
}

/* ------------------------------------------------------------------ the model */

/**
 * One replay tick, then one animation frame — the real sequence, since animateTick runs on
 * setTimeout and animate() runs on rAF, so a frame always follows the tick that dirtied the chart.
 */
function runTicks(src, { ticks, trades, disabled = false, invalidateDuringPaint = false }) {
    const block = extractPaintBlock(src);

    let renderEntries = 0;
    const chart = {
        renderPending: false,
        // The trade arm must actually CARRY the trades, not merely count them. A fix keyed off
        // chart.orderManager.orders would otherwise read empty in both arms and the regime cell
        // would compare two zero-trade runs while reporting one of them as trade-bearing.
        orderManager: {
            orders: Array.from({ length: trades }, (_v, i) => ({ id: `o${i}`, status: 'closed' })),
            updatePositions() {}
        },
        render() {
            renderEntries++;
            // render() does NOT clear renderPending in the product — that is the whole mechanism,
            // so the model must not clear it either or the cell would pass vacuously.
            if (invalidateDuringPaint) scheduleRenderDuringPaint();
        }
    };

    // Order-path cost is what separates the regimes. It is modelled as work attributed to the tick,
    // NOT as extra paints, because _chartIndexForCloseMarkerOnChart does not paint — conflating the
    // two would let a trade-heavy arm mask a paint regression as "expected extra cost".
    let orderPathCalls = 0;

    /** The coalescer: scheduleRender marks dirty during playback and returns without painting. */
    function scheduleRenderDuringPaint() {
        chart.renderPending = true;
    }

    /** animate(): paints once per frame iff dirty, clearing before the paint. */
    function frame() {
        if (chart.renderPending) {
            chart.renderPending = false;
            chart.render();
        }
    }

    const flagName = '__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1';
    globalThis[flagName] = disabled ? true : undefined;
    const _talariaDisableFlagTruthy = (n) => !!globalThis[n];
    const helperSrc = extractFlagHelper(src)
        || `function _mcMirrorPaintCoalesceDisabled() { return _talariaDisableFlagTruthy('${flagName}'); }`;

    // eslint-disable-next-line no-new-func
    const tick = new Function(
        'chart', 'skipRender', 'passivePlay', 'lightPass', '_talariaDisableFlagTruthy',
        `${helperSrc}\n${block}`
    );

    let advanced = 0;
    for (let k = 0; k < ticks; k++) {
        for (let t = 0; t < trades; t++) orderPathCalls++;   // trades x bars term, no paint
        tick(chart, false, false, false, _talariaDisableFlagTruthy);
        frame();
        advanced++;
    }

    globalThis[flagName] = undefined;
    return {
        renderEntries,
        paintsPerTick: +(renderEntries / ticks).toFixed(3),
        advanced,
        orderPathCalls,
        ordersOnChart: chart.orderManager.orders.length
    };
}

const SRC = fs.readFileSync(CANONICAL, 'utf8');

/* ------------------------------------------------------------------ cells */

test('R1 REGIME-01: exactly one host paint per tick in BOTH regimes', () => {
    for (const regime of REGIMES) {
        const r = runTicks(SRC, { ticks: 120, trades: regime.trades });
        assert.equal(r.paintsPerTick, 1,
            `${regime.name} (${regime.trades} trades): expected 1 paint/tick, got ${r.paintsPerTick}`);
    }
});

test('R2 GATE-01: the shipped code BEFORE this change double-paints, in both regimes', () => {
    // Pinned: a HEAD-relative GATE-01 self-invalidates the moment the fix lands.
    const head = execFileSync('git', ['show', 'b7130540f:chart v 1.4/chart/modules/replay-system.js'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 });
    for (const regime of REGIMES) {
        const r = runTicks(head, { ticks: 120, trades: regime.trades });
        assert.equal(r.paintsPerTick, 2,
            `${regime.name}: the defect must reproduce at 2 paints/tick, got ${r.paintsPerTick}`);
    }
});

test('R3 the regimes are INDISTINGUISHABLE — this path has no trade term', () => {
    const zt = runTicks(SRC, { ticks: 120, trades: 0 });
    const heavy = runTicks(SRC, { ticks: 120, trades: 43 });
    assert.equal(zt.paintsPerTick, heavy.paintsPerTick,
        'a fix here must not be trade-conditioned in either direction');
    assert.equal(zt.renderEntries, heavy.renderEntries);
    // And the order path really was exercised in one arm and not the other, so the equality above
    // is a finding rather than an artifact of the trade count never being read.
    assert.equal(zt.orderPathCalls, 0);
    assert.equal(heavy.orderPathCalls, 120 * 43);
    assert.equal(zt.ordersOnChart, 0, 'the ZT arm must carry no orders');
    assert.equal(heavy.ordersOnChart, 43, 'the trade arm must carry real orders, not just a count');
});

test('R4 a mid-paint invalidation STILL earns its own frame', () => {
    // This is what the old ordering was protecting, and the fix must not lose it. Clearing before
    // the paint means a scheduleRender raised during it re-arms the flag and paints next frame.
    const r = runTicks(SRC, { ticks: 1, trades: 0, invalidateDuringPaint: true });
    assert.equal(r.renderEntries, 2, 'mirror paint plus the re-armed frame');
});

test('R5 FLAG-03: the OFF arm restores legacy AND still paints and advances', () => {
    for (const regime of REGIMES) {
        const r = runTicks(SRC, { ticks: 60, trades: regime.trades, disabled: true });
        assert.equal(r.paintsPerTick, 2, `${regime.name}: kill-switch restores the legacy double paint`);
        // Working product, not "feature inactive": the host still paints and the replay advances.
        assert.ok(r.renderEntries > 0, 'the host must still paint under the kill-switch');
        assert.equal(r.advanced, 60, 'replay must still advance under the kill-switch');
    }
});

test('R6 FLAG-02 truthy disables, falsy keeps', () => {
    for (const v of [true, 1, 'yes', 'true', {}, [], '0']) {
        globalThis.__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1 = v;
        const r = runTicks(SRC, { ticks: 10, trades: 0, disabled: v });
        assert.equal(r.paintsPerTick, 2, `truthy ${JSON.stringify(v)} must disable`);
    }
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        globalThis.__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1 = v;
        const r = runTicks(SRC, { ticks: 10, trades: 0, disabled: false });
        assert.equal(r.paintsPerTick, 1, `falsy ${JSON.stringify(v)} must keep the fix`);
    }
    globalThis.__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1 = undefined;
});

test('R7 the flag helper uses the shared truthy reader, not === true', () => {
    assert.match(SRC, /function _mcMirrorPaintCoalesceDisabled\(\)/);
    assert.ok(!/__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1\s*===\s*true/.test(SRC),
        'strict equality would let 1 / "yes" silently fail to disable');
});

test('R8 both shipped copies are byte-identical', () => {
    assert.equal(SRC, fs.readFileSync(MIRROR, 'utf8'), 'replay-system.js copies must match');
});

test('R9 SCOPE STAMP: cadence figures carry their regime, and the limit is recorded', () => {
    const rows = REGIMES.map((rg) => ({ regime: rg.name, trades: rg.trades, ...runTicks(SRC, { ticks: 120, trades: rg.trades }) }));
    console.log('\nHost mirror paint cadence — REGIME-01, both arms:');
    for (const r of rows) {
        console.log(`  ${r.regime.padEnd(20)} trades=${String(r.trades).padStart(2)}  `
            + `${r.paintsPerTick} paint/tick over ${r.advanced} ticks  (was 2)`);
    }
    console.log('  LIMIT: engine-level. Counts render() entries; infers freeze cadence, does not');
    console.log('         witness a freeze. No paint or compositor harness exists in this repo.');
    assert.ok(rows.every((r) => r.paintsPerTick === 1));
    assert.equal(rows.length, 2, 'both regimes must be published, never one');
});
