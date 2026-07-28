import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DISPOSABLE_SESSION_NAME_PREFIX,
  VERIFY_CHECK_IDS,
  WRITE_CHECK_IDS,
  assertWriteProbeSafety,
  createHttpAdapter,
  createHttpWriteAdapter,
  createFixtureAdapter,
  makeTrade,
  parseArgs,
  runChecks,
  validateOptions,
} from './m4-ledger-invariants.mjs';

// B-3 interim quarantine: these are in-process unit tests of the write-probe's
// downstream safety asserts against a local fixture adapter — they issue no POST to
// any real ledger. The quarantine sits ahead of those asserts, so it is lifted here
// to keep testing them. The quarantine's own behaviour is asserted separately below
// against the un-lifted default, so lifting it here cannot mask its removal.
process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED = '1';

const RUN_ID = 'proof';
const HEX_RUN_ID = '1141a2c8';
const BASE_OPTS = { runId: RUN_ID, mode: 'verify-only', expectForeignId: 'real-1' };
const WRITE_OPTS = {
  runId: RUN_ID,
  mode: 'write-probe',
  accountId: 'qa-b-m4',
  qaAccountId: 'qa-b-m4',
  sessionId: 'real-session',
  disposableSessionId: 'fixture-session',
  n: 3,
  expectForeignId: 'real-1',
};

async function seededAdapter(mutate = null) {
  const adapter = createFixtureAdapter({ mutate });
  await adapter.seed([realTrade(1), makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)]);
  return adapter;
}

function realTrade(index, override = {}) {
  return {
    tradeId: `real-${index}`,
    id: `real-${index}`,
    client_trade_id: `real-${index}`,
    payload: { tradeId: `real-${index}`, id: `real-${index}`, symbol: 'EURUSD', pnl: index },
    symbol: 'EURUSD',
    pnl: index,
    ...override,
  };
}

function status(results, id) {
  return results.find((row) => row.id === id)?.status;
}

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function anyFail(results) {
  return results.some((row) => row.status === 'FAIL');
}

function staticAdapter({ backend, browser = backend, storage = 'state' }) {
  return {
    async fetchBackendTrades() { return JSON.parse(JSON.stringify(backend)); },
    async fetchBrowserTrades() { return JSON.parse(JSON.stringify(browser)); },
    async fetchBrowserLedgerState() {
      return { trades: JSON.parse(JSON.stringify(browser)), storage };
    },
  };
}

test('fixture proves non-write read checks on healthy ledger', async () => {
  const adapter = await seededAdapter();
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(results.length, VERIFY_CHECK_IDS.length);
  assert.equal(status(results, 'L2'), 'PASS');
  assert.equal(status(results, 'L3'), 'PASS');
  assert.equal(status(results, 'L5'), 'PASS');
  assert.equal(status(results, 'L7'), 'PASS');
  assert.equal(status(results, 'L8'), 'PASS');
});

test('L1 mutation is caught: registered count is not conserved', async () => {
  const adapter = await seededAdapter('L1');
  const results = await runChecks(adapter, WRITE_OPTS);
  assert.equal(results.length, WRITE_CHECK_IDS.length);
  assert.equal(status(results, 'L1'), 'FAIL');
});

test('L2 mutation is caught: ids change across session boundary', async () => {
  const adapter = await seededAdapter('L2');
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L2'), 'FAIL');
});

test('L3 mutation is caught: legacy alias leaks into ids', async () => {
  const adapter = await seededAdapter('L3');
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L3'), 'FAIL');
});

test('L4 mutation is caught: duplicate ids are present', async () => {
  const adapter = await seededAdapter('L4');
  const results = await runChecks(adapter, WRITE_OPTS);
  assert.equal(status(results, 'L4'), 'FAIL');
});

test('L5 mutation is caught: browser-visible set diverges', async () => {
  const adapter = await seededAdapter('L5');
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L5'), 'FAIL');
});

test('write-probe safety refuses missing QA account id', async () => {
  const adapter = await seededAdapter();
  await assert.rejects(
    () => runChecks(adapter, { runId: RUN_ID, mode: 'write-probe', accountId: 'real-user', sessionId: 'real-session', disposableSessionId: 'fixture-session' }),
    /qa-account-id is required/,
  );
});

test('CLI validation reports all missing required arguments', () => {
  assert.deepEqual(validateOptions({ write: false, n: 3 }), ['--base-url', '--account-id', '--session-id', '--expect-digest', '--expect-foreign-id']);
  assert.deepEqual(validateOptions({
    mode: 'write-probe',
    baseUrl: 'http://x',
    accountId: 'acct',
    sessionId: 1,
    n: 3,
    expectDigest: 'build-1',
    expectForeignId: 'real-1',
  }), ['--qa-account-id', '--disposable-session-id']);
  assert.deepEqual(validateOptions({
    mode: 'write-probe',
    baseUrl: 'http://x',
    accountId: 'acct',
    sessionId: 'same',
    disposableSessionId: 'same',
    qaAccountId: 'acct',
    n: 3,
    expectDigest: 'build-1',
    expectForeignId: 'real-1',
  }), ['--disposable-session-id must differ from --session-id']);
  assert.deepEqual(validateOptions({
    mode: 'verify-only',
    baseUrl: 'http://x',
    accountId: 'acct',
    sessionId: 1,
    n: 3,
    expectDigest: 'build-1',
    expectForeignId: 'm4-1141a2c8-01',
  }), ['--expect-foreign-id must name a non-harness trade']);
});

test('CLI parser splits inline values before camelising and rejects unknown flags', () => {
  assert.deepEqual(parseArgs([
    '--write-probe',
    '--base-url=http://x',
    '--account-id=acct',
    '--session-id',
    's1',
    '--disposable-session-id=s2',
    '--qa-account-id=acct',
    '--n=10',
    '--run-id=abc',
    '--expect-digest=sha256:test',
    '--expect-foreign-id=real-1',
  ]), {
    mode: 'write-probe',
    n: 10,
    headers: {},
    baseUrl: 'http://x',
    accountId: 'acct',
    sessionId: 's1',
    disposableSessionId: 's2',
    qaAccountId: 'acct',
    runId: 'abc',
    expectDigest: 'sha256:test',
    expectForeignId: 'real-1',
  });
  assert.throws(() => parseArgs(['--unknown=1']), /Unknown flag --unknown/);
  assert.throws(() => parseArgs(['--n']), /requires a value/);
  assert.throws(() => parseArgs(['--expect-digest=']), /requires a value/);
});

test('transport mutation is caught: server is down', async () => {
  const adapter = createHttpAdapter({ baseUrl: 'http://127.0.0.1:1', sessionId: 1 });
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(results.length, VERIFY_CHECK_IDS.length);
  assert.equal(anyFail(results), true);
  assert.match(JSON.stringify(results), /Transport failure|fetch failed|ECONNREFUSED/);
});

test('verify-only HTTP mode issues zero write verbs against mock server', async () => {
  const transcript = [];
  await withServer((req, res) => {
    transcript.push(`${req.method} ${req.url}`);
    if (req.method !== 'GET') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'write verb received', method: req.method }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.includes('/journal-trades')) {
      res.end(JSON.stringify({ trades: [realTrade(1)] }));
    } else if (req.url.includes('/state')) {
      res.end(JSON.stringify({ state: { journal: [realTrade(1)], journal_storage: 'state' } }));
    } else {
      res.end(JSON.stringify({ buildId: 'build-1' }));
    }
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 'real-session', mode: 'verify-only' });
    assert.equal(typeof adapter.registerTrade, 'undefined');
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.every((row) => row.status === 'PASS'), true, JSON.stringify(results));
    assert.equal(adapter.writesIssued, 0);
  });
  assert.deepEqual(transcript.filter((line) => !line.startsWith('GET ')), []);
  assert.deepEqual(transcript, [
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/state',
    'GET /api/sessions/real-session/journal-trades',
    'GET /api/sessions/real-session/journal-trades',
  ]);
});

test('transport mutation is caught: wrong session id returns 404', async () => {
  await withServer((req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Session not found', path: req.url }));
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 404 });
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.length, VERIFY_CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /HTTP 404/);
  });
});

test('transport mutation is caught: auth rejected with 401', async () => {
  await withServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Unauthorized' }));
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 1 });
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.length, VERIFY_CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /HTTP 401/);
  });
});

test('transport mutation is caught: auth rejected with 403', async () => {
  await withServer((_req, res) => {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Forbidden' }));
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 1 });
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.length, VERIFY_CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /HTTP 403/);
  });
});

test('transport mutation is caught: 200 HTML login page', async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><title>login</title></html>');
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 1 });
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.length, VERIFY_CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /Expected JSON/);
  });
});

test('transport mutation is caught: 200 JSON wrong shape', async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 1 });
    const results = await runChecks(adapter, BASE_OPTS);
    assert.equal(results.length, VERIFY_CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /Wrong JSON shape/);
  });
});

test('empty-after-write mutation is caught: no trades returned when writes were expected', async () => {
  const adapter = {
    async registerTrade() {},
    async fetchBackendTrades() { return []; },
    async fetchBrowserTrades() { return []; },
  };
  const results = await runChecks(adapter, WRITE_OPTS);
  assert.equal(status(results, 'L1'), 'FAIL');
});

test('L5 skips SQL-primary single-store configuration', async () => {
  const adapter = staticAdapter({ backend: [realTrade(1)], storage: 'sql' });
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L5'), 'SKIP-LOUD');
  assert.match(JSON.stringify(results.find((row) => row.id === 'L5')), /single-store configuration/);
});

test('absence mutation is covered: single-trade ledger does not require N greater than one', async () => {
  const adapter = createFixtureAdapter();
  await adapter.seed([realTrade(1), makeTrade(RUN_ID, 1)]);
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L2'), 'PASS');
  assert.equal(status(results, 'L3'), 'PASS');
  assert.equal(status(results, 'L5'), 'PASS');
  assert.equal(status(results, 'L7'), 'PASS');
  assert.equal(status(results, 'L8'), 'PASS');
});

test('identity mutation is caught: non-empty null rows have no identifiable ids', async () => {
  const nullRow = { tradeId: null, id: null, client_trade_id: null, payload: { tradeId: null } };
  const adapter = staticAdapter({ backend: [realTrade(1), nullRow], browser: [realTrade(1), nullRow] });
  const results = await runChecks(adapter, BASE_OPTS);
  assert.equal(status(results, 'L2'), 'FAIL');
  assert.equal(status(results, 'L3'), 'FAIL');
  assert.equal(status(results, 'L5'), 'FAIL');
});

test('L7 catches planted vulnerable row missing payload tradeId/id aliases', async () => {
  const malformed = realTrade(1, { payload: { trade_id: 'real-1', client_trade_id: 'real-1', symbol: 'EURUSD' } });
  const results = await runChecks(staticAdapter({ backend: [malformed], browser: [malformed] }), BASE_OPTS);
  assert.equal(status(results, 'L7'), 'FAIL');
  assert.match(JSON.stringify(results.find((row) => row.id === 'L7')), /vulnerable/);
  assert.match(JSON.stringify(results.find((row) => row.id === 'L7')), /real-1/);
});

test('reviewer mutation matrix reports 21 designed and 0 survived', async () => {
  const nullRows = Array.from({ length: 40 }, (_, index) => ({ tradeId: null, id: null, payload: { index } }));
  const cases = [
    ['registered count not conserved', async () => runChecks(await seededAdapter('L1'), WRITE_OPTS)],
    ['ids change across refetch', async () => runChecks(await seededAdapter('L2'), BASE_OPTS)],
    ['unmigrated legacy alias on real trade', async () => runChecks(staticAdapter({ backend: [realTrade(1, { tradeId: 'legacy:real-1', id: 'legacy:real-1', client_trade_id: 'legacy:real-1', payload: { tradeId: 'legacy:real-1', id: 'legacy:real-1' } })] }), BASE_OPTS)],
    ['real trade duplicated', async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(1)] }), BASE_OPTS)],
    ['real trade lost from backend but present in UI', async () => runChecks(staticAdapter({ backend: [realTrade(1)], browser: [realTrade(1), realTrade(2)] }), BASE_OPTS)],
    ['duplicate browser UI row', async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(2)], browser: [realTrade(1), realTrade(2), realTrade(2)] }), BASE_OPTS)],
    ['40 backend rows with destroyed ids absent from UI', async () => runChecks(staticAdapter({ backend: [realTrade(1), ...nullRows], browser: [realTrade(1)] }), BASE_OPTS)],
    ['second run corpus made only of old harness rows', async () => {
      const adapter = createFixtureAdapter();
      await adapter.seed([makeTrade(HEX_RUN_ID, 1), makeTrade(HEX_RUN_ID, 2), makeTrade(HEX_RUN_ID, 3)]);
      return runChecks(adapter, { ...BASE_OPTS, runId: 'abcdef12' });
    }],
    ['placeholder row cannot satisfy declared corpus', async () => runChecks(staticAdapter({ backend: [{ tradeId: 'placeholder', id: 'placeholder', client_trade_id: 'placeholder', payload: { tradeId: 'placeholder' } }] }), BASE_OPTS)],
    ['initial ledger fetch fails closed', async () => runChecks({ async fetchBackendTrades() { throw new Error('503'); } }, BASE_OPTS)],
    ['duplicate submit appends duplicate row', async () => runChecks(await seededAdapter('L4-submit'), WRITE_OPTS)],
    ['duplicate submit deletes unrelated row', async () => {
      let backend = [realTrade(1), makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)];
      return runChecks({
        async fetchBackendTrades() { return JSON.parse(JSON.stringify(backend)); },
        async fetchBrowserLedgerState() { return { trades: JSON.parse(JSON.stringify(backend)), storage: 'state' }; },
        async registerTrade(trade) {
          if (trade.tradeId === makeTrade(RUN_ID, 1).tradeId) backend = backend.filter((row) => tradeIdForTest(row) !== 'real-1');
          const idx = backend.findIndex((row) => tradeIdForTest(row) === trade.tradeId);
          if (idx >= 0) backend[idx] = { ...backend[idx], ...trade };
          else backend.push(trade);
        },
      }, WRITE_OPTS);
    }],
    ['bad column grammar', async () => runChecks(staticAdapter({ backend: [realTrade(1, { tradeId: 'bad id', id: 'bad id', client_trade_id: 'bad id', payload: { tradeId: 'bad id', id: 'bad id' } })] }), { ...BASE_OPTS, expectForeignId: 'bad id' })],
    ['backend duplicate hidden by browser dedupe', async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(1)], browser: [realTrade(1)] }), BASE_OPTS)],
    ['browser row has destroyed id', async () => runChecks(staticAdapter({ backend: [realTrade(1)], browser: [realTrade(1), { tradeId: null, id: null, payload: {} }] }), BASE_OPTS)],
    ['SQL primary makes L5 single-store only', async () => runChecks(staticAdapter({ backend: [realTrade(1)], storage: 'sql' }), BASE_OPTS)],
    ['payload id missing despite columns', async () => runChecks(staticAdapter({ backend: [realTrade(1, { payload: { symbol: 'EURUSD' } })] }), BASE_OPTS)],
    ['client_trade_id disagrees with resolved id', async () => runChecks(staticAdapter({ backend: [realTrade(1, { client_trade_id: 'other-1' })] }), BASE_OPTS)],
    ['expected foreign id disappears during write', async () => {
      let backend = [realTrade(1)];
      return runChecks({
        async fetchBackendTrades() { return JSON.parse(JSON.stringify(backend)); },
        async fetchBrowserLedgerState() { return { trades: JSON.parse(JSON.stringify(backend)), storage: 'state' }; },
        async registerTrade(trade) { backend = backend.filter((row) => tradeIdForTest(row) !== 'real-1').concat(trade); },
      }, WRITE_OPTS);
    }],
    ['empty expect-digest is rejected by parser', async () => {
      try {
        parseArgs(['--expect-digest=']);
        return [{ status: 'PASS' }];
      } catch {
        return [{ status: 'FAIL' }];
      }
    }],
    ['missing expect-foreign-id fails closed', async () => runChecks(staticAdapter({ backend: [realTrade(1)] }), { runId: RUN_ID, mode: 'verify-only' })],
  ];

  const outcomes = await Promise.all(cases.map(async ([name, fn]) => ({ name, results: await fn() })));
  const survived = outcomes.filter(({ results }) => results.every((row) => row.status === 'PASS'));
  assert.equal(outcomes.length, 21);
  assert.deepEqual(survived.map((entry) => entry.name), []);
});

function tradeIdForTest(row) {
  return row?.tradeId ?? row?.trade_id ?? row?.client_trade_id ?? row?.id ?? '';
}

// ---------------------------------------------------------------------------
// B-3 interim quarantine — asserted against the UN-LIFTED default.
// These deliberately clear the module-level lift set at the top of this file, so
// that removing the quarantine from the product makes these fail.
// ---------------------------------------------------------------------------

function withQuarantineEnv(value, fn) {
  const prior = process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED;
  if (value === undefined) delete process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED;
  else process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED = value;
  try { return fn(); } finally {
    if (prior === undefined) delete process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED;
    else process.env.M4_WRITE_PROBE_QUARANTINE_LIFTED = prior;
  }
}

test('q1: write-probe is quarantined when the lift is unset', async () => {
  const adapter = await seededAdapter();
  await withQuarantineEnv(undefined, () => assert.rejects(
    () => runChecks(adapter, { ...WRITE_OPTS }),
    /QUARANTINED \(B-3\)/,
  ));
});

test('q2: unrecognised lift values do not lift the quarantine', async () => {
  const adapter = await seededAdapter();
  for (const v of ['', ' ', '0', 'false', 'no', 'off', 'ture', 'lifted', 'null', '2']) {
    await withQuarantineEnv(v, () => assert.rejects(
      () => runChecks(adapter, { ...WRITE_OPTS }),
      /QUARANTINED \(B-3\)/,
      `value ${JSON.stringify(v)} must NOT lift the quarantine`,
    ));
  }
});

test('q3: recognised lift values do lift it, so it is not a brick', async () => {
  const adapter = await seededAdapter();
  for (const v of ['1', 'true', 'TRUE', ' true ', 'yes', 'on']) {
    await withQuarantineEnv(v, () => assert.doesNotReject(
      () => runChecks(adapter, { ...WRITE_OPTS }),
      `value ${JSON.stringify(v)} must lift the quarantine`,
    ));
  }
});

test('q4: verify-only mode is never quarantined', async () => {
  const adapter = await seededAdapter();
  await withQuarantineEnv(undefined, () => assert.doesNotReject(
    () => runChecks(adapter, { ...BASE_OPTS, expectDigest: undefined }),
  ));
});

// ---------------------------------------------------------------------------
// B-W19 — asymmetric disposability guard (change A) and SAFE-01 repositioning
// (change B).
//
// These cells drive the real CLI as a subprocess against a local fixture ledger,
// because the properties under test are about ordering: which request the
// write-probe makes first, and whether a write adapter can exist before the server
// has answered. An in-process call to runChecks cannot observe either, and asserting
// only that an error was thrown would not prove that no POST was issued.
// ---------------------------------------------------------------------------

const HARNESS_PATH = fileURLToPath(new URL('./m4-ledger-invariants.mjs', import.meta.url));
const REAL_SID = '7';
const DISPOSABLE_SID = '8';
const REAL_NAME = 'Live Account 2026';
const DISPOSABLE_NAME = `${DISPOSABLE_SESSION_NAME_PREFIX}b-m4-probe`;
const DEFAULT_NAMES = { [REAL_SID]: REAL_NAME, [DISPOSABLE_SID]: DISPOSABLE_NAME };

function seedTrade(id) {
  return { tradeId: id, id, client_trade_id: id, symbol: 'EURUSD', direction: 'BUY', status: 'closed', pnl: 1 };
}

// Mirrors the row shape of GET /api/sessions/{id}/journal-trades in api_server.py.
function ledgerRow(trade) {
  return {
    journal_trade_id: null,
    session_id: null,
    client_trade_id: trade.tradeId ?? trade.id ?? trade.client_trade_id ?? null,
    user_trade_id: null,
    payload: { ...trade },
    updated_at: null,
  };
}

function ledgerFixture({ names = DEFAULT_NAMES, sessionRecord = null } = {}) {
  const transcript = [];
  const ledgers = new Map([
    [REAL_SID, [ledgerRow(seedTrade('real-1'))]],
    [DISPOSABLE_SID, [ledgerRow(seedTrade('real-1'))]],
  ]);
  const rowsFor = (sid) => {
    if (!ledgers.has(sid)) ledgers.set(sid, []);
    return ledgers.get(sid);
  };
  const handler = (req, res) => {
    transcript.push(`${req.method} ${req.url}`);
    const send = (statusCode, body, contentType = 'application/json') => {
      res.writeHead(statusCode, { 'content-type': contentType });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    const url = String(req.url).split('?')[0];
    if (url === '/api/build-info') {
      send(200, { buildId: 'build-1' });
      return;
    }
    const match = url.match(/^\/api\/sessions\/([^/]+)(\/[^/]*)?$/);
    if (!match) {
      send(404, { detail: 'Not found' });
      return;
    }
    const sid = decodeURIComponent(match[1]);
    const tail = match[2] ?? '';
    if (tail === '') {
      const custom = sessionRecord ? sessionRecord(sid) : null;
      if (custom) {
        send(custom.status, custom.body, custom.contentType ?? 'application/json');
        return;
      }
      if (!(sid in names)) {
        send(404, { detail: 'Session not found' });
        return;
      }
      send(200, { session: { id: /^\d+$/.test(sid) ? Number(sid) : sid, name: names[sid], session_type: 'personal', config: {} } });
      return;
    }
    if (tail === '/journal-trades' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        let trade = {};
        try { trade = JSON.parse(raw || '{}').trade ?? {}; } catch { trade = {}; }
        const rows = rowsFor(sid);
        const row = ledgerRow(trade);
        const idx = rows.findIndex((existing) => existing.client_trade_id === row.client_trade_id);
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
        send(200, { trade });
      });
      return;
    }
    if (tail === '/journal-trades') {
      send(200, { session_id: sid, trades: JSON.parse(JSON.stringify(rowsFor(sid))), count: rowsFor(sid).length });
      return;
    }
    if (tail === '/state') {
      send(200, { state: { journal: JSON.parse(JSON.stringify(rowsFor(sid))), journal_storage: 'state' } });
      return;
    }
    send(404, { detail: 'Not found' });
  };
  return {
    handler,
    transcript,
    posts: () => transcript.filter((line) => line.startsWith('POST ')),
    rowIds: (sid) => (ledgers.get(sid) ?? []).map((row) => row.client_trade_id).sort(),
  };
}

function runCli(harnessPath, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [harnessPath, ...args], {
      env: { ...process.env, M4_WRITE_PROBE_QUARANTINE_LIFTED: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function writeProbeRun({
  harness = HARNESS_PATH,
  names = DEFAULT_NAMES,
  sessionRecord = null,
  sessionIdFlag = REAL_SID,
  disposableFlag = DISPOSABLE_SID,
  baseUrlOverride = null,
  mode = '--write-probe',
} = {}) {
  const fixture = ledgerFixture({ names, sessionRecord });
  return withServer(fixture.handler, async (baseUrl) => {
    const args = [
      mode,
      `--base-url=${baseUrlOverride ?? baseUrl}`,
      '--account-id=qa-b-m4',
      '--qa-account-id=qa-b-m4',
      `--session-id=${sessionIdFlag}`,
      `--disposable-session-id=${disposableFlag}`,
      '--n=3',
      `--run-id=${HEX_RUN_ID}`,
      '--expect-digest=build-1',
      '--expect-foreign-id=real-1',
    ];
    const cli = await runCli(harness, args);
    return {
      ...cli,
      transcript: [...fixture.transcript],
      posts: fixture.posts(),
      rowIds: (sid) => fixture.rowIds(sid),
    };
  });
}

// The acceptance contract these cells hold the harness to, kept deliberately narrow
// so an independent reimplementation of the guard can satisfy it (VER-04):
//   1. a write-probe safety refusal prints `REFUSED — Refusing write checks: …` on
//      stderr and exits 2 — this is what makes it distinguishable from a transport
//      error, which cell 6 requires;
//   2. a marker-related refusal names the reserved prefix;
//   3. the module exports assertWriteProbeSafety, createHttpWriteAdapter and
//      DISPOSABLE_SESSION_NAME_PREFIX, and assertWriteProbeSafety resolves to an
//      opaque confirmation that createHttpWriteAdapter accepts as
//      opts.disposabilityConfirmation.
// Nothing below asserts a message beyond those.

// Every refusing cell asserts this, so cell 7 (zero-write proof) is not a separate
// test but a standing property of all of them.
function assertRefusedWithoutWriting(run, context) {
  assert.deepEqual(run.posts, [], `${context}: expected zero POSTs, saw ${JSON.stringify(run.posts)}`);
  assert.equal(run.code, 2, `${context}: expected the safety refusal exit code 2. stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /REFUSED — Refusing write checks:/, `${context}: refusal must be the safety refusal`);
  assert.deepEqual(run.rowIds(REAL_SID), ['real-1'], `${context}: the real ledger must be untouched`);
  assert.deepEqual(run.rowIds(DISPOSABLE_SID), ['real-1'], `${context}: the disposable ledger must be untouched`);
}

test('B-W19 cell 1: transposed --session-id/--disposable-session-id refuses and issues zero POSTs', async () => {
  const run = await writeProbeRun({ sessionIdFlag: DISPOSABLE_SID, disposableFlag: REAL_SID });
  assertRefusedWithoutWriting(run, 'transposition');
  assert.match(run.stderr, new RegExp(DISPOSABLE_SESSION_NAME_PREFIX), 'the refusal must be about the missing marker');
});

test('B-W19 cell 2: correctly ordered flags proceed and writes land in the disposable session', async () => {
  const run = await writeProbeRun();
  assert.equal(run.code, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stdout, /L1 PASS/);
  assert.match(run.stdout, /L4 PASS/);
  assert.equal(run.posts.length, 4, JSON.stringify(run.posts));
  assert.deepEqual([...new Set(run.posts)], [`POST /api/sessions/${DISPOSABLE_SID}/journal-trades`]);
  assert.deepEqual(run.rowIds(DISPOSABLE_SID), [
    `m4-${HEX_RUN_ID}-01`,
    `m4-${HEX_RUN_ID}-02`,
    `m4-${HEX_RUN_ID}-03`,
    'real-1',
  ]);
  assert.deepEqual(run.rowIds(REAL_SID), ['real-1'], 'the protected ledger must not have been written to');
});

test('B-W19 cell 6b: the disposability lookup is the first network operation the write-probe makes', async () => {
  const sessionLookup = new RegExp(`^GET /api/sessions/(${REAL_SID}|${DISPOSABLE_SID})$`);
  const happy = await writeProbeRun();
  assert.deepEqual(
    [happy.transcript[0], happy.transcript[1]].sort(),
    [`GET /api/sessions/${REAL_SID}`, `GET /api/sessions/${DISPOSABLE_SID}`],
    `the two session-name lookups must come first: ${JSON.stringify(happy.transcript.slice(0, 4))}`,
  );
  assert.ok(
    happy.transcript.indexOf('GET /api/build-info') > 1,
    `the digest probe must not precede the safety gate: ${JSON.stringify(happy.transcript.slice(0, 4))}`,
  );

  // On refusal the only thing ever contacted is the session-name lookup itself.
  const refused = await writeProbeRun({ names: { [REAL_SID]: REAL_NAME, [DISPOSABLE_SID]: 'Scratch session' } });
  assert.deepEqual(refused.posts, []);
  assert.ok(refused.transcript.length >= 1);
  assert.ok(
    refused.transcript.every((line) => sessionLookup.test(line)),
    `no journal, state or digest surface may be contacted before the gate passes: ${JSON.stringify(refused.transcript)}`,
  );
});

test('B-W19 cell 3: an unmarked disposable session refuses', async () => {
  const run = await writeProbeRun({ names: { [REAL_SID]: REAL_NAME, [DISPOSABLE_SID]: 'QA scratch session' } });
  assertRefusedWithoutWriting(run, 'marker absent');
  assert.match(run.stderr, new RegExp(DISPOSABLE_SESSION_NAME_PREFIX));
});

test('B-W19 cell 3b: a marker embedded in the name is not a prefix and refuses', async () => {
  const run = await writeProbeRun({
    names: { [REAL_SID]: REAL_NAME, [DISPOSABLE_SID]: `Archived from ${DISPOSABLE_NAME} (LIVE MONEY)` },
  });
  assertRefusedWithoutWriting(run, 'embedded marker');
});

test('B-W19 cell 4: a marker on the session named by --session-id also refuses', async () => {
  const run = await writeProbeRun({
    names: { [REAL_SID]: `${DISPOSABLE_SESSION_NAME_PREFIX}operator-marked-both`, [DISPOSABLE_SID]: DISPOSABLE_NAME },
  });
  assertRefusedWithoutWriting(run, 'both marked');
  assert.match(run.stderr, new RegExp(DISPOSABLE_SESSION_NAME_PREFIX));
});

test('B-W19 cell 5: every disposability lookup failure refuses independently', async () => {
  const cases = [
    ['session does not exist', { status: 404, body: { detail: 'Session not found' } }],
    ['server error', { status: 500, body: { detail: 'boom' } }],
    ['malformed body', { status: 200, body: '{"session": ' }],
    ['non-JSON body', { status: 200, body: '<html>login</html>', contentType: 'text/html' }],
    ['missing name field', { status: 200, body: { session: { id: 8, session_type: 'personal' } } }],
    ['null name', { status: 200, body: { session: { id: 8, name: null } } }],
    ['unexpected shape', { status: 200, body: { ok: true } }],
    ['answers for a different session', { status: 200, body: { session: { id: 9, name: DISPOSABLE_NAME } } }],
  ];
  for (const [label, response] of cases) {
    const run = await writeProbeRun({
      sessionRecord: (sid) => (sid === DISPOSABLE_SID ? response : null),
    });
    assertRefusedWithoutWriting(run, `lookup failure: ${label}`);
  }
});

test('B-W19 cell 5b: a lookup failure on --session-id refuses too, rather than assuming it is not the target', async () => {
  const run = await writeProbeRun({
    sessionRecord: (sid) => (sid === REAL_SID ? { status: 500, body: { detail: 'boom' } } : null),
  });
  assertRefusedWithoutWriting(run, 'protected-session lookup failure');
});

test('B-W19 cell 6: an unreachable host yields the safety refusal, not a transport error', async () => {
  const run = await writeProbeRun({ baseUrlOverride: 'http://127.0.0.1:1' });
  assert.deepEqual(run.posts, []);
  assert.equal(run.code, 2, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /REFUSED — Refusing write checks:/);
  assert.doesNotMatch(run.stdout, /harness startup failure/);
  assert.doesNotMatch(run.stdout, /Unable to discover deployed build digest/);
});

test('B-W19 cell 8: verify-only is unaffected by the new guard', async () => {
  const run = await writeProbeRun({ mode: '--verify-only' });
  assert.equal(run.code, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.equal(run.stderr, '');
  assert.match(run.stdout, /summary pass=5 nonpass=0/);
  assert.deepEqual(run.posts, []);
  assert.equal(run.transcript[0], 'GET /api/build-info', JSON.stringify(run.transcript.slice(0, 3)));
});

// --- library callers: the adapter itself refuses to exist unconfirmed -------

const LIB_OPTS = {
  mode: 'write-probe',
  baseUrl: 'http://127.0.0.1:1',
  accountId: 'qa-b-m4',
  qaAccountId: 'qa-b-m4',
  sessionId: REAL_SID,
  disposableSessionId: DISPOSABLE_SID,
  runId: HEX_RUN_ID,
  expectForeignId: 'real-1',
};

test('B-W19: no HTTP write adapter can be constructed without a server confirmation', () => {
  assert.throws(() => createHttpAdapter({ ...LIB_OPTS }), /Refusing write checks:/);
  assert.throws(() => createHttpWriteAdapter({ ...LIB_OPTS }), /Refusing write checks:/);
});

test('B-W19: a hand-rolled confirmation object is not accepted', () => {
  const forged = {
    baseUrl: 'http://127.0.0.1:1',
    sessionId: DISPOSABLE_SID,
    protectedSessionId: REAL_SID,
    disposableSessionName: DISPOSABLE_NAME,
  };
  assert.throws(
    () => createHttpWriteAdapter({ ...LIB_OPTS, disposabilityConfirmation: forged }),
    /Refusing write checks:/,
  );
});

test('B-W19: a genuine confirmation does not transfer to a different write target', async () => {
  const fixture = ledgerFixture();
  await withServer(fixture.handler, async (baseUrl) => {
    const opts = { ...LIB_OPTS, baseUrl };
    const confirmation = await assertWriteProbeSafety(opts);
    assert.ok(confirmation, 'a successful confirmation must yield something the adapter can be built with');
    assert.doesNotThrow(() => createHttpWriteAdapter({ ...opts, disposabilityConfirmation: confirmation }));
    assert.throws(
      () => createHttpWriteAdapter({ ...opts, disposableSessionId: REAL_SID, disposabilityConfirmation: confirmation }),
      /Refusing write checks:/,
      'a confirmation for session 8 must not authorise writes to session 7',
    );
    assert.throws(
      () => createHttpWriteAdapter({ ...opts, sessionId: 'someone-else', disposabilityConfirmation: confirmation }),
      /Refusing write checks:/,
      'a confirmation must not survive --session-id changing underneath it',
    );
    assert.deepEqual(fixture.posts(), []);
  });
});

test('B-W19: the late runChecks assert still catches an adapter whose confirmation was stripped', async () => {
  const fixture = ledgerFixture();
  await withServer(fixture.handler, async (baseUrl) => {
    const opts = { ...LIB_OPTS, baseUrl };
    const confirmation = await assertWriteProbeSafety(opts);
    const adapter = createHttpWriteAdapter({ ...opts, disposabilityConfirmation: confirmation });
    delete adapter.disposabilityConfirmation;
    await assert.rejects(() => runChecks(adapter, opts), /Refusing write checks:/);
    assert.deepEqual(fixture.posts(), []);
  });
});

// --- mutation matrix for the new guard -------------------------------------

function replaceOnce(src, from, to) {
  const idx = src.indexOf(from);
  assert.notEqual(idx, -1, `mutation anchor not found: ${from}`);
  assert.equal(src.indexOf(from, idx + from.length), -1, `mutation anchor is not unique: ${from}`);
  return src.slice(0, idx) + to + src.slice(idx + from.length);
}

function replaceBetween(src, startAnchor, endAnchor, to) {
  const start = src.indexOf(startAnchor);
  assert.notEqual(start, -1, `mutation start anchor not found: ${startAnchor}`);
  const end = src.indexOf(endAnchor, start);
  assert.notEqual(end, -1, `mutation end anchor not found: ${endAnchor}`);
  return src.slice(0, start) + to + src.slice(end);
}

// Each killer returns true when the acceptance property still holds. A mutant is
// killed when its designated killer returns false or throws.
const KILLERS = {
  async transposition(harness) {
    const run = await writeProbeRun({ harness, sessionIdFlag: DISPOSABLE_SID, disposableFlag: REAL_SID });
    return run.posts.length === 0 && run.code === 2 && /Refusing write checks:/.test(run.stderr);
  },
  async happyPath(harness) {
    const run = await writeProbeRun({ harness });
    return run.code === 0 && run.posts.length === 4;
  },
  async unreachableHost(harness) {
    const run = await writeProbeRun({ harness, baseUrlOverride: 'http://127.0.0.1:1' });
    return run.code === 2 && /Refusing write checks:/.test(run.stderr) && !/harness startup failure/.test(run.stdout);
  },
  async lookupFails(harness) {
    const run = await writeProbeRun({
      harness,
      sessionRecord: (sid) => (sid === DISPOSABLE_SID ? { status: 404, body: { detail: 'Session not found' } } : null),
    });
    return run.posts.length === 0 && run.code === 2 && /Refusing write checks:/.test(run.stderr);
  },
  async embeddedMarker(harness) {
    const run = await writeProbeRun({
      harness,
      names: { [REAL_SID]: REAL_NAME, [DISPOSABLE_SID]: `Archived from ${DISPOSABLE_NAME} (LIVE MONEY)` },
    });
    return run.posts.length === 0 && run.code === 2 && /Refusing write checks:/.test(run.stderr);
  },
  async adapterDemandsConfirmation(harness) {
    const mod = await import(pathToFileURL(harness).href);
    try {
      mod.createHttpWriteAdapter({ ...LIB_OPTS });
      return false;
    } catch (error) {
      return /Refusing write checks:/.test(String(error?.message));
    }
  },
};

const GUARD_MUTANTS = [
  {
    id: 'G1',
    label: 'marker check inverted',
    killer: 'happyPath',
    mutate: (src) => replaceOnce(src, 'if (!isDisposableSessionName(targetName)) {', 'if (isDisposableSessionName(targetName)) {'),
  },
  {
    id: 'G2',
    label: 'marker comparison made symmetric again (server signal deleted)',
    killer: 'transposition',
    mutate: (src) => replaceBetween(
      src,
      '  let targetName;\n',
      '  const confirmation = Object.freeze({',
      "  const targetName = 'QA-DISPOSABLE-assumed-without-asking-the-server';\n\n",
    ),
  },
  {
    id: 'G3',
    label: 'guard moved back after adapter construction and after the digest probe',
    killer: 'unreachableHost',
    mutate: (src) => replaceOnce(
      src,
      '      opts.disposabilityConfirmation = await assertWriteProbeSafety(opts);',
      '      opts.disposabilityConfirmation = null;',
    ),
  },
  {
    id: 'G4',
    label: 'guard passes when the lookup errors',
    killer: 'lookupFails',
    mutate: (src) => replaceOnce(
      src,
      '    targetName = await fetchServerSessionName(opts, target);',
      "    targetName = await fetchServerSessionName(opts, target).catch(() => 'QA-DISPOSABLE-assumed');",
    ),
  },
  {
    id: 'G5',
    label: 'prefix matched with includes instead of a prefix test',
    killer: 'embeddedMarker',
    mutate: (src) => replaceOnce(
      src,
      "name.startsWith(DISPOSABLE_SESSION_NAME_PREFIX)",
      "name.includes(DISPOSABLE_SESSION_NAME_PREFIX)",
    ),
  },
  {
    id: 'G6',
    label: 'disposability confirmed against opts.sessionId instead of the write target',
    killer: 'transposition',
    mutate: (src) => replaceOnce(
      replaceOnce(
        src,
        '    protectedName = await fetchServerSessionName(opts, opts.sessionId);',
        '    protectedName = await fetchServerSessionName(opts, target);',
      ),
      '    targetName = await fetchServerSessionName(opts, target);',
      '    targetName = await fetchServerSessionName(opts, opts.sessionId);',
    ),
  },
  {
    id: 'G7',
    label: 'write adapter no longer demands the confirmation',
    killer: 'adapterDemandsConfirmation',
    mutate: (src) => replaceOnce(src, '  assertConfirmationCovers(opts?.disposabilityConfirmation, {', '  void ({'),
  },
];

test('B-W19 mutation matrix: 7 designed and 0 survived', async () => {
  const pristine = fs.readFileSync(HARNESS_PATH);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-bw19-mutants-'));
  const survived = [];
  try {
    // Sanity: the unmutated harness satisfies every killer, so a killer that always
    // reports "dead" cannot be mistaken for a real kill.
    for (const [name, killer] of Object.entries(KILLERS)) {
      assert.equal(await killer(HARNESS_PATH), true, `killer ${name} does not hold on the unmutated harness`);
    }
    for (const mutant of GUARD_MUTANTS) {
      const mutantPath = path.join(dir, `${mutant.id}-m4-ledger-invariants.mjs`);
      const mutated = mutant.mutate(pristine.toString('utf8'));
      assert.notEqual(mutated, pristine.toString('utf8'), `${mutant.id} did not change the source`);
      fs.writeFileSync(mutantPath, Buffer.from(mutated, 'utf8'));
      let held;
      try {
        held = await KILLERS[mutant.killer](mutantPath);
      } catch {
        held = false;
      }
      if (held) survived.push(`${mutant.id} ${mutant.label}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(GUARD_MUTANTS.length, 7);
  assert.deepEqual(survived, []);
});
