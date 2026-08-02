/**
 * SUPPORTING-SYMBOL-SURFACE — supporting pairs are identifiable, and Compare survives them.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/supporting-symbol-surface.test.mjs"
 *
 * PO b122 test pass, Rayan #8, two halves:
 *
 *   B) Supporting symbols must render gold in the symbol dropdown so they are
 *      unmistakable. The V9 shell had no concept of a supporting symbol at all
 *      — grepping the whole file for supporting_tickers / view_only / isSupporting
 *      returned nothing — so supporting pairs rendered identically to tradable
 *      ones. The fix tags them in refreshSessionPairs, carries the tag through
 *      v9BuildSessionSymbolEntry, and colours both dropdowns with the same gold
 *      the session creation picker already uses.
 *
 *   C) Compare stops working once a session has supporting symbols.
 *      getSessionSymbolFiles() *replaced* the session's files with the
 *      supporting tickers whenever any existed, and those rows carry a name but
 *      no id. getCompareSourceFiles() then matches each row against the real
 *      dataset list and keeps only what resolves — so if the supporting names
 *      did not match a dataset, the scoped list came back empty and the picker
 *      offered nothing, the session's own trading pairs included. An empty
 *      result was returned as-is, while the no-session case already fell back
 *      to the full list.
 *
 * Scope note: the gold half is a source-level contract here. It ships only when
 * dist-v9 is rebuilt, and rebuilding is currently unsafe — see the board entry
 * on build:chart-v9 stamping a stale build id and resurrecting the removed
 * public legacy shell.
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cursor, 'chart v 1.4', 'chart', 'modules', 'compare-overlay.js'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const OVERLAY = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'compare-overlay.js');
const OVERLAY_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'compare-overlay.js');
const SHELL = path.join(ROOT, 'chart v 1.4', 'talaria-design', 'src', 'TalariaV8bLive.jsx');
const OVERLAY_SRC = fs.readFileSync(OVERLAY, 'utf8');
const SHELL_SRC = fs.readFileSync(SHELL, 'utf8');

function extract(src, re, what, presence = null) {
  const m = src.match(re);
  if (!m) {
    const isPresent = presence ? presence.test(src) : true;
    throw new Error(isPresent
      ? `ANCHOR_BROKEN: ${what} exists but no longer matches the expected shape. The suite is `
        + 'blind here — re-anchor it. This is NOT a statement about product behaviour.'
      : `RESOLVER_ABSENT_FROM_TREE: ${what} is not present in this tree.`);
  }
  return m;
}

function overlayMethod(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return extract(
    OVERLAY_SRC,
    new RegExp(`^    ${escaped}\\s*\\([^]*?(?=^    [A-Za-z_$][\\w$]*\\s*\\(|^\\})`, 'm'),
    `${name} in compare-overlay.js`,
  )[0];
}

// ---------------------------------------------------------------------------
// C — the compare source list, executed against the real methods.
// ---------------------------------------------------------------------------

/** Results cross a vm realm boundary, so copy them back before strict comparison. */
function ids(o) {
  return Array.from(o.getCompareSourceFiles(), (f) => f.id);
}

function compareHarness({ session, availableFiles, mutate = null }) {
  const sandbox = { Array, String, Map, Set, JSON, Object };
  sandbox.globalThis = sandbox;
  sandbox.userStorage = { getItem: () => null };
  let body = ['_compareTickerKey', 'getSessionSymbolFiles', 'getCompareSourceFiles'].map(overlayMethod).join('\n');
  if (mutate) body = mutate(body);
  vm.createContext(sandbox);
  vm.runInContext(`
class OverlayHarness {
    constructor(session, files) {
        this.chart = { backtestingSession: session };
        this.availableFiles = files;
    }
${body}
}
globalThis.__o = new OverlayHarness(${JSON.stringify(session)}, ${JSON.stringify(availableFiles)});
`, sandbox);
  return sandbox.__o;
}

/** Datasets the user actually has. Note EURUSD/GBPJPY exist; the supporting name does not. */
const FILES = [
  { id: 25, name: 'EURUSD.csv' },
  { id: 42, name: 'GBPJPY.csv' },
];
const SESSION_WITH_SUPPORTING = {
  files: [{ id: 25, name: 'EURUSD.csv' }, { id: 42, name: 'GBPJPY.csv' }],
  supporting_tickers: ['SOMETHING-WITH-NO-DATASET'],
};

test('ROOT CAUSE: an unresolvable supporting name used to empty the whole picker', () => {
  // Reproduces the pre-fix shape: supporting rows replace the session files.
  const pre = compareHarness({
    session: SESSION_WITH_SUPPORTING,
    availableFiles: FILES,
    mutate: (b) => b.replace('return rows.concat(files);', 'return rows;')
                    .replace(/if \(scoped\.length === 0\) \{[\s\S]*?\n        \}\n/, ''),
  });
  assert.deepEqual(Array.from(pre.getCompareSourceFiles()), [],
    'the pre-fix arrangement offers the user nothing at all');
});

test('the session keeps its own pairs when supporting symbols exist', () => {
  const o = compareHarness({ session: SESSION_WITH_SUPPORTING, availableFiles: FILES });
  assert.deepEqual(ids(o), [25, 42],
    'a supporting symbol that resolves to no dataset must not remove the tradable pairs');
});

test('supporting symbols are listed first when they do resolve', () => {
  const o = compareHarness({
    session: { files: [{ id: 42, name: 'GBPJPY.csv' }], supporting_tickers: ['EURUSD'] },
    availableFiles: FILES,
  });
  assert.deepEqual(ids(o), [25, 42],
    'supporting stays the first thing the user sees, which was the original intent');
});

test('anti-vacuity: scoping still narrows to the session', () => {
  const o = compareHarness({
    session: { files: [{ id: 42, name: 'GBPJPY.csv' }] },
    availableFiles: FILES.concat([{ id: 99, name: 'UNRELATED.csv' }]),
  });
  assert.deepEqual(ids(o), [42],
    'if this returned everything the cells above would pass without the scoping working');
});

test('a session with nothing resolvable falls back rather than showing an empty picker', () => {
  const o = compareHarness({
    session: { files: [{ id: 777, name: 'GONE.csv' }] },
    availableFiles: FILES,
  });
  assert.deepEqual(ids(o), [25, 42],
    'an empty result means nothing resolved, not that the user has nothing to compare');
});

test('MUTANT: restoring the replace-instead-of-merge behaviour goes RED', () => {
  const ANCHOR = 'return rows.concat(files);';
  assert.ok(overlayMethod('getSessionSymbolFiles').includes(ANCHOR),
    `MUTANT ANCHOR BROKEN: "${ANCHOR}" absent, so the mutant did not apply.`);
  // An unrelated dataset the session does not own, so the two forms are
  // distinguishable: merged stays scoped to the session, unmerged falls all the
  // way back to every file on the account.
  const withUnrelated = FILES.concat([{ id: 99, name: 'UNRELATED.csv' }]);
  const fixed = compareHarness({ session: SESSION_WITH_SUPPORTING, availableFiles: withUnrelated });
  const mutant = compareHarness({
    session: SESSION_WITH_SUPPORTING,
    availableFiles: withUnrelated,
    mutate: (b) => b.replace(ANCHOR, 'return rows;'),
  });
  assert.deepEqual(ids(fixed), [25, 42], 'the fix keeps the answer scoped to the session');
  assert.deepEqual(ids(mutant), [25, 42, 99],
    'the unmerged form loses the session scope entirely — the two must differ, or the '
    + 'cells above prove nothing');
});

test('compare-overlay canonical and served mirror stay byte-identical', () => {
  assert.equal(fs.readFileSync(OVERLAY, 'utf8'), fs.readFileSync(OVERLAY_MIRROR, 'utf8'),
    'compare-overlay mirror drift — the served bytes are what users actually run');
});

// ---------------------------------------------------------------------------
// B — supporting tagging, executed; gold binding, contract-checked.
// ---------------------------------------------------------------------------

const TAGGING = extract(
  SHELL_SRC,
  /const supportingKeys = new Set\(\);[\s\S]*?const isSupportingSymbol = \(sym\) => supportingKeys\.has\(v9NormSymKey\(sym\)\);/,
  'the supporting tagging block in refreshSessionPairs',
  /supportingKeys/,
)[0];

function tagHarness(session) {
  const sandbox = { Set, String, Array, Object };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return vm.runInContext(`(function(session){
    const v9NormSymKey = (x) => String(x || "").toUpperCase().replace(/\\s+/g, "").replace(/\\//g, "");
    const extractDatasetTicker = (v) => String(v || "").replace(/\\.(csv|CSV)$/, "");
    ${TAGGING}
    return isSupportingSymbol;
  })(${JSON.stringify(session)})`, sandbox);
}

test('a supporting ticker is recognised through display formatting', () => {
  const isSupporting = tagHarness({ supporting_tickers: ['EURUSD'] });
  assert.equal(isSupporting('EUR/USD'), true,
    'the list is raw while the dropdown shows EUR/USD, so the keys must be slash-insensitive');
  assert.equal(isSupporting('EURUSD'), true);
});

test('anti-vacuity: a tradable pair is not tagged supporting', () => {
  const isSupporting = tagHarness({ supporting_tickers: ['EURUSD'] });
  assert.equal(isSupporting('GBP/JPY'), false,
    'if everything were tagged the dropdown would be entirely gold and say nothing');
});

test('view_only and tradable:false are honoured as well as the ticker list', () => {
  assert.equal(tagHarness({ symbols: [{ symbolName: 'XAUUSD', view_only: true }] })('XAU/USD'), true);
  assert.equal(tagHarness({ instruments: { NQ: { tradable: false } } })('NQ'), true);
  assert.equal(tagHarness({ symbols: [{ symbolName: 'XAUUSD', tradable: true }] })('XAU/USD'), false);
});

test('a session with no supporting symbols tags nothing', () => {
  assert.equal(tagHarness({ files: [{ id: 1, name: 'EURUSD.csv' }] })('EUR/USD'), false);
});

test('BINDING: the tag reaches the entries and both dropdowns colour on it', () => {
  assert.match(SHELL_SRC, /supporting: !!supporting,/,
    'BINDING GAP: v9BuildSessionSymbolEntry drops the tag, so no row can ever read it');
  assert.match(SHELL_SRC, /v9BuildSessionSymbolEntry\(p\.ticker, p\.fileId, p\.assetClass, V9_KNOWN_SYMBOL_CATALOG, p\.supporting\)/,
    'BINDING GAP: the groups builder does not pass the tag through');
  const gold = (SHELL_SRC.match(/s\.supporting\?V9_SUPPORTING_GOLD/g) || []).length;
  assert.equal(gold, 2,
    `BINDING GAP: ${gold} of the 2 symbol dropdowns colour supporting rows. The header picker `
    + 'and the order-panel picker are separate render sites and both must be covered.');
  assert.match(SHELL_SRC, /const V9_SUPPORTING_GOLD = "rgba\(232,194,82,0\.9\)"/,
    'the gold must match the session creation picker so a pair keeps one colour throughout');
});

test('BINDING: the pair rows actually carry the tag', () => {
  assert.match(SHELL_SRC, /supporting: isSupportingSymbol\(cleaned\) \|\| isSupportingSymbol\(ticker\)/,
    'BINDING GAP: pushPair does not tag, so every entry would arrive with supporting undefined');
});
