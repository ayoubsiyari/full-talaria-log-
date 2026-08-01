#!/usr/bin/env node
/**
 * Port of homepage/public/chart/multichart/engine-api-guards.js for the
 * release-parity oracle. Do not reinvent the filter/snapshot/diff/self-test —
 * load the product artifact and only replace the stubbed per-instance setter
 * traps, which are the single-realm enforcement mechanism under RELEASE-01.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PRODUCT_GUARD_PATH = path.join(
  REPO_ROOT,
  'homepage/public/chart/multichart/engine-api-guards.js',
);

/** decisions.md Decision 1 — the ten invariants (source of truth for the suite). */
export const DECISIONS_FORBIDDEN_FIELDS = Object.freeze([
  'priceMin',
  'priceMax',
  'autoScale',
  'priceZoom',
  'priceOffset',
  'timeframe',
  'indicators',
  'drawings',
  'chartType',
  'scaleMode',
]);

/** E owns these three of the ten; D must not rebuild their RED controls. */
export const E_OWNED_FORBIDDEN_FIELDS = Object.freeze([
  'indicators',
  'drawings',
  'chartType',
]);

export const E_COMPANION_ORACLE = Object.freeze({
  owner: 'E',
  path: 'docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness.red.mjs',
  redControls: [
    'RP-INDICATOR-GLOBAL-SLOT',
    'RP-DRAWING-GLOBAL-LAYER',
    'RP-OVERLAY-GLOBAL-LAYER',
  ],
  note: 'E-VER-019/020 already prove indicator/drawing/overlay cross-contamination RED. Do not rebuild.',
});

function loadProductGuards() {
  const source = fs.readFileSync(PRODUCT_GUARD_PATH, 'utf8');
  const sandbox = { console, Object, Array, JSON, Math, Number, String, Error };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: PRODUCT_GUARD_PATH });
  if (!sandbox.MultichartGuards) {
    throw new Error(`failed to load MultichartGuards from ${PRODUCT_GUARD_PATH}`);
  }
  return sandbox.MultichartGuards;
}

const product = loadProductGuards();

export const PRODUCT_GUARD_SOURCE = PRODUCT_GUARD_PATH;
export const PRODUCT_GUARD_VERSION = product.VERSION;
export const FORBIDDEN_SYNC_FIELDS = Object.freeze(
  Array.from(new Set([...product.FORBIDDEN_SYNC_FIELDS, ...DECISIONS_FORBIDDEN_FIELDS])),
);
export const snapshotPriceState = product.snapshotPriceState;
export const diffPriceState = product.diffPriceState;
export const runGuardSelfTest = product.runGuardSelfTest;

/**
 * Product filter plus decisions.md ten-field union (product list historically
 * used mode/scaleType aliases and omitted scaleMode).
 */
export function filterForbiddenFields(payload) {
  if (!payload || typeof payload !== 'object') return { clean: payload, dropped: [] };
  const dropped = [];
  const clean = {};
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_SYNC_FIELDS.includes(k) || DECISIONS_FORBIDDEN_FIELDS.includes(k)) {
      dropped.push(k);
      continue;
    }
    const v = payload[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = filterForbiddenFields(v);
      if (nested.dropped.length) dropped.push(...nested.dropped.map((s) => `${k}.${s}`));
      clean[k] = nested.clean;
    } else {
      clean[k] = v;
    }
  }
  return { clean, dropped };
}

/**
 * Product installForbiddenSetterTraps is still a stub (returns false).
 * This port implements the single-realm mechanism the README reserved:
 * per-instance traps that throw on external writes to price-axis fields.
 *
 * Internal writes are allowed only while chart.__allowInternalPriceWrite is true.
 */
export function installForbiddenSetterTraps(chart, opts = {}) {
  const force = opts.force === true;
  const enabled = force
    || (typeof globalThis !== 'undefined' && globalThis.MULTICHART_GUARD_TRAPS === true);
  if (!enabled || !chart || typeof chart !== 'object') return false;

  if (chart.__multichartGuardTrapsInstalled) return true;

  const instanceId = String(opts.instanceId || chart.id || chart._instanceKey || 'anon');
  if (!chart.priceScale || typeof chart.priceScale !== 'object') {
    chart.priceScale = {
      min: chart.priceMin ?? 0,
      max: chart.priceMax ?? 1,
      autoScale: chart.autoScale !== false,
      mode: chart.scaleMode || 'linear',
      locked: false,
    };
  }

  const trapWrite = (field, apply) => function forbiddenSetter(value) {
    if (chart.__allowInternalPriceWrite === true) {
      apply(value);
      return;
    }
    const err = new Error(
      `MultichartGuards: forbidden cross-instance write to ${field} on ${instanceId}`,
    );
    err.code = 'FORBIDDEN_SETTER_TRAP';
    err.field = field;
    err.instanceId = instanceId;
    throw err;
  };

  const define = (obj, key, getter, setter) => {
    Object.defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      get: getter,
      set: setter,
    });
  };

  let min = Number(chart.priceScale.min);
  let max = Number(chart.priceScale.max);
  let psAuto = chart.priceScale.autoScale !== false;
  let mode = chart.priceScale.mode || chart.scaleMode || 'linear';
  let autoScale = chart.autoScale !== false;
  let priceZoom = Number(chart.priceZoom ?? 1);
  let priceOffset = Number(chart.priceOffset ?? 0);
  let manualCenterPrice = chart.manualCenterPrice ?? null;
  let manualRange = chart.manualRange ?? null;

  define(chart.priceScale, 'min', () => min, trapWrite('priceScale.min', (v) => {
    min = v;
    chart.priceMin = v;
  }));
  define(chart.priceScale, 'max', () => max, trapWrite('priceScale.max', (v) => {
    max = v;
    chart.priceMax = v;
  }));
  define(chart.priceScale, 'autoScale', () => psAuto, trapWrite('priceScale.autoScale', (v) => {
    psAuto = v;
    autoScale = v;
  }));
  define(chart.priceScale, 'mode', () => mode, trapWrite('priceScale.mode', (v) => {
    mode = v;
    chart.scaleMode = v;
  }));
  define(chart, 'autoScale', () => autoScale, trapWrite('autoScale', (v) => {
    autoScale = v;
    psAuto = v;
  }));
  define(chart, 'priceZoom', () => priceZoom, trapWrite('priceZoom', (v) => { priceZoom = v; }));
  define(chart, 'priceOffset', () => priceOffset, trapWrite('priceOffset', (v) => { priceOffset = v; }));
  define(chart, 'manualCenterPrice', () => manualCenterPrice, trapWrite('manualCenterPrice', (v) => {
    manualCenterPrice = v;
  }));
  define(chart, 'manualRange', () => manualRange, trapWrite('manualRange', (v) => { manualRange = v; }));

  chart.__multichartGuardTrapsInstalled = true;
  chart.__multichartGuardInstanceId = instanceId;
  chart.__allowInternalPriceWrite = false;
  chart.withInternalPriceWrite = (fn) => {
    const prev = chart.__allowInternalPriceWrite;
    chart.__allowInternalPriceWrite = true;
    try {
      return fn();
    } finally {
      chart.__allowInternalPriceWrite = prev;
    }
  };
  return true;
}

export function productSetterTrapsAreStub() {
  const probe = {
    id: 'stub-probe',
    priceScale: { min: 1, max: 2, autoScale: true, mode: 'linear' },
    autoScale: true,
    priceZoom: 1,
    priceOffset: 0,
  };
  const prev = globalThis.MULTICHART_GUARD_TRAPS;
  globalThis.MULTICHART_GUARD_TRAPS = true;
  try {
    return product.installForbiddenSetterTraps(probe) === false;
  } finally {
    globalThis.MULTICHART_GUARD_TRAPS = prev;
  }
}

/**
 * Concrete RELEASE-01 stop-authority test: two instances in one realm; a
 * cross-instance forbidden write must throw on the victim instance.
 */
export function provePerInstanceTrapsFireInSingleRealm() {
  const a = {
    id: 'A',
    priceScale: { min: 100, max: 110, autoScale: true, mode: 'linear' },
    autoScale: true,
    priceZoom: 1,
    priceOffset: 0,
  };
  const b = {
    id: 'B',
    priceScale: { min: 200, max: 220, autoScale: true, mode: 'linear' },
    autoScale: true,
    priceZoom: 1,
    priceOffset: 0,
  };
  const installedA = installForbiddenSetterTraps(a, { force: true, instanceId: 'A' });
  const installedB = installForbiddenSetterTraps(b, { force: true, instanceId: 'B' });
  let threw = false;
  let error = null;
  try {
    // Simulate peer A sync writing B's price axis — the original bug class.
    b.priceScale.min = a.priceScale.min;
  } catch (e) {
    threw = true;
    error = e;
  }
  // Internal write on B must still be possible.
  let internalOk = false;
  b.withInternalPriceWrite(() => {
    b.priceScale.min = 205;
    internalOk = b.priceScale.min === 205;
  });
  return {
    ok: installedA && installedB && threw && error?.code === 'FORBIDDEN_SETTER_TRAP' && internalOk,
    installedA,
    installedB,
    threw,
    errorCode: error?.code || null,
    errorField: error?.field || null,
    errorInstanceId: error?.instanceId || null,
    internalOk,
    productStub: productSetterTrapsAreStub(),
    decisionsFields: DECISIONS_FORBIDDEN_FIELDS,
    eOwnedDeferred: E_OWNED_FORBIDDEN_FIELDS,
  };
}

export const MultichartGuards = Object.freeze({
  VERSION: `${PRODUCT_GUARD_VERSION}+release-parity-port`,
  FORBIDDEN_SYNC_FIELDS,
  DECISIONS_FORBIDDEN_FIELDS,
  snapshotPriceState,
  diffPriceState,
  filterForbiddenFields,
  runGuardSelfTest,
  installForbiddenSetterTraps,
  provePerInstanceTrapsFireInSingleRealm,
  productSetterTrapsAreStub,
  E_COMPANION_ORACLE,
});
