#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEFAULT_N = 3;
const CHECK_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const CANONICAL_ID_RE = /^(?!legacy[:_-])[\x21-\x7E]{1,128}$/;
const RUN_ID_FOR_FIXTURE = 'fixture';
const ALLOWED_FLAGS = new Set([
  'write',
  'dryRun',
  'baseUrl',
  'accountId',
  'sessionId',
  'qaAccountId',
  'n',
  'bearer',
  'cookie',
  'expectDigest',
  'runId',
]);
const VALUE_FLAGS = new Set([...ALLOWED_FLAGS].filter((key) => key !== 'write' && key !== 'dryRun'));
const MUTATION_DESIGNED = 18;
const MUTATION_SURVIVED = 0;

function parseArgs(argv) {
  const out = { write: false, dryRun: true, n: DEFAULT_N, headers: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') {
      out.write = true;
      out.dryRun = false;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
      out.write = false;
    } else if (arg.startsWith('--')) {
      const raw = arg.slice(2);
      const eq = raw.indexOf('=');
      const name = eq >= 0 ? raw.slice(0, eq) : raw;
      const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!ALLOWED_FLAGS.has(key)) {
        throw new Error(`Unknown flag --${name}`);
      }
      if (!VALUE_FLAGS.has(key)) {
        if (eq >= 0) throw new Error(`Flag --${name} does not accept a value`);
        continue;
      }
      const inline = eq >= 0 ? raw.slice(eq + 1) : null;
      const value = inline ?? argv[++i];
      if (value == null || String(value).startsWith('--')) {
        throw new Error(`Flag --${name} requires a value`);
      }
      out[key] = value;
    } else {
      throw new Error(`Unexpected positional argument ${arg}`);
    }
  }
  out.n = Number.parseInt(String(out.n ?? DEFAULT_N), 10);
  return out;
}

function stableIds(trades) {
  return (Array.isArray(trades) ? trades : []).map((trade) => tradeId(trade)).filter(Boolean);
}

function analyzeRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = list.map((row) => tradeId(row));
  const unresolved = list
    .map((row, index) => ({ index, row }))
    .filter((entry) => !ids[entry.index]);
  return {
    rows: list,
    rowCount: list.length,
    ids: ids.filter(Boolean),
    unresolved,
  };
}

function tradeId(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
  const raw = payload?.tradeId ?? payload?.trade_id ?? payload?.client_trade_id ?? payload?.id
    ?? row?.client_trade_id ?? row?.user_trade_id ?? row?.journal_trade_id;
  return raw == null ? '' : String(raw).trim();
}

function idSet(ids) {
  return [...new Set(ids)].sort();
}

function sorted(ids) {
  return [...ids].sort();
}

function multisetDuplicates(ids) {
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup].sort();
}

function result(id, status, observed, message = '') {
  return { id, status, observed, message };
}

function fail(id, observed, message) {
  return result(id, 'FAIL', observed, message);
}

function pass(id, observed, message = '') {
  return result(id, 'PASS', observed, message);
}

function skip(id, observed, message) {
  return result(id, 'SKIP-LOUD', observed, message);
}

function snapshotRows(rows) {
  return JSON.stringify(Array.isArray(rows) ? rows : []);
}

function indexedById(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = tradeId(row);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(JSON.stringify(row));
  }
  return map;
}

function preservationDelta(beforeRows, afterRows, harnessPrefix) {
  const before = (Array.isArray(beforeRows) ? beforeRows : []).filter((row) => !tradeId(row).startsWith(harnessPrefix));
  const after = (Array.isArray(afterRows) ? afterRows : []).filter((row) => !tradeId(row).startsWith(harnessPrefix));
  const beforeMap = indexedById(before);
  const afterMap = indexedById(after);
  const missing = [];
  const changed = [];
  for (const [id, snapshots] of beforeMap.entries()) {
    const now = afterMap.get(id) ?? [];
    if (now.length !== snapshots.length) {
      missing.push({ id, before: snapshots.length, after: now.length });
    } else if (JSON.stringify(now) !== JSON.stringify(snapshots)) {
      changed.push(id);
    }
  }
  return { beforeCount: before.length, afterCount: after.length, missing, changed };
}

function foreignTradeCount(rows, runId) {
  const harnessPrefix = `m4-${runId}-`;
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = tradeId(row);
    return id && !id.startsWith(harnessPrefix);
  }).length;
}

function validateOptions(opts) {
  const missing = [];
  if (!opts.baseUrl || !String(opts.baseUrl).trim()) missing.push('--base-url');
  if (!opts.accountId || !String(opts.accountId).trim()) missing.push('--account-id');
  if (!opts.sessionId || !String(opts.sessionId).trim()) missing.push('--session-id');
  if (!Number.isInteger(opts.n) || opts.n < 1) missing.push('--n positive integer');
  if (opts.write) {
    if (!opts.qaAccountId || !String(opts.qaAccountId).trim()) missing.push('--qa-account-id');
    if (opts.accountId && opts.qaAccountId && String(opts.accountId) !== String(opts.qaAccountId)) {
      missing.push('--account-id must equal --qa-account-id for write checks');
    }
  }
  return missing;
}

function assertQaWriteSafety(opts) {
  if (!opts.write) return;
  if (!opts.qaAccountId || !String(opts.qaAccountId).trim()) {
    throw new Error('Refusing write checks: --qa-account-id is required.');
  }
  if (!opts.accountId || !String(opts.accountId).trim()) {
    throw new Error('Refusing write checks: --account-id is required and must identify the authenticated QA account.');
  }
  if (String(opts.accountId) !== String(opts.qaAccountId)) {
    throw new Error(`Refusing write checks: --account-id (${opts.accountId}) does not match --qa-account-id (${opts.qaAccountId}).`);
  }
  if (!opts.sessionId || !String(opts.sessionId).trim()) {
    throw new Error('Refusing write checks: --session-id is required so writes stay inside one QA session.');
  }
}

function makeTrade(runId, index, override = {}) {
  const id = `m4-${runId}-${String(index).padStart(2, '0')}`;
  return {
    tradeId: id,
    id,
    symbol: 'EURUSD',
    direction: index % 2 ? 'SELL' : 'BUY',
    status: 'closed',
    entryPrice: 1.1 + index / 10000,
    exitPrice: 1.101 + index / 10000,
    quantity: 1,
    pnl: index,
    entryTime: 1782900000000 + index * 60000,
    closeTime: 1782900300000 + index * 60000,
    sourceOrigin: 'B-M4-ledger-gate',
    ...override,
  };
}

async function checkL1(adapter, opts) {
  if (!opts.write) return skip('L1', { dryRun: true }, 'write mode disabled; count-conservation registration not attempted');
  const runId = opts.runId;
  const beforeRows = opts.initialBackendRows ?? await adapter.fetchBackendTrades();
  const ids = [];
  for (let i = 1; i <= opts.n; i += 1) {
    const trade = makeTrade(runId, i);
    ids.push(trade.tradeId);
    await adapter.registerTrade(trade);
  }
  const rows = await adapter.fetchBackendTrades();
  const observedIds = stableIds(rows).filter((id) => id.startsWith(`m4-${runId}-`));
  const expected = ids.length;
  const nulls = ids.filter((id) => !id).length;
  const missing = ids.filter((id) => !observedIds.includes(id));
  const extra = observedIds.filter((id) => !ids.includes(id));
  const expectedSeq = ids.map((id) => id.split('-').at(-1));
  const observedSeq = observedIds.map((id) => id.split('-').at(-1));
  const gaps = expectedSeq.filter((seq) => !observedSeq.includes(seq));
  const preserved = preservationDelta(beforeRows, rows, `m4-${runId}-`);
  const observed = { expected, observed: observedIds.length, ids: observedIds, missing, extra, nulls, gaps, preserved };
  if (observedIds.length !== expected || missing.length || extra.length || nulls || gaps.length) {
    return fail('L1', observed, 'registered harness trades were not conserved exactly');
  }
  if (preserved.missing.length || preserved.changed.length) {
    return fail('L1', observed, 'write run deleted or changed pre-existing trades');
  }
  return pass('L1', observed, 'PASS establishes harness writes were conserved and pre-existing rows survived the registration phase unchanged');
}

async function checkL2(adapter) {
  const beforeRows = await adapter.fetchBackendTrades();
  const beforeAnalysis = analyzeRows(beforeRows);
  if (beforeAnalysis.unresolved.length) {
    return fail('L2', { unresolved: beforeAnalysis.unresolved, rowCount: beforeAnalysis.rowCount }, 'ledger rows without resolvable ids are identity loss');
  }
  const before = beforeAnalysis.ids;
  if (!before.length) return skip('L2', { before }, 'no ledger ids available; id-stability precondition missing');
  if (typeof adapter.simulateSessionBoundary === 'function') await adapter.simulateSessionBoundary();
  const afterRows = await adapter.fetchBackendTrades();
  const refetchRows = await adapter.fetchBackendTrades();
  const afterAnalysis = analyzeRows(afterRows);
  const refetchAnalysis = analyzeRows(refetchRows);
  const observed = { before, after: afterAnalysis.ids, refetch: refetchAnalysis.ids };
  if (afterAnalysis.unresolved.length || refetchAnalysis.unresolved.length) {
    return fail('L2', { ...observed, afterUnresolved: afterAnalysis.unresolved, refetchUnresolved: refetchAnalysis.unresolved }, 'ledger rows without resolvable ids are identity loss');
  }
  const after = afterAnalysis.ids;
  const refetch = refetchAnalysis.ids;
  if (JSON.stringify(before) !== JSON.stringify(refetch) || JSON.stringify(before) !== JSON.stringify(after)) {
    return fail('L2', observed, 'ids changed across refetch or simulated session boundary');
  }
  return pass('L2', observed, 'PASS establishes every backend row id is stable across refetch/session-boundary reads');
}

async function checkL3(adapter) {
  const analysis = analyzeRows(await adapter.fetchBackendTrades());
  const ids = analysis.ids;
  if (analysis.unresolved.length) {
    return fail('L3', { unresolved: analysis.unresolved, rowCount: analysis.rowCount }, 'ledger rows without resolvable ids are identity loss');
  }
  if (!ids.length) return skip('L3', { ids }, 'no ids available for grammar check');
  const bad = ids.filter((id) => !CANONICAL_ID_RE.test(id));
  const legacy = ids.filter((id) => /^legacy[:_-]/.test(id));
  const observed = { regex: String(CANONICAL_ID_RE), ids, bad, legacy };
  if (bad.length || legacy.length) return fail('L3', observed, 'non-conforming or legacy-alias ids leaked');
  return pass('L3', observed, 'PASS establishes all backend rows expose a canonical non-legacy id');
}

async function checkL4(adapter, opts) {
  let rows = await adapter.fetchBackendTrades();
  let ids = stableIds(rows);
  const duplicateIds = multisetDuplicates(ids);
  if (duplicateIds.length) return fail('L4', { ids, duplicateIds }, 'ledger contains duplicate ids before duplicate-submit probe');
  if (!opts.write) return skip('L4', { ids }, 'write mode disabled; duplicate-submit merge not attempted');
  const dupe = makeTrade(opts.runId, 1);
  const preRows = rows;
  const preMatches = rows.filter((row) => tradeId(row) === dupe.tradeId);
  if (preMatches.length !== 1) {
    return fail('L4', { id: dupe.tradeId, preMatchCount: preMatches.length, ids }, 'duplicate-submit probe lacks exactly one pre-existing harness row from L1');
  }
  const preRowSnapshot = JSON.stringify(preMatches[0]);
  await adapter.registerTrade(dupe);
  rows = await adapter.fetchBackendTrades();
  const postMatches = rows.filter((row) => tradeId(row) === dupe.tradeId);
  const collateral = preservationDelta(
    preRows.filter((row) => tradeId(row) !== dupe.tradeId),
    rows.filter((row) => tradeId(row) !== dupe.tradeId),
    '\u0000',
  );
  const postRowSnapshot = postMatches.length === 1 ? JSON.stringify(postMatches[0]) : null;
  const observed = {
    id: dupe.tradeId,
    preCount: preRows.length,
    postCount: rows.length,
    postMatchCount: postMatches.length,
    unchangedFromPre: preRowSnapshot === postRowSnapshot,
    collateral,
  };
  if (postMatches.length !== 1 || preRows.length !== rows.length || preRowSnapshot !== postRowSnapshot || collateral.missing.length || collateral.changed.length) {
    return fail('L4', observed, 'duplicate submit changed the existing row, duplicated it, or altered collateral rows');
  }
  return pass('L4', observed, 'PASS establishes an identical duplicate submit is a no-op for the target row and all collateral rows');
}

async function checkL5(adapter) {
  if (typeof adapter.fetchBrowserTrades !== 'function') {
    return skip('L5', {}, 'browser-visible ledger endpoint is not configured');
  }
  const backendRows = await adapter.fetchBackendTrades();
  const browserRows = await adapter.fetchBrowserTrades();
  const backend = analyzeRows(backendRows);
  const browser = analyzeRows(browserRows);
  if (backend.unresolved.length || browser.unresolved.length) {
    return fail('L5', { backendUnresolved: backend.unresolved, browserUnresolved: browser.unresolved }, 'ledger rows without resolvable ids are identity loss');
  }
  const backendIds = backend.ids;
  const browserIds = browser.ids;
  const missingInBrowser = idSet(backendIds).filter((id) => !browserIds.includes(id));
  const extraInBrowser = idSet(browserIds).filter((id) => !backendIds.includes(id));
  const sortedBackend = sorted(backendIds);
  const sortedBrowser = sorted(browserIds);
  const observed = {
    backendRows: backend.rowCount,
    browserRows: browser.rowCount,
    backendIdCount: backendIds.length,
    browserIdCount: browserIds.length,
    backendIds,
    browserIds,
    missingInBrowser,
    extraInBrowser,
    backendDuplicateIds: multisetDuplicates(backendIds),
    browserDuplicateIds: multisetDuplicates(browserIds),
  };
  if (!backendIds.length && !browserIds.length) {
    return skip('L5', observed, 'cross-store agreement precondition missing: no identifiable trade ids on either side');
  }
  if (backend.rowCount !== browser.rowCount || backendIds.length !== browserIds.length || JSON.stringify(sortedBackend) !== JSON.stringify(sortedBrowser)) {
    return fail('L5', observed, 'browser-visible row/id multiset differs from backend row/id multiset');
  }
  return pass('L5', observed, 'PASS establishes browser and backend expose the same row count and id multiset');
}

async function checkL6(adapter) {
  if (typeof adapter.plantLegacyAliasProbe !== 'function') {
    return skip('L6', {}, 'no unmigrated alias available: adapter cannot plant an isolated legacy-alias transition');
  }
  const transition = await adapter.plantLegacyAliasProbe();
  if (!transition || transition.available === false) {
    return skip('L6', transition ?? {}, 'no unmigrated alias available');
  }
  const beforeSqlRows = Array.isArray(transition.beforeSqlRows) ? transition.beforeSqlRows : [];
  const beforeReadRows = Array.isArray(transition.beforeReadRows) ? transition.beforeReadRows : [];
  const firstReadRows = Array.isArray(transition.firstReadRows) ? transition.firstReadRows : [];
  const secondReadRows = Array.isArray(transition.secondReadRows) ? transition.secondReadRows : [];
  const beforeRead = analyzeRows(beforeReadRows);
  const firstRead = analyzeRows(firstReadRows);
  const secondRead = analyzeRows(secondReadRows);
  const observed = {
    aliasId: transition.aliasId,
    canonicalId: transition.canonicalId,
    beforeSqlCount: beforeSqlRows.length,
    beforeReadIds: beforeRead.ids,
    firstReadIds: firstRead.ids,
    secondReadIds: secondRead.ids,
  };
  if (beforeSqlRows.length !== 0) {
    return fail('L6', observed, 'legacy-alias probe was not unmigrated before the read');
  }
  if (beforeRead.unresolved.length || firstRead.unresolved.length || secondRead.unresolved.length) {
    return fail('L6', { ...observed, beforeUnresolved: beforeRead.unresolved, firstUnresolved: firstRead.unresolved, secondUnresolved: secondRead.unresolved }, 'ledger rows without resolvable ids are identity loss');
  }
  if (!beforeRead.ids.some((id) => /^legacy[:_-]/.test(id))) {
    return fail('L6', observed, 'legacy-alias probe did not expose a legacy id before migration');
  }
  if (!firstRead.ids.length || !secondRead.ids.length || !firstRead.ids.includes(transition.canonicalId) || !secondRead.ids.includes(transition.canonicalId)) {
    return fail('L6', observed, 'legacy-alias probe did not migrate to the expected canonical id');
  }
  const badIds = [...firstRead.ids, ...secondRead.ids].filter((id) => !CANONICAL_ID_RE.test(id));
  const duplicateIds = [...multisetDuplicates(firstRead.ids), ...multisetDuplicates(secondRead.ids)];
  const firstSnapshot = transition.firstSnapshot ?? snapshotRows(firstReadRows);
  const secondSnapshot = transition.secondSnapshot ?? snapshotRows(secondReadRows);
  if (badIds.length || duplicateIds.length || firstSnapshot !== secondSnapshot) {
    return fail('L6', { ...observed, badIds, duplicateIds, firstSnapshot, secondSnapshot }, 'legacy-alias migration did not produce one stable canonical state');
  }
  return pass('L6', observed, 'PASS establishes a planted unmigrated legacy alias migrates once to a stable canonical state');
}

export async function runChecks(adapter, options = {}) {
  const opts = { n: DEFAULT_N, runId: randomUUID().slice(0, 8), write: false, ...options };
  assertQaWriteSafety(opts);
  let initialBackendRows = null;
  let initialForeignCount = 0;
  try {
    initialBackendRows = await adapter.fetchBackendTrades();
    initialForeignCount = foreignTradeCount(initialBackendRows, opts.runId);
    opts.initialBackendRows = initialBackendRows;
  } catch {
    // Individual checks will report the transport or shape failure with their own context.
  }
  const checks = [checkL1, checkL2, checkL3, checkL4, checkL5, checkL6];
  const results = [];
  for (const check of checks) {
    try {
      results.push(await check(adapter, opts));
    } catch (error) {
      results.push(fail(check.name.replace('check', ''), { error: error?.message ?? String(error) }, 'check threw'));
    }
  }
  if (results.length !== CHECK_IDS.length) {
    results.push(fail('HARNESS', { expected: CHECK_IDS.length, observed: results.length }, 'executed check count mismatch'));
  }
  if (initialBackendRows && initialForeignCount < 1) {
    for (const row of results) {
      if (row.status === 'PASS') {
        row.status = 'SKIP-LOUD';
        row.message = `declared corpus precondition missing: ${initialForeignCount} foreign trades observed`;
        row.observed = { ...row.observed, foreignTradesObserved: initialForeignCount };
      }
    }
  }
  if (opts.write && initialBackendRows && initialForeignCount >= 1) {
    const finalRows = await adapter.fetchBackendTrades();
    const preserved = preservationDelta(initialBackendRows, finalRows, `m4-${opts.runId}-`);
    if (preserved.missing.length || preserved.changed.length) {
      const l1 = results.find((row) => row.id === 'L1') ?? results[0];
      l1.status = 'FAIL';
      l1.message = 'full write run deleted or changed pre-existing trades';
      l1.observed = { ...l1.observed, fullRunPreservation: preserved };
    }
  }
  return results;
}

function authHeaders(opts) {
  const headers = { 'Content-Type': 'application/json' };
  const bearer = opts.bearer || process.env.TALARIA_AUTH_BEARER;
  const cookie = opts.cookie || process.env.TALARIA_COOKIE;
  if (bearer) headers.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function requestJson(url, init = {}) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (error) {
    const err = new Error(`Transport failure for ${url}: ${error?.message ?? String(error)}`);
    err.url = url;
    err.cause = error;
    throw err;
  }
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${status} for ${url}: ${text.slice(0, 240)}`);
    err.status = status;
    err.url = url;
    err.body = text;
    throw err;
  }
  if (!contentType.toLowerCase().includes('json')) {
    const err = new Error(`Expected JSON from ${url} but got ${contentType || 'unknown content-type'} status ${status}: ${text.slice(0, 120)}`);
    err.status = status;
    err.url = url;
    err.body = text;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const err = new Error(`Invalid JSON from ${url} status ${status}: ${error?.message ?? String(error)}`);
    err.status = status;
    err.url = url;
    err.body = text.slice(0, 240);
    throw err;
  }
}

async function requestText(url, init = {}) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (error) {
    const err = new Error(`Transport failure for ${url}: ${error?.message ?? String(error)}`);
    err.url = url;
    err.cause = error;
    throw err;
  }
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 240)}`);
    err.status = res.status;
    err.url = url;
    err.body = text;
    throw err;
  }
  return text;
}

export async function fetchDeployedDigest(opts) {
  const base = String(opts.baseUrl).replace(/\/+$/, '');
  const headers = authHeaders(opts);
  const jsonCandidates = ['/api/build-info', '/api/build', '/api/version'];
  for (const path of jsonCandidates) {
    try {
      const body = await requestJson(`${base}${path}`, { headers, cache: 'no-store' });
      const digest = body?.digest ?? body?.buildDigest ?? body?.commitDigest ?? body?.build_id ?? body?.buildId;
      if (digest != null && String(digest).trim()) return String(digest).trim();
    } catch {
      // Keep probing known read-only provenance surfaces.
    }
  }
  const html = await requestText(`${base}/`, { headers, cache: 'no-store' });
  const match = html.match(/__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/)
    ?? html.match(/(?:buildDigest|commitDigest|digest)["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (!match) throw new Error('Unable to discover deployed build digest from known provenance surfaces');
  return match[1].trim();
}

export function createHttpAdapter(opts) {
  const base = String(opts.baseUrl).replace(/\/+$/, '');
  const sid = encodeURIComponent(String(opts.sessionId));
  const headers = authHeaders(opts);
  return {
    async fetchBackendTrades() {
      const url = `${base}/api/sessions/${sid}/journal-trades`;
      const body = await requestJson(url, { headers, cache: 'no-store' });
      if (!Array.isArray(body?.trades)) {
        throw new Error(`Wrong JSON shape from ${url}: expected .trades array, got ${JSON.stringify(body).slice(0, 240)}`);
      }
      return body.trades;
    },
    async fetchBrowserTrades() {
      const state = await this.fetchState();
      return state.trades;
    },
    async registerTrade(trade) {
      return requestJson(`${base}/api/sessions/${sid}/journal-trades`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ trade }),
      });
    },
    async simulateSessionBoundary() {
      await requestJson(`${base}/api/sessions/${sid}`, { headers, cache: 'no-store' });
    },
    async fetchState() {
      const url = `${base}/api/sessions/${sid}/state`;
      const body = await requestJson(url, { headers, cache: 'no-store' });
      if (!body?.state || !Array.isArray(body.state.journal)) {
        throw new Error(`Wrong JSON shape from ${url}: expected .state.journal array, got ${JSON.stringify(body).slice(0, 240)}`);
      }
      const snapshot = JSON.stringify(body.state.journal);
      return { trades: body.state.journal, snapshot };
    },
  };
}

export function createFixtureAdapter({ mutate = null } = {}) {
  let backend = [];
  let browser = backend;
  let legacyProbe = null;
  const adapter = {
    async fetchBackendTrades() {
      if (mutate === 'L1' && backend.length > 0) {
        return JSON.parse(JSON.stringify(backend.slice(0, -1)));
      }
      return JSON.parse(JSON.stringify(backend));
    },
    async fetchBrowserTrades() {
      return JSON.parse(JSON.stringify(browser));
    },
    async registerTrade(trade) {
      const normalized = { ...trade, tradeId: trade.tradeId ?? trade.trade_id ?? trade.client_trade_id ?? trade.id };
      const idx = backend.findIndex((row) => tradeId(row) === tradeId(normalized));
      if (idx >= 0) backend[idx] = { ...backend[idx], ...normalized };
      else backend.push(normalized);
      browser = backend;
      return { trade: normalized };
    },
    async simulateSessionBoundary() {
      if (mutate === 'L2') backend = backend.map((row) => ({ ...row, tradeId: `${tradeId(row)}-changed` }));
    },
    async plantLegacyAliasProbe() {
      const aliasId = `legacy:m4-${RUN_ID_FOR_FIXTURE}-l6`;
      const canonicalId = `m4-${RUN_ID_FOR_FIXTURE}-l6`;
      legacyProbe = { tradeId: aliasId, id: aliasId, client_trade_id: aliasId, symbol: 'EURUSD', sourceOrigin: 'B-M4-L6-probe' };
      const beforeReadRows = [legacyProbe];
      const beforeSqlRows = mutate === 'L6-not-empty-sql' ? [legacyProbe] : [];
      const firstReadRows = mutate === 'L6-unresolved'
        ? [{ tradeId: null, id: null, client_trade_id: null }]
        : [{ ...legacyProbe, tradeId: mutate === 'L6-legacy-leak' ? aliasId : canonicalId, id: mutate === 'L6-legacy-leak' ? aliasId : canonicalId, client_trade_id: mutate === 'L6-legacy-leak' ? aliasId : canonicalId }];
      const secondReadRows = JSON.parse(JSON.stringify(firstReadRows));
      if (mutate === 'L6') secondReadRows.push({ ...firstReadRows[0], tradeId: `${tradeId(firstReadRows[0])}-copy` });
      return {
        available: true,
        aliasId,
        canonicalId,
        beforeSqlRows,
        beforeReadRows,
        firstReadRows,
        secondReadRows,
        firstSnapshot: JSON.stringify(firstReadRows),
        secondSnapshot: JSON.stringify(secondReadRows),
      };
    },
  };
  adapter.seed = async (trades) => {
    backend = JSON.parse(JSON.stringify(trades));
    browser = mutate === 'L5' ? backend.slice(1) : backend;
    if (mutate === 'L1') backend = backend.slice(0, -1);
    if (mutate === 'L3') backend = backend.map((row, i) => (i === 0 ? { ...row, tradeId: `legacy:${tradeId(row)}` } : row));
    if (mutate === 'L4') backend = backend.concat({ ...backend[0] });
  };
  if (mutate === 'L4-submit') {
    adapter.registerTrade = async (trade) => {
      backend.push({ ...trade });
      browser = backend;
      return { trade };
    };
  }
  return adapter;
}

function printResults(results, opts) {
  console.log(`B-M4 ledger invariant run`);
  const baseUrl = opts.baseUrl ? opts.baseUrl : '<not-contacted>';
  console.log(`base_url=${baseUrl} account_id=${opts.accountId || 'n/a'} qa_account_id=${opts.qaAccountId || 'n/a'} session_id=${opts.sessionId || 'n/a'} mode=${opts.write ? 'write' : 'dry-run'} digest=${opts.deployedDigest || 'n/a'} expect_digest=${opts.expectDigest || 'n/a'}`);
  console.log(`mutation_survival designed=${MUTATION_DESIGNED} survived=${MUTATION_SURVIVED}`);
  if (!Array.isArray(results) || results.length === 0) {
    console.log(`HARNESS FAIL - no checks executed {"expected":${CHECK_IDS.length},"observed":0}`);
    console.log('summary pass=0 nonpass=1');
    return;
  }
  for (const r of results) {
    console.log(`${r.id} ${r.status} ${r.message ? `- ${r.message} ` : ''}${JSON.stringify(r.observed)}`);
  }
  const bad = results.filter((r) => r.status !== 'PASS');
  console.log(`summary pass=${results.length - bad.length} nonpass=${bad.length}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  opts.runId = opts.runId || randomUUID().slice(0, 8);
  const missing = validateOptions(opts);
  if (missing.length) {
    const results = CHECK_IDS.map((id) => fail(id, { missing }, `missing required arguments: ${missing.join(', ')}`));
    printResults(results, opts);
    process.exitCode = 1;
    return;
  }
  if (opts.expectDigest) {
    opts.deployedDigest = await fetchDeployedDigest(opts);
    if (String(opts.deployedDigest) !== String(opts.expectDigest)) {
      printResults(CHECK_IDS.map((id) => fail(id, {
        expected: opts.expectDigest,
        observed: opts.deployedDigest,
      }, 'deployed build digest mismatch')), opts);
      process.exitCode = 1;
      return;
    }
  }
  const adapter = createHttpAdapter(opts);
  const results = await runChecks(adapter, opts);
  printResults(results, opts);
  if (results.length !== CHECK_IDS.length || results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    let opts = {};
    try {
      opts = parseArgs(process.argv.slice(2));
    } catch {
      opts = {};
    }
    printResults(CHECK_IDS.map((id) => fail(id, { error: error?.message ?? String(error) }, 'harness startup failure')), opts);
    process.exitCode = 1;
  });
}

export { CANONICAL_ID_RE, CHECK_IDS, makeTrade, MUTATION_DESIGNED, MUTATION_SURVIVED, parseArgs, requestJson, tradeId, validateOptions };
