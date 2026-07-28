import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  CHECK_IDS,
  createHttpAdapter,
  createFixtureAdapter,
  makeTrade,
  runChecks,
  validateOptions,
} from './m4-ledger-invariants.mjs';

const RUN_ID = 'proof';

async function seededAdapter(mutate = null) {
  const adapter = createFixtureAdapter({ mutate });
  await adapter.seed([makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)]);
  return adapter;
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

test('fixture proves non-write read checks on healthy ledger', async () => {
  const adapter = await seededAdapter();
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L2'), 'PASS');
  assert.equal(status(results, 'L3'), 'PASS');
  assert.equal(status(results, 'L5'), 'PASS');
  assert.equal(status(results, 'L6'), 'PASS');
});

test('L1 mutation is caught: registered count is not conserved', async () => {
  const adapter = await seededAdapter('L1');
  const results = await runChecks(adapter, {
    runId: RUN_ID,
    write: true,
    accountId: 'qa-b-m4',
    qaAccountId: 'qa-b-m4',
    sessionId: 'fixture-session',
    n: 3,
  });
  assert.equal(status(results, 'L1'), 'FAIL');
});

test('L2 mutation is caught: ids change across session boundary', async () => {
  const adapter = await seededAdapter('L2');
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L2'), 'FAIL');
});

test('L3 mutation is caught: legacy alias leaks into ids', async () => {
  const adapter = await seededAdapter('L3');
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L3'), 'FAIL');
});

test('L4 mutation is caught: duplicate ids are present', async () => {
  const adapter = await seededAdapter('L4');
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L4'), 'FAIL');
});

test('L5 mutation is caught: browser-visible set diverges', async () => {
  const adapter = await seededAdapter('L5');
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L5'), 'FAIL');
});

test('L6 mutation is caught: migration is not idempotent', async () => {
  const adapter = await seededAdapter('L6');
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L6'), 'FAIL');
});

test('write safety refuses missing QA account id', async () => {
  const adapter = await seededAdapter();
  await assert.rejects(
    () => runChecks(adapter, { runId: RUN_ID, write: true, accountId: 'real-user', sessionId: 'fixture-session' }),
    /qa-account-id is required/,
  );
});

test('CLI validation reports all missing required arguments', () => {
  assert.deepEqual(validateOptions({ write: false, n: 3 }), ['--base-url', '--account-id', '--session-id']);
  assert.deepEqual(validateOptions({ write: true, baseUrl: 'http://x', accountId: 'acct', sessionId: 1, n: 3 }), ['--qa-account-id']);
});

test('transport mutation is caught: server is down', async () => {
  const adapter = createHttpAdapter({ baseUrl: 'http://127.0.0.1:1', sessionId: 1 });
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(results.length, CHECK_IDS.length);
  assert.equal(anyFail(results), true);
  assert.match(JSON.stringify(results), /Transport failure|fetch failed|ECONNREFUSED/);
});

test('transport mutation is caught: wrong session id returns 404', async () => {
  await withServer((req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Session not found', path: req.url }));
  }, async (baseUrl) => {
    const adapter = createHttpAdapter({ baseUrl, sessionId: 404 });
    const results = await runChecks(adapter, { runId: RUN_ID, write: false });
    assert.equal(results.length, CHECK_IDS.length);
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
    const results = await runChecks(adapter, { runId: RUN_ID, write: false });
    assert.equal(results.length, CHECK_IDS.length);
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
    const results = await runChecks(adapter, { runId: RUN_ID, write: false });
    assert.equal(results.length, CHECK_IDS.length);
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
    const results = await runChecks(adapter, { runId: RUN_ID, write: false });
    assert.equal(results.length, CHECK_IDS.length);
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
    const results = await runChecks(adapter, { runId: RUN_ID, write: false });
    assert.equal(results.length, CHECK_IDS.length);
    assert.equal(anyFail(results), true);
    assert.match(JSON.stringify(results), /Wrong JSON shape/);
  });
});

test('empty-after-write mutation is caught: no trades returned when writes were expected', async () => {
  const adapter = {
    async registerTrade() {},
    async fetchBackendTrades() { return []; },
    async fetchBrowserTrades() { return []; },
    async migrateLegacyAliases() { return { trades: [] }; },
  };
  const results = await runChecks(adapter, {
    runId: RUN_ID,
    write: true,
    accountId: 'qa-b-m4',
    qaAccountId: 'qa-b-m4',
    sessionId: 'fixture-session',
    n: 3,
  });
  assert.equal(status(results, 'L1'), 'FAIL');
});
