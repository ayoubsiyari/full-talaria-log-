/**
 * ORDER-01B — `generatePath` allocates nothing per bar.
 *
 * A8 measured allocation at 0.22 MB/s and that is the number this is graded
 * against, so "looks cheap" is not the bar: the forming path runs for every
 * bar of every panel for the whole session, and anything it allocates is
 * multiplied by the bar count before it reaches a profile.
 *
 * The array scratch landed with E's forming renderer. What this file grades is
 * whether *anything else* per call survived it — the two that did were a
 * template string in the seed and a closure from `createSeededRandom`, neither
 * of which shows up as an array and both of which are per bar.
 *
 * Run, not read. A structural check ("no `${` in the function") passes the
 * moment someone moves the allocation one frame down the stack. The array is
 * weighed on the heap over a few hundred thousand calls; the string and the
 * closure die inside the call and are decided by whether the shipped function
 * reaches the code that builds them. Every cell carries a mutant that restores
 * the allocation and must show up.
 *
 * Needs `--expose-gc`: without a forced collection the reading is whatever the
 * collector happened to be doing.
 *   node --expose-gc --test scripts/sr04/order01b-generate-path-alloc.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * A runner that invokes this file plainly would otherwise see the ALLOC cells go
 * red for want of a flag, which reads as a product defect and is not one. Re-exec
 * with the flag instead, so the only red this file can produce is about the path.
 */
if (typeof global.gc !== 'function') {
    const r = spawnSync(process.execPath,
        ['--expose-gc', '--test', new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
        { stdio: 'inherit' });
    process.exit(r.status === null ? 1 : r.status);
}

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';

const src = readFileSync(RS_A, 'utf8');

function balanced(text, anchor) {
    const at = text.indexOf(anchor);
    assert.notEqual(at, -1, `anchor not found: ${anchor}`);
    const open = text.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(at, i + 1);
        }
    }
    throw new Error(`unbalanced: ${anchor}`);
}

const METHODS = [
    '\n    generatePath(candle, numTicks, out = null) {',
    '\n    _pathSeed(symbol, timestamp) {',
    '\n    _collectPathWaypoints(candle, open, close) {',
    '\n    createSeededRandom(seed) {',
];

/** `String.replace` that refuses to be a no-op, so a mutant cannot go silent. */
function swap(text, from, to) {
    assert.ok(text.includes(from), `mutation anchor not found: ${from.split('\n')[0]}`);
    return text.replace(from, to);
}

function build({ mutate = (s) => s } = {}) {
    const body = mutate(`
        ${balanced(src, 'function _order01bHashText(')}
        return {
            ${METHODS.map((m) => balanced(src, m)).join(',\n            ')}
        };
    `);
    const engine = Object.create(new Function(body)());
    engine.chart = { currentSymbol: 'NQ' };
    return engine;
}

const TICKS = 72;
const BASE_T = 1_785_000_000_000;

function candleAt(i) {
    const open = 20_000 + (i % 97) * 0.25;
    return {
        t: BASE_T + i * 60_000,
        o: open,
        h: open + 12.5,
        l: open - 9.75,
        c: open + ((i % 7) - 3) * 1.25,
    };
}

/**
 * The candles the measured loop walks, built once.
 *
 * Building them inside the loop was the first version of this cell and it was
 * wrong: an object per iteration is churn in every variant, and it drowned the
 * difference the cell exists to see.
 */
const CANDLES = Array.from({ length: 4096 }, (_, i) => candleAt(i));

/**
 * Bytes retained per call, holding every returned path.
 *
 * Measured by retaining rather than by watching a heap delta, because
 * everything this function allocates dies immediately and the scavenger
 * recycles it inside the window — `heapUsed` comes back flat whether a fresh
 * array was built per bar or none was. Retaining the results removes the
 * collector from the question: a reused scratch retains one array however many
 * times it is handed out, and a fresh array per bar retains all of them.
 *
 * This sees the array. It cannot see the seed string or an rng closure, which
 * are discarded inside the call — those are gated by the binding cells below,
 * and the churn they cause is graded in the browser by the sampling profiler
 * against A8's 0.22 MB/s, which is the measurement of record for this row.
 */
function retainedBytesPerCall(engine, iterations = 200_000) {
    assert.equal(typeof global.gc, 'function',
        'run with --expose-gc; without it the reading starts from an unknown heap');
    for (let i = 0; i < 20_000; i++) engine.generatePath(CANDLES[i % CANDLES.length], TICKS);
    const held = new Array(iterations);
    global.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < iterations; i++) {
        held[i] = engine.generatePath(CANDLES[i % CANDLES.length], TICKS);
    }
    global.gc();
    const after = process.memoryUsage().heapUsed;
    // Touch `held` after the reading so nothing above can be optimised away.
    assert.equal(held.length, iterations);
    // The slot in `held` itself is 8 bytes and is the harness's cost, not the
    // product's; subtract it so the figure is what `generatePath` retained.
    return ((after - before) / iterations) - 8;
}

test('the path is written into one reused buffer, not a new one per bar', () => {
    const engine = build();
    const first = engine.generatePath(candleAt(1), TICKS);
    for (let i = 2; i < 50; i++) {
        assert.equal(engine.generatePath(candleAt(i), TICKS), first,
            'a fresh array per bar is the allocation this row exists to remove');
    }
    assert.equal(first.length, TICKS);
});

test('an explicit out buffer is honoured, so a caller that must retain still can', () => {
    const engine = build();
    const out = new Array(TICKS);
    assert.equal(engine.generatePath(candleAt(3), TICKS, out), out);
    assert.notEqual(engine.generatePath(candleAt(3), TICKS), out,
        'the scratch and an explicit buffer must not be the same array');
});

test('the seed is bit-identical to hashing the literal string', () => {
    // The allocation-free digit walk has to agree with `${symbol}:${t}` on
    // every input, or the change quietly redraws every candle in the product.
    const engine = build();
    const literal = (symbol, t) => {
        const text = `${symbol || ''}:${Number(t) || 0}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    };
    const cases = [
        ['NQ', BASE_T], ['', 0], ['BTCUSD', 1], ['ES', 9], ['GC', 10],
        ['CL', 999], ['USDJPY', 1000], ['NQ', Number.MAX_SAFE_INTEGER],
        // The shapes that take the fallback: negative, fractional, absent.
        ['NQ', -5], ['NQ', 1.5], ['NQ', null], ['NQ', undefined], ['NQ', NaN],
        [null, BASE_T], [undefined, 42],
    ];
    for (const [symbol, t] of cases) {
        assert.equal(engine._pathSeed(symbol, t), literal(symbol, t),
            `seed differs for ${JSON.stringify(symbol)}:${String(t)}`);
    }
});

test('the inlined walk draws exactly what the closure drew', () => {
    // Inlining the LCG is only free if it is the same LCG. If the sequence
    // drifts, every forming candle in the field redraws and nothing in the
    // product complains — so the shipped path is compared point-for-point
    // against the same function still pulling from `createSeededRandom`.
    const shipped = build();
    const viaClosure = build({
        mutate: (s) => swap(
            swap(s,
                'let rngState = this._pathSeed(symbol, candle && candle.t);',
                'const _rng = this.createSeededRandom(this._pathSeed(symbol, candle && candle.t));'),
            `rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
                const r = rngState / 0x7fffffff;`,
            'const r = _rng();'),
    });
    for (let i = 0; i < 200; i++) {
        const candle = candleAt(i * 13);
        assert.deepEqual(
            Array.prototype.slice.call(shipped.generatePath(candle, TICKS)),
            Array.prototype.slice.call(viaClosure.generatePath(candle, TICKS)),
            `the inlined sequence diverged from the closure at bar ${i}`);
    }
});

test('the same candle draws the same path every time', () => {
    const engine = build();
    const a = Array.prototype.slice.call(engine.generatePath(candleAt(11), TICKS));
    for (let i = 0; i < 20; i++) engine.generatePath(candleAt(i), TICKS);
    const b = Array.prototype.slice.call(engine.generatePath(candleAt(11), TICKS));
    assert.deepEqual(b, a, 'a reused buffer must not make the path depend on call order');
});

test('the path honours the candle it was given', () => {
    const engine = build();
    for (let i = 0; i < 40; i++) {
        const candle = candleAt(i);
        const path = engine.generatePath(candle, TICKS);
        assert.equal(path[0], candle.o);
        assert.equal(path[TICKS - 1], candle.c);
        for (const price of path) {
            assert.ok(price >= candle.l - 1e-9 && price <= candle.h + 1e-9,
                `a path point left the candle: ${price}`);
        }
    }
});

/** A 72-slot array is several hundred bytes; nothing per bar should approach it. */
const RETAINED_BUDGET_BYTES = 64;

test('ALLOC: the path retains nothing per bar', () => {
    const perCall = retainedBytesPerCall(build());
    assert.ok(perCall < RETAINED_BUDGET_BYTES,
        `expected an allocation-free path, measured ${perCall.toFixed(1)} B retained per bar`);
});

test('ALLOC MUTANT: a fresh array per bar shows up', () => {
    const perCall = retainedBytesPerCall(build({
        mutate: (s) => swap(s,
            'const path = out || this._tickPathScratch || (this._tickPathScratch = []);',
            'const path = out || [];'),
    }));
    assert.ok(perCall > RETAINED_BUDGET_BYTES,
        `the mutant must retain a path per bar; measured ${perCall.toFixed(1)} B, so ALLOC is vacuous`);
});

// ---------------------------------------------------------------------------
// Binding. The seed string and the rng closure are discarded inside the call,
// so no heap reading can see them — but whether the shipped function *reaches*
// the allocating code is exact, and that is what these cells decide
// (BIND-01: present is not called, called is not correct).
// ---------------------------------------------------------------------------

test('BIND: the forming path never builds a closure per bar', () => {
    const engine = build();
    engine.createSeededRandom = () => {
        throw new Error('generatePath reached createSeededRandom');
    };
    assert.doesNotThrow(() => engine.generatePath(CANDLES[7], TICKS),
        'the rng must be inlined; a closure here is one allocation per bar of every panel');
});

test('BIND MUTANT: restoring the closure is caught', () => {
    const engine = build({
        mutate: (s) => swap(s,
            'let rngState = this._pathSeed(symbol, candle && candle.t);',
            `const _rng = this.createSeededRandom(this._pathSeed(symbol, candle && candle.t));
             let rngState = _rng.length;`),
    });
    engine.createSeededRandom = () => {
        throw new Error('generatePath reached createSeededRandom');
    };
    assert.throws(() => engine.generatePath(CANDLES[7], TICKS),
        /reached createSeededRandom/,
        'the mutant must be caught; if it is not, the BIND cell proves nothing');
});

const HASH_HEAD = 'function _order01bHashText(text) {';
const COUNT_HASH = ' globalThis.__order01bTextHashes = (globalThis.__order01bTextHashes || 0) + 1;';

test('BIND: a real timestamp never reaches the string-building seed', () => {
    // The text hash is the only place the seed builds a string; count entries.
    const withProbe = build({ mutate: (s) => swap(s, HASH_HEAD, HASH_HEAD + COUNT_HASH) });
    globalThis.__order01bTextHashes = 0;
    for (let i = 0; i < 500; i++) withProbe.generatePath(CANDLES[i % CANDLES.length], TICKS);
    assert.equal(globalThis.__order01bTextHashes, 0,
        'every real bar timestamp is a non-negative safe integer and must take the digit walk');
    assert.equal(withProbe.generatePath(CANDLES[0], TICKS).length, TICKS,
        'and the path is still produced, not skipped');
});

test('BIND MUTANT: forcing the fallback is caught', () => {
    const withProbe = build({
        mutate: (s) => swap(
            swap(s, HASH_HEAD, HASH_HEAD + COUNT_HASH),
            'if (!Number.isSafeInteger(time) || time < 0) {', 'if (true) {'),
    });
    globalThis.__order01bTextHashes = 0;
    for (let i = 0; i < 500; i++) withProbe.generatePath(CANDLES[i % CANDLES.length], TICKS);
    assert.ok(globalThis.__order01bTextHashes > 0,
        'the mutant must take the string path; if not, the BIND cell proves nothing');
});

test('both mirrors carry the allocation-free path', () => {
    const mirror = readFileSync(RS_B, 'utf8');
    for (const anchor of [
        'function _order01bHashText(',
        'let rngState = this._pathSeed(symbol, candle && candle.t);',
        'if (!Number.isSafeInteger(time) || time < 0) {',
        'const path = out || this._tickPathScratch || (this._tickPathScratch = []);',
    ]) {
        assert.ok(mirror.includes(anchor), `mirror is missing: ${anchor}`);
        assert.ok(src.includes(anchor), `canonical is missing: ${anchor}`);
    }
});
