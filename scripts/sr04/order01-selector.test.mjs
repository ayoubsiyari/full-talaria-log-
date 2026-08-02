/**
 * ORDER-01 §5 — the selector oracle.
 *
 * The engine oracle in speed-governor.test.mjs proves the *engine* offers
 * 1-10. It cannot see the UI, and the UI is where the order actually bites:
 * SPEED-01's first pass landed 476 lines in replay-system.js and left every
 * selector still offering 60x. This file reads the shipped UI sources and
 * asserts what a user can actually pick.
 *
 * Three ladders existed independently — the legacy shell slider (to 86400x),
 * the V9 React toolbar (to 100x) and the engine. A cell per surface, because
 * a single ladder assertion would go green while a second surface stayed
 * stale, which is the failure that already happened once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const SHELL = resolve(ROOT, 'chart v 1.4/chart/legacy-index.html');
const V9_LIVE = resolve(ROOT, 'chart v 1.4/talaria-design/src/TalariaV8bLive.jsx');
const V9_B = resolve(ROOT, 'chart v 1.4/talaria-design/src/TalariaV8b.jsx');
const ENGINE = resolve(ROOT, 'chart v 1.4/chart/modules/replay-system.js');
const ENGINE_MIRROR = resolve(ROOT, 'homepage/public/chart/modules/replay-system.js');

const read = (p) => readFileSync(p, 'utf8');

const LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Every rung the three shipped ladders offered that §5 removes. */
const REMOVED = [15, 20, 25, 30, 50, 60, 70, 80, 90, 100,
    120, 300, 900, 1800, 3600, 7200, 14400, 43200, 86400];

/** Pull a balanced `function name(...) { ... }` out of a source file. */
function balanced(src, anchor) {
    const at = src.indexOf(anchor);
    assert.ok(at >= 0, `anchor not found: ${anchor}`);
    assert.equal(src.indexOf(anchor, at + 1), -1, `anchor is ambiguous: ${anchor}`);
    // If the anchor already ends at the opening brace, start there. Starting
    // from the first `{` after the anchor would latch onto a destructured
    // parameter — `setPlaybackMode(mode, { restartPlayback = true } = {})` —
    // and close the body at the end of the parameter list.
    const i = anchor.trimEnd().endsWith('{')
        ? at + anchor.lastIndexOf('{')
        : src.indexOf('{', at + anchor.length);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') {
            depth--;
            if (depth === 0) return src.slice(at, j + 1);
        }
    }
    throw new Error(`unbalanced: ${anchor}`);
}

// ---------------------------------------------------------------------------
// The legacy shell.
// ---------------------------------------------------------------------------

/**
 * Evaluate the shell's ladder helper against a stub engine. The point is to
 * run the shipped function rather than pattern-match it, so a helper that
 * reads correctly but computes the wrong list still goes red.
 */
function shellLadder({ mutate = (s) => s, rs = null } = {}) {
    const fn = mutate(balanced(read(SHELL), 'function talariaOfferedSpeeds('));
    const sandbox = { window: { chart: rs ? { replaySystem: rs } : undefined } };
    vm.createContext(sandbox);
    const out = vm.runInContext(`${fn}; JSON.stringify(talariaOfferedSpeeds());`, sandbox);
    // Cross back through JSON: arrays built inside the vm realm have a
    // different Array prototype, which deepStrictEqual rejects.
    return JSON.parse(out);
}

const stubEngine = (mode) => ({
    getPlaybackMode: () => mode,
    getSpeedLadderBarsPerSecond: () => [...LADDER],
    getTickSpeedLadder: () => [...LADDER, 'REALISTIC'],
});

test('shell: with no engine yet, the fallback ladder is 1-10', () => {
    // The slider is built before the chart exists, so the fallback is a real
    // shipping path, not a defensive nicety.
    assert.deepEqual(shellLadder().values, LADDER);
});

test('shell: the edited script block still parses', () => {
    // The ladder edits are in a 61k-line inline script that nothing else in
    // the suite compiles. A syntax error here takes the whole shell down and
    // every other cell in this file would still be green, because they all
    // pattern-match text.
    const src = read(SHELL);
    const at = src.indexOf('function talariaOfferedSpeeds(');
    assert.ok(at >= 0);
    const open = src.lastIndexOf('<script', at);
    const bodyStart = src.indexOf('>', open) + 1;
    const end = src.indexOf('</script>', at);
    assert.ok(open >= 0 && end > bodyStart, 'could not bound the script block');
    assert.ok(!/type\s*=\s*["']module["']/.test(src.slice(open, bodyStart)),
        'a module block would need a different parser than vm.Script');
    assert.doesNotThrow(() => new vm.Script(src.slice(bodyStart, end)),
        'the shell script block must parse');
});

test('shell: candle mode offers exactly 1-10', () => {
    assert.deepEqual(shellLadder({ rs: stubEngine('candle') }).values, LADDER);
});

test('shell: tick mode offers 1-10 plus REALISTIC, and nothing else', () => {
    const { values, labels } = shellLadder({ rs: stubEngine('tick') });
    assert.deepEqual(values, [...LADDER, 'REALISTIC']);
    assert.equal(values.filter((v) => v === 'REALISTIC').length, 1,
        'REALISTIC is one distinct option, not a modifier on each rung');
    assert.equal(labels[labels.length - 1], 'REAL',
        'REALISTIC must be labelled, not rendered as "REALISTICx"');
});

test('shell: a broken engine falls back rather than offering nothing', () => {
    const throwing = { getPlaybackMode: () => { throw new Error('boom'); } };
    assert.deepEqual(shellLadder({ rs: throwing }).values, LADDER);
    assert.deepEqual(shellLadder({ rs: { getSpeedLadderBarsPerSecond: () => [] } }).values,
        LADDER, 'an empty ladder is a bug, not a preference');
});

test('shell: no removed rung survives anywhere in the slider blocks', () => {
    const src = read(SHELL);
    // Scope to the two slider blocks; the file also holds timeframe tables
    // where 86400000 is a legitimate millisecond count.
    const blocks = [...src.matchAll(/talariaOfferedSpeeds\(\)/g)];
    assert.ok(blocks.length >= 3,
        'both slider blocks and the helper must go through one ladder source');
    assert.ok(!/const speedValues = \[1, 2, 5, 10, 30, 60/.test(src),
        'the 86400x ladder literal must be gone from the shell');
    assert.ok(!/'86400x'/.test(src), 'no 86400x label may remain');
});

test('shell: the range input cannot address a position past the ladder', () => {
    const src = read(SHELL);
    const m = src.match(/<input type="range" id="replaySpeedSlider"[^>]*max="(\d+)"/);
    assert.ok(m, 'the docked speed range input must still exist');
    assert.equal(Number(m[1]), LADDER.length - 1,
        'a max of 14 would let the thumb address rungs that no longer exist');
});

test('shell: neither slider block keeps a hardcoded maxIndex', () => {
    const src = read(SHELL);
    assert.ok(!/const maxIndex = 14;/.test(src),
        'maxIndex must derive from the ladder or tick mode will overflow it');
    // Three sites: the docked slider's declaration, the reassignment when the
    // playback mode changes the ladder length, and the floating clone.
    assert.equal((src.match(/maxIndex = speedValues\.length - 1/g) || []).length, 3,
        'the docked slider, its mode refresh, and the floating clone must all derive it');
});

test('shell MUTANT: a helper that ignores tick mode goes red', () => {
    const { values } = shellLadder({
        rs: stubEngine('tick'),
        mutate: (s) => s.replace('getTickSpeedLadder()', 'getSpeedLadderBarsPerSecond()'),
    });
    assert.deepEqual(values, LADDER,
        'the mutant must drop REALISTIC; if it survives, the tick cell is vacuous');
});

test('shell MUTANT: a stale fallback ladder goes red', () => {
    const { values } = shellLadder({
        mutate: (s) => s.replace('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]',
            '[1, 2, 5, 10, 30, 60]'),
    });
    assert.ok(values.includes(60),
        'the mutant must reintroduce 60; if not, the fallback cell proves nothing');
});

// ---------------------------------------------------------------------------
// The V9 React toolbar — this is what dist-v9, the soak candidate, renders.
// ---------------------------------------------------------------------------

for (const [name, path] of [['TalariaV8bLive', V9_LIVE], ['TalariaV8b', V9_B]]) {
    test(`v9 ${name}: the toolbar ladder is 1-10, plus REALISTIC in tick`, () => {
        const src = read(path);
        const m = src.match(/const steps=replayMode==="tick"\?(\[[^\]]*\]):(\[[^\]]*\]);/);
        assert.ok(m, 'the toolbar must choose its ladder from the replay mode');
        const tick = JSON.parse(m[1].replace(/"REALISTIC"/g, '"REALISTIC"'));
        const candle = JSON.parse(m[2]);
        assert.deepEqual(candle, LADDER);
        assert.deepEqual(tick, [...LADDER, 'REALISTIC']);
    });

    test(`v9 ${name}: no removed rung remains in the steps array`, () => {
        const src = read(path);
        assert.ok(!/steps=\[1,2,3,5,10,15,20,25,30,50,60,70,80,90,100\]/.test(src),
            'the 100x ladder literal must be gone');
    });

    test(`v9 ${name}: the range max follows the ladder, not a literal 14`, () => {
        const src = read(path);
        const block = src.slice(src.indexOf('const steps=replayMode'));
        const m = block.match(/<input type="range" min="0" max=\{?([^\s}"]+)\}?\s/);
        assert.ok(m, 'the speed range input must follow the steps array');
        assert.equal(m[1], 'last',
            'a literal max cannot track a ladder that changes length by mode');
    });

    test(`v9 ${name}: the default speed is a rung`, () => {
        const src = read(path);
        const m = src.match(/const \[speed, setSpeed\] = useState\((\d+)\);/);
        assert.ok(m, 'the toolbar must declare a default speed');
        assert.ok(LADDER.includes(Number(m[1])),
            `the default ${m[1]} is not on the ladder; 30 was the shipped value`);
    });

    test(`v9 ${name}: REALISTIC is labelled, never suffixed with a multiplier`, () => {
        const src = read(path);
        const block = src.slice(src.indexOf('const steps=replayMode'));
        assert.ok(/steps\[si\]==="REALISTIC"\?/.test(block),
            'the label must branch on REALISTIC, or it renders as "REALISTIC×"');
    });
}

// ---------------------------------------------------------------------------
// The engine, and the mirror. A UI fix that only reaches one mirror is not shipped.
// ---------------------------------------------------------------------------

test('engine: the ladder constant is 1-10 in both mirrors', () => {
    const expected = 'const SPEED_GOV_LADDER_BPS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);';
    for (const p of [ENGINE, ENGINE_MIRROR]) {
        assert.ok(read(p).includes(expected), `stale ladder in ${p}`);
    }
});

test('engine: leaving tick mode moves REALISTIC onto a candle rung', () => {
    for (const p of [ENGINE, ENGINE_MIRROR]) {
        const body = balanced(read(p), '    setPlaybackMode(mode, { restartPlayback = true } = {}) {');
        assert.ok(body.includes("normalizedMode === 'candle' && this.speed === SPEED_GOV_REALISTIC"),
            `tick→candle must not strand the user on REALISTIC (${p})`);
    }
});

test('no surface offers a removed rung', () => {
    // The single assertion the order is actually about, stated once across
    // every surface, so a future fourth ladder has to answer to it too.
    const surfaces = {
        'legacy shell helper': balanced(read(SHELL), 'function talariaOfferedSpeeds('),
        'v9 live toolbar': read(V9_LIVE).match(/const steps=replayMode[^;]*;/)[0],
        'v9 b toolbar': read(V9_B).match(/const steps=replayMode[^;]*;/)[0],
        'engine ladder': read(ENGINE).match(/const SPEED_GOV_LADDER_BPS = [^;]*;/)[0],
    };
    for (const [where, text] of Object.entries(surfaces)) {
        for (const gone of REMOVED) {
            assert.ok(!new RegExp(`\\b${gone}\\b`).test(text),
                `${where} still offers ${gone}`);
        }
    }
});
