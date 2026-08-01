/**
 * mirror-interval-guard.test.mjs — HYG-2 oracle for stacked repeating timers.
 *
 * WHAT THIS CERTIFIES, AND WHAT IT DOES NOT.
 * It counts REAL installed timers: setInterval / setTimeout / clearInterval / clearTimeout are
 * replaced by a fake clock that tracks live handles, so "one live timer" means one entry in the
 * platform's timer table — never a proxy such as "the guard method was called" or "a field is
 * non-null", either of which a clear-and-never-reinstall bug would satisfy while the product died.
 * It does NOT witness browser memory growth: there is no browser or heap harness in this repo, so
 * the leak is inferred from surviving handle count and from callback invocations per unit of
 * modelled time. Cadence figures below are modelled-clock figures, not wall-clock measurements.
 *
 * The defect. Two repeating timers in replay-system.js were installed by paths that can be entered
 * more than once per session (setup() ← init() ← Chart.initReplaySystem(), which has unguarded
 * callers; and enterReplayMode(), which is re-entered on every enter/exit cycle). Neither stored a
 * handle anywhere the next entry could see, so entry number N left N copies running: a leak and a
 * per-tick cost multiplier at the same time.
 *
 * Cells run the SHIPPED text of both call sites and of the shared helper, lifted out of the file by
 * anchor, so a fix that only exists in the test cannot green anything.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL_REL = 'chart v 1.4/chart/modules/replay-system.js';
const MIRROR_REL = 'homepage/public/chart/modules/replay-system.js';
const CANONICAL = path.join(REPO, ...CANONICAL_REL.split('/'));
const MIRROR = path.join(REPO, ...MIRROR_REL.split('/'));

const SWITCH = '__TALARIA_MIRROR_INTERVAL_GUARD_V1';
const MANAGED_METHODS = Object.freeze([
    '_managedTimerLedger',
    '_clearManagedTimer',
    '_installManagedTimer',
    '_setManagedInterval',
    '_setManagedTimeout',
]);

const SRC = fs.readFileSync(CANONICAL, 'utf8');

/** The commit this change was cut from, for when HEAD has moved past it. */
const PRE_CHANGE_SHA = '88840d9ea';

function showBlob(rev) {
    return execFileSync('git', ['show', `${rev}:${CANONICAL_REL}`],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 });
}

/**
 * Pre-change bytes for the GATE cells. HEAD first, because that is where the bytes live while the
 * change is uncommitted; pinned once the guard is in HEAD, because a HEAD-relative gate would
 * otherwise self-invalidate the moment the fix lands and stop witnessing the defect at all.
 */
let preChangeCache = null;
function preChangeSource() {
    if (preChangeCache) return preChangeCache;
    let src = showBlob('HEAD');
    if (src.includes(SWITCH)) src = showBlob(PRE_CHANGE_SHA);
    assert.ok(!src.includes(SWITCH),
        'the GATE source must predate the guard, or it witnesses nothing');
    preChangeCache = src;
    return src;
}

/* ------------------------------------------------------------------ extraction */

function braceMatch(src, from) {
    let depth = 0;
    let i = src.indexOf('{', from);
    assert.notEqual(i, -1, 'no opening brace after anchor');
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error('unbalanced braces from anchor');
}

function extractModuleFn(src, name) {
    const anchor = `\nfunction ${name}(`;
    const a = src.indexOf(anchor);
    if (a === -1) return null;
    assert.equal(src.indexOf(anchor, a + 1), -1, `${name} must be defined once`);
    return src.slice(a + 1, braceMatch(src, a) + 1);
}

function extractMethod(src, name) {
    const anchor = `\n    ${name}(`;
    const a = src.indexOf(anchor);
    if (a === -1) return null;
    assert.equal(src.indexOf(anchor, a + 1), -1, `${name} must be defined once`);
    return src.slice(a + 1, braceMatch(src, a) + 1);
}

/** The `#replayFollow` poll installed by attachButtonEvents(), verbatim. */
function extractFollowPollBlock(src) {
    const anchor = '        if (!this.followBtn) {';
    const a = src.indexOf(anchor);
    assert.notEqual(a, -1, 'follow-button poll block not found');
    assert.equal(src.indexOf(anchor, a + 1), -1, 'follow-button poll anchor must be unique');
    return src.slice(a, braceMatch(src, a) + 1);
}

/** The post-layout realign chain installed by enterReplayMode(), verbatim. */
function extractRealignBlock(src) {
    const head = '        let realignAttempts = 0;';
    const a = src.indexOf(head);
    assert.notEqual(a, -1, 'realign chain not found');
    assert.equal(src.indexOf(head, a + 1), -1, 'realign anchor must be unique');
    const tail = 'if (!options.skipRealignAfterLayout) {';
    const t = src.indexOf(tail, a);
    assert.notEqual(t, -1, 'realign install site not found');
    return src.slice(a, braceMatch(src, t) + 1);
}

/* ------------------------------------------------------------------ fake clock */

/**
 * Tracks LIVE handles, which is the only thing that distinguishes "guarded" from
 * "cleared and never reinstalled". `installs` counts every install ever made, so a
 * cell can tell "one live timer because we reused one" from "one because we never
 * installed the other".
 */
function makeClock({ clearThrowsTimes = 0 } = {}) {
    const live = new Map();
    let nextHandle = 1;
    let now = 0;
    let installs = 0;
    let clearsAttempted = 0;
    let throwsLeft = clearThrowsTimes;

    const add = (kind, fn, ms) => {
        const delay = Math.max(0, Number(ms) || 0);
        const handle = nextHandle++;
        live.set(handle, { kind, fn, delay, due: now + delay });
        installs++;
        return handle;
    };
    const drop = (handle) => {
        clearsAttempted++;
        if (throwsLeft > 0) {
            throwsLeft--;
            throw new Error('platform clear failed');
        }
        live.delete(handle);
    };
    const countKind = (kind) => [...live.values()].filter((e) => e.kind === kind).length;

    return {
        setInterval: (fn, ms) => add('interval', fn, ms),
        setTimeout: (fn, ms) => add('timeout', fn, ms),
        clearInterval: drop,
        clearTimeout: drop,
        get installs() { return installs; },
        get clearsAttempted() { return clearsAttempted; },
        get liveCount() { return live.size; },
        get liveIntervals() { return countKind('interval'); },
        get liveTimeouts() { return countKind('timeout'); },
        liveHandles: () => [...live.keys()],
        /** Fire everything due within `ms`, earliest first; intervals re-arm. */
        advance(ms) {
            const target = now + ms;
            let fired = 0;
            for (let guard = 0; guard < 100000; guard++) {
                let pickHandle = null;
                let pickEntry = null;
                for (const [handle, entry] of live) {
                    if (entry.due > target) continue;
                    if (!pickEntry || entry.due < pickEntry.due) {
                        pickHandle = handle;
                        pickEntry = entry;
                    }
                }
                if (!pickEntry) break;
                now = pickEntry.due;
                if (pickEntry.kind === 'interval') pickEntry.due = now + Math.max(1, pickEntry.delay);
                else live.delete(pickHandle);
                fired++;
                pickEntry.fn();
            }
            now = target;
            return fired;
        },
    };
}

/* ------------------------------------------------------------------ fake realms */

function makeWindow({ selfFlag, parentFlag } = {}) {
    const host = { [SWITCH]: parentFlag };
    const panel = { [SWITCH]: selfFlag };
    host.parent = host;
    host.top = host;
    panel.parent = host;
    panel.top = host;
    return panel;
}

/** Minimal `#replayFollow` stand-in; the button is absent until appear() is called. */
function makeDocument() {
    let button = null;
    let lookups = 0;
    return {
        get lookups() { return lookups; },
        get button() { return button; },
        appear() {
            const listeners = [];
            button = {
                dataset: {},
                addEventListener(type, fn) { listeners.push([type, fn]); },
                click() { for (const [type, fn] of listeners) if (type === 'click') fn(); },
                listenerCount() { return listeners.length; },
            };
            return button;
        },
        getElementById(id) {
            lookups++;
            return id === 'replayFollow' ? button : null;
        },
        querySelector() { return null; },
    };
}

/* ------------------------------------------------------------------ the rig */

function buildRig(src, { selfFlag, parentFlag, clearThrowsTimes = 0 } = {}) {
    const clock = makeClock({ clearThrowsTimes });
    const win = makeWindow({ selfFlag, parentFlag });
    const warnings = [];
    const fakeConsole = { warn: (...a) => warnings.push(a), log() {}, error() {} };

    const truthyFn = extractModuleFn(src, '_talariaDisableFlagTruthy');
    assert.ok(truthyFn, 'shared truthy flag reader must exist in the shipped file');
    const guardFn = extractModuleFn(src, '_mirrorIntervalGuardDisabled')
        || `function _mirrorIntervalGuardDisabled() { return false; }`;
    const methods = MANAGED_METHODS.map((n) => extractMethod(src, n)).filter(Boolean);

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'window', 'console', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        `${truthyFn}\n${guardFn}\nreturn {\n${methods.join(',\n')}\n};`,
    );
    const rs = factory(win, fakeConsole, clock.setInterval, clock.clearInterval,
        clock.setTimeout, clock.clearTimeout);

    const document = makeDocument();
    let autoScrollClicks = 0;
    let indicatorUpdates = 0;
    let resizeCalls = 0;
    rs.followBtn = null;
    rs.enableAutoScroll = () => { autoScrollClicks++; };
    rs.updateAutoScrollIndicator = () => { indicatorUpdates++; };
    rs.isActive = true;
    rs.userHasPanned = false;
    rs.autoScrollEnabled = true;
    rs.getReplayAutoScrollState = () => ({ offsetX: 7 });
    rs.chart = {
        _lastResizeDpr: 1,
        offsetX: 0,
        autoScale: false,
        priceOffset: 3,
        priceZoom: 2,
        renderPending: false,
        resize() { resizeCalls++; },
        constrainOffset() {},
        render() {},
    };

    // eslint-disable-next-line no-new-func
    const enterSetupPath = new Function(
        'document', 'setInterval', 'clearInterval',
        extractFollowPollBlock(src),
    );
    // eslint-disable-next-line no-new-func
    const enterReplayRealign = new Function(
        'options', 'requestAnimationFrame', 'setTimeout', 'clearTimeout',
        extractRealignBlock(src),
    );
    const rafNow = (fn) => { fn(); };

    return {
        clock,
        window: win,
        document,
        warnings,
        rs,
        methodsFound: methods.length,
        counts: {
            get autoScrollClicks() { return autoScrollClicks; },
            get indicatorUpdates() { return indicatorUpdates; },
            get resizeCalls() { return resizeCalls; },
        },
        enterSetup(times = 1) {
            for (let i = 0; i < times; i++) {
                enterSetupPath.call(rs, document, clock.setInterval, clock.clearInterval);
            }
        },
        enterReplay(times = 1) {
            for (let i = 0; i < times; i++) {
                enterReplayRealign.call(rs, {}, rafNow, clock.setTimeout, clock.clearTimeout);
            }
        },
    };
}

const TRUTHY = Object.freeze([true, 1, 'yes', 'true', '0', {}, [], -1]);
const FALSY = Object.freeze([undefined, null, false, 0, '', Number.NaN]);

/* ------------------------------------------------------------------ cells */

test('R1 entering the setup path N times leaves exactly ONE live timer', () => {
    for (const n of [1, 2, 5, 20]) {
        const rig = buildRig(SRC);
        rig.enterSetup(n);
        assert.equal(rig.clock.liveIntervals, 1,
            `${n} entries must leave 1 live interval, got ${rig.clock.liveIntervals}`);
        assert.equal(rig.clock.liveCount, 1, 'no sibling handle may survive either');
        // Not vacuous: every entry really did install, and the extras were really cleared.
        assert.equal(rig.clock.installs, n, 'each entry installs; the guard clears, it does not skip');
    }
});

test('R2 GATE the shipped code BEFORE this change stacks one timer per entry', () => {
    const rig = buildRig(preChangeSource());
    rig.enterSetup(5);
    assert.equal(rig.clock.liveIntervals, 5,
        `the defect must reproduce: 5 entries, 5 live timers, got ${rig.clock.liveIntervals}`);
    // And it is a per-tick cost multiplier, not only a leak: five timers, five polls per 50ms.
    rig.clock.advance(100);
    assert.equal(rig.document.lookups, 10, 'every surviving copy keeps doing the work');

    const guarded = buildRig(SRC);
    guarded.enterSetup(5);
    guarded.clock.advance(100);
    assert.equal(guarded.document.lookups, 2, 'after the fix, one copy does the work once per tick');
});

test('R3 the surviving timer STILL FIRES and still finishes the job', () => {
    const rig = buildRig(SRC);
    rig.enterSetup(5);
    assert.equal(rig.clock.liveIntervals, 1);

    rig.clock.advance(100);
    assert.equal(rig.document.lookups, 2, 'the survivor must be a live, ticking timer');
    assert.equal(rig.rs.followBtn, null, 'nothing to bind yet');

    const button = rig.document.appear();
    rig.clock.advance(50);
    assert.equal(rig.rs.followBtn, button, 'the poll must still bind the late-mounted button');
    assert.equal(button.dataset.replayFollowBound, '1');
    assert.equal(button.listenerCount(), 1, 'exactly one click handler, not five');
    button.click();
    assert.equal(rig.counts.autoScrollClicks, 1, 'the bound handler must actually work');
    assert.equal(rig.counts.indicatorUpdates, 1);
    assert.equal(rig.clock.liveIntervals, 0, 'and the poll must retire once it succeeded');
});

test('R4 the timer also retires on its own attempt budget', () => {
    const rig = buildRig(SRC);
    rig.enterSetup(3);
    rig.clock.advance(60 * 50 + 50);
    assert.equal(rig.clock.liveIntervals, 0, 'the survivor must stop after its 60 attempts');
    assert.equal(rig.document.lookups, 60, 'and it must have attempted exactly 60 times, once each');
});

test('R5 clearing is exception-safe: a throwing clear cannot block the install '
    + 'nor leave a stale handle in the ledger', () => {
    const rig = buildRig(SRC, { clearThrowsTimes: 1 });
    rig.enterSetup(1);
    const first = rig.clock.liveHandles();
    assert.equal(first.length, 1);

    // Second entry: the platform clear throws. Setup must not blow up.
    assert.doesNotThrow(() => rig.enterSetup(1), 'a failed clear must not break setup');
    assert.equal(rig.clock.installs, 2, 'the new timer must still be installed');
    assert.equal(rig.warnings.length, 1, 'and the failure must be reported, not swallowed silently');

    const ledger = rig.rs._managedTimers;
    const recorded = ledger.followBtnPoll;
    assert.ok(recorded, 'the ledger must hold the NEW handle');
    assert.notEqual(recorded.handle, first[0], 'never the handle whose clear threw');
    assert.equal(recorded.kind, 'interval');

    // The ledger is not corrupted: a third entry cleanly clears the second handle.
    const second = recorded.handle;
    rig.enterSetup(1);
    assert.ok(!rig.clock.liveHandles().includes(second), 'the second handle must now be gone');
    assert.equal(rig.clock.liveIntervals, 2,
        'the third survives, plus the one the PLATFORM refused to clear — and nothing else');
    // That refusal is the environment, not the guard: the guard dropped the record the instant it
    // tried, so no later install can be misled into clearing a handle it does not own.
    assert.ok(!Object.values(rig.rs._managedTimers).some((e) => e.handle === first[0]),
        'the ledger must not reference the un-clearable handle');
    assert.equal(Object.keys(rig.rs._managedTimers).length, 1,
        'and the ledger must hold exactly one record per key, never a growing pile');
});

test('R6 kill-switch TRUTHY restores the stacking behaviour', () => {
    for (const value of TRUTHY) {
        const rig = buildRig(SRC, { selfFlag: value });
        rig.enterSetup(5);
        assert.equal(rig.clock.liveIntervals, 5,
            `truthy ${JSON.stringify(value)} must restore stacking`);
        // Legacy behaviour means legacy WORK, not a dead path: the copies still poll and bind.
        rig.clock.advance(100);
        assert.equal(rig.document.lookups, 10, 'the restored copies must all still fire');
        const button = rig.document.appear();
        rig.clock.advance(50);
        assert.equal(rig.rs.followBtn, button, 'the product must still work under the kill-switch');
    }
});

test('R7 kill-switch FALSY keeps the guard, and it is read per call', () => {
    for (const value of FALSY) {
        const rig = buildRig(SRC, { selfFlag: value });
        rig.enterSetup(5);
        assert.equal(rig.clock.liveIntervals, 1,
            `falsy ${JSON.stringify(value)} must keep the guard active`);
    }

    // Per-call, never sampled at init: flipping mid-session changes the next install only.
    const rig = buildRig(SRC);
    rig.enterSetup(3);
    assert.equal(rig.clock.liveIntervals, 1);
    rig.window[SWITCH] = 1;
    rig.enterSetup(2);
    assert.equal(rig.clock.liveIntervals, 3, 'the flip must take effect without a reload');
    rig.window[SWITCH] = 0;
    rig.enterSetup(1);
    assert.equal(rig.clock.liveIntervals, 3,
        'flipping back must resume guarding: the guarded handle is replaced, the stacked ones stay');
});

test('R8 the switch is read across realms (panel sees a flag set on the host)', () => {
    const rig = buildRig(SRC, { selfFlag: undefined, parentFlag: 'yes' });
    assert.equal(rig.window[SWITCH], undefined, 'the panel realm itself is clean, as in production');
    rig.enterSetup(4);
    assert.equal(rig.clock.liveIntervals, 4,
        'a host-page flag must reach the panel realm, or the negative control controls nothing');
});

test('R9 sibling timers are keyed independently — they must not clobber each other', () => {
    const rig = buildRig(SRC);
    rig.enterSetup(1);
    rig.enterReplay(1);
    assert.equal(rig.clock.liveIntervals, 1, 'the follow poll must survive a replay entry');
    assert.equal(rig.clock.liveTimeouts, 1, 'the realign chain must survive alongside it');

    rig.enterSetup(3);
    rig.enterReplay(3);
    assert.equal(rig.clock.liveIntervals, 1);
    assert.equal(rig.clock.liveTimeouts, 1);
    assert.equal(rig.clock.liveCount, 2, 'exactly two distinct managed timers, one per key');
});

test('R10 the realign chain also collapses to one, and still runs to completion', () => {
    const rig = buildRig(SRC);
    rig.enterReplay(4);
    assert.equal(rig.clock.liveTimeouts, 1, '4 replay entries must leave 1 pending realign pass');
    assert.equal(rig.counts.resizeCalls, 4, 'each entry still does its own immediate pass');

    rig.clock.advance(5000);
    assert.equal(rig.clock.liveTimeouts, 0, 'the chain must terminate');
    assert.equal(rig.counts.resizeCalls, 11,
        'the surviving chain must run its remaining 7 passes (4 immediate + 7)');

    const before = buildRig(preChangeSource());
    before.enterReplay(4);
    assert.equal(before.clock.liveTimeouts, 4, 'GATE: the old code stacks one chain per entry');
    before.clock.advance(5000);
    assert.equal(before.counts.resizeCalls, 4 + 4 * 7,
        'GATE: and every stacked chain does the work');
});

test('R11 the switch is read through the shared truthy helper, never === true', () => {
    assert.match(SRC, /function _mirrorIntervalGuardDisabled\(\)/);
    assert.match(SRC, new RegExp(`_talariaDisableFlagTruthy\\('${SWITCH}'\\)`));
    assert.ok(!new RegExp(`${SWITCH}\\s*===\\s*true`).test(SRC),
        'strict equality would let 1 / "yes" silently fail to disable');
    assert.ok(!new RegExp(`${SWITCH}\\s*==\\s*true`).test(SRC));
});

test('R12 both shipped copies are byte-identical', () => {
    assert.equal(SRC, fs.readFileSync(MIRROR, 'utf8'),
        'replay-system.js copies must match byte for byte');
});

test('R13 SCOPE STAMP: live-handle counts, and the limit is recorded', () => {
    const rows = [];
    for (const n of [1, 2, 5, 20]) {
        const fixed = buildRig(SRC);
        fixed.enterSetup(n);
        const before = buildRig(preChangeSource());
        before.enterSetup(n);
        rows.push({ n, after: fixed.clock.liveIntervals, before: before.clock.liveIntervals });
    }
    console.log('\nHYG-2 — live repeating timers after N entries into the setup path:');
    for (const r of rows) {
        console.log(`  entries=${String(r.n).padStart(2)}  live timers: ${r.before} before -> ${r.after} after`);
    }
    console.log('  LIMIT: engine-level. Counts live platform handles and callback invocations on a');
    console.log('         modelled clock; infers the leak, does not witness heap growth. No browser');
    console.log('         or heap harness exists in this repo.');
    assert.ok(rows.every((r) => r.after === 1 && r.before === r.n));
});
