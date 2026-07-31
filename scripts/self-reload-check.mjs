#!/usr/bin/env node
/**
 * SELF-RELOAD-CHECK — is the served page reloading itself?
 *
 * The reload arm of RESET-01 lost its page mid-run: Chrome stayed alive, the chart reported 0 resident
 * bars and the Performance session stopped answering, which is what a document being replaced underneath
 * an attached probe looks like. This morning I flagged a latent trap that would produce exactly that —
 * `SW_VERSION` reads an old build against the deployed one, and the version-reload prompt that consumes it
 * is retired and default-OFF, so re-enabling it makes it fire on every load, permanently. The build has
 * moved three times today. This checks whether that trap is now armed before I blame my own instrument.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SELF-RELOAD-CHECK-20260731.json';

const get = (path) => new Promise((resolve) => {
  const lib = ORIGIN.startsWith('https') ? https : http;
  const req = lib.get(ORIGIN + path, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => resolve({ code: res.statusCode, body: d, headers: res.headers }));
  });
  req.on('error', (e) => resolve({ code: 0, body: String(e.message), headers: {} }));
  req.setTimeout(20_000, () => { req.destroy(); resolve({ code: 0, body: 'timeout', headers: {} }); });
});

const report = {
  signature: 'SELF-RELOAD-CHECK-V1',
  artifactFile: 'SELF-RELOAD-CHECK-20260731.json',
  ruling: 'RESET-01 — diagnosing a lost page before blaming the instrument',
  bfcacheState: 'not applicable — static read of served assets, no browser involved',
  origin: ORIGIN,
  startedAtIso: new Date().toISOString(),
};

(async () => {
  const files = ['/chart/chart.js', '/chart/replay-system.js', '/chart/sw.js', '/chart/'];
  report.files = {};
  for (const f of files) {
    const r = await get(f);
    const b = r.body || '';
    const buildIds = [...new Set(b.match(/20260\d{3}b\d+/g) || [])];
    const swVersion = (b.match(/SW_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
    report.files[f] = {
      code: r.code,
      bytes: b.length,
      cacheControl: r.headers?.['cache-control'] ?? null,
      buildIdsFound: buildIds.slice(0, 6),
      swVersion,
      locationReloadCount: (b.match(/location\s*\.\s*reload\s*\(/g) || []).length,
      locationHrefAssignCount: (b.match(/location\s*\.\s*href\s*=/g) || []).length,
      versionReloadIdentifiers: [...new Set(b.match(/__TALARIA_[A-Z0-9_]*(?:VERSION|RELOAD)[A-Z0-9_]*/g) || [])].slice(0, 8),
      // A reload guarded by a build mismatch is the specific trap.
      buildMismatchReloadSites: (b.match(/.{0,120}(?:SW_VERSION|buildId|BUILD_ID).{0,60}location\s*\.\s*reload.{0,40}/g) || []).slice(0, 3),
    };
  }

  const chart = report.files['/chart/chart.js'] || {};
  const doc = report.files['/chart/'] || {};
  report.findings = {
    swVersionInChartJs: chart.swVersion,
    deployedBuildIds: chart.buildIdsFound,
    swVersionMatchesDeployed: chart.swVersion && (chart.buildIdsFound || []).includes(chart.swVersion),
    reloadCallSites: chart.locationReloadCount,
    buildMismatchReloadArmed: (chart.buildMismatchReloadSites || []).length > 0,
    // RESET-01 option 1 depends on this header, so read it while here.
    documentCacheControl: doc.cacheControl,
    documentIsBfcacheEligibleByHeader: !/no-store/i.test(String(doc.cacheControl || '')),
  };
  report.verdict = report.findings.buildMismatchReloadArmed
    ? `TRAP ARMED: a location.reload() guarded by a build/SW version comparison is present in the served bundle, and SW_VERSION reads ${chart.swVersion} against deployed ${JSON.stringify(chart.buildIdsFound)}. That would reload every load and would explain the lost page.`
    : `Trap NOT armed: ${chart.locationReloadCount} location.reload() call site(s) in chart.js but none guarded by a build/SW version comparison, and SW_VERSION reads ${chart.swVersion} against deployed ${JSON.stringify(chart.buildIdsFound)}. The lost page is therefore NOT explained by the version-reload trap, and the next suspect is my own instrument or a renderer death.`;
  report.status = 'OK';
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

  console.error('=== SELF RELOAD CHECK ===');
  for (const [k, v] of Object.entries(report.files)) {
    console.error(`  ${k}: ${v.code} ${v.bytes}B cache-control=${v.cacheControl} builds=${JSON.stringify(v.buildIdsFound)} swVersion=${v.swVersion} reloads=${v.locationReloadCount}`);
  }
  console.error('');
  for (const [k, v] of Object.entries(report.findings)) console.error(`  ${k}: ${JSON.stringify(v)}`);
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
})();
