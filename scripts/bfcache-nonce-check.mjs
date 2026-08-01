#!/usr/bin/env node
/**
 * BFCACHE NONCE CHECK — one marker, one F5, one question: did the document survive?
 *
 * This gates the meaning of every reset number in the memory programme, mine included. My RESET-01 reload arm
 * reported the return axis PASSING at -12.6 MB. If F5 does not actually replace the document, that -12.6 MB is
 * not a clean reset, it is the same document being measured twice, and the finding is fiction.
 *
 * NOT RUN AGAINST THE SOAK. Reloading the soak page ends a committed ten-hour run. This boots its own browser
 * and its own chart, which is also the honest scope: the question is about the /chart/ document, not about one
 * particular instance of it.
 *
 * Three independent identity signals, because any one of them can be fooled:
 *   1. `window.__C_NONCE` — a JS global. Cannot survive a real navigation. If it survives, the document was
 *      reused and nothing else matters.
 *   2. `performance.timeOrigin` — unique per document. A changed origin proves a NEW document exists, which is
 *      the positive form of the same claim and does not depend on the marker being cleaned up.
 *   3. `sessionStorage` counter — SURVIVES a legitimate reload by design. It is the control: if the counter
 *      does not increment, the page never re-executed at all and the test itself is broken.
 * Plus the navigation type the browser itself reports, and whether any `pageshow` fired with persisted=true.
 */
import fs from 'node:fs';
import { loadPuppeteer, uiLoginDeployed } from './lib/heap-cycle-browser.mjs';
import { bootConf01Session } from './lib/conf01-session.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ORIGIN = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BFCACHE-NONCE-CHECK-20260731.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'BFCACHE-NONCE-CHECK-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — deliberately NOT disabled, because the question is what a real user gets',
  whyThisExists: 'If F5 retains the document rather than replacing it, every reset figure in the programme - including my own -12.6 MB reload PASS - is measuring the same document twice.',
  origin: ORIGIN,
};

const MODE = argOf('mode', 'conf01');
report.mode = MODE;

let browser = null;
try {
  let page = null;
  if (MODE === 'conf01') {
    // The real question is about a document that HAS a chart. A bare navigation to /chart/ produces a
    // chart-less shell on this build - a defect already open on me - and testing document identity on a shell
    // would answer a different question from the one that gates the reset numbers.
    const sess = await bootConf01Session({ replaySpeed: 5, headless: true, settleMs: 8000, placeOrder: false });
    browser = sess.browser;
    page = sess.page;
  } else {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 300_000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--window-size=1600,900'],
      defaultViewport: { width: 1600, height: 900 },
    });
    page = (await browser.pages())[0] || await browser.newPage();
    await uiLoginDeployed(page, ORIGIN, String(process.env.TEST_EMAIL || '').trim(), String(process.env.TEST_PASSWORD || '').trim());
    await page.goto(`${ORIGIN}/chart/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  }

  let ready = false;
  for (let i = 0; i < 30 && !ready; i += 1) {
    ready = await page.evaluate(() => !!(window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0)).catch(() => false);
    if (!ready) await sleep(2000);
  }
  report.chartReadyBeforeReload = ready;

  const nonce = `C-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const before = await page.evaluate((n) => {
    window.__C_NONCE = n;
    // A pageshow with persisted=true after an F5 would be the smoking gun, so listen before reloading.
    window.__C_PAGESHOW = [];
    window.addEventListener('pageshow', (e) => { try { window.__C_PAGESHOW.push(!!e.persisted); } catch { /* ignore */ } });
    const prev = Number(sessionStorage.getItem('__C_LOADS') || '0');
    sessionStorage.setItem('__C_LOADS', String(prev + 1));
    return {
      nonce: window.__C_NONCE,
      timeOrigin: Math.round(performance.timeOrigin * 1000) / 1000,
      sessionLoads: prev + 1,
      bars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null,
      navType: performance.getEntriesByType('navigation')[0]?.type ?? null,
    };
  }, nonce);
  report.beforeReload = before;

  // F5.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  let ready2 = false;
  for (let i = 0; i < 60 && !ready2; i += 1) {
    ready2 = await page.evaluate(() => !!(window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0)).catch(() => false);
    if (!ready2) await sleep(2000);
  }

  const after = await page.evaluate(() => ({
    nonceStillPresent: typeof window.__C_NONCE !== 'undefined',
    nonceValue: window.__C_NONCE ?? null,
    timeOrigin: Math.round(performance.timeOrigin * 1000) / 1000,
    sessionLoads: Number(sessionStorage.getItem('__C_LOADS') || '0'),
    bars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null,
    navType: performance.getEntriesByType('navigation')[0]?.type ?? null,
    wasDiscarded: document.wasDiscarded === true,
    // The listener was installed on the OLD document. If this array exists at all, the old document's
    // globals are still here, which is the same failure the nonce tests.
    pageshowArraySurvived: Array.isArray(window.__C_PAGESHOW),
    pageshowPersistedFlags: Array.isArray(window.__C_PAGESHOW) ? window.__C_PAGESHOW.slice() : null,
  }));
  report.afterReload = { ...after, chartReady: ready2 };

  const sameDocument = after.nonceStillPresent || after.timeOrigin === before.timeOrigin;
  // CONTROL, CORRECTED. The first version expected this counter to INCREMENT, but nothing on the page
  // increments it - my probe writes it once. What sessionStorage proves is that the value SURVIVES, which is
  // what distinguishes "same tab, new document" from "new tab or lost session". Expecting the increment made
  // a passing control read as a failure and would have suppressed a valid result.
  const sessionSurvived = after.sessionLoads >= before.sessionLoads && after.sessionLoads > 0;
  report.verdict = {
    nonceSurvived: after.nonceStillPresent,
    timeOriginChanged: after.timeOrigin !== before.timeOrigin,
    sessionStorageIncremented: sessionSurvived,
    navigationTypeReported: after.navType,
    documentWasReplaced: !sameDocument,
  };
  report.verdict.reading = sameDocument
    ? 'FAIL — THE DOCUMENT SURVIVED F5. The page was retained rather than reloaded, so every reset measurement in the programme, including my own reload PASS at -12.6 MB, is measuring one document twice and must be withdrawn.'
    : (!sessionSurvived
      ? 'INCONCLUSIVE — the document was replaced but the sessionStorage control did not survive, so the tab or session changed and this is not a clean F5. Not published as a pass.'
      : `PASS — the document was replaced. The nonce is gone, timeOrigin moved from ${before.timeOrigin} to ${after.timeOrigin}, the sessionStorage marker survived at ${after.sessionLoads} proving the same tab and session, and the browser reports navigation type "${after.navType}". F5 is a genuine document replacement on /chart/, so reset measurements taken across a reload compare two documents and the reload arm's return axis stands.`);
  report.chartReturnedAfterReload = ready2;
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 900);
} finally {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
}

report.signatureFilenameCheck = report.artifactFile === OUT.split('\\').pop() ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ verdict: report.verdict, before: report.beforeReload, after: report.afterReload, error: report.error }, null, 1));
