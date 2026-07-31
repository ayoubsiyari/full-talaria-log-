/**
 * SR-05 — _resolveTradeJournalAttribution(order) behavioural suite.
 *
 * Asserts the five published contract points from
 * A-RESOLVER-SIGNATURE-RESERVED-CONTRACT-20260731-1915.md. Cells are behavioural:
 * none of them assert on source text.
 */

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');

function extractFn(src, name) {
    const re = new RegExp(`^function ${name}\\s*\\(`, 'm');
    const m = re.exec(src);
    if (!m) throw new Error(`extract failed: ${name}`);
    let i = src.indexOf('{', m.index), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
    }
    throw new Error(`unbalanced: ${name}`);
}

const src = readFileSync(CHART_JS, 'utf8');
const collectSrc = extractFn(src, '_talariaCollectChartsForAttribution');
const resolveSrc = extractFn(src, '_resolveTradeJournalAttribution');

/** Build an isolated realm graph: a host window plus N panel iframes. */
function buildWorld(specs, { focusOn = null } = {}) {
    const frames = [];
    const hostSpec = specs[0];
    const host = {
        chart: hostSpec ? { currentFileId: hostSpec, __label: 'host' } : null,
        document: { querySelectorAll: () => frames },
    };
    host.top = host;
    for (let i = 1; i < specs.length; i++) {
        const w = {
            chart: { currentFileId: specs[i], __label: `panel${i}` },
            document: { querySelectorAll: () => [] },
        };
        w.top = host;
        frames.push({ contentWindow: w });
    }
    // Focus provider deliberately points somewhere the resolver must ignore.
    host.getActiveChart = () => (focusOn == null ? host.chart : (focusOn === 0 ? host.chart : frames[focusOn - 1].contentWindow.chart));
    return host;
}

function makeResolver(win) {
    const fn = new Function('window', `
        "use strict";
        ${collectSrc}
        ${resolveSrc}
        return _resolveTradeJournalAttribution;
    `);
    return fn(win);
}

test('C1 resolves an order to the chart that owns its sourceFileId, not the host', () => {
    const win = buildWorld(['HOST-A', 'FILE-B', 'FILE-C']);
    const resolve = makeResolver(win);
    const got = resolve({ id: 1, sourceFileId: 'FILE-C' });
    assert.ok(got, 'expected a resolution');
    assert.equal(got.__label, 'panel2');
    assert.notEqual(got.__label, 'host', 'must not fall back to the host');
});

test('C2 FOCUS-INVARIANCE: the answer does not move when focus moves', () => {
    const order = { id: 2, sourceFileId: 'FILE-B' };
    const answers = [];
    for (const focusOn of [0, 1, 2, null]) {
        const win = buildWorld(['HOST-A', 'FILE-B', 'FILE-C'], { focusOn });
        answers.push(makeResolver(win)({ ...order }).__label);
    }
    assert.deepEqual(answers, ['panel1', 'panel1', 'panel1', 'panel1'],
        'resolution must be identical under every focus state');
});

test('C3 returns null when nothing matches — never a host fallback', () => {
    const win = buildWorld(['HOST-A', 'FILE-B']);
    assert.equal(makeResolver(win)({ id: 3, sourceFileId: 'FILE-ZZZ' }), null);
});

test('C4 AMBIGUOUS same-file panels resolve to null rather than guessing', () => {
    const win = buildWorld(['HOST-A', 'FILE-B', 'FILE-B']);
    assert.equal(makeResolver(win)({ id: 4, sourceFileId: 'FILE-B' }), null,
        'two charts on one file do not name an owner; picking one would be a confident wrong answer');
});

test('C5 total on shape: null/undefined/{}/missing key/destroyed owner all yield null, none throw', () => {
    const win = buildWorld(['HOST-A', 'FILE-B']);
    const resolve = makeResolver(win);
    for (const bad of [null, undefined, {}, { sourceFileId: null }, { sourceFileId: '' }, 42, 'x', []]) {
        assert.equal(resolve(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('C6 a destroyed owner yields null, never a different chart', () => {
    const win = buildWorld(['HOST-A', 'FILE-B', 'FILE-C']);
    const resolve = makeResolver(win);
    assert.equal(resolve({ sourceFileId: 'FILE-C' }).__label, 'panel2');
    win.document.querySelectorAll().pop();              // panel2 goes away
    assert.equal(resolve({ sourceFileId: 'FILE-C' }), null);
});

test('C7 stable across repeated calls while the owner lives', () => {
    const win = buildWorld(['HOST-A', 'FILE-B']);
    const resolve = makeResolver(win);
    const a = resolve({ sourceFileId: 'FILE-B' });
    assert.equal(resolve({ sourceFileId: 'FILE-B' }), a);
    assert.equal(resolve({ sourceFileId: 'FILE-B' }), a);
});

test('C8 kill-switch is TRUTHY-disabling, not === true, and re-read every call', () => {
    const win = buildWorld(['HOST-A', 'FILE-B']);
    const resolve = makeResolver(win);
    const order = { sourceFileId: 'FILE-B' };
    for (const truthy of [true, 1, 'yes', 'true', {}, [], '0']) {
        win.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 = truthy;
        assert.equal(resolve(order), null, `truthy ${JSON.stringify(truthy)} must disable`);
    }
    for (const falsy of [undefined, null, false, 0, '', NaN]) {
        win.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 = falsy;
        assert.ok(resolve(order), `falsy ${JSON.stringify(falsy)} must keep the resolver live`);
    }
});

test('C9 numeric and string file ids compare equal (stamped ids are stringified)', () => {
    const win = buildWorld(['HOST-A', 7]);
    assert.equal(makeResolver(win)({ sourceFileId: '7' }).__label, 'panel1');
});

test('C10 mirror carries the identical resolver', () => {
    const mirror = readFileSync(path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js'), 'utf8');
    assert.equal(extractFn(mirror, '_resolveTradeJournalAttribution'), resolveSrc);
    assert.equal(extractFn(mirror, '_talariaCollectChartsForAttribution'), collectSrc);
});
