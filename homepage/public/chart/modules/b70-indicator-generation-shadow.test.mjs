import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const productPath = path.join(here, 'chart-indicators-full.js');
const replayPath = path.join(here, 'replay-system.js');
const source = fs.readFileSync(productPath, 'utf8');
const replaySource = fs.readFileSync(replayPath, 'utf8');
const managerPath = path.join(here, '..', 'multichart', 'multichart-manager.js');
const managerProdPath = path.join(here, '..', 'multichart-prod', 'multichart-manager.js');
const managerSource = fs.readFileSync(managerPath, 'utf8');
const managerProdSource = fs.readFileSync(managerProdPath, 'utf8');
const start = source.indexOf('// ─── b70 Stages 1–5: owner, pure-paint, immutable envelope + panel bridge');
const end = source.indexOf('function _m19iB62SafeNonnegativeInteger', start);
assert.ok(start >= 0 && end > start, 'shadow implementation markers present');

function loadShadow(enabled = true, timeOrigin = 1000, devFreeze = false, bridgeTimeout = 250) {
  const context = {
    window: {
      __TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1: enabled,
      __TALARIA_B70_DEV_FREEZE_ENVELOPES: devFreeze,
      __TALARIA_B70_BRIDGE_TIMEOUT_MS: bridgeTimeout,
    },
    performance: { timeOrigin },
    Date,
    Map,
    Number,
    JSON,
    Object,
    String,
    Array,
    Set,
    WeakMap,
    structuredClone,
    setTimeout,
    clearTimeout,
  };
  const body = source.slice(start, end)
    + '\nthis.api={key:_b70IndicatorGenerationKey,request:_b70ShadowRecordRequest,'
    + 'calc:_b70ShadowRecordCalculation,invalidate:_b70ShadowInvalidate,'
    + 'render:_b70ShadowObserveRender,token:_b70ShadowCompareLegacyToken,'
    + 'owner:_b70Stage2InstanceOwner,claim:_b70Stage2Claim,commit:_b70Stage2Commit,'
    + 'authorize:_b70Stage2AuthorizeWorkerApply,workerFail:_b70Stage2ReleaseWorkerFailure,'
    + 'syncFail:_b70Stage2ReleaseSyncFailure,ids:_b70Stage2TicketIds,'
    + 'snapshot:_b70Stage2SnapshotResults,restore:_b70Stage2RestoreResults,'
    + 'committed:_b70Stage3CommittedForCurrentGeneration,consume:_b70Stage3ConsumePaint,'
    + 'beginRender:_b70Stage3BeginRender,endRender:_b70Stage3EndRender,'
    + 'rejectRenderWork:_b70Stage3RejectInRenderWork,'
    + 'beginEnvelope:_b70Stage4BeginBuild,commitEnvelope:_b70Stage4CommitBuild,'
    + 'abortEnvelope:_b70Stage4AbortBuild,validate:_b70Stage4ValidateValue,'
    + 'validateResult:_b70Stage4ValidateIndicatorResult,'
    + 'bindPanel:_b70Stage5BindPanelForTest,receivePanel:_b70Stage5ReceivePanelEnvelope,'
    + 'buildMessage:_b70Stage5BuildMessage,deferPanel:_b70Stage5DeferPanelCalculation,'
    + 'invalidateBridge:_b70Stage5Invalidate,'
    + 'connectorPresent:typeof window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1==="function"};';
  context._indicatorDataFingerprint = (chart) => {
    const data = Array.isArray(chart?.data) ? chart.data : [];
    if (!data.length) return '0';
    const b = data[data.length - 1] || {};
    return [data.length, b.t, b.o, b.h, b.l, b.c, b.v].join('|');
  };
  context._m19iB62ChartPairIdentity = (chart) => String(chart?.currentSymbol || '');
  context._m19iB62MasterGeneration = (chart) => String(chart?.masterGeneration || '');
  context.M19I_SYNC_ONLY_TYPES = ['sessions', 'killzones'];
  context._m19iB62SyncFamily = (indicator) => (
    ['sma', 'wma'].includes(String(indicator?.type || '').toLowerCase())
      ? { seriesCount: 1 } : null
  );
  context._m19iB66Proof = (indicator) => (
    ['ema', 'tema', 'macd'].includes(String(indicator?.type || '').toLowerCase())
      ? { minLookback: 64, lookbackFactor: 4 } : null
  );
  vm.runInNewContext(body, context, { filename: 'b70-shadow-extract.js' });
  return context.api;
}

function chart() {
  return {
    dataVersion: 7,
    currentTimeframe: '1m',
    currentSymbol: 'EURUSD',
    currentFileId: 'file-a',
    masterGeneration: 2,
    data: [{ t: 1, o: 1, h: 2, l: 0, c: 1.5, v: 10 }],
    indicators: {
      active: [{ id: 'ema-1', type: 'ema', params: { period: 20, source: 'close' } }],
    },
    _indicatorParamsHash() { return 'legacy-hash'; },
  };
}

function bridgeChart(id) {
  const c = chart();
  c.multichartPanelId = id;
  c.data.push({ t: 2, o: 2, h: 3, l: 1, c: 2.5, v: 11 });
  c.indicators.active = [
    { id: 'tema-1', type: 'tema', params: { period: 20, source: 'close' } },
  ];
  c.indicators.data = { 'tema-1': [1, 2] };
  c.bumpIndicatorRenderVersion = function() {
    this._indicatorRenderVersion = (this._indicatorRenderVersion || 0) + 1;
  };
  c.scheduleRender = function() {
    this._bridgeRenders = (this._bridgeRenders || 0) + 1;
  };
  return c;
}

test('OFF mode creates no fields or observer state', () => {
  const api = loadShadow(false);
  const c = chart();
  const before = Reflect.ownKeys(c);
  assert.equal(api.key(c), null);
  api.request(c, 'schedule');
  api.calc(c, 'sync', 'sync');
  api.invalidate(c, 'timeline-seek');
  api.render(c);
  assert.equal(api.connectorPresent, false);
  assert.deepEqual(Reflect.ownKeys(c), before);
});

test('generation is stable across render churn and sensitive to forming OHLCV', () => {
  const api = loadShadow();
  const c = chart();
  api.request(c, 'schedule');
  const first = api.key(c);
  c._indicatorRenderVersion = 99;
  api.render(c);
  assert.equal(api.key(c).id, first.id);
  assert.equal(c._b70IndicatorGenerationShadow.metrics.renderStable, 1);
  c.data[0].c = 1.75;
  assert.notEqual(api.key(c).id, first.id);
  c.data[0].v = 11;
  assert.notEqual(api.key(c).tailBarFingerprint, first.tailBarFingerprint);
});

test('params, timeframe, seek and dataset replacement cannot collide', () => {
  const api = loadShadow();
  const c = chart();
  const ids = new Set([api.key(c).id]);
  c.indicators.active[0].params.period = 21;
  ids.add(api.key(c).id);
  c.currentTimeframe = '5m';
  api.invalidate(c, 'timeframe-start');
  ids.add(api.key(c).id);
  api.invalidate(c, 'timeline-seek');
  ids.add(api.key(c).id);
  c.data = c.data.map((b) => ({ ...b }));
  ids.add(api.key(c).id);
  assert.equal(ids.size, 5);
  const m = c._b70IndicatorGenerationShadow.metrics;
  assert.equal(m.timeframeInvalidations, 1);
  assert.equal(m.timelineInvalidations, 1);
  assert.equal(m.datasetInvalidations, 1);
});

test('indicator hash is canonical, ordered, typed and delimiter-safe', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active = [
    { id: 'a|b', type: 'EMA', params: { nested: { z: 2, a: 1 }, value: 1 } },
    { id: 'c', type: 'SMA', params: { value: '1' } },
  ];
  const first = api.key(c).indicatorSetHash;
  c.indicators.active[0].params.nested = { a: 1, z: 2 };
  assert.equal(api.key(c).indicatorSetHash, first, 'nested object insertion order is stable');
  c.indicators.active.reverse();
  assert.notEqual(api.key(c).indicatorSetHash, first, 'active calculation order is significant');
  c.indicators.active.reverse();
  c.indicators.active[0].params.value = '1';
  assert.notEqual(api.key(c).indicatorSetHash, first, 'number and string params cannot collide');
  c.indicators.active[0].params.value = 1;
  c.indicators.active[0].id = 'a';
  c.indicators.active[1].id = 'b|c';
  assert.notEqual(api.key(c).indicatorSetHash, first, 'indicator delimiters cannot collide');
});

test('reload/session identity differs and explicit session replacement advances', () => {
  const a = loadShadow(true, 1000);
  const b = loadShadow(true, 2000);
  const ca = chart();
  const cb = chart();
  assert.notEqual(a.key(ca).id, b.key(cb).id);
  const old = a.key(ca).id;
  a.invalidate(ca, 'session-reload');
  assert.notEqual(a.key(ca).id, old);
  assert.equal(ca._b70IndicatorGenerationShadow.metrics.sessionInvalidations, 1);
});

test('shadow registry identifies duplicate calculations without suppressing them', () => {
  const api = loadShadow();
  const c = chart();
  api.request(c, 'scheduleReplayIndicatorRecalc');
  api.calc(c, 'recalculateIndicators', 'sync');
  api.calc(c, '_m19iExactTailPaint', 'paint');
  api.calc(c, 'recalculateIndicatorsIncremental', 'worker');
  const m = c._b70IndicatorGenerationShadow.metrics;
  assert.equal(m.calculationStarts, 3);
  assert.equal(m.duplicateCalculations, 2);
  assert.deepEqual({ ...m.wouldBeOwnerClaims }, { sync: 1, worker: 0, paint: 0, unknown: 0 });
});

test('counter exhaustion fails closed and clears generation registry', () => {
  const api = loadShadow();
  const c = chart();
  api.request(c, 'schedule');
  const state = c._b70IndicatorGenerationShadow;
  state.timelineEpoch = Number.MAX_SAFE_INTEGER - 1;
  api.invalidate(c, 'timeline-seek');
  assert.equal(state.exhausted, true);
  assert.equal(api.key(c).id, null);
  assert.equal(state.registry.size, 0);
  assert.equal(state.metrics.failClosed, 1);
});

test('removal and disposal clean lifecycle state', () => {
  const api = loadShadow();
  const c = chart();
  api.request(c, 'schedule');
  api.claim(c, 'sync', c.indicators.active, 'sync', false);
  api.invalidate(c, 'indicator-remove');
  assert.equal(c._b70IndicatorGenerationShadow.registry.size, 0);
  assert.equal(c._b70IndicatorGenerationShadow.ownerTickets.size, 0);
  assert.equal(c._b70IndicatorGenerationShadow.latestByInstance.size, 0);
  assert.equal(c._b70IndicatorGenerationShadow.metrics.removalInvalidations, 1);
  c._b70ShadowDisposeIndicatorGeneration();
  assert.equal('_b70IndicatorGenerationShadow' in c, false);
  assert.equal('_b70ShadowInvalidateIndicatorGeneration' in c, false);
  assert.equal('_b70ShadowDisposeIndicatorGeneration' in c, false);
});

test('legacy-token comparison is observational', () => {
  const api = loadShadow();
  const c = chart();
  const key = api.key(c);
  api.token(c, {
    dataVersion: key.dataVersion,
    timeframe: key.timeframe,
    barCount: key.barCount,
    dataFp: key.tailBarFingerprint,
    paramsHash: 'legacy-hash',
  });
  const m = c._b70IndicatorGenerationShadow.metrics;
  assert.equal(m.legacyTokenComparisons, 1);
  assert.equal(m.legacyTokenAgreement, 1);
});

test('Stage 2 admits exactly one owner per instance-generation', () => {
  const api = loadShadow();
  const c = chart();
  const sync = api.claim(c, 'sync', c.indicators.active, 'sync-pass', false);
  assert.equal(sync.length, 1);
  assert.equal(api.claim(c, 'sync', c.indicators.active, 'duplicate-sync', false).length, 0);
  assert.equal(api.claim(c, 'worker', c.indicators.active, 'wrong-owner', false).length, 0);
  assert.equal(api.commit(c, sync), true);
  assert.equal(api.claim(c, 'sync', c.indicators.active, 'post-commit', false).length, 0);
  const m = c._b70IndicatorGenerationShadow.metrics;
  assert.deepEqual({ ...m.ownerClaims }, { sync: 1, worker: 0 });
  assert.deepEqual({ ...m.ownerCommits }, { sync: 1, worker: 0 });
  assert.equal(m.ownerDenied, 2);
});

test('bounded eligibility selects sync and unsupported families select worker', () => {
  const api = loadShadow();
  assert.equal(api.owner({ id: 's', type: 'sma', params: {} }), 'sync');
  assert.equal(api.owner({ id: 't', type: 'tema', params: {} }), 'sync');
  assert.equal(api.owner({ id: 'k', type: 'killzones', params: {} }), 'sync');
  assert.equal(api.owner({ id: 'v', type: 'vwap', params: {} }), 'worker');
});

test('late and duplicate worker replies cannot publish', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'vwap';
  const ticket = api.claim(c, 'worker', c.indicators.active, 'worker', false);
  assert.equal(api.authorize(c, ticket), true);
  assert.equal(api.commit(c, ticket), true);
  assert.equal(api.authorize(c, ticket), false);
  assert.equal(c._b70IndicatorGenerationShadow.metrics.duplicateWorkerRejects, 1);
  const lateChart = chart();
  lateChart.indicators.active[0].type = 'vwap';
  const lateTicket = api.claim(
    lateChart, 'worker', lateChart.indicators.active, 'worker', false
  );
  lateChart.dataVersion++;
  lateChart.data = lateChart.data.map((bar) => ({ ...bar, c: bar.c + 1 }));
  assert.equal(api.authorize(lateChart, lateTicket), false);
  assert.equal(lateChart._b70IndicatorGenerationShadow.metrics.lateWorkerRejects, 1);
});

test('multi-instance worker publication is all-or-nothing', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active = [
    { id: 'vwap-1', type: 'vwap', params: {} },
    { id: 'vwap-2', type: 'vwap', params: {} },
  ];
  const tickets = api.claim(c, 'worker', c.indicators.active, 'worker', false);
  assert.equal(tickets.length, 2);
  assert.equal(api.authorize(c, tickets, { 'vwap-1': [1] }), false,
    'a partial multi-series result cannot publish');
  assert.equal(api.authorize(c, tickets, {
    'vwap-1': [1],
    'vwap-2': [2],
  }), true);
});

test('sync exception rollback restores every claimed instance atomically', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active = [
    { id: 'sma-1', type: 'sma', params: {} },
    { id: 'sma-2', type: 'sma', params: {} },
  ];
  c.indicators.data = { 'sma-1': ['old'] };
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const snapshot = api.snapshot(c, tickets);
  c.indicators.data['sma-1'] = ['partial-new'];
  c.indicators.data['sma-2'] = ['partial-new'];
  api.restore(c, snapshot);
  assert.deepEqual(c.indicators.data, { 'sma-1': ['old'] });
  api.syncFail(c, tickets);
  assert.equal(c._b70IndicatorGenerationShadow.ownerTickets.size, 0);
});

test('worker failure releases once and fallback commits once', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'vwap';
  const worker = api.claim(c, 'worker', c.indicators.active, 'worker', false);
  const fallbackIndicators = api.workerFail(c, worker);
  assert.equal(fallbackIndicators.length, 1);
  const fallback = api.claim(c, 'sync', fallbackIndicators, 'fallback', true);
  assert.equal(fallback.length, 1);
  assert.equal(api.commit(c, fallback), true);
  assert.equal(api.workerFail(c, worker).length, 0);
  assert.equal(api.claim(c, 'worker', c.indicators.active, 'retry', false).length, 0);
  const m = c._b70IndicatorGenerationShadow.metrics;
  assert.equal(m.workerFailures, 1);
  assert.equal(m.fallbackClaims, 1);
  assert.ok(m.fallbackDenied >= 1);
});

test('reentrant claim is denied until fault release permits one retry', () => {
  const api = loadShadow();
  const c = chart();
  const first = api.claim(c, 'sync', c.indicators.active, 'outer', false);
  assert.equal(api.claim(c, 'sync', c.indicators.active, 'reentrant', false).length, 0);
  api.syncFail(c, first);
  const retry = api.claim(c, 'sync', c.indicators.active, 'retry', false);
  assert.equal(retry.length, 1);
  assert.equal(api.commit(c, retry), true);
});

test('only newest pending generation survives worker backpressure', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'vwap';
  const active = api.claim(c, 'worker', c.indicators.active, 'worker', false)[0];
  c.dataVersion++;
  c.data[0].c++;
  api.request(c, 'tick-2');
  const second = api.key(c).id;
  c.dataVersion++;
  c.data[0].c++;
  api.request(c, 'tick-3');
  const third = api.key(c).id;
  assert.notEqual(second, third);
  assert.equal(active.pendingGenerationId, third);
  assert.equal(c._b70IndicatorGenerationShadow.metrics.supersededPending, 1);
});

test('obsolete generation tickets are pruned per instance', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'vwap';
  let prior;
  for (let i = 0; i < 20; i++) {
    c.dataVersion++;
    c.data[0].c++;
    const tickets = api.claim(c, 'worker', c.indicators.active, 'worker', false);
    assert.equal(tickets.length, 1);
    if (prior) assert.equal(api.authorize(c, prior), false);
    prior = tickets;
    assert.equal(c._b70IndicatorGenerationShadow.ownerTickets.size, 1);
    assert.equal(c._b70IndicatorGenerationShadow.latestByInstance.size, 1);
  }
});

test('seek timeframe session and indicator changes revoke publication authority', () => {
  const reasons = ['timeline-seek', 'timeframe-start', 'session-reload', 'indicator-remove'];
  for (const reason of reasons) {
    const api = loadShadow();
    const c = chart();
    c.indicators.active[0].type = 'vwap';
    const ticket = api.claim(c, 'worker', c.indicators.active, 'worker', false);
    api.invalidate(c, reason);
    assert.equal(api.authorize(c, ticket), false, reason);
  }
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'vwap';
  const ticket = api.claim(c, 'worker', c.indicators.active, 'worker', false);
  c.indicators.active[0].params.period = 99;
  assert.equal(api.authorize(c, ticket), false, 'indicator params');
});

test('owner claim counter exhaustion fails closed without partial authority', () => {
  const api = loadShadow();
  const c = chart();
  api.key(c);
  const state = c._b70IndicatorGenerationShadow;
  state.nextClaimSeq = Number.MAX_SAFE_INTEGER - 1;
  assert.equal(api.claim(c, 'sync', c.indicators.active, 'sync', false).length, 0);
  assert.equal(state.exhausted, true);
  assert.equal(state.ownerTickets.size, 0);
  assert.equal(state.metrics.ownerFailClosed, 1);
});

test('Stage 4 publishes one immutable envelope pointer without aliasing prior data', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'tema';
  c.data.push({ t: 2, o: 2, h: 3, l: 1, c: 2.5, v: 11 });
  c.indicators.data = { 'ema-1': [1, 2] };
  const priorPointer = c.indicators.data;
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  const calculatorAlias = [3, 4];
  assert.equal(c.indicators.data, priorPointer);
  tx.stagingData['ema-1'] = calculatorAlias;
  assert.equal(api.commitEnvelope(c, tx), true);
  assert.equal(api.commit(c, tickets), true);
  assert.notEqual(c.indicators.data, priorPointer);
  assert.deepEqual(priorPointer['ema-1'], [1, 2]);
  calculatorAlias[0] = 999;
  tx.stagingData['ema-1'][1] = 999;
  assert.deepEqual(c.indicators.data['ema-1'], [3, 4]);
  const envelope = c._b70IndicatorGenerationShadow.currentEnvelope;
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.metadata), true);
  assert.equal(Object.isFrozen(envelope.metadata.generationKey), true);
});

test('partial, missing, shape and NaN envelopes preserve prior pointer', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active = [
    { id: 'a', type: 'ema', params: {} },
    { id: 'b', type: 'ema', params: {} },
  ];
  c.indicators.data = { a: [1], b: [2] };
  const prior = c.indicators.data;
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  delete tx.stagingData.b;
  tx.stagingData.a = [Number.NaN];
  assert.equal(api.commitEnvelope(c, tx), false);
  assert.equal(c.indicators.data, prior);
  assert.deepEqual(c.indicators.data, { a: [1], b: [2] });
  assert.equal(c._b70IndicatorGenerationShadow.metrics.envelopeRejects, 1);
});

test('multi-series instance rejects one invalid member atomically', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active = [{ id: 'macd-1', type: 'macd', params: {} }];
  c.indicators.data = {
    'macd-1': { macd: [1], signal: [1], histogram: [0] },
  };
  const prior = c.indicators.data;
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  tx.stagingData['macd-1'] = {
    macd: [2], signal: [], histogram: [0],
  };
  assert.equal(api.commitEnvelope(c, tx), false);
  assert.equal(c.indicators.data, prior);
  assert.deepEqual(c.indicators.data['macd-1'].signal, [1]);
});

test('strict schemas cover every supported multi-series result form', () => {
  const api = loadShadow();
  const schemas = {
    bb: ['middle', 'upper', 'lower'],
    bollinger: ['middle', 'upper', 'lower'],
    macd: ['macd', 'signal', 'histogram'],
    stochastic: ['k', 'd'],
    stochrsi: ['k', 'd'],
    adx: ['plusDI', 'minusDI', 'adx'],
    adr: ['upper', 'lower', 'adr'],
    donchian: ['upper', 'lower', 'middle'],
    keltner: ['upper', 'middle', 'lower'],
    aroon: ['up', 'down'],
    vortex: ['viPlus', 'viMinus'],
    envelope: ['upper', 'lower', 'middle'],
    supertrend: ['line', 'direction', 'upper', 'lower', 'body'],
    rvi: ['rvi', 'signal'],
    elderray: ['bull', 'bear'],
    vwap: ['vwap'],
  };
  for (const [type, keys] of Object.entries(schemas)) {
    const value = Object.fromEntries(keys.map((key) => [key, [1, 2]]));
    assert.equal(api.validateResult({ type }, value, 2), true, type);
    delete value[keys.at(-1)];
    assert.equal(api.validateResult({ type }, value, 2), false, `${type}:missing`);
  }
  assert.equal(api.validateResult(
    { type: 'macd' },
    { macd: [1, 2], signal: [1], histogram: [0, 1] },
    2
  ), false);
});

test('dev freeze detects draw and legend consumer mutation attempts', () => {
  const api = loadShadow(true, 1000, true);
  const c = chart();
  c.indicators.active[0].type = 'tema';
  c.data.push({ t: 2, o: 2, h: 3, l: 1, c: 2.5, v: 11 });
  c.indicators.data = { 'ema-1': [1, 2] };
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  assert.equal(api.commitEnvelope(c, tx), true);
  assert.equal(api.commit(c, tickets), true);
  assert.equal(Object.isFrozen(c.indicators.data), true);
  assert.equal(Object.isFrozen(c.indicators.data['ema-1']), true);
  assert.throws(() => { c.indicators.data['ema-1'][0] = 8; }, TypeError);
  assert.throws(() => { c.indicators.data.legend = {}; }, TypeError);
});

test('envelope retention is current plus retired until next paint', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'tema';
  c.indicators.data = { 'ema-1': [1] };
  let tickets = api.claim(c, 'sync', c.indicators.active, 'g1', false);
  let tx = api.beginEnvelope(c, tickets);
  assert.equal(api.commitEnvelope(c, tx), true);
  assert.equal(api.commit(c, tickets), true);
  assert.ok(
    c._b70IndicatorGenerationShadow.metrics.envelopePeakRetainedBytes
      >= tx.copiedBytes * 2,
    'seal peak includes staging and sealed copies'
  );
  const first = c._b70IndicatorGenerationShadow.currentEnvelope;
  c.dataVersion++;
  c.data[0].c++;
  tickets = api.claim(c, 'sync', c.indicators.active, 'g2', false);
  tx = api.beginEnvelope(c, tickets);
  tx.stagingData['ema-1'] = [2];
  assert.equal(api.commitEnvelope(c, tx), true);
  assert.equal(api.commit(c, tickets), true);
  const state = c._b70IndicatorGenerationShadow;
  assert.equal(state.retiredEnvelope, first);
  assert.equal(state.ownerTickets.size, 1);
  assert.equal(api.consume(c), true);
  assert.equal(state.retiredEnvelope, null);
  assert.equal(state.metrics.envelopeReleases, 1);
});

test('envelope build reentrancy fails closed and lifecycle clears references', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.data = { 'ema-1': [1] };
  const publicData = c.indicators.data;
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const first = api.beginEnvelope(c, tickets);
  assert.ok(first);
  assert.equal(api.beginEnvelope(c, tickets), null);
  api.invalidate(c, 'session-reload');
  const state = c._b70IndicatorGenerationShadow;
  assert.equal(c.indicators.data, publicData);
  assert.equal(state.currentEnvelope, null);
  assert.equal(state.retiredEnvelope, null);
  assert.equal(Object.hasOwn(state, 'pendingEnvelope'), false);
  assert.equal(Object.hasOwn(state, 'activeEnvelopeBuild'), false);
});

test('construction never exposes staging and commit swaps public data once', () => {
  const api = loadShadow();
  const c = chart();
  c.indicators.active[0].type = 'tema';
  c.data.push({ t: 2, o: 2, h: 3, l: 1, c: 2.5, v: 11 });
  let pointer = { 'ema-1': [1, 2] };
  const prior = pointer;
  let swaps = 0;
  Object.defineProperty(c.indicators, 'data', {
    configurable: true,
    get: () => pointer,
    set: (next) => { swaps++; pointer = next; },
  });
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  assert.equal(pointer, prior);
  assert.equal(swaps, 0);
  tx.stagingData['ema-1'] = [3, 4];
  assert.equal(pointer, prior);
  assert.deepEqual(pointer['ema-1'], [1, 2]);
  assert.equal(api.commitEnvelope(c, tx), true);
  assert.equal(swaps, 1);
  assert.notEqual(pointer, prior);
});

test('reentrant invalidation exposes no staging and performs no swap', () => {
  const api = loadShadow();
  const c = chart();
  let pointer = { 'ema-1': [1] };
  const prior = pointer;
  let swaps = 0;
  Object.defineProperty(c.indicators, 'data', {
    configurable: true,
    get: () => pointer,
    set: (next) => { swaps++; pointer = next; },
  });
  const tickets = api.claim(c, 'sync', c.indicators.active, 'sync', false);
  const tx = api.beginEnvelope(c, tickets);
  tx.stagingData['ema-1'] = [2];
  assert.ok(c._b70IndicatorGenerationShadow.metrics.envelopeRetainedBytes > 0);
  api.invalidate(c, 'timeline-seek');
  assert.equal(pointer, prior);
  assert.equal(swaps, 0);
  assert.equal(c._b70IndicatorGenerationShadow.metrics.envelopeRetainedBytes, 0);
  assert.equal(api.commitEnvelope(c, tx), false);
  assert.equal(pointer, prior);
  assert.equal(swaps, 0);
});

test('Stage 5 host publishes one immutable clone to every panel', () => {
  const api = loadShadow();
  const host = bridgeChart('host');
  const panelB = bridgeChart('B');
  const panelC = bridgeChart('C');
  const priorB = panelB.indicators.data;
  const priorC = panelC.indicators.data;
  assert.equal(api.bindPanel(panelB, host), true);
  assert.equal(api.bindPanel(panelC, host), true);
  const tickets = api.claim(host, 'sync', host.indicators.active, 'host', false);
  const tx = api.beginEnvelope(host, tickets);
  tx.stagingData['tema-1'] = [3, 4];
  assert.equal(api.commitEnvelope(host, tx), true);
  assert.equal(api.commit(host, tickets), true);
  assert.equal(
    host._b70IndicatorGenerationShadow.metrics.bridgePublications,
    1,
    JSON.stringify(host._b70IndicatorGenerationShadow.metrics)
  );
  assert.deepEqual(panelB.indicators.data['tema-1'], [3, 4]);
  assert.deepEqual(panelC.indicators.data['tema-1'], [3, 4]);
  assert.notEqual(panelB.indicators.data, priorB);
  assert.notEqual(panelC.indicators.data, priorC);
  assert.notEqual(panelB.indicators.data, host.indicators.data);
  assert.notEqual(panelB.indicators.data, panelC.indicators.data);
  panelB.indicators.data['tema-1'][0] = 99;
  assert.deepEqual(host.indicators.data['tema-1'], [3, 4]);
  assert.deepEqual(panelC.indicators.data['tema-1'], [3, 4]);
  assert.equal(panelB._indicatorRenderVersion, 1);
  assert.equal(panelC._indicatorRenderVersion, 1);
  assert.equal(panelB._bridgeRenders, 1);
  assert.equal(panelC._bridgeRenders, 1);
  assert.equal(host._b70IndicatorGenerationShadow.metrics.bridgeDeliveries, 2);
  assert.equal(panelB._b70IndicatorGenerationShadow.metrics.calculationStarts, 0);
});

test('Stage 5 rejects foreign stale partial malformed and out-of-order messages', () => {
  const api = loadShadow();
  const host = bridgeChart('host');
  const panel = bridgeChart('B');
  api.key(host);
  api.key(panel);
  const tickets = api.claim(host, 'sync', host.indicators.active, 'host', false);
  const tx = api.beginEnvelope(host, tickets);
  tx.stagingData['tema-1'] = [3, 4];
  assert.equal(api.commitEnvelope(host, tx), true);
  assert.equal(api.commit(host, tickets), true);
  assert.equal(api.bindPanel(panel, host), true);
  const valid = api.buildMessage(host, tickets, 1);
  const prior = panel.indicators.data;

  const foreign = structuredClone(valid);
  foreign.sessionEpoch = 'foreign';
  assert.equal(api.receivePanel(panel, foreign), false);
  const stale = structuredClone(valid);
  stale.dataGeneration.dataVersion++;
  assert.equal(api.receivePanel(panel, stale), false);
  const partial = structuredClone(valid);
  partial.requestedSet.complete = false;
  assert.equal(api.receivePanel(panel, partial), false);
  const malformed = structuredClone(valid);
  malformed.payload['tema-1'][0] = Number.NaN;
  assert.equal(api.receivePanel(panel, malformed), false);
  assert.equal(panel.indicators.data, prior);
  assert.equal(api.receivePanel(panel, structuredClone(valid)), true);
  assert.equal(api.receivePanel(panel, structuredClone(valid)), false);
  const metrics = panel._b70IndicatorGenerationShadow.metrics;
  assert.equal(metrics.bridgeForeignRejects, 1);
  assert.equal(metrics.bridgeStaleRejects, 1);
  assert.equal(metrics.bridgePartialRejects, 1);
  assert.equal(metrics.bridgeSchemaRejects, 1);
  assert.equal(metrics.bridgeOrderRejects, 1);
});

test('Stage 5 requires one complete valid owner ticket per requested instance', () => {
  const api = loadShadow();
  const host = bridgeChart('host');
  const panel = bridgeChart('B');
  host.indicators.active = [
    { id: 'tema-1', type: 'tema', params: { period: 20 } },
    { id: 'tema-2', type: 'tema', params: { period: 30 } },
  ];
  panel.indicators.active = structuredClone(host.indicators.active);
  host.indicators.data = { 'tema-1': [1, 2], 'tema-2': [2, 3] };
  panel.indicators.data = structuredClone(host.indicators.data);
  const tickets = api.claim(host, 'sync', host.indicators.active, 'host', false);
  const tx = api.beginEnvelope(host, tickets);
  assert.equal(api.commitEnvelope(host, tx), true);
  assert.equal(api.commit(host, tickets), true);
  assert.equal(api.bindPanel(panel, host), true);
  const valid = api.buildMessage(host, tickets, 1);
  const prior = panel.indicators.data;

  const duplicateAuthority = structuredClone(valid);
  duplicateAuthority.ownerTickets[1] = structuredClone(duplicateAuthority.ownerTickets[0]);
  assert.equal(api.receivePanel(panel, duplicateAuthority), false);
  const malformedAuthority = structuredClone(valid);
  malformedAuthority.ownerTickets[0].claimSeq = Number.NaN;
  assert.equal(api.receivePanel(panel, malformedAuthority), false);
  const duplicateRequested = structuredClone(valid);
  duplicateRequested.requestedSet.instanceIds[1] =
    duplicateRequested.requestedSet.instanceIds[0];
  assert.equal(api.receivePanel(panel, duplicateRequested), false);
  assert.equal(panel.indicators.data, prior);
  const metrics = panel._b70IndicatorGenerationShadow.metrics;
  assert.equal(metrics.bridgeDuplicateAuthorityRejects, 1);
  assert.equal(metrics.bridgeMalformedAuthorityRejects, 1);
  assert.equal(metrics.bridgePartialRejects, 1);
});

test('Stage 5 reentrant delivery coalesces without a second swap', () => {
  const api = loadShadow();
  const host = bridgeChart('host');
  const panel = bridgeChart('B');
  api.key(host);
  api.key(panel);
  const tickets = api.claim(host, 'sync', host.indicators.active, 'host', false);
  const tx = api.beginEnvelope(host, tickets);
  tx.stagingData['tema-1'] = [3, 4];
  assert.equal(api.commitEnvelope(host, tx), true);
  assert.equal(api.commit(host, tickets), true);
  assert.equal(api.bindPanel(panel, host), true);
  const first = api.buildMessage(host, tickets, 1);
  const second = structuredClone(first);
  second.publicationSeq = 2;
  let pointer = panel.indicators.data;
  let swaps = 0;
  Object.defineProperty(panel.indicators, 'data', {
    configurable: true,
    get: () => pointer,
    set(next) {
      swaps++;
      pointer = next;
      if (swaps === 1) api.receivePanel(panel, structuredClone(second));
    },
  });
  assert.equal(api.receivePanel(panel, structuredClone(first)), true);
  assert.equal(swaps, 1);
  assert.equal(panel._indicatorRenderVersion, 1);
  assert.equal(panel._b70IndicatorGenerationShadow.metrics.bridgeCoalesced, 1);
});

test('Stage 5 timeout falls back once and teardown rejects late delivery', async () => {
  const api = loadShadow(true, 1000, false, 0);
  const host = bridgeChart('host');
  const panel = bridgeChart('B');
  let hostCalculations = 0;
  let panelCalculations = 0;
  host.recalculateIndicators = () => { hostCalculations++; };
  panel.recalculateIndicators = () => { panelCalculations++; };
  assert.equal(api.bindPanel(panel, host), true);
  assert.equal(api.deferPanel(panel), true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(hostCalculations, 1);
  assert.equal(panelCalculations, 1);
  assert.equal(panel._b70IndicatorGenerationShadow.metrics.bridgeFallbacks, 1);
  api.invalidateBridge(panel, true);
  assert.equal(api.receivePanel(panel, {}), false);
});

test('Stage 5 seek unregisters panel and rejects the superseded envelope', () => {
  const api = loadShadow();
  const host = bridgeChart('host');
  const panel = bridgeChart('B');
  api.key(host);
  api.key(panel);
  const tickets = api.claim(host, 'sync', host.indicators.active, 'host', false);
  const tx = api.beginEnvelope(host, tickets);
  tx.stagingData['tema-1'] = [3, 4];
  assert.equal(api.commitEnvelope(host, tx), true);
  assert.equal(api.commit(host, tickets), true);
  assert.equal(api.bindPanel(panel, host), true);
  const message = api.buildMessage(host, tickets, 1);
  api.invalidate(panel, 'timeline-seek');
  assert.equal(api.receivePanel(panel, structuredClone(message)), false);
  assert.equal(panel._b70IndicatorGenerationShadow.metrics.bridgeAccepts, 0);
});

test('Stage 5 panel removal disposes bridge ownership in both managers', () => {
  const hook = "typeof panelChart._b70ShadowDisposeIndicatorGeneration === 'function'";
  assert.ok(managerSource.includes(hook));
  assert.ok(managerProdSource.includes(hook));
});

test('product hooks remain shadow-only and worker/panel protocols are untouched', () => {
  for (const hook of [
    "window.__TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1 === true",
    "_b70ShadowRecordRequest(this, 'scheduleReplayIndicatorRecalc')",
    "_b70ShadowRecordCalculation(this, 'recalculateIndicatorsAsync', 'worker')",
    "_b70ShadowRecordCalculation(this, 'recalculateIndicatorsIncremental', 'worker')",
    "_b70ShadowRecordCalculation(this, 'recalculateIndicators', 'sync')",
    "_b70ShadowRecordCalculation(this, '_m19iExactTailPaint', 'paint')",
  ]) assert.ok(source.includes(hook), hook);
  assert.ok(replaySource.includes("_b70ShadowInvalidateIndicatorGeneration('timeline-seek')"));
  assert.ok(replaySource.includes('_b70ShadowDisposeIndicatorGeneration()'));
  assert.ok(source.includes('Chart.prototype._invalidateIndicatorAsyncWork = function()'),
    'OFF-visible function arity remains baseline-identical');
  const syncGuard = source.indexOf('if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0)');
  const syncMetric = source.indexOf("_b70ShadowRecordCalculation(this, 'recalculateIndicators', 'sync')", syncGuard);
  assert.ok(syncGuard >= 0 && syncMetric > syncGuard, 'empty sync calls are not calculations');
  const paintMemo = source.indexOf('if (fp === this._m19iExactTailLastFp && rv === this._m19iExactTailLastRv)');
  const paintMetric = source.indexOf("_b70ShadowRecordCalculation(this, '_m19iExactTailPaint', 'paint')", paintMemo);
  assert.ok(paintMemo >= 0 && paintMetric > paintMemo, 'memoized render observations are not calculations');
  assert.equal(source.includes("type: 'B70_"), false);
  assert.equal(fs.readFileSync(path.join(here, '..', 'workers', 'indicator-worker.js'), 'utf8')
    .includes('B70'), false);
  assert.ok(source.includes('_b70Stage2AuthorizeWorkerApply'));
  assert.ok(source.includes('_b70Stage2ReleaseWorkerFailure'));
  assert.ok(source.includes('b70AllowedIds'));
});
