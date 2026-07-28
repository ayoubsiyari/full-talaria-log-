import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SURF3_BUILD_AGREEMENT_SIGNATURE = 'TALARIA_SURF3_BUILD_AGREEMENT_V1';
export const SURF3_DEFAULT_BASE_URL = 'http://31.97.192.82:3000';
export const SURF3_DEFAULT_SHELL_PATHS = Object.freeze([
  '/chart/index.html',
  '/chart/dist-v9/index.html',
]);

const BUILD_ID_RES = [
  /window\.__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
  /window\.__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/,
  /__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
];

const DEFAULT_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/surf3/gate01-red',
);

export function extractTalariaChartBuildId(source) {
  if (typeof source !== 'string' || !source) return null;
  for (const re of BUILD_ID_RES) {
    const match = source.match(re);
    if (match?.[1]) return String(match[1]);
  }
  return null;
}

export function resolveSurf3ShellUrls({
  baseUrl = SURF3_DEFAULT_BASE_URL,
  paths = SURF3_DEFAULT_SHELL_PATHS,
} = {}) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  return (Array.isArray(paths) ? paths : SURF3_DEFAULT_SHELL_PATHS).map((p) => {
    const rel = String(p || '').startsWith('/') ? String(p) : `/${p}`;
    return `${root}${rel}`;
  });
}

function cell(name, pass, detail) {
  return {
    name,
    pass: !!pass,
    status: pass ? 'GREEN' : 'RED',
    signature: SURF3_BUILD_AGREEMENT_SIGNATURE,
    ...detail,
  };
}

/**
 * Compare extracted BUILD_IDs. Missing IDs are RED (fail-closed).
 * Agreement requires every observation to have a finite identical buildId.
 */
export function evaluateBuildAgreement(observations) {
  const rows = Array.isArray(observations) ? observations : [];
  const withIds = rows.map((row) => ({
    url: row?.url || null,
    buildId: row?.buildId != null && row.buildId !== '' ? String(row.buildId) : null,
    status: row?.status ?? null,
    error: row?.error || null,
    source: row?.source || null,
  }));
  const ids = withIds.map((row) => row.buildId);
  const present = ids.filter((id) => id != null);
  const unique = [...new Set(present)];
  const allPresent = withIds.length > 0 && present.length === withIds.length;
  const agree = allPresent && unique.length === 1;
  return {
    ok: agree,
    agree,
    allPresent,
    uniqueBuildIds: unique,
    agreedBuildId: agree ? unique[0] : null,
    observations: withIds,
  };
}

export async function fetchShellObservation(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  cookie = null,
  redirect = 'manual',
} = {}) {
  const started = Date.now();
  try {
    const headers = { Accept: 'text/html,application/xhtml+xml' };
    if (cookie) headers.Cookie = cookie;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const response = await fetchImpl(url, {
      redirect,
      headers,
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    const location = response.headers?.get?.('location') || null;
    let body = '';
    let buildId = null;
    if (response.status >= 200 && response.status < 300) {
      body = await response.text();
      buildId = extractTalariaChartBuildId(body);
    }
    return {
      url,
      status: response.status,
      location,
      buildId,
      bytes: body.length,
      elapsedMs: Date.now() - started,
      source: 'http',
      error: null,
      body,
    };
  } catch (error) {
    return {
      url,
      status: null,
      location: null,
      buildId: null,
      bytes: 0,
      elapsedMs: Date.now() - started,
      source: 'http',
      error: String(error?.message || error),
      body: '',
    };
  }
}

export function loadFixtureObservations(fixtureDir = DEFAULT_FIXTURE_DIR) {
  const abs = path.resolve(fixtureDir);
  const manifestPath = path.join(abs, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`SURF-3 fixture manifest missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const urls = manifest.urls && typeof manifest.urls === 'object' ? manifest.urls : {};
  const observations = [];
  for (const [url, meta] of Object.entries(urls)) {
    const file = path.join(abs, meta.fixtureFile);
    const body = fs.readFileSync(file, 'utf8');
    const buildId = extractTalariaChartBuildId(body);
    observations.push({
      url,
      status: 200,
      location: null,
      buildId,
      bytes: body.length,
      source: 'fixture',
      fixtureFile: meta.fixtureFile,
      expectedBuildId: meta.buildId || null,
      error: null,
      body,
    });
  }
  return { manifest, observations };
}

export async function collectSurf3Observations({
  baseUrl = SURF3_DEFAULT_BASE_URL,
  paths = SURF3_DEFAULT_SHELL_PATHS,
  fixtureDir = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  cookie = null,
} = {}) {
  if (fixtureDir) {
    return loadFixtureObservations(fixtureDir);
  }
  const urls = resolveSurf3ShellUrls({ baseUrl, paths });
  const observations = [];
  for (const url of urls) {
    const row = await fetchShellObservation(url, { fetchImpl, timeoutMs, cookie });
    observations.push(row);
  }
  return { manifest: null, observations };
}

export function assertSurf3BuildAgreement(reportLike) {
  const evaluation = reportLike?.evaluation || evaluateBuildAgreement(reportLike?.observations || []);
  const cells = [];
  cells.push(cell(
    'SURF3-SHELLS-FETCHED',
    evaluation.observations.length >= 2
      && evaluation.observations.every((row) => row.url != null && String(row.url).length > 0),
    {
      detail: `${evaluation.observations.length} shell URL(s) observed`,
      count: evaluation.observations.length,
    },
  ));
  cells.push(cell(
    'SURF3-BUILD-ID-PRESENT',
    evaluation.allPresent,
    {
      detail: evaluation.allPresent
        ? 'every shell emitted __TALARIA_CHART_BUILD_ID'
        : 'one or more shells missing __TALARIA_CHART_BUILD_ID (auth wall, empty body, or unstamped HTML)',
      observations: evaluation.observations.map((row) => ({
        url: row.url,
        buildId: row.buildId,
        status: row.status,
        error: row.error,
      })),
    },
  ));
  cells.push(cell(
    'SURF3-BUILD-ID-AGREE',
    evaluation.agree,
    {
      detail: evaluation.agree
        ? `all shells agree on ${evaluation.agreedBuildId}`
        : `BUILD_ID disagreement or gap: [${evaluation.uniqueBuildIds.join(', ') || 'none'}]`,
      uniqueBuildIds: evaluation.uniqueBuildIds,
      agreedBuildId: evaluation.agreedBuildId,
    },
  ));
  return cells;
}

export async function runSurf3BuildAgreementGate(options = {}) {
  const startedAt = new Date().toISOString();
  const { manifest, observations } = await collectSurf3Observations(options);
  const evaluation = evaluateBuildAgreement(observations);
  const cells = assertSurf3BuildAgreement({ evaluation, observations });
  const ok = cells.every((row) => row.pass === true);
  return {
    ok,
    status: ok ? 'GREEN' : 'RED',
    signature: SURF3_BUILD_AGREEMENT_SIGNATURE,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: options.fixtureDir ? 'fixture' : 'live',
    baseUrl: options.baseUrl || SURF3_DEFAULT_BASE_URL,
    fixtureDir: options.fixtureDir || null,
    manifest,
    observations: observations.map(({ body, ...rest }) => rest),
    evaluation,
    cells,
    error: ok ? null : cells.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join('; '),
  };
}

export function formatSurf3BuildAgreementReport(report) {
  const lines = [
    `SURF-3 BUILD-AGREEMENT ${report.status} (${report.signature})`,
    `mode=${report.mode} baseUrl=${report.baseUrl || 'n/a'}`,
    `uniqueBuildIds=[${(report.evaluation?.uniqueBuildIds || []).join(', ')}]`,
  ];
  for (const row of report.observations || []) {
    lines.push(`- ${row.url} status=${row.status ?? 'n/a'} buildId=${row.buildId ?? 'MISSING'}${row.location ? ` loc=${row.location}` : ''}${row.error ? ` err=${row.error}` : ''}`);
  }
  for (const cellRow of report.cells || []) {
    lines.push(`${cellRow.status} ${cellRow.name}: ${cellRow.detail}`);
  }
  if (report.error) lines.push(`error: ${report.error}`);
  return lines.join('\n');
}

export function defaultSurf3Gate01FixtureDir() {
  return DEFAULT_FIXTURE_DIR;
}
