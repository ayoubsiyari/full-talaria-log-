#!/usr/bin/env node
/**
 * PAGEHIDE-ACTION-SCAN — does our document take ANY action on being put away?
 *
 * From RESET-01: "bfcache holds our document because we let it and because it is enormous: a document
 * that released its heavy resources on pagehide would be cheap to hold, and a document can decline
 * eligibility outright."
 *
 * This is decidable from the served code at zero machine cost, and it tells A whether the cut exists yet.
 * It also answers a second thing the A/B already implied: the document IS bfcache-eligible, because
 * Chrome demonstrably cached it, and an `unload` handler would have made it ineligible.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const ORIGIN = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\PAGEHIDE-ACTION-SCAN-20260731.json';

const FILES = [
  '/chart/chart.js',
  '/chart/replay-system.js',
  '/chart/multichart.js',
  '/chart/order-manager.js',
  '/js/talaria-v9-live.js',
  '/chart/indicators.js',
  '/chart/sw.js',
];

const PATTERNS = {
  pagehide: /(['"`]pagehide['"`])|onpagehide/g,
  freeze: /(['"`]freeze['"`])/g,
  resume: /(['"`]resume['"`])/g,
  visibilitychange: /visibilitychange/g,
  beforeunload: /beforeunload/g,
  unload: /(['"`]unload['"`])|onunload/g,
  // Actions that would make a cached document cheap to hold.
  releaseVerbs: /\b(dispose|destroy|teardown|releaseAll|clearCaches?|purge|evict|freeMemory)\s*\(/g,
  // Declining eligibility outright.
  noStore: /Cache-Control[^\n]{0,40}no-store/gi,
};

const get = (p) => new Promise((res) => {
  const lib = ORIGIN.startsWith('https') ? https : http;
  lib.get(ORIGIN + p, (r) => {
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => res({ code: r.statusCode, body: d, headers: r.headers }));
  }).on('error', (e) => res({ code: 0, body: '', err: e.message }));
});

const report = {
  signature: 'PAGEHIDE-ACTION-SCAN-V1',
  ruling: 'RESET-01 — whether the document takes any action on being put away',
  bfcacheState: 'not applicable: static scan of served code, no browser involved',
  origin: ORIGIN,
  startedAtIso: new Date().toISOString(),
  files: [],
};

(async () => {
  const totals = {};
  for (const f of FILES) {
    const r = await get(f);
    if (r.code !== 200) { report.files.push({ file: f, httpStatus: r.code, err: r.err || null }); continue; }
    const row = { file: f, kb: +(r.body.length / 1024).toFixed(0), counts: {}, samples: {} };
    for (const [name, re] of Object.entries(PATTERNS)) {
      const m = r.body.match(re) || [];
      row.counts[name] = m.length;
      totals[name] = (totals[name] || 0) + m.length;
      if (m.length && ['pagehide', 'freeze', 'beforeunload', 'unload'].includes(name)) {
        // Show the surrounding call so a hit can be judged rather than counted.
        const idx = r.body.search(re);
        row.samples[name] = r.body.slice(Math.max(0, idx - 90), idx + 110).replace(/\s+/g, ' ');
      }
    }
    report.files.push(row);
  }
  report.totals = totals;

  // Also check the document itself for a no-store header, which would decline caching outright.
  const doc = await get('/chart/');
  report.documentHeaders = doc.code === 200 ? {
    cacheControl: doc.headers?.['cache-control'] ?? null,
    httpStatus: doc.code,
  } : { httpStatus: doc.code };

  const hasPagehide = (totals.pagehide || 0) > 0;
  const hasFreeze = (totals.freeze || 0) > 0;
  const hasUnload = (totals.unload || 0) > 0 || (totals.beforeunload || 0) > 0;

  report.verdict = {
    takesActionOnBeingPutAway: hasPagehide || hasFreeze,
    pagehideHandlers: totals.pagehide || 0,
    freezeHandlers: totals.freeze || 0,
    visibilitychangeHandlers: totals.visibilitychange || 0,
    unloadHandlers: totals.unload || 0,
    beforeunloadHandlers: totals.beforeunload || 0,
    reading: (hasPagehide || hasFreeze)
      ? `A pagehide or freeze handler EXISTS (${totals.pagehide || 0} pagehide, ${totals.freeze || 0} freeze). Whether it sheds the heavy resources still has to be read, but the hook is there.`
      : `NO pagehide and NO freeze handler anywhere in the served bundles. The document takes ZERO action on being put away, so whatever it is holding when the user navigates, it keeps holding while cached. This is the cut RESET-01 flagged for A and it does not exist yet.`,
    eligibilityNote: hasUnload
      ? `An unload/beforeunload handler exists (${totals.unload || 0}/${totals.beforeunload || 0}), which normally makes a document bfcache-INELIGIBLE — yet Chrome demonstrably cached ours, so this needs reading rather than counting.`
      : 'No unload or beforeunload handler, which is consistent with the document being bfcache-eligible — as the measured A/B showed it is.',
    whatThisDoesNotSay: 'A static scan cannot prove the absence of a handler attached through an aliased or minified addEventListener call. It is evidence, not proof, and the measured heavy-session numbers are what decide the axis.',
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.error('=== PAGEHIDE ACTION SCAN ===');
  for (const r of report.files) {
    if (r.httpStatus && r.httpStatus !== 200) { console.error(`  ${r.file}: HTTP ${r.httpStatus}`); continue; }
    console.error(`  ${r.file} (${r.kb} KB): pagehide=${r.counts.pagehide} freeze=${r.counts.freeze} visibilitychange=${r.counts.visibilitychange} beforeunload=${r.counts.beforeunload} unload=${r.counts.unload} releaseVerbs=${r.counts.releaseVerbs}`);
  }
  console.error(`\n${report.verdict.reading}`);
  console.error(`${report.verdict.eligibilityNote}`);
  console.error(`\nartifact ${OUT}`);
})();
