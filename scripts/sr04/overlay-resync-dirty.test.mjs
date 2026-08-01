/**
 * overlay-resync-dirty.test.mjs  —  roster row LAG-1b
 *
 * render() re-synced every order overlay on every full frame: 14.4 ms/s of main-thread
 * self time, 712 calls in 6 seconds across 4 realms, whether or not anything an order
 * line depends on had moved. The fix gates the render-path `updateOrderLines(this)` on
 * a dirty key.
 *
 * These cells do not re-implement the gate. They EXTRACT the shipped text — the call
 * site inside render(), the two chart methods it leans on, and the real cross-realm
 * flag reader — out of `chart v 1.4/chart/chart.js` and run that text against a scene.
 * If the gate is deleted, weakened, or re-worded into something else, the extract
 * changes and these cells fail on behaviour rather than on a string match.
 *
 * Direction of failure is the whole point on this row: a redundant resync costs frame
 * time, a missed one leaves stale order lines and stale unrealised P&L on a money
 * surface. Every indeterminate state must therefore CALL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'chart.js');
const REL_CANONICAL = 'chart v 1.4/chart/chart.js';

const SWITCH = '__TALARIA_OVERLAY_RESYNC_DIRTY_V1';

/* ------------------------------------------------------------------ extraction */

/** Brace-match forward from `from`, returning the text through the matching `}`. */
function braceMatch(src, from) {
    let i = src.indexOf('{', from);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(from, i + 1);
        }
    }
    throw new Error(`unbalanced braces from offset ${from}`);
}

/** A `    name(...) {` class method, unique-needle guarded. */
function extractMethod(src, name) {
    const needle = `\n    ${name}(`;
    const hits = src.split(needle).length - 1;
    assert.equal(hits, 1, `needle for ${name} must match exactly once, got ${hits}`);
    return braceMatch(src, src.indexOf(needle) + 1);
}

function hasMethod(src, name) {
    return src.includes(`\n    ${name}(`);
}

/** The module-level cross-realm flag reader, so the extracted method calls the real one. */
function extractFlagReader(src) {
    const needle = 'function _talariaDisableFlagTruthy(';
    const hits = src.split(needle).length - 1;
    assert.equal(hits, 1, `flag reader must appear exactly once, got ${hits}`);
    return braceMatch(src, src.indexOf(needle));
}

/**
 * The render() order-manager block verbatim. Opening anchor is the comment that has
 * introduced the block since before this row existed, so the same extractor reaches
 * both the pre-change bytes and the shipped ones.
 */
function extractCallSite(src) {
    const OPEN = '        // Update order lines if order manager is active';
    const CLOSE = '        // Draw secondary indicators (RSI, MACD, etc.) in their own panels';
    const a = src.indexOf(OPEN);
    assert.notEqual(a, -1, 'call-site opening anchor not found');
    assert.equal(src.indexOf(OPEN, a + 1), -1, 'call-site opening anchor must be unique');
    const b = src.indexOf(CLOSE, a);
    assert.notEqual(b, -1, 'call-site closing anchor not found');
    return src.slice(a, b);
}

function compileMethod(src, name) {
    // eslint-disable-next-line no-new-func
    return new Function(`${extractFlagReader(src)}\nreturn function ${extractMethod(src, name)};`)();
}

/* ------------------------------------------------------------------ scene */

function installWindow(flag) {
    const win = {};
    win.parent = win;
    win.top = win;
    if (flag !== undefined) win[SWITCH] = flag;
    globalThis.window = win;
    return win;
}

function makeScale(domain, range) {
    const scale = (v) => v;
    scale.domain = () => domain.slice();
    scale.range = () => range.slice();
    return scale;
}

function makeBars(count) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        bars.push({ t: 1700000000000 + i * 60000, o: 1.05, h: 1.06, l: 1.04, c: 1.05 + i * 1e-5 });
    }
    return bars;
}

/**
 * One panel with one open position on screen. `calls` counts the render-path resyncs;
 * the preview / MFE-MAE siblings in the same block are stubbed because this row gates
 * updateOrderLines alone.
 */
function makeChart(src, overrides = {}) {
    const calls = [];
    const data = makeBars(400);
    const om = {
        updateOrderLines() { calls.push('resync'); },
        updatePreviewLinePositions() {},
        _scheduleDraftPreviewRedrawIfNeeded() {},
        updateMfeMaeMarkers() {},
        orderLines: [{ orderId: 7, isPending: false }],
        openPositions: [{ id: 7, openPrice: 1.05, stopLoss: 1.04, takeProfit: 1.07, quantity: 1 }],
        pendingOrders: [],
        splitGroupAvgLines: [],
        orderService: { openPositions: [], pendingOrders: [] },
    };
    const chart = {
        calls,
        orderManager: om,
        data,
        dataVersion: 3,
        currentSymbol: 'EURUSD',
        currentTimeframe: '1m',
        offsetX: -120,
        w: 1280,
        h: 720,
        priceZoom: 1,
        priceOffset: 0,
        margin: { l: 0, r: 62, t: 12, b: 28 },
        yScale: makeScale([1.0400, 1.0700], [680, 12]),
        getCandleSpacing: () => 8,
        ...overrides,
    };
    for (const name of ['_overlayCollectionToken', '_overlayResyncDirtyKey']) {
        if (hasMethod(src, name)) chart[name] = compileMethod(src, name);
    }
    return chart;
}

function windowOf(chart, start = 40, size = 60) {
    return chart.data.slice(start, start + size);
}

function renderOnce(src, chart, visible, chartViewPanning = false) {
    // eslint-disable-next-line no-new-func
    const fn = new Function('chartViewPanning', 'visible', extractCallSite(src));
    fn.call(chart, chartViewPanning, visible);
}

/** Renders once to prime the stored key, then applies `mutate` and renders again. */
function resyncsAfter(src, mutate, overrides = {}) {
    installWindow();
    const chart = makeChart(src, overrides);
    renderOnce(src, chart, windowOf(chart));
    const before = chart.calls.length;
    const next = mutate ? mutate(chart) : undefined;
    renderOnce(src, chart, Array.isArray(next) ? next : windowOf(chart));
    return chart.calls.length - before;
}

const SRC = fs.readFileSync(CANONICAL, 'utf8');

/* ------------------------------------------------------------------ cells */

/**
 * Pinned base commit, consulted only once the fix is committed: reading HEAD then
 * compares the fix against itself and the gate quietly stops testing anything.
 */
const PRE_FIX_SHA = 'b08b2e3ed4c7963baa1eada77a33e6e10e05701f';

function gitShow(ref) {
    return execFileSync('git', ['show', `${ref}:${REL_CANONICAL}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 400,
    });
}

function preFixSource() {
    const head = gitShow('HEAD');
    if (!head.includes('_overlayResyncDirtyKey')) return { ref: 'HEAD', src: head };
    return { ref: PRE_FIX_SHA, src: gitShow(PRE_FIX_SHA) };
}

test('C1 GATE-01 the shipped source BEFORE this change resyncs on every idle frame', () => {
    const { ref, src } = preFixSource();
    assert.ok(!src.includes('_overlayResyncDirtyKey'), `${ref} must predate the gate`);

    installWindow();
    const chart = makeChart(src);
    const visible = windowOf(chart);
    for (let i = 0; i < 6; i++) renderOnce(src, chart, visible);
    assert.equal(chart.calls.length, 6,
        'pre-change render() calls updateOrderLines unconditionally — the reported defect');
});

test('C2 fix active: an idle frame with nothing changed does not resync', () => {
    installWindow();
    const chart = makeChart(SRC);
    const visible = windowOf(chart);
    for (let i = 0; i < 6; i++) renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 1, 'first frame syncs, the five identical ones skip');
});

test('C3 fix active: a changed overlay collection resyncs', () => {
    assert.equal(
        resyncsAfter(SRC, (chart) => { chart.orderManager.orderLines.push({ orderId: 8, isPending: true }); }),
        1,
        'a new order line must resync',
    );
    assert.equal(
        resyncsAfter(SRC, (chart) => { chart.orderManager.openPositions = []; }),
        1,
        'a closed position must resync',
    );
    assert.equal(
        resyncsAfter(SRC, (chart) => { chart.orderManager.pendingOrders.push({ id: 9, entryPrice: 1.06 }); }),
        1,
        'a new pending order must resync',
    );
});

test('C3b fix active: a SAME-LENGTH rebuilt collection resyncs (identity, not count)', () => {
    // order-manager.js rebuilds orderLines with .filter(); a replacement holding an
    // equivalent row is invisible to a length-only key but is a different array.
    const grown = resyncsAfter(SRC, (chart) => {
        chart.orderManager.orderLines = [{ orderId: 7, isPending: false }];
    });
    assert.equal(grown, 1, 'a rebuilt collection of the same length must resync');
});

test('C4 fix active: a changed offsetX resyncs', () => {
    assert.equal(resyncsAfter(SRC, (chart) => { chart.offsetX -= 8; }), 1);
    assert.equal(resyncsAfter(SRC, (chart) => { chart.offsetX -= 0.5; }), 1, 'sub-pixel pan too');
});

test('C5 fix active: a changed visible bar range resyncs', () => {
    // Same bar COUNT, different bars — scrolling one bar left must not look idle.
    assert.equal(resyncsAfter(SRC, (chart) => windowOf(chart, 41, 60)), 1);
    assert.equal(resyncsAfter(SRC, (chart) => windowOf(chart, 40, 61)), 1, 'a wider window too');
});

test('C6 fix active: price zoom, canvas size and margin changes resync', () => {
    assert.equal(resyncsAfter(SRC, (chart) => { chart.priceZoom = 1.4; }), 1);
    assert.equal(resyncsAfter(SRC, (chart) => { chart.priceOffset = 0.0012; }), 1);
    assert.equal(resyncsAfter(SRC, (chart) => { chart.yScale = makeScale([1.041, 1.069], [680, 12]); }), 1,
        'a refitted price domain moves every line');
    assert.equal(resyncsAfter(SRC, (chart) => { chart.yScale = makeScale([1.0400, 1.0700], [640, 12]); }), 1,
        'a changed scale range moves every line');
    assert.equal(resyncsAfter(SRC, (chart) => { chart.h = 640; }), 1);
    assert.equal(resyncsAfter(SRC, (chart) => { chart.w = 900; }), 1);
    assert.equal(resyncsAfter(SRC, (chart) => { chart.margin = { l: 0, r: 80, t: 12, b: 28 }; }), 1);
});

test('C7 fix active: a repriced position resyncs — P&L is redrawn by this call', () => {
    assert.equal(resyncsAfter(SRC, (chart) => {
        chart.data[chart.data.length - 1] = { ...chart.data[chart.data.length - 1], c: 1.0611 };
    }), 1, 'a new mark on the tip candle must resync');
    assert.equal(resyncsAfter(SRC, (chart) => { chart.orderManager.openPositions[0]._miLastMarkPrice = 1.0622; }), 1,
        'a host-projected mark must resync');
    assert.equal(resyncsAfter(SRC, (chart) => { chart.orderManager.openPositions[0].stopLoss = 1.0350; }), 1,
        'a dragged stop must resync');
});

test('C8 indeterminate state always CALLS — never skips on doubt', () => {
    const cases = {
        'no price scale': { yScale: undefined },
        'non-finite offsetX': { offsetX: Number.NaN },
        'non-finite canvas height': { h: Number.POSITIVE_INFINITY },
        'missing spacing helper': { getCandleSpacing: undefined },
        'non-finite price domain': { yScale: makeScale([Number.NaN, 1.07], [680, 12]) },
        'scale without domain()': { yScale: () => 0 },
        'data not an array': { data: null },
    };
    for (const [what, overrides] of Object.entries(cases)) {
        installWindow();
        const chart = makeChart(SRC, overrides);
        const visible = Array.isArray(chart.data) ? windowOf(chart) : [];
        for (let i = 0; i < 4; i++) renderOnce(SRC, chart, visible);
        assert.equal(chart.calls.length, 4, `${what} must fall through to calling, every frame`);
    }
});

test('C8b indeterminate collections and a missing key helper also CALL', () => {
    installWindow();
    const chart = makeChart(SRC);
    chart.orderManager.orderLines = { 0: { orderId: 7 }, length: 1 };
    const visible = windowOf(chart);
    for (let i = 0; i < 3; i++) renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 3, 'an array-like that is not an array is doubt, not idleness');

    installWindow();
    const noHelper = makeChart(SRC);
    delete noHelper._overlayResyncDirtyKey;
    for (let i = 0; i < 3; i++) renderOnce(SRC, noHelper, windowOf(noHelper));
    assert.equal(noHelper.calls.length, 3, 'a missing helper must not silence the resync');

    installWindow();
    const visibleNotArray = makeChart(SRC);
    for (let i = 0; i < 3; i++) renderOnce(SRC, visibleNotArray, undefined);
    assert.equal(visibleNotArray.calls.length, 3, 'an unresolvable visible window must call');
});

test('C9 kill-switch TRUTHY restores the unconditional call', () => {
    for (const v of [true, 1, 'yes', 'true', '0', {}, [], -1]) {
        installWindow(v);
        const chart = makeChart(SRC);
        const visible = windowOf(chart);
        for (let i = 0; i < 5; i++) renderOnce(SRC, chart, visible);
        assert.equal(chart.calls.length, 5, `truthy ${JSON.stringify(v)} must disable the gate`);
    }
});

test('C10 kill-switch FALSY keeps the fix, and the flag is read per call', () => {
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        installWindow(v);
        const chart = makeChart(SRC);
        const visible = windowOf(chart);
        for (let i = 0; i < 5; i++) renderOnce(SRC, chart, visible);
        assert.equal(chart.calls.length, 1, `falsy ${JSON.stringify(v)} must keep the gate active`);
    }

    // Same chart instance, flipped mid-session: an operator sets the switch on a live
    // page, so a value sampled at construction would never be seen.
    installWindow();
    const chart = makeChart(SRC);
    const visible = windowOf(chart);
    renderOnce(SRC, chart, visible);
    renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 1);
    globalThis.window[SWITCH] = 1;
    renderOnce(SRC, chart, visible);
    renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 3, 'flipped on mid-run, the same instance resyncs again');
    globalThis.window[SWITCH] = false;
    renderOnce(SRC, chart, visible);
    renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 4, 'flipped back off, the gate resumes after one resync');
});

test('C10b the switch is read through the cross-realm walk, not the own window only', () => {
    // Panels are iframes; an operator sets the switch on the host.
    const host = { [SWITCH]: 'yes' };
    const panel = {};
    panel.parent = host;
    panel.top = host;
    globalThis.window = panel;
    const chart = makeChart(SRC);
    const visible = windowOf(chart);
    for (let i = 0; i < 4; i++) renderOnce(SRC, chart, visible);
    assert.equal(chart.calls.length, 4, 'a host-set switch must reach the panel realm');
});

test('C11 the skip is stateful per chart, not shared across panels', () => {
    installWindow();
    const a = makeChart(SRC);
    const b = makeChart(SRC);
    renderOnce(SRC, a, windowOf(a));
    renderOnce(SRC, a, windowOf(a));
    renderOnce(SRC, b, windowOf(b));
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 1, 'a second panel must still get its first sync');
});

test('C12 byte-identical: both shipped copies carry the same gate', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf8');
    assert.equal(SRC, mirror, 'chart.js copies must be byte-identical');
    for (const src of [SRC, mirror]) {
        assert.match(src, /_overlayResyncDirtyKey\(visible\)/);
        assert.match(src, new RegExp(`_talariaDisableFlagTruthy\\('${SWITCH}'\\)`));
        assert.ok(!/__TALARIA_OVERLAY_RESYNC_DIRTY_V1\s*===\s*true/.test(src),
            'the switch must never be read with === true');
    }
});

test('C12b source anchor: the pan-path call sites stay unconditional', () => {
    // Three other updateOrderLines call sites exist; this row gates only the render one.
    assert.match(SRC, /om\.updateOrderLines\(this, \{\n\s+panLite: true,/);
    const panBlock = SRC.slice(
        SRC.indexOf('_syncOrderOverlaysDuringPan'),
        SRC.indexOf('\n    _overlayCollectionToken('),
    );
    assert.ok(!panBlock.includes('_overlayResyncDirtyKey('),
        'the pan path must not be gated by this key');
});
