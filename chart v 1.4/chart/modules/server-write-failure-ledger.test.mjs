/**
 * server-write-failure-ledger.test.mjs — gate for FAILED SERVER WRITE COUNT in the
 * support passport.
 *
 *   node --test --test-concurrency=1 server-write-failure-ledger.test.mjs
 *
 * What must hold, and why each cell exists:
 *  - a failed write is counted, and the count reaches the PASSPORT, not just a
 *    console line (the whole point: silent classes announce themselves in tickets);
 *  - it survives the page boundary between the chart realm and the dashboard realm,
 *    because that is where tickets are actually filed;
 *  - it climbs self → parent → top, because failures happen in panel iframes (B-0185);
 *  - the kill-switch is truthy, per call, and climbing;
 *  - the record is bounded: paths only, no query strings, capped endpoints, capped
 *    count, and dropped when stale;
 *  - a success clears it, so a transient 5xx does not follow a user around;
 *  - preferences-sync actually calls it — a ledger nobody calls counts nothing.
 *
 * Mutants at the end prove the cells are load-bearing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(HERE, 'server-write-failure-ledger.js');
const PREFS_PATH = path.join(HERE, 'preferences-sync.js');
const PASSPORT_PATH = path.resolve(
    HERE, '..', '..', '..', 'homepage', 'src', 'app', 'dashboard', 'support', 'supportUi.tsx'
);
const LEDGER_SOURCE = fs.readFileSync(LEDGER_PATH, 'utf8');
const PREFS_SOURCE = fs.readFileSync(PREFS_PATH, 'utf8');
const PASSPORT_SOURCE = fs.readFileSync(PASSPORT_PATH, 'utf8');

const SWITCH = '__TALARIA_DISABLE_SERVER_WRITE_FAILURE_LEDGER_V1';
const STORAGE_KEY = 'talaria_failed_server_writes';

/** A localStorage that behaves like the real one: string values, null for absent. */
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
 * Load the ledger into a realm. `parent`/`top` model the multichart panel case:
 * a panel window whose parent is the host.
 */
function loadLedger({ source = LEDGER_SOURCE, storage = makeStorage(), parent, top, now } = {}) {
    const win = { localStorage: storage };
    win.window = win;
    win.parent = parent ?? win;
    win.top = top ?? win.parent;
    if (now) win.Date = { now };
    const context = vm.createContext(win);
    // The module closes over `window` when present, else globalThis.
    vm.runInContext(`var window = this; var module = undefined;\n${source}`, context);
    return win;
}

/**
 * Execute the real buildSupportContext from supportUi.tsx against a modelled
 * window. TSX stripped to JS the same way the other passport gate does it: the
 * function body is plain JS apart from type annotations.
 */
function loadPassport({ source = PASSPORT_SOURCE, window: win } = {}) {
    const start = source.indexOf('export function buildSupportContext');
    assert.ok(start > 0, 'supportUi.tsx must still export buildSupportContext');
    const deepFreezeStart = source.indexOf('function deepFreeze');
    let body = source.slice(deepFreezeStart);
    body = body.slice(0, body.indexOf('export const SUPPORT_FILE_ACCEPT'));
    const js = body
        .replace(/export function/g, 'function')
        .replace(/<T>/g, '')
        .replace(/: Record<string, string \| string\[\]>/g, '')
        .replace(/: Record<string, unknown>/g, '')
        .replace(/seen = new WeakSet<object>\(\)/g, 'seen = new WeakSet()')
        .replace(/value as object/g, 'value')
        .replace(/value as Record<string, unknown>/g, 'value')
        .replace(/\(value\): value is string =>/g, '(value) =>')
        .replace(/: T\b/g, '')
        .replace(/\bas T\b/g, '');
    const context = vm.createContext({ window: win, navigator: win.navigator, console });
    vm.runInContext(`${js}\nthis.__buildSupportContext = buildSupportContext;`, context);
    return context.__buildSupportContext;
}

function passportWindow({ storage, state, href = 'https://app.talaria.test/dashboard/support' }) {
    const win = {
        location: { href },
        navigator: { userAgent: 'gate/1.0' },
        localStorage: storage
    };
    if (state) win.__TALARIA_WRITE_FAILURE_STATE = state;
    return win;
}

test('a failed write is counted and published', () => {
    const win = loadLedger();
    const rec = win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 1);
    assert.deepEqual(Array.from(rec.endpoints), ['/api/chart/preferences']);
    assert.equal(rec.lastStatus, 500);
    assert.equal(win.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 1);
});

test('repeated failures accumulate; the endpoint is not duplicated', () => {
    const win = loadLedger();
    for (let i = 0; i < 5; i++) win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    const rec = win.__talariaReadServerWriteFailures();
    assert.equal(rec.failedServerWrites, 5);
    assert.deepEqual(Array.from(rec.endpoints), ['/api/chart/preferences']);
});

test('THE POINT: the count reaches the support passport', () => {
    const storage = makeStorage();
    const chartRealm = loadLedger({ storage });
    chartRealm.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    chartRealm.__talariaNoteServerWriteFailure('/api/chart/drawings/EURUSD', 502);

    const build = loadPassport({ window: passportWindow({ storage }) });
    const ctx = build();
    assert.equal(ctx.failedServerWrites, '2');
    assert.deepEqual(Array.from(ctx.failedServerWriteEndpoints), ['/api/chart/preferences', '/api/chart/drawings/EURUSD']);
    assert.equal(ctx.failedServerWriteLastStatus, '502');
    // The existing cell must not regress.
    assert.deepEqual(Array.from(ctx.degradedModules), []);
});

test('a healthy session reports a real zero, not undefined', () => {
    const build = loadPassport({ window: passportWindow({ storage: makeStorage() }) });
    const ctx = build();
    assert.equal(ctx.failedServerWrites, '0');
    assert.deepEqual(Array.from(ctx.failedServerWriteEndpoints), []);
    assert.equal('failedServerWriteLastStatus' in ctx, false);
});

test('it crosses the page boundary: chart realm writes, dashboard realm reads', () => {
    // Same browser, same origin, different page: only storage survives.
    const storage = makeStorage();
    const chart = loadLedger({ storage });
    chart.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);

    // Dashboard page: nothing published on this window at all.
    const dash = passportWindow({ storage });
    assert.equal(dash.__TALARIA_WRITE_FAILURE_STATE, undefined);
    const ctx = loadPassport({ window: dash })();
    assert.equal(ctx.failedServerWrites, '1');
});

test('the passport reads storage only — never the window publication', () => {
    // Deliberate: C's passport-realm gate models the surfaces buildSupportContext
    // may read, and a new window global would be an unmodelled read there. Storage
    // is the channel that crosses pages anyway, so the passport uses only that. If
    // this ever regresses to reading the global, the passport gate goes RED with
    // "unknownReads: window.__TALARIA_WRITE_FAILURE_STATE".
    assert.doesNotMatch(PASSPORT_SOURCE, /window\.__TALARIA_WRITE_FAILURE_STATE/);
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ failedServerWrites: 1, endpoints: [] }) });
    const ctx = loadPassport({
        window: passportWindow({ storage, state: { failedServerWrites: 7, endpoints: ['/api/x'], lastStatus: 500 } })
    })();
    assert.equal(ctx.failedServerWrites, '1', 'storage is the source of truth for the ticket');
});

test('realm climb: a panel failure is visible on the host window (B-0185)', () => {
    const host = { __name: 'host' };
    host.window = host;
    host.parent = host;
    host.top = host;
    const panel = loadLedger({ parent: host, top: host });
    panel.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(panel.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 1);
    assert.equal(host.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 1,
        'host realm must see the panel realm failure');
});

test('a cross-origin realm that throws on access does not break counting', () => {
    const hostile = new Proxy({}, {
        get() { throw new Error('cross-origin'); },
        set() { throw new Error('cross-origin'); }
    });
    const panel = loadLedger({ parent: hostile, top: hostile });
    const rec = panel.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 1);
});

test('kill-switch on this realm suppresses counting', () => {
    const win = loadLedger();
    win[SWITCH] = true;
    const rec = win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 0);
});

test('kill-switch climbs: flipping it on the host suppresses counting in the panel', () => {
    const host = {};
    host.window = host;
    host.parent = host;
    host.top = host;
    host[SWITCH] = true;
    const panel = loadLedger({ parent: host, top: host });
    const rec = panel.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 0,
        'a host-side flip must reach the panel realm, or the switch is a lie');
});

test('kill-switch is truthiness and per call, not === true and not cached', () => {
    const win = loadLedger();
    win[SWITCH] = 1;
    assert.equal(win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500).failedServerWrites, 0);
    win[SWITCH] = 'yes';
    assert.equal(win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500).failedServerWrites, 0);
    delete win[SWITCH];
    assert.equal(win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500).failedServerWrites, 1,
        'clearing the flag mid-session must restore counting without a reload');
});

test('bounded: query strings and hosts are stripped, junk paths dropped', () => {
    const win = loadLedger();
    win.__talariaNoteServerWriteFailure('https://app.talaria.io/api/chart/preferences?user=7&t=1', 500);
    win.__talariaNoteServerWriteFailure('/api/chart/settings#frag', 500);
    win.__talariaNoteServerWriteFailure('/api/<script>alert(1)</script>', 500);
    const rec = win.__talariaReadServerWriteFailures();
    assert.deepEqual(Array.from(rec.endpoints), ['/api/chart/preferences', '/api/chart/settings']);
    assert.equal(rec.failedServerWrites, 3, 'a junk path still counts as a failure');
});

test('bounded: endpoint list caps at MAX_ENDPOINTS', () => {
    const win = loadLedger();
    const cap = win.__TALARIA_WRITE_FAILURE_LEDGER.MAX_ENDPOINTS;
    for (let i = 0; i < cap + 5; i++) win.__talariaNoteServerWriteFailure(`/api/e${i}`, 500);
    const rec = win.__talariaReadServerWriteFailures();
    assert.equal(rec.endpoints.length, cap);
    assert.equal(rec.failedServerWrites, cap + 5);
});

test('the passport caps and sanitises independently of the ledger', () => {
    // A tampered storage record must not widen the passport.
    const evil = {
        failedServerWrites: 1e9,
        endpoints: Array.from({ length: 40 }, (_, i) => `/api/e${i}`).concat(['<script>', 'a b c']),
        lastStatus: 99999
    };
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify(evil) });
    const ctx = loadPassport({ window: passportWindow({ storage }) })();
    assert.equal(ctx.failedServerWrites, '9999');
    assert.equal(ctx.failedServerWriteEndpoints.length, 8);
    assert.equal(ctx.failedServerWriteEndpoints.every((e) => /^[A-Za-z0-9/_.:-]{1,120}$/.test(e)), true);
    assert.equal('failedServerWriteLastStatus' in ctx, false);
});

test('the passport context stays deep-frozen with the new keys', () => {
    const storage = makeStorage();
    const chart = loadLedger({ storage });
    chart.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    const ctx = loadPassport({ window: passportWindow({ storage }) })();
    assert.equal(Object.isFrozen(ctx), true);
    assert.equal(Object.isFrozen(ctx.failedServerWriteEndpoints), true);
});

test('a stale record is dropped rather than haunting next week', () => {
    const ledgerNow = 1_800_000_000_000;
    const storage = makeStorage({
        [STORAGE_KEY]: JSON.stringify({
            failedServerWrites: 4,
            endpoints: ['/api/chart/preferences'],
            firstAt: ledgerNow - 40 * 60 * 60 * 1000,
            lastAt: ledgerNow - 30 * 60 * 60 * 1000,
            lastStatus: 500
        })
    });
    const win = loadLedger({ storage, now: () => ledgerNow });
    const rec = win.__talariaReadServerWriteFailures();
    assert.equal(rec.failedServerWrites, 0);
    assert.equal(storage.getItem(STORAGE_KEY), null, 'the stale record is removed, not just ignored');
});

test('a success clears the ledger', () => {
    const win = loadLedger();
    win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    win.__talariaNoteServerWriteSuccess();
    assert.equal(win.__talariaReadServerWriteFailures().failedServerWrites, 0);
    assert.equal(win.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 0);
});

test('storage being unavailable does not throw', () => {
    const hostile = {
        getItem() { throw new Error('disabled'); },
        setItem() { throw new Error('disabled'); },
        removeItem() { throw new Error('disabled'); }
    };
    const win = loadLedger({ storage: hostile });
    const rec = win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 1, 'in-memory publication still works');
});

test('WIRING: preferences-sync calls the ledger on failure and clears it on success', () => {
    assert.match(PREFS_SOURCE, /_noteServerWriteFailure\(detail\)/);
    assert.match(PREFS_SOURCE, /__talariaNoteServerWriteFailure\(/);
    assert.match(PREFS_SOURCE, /__talariaNoteServerWriteSuccess\(\)/);
    // and it is reached from the real failure/success handlers, not defined in a corner
    const failureBody = PREFS_SOURCE.slice(
        PREFS_SOURCE.indexOf('_noteCloudFailure(detail)'),
        PREFS_SOURCE.indexOf('_noteCloudSuccess()')
    );
    assert.match(failureBody, /this\._noteServerWriteFailure\(detail\)/);
});

test('WIRING: the ledger is loaded by the served shells before preferences-sync', () => {
    // `dist-v9/index.html` is a BUILD ARTIFACT: the homepage image regenerates it
    // from `talaria-design/live/index.html` via vite, then rewrites the `?v=` stamps.
    // This cell originally listed only the artifact, so it passed while the served
    // shell had no ledger tag at all and the counter loaded in panel realms only —
    // a gate green against a file the wire does not use. The vite source is listed
    // first because it is the one that decides what ships.
    const shells = [
        path.resolve(HERE, '..', '..', 'talaria-design', 'live', 'index.html'),
        path.resolve(HERE, '..', 'dist-v9', 'index.html'),
        path.resolve(HERE, '..', 'multichart-prod', 'chart-embed.html')
    ];
    for (const shell of shells) {
        const html = fs.readFileSync(shell, 'utf8');
        const ledgerAt = html.indexOf('server-write-failure-ledger.js');
        const prefsAt = html.indexOf('preferences-sync.js');
        assert.ok(ledgerAt > 0, `${path.basename(shell)} must load the ledger`);
        assert.ok(prefsAt > 0, `${path.basename(shell)} must load preferences-sync`);
        assert.ok(ledgerAt < prefsAt,
            `${path.basename(shell)} must load the ledger BEFORE preferences-sync`);
    }
});

/* ── Mutants: each must kill at least one cell above ─────────────────────── */

test('MUTANT publisher-removed: the passport stops seeing failures', () => {
    const mutated = LEDGER_SOURCE.replace(
        'writeStored(record);\n        publish(record);',
        '/* mutant: nothing published, nothing stored */'
    );
    assert.notEqual(mutated, LEDGER_SOURCE, 'mutant must actually change the source');
    const storage = makeStorage();
    const chart = loadLedger({ source: mutated, storage });
    chart.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    const ctx = loadPassport({ window: passportWindow({ storage }) })();
    assert.equal(ctx.failedServerWrites, '0', 'mutant is caught: the count never reaches the ticket');
});

test('MUTANT host-only-switch: a host-side flip stops reaching the panel', () => {
    const mutated = LEDGER_SOURCE.replace(
        /function flagTruthy\(flagName\) \{[\s\S]*?\n    \}/,
        `function flagTruthy(flagName) {
        try { return !!global[flagName]; } catch (_) { return false; }
    }`
    );
    assert.notEqual(mutated, LEDGER_SOURCE);
    const host = {};
    host.window = host;
    host.parent = host;
    host.top = host;
    host[SWITCH] = true;
    const panel = loadLedger({ source: mutated, parent: host, top: host });
    const rec = panel.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(rec.failedServerWrites, 1,
        'mutant is caught: host-only switch leaves the panel counting');
});

test('RESIDUAL, named: with storage unavailable the ticket cannot carry the count', () => {
    // The cost of reading only storage. In-realm consumers still see the window
    // publication; the passport does not. Recorded so it is a known limit rather
    // than a surprise in a ticket.
    const hostile = {
        getItem() { throw new Error('disabled'); },
        setItem() { throw new Error('disabled'); },
        removeItem() { throw new Error('disabled'); }
    };
    const chart = loadLedger({ storage: hostile });
    chart.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(chart.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 1);
    const ctx = loadPassport({ window: passportWindow({ storage: hostile }) })();
    assert.equal(ctx.failedServerWrites, '0');
});

test('MUTANT no-storage-mirror: the dashboard realm loses the count', () => {
    const mutated = LEDGER_SOURCE.replace(
        'store.setItem(STORAGE_KEY, JSON.stringify(record));',
        '/* mutant: no cross-page mirror */'
    );
    assert.notEqual(mutated, LEDGER_SOURCE);
    const storage = makeStorage();
    const chart = loadLedger({ source: mutated, storage });
    chart.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    assert.equal(chart.__TALARIA_WRITE_FAILURE_STATE.failedServerWrites, 1, 'same-page still works');
    const ctx = loadPassport({ window: passportWindow({ storage }) })();
    assert.equal(ctx.failedServerWrites, '0', 'mutant is caught: the ticket realm sees nothing');
});

test('MUTANT unbounded-passport: tampered storage would widen the ticket', () => {
    const mutated = PASSPORT_SOURCE.replace(
        '.slice(0, 8)',
        '/* mutant: no cap */'
    );
    assert.notEqual(mutated, PASSPORT_SOURCE);
    const evil = { failedServerWrites: 3, endpoints: Array.from({ length: 40 }, (_, i) => `/api/e${i}`) };
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify(evil) });
    const ctx = loadPassport({ source: mutated, window: passportWindow({ storage }) })();
    assert.equal(ctx.failedServerWriteEndpoints.length, 40, 'mutant is caught by the cap cell');
});

test('MUTANT never-cleared: a transient 5xx would follow the user forever', () => {
    const mutated = LEDGER_SOURCE.replace(
        'global.__talariaNoteServerWriteSuccess = clear;',
        'global.__talariaNoteServerWriteSuccess = function () { return readStored(); };'
    );
    assert.notEqual(mutated, LEDGER_SOURCE);
    const win = loadLedger({ source: mutated });
    win.__talariaNoteServerWriteFailure('/api/chart/preferences', 500);
    win.__talariaNoteServerWriteSuccess();
    assert.equal(win.__talariaReadServerWriteFailures().failedServerWrites, 1,
        'mutant is caught by the clear-on-success cell');
});
