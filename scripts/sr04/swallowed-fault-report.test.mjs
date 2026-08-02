/**
 * The replay-timestamp catches must report, not just swallow.
 *
 * `replayTimestamp` is the quantity the soak's rate-hold verdict reads. A
 * throw in the host-mirror path stops the playhead, delivery reads zero, and
 * the run records a number instead of a fault. The catches stay — one panel
 * should not be able to take the grid down — but they now leave a trace.
 *
 * A diagnostic that never fires looks exactly like a diagnostic that does not
 * work, so every cell here drives a real throw through the shipped helper
 * rather than asserting on its text.
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

const SIG = '    _reportSwallowedFault(tag, err) {';

/**
 * Build the shipped helper against a stub realm. `top` lets a cell model a
 * panel inside a host, which is the arrangement the soak actually watches.
 */
function build({ mutate = (s) => s, withTop = false, topThrows = false } = {}) {
    const body = mutate(method(read(CHART), SIG));
    const logs = [];
    const top = withTop ? {} : null;
    const win = {};
    if (withTop) {
        Object.defineProperty(win, 'top', {
            get() {
                if (topThrows) throw new Error('cross-origin');
                return top;
            },
        });
    } else {
        win.top = win;
    }
    const factory = new Function('window', 'console', `
        const holder = { ${body} };
        return holder._reportSwallowedFault.bind(holder);
    `);
    const report = factory(win, { error: (...a) => logs.push(a) });
    return { report, win, top, logs };
}

test('the first fault is logged, and its message is kept', () => {
    const { report, win, logs } = build();
    report('mirror-host-tf:updateChartData', new Error('boom'));
    const rec = win.__talariaSwallowed['mirror-host-tf:updateChartData'];
    assert.equal(rec.count, 1);
    assert.equal(rec.message, 'boom');
    assert.ok(rec.stack, 'the first fault keeps a stack, or it is not diagnosable');
    assert.equal(logs.length, 1, 'exactly one console line');
});

test('later faults are counted but not logged', () => {
    const { report, win, logs } = build();
    for (let i = 0; i < 500; i++) report('t', new Error(`boom ${i}`));
    assert.equal(win.__talariaSwallowed.t.count, 500, 'every fault is counted');
    assert.equal(logs.length, 1, 'a ten-hour arm must not be drowned by a per-tick failure');
    assert.equal(win.__talariaSwallowed.t.message, 'boom 0',
        'the first message is the one worth keeping; later ones are the same fault');
});

test('tags are counted separately, so the count says where', () => {
    const { report, win, logs } = build();
    report('sync', new Error('a'));
    report('paint', new Error('b'));
    report('sync', new Error('c'));
    assert.equal(win.__talariaSwallowed.sync.count, 2);
    assert.equal(win.__talariaSwallowed.paint.count, 1);
    assert.equal(logs.length, 2, 'each distinct site gets its own first-fault line');
});

test('a panel fault reaches the outer frame the soak is watching', () => {
    const { report, win, top, logs } = build({ withTop: true });
    report('sync', new Error('boom'));
    assert.equal(win.__talariaSwallowed.sync.count, 1, 'the panel keeps its own record');
    assert.equal(top.__talariaSwallowed.sync.count, 1, 'and the host sees it');
    assert.equal(logs.length, 1, 'mirroring must not double-log');
});

test('a cross-origin outer frame does not lose the local record', () => {
    const { report, win } = build({ withTop: true, topThrows: true });
    report('sync', new Error('boom'));
    assert.equal(win.__talariaSwallowed.sync.count, 1);
});

test('the registry has no inherited keys to mistake for faults', () => {
    const { report, win } = build();
    report('sync', new Error('boom'));
    assert.equal(Object.getPrototypeOf(win.__talariaSwallowed), null,
        'a soak asserting the registry is empty must not trip over toString');
    assert.deepEqual(Object.keys(win.__talariaSwallowed), ['sync']);
});

test('the reporter never throws, whatever it is handed', () => {
    const { report } = build();
    for (const junk of [null, undefined, 'a string', 42, { message: 1 }, Object.create(null)]) {
        assert.doesNotThrow(() => report('t', junk),
            'a reporter that throws would defeat the catch it reports from');
    }
});

test('a console that throws cannot escape into the caller', () => {
    const body = method(read(CHART), SIG);
    const win = {};
    win.top = win;
    const factory = new Function('window', 'console', `
        const holder = { ${body} };
        return holder._reportSwallowedFault.bind(holder);
    `);
    const report = factory(win, { error() { throw new Error('console is gone'); } });
    assert.doesNotThrow(() => report('t', new Error('boom')));
});

test('MUTANT: a reporter that logs every time goes red', () => {
    const { report, logs } = build({
        mutate: (s) => s.replace('if (rec.message === null) {', 'if (true) {'),
    });
    for (let i = 0; i < 5; i++) report('t', new Error('boom'));
    assert.equal(logs.length, 5,
        'the mutant must log every time; if it does not, log-once proves nothing');
});

test('MUTANT: a reporter that stops counting after the first goes red', () => {
    const { report, win } = build({
        mutate: (s) => s.replace('rec.count++;', 'if (rec.count === 0) rec.count++;'),
    });
    for (let i = 0; i < 5; i++) report('t', new Error('boom'));
    assert.equal(win.__talariaSwallowed.t.count, 1,
        'the mutant must undercount; if it does not, the count cells prove nothing');
});

// ---------------------------------------------------------------------------
// Wiring. The helper being correct is worthless if the catches do not call it.
// ---------------------------------------------------------------------------

/**
 * Every catch on a replay-timestamp path. The Director named the first pair;
 * the other three sites are the same two calls with the same consequence, and
 * a build with two of six reporting would be a worse thing to hand a soak
 * than one with none, because the empty registry would look like health.
 */
const WIRED = [
    'mirror-host-tf:syncCurrentIndexFromReplayTimestamp',
    'mirror-host-tf:updateChartData',
    'master-replace:syncCurrentIndexFromReplayTimestamp',
    'master-replace:updateChartData',
    'window-replace:syncCurrentIndexFromReplayTimestamp',
    'window-replace-rs:syncCurrentIndexFromReplayTimestamp',
];

for (const [name, path] of [['canonical', CHART], ['homepage mirror', MIRROR]]) {
    test(`${name}: every replay-timestamp catch reports`, () => {
        const src = read(path);
        assert.ok(src.includes(SIG.trim()), 'the helper must exist in this mirror');
        for (const tag of WIRED) {
            assert.ok(src.includes(`this._reportSwallowedFault('${tag}'`),
                `${tag} is still swallowing silently`);
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

    test(`${name}: the named pair still swallows, so a panel cannot take the grid down`, () => {
        const body = method(read(path),
            '    _multichartMirrorHostTfSwitchIfReady(normalizedTf, options = {}) {');
        // Report inside the catch, never rethrow. The containment the catches
        // were added for has to survive the diagnostic.
        assert.ok(!/throw\s+_si|throw\s+_uc/.test(body), 'reporting must not rethrow');
        assert.ok(body.includes('mirror-host-tf:syncCurrentIndexFromReplayTimestamp'));
        assert.ok(body.includes('mirror-host-tf:updateChartData'));
    });
}
