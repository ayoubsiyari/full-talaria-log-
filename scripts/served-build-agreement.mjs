/**
 * SERVED-BUILD-AGREEMENT — does the HOST serve what this tree built?
 *
 * Why this exists: `.scratch/pkg1-served-bytes-check.mjs` was headed "confirm every fix reached
 * the bytes nginx actually serves" and then read `homepage/public/chart/` off local disk. That
 * directory is the mirror a deploy is built FROM, not the bytes anyone is served. On 2026-08-04
 * it reported 19/19 for build 20260804b127 while `31.97.192.82:3000` was serving 20260803b126 and
 * none of the ten Package 1 fixes were reachable by the PO. The check was not wrong about the
 * files it read; its subject was a local directory and its sentence claimed a host.
 *
 * `scripts/lib/deployed-build-stamp.mjs` could have answered this in one call and was imported by
 * nothing — the same shape as the defect it would have caught, where the fix for the analysis-only
 * order refusal sat in a component no file imports. An instrument that exists and is unwired is
 * indistinguishable from one that does not exist, except that people believe they are covered.
 *
 * States:
 *   HOST_UNREACHABLE   the origin did not answer — not a pass
 *   BUILD_DISAGREES    host build id != local build id; the deploy has not happened
 *   MARKERS_MISSING    ids agree but a fix is absent from the served bytes
 *   SERVED_AGREES      the host serves this tree's build id and carries every marker
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDeployedBuildStamp } from './lib/deployed-build-stamp.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');

const fetchText = (url) => new Promise((resolve) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, (r) => {
    if (r.statusCode !== 200) { r.resume(); resolve(null); return; }
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => resolve(d));
  });
  req.on('error', () => resolve(null));
  req.setTimeout(30_000, () => { req.destroy(); resolve(null); });
});

const localBuildId = () => {
  const engine = fs.readFileSync(path.join(REPO_ROOT, 'homepage/public/chart/chart.js'), 'utf8');
  const m = engine.match(/CHART_ENGINE_BUILD\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
};

/**
 * The served paths, not the local ones. dist-v9's bundle filename is stable across builds, so it
 * is fetchable without parsing index.html; if that ever stops being true this returns null and
 * the run reports HOST_UNREACHABLE rather than passing on three of four surfaces.
 */
const SURFACES = {
  bundle: '/chart/dist-v9/assets/talaria-v9-live.js',
  engine: '/chart/chart.js',
  om: '/chart/modules/order-manager.js',
  co: '/chart/modules/compare-overlay.js',
};

/** Package 1's ten fixes. Regex where minification renames the identifier. */
const MARKERS = [
  ['1.3b  gesture guard reads .frame', 'bundle', /\w+\.frame&&\w+\.frame\.contentWindow/],
  ['1.3b  no .iframe reader survives', 'bundle', { absent: /\.iframe\b/ }],
  ['1.3b  guard honours the gesture-owner flag', 'bundle', '__talariaGestureOwnerV1'],
  ['1.3c  focus range dedupe is bar-granular', 'bundle', 'getVisibleEndIndex'],
  ['1.6b  compared symbol reads as unavailable', 'bundle', 'is already on the chart'],
  ['1.8c  order rail surfaces the refusal', 'bundle', 'orderValidation'],
  ['1.3a  local-first timeframe restore', 'engine', '_sessionTimeframeRestoreEnabled'],
  ['1.8a  pair-switch watchdog', 'engine', 'PAIR_SWITCH_LOAD_TIMEOUT_MS'],
  ['1.12  later playhead wins', 'engine', 'serverRewindIsNewer'],
  ['1.8c  refusal resolves by file id too', 'om', '_analysisOnlyFileIds'],
  ['1.8c  toast duration passed as options', 'om', "'warning', { timeoutMs: 3200 }"],
  ['1.6a  out-of-view notice', 'co', '_warnOverlayOutOfView'],
  ['1.6a  axis falls back to the real extent', 'co', '_overlayFullPriceExtent'],
];

const hit = (hay, needle) => (needle && needle.absent
  ? !needle.absent.test(hay)
  : needle instanceof RegExp ? needle.test(hay) : hay.includes(needle));

async function main() {
  const want = localBuildId();
  if (!want) {
    console.log('[served-build] LOCAL_BUILD_UNREADABLE — no CHART_ENGINE_BUILD in the local mirror');
    process.exitCode = 1;
    return;
  }

  const deployed = await readDeployedBuildStamp(ORIGIN);
  if (!deployed.buildStamp) {
    console.log(`[served-build] HOST_UNREACHABLE ${ORIGIN} — ${deployed.note || deployed.source}`);
    console.log('  Unreachable is not a pass. Nothing is known about what the PO is being served.');
    process.exitCode = 1;
    return;
  }

  console.log(`[served-build] host ${ORIGIN} serves ${deployed.buildStamp}; this tree built ${want}`);
  if (deployed.buildStamp !== want) {
    console.log(`[served-build] BUILD_DISAGREES — the deploy has not happened.`);
    console.log('  Every marker below would be a statement about local files, so they are not checked:');
    console.log('  a green marker list beside a disagreeing build id is exactly how b126 was mistaken');
    console.log('  for b127. Ship the build, then run this again.');
    process.exitCode = 1;
    return;
  }

  const bodies = {};
  for (const [name, urlPath] of Object.entries(SURFACES)) {
    bodies[name] = await fetchText(`${ORIGIN}${urlPath}`);
    if (bodies[name] === null) {
      console.log(`[served-build] HOST_UNREACHABLE ${urlPath} — fetched 4 surfaces, this one did not answer`);
      process.exitCode = 1;
      return;
    }
  }

  let missing = 0;
  for (const [label, surface, needle] of MARKERS) {
    const ok = hit(bodies[surface], needle);
    if (!ok) missing += 1;
    console.log(`${ok ? '  ok  ' : '  MISS'} ${label}`);
  }

  if (missing) {
    console.log(`[served-build] MARKERS_MISSING — ${missing} of ${MARKERS.length} absent from the served bytes`);
    process.exitCode = 1;
    return;
  }
  console.log(`[served-build] SERVED_AGREES — ${ORIGIN} serves ${want} and carries all ${MARKERS.length} markers`);
  process.exitCode = 0;
}

main();
