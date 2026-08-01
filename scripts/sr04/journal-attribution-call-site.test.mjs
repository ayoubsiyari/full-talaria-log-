/**
 * journal-attribution-call-site.test.mjs
 *
 * The resolver already had a passing unit suite while the product still wrote the wrong instrument,
 * because nothing called it. These cells therefore refuse to import a helper and assert on it: they
 * EXTRACT THE REAL SOURCE of saveTradeToJournal's ticker/scalar block out of the shipped file and run
 * it, against the REAL trade-attribution module, through the production one-argument call that walks
 * the window. If the wiring is deleted the extracted text changes and these cells fail on behaviour.
 *
 * Scene throughout: host panel shows EURUSD and holds focus, an iframe panel shows USDJPY, and a
 * USDJPY position closes in the background. A correct journal row is priced at 156.789. The defect
 * priced it at 1.08456 while still calling it USDJPY.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'modules', 'order-manager.js');
const ATTRIBUTION = path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'trade-attribution.js');

const EUR_MARK = 1.08456;
const JPY_MARK = 156.789;

/* ------------------------------------------------------------------ extraction */

/** Brace-match a `    name(...) {` method body out of the class. Unique-needle guarded. */
function extractMethod(src, name) {
    const needle = new RegExp(`\\n    ${name}\\(`, 'g');
    const hits = src.match(needle) || [];
    assert.equal(hits.length, 1, `needle for ${name} must match exactly once, got ${hits.length}`);
    const start = src.search(needle);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start + 1, i + 1);
        }
    }
    throw new Error(`unbalanced braces extracting ${name}`);
}

/**
 * The call site itself: everything saveTradeToJournal does to decide the pair and its scalars.
 * Anchored on the comment that opens the block and the statement that follows it, so the extract
 * tracks the shipped text rather than a copy of it.
 */
function extractCallSite(src) {
    const OPEN = '        // Resolve ticker from the order first';
    const CLOSE = '        const defaultSetup =';
    const a = src.indexOf(OPEN);
    assert.notEqual(a, -1, 'call-site opening anchor not found');
    assert.equal(src.indexOf(OPEN, a + 1), -1, 'call-site opening anchor must be unique');
    const b = src.indexOf(CLOSE, a);
    assert.notEqual(b, -1, 'call-site closing anchor not found');
    return src.slice(a, b);
}

/* ------------------------------------------------------------------ scene */

function makeChart(symbol, fileId, mark) {
    return { currentSymbol: symbol, currentFileId: fileId, __candle: { c: mark } };
}

/**
 * Host realm + one iframe panel, which is the shipped multichart topology (tile A is the host
 * reusing the page's chart, the rest are iframes). Built so the real module's default window walk
 * has something faithful to walk.
 */
function installWindow({ hostChart, panelCharts = [], flag = undefined }) {
    const frames = panelCharts.map((c) => ({ contentWindow: { chart: c, document: { querySelectorAll: () => [] } } }));
    const win = {
        chart: hostChart,
        document: { querySelectorAll: (sel) => (sel === 'iframe' ? frames : []) },
        marketCalcEngine: {
            getCalculator: (ticker) => ({
                specs: { pipSize: ticker === 'USDJPY' ? 0.01 : 0.0001 },
                // Deliberately mark-dependent: the recorded pip value NAMES the chart the mark came
                // from, so a focus-sourced mark cannot hide behind a plausible-looking number.
                calcPipValuePerLot: (mark) => (Number.isFinite(mark) ? mark * 1000 : null)
            })
        }
    };
    win.top = win;
    if (flag !== undefined) win.__TALARIA_DISABLE_JOURNAL_ATTRIBUTION_V1 = flag;
    globalThis.window = win;
    // The real module, loaded exactly as the browser does: it installs onto window on load.
    delete require.cache[require.resolve(ATTRIBUTION)];
    const api = require(ATTRIBUTION);
    win.TalariaTradeAttribution = api;
    return win;
}

/**
 * An order-manager stand-in carrying the REAL extracted methods and stubs for everything else.
 *
 * `ownChart` is the manager's own this.chart and defaults to the focused one. They are separable
 * because the two are NOT the same thing in an embed — this.chart is the surface the manager was
 * constructed against, while the focused chart is whatever the user last clicked. Keeping them
 * distinguishable is what makes "decline to the legacy reading" testably different from "guess a
 * chart that happens to be lying around".
 */
function makeManager(src, focusedChart, ownChart = focusedChart) {
    const mgr = {
        contractSize: 100000,
        pipSize: 0.0001,
        pipValuePerLot: 10,
        marketType: 'forex',
        chart: ownChart,
        orderService: {
            getInstrumentSettings: (ticker, d) => ({
                ticker,
                contract_size: d.contractSize,
                pip_size: d.pipSize,
                pip_value_per_lot: d.pipValuePerLot
            })
        },
        _ensureInstrumentCostFieldsMaterialized: (base) => base,
        _getCurrentCandleForChart: (ch) => (ch ? ch.__candle : null),
        getCurrentCandle: () => focusedChart.__candle,
        _getSymbol: () => focusedChart.currentSymbol
    };
    for (const name of ['_normalizeTicker', '_getActiveTicker', '_getActiveInstrumentSettings']) {
        // eslint-disable-next-line no-new-func
        mgr[name] = new Function(`return function ${extractMethod(src, name)}`)();
    }
    if (/\n    _resolveJournalContextChart\(/.test(src)) {
        // eslint-disable-next-line no-new-func
        mgr._resolveJournalContextChart = new Function(
            `return function ${extractMethod(src, '_resolveJournalContextChart')}`
        )();
    }
    return mgr;
}

/** Run the real call-site text and report what the journal row would carry. */
function runCallSite(src, mgr, order) {
    // eslint-disable-next-line no-new-func
    const fn = new Function('order', `${extractCallSite(src)}\nreturn { symbol, instrumentSettings };`);
    return fn.call(mgr, order);
}

function journalRowFor(src, { order, focus, panels, flag, own }) {
    installWindow({ hostChart: focus, panelCharts: panels, flag });
    return runCallSite(src, makeManager(src, focus, own || focus), order);
}

const SRC = fs.readFileSync(CANONICAL, 'utf8');
const eur = () => makeChart('EURUSD', 'f-eur', EUR_MARK);
const jpy = () => makeChart('USDJPY', 'f-jpy', JPY_MARK);
const backgroundJpyClose = { id: 4171, sourceFileId: 'f-jpy' };

/* ------------------------------------------------------------------ cells */

test('C1 a background USDJPY close is priced at USDJPY while EURUSD holds focus', () => {
    const focus = eur();
    const row = journalRowFor(SRC, { order: backgroundJpyClose, focus, panels: [jpy()] });
    assert.equal(row.symbol, 'USDJPY');
    assert.equal(row.instrumentSettings.ticker, 'USDJPY');
    assert.equal(row.instrumentSettings.pip_size, 0.01, 'JPY pip size, not the 4-dp EURUSD one');
});

test('C2 the recorded pip value derives from the OWNING chart mark, not the focused one', () => {
    const row = journalRowFor(SRC, { order: backgroundJpyClose, focus: eur(), panels: [jpy()] });
    assert.equal(row.instrumentSettings.pip_value_per_lot, JPY_MARK * 1000);
    assert.notEqual(row.instrumentSettings.pip_value_per_lot, EUR_MARK * 1000);
});

/**
 * Pinned to the commit immediately BEFORE the wiring landed, not to HEAD. Reading HEAD made this
 * gate quietly stop testing anything the moment the next commit arrived — it compared the fix
 * against itself and went red for the wrong reason.
 */
const PRE_WIRING_SHA = '468e7417de4c13a0af845b3a081c643aa4350664';

test('C3 GATE-01 the shipped source BEFORE this change produces the defect these cells catch', () => {
    const head = execFileSync(
        'git',
        ['show', `${PRE_WIRING_SHA}:chart v 1.4/chart/modules/order-manager.js`],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 }
    );
    const row = journalRowFor(head, { order: backgroundJpyClose, focus: eur(), panels: [jpy()] });
    assert.equal(row.symbol, 'EURUSD', 'legacy path names the focused pair');
    assert.equal(row.instrumentSettings.pip_value_per_lot, EUR_MARK * 1000,
        'legacy path prices a USDJPY close at the EURUSD mark — the reported defect');
});

test('C4 FLAG-03 OFF restores the legacy reading AND still writes a usable row', () => {
    const row = journalRowFor(SRC, { order: backgroundJpyClose, focus: eur(), panels: [jpy()], flag: true });
    assert.equal(row.symbol, 'EURUSD', 'kill-switch returns the legacy focus reading');
    // Working product, not merely "feature inactive": the row is still journallable.
    assert.ok(row.symbol && row.symbol !== 'UNKNOWN', 'row still carries a pair');
    assert.ok(Number.isFinite(row.instrumentSettings.pip_value_per_lot)
        && row.instrumentSettings.pip_value_per_lot > 0, 'row still carries usable scalars');
    assert.ok(Number.isFinite(row.instrumentSettings.pip_size) && row.instrumentSettings.pip_size > 0);
});

test('C5 FLAG-02 truthy disables, falsy keeps, read fresh on every call', () => {
    for (const v of [true, 1, 'yes', 'true', {}, [], '0']) {
        const row = journalRowFor(SRC, { order: backgroundJpyClose, focus: eur(), panels: [jpy()], flag: v });
        assert.equal(row.symbol, 'EURUSD', `truthy ${JSON.stringify(v)} must disable`);
    }
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        const row = journalRowFor(SRC, { order: backgroundJpyClose, focus: eur(), panels: [jpy()], flag: v });
        assert.equal(row.symbol, 'USDJPY', `falsy ${JSON.stringify(v)} must keep the fix`);
    }
});

test('C5b the flag is re-read mid-session, not latched at construction', () => {
    const focus = eur();
    installWindow({ hostChart: focus, panelCharts: [jpy()] });
    const mgr = makeManager(SRC, focus);
    assert.equal(runCallSite(SRC, mgr, backgroundJpyClose).symbol, 'USDJPY');
    globalThis.window.__TALARIA_DISABLE_JOURNAL_ATTRIBUTION_V1 = 1;
    assert.equal(runCallSite(SRC, mgr, backgroundJpyClose).symbol, 'EURUSD', 'same instance, flipped mid-run');
    globalThis.window.__TALARIA_DISABLE_JOURNAL_ATTRIBUTION_V1 = false;
    assert.equal(runCallSite(SRC, mgr, backgroundJpyClose).symbol, 'USDJPY', 'and back');
});

test('C6 an order naming no owner falls back to focus and still writes a row', () => {
    const row = journalRowFor(SRC, { order: { id: 1 }, focus: eur(), panels: [jpy()] });
    assert.equal(row.symbol, 'EURUSD');
    assert.ok(Number.isFinite(row.instrumentSettings.pip_value_per_lot));
});

test('C7 an AMBIGUOUS record (two panels, one file) never guesses — falls back, does not pick one', () => {
    const focus = eur();
    const row = journalRowFor(SRC, {
        order: backgroundJpyClose,
        focus,
        panels: [jpy(), makeChart('USDJPY', 'f-jpy', 999.999)]
    });
    assert.equal(row.symbol, 'EURUSD', 'unresolvable → legacy fallback');
    assert.notEqual(row.instrumentSettings.pip_value_per_lot, 999.999 * 1000, 'must not adopt a guessed panel');
});

test('C7b declining means the LEGACY reading, not the manager own chart picked as a consolation', () => {
    // Three distinct pairs: the manager was built against GBPUSD, the user is looking at EURUSD,
    // and the record is ambiguous. Declining must land on the focused reading the legacy path gave.
    // Anything that substitutes a conveniently-reachable chart lands on GBPUSD instead.
    const row = journalRowFor(SRC, {
        order: backgroundJpyClose,
        focus: eur(),
        own: makeChart('GBPUSD', 'f-gbp', 1.2711),
        panels: [jpy(), makeChart('USDJPY', 'f-jpy', 999.999)]
    });
    assert.equal(row.symbol, 'EURUSD', 'declined resolution falls back to the focused reading');
    assert.notEqual(row.symbol, 'GBPUSD', 'must not substitute the manager own chart');
    assert.equal(row.instrumentSettings.pip_value_per_lot, EUR_MARK * 1000,
        'and the scalars follow that same fallback, not a third chart');
});

test('C8 explicit fields on the record still outrank the resolved chart', () => {
    const withTicker = journalRowFor(SRC, {
        order: { id: 2, sourceFileId: 'f-jpy', ticker: 'GBPUSD' }, focus: eur(), panels: [jpy()]
    });
    assert.equal(withTicker.symbol, 'GBPUSD', 'order.ticker keeps precedence');

    const withSettings = journalRowFor(SRC, {
        order: { id: 3, sourceFileId: 'f-jpy', instrument_settings: { ticker: 'XAUUSD', pip_size: 0.1 } },
        focus: eur(),
        panels: [jpy()]
    });
    assert.equal(withSettings.instrumentSettings.ticker, 'XAUUSD', 'order.instrument_settings keeps precedence');
});

test('C9 resolution is focus-INVARIANT: moving focus does not move the recorded pair', () => {
    const a = journalRowFor(SRC, { order: backgroundJpyClose, focus: eur(), panels: [jpy()] });
    const b = journalRowFor(SRC, { order: backgroundJpyClose, focus: jpy(), panels: [eur()] });
    assert.equal(a.symbol, 'USDJPY');
    assert.equal(b.symbol, 'USDJPY');
    assert.equal(a.instrumentSettings.pip_value_per_lot, b.instrumentSettings.pip_value_per_lot);
});

test('C10 the call site reaches the resolver through the PRODUCTION one-argument window walk', () => {
    // The owning chart is reachable only by walking into the iframe; nothing is injected here.
    const focus = eur();
    installWindow({ hostChart: focus, panelCharts: [jpy()] });
    let calls = 0;
    const real = globalThis.window.TalariaTradeAttribution._resolveTradeJournalAttribution;
    globalThis.window.TalariaTradeAttribution = {
        _resolveTradeJournalAttribution: (...args) => {
            calls++;
            assert.equal(args.length, 1, 'production call passes the record alone');
            return real(...args);
        }
    };
    const out = runCallSite(SRC, makeManager(SRC, focus), backgroundJpyClose);
    assert.equal(calls, 1, 'the journal path must actually call the resolver');
    assert.equal(out.symbol, 'USDJPY');
});

test('C11 both shipped copies carry the wiring and are byte-identical', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf8');
    assert.equal(SRC, mirror, 'order-manager.js copies must be byte-identical');
    for (const src of [SRC, mirror]) {
        assert.match(src, /_resolveTradeJournalAttribution/);
        assert.match(src, /_resolveJournalContextChart\(order\)/);
    }
});

test('C12 trade-attribution.js is in the panel script list, so the resolver is loadable', () => {
    for (const rel of [
        path.join('chart v 1.4', 'chart', 'multichart-prod', 'chart-embed.html'),
        path.join('homepage', 'public', 'chart', 'multichart-prod', 'chart-embed.html')
    ]) {
        const html = fs.readFileSync(path.join(REPO, rel), 'utf8');
        const attrIdx = html.indexOf('/chart/modules/trade-attribution.js');
        const omIdx = html.indexOf('/chart/modules/order-manager.js');
        assert.notEqual(attrIdx, -1, `${rel} must load trade-attribution.js`);
        assert.notEqual(omIdx, -1, `${rel} must load order-manager.js`);
        assert.ok(attrIdx < omIdx, `${rel} must load the resolver before its caller`);
    }
});
