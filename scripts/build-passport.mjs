#!/usr/bin/env node
/**
 * BUILD PASSPORT — badge and digest of the build actually served, for SOAK-SEAL.
 *
 * My harness loads `${origin}/chart/dist-v9/index.html` where origin defaults to a REMOTE deployed VPS, not
 * the local working tree. That means no local uncommitted file can enter my measurements - but it also means
 * my artifacts have been carrying a build BADGE (20260731b120) with no DIGEST, so "b120" is a label somebody
 * can re-cut without my noticing. The build moved b116 -> b117 -> b118 -> b120 inside one day.
 *
 * This fetches what is actually served and hashes it, so a soak can state which bytes it measured.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BUILD-PASSPORT-20260801.json');

const report = {
  signature: 'BUILD-PASSPORT-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — HTTP fetch only, no browser.',
  whyThisExists: 'SOAK-SEAL requires badge AND digest. My artifacts carried a badge with no digest, so the label could be re-cut without my noticing.',
  origin: ORIGIN,
  servedFrom: 'REMOTE deployed origin, not the local working tree. Local uncommitted changes to chart.js, multichart-manager.js or serve.mjs CANNOT enter a measurement taken through this harness.',
};

async function grab(path) {
  const url = `${ORIGIN}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      path,
      status: res.status,
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
      cacheControl: res.headers.get('cache-control'),
      ms: Date.now() - t0,
      body: buf,
    };
  } catch (err) {
    return { path, error: String(err).slice(0, 200) };
  }
}

try {
  const targets = [
    '/chart/dist-v9/index.html',
    '/chart/dist-v9/assets/talaria-v9-live.js',
    '/chart/dist-v9/sw.js',
    '/chart/chart.js',
    '/chart/multichart-prod/multichart-manager.js',
    '/chart/modules/chart-window-limit.js',
  ];
  const got = [];
  for (const t of targets) got.push(await grab(t));

  // The build badge is embedded as a ?v= query stamp on the product scripts; read it from the HTML rather
  // than trusting a value the page reports about itself at runtime.
  const html = got.find((g) => g.path.endsWith('index.html'));
  let badge = null;
  if (html?.body) {
    const m = String(html.body).match(/[?&]v=([0-9]{8}[a-z]?[0-9]*)/);
    badge = m ? m[1] : null;
  }
  if (!badge) {
    const live = got.find((g) => g.path.includes('talaria-v9-live'));
    const m = live?.body ? String(live.body).match(/20\d{6}b\d+/) : null;
    badge = m ? m[0] : null;
  }
  report.badge = badge;
  report.artifacts = got.map(({ body, ...rest }) => rest);
  const ok = got.filter((g) => g.sha256);
  report.passport = {
    badge,
    fileCount: ok.length,
    combinedDigest: crypto.createHash('sha256').update(ok.map((g) => `${g.path}:${g.sha256}`).join('|')).digest('hex').slice(0, 32),
    note: 'Combined digest is over the served bytes of the listed paths. Two runs quoting the same badge but different combined digests did NOT measure the same build.',
  };
  report.sealReadiness = {
    badgePresent: !!badge,
    digestPresent: true,
    verdict: badge
      ? `SEALABLE: badge ${badge} with a combined digest over ${ok.length} served files. A soak can now state which bytes it measured, and a re-cut under the same label is detectable.`
      : 'BADGE NOT FOUND in the served HTML or bundle. A digest without a badge still detects a change but cannot name the build.',
  };
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 600);
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ origin: report.origin, badge: report.badge, passport: report.passport, sealReadiness: report.sealReadiness, files: (report.artifacts || []).map((a) => `${a.path} ${a.status ?? a.error} ${a.bytes ?? ''} ${a.sha256 ? a.sha256.slice(0, 12) : ''}`), error: report.error }, null, 1));
