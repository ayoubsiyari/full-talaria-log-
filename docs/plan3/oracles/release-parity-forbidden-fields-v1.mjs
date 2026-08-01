#!/usr/bin/env node
/**
 * RELEASE-PARITY-FORBIDDEN-FIELDS-V1
 *
 * Non-contamination source of truth = decisions.md ten forbidden fields,
 * enforced by the ported engine-api-guards.js artifact (not reinvented).
 *
 * E owns indicator / drawing / chartType(+overlay) RED controls — referenced,
 * not rebuilt.
 */
import { pathToFileURL } from 'node:url';
import {
  DECISIONS_FORBIDDEN_FIELDS,
  E_COMPANION_ORACLE,
  E_OWNED_FORBIDDEN_FIELDS,
  FORBIDDEN_SYNC_FIELDS,
  PRODUCT_GUARD_SOURCE,
  PRODUCT_GUARD_VERSION,
  filterForbiddenFields,
  installForbiddenSetterTraps,
  provePerInstanceTrapsFireInSingleRealm,
  runGuardSelfTest,
  snapshotPriceState,
  diffPriceState,
} from './release-parity-engine-api-guards.mjs';

export const RELEASE_PARITY_FORBIDDEN_FIELDS_SIGNATURE = 'TALARIA_RELEASE_PARITY_FORBIDDEN_FIELDS_V1';

export const CONF01_PANELS = Object.freeze([
  { id: 'A', symbol: 'XAUUSD', fileId: 677, timeframe: '1m' },
  { id: 'B', symbol: 'HOG', fileId: 673, timeframe: '5m' },
  { id: 'C', symbol: 'ETHBTC', fileId: 670, timeframe: '15m' },
  { id: 'D', symbol: 'BTCEUR', fileId: 669, timeframe: '1h' },
]);

function makeChart(cfg) {
  const seed = Number(cfg.fileId) + cfg.symbol.length * 17;
  return {
    id: cfg.id,
    _instanceKey: cfg.id,
    symbol: cfg.symbol,
    fileId: cfg.fileId,
    timeframe: cfg.timeframe,
    priceMin: 100 + (seed % 40),
    priceMax: 140 + (seed % 40),
    autoScale: true,
    priceZoom: 1,
    priceOffset: 0,
    scaleMode: 'linear',
    chartType: 'candlestick',
    indicators: [{ id: `${cfg.id}-sma`, owner: cfg.id }],
    drawings: [{ id: `${cfg.id}-tl`, owner: cfg.id }],
    priceScale: {
      min: 100 + (seed % 40),
      max: 140 + (seed % 40),
      autoScale: true,
      mode: 'linear',
      locked: false,
    },
    data: Array.from({ length: 8 }, (_, i) => ({ t: i * 60_000, c: 100 + i })),
  };
}

export function runPortedGuardSelfTest() {
  const chart = makeChart(CONF01_PANELS[0]);
  const report = runGuardSelfTest(chart);
  return {
    cell: 'PORTED-GUARD-SELF-TEST',
    status: report.ok ? 'GREEN' : 'RED',
    productSource: PRODUCT_GUARD_SOURCE,
    productVersion: PRODUCT_GUARD_VERSION,
    failures: report.failures,
  };
}

export function runDecisionsTenFilterCells() {
  const cells = [];
  for (const field of DECISIONS_FORBIDDEN_FIELDS) {
    const payload = {
      type: 'visibleRange',
      startTime: 1,
      endTime: 2,
      [field]: field === 'autoScale' ? false : field === 'indicators' || field === 'drawings' ? [{ leak: true }] : 'LEAK',
      nested: { [field]: 'NESTED-LEAK', ok: true },
    };
    const filtered = filterForbiddenFields(payload);
    const strippedTop = filtered.clean[field] === undefined;
    const strippedNested = !filtered.clean.nested || filtered.clean.nested[field] === undefined;
    const logged = filtered.dropped.some((d) => d === field || d.endsWith(`.${field}`) || d === `nested.${field}`);
    const ownedByE = E_OWNED_FORBIDDEN_FIELDS.includes(field);
    const status = strippedTop && strippedNested && logged ? 'GREEN' : 'RED';
    cells.push({
      cell: `FORBIDDEN-${field.toUpperCase()}`,
      field,
      status,
      strippedTop,
      strippedNested,
      logged,
      ownedByE,
      eReference: ownedByE ? E_COMPANION_ORACLE : null,
      dropped: filtered.dropped,
    });
  }
  return cells;
}

export function runVisibleRangeAutoScaleSubtlety() {
  const chart = makeChart(CONF01_PANELS[1]);
  const before = snapshotPriceState(chart);
  const afterOk = { ...before, 'priceScale.min': before['priceScale.min'] + 5, 'priceScale.max': before['priceScale.max'] + 5 };
  const afterBad = { ...before, autoScale: false, 'priceScale.autoScale': false };
  const okDiff = diffPriceState(before, afterOk, 'visibleRange');
  const badDiff = diffPriceState(before, afterBad, 'visibleRange');
  return {
    cell: 'VISIBLERANGE-AUTOSCALE-STAYS-TRUE',
    status: okDiff.length === 0 && badDiff.length > 0 ? 'GREEN' : 'RED',
    okDiff,
    badDiff,
  };
}

export function runPerInstanceTrapCell() {
  const proof = provePerInstanceTrapsFireInSingleRealm();
  return {
    cell: 'PER-INSTANCE-SETTER-TRAPS',
    status: proof.ok ? 'GREEN' : 'RED',
    proof,
    releaseAuthority: {
      stopAuthority: true,
      productStubBlocksRelease: proof.productStub === true,
      statement: proof.ok
        ? (proof.productStub
          ? 'Ported traps fire per-instance in a single realm. Product engine-api-guards.js installForbiddenSetterTraps remains a stub — release waits on product non-stub traps before single-realm ships.'
          : 'Ported and product traps fire per-instance.')
        : 'Ported guard cannot fire per-instance in a single realm — RELEASE-01 stop.',
    },
  };
}

export function runForbiddenFieldsSuite() {
  const selfTest = runPortedGuardSelfTest();
  const ten = runDecisionsTenFilterCells();
  const autoScale = runVisibleRangeAutoScaleSubtlety();
  const traps = runPerInstanceTrapCell();
  const failures = [];
  if (selfTest.status !== 'GREEN') failures.push(selfTest);
  for (const cell of ten) if (cell.status !== 'GREEN') failures.push(cell);
  if (autoScale.status !== 'GREEN') failures.push(autoScale);
  if (traps.status !== 'GREEN') failures.push(traps);

  const stop = traps.status !== 'GREEN';
  return {
    signature: RELEASE_PARITY_FORBIDDEN_FIELDS_SIGNATURE,
    status: failures.length || stop ? 'RED' : 'GREEN',
    conf01: {
      panels: CONF01_PANELS,
      fourDistinctSymbols: true,
      fourDistinctTimeframes: true,
    },
    decisionsForbiddenFields: DECISIONS_FORBIDDEN_FIELDS,
    productForbiddenSyncFields: FORBIDDEN_SYNC_FIELDS,
    eCompanion: E_COMPANION_ORACLE,
    selfTest,
    tenFieldCells: ten,
    autoScaleSubtlety: autoScale,
    perInstanceTraps: traps,
    failures: failures.map((f) => ({ cell: f.cell, status: f.status })),
    releaseAuthority: traps.releaseAuthority,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runForbiddenFieldsSuite();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' && !report.releaseAuthority.productStubBlocksRelease ? 0 : 1);
}
