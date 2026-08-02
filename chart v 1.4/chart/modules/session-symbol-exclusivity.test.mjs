/**
 * SESSION-SYMBOL-EXCLUSIVITY — a pair cannot be both traded and supporting (Rayan #8).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/session-symbol-exclusivity.test.mjs"
 *
 * PO b122 test pass: at session creation the same pair could be selected as
 * both a trading symbol and a supporting symbol. The two sets must be mutually
 * exclusive.
 *
 * This is not cosmetic. buildChartConfig merges instruments as
 * `{ ...tradableInstruments, ...supportInstruments }`, so supporting is spread
 * last and an overlapping pair is rewritten to view_only:true / tradable:false.
 * The user selects a pair to trade and silently ends up unable to trade it.
 * That is why the resolution is "trading wins" rather than "last write wins".
 *
 * Three layers, each covered here:
 *   1. the two pickers refuse to create an overlap, visibly;
 *   2. buildChartConfig strips any overlap that arrives another way;
 *   3. the server rejects an overlapping config, ahead of the entitlement
 *      bypass, because exclusivity is a correctness invariant and not a cap.
 *
 * The product expressions are lifted and executed rather than pattern-matched.
 * The Python helpers are exec'd in a bare interpreter without importing the
 * app, since the repo's pytest suite does not load in this environment
 * (conftest imports _analytics_bootstrap, which is absent).
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cursor, 'chart v 1.4', 'chart', 'api_server.py'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const MODAL = path.join(ROOT, 'homepage', 'src', 'app', 'dashboard', 'BacktestNewSessionModal.tsx');
const API = path.join(ROOT, 'chart v 1.4', 'chart', 'api_server.py');
const MODAL_SRC = fs.readFileSync(MODAL, 'utf8');
const API_SRC = fs.readFileSync(API, 'utf8');

/**
 * BIND-01: separate "the fix is not here" from "the fix is here but I can no
 * longer find it". Collapsing them sends a reader hunting for a defect that
 * does not exist. `presence` is a cheap probe for the fix existing at all.
 */
function extract(src, re, what, presence = null) {
  const m = src.match(re);
  if (!m) {
    const isPresent = presence ? presence.test(src) : true;
    throw new Error(isPresent
      ? `ANCHOR_BROKEN: ${what} exists but no longer matches the expected shape. The suite is `
        + 'blind here — re-anchor it. This is NOT a statement about product behaviour.'
      : `RESOLVER_ABSENT_FROM_TREE: ${what} is not present in this tree. The fix is not here; `
        + 'this is not a behaviour verdict and not a broken anchor.');
  }
  return m;
}

// ---------------------------------------------------------------------------
// Layer 1 — the pickers, executed.
// ---------------------------------------------------------------------------

function runPicker(expr, { sym, trading, supporting, checked = false }) {
  const sandbox = { Set, String };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox.newSessTickers = trading;
  sandbox.newSessSupportTickers = supporting;
  sandbox.s = { sym };
  sandbox.isChk = checked;
  return vm.runInContext(`(function(){ ${expr} })()`, sandbox);
}

const TRADING_BLOCK = extract(
  MODAL_SRC,
  /const takenBySupport=new Set\(newSessSupportTickers\);[\s\S]*?const isBlocked=([^;]+);/,
  'the trading picker exclusion', /takenBySupport/,
);
const SUPPORT_BLOCK = extract(
  MODAL_SRC,
  /const takenByTrading=new Set\(newSessTickers\);[\s\S]*?const isBlocked=([^;]+);/,
  'the supporting picker exclusion', /takenByTrading/,
);

const TRADING_EXPR = 'const takenBySupport=new Set(newSessSupportTickers); return ' + TRADING_BLOCK[1] + ';';
const SUPPORT_EXPR = 'const takenByTrading=new Set(newSessTickers); return ' + SUPPORT_BLOCK[1] + ';';

test('trading picker blocks a pair already chosen as supporting', () => {
  assert.equal(runPicker(TRADING_EXPR, { sym: 'EURUSD', trading: [], supporting: ['EURUSD'] }), true);
});

test('supporting picker blocks a pair already chosen as trading', () => {
  assert.equal(runPicker(SUPPORT_EXPR, { sym: 'EURUSD', trading: ['EURUSD'], supporting: [] }), true);
});

test('anti-vacuity: a pair in neither set is selectable in both pickers', () => {
  assert.equal(runPicker(TRADING_EXPR, { sym: 'GBPJPY', trading: [], supporting: ['EURUSD'] }), false,
    'if every row were blocked the cells above would prove nothing');
  assert.equal(runPicker(SUPPORT_EXPR, { sym: 'GBPJPY', trading: ['EURUSD'], supporting: [] }), false);
});

test('an already-selected row stays deselectable rather than becoming blocked', () => {
  // Without the !isChk term a user could never remove a pair from its own set.
  assert.equal(runPicker(TRADING_EXPR, { sym: 'EURUSD', trading: ['EURUSD'], supporting: ['EURUSD'], checked: true }), false);
  assert.equal(runPicker(SUPPORT_EXPR, { sym: 'EURUSD', trading: ['EURUSD'], supporting: ['EURUSD'], checked: true }), false);
});

test('MUTANT: neutralising the cross-set lookup unblocks the overlap', () => {
  const ANCHOR = 'takenBySupport.has(s.sym)';
  assert.ok(TRADING_BLOCK[1].includes(ANCHOR),
    `MUTANT ANCHOR BROKEN: "${ANCHOR}" absent, so the mutant did not apply and this cell proved nothing.`);
  const mutant = 'const takenBySupport=new Set(newSessSupportTickers); return ' + TRADING_BLOCK[1].replace(ANCHOR, 'false') + ';';
  assert.equal(runPicker(mutant, { sym: 'EURUSD', trading: [], supporting: ['EURUSD'] }), false,
    'the pre-fix expression must allow the overlap — if it still blocks, the cells above '
    + 'are not discriminating and this row is not covered');
});

test('BINDING: both onClick handlers actually refuse the blocked row', () => {
  const guards = MODAL_SRC.match(/onClick=\{\(\)=>\{if\(isBlocked\)return;/g) || [];
  assert.equal(guards.length, 2,
    'BINDING GAP (not a behaviour failure): a picker computes isBlocked but still acts on the '
    + 'click, so the dimming would be decoration over a working overlap');
});

// ---------------------------------------------------------------------------
// Layer 2 — the submit-time backstop, executed.
// ---------------------------------------------------------------------------

const BACKSTOP = extract(
  MODAL_SRC,
  /const tradingSet = new Set\(([\s\S]*?)\);\s*\n\s*const supportTickers = newSessSupportTickers\.filter\(\s*([\s\S]*?)\s*\);/,
  'the buildChartConfig overlap backstop', /const supportTickers/,
);

function runBackstop(tickers, supporting) {
  const sandbox = { Set, String };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox.tickers = tickers;
  sandbox.newSessSupportTickers = supporting;
  return vm.runInContext(
    `(function(){ const tradingSet = new Set(${BACKSTOP[1]}); return newSessSupportTickers.filter(${BACKSTOP[2]}); })()`,
    sandbox,
  );
}

test('submit strips an overlap that reached it another way', () => {
  assert.deepEqual(runBackstop(['EURUSD', 'NQ'], ['EURUSD', 'XAUUSD']), ['XAUUSD']);
});

test('submit backstop is case-insensitive, matching the server', () => {
  assert.deepEqual(runBackstop(['EURUSD'], ['eurusd']), [],
    'a draft with different casing must not slip an overlap past the client');
});

test('anti-vacuity: a clean supporting list survives submit untouched', () => {
  assert.deepEqual(runBackstop(['NQ'], ['EURUSD', 'XAUUSD']), ['EURUSD', 'XAUUSD'],
    'if the backstop dropped everything the cells above would pass for the wrong reason');
});

test('BINDING: the stripped list is what actually ships, not just a local', () => {
  // Every downstream consumer must read supportTickers. If any still reads
  // newSessSupportTickers, the overlap survives in that field.
  const cfg = extract(MODAL_SRC, /async function buildChartConfig\(\)[\s\S]*?\n  \}/, 'buildChartConfig');
  const leaks = (cfg[0].match(/newSessSupportTickers/g) || []).length;
  assert.equal(leaks, 1,
    `BINDING GAP: buildChartConfig reads newSessSupportTickers ${leaks} times; exactly one `
    + '(the filter input) is expected. Any other read ships the unfiltered list.');
  assert.match(cfg[0], /supporting_tickers: supportTickers/);
  assert.match(cfg[0], /supportTickers\.length\s*\n?\s*\? await resolveInstrumentsForTickers\(supportTickers\)/);
  assert.match(cfg[0], /\.\.\.supportTickers\.map\(/);
});

// ---------------------------------------------------------------------------
// Layer 3 — the server invariant, executed in a bare interpreter.
// ---------------------------------------------------------------------------

function pyFunc(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = API_SRC.match(new RegExp(`^def ${escaped}\\([^]*?(?=^def |^class |^@)`, 'm'));
  if (!m) throw new Error(`RESOLVER_ABSENT_FROM_TREE: ${name} is not present in api_server.py.`);
  return m[0];
}

function runPython(cases) {
  const driver = pyFunc('_normalize_symbol_list') + '\n' + pyFunc('_session_config_ticker_overlap')
    + '\nimport json\n'
    + `print(json.dumps([_session_config_ticker_overlap(c) for c in json.loads(${JSON.stringify(JSON.stringify(cases))})]))\n`;
  // OS temp, not ROOT/.git: in a linked worktree .git is a file, not a directory,
  // and writing there fails with ENOENT that reads like a product failure.
  const file = path.join(os.tmpdir(), `rayan8-driver-${process.pid}-${Date.now()}.py`);
  fs.writeFileSync(file, driver, 'utf8');
  try {
    for (const exe of ['py', 'python3', 'python']) {
      try {
        return JSON.parse(execFileSync(exe, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
      } catch (e) {
        if (e && e.status !== undefined) throw e; // ran, but the product code failed
      }
    }
    // BIND-01: no interpreter is a tooling state, not a product verdict.
    throw new Error('TOOL_ABSENT: no Python interpreter on PATH, so the server invariant was '
      + 'NOT exercised. This cell proved nothing either way.');
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

test('server rejects a config where a pair is both traded and supporting', () => {
  const [overlap, clean, cased] = runPython([
    { tickers: ['EURUSD', 'NQ'], supporting_tickers: ['EURUSD'] },
    { tickers: ['NQ'], supporting_tickers: ['EURUSD'] },
    { tickers: ['EURUSD'], supporting_tickers: ['eurusd'] },
  ]);
  assert.deepEqual(overlap, ['EURUSD']);
  assert.deepEqual(clean, [], 'anti-vacuity: a clean config must report no overlap');
  assert.deepEqual(cased, ['EURUSD'], 'the server normalizes case before comparing');
});

test('BINDING: the overlap check runs ahead of the entitlement bypass', () => {
  const fn = extract(API_SRC, /\ndef _enforce_backtest_limits\([^]*?(?=\ndef )/, '_enforce_backtest_limits', /_session_config_ticker_overlap/);
  const body = fn[0];
  const raiseAt = body.indexOf('_session_config_ticker_overlap');
  const bypassAt = body.indexOf('_user_bypasses_backtest_limits');
  assert.ok(raiseAt !== -1,
    'BINDING GAP: the helper exists but nothing calls it, so no request is ever rejected');
  assert.ok(bypassAt !== -1, 'ANCHOR_BROKEN: the bypass is gone from this function');
  const callSites = (API_SRC.match(/_enforce_backtest_limits\(db, user/g) || []).length;
  assert.ok(callSites >= 2,
    `BINDING GAP: _enforce_backtest_limits is called from ${callSites} site(s); session create `
    + 'and session update must both route through it or one door stays open');
  assert.ok(raiseAt < bypassAt,
    'exclusivity is a correctness invariant rather than an entitlement cap, so it must be '
    + 'checked before the bypass returns — otherwise exempt users can still create the '
    + 'config that strips their own tradability');
});
