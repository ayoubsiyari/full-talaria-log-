#!/usr/bin/env node
/**
 * A3 live runner — identical session across playback coordinates 1 / 5 / 10
 * on the candidate surface pinned by badge · digest · source SHA.
 *
 *   node scripts/a3-speed-fill-journal-parity-canary.mjs
 *   node scripts/a3-speed-fill-journal-parity-canary.mjs --origin http://31.97.192.82:3000
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dismissCookieBanner,
  loadPuppeteer,
  resolveDeployedFileIds,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  A3_CANDIDATE_B122,
  A3_PLAYBACK_COORDINATES,
  A3_SIGNATURE,
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

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', A3_CANDIDATE_B122.badge)),
  digest: String(argOf('expect-digest', A3_CANDIDATE_B122.digest)),
  sourceCommitSha: String(argOf('expect-sha', A3_CANDIDATE_B122.sourceCommitSha)),
};
const OUT_JSON = path.resolve(repoRoot, argOf('out', 'docs/plan3/evidence/a3-speed-fill-journal-parity-b122.json'));
const SPEEDS = A3_PLAYBACK_COORDINATES.slice();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureLoggedIn(page, origin, email, password) {
  await uiLoginDeployed(page, origin, email, password);
  await page.evaluate(() => {
    try {
      localStorage.setItem('_uid', '1');
      const sid = `a3-canary-${Date.now()}`;
      const prev = localStorage.getItem('u1_backtestingSession');
      if (!prev) {
        localStorage.setItem('u1_backtestingSession', JSON.stringify({
          type: 'standard',
          startBalance: 10000,
          session_id: sid,
          instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
        }));
      }
    } catch (_) { /* ignore */ }
  });
}

async function waitForChartBars(page, minBars = 80, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const meta = await page.evaluate((need) => {
      const ch = window.chart;
      if (!ch) return { ready: false, reason: 'no-chart' };
      const dataLen = Array.isArray(ch.data) ? ch.data.length : 0;
      const rawLen = Array.isArray(ch.rawData) ? ch.rawData.length : 0;
      const fullLen = ch.replaySystem && Array.isArray(ch.replaySystem.fullRawData)
        ? ch.replaySystem.fullRawData.length
        : 0;
      const bars = Math.max(dataLen, rawLen, fullLen);
      return {
        ready: bars >= need,
        bars,
        fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
        build: window.__TALARIA_CHART_BUILD_ID || null,
      };
    }, minBars).catch(() => ({ ready: false, reason: 'evaluate-failed' }));
    if (meta.ready) return meta;
    await sleep(250);
  }
  throw new Error(`timeout waiting for chart bars >= ${minBars}`);
}

async function loadPrimaryFile(page, fileId) {
  const fid = Number(fileId);
  if (!Number.isFinite(fid)) return { ok: false, reason: 'bad-file-id' };
  return page.evaluate(async (id) => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no-chart' };
    let loaded = false;
    if (typeof ch.loadFile === 'function') {
      try {
        await ch.loadFile(id);
        loaded = true;
      } catch (e) {
        return { ok: false, reason: `loadFile-threw:${String(e && e.message || e)}` };
      }
    }
    if (!loaded) {
      try { ch.currentFileId = id; } catch (_) { /* ignore */ }
    }
    return {
      ok: true,
      loaded,
      fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
    };
  }, fid);
}

async function openChart(page, origin, preferredFileId = null) {
  const url = reactParityUrlWithLayout(
    `${origin}/chart/dist-v9/index.html?mode=backtest&a3=session`,
    '1',
  );
  console.error('[a3] openChart');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
    await dismissCookieBanner(page);
    const email = String(process.env.TEST_EMAIL || '').trim();
    const password = String(process.env.TEST_PASSWORD || '').trim();
    await uiLoginDeployed(page, origin, email, password);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  }
  await dismissCookieBanner(page);
  try {
    await waitForDistV9SingleReady(page, 20000);
  } catch (_) {
    console.error('[a3] single-ready soft-timeout; loading deployed file');
  }
  let fileId = preferredFileId;
  if (fileId == null) {
    const files = await resolveDeployedFileIds(page);
    fileId = files.fileIds?.[0] ?? null;
    console.error(`[a3] resolved fileIds=${(files.fileIds || []).join(',')}`);
  }
  if (fileId != null) {
    const load = await loadPrimaryFile(page, fileId);
    console.error('[a3] loadFile', JSON.stringify(load));
  }
  const bars = await waitForChartBars(page, 80, 180000);
  console.error('[a3] bars-ready', JSON.stringify(bars));
  await sleep(800);
  return { url, fileId, bars };
}

async function discoverScenario(page) {
  return page.evaluate(async () => {
    try { window.alert = () => {}; window.confirm = () => true; } catch (_) {}
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const rs = chart && chart.replaySystem;
    if (!chart || !om || !svc || !rs) return { ok: false, reason: 'missing chart/order/replay' };
    if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
      rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
    }
    const full = Array.isArray(rs.fullRawData) && rs.fullRawData.length ? rs.fullRawData
      : Array.isArray(chart.rawData) && chart.rawData.length ? chart.rawData
      : Array.isArray(chart.data) ? chart.data : [];
    if (full.length < 80) return { ok: false, reason: `too few bars: ${full.length}` };
    let chosen = null;
    const lo = Math.max(40, Math.floor(full.length * 0.35));
    const hi = Math.min(full.length - 20, lo + 200);
    for (let startIdx = lo; startIdx < hi; startIdx++) {
      const entry = Number(full[startIdx]?.c);
      if (!Number.isFinite(entry) || entry <= 0) continue;
      const delta = Math.max(entry * 0.00015, 0.0001);
      let buyHit = null;
      let sellHit = null;
      for (let j = startIdx + 1; j < Math.min(full.length, startIdx + 16); j++) {
        if (buyHit == null && Number(full[j]?.h) >= entry + delta) buyHit = j;
        if (sellHit == null && Number(full[j]?.l) <= entry - delta) sellHit = j;
      }
      if (buyHit != null || sellHit != null) {
        const useBuy = buyHit != null && (sellHit == null || buyHit <= sellHit);
        const hitIdx = useBuy ? buyHit : sellHit;
        chosen = {
          startIdx,
          hitIdx,
          direction: useBuy ? 'BUY' : 'SELL',
          entry,
          target: useBuy ? Number(full[hitIdx].h) : Number(full[hitIdx].l),
          delta,
          startT: Number(full[startIdx]?.t),
          fileId: chart.currentFileId != null ? String(chart.currentFileId) : null,
          symbol: String(chart.currentSymbol || chart.symbol || chart.ticker || '') || null,
          timeframe: chart.currentTimeframe != null ? String(chart.currentTimeframe) : null,
        };
        break;
      }
    }
    if (!chosen) return { ok: false, reason: 'no targetable future bar found', fullLen: full.length };
    return {
      ok: true,
      chosen,
      build: window.__TALARIA_CHART_BUILD_ID || null,
      fullLen: full.length,
    };
  });
}

async function runArm(page, speed, chosen) {
  const setup = await page.evaluate(async (payload) => {
    try { window.alert = () => {}; window.confirm = () => true; } catch (_) {}
    const { speedValue, chosen: c } = payload;
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const rs = chart && chart.replaySystem;
    if (!chart || !om || !svc || !rs) return { ok: false, reason: 'missing chart/order/replay' };
    if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
      rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
    }
    if (typeof rs.setPlaybackMode === 'function') {
      try { rs.setPlaybackMode('candle', { restartPlayback: false }); } catch (_) {}
    }
    if (typeof rs.setSpeed === 'function') rs.setSpeed(speedValue);
    else rs.speed = speedValue;

    try {
      if (Array.isArray(om.openPositions)) om.openPositions.length = 0;
      if (Array.isArray(om.closedPositions)) om.closedPositions.length = 0;
      if (Array.isArray(om.pendingOrders)) om.pendingOrders.length = 0;
      if (Array.isArray(om.tradeJournal)) om.tradeJournal.length = 0;
      if (svc) {
        if (Array.isArray(svc.openPositions)) svc.openPositions.length = 0;
        if (Array.isArray(svc.closedPositions)) svc.closedPositions.length = 0;
        if (Array.isArray(svc.closedTrades)) svc.closedTrades.length = 0;
        if (Array.isArray(svc.pendingOrders)) svc.pendingOrders.length = 0;
      }
    } catch (_) { /* ignore */ }

    const full = Array.isArray(rs.fullRawData) && rs.fullRawData.length ? rs.fullRawData
      : Array.isArray(chart.rawData) && chart.rawData.length ? chart.rawData
      : [];
    const startBar = full[c.startIdx];
    const hitBar = full[c.hitIdx];
    if (!startBar || !hitBar) {
      return { ok: false, reason: `bars missing start=${c.startIdx} hit=${c.hitIdx} full=${full.length}` };
    }
    rs.currentIndex = c.startIdx;
    rs.replayTimestamp = Number(startBar.t);
    rs.tickProgress = 0;
    rs.tickElapsedMs = 0;
    rs.animatingCandle = null;
    if (typeof rs.syncCurrentIndexFromReplayTimestamp === 'function') {
      try { rs.syncCurrentIndexFromReplayTimestamp(Number(startBar.t)); } catch (_) {}
    }
    if (typeof rs.goToReplayTimestamp === 'function') {
      try { rs.goToReplayTimestamp(Number(startBar.t)); } catch (_) {}
    }
    rs.currentIndex = c.startIdx;
    rs.replayTimestamp = Number(startBar.t);
    if (typeof chart.updateChartData === 'function') {
      try { chart.updateChartData(); } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 500));
    if (Number(rs.currentIndex) !== Number(c.startIdx)
      && Number(rs.replayTimestamp) !== Number(startBar.t)) {
      return {
        ok: false,
        reason: 'seek-missed-chosen-bar',
        wantIndex: c.startIdx,
        gotIndex: rs.currentIndex ?? null,
        wantTs: Number(startBar.t),
        gotTs: rs.replayTimestamp ?? null,
      };
    }

    const far = c.entry * 0.05;
    const tp = c.direction === 'BUY' ? Number(hitBar.h) : Number(hitBar.l);
    const order = {
      orderType: 'market',
      direction: c.direction,
      side: c.direction,
      type: c.direction,
      quantity: 1,
      entryPrice: c.entry,
      openPrice: c.entry,
      array_base_price: c.entry,
      timestamp: Number(startBar.t),
      stopLoss: c.direction === 'BUY' ? c.entry - far : c.entry + far,
      initialStopLoss: c.direction === 'BUY' ? c.entry - far : c.entry + far,
      takeProfit: Number.isFinite(tp) ? tp : c.target,
    };
    const submitted = svc.submitOrder(order);
    if (typeof rs.play === 'function') rs.play();
    else if (typeof rs.startPlayback === 'function') rs.startPlayback();
    else rs.isPlaying = true;
    return {
      ok: true,
      speed: speedValue,
      chosen: c,
      submitted: submitted ? { id: submitted.id ?? null, orderId: submitted.orderId ?? null } : null,
      speedField: rs.speed ?? null,
      index: rs.currentIndex ?? null,
      replayTimestamp: rs.replayTimestamp ?? null,
      build: window.__TALARIA_CHART_BUILD_ID || null,
    };
  }, { speedValue: speed, chosen });

  if (!setup.ok) return { speed, status: 'VOID', setup };

  const timeoutMs = speed === 1 ? 90000 : speed <= 5 ? 50000 : 35000;
  const started = Date.now();
  let state = null;
  while (Date.now() - started < timeoutMs) {
    state = await page.evaluate(() => {
      const chart = window.chart;
      const om = chart && (chart.orderManager || window.orderManager);
      const svc = om && om.orderService;
      const rs = chart && chart.replaySystem;
      return {
        index: rs?.currentIndex ?? null,
        replayTimestamp: rs?.replayTimestamp ?? null,
        speed: rs?.speed ?? null,
        playing: !!rs?.isPlaying,
        managerOpen: om?.openPositions?.length ?? null,
        managerClosed: om?.closedPositions?.length ?? null,
        managerJournal: om?.tradeJournal?.length ?? null,
        serviceClosed: svc?.closedPositions?.length ?? null,
      };
    });
    if ((state.managerClosed || 0) >= 1
      || (state.managerJournal || 0) >= 1
      || (state.serviceClosed || 0) >= 1) break;
    await sleep(500);
  }

  const raw = await page.evaluate(() => {
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const pickRows = (rows) => (Array.isArray(rows) ? rows.map((r) => ({
      id: r.id ?? null,
      tradeId: r.tradeId ?? r.trade_id ?? r.client_trade_id ?? null,
      orderId: r.orderId ?? r.order_id ?? null,
      ticker: r.ticker ?? r.symbol ?? null,
      direction: r.direction ?? r.side ?? r.type ?? null,
      status: r.status ?? null,
      entryPrice: r.entryPrice ?? r.openPrice ?? r.entry_price ?? null,
      openPrice: r.openPrice ?? null,
      closePrice: r.closePrice ?? r.exitPrice ?? r.close_price ?? null,
      pnl: r.pnl ?? r.profit ?? null,
      quantity: r.quantity ?? r.qty ?? null,
      openTime: r.openTime ?? r.entryTime ?? r.timestamp ?? null,
      closeTime: r.closeTime ?? r.exitTime ?? r.closedAt ?? null,
      closeReason: r.closeReason ?? r.reason ?? r.exitReason ?? null,
      takeProfit: r.takeProfit ?? null,
      stopLoss: r.stopLoss ?? null,
    })) : []);
    return {
      build: window.__TALARIA_CHART_BUILD_ID || null,
      managerClosed: pickRows(om?.closedPositions),
      managerJournal: pickRows(om?.tradeJournal),
      serviceClosed: pickRows(svc?.closedPositions || svc?.closedTrades),
      openPositions: pickRows(om?.openPositions || svc?.openPositions),
    };
  });

  const normalized = {
    closed: raw.managerClosed.map(normalizeMoneyRow),
    journal: raw.managerJournal.map(normalizeMoneyRow),
    serviceClosed: raw.serviceClosed.map(normalizeMoneyRow),
  };
  const transcripts = buildTranscripts(normalized);
  return {
    speed,
    status: (normalized.closed.length || normalized.journal.length || normalized.serviceClosed.length)
      ? 'OBSERVED'
      : 'NO_CLOSE',
    setup,
    finalState: state,
    raw,
    normalized,
    transcripts,
    digest: stableDigest(normalized),
  };
}

const email = String(process.env.TEST_EMAIL || '').trim();
const password = String(process.env.TEST_PASSWORD || '').trim();
if (!email || !password) {
  console.error('A3 canary requires TEST_EMAIL and TEST_PASSWORD');
  process.exit(1);
}

const surface = await readCandidateCoordinates(ORIGIN);
const identity = matchCoordinatePairs(surface, EXPECT);
if (!identity.ok) {
  console.error(JSON.stringify({
    error: 'CANDIDATE_COORDINATE_MISMATCH',
    origin: ORIGIN,
    expected: EXPECT,
    observed: surface,
    identity,
  }, null, 2));
  process.exit(3);
}

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 300000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 960 },
});

let report;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setCacheEnabled(false);
  await ensureLoggedIn(page, ORIGIN, email, password);
  const discoverOpen = await openChart(page, ORIGIN);
  const discovered = await discoverScenario(page);
  if (!discovered.ok) {
    report = {
      signature: A3_SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      status: 'VOID',
      discoverOpen,
      discovered,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 4;
  } else {
    console.error('[a3] scenario', JSON.stringify(discovered.chosen));
    const arms = [];
    for (const speed of SPEEDS) {
      const arm = await runArm(page, speed, discovered.chosen);
      console.error(`[a3] arm${speed} done`, arm.status, arm.transcripts?.digests);
      arms.push(arm);
      await page.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        try { if (rs && typeof rs.pause === 'function') rs.pause(); } catch (_) {}
        try { if (rs) rs.isPlaying = false; } catch (_) {}
      }).catch(() => {});
      await sleep(500);
    }

    const comparison = compareCoordinateTranscripts(arms);
    report = {
      signature: A3_SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      playbackCoordinates: SPEEDS,
      surfaceLabel: `canary ${EXPECT.badge} @ ${ORIGIN}/chart/dist-v9`,
      scenario: discovered.chosen,
      pageBuildDiscover: discovered.build,
      arms,
      comparison: {
        ...comparison,
        closedCounts: arms.map((a) => a.normalized?.closed?.length ?? 0),
        journalCounts: arms.map((a) => a.normalized?.journal?.length ?? 0),
        moneyFieldsBySpeed: Object.fromEntries(
          arms.map((a) => [String(a.speed), a.normalized?.closed?.[0] || a.normalized?.journal?.[0] || null]),
        ),
        pageBuilds: arms.map((a) => a.raw?.build || a.setup?.build || null),
      },
    };
    report.verdict = comparison.ok ? 'PASSED' : 'FAILED — soak/canary blocker';
    console.log(JSON.stringify(report, null, 2));
    if (!comparison.ok) process.exitCode = 2;
  }
} finally {
  await browser.close().catch(() => {});
}

if (report) {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`wrote ${OUT_JSON}`);
}
