/**
 * The replay-timestamp catches must report, not just swallow.
 *
 * `replayTimestamp` is the quantity the soak's rate-hold verdict reads. A
 * throw on one of these paths stops the playhead, delivery reads zero, and
 * the run records a number instead of a fault. The catches stay — one panel
 * should not be able to take the grid down — but they now leave a trace.
 *
 * The reporter is `_logReplayRestoreCatchOnce`, which was already on the
 * integration branch covering the two catches in the host-mirror path. This
 * file locks that behaviour down, extends the census to every catch on the
 * same two calls, and covers the three properties a soak depends on that the
 * original did not have: the reporter cannot itself throw, the registry has
 * no inherited keys, and a panel's faults reach the frame the harness watches.
 *
 * Every cell drives a real throw through the shipped helper. A diagnostic
 * that never fires looks exactly like one that does not work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHART = resolve(ROOT, 'chart v 1.4/chart/chart.js');
const MIRROR = resolve(ROOT, 'homepage/public/chart/chart.js');

const read = (p) => readFileSync(p, 'utf8');

/** Extract a balanced class method by its exact signature line. */
function method(src, signature) {
    const at = src.indexOf(signature);
    assert.ok(at >= 0, `method not found: ${signature}`);
    assert.equal(src.indexOf(signature, at + 1), -1, `ambiguous: ${signature}`);
    let depth = 0;
    for (let j = at + signature.lastIndexOf('{'); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') {
            depth--;
            if (depth === 0) return src.slice(at, j + 1);
        }
    }
    throw new Error(`unbalanced: ${signature}`);
}

const SIG = '    _logReplayRestoreCatchOnce(site, error, detail = {}) {';
const BUCKET = '__talariaReplayRestoreCatchCounts';

/**
 * Build the shipped reporter against a stub realm. `withTop` models a panel
 * inside a host inside an outer frame, which is the arrangement a soak
 * actually watches.
 */
function build({ mutate = (s) => s, withTop = false, topThrows = false, console: con } = {}) {
    const body = mutate(method(read(CHART), SIG));
    const warnings = [];
    const host = withTop ? {} : null;
    const top = withTop ? {} : null;
    const win = {};
    if (withTop) {
        Object.defineProperty(win, 'parent', {
            get() {
                if (topThrows) throw new Error('cross-origin');
                return host;
            },
        });
        win.top = top;
    } else {
        win.parent = win;
        win.top = win;
    }
    const factory = new Function('window', 'console', `
        const holder = {
            panelId: 'B',
            currentSymbol: 'NQ',
            currentTimeframe: '1m',
            ${body}
        };
        return holder;
    `);
    const holder = factory(win, con || { warn: (...a) => warnings.push(a) });
    const report = holder._logReplayRestoreCatchOnce.bind(holder);
    return { report, holder, win, host, top, warnings };
}

test('the first fault is warned, with the timestamp that matters', () => {
    const { report, win, warnings } = build();
    report('updateChartData', new Error('boom'), { replayTimestamp: 1712345678 });
    assert.equal(win[BUCKET].updateChartData, 1);
    assert.equal(warnings.length, 1, 'exactly one console line');
    const payload = warnings[0][1];
    assert.equal(payload.site, 'updateChartData');
    assert.equal(payload.replayTimestamp, 1712345678,
        'the quantity the soak reads must be in the report');
    assert.ok(payload.error, 'the error itself must survive into the log');
});

test('later faults are counted but not warned', () => {
    const { report, win, holder, warnings } = build();
    for (let i = 0; i < 500; i++) report('t', new Error(`boom ${i}`));
    assert.equal(win[BUCKET].t, 500, 'every fault is counted');
    assert.equal(holder._replayRestoreCatchCounts.t, 500, 'and counted per instance');
    assert.equal(warnings.length, 1,
        'a ten-hour arm must not be drowned by a per-tick failure');
});

test('sites are counted separately, so the count says where', () => {
    const { report, win, warnings } = build();
    report('sync', new Error('a'));
    report('paint', new Error('b'));
    report('sync', new Error('c'));
    assert.equal(win[BUCKET].sync, 2);
    assert.equal(win[BUCKET].paint, 1);
    assert.equal(warnings.length, 2, 'each distinct site gets its own first-fault line');
});

test('a panel fault reaches the frames the soak is watching', () => {
    const { report, win, host, top, warnings } = build({ withTop: true });
    report('sync', new Error('boom'));
    assert.equal(win[BUCKET].sync, 1, 'the panel keeps its own record');
    assert.equal(host[BUCKET].sync, 1, 'the host sees it');
    assert.equal(top[BUCKET].sync, 1, 'and so does the outer frame');
    assert.equal(warnings.length, 1, 'mirroring must not multiply the log line');
});

test('a cross-origin frame does not cost the local count', () => {
    const { report, win, top } = build({ withTop: true, topThrows: true });
    report('sync', new Error('boom'));
    assert.equal(win[BUCKET].sync, 1);
    assert.equal(top[BUCKET].sync, 1, 'an unreachable parent must not stop the top climb');
});

test('the registry has no inherited keys to mistake for faults', () => {
    const { report, win } = build();
    report('sync', new Error('boom'));
    assert.equal(Object.getPrototypeOf(win[BUCKET]), null,
        'a soak asserting the registry is empty must not trip over toString');
    assert.deepEqual(Object.keys(win[BUCKET]), ['sync']);
});

test('the reporter never throws, whatever it is handed', () => {
    const { report } = build();
    for (const junk of [null, undefined, 'a string', 42, { message: 1 }, Object.create(null)]) {
        assert.doesNotThrow(() => report('t', junk),
            'a reporter that throws would defeat the catch it reports from');
    }
    assert.doesNotThrow(() => report(null, new Error('boom')), 'a missing site is not fatal');
});

test('a console that throws cannot escape into the caller', () => {
    // This is the property that matters most: the reporter runs inside the
    // catch, so anything escaping it takes the panel down.
    const { report } = build({ console: { warn() { throw new Error('console is gone'); } } });
    assert.doesNotThrow(() => report('t', new Error('boom')));
});

test('MUTANT: a reporter that warns every time goes red', () => {
    const { report, warnings } = build({
        mutate: (s) => s.replace('if (count !== 1) return;', ''),
    });
    for (let i = 0; i < 5; i++) report('t', new Error('boom'));
    assert.equal(warnings.length, 5,
        'the mutant must warn every time; if it does not, log-once proves nothing');
});

test('MUTANT: a reporter that stops counting after the first goes red', () => {
    const { report, win } = build({
        mutate: (s) => s.replace('bucket[key] = (bucket[key] || 0) + 1;', 'bucket[key] = 1;'),
    });
    for (let i = 0; i < 5; i++) report('t', new Error('boom'));
    assert.equal(win[BUCKET].t, 1,
        'the mutant must undercount; if it does not, the count cells prove nothing');
});

test('MUTANT: dropping the realm climb goes red', () => {
    const { report, host } = build({
        withTop: true,
        // Neuter the climb rather than excising the loop: removing the block
        // wholesale leaves its inner catch dangling and the mutant fails to
        // parse, which would pass the cell for the wrong reason.
        mutate: (s) => s.replace('if (w && w !== window) claim(w);', ''),
    });
    report('sync', new Error('boom'));
    assert.equal(host[BUCKET], undefined,
        'the mutant must leave the host blind; if not, the cross-frame cell is vacuous');
});

// ---------------------------------------------------------------------------
// Wiring. A correct reporter is worthless if the catches do not call it.
// ---------------------------------------------------------------------------

/**
 * Every catch on a replay-timestamp path. The integration branch already
 * covered the first two; the other four are the same two calls with the same
 * consequence. A build where two of six report is worse to hand a soak than
 * one where none do, because the empty registry reads as health.
 */
const WIRED = [
    'syncCurrentIndexFromReplayTimestamp',
    'updateChartData',
    'window-replace:syncCurrentIndexFromReplayTimestamp',
    'master-replace:syncCurrentIndexFromReplayTimestamp',
    'master-replace:updateChartData',
    'window-replace-rs:syncCurrentIndexFromReplayTimestamp',
];

for (const [name, path] of [['canonical', CHART], ['homepage mirror', MIRROR]]) {
    test(`${name}: every replay-timestamp catch reports`, () => {
        const src = read(path);
        assert.ok(src.includes(SIG.trim()), 'the reporter must exist in this mirror');
        for (const site of WIRED) {
            assert.ok(src.includes(`this._logReplayRestoreCatchOnce('${site}'`),
                `${site} is still swallowing silently`);
        }
    });

    test(`${name}: no syncCurrentIndexFromReplayTimestamp call swallows silently`, () => {
        // A census rather than a fixed list, so a *new* silent catch on this
        // call is caught the day it is written instead of at the next soak.
        const src = read(path);
        const silent = [...src.matchAll(
            /syncCurrentIndexFromReplayTimestamp\([^)]*\);\s*\}\s*catch\s*\(\w+\)\s*\{\s*\/\*\s*ignore\s*\*\/\s*\}/g,
        )];
        assert.deepEqual(silent.map((m) => m[0]), [],
            'the playhead rematch must never fail silently');
    });

    test(`${name}: the catches still swallow, so a panel cannot take the grid down`, () => {
        const body = method(read(path),
            '    _multichartMirrorHostTfSwitchIfReady(normalizedTf, options = {}) {');
        assert.ok(!/\bthrow\b/.test(body.slice(body.indexOf('_logReplayRestoreCatchOnce'))),
            'reporting must not rethrow');
    });

    test(`${name}: the reporter body is wrapped`, () => {
        const body = method(read(path), SIG);
        assert.ok(/\btry\s*\{/.test(body.slice(0, body.indexOf('const key'))),
            'the wrap must open before any work is done, or the reporter can throw '
            + 'out of the catch it guards');
        assert.ok(/catch \(_report\)/.test(body), 'and it must actually catch');
        // The console call is the most likely thing to throw here, so it has
        // to sit inside the wrap rather than after it.
        assert.ok(body.indexOf('console.warn') < body.lastIndexOf('catch (_report)'),
            'the console call must be inside the wrap');
    });
}
