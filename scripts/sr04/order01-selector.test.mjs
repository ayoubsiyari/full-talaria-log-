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
function shellHelpers(mutate = (s) => s) {
    const src = read(SHELL);
    // The rate label is now the product of both knobs, so the helper cannot be
    // lifted alone — it reads the step off the engine through these two.
    return mutate([
        balanced(src, 'function talariaOfferedSpeeds('),
        balanced(src, 'function talariaStepSeconds('),
        balanced(src, 'function talariaMarketSpan('),
        balanced(src, 'function talariaStepMenu('),
    ].join('\n'));
}

function shellLadder({ mutate = (s) => s, rs = null } = {}) {
    const sandbox = { window: { chart: rs ? { replaySystem: rs } : undefined } };
    vm.createContext(sandbox);
    const out = vm.runInContext(
        `${shellHelpers(mutate)}; JSON.stringify(talariaOfferedSpeeds());`, sandbox);
    // Cross back through JSON: arrays built inside the vm realm have a
    // different Array prototype, which deepStrictEqual rejects.
    return JSON.parse(out);
}

/**
 * A stub engine. ORDER-01B takes REALISTIC off both ladders, so the tick
 * ladder is the same ten — the string is gone from the *engine*, and these
 * cells check the shell renders what the engine says rather than a list of
 * its own.
 */
const stubEngine = (mode, extra = {}) => ({
    getPlaybackMode: () => mode,
    getSpeedLadderBarsPerSecond: () => [...LADDER],
    getTickSpeedLadder: () => [...LADDER],
    getStepSeconds: () => 60,
    ...extra,
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

test('shell: tick mode offers the same ten, with no string on the ladder', () => {
    // ORDER-01B: REALISTIC is a position on both knobs, so it leaves the
    // ladder rather than sitting on it as a rung that is not a speed.
    const { values, labels } = shellLadder({ rs: stubEngine('tick') });
    assert.deepEqual(values, LADDER);
    assert.ok(values.every((v) => typeof v === 'number'),
        'a rung that is not a number forces every consumer to branch on a string');
    assert.equal(labels[labels.length - 1], '10x');
});

test('shell: the rate beside a rung is market time, not bars', () => {
    // A rung is steps per wall-second. What that delivers depends on the step
    // next to it, and quoting "10 bars/sec" while a one-second step is
    // selected is the exact confusion ORDER-01B exists to remove.
    const { rates } = shellLadder({ rs: stubEngine('candle', { getStepSeconds: () => 60 }) });
    assert.equal(rates[0], '(1m of market/sec)');
    assert.equal(rates[9], '(10m of market/sec)');
    const fine = shellLadder({ rs: stubEngine('candle', { getStepSeconds: () => 1 }) });
    assert.equal(fine.rates[0], '(1s of market/sec)',
        'the same rung at a one-second step is sixty times less market time');
});

test('shell: with no engine the label falls back to bars per second', () => {
    // Before the chart exists there is no step to multiply by, and inventing
    // one would put a market rate on screen that nothing is running.
    assert.equal(shellLadder().rates[0], '(1 bar/sec)');
});

test('shell MUTANT: a rate label that ignores the step goes red', () => {
    const { rates } = shellLadder({
        rs: stubEngine('candle', { getStepSeconds: () => 1 }),
        mutate: (s) => s.replace('talariaMarketSpan(v * step)', 'talariaMarketSpan(v * 60)'),
    });
    assert.equal(rates[0], '(1m of market/sec)',
        'the mutant must quote the old bar rate; if not, the rate cell proves nothing');
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

test('shell MUTANT: a helper that ignores the engine goes red', () => {
    const { values } = shellLadder({
        rs: stubEngine('candle', { getSpeedLadderBarsPerSecond: () => [1, 2, 5] }),
        mutate: (s) => s.replace('values = rs.getSpeedLadderBarsPerSecond();', ''),
    });
    assert.deepEqual(values, LADDER,
        'the mutant must fall back to the literal; if not, the engine cells are vacuous');
});

// ---------------------------------------------------------------------------
// The step knob. ORDER-01B's second control, and the shell renders it as the
// INTERVAL slider it already had — one number, one control.
// ---------------------------------------------------------------------------

/** Run the shell's step-interval builder against a stub engine menu. */
function shellStepIntervals({ mutate = (s) => s, menu = null } = {}) {
    const src = read(SHELL);
    const body = mutate([
        balanced(src, 'function talariaStepMenu('),
        balanced(src, 'function engineStepIntervals('),
    ].join('\n'));
    const sandbox = {
        window: menu === null ? {} : { chart: { replaySystem: { getStepMenu: () => menu } } },
    };
    vm.createContext(sandbox);
    return JSON.parse(vm.runInContext(
        // The builder reads the menu through the window helper the speed block
        // exports, so wire it the way the shipped page does.
        `${body}; window.__talariaStepMenu = talariaStepMenu;
         JSON.stringify(engineStepIntervals());`, sandbox));
}

const STEP_MENU = [
    { seconds: 1, label: '1s', route: 'puppet', enabled: false, reason: 'below-data-floor' },
    { seconds: 15, label: '15s', route: 'puppet', enabled: false, reason: 'below-data-floor' },
    { seconds: 60, label: '1m', route: 'native', enabled: true, reason: null },
    { seconds: 300, label: '5m', route: 'native', enabled: true, reason: null },
];

test('shell: the step slider offers what the engine offers', () => {
    const out = shellStepIntervals({ menu: STEP_MENU });
    assert.deepEqual(out.map((iv) => iv.label), ['1m', '5m']);
    assert.deepEqual(out.map((iv) => iv.ms), [60000, 300000]);
});

test('shell: a step the mode cannot render is not offered', () => {
    // A one-second step needs the drawn path. Offering it in candle mode gets
    // the user a correct clock in front of a candle that never moves.
    const out = shellStepIntervals({ menu: STEP_MENU });
    assert.ok(!out.some((iv) => iv.label === '1s'),
        'a disabled step must not reach the slider');
});

test('shell: sub-minute steps reach the slider once the mode can serve them', () => {
    // The local interval table started at 1m and could not express these at
    // all, which is why the finest thing a user could ask for was a whole bar.
    const tick = STEP_MENU.map((e) => ({ ...e, enabled: true, route: 'drawn' }));
    assert.deepEqual(shellStepIntervals({ menu: tick }).map((iv) => iv.label),
        ['1s', '15s', '1m', '5m']);
});

test('shell: with no engine the slider keeps its own table', () => {
    assert.equal(shellStepIntervals({ menu: null }), null,
        'a null menu must fall back, not empty the control');
    assert.equal(shellStepIntervals({ menu: [] }), null);
});

test('shell MUTANT: keeping the disabled steps goes red', () => {
    const out = shellStepIntervals({
        menu: STEP_MENU,
        mutate: (s) => s.replace('return entry && entry.enabled && entry.label;',
            'return entry && entry.label;'),
    });
    assert.ok(out.some((iv) => iv.label === '1s'),
        'the mutant must offer the sub-floor step; if not, the disabled cell proves nothing');
});

test('shell: the REAL chip exists, and asks the engine for the preset', () => {
    const src = read(SHELL);
    assert.ok(/id="replayRealisticChip"/.test(src), 'the chip must be in the toolbar');
    const block = src.slice(src.indexOf('const realisticChip ='),
        src.indexOf('window.updateSpeedDisplay'));
    assert.ok(block.includes('rs.applyRealisticPreset()'),
        'the chip must apply the engine preset, not set a speed of its own');
    assert.ok(block.includes('rs.isRealisticPresetActive()'),
        'and it must read its pressed state back, or it will claim real time after the '
        + 'user moves the slider off it');
});

test('shell: a stored speed off the ladder is migrated, not ignored', () => {
    const src = read(SHELL);
    const fn = balanced(src, 'window.updateSpeedDisplay = function(speed) {');
    assert.ok(fn.includes('rs.migrateStoredSpeed(speed)'),
        'a returning user on 60x or REALISTIC must be moved onto a rung the ladder has');
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
    test(`v9 ${name}: the toolbar ladder is state, and its fallback is 1-10`, () => {
        // ORDER-01B: the ladder is the engine's, held in state. The literal
        // that remains is the pre-engine fallback, and it is ten numbers with
        // no string among them.
        const src = read(path);
        assert.ok(/const steps=replaySpeedSteps;/.test(src),
            'the slider must render the ladder it was given, not build one inline');
        const m = src.match(/const \[replaySpeedSteps(?:, setReplaySpeedSteps)?\] = useState\((\[[^\]]*\])\);/);
        assert.ok(m, 'the toolbar must declare a fallback ladder');
        assert.deepEqual(JSON.parse(m[1]), LADDER);
    });

    test(`v9 ${name}: REAL is a chip, not a rung`, () => {
        const src = read(path);
        assert.ok(/aria-pressed=\{replayRealistic\?"true":"false"\}/.test(src),
            'the preset must be its own control with its own pressed state');
        const block = src.slice(src.indexOf('const steps=replaySpeedSteps;'));
        assert.ok(!/\[1,2,3,4,5,6,7,8,9,10,"REALISTIC"\]/.test(block),
            'no ladder may still carry the string rung');
    });

    test(`v9 ${name}: no removed rung remains in the steps array`, () => {
        const src = read(path);
        assert.ok(!/steps=\[1,2,3,5,10,15,20,25,30,50,60,70,80,90,100\]/.test(src),
            'the 100x ladder literal must be gone');
    });

    test(`v9 ${name}: the range max follows the ladder, not a literal 14`, () => {
        const src = read(path);
        const block = src.slice(src.indexOf('const steps=replaySpeedSteps;'));
        const m = block.match(/<input type="range" min="0" max=\{?([^\s}"]+)\}?\s/);
        assert.ok(m, 'the speed range input must follow the steps array');
        assert.equal(m[1], 'last',
            'a literal max cannot track a ladder the engine can change');
    });

    test(`v9 ${name}: the default speed is a rung`, () => {
        const src = read(path);
        const m = src.match(/const \[speed, setSpeed\] = useState\((\d+)\);/);
        assert.ok(m, 'the toolbar must declare a default speed');
        assert.ok(LADDER.includes(Number(m[1])),
            `the default ${m[1]} is not on the ladder; 30 was the shipped value`);
    });

    test(`v9 ${name}: a REALISTIC still in flight is labelled, not rendered as "REALISTIC×"`, () => {
        // The engine resolves a stored REALISTIC to the bottom rung, but the
        // switched-off path still hands one out and the label must survive it.
        const src = read(path);
        const block = src.slice(src.indexOf('const steps=replaySpeedSteps;'));
        assert.ok(/steps\[si\]==="REALISTIC"\?/.test(block),
            'the label must still branch on REALISTIC while the kill-switch can produce one');
    });

    test(`v9 ${name}: the step control reaches below a minute`, () => {
        const src = read(path);
        assert.ok(/letterSpacing:"0\.08em"\}\}>STEP<\/div>/.test(src),
            'the popup section must be the step knob, not an interval-only list');
        const block = src.slice(src.indexOf('>STEP</div>'), src.indexOf('>STEP</div>') + 1200);
        assert.ok(/"1s"|replayIntervalEntries/.test(block),
            'the step list must be able to express a sub-minute step');
    });
}

test('v9 live: the step list comes from the engine, and keeps the disabled ones visible', () => {
    const src = read(V9_LIVE);
    const memo = balanced(src, 'const replayIntervalEntries = useMemo(');
    assert.ok(memo.includes('replayStepMenu.map'),
        'the entries must be the engine menu, not a local table');
    assert.ok(memo.includes('e.enabled !== false'),
        'the menu carries which steps this mode can render');
    assert.ok(/const replayIntervalOptions = useMemo\(\s*\(\) => replayIntervalEntries\.filter/.test(src),
        'the selectable set is the enabled subset, so nothing can land on a greyed step');
});

test('v9 live: a sub-bar step does not force candle mode', () => {
    // The old rule was "an explicit interval means candle", which was true
    // while every offerable interval was at least one bar. Under it, picking a
    // one-second step would move the user onto the one path that cannot draw it.
    const fn = balanced(read(V9_LIVE), 'const applyReplayControlsToEngine = (rs, mode, interval) => {');
    assert.ok(fn.includes('rs.isStepBelowDataFloor('),
        'the mode decision must ask the engine where the data floor is');
    assert.ok(/const desiredMode = subBarStep\s*\?\s*"tick"/.test(fn),
        'a sub-bar step must route to the drawn path');
});

// ---------------------------------------------------------------------------
// The engine, and the mirror. A UI fix that only reaches one mirror is not shipped.
// ---------------------------------------------------------------------------

test('engine: the ladder constant is 1-10 in both mirrors', () => {
    const expected = 'const SPEED_GOV_LADDER_BPS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);';
    for (const p of [ENGINE, ENGINE_MIRROR]) {
        assert.ok(read(p).includes(expected), `stale ladder in ${p}`);
    }
});

test('engine: the tick→candle demotion survives only for the switched-off path', () => {
    // ORDER-01B removes the reason for the demotion rather than the demotion:
    // REALISTIC is a preset on both knobs and means the same thing in either
    // mode, so there is nothing to strand the user on. With the step knob
    // switched off the old hazard is live again and the demotion must remain.
    for (const p of [ENGINE, ENGINE_MIRROR]) {
        const body = balanced(read(p), '    setPlaybackMode(mode, { restartPlayback = true } = {}) {');
        assert.ok(body.includes("normalizedMode === 'candle' && this.speed === SPEED_GOV_REALISTIC"),
            `tick→candle must not strand the user on REALISTIC (${p})`);
        assert.ok(body.includes('!_order01bStepV1Enabled()'),
            `the demotion must be scoped to the switched-off path (${p})`);
    }
});

test('no surface offers a removed rung', () => {
    // The single assertion the order is actually about, stated once across
    // every surface, so a future fourth ladder has to answer to it too.
    const fallbackLadder = (src) => {
        const m = src.match(/const \[replaySpeedSteps(?:, setReplaySpeedSteps)?\] = useState\([^)]*\);/);
        assert.ok(m, 'a toolbar with no fallback ladder would render nothing before the engine');
        return m[0];
    };
    const surfaces = {
        'legacy shell helper': balanced(read(SHELL), 'function talariaOfferedSpeeds('),
        'v9 live toolbar': fallbackLadder(read(V9_LIVE)),
        'v9 b toolbar': fallbackLadder(read(V9_B)),
        'engine ladder': read(ENGINE).match(/const SPEED_GOV_LADDER_BPS = [^;]*;/)[0],
    };
    for (const [where, text] of Object.entries(surfaces)) {
        for (const gone of REMOVED) {
            assert.ok(!new RegExp(`\\b${gone}\\b`).test(text),
                `${where} still offers ${gone}`);
        }
    }
});
