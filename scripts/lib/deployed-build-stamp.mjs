/**
 * DEPLOYED-BUILD-STAMP — read the build off the deployment, not off the page.
 *
 * Why this exists: both `SESSION-RESET` arms recorded `buildStamp: null`, so the measurement at the centre
 * of the item-7 dispute carried no build under MEAS-01. The cause was that the probe read
 * `window.__TALARIA_CHART_BUILD_ID`, which only the /chart/ page sets — a single-chart dist-v9 page has no
 * such global, so the read silently returned null and nothing complained.
 *
 * `chart.js` declares `const CHART_ENGINE_BUILD = '20260731b118'` in the served bundle, so the deployed
 * build is fetchable over HTTP by any probe regardless of which page it happens to be sitting on. A page
 * global is still preferred when present, because it proves what THAT document loaded; this is the fallback
 * that makes a null stamp impossible.
 */
import http from 'node:http';
import https from 'node:https';

const fetchText = (url) => new Promise((resolve) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, (r) => {
    if (r.statusCode !== 200) { r.resume(); resolve(null); return; }
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => resolve(d));
  });
  req.on('error', () => resolve(null));
  req.setTimeout(20_000, () => { req.destroy(); resolve(null); });
});

let cached = null;

/** The build string declared by the deployed chart bundle, or null with the reason recorded. */
export async function readDeployedBuildStamp(origin = process.env.TEST_VPS_URL || 'http://31.97.192.82:3000') {
  if (cached) return cached;
  const base = String(origin).replace(/\/$/, '');
  const body = await fetchText(`${base}/chart/chart.js`);
  if (!body) {
    cached = { buildStamp: null, source: 'unreachable', note: `Could not fetch ${base}/chart/chart.js to read CHART_ENGINE_BUILD.` };
    return cached;
  }
  const m = body.match(/CHART_ENGINE_BUILD\s*=\s*['"]([^'"]+)['"]/);
  cached = m
    ? { buildStamp: m[1], source: 'CHART_ENGINE_BUILD in the served chart.js' }
    : { buildStamp: null, source: 'not-found', note: 'chart.js fetched but CHART_ENGINE_BUILD was not present; the constant may have been renamed.' };
  return cached;
}

/**
 * Prefer the page's own global, fall back to the deployment, and always say which answered so a reader
 * can tell "this document loaded b118" from "the server is serving b118".
 */
export async function stampBuild(page, origin) {
  let fromPage = null;
  try {
    fromPage = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null);
  } catch { fromPage = null; }
  if (fromPage) return { buildStamp: fromPage, buildStampSource: 'page global __TALARIA_CHART_BUILD_ID' };
  const dep = await readDeployedBuildStamp(origin);
  return {
    buildStamp: dep.buildStamp,
    buildStampSource: `deployment fallback: ${dep.source}`,
    buildStampNote: 'The page did not expose a build global, so this is the build the server is serving rather than one read off this document.',
  };
}
