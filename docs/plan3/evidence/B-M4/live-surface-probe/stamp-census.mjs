#!/usr/bin/env node
/**
 * Build-stamp census of every servable /chart/ route (Director 20:40 item 1).
 *
 * Derives candidate URLs from C's servable-surface + chart-shell inventories,
 * plus a pinned expansion of known live holes. Probes each read-only and reports
 * the build stamp(s) returned. Any 200 shell below --current is a LIVE HOLE.
 *
 *   node stamp-census.mjs --base-url=http://host [--current=20260728b81] [--out=DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');

const PINNED_URLS = [
  '/chart/index.html',
  '/chart/dist-v9/index.html',
  '/chart/dist-v9/',
  '/chart/legacy-index.html',
  '/chart/multichart-prod/chart-embed.html',
  '/chart/talaria-design/live/index.html',
  '/chart/talaria-design/live/',
  '/chart/talaria-design/index.html',
  '/chart/index.v9.html',
  '/chart/admin-dashboard.html',
  '/chart/backtesting.html',
  '/chart/propfirm-backtest.html',
  '/chart/sessions.html',
  '/chart/multichart/chart-host.html',
  '/chart/multichart/multichart-shell.html',
  '/chart/chart.js',
  '/chart/sw.js',
  '/chart/dist-v9/sw.js',
];

function parseArgs(argv) {
  const out = {
    timeoutMs: 10000,
    current: null,
    out: null,
    json: false,
    emitShellInventory: null,
  };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`bad arg: ${a}`);
    const [, k, v] = m;
    if (k === 'base-url') out.baseUrl = v;
    else if (k === 'current') out.current = v;
    else if (k === 'out') out.out = v;
    else if (k === 'timeout-ms') out.timeoutMs = Number(v);
    else if (k === 'json') out.json = true;
    else if (k === 'emit-shell-inventory') out.emitShellInventory = v || 'scripts/servable-shells-from-census.json';
    else if (k === 'help') {
      console.log(
        'stamp-census.mjs --base-url=URL [--current=ID] [--out=DIR] [--emit-shell-inventory=PATH]',
      );
      process.exit(0);
    } else throw new Error(`unknown: --${k}`);
  }
  if (!out.baseUrl) throw new Error('--base-url required');
  return out;
}

/** HTML/JS shells the server actually answered 200 for — SoT for other gates. */
export function buildShellInventoryFromCensus(report, opts = {}) {
  const repoRoot = opts.repoRoot || REPO;
  const shells = [];
  for (const row of report.rows || []) {
    if (row.status !== 200) continue;
    if (row.class === 'REDIRECT' || row.class === 'NOT_FOUND' || row.class === 'AUTH_GATED') continue;
    const route = row.route;
    const isHtml = /\.html?$|\/$/.test(route) || /text\/html/i.test(row.contentType || '');
    const isEngine = /\/chart\.js$/i.test(route);
    const isSw = /\/sw\.js$/i.test(route);
    if (!isHtml && !isEngine && !isSw) continue;
    const relCandidates = [
      `homepage/public${route.replace(/\/$/, '/index.html')}`,
      `homepage/public${route}`,
      `chart v 1.4/chart${route.replace(/^\/chart/, '')}`,
    ];
    let relativePath = null;
    for (const rel of relCandidates) {
      const abs = path.join(repoRoot, rel);
      if (fs.existsSync(abs)) {
        relativePath = rel.replace(/\\/g, '/');
        break;
      }
    }
    shells.push({
      id: route.replace(/^\/chart\//, '').replace(/[^\w.-]+/g, '-').replace(/-+$/g, '') || 'chart-root',
      route,
      relativePath,
      role: /multichart\/chart-host/.test(route)
        ? 'multichart-panel-host'
        : /multichart\/multichart-shell/.test(route)
          ? 'multichart-shell'
          : /dist-v9/.test(route)
            ? 'dist'
            : /chart-embed/.test(route)
              ? 'embed'
              : /chart\.js$/.test(route)
                ? 'engine'
                : /sw\.js$/.test(route)
                  ? 'service-worker'
                  : 'servable',
      class: row.class,
      allIds: row.allIds || [],
      hole: Boolean(row.hole),
      neverBlock: /\/chart\/multichart\//.test(route),
      gateRequired: true,
    });
  }
  return {
    schema: 'TALARIA_SERVABLE_SHELLS_FROM_CENSUS_V1',
    source: 'stamp-census',
    standingRule:
      'This list — not per-gate hardcodes — is the shell inventory for module-presence, reachability, and cache-stamp coherence. Derived from what the server served.',
    observedAt: report.startedAtUtc,
    baseUrl: report.baseUrl,
    shellCount: shells.length,
    shells,
  };
}

function pathToUrl(filePath) {
  const norm = String(filePath).replace(/\\/g, '/');
  const markers = [
    'homepage/public/chart/',
    'homepage/out/chart/',
    'chart v 1.4/chart/',
    'chart v 1.4/talaria-design/',
  ];
  for (const m of markers) {
    const i = norm.indexOf(m);
    if (i < 0) continue;
    const rest = norm.slice(i + m.length);
    if (m.includes('talaria-design')) return `/chart/talaria-design/${rest}`;
    return `/chart/${rest}`;
  }
  return null;
}

function loadCandidateUrls(repoRoot) {
  const urls = new Set(PINNED_URLS);
  for (const rel of [
    'scripts/servable-surface-inventory.json',
    'scripts/chart-shell-inventory.json',
  ]) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const inv = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const shells = inv.shells || inv.surfaces || [];
    for (const s of shells) {
      const status = String(s.status || s.role || '');
      if (/denied|removal-pending|removed/i.test(status) && !/owned/.test(status)) {
        // Still probe denied-route-pending — they may be live holes.
      }
      const p = s.path || s.relativePath || '';
      const u = s.url || s.servedUrl || s.route || pathToUrl(p);
      if (u && u.startsWith('/chart/')) urls.add(u.split('?')[0]);
    }
  }
  return [...urls].sort();
}

function extractStamps(body, contentType) {
  const text = String(body || '');
  const stamps = [...new Set([...text.matchAll(/[?&]v=([0-9]{8}[ab][0-9]+)/g)].map((m) => m[1]))];
  const declared =
    /__TALARIA_CHART_BUILD_ID\s*=\s*(?:p\.get\('v'\)\s*\|\|\s*)?'([^']+)'/.exec(text)?.[1]
    || /const\s+CHART_ENGINE_BUILD\s*=\s*'([^']+)'/.exec(text)?.[1]
    || /const SW_VERSION = "talaria-chart-([^"]+)"/.exec(text)?.[1]
    || null;
  const ids = [...new Set([...(declared ? [declared] : []), ...stamps])];
  return { stamps, declaredBuildId: declared, allIds: ids };
}

function parseBuildRank(id) {
  const m = /^(\d{8})([ab])(\d+)$/i.exec(String(id || ''));
  if (!m) return null;
  return { ymd: m[1], tier: m[2].toLowerCase(), n: parseInt(m[3], 10) };
}

/** true if observed is strictly below current (hole). */
function isBelow(observed, current) {
  const a = parseBuildRank(observed);
  const b = parseBuildRank(current);
  if (!a || !b) return null;
  if (a.ymd !== b.ymd) return a.ymd < b.ymd;
  if (a.tier !== b.tier) return a.tier < b.tier; // 'a' < 'b'
  return a.n < b.n;
}

async function fetchOne(baseUrl, route, timeoutMs) {
  const url = new URL(route, baseUrl).toString();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'cache-control': 'no-cache' },
      signal: ac.signal,
    });
    const body = await res.text();
    return {
      ok: true,
      status: res.status,
      location: res.headers.get('location'),
      contentType: res.headers.get('content-type'),
      cacheControl: res.headers.get('cache-control'),
      cfCacheStatus: res.headers.get('cf-cache-status'),
      age: res.headers.get('age'),
      etag: res.headers.get('etag'),
      bytes: Buffer.byteLength(body, 'utf8'),
      sha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      body,
    };
  } catch (err) {
    return {
      ok: false,
      transportError: err?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (err?.message || String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyRow(route, res, current) {
  const row = {
    route,
    status: res.ok ? res.status : null,
    transportError: res.ok ? null : res.transportError,
    location: res.location || null,
    contentType: res.contentType || null,
    bytes: res.bytes ?? null,
    sha256: res.sha256 ? res.sha256.slice(0, 16) : null,
    cacheControl: res.cacheControl || null,
    cfCacheStatus: res.cfCacheStatus || null,
    age: res.age || null,
    stamps: [],
    declaredBuildId: null,
    allIds: [],
    class: 'UNDETERMINED',
    hole: false,
    reason: null,
  };
  if (!res.ok) {
    row.reason = res.transportError;
    return row;
  }
  if (res.status >= 300 && res.status < 400) {
    row.class = 'REDIRECT';
    row.reason = `→ ${res.location || '(no location)'}`;
    return row;
  }
  if (res.status === 404) {
    row.class = 'NOT_FOUND';
    return row;
  }
  if (res.status === 401 || res.status === 403) {
    row.class = 'AUTH_GATED';
    return row;
  }
  if (res.status !== 200) {
    row.class = 'UNDETERMINED';
    row.reason = `HTTP ${res.status}`;
    return row;
  }
  const extracted = extractStamps(res.body, res.contentType);
  row.stamps = extracted.stamps;
  row.declaredBuildId = extracted.declaredBuildId;
  row.allIds = extracted.allIds;
  if (!row.allIds.length) {
    row.class = 'UNSTAMPED_200';
    row.reason = 'HTTP 200 but no recognisable build id';
    row.hole = true; // cannot prove currency → treat as hole
    return row;
  }
  row.class = 'STAMPED_200';
  if (current) {
    const below = row.allIds.some((id) => isBelow(id, current) === true);
    const unknown = row.allIds.some((id) => isBelow(id, current) === null);
    if (below) {
      row.hole = true;
      row.reason = `serves ${row.allIds.join(',')} below current ${current}`;
    } else if (unknown) {
      row.reason = `non-canonical id among ${row.allIds.join(',')}`;
    } else {
      row.reason = `at/above current ${current}`;
    }
  }
  return row;
}

export async function runStampCensus(opts) {
  const urls = loadCandidateUrls(opts.repoRoot || REPO);
  const rows = [];
  for (const route of urls) {
    const res = await fetchOne(opts.baseUrl, route, opts.timeoutMs);
    rows.push(classifyRow(route, res, opts.current));
  }
  const holes = rows.filter((r) => r.hole);
  const stamped = rows.filter((r) => r.class === 'STAMPED_200');
  const currentObserved = (() => {
    const ids = stamped.flatMap((r) => r.allIds).filter((id) => parseBuildRank(id));
    ids.sort((a, b) => (isBelow(a, b) ? -1 : isBelow(b, a) ? 1 : 0));
    return ids.at(-1) || null;
  })();
  return {
    tool: 'stamp-census',
    startedAtUtc: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    currentDeclared: opts.current || null,
    currentObservedMax: currentObserved,
    candidateCount: urls.length,
    rows,
    holeCount: holes.length,
    holes: holes.map((h) => ({ route: h.route, allIds: h.allIds, reason: h.reason, status: h.status })),
    summary: {
      holeCount: holes.length,
      stamped200: stamped.length,
      redirect: rows.filter((r) => r.class === 'REDIRECT').length,
      notFound: rows.filter((r) => r.class === 'NOT_FOUND').length,
      authGated: rows.filter((r) => r.class === 'AUTH_GATED').length,
      unstamped200: rows.filter((r) => r.class === 'UNSTAMPED_200').length,
      undetermined: rows.filter((r) => r.class === 'UNDETERMINED').length,
    },
  };
}

function render(report) {
  const L = [];
  L.push('');
  L.push(`STAMP CENSUS  ${report.baseUrl}`);
  L.push(`current declared: ${report.currentDeclared || '(none)'}   observed max: ${report.currentObservedMax || '—'}`);
  L.push(`candidates: ${report.candidateCount}   holes: ${report.holeCount}`);
  L.push('');
  if (report.holes.length) {
    L.push('LIVE HOLES (below current / unstamped 200)');
    for (const h of report.holes) {
      L.push(`  HOLE  ${h.route}  [${(h.allIds || []).join(',') || 'unstamped'}]  ${h.reason || ''}`);
    }
    L.push('');
  }
  L.push('ALL ROUTES');
  for (const r of report.rows) {
    const ids = r.allIds?.length ? r.allIds.join(',') : '—';
    const flag = r.hole ? 'HOLE' : r.class.padEnd(12);
    L.push(`  ${flag}  HTTP ${r.status ?? '—'}  ${ids.padEnd(28)}  ${r.route}${r.location ? ' → ' + r.location : ''}`);
  }
  L.push('');
  return L.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runStampCensus({ ...opts, repoRoot: REPO });
  if (opts.out) {
    fs.mkdirSync(opts.out, { recursive: true });
    const host = (() => { try { return new URL(opts.baseUrl).host.replace(/[^\w.-]/g, '_'); } catch { return 'host'; } })();
    const stamp = report.startedAtUtc.replace(/[:.]/g, '-');
    const file = path.join(opts.out, `stamp-census-${stamp}-${host}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    report.evidenceFile = file;
  }
  if (opts.emitShellInventory) {
    const inv = buildShellInventoryFromCensus(report, { repoRoot: REPO });
    const abs = path.isAbsolute(opts.emitShellInventory)
      ? opts.emitShellInventory
      : path.join(REPO, opts.emitShellInventory);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(inv, null, 2)}\n`);
    report.shellInventoryFile = abs;
  }
  console.log(opts.json ? JSON.stringify(report, null, 2) : render(report));
  if (report.evidenceFile) console.log(`evidence: ${report.evidenceFile}\n`);
  if (report.shellInventoryFile) console.log(`shell-inventory: ${report.shellInventoryFile}\n`);
  process.exitCode = report.holeCount > 0 ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(64);
  });
}
