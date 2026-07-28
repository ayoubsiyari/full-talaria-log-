import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  VERIFY_CHECK_IDS,
  WRITE_CHECK_IDS,
  createHttpAdapter,
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
