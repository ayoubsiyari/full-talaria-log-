/**
 * SESSION-SYMBOL-RESTORE — a refresh returns to the pair the user was viewing.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/session-symbol-restore.test.mjs"
 *
 * PO b122 test pass: after a refresh the chart came back on EURUSD rather than
 * the symbol last being viewed.
 *
 * The defect was an asymmetry, not a missing write. getChartViewSnapshot() has
 * always put `fileId` in the saved chartView, but nothing ever read it back:
 * boot resolved the pair as `?fileId || getPrimarySessionFileId(session)`, and
 * the primary is simply the session's first instrument. Two halves were needed,
 * because either alone is useless — restoring a value that a pair switch never
 * writes would just restore a stale pair, and writing a value nothing reads
 * changes nothing:
 *   1. boot consults the saved pair, between the URL and the primary
 *   2. a pair switch persists on its own, instead of riding along on a
 *      later pan/zoom save that may never happen
 *
 * Kill-switch: window.__TALARIA_SESSION_SYMBOL_RESTORE
 *   - absent / anything but === false → fix ON
 *   - === false → pre-fix behaviour (boot falls back to the primary)
 *
 * Scope: host only. The local backup is keyed by session and not by panel, so
 * a multichart panel writing its pair there would decide the host's boot
 * symbol. Panels resolve their own file id and are asserted to stay out.
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_SESSION_SYMBOL_RESTORE';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(chart) && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    // BIND-01: absence is its own state. A reader seeing this must not conclude
    // the fix is present and misbehaving, nor that the anchor merely drifted.
    throw new Error(
      `RESOLVER_ABSENT_FROM_TREE: ${name} is not in chart.js at all. `
      + 'The fix is not present in this tree — this is not a behaviour verdict '
      + 'and not a broken anchor.',
    );
  }
  return match[0].replace(/\n+$/, '\n');
}

const LIFTED = [
  '_sessionSymbolRestoreEnabled',
  '_sessionFileIdSet',
  '_getSavedSessionFileId',
  'getPrimarySessionFileId',
];

/**
 * Runs the real methods, not a copy of their logic. `backup` is shaped exactly
 * as _writeTradingSessionLocalBackup emits it.
 */
function harness({ backup = null, kill = undefined, isPanel = false } = {}) {
  const sandbox = { Array, Object, Set, String, Number, Boolean, JSON, Math };
  sandbox.globalThis = sandbox;
  sandbox.window = kill === undefined ? {} : { [SWITCH]: kill };
  vm.createContext(sandbox);
  const body = LIFTED.map((n) => methodSource(SOURCE, n)).join('\n');
  vm.runInContext(`
class ChartHarness {
    constructor() { this.isPanel = ${isPanel ? 'true' : 'false'}; }
    _readTradingSessionLocalBackup() { return ${JSON.stringify(backup)}; }
${body}
}
globalThis.__chart = new ChartHarness();
`, sandbox);
  return sandbox.__chart;
}

/** A session whose primary instrument is NOT the pair we last viewed. */
const SESSION = {
  instrumentTickers: ['EURUSD', 'GBPJPY', 'XAUUSD'],
  instruments: {
    EURUSD: { fileId: '25' },
    GBPJPY: { fileId: '42' },
    XAUUSD: { datasetId: '77' },
  },
};
const LAST_VIEWED = '42';
const PRIMARY = '25';
const backupWith = (fileId) => ({ chartView: { timeframe: '1m', fileId } });

test('anti-vacuity: the last-viewed pair is not the session primary', () => {
  const chart = harness();
  assert.equal(chart.getPrimarySessionFileId(SESSION), PRIMARY);
  assert.notEqual(LAST_VIEWED, PRIMARY,
    'if the saved pair equalled the primary, every cell below would pass without the fix');
});

test('a refresh returns to the pair the user was last viewing', () => {
  const chart = harness({ backup: backupWith(LAST_VIEWED) });
  assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), LAST_VIEWED);
});

test('a pair the session no longer owns is refused, not restored', () => {
  const chart = harness({ backup: backupWith('99') });
  assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), null,
    'sessions get edited between visits; a stale pair must fall back to the primary');
});

test('a session carrying no instrument file ids cannot be overridden', () => {
  const chart = harness({ backup: backupWith(LAST_VIEWED) });
  assert.equal(chart._getSavedSessionFileId('sess-1', { instrumentTickers: [], instruments: {} }), null);
});

test('datasetId and sourceFileId count as owned, not just fileId', () => {
  const chart = harness({ backup: backupWith('77') });
  assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), '77',
    'XAUUSD carries datasetId rather than fileId and is still a legitimate session pair');
});

test('a multichart panel does not restore the host pair', () => {
  const chart = harness({ backup: backupWith(LAST_VIEWED), isPanel: true });
  assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), null,
    'the backup is session-scoped, so a panel honouring it would boot on whichever pair switched last');
});

test('kill switch === false restores the pre-fix fallback', () => {
  const chart = harness({ backup: backupWith(LAST_VIEWED), kill: false });
  assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), null);
});

test('the switch is read per call and only === false disables', () => {
  for (const kill of [true, 0, 1, 'false', null]) {
    const chart = harness({ backup: backupWith(LAST_VIEWED), kill });
    assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), LAST_VIEWED,
      `__TALARIA_SESSION_SYMBOL_RESTORE=${JSON.stringify(kill)} must not disable the fix`);
  }
});

test('missing or empty saved pair falls through to the primary', () => {
  for (const b of [null, {}, { chartView: {} }, { chartView: { fileId: '' } }, { chartView: { fileId: null } }]) {
    const chart = harness({ backup: b });
    assert.equal(chart._getSavedSessionFileId('sess-1', SESSION), null);
  }
});

test('no session id means no restore', () => {
  const chart = harness({ backup: backupWith(LAST_VIEWED) });
  assert.equal(chart._getSavedSessionFileId('', SESSION), null);
});

// ---------------------------------------------------------------------------
// Boot precedence, evaluated from the real source line rather than described.
// ---------------------------------------------------------------------------

const BOOT_RE = /const savedSessionFileId = this\._getSavedSessionFileId\([^\n]*\);\s*\n\s*const fileId = ([^\n]*?);/;

function bootExpression(source) {
  const m = source.match(BOOT_RE);
  if (!m) {
    // BIND-01: separate the two ways this can fail. If the saved-pair lookup is
    // absent entirely the fix is not in the tree; if it is present but the
    // resolution no longer matches, the anchor drifted and the suite is blind.
    const present = /_getSavedSessionFileId\s*\(/.test(source);
    throw new Error(present
      ? 'ANCHOR_BROKEN: _getSavedSessionFileId exists but the boot resolution no longer '
        + 'matches the expected shape. The suite is blind here — re-anchor it. '
        + 'This is NOT a statement about product behaviour.'
      : 'RESOLVER_ABSENT_FROM_TREE: boot never consults a saved pair. The fix is not '
        + 'present in this tree.');
  }
  return m[1];
}

function resolveBoot(expr, { url, saved, primary }) {
  const sandbox = {
    urlParams: { get: () => url },
    savedSessionFileId: saved,
    session: SESSION,
    this: undefined,
  };
  sandbox.self = { _getSavedSessionFileId: () => saved, getPrimarySessionFileId: () => primary };
  vm.createContext(sandbox);
  return vm.runInContext(`(function(){ const that = self; return ${expr.replace(/this\./g, 'that.')}; })()`, sandbox);
}

test('boot precedence: URL beats saved pair beats session primary', () => {
  const expr = bootExpression(SOURCE);
  assert.equal(resolveBoot(expr, { url: null, saved: LAST_VIEWED, primary: PRIMARY }), LAST_VIEWED,
    'a plain refresh must land on the last-viewed pair');
  assert.equal(resolveBoot(expr, { url: '7', saved: LAST_VIEWED, primary: PRIMARY }), '7',
    'an explicit ?fileId is a deliberate instruction and still wins');
  assert.equal(resolveBoot(expr, { url: null, saved: null, primary: PRIMARY }), PRIMARY,
    'with nothing saved the pre-existing primary fallback is unchanged');
});

test('MUTANT: dropping the saved pair from boot resolution goes RED', () => {
  const expr = bootExpression(SOURCE);
  const ANCHOR = 'savedSessionFileId ||';
  assert.ok(expr.includes(ANCHOR),
    `MUTANT ANCHOR BROKEN: "${ANCHOR}" absent from the boot expression. `
    + 'The mutant did not apply, so this cell proved nothing either way.');
  const mutant = expr.replace(ANCHOR, '');
  assert.equal(resolveBoot(mutant, { url: null, saved: LAST_VIEWED, primary: PRIMARY }), PRIMARY,
    'the pre-fix expression must return the primary — if it returns the saved pair, '
    + 'the precedence cell above is not discriminating and this row is not covered');
});

// ---------------------------------------------------------------------------
// Binding: the read half is worthless unless the write half actually runs.
// These observe source structure, which is a weaker state than the cells above,
// and they say so when they fail.
// ---------------------------------------------------------------------------

test('BINDING: a pair switch persists the file id by itself', () => {
  const loadFileData = methodSource(SOURCE, 'loadFileData');
  assert.match(loadFileData, /_sessionSymbolRestoreEnabled\(\)/,
    'BINDING GAP (not a behaviour failure): loadFileData never persists, so the saved pair '
    + 'would only ever be written by a later pan or zoom');
  assert.match(loadFileData, /scheduleChartViewSave\(\)/);
  assert.match(loadFileData, /_writeTradingSessionLocalBackupThrottled\(/);
  assert.match(loadFileData, /!this\.isPanel/, 'the persist must stay host-scoped');
});

test('BINDING: the backup writer emits the file id the reader looks for', () => {
  const writer = methodSource(SOURCE, '_writeTradingSessionLocalBackup');
  assert.match(writer, /payload\.chartView\.fileId = viewFileId/,
    'BINDING GAP: the reader reads chartView.fileId, so the writer must write it');
  assert.match(writer, /!this\.isPanel/, 'panels must not write the session-scoped pair');
});

test('canonical and served mirror stay byte-identical', () => {
  assert.equal(fs.readFileSync(CHART_JS, 'utf8'), fs.readFileSync(CHART_MIRROR, 'utf8'),
    'chart.js mirror drift — the served bytes are what users actually run');
});
