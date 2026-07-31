#!/usr/bin/env node
/**
 * SESSION-RESET-PROBE — item 7 (X1 and X2), the measurable halves.
 *
 * Two halves were already settled from source at zero cost and are not re-measured here:
 *   - X1 mechanism: the logout button POSTs /api/auth/logout then sets `window.location.href` to
 *     `/login/?next=...`. That is a cross-document navigation, so the realm IS discarded. The
 *     hypothesis that logout is same-document navigation which never discards the realm is dead.
 *   - Service worker: `chart/sw.js` is a pass-through. It precaches nothing, its fetch handler is
 *     `respondWith(fetch(request))`, and on activate it DELETES every cache. Nothing pins a stale
 *     shell.
 *
 * What source cannot answer, and this measures:
 *   1. Discarding the realm is not the same as returning the memory. Chrome may keep the renderer
 *      process and its allocator arenas warm, so the OS footprint can stay high after a navigation
 *      that legitimately destroyed the document. That difference is exactly the "reset requirement":
 *      whether a user who logs out and back in gets a clean process or an accumulated one.
 *   2. Storage bytes and first-paint cost across three successive sessions in one browser profile.
 *      If either grows per session, the reset is not clean regardless of what the realm did.
 */
import fs from 'node:fs';

import {
  dismissCookieBanner, loadPuppeteer, uiLoginDeployed, waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SESSION-RESET-20260731.json';
const SESSIONS = Number(process.env.C_SESSIONS || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'SESSION-RESET-V1',
  ruling: 'cbfdb81f4 item 7',
  settledFromSourceNotRemeasured: {
    logoutIsCrossDocumentNavigation: 'talaria-v9-live.js: POST /api/auth/logout then window.location.href = /login/?next=... — a cross-document navigation, so the realm is discarded',
    serviceWorkerPinsNothing: 'chart/sw.js precaches nothing, fetch is respondWith(fetch(request)), activate deletes every cache',
  },
  sessions: [],
  startedAtIso: new Date().toISOString(),
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

/** Storage bytes as the page itself can see them, plus what the UA will admit to. */
const storageSource = async () => {
  const out = { localStorageKeys: 0, localStorageBytes: 0, sessionStorageBytes: 0, cookieBytes: 0 };
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      out.localStorageKeys += 1;
      out.localStorageBytes += (k?.length || 0) + (localStorage.getItem(k)?.length || 0);
    }
  } catch { /* blocked */ }
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      out.sessionStorageBytes += (k?.length || 0) + (sessionStorage.getItem(k)?.length || 0);
    }
  } catch { /* blocked */ }
  try { out.cookieBytes = document.cookie.length; } catch { /* blocked */ }
  try {
    const est = await navigator.storage?.estimate?.();
    out.estimateUsageMB = est?.usage != null ? +(est.usage / 1048576).toFixed(2) : null;
    out.estimateQuotaMB = est?.quota != null ? +(est.quota / 1048576).toFixed(0) : null;
  } catch { /* unavailable */ }
  try {
    const dbs = await indexedDB?.databases?.();
    out.indexedDbNames = (dbs || []).map((d) => d.name).slice(0, 12);
  } catch { /* unavailable in some contexts */ }
  try {
    const keys = await caches?.keys?.();
    out.cacheStorageKeys = (keys || []).length;
  } catch { /* unavailable */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    out.serviceWorkerRegistrations = (regs || []).length;
    out.serviceWorkerControlled = !!navigator.serviceWorker?.controller;
  } catch { /* unavailable */ }
  return out;
};

(async () => {
  let browser = null;
  try {
    const origin = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
    const email = String(process.env.TEST_EMAIL || '').trim();
    const password = String(process.env.TEST_PASSWORD || '').trim();
    if (!email || !password) throw new Error('needs TEST_EMAIL and TEST_PASSWORD');

    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
    });
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable').catch(() => {});

    const footprints = async () => {
      try {
        const info = await browserCdp.send('SystemInfo.getProcessInfo');
        const fps = await readOsFootprints((info.processInfo || []).map((p) => p.id));
        let total = 0;
        let renderer = 0;
        for (const p of info.processInfo || []) {
          const fp = fps[p.id];
          if (!fp) continue;
          total += fp.privateMB;
          if (/renderer/i.test(p.type) && fp.privateMB > renderer) renderer = fp.privateMB;
        }
        return { totalPrivateMB: +total.toFixed(1), pageRendererPrivateMB: +renderer.toFixed(1) };
      } catch { return {}; }
    };
    const counters = async () => {
      try {
        const { metrics } = await cdp.send('Performance.getMetrics');
        const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
        return {
          documents: m.Documents ?? null,
          frames: m.Frames ?? null,
          nodes: m.Nodes ?? null,
          listeners: m.JSEventListeners ?? null,
          jsHeapMB: m.JSHeapUsedSize ? +(m.JSHeapUsedSize / 1048576).toFixed(2) : null,
        };
      } catch { return {}; }
    };

    for (let s = 1; s <= SESSIONS; s += 1) {
      const row = { session: s, startedAtIso: new Date().toISOString() };
      const t0 = Date.now();
      await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await dismissCookieBanner(page).catch(() => {});
      await uiLoginDeployed(page, origin, email, password);
      await waitForDistV9SingleReady(page, { timeout: 180_000 }).catch(() => {});
      // Settle before reading, so first paint means painted rather than merely navigated.
      await sleep(8_000);
      row.firstPaintSeconds = +((Date.now() - t0) / 1000).toFixed(1);
      row.buildStamp = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);

      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await sleep(1_200);
      row.atFirstPaint = { ...(await counters()), ...(await footprints()) };
      row.storage = await page.evaluate(storageSource).catch(() => null);
      report.sessions.push(row);
      save();
      console.error(`[reset] session ${s} firstPaint=${row.firstPaintSeconds}s build=${row.buildStamp} heap=${row.atFirstPaint.jsHeapMB}MB foot=${row.atFirstPaint.totalPrivateMB}MB docs=${row.atFirstPaint.documents} lsBytes=${row.storage?.localStorageBytes}`);

      // Log out through the product's own control path, not by clearing cookies, so what is measured
      // is what a user actually does.
      const loggedOut = await page.evaluate(async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
        window.location.href = '/login/';
        return true;
      }).catch(() => false);
      row.logoutIssued = loggedOut;
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await sleep(6_000);
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await sleep(2_000);
      row.afterLogout = { ...(await counters()), ...(await footprints()) };
      row.afterLogout.storage = await page.evaluate(storageSource).catch(() => null);
      row.footprintReclaimedMB = (row.atFirstPaint.totalPrivateMB != null && row.afterLogout.totalPrivateMB != null)
        ? +(row.atFirstPaint.totalPrivateMB - row.afterLogout.totalPrivateMB).toFixed(1) : null;
      save();
      console.error(`[reset] session ${s} after logout: heap=${row.afterLogout.jsHeapMB}MB foot=${row.afterLogout.totalPrivateMB}MB docs=${row.afterLogout.documents} reclaimed=${row.footprintReclaimedMB}MB`);
    }
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    try { await browser?.close(); } catch { /* gone */ }
  }

  // ---- Grade ---------------------------------------------------------------
  const ss = report.sessions.filter((r) => r.atFirstPaint?.totalPrivateMB != null);
  if (ss.length >= 2) {
    const first = ss[0];
    const last = ss[ss.length - 1];
    const perSession = (k, get) => ss.map(get);
    report.grade = {
      sessions: ss.length,
      firstPaintSecondsBySession: perSession('t', (r) => r.firstPaintSeconds),
      footprintAtFirstPaintBySession: perSession('f', (r) => r.atFirstPaint.totalPrivateMB),
      heapAtFirstPaintBySession: perSession('h', (r) => r.atFirstPaint.jsHeapMB),
      documentsAtFirstPaintBySession: perSession('d', (r) => r.atFirstPaint.documents),
      localStorageBytesBySession: perSession('l', (r) => r.storage?.localStorageBytes ?? null),
      footprintReclaimedOnLogoutBySession: perSession('r', (r) => r.footprintReclaimedMB),
      serviceWorkerRegistrations: last.storage?.serviceWorkerRegistrations ?? null,
      serviceWorkerControlled: last.storage?.serviceWorkerControlled ?? null,
      cacheStorageKeys: last.storage?.cacheStorageKeys ?? null,
    };
    const g = report.grade;
    const footGrew = g.footprintAtFirstPaintBySession[g.sessions - 1] - g.footprintAtFirstPaintBySession[0];
    const storGrew = (g.localStorageBytesBySession[g.sessions - 1] ?? 0) - (g.localStorageBytesBySession[0] ?? 0);
    const paintGrew = (g.firstPaintSecondsBySession[g.sessions - 1] ?? 0) - (g.firstPaintSecondsBySession[0] ?? 0);
    g.footprintGrowthAcrossSessionsMB = +footGrew.toFixed(1);
    g.storageGrowthAcrossSessionsBytes = storGrew;
    g.firstPaintGrowthAcrossSessionsSeconds = +paintGrew.toFixed(1);
    g.resetIsClean = Math.abs(footGrew) < 60 && storGrew < 50_000 && paintGrew < 3;
    g.verdict = g.resetIsClean
      ? `RESET IS CLEAN across ${g.sessions} sessions in one profile: first-paint footprint moved ${g.footprintGrowthAcrossSessionsMB} MB, stored bytes moved ${g.storageGrowthAcrossSessionsBytes}, first paint moved ${g.firstPaintGrowthAcrossSessionsSeconds}s. Logging out and back in does not accumulate.`
      : `RESET IS NOT CLEAN: across ${g.sessions} sessions first-paint footprint moved ${g.footprintGrowthAcrossSessionsMB} MB, stored bytes ${g.storageGrowthAcrossSessionsBytes}, first paint ${g.firstPaintGrowthAcrossSessionsSeconds}s. Something survives a logout and a fresh login.`;
    // The distinction that matters: the realm IS discarded (source), but was the memory returned?
    const reclaimed = g.footprintReclaimedOnLogoutBySession.filter((v) => v != null);
    if (reclaimed.length) {
      const mean = reclaimed.reduce((t, v) => t + v, 0) / reclaimed.length;
      g.meanFootprintReclaimedOnLogoutMB = +mean.toFixed(1);
      g.realmDiscardedButMemoryHeld = mean < 50;
      g.reclaimNote = mean < 50
        ? `Logout discards the realm but returns only ${g.meanFootprintReclaimedOnLogoutMB} MB on average. Destroying a document is not the same as returning its memory: the renderer process and its allocator arenas stay warm, so a user who logs out does NOT get a fresh footprint.`
        : `Logout returns ${g.meanFootprintReclaimedOnLogoutMB} MB on average, so the navigation does release the bulk of the session.`;
    }
  }
  save();

  console.error(`\n=== SESSION RESET ${report.status} ===`);
  if (report.grade) {
    console.error(JSON.stringify(report.grade, null, 1));
    console.error(`\n${report.grade.verdict}`);
    if (report.grade.reclaimNote) console.error(report.grade.reclaimNote);
  }
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
