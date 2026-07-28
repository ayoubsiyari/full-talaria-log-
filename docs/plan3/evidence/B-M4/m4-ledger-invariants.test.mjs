import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  CHECK_IDS,
  MUTATION_DESIGNED,
  MUTATION_SURVIVED,
  createHttpAdapter,
  createFixtureAdapter,
  makeTrade,
  parseArgs,
  runChecks,
  validateOptions,
} from './m4-ledger-invariants.mjs';

const RUN_ID = 'proof';

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

function staticAdapter({ backend, browser = backend, legacyTransition = null }) {
  return {
    async fetchBackendTrades() { return JSON.parse(JSON.stringify(backend)); },
    async fetchBrowserTrades() { return JSON.parse(JSON.stringify(browser)); },
    async plantLegacyAliasProbe() {
      return legacyTransition ?? {
        available: true,
        aliasId: 'legacy:probe',
        canonicalId: 'probe',
        beforeSqlRows: [],
        beforeReadRows: [{ tradeId: 'legacy:probe', id: 'legacy:probe' }],
        firstReadRows: [{ tradeId: 'probe', id: 'probe' }],
        secondReadRows: [{ tradeId: 'probe', id: 'probe' }],
      };
    },
  };
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

test('CLI parser splits inline values before camelising and rejects unknown flags', () => {
  assert.deepEqual(parseArgs([
    '--base-url=http://x',
    '--account-id=acct',
    '--session-id',
    's1',
    '--qa-account-id=acct',
    '--n=10',
    '--run-id=abc',
    '--expect-digest=sha256:test',
    '--write',
  ]), {
    write: true,
    dryRun: false,
    n: 10,
    headers: {},
    baseUrl: 'http://x',
    accountId: 'acct',
    sessionId: 's1',
    qaAccountId: 'acct',
    runId: 'abc',
    expectDigest: 'sha256:test',
  });
  assert.throws(() => parseArgs(['--unknown=1']), /Unknown flag --unknown/);
  assert.throws(() => parseArgs(['--n']), /requires a value/);
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

test('absence mutation is caught: L6 empty ledger is SKIP-LOUD, not PASS', async () => {
  const adapter = {
    async fetchBackendTrades() { return []; },
    async fetchBrowserTrades() { return []; },
  };
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L6'), 'SKIP-LOUD');
  assert.match(JSON.stringify(results.find((row) => row.id === 'L6')), /no unmigrated alias available/);
});

test('absence mutation is covered: single-trade ledger does not require N greater than one', async () => {
  const adapter = createFixtureAdapter();
  await adapter.seed([realTrade(1), makeTrade(RUN_ID, 1)]);
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L2'), 'PASS');
  assert.equal(status(results, 'L3'), 'PASS');
  assert.equal(status(results, 'L5'), 'PASS');
  assert.equal(status(results, 'L6'), 'PASS');
  assert.equal(status(results, 'L4'), 'SKIP-LOUD');
});

test('absence mutation is caught: non-empty null rows have no identifiable ids', async () => {
  const nullRow = { tradeId: null, id: null, client_trade_id: null, payload: { tradeId: null } };
  const adapter = {
    async fetchBackendTrades() { return [nullRow]; },
    async fetchBrowserTrades() { return [nullRow]; },
    async plantLegacyAliasProbe() {
      return {
        available: true,
        aliasId: 'legacy:null',
        canonicalId: 'canon-null',
        beforeSqlRows: [],
        beforeReadRows: [nullRow],
        firstReadRows: [nullRow],
        secondReadRows: [nullRow],
      };
    },
  };
  const results = await runChecks(adapter, { runId: RUN_ID, write: false });
  assert.equal(status(results, 'L2'), 'FAIL');
  assert.equal(status(results, 'L3'), 'FAIL');
  assert.equal(status(results, 'L5'), 'FAIL');
  assert.equal(status(results, 'L6'), 'FAIL');
});

test('absence mutation is caught: identical-but-wrong snapshots do not pass L6', async () => {
  const wrong = [{ tradeId: 'legacy:still-present', id: 'legacy:still-present' }];
  const adapter = {
    async fetchBackendTrades() { return wrong; },
    async fetchBrowserTrades() { return wrong; },
    async plantLegacyAliasProbe() {
      return {
        available: true,
        aliasId: 'legacy:still-present',
        canonicalId: 'still-present',
        beforeSqlRows: [],
        beforeReadRows: wrong,
        firstReadRows: wrong,
        secondReadRows: wrong,
      };
    },
  };
  const results = await runChecks(adapter, { runId: null, write: false });
  assert.equal(status(results, 'L3'), 'FAIL');
  assert.equal(status(results, 'L6'), 'FAIL');
  assert.match(JSON.stringify(results.find((row) => row.id === 'L6')), /expected canonical id/);
});

test('reviewer mutation matrix reports 18 designed and 0 survived', async () => {
  const nullRows = Array.from({ length: 40 }, (_, index) => ({ tradeId: null, id: null, payload: { index } }));
  const deletingDuplicateAdapter = createFixtureAdapter();
  await deletingDuplicateAdapter.seed([realTrade(1), makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)]);
  deletingDuplicateAdapter.registerTrade = async (trade) => {
    deletingDuplicateAdapter._deleted = true;
    deletingDuplicateAdapter._backend = trade;
    return { trade };
  };

  const cases = [
    async () => runChecks(await seededAdapter('L1'), { runId: RUN_ID, write: true, accountId: 'qa-b-m4', qaAccountId: 'qa-b-m4', sessionId: 'fixture-session', n: 3 }),
    async () => runChecks(await seededAdapter('L2'), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1, { tradeId: 'legacy:real-1', id: 'legacy:real-1' })] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(1)] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1)], browser: [realTrade(1), realTrade(2)] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(2)], browser: [realTrade(1), realTrade(2), realTrade(2)] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: nullRows, browser: [] }), { runId: RUN_ID, write: false }),
    async () => runChecks(await seededAdapter('L6'), { runId: RUN_ID, write: false }),
    async () => runChecks(await seededAdapter('L6-not-empty-sql'), { runId: RUN_ID, write: false }),
    async () => runChecks(await seededAdapter('L6-unresolved'), { runId: RUN_ID, write: false }),
    async () => runChecks(await seededAdapter('L6-legacy-leak'), { runId: RUN_ID, write: false }),
    async () => {
      const adapter = createFixtureAdapter();
      await adapter.seed([makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)]);
      return runChecks(adapter, { runId: RUN_ID, write: false });
    },
    async () => runChecks(await seededAdapter('L4-submit'), { runId: RUN_ID, write: true, accountId: 'qa-b-m4', qaAccountId: 'qa-b-m4', sessionId: 'fixture-session', n: 3 }),
    async () => {
      let backend = [realTrade(1), makeTrade(RUN_ID, 1), makeTrade(RUN_ID, 2), makeTrade(RUN_ID, 3)];
      return runChecks({
        async fetchBackendTrades() { return JSON.parse(JSON.stringify(backend)); },
        async fetchBrowserTrades() { return JSON.parse(JSON.stringify(backend)); },
        async registerTrade(trade) {
          if (trade.tradeId === makeTrade(RUN_ID, 1).tradeId && backend.some((row) => tradeIdForTest(row) === trade.tradeId)) {
            backend = backend.filter((row) => tradeIdForTest(row) !== 'real-1');
          }
          const idx = backend.findIndex((row) => tradeIdForTest(row) === trade.tradeId);
          if (idx >= 0) backend[idx] = { ...backend[idx], ...trade };
          else backend.push(trade);
        },
        async plantLegacyAliasProbe() {
          return {
            available: true,
            aliasId: 'legacy:probe',
            canonicalId: 'probe',
            beforeSqlRows: [],
            beforeReadRows: [{ tradeId: 'legacy:probe', id: 'legacy:probe' }],
            firstReadRows: [{ tradeId: 'probe', id: 'probe' }],
            secondReadRows: [{ tradeId: 'probe', id: 'probe' }],
          };
        },
      }, { runId: RUN_ID, write: true, accountId: 'qa-b-m4', qaAccountId: 'qa-b-m4', sessionId: 'fixture-session', n: 3 });
    },
    async () => runChecks(staticAdapter({ backend: [realTrade(1, { tradeId: 'bad id', id: 'bad id' })] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1), realTrade(1)], browser: [realTrade(1)] }), { runId: RUN_ID, write: false }),
    async () => runChecks(staticAdapter({ backend: [realTrade(1)], browser: [{ tradeId: null, id: null }] }), { runId: RUN_ID, write: false }),
    async () => runChecks({
      async fetchBackendTrades() { throw new Error('mutated transport failure'); },
      async fetchBrowserTrades() { return []; },
    }, { runId: RUN_ID, write: false }),
  ];

  assert.equal(cases.length, MUTATION_DESIGNED);
  const outcomes = await Promise.all(cases.map(async (fn) => fn()));
  const survived = outcomes.filter((results) => results.every((row) => row.status === 'PASS')).length;
  assert.equal(survived, MUTATION_SURVIVED);
});

function tradeIdForTest(row) {
  return row?.tradeId ?? row?.trade_id ?? row?.client_trade_id ?? row?.id ?? '';
}
