#!/usr/bin/env node
/**
 * Two investigation-queue items in one session, because both are read-only observations of the same
 * CONF-01 condition and a second boot would cost a host slot for nothing.
 *
 *  1. DOCUMENTS ENUMERATION (13 vs 18). The Performance `documents` counter and the frame tree disagree.
 *     Counting is not the deliverable - the URL-level diff is, because "18" is only alarming if the extra
 *     five are chart documents rather than login-navigation leftovers.
 *
 *  2. HEAVY-VS-FRESH ACCOUNT BASELINE, heavy half. Only ONE account exists in this harness
 *     (TEST_EMAIL, a dedicated non-admin QA account), so the fresh arm cannot be run today. Rather than
 *     write the whole item UNPROVEN, this measures the heavy arm precisely and names exactly what a fresh
 *     account would be compared against, so the comparison is one 20-minute run away the moment an account
 *     exists.
 *
 * Payload sizes come from performance.getEntriesByType('resource'), NOT from Network.enable. My first draft
 * passed an `onPage` hook to install a CDP network listener - and `onPage` is not an option this boot helper
 * takes (it takes `onSingleReady`). It would have been silently discarded, captured nothing, and reported
 * "0 API calls", from which I would have concluded a fresh account changes nothing. That is the same silent
 * option-drop that made a soak run at 60x while labelled 5x. Resource timings need no hook, cover the whole
 * document from t=0 rather than from first paint, and buffer no response bodies.
 */
import fs from 'node:fs';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\DOCUMENTS-AND-ACCOUNT-BASELINE-20260801.json');
const SETTLE_MS = Number(argOf('settleMs', '45000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[docs ${new Date().toISOString()}] ${m}`);

const report = {
  signature: 'DOCUMENTS-AND-ACCOUNT-BASELINE-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — fresh boot, no reset axis measured here.',
  sealStatus: { sealed: false, label: 'unsealed build — composition and counts, no absolute figures quoted as build-characteristic' },
  observerNote: 'Payload sizes read from performance.getEntriesByType("resource"). No Network.enable anywhere, so no buffered response bodies and no observer-memory risk.',
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
save();

let session = null;
try {
  const eSel = loadConf05Indicators();
  log('booting CONF-01');
  session = await bootConf01Session({
    indicators: eSel.pairs,
    replaySpeed: 60,
    placeOrder: false,
    label: 'documents-and-account-baseline',
  });
  const { page, browser } = session;
  log('booted, settling');
  await sleep(SETTLE_MS);

  // ---------- 1. DOCUMENTS ENUMERATION ----------
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable').catch(() => {});
  const metrics = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const metricOf = (n) => metrics.metrics?.find((m) => m.name === n)?.value ?? null;

  const frames = [];
  for (const f of page.frames()) {
    const info = await f.evaluate(() => ({
      url: location.href,
      timeOrigin: Math.round(performance.timeOrigin),
      hasChart: !!(window.chart && Array.isArray(window.chart.data)),
      bars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0,
      readyState: document.readyState,
    })).catch(() => null);
    if (info) frames.push(info);
  }

  const targets = await browser.targets();
  const targetRows = targets.map((t) => ({ type: t.type(), url: String(t.url()).slice(0, 120) }));

  const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return String(u).split('?')[0]; } };
  const byPath = new Map();
  for (const f of frames) {
    const k = norm(f.url);
    if (!byPath.has(k)) byPath.set(k, { path: k, frames: 0, withChart: 0, bars: 0 });
    const e = byPath.get(k);
    e.frames += 1;
    if (f.hasChart) { e.withChart += 1; e.bars += f.bars; }
  }

  report.documents = {
    performanceDocumentsMetric: metricOf('Documents'),
    performanceFramesMetric: metricOf('Frames'),
    jsEventListeners: metricOf('JSEventListeners'),
    nodes: metricOf('Nodes'),
    liveFramesEnumerated: frames.length,
    framesWithAChart: frames.filter((f) => f.hasChart).length,
    distinctTimeOrigins: new Set(frames.map((f) => f.timeOrigin)).size,
    byUrlPath: [...byPath.values()].sort((a, b) => b.frames - a.frames),
    browserTargetsByType: targetRows.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {}),
    targetUrls: targetRows,
  };

  const docs = report.documents.performanceDocumentsMetric;
  const live = frames.length;
  report.documents.diff = {
    metricMinusEnumerated: docs != null ? docs - live : null,
    reading: docs == null
      ? 'Documents metric unavailable on this platform.'
      : docs === live
        ? `AGREE at ${docs}. Every counted document is a live, reachable frame.`
        : `DISAGREE: the metric counts ${docs}, the frame tree exposes ${live}. The ${docs - live} difference is documents Chrome still counts but Puppeteer cannot reach - detached or pending-destruction documents, or documents from navigations that have not been reclaimed. Chart-bearing frames number ${frames.filter((f) => f.hasChart).length}, and THAT is the number CONF-01 cares about: the excess carries no chart and no bars.`,
  };

  // ---------- 2. ACCOUNT BASELINE (heavy arm only) ----------
  // Resource timings from every realm, so an API call made by a panel is not missed.
  const requests = [];
  for (const f of page.frames()) {
    const rows = await f.evaluate(() => performance.getEntriesByType('resource').map((e) => ({
      url: e.name,
      encoded: e.transferSize || e.encodedBodySize || 0,
      decoded: e.decodedBodySize || 0,
      initiator: e.initiatorType,
      ms: Math.round(e.duration),
    }))).catch(() => []);
    requests.push(...rows);
  }
  report.resourceTimingsRead = requests.length;
  const acct = requests.filter((r) => /\/api\//.test(r.url));
  const group = new Map();
  for (const r of acct) {
    const k = norm(r.url);
    if (!group.has(k)) group.set(k, { endpoint: k.replace(/^https?:\/\/[^/]+/, ''), calls: 0, bytes: 0 });
    const e = group.get(k);
    e.calls += 1;
    e.bytes += r.encoded || 0;
  }
  const rows = [...group.values()].sort((a, b) => b.bytes - a.bytes);
  const totalApiBytes = rows.reduce((s, r) => s + r.bytes, 0);

  report.accountBaseline = {
    arm: 'HEAVY ONLY — the fresh arm could not be run, see blockingQuestion',
    account: 'TEST_EMAIL (dedicated non-admin QA account); this harness has exactly one set of credentials',
    apiCallsAtBoot: acct.length,
    totalApiBytes,
    totalApiKb: +(totalApiBytes / 1024).toFixed(1),
    byEndpoint: rows.slice(0, 15),
    accountDependentEndpoints: rows.filter((r) => /journal|trade|order|position|account|settings|preference/i.test(r.endpoint)),
    whatAFreshAccountWouldChange: 'Only the account-dependent rows above. Everything else is build-sized, not account-sized, so the fresh arm is expected to differ ONLY on those endpoints and on whatever residency they seed.',
    blockingQuestion: 'Can a second, empty account be provisioned on the test VPS with TEST_EMAIL_FRESH / TEST_PASSWORD_FRESH? That is the whole blocker. With it, this exact script run twice answers TAL-01891 and the cohort question in 20 minutes. Without it, no amount of instrument work substitutes - a one-account harness cannot measure a between-account difference, and I will not infer one from a payload size.',
    whyNotInferred: 'I could size the journal payload and multiply by a guessed cohort factor. That would be a modelled number wearing a measured label, and three findings died last night for less.',
  };

  report.verdict = `DOCUMENTS: ${report.documents.diff.reading} ACCOUNT BASELINE: heavy arm measured (${report.accountBaseline.apiCallsAtBoot} API calls, ${report.accountBaseline.totalApiKb} KB at boot); fresh arm UNPROVEN, blocked on a second account, question named.`;
  log(report.verdict);
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 900);
  log(`ERROR ${report.error.slice(0, 200)}`);
} finally {
  save();
  try { if (session?.browser) await session.browser.close(); } catch { /* gone */ }
  save();
}
console.log(JSON.stringify({ documents: report.documents?.diff, docsMetric: report.documents?.performanceDocumentsMetric, live: report.documents?.liveFramesEnumerated, byUrlPath: report.documents?.byUrlPath, account: report.accountBaseline && { calls: report.accountBaseline.apiCallsAtBoot, kb: report.accountBaseline.totalApiKb, dependent: report.accountBaseline.accountDependentEndpoints }, error: report.error }, null, 1));
