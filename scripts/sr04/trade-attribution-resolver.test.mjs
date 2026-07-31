/**
 * SR-05 — _resolveTradeJournalAttribution(order[, chartSource]) behavioural suite.
 *
 * Imports modules/trade-attribution.js DIRECTLY, the way E's oracle does — no source
 * extraction, no browser realm. Asserts the published contract from
 * A-RESOLVER-SIGNATURE-RESERVED-CONTRACT-20260731-1915.md.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const MODULE = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'trade-attribution.js');

const { _resolveTradeJournalAttribution: resolve } = require(MODULE);

/** A plain list of charts — the injection seam, exactly as an oracle supplies it. */
function charts(...ids) {
    return ids.map((id, i) => ({ currentFileId: id, __label: i === 0 ? 'host' : `panel${i}` }));
}

/** A realm graph, for the default window-walk path. */
function buildWorld(specs) {
    const frames = [];
    const host = {
        chart: { currentFileId: specs[0], __label: 'host' },
        document: { querySelectorAll: () => frames },
    };
    host.top = host;
    for (let i = 1; i < specs.length; i++) {
        frames.push({
            contentWindow: {
                chart: { currentFileId: specs[i], __label: `panel${i}` },
                document: { querySelectorAll: () => [] },
            },
        });
    }
    return host;
}

test('C1 resolves an order to the chart owning its sourceFileId, not the host', () => {
    const got = resolve({ id: 1, sourceFileId: 'FILE-C' }, charts('HOST-A', 'FILE-B', 'FILE-C'));
    assert.ok(got, 'expected a resolution');
    assert.equal(got.__label, 'panel2');
    assert.notEqual(got.__label, 'host', 'must not fall back to the host');
});

test('C2 FOCUS-INVARIANCE: the answer does not move when focus moves', () => {
    const set = charts('HOST-A', 'FILE-B', 'FILE-C');
    const answers = [];
    for (const focused of [set[0], set[1], set[2], null]) {
        globalThis.__focusedChart = focused;          // ambient focus the resolver must ignore
        answers.push(resolve({ id: 2, sourceFileId: 'FILE-B' }, set).__label);
    }
    delete globalThis.__focusedChart;
    assert.deepEqual(answers, ['panel1', 'panel1', 'panel1', 'panel1'],
        'resolution must be identical under every focus state');
});

test('C3 returns null when nothing matches — never a host fallback', () => {
    assert.equal(resolve({ id: 3, sourceFileId: 'FILE-ZZZ' }, charts('HOST-A', 'FILE-B')), null);
});

test('C4 AMBIGUOUS same-file charts resolve to null rather than guessing', () => {
    assert.equal(resolve({ id: 4, sourceFileId: 'FILE-B' }, charts('HOST-A', 'FILE-B', 'FILE-B')), null,
        'two charts on one file do not name an owner; picking one would be a confident wrong answer');
});

test('C5 total on shape: null/undefined/{}/missing key all yield null, none throw', () => {
    const set = charts('HOST-A', 'FILE-B');
    for (const bad of [null, undefined, {}, { sourceFileId: null }, { sourceFileId: '' }, 42, 'x', []]) {
        assert.equal(resolve(bad, set), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('C6 a destroyed owner yields null, never a different chart', () => {
    const set = charts('HOST-A', 'FILE-B', 'FILE-C');
    assert.equal(resolve({ sourceFileId: 'FILE-C' }, set).__label, 'panel2');
    set.pop();                                        // panel2 goes away
    assert.equal(resolve({ sourceFileId: 'FILE-C' }, set), null);
});

test('C7 stable across repeated calls while the owner lives', () => {
    const set = charts('HOST-A', 'FILE-B');
    const a = resolve({ sourceFileId: 'FILE-B' }, set);
    assert.equal(resolve({ sourceFileId: 'FILE-B' }, set), a);
    assert.equal(resolve({ sourceFileId: 'FILE-B' }, set), a);
});

test('C8 kill-switch is TRUTHY-disabling, not === true, and re-read every call', () => {
    const set = charts('HOST-A', 'FILE-B');
    const order = { sourceFileId: 'FILE-B' };
    for (const truthy of [true, 1, 'yes', 'true', {}, [], '0']) {
        globalThis.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 = truthy;
        assert.equal(resolve(order, set), null, `truthy ${JSON.stringify(truthy)} must disable`);
    }
    for (const falsy of [undefined, null, false, 0, '', NaN]) {
        globalThis.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 = falsy;
        assert.ok(resolve(order, set), `falsy ${JSON.stringify(falsy)} must keep the resolver live`);
    }
    globalThis.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 = undefined;
});

test('C9 numeric and string file ids compare equal (stamped ids are stringified)', () => {
    assert.equal(resolve({ sourceFileId: '7' }, charts('HOST-A', 7)).__label, 'panel1');
});

test('C10 INJECTION SEAM accepts a function as well as an array', () => {
    const set = charts('HOST-A', 'FILE-B');
    assert.equal(resolve({ sourceFileId: 'FILE-B' }, () => set).__label, 'panel1');
});

test('C11 a throwing or malformed chartSource yields null, never a throw', () => {
    const order = { sourceFileId: 'FILE-B' };
    assert.equal(resolve(order, () => { throw new Error('boom'); }), null);
    assert.equal(resolve(order, 'not-a-list'), null);
    assert.equal(resolve(order, [null, undefined, 7]), null);
});

test('C12 DEFAULT SOURCE still walks the window when nothing is injected', () => {
    // Proves the injection seam did not replace the production path, only added to it.
    const saved = globalThis.window;
    globalThis.window = buildWorld(['HOST-A', 'FILE-B', 'FILE-C']);
    try {
        // Re-require in a fresh registry so the module closes over this window.
        delete require.cache[require.resolve(MODULE)];
        const fresh = require(MODULE)._resolveTradeJournalAttribution;
        assert.equal(fresh({ sourceFileId: 'FILE-C' }).__label, 'panel2',
            'default path must find the chart by walking frames');
        assert.equal(fresh({ sourceFileId: 'NOPE' }), null);
    } finally {
        if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
        delete require.cache[require.resolve(MODULE)];
    }
});

test('C13 chart.js delegates and does NOT carry a second implementation', () => {
    const chartSrc = readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js'), 'utf8');
    assert.ok(/TalariaTradeAttribution/.test(chartSrc), 'chart.js must delegate to the module');
    assert.ok(!/const key = String\(wanted\)/.test(chartSrc),
        'chart.js must not keep a duplicate implementation that can drift');
});

test('C14 both shells I own load the module', () => {
    for (const shell of [
        path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'chart-embed.html'),
        path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'chart-embed.html'),
    ]) {
        assert.ok(readFileSync(shell, 'utf8').includes('/chart/modules/trade-attribution.js'),
            `${shell} must load trade-attribution.js`);
    }
});

test('C15 mirror carries the identical module', () => {
    const a = readFileSync(MODULE, 'utf8');
    const b = readFileSync(path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'trade-attribution.js'), 'utf8');
    assert.equal(a, b, 'mirrors must be byte-identical');
});
