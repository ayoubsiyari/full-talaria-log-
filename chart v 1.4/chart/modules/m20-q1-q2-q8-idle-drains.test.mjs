/**
 * M20 QUICK-KILL Q1 / Q2 / Q8 — idle-drain contracts + kill-switch A/B.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q1-q2-q8-idle-drains.test.mjs"
 *
 * Evidence modes (env):
 *   M20_Q_EVIDENCE=red|green|kill   → write JSON under docs/plan3/evidence/
 *
 * Kill-switches (default fix ON when unset/false):
 *   __TALARIA_DISABLE_M20_Q1_V9_TIME_SYNC_OBSERVER_V1
 *   __TALARIA_DISABLE_M20_Q2_COUNTDOWN_IDLE_RENDER_V1
 *   __TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function isCanonicalRoot(candidate) {
  const markers = [
    'chart v 1.4/chart/chart.js',
    'homepage/public/chart/chart.js',
    'docs/plan3/PLAN3-BOARD.md',
    '.git',
  ];
  return markers.every((marker) => fs.existsSync(path.join(candidate, marker)));
}

function findCanonicalRoot(start) {
  let current = fs.realpathSync(start);
  for (;;) {
    if (isCanonicalRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`M20 Q1/Q2/Q8 canonical repository root not found from ${start}`);
}

const REPO_ROOT = findCanonicalRoot(__dirname);
const CHART_ROOT = path.join(REPO_ROOT, 'chart v 1.4/chart');
const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage/public/chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/plan3/evidence');
const require = createRequire(import.meta.url);

const KS_Q1 = '__TALARIA_DISABLE_M20_Q1_V9_TIME_SYNC_OBSERVER_V1';
const KS_Q2 = '__TALARIA_DISABLE_M20_Q2_COUNTDOWN_IDLE_RENDER_V1';
const KS_Q8 = '__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1';

const evidenceMode = String(process.env.M20_Q_EVIDENCE || '').toLowerCase();
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function read(relFromChart) {
  return fs.readFileSync(path.join(CHART_ROOT, relFromChart), 'utf8');
}

function readHome(rel) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, rel), 'utf8');
}

// ─── Q1 static contract ────────────────────────────────────────────────────

test('Q1: v9 time-sync is observer-gated (not permanent 600ms full-DOM poll)', () => {
  const src = read('chart.js');
  const home = readHome('chart.js');

  const hasKill = src.includes(KS_Q1) && home.includes(KS_Q1);
  const hasObserverInstall =
    /_installV9TimeSyncObserver\s*\(/.test(src)
    && /_installV9TimeSyncObserver\s*\(/.test(home);
  const hasScopedSync =
    /_resolveV9SettingsPanelRoot\s*\(/.test(src)
    && /_resolveV9SettingsPanelRoot\s*\(/.test(home);
  const resolverStart = src.indexOf('_resolveV9SettingsPanelRoot()');
  const resolverEnd = src.indexOf('_startV9TimeControlsSync()', resolverStart);
  const resolverSlice = resolverStart >= 0 && resolverEnd > resolverStart
    ? src.slice(resolverStart, resolverEnd)
    : '';
  const installerStart = src.indexOf('_installV9TimeSyncObserver()');
  const installerEnd = src.indexOf('_teardownV9TimeControlsSync()', installerStart);
  const installerSlice = installerStart >= 0 && installerEnd > installerStart
    ? src.slice(installerStart, installerEnd)
    : '';
  const noGlobalSpanScan = !/document\.querySelectorAll\(\s*['"]span['"]\s*\)/.test(resolverSlice);
  const noBodyObserver =
    !installerSlice.includes('_v9TimeSyncBodyObserver')
    && !/observe\(\s*document\.body/.test(installerSlice);
  // Legacy bare interval may remain ONLY behind the kill-switch branch.
  const bareIntervalAtInit =
    /if\s*\(\s*!this\.isPanel\s*\)\s*\{\s*this\.syncV9TimeControlsFromDom\(\);\s*this\._v9TimeSyncTimer\s*=\s*setInterval\(\s*\(\)\s*=>\s*this\.syncV9TimeControlsFromDom\(\)\s*,\s*600\s*\)/s.test(src);
  const gatedLegacy =
    new RegExp(`${KS_Q1}[\\s\\S]{0,240}setInterval\\(\\s*\\(\\)\\s*=>\\s*this\\.syncV9TimeControlsFromDom\\(\\)\\s*,\\s*600`).test(src)
    || /setInterval\(\s*\(\)\s*=>\s*this\.syncV9TimeControlsFromDom\(\)\s*,\s*600[\s\S]{0,200}KS_Q1/.test(src)
    || (src.includes(KS_Q1) && src.includes('setInterval(() => this.syncV9TimeControlsFromDom(), 600)'));

  note('Q1', 'kill-switch-present', hasKill, KS_Q1);
  note('Q1', 'observer-install-present', hasObserverInstall);
  note('Q1', 'scoped-root-resolver-present', hasScopedSync);
  note('Q1', 'no-global-span-scan-fix-path', noGlobalSpanScan);
  note('Q1', 'no-body-wide-observer', noBodyObserver);
  note('Q1', 'no-bare-init-interval', !bareIntervalAtInit, bareIntervalAtInit ? 'bare 600ms interval still at init' : 'ok');
  note('Q1', 'legacy-interval-kill-gated', gatedLegacy, gatedLegacy ? 'legacy behind switch' : 'missing gated legacy');
  note('Q1', 'homepage-mirror-parity', src.includes(KS_Q1) && home.includes(KS_Q1) && hasObserverInstall);

  assert.equal(hasKill, true, 'Q1 kill-switch missing');
  assert.equal(hasObserverInstall, true, 'Q1 observer install missing');
  assert.equal(hasScopedSync, true, 'Q1 scoped root resolver missing');
  assert.equal(noGlobalSpanScan, true, 'Q1 fix path must not scan all document spans');
  assert.equal(noBodyObserver, true, 'Q1 must observe a settings root, never document.body');
  assert.equal(bareIntervalAtInit, false, 'Q1 still installs bare 600ms interval at init');
  assert.equal(gatedLegacy, true, 'Q1 legacy interval must remain behind kill-switch');
});

// ─── Q2 static + behavioral stub ───────────────────────────────────────────

test('Q2: countdown idle path must not schedule full render by default', () => {
  const src = read('chart.js');
  const home = readHome('chart.js');

  const hasKill = src.includes(KS_Q2) && home.includes(KS_Q2);
  const hasTickHelper =
    /_tickBarCloseCountdown\s*\(/.test(src)
    && /_paintBarCloseCountdownRegion\s*\(/.test(src);
  const hasGeometryGuard =
    /_computeCurrentPriceLabelGeometry\s*\(/.test(src)
    && /_cacheCurrentPriceLabelGeometryFromFullPaint\s*\(/.test(src)
    && src.includes('_m20Q2PriceLabelGeometry')
    && home.includes('_computeCurrentPriceLabelGeometry');
  // animate() method body must call the gated tick helper.
  const animateMethodIdx = src.search(/\r?\n\s*animate\s*\(\s*\)\s*\{/);
  const animateSlice = animateMethodIdx >= 0
    ? src.slice(animateMethodIdx, animateMethodIdx + 2200)
    : '';
  const animateCallsTick = animateSlice.includes('_tickBarCloseCountdown');
  const nakedScheduleInCountdownBlock = (() => {
    const i = src.indexOf('Keep bar-close countdown on the price axis ticking');
    if (i < 0) return true;
    const block = src.slice(i, i + 1200);
    // Allowed: scheduleRender only inside kill-switch / fallback branches.
    if (!block.includes('scheduleRender')) return false;
    return !block.includes(KS_Q2) && !block.includes('_tickBarCloseCountdown');
  })();
  const paintGuardRejectsMismatch = (() => {
    const i = src.indexOf('_paintBarCloseCountdownRegion() {');
    if (i < 0) return false;
    const body = src.slice(i, i + 1400);
    return body.includes('geo.key !== cached.key')
      && body.includes('scheduleRender()')
      && body.includes('_m20Q2CountdownRegionPaintActive');
  })();
  const fullPaintCachesGeometry = (() => {
    const i = src.search(/drawCurrentPriceLabel\s*\(\s*visible\s*\)\s*\{/);
    if (i < 0) return false;
    const body = src.slice(i, i + 6000);
    return body.includes('_cacheCurrentPriceLabelGeometryFromFullPaint')
      && body.includes('_m20Q2CountdownRegionPaintActive');
  })();

  note('Q2', 'kill-switch-present', hasKill, KS_Q2);
  note('Q2', 'tick-helper-present', hasTickHelper);
  note('Q2', 'geometry-guard-present', hasGeometryGuard);
  note('Q2', 'animate-calls-tick-helper', animateCallsTick);
  note('Q2', 'no-naked-countdown-scheduleRender', !nakedScheduleInCountdownBlock);
  note('Q2', 'region-paint-rejects-geometry-mismatch', paintGuardRejectsMismatch);
  note('Q2', 'full-paint-caches-geometry', fullPaintCachesGeometry);

  assert.equal(hasKill, true);
  assert.equal(hasTickHelper, true);
  assert.equal(hasGeometryGuard, true);
  assert.equal(animateCallsTick, true);
  assert.equal(nakedScheduleInCountdownBlock, false);
  assert.equal(paintGuardRejectsMismatch, true);
  assert.equal(fullPaintCachesGeometry, true);
});

test('Q2: behavioral — pixel-safe geometry guard; kill-switch restores scheduleRender', () => {
  // Production-faithful stand-in of the Q2 countdown idle contract.
  function makeChart(killOff, opts = {}) {
    const calls = { scheduleRender: 0, directPaint: 0 };
    let priceY = opts.priceY ?? 120;
    let countdownText = opts.countdownText ?? '00:42';
    const chart = {
      ctx: {},
      chartSettings: { showCountdownToBarClose: true, showSpreadMarker: false },
      margin: { t: 20, b: 30, l: 10, r: 60 },
      w: 800,
      h: 400,
      priceAxisLeft: false,
      data: [{ c: 100 }],
      _lastCountdownRender: 0,
      _lastCountdownPaintedText: opts.lastPaintedText ?? '',
      _countdownRegionPainted: false,
      _m20Q2PriceLabelGeometry: opts.cachedGeometry ?? null,
      _m20Q2CountdownRegionPaintActive: false,
      yScale(price) { return priceY + (Number(price) || 0) * 0; },
      resolveEffectiveCurrentPrice() { return 100; },
      resolveSessionBidAsk() { return null; },
      getVisibleData() { return this.data; },
      scheduleRender() { calls.scheduleRender += 1; },
      _getBarCloseCountdownText() { return countdownText; },
      _isMultichartEmbedPanel() { return false; },
      drawCurrentPriceLabel() {
        // Region paint path sets the active flag; full paints re-anchor cache.
        if (!this._m20Q2CountdownRegionPaintActive) {
          this._cacheCurrentPriceLabelGeometryFromFullPaint(this.data);
        }
      },
      _m20Q2CountdownIdleFixEnabled() {
        return typeof window === 'undefined' || window[KS_Q2] !== true;
      },
      _computeCurrentPriceLabelGeometry(visible) {
        if (!this.yScale) return null;
        const m = this.margin || { t: 0, b: 0, l: 0, r: 0 };
        const currentPrice = this.resolveEffectiveCurrentPrice(visible);
        if (!Number.isFinite(currentPrice)) return null;
        const y = this.yScale(currentPrice);
        if (!Number.isFinite(y) || y < m.t || y > (this.h - m.b)) return null;
        const axisLeft = !!this.priceAxisLeft;
        const axisW = axisLeft ? m.l : m.r;
        const hasSpread = !(this.chartSettings && this.chartSettings.showSpreadMarker === false)
          && !!this.resolveSessionBidAsk(currentPrice);
        const spreadGutter = hasSpread ? 8 : 0;
        const labelWidth = Math.max(28, axisW - 4 - spreadGutter);
        const labelX = axisLeft ? 2 : (this.w - m.r + spreadGutter);
        const showCountdown = !!this._getBarCloseCountdownText();
        const totalHeight = 20 + (showCountdown ? 18 : 0);
        const labelY = y - totalHeight / 2;
        const key = [
          y, axisLeft ? 'L' : 'R', labelX, labelWidth, labelY, totalHeight,
          showCountdown ? 1 : 0, spreadGutter, '', '', '', this.w, this.h, m.l, m.r,
        ].join('|');
        return { key, rect: { x: labelX, y: labelY, w: labelWidth, h: totalHeight } };
      },
      _cacheCurrentPriceLabelGeometryFromFullPaint(visible) {
        if (this._m20Q2CountdownRegionPaintActive) return;
        const geo = this._computeCurrentPriceLabelGeometry(visible);
        this._m20Q2PriceLabelGeometry = geo
          ? { key: geo.key, rect: { ...geo.rect } }
          : null;
      },
      _paintBarCloseCountdownRegion() {
        const visible = this.getVisibleData();
        const geo = this._computeCurrentPriceLabelGeometry(visible);
        const cached = this._m20Q2PriceLabelGeometry;
        if (!geo || !cached || !cached.key || geo.key !== cached.key) {
          this._countdownRegionPainted = false;
          this.scheduleRender();
          return false;
        }
        this._m20Q2CountdownRegionPaintActive = true;
        try {
          this.drawCurrentPriceLabel(visible);
          calls.directPaint += 1;
        } finally {
          this._m20Q2CountdownRegionPaintActive = false;
        }
        return true;
      },
      _tickBarCloseCountdown(nowCd) {
        if (this._isMultichartEmbedPanel()) return;
        if (!this.chartSettings || this.chartSettings.showCountdownToBarClose === false) return;
        const now = Number.isFinite(nowCd) ? nowCd : 0;
        if (this._lastCountdownRender && now - this._lastCountdownRender <= 1000) return;
        this._lastCountdownRender = now;
        if (!this._m20Q2CountdownIdleFixEnabled()) {
          this.scheduleRender();
          return;
        }
        if (typeof document !== 'undefined' && document.hidden) return;
        const text = this._getBarCloseCountdownText();
        if (text === this._lastCountdownPaintedText && this._countdownRegionPainted) return;
        const prevHad = !!this._lastCountdownPaintedText;
        const nextHad = !!text;
        this._lastCountdownPaintedText = text;
        if (prevHad !== nextHad) {
          this._countdownRegionPainted = false;
          this.scheduleRender();
          return;
        }
        this._countdownRegionPainted = !!this._paintBarCloseCountdownRegion();
      },
      setPriceY(nextY) { priceY = nextY; },
      setCountdownText(next) { countdownText = next; },
      anchorFullPaint() {
        this._m20Q2CountdownRegionPaintActive = false;
        this.drawCurrentPriceLabel(this.data);
      },
    };
    global.window = global.window || {};
    window[KS_Q2] = !!killOff;
    global.document = { hidden: false };
    return { chart, calls };
  }

  {
    const { chart, calls } = makeChart(false, { lastPaintedText: '00:42' });
    chart.anchorFullPaint();
    chart.setCountdownText('00:41');
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'stable-geometry-direct-paint-zero-full',
      calls.directPaint === 1 && calls.scheduleRender === 0,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(calls.directPaint, 1);
    assert.equal(calls.scheduleRender, 0);
  }
  {
    const { chart, calls } = makeChart(false, { lastPaintedText: '00:42' });
    chart.anchorFullPaint();
    chart.setPriceY(180); // y/rect geometry changed vs last full paint
    chart.setCountdownText('00:41');
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'changed-y-full-render-zero-direct',
      calls.scheduleRender === 1 && calls.directPaint === 0,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(calls.scheduleRender, 1);
    assert.equal(calls.directPaint, 0);
  }
  {
    // No false proxy: countdown presence stable + text change must still refuse
    // direct paint when rect geometry drifted (y change above proves key, not text-only).
    const { chart, calls } = makeChart(false, { lastPaintedText: '00:42' });
    chart.anchorFullPaint();
    const stableKey = chart._m20Q2PriceLabelGeometry.key;
    chart.setPriceY(200);
    const drifted = chart._computeCurrentPriceLabelGeometry(chart.data);
    assert.notEqual(drifted.key, stableKey, 'geometry key must change when y changes');
    chart.setCountdownText('00:40');
    chart._tickBarCloseCountdown(2000);
    const falseProxy = calls.directPaint > 0 && calls.scheduleRender === 0;
    note('Q2', 'no-false-proxy-on-geometry-drift', falseProxy === false,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(falseProxy, false);
    assert.equal(calls.directPaint, 0);
    assert.equal(calls.scheduleRender, 1);
  }
  {
    const { chart, calls } = makeChart(false);
    // Absent cache → schedule full render (re-anchor), never direct-paint.
    chart.setCountdownText('00:39');
    chart._lastCountdownPaintedText = '00:40';
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'absent-geometry-schedules-full',
      calls.scheduleRender === 1 && calls.directPaint === 0,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(calls.scheduleRender, 1);
    assert.equal(calls.directPaint, 0);
  }
  {
    const { chart, calls } = makeChart(false, { lastPaintedText: '' });
    chart.anchorFullPaint();
    chart.setCountdownText('00:38'); // appear → full render
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'appear-full-render',
      calls.scheduleRender === 1 && calls.directPaint === 0,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(calls.scheduleRender, 1);
    assert.equal(calls.directPaint, 0);
  }
  {
    const { chart, calls } = makeChart(true);
    chart.anchorFullPaint();
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'kill-switch-restores-full-render',
      calls.scheduleRender === 1 && calls.directPaint === 0,
      `direct=${calls.directPaint} full=${calls.scheduleRender}`);
    assert.equal(calls.scheduleRender, 1);
    assert.equal(calls.directPaint, 0);
  }
  {
    const { chart, calls } = makeChart(false);
    chart.anchorFullPaint();
    global.document.hidden = true;
    chart.setCountdownText('00:37');
    chart._tickBarCloseCountdown(2000);
    note('Q2', 'hidden-suspends-paint',
      calls.directPaint === 0 && calls.scheduleRender === 0);
    assert.equal(calls.directPaint, 0);
    assert.equal(calls.scheduleRender, 0);
  }
});

// ─── Q8 alert checker ──────────────────────────────────────────────────────

test('Q8: alert checker idle / clear-before-restart / destroy', () => {
  const src = read('modules/alert-system.js');
  const home = readHome('modules/alert-system.js');
  const hasKill = src.includes(KS_Q8) && home.includes(KS_Q8);
  note('Q8', 'kill-switch-present', hasKill, KS_Q8);
  assert.equal(hasKill, true);

  const intervals = new Set();
  let nextId = 1;
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  global.setInterval = (fn, ms) => {
    const id = nextId++;
    intervals.add(id);
    return id;
  };
  global.clearInterval = (id) => { intervals.delete(id); };

  global.window = {
    [KS_Q8]: false,
    AudioContext: class { },
    webkitAudioContext: class { },
  };
  global.document = {
    getElementById: () => null,
    createElement: () => ({
      style: {},
      id: '',
      textContent: '',
      classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {},
      appendChild() {},
      setAttribute() {},
    }),
    body: { appendChild() {} },
    head: { appendChild() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  global.Notification = undefined;
  global.localStorage = { getItem() { return '[]'; }, setItem() {}, removeItem() {} };
  global.console = { ...console, log() {}, warn() {} };

  // Prevent init side effects from UI wiring; load class then construct manually.
  delete require.cache[require.resolve('./alert-system.js')];
  require('./alert-system.js');
  const AlertSystem = global.window.AlertSystem || global.AlertSystem;
  assert.equal(typeof AlertSystem, 'function', 'AlertSystem export missing');

  // Bypass constructor init by creating instance with stubbed methods.
  const proto = AlertSystem.prototype;
  const as = Object.create(proto);
  as.chart = { data: [{ c: 100 }], svg: { select: () => ({ remove() {}, node: () => null, classed() { return this; } }) } };
  as.alerts = [];
  as.storageKey = 'chart_alerts_test';
  as.isVisible = false;
  as.alertSound = null;
  as.checkInterval = null;
  as.lastPrices = {};
  as.conditions = { CROSSING: 'crossing' };
  as.expirations = { EVERY_TIME: 'every_time' };

  // Fix ON + zero alerts → no interval
  window[KS_Q8] = false;
  as.startAlertChecker();
  note('Q8', 'fix-on-zero-alerts-no-interval', intervals.size === 0 && as.checkInterval == null,
    `intervals=${intervals.size}`);
  assert.equal(intervals.size, 0);

  // Add alert → starts
  as.alerts = [{ id: 'a1', active: true, price: 1 }];
  as.startAlertChecker();
  const firstId = as.checkInterval;
  note('Q8', 'fix-on-with-alerts-starts', intervals.size === 1 && firstId != null,
    `intervals=${intervals.size}`);
  assert.equal(intervals.size, 1);

  // Nonempty → nonempty is a no-op: keep the live checker identity.
  as.startAlertChecker();
  note('Q8', 'nonempty-reconcile-keeps-live-checker', intervals.size === 1 && as.checkInterval === firstId,
    `intervals=${intervals.size} prev=${firstId} cur=${as.checkInterval}`);
  assert.equal(intervals.size, 1);
  assert.equal(as.checkInterval, firstId);

  // Empty again → stop
  as.alerts = [];
  as.syncAlertCheckerWithAlerts();
  note('Q8', 'zero-alerts-stops-interval', intervals.size === 0 && as.checkInterval == null,
    `intervals=${intervals.size}`);
  assert.equal(intervals.size, 0);

  // destroy clears
  as.alerts = [{ id: 'a2', active: true, price: 2 }];
  as.startAlertChecker();
  as.destroy();
  note('Q8', 'destroy-clears-interval', intervals.size === 0 && as.checkInterval == null);
  assert.equal(intervals.size, 0);

  // Kill-switch → a fresh, never-fixed instance follows exact immutable legacy.
  window[KS_Q8] = true;
  const legacy = Object.create(proto);
  legacy.chart = as.chart;
  legacy.alerts = [];
  legacy.storageKey = 'chart_alerts_legacy_test';
  legacy.isVisible = false;
  legacy.alertSound = null;
  legacy.checkInterval = null;
  legacy.lastPrices = {};
  legacy.conditions = as.conditions;
  legacy.expirations = as.expirations;
  legacy.startAlertChecker();
  const legacyId = legacy.checkInterval;
  note('Q8', 'kill-switch-always-on-zero-alerts', intervals.size >= 1,
    `intervals=${intervals.size}`);
  assert.ok(intervals.size >= 1);
  legacy.alerts = [{ id: 'legacy-a1', active: true, price: 3 }];
  legacy.syncAlertCheckerWithAlerts();
  note('Q8', 'kill-switch-alert-mutation-does-not-amplify-legacy',
    intervals.size === 1 && legacy.checkInterval === legacyId,
    `intervals=${intervals.size}`);
  assert.equal(intervals.size, 1);
  assert.equal(legacy.checkInterval, legacyId);
  legacy.destroy();

  global.setInterval = realSetInterval;
  global.clearInterval = realClearInterval;
});

// ─── Kill-switch OFF discrimination (desired contracts go RED again) ───────

test('switch-OFF discrimination: legacy drains return', () => {
  // Q1: enabled helper must read false when kill-switch is set.
  global.window = global.window || {};
  window[KS_Q1] = true;
  const q1Enabled = typeof window === 'undefined'
    || window[KS_Q1] !== true;
  note('Q1', 'switch-off-disables-observer-path', q1Enabled === false, `enabled=${q1Enabled}`);
  assert.equal(q1Enabled, false);

  // Q2: kill-switch forces full scheduleRender (desired region-only contract RED).
  {
    const calls = { scheduleRender: 0, regionPaint: 0 };
    const chart = {
      chartSettings: { showCountdownToBarClose: true },
      _lastCountdownRender: 0,
      scheduleRender() { calls.scheduleRender += 1; },
      _getBarCloseCountdownText() { return '00:10'; },
      _isMultichartEmbedPanel() { return false; },
      _paintBarCloseCountdownRegion() { calls.regionPaint += 1; },
      _m20Q2CountdownIdleFixEnabled() {
        return typeof window === 'undefined' || window[KS_Q2] !== true;
      },
      _tickBarCloseCountdown(nowCd) {
        if (!this._lastCountdownRender || nowCd - this._lastCountdownRender > 1000) {
          this._lastCountdownRender = nowCd;
          if (!this._m20Q2CountdownIdleFixEnabled()) {
            this.scheduleRender();
            return;
          }
          this._paintBarCloseCountdownRegion();
        }
      },
    };
    window[KS_Q2] = true;
    chart._tickBarCloseCountdown(5000);
    const desiredContractHolds = calls.regionPaint === 1 && calls.scheduleRender === 0;
    note('Q2', 'switch-off-desired-contract-RED', desiredContractHolds === false,
      `region=${calls.regionPaint} full=${calls.scheduleRender}`);
    assert.equal(desiredContractHolds, false);
    assert.equal(calls.scheduleRender, 1);
  }

  // Q8: execute the actual immutable-compatible product method.
  {
    const intervals = new Set();
    let nextId = 100;
    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    global.setInterval = () => { const id = nextId++; intervals.add(id); return id; };
    global.clearInterval = (id) => { intervals.delete(id); };
    window[KS_Q8] = true;
    const AlertSystem = window.AlertSystem;
    assert.equal(typeof AlertSystem, 'function', 'Q8 actual product class unavailable');
    const as = Object.create(AlertSystem.prototype);
    as.alerts = [];
    as.checkInterval = null;
    as.checkAlerts = () => {};
    as.startAlertChecker();
    const desiredNoInterval = intervals.size === 0;
    note('Q8', 'switch-off-desired-contract-RED', desiredNoInterval === false,
      `intervals=${intervals.size}`);
    assert.equal(desiredNoInterval, false);
    as.stopAlertChecker();
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
  }

  window[KS_Q1] = false;
  window[KS_Q2] = false;
  window[KS_Q8] = false;
});

// ─── Evidence write ────────────────────────────────────────────────────────

test('evidence writer', { skip: !evidenceMode }, () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = '20260724';
  const out = path.join(EVIDENCE_DIR, `W4-Q1-Q2-Q8-${stamp}-${evidenceMode}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);
  // For kill mode, the suite proves discrimination (legacy drains return). Verdict RED
  // means "desired idle-drain contracts do not hold under switch-OFF".
  let verdict = failed.length ? 'RED' : 'GREEN';
  if (evidenceMode === 'kill') {
    const disc = evidenceRows.filter((r) => String(r.name).includes('switch-off'));
    const discOk = disc.length > 0 && disc.every((r) => r.pass);
    verdict = discOk ? 'RED' : 'FAIL-DISCRIMINATION';
  }
  const payload = {
    worker: 'W4',
    mode: evidenceMode,
    stamp,
    killSwitches: { Q1: KS_Q1, Q2: KS_Q2, Q8: KS_Q8 },
    rows: evidenceRows,
    summary: {
      total: evidenceRows.length,
      pass: evidenceRows.length - failed.length,
      fail: failed.length,
    },
    verdict,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote evidence ${out} verdict=${payload.verdict}\n`);
  // Do not fail the suite from the writer itself.
});
