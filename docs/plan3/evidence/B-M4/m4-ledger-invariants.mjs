#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEFAULT_N = 3;
const VERIFY_CHECK_IDS = ['L2', 'L3', 'L5', 'L7', 'L8'];
const WRITE_CHECK_IDS = ['L1', 'L4'];
const CHECK_IDS = [...VERIFY_CHECK_IDS, ...WRITE_CHECK_IDS];
const CANONICAL_ID_RE = /^(?!legacy[:_-])[\x21-\x7E]{1,128}$/;
const HARNESS_TRADE_ID_RE = /^m4-[0-9a-f]{8}-\d{2}$/;
const ALLOWED_FLAGS = new Set([
  'verifyOnly',
  'writeProbe',
  'baseUrl',
  'accountId',
  'sessionId',
  'disposableSessionId',
  'qaAccountId',
  'n',
  'bearer',
  'cookie',
  'expectDigest',
  'expectForeignId',
  'runId',
]);
const VALUE_FLAGS = new Set([...ALLOWED_FLAGS].filter((key) => key !== 'verifyOnly' && key !== 'writeProbe'));

function parseArgs(argv) {
  const out = { mode: 'verify-only', n: DEFAULT_N, headers: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--verify-only') {
      out.mode = 'verify-only';
    } else if (arg === '--write-probe') {
      out.mode = 'write-probe';
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
      if (value == null || String(value).startsWith('--') || String(value).trim() === '') {
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
  const details = list.map((row) => rowIdentity(row));
  const ids = details.map((detail) => detail.id);
  const unresolved = list
    .map((row, index) => ({ index, row }))
    .filter((entry) => !ids[entry.index]);
  const identityIssues = details
    .map((detail, index) => ({ index, ...detail }))
    .filter((detail) => detail.issues.length);
  return {
    rows: list,
    rowCount: list.length,
    ids: ids.filter(Boolean),
    unresolved,
    identityIssues,
    details,
  };
}

function tradeId(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
  const raw = payload?.tradeId ?? payload?.trade_id ?? payload?.client_trade_id ?? payload?.id
    ?? row?.client_trade_id ?? row?.user_trade_id ?? row?.journal_trade_id;
  return raw == null ? '' : String(raw).trim();
}

function rowIdentity(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
  const id = tradeId(row);
  const columnId = row?.client_trade_id == null ? '' : String(row.client_trade_id).trim();
  const payloadIdRaw = payload?.tradeId ?? payload?.id;
  const payloadId = payloadIdRaw == null ? '' : String(payloadIdRaw).trim();
  const grammarId = columnId || id;
  const issues = [];
  if (!id) issues.push('unresolved-id');
  if (columnId && columnId !== id) issues.push('client-trade-id-mismatch');
  if (grammarId && !CANONICAL_ID_RE.test(grammarId)) issues.push('non-canonical-column-id');
  if (grammarId && /^legacy[:_-]/.test(grammarId)) issues.push('legacy-column-id');
  return { id, columnId, payloadId, grammarId, issues };
}

function vulnerablePayloadRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const detail = rowIdentity(row);
      return { index, id: detail.columnId || detail.id || tradeId(row), row };
    })
    .filter((entry) => {
      const payload = entry.row?.payload && typeof entry.row.payload === 'object' ? entry.row.payload : entry.row;
      const payloadId = payload?.tradeId ?? payload?.id;
      return payloadId == null || String(payloadId).trim() === '';
    });
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

function stableProjection(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row;
  return {
    id: tradeId(row),
    client_trade_id: row?.client_trade_id ?? payload?.client_trade_id ?? null,
    payloadTradeId: payload?.tradeId ?? null,
    payloadId: payload?.id ?? null,
    symbol: payload?.symbol ?? row?.symbol ?? null,
    direction: payload?.direction ?? payload?.side ?? row?.direction ?? row?.side ?? null,
    status: payload?.status ?? row?.status ?? null,
    entryPrice: payload?.entryPrice ?? payload?.entry_price ?? row?.entryPrice ?? row?.entry_price ?? null,
    exitPrice: payload?.exitPrice ?? payload?.exit_price ?? row?.exitPrice ?? row?.exit_price ?? null,
    quantity: payload?.quantity ?? payload?.qty ?? row?.quantity ?? row?.qty ?? null,
    pnl: payload?.pnl ?? row?.pnl ?? null,
    entryTime: payload?.entryTime ?? payload?.entry_time ?? row?.entryTime ?? row?.entry_time ?? null,
    closeTime: payload?.closeTime ?? payload?.close_time ?? row?.closeTime ?? row?.close_time ?? null,
  };
}

function indexedById(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = tradeId(row);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(JSON.stringify(stableProjection(row)));
  }
  return map;
}

function preservationDelta(beforeRows, afterRows, harnessPrefix) {
  const isProtected = (row) => {
    const id = tradeId(row);
    return id && !HARNESS_TRADE_ID_RE.test(id) && !id.startsWith(harnessPrefix);
  };
  const before = (Array.isArray(beforeRows) ? beforeRows : []).filter(isProtected);
  const after = (Array.isArray(afterRows) ? afterRows : []).filter(isProtected);
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
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = tradeId(row);
    return id && !HARNESS_TRADE_ID_RE.test(id) && (!runId || !id.startsWith(`m4-${runId}-`));
  }).length;
}

function hasTradeId(rows, id) {
  return (Array.isArray(rows) ? rows : []).some((row) => tradeId(row) === id);
}

function validateOptions(opts) {
  const missing = [];
  const mode = opts.mode || 'verify-only';
  if (!['verify-only', 'write-probe'].includes(mode)) missing.push('--verify-only or --write-probe');
  if (!opts.baseUrl || !String(opts.baseUrl).trim()) missing.push('--base-url');
  if (!opts.accountId || !String(opts.accountId).trim()) missing.push('--account-id');
  if (!opts.sessionId || !String(opts.sessionId).trim()) missing.push('--session-id');
  if (!opts.expectDigest || !String(opts.expectDigest).trim()) missing.push('--expect-digest');
  if (!opts.expectForeignId || !String(opts.expectForeignId).trim()) {
    missing.push('--expect-foreign-id');
  } else if (HARNESS_TRADE_ID_RE.test(String(opts.expectForeignId).trim())) {
    missing.push('--expect-foreign-id must name a non-harness trade');
  }
  if (!Number.isInteger(opts.n) || opts.n < 1) missing.push('--n positive integer');
  if (mode === 'write-probe') {
    if (!opts.qaAccountId || !String(opts.qaAccountId).trim()) missing.push('--qa-account-id');
    if (!opts.disposableSessionId || !String(opts.disposableSessionId).trim()) missing.push('--disposable-session-id');
    if (opts.sessionId && opts.disposableSessionId && String(opts.sessionId) === String(opts.disposableSessionId)) {
      missing.push('--disposable-session-id must differ from --session-id');
    }
    if (opts.accountId && opts.qaAccountId && String(opts.accountId) !== String(opts.qaAccountId)) {
      missing.push('--account-id must equal --qa-account-id for write checks');
    }
  }
  return missing;
}

function assertQaWriteSafety(opts) {
  if (opts.mode !== 'write-probe') return;
  if (!opts.qaAccountId || !String(opts.qaAccountId).trim()) {
    throw new Error('Refusing write checks: --qa-account-id is required.');
  }
  if (!opts.disposableSessionId || !String(opts.disposableSessionId).trim()) {
    throw new Error('Refusing write checks: --disposable-session-id is required.');
  }
  if (String(opts.disposableSessionId) === String(opts.sessionId)) {
    throw new Error('Refusing write checks: --disposable-session-id must differ from --session-id.');
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
    client_trade_id: id,
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
  if (beforeAnalysis.unresolved.length || beforeAnalysis.identityIssues.length) {
    return fail('L2', { unresolved: beforeAnalysis.unresolved, identityIssues: beforeAnalysis.identityIssues, rowCount: beforeAnalysis.rowCount }, 'ledger rows fail identity-of-record requirements');
  }
  const before = beforeAnalysis.ids;
  if (!before.length) return skip('L2', { before }, 'no ledger ids available; id-stability precondition missing');
  if (typeof adapter.simulateSessionBoundary === 'function') await adapter.simulateSessionBoundary();
  const afterRows = await adapter.fetchBackendTrades();
  const refetchRows = await adapter.fetchBackendTrades();
  const afterAnalysis = analyzeRows(afterRows);
  const refetchAnalysis = analyzeRows(refetchRows);
  const observed = { before, after: afterAnalysis.ids, refetch: refetchAnalysis.ids };
  if (afterAnalysis.unresolved.length || refetchAnalysis.unresolved.length || afterAnalysis.identityIssues.length || refetchAnalysis.identityIssues.length) {
    return fail('L2', {
      ...observed,
      afterUnresolved: afterAnalysis.unresolved,
      refetchUnresolved: refetchAnalysis.unresolved,
      afterIdentityIssues: afterAnalysis.identityIssues,
      refetchIdentityIssues: refetchAnalysis.identityIssues,
    }, 'ledger rows fail identity-of-record requirements');
  }
  const after = sorted(afterAnalysis.ids);
  const refetch = sorted(refetchAnalysis.ids);
  const beforeSorted = sorted(before);
  if (JSON.stringify(beforeSorted) !== JSON.stringify(refetch) || JSON.stringify(beforeSorted) !== JSON.stringify(after)) {
    return fail('L2', observed, 'id multiset changed across refetch reads');
  }
  return pass('L2', observed, 'PASS establishes the backend id multiset is stable across repeated reads');
}

async function checkL3(adapter) {
  const analysis = analyzeRows(await adapter.fetchBackendTrades());
  const ids = analysis.ids;
  if (analysis.unresolved.length || analysis.identityIssues.length) {
    return fail('L3', { unresolved: analysis.unresolved, identityIssues: analysis.identityIssues, rowCount: analysis.rowCount }, 'ledger rows fail identity-of-record requirements');
  }
  if (!ids.length) return skip('L3', { ids }, 'no ids available for grammar check');
  const grammarIds = analysis.details.map((detail) => detail.grammarId).filter(Boolean);
  const bad = grammarIds.filter((id) => !CANONICAL_ID_RE.test(id));
  const legacy = grammarIds.filter((id) => /^legacy[:_-]/.test(id));
  const observed = { regex: String(CANONICAL_ID_RE), ids, grammarIds, bad, legacy };
  if (bad.length || legacy.length) return fail('L3', observed, 'non-conforming or legacy-alias ids leaked');
  return pass('L3', observed, 'PASS establishes all backend rows expose canonical non-legacy column ids and payload ids');
}

async function checkL4(adapter, opts) {
  let rows = await adapter.fetchBackendTrades();
  const analysis = analyzeRows(rows);
  if (analysis.unresolved.length || analysis.identityIssues.length) {
    return fail('L4', { unresolved: analysis.unresolved, identityIssues: analysis.identityIssues }, 'ledger rows fail identity-of-record requirements before duplicate-submit probe');
  }
  let ids = analysis.ids;
  const duplicateIds = multisetDuplicates(ids);
  if (duplicateIds.length) return fail('L4', { ids, duplicateIds }, 'ledger contains duplicate ids before duplicate-submit probe');
  const dupe = makeTrade(opts.runId, 1);
  const preRows = rows;
  const preMatches = rows.filter((row) => tradeId(row) === dupe.tradeId);
  if (preMatches.length !== 1) {
    return fail('L4', { id: dupe.tradeId, preMatchCount: preMatches.length, ids }, 'duplicate-submit probe lacks exactly one pre-existing harness row from L1');
  }
  const preRowSnapshot = JSON.stringify(stableProjection(preMatches[0]));
  await adapter.registerTrade(dupe);
  rows = await adapter.fetchBackendTrades();
  const postMatches = rows.filter((row) => tradeId(row) === dupe.tradeId);
  const collateral = preservationDelta(
    preRows.filter((row) => tradeId(row) !== dupe.tradeId),
    rows.filter((row) => tradeId(row) !== dupe.tradeId),
    '\u0000',
  );
  const postRowSnapshot = postMatches.length === 1 ? JSON.stringify(stableProjection(postMatches[0])) : null;
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
  if (typeof adapter.fetchBrowserTrades !== 'function' && typeof adapter.fetchBrowserLedgerState !== 'function') {
    return skip('L5', {}, 'browser-visible ledger endpoint is not configured');
  }
  const backendRows = await adapter.fetchBackendTrades();
  const browserState = typeof adapter.fetchBrowserLedgerState === 'function'
    ? await adapter.fetchBrowserLedgerState()
    : { trades: await adapter.fetchBrowserTrades(), storage: null };
  if (String(browserState?.storage ?? '').toLowerCase() === 'sql') {
    return skip('L5', { journalStorage: browserState.storage }, 'single-store configuration: cross-store agreement not testable');
  }
  const browserRows = browserState.trades;
  const backend = analyzeRows(backendRows);
  const browser = analyzeRows(browserRows);
  if (backend.unresolved.length || browser.unresolved.length || backend.identityIssues.length || browser.identityIssues.length) {
    return fail('L5', {
      backendUnresolved: backend.unresolved,
      browserUnresolved: browser.unresolved,
      backendIdentityIssues: backend.identityIssues,
      browserIdentityIssues: browser.identityIssues,
    }, 'ledger rows fail identity-of-record requirements');
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
    journalStorage: browserState?.storage ?? null,
  };
  if (!backendIds.length && !browserIds.length) {
    return skip('L5', observed, 'cross-store agreement precondition missing: no identifiable trade ids on either side');
  }
  if (
    backend.rowCount !== browser.rowCount
    || backendIds.length !== browserIds.length
    || JSON.stringify(sortedBackend) !== JSON.stringify(sortedBrowser)
    || observed.backendDuplicateIds.length
    || observed.browserDuplicateIds.length
  ) {
    return fail('L5', observed, 'browser-visible row/id multiset differs from backend row/id multiset');
  }
  return pass('L5', observed, 'PASS establishes browser and backend expose the same row count and id multiset');
}

async function checkL7(adapter) {
  const rows = await adapter.fetchBackendTrades();
  const vulnerable = vulnerablePayloadRows(rows);
  const observed = {
    rowCount: Array.isArray(rows) ? rows.length : 0,
    vulnerableCount: vulnerable.length,
    vulnerableIds: vulnerable.map((entry) => entry.id),
    vulnerableRows: vulnerable,
  };
  if (vulnerable.length) {
    return fail('L7', observed, 'rows vulnerable to orphan-sweep deletion: payload.tradeId or payload.id is missing');
  }
  return pass('L7', observed, 'PASS establishes every backend row has payload.tradeId or payload.id for orphan-sweep keep-set safety');
}

async function checkL8(adapter, opts) {
  const rows = await adapter.fetchBackendTrades();
  const expectedForeignId = String(opts.expectForeignId ?? '').trim();
  const observed = {
    rowCount: Array.isArray(rows) ? rows.length : 0,
    expectedForeignId,
    present: hasTradeId(rows, expectedForeignId),
  };
  if (!observed.rowCount || !expectedForeignId || !observed.present) {
    return fail('L8', observed, 'expected real ledger row is absent');
  }
  return pass('L8', observed, 'PASS establishes the asserted real ledger row is present and the ledger is non-empty');
}

export async function runChecks(adapter, options = {}) {
  const opts = { n: DEFAULT_N, runId: randomUUID().slice(0, 8), mode: 'verify-only', ...options };
  assertQaWriteSafety(opts);
  const checkIds = opts.mode === 'write-probe' ? WRITE_CHECK_IDS : VERIFY_CHECK_IDS;
  let initialBackendRows = null;
  try {
    initialBackendRows = await adapter.fetchBackendTrades();
    opts.initialBackendRows = initialBackendRows;
  } catch (error) {
    return checkIds.map((id) => fail(id, { error: error?.message ?? String(error) }, 'initial ledger fetch failed'));
  }
  if (!opts.expectForeignId || !String(opts.expectForeignId).trim()) {
    return checkIds.map((id) => fail(id, { missing: ['--expect-foreign-id'] }, 'declared corpus precondition missing'));
  }
  const expectedForeignId = String(opts.expectForeignId).trim();
  const initialForeignCount = foreignTradeCount(initialBackendRows, opts.runId);
  if (HARNESS_TRADE_ID_RE.test(expectedForeignId) || !hasTradeId(initialBackendRows, expectedForeignId)) {
    return checkIds.map((id) => fail(id, {
      expectedForeignId,
      foreignTradesObserved: initialForeignCount,
      presentInInitialSnapshot: hasTradeId(initialBackendRows, expectedForeignId),
    }, 'declared corpus precondition failed: expected foreign id absent from initial snapshot'));
  }
  const checks = opts.mode === 'write-probe' ? [checkL1, checkL4] : [checkL2, checkL3, checkL5, checkL7, checkL8];
  const results = [];
  for (const check of checks) {
    try {
      results.push(await check(adapter, opts));
    } catch (error) {
      results.push(fail(check.name.replace('check', ''), { error: error?.message ?? String(error) }, 'check threw'));
    }
  }
  if (results.length !== checkIds.length) {
    results.push(fail('HARNESS', { expected: checkIds.length, observed: results.length }, 'executed check count mismatch'));
  }
  if (opts.mode === 'write-probe') {
    let finalRows;
    try {
      finalRows = await adapter.fetchBackendTrades();
    } catch (error) {
      const l1 = results.find((row) => row.id === 'L1') ?? results[0];
      l1.status = 'FAIL';
      l1.message = 'final ledger fetch failed after write run';
      l1.observed = { ...l1.observed, error: error?.message ?? String(error) };
      return results;
    }
    const preserved = preservationDelta(initialBackendRows, finalRows, `m4-${opts.runId}-`);
    const expectedForeignPresent = hasTradeId(finalRows, expectedForeignId);
    if (preserved.missing.length || preserved.changed.length || !expectedForeignPresent) {
      const l1 = results.find((row) => row.id === 'L1') ?? results[0];
      l1.status = 'FAIL';
      l1.message = 'full write run deleted or changed pre-existing trades';
      l1.observed = { ...l1.observed, fullRunPreservation: preserved, expectedForeignId, expectedForeignPresent };
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
      if (digest != null && String(digest).trim()) return { digest: String(digest).trim(), surface: path };
    } catch {
      // Keep probing known read-only provenance surfaces.
    }
  }
  const html = await requestText(`${base}/`, { headers, cache: 'no-store' });
  const match = html.match(/__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/)
    ?? html.match(/(?:buildDigest|commitDigest|digest)["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (!match) throw new Error('Unable to discover deployed build digest from known provenance surfaces');
  return { digest: match[1].trim(), surface: '/' };
}

function createHttpReadAdapter(opts) {
  const base = String(opts.baseUrl).replace(/\/+$/, '');
  const sid = encodeURIComponent(String(opts.sessionId));
  const headers = authHeaders(opts);
  return {
    writesIssued: 0,
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
    async fetchBrowserLedgerState() {
      return this.fetchState();
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
      const storage = body.state.journal_storage ?? body.state.journalStorage ?? body.journal_storage ?? body.journalStorage ?? null;
      return { trades: body.state.journal, snapshot, storage };
    },
  };
}

function createHttpWriteAdapter(opts) {
  const disposableOpts = { ...opts, sessionId: opts.disposableSessionId };
  const adapter = createHttpReadAdapter(disposableOpts);
  adapter.writesIssued = 0;
  adapter.registerTrade = async (trade) => {
    adapter.writesIssued += 1;
    const base = String(opts.baseUrl).replace(/\/+$/, '');
    const sid = encodeURIComponent(String(opts.disposableSessionId));
    return requestJson(`${base}/api/sessions/${sid}/journal-trades`, {
      method: 'POST',
      headers: authHeaders(opts),
      body: JSON.stringify({ trade }),
    });
  };
  return adapter;
}

export function createHttpAdapter(opts) {
  return opts?.mode === 'write-probe' ? createHttpWriteAdapter(opts) : createHttpReadAdapter(opts);
}

export function createFixtureAdapter({ mutate = null } = {}) {
  let backend = [];
  let browser = backend;
  let browserStorage = mutate === 'L5-sql-storage' ? 'sql' : 'state';
  const adapter = {
    writesIssued: 0,
    async fetchBackendTrades() {
      if (mutate === 'L1' && backend.length > 0) {
        return JSON.parse(JSON.stringify(backend.slice(0, -1)));
      }
      return JSON.parse(JSON.stringify(backend));
    },
    async fetchBrowserTrades() {
      return JSON.parse(JSON.stringify(browser));
    },
    async fetchBrowserLedgerState() {
      return { trades: JSON.parse(JSON.stringify(browser)), storage: browserStorage };
    },
    async registerTrade(trade) {
      adapter.writesIssued += 1;
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
  };
  adapter.seed = async (trades) => {
    backend = JSON.parse(JSON.stringify(trades));
    browser = mutate === 'L5' ? backend.slice(1) : backend;
    if (mutate === 'L1') backend = backend.slice(0, -1);
    if (mutate === 'L3') backend = backend.map((row, i) => {
      if (i !== 0) return row;
      const legacyId = `legacy:${tradeId(row)}`;
      return { ...row, tradeId: legacyId, id: legacyId, client_trade_id: legacyId, payload: { ...(row.payload ?? {}), tradeId: legacyId, id: legacyId } };
    });
    if (mutate === 'L4') backend = backend.concat({ ...backend[0] });
  };
  if (mutate === 'L4-submit') {
    adapter.registerTrade = async (trade) => {
      adapter.writesIssued += 1;
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
  console.log(`base_url=${baseUrl} account_id=${opts.accountId || 'n/a'} qa_account_id=${opts.qaAccountId || 'n/a'} session_id=${opts.sessionId || 'n/a'} disposable_session_id=${opts.disposableSessionId || 'n/a'} mode=${opts.mode || 'verify-only'} writes_issued=${Number(opts.writesIssued || 0)} digest=${opts.deployedDigest || 'n/a'} digest_surface=${opts.digestSurface || 'n/a'} expect_digest=${opts.expectDigest || 'n/a'} expect_foreign_id=${opts.expectForeignId || 'n/a'}`);
  if (opts.mode === 'write-probe') {
    console.log('WARNING write-probe issues POSTs to the disposable session. The server orphan sweep can delete vulnerable pre-existing rows; this harness can report that loss but cannot undo it.');
  }
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
  opts.writesIssued = 0;
  const missing = validateOptions(opts);
  if (missing.length) {
    const checkIds = opts.mode === 'write-probe' ? WRITE_CHECK_IDS : VERIFY_CHECK_IDS;
    const results = checkIds.map((id) => fail(id, { missing }, `missing required arguments: ${missing.join(', ')}`));
    printResults(results, opts);
    process.exitCode = 1;
    return;
  }
  if (opts.expectDigest) {
    const provenance = await fetchDeployedDigest(opts);
    opts.deployedDigest = provenance.digest;
    opts.digestSurface = provenance.surface;
    if (String(opts.deployedDigest) !== String(opts.expectDigest)) {
      printResults(CHECK_IDS.map((id) => fail(id, {
        expected: opts.expectDigest,
        observed: opts.deployedDigest,
        surface: opts.digestSurface,
      }, 'deployed build digest mismatch')), opts);
      process.exitCode = 1;
      return;
    }
  }
  const adapter = createHttpAdapter(opts);
  const results = await runChecks(adapter, opts);
  opts.writesIssued = adapter.writesIssued || 0;
  printResults(results, opts);
  const expectedCount = opts.mode === 'write-probe' ? WRITE_CHECK_IDS.length : VERIFY_CHECK_IDS.length;
  if (results.length !== expectedCount || results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    let opts = {};
    try {
      opts = parseArgs(process.argv.slice(2));
    } catch {
      opts = {};
    }
    const checkIds = opts.mode === 'write-probe' ? WRITE_CHECK_IDS : VERIFY_CHECK_IDS;
    printResults(checkIds.map((id) => fail(id, { error: error?.message ?? String(error) }, 'harness startup failure')), opts);
    process.exitCode = 1;
  });
}

export { CANONICAL_ID_RE, CHECK_IDS, HARNESS_TRADE_ID_RE, VERIFY_CHECK_IDS, WRITE_CHECK_IDS, createHttpReadAdapter, createHttpWriteAdapter, makeTrade, parseArgs, requestJson, tradeId, validateOptions };
