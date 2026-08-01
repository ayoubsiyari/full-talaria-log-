/**
 * claim-failure-ledger.test.mjs — gate for CLAIM-FAILURE-LEDGER-V1.
 *
 *   node --test --test-concurrency=1 claim-failure-ledger.test.mjs
 *
 * Why this gate exists. `chart-window-limit.js` patches `window.fetch` and, for two
 * gated paths (`/api/file/*` and `/api/sessions/N/state`), waits on the window-claim
 * promise before issuing the request. When the claim does not succeed the patch answers
 * those requests with a SYNTHETIC 409 and never touches the network. A 401 claim — an
 * expired or not-yet-attached session — therefore leaves the chart with no data, no
 * server-side log line, and nothing in the product saying why. That is the same silent
 * shape as the prefs 500 that cost us two days, so the failed claim is counted into the
 * support passport's failed-write ledger.
 *
 * The claim is counted, not the reads it blocks: the claim is a POST, so a non-OK claim
 * genuinely is a failed server write, and counting every blocked read would storm the
 * counter from one cause.
 *
 * Cells assert, in order: each non-OK status is counted with its real status; success is
 * not counted AND does not clear the shared record; the switch is truthy, per call and
 * climbing (B-0185); the climb is not a leak; diagnostics cannot break the claim path;
 * panels never count (they do not claim); a retried claim is not double counted; and the
 * mirror carries the same bytes. Mutants at the end prove the cells are load-bearing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, 'chart-window-limit.js');
const MIRROR_PATH = path.resolve(
    HERE, '..', '..', '..', 'homepage', 'public', 'chart', 'modules', 'chart-window-limit.js'
);
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

const SWITCH = '__TALARIA_DISABLE_CLAIM_FAILURE_LEDGER_V1';
const CLAIM_PATH = '/api/chart/windows/claim';

/** A sessionStorage/localStorage that behaves like the real one. */
function makeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        _map: map
    };
}

/**
 * Load chart-window-limit.js into a realm.
 *
 * `document.readyState` is left at 'loading' so `boot()` is deferred to a
 * DOMContentLoaded listener we never fire — otherwise the module claims on its own and
 * every cell would race its own fixture. Claims are driven explicitly through the public
 * `__talariaChartWindowLimit.claim()`.
 *
 * `parent`/`top` model the multichart panel case: a panel whose parent is the host.
 * `search` drives `isMultichartPanel()` — the panel case must not claim at all.
 */
function loadModule({
    source = SOURCE,
    claimResponse,
    parent,
    top,
    search = '',
    ledger,
    flags = {}
} = {}) {
    const notes = [];
    const clears = [];
    const win = {
        sessionStorage: makeStorage(),
        localStorage: makeStorage(),
        location: { search, href: 'https://talaria.test/chart/' + search, origin: 'https://talaria.test' },
        navigator: {},
        console: { warn() {}, error() {}, log() {} },
        // Timers are inert on purpose. The module polls (heartbeat, shared-id retry,
        // user-id wait) and a stub that runs callbacks would either recurse forever or
        // fire claims this gate did not ask for. Every claim here is driven explicitly.
        setInterval: () => 0,
        clearInterval: () => {},
        setTimeout: () => 0,
        clearTimeout: () => {},
        addEventListener() {},
        removeEventListener() {},
        Response,
        Headers,
        URL,
        URLSearchParams,
        Promise,
        Object,
        Array,
        Number,
        String,
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
            querySelectorAll: () => []
        },
        WebSocket: function WebSocketStub() {},
        fetch: (url) => {
            if (String(url).indexOf(CLAIM_PATH) >= 0) return claimResponse();
            return Promise.resolve(new Response('{}', { status: 200 }));
        }
    };
    win.window = win;
    win.parent = parent ?? win;
    win.top = top ?? win.parent;
    win.self = win;
    Object.assign(win, flags);

    // The ledger global, as published by server-write-failure-ledger.js.
    if (ledger !== null) {
        win.__talariaNoteServerWriteFailure = ledger || ((endpoint, status) => {
            notes.push({ endpoint, status });
        });
        win.__talariaNoteServerWriteSuccess = () => { clears.push(true); };
    }

    const context = vm.createContext(win);
    vm.runInContext(`var window = this;\n${source}`, context);
    return { win, notes, clears };
}

const json = (status, body = {}) =>
    () => Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    }));

test('401 claim is counted with the claim path and the real status', async () => {
    const { win, notes } = loadModule({ claimResponse: json(401, { error: 'Unauthorized' }) });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 401 }]);
});

test('401 claim fails CLOSED — this is why it must be counted', async () => {
    const { win } = loadModule({ claimResponse: json(401) });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, false, '401 resolves false, so gated fetches get a synthetic 409');
});

test('unexpected 5xx claim is counted even though it soft-fails open', async () => {
    const { win, notes } = loadModule({ claimResponse: json(500) });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true, 'bootstrap must not brick on a 5xx');
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 500 }]);
});

test('405 misroute is counted (the nginx-wrong-upstream class)', async () => {
    const { win, notes } = loadModule({ claimResponse: json(405) });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 405 }]);
});

test('a claim that never answers is counted as status 0, not dropped', async () => {
    const { win, notes } = loadModule({
        claimResponse: () => Promise.reject(new Error('offline'))
    });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true);
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 0 }]);
});

test('a successful claim is not counted', async () => {
    const { win, notes } = loadModule({ claimResponse: json(200, { ok: true }) });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true);
    assert.deepStrictEqual(Array.from(notes), []);
});

test('a successful claim does NOT clear the ledger — the record is shared with prefs', async () => {
    const { win, clears } = loadModule({ claimResponse: json(200, { ok: true }) });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(
        Array.from(clears), [],
        'clearing here would erase evidence of failed preference writes'
    );
});

test('the switch set in the own realm disables counting', async () => {
    const { win, notes } = loadModule({
        claimResponse: json(401),
        flags: { [SWITCH]: true }
    });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), []);
});

test('the switch set on the PARENT reaches a panel-embedded realm (B-0185)', async () => {
    const host = { [SWITCH]: true };
    const { win, notes } = loadModule({ claimResponse: json(401), parent: host, top: host });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(
        Array.from(notes), [],
        'a host-side flip must reach the embedded realm or the control is inert'
    );
});

test('the switch set on TOP reaches a nested realm', async () => {
    const top = { [SWITCH]: true };
    const mid = { parent: top, top };
    const { win, notes } = loadModule({ claimResponse: json(401), parent: mid, top });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), []);
});

test('a clean realm chain still counts — the climb is not a leak', async () => {
    const host = {};
    const { win, notes } = loadModule({ claimResponse: json(401), parent: host, top: host });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 401 }]);
});

test('an unreadable cross-origin parent does not read as switch-set', async () => {
    const hostile = {};
    Object.defineProperty(hostile, SWITCH, {
        get() { throw new Error('cross-origin realm'); }
    });
    const { win, notes } = loadModule({ claimResponse: json(401), parent: hostile, top: hostile });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(
        Array.from(notes), [{ endpoint: CLAIM_PATH, status: 401 }],
        'an unreadable realm is unknown, not disabled'
    );
});

test('no ledger loaded: the claim path still resolves and does not throw', async () => {
    const { win } = loadModule({ claimResponse: json(401), ledger: null });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, false, 'the claim decision must not depend on diagnostics');
});

test('a ledger that throws cannot break the claim path', async () => {
    const { win } = loadModule({
        claimResponse: json(401),
        ledger: () => { throw new Error('ledger exploded'); }
    });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, false);
});

test('a multichart panel does not claim, so it never counts a claim failure', async () => {
    const { win, notes } = loadModule({
        claimResponse: json(401),
        search: '?panelId=B'
    });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true, 'panels inherit the host claim (shouldClaim false)');
    assert.deepStrictEqual(Array.from(notes), [], 'counting here would multiply one cause by panel count');
});

/* ── The release-race retry must SETTLE. It used to await its own descendant. ──
 *
 * A 409 with a kicked detail on the first claim is what a reload or a second window
 * produces before the old window's release lands. The old retry called claim(true),
 * which hit the single-flight guard and returned the very chained promise it was inside,
 * so it never settled and every gated fetch hung forever with no error anywhere. These
 * cells are the reason the fix exists; the switch cell proves they are load-bearing.
 */
const RETRY_SWITCH = '__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1';

/** Resolve to 'pending' if `p` has not settled within a real timer tick. */
function settleOrPending(p, ms = 60) {
    return Promise.race([
        Promise.resolve(p).then(() => 'settled', () => 'settled'),
        new Promise((r) => setTimeout(() => r('pending'), ms))
    ]);
}

const kickedThen = (second) => {
    const fn = () => {
        fn.calls += 1;
        const call = fn.calls;
        const body = call === 1
            ? { detail: { code: 'chart_window_kicked' } }
            : second.body;
        const status = call === 1 ? 409 : second.status;
        return Promise.resolve(new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' }
        }));
    };
    fn.calls = 0;
    return fn;
};

test('a 409 kicked claim retries once and SETTLES', async () => {
    const claimResponse = kickedThen({ status: 200, body: { ok: true } });
    const { win } = loadModule({ claimResponse });
    const state = await settleOrPending(win.__talariaChartWindowLimit.claim());
    assert.equal(state, 'settled', 'the retry path must not hang the claim promise');
    assert.equal(claimResponse.calls, 2, 'the release-race retry must still actually happen');
});

test('a 409 that is retried and then succeeds is not counted', async () => {
    const { win, notes } = loadModule({
        claimResponse: kickedThen({ status: 200, body: { ok: true } })
    });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, true);
    assert.deepStrictEqual(Array.from(notes), [], 'the retry outcome is the reportable one');
});

test('a 409 that stands after the retry is counted once and resolves false', async () => {
    const kicked = () => Promise.resolve(new Response(
        JSON.stringify({ detail: { code: 'chart_window_kicked' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
    ));
    const { win, notes } = loadModule({ claimResponse: kicked });
    const ok = await win.__talariaChartWindowLimit.claim();
    assert.equal(ok, false);
    assert.deepStrictEqual(Array.from(notes), [{ endpoint: CLAIM_PATH, status: 409 }]);
});

test('a hung claim would hang every GATED fetch — the consequence cell', async () => {
    const { win } = loadModule({
        claimResponse: kickedThen({ status: 200, body: { ok: true } })
    });
    const state = await settleOrPending(win.fetch('/api/sessions/12/state'));
    assert.equal(
        state, 'settled',
        'session-state restore waits on the claim; if the claim hangs, layout never restores'
    );
});

test('the switch restores the deadlock — so the negative control is real', async () => {
    const { win } = loadModule({
        claimResponse: kickedThen({ status: 200, body: { ok: true } }),
        flags: { [RETRY_SWITCH]: true }
    });
    const state = await settleOrPending(win.__talariaChartWindowLimit.claim());
    assert.equal(
        state, 'pending',
        'with the fix off the promise never settles — which is the defect, and proves the fix is load-bearing'
    );
});

test('the retry switch climbs to the parent realm', async () => {
    const host = { [RETRY_SWITCH]: true };
    const { win } = loadModule({
        claimResponse: kickedThen({ status: 200, body: { ok: true } }),
        parent: host,
        top: host
    });
    const state = await settleOrPending(win.__talariaChartWindowLimit.claim());
    assert.equal(state, 'pending', 'a host-side flip must reach the embedded realm');
});

test('WIRING: the served mirror is byte-identical', () => {
    const mirror = fs.readFileSync(MIRROR_PATH, 'utf8');
    assert.equal(
        mirror, SOURCE,
        'homepage/public is what nginx serves; drift here means the gate tests a file nobody loads'
    );
});

test('WIRING: the counter is called from the claim response handler, not only defined', () => {
    assert.match(SOURCE, /function noteClaimFailure\(/, 'helper must exist');
    const calls = SOURCE.match(/noteClaimFailure\(/g) || [];
    assert.ok(
        calls.length >= 6,
        `expected the helper defined once and called on every non-OK branch, saw ${calls.length}`
    );
});

/* ── Mutants: without these the cells above could pass with the defect present ── */

test('MUTANT own-realm-only predicate is caught by the parent-switch cell', async () => {
    const mutant = SOURCE.replace(
        /function talariaDisableFlagTruthy\(flagName\) \{[\s\S]*?\n    \}/,
        `function talariaDisableFlagTruthy(flagName) {
        try { return !!window[flagName]; } catch (_e) { return false; }
    }`
    );
    assert.notEqual(mutant, SOURCE, 'mutation must apply');
    const host = { [SWITCH]: true };
    const { win, notes } = loadModule({
        source: mutant, claimResponse: json(401), parent: host, top: host
    });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(
        Array.from(notes), [{ endpoint: CLAIM_PATH, status: 401 }],
        'the own-realm mutant ignores the host switch — which is exactly what the climb cell forbids'
    );
});

test('MUTANT dropping the 401 count is caught by the first cell', async () => {
    const mutant = SOURCE.replace(
        /if \(res\.status === 401\) \{[\s\S]*?noteClaimFailure\(res\.status\);\n(\s*)return false;/,
        'if (res.status === 401) {\n$1return false;'
    );
    assert.notEqual(mutant, SOURCE, 'mutation must apply');
    const { win, notes } = loadModule({ source: mutant, claimResponse: json(401) });
    await win.__talariaChartWindowLimit.claim();
    assert.deepStrictEqual(Array.from(notes), [], 'silent again — the cell above is load-bearing');
});

test('MUTANT counting the blocked reads instead of the claim would storm', async () => {
    // Not a source mutation: an arithmetic check that the chosen unit is the bounded one.
    // One failed claim blocks every gated fetch for the life of the page; a four-panel
    // layout issues many. Counting reads would report one cause as dozens of failures.
    const { win, notes } = loadModule({ claimResponse: json(401) });
    await win.__talariaChartWindowLimit.claim();
    await win.fetch('/api/file/abc');
    await win.fetch('/api/sessions/12/state');
    assert.equal(
        notes.length, 1,
        'one cause, one count — blocked reads must not each add to the ledger'
    );
});
