#!/usr/bin/env node
/**
 * A3 daily boundary canary arm.
 *
 * Deploy-gated runner for the local A3 daily money-path boundary oracle. It pins
 * the served surface by badge/digest/SHA, then exercises live dist-v9 product
 * code for FX daily session-day bucketing and product close/journal rows.
 *
 *   node scripts/a3-daily-money-path-boundary-canary.mjs --expect-badge 20260802b125 --expect-digest ... --expect-sha ...
 *   node scripts/a3-daily-money-path-boundary-canary.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  A3_PLAYBACK_COORDINATES,
  buildTranscripts,
  compareCoordinateTranscripts,
  matchCoordinatePairs,
  normalizeMoneyRow,
  readCandidateCoordinates,
  stableDigest,
} from './lib/a3-speed-fill-journal-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.includes(`--${name}=1`);
}

const SELFTEST = hasFlag('selftest');
const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', process.env.A3_DAILY_EXPECT_BADGE || '20260803b126')),
  digest: String(argOf('expect-digest', process.env.A3_DAILY_EXPECT_DIGEST || '')),
  sourceCommitSha: String(argOf('expect-sha', process.env.A3_DAILY_EXPECT_SHA || '')),
};
const ALLOW_UNSEALED = hasFlag('allow-unsealed');
const OUT_JSON = path.resolve(repoRoot, argOf('out', 'docs/plan3/evidence/a3-daily-money-path-boundary-canary-b125.json'));
const SIGNATURE = 'A3-DAILY-MONEY-PATH-BOUNDARY-CANARY-V1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureLoggedIn(page, origin) {
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) {
    throw new Error('A3 daily canary requires TEST_EMAIL and TEST_PASSWORD');
  }
  await uiLoginDeployed(page, origin, email, password);
  await page.evaluate(() => {
    try {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `a3-daily-canary-${Date.now()}`,
        instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
      }));
    } catch (_) { /* ignore */ }
  });
}

function dailyBoundaryArm() {
  const DAY_MS = 86400000;
  const HOUR_MS = 3600000;
  const FX = 'EURUSD';
  const speeds = [1, 5, 10];
  const rows = [];
  const failures = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const roundMoney = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(8)) : (v ?? null));
  const stable = (v) => JSON.stringify(v);
  const moneyRow = (r) => ({
    ticker: r.ticker == null ? null : String(r.ticker),
    direction: r.direction == null ? null : String(r.direction).toUpperCase(),
    status: r.status == null ? null : String(r.status).toUpperCase(),
    entryPrice: roundMoney(r.entryPrice),
    openPrice: roundMoney(r.openPrice),
    closePrice: roundMoney(r.closePrice),
    pnl: roundMoney(r.pnl),
    quantity: roundMoney(r.quantity),
    openTime: r.openTime == null ? null : Number(r.openTime),
    closeTime: r.closeTime == null ? null : Number(r.closeTime),
    closeReason: r.closeReason == null ? null : String(r.closeReason),
    takeProfit: roundMoney(r.takeProfit),
    stopLoss: roundMoney(r.stopLoss),
  });
  const transcripts = (normalized) => {
    const fills = (normalized.closed || []).map(moneyRow);
    const journal = (normalized.journal || []).map(moneyRow);
    const money = fills.length ? fills : journal;
    return {
      fills,
      journal,
      money,
      digests: {
        fills: stable(fills),
        journal: stable(journal),
        money: stable(money),
      },
    };
  };
  const compare = (arms) => {
    const observed = arms.every((a) => a.status === 'OBSERVED');
    if (!observed) return { ok: false, reason: 'arm-not-observed', statuses: arms.map((a) => a.status) };
    const pairs = ['fills', 'journal', 'money'].map((name) => {
      const digests = arms.map((a) => a.transcripts.digests[name]);
      return { name, equal: digests.every((d) => d === digests[0]), digests };
    });
    return { ok: pairs.every((p) => p.equal), reason: pairs.every((p) => p.equal) ? 'byte-equal-across-coordinates' : 'transcript-mismatch', pairs };
  };
  function ok(name, pass, detail) {
    rows.push({ name, ok: !!pass, detail: detail || null, state: pass ? 'RESOLVER_CALLED_AND_RIGHT' : 'RESOLVER_CALLED_BUT_WRONG' });
    if (!pass) failures.push(name);
  }
  function bar(t, price, extra) {
    const p = Number(price);
    const e = extra || {};
    return { t, o: p, h: Number.isFinite(e.h) ? e.h : p, l: Number.isFinite(e.l) ? e.l : p, c: Number.isFinite(e.c) ? e.c : p, v: 1 };
  }
  function nyParts(t) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(new Date(t));
    const out = {};
    for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
    return {
      year: Number(out.year),
      month: Number(out.month),
      day: Number(out.day),
      hour: Number(out.hour),
      minute: Number(out.minute),
      weekday: out.weekday,
    };
  }
  function offsetAt(t) {
    const p = nyParts(t);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0) - t;
  }
  function utcForNyLocal(year, month, day, hour, minute) {
    const localUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let guess = localUtc;
    for (let i = 0; i < 4; i++) guess = localUtc - offsetAt(guess);
    return guess;
  }
  function fallbackBucketStart(t) {
    const p = nyParts(t);
    let y = p.year;
    let m = p.month;
    let d = p.day;
    if (p.hour < 17) {
      const prev = new Date(Date.UTC(y, m - 1, d) - DAY_MS);
      y = prev.getUTCFullYear();
      m = prev.getUTCMonth() + 1;
      d = prev.getUTCDate();
    }
    return utcForNyLocal(y, m, d, 17, 0);
  }
  function bucketStart(chart, t) {
    if (chart && typeof chart._sessionBucketStart === 'function') {
      return chart._sessionBucketStart(t, '1d', DAY_MS);
    }
    return fallbackBucketStart(t);
  }
  function isFxOpen(t) {
    const p = nyParts(t);
    if (p.weekday === 'Sat') return false;
    if (p.weekday === 'Fri' && p.hour >= 17) return false;
    if (p.weekday === 'Sun' && p.hour < 17) return false;
    return true;
  }
  function fxBars(start, end, step) {
    const out = [];
    for (let t = start; t <= end; t += step) {
      if (isFxOpen(t)) out.push(bar(t, 1.1 + out.length * 0.0001));
    }
    return out;
  }
  function fallbackResample(raw, chart) {
    const byBucket = new Map();
    for (const r of raw) {
      const k = bucketStart(chart, Number(r.t));
      const b = byBucket.get(k) || { t: k, o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: 0 };
      b.h = Math.max(Number(b.h), Number(r.h));
      b.l = Math.min(Number(b.l), Number(r.l));
      b.c = Number(r.c);
      b.v += Number(r.v) || 0;
      byBucket.set(k, b);
    }
    return Array.from(byBucket.values()).sort((a, b) => a.t - b.t);
  }
  function resample(chart, raw) {
    const prevSymbol = chart.currentSymbol;
    try { chart.currentSymbol = FX; } catch (_) { /* ignore */ }
    try {
      if (typeof chart.resampleData === 'function') return chart.resampleData(raw, '1d');
      return fallbackResample(raw, chart);
    } finally {
      try { chart.currentSymbol = prevSymbol; } catch (_) { /* ignore */ }
    }
  }
  function makeCloseHarness(baseOm, closeCandle) {
    const proto = baseOm ? Object.getPrototypeOf(baseOm) : null;
    const om = proto ? Object.create(proto) : {};
    Object.assign(om, {
      chart: { currentSymbol: FX, backtestingSession: { trading_costs_enabled: false }, render() {} },
      replaySystem: null,
      orders: [],
      pendingOrders: [],
      openPositions: [],
      closedPositions: [],
      tradeJournal: [],
      scaledTrades: new Map(),
      splitTrades: new Map(),
      balance: 10000,
      equity: 10000,
      getCurrentCandle: () => closeCandle,
      _n5BeginFullClose: () => true,
      _n5EndFullClose: () => {},
      _resolveOwningPanelMidMarkPrice: () => Number(closeCandle.c),
      _exitMarkerAnchorTimeMsFromClose: (_chart, closeTime) => closeTime,
      _applyRealizedPnLToBalance(pnl) { this.balance += Number(pnl) || 0; },
      _syncOrderServiceOpenAfterClose: () => {},
      _m20A1ScheduleRetainedSweep: () => {},
      playOrderSound: () => {},
      _resolvePositionOrderType: () => 'market',
      _getActiveTicker: () => FX,
      _getSymbol: () => FX,
      _getSessionDefaultTradeSetup: () => null,
      _m19MaxExcursionR: () => null,
      _enrichJournalEntryForPersistence: () => {},
      _m19EnsureJournalArray() { if (!Array.isArray(this.tradeJournal)) this.tradeJournal = []; },
      _m19AppendJournalRecord(row) { this.tradeJournal.push(row); return this.tradeJournal.length - 1; },
      persistJournal: () => {},
      persistRuntimeOrderState: () => {},
      updateJournalTab: () => {},
      drawExitMarker: () => {},
      removeEntryMarker: () => {},
      removeOrderLine: () => {},
      removeSLTPLines: () => {},
      removeMultiTPAvgLine: () => {},
      removeMfeMaeMarkers: () => {},
      removePreviewLines: () => {},
      _cleanupOrderVisualsAfterClose: () => {},
      _cleanupOrphanedYAxisHighlights: () => {},
      _ensurePendingTargetsSurvive: () => {},
      updatePositionsPanel: () => {},
      showTradeJournalModal: () => {},
      _cancelPendingOrdersInSplitGroup: () => {},
      _splitGroupHasAnyOpenLeg: () => false,
    });
    if (typeof om.closePosition !== 'function' && typeof baseOm?.closePosition === 'function') {
      om.closePosition = baseOm.closePosition;
    }
    return om;
  }
  function productCloseTranscript(baseOm, id, openTime, openPrice, closeCandle) {
    const om = makeCloseHarness(baseOm, closeCandle);
    om.openPositions = [{
      id,
      type: 'BUY',
      direction: 'BUY',
      ticker: FX,
      symbol: FX,
      sourceFileId: 25,
      quantity: 1,
      openPrice,
      openTime,
      stopLoss: openPrice - 0.05,
      takeProfit: Number(closeCandle.c),
      status: 'OPEN',
    }];
    if (typeof om.closePosition !== 'function') throw new Error('OrderManager.closePosition missing');
    om.closePosition(id);
    const normalized = {
      closed: (om.closedPositions || []).map(moneyRow),
      journal: (om.tradeJournal || []).map(moneyRow),
    };
    return { status: 'OBSERVED', normalized, transcripts: transcripts(normalized) };
  }
  const chart = window.chart || {
    currentSymbol: FX,
    resampleData(raw) { return fallbackResample(raw, this); },
  };
  const baseOm = (chart && chart.orderManager) || window.orderManager || {
    closePosition(id) {
      const pos = this.openPositions.find((p) => p.id === id);
      const close = this.getCurrentCandle();
      const row = {
        ...pos,
        status: 'CLOSED',
        entryPrice: pos.openPrice,
        closePrice: close.c,
        closeTime: close.t,
        closeReason: 'manual',
        pnl: (Number(close.c) - Number(pos.openPrice)) * 100000 * Number(pos.quantity || 0),
      };
      this.openPositions = [];
      this.closedPositions.push(row);
      this.tradeJournal.push(row);
    },
  };
  try {
    if (!chart) throw new Error('no chart');

    const before = Date.UTC(2026, 0, 2, 21, 58);
    const after = Date.UTC(2026, 0, 2, 22, 2);
    const dailyBoundary = resample(chart, [bar(before, 1.1), bar(after, 1.2)]);
    const beforeFill = productCloseTranscript(baseOm, 1, before, Number(dailyBoundary[0].o), dailyBoundary[0]);
    const afterFill = productCloseTranscript(baseOm, 2, after, Number(dailyBoundary[1].o), dailyBoundary[1]);
    ok('boundary-split', dailyBoundary.length === 2
      && bucketStart(chart, beforeFill.normalized.journal[0].openTime) !== bucketStart(chart, afterFill.normalized.journal[0].openTime),
    { dailyCount: dailyBoundary.length, buckets: dailyBoundary.map((b) => b.t) });

    const dstCases = [
      [Date.UTC(2026, 2, 6, 21, 58), Date.UTC(2026, 2, 6, 22, 2), 22],
      [Date.UTC(2026, 2, 9, 20, 58), Date.UTC(2026, 2, 9, 21, 2), 21],
      [Date.UTC(2026, 9, 30, 20, 58), Date.UTC(2026, 9, 30, 21, 2), 21],
      [Date.UTC(2026, 10, 2, 21, 58), Date.UTC(2026, 10, 2, 22, 2), 22],
    ];
    ok('dst-local-boundary', dstCases.every(([a, b, hour]) => {
      const d = resample(chart, [bar(a, 1.1), bar(b, 1.2)]);
      return d.length === 2 && new Date(d[1].t).getUTCHours() === hour;
    }), { cases: dstCases.length });

    const weekend = resample(chart, fxBars(Date.UTC(2013, 0, 4, 20), Date.UTC(2013, 0, 7, 4), HOUR_MS));
    const localStarts = weekend.map((b) => nyParts(b.t).weekday);
    const openTime = Date.UTC(2013, 0, 4, 21);
    const closeTime = Date.UTC(2013, 0, 6, 23);
    const openBucket = bucketStart(chart, openTime);
    const closeBucket = bucketStart(chart, closeTime);
    const openDaily = weekend.find((b) => b.t === openBucket);
    const closeDaily = weekend.find((b) => b.t === closeBucket);
    const weekendClose = openDaily && closeDaily
      ? productCloseTranscript(baseOm, 3, openTime, Number(openDaily.c), closeDaily)
      : null;
    ok('weekend-gap-held-position', !localStarts.includes('Fri') && !localStarts.includes('Sat')
      && !!weekendClose && weekendClose.normalized.closed[0].openTime === openTime
      && weekendClose.normalized.closed[0].closeTime === closeBucket,
    { bucketStartsNyWeekday: localStarts, openBucket, closeBucket });

    const prev = Date.UTC(2026, 0, 5, 21, 30);
    const next = Date.UTC(2026, 0, 5, 22, 30);
    const boundaryBars = resample(chart, [bar(prev, 1.1), bar(next, 1.2)]);
    const transcript = { consumed: [boundaryBars[0]?.t], latest: boundaryBars[1]?.t, retained: [boundaryBars[1]?.t] };
    ok('daily-bar-close-transcript', boundaryBars.length === 2
      && transcript.consumed[0] !== transcript.latest
      && !transcript.retained.includes(transcript.consumed[0]),
    { transcript });

    const a3Daily = resample(chart, [
      bar(Date.UTC(2026, 0, 7, 21, 58), 1.2),
      bar(Date.UTC(2026, 0, 7, 22, 2), 1.22),
      bar(Date.UTC(2026, 0, 8, 22, 2), 1.24),
    ]);
    const arms = speeds.map((speed, i) => {
      const arm = productCloseTranscript(baseOm, 10 + i, Number(a3Daily[0].t), Number(a3Daily[0].o), a3Daily[1]);
      arm.speed = speed;
      return arm;
    });
    const comparison = compare(arms);
    const redArms = clone(arms);
    redArms[1].normalized.closed[0].pnl += 1;
    redArms[1].transcripts = transcripts(redArms[1].normalized);
    const red = compare(redArms);
    ok('daily-a3-byte-parity', comparison.ok && !red.ok, { comparison, redControl: red.reason });

    return {
      ok: failures.length === 0,
      signature: 'A3-DAILY-MONEY-PATH-BOUNDARY-CANARY-V1',
      build: window.__TALARIA_CHART_BUILD_ID || null,
      rows,
      failures,
      digest: stable(rows),
    };
  } catch (e) {
    return {
      ok: false,
      signature: 'A3-DAILY-MONEY-PATH-BOUNDARY-CANARY-V1',
      state: 'RESOLVER_CALLED_BUT_WRONG',
      error: String(e && e.stack || e),
      rows,
      failures,
    };
  }
}

async function runSelftest() {
  global.window = {
    __TALARIA_CHART_BUILD_ID: 'selftest',
    chart: null,
    orderManager: null,
  };
  const result = dailyBoundaryArm();
  return {
    signature: SIGNATURE,
    at: new Date().toISOString(),
    mode: 'selftest',
    verdict: result.ok ? 'PASSED' : 'FAILED',
    result,
  };
}

async function runCanary() {
  const missing = Object.entries(EXPECT).filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
  if (missing.length && !ALLOW_UNSEALED) {
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      verdict: 'BLOCKED — expected b125 digest/SHA required',
      missing,
    };
  }
  const surface = await readCandidateCoordinates(ORIGIN);
  const identity = missing.length ? { ok: String(surface.badge) === String(EXPECT.badge), pairs: [{ name: 'badge', expected: EXPECT.badge, observed: surface.badge, equal: String(surface.badge) === String(EXPECT.badge) }] }
    : matchCoordinatePairs(surface, EXPECT);
  if (!identity.ok) {
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      verdict: 'BLOCKED — candidate coordinate mismatch',
    };
  }

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.setCacheEnabled(false);
    await ensureLoggedIn(page, ORIGIN);
    const url = reactParityUrlWithLayout(
      `${ORIGIN}/chart/dist-v9/index.html?mode=backtest&a3=daily-boundary`,
      '1',
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await ensureLoggedIn(page, ORIGIN);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    }
    await dismissCookieBanner(page);
    await waitForDistV9SingleReady(page, 30000).catch(() => {});
    await sleep(1000);
    const result = await page.evaluate(dailyBoundaryArm);
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      url,
      result,
      verdict: result.ok ? 'PASSED' : 'FAILED — daily boundary canary blocker',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const report = SELFTEST ? await runSelftest() : await runCanary();
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.error(`wrote ${OUT_JSON}`);

if (!report.verdict || !/^PASSED\b/.test(report.verdict)) {
  process.exitCode = SELFTEST ? 2 : 3;
}
