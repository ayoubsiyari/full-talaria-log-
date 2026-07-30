/**
 * GATE: a window-limit control POST that is accepted and never answered must not hang.
 *
 * GATE-01 IS TWO FILES. Every cell below drives a stubbed fetch in one realm, which is fast and
 * proves the mechanism, but it cannot show whether the BROWSER releases the socket — and that is
 * the property C's P0 sighting was actually about. The browser-level half lives in
 * window-control-socket-release.test.mjs: real Chrome, real sockets, C's route (chart tab with
 * four panels, reload it, open a second tab), with the genuine pre-fix module as the negative
 * control. It reproduces the two permanently-held POSTs and goes RED on them.
 *
 * THE DEFECT THIS GATE EXISTS FOR
 * chart-window-limit.js gates /api/file/* and /api/sessions/N/state behind a claim POST.
 * That POST had no timeout, no AbortController and no ceiling of any kind. A server that
 * accepted the claim and then went quiet left the claim promise pending forever, so every
 * gated fetch waited on it forever and the chart never booted — and the socket stayed open,
 * which matters because HTTP/1.1 caps sockets per origin PER BROWSER, not per tab. Reload
 * the chart, or open it in a second tab, and requests to that origin starve until the
 * browser is closed. Observed live on the deployed build: two claim-path POSTs pending
 * indefinitely, a dozen static PNGs pending 64s, while /api/auth/me answered normally.
 *
 * WHY THE PRE-EXISTING CLAIM GATE COULD NOT SEE IT
 * claim-failure-ledger.test.mjs drives the module with a fetch stub that always settles —
 * every cell models "the server said something" or "the network refused". Neither is this.
 * It also stubs timers inert, so a ceiling could not fire even if one existed. 26/26 green
 * was honest about the paths it covered and structurally blind to this one. Hence a separate
 * gate with a controllable clock and a request that simply stays pending.
 *
 * Cells assert, in order: a never-answered claim still produces an outcome; the request is
 * really aborted (a settled promise over a live socket fixes nothing); a healthy claim arms
 * no leftover timer; the consequence path — gated fetches no longer wait forever; the gate
 * wait has its own ceiling even if the abort is ignored; the stall is counted as status 0;
 * it is warned once and not stormed; heartbeats do not stack sockets on a stalled endpoint;
 * the release fallback is bounded; a healthy claim is untouched; a legitimately slow GATED
 * download is NOT aborted; the kill-switch restores the defect and climbs realms; and the
 * mirror carries the same bytes. Mutants at the end prove the cells are load-bearing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { setImmediate as tick } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, 'chart-window-limit.js');
const MIRROR_PATH = path.resolve(
    HERE, '..', '..', '..', 'homepage', 'public', 'chart', 'modules', 'chart-window-limit.js'
);
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

const SWITCH = '__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1';
const CLAIM_PATH = '/api/chart/windows/claim';
const HEARTBEAT_PATH = '/api/chart/windows/heartbeat';
const RELEASE_PATH = '/api/chart/windows/release';
/** Comfortably past both the control ceiling (10s) and the gate ceiling (12s). */
const PAST_EVERY_CEILING = 30000;

function makeStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
    };
}

/**
 * A clock the cells drive by hand.
 *
 * Real ceilings are 10s and 12s; a gate that waited them out in wall-clock time would take
 * minutes. Virtual time keeps the assertions about the ceiling, not about the wall clock.
 */
function makeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    const intervals = new Map();
    const cleared = [];
    return {
        setTimeout(fn, ms) {
            const id = nextId++;
            timers.set(id, { fn, at: now + (Number(ms) || 0) });
            return id;
        },
        clearTimeout(id) {
            if (timers.delete(id)) cleared.push(id);
        },
        setInterval(fn, ms) {
            const id = nextId++;
            intervals.set(id, { fn, ms });
            return id;
        },
        clearInterval(id) { intervals.delete(id); },
        /** Advance virtual time, running whatever is due, then drain microtasks. */
        async advance(ms) {
            now += ms;
            const due = [...timers.entries()]
                .filter(([, t]) => t.at <= now)
                .sort((a, b) => a[1].at - b[1].at);
            for (const [id, t] of due) {
                timers.delete(id);
                try { t.fn(); } catch { /* a timer callback must not break the clock */ }
                await tick();
            }
            await tick();
        },
        /** Fire a registered interval by hand, e.g. the heartbeat. */
        async fireIntervals(times = 1) {
            for (let i = 0; i < times; i++) {
                for (const [, t] of [...intervals.entries()]) {
                    try { t.fn(); } catch { /* as above */ }
                }
                await tick();
            }
        },
        armedTimers: () => timers.size,
        clearedCount: () => cleared.length,
        intervalCount: () => intervals.size,
    };
}

/**
 * A fetch that records every request and lets each cell decide the outcome.
 *
 * `pending` models the defect precisely: the request is accepted and no response ever
 * arrives. `honourSignal` reflects what a real fetch does on abort — reject with an
 * AbortError — and can be switched off to model a request that ignores the abort, which is
 * what the independent gate ceiling exists for.
 */
function makeFetch({ claim = 'pending', other = 'ok', honourSignal = true } = {}) {
    const calls = [];
    const fn = (url, init) => {
        const record = { url: String(url), init: init || {}, aborted: false, settled: false };
        calls.push(record);
        const mode = record.url.indexOf(CLAIM_PATH) >= 0 ? claim : other;
        if (mode === 'ok') {
            record.settled = true;
            return Promise.resolve(new Response('{"ok":true}', {
                status: 200, headers: { 'Content-Type': 'application/json' },
            }));
        }
        if (typeof mode === 'number') {
            record.settled = true;
            return Promise.resolve(new Response('{}', {
                status: mode, headers: { 'Content-Type': 'application/json' },
            }));
        }
        return new Promise((_resolve, reject) => {
            const signal = record.init && record.init.signal;
            if (signal && honourSignal) {
                const onAbort = () => {
                    record.aborted = true;
                    record.settled = true;
                    const err = new Error('The operation was aborted.');
                    err.name = 'AbortError';
                    reject(err);
                };
                if (signal.aborted) onAbort();
                else signal.addEventListener('abort', onAbort);
            }
            // Otherwise: accepted, never answered. No resolve, ever.
        });
    };
    fn.calls = calls;
    fn.of = (needle) => calls.filter((c) => c.url.indexOf(needle) >= 0);
    return fn;
}

function loadModule({
    source = SOURCE,
    fetchImpl,
    parent,
    top,
    search = '',
    flags = {},
    withBeacon = false,
} = {}) {
    const notes = [];
    const warnings = [];
    const clock = makeClock();
    const fetchFn = fetchImpl || makeFetch();
    const win = {
        sessionStorage: makeStorage(),
        localStorage: makeStorage(),
        location: {
            search,
            href: 'https://talaria.test/chart/' + search,
            origin: 'https://talaria.test',
            pathname: '/chart/',
        },
        navigator: withBeacon ? { sendBeacon: () => true } : {},
        console: { warn: (m) => warnings.push(String(m)), error() {}, log() {} },
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        setInterval: clock.setInterval,
        clearInterval: clock.clearInterval,
        addEventListener() {},
        removeEventListener() {},
        AbortController,
        Response,
        Headers,
        Request,
        Blob,
        URL,
        URLSearchParams,
        Promise,
        Object,
        Array,
        Number,
        String,
        Error,
        JSON,
        Date,
        Math,
        isFinite,
        document: {
            readyState: 'loading',
            visibilityState: 'visible',
            addEventListener() {},
            createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
            body: { appendChild() {} },
            getElementById: () => null,
            querySelectorAll: () => [],
        },
        WebSocket: function WebSocketStub() {},
        fetch: fetchFn,
    };
    win.window = win;
    win.parent = parent ?? win;
    win.top = top ?? win.parent;
    win.self = win;
    Object.assign(win, flags);
    win.__talariaNoteServerWriteFailure = (endpoint, status) => { notes.push({ endpoint, status }); };
    win.__talariaNoteServerWriteSuccess = () => {};

    const context = vm.createContext(win);
    vm.runInContext(`var window = this;\n${source}`, context);
    return { win, notes, warnings, clock, fetchFn };
}

/** 'settled' if `p` finished, 'pending' if it is still hanging. No wall-clock waiting. */
async function settleState(p) {
    let state = 'pending';
    p.then(() => { state = 'settled'; }, () => { state = 'settled'; });
    await tick();
    await tick();
    return state;
}

/* ─────────────────────────── the defect, and its consequence ─────────────────────────── */

test('a claim that is accepted and never answered still produces an outcome', async () => {
    const { win, clock } = loadModule();
    const promise = win.__talariaChartWindowLimit.claim();
    assert.equal(await settleState(promise), 'pending', 'still waiting before the ceiling');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(await settleState(promise), 'settled', 'the ceiling must end the wait');
    assert.equal(await promise, true, 'an unreachable windows API must not brick the chart');
});

test('the never-answered claim request is really ABORTED, not merely ignored', async () => {
    const { win, clock, fetchFn } = loadModule();
    win.__talariaChartWindowLimit.claim();
    const [claimCall] = fetchFn.of(CLAIM_PATH);
    assert.ok(claimCall, 'the claim POST was issued');
    assert.ok(claimCall.init.signal, 'the claim must carry an abort signal');
    assert.equal(claimCall.aborted, false, 'not aborted before the ceiling');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(
        claimCall.aborted, true,
        'a promise that settles over a live socket leaves the per-origin pool starved'
    );
    assert.equal(claimCall.init.signal.aborted, true, 'the signal itself must show aborted');
});

test('a hung claim no longer hangs a GATED fetch — the user-visible consequence cell', async () => {
    const { win, clock } = loadModule();
    const boot = win.fetch('/api/file/EURUSD.json');
    const layout = win.fetch('/api/sessions/1/state');
    assert.equal(await settleState(boot), 'pending', 'gated on the claim, as designed');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(await settleState(boot), 'settled', 'chart data must arrive or fail, never hang');
    assert.equal(await settleState(layout), 'settled', 'layout restore likewise');
    const bootRes = await boot;
    assert.equal(bootRes.status, 200, 'the request reaches the network once the gate opens');
});

test('the gate wait has its own ceiling even when the abort is ignored', async () => {
    // A request that ignores its signal is the case the control ceiling cannot rescue, so
    // the gate wait must not depend on it.
    const { win, clock } = loadModule({ fetchImpl: makeFetch({ honourSignal: false }) });
    const boot = win.fetch('/api/file/EURUSD.json');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(
        await settleState(boot), 'settled',
        'no gated fetch may wait on the claim gate indefinitely, whatever the claim does'
    );
});

test('a stalled claim is counted in the failed-write ledger as status 0', async () => {
    const { win, clock, notes } = loadModule();
    win.__talariaChartWindowLimit.claim();
    await clock.advance(PAST_EVERY_CEILING);
    assert.ok(
        Array.from(notes).some((n) => n.endpoint === CLAIM_PATH && n.status === 0),
        'a silent stall must announce itself in the passport, not be inferred later'
    );
});

test('the stall is warned loudly, and once — a retrying endpoint must not storm the console', async () => {
    const { win, clock, warnings } = loadModule();
    win.__talariaChartWindowLimit.claim();
    await clock.advance(PAST_EVERY_CEILING);
    const about = Array.from(warnings).filter((w) => w.indexOf('did not answer') >= 0);
    assert.equal(about.length, 1, 'exactly one warning for the first stall');
    assert.ok(about[0].indexOf(CLAIM_PATH) >= 0, 'the warning names the endpoint');

    for (let i = 0; i < 5; i++) {
        win.__talariaChartWindowLimit.claim();
        await clock.advance(PAST_EVERY_CEILING);
    }
    const after = Array.from(warnings).filter((w) => w.indexOf('did not answer') >= 0);
    assert.equal(after.length, 1, 'repeat stalls must not repeat the warning');
});

/* ───────────────────────── the other two unbounded control POSTs ───────────────────────── */

test('heartbeats do not stack sockets on a stalled endpoint', async () => {
    const { win, clock, fetchFn } = loadModule({
        fetchImpl: makeFetch({ claim: 'ok', other: 'pending' }),
    });
    await win.__talariaChartWindowLimit.claim();
    assert.ok(clock.intervalCount() > 0, 'a successful claim starts the heartbeat');

    await clock.fireIntervals(4);
    const beats = fetchFn.of(HEARTBEAT_PATH);
    assert.equal(
        beats.length, 1,
        'without an overlap guard the pool dies by accumulation: one dead socket per interval'
    );
    assert.ok(beats[0].init.signal, 'the heartbeat is bounded too');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(beats[0].aborted, true, 'a stalled heartbeat is aborted, not left open');

    // Once the stalled beat is resolved, the next interval is free to try again.
    await clock.fireIntervals(1);
    assert.equal(fetchFn.of(HEARTBEAT_PATH).length, 2, 'the guard must not be a permanent latch');
});

test('the release fallback is bounded — a reload must not leave a keepalive socket behind', async () => {
    // No sendBeacon, so release takes the fetch path; keepalive outlives the page, which is
    // how one reload leaves two dead sockets in the shared pool.
    const { win, clock, fetchFn } = loadModule({
        fetchImpl: makeFetch({ claim: 'ok', other: 'pending' }),
        withBeacon: false,
    });
    await win.__talariaChartWindowLimit.claim();
    win.__talariaChartWindowLimit.release();
    const [rel] = fetchFn.of(RELEASE_PATH);
    assert.ok(rel, 'release was sent over fetch');
    assert.equal(rel.init.keepalive, true, 'still keepalive — that part is deliberate');
    assert.ok(rel.init.signal, 'but bounded');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(rel.aborted, true, 'an unanswered release must not outlive the page forever');
});

/* ──────────────────────────── no over-reach on the healthy path ──────────────────────────── */

test('a healthy claim is untouched: no abort, no ledger note, no leftover timer', async () => {
    const { win, clock, notes, fetchFn } = loadModule({ fetchImpl: makeFetch({ claim: 'ok' }) });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true, 'a good claim still succeeds');
    const [claimCall] = fetchFn.of(CLAIM_PATH);
    assert.equal(claimCall.aborted, false, 'a healthy request is never aborted');
    assert.equal(
        Array.from(notes).filter((n) => n.status === 0).length, 0,
        'nothing to report when the server answers'
    );
    assert.ok(clock.clearedCount() > 0, 'the ceiling timer is cleared, not left armed');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(claimCall.aborted, false, 'and it stays un-aborted after the ceiling passes');
});

test('a legitimately SLOW gated download is NOT aborted — the over-reach guard', async () => {
    // Bounding the claim is the fix. Bounding the payload would turn a slow chart into a
    // broken one, so the gated request itself must carry no ceiling of ours.
    const { win, clock, fetchFn } = loadModule({
        fetchImpl: makeFetch({ claim: 'ok', other: 'pending' }),
    });
    await win.__talariaChartWindowLimit.claim();
    const slow = win.fetch('/api/file/EURUSD.json');
    await clock.advance(PAST_EVERY_CEILING * 4);
    const [dataCall] = fetchFn.of('/api/file/');
    assert.equal(dataCall.aborted, false, 'a big honest download must be allowed to finish');
    assert.equal(await settleState(slow), 'pending', 'still downloading, which is correct');
});

/* ─────────────────────────────── FLAG-01 / FLAG-02 ─────────────────────────────── */

test('the kill-switch restores the defect exactly — FLAG-01', async () => {
    const { win, clock, fetchFn } = loadModule({ flags: { [SWITCH]: true } });
    const promise = win.__talariaChartWindowLimit.claim();
    const boot = win.fetch('/api/file/EURUSD.json');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(await settleState(promise), 'pending', 'switch off the cure and the claim hangs');
    assert.equal(await settleState(boot), 'pending', 'and every gated fetch hangs with it');
    const [claimCall] = fetchFn.of(CLAIM_PATH);
    assert.equal(claimCall.init.signal, undefined, 'and no abort signal is attached');
});

test('a host-side switch flip reaches an embedded panel realm — FLAG-02', async () => {
    const host = { [SWITCH]: true };
    const { win, clock } = loadModule({ parent: host, top: host });
    const promise = win.__talariaChartWindowLimit.claim();
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(
        await settleState(promise), 'pending',
        'a host-only read would miss the flip and the switch would look like it did nothing'
    );
});

test('the served mirror carries the same bytes', () => {
    assert.equal(
        fs.readFileSync(MIRROR_PATH, 'utf8'), SOURCE,
        'homepage/public is what the browser actually loads'
    );
});

/* ── Mutants: without these the cells above could pass with the defect present ── */

function mutate(from, to) {
    assert.ok(SOURCE.includes(from), `mutant anchor must exist in source: ${from}`);
    return SOURCE.replace(from, to);
}

test('MUTANT settling without aborting is caught by the abort cell', async () => {
    const source = mutate('if (controller) controller.abort();', 'if (false) controller.abort();');
    const { win, clock, fetchFn } = loadModule({ source, fetchImpl: makeFetch({ honourSignal: true }) });
    win.__talariaChartWindowLimit.claim();
    await clock.advance(PAST_EVERY_CEILING);
    const [claimCall] = fetchFn.of(CLAIM_PATH);
    assert.equal(claimCall.aborted, false, 'mutant leaves the socket open');
});

test('MUTANT removing the gate ceiling is caught by the ignored-abort cell', async () => {
    const source = mutate(
        'if (typeof setTimeout !== \'function\') return promise;',
        'return promise;'
    );
    const { win, clock } = loadModule({ source, fetchImpl: makeFetch({ honourSignal: false }) });
    const boot = win.fetch('/api/file/EURUSD.json');
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(await settleState(boot), 'pending', 'mutant hangs the gated fetch again');
});

test('MUTANT dropping the heartbeat overlap guard is caught', async () => {
    const source = mutate('if (heartbeatInFlight) return;', 'if (false) return;');
    const { win, clock, fetchFn } = loadModule({
        source, fetchImpl: makeFetch({ claim: 'ok', other: 'pending' }),
    });
    await win.__talariaChartWindowLimit.claim();
    await clock.fireIntervals(4);
    assert.ok(
        fetchFn.of(HEARTBEAT_PATH).length > 1,
        'mutant opens a fresh socket every interval'
    );
});

test('MUTANT failing CLOSED on a stall is caught by the outcome cell', async () => {
    const source = mutate(
        '                noteClaimFailure(0);\n                resolve(true);',
        '                noteClaimFailure(0);\n                resolve(false);'
    );
    const { win, clock } = loadModule({ source, fetchImpl: makeFetch({ honourSignal: false }) });
    const boot = await (async () => {
        const p = win.fetch('/api/file/EURUSD.json');
        await clock.advance(PAST_EVERY_CEILING);
        return p;
    })();
    assert.equal(
        boot.status, 409,
        'mutant answers a synthetic 409, i.e. an empty chart — which is why the ceiling opens the gate'
    );
});

test('MUTANT not counting the stall is caught by the ledger cell', async () => {
    const source = mutate(
        '            if (timedOut) {\n                warnOnce(',
        '            if (false) {\n                warnOnce('
    );
    const { win, clock, warnings } = loadModule({ source });
    win.__talariaChartWindowLimit.claim();
    await clock.advance(PAST_EVERY_CEILING);
    assert.equal(
        Array.from(warnings).filter((w) => w.indexOf('did not answer') >= 0).length, 0,
        'mutant stalls silently'
    );
});
