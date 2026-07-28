#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEFAULT_N = 3;
const CHECK_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const CANONICAL_ID_RE = /^(?!legacy[:_-])[\x21-\x7E]{1,128}$/;

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
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const inline = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : null;
      out[key] = inline ?? argv[++i];
    }
  }
  out.n = Number.parseInt(String(out.n ?? DEFAULT_N), 10);
  return out;
}

function stableIds(trades) {
  return (Array.isArray(trades) ? trades : []).map((trade) => tradeId(trade)).filter(Boolean);
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
  const observed = { expected, observed: observedIds.length, ids: observedIds, missing, extra, nulls, gaps };
  if (observedIds.length !== expected || missing.length || extra.length || nulls || gaps.length) {
    return fail('L1', observed, 'registered trades were not conserved exactly');
  }
  return pass('L1', observed);
}

async function checkL2(adapter, opts) {
  const before = stableIds(await adapter.fetchBackendTrades()).filter((id) => !opts.runId || id.includes(opts.runId));
  if (!before.length) return skip('L2', { before }, 'no ledger ids available; id-stability precondition missing');
  if (typeof adapter.simulateSessionBoundary === 'function') await adapter.simulateSessionBoundary();
  const after = stableIds(await adapter.fetchBackendTrades()).filter((id) => !opts.runId || id.includes(opts.runId));
  const refetch = stableIds(await adapter.fetchBackendTrades()).filter((id) => !opts.runId || id.includes(opts.runId));
  const observed = { before, after, refetch };
  if (JSON.stringify(before) !== JSON.stringify(refetch) || JSON.stringify(before) !== JSON.stringify(after)) {
    return fail('L2', observed, 'ids changed across refetch or simulated session boundary');
  }
  return pass('L2', observed);
}

async function checkL3(adapter, opts) {
  const ids = stableIds(await adapter.fetchBackendTrades()).filter((id) => !opts.runId || id.includes(opts.runId));
  if (!ids.length) return skip('L3', { ids }, 'no ids available for grammar check');
  const bad = ids.filter((id) => !CANONICAL_ID_RE.test(id));
  const legacy = ids.filter((id) => /^legacy[:_-]/.test(id));
  const observed = { regex: String(CANONICAL_ID_RE), ids, bad, legacy };
  if (bad.length || legacy.length) return fail('L3', observed, 'non-conforming or legacy-alias ids leaked');
  return pass('L3', observed);
}

async function checkL4(adapter, opts) {
  let rows = await adapter.fetchBackendTrades();
  let ids = stableIds(rows).filter((id) => !opts.runId || id.includes(opts.runId));
  const duplicateIds = multisetDuplicates(ids);
  if (duplicateIds.length) return fail('L4', { ids, duplicateIds }, 'ledger contains duplicate ids before duplicate-submit probe');
  if (!opts.write) return skip('L4', { ids }, 'write mode disabled; duplicate-submit merge not attempted');
  const dupe = makeTrade(opts.runId, 1, { pnl: 444 });
  await adapter.registerTrade(dupe);
  rows = await adapter.fetchBackendTrades();
  const afterSecond = stableIds(rows).filter((id) => id === dupe.tradeId).length;
  const snapshotAfterSecond = JSON.stringify(rows.filter((row) => tradeId(row) === dupe.tradeId));
  await adapter.registerTrade({ ...dupe, pnl: 444 });
  rows = await adapter.fetchBackendTrades();
  const afterThird = stableIds(rows).filter((id) => id === dupe.tradeId).length;
  const snapshotAfterThird = JSON.stringify(rows.filter((row) => tradeId(row) === dupe.tradeId));
  const observed = { id: dupe.tradeId, afterSecond, afterThird, unchangedOnThird: snapshotAfterSecond === snapshotAfterThird };
  if (afterSecond !== 1 || afterThird !== 1 || snapshotAfterSecond !== snapshotAfterThird) {
    return fail('L4', observed, 'duplicate submit did not deterministically merge to one unchanged row');
  }
  return pass('L4', observed);
}

async function checkL5(adapter, opts) {
  if (typeof adapter.fetchBrowserTrades !== 'function') {
    return skip('L5', {}, 'browser-visible ledger endpoint is not configured');
  }
  const backendIds = idSet(stableIds(await adapter.fetchBackendTrades()).filter((id) => !opts.runId || id.includes(opts.runId)));
  const browserIds = idSet(stableIds(await adapter.fetchBrowserTrades()).filter((id) => !opts.runId || id.includes(opts.runId)));
  const missingInBrowser = backendIds.filter((id) => !browserIds.includes(id));
  const extraInBrowser = browserIds.filter((id) => !backendIds.includes(id));
  const observed = { backendCount: backendIds.length, browserCount: browserIds.length, backendIds, browserIds, missingInBrowser, extraInBrowser };
  if (backendIds.length !== browserIds.length || missingInBrowser.length || extraInBrowser.length) {
    return fail('L5', observed, 'browser-visible id set differs from backend id set');
  }
  return pass('L5', observed);
}

async function checkL6(adapter) {
  if (typeof adapter.migrateLegacyAliases !== 'function') {
    return skip('L6', {}, 'no deployed HTTP endpoint was found for re-running legacy-alias migration');
  }
  const first = await adapter.migrateLegacyAliases();
  const second = await adapter.migrateLegacyAliases();
  const observed = { first, second };
  const firstSnapshot = first?.snapshot ?? JSON.stringify(first);
  const secondSnapshot = second?.snapshot ?? JSON.stringify(second);
  if (firstSnapshot !== secondSnapshot) {
    return fail('L6', observed, 'legacy-alias migration is not idempotent');
  }
  const ids = stableIds(second?.trades ?? second);
  const dups = multisetDuplicates(ids);
  if (dups.length) return fail('L6', { ...observed, duplicateIds: dups }, 'migration created duplicate rows');
  return pass('L6', observed);
}

export async function runChecks(adapter, options = {}) {
  const opts = { n: DEFAULT_N, runId: randomUUID().slice(0, 8), write: false, ...options };
  assertQaWriteSafety(opts);
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
    async migrateLegacyAliases() {
      return this.fetchState();
    },
  };
}

export function createFixtureAdapter({ mutate = null } = {}) {
  let backend = [];
  let browser = backend;
  let migrated = false;
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
    async migrateLegacyAliases() {
      if (!migrated) {
        backend = backend.map((row) => {
          const id = tradeId(row).replace(/^legacy[:_-]/, 'migrated-');
          return { ...row, tradeId: id, id, client_trade_id: id };
        });
        migrated = true;
      } else if (mutate === 'L6') {
        backend.push({ ...backend[0], tradeId: `${tradeId(backend[0])}-copy` });
      }
      return { trades: JSON.parse(JSON.stringify(backend)) };
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
  console.log(`base_url=${opts.baseUrl || 'fixture'} account_id=${opts.accountId || 'n/a'} qa_account_id=${opts.qaAccountId || 'n/a'} session_id=${opts.sessionId || 'n/a'} mode=${opts.write ? 'write' : 'dry-run'}`);
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
  const adapter = createHttpAdapter(opts);
  const results = await runChecks(adapter, opts);
  printResults(results, opts);
  if (results.length !== CHECK_IDS.length || results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const opts = parseArgs(process.argv.slice(2));
    printResults(CHECK_IDS.map((id) => fail(id, { error: error?.message ?? String(error) }, 'harness startup failure')), opts);
    process.exitCode = 1;
  });
}

export { CANONICAL_ID_RE, CHECK_IDS, makeTrade, tradeId, requestJson, validateOptions };
