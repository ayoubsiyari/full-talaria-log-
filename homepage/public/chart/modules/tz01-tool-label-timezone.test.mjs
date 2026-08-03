/**
 * TZ-01 — drawing-tool labels must read the same clock as the chart.
 *
 * Reported pre-seal on a four-pair 1m session: the crosshair read
 * `24 Jul 2011 16:04` while a vertical line dropped on that same first candle
 * read `24 Jul 2011 22:00`. One instant, two times, because the tool badges
 * formatted with `new Date(t).getHours()` (the browser's zone) while the
 * crosshair went through `convertToTimezone` (the selected zone).
 *
 * The cells below run the SHIPPED formatters, lifted out of the product files,
 * against the SHIPPED timezone manager. Nothing here restates what the product
 * ought to do — a copy would keep passing after the product regressed.
 *
 * Three states are kept apart, per BIND-01:
 *   RESOLVER_ABSENT_FROM_TREE     the formatter is not in the checked tree
 *   RESOLVER_PRESENT_BUT_UNCALLED it exists but no badge site routes through it
 *   RESOLVER_CALLED_BUT_WRONG     it is bound and disagrees with the crosshair
 *
 * The second half answers the question the labels cannot: whether the CANDLES
 * honour the selected zone, or only their labels do.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const repoRoot = findRoot(__dirname);

const TREES = [
  { name: 'homepage', root: path.resolve(findRoot(__dirname), 'homepage/public/chart') },
  { name: 'chart v 1.4', root: path.resolve(findRoot(__dirname), 'chart v 1.4/chart') },
];

const read = (f) => fs.readFileSync(f, 'utf8');

/** Body of a class method, brace-matched. Absence is its own reported state. */
function methodSource(text, name, where) {
  const marker = new RegExp(`\\n(\\s+)${name}\\s*\\(`);
  const m = marker.exec(text);
  assert.ok(m, `RESOLVER_ABSENT_FROM_TREE: ${name} is not in ${where}`);
  const start = m.index + 1;
  const brace = text.indexOf('{', text.indexOf('(', start));
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`${name} body did not close in ${where}`);
}

/**
 * The real TimezoneManager, loaded as product source rather than reimplemented.
 * It writes itself onto `window`, so a window is provided for it to land on.
 */
function loadTimezoneManager(root) {
  const src = read(path.join(root, 'modules/timezone-manager.js'));
  const sandboxWindow = {};
  const factory = new Function('window', 'document', 'localStorage', `
    const module = { exports: {} };
    ${src.replace(/export\s+default\s+/g, 'const __default = ')}
    return window.timezoneManager;
  `);
  const tm = factory(sandboxWindow, undefined, undefined);
  assert.ok(tm, 'RESOLVER_ABSENT_FROM_TREE: timezone-manager did not construct');
  return { tm, sandboxWindow };
}

/**
 * A chart stub carrying only what the two formatters touch, with the product's
 * own convertToTimezone and _formatSessionClock bound to it.
 */
function makeChart(root, tzId, timeFormat = '24h') {
  const chartSrc = read(path.join(root, 'chart.js'));
  const { tm } = loadTimezoneManager(root);
  tm.currentTimezone = { id: tzId, label: tzId, offset: 0 };

  const chart = {
    chartSettings: { timeFormat },
    data: [],
    replaySystem: null,
  };
  const bind = (name) => {
    const body = methodSource(chartSrc, name, 'chart.js');
    const fn = new Function('window', `return ({ ${body} }).${name};`)({ timezoneManager: tm });
    chart[name] = fn.bind(chart);
  };
  bind('convertToTimezone');
  bind('_formatSessionClock');
  bind('_formatCrosshairTimeLabel');
  bind('_estimateTimeframeStepMs');
  return { chart, tm };
}

/** The shipped drawing-tool badge formatter, bound to that same chart. */
function makeToolFormatter(root, chart) {
  const src = read(path.join(root, 'modules/drawing-tools-base.js'));
  const body = methodSource(src, 'formatAxisTimeLabel', 'drawing-tools-base.js');
  const fn = new Function(`return ({ ${body} }).formatAxisTimeLabel;`)();
  return fn.bind({ chart });
}

/** The formatter as it shipped before the fix: the browser's zone. */
function preFixFormatter() {
  return (timestampMs) => {
    const date = new Date(timestampMs);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} '${year} ${hours}:${mins}`;
  };
}

/** Clock text out of either label shape, so the two can be compared. */
function clockOf(label) {
  const m = /(\d{1,2}:\d{2})(?::\d{2})?(\s?[AP]M)?/.exec(String(label));
  return m ? `${m[1]}${m[2] ? m[2].replace(/\s/g, ' ') : ''}` : null;
}

function dayOf(label) {
  const m = /(\d{1,2})\s+([A-Z][a-z]{2})\s+'?(\d{2})/.exec(String(label));
  return m ? `${Number(m[1])} ${m[2]} ${m[3]}` : null;
}

/** The reported instant: first 1m candle of the 24 Jul 2011 FX week. */
const REPORTED_T = Date.UTC(2011, 6, 24, 20, 4, 0);

const ZONES = [
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
  'Asia/Kolkata',      // +05:30 — a half-hour zone, where hour-shifting breaks
  'Australia/Adelaide', // +09:30, and southern-hemisphere DST
  'UTC',
];

for (const tree of TREES) {
  const label = `[${tree.name}]`;

  test(`${label} the tool badge and the crosshair name the same clock, in every zone`, () => {
    for (const tzId of ZONES) {
      const { chart } = makeChart(tree.root, tzId);
      const tool = makeToolFormatter(tree.root, chart);
      chart.data = [
        { t: REPORTED_T, o: 1, h: 1, l: 1, c: 1 },
        { t: REPORTED_T + 60_000, o: 1, h: 1, l: 1, c: 1 },
      ];

      const crosshair = chart._formatCrosshairTimeLabel(REPORTED_T, 60_000);
      const badge = tool(REPORTED_T);

      assert.equal(clockOf(badge), clockOf(crosshair),
        `RESOLVER_CALLED_BUT_WRONG in ${tzId}: badge "${badge}" vs crosshair "${crosshair}"`);
      assert.equal(dayOf(badge), dayOf(crosshair),
        `RESOLVER_CALLED_BUT_WRONG in ${tzId}: badge day "${badge}" vs crosshair "${crosshair}"`);
    }
  });

  test(`${label} the badge follows the zone when the zone changes`, () => {
    const seen = new Map();
    for (const tzId of ZONES) {
      const { chart } = makeChart(tree.root, tzId);
      seen.set(tzId, makeToolFormatter(tree.root, chart)(REPORTED_T));
    }
    assert.equal(seen.get('America/New_York'), `24 Jul '11 16:04`,
      'the reported instant is 16:04 in New York');
    assert.equal(seen.get('UTC'), `24 Jul '11 20:04`, 'and 20:04 in UTC');
    assert.equal(seen.get('Asia/Kolkata'), `25 Jul '11 01:34`,
      'a half-hour zone must carry the :34 and roll the date');
    assert.equal(new Set(seen.values()).size >= 5, true,
      'RESOLVER_PRESENT_BUT_UNCALLED: the badge did not move with the zone');
  });

  test(`${label} CONTROL: the pre-fix formatter is caught in a zone that is not the browser's`, () => {
    // Without a RED on the known-defective input, a green above proves nothing.
    const stale = preFixFormatter();
    const browserOffsetMin = new Date(REPORTED_T).getTimezoneOffset();
    const disagreements = [];
    for (const tzId of ZONES) {
      const { chart, tm } = makeChart(tree.root, tzId);
      const crosshair = chart._formatCrosshairTimeLabel(REPORTED_T, 60_000);
      if (clockOf(stale(REPORTED_T)) !== clockOf(crosshair)) disagreements.push(tzId);
      assert.equal(tm.currentTimezone.id, tzId, 'the zone under test must be the selected one');
    }
    // The browser's own zone is the one case where the stale path looks right,
    // which is exactly why this shipped.
    assert.ok(disagreements.length >= ZONES.length - 1,
      `the pre-fix formatter must disagree with the crosshair away from the browser zone `
      + `(browser offset ${browserOffsetMin} min; disagreed in ${disagreements.join(', ') || 'none'})`);
  });

  test(`${label} every axis badge site routes through the shared formatter`, () => {
    const src = read(path.join(tree.root, 'modules/drawing-tools-base.js'));
    const callSites = src.split('this.formatAxisTimeLabel(').length - 1;
    assert.equal(callSites, 3,
      `RESOLVER_PRESENT_BUT_UNCALLED: expected the three axis badge sites to call the `
      + `shared formatter, found ${callSites}`);
    // The defect was a local-getter clock, so no badge site may reach for one
    // again. Anchored on the method definition and stripped of comments: a
    // broken anchor or a prose mention must not read as a live defect.
    const defAt = src.indexOf('\n    showAxisHighlights(opts');
    assert.notEqual(defAt, -1,
      'BROKEN_ANCHOR: showAxisHighlights is no longer where this gate looks for it');
    const endAt = src.indexOf('\n    hideAxisHighlights(', defAt);
    assert.notEqual(endAt, -1, 'BROKEN_ANCHOR: the end of the badge region was not found');
    const badgeRegion = src.slice(defAt, endAt)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const banned of ['.getHours()', '.getMinutes()', '.getDate().toString()']) {
      assert.equal(badgeRegion.includes(banned), false,
        `RESOLVER_CALLED_BUT_WRONG: a badge site still reads ${banned}, which is the browser's zone`);
    }
  });

  test(`${label} the OHLC table tool reads the candle in the chart's zone too`, () => {
    const src = read(path.join(tree.root, 'modules/drawing-tools-text.js'));
    const start = src.indexOf('const formatPrice = (price)');
    const end = src.indexOf('const tableRows', start);
    assert.notEqual(start, -1, 'RESOLVER_ABSENT_FROM_TREE: the table tool formatters');
    assert.notEqual(end, -1, 'BROKEN_ANCHOR: the end of the table formatter block was not found');
    const region = src.slice(start, end);
    assert.ok(region.includes('const formatDate = (timestamp)'),
      'RESOLVER_ABSENT_FROM_TREE: the table tool date formatter');
    assert.ok(region.includes('convertToTimezone'),
      'RESOLVER_PRESENT_BUT_UNCALLED: the table tool still formats without the chart zone');
    assert.ok(!/toLocaleDateString\('en-US', \{ month: 'short', day: 'numeric', year: 'numeric' \}\)/.test(region),
      'RESOLVER_CALLED_BUT_WRONG: the table tool still uses a zone-less toLocaleDateString');
  });
}

/**
 * The half the PO asked to be verified separately: not the labels, the bars.
 *
 * A candle honours a zone if the instants it aggregates are the ones that zone
 * would put in that bucket. Labels cannot show this — a bar can be labelled
 * correctly and still contain the wrong hours.
 */
test('the candles themselves: where bucketing follows the zone and where it cannot', () => {
  const chartSrc = read(path.resolve(findRoot(__dirname), 'homepage/public/chart/chart.js'));

  // Intraday: epoch floor is still correct for any zone whose offset is a whole
  // number of minutes. The reported session is 1m, so its BARS were never the
  // TZ-01 defect — only their labels were.
  const bucket = (t, tfMs) => Math.floor(t / tfMs) * tfMs;
  const oneMin = 60_000;
  for (const offsetMin of [0, -240, 330, 570]) {
    const shifted = REPORTED_T + offsetMin * 60_000;
    assert.equal(bucket(shifted, oneMin) - shifted, bucket(REPORTED_T, oneMin) - REPORTED_T,
      'a 1m bar must hold the same 60 seconds in every zone');
  }

  // Daily/weekly: session-calendar is wired. Boundary comes from instrument
  // class (FX → 17:00 America/New_York), not from the timezone dropdown.
  assert.match(chartSrc, /_sessionBucketStart/,
    'RESOLVER_ABSENT_FROM_TREE: daily resample must call the shared session helper');
  assert.match(chartSrc, /_sessionInstrumentClass/,
    'RESOLVER_ABSENT_FROM_TREE: bucket boundary must resolve from instrument identity');
  assert.match(chartSrc, /this\._sessionBucketStart\(candle\.t, timeframe, timeframeMs\)/,
    'RESOLVER_PRESENT_BUT_UNCALLED: _resampleDataFull loop must consume the helper');
  assert.doesNotMatch(
    chartSrc,
    /const candleBucket = Math\.floor\(candle\.t \/ timeframeMs\) \* timeframeMs/,
    'live daily path must not still epoch-floor in _resampleDataFull',
  );
});
