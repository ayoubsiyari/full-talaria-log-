/**
 * COUNTDOWN-NULL-GUARD — tolerate null/empty replay bar series in animate() countdown.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/countdown-null-guard.test.mjs"
 *
 * Crash (PO b99): Cannot read properties of null (reading '2016')
 *   at Chart._getReplayBarCloseCountdownText — unguarded rs.fullRawData[i]
 *   when fullRawData === null and currentIndex is stale (e.g. after 502s).
 *
 * Silent lie (COUNTDOWN-EMPTY-ARRAY): fullRawData === [] + stale index
 *   invents a full-length countdown ("01:00" on 1m) for a zero-bar series.
 *   Same 502 empty-spread path as the null crash.
 *
 * Kill-switch: window.__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1
 *   - absent / falsy → fix ON (guarded, degrades to '')
 *   - truthy → tip behaviour (unguarded — crash / silent-lie reproduces)
 *   - truthiness (not === true); read per call, never sampled at init
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1';
/** Canonical guard clause token sequence (whitespace-tolerant match via replaceGuardIf). */
const GUARD_IF = "if (this._countdownNullGuardEnabled()\n"
  + "            && (!Array.isArray(rs.fullRawData) || rs.fullRawData.length === 0)) {\n"
  + "            return '';\n"
  + "        }";
/** Indices that must stay guarded under fix-ON (M9 escapes when only >0 is covered). */
const GUARD_INDEX_SPREAD = [0, 1, 5, 100, 2016, 99999];

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    const gitPath = path.join(cursor, '.git');
    if (fs.existsSync(chart) && fs.existsSync(gitPath)) return cursor;
    if (fs.existsSync(chart)
      && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
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
const CHART_SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function methodSource(text, name, { optional = false } = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    if (optional) return '';
    throw new Error(`method ${name} missing from chart.js`);
  }
  return match[0].replace(/\n+$/, '\n');
}

function wsTolerantPattern(literal) {
  const parts = String(literal).trim().split(/\s+/).map((part) =>
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('\\s+'));
}

/**
 * Replace exactly one occurrence of `from`, allowing any whitespace runs.
 * Preserves semantic token sequence; survives indentation/reflow of the clause.
 */
function replaceGuardIf(text, from, to, label) {
  const re = new RegExp(wsTolerantPattern(from).source, 'g');
  const matches = [...text.matchAll(re)];
  assert.equal(matches.length, 1, `${label}: expected exactly one anchor`);
  const m = matches[0];
  return text.slice(0, m.index) + to + text.slice(m.index + m[0].length);
}

/** Whitespace-tolerant strip of the COUNTDOWN-NULL-GUARD if-block (deletion mutant). */
function stripCountdownNullGuardBlock(replaySrc) {
  const re = /\n\s*\/\/\s*COUNTDOWN-NULL-GUARD:[\s\S]*?if\s*\(\s*this\._countdownNullGuardEnabled\(\)\s*&&\s*\(\s*!Array\.isArray\(\s*rs\.fullRawData\s*\)\s*\|\|\s*rs\.fullRawData\.length\s*===\s*0\s*\)\s*\)\s*\{\s*return\s*'';\s*\}\s*/;
  const mutant = replaySrc.replace(re, '\n');
  return mutant;
}

const METHOD_NAMES = [
  '_countdownNullGuardEnabled',
  '_formatCountdownSeconds',
  '_getReplayBarCloseCountdownText',
  '_getBarCloseCountdownText',
  '_tickBarCloseCountdown',
  '_m20Q2CountdownIdleFixEnabled',
  'getTimeframeSeconds',
];

const TIP_METHOD_NAMES = METHOD_NAMES.filter((n) => n !== '_countdownNullGuardEnabled');

function makeBars(n = 120) {
  const bars = [];
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const o = 100 + (i % 7);
    bars.push({
      t: t0 + i * 60_000,
      o,
      h: o + 1,
      l: o - 1,
      c: o + 0.5,
      v: 10 + i,
    });
  }
  return bars;
}

function makeArrayLike(index = 2016) {
  const bar = {
    t: Date.UTC(2024, 0, 1) + index * 60_000,
    o: 100,
    h: 101,
    l: 99,
    c: 100.5,
    v: 10,
  };
  return { length: Math.max(3000, index + 1), [index]: bar, 0: bar, 1: bar };
}

function makeHarness(opts = {}) {
  const {
    source = CHART_SOURCE,
    methods = METHOD_NAMES,
    kill = undefined,
    replayActive = true,
    // Default null only when the key is omitted — explicit undefined must survive
    // (destructuring defaults would collapse undefined → null and hide that cell).
    currentIndex = 2016,
    data = null,
    nowMs = null,
    tickProgress = 0,
    isPlaying = true,
    timeframe = '1m',
  } = opts;
  const fullRawData = Object.prototype.hasOwnProperty.call(opts, 'fullRawData')
    ? opts.fullRawData
    : null;
  const RealDate = Date;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => 12_000 },
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Map,
    Set,
  };
  sandbox.Date = class extends RealDate {
    static now() {
      return Number.isFinite(nowMs) ? nowMs : RealDate.now();
    }
  };
  sandbox.globalThis = sandbox;
  const win = { [SWITCH]: kill };
  sandbox.window = win;
  sandbox.document = { hidden: false };

  const body = methods.map((n) => methodSource(source, n)).join('\n');
  vm.createContext(sandbox);
  vm.runInContext(`
class ChartHarness {
    constructor() {
        this.currentTimeframe = ${JSON.stringify(timeframe)};
        this.chartSettings = { showCountdownToBarClose: true };
        this.data = null;
        this.replaySystem = null;
        this._lastCountdownRender = 0;
        this._lastCountdownPaintedText = null;
        this._countdownRegionPainted = false;
        this._scheduleRenderCalls = 0;
        this._paintRegionCalls = 0;
    }
    scheduleRender() { this._scheduleRenderCalls += 1; }
    _isMultichartEmbedPanel() { return false; }
    _shouldSkipMultichartBackgroundRender() { return false; }
    _paintBarCloseCountdownRegion() {
        this._paintRegionCalls += 1;
        return true;
    }
${body}
}
globalThis.__chart = new ChartHarness();
`, sandbox);

  const chart = sandbox.__chart;
  if (replayActive) {
    chart.replaySystem = {
      isActive: true,
      isPlaying,
      fullRawData,
      currentIndex,
      tickProgress,
      ticksPerCandle: 72,
      currentTicksPerCandle: 72,
      _savedTickState: null,
    };
  } else {
    chart.replaySystem = { isActive: false };
  }
  if (Array.isArray(data)) {
    chart.data = data;
  }
  return { chart, window: win, sandbox };
}

/**
 * Tip-crash assertion: must observe both the index and the operand word
 * (`null` vs `undefined`). A harness that collapses undefined→null must fail
 * the operand-word match rather than silently pass.
 */
function assertThrowsReading(fn, { index, of: operand }, label) {
  assert.ok(operand === 'null' || operand === 'undefined',
    `${label}: operand must be "null" or "undefined"`);
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, `${label}: expected throw`);
  const msg = String(threw.message || threw);
  assert.match(msg, /Cannot read properties of/i, label);
  assert.match(
    msg,
    new RegExp(`of ${operand}\\b`, 'i'),
    `${label}: expected operand word "of ${operand}" in ${JSON.stringify(msg)}`,
  );
  assert.match(msg, new RegExp(String(index)), label);
}

function assertThrowsNull2016(fn, label) {
  assertThrowsReading(fn, { index: '2016', of: 'null' }, label);
}

function loadTipChartSource() {
  const out = execFileSync(
    'git',
    ['-c', 'core.autocrlf=false', 'show', 'a72cedd19^:chart v 1.4/chart/chart.js'],
    { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 },
  );
  return Buffer.isBuffer(out) ? out.toString('utf8') : String(out);
}

function captureOutcome(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return {
      ok: false,
      name: err && err.name,
      message: String(err && err.message || err),
    };
  }
}

test('flag + helper + guard present in chart.js', () => {
  assert.match(CHART_SOURCE, /__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1/);
  assert.match(CHART_SOURCE, /COUNTDOWN-NULL-GUARD/);
  assert.match(CHART_SOURCE, /_countdownNullGuardEnabled/);
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  assert.match(replay, /_countdownNullGuardEnabled\(\)/);
  assert.match(replay, /!Array\.isArray\(rs\.fullRawData\)/);
  assert.match(replay, /rs\.fullRawData\.length === 0/);
  // Loop still present (tip path) — crash site not deleted wholesale.
  assert.match(replay, /for \(let i = currentIndex; i >= 0; i--\)/);
  note('sites-present', true);
});

test('absent / falsy flag ⇒ guard ON; truthy ⇒ OFF (per-call truthiness)', () => {
  const on = makeHarness({ kill: undefined, fullRawData: null, currentIndex: 2016 });
  assert.equal(on.chart._countdownNullGuardEnabled(), true);

  const offTrue = makeHarness({ kill: true, fullRawData: null, currentIndex: 2016 });
  assert.equal(offTrue.chart._countdownNullGuardEnabled(), false);

  const { chart, window } = makeHarness({ kill: false, fullRawData: null, currentIndex: 2016 });
  assert.equal(chart._countdownNullGuardEnabled(), true);
  window[SWITCH] = '1';
  assert.equal(chart._countdownNullGuardEnabled(), false);
  window[SWITCH] = 0;
  assert.equal(chart._countdownNullGuardEnabled(), true);
  window[SWITCH] = 1;
  assert.equal(chart._countdownNullGuardEnabled(), false);
  note('flag-semantics', true);
});

test('RED tip: null fullRawData + currentIndex 2016 throws Cannot read properties of null', () => {
  const { chart } = makeHarness({
    kill: true,
    fullRawData: null,
    currentIndex: 2016,
  });
  assertThrowsNull2016(
    () => chart._getReplayBarCloseCountdownText(),
    'kill-ON tip crash',
  );
  note('red-tip-throws', true);
});

test('GREEN fix: same null setup returns empty string and does not throw', () => {
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(chart._getReplayBarCloseCountdownText(), '');
  assert.equal(chart._getBarCloseCountdownText(), '');
  note('green-null-degrades', true);
});

test('GREEN fix: empty-array fullRawData + currentIndex 2016 returns empty string (no silent lie)', () => {
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: [],
    currentIndex: 2016,
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(text, '', `empty series must not invent a countdown; got ${JSON.stringify(text)}`);
  assert.equal(chart._getBarCloseCountdownText(), '');
  note('green-empty-array-degrades', true);
});

test('GREEN fix: empty-array at currentIndex 0 + index spread returns empty (M9 index-narrow escape)', () => {
  // M9 appends `&& rs.currentIndex > 0`. All prior [] cells used 2016, so the
  // differential (indices vary) runs kill-ON only. Fix-ON at index 0 is required.
  for (const currentIndex of GUARD_INDEX_SPREAD) {
    const { chart } = makeHarness({
      kill: undefined,
      fullRawData: [],
      currentIndex,
    });
    const text = chart._getReplayBarCloseCountdownText();
    assert.equal(
      text,
      '',
      `[] + currentIndex ${currentIndex} must not invent a countdown; got ${JSON.stringify(text)}`,
    );
  }
  const five = makeHarness({
    kill: undefined,
    fullRawData: [],
    currentIndex: 0,
    timeframe: '5m',
  });
  assert.equal(
    five.chart._getReplayBarCloseCountdownText(),
    '',
    '[] + currentIndex 0 on 5m must not invent 05:00',
  );
  note('green-empty-array-index-spread', true);
});

test('GREEN fix: null fullRawData at currentIndex 0 + index spread returns empty (M9 index-narrow escape)', () => {
  for (const currentIndex of GUARD_INDEX_SPREAD) {
    const { chart } = makeHarness({
      kill: undefined,
      fullRawData: null,
      currentIndex,
    });
    assert.equal(
      chart._getReplayBarCloseCountdownText(),
      '',
      `null + currentIndex ${currentIndex} must degrade to '' (no throw)`,
    );
  }
  note('green-null-index-spread', true);
});

test('GREEN fix: undefined fullRawData + currentIndex 2016 returns empty string', () => {
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: undefined,
    currentIndex: 2016,
  });
  assert.equal(chart._getReplayBarCloseCountdownText(), '');
  assert.equal(chart._getBarCloseCountdownText(), '');
  note('green-undefined-degrades', true);
});

test('GREEN fix: array-like non-array fullRawData returns empty string (not a bogus countdown)', () => {
  const arrayLike = makeArrayLike(2016);
  assert.equal(Array.isArray(arrayLike), false);
  assert.equal(arrayLike.length, 3000);
  assert.ok(arrayLike[2016]);
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: arrayLike,
    currentIndex: 2016,
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(text, '', `array-like must not invent a countdown; got ${JSON.stringify(text)}`);
  note('green-array-like-degrades', true);
});

test('kill-switch ON: empty array reproduces tip silent lie ("01:00")', () => {
  const { chart } = makeHarness({
    kill: true,
    fullRawData: [],
    currentIndex: 2016,
  });
  assert.equal(chart._getReplayBarCloseCountdownText(), '01:00');
  note('kill-on-empty-array-tip', true);
});

test('kill-switch ON: undefined fullRawData throws tip-style (reading 2016)', () => {
  const { chart } = makeHarness({
    kill: true,
    fullRawData: undefined,
    currentIndex: 2016,
  });
  assertThrowsReading(
    () => chart._getReplayBarCloseCountdownText(),
    { index: '2016', of: 'undefined' },
    'kill-ON undefined tip crash',
  );
  note('kill-on-undefined-tip', true);
});

test('kill-switch ON: array-like non-array reproduces tip (non-empty countdown)', () => {
  const arrayLike = makeArrayLike(2016);
  const { chart } = makeHarness({
    kill: true,
    fullRawData: arrayLike,
    currentIndex: 2016,
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(typeof text, 'string');
  assert.notEqual(text, '', 'tip treats array-like as present series');
  assert.match(text, /^\d{2}:\d{2}$/);
  note('kill-on-array-like-tip', true, text);
});

test('tick path: _tickBarCloseCountdown must not throw under null fullRawData (fix ON)', () => {
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.doesNotThrow(() => chart._tickBarCloseCountdown(12_000));
  assert.equal(chart._lastCountdownPaintedText, '');
  note('tick-no-throw', true);
});

test('healthy replay series still produces a real countdown string', () => {
  const bars = makeBars(80);
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: bars,
    currentIndex: 40,
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(typeof text, 'string');
  assert.notEqual(text, '', 'healthy replay must not silent-disable');
  // Semantic: 1m bar at tickProgress 0 → full remaining minute.
  assert.equal(text, '01:00', 'healthy replay must keep real countdown semantics');
  assert.equal(chart._getBarCloseCountdownText(), text);
  note('healthy-replay', true, text);
});

test('healthy replay mid-tick still produces a real partial countdown', () => {
  const bars = makeBars(80);
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: bars,
    currentIndex: 40,
    tickProgress: 36, // half of 72 ticks → ~30s remaining on 1m
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(text, '00:30', 'healthy mid-tick must stay semantic');
  note('healthy-replay-midtick', true, text);
});

test('healthy single-bar series still produces a real countdown string', () => {
  const bars = makeBars(1);
  const { chart } = makeHarness({
    kill: undefined,
    fullRawData: bars,
    currentIndex: 0,
  });
  const text = chart._getReplayBarCloseCountdownText();
  assert.equal(text, '01:00', '1-bar healthy series must not be swallowed');
  note('healthy-one-bar', true, text);
});

test('live (non-replay) path still produces a countdown when data is present', () => {
  const bars = makeBars(10);
  const last = bars[bars.length - 1];
  // Mid-bar: 30s into a 60s bar → remaining ~30s → "00:30" style.
  const nowMs = last.t + 30_000;
  const { chart } = makeHarness({
    kill: undefined,
    replayActive: false,
    data: bars,
    nowMs,
  });
  const text = chart._getBarCloseCountdownText();
  assert.equal(typeof text, 'string');
  assert.notEqual(text, '', 'live path must not silent-disable');
  assert.equal(text, '00:30', 'live path must keep real countdown semantics');
  note('healthy-live', true, text);
});

test('kill-switch restores tip exactly (crash reproduces)', () => {
  const { chart, window } = makeHarness({
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(chart._getReplayBarCloseCountdownText(), '');
  window[SWITCH] = true;
  assertThrowsNull2016(
    () => chart._getReplayBarCloseCountdownText(),
    'per-call kill restores tip',
  );
  note('kill-restores-tip', true);
});

test('homepage chart.js mirror is byte-identical (LF) sha256', () => {
  const canon = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  assert.equal(canon.includes(Buffer.from([13])), false, 'canonical LF-only');
  assert.equal(mirror.includes(Buffer.from([13])), false, 'mirror LF-only');
  assert.equal(canon.equals(mirror), true, `sha=${sha256(canon)}`);
  note('mirrors-byte-identical', true, sha256(canon));
});

test('mutant: guard removed ⇒ RED throws again under fix-ON', () => {
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  const mutantReplay = stripCountdownNullGuardBlock(replay);
  assert.notEqual(mutantReplay, replay, 'guard-removed mutation applied');
  // Deletion catcher: whitespace-tolerant GUARD_IF must no longer match once removed.
  assert.equal(
    [...replay.matchAll(new RegExp(wsTolerantPattern(GUARD_IF).source, 'g'))].length,
    1,
    'product must expose exactly one GUARD_IF anchor',
  );
  assert.equal(
    [...mutantReplay.matchAll(new RegExp(wsTolerantPattern(GUARD_IF).source, 'g'))].length,
    0,
    'guard-removed mutant must leave zero GUARD_IF anchors',
  );
  const mutant = CHART_SOURCE.replace(replay, mutantReplay);
  const { chart } = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assertThrowsNull2016(
    () => chart._getReplayBarCloseCountdownText(),
    'mutant guard-removed',
  );
  note('mutant-guard-removed', true);
});

test('mutant: guard narrowed to === null ⇒ undefined + array-like + empty escape', () => {
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  const narrowNull = "if (this._countdownNullGuardEnabled() && rs.fullRawData === null) {\n"
    + "            return '';\n"
    + "        }";
  const mutantReplay = replaceGuardIf(replay, GUARD_IF, narrowNull, '===null');
  const mutant = CHART_SOURCE.replace(replay, mutantReplay);

  // null still "passes" under the weak mutant — must not be the kill cell.
  const nullCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(nullCase.chart._getReplayBarCloseCountdownText(), '');

  // Semantic kills:
  const undefCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: undefined,
    currentIndex: 2016,
  });
  assertThrowsReading(
    () => undefCase.chart._getReplayBarCloseCountdownText(),
    { index: '2016', of: 'undefined' },
    '===null mutant dies on undefined',
  );

  const emptyCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: [],
    currentIndex: 2016,
  });
  assert.equal(
    emptyCase.chart._getReplayBarCloseCountdownText(),
    '01:00',
    '===null mutant silent-lies on empty array',
  );

  const likeCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: makeArrayLike(2016),
    currentIndex: 2016,
  });
  assert.notEqual(
    likeCase.chart._getReplayBarCloseCountdownText(),
    '',
    '===null mutant invents countdown for array-like',
  );
  note('mutant-narrow-null', true);
});

test('mutant: R1 reverted (!Array.isArray only) ⇒ empty array silent-lies', () => {
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  const noEmpty = "if (this._countdownNullGuardEnabled() && !Array.isArray(rs.fullRawData)) {\n"
    + "            return '';\n"
    + "        }";
  const mutantReplay = replaceGuardIf(replay, GUARD_IF, noEmpty, 'R1-reverted');
  const mutant = CHART_SOURCE.replace(replay, mutantReplay);

  // Still handles null / undefined / array-like — empty is the semantic kill.
  const nullCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(nullCase.chart._getReplayBarCloseCountdownText(), '');

  const emptyCase = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: [],
    currentIndex: 2016,
  });
  assert.equal(
    emptyCase.chart._getReplayBarCloseCountdownText(),
    '01:00',
    'R1-reverted mutant invents 01:00 for []',
  );
  // Product itself must return ''.
  const product = makeHarness({
    kill: undefined,
    fullRawData: [],
    currentIndex: 2016,
  });
  assert.equal(product.chart._getReplayBarCloseCountdownText(), '');
  note('mutant-r1-reverted', true);
});

test('mutant: !rs.fullRawData?.length drops Array.isArray ⇒ array-like escapes', () => {
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  const lengthOnly = "if (this._countdownNullGuardEnabled() && !rs.fullRawData?.length) {\n"
    + "            return '';\n"
    + "        }";
  const mutantReplay = replaceGuardIf(replay, GUARD_IF, lengthOnly, 'length-only');
  const mutant = CHART_SOURCE.replace(replay, mutantReplay);

  // Healthy + empty still "work" under length-only — not over-broad on arrays.
  const bars = makeBars(80);
  const healthy = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: bars,
    currentIndex: 40,
  });
  assert.equal(healthy.chart._getReplayBarCloseCountdownText(), '01:00');

  const empty = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: [],
    currentIndex: 2016,
  });
  assert.equal(empty.chart._getReplayBarCloseCountdownText(), '');

  // Semantic kill: array-like with length>0 is treated as a real series.
  const like = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: makeArrayLike(2016),
    currentIndex: 2016,
  });
  const text = like.chart._getReplayBarCloseCountdownText();
  assert.notEqual(text, '', 'length-only mutant invents countdown for array-like');
  assert.match(text, /^\d{2}:\d{2}$/);
  note('mutant-length-only', true, text);
});

test('mutant: kill polarity inverted ⇒ tip no longer crashes / fix disabled', () => {
  const enabled = methodSource(CHART_SOURCE, '_countdownNullGuardEnabled');
  const mutantEnabled = enabled.replace(
    '|| !window.__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1;',
    '|| !!window.__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1; /* MUTANT polarity */',
  );
  assert.notEqual(mutantEnabled, enabled, 'polarity mutation applied');
  const mutant = CHART_SOURCE.replace(enabled, mutantEnabled);

  // With polarity inverted: absent flag ⇒ guard OFF ⇒ tip crash under null.
  const broken = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(broken.chart._countdownNullGuardEnabled(), false, 'mutant default OFF');
  assertThrowsNull2016(
    () => broken.chart._getReplayBarCloseCountdownText(),
    'mutant polarity: fix-ON path crashes',
  );

  // Truthy kill wrongly enables guard.
  const killed = makeHarness({
    source: mutant,
    kill: true,
    fullRawData: null,
    currentIndex: 2016,
  });
  assert.equal(killed.chart._countdownNullGuardEnabled(), true);
  assert.equal(killed.chart._getReplayBarCloseCountdownText(), '');
  note('mutant-kill-polarity', true);
});

test('mutant: over-broad guard disables healthy countdown (oracle dies)', () => {
  const replay = methodSource(CHART_SOURCE, '_getReplayBarCloseCountdownText');
  const broad = "if (this._countdownNullGuardEnabled()) {\n            return ''; /* MUTANT over-broad */\n        }";
  const mutantReplay = replaceGuardIf(replay, GUARD_IF, broad, 'over-broad');
  const mutant = CHART_SOURCE.replace(replay, mutantReplay);
  const bars = makeBars(80);
  const { chart } = makeHarness({
    source: mutant,
    kill: undefined,
    fullRawData: bars,
    currentIndex: 40,
  });
  assert.equal(chart._getReplayBarCloseCountdownText(), '', 'mutant silent-disables');
  // Product itself must still produce a non-empty string (oracle contrast).
  const healthy = makeHarness({
    kill: undefined,
    fullRawData: bars,
    currentIndex: 40,
  });
  assert.equal(healthy.chart._getReplayBarCloseCountdownText(), '01:00');
  note('mutant-over-broad', true);
});

test('kill-switch ON differential vs pre-a72cedd19 tip — zero divergence', () => {
  const tipSource = loadTipChartSource();
  assert.equal(
    tipSource.includes('_countdownNullGuardEnabled'),
    false,
    'tip parent must predate the guard helper',
  );

  const seriesShapes = [
    { name: 'null', fullRawData: null },
    { name: 'undefined', fullRawData: undefined },
    { name: 'empty', fullRawData: [] },
    { name: 'array-like', fullRawData: makeArrayLike(2016) },
    { name: '1-bar', fullRawData: makeBars(1) },
    { name: '80-bars', fullRawData: makeBars(80) },
  ];
  const indices = [0, 1, 40, 2016];
  const tickStates = [
    { tickProgress: 0, isPlaying: true },
    { tickProgress: 36, isPlaying: true },
    { tickProgress: 0, isPlaying: false },
  ];

  let cases = 0;
  const divergences = [];
  for (const shape of seriesShapes) {
    for (const currentIndex of indices) {
      for (const tick of tickStates) {
        cases += 1;
        const tip = makeHarness({
          source: tipSource,
          methods: TIP_METHOD_NAMES,
          kill: undefined,
          fullRawData: shape.fullRawData,
          currentIndex,
          tickProgress: tick.tickProgress,
          isPlaying: tick.isPlaying,
        });
        const off = makeHarness({
          kill: true,
          fullRawData: shape.fullRawData,
          currentIndex,
          tickProgress: tick.tickProgress,
          isPlaying: tick.isPlaying,
        });
        const tipOut = captureOutcome(() => tip.chart._getReplayBarCloseCountdownText());
        const offOut = captureOutcome(() => off.chart._getReplayBarCloseCountdownText());
        if (JSON.stringify(tipOut) !== JSON.stringify(offOut)) {
          divergences.push({
            shape: shape.name,
            currentIndex,
            tick,
            tipOut,
            offOut,
          });
        }
      }
    }
  }

  assert.equal(divergences.length, 0, `divergences=${JSON.stringify(divergences.slice(0, 3))}`);
  assert.equal(cases, seriesShapes.length * indices.length * tickStates.length);
  note('kill-switch-differential', true, `${cases} cases`);
});
