/**
 * B-W16 GUARD-01 acceptance — durable journal write is suppressed when the
 * in-memory journal's provenance is not vouched for.
 *
 *   node "chart v 1.4/chart/modules/b-w16-hydration-guard.test.mjs"
 *
 * BW16_TARGET overrides the order-manager.js under test (mutation / VER-04 runs).
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  if (!cond) process.stdout.write(`FAIL ${name}${detail ? ` — ${detail}` : ''}\n`);
  else process.stdout.write(`PASS ${name}\n`);
}

// ── Minimal DOM/window so order-manager.js can be required under node ──────────
const el = () => ({
  style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; }, cssText: '' },
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  appendChild(c) { return c; }, removeChild(c) { return c; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  setAttribute() {}, getAttribute() { return null; }, remove() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  innerHTML: '', textContent: '', value: '', dataset: {}, children: [],
});
global.performance = performance;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
global.cancelAnimationFrame = () => {};
global.window = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  location: { href: 'http://local.test/chart?sessionId=b-w16', search: '?sessionId=b-w16' },
  parent: null, chart: null, postMessage() {},
  navigator: { userAgent: 'node' },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
global.document = {
  getElementById: () => el(), createElement: () => el(),
  body: el(), documentElement: el(),
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
};
global.window.document = global.document;
global.userStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.HTMLElement = class {};
global.Node = class {};
global.CustomEvent = class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
global.fetch = async () => ({ ok: true, json: async () => ({}) });

const TARGET = process.env.BW16_TARGET
  ? path.resolve(process.env.BW16_TARGET)
  : path.join(__dirname, 'order-manager.js');
const OrderManager = require(TARGET);
process.stdout.write(`# target: ${TARGET}\n`);

// ── Cell 2 support: a genuinely fresh instance from the real constructor. ─────
// init() is the DOM-bound UI bootstrap (order panel etc.) and cannot run under
// node; everything above it — including instance-field initialisation — is real.
function freshInstance() {
  const realInit = OrderManager.prototype.init;
  OrderManager.prototype.init = function () {};
  try {
    return new OrderManager({ getActiveTradingSessionId: () => 'session-A' }, { isActive: false });
  } finally {
    OrderManager.prototype.init = realInit;
  }
}

// Provenance-related constructor defaults, so the lightweight stubs below model a
// real fresh instance instead of hardcoding an assumed default.
const CTOR_DEFAULTS = (() => {
  const fresh = freshInstance();
  return {
    _journalProvenance: fresh._journalProvenance,
    _journalProvenanceSession: fresh._journalProvenanceSession,
  };
})();

const proto = (n) => OrderManager.prototype[n];

/**
 * Stub OrderManager exercising the REAL persistJournal + REAL _m19CommitJournalArray.
 * `server.rows` models the backend's B-era replace semantics: a durable queue
 * REPLACES the server journal wholesale (this is what destroys trades).
 */
function makeOm(opts = {}) {
  const om = Object.create(OrderManager.prototype);
  const server = { rows: (opts.serverRows || []).slice() };
  const calls = { hot: [], durable: [] };
  const warns = [];
  const chart = {
    _sessionId: 'sessionId' in opts ? opts.sessionId : 'session-A',
    getActiveTradingSessionId() { return this._sessionId; },
    scheduleSessionStateSave(patch) { calls.hot.push(patch); },
    queueCriticalSessionStateSave(patch) {
      calls.durable.push(patch);
      server.rows = Array.isArray(patch.journal) ? patch.journal.slice() : []; // replace
    },
  };
  Object.assign(om, {
    ...CTOR_DEFAULTS,
    chart: opts.noChart ? null : chart,
    tradeJournal: 'tradeJournal' in opts ? opts.tradeJournal : [],
    _m19JournalStructuralEpoch: 0,
    _m19JournalLenSeen: 0,
    // real code under test
    persistJournal: proto('persistJournal'),
    _m19CommitJournalArray: proto('_m19CommitJournalArray'),
    _m19NoteJournalStructuralMutation: proto('_m19NoteJournalStructuralMutation'),
    // out-of-scope collaborators
    _invalidateM19MarkerDeltaCache() {},
    _m20A1ScheduleRetainedSweep() {},
    buildPerInstrumentStats: () => ({}),
    groupJournalByTicker: () => ({}),
    _m19PersistTrimV1Enabled: () => false,
    _m19CloneJournalForHotSessionPersist() {
      return Array.isArray(this.tradeJournal) ? this.tradeJournal.slice() : [];
    },
    _m20A1RowsHaveScreenshotRefs: () => opts.rowsHaveRefs === true,
    _m20A1ScreenshotIdbV1Enabled: () => opts.a1Enabled === true,
    _m20A1KillSwitchOn: () => false,
    _m20A1OwnerKey: () => 'owner-1',
    _m20A1GroupRowsByTicker: () => ({}),
    _m20A1RehydrateRowsForDurablePersist: async (rows) => rows,
    _m20A1ScheduleKillTransition() {},
  });
  om.__server = server;
  om.__calls = calls;
  om.__warns = warns;
  return om;
}

async function persist(om) {
  const realWarn = console.warn;
  console.warn = (...a) => { om.__warns.push(a.map(String).join(' ')); };
  try {
    return await om.persistJournal();
  } finally {
    console.warn = realWarn;
  }
}

const suppressed = (r) => !!r && r.durableQueued === false && r.reason === 'journal-unhydrated';
const loud = (om) => om.__warns.some((w) => /suppress/i.test(w));

const trade = (id) => ({ tradeId: id, ticker: 'EURUSD', symbol: 'EURUSD', closePrice: 1.1 });

// ── Cell 1 — THE DEFECT CELL ──────────────────────────────────────────────────
// GET /state failed → chart.js took the local-backup branch → one trade closed →
// durable write must be suppressed and the pre-existing server rows must survive.
{
  const om = makeOm({ serverRows: [trade('srv-1'), trade('srv-2'), trade('srv-3')] });
  om._m19CommitJournalArray([], 'local-backup-hydrate'); // failed-fetch hydrate
  om.tradeJournal.push(trade('new-1')); // user closes one trade
  const res = await persist(om);
  check('cell1-defect-durable-suppressed', suppressed(res), JSON.stringify(res));
  check('cell1-defect-no-durable-queue', om.__calls.durable.length === 0,
    `durable calls=${om.__calls.durable.length}`);
  check('cell1-defect-server-rows-intact', om.__server.rows.length === 3,
    `server rows=${JSON.stringify(om.__server.rows.map((r) => r.tradeId))}`);
  check('cell1-defect-logged-loudly', loud(om), JSON.stringify(om.__warns));
}

// ── Cell 2 — default provenance on a fresh instance ───────────────────────────
{
  const fresh = freshInstance();
  check('cell2-default-is-unhydrated', fresh._journalProvenance === 'unhydrated',
    `got ${JSON.stringify(fresh._journalProvenance)}`);
}

// ── Cell 3 — successful hydrate then a close → durable write proceeds ─────────
{
  const om = makeOm({ serverRows: [trade('srv-1')] });
  om._m19CommitJournalArray([trade('srv-1')], 'session-state-hydrate');
  om.tradeJournal.push(trade('new-1'));
  const res = await persist(om);
  check('cell3-hydrated-durable-proceeds', !!res && res.durableQueued === true, JSON.stringify(res));
  check('cell3-hydrated-queue-called', om.__calls.durable.length === 1);
  check('cell3-hydrated-server-updated', om.__server.rows.length === 2);
}

// ── Cell 4 — legitimate clear: successful hydrate returning EMPTY ─────────────
// The cell a `length > 0` guard fails.
{
  const om = makeOm({ serverRows: [trade('srv-1'), trade('srv-2')] });
  om._m19CommitJournalArray([], 'session-state-hydrate'); // server says: no trades
  const res = await persist(om);
  check('cell4-legit-clear-proceeds', !!res && res.durableQueued === true, JSON.stringify(res));
  check('cell4-legit-clear-reaches-server', om.__server.rows.length === 0,
    `server rows=${om.__server.rows.length}`);
}

// ── Cell 5 — failed hydrate, then a later successful hydrate → resumes ────────
{
  const om = makeOm({ serverRows: [trade('srv-1')] });
  om._m19CommitJournalArray([], 'local-backup-hydrate');
  om.tradeJournal.push(trade('new-1'));
  const before = await persist(om);
  check('cell5-before-suppressed', suppressed(before), JSON.stringify(before));
  om._m19CommitJournalArray([trade('srv-1'), trade('new-1')], 'session-state-hydrate');
  const after = await persist(om);
  check('cell5-after-resumes', !!after && after.durableQueued === true, JSON.stringify(after));
}

// ── Cell 6 — hot autosave unaffected in every case, including while suppressed ─
{
  const supp = makeOm();
  supp._m19CommitJournalArray([], 'local-backup-hydrate');
  supp.tradeJournal.push(trade('new-1'));
  await persist(supp);
  check('cell6-hot-runs-while-suppressed', supp.__calls.hot.length === 1,
    `hot calls=${supp.__calls.hot.length}`);
  check('cell6-hot-carries-journal-while-suppressed',
    Array.isArray(supp.__calls.hot[0]?.journal) && supp.__calls.hot[0].journal.length === 1);

  const ok = makeOm();
  ok._m19CommitJournalArray([], 'session-state-hydrate');
  ok.tradeJournal.push(trade('new-1'));
  await persist(ok);
  check('cell6-hot-runs-when-allowed', ok.__calls.hot.length === 1);

  const a1 = makeOm({ rowsHaveRefs: true, a1Enabled: true });
  a1._m19CommitJournalArray([], 'local-backup-hydrate');
  a1.tradeJournal.push(trade('new-1'));
  await persist(a1);
  check('cell6-hot-runs-on-a1-exit', a1.__calls.hot.length === 1);
}

// ── Cell 7 — absence class: must not throw ────────────────────────────────────
{
  const cases = [
    ['tradeJournal-null', () => makeOm({ tradeJournal: null })],
    ['tradeJournal-undefined', () => makeOm({ tradeJournal: undefined })],
    ['provenance-unset', () => { const o = makeOm(); delete o._journalProvenance; delete o._journalProvenanceSession; return o; }],
    ['chart-absent', () => makeOm({ noChart: true })],
    ['session-id-absent', () => makeOm({ sessionId: null })],
  ];
  for (const [name, build] of cases) {
    let threw = null;
    let res = null;
    try {
      res = await persist(build());
    } catch (e) {
      threw = e;
    }
        check(`cell7-no-throw-${name}`, threw === null, threw && threw.message);
        check(`cell7-returns-result-${name}`, res && typeof res === 'object' && 'durableQueued' in res,
            JSON.stringify(res));
    }
}

// ── Cell 7b — unknown provenance must FAIL CLOSED, not merely not-throw ───────
// `undefined` / an unrecognised value is maximally "we do not know"; a deny-list
// guard (=== 'unhydrated') lets it through and writes durably.
{
    for (const [name, value] of [['undefined', undefined], ['unrecognised', 'restored-from-cache']]) {
        const om = makeOm({ serverRows: [trade('srv-1'), trade('srv-2')] });
        if (value === undefined) delete om._journalProvenance;
        else om._journalProvenance = value;
        om.tradeJournal = [trade('new-1')];
        const res = await persist(om);
        check(`cell7b-unknown-provenance-suppressed-${name}`, suppressed(res), JSON.stringify(res));
        check(`cell7b-unknown-provenance-server-intact-${name}`, om.__server.rows.length === 2,
            `server rows=${om.__server.rows.length}`);
    }
}

// ── Cell 8 — session-switch bypass (0b: the OrderManager instance is reused) ───
{
  const om = makeOm({ sessionId: 'session-A', serverRows: [trade('b-srv-1'), trade('b-srv-2')] });
  om._m19CommitJournalArray([trade('a-1')], 'session-state-hydrate'); // A hydrates fine
  om.chart._sessionId = 'session-B';                                  // switch, B never hydrates
  om.tradeJournal.push(trade('b-new-1'));
  const res = await persist(om);
  check('cell8-cross-session-suppressed', suppressed(res), JSON.stringify(res));
  const ids8 = om.__server.rows.map((r) => r.tradeId).join(',');
  check('cell8-cross-session-server-intact', ids8 === 'b-srv-1,b-srv-2', `server rows=${ids8}`);
}

// ── Cell 9 — both durable exits covered (A1 rehydrate exit, not just legacy) ───
{
  const om = makeOm({ rowsHaveRefs: true, a1Enabled: true, serverRows: [trade('srv-1'), trade('srv-2')] });
  om._m19CommitJournalArray([], 'local-backup-hydrate');
  om.tradeJournal.push(trade('new-1'));
  const res = await persist(om);
  check('cell9-a1-exit-suppressed', suppressed(res), JSON.stringify(res));
  check('cell9-a1-exit-no-durable-queue', om.__calls.durable.length === 0,
    `durable calls=${om.__calls.durable.length}`);
  check('cell9-a1-exit-server-intact', om.__server.rows.length === 2);
}

// ── summary ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
process.stdout.write(`\nB-W16: ${results.length - failed.length}/${results.length} assertions passed\n`);
if (failed.length) {
  process.stdout.write(`FAILED: ${failed.map((f) => f.name).join(', ')}\n`);
}
process.exit(failed.length ? 1 : 0);
