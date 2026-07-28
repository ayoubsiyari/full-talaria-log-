/**
 * SUPPORT-PASSPORT-DEGRADED-MODULES-V1 (W36 / CONCLUSION-48H M6; re-authored W40, W42, W43)
 * Signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1
 *
 * Soundness is proven by executing the REAL `buildSupportContext()` exported from
 * homepage/src/app/dashboard/support/supportUi.tsx: the .tsx is transpiled with the
 * TypeScript compiler API and evaluated inside a vm realm whose `window` is the one
 * published by chart v 1.4/chart/modules/module-presence-runtime.js. There is no
 * hand-copied re-implementation of the extractor in this file — a mirror can only ever
 * prove that the mirror agrees with itself.
 *
 * W42 (R-M6-2 REJECT) changed three things:
 *
 *   1. Temporal coverage. Every cell used to build a fresh realm and call the extractor
 *      once, so a passport memoised at module scope was invisible: the first support
 *      ticket of a session carried the modules and every later one silently did not.
 *      PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE calls the real function three times in ONE
 *      realm, degrading the runtime between calls, and mutant M6 is the memoisation.
 *   2. Alias falsifiability. The alias contract was three substring pins, one of which
 *      (`window.__TALARIA_DEGRADED_STATE`) is a prefix of another, so it could never be
 *      removed while the longer alias existed — an unfalsifiable pin. All three source
 *      pins are deleted. Each alias is now booted on its own: the realm publishes the
 *      degraded record under exactly one global and the real function must still find it.
 *      NC-ALIAS-DROP-* proves each cell is the sole detector for its alias.
 *   3. Consumer wiring. The passport is pinned onto the call path that sends it, by AST:
 *      a CallExpression named `buildSupportContext` in SupportInbox.tsx and
 *      V16SupportChatPopover.tsx. Comments, strings, template literals, regex literals
 *      and JSX text are not CallExpressions, so the decoy classes that could pay a
 *      substring pin cannot pay this one — and NC-CONSUMER-PIN-DECOYS proves it.
 *
 * W43 (R-M6-3 REJECT) closes three further holes named against W42:
 *
 *   1. Realm fidelity. The document used to stay permanently at readyState "loading", so a
 *      cache gated on readyState === "complete" was dead code inside the gate and live in
 *      every real browser (tickets are filed after load). The realm now advances to
 *      "complete" after DOMContentLoaded, matching post-load ticket filing.
 *   2. Wall-clock fidelity. The temporal cell's three calls landed within ~1 ms, so a cache
 *      gated on session age (Date.now() - boot > 30s) was invisible. The realm exposes a
 *      controllable Date.now, and the temporal cell advances it by TEMPORAL_CLOCK_ADVANCE_MS
 *      between observations. Mutants M6 (readyState-gated) and M7 (warm-up-gated) are the
 *      two carriers; both are killed by TEMPORAL-RECOMPUTE and by nothing else.
 *   3. Call-site timing. Counting CallExpressions anywhere in the file cannot see a
 *      useMemo(() => buildSupportContext(), []) hoist that freezes the passport at mount.
 *      The consumer pin now requires ≥1 call whose enclosing binding is createThread (the
 *      POST path) and that is not inside useMemo; NC-CONSUMER-CALL-HOISTED-USEMEMO proves
 *      the hoist goes RED.
 *
 * W44 (R-M6-4 REJECT) closes the unbounded "unmodelled API" class and the consumer
 * value-flow hole:
 *
 *   1. The realm models sessionStorage, localStorage, performance.now (tied to the same
 *      clock), and document.visibilityState="visible", so caches that use those APIs are
 *      live inside the gate and are killed by TEMPORAL-RECOMPUTE (mutants M8/M9).
 *   2. window/document are Proxies: any property read by buildSupportContext that is not
 *      an own modelled/runtime property fails PASSPORT-DEGRADED-REALM-FIDELITY — so the
 *      next unmodelled API is RED by construction rather than another blacklist entry.
 *   3. Consumer pin requires the call's result to reach the request `context` payload
 *      (AST value-flow), not merely that a CallExpression exists; NC-CONSUMER-VALUE-FROZEN
 *      freezes the value one line downstream and must go RED.
 */
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

export const TALARIA_SUPPORT_PASSPORT_DEGRADED_V1 = 'TALARIA_SUPPORT_PASSPORT_DEGRADED_V1';
export const SUPPORT_PASSPORT_DEGRADED_GATE_NAME = 'SUPPORT-PASSPORT-DEGRADED-MODULES-V1';

/** Declared passport bound. Used as an oracle property, never as an implementation. */
export const MAX_PASSPORT_DEGRADED_MODULES = 32;
export const DEGRADED_MODULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export const SUPPORT_UI_RELATIVE_PATH = 'homepage/src/app/dashboard/support/supportUi.tsx';
export const MODULE_PRESENCE_RUNTIME_RELATIVE_PATH =
  'chart v 1.4/chart/modules/module-presence-runtime.js';
export const INDICATOR_PERFORMANCE_RELATIVE_PATH =
  'chart v 1.4/chart/modules/indicator-performance.js';
export const API_SERVER_RELATIVE_PATH = 'chart v 1.4/chart/api_server.py';

/**
 * The three globals module-presence-runtime.js publishes the degraded record under, in the
 * order supportUi.tsx consults them. Declared here as data, never as a `??` chain: this
 * file must not contain anything a reader could mistake for a second extractor.
 */
export const SUPPORT_PASSPORT_ALIASES = [
  { id: 'canonical', global: '__TALARIA_DEGRADED_STATE', cell: 'PASSPORT-DEGRADED-ALIAS-CANONICAL' },
  { id: 'dunder', global: '__TALARIA_DEGRADED_STATE__', cell: 'PASSPORT-DEGRADED-ALIAS-DUNDER' },
  { id: 'compat', global: '__TALARIA_DEGRADED_MODE__', cell: 'PASSPORT-DEGRADED-ALIAS-COMPAT' },
];

/** Product call paths that must actually send the passport. Read-only: never edited here. */
export const SUPPORT_PASSPORT_CONSUMERS = [
  {
    id: 'support-inbox',
    relativePath: 'homepage/src/app/dashboard/support/SupportInbox.tsx',
  },
  {
    id: 'v16-support-chat-popover',
    relativePath: 'homepage/src/app/dashboard/v16/V16SupportChatPopover.tsx',
  },
];

export const SUPPORT_PASSPORT_CONSUMER_EXPORT = 'buildSupportContext';

/** Product send handlers that must invoke the passport at ticket-create time. */
export const SUPPORT_PASSPORT_SUBMIT_HANDLER_NAMES = ['createThread'];

/**
 * Wall-clock step between temporal observations. Large enough that a
 * `Date.now() - bootTime > 30_000` warm-up cache activates between tickets.
 */
export const TEMPORAL_CLOCK_ADVANCE_MS = 31_000;

/** Seed properties every passport realm installs before the product runtime runs. */
export const REALM_WINDOW_SEED_KEYS = [
  'document',
  'dispatchEvent',
  'console',
  'location',
  'navigator',
  'sessionStorage',
  'localStorage',
  'performance',
];

export const REALM_DOCUMENT_SEED_KEYS = [
  'readyState',
  'visibilityState',
  'body',
  'documentElement',
  'addEventListener',
  'getElementById',
  'createElement',
  'querySelector',
];

/* ---------------- *
 * Small utilities. *
 * ---------------- */

/** In-memory Web Storage that sessionStorage/localStorage mutants actually hit. */
export function createMemoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(String(key)); },
    clear: () => { map.clear(); },
  };
}

/**
 * DOMStringMap stand-in: arbitrary string keys are defined behaviour, not unmodelled APIs.
 * Must not go through the missing-key tracker (R-M6-5 body.dataset carrier).
 */
export function createDatasetMap() {
  const map = Object.create(null);
  return new Proxy(map, {
    get(obj, prop) {
      if (prop === 'constructor' || prop === 'toString' || typeof prop === 'symbol') {
        return Reflect.get(Object.prototype, prop);
      }
      return Object.prototype.hasOwnProperty.call(obj, prop) ? obj[prop] : undefined;
    },
    set(obj, prop, value) {
      obj[prop] = value == null ? String(value) : String(value);
      return true;
    },
    has: () => true,
    ownKeys: (obj) => Reflect.ownKeys(obj),
    getOwnPropertyDescriptor: (obj, prop) => {
      if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
        return { configurable: true, enumerable: true, writable: true, value: undefined };
      }
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },
  });
}

function isPlainTrackableObject(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Depth-N own-property Proxy (W45). Records missing-key reads while `tracker.enabled`,
 * and wraps plain nested objects so `performance.timeOrigin` / `document.body.dataset`
 * cannot hide behind a modelled parent key. Functions are wrapped so their plain-object
 * returns are also tracked (querySelector / createElement / getElementById).
 */
export function createTrackedRealmObject(seed, tracker, label, proxyCache = new WeakMap()) {
  if (seed !== null && typeof seed === 'object' && proxyCache.has(seed)) {
    return proxyCache.get(seed);
  }
  const target = isPlainTrackableObject(seed) ? { ...seed } : seed;
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      if (tracker.enabled && (typeof prop === 'string' || typeof prop === 'symbol')) {
        const key = String(prop);
        if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
          tracker.unknownReads.push(`${label}.${key}`);
        }
      }
      const value = Reflect.get(obj, prop, receiver);
      if (value !== null && typeof value === 'object' && proxyCache.has(value)) {
        return proxyCache.get(value);
      }
      if (typeof value === 'function') {
        return (...args) => {
          const result = value.apply(obj, args);
          if (result !== null && typeof result === 'object' && proxyCache.has(result)) {
            return proxyCache.get(result);
          }
          if (isPlainTrackableObject(result)) {
            return createTrackedRealmObject(result, tracker, `${label}.${String(prop)}()`, proxyCache);
          }
          return result;
        };
      }
      // dataset maps intentionally allow arbitrary keys — do not re-wrap into a tracker.
      if (prop === 'dataset') return value;
      if (isPlainTrackableObject(value)) {
        return createTrackedRealmObject(value, tracker, `${label}.${String(prop)}`, proxyCache);
      }
      return value;
    },
    set(obj, prop, value, receiver) {
      return Reflect.set(obj, prop, value, receiver);
    },
    has(obj, prop) {
      return Reflect.has(obj, prop);
    },
    ownKeys(obj) {
      return Reflect.ownKeys(obj);
    },
    getOwnPropertyDescriptor(obj, prop) {
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },
  });
  if (seed !== null && typeof seed === 'object') {
    proxyCache.set(seed, proxy);
    proxyCache.set(proxy, proxy);
  }
  if (target !== seed && target !== null && typeof target === 'object') {
    proxyCache.set(target, proxy);
  }
  return proxy;
}

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves the TypeScript compiler from the homepage workspace — the one that owns
 * supportUi.tsx and pins the compiler version that file is written against — falling back
 * to the workspace root. Returns null rather than throwing so the caller can report a RED
 * cell: a gate that cannot transpile its subject must not report GREEN.
 * @param {string} root
 */
export function resolveTypeScript(root) {
  for (const manifest of ['homepage/package.json', 'package.json']) {
    try {
      return createRequire(path.join(root, manifest))('typescript');
    } catch {
      /* try next workspace */
    }
  }
  return null;
}

/** Mutants and pins are written against LF; a CRLF checkout must not silently miss them. */
export function normalizeLineEndings(source) {
  return typeof source === 'string' ? source.replace(/\r\n/g, '\n') : source;
}

// One gate run builds ~70 realms over a dozen distinct sources; the bound keeps the cache
// from holding every mutant variant if a caller loops.
const TRANSPILE_CACHE_MAX = 32;
const transpileCache = new Map();

/**
 * @param {{ typescript: any, supportUiSource: string }} opts
 * @returns {string}
 */
export function transpileSupportUi({ typescript: ts, supportUiSource }) {
  const cached = transpileCache.get(supportUiSource);
  if (cached !== undefined) return cached;
  const emitted = ts.transpileModule(supportUiSource, {
    fileName: 'supportUi.tsx',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const fatal = (emitted.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (fatal.length > 0) {
    throw new Error(`supportUi.tsx transpile failed: ${ts.flattenDiagnosticMessageText(fatal[0].messageText, ' ')}`);
  }
  if (transpileCache.size >= TRANSPILE_CACHE_MAX) transpileCache.clear();
  transpileCache.set(supportUiSource, emitted.outputText);
  return emitted.outputText;
}

/* ------------------------------------------------- *
 * Realm: real supportUi.tsx over the real runtime.  *
 * ------------------------------------------------- */

function reactStub() {
  const React = { createElement: () => null, Fragment: 'react.fragment' };
  return { ...React, default: React, __esModule: true };
}

/**
 * Boots module-presence-runtime.js (optionally with its indicator-performance provider)
 * and evaluates the transpiled supportUi module in the *same* realm, so the function under
 * test reads the very `window` the product runtime published.
 *
 * `aliasOnly` narrows that window to a single published global before supportUi is
 * evaluated. The runtime publishes one degraded record under three names, so with all
 * three present the loss of any one of them is behaviourally silent; booting them one at a
 * time is what makes each alias a fact the gate can falsify.
 *
 * @param {{
 *   supportUiSource: string,
 *   runtimeSource: string,
 *   indicatorPerfSource: string,
 *   typescript: any,
 *   providerPresent?: boolean,
 *   aliasOnly?: string | null,
 *   href?: string,
 *   userAgent?: string,
 *   nowMs?: number,
 *   postBootReadyState?: 'loading' | 'interactive' | 'complete',
 *   browserRealistic?: boolean,
 * }} opts
 */
export function createSupportPassportRealm(opts) {
  const {
    providerPresent = true,
    aliasOnly = null,
    href = 'https://app.talaria.test/dashboard/support',
    // Support tickets are filed after load. A permanently-"loading" document made any
    // readyState==="complete" cache dead inside the gate and live in every real browser.
    postBootReadyState = 'complete',
    browserRealistic = false,
  } = opts;
  const listeners = {};
  const badges = [];
  const provider = { compareDocumentPosition: () => 4 };
  const consumer = {};
  const accessTracker = { enabled: false, unknownReads: [] };
  let nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : 1_700_000_000_000;
  const clock = {
    now: () => nowMs,
    advance: (ms) => { nowMs += ms; return nowMs; },
    set: (ms) => { nowMs = ms; return nowMs; },
  };
  const perfOrigin = nowMs;
  // Product (and mutants) call Date.now(); host Date must not leak a frozen wall clock.
  const RealmDate = class extends Date {
    constructor(...args) {
      if (args.length === 0) super(nowMs);
      else super(...args);
    }
    static now() { return nowMs; }
  };
  const events = [];
  const proxyCache = new WeakMap();
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  // timeOrigin is the R-M6-5 sibling of performance.now — must advance with the same clock
  // base so a warm-up keyed on Date.now() - performance.timeOrigin is live in the gate.
  const performance = createTrackedRealmObject({
    timeOrigin: perfOrigin,
    now: () => Math.max(0, nowMs - perfOrigin),
  }, accessTracker, 'performance', proxyCache);
  // Do NOT seed serviceWorker/storage as own `undefined` — a falsy own key is an
  // environment discriminator (R-M6-6): `if (navigator.serviceWorker) return cache`
  // stays dead in the gate and live in every HTTPS browser. Browser-realistic values
  // are injected by the dual-environment temporal cell instead.
  const navigatorSeed = {
    userAgent: opts.userAgent ?? 'TalariaSupportPassportGate/1.0',
    hardwareConcurrency: 4,
    onLine: true,
    ...(opts.browserRealistic
      ? {
          serviceWorker: { ready: Promise.resolve(null) },
          storage: { estimate: async () => ({ usage: 0, quota: 1 }) },
        }
      : {}),
  };
  const navigator = createTrackedRealmObject(navigatorSeed, accessTracker, 'navigator', proxyCache);
  const body = {
    appendChild: (node) => badges.push(node),
    dataset: createDatasetMap(),
    setAttribute() {},
    getAttribute: () => null,
  };
  const documentElement = {
    appendChild: (node) => badges.push(node),
    dataset: createDatasetMap(),
    setAttribute() {},
    getAttribute: () => null,
  };
  const document = createTrackedRealmObject({
    readyState: 'loading',
    visibilityState: 'visible',
    body,
    documentElement,
    cookie: '',
    addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: (id) => badges.find((node) => node.id === id) ?? null,
    createElement: () => ({
      style: {},
      dataset: createDatasetMap(),
      setAttribute() {},
      getAttribute: () => null,
    }),
    querySelector: (selector) => (selector.includes('indicator-performance') ? provider : consumer),
  }, accessTracker, 'document', proxyCache);
  const location = createTrackedRealmObject({
    href,
    protocol: 'https:',
    host: 'app.talaria.test',
    pathname: '/dashboard/support',
  }, accessTracker, 'location', proxyCache);
  const window = createTrackedRealmObject({
    document,
    dispatchEvent: (event) => events.push(event),
    console: { error() {} },
    location,
    navigator,
    sessionStorage,
    localStorage,
    performance,
  }, accessTracker, 'window', proxyCache);
  // Browser identity: globalThis === window. A gate where they differ hides globalThis.indexedDB.
  window.globalThis = window;
  window.window = window;
  window.self = window;
  const moduleObj = { exports: {} };
  // Bare identifiers resolve against the vm context, not window. Under browserRealistic,
  // install the APIs a dashboard page actually has so `typeof indexedDB !== "undefined"`
  // (R-M6-6) cannot discriminate the gate from production.
  const contextGlobals = browserRealistic
    ? {
        indexedDB: { open() { return null; } },
        caches: { open: async () => ({}) },
        requestIdleCallback: (fn) => { try { fn({ didTimeout: false, timeRemaining: () => 0 }); } catch { /* ignore */ } return 0; },
        matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
        BroadcastChannel: class { constructor() {} postMessage() {} close() {} addEventListener() {} },
      }
    : {};
  if (browserRealistic) {
    Object.assign(window, contextGlobals);
  }
  const context = vm.createContext({
    window,
    self: window,
    globalThis: window,
    document,
    navigator,
    performance,
    location,
    console: window.console,
    Date: RealmDate,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    setTimeout: (fn) => fn(),
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id) => {
      if (id === 'react') return reactStub();
      throw new Error(`supportUi.tsx required an unexpected module: ${id}`);
    },
    ...contextGlobals,
  });

  // Runtime boot may touch many host keys; fidelity tracking starts at supportUi eval.
  vm.runInContext(opts.runtimeSource, context, { filename: MODULE_PRESENCE_RUNTIME_RELATIVE_PATH });
  if (providerPresent) {
    vm.runInContext(opts.indicatorPerfSource, context, { filename: INDICATOR_PERFORMANCE_RELATIVE_PATH });
  }
  listeners.DOMContentLoaded?.();
  document.readyState = postBootReadyState;

  if (aliasOnly !== null) {
    const known = SUPPORT_PASSPORT_ALIASES.map((alias) => alias.global);
    if (!known.includes(aliasOnly)) {
      throw new Error(`aliasOnly must be one of ${known.join(', ')} — got ${aliasOnly}`);
    }
    for (const name of known) {
      if (name !== aliasOnly) delete window[name];
    }
    if (window[aliasOnly] === undefined) {
      throw new Error(`the runtime never published window.${aliasOnly}`);
    }
  }

  // Module-scope caches (R-M6-5 C1) run during eval — tracker must be armed here too.
  accessTracker.unknownReads.length = 0;
  accessTracker.enabled = true;
  try {
    vm.runInContext(
      transpileSupportUi({ typescript: opts.typescript, supportUiSource: opts.supportUiSource }),
      context,
      { filename: SUPPORT_UI_RELATIVE_PATH },
    );
  } finally {
    accessTracker.enabled = false;
  }
  const moduleEvalUnknownReads = [...accessTracker.unknownReads];

  const rawBuildSupportContext = moduleObj.exports?.buildSupportContext;
  if (typeof rawBuildSupportContext !== 'function') {
    throw new Error('supportUi.tsx did not export buildSupportContext');
  }
  const buildSupportContext = (...args) => {
    accessTracker.unknownReads.length = 0;
    accessTracker.enabled = true;
    try {
      return rawBuildSupportContext(...args);
    } finally {
      accessTracker.enabled = false;
    }
  };
  return {
    window,
    document,
    badges,
    events,
    buildSupportContext,
    clock,
    accessTracker,
    sessionStorage,
    localStorage,
    performance,
    moduleEvalUnknownReads,
  };
}

/* ---------------------------------------- *
 * Behavioural cells (soundness, VER-01).   *
 * ---------------------------------------- */

function redCell(cell, reason, coverage = 'soundness') {
  return {
    cell,
    coverage,
    ver: 'VER-01',
    status: 'RED',
    pass: false,
    reason,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/** Values crossing back from the vm realm carry that realm's Array.prototype. */
function hostArray(value) {
  return Array.isArray(value) ? Array.from(value) : value;
}

function cellResult(cell, pass, detail, coverage = 'soundness') {
  return {
    cell,
    coverage,
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    ...detail,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * Healthy runtime: the passport key exists and is an empty array, not an absent key and
 * not a scalar. This is the shape the support backend is entitled to receive.
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runPassportDegradedKeyAlwaysCell(deps) {
  try {
    const realm = createSupportPassportRealm({ ...deps, providerPresent: true });
    const runtimeModules = realm.window.__TALARIA_DEGRADED_STATE?.degradedModules;
    const ctx = realm.buildSupportContext();
    const value = ctx.degradedModules;
    const pass = Object.prototype.hasOwnProperty.call(ctx, 'degradedModules')
      && Array.isArray(value)
      && value.length === 0
      && Array.isArray(runtimeModules)
      && runtimeModules.length === 0;
    return cellResult('PASSPORT-DEGRADED-KEY-ALWAYS', pass, {
      runtimeModules: hostArray(runtimeModules),
      passportValue: hostArray(value),
      passportValueType: Array.isArray(value) ? 'array' : typeof value,
    });
  } catch (error) {
    return redCell('PASSPORT-DEGRADED-KEY-ALWAYS', String(error?.message ?? error));
  }
}

/**
 * Round trip: the runtime degrades itself (absent provider trips the tripwire) and then a
 * second module is marked through the product API. The expectation is READ BACK from the
 * runtime's own published list — nothing is injected into the realm, so the cell measures
 * runtime state reaching the passport rather than a literal echoing itself.
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runPassportDegradedRoundTripCell(deps) {
  try {
    const realm = createSupportPassportRealm({ ...deps, providerPresent: false });
    realm.window.__talariaMarkMissingModule('OrderOverlay');
    const runtimeModules = Array.from(realm.window.__TALARIA_DEGRADED_STATE.degradedModules);
    const ctx = realm.buildSupportContext();
    const passportModules = ctx.degradedModules;
    // A runtime that published nothing would make the comparison vacuously true.
    const runtimeDidDegrade = runtimeModules.length >= 2
      && runtimeModules.includes('IndicatorPerf')
      && runtimeModules.includes('OrderOverlay');
    const pass = runtimeDidDegrade
      && Array.isArray(passportModules)
      && JSON.stringify(passportModules) === JSON.stringify(runtimeModules);
    return cellResult('PASSPORT-DEGRADED-ROUND-TRIP', pass, {
      runtimeModules,
      passportModules: hostArray(passportModules),
      runtimeDidDegrade,
    });
  } catch (error) {
    return redCell('PASSPORT-DEGRADED-ROUND-TRIP', String(error?.message ?? error));
  }
}

/** Modules marked between the calls of the temporal cell, in order. */
export const TEMPORAL_DEGRADATION_SEQUENCE = ['OrderOverlay', 'AlertSystem'];

/**
 * The R-M6-2 carrier. Every other cell builds a realm and calls the extractor once, so a
 * passport computed on first use and cached for the lifetime of the page satisfies all of
 * them while losing every module that degrades after the first support ticket is opened.
 *
 * ONE realm. Call, degrade, call again, degrade again, call again. Each observation is
 * compared against the runtime's own list read immediately before that call, and the
 * sequence is required to actually advance (0 → 1 → 2 published modules) so a runtime that
 * never degraded could not make the comparison vacuously true.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
function runTemporalSequence(deps, { browserRealistic }) {
  const realm = createSupportPassportRealm({ ...deps, providerPresent: true, browserRealistic });
  const readRuntime = () => Array.from(realm.window.__TALARIA_DEGRADED_STATE.degradedModules);
  const runtimeSeen = [];
  const observed = [];
  const clockMarks = [];
  const unknownReads = [...(realm.moduleEvalUnknownReads ?? [])];
  const observe = () => {
    clockMarks.push(realm.clock.now());
    runtimeSeen.push(readRuntime());
    observed.push(hostArray(realm.buildSupportContext().degradedModules));
    unknownReads.push(...(realm.accessTracker?.unknownReads ?? []));
  };
  const readyStateAtTicket = realm.document.readyState;
  observe();
  for (const moduleId of TEMPORAL_DEGRADATION_SEQUENCE) {
    realm.clock.advance(TEMPORAL_CLOCK_ADVANCE_MS);
    realm.window.__talariaMarkMissingModule(moduleId);
    observe();
  }
  return {
    realm,
    runtimeSeen,
    observed,
    clockMarks,
    unknownReads,
    readyStateAtTicket,
    browserRealistic,
    hasServiceWorker: realm.window.navigator.serviceWorker != null,
    hasIndexedDB: realm.window.indexedDB != null,
  };
}

export function runPassportDegradedTemporalCell(deps) {
  try {
    // Dual environment (R-M6-6): a cache gated on a falsy-modelled own key or a bare
    // `typeof indexedDB` stays dead under the sparse realm and live under a browser-shaped
    // one. Both profiles must produce the same passport sequence.
    const sparse = runTemporalSequence(deps, { browserRealistic: false });
    const browser = runTemporalSequence(deps, { browserRealistic: true });

    const runtimeAdvanced = sparse.runtimeSeen.every((list, i) => list.length === i)
      && TEMPORAL_DEGRADATION_SEQUENCE.every((id, i) => sparse.runtimeSeen[i + 1].includes(id));
    const trackedRuntime = sparse.observed.every(
      (list, i) => Array.isArray(list) && JSON.stringify(list) === JSON.stringify(sparse.runtimeSeen[i]),
    );
    const laterCallsSawNewModules = TEMPORAL_DEGRADATION_SEQUENCE.every(
      (id, i) => Array.isArray(sparse.observed[i + 1]) && sparse.observed[i + 1].includes(id),
    );
    const clockAdvancedBetweenTickets = sparse.clockMarks.length === sparse.observed.length
      && sparse.clockMarks.every((mark, i) => (
        i === 0 || mark - sparse.clockMarks[i - 1] >= TEMPORAL_CLOCK_ADVANCE_MS
      ));
    const realmLooksLikePostLoad = sparse.readyStateAtTicket === 'complete'
      && browser.readyStateAtTicket === 'complete';
    const noUnmodelledReads = sparse.unknownReads.length === 0;
    // Browser profile may touch more keys during eval of injected APIs; require the
    // passport *observations* match, not identical unknown-read sets.
    const environmentsAgree = JSON.stringify(sparse.observed) === JSON.stringify(browser.observed)
      && JSON.stringify(sparse.runtimeSeen) === JSON.stringify(browser.runtimeSeen);
    const browserProfileArmed = browser.hasServiceWorker === true;
    const pass = runtimeAdvanced
      && trackedRuntime
      && laterCallsSawNewModules
      && clockAdvancedBetweenTickets
      && realmLooksLikePostLoad
      && noUnmodelledReads
      && environmentsAgree
      && browserProfileArmed;

    return cellResult('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE', pass, {
      calls: sparse.observed.length,
      runtimeSeen: sparse.runtimeSeen,
      observed: sparse.observed,
      browserObserved: browser.observed,
      runtimeAdvanced,
      trackedRuntime,
      laterCallsSawNewModules,
      readyStateAtTicket: sparse.readyStateAtTicket,
      realmLooksLikePostLoad,
      clockMarks: sparse.clockMarks,
      clockAdvancedBetweenTickets,
      clockAdvanceMs: TEMPORAL_CLOCK_ADVANCE_MS,
      unknownReads: sparse.unknownReads,
      noUnmodelledReads,
      environmentsAgree,
      browserProfileArmed,
    });
  } catch (error) {
    return redCell('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE', String(error?.message ?? error));
  }
}

/**
 * Construction-level realm fidelity: buildSupportContext must not read window/document
 * properties the realm does not model. An unmodelled API is how R-M6-4 kept the gate GREEN
 * while a browser with sessionStorage lost every later ticket.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runPassportDegradedRealmFidelityCell(deps) {
  const cell = 'PASSPORT-DEGRADED-REALM-FIDELITY';
  try {
    const realm = createSupportPassportRealm({ ...deps, providerPresent: true });
    // Run the temporal sequence so cache-hit-path reads are observed (R-M6-5).
    const unknownReads = [...(realm.moduleEvalUnknownReads ?? [])];
    realm.buildSupportContext();
    unknownReads.push(...(realm.accessTracker?.unknownReads ?? []));
    realm.clock.advance(TEMPORAL_CLOCK_ADVANCE_MS);
    realm.window.__talariaMarkMissingModule('OrderOverlay');
    realm.buildSupportContext();
    unknownReads.push(...(realm.accessTracker?.unknownReads ?? []));
    // Non-vacuity: the modelled surfaces R-M6-4/5 carriers used must actually exist.
    const modelledSurfacesPresent = realm.window.sessionStorage != null
      && realm.window.localStorage != null
      && typeof realm.window.performance?.now === 'function'
      && Number.isFinite(realm.window.performance?.timeOrigin)
      && realm.document.visibilityState === 'visible'
      && realm.document.readyState === 'complete'
      && realm.document.body?.dataset != null
      && realm.window.globalThis === realm.window
      && realm.window.location?.protocol === 'https:';
    const pass = unknownReads.length === 0 && modelledSurfacesPresent;
    return cellResult(cell, pass, {
      unknownReads,
      modelledSurfacesPresent,
      readyState: realm.document.readyState,
      visibilityState: realm.document.visibilityState,
      performanceNow: realm.window.performance.now(),
      performanceTimeOrigin: realm.window.performance.timeOrigin,
      globalThisIsWindow: realm.window.globalThis === realm.window,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
  }
}

/**
 * One alias, booted alone. The realm deletes the other two globals before supportUi is
 * evaluated, so the real function has to consult *this* alias or come back empty. That
 * turns each alias from a substring pin (which the prefix alias made unfalsifiable) into a
 * behavioural fact; NC-ALIAS-DROP-* shows this cell is its sole detector.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 * @param {(typeof SUPPORT_PASSPORT_ALIASES)[number]} alias
 */
export function runPassportDegradedAliasBootCell(deps, alias) {
  try {
    const realm = createSupportPassportRealm({
      ...deps,
      providerPresent: false,
      aliasOnly: alias.global,
    });
    realm.window.__talariaMarkMissingModule('OrderOverlay');
    const published = realm.window[alias.global];
    const runtimeModules = Array.from(published.degradedModules);
    const passportModules = realm.buildSupportContext().degradedModules;

    const otherAliasesAbsent = SUPPORT_PASSPORT_ALIASES
      .filter((other) => other.global !== alias.global)
      .every((other) => realm.window[other.global] === undefined);
    // Non-vacuity: an alias that published nothing proves nothing about reading it.
    const runtimeDidDegrade = runtimeModules.length >= 2
      && runtimeModules.includes('IndicatorPerf')
      && runtimeModules.includes('OrderOverlay');
    const pass = otherAliasesAbsent
      && runtimeDidDegrade
      && Array.isArray(passportModules)
      && JSON.stringify(hostArray(passportModules)) === JSON.stringify(runtimeModules);

    return cellResult(alias.cell, pass, {
      alias: alias.id,
      aliasGlobal: alias.global,
      otherAliasesAbsent,
      runtimeDidDegrade,
      runtimeModules,
      passportModules: hostArray(passportModules),
    });
  } catch (error) {
    return redCell(alias.cell, String(error?.message ?? error));
  }
}

/** Ids a hostile or legacy publisher might place on the shared global. */
export const REJECTED_DEGRADED_ID_SAMPLES = ['<script>', '', 'a'.repeat(80), '9leading'];
const OVERFLOW_VALID_ID_COUNT = MAX_PASSPORT_DEGRADED_MODULES + 9;

/**
 * Bounding properties, asserted against the real function's output rather than against a
 * second implementation: output ⊆ input, no duplicates, no junk, and — the property that
 * a silently-emptying passport cannot satisfy — the cap is reached exactly.
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runPassportDegradedBoundingPropertiesCell(deps) {
  try {
    const realm = createSupportPassportRealm({ ...deps, providerPresent: true });
    const published = realm.window.__TALARIA_DEGRADED_STATE.degradedModules;
    const validIds = [];
    for (let i = 0; i < OVERFLOW_VALID_ID_COUNT; i += 1) validIds.push(`Mod${i}`);
    // Written straight onto the runtime's published array: the passport is the last line
    // of defence when some other publisher mutates the shared global. Junk and the repeat
    // both sit ahead of the cap, so a cap that binds cannot hide a filter that does not.
    published.push(
      ...REJECTED_DEGRADED_ID_SAMPLES, 42, null, {},
      ...validIds.slice(0, 3), validIds[0], ...validIds.slice(3),
    );
    const modules = realm.buildSupportContext().degradedModules;

    const isArray = Array.isArray(modules);
    const inputSet = new Set(published.filter((v) => typeof v === 'string'));
    const subset = isArray && modules.every((id) => inputSet.has(id));
    const deduped = isArray && new Set(modules).size === modules.length;
    const junkRejected = isArray
      && REJECTED_DEGRADED_ID_SAMPLES.every((junk) => !modules.includes(junk));
    const patternHeld = isArray && modules.every((id) => DEGRADED_MODULE_ID_PATTERN.test(id));
    // OVERFLOW_VALID_ID_COUNT unique valid ids were offered: the cap must bind exactly.
    const capExact = isArray && modules.length === MAX_PASSPORT_DEGRADED_MODULES;
    const pass = isArray && subset && deduped && junkRejected && patternHeld && capExact;

    return cellResult('PASSPORT-DEGRADED-BOUNDING-PROPERTIES', pass, {
      offeredValidUnique: OVERFLOW_VALID_ID_COUNT,
      properties: { isArray, subset, deduped, junkRejected, patternHeld, capExact },
      passportLength: isArray ? modules.length : null,
    });
  } catch (error) {
    return redCell('PASSPORT-DEGRADED-BOUNDING-PROPERTIES', String(error?.message ?? error));
  }
}

/**
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runBehavioralCells(deps) {
  return [
    runPassportDegradedKeyAlwaysCell(deps),
    runPassportDegradedRoundTripCell(deps),
    runPassportDegradedBoundingPropertiesCell(deps),
    runPassportDegradedTemporalCell(deps),
    runPassportDegradedRealmFidelityCell(deps),
    ...SUPPORT_PASSPORT_ALIASES.map((alias) => runPassportDegradedAliasBootCell(deps, alias)),
  ];
}

/* ------------------------------------------------------------ *
 * Negative controls: behavioural mutants of the real product.  *
 * ------------------------------------------------------------ */

const MEMOIZED_PASSPORT_HEADER =
  'export function buildSupportContext(): Record<string, string | string[]> {';
const MEMOIZED_PASSPORT_TAIL = '  return ctx;\n}';

/**
 * Each mutant edits supportUi.tsx into a plausible regression and the whole behavioural
 * suite is re-run against it. A mutant that no cell turns RED is a hole in the gate, not a
 * passing test. `apply` returns null when the pattern it targets is gone — a mutant that
 * silently fails to apply would otherwise report a false kill.
 */
export const SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS = [
  {
    id: 'M1',
    name: 'NC-MUTANT-CAP-ZERO',
    describes: 'passport cap collapses to zero (.slice(0, 32) -> .slice(0, 0))',
    apply: (src) => (src.includes('.slice(0, 32)')
      ? src.replace('.slice(0, 32)', '.slice(0, 0)')
      : null),
  },
  {
    id: 'M2',
    name: 'NC-MUTANT-DECOY-REGEX',
    describes: 'bounded-id regex swapped for a permissive decoy that still looks like a filter',
    apply: (src) => (src.includes('/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/')
      ? src.replace('/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/', '/[A-Za-z]/')
      : null),
  },
  {
    id: 'M3',
    name: 'NC-MUTANT-POST-ASSIGNMENT-CLEAR',
    describes: 'passport is rebuilt correctly and then cleared before it is returned',
    apply: (src) => (src.includes(MEMOIZED_PASSPORT_TAIL)
      ? src.replace(MEMOIZED_PASSPORT_TAIL, '  ctx.degradedModules = [];\n  return ctx;\n}')
      : null),
  },
  {
    id: 'M4',
    name: 'NC-MUTANT-DEDUPE-DROP',
    describes: 'Set-based dedupe removed, so a repeated module id is reported twice',
    apply: (src) => (src.includes('[...new Set(')
      ? src.replace('new Set(', '(')
      : null),
  },
  {
    id: 'M5',
    name: 'NC-MUTANT-ARRAY-STRING-COERCION',
    describes: 'array coerced to a joined string — the client-side twin of the api_server finding',
    apply: (src) => (src.includes('))].slice(0, 32)')
      ? src.replace('))].slice(0, 32)', '))].slice(0, 32).join(",")')
      : null),
  },
  {
    id: 'M6',
    name: 'NC-MUTANT-MEMOIZED-PASSPORT',
    describes:
      'context cached at module scope once document.readyState === "complete" — the R-M6-3 '
      + 'carrier that stayed GREEN while the realm was permanently "loading"',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null && document.readyState === "complete") return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = ctx;\n  return ctx;\n}');
    },
  },
  {
    id: 'M7',
    name: 'NC-MUTANT-MEMOIZED-AFTER-WARMUP',
    describes:
      'context cached after a 30s session warm-up (Date.now() - boot) — invisible when temporal '
      + 'calls land within one millisecond of each other',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'const __passportBoot = Date.now();\n'
          + 'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null && Date.now() - __passportBoot > 30_000) return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = ctx;\n  return ctx;\n}');
    },
  },
  {
    id: 'M8',
    name: 'NC-MUTANT-SESSION-STORAGE-CACHE',
    describes:
      'context cached in sessionStorage — the R-M6-4 primary carrier that stayed GREEN while '
      + 'the realm had no storage API',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  const __sk = "__talaria_support_ctx";\n'
          + '  try {\n'
          + '    const __raw = window.sessionStorage?.getItem(__sk);\n'
          + '    if (__raw) return JSON.parse(__raw);\n'
          + '  } catch { /* ignore */ }\n',
        )
        .replace(
          MEMOIZED_PASSPORT_TAIL,
          '  try { window.sessionStorage?.setItem(__sk, JSON.stringify(ctx)); } catch { /* ignore */ }\n'
          + '  return ctx;\n}',
        );
    },
  },
  {
    id: 'M9',
    name: 'NC-MUTANT-PERFORMANCE-NOW-WARMUP',
    describes:
      'warm-up cache keyed on performance.now() — Date.now controllability does not touch it',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'const __passportBootPerf = typeof performance !== "undefined" && performance.now '
          + '? performance.now() : 0;\n'
          + 'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  const __now = typeof performance !== "undefined" && performance.now '
          + '? performance.now() : 0;\n'
          + '  if (__passportCache !== null && __now - __passportBootPerf > 30_000) return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = ctx;\n  return ctx;\n}');
    },
  },
  {
    id: 'M10',
    name: 'NC-MUTANT-UNMODELLED-API-READ',
    describes:
      'reads window.indexedDB (unmodelled) — must trip REALM-FIDELITY rather than stay silent',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER)) return null;
      return src.replace(
        MEMOIZED_PASSPORT_HEADER,
        `${MEMOIZED_PASSPORT_HEADER}\n  void (window as any).indexedDB;\n`,
      );
    },
  },
  {
    id: 'M11',
    name: 'NC-MUTANT-PERFORMANCE-TIMEORIGIN-WARMUP',
    describes:
      'warm-up keyed on performance.timeOrigin — the R-M6-5 sibling of the modelled performance.now',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null && Date.now() - performance.timeOrigin > 30_000) '
          + 'return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = ctx;\n  return ctx;\n}');
    },
  },
  {
    id: 'M12',
    name: 'NC-MUTANT-BODY-DATASET-CACHE',
    describes:
      'passport stashed on document.body.dataset — depth-2 store that hid behind modelled body',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  try {\n'
          + '    const __raw = document.body?.dataset?.talariaSupportCtx;\n'
          + '    if (__raw) return JSON.parse(__raw);\n'
          + '  } catch { /* ignore */ }\n',
        )
        .replace(
          MEMOIZED_PASSPORT_TAIL,
          '  try {\n'
          + '    if (document.body?.dataset) {\n'
          + '      document.body.dataset.talariaSupportCtx = JSON.stringify(ctx);\n'
          + '    }\n'
          + '  } catch { /* ignore */ }\n'
          + '  return ctx;\n}',
        );
    },
  },
  {
    id: 'M13',
    name: 'NC-MUTANT-SERVICE-WORKER-GATED-CACHE',
    describes:
      'module-scope cache gated on navigator.serviceWorker — dead under falsy own undefined, '
      + 'live under browserRealistic (R-M6-6 primary carrier)',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null && (navigator as any).serviceWorker) return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = ctx;\n  return ctx;\n}');
    },
  },
];

/**
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runBehavioralMutantCells(deps) {
  return SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS.map((mutant) => {
    const mutatedSource = mutant.apply(deps.supportUiSource);
    if (mutatedSource === null || mutatedSource === deps.supportUiSource) {
      return {
        cell: mutant.name,
        mutant: mutant.id,
        coverage: 'soundness',
        ver: 'VER-01',
        status: 'RED',
        pass: false,
        reason: 'mutant did not apply — its target no longer exists in supportUi.tsx',
        signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
      };
    }
    const cells = runBehavioralCells({ ...deps, supportUiSource: mutatedSource });
    const killedBy = cells.filter((c) => c.pass === false).map((c) => c.cell);
    const pass = killedBy.length > 0;
    return {
      cell: mutant.name,
      mutant: mutant.id,
      coverage: 'soundness',
      ver: 'VER-01',
      status: pass ? 'GREEN' : 'RED',
      pass,
      describes: mutant.describes,
      killedBy,
      survivedCells: cells.filter((c) => c.pass !== false).map((c) => c.cell),
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    };
  });
}

/* --------------------------------------------------------------------- *
 * Negative controls: one alias at a time removed from the real product. *
 * --------------------------------------------------------------------- */

/**
 * Matches the line on which supportUi.tsx reads one alias, with its optional trailing `??`.
 * Anchoring on end-of-token is what makes the *canonical* alias falsifiable: as a bare
 * substring `window.__TALARIA_DEGRADED_STATE` is a prefix of `..._STATE__` and could never
 * go missing, which is the unfalsifiable pin R-M6-2 rejected.
 */
function aliasLinePattern(globalName) {
  return new RegExp(`^[ \\t]*window\\.${escapeRegExp(globalName)}[ \\t]*(?:\\?\\?)?[ \\t]*\\n`, 'gm');
}

export function countAliasLines(source, globalName) {
  return [...source.matchAll(aliasLinePattern(globalName))].length;
}

/**
 * Removes exactly one alias from the read in supportUi.tsx. Dropping the last alias in the
 * chain has to take the preceding `??` with it, or the edit is a syntax error rather than a
 * regression. Returns null when the target is not uniquely present, so a mutation that
 * cannot be aimed reports RED instead of a false kill.
 *
 * @param {string} source
 * @param {number} index index into SUPPORT_PASSPORT_ALIASES
 * @returns {string | null}
 */
export function dropAliasFromSupportUi(source, index) {
  const alias = SUPPORT_PASSPORT_ALIASES[index];
  if (!alias || countAliasLines(source, alias.global) !== 1) return null;
  const withoutAlias = source.replace(aliasLinePattern(alias.global), '');
  if (index !== SUPPORT_PASSPORT_ALIASES.length - 1) return withoutAlias;

  const previous = SUPPORT_PASSPORT_ALIASES[index - 1];
  if (!previous || countAliasLines(withoutAlias, previous.global) !== 1) return null;
  return withoutAlias.replace(
    aliasLinePattern(previous.global),
    (line) => line.replace(/[ \t]*\?\?[ \t]*\n$/, '\n'),
  );
}

/**
 * For each alias: delete it from the real product source and require that its own boot cell
 * is the *only* thing that notices. RED-everywhere would mean the cells are not separating
 * the aliases; GREEN-everywhere would mean the alias is decoration. This asymmetry is what
 * the deleted source pins used to claim and could not prove.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runNcAliasDropCells(deps) {
  return SUPPORT_PASSPORT_ALIASES.map((alias, index) => {
    const cell = `NC-ALIAS-DROP-${alias.id.toUpperCase()}`;
    const mutated = dropAliasFromSupportUi(deps.supportUiSource, index);
    if (mutated === null || mutated === deps.supportUiSource) {
      return redCell(
        cell,
        `window.${alias.global} is not uniquely present in supportUi.tsx — the alias drop `
        + 'could not be aimed, so its detector is unproven',
        'wiring',
      );
    }
    let cells;
    try {
      cells = runBehavioralCells({ ...deps, supportUiSource: mutated });
    } catch (error) {
      return redCell(cell, String(error?.message ?? error), 'wiring');
    }
    const target = cells.find((c) => c.cell === alias.cell);
    const others = cells.filter((c) => c.cell !== alias.cell);
    const detectorWentRed = target?.pass === false;
    const collateral = others.filter((c) => c.pass !== true).map((c) => c.cell);
    const pass = detectorWentRed && collateral.length === 0;
    return cellResult(cell, pass, {
      alias: alias.id,
      aliasGlobal: alias.global,
      detectorCell: alias.cell,
      detectorWentRed,
      collateralRedCells: collateral,
    }, 'wiring');
  });
}

/* ------------------------------------------------------------------ *
 * Consumer wiring: the passport has to be on a real send path.       *
 * ------------------------------------------------------------------ */

function calleeName(ts, expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/**
 * Name of the nearest function/arrow binding that encloses `node`, or null when the call
 * sits at module or component-body scope (including inside a useMemo callback whose
 * binding is anonymous).
 * @param {any} ts
 * @param {any} node
 */
export function enclosingFunctionBindingName(ts, node) {
  let cur = node.parent;
  while (cur) {
    if ((ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur))
      && cur.name && ts.isIdentifier(cur.name)) {
      return cur.name.text;
    }
    if (ts.isFunctionExpression(cur) && cur.name && ts.isIdentifier(cur.name)) {
      return cur.name.text;
    }
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const parent = cur.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * True when `node` is nested under a `useMemo(...)` call — the R-M6-3 hoist that freezes
 * the passport at mount while leaving a CallExpression in the file.
 * @param {any} ts
 * @param {any} node
 */
export function isInsideUseMemoCall(ts, node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur) && calleeName(ts, cur.expression) === 'useMemo') return true;
    cur = cur.parent;
  }
  return false;
}

function propertyNameText(ts, name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

/**
 * True when `binding` is used as the request `context` payload inside `scope`
 * (property `context: binding`, or FormData.append("context", JSON.stringify(binding))).
 */
export function identifierReachesContextPayload(ts, scope, binding) {
  let reaches = false;
  const visit = (node) => {
    if (reaches) return;
    if (ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)
      || ts.isShorthandPropertyAssignment(node)) {
      const prop = ts.isShorthandPropertyAssignment(node)
        ? (ts.isIdentifier(node.name) ? node.name.text : null)
        : propertyNameText(ts, node.name);
      if (prop === 'context') {
        if (ts.isShorthandPropertyAssignment(node) && node.name.text === binding) {
          reaches = true;
          return;
        }
        if (node.initializer && ts.isIdentifier(node.initializer)
          && node.initializer.text === binding) {
          reaches = true;
          return;
        }
      }
    }
    if (ts.isCallExpression(node) && calleeName(ts, node.expression) === 'append'
      && node.arguments.length >= 2
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === 'context') {
      const arg = node.arguments[1];
      if (ts.isIdentifier(arg) && arg.text === binding) {
        reaches = true;
        return;
      }
      if (ts.isCallExpression(arg) && calleeName(ts, arg.expression) === 'stringify'
        && arg.arguments[0] && ts.isIdentifier(arg.arguments[0])
        && arg.arguments[0].text === binding) {
        reaches = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return reaches;
}

function enclosingFunctionNode(ts, node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur)
      || ts.isArrowFunction(cur) || ts.isMethodDeclaration(cur)) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * True when the CallExpression's result reaches the support request `context` field —
 * either directly (`context: buildSupportContext()`) or via a const binding that is then
 * placed on that field. A call whose result is frozen into a session snapshot and never
 * sent is the R-M6-4 value-flow hole.
 */
export function callResultReachesContextPayload(ts, callNode) {
  const parent = callNode.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))
    && propertyNameText(ts, parent.name) === 'context') {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.initializer === callNode) {
    const binding = parent.name.text;
    const scope = enclosingFunctionNode(ts, callNode);
    return scope ? identifierReachesContextPayload(ts, scope, binding) : false;
  }
  return false;
}

/**
 * True when the enclosing submit handler reassigns `*.context` or `*.degradedModules`
 * after the passport call — the R-M6-5 carrier that left the pin GREEN while overwriting
 * the payload one statement later.
 */
export function hasContextReassignmentAfterCall(ts, callNode) {
  const scope = enclosingFunctionNode(ts, callNode);
  if (!scope) return false;
  const callPos = callNode.getStart();
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (node.getStart && node.getStart() > callPos) {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isPropertyAccessExpression(node.left)) {
          const name = node.left.name.text;
          if (name === 'context' || name === 'degradedModules') {
            found = true;
            return;
          }
        }
        // payload["context"] = ...
        if (ts.isElementAccessExpression(node.left)
          && ts.isStringLiteral(node.left.argumentExpression)
          && (node.left.argumentExpression.text === 'context'
            || node.left.argumentExpression.text === 'degradedModules')) {
          found = true;
          return;
        }
      }
      // Object.assign(payload, { context: snap })
      if (ts.isCallExpression(node) && calleeName(ts, node.expression) === 'assign'
        && node.arguments.length >= 2) {
        const patch = node.arguments[1];
        if (ts.isObjectLiteralExpression(patch)
          && patch.properties.some((prop) => {
            if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              return propertyNameText(ts, prop.name) === 'context';
            }
            return false;
          })) {
          found = true;
          return;
        }
      }
      // arr.splice(...) on degradedModules binding — treat as mutation of the passport list
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'splice'
        && ts.isPropertyAccessExpression(node.expression.expression)
        && node.expression.expression.name.text === 'degradedModules') {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

/**
 * Counts real call sites of `buildSupportContext` by walking the TypeScript AST. A pin on
 * the AST cannot be paid by a comment, a string, a template literal, a regex literal or
 * JSX text, because none of those parse to a CallExpression — the decoy classes that a
 * substring scanner has to chase are structurally excluded here, and
 * NC-CONSUMER-PIN-DECOYS demonstrates it rather than asserting it.
 *
 * W43: a call that merely exists in the file is not enough. The passport must be invoked
 * from the submit handler (`createThread`) and must not sit inside `useMemo`, or every
 * later ticket from that mount carries the first ticket's snapshot.
 *
 * W44: the call's result must also reach the request `context` payload (value-flow).
 *
 * @param {{ typescript: any, relativePath: string, source: string }} opts
 */
export function inspectConsumerCallPath({ typescript: ts, relativePath, source }) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  const callSites = [];
  let importsFromSupportUi = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /(^|\/)supportUi$/.test(node.moduleSpecifier.text)) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        importsFromSupportUi = named.elements.some(
          (element) => element.name.text === SUPPORT_PASSPORT_CONSUMER_EXPORT,
        );
      }
    }
    if (ts.isCallExpression(node)) {
      const name = calleeName(ts, node.expression);
      if (name === SUPPORT_PASSPORT_CONSUMER_EXPORT) {
        const enclosingFunction = enclosingFunctionBindingName(ts, node);
        const insideUseMemo = isInsideUseMemoCall(ts, node);
        const onSubmitHandler = SUPPORT_PASSPORT_SUBMIT_HANDLER_NAMES.includes(enclosingFunction)
          && !insideUseMemo;
        const valueReachesContext = callResultReachesContextPayload(ts, node);
        const contextReassignedAfter = hasContextReassignmentAfterCall(ts, node);
        callSites.push({
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          enclosingFunction,
          insideUseMemo,
          onSubmitHandler,
          valueReachesContext,
          contextReassignedAfter,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  const callLines = callSites.map((site) => site.line);
  const submitHandlerCallCount = callSites.filter((site) => site.onSubmitHandler).length;
  const valueFlowCallCount = callSites.filter(
    (site) => site.onSubmitHandler && site.valueReachesContext && !site.contextReassignedAfter,
  ).length;

  return {
    relativePath,
    importsFromSupportUi,
    callCount: callSites.length,
    callLines,
    callSites,
    submitHandlerCallCount,
    valueFlowCallCount,
    statements: sourceFile.statements.length,
    parseErrors: (sourceFile.parseDiagnostics ?? []).length,
  };
}

function consumerSource(deps, consumer) {
  const source = deps.consumerSources?.[consumer.relativePath];
  return typeof source === 'string' ? normalizeLineEndings(source) : null;
}

/**
 * The passport only matters if something sends it. Deleting the `buildSupportContext()`
 * call from a consumer is an edit no behavioural cell can see — the extractor still works
 * perfectly, and no support ticket carries a degraded module ever again.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0] & { consumerSources: Record<string, string> }} deps
 */
export function runConsumerCallPathCell(deps) {
  const cell = 'SUPPORT-PASSPORT-CONSUMER-CALL-PATH';
  try {
    const consumers = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, relativePath: consumer.relativePath, readable: false, wired: false };
      }
      const facts = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source,
      });
      return {
        id: consumer.id,
        readable: true,
        wired: facts.importsFromSupportUi
          && facts.submitHandlerCallCount >= 1
          && facts.valueFlowCallCount >= 1,
        ...facts,
      };
    });
    const pass = consumers.length > 0 && consumers.every((c) => c.wired);
    return cellResult(cell, pass, {
      consumers,
      unwiredConsumers: consumers.filter((c) => !c.wired).map((c) => c.id),
    }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/** Deletes every call site while leaving the import in place — the realistic regression. */
function deleteConsumerCall(source) {
  const call = `${SUPPORT_PASSPORT_CONSUMER_EXPORT}()`;
  return source.includes(call) ? source.split(call).join('{}') : null;
}

/**
 * Hoists the passport into `React.useMemo(..., [])` at component body scope and replaces
 * the submit-handler call with the frozen binding — the R-M6-3 carrier that left
 * callCount === 1 while every later ticket carried the mount-time snapshot.
 * @param {string} source
 */
export function hoistConsumerCallToUseMemo(source) {
  if (!source.includes(`${SUPPORT_PASSPORT_CONSUMER_EXPORT}()`)) return null;
  if (!source.includes('const createThread')) return null;
  let next = source
    .replace(/context:\s*buildSupportContext\(\)/g, 'context: supportContext')
    .replace(/const ctx = buildSupportContext\(\);/g, 'const ctx = supportContext;');
  if (next === source) return null;
  if (next.includes('React.useMemo(() => buildSupportContext()')) return null;
  next = next.replace(
    /(\n\s*)const createThread = /,
    `$1const supportContext = React.useMemo(() => ${SUPPORT_PASSPORT_CONSUMER_EXPORT}(), []);$1const createThread = `,
  );
  return next.includes('React.useMemo(() => buildSupportContext()') ? next : null;
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerCallDeletedCell(deps) {
  const cell = 'NC-CONSUMER-CALL-DELETED';
  try {
    const results = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'consumer source unreadable' };
      }
      const mutated = deleteConsumerCall(source);
      if (mutated === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'no call site to delete' };
      }
      const mutatedCell = runConsumerCallPathCell({
        ...deps,
        consumerSources: { ...deps.consumerSources, [consumer.relativePath]: mutated },
      });
      const facts = mutatedCell.consumers?.find((c) => c.id === consumer.id);
      return {
        id: consumer.id,
        applied: true,
        wentRed: mutatedCell.pass === false
          && facts?.callCount === 0
          && facts?.submitHandlerCallCount === 0,
        // The import survives the edit: the pin must key on the call, not on the import.
        importSurvived: facts?.importsFromSupportUi === true,
      };
    });
    const pass = results.length > 0 && results.every((r) => r.applied && r.wentRed && r.importSurvived);
    return cellResult(cell, pass, { results }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerCallHoistedUseMemoCell(deps) {
  const cell = 'NC-CONSUMER-CALL-HOISTED-USEMEMO';
  try {
    const results = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'consumer source unreadable' };
      }
      const mutated = hoistConsumerCallToUseMemo(source);
      if (mutated === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'hoist could not be applied' };
      }
      const baseline = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source,
      });
      const facts = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source: mutated,
      });
      const mutatedCell = runConsumerCallPathCell({
        ...deps,
        consumerSources: { ...deps.consumerSources, [consumer.relativePath]: mutated },
      });
      return {
        id: consumer.id,
        applied: true,
        // The R-M6-3 hole: callCount stays ≥1, import intact, but the submit handler is gone.
        callCountSurvived: facts.callCount >= 1,
        importSurvived: facts.importsFromSupportUi === true,
        submitHandlerLost: facts.submitHandlerCallCount === 0
          && baseline.submitHandlerCallCount >= 1,
        wentRed: mutatedCell.pass === false
          && facts.submitHandlerCallCount === 0
          && facts.callCount >= 1
          && facts.importsFromSupportUi === true,
      };
    });
    const pass = results.length > 0 && results.every(
      (r) => r.applied && r.wentRed && r.callCountSurvived && r.importSurvived && r.submitHandlerLost,
    );
    return cellResult(cell, pass, { results }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/**
 * Freezes the passport one line downstream of the call — callCount and submit-handler
 * ancestry survive, but the request `context` field no longer receives the call result.
 * @param {string} source
 */
export function freezeConsumerValueAfterCall(source) {
  if (source.includes('context: buildSupportContext()')) {
    return source
      .replace(
        /(\n\s*)const createThread = /,
        '$1let __passportSnap: ReturnType<typeof buildSupportContext> | null = null;$1const createThread = ',
      )
      .replace(
        /context:\s*buildSupportContext\(\)/g,
        'context: (__passportSnap ?? (__passportSnap = buildSupportContext()))',
      );
  }
  if (source.includes('const ctx = buildSupportContext();')) {
    return source
      .replace(
        /(\n\s*)const createThread = /,
        '$1let __passportSnap: ReturnType<typeof buildSupportContext> | null = null;$1const createThread = ',
      )
      .replace(
        /const ctx = buildSupportContext\(\);/g,
        'const ctx = (__passportSnap ?? (__passportSnap = buildSupportContext()));',
      );
  }
  return null;
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerValueFrozenCell(deps) {
  const cell = 'NC-CONSUMER-VALUE-FROZEN';
  try {
    const results = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'consumer source unreadable' };
      }
      const mutated = freezeConsumerValueAfterCall(source);
      if (mutated === null || mutated === source) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'value freeze could not be applied' };
      }
      const baseline = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source,
      });
      const facts = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source: mutated,
      });
      const mutatedCell = runConsumerCallPathCell({
        ...deps,
        consumerSources: { ...deps.consumerSources, [consumer.relativePath]: mutated },
      });
      return {
        id: consumer.id,
        applied: true,
        // R-M6-4 hole: call still in createThread, import intact, but value-flow is broken.
        callCountSurvived: facts.callCount >= 1,
        submitHandlerSurvived: facts.submitHandlerCallCount >= 1,
        importSurvived: facts.importsFromSupportUi === true,
        valueFlowLost: facts.valueFlowCallCount === 0 && baseline.valueFlowCallCount >= 1,
        wentRed: mutatedCell.pass === false
          && facts.valueFlowCallCount === 0
          && facts.submitHandlerCallCount >= 1
          && facts.importsFromSupportUi === true,
      };
    });
    const pass = results.length > 0 && results.every(
      (r) => r.applied && r.wentRed && r.callCountSurvived && r.submitHandlerSurvived
        && r.importSurvived && r.valueFlowLost,
    );
    return cellResult(cell, pass, { results }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/**
 * Leaves `context: buildSupportContext()` byte-identical, then overwrites the payload
 * field one statement later — the R-M6-5 carrier.
 * @param {string} source
 */
export function reassignConsumerContextAfterPayload(source) {
  if (source.includes('context: buildSupportContext()')) {
    const marker = 'context: buildSupportContext(),';
    if (!source.includes(marker)) return null;
    // Insert reassignment after the payload object closes — match the SupportInbox shape.
    const replaced = source.replace(
      /(context: buildSupportContext\(\),[\s\S]*?\n\s*\};)/,
      '$1\n    if (!(globalThis as any).__talariaSupportSnap) {\n'
      + '      (globalThis as any).__talariaSupportSnap = (payload as { context: unknown }).context;\n'
      + '    }\n'
      + '    (payload as { context: unknown }).context = (globalThis as any).__talariaSupportSnap;',
    );
    return replaced === source ? null : replaced;
  }
  if (source.includes('const ctx = buildSupportContext();')) {
    const replaced = source.replace(
      /const ctx = buildSupportContext\(\);/,
      'const ctx = buildSupportContext();\n'
      + '    if (!(globalThis as any).__talariaSupportSnap) {\n'
      + '      (globalThis as any).__talariaSupportSnap = ctx.degradedModules;\n'
      + '    }\n'
      + '    ctx.degradedModules = (globalThis as any).__talariaSupportSnap;',
    );
    return replaced === source ? null : replaced;
  }
  return null;
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerContextReassignedCell(deps) {
  const cell = 'NC-CONSUMER-CONTEXT-REASSIGNED';
  try {
    const results = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'consumer source unreadable' };
      }
      const mutated = reassignConsumerContextAfterPayload(source);
      if (mutated === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'reassignment could not be applied' };
      }
      const baseline = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source,
      });
      const facts = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source: mutated,
      });
      const mutatedCell = runConsumerCallPathCell({
        ...deps,
        consumerSources: { ...deps.consumerSources, [consumer.relativePath]: mutated },
      });
      const reassigned = facts.callSites?.some((site) => site.contextReassignedAfter === true);
      return {
        id: consumer.id,
        applied: true,
        callCountSurvived: facts.callCount >= baseline.callCount && facts.callCount >= 1,
        submitHandlerSurvived: facts.submitHandlerCallCount >= 1,
        importSurvived: facts.importsFromSupportUi === true,
        reassignmentDetected: reassigned === true,
        valueFlowLost: facts.valueFlowCallCount === 0 && baseline.valueFlowCallCount >= 1,
        wentRed: mutatedCell.pass === false && reassigned === true && facts.valueFlowCallCount === 0,
      };
    });
    const pass = results.length > 0 && results.every(
      (r) => r.applied && r.wentRed && r.callCountSurvived && r.submitHandlerSurvived
        && r.importSurvived && r.reassignmentDetected && r.valueFlowLost,
    );
    return cellResult(cell, pass, { results }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/**
 * The decoy classes a substring pin has to survive, including the two R-M6-2 named: a
 * regex literal and JSX text. Each is appended to the consumer twice — once to a source
 * whose real call has been deleted (the decoy must not pay the pin) and once to the intact
 * source (the file must still parse and the real call must still be found, so a decoy that
 * broke parsing cannot masquerade as a decoy that was correctly ignored).
 */
export const CONSUMER_PIN_DECOYS = [
  { kind: 'lineComment', snippet: `\n// ${SUPPORT_PASSPORT_CONSUMER_EXPORT}() is called here\n` },
  { kind: 'blockComment', snippet: `\n/* ${SUPPORT_PASSPORT_CONSUMER_EXPORT}() */\n` },
  { kind: 'stringLiteral', snippet: `\nexport const __decoyString = "${SUPPORT_PASSPORT_CONSUMER_EXPORT}()";\n` },
  { kind: 'templateLiteral', snippet: `\nexport const __decoyTemplate = \`${SUPPORT_PASSPORT_CONSUMER_EXPORT}()\`;\n` },
  { kind: 'regexLiteral', snippet: `\nexport const __decoyRegex = /${SUPPORT_PASSPORT_CONSUMER_EXPORT}\\(\\)/;\n` },
  { kind: 'jsxText', snippet: `\nexport const __decoyJsx = <div>${SUPPORT_PASSPORT_CONSUMER_EXPORT}()</div>;\n` },
];

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerPinDecoysCell(deps) {
  const cell = 'NC-CONSUMER-PIN-DECOYS';
  try {
    const results = [];
    for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
      const source = consumerSource(deps, consumer);
      const callDeleted = source === null ? null : deleteConsumerCall(source);
      if (source === null || callDeleted === null) {
        results.push({ id: consumer.id, kind: 'all', ok: false, reason: 'decoy could not be applied' });
        continue;
      }
      const baselineCalls = inspectConsumerCallPath({
        typescript: deps.typescript,
        relativePath: consumer.relativePath,
        source,
      }).callCount;
      for (const decoy of CONSUMER_PIN_DECOYS) {
        const paid = inspectConsumerCallPath({
          typescript: deps.typescript,
          relativePath: consumer.relativePath,
          source: callDeleted + decoy.snippet,
        }).callCount;
        const stillParses = inspectConsumerCallPath({
          typescript: deps.typescript,
          relativePath: consumer.relativePath,
          source: source + decoy.snippet,
        }).callCount;
        results.push({
          id: consumer.id,
          kind: decoy.kind,
          decoyCallSites: paid,
          intactCallSites: stillParses,
          ok: paid === 0 && stillParses === baselineCalls && baselineCalls > 0,
        });
      }
    }
    const failures = results.filter((r) => !r.ok);
    return cellResult(cell, failures.length === 0 && results.length > 0, {
      decoysChecked: results.length,
      decoysThatPaidThePin: failures.map((r) => `${r.id}:${r.kind}`),
      results,
    }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/* ------------------------------------------------------------------ *
 * Out-of-territory finding: server-side persistence of the passport.  *
 * ------------------------------------------------------------------ */

export const SERVER_CONTEXT_COERCION_FINDING_ID = 'FINDING-SUPPORT-CONTEXT-STR-COERCION-20260728';

const SERVER_CONTEXT_COERCION_RE = /extra\["context"\]\s*=\s*\{[^}]*str\(v\)\[:\d+\][^}]*\}/;

/**
 * Read-only probe of the support-thread persistence path. `api_server.py` is Manager A
 * product territory and is not in this packet's write set, so this reports and escalates
 * rather than blocking: the client passport this gate proves is a `string[]`, and the
 * server stores `str(v)` of it, so the array arrives in the database as its Python repr.
 * Non-blocking by construction — see `blocking: false` and the allPass filter.
 *
 * @param {string | null} apiServerSource
 */
export function probeServerContextCoercionFinding(apiServerSource) {
  const base = {
    cell: 'FINDING-SERVER-CONTEXT-STR-COERCION',
    findingId: SERVER_CONTEXT_COERCION_FINDING_ID,
    coverage: 'boundary',
    ver: 'VER-01',
    blocking: false,
    pass: null,
    territory: `out-of-territory: ${API_SERVER_RELATIVE_PATH} is product (Manager A / Director)`,
    escalation: 'A/Director — passport arrays are persisted as their Python repr string',
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
  if (typeof apiServerSource !== 'string') {
    return { ...base, state: 'UNPROVEN', status: 'FINDING-UNPROVEN', reason: `${API_SERVER_RELATIVE_PATH} not readable` };
  }
  const match = apiServerSource.match(SERVER_CONTEXT_COERCION_RE);
  if (!match) {
    return {
      ...base,
      state: 'RESOLVED',
      status: 'FINDING-RESOLVED',
      note: 'the str()-coercing context comprehension is no longer present; re-check what replaced it',
    };
  }
  const line = apiServerSource.slice(0, match.index).split('\n').length;
  return {
    ...base,
    state: 'OPEN',
    status: 'FINDING-OPEN',
    location: `${API_SERVER_RELATIVE_PATH}:${line}`,
    snippet: match[0].trim(),
    consequence:
      'buildSupportContext emits degradedModules as string[]; str(v) stores it as "[\'IndicatorPerf\']", '
      + 'so the persisted value is a Python repr and support tooling cannot read it back as a list',
  };
}

/* ------------------- *
 * Gate aggregation.   *
 * ------------------- */

/**
 * @param {{
 *   supportUiSource: string,
 *   runtimeSource: string,
 *   indicatorPerfSource: string,
 *   typescript: any,
 *   consumerSources?: Record<string, string>,
 *   apiServerSource?: string | null,
 * }} opts
 */
export function runSupportPassportDegradedGate(opts) {
  if (!opts.typescript) {
    return {
      gate: SUPPORT_PASSPORT_DEGRADED_GATE_NAME,
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
      coverage: 'mixed',
      ver: 'VER-01',
      cells: [redCell(
        'SUPPORT-PASSPORT-REALM-BOOT',
        'TypeScript compiler not resolvable — supportUi.tsx cannot be executed, so this gate '
        + 'refuses to report GREEN. Run `npm ci --prefix homepage`.',
      )],
      allPass: false,
      ok: false,
      status: 'RED',
    };
  }
  const deps = {
    supportUiSource: normalizeLineEndings(opts.supportUiSource),
    runtimeSource: normalizeLineEndings(opts.runtimeSource),
    indicatorPerfSource: normalizeLineEndings(opts.indicatorPerfSource),
    typescript: opts.typescript,
    consumerSources: opts.consumerSources ?? {},
  };
  const cells = [
    ...runBehavioralCells(deps),
    ...runBehavioralMutantCells(deps),
    ...runNcAliasDropCells(deps),
    runConsumerCallPathCell(deps),
    runNcConsumerCallDeletedCell(deps),
    runNcConsumerCallHoistedUseMemoCell(deps),
    runNcConsumerValueFrozenCell(deps),
    runNcConsumerContextReassignedCell(deps),
    runNcConsumerPinDecoysCell(deps),
    probeServerContextCoercionFinding(opts.apiServerSource ?? null),
  ];
  const blocking = cells.filter((c) => typeof c.pass === 'boolean');
  const allPass = blocking.every((c) => c.pass === true);
  return {
    gate: SUPPORT_PASSPORT_DEGRADED_GATE_NAME,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    coverage: 'mixed',
    ver: 'VER-01',
    cells,
    findings: cells.filter((c) => c.pass === null),
    allPass,
    ok: allPass,
    status: allPass ? 'GREEN' : 'RED',
  };
}

/**
 * @param {ReturnType<typeof runSupportPassportDegradedGate>} report
 */
export function formatSupportPassportDegradedReport(report) {
  const lines = [
    report.signature,
    `gate=${report.gate}`,
    `coverage=${report.coverage} (${report.ver})`,
    '',
  ];
  for (const c of report.cells) {
    const suffix = c.pass === null ? ' [non-blocking]' : '';
    lines.push(`${c.cell} [${c.coverage}]: ${c.status}${suffix}`);
    if (Array.isArray(c.killedBy) && c.killedBy.length > 0) {
      lines.push(`    killed by: ${c.killedBy.join(', ')}`);
    }
    if (Array.isArray(c.survivedCells) && c.killedBy?.length === 1) {
      lines.push(`    sole detector — survived: ${c.survivedCells.join(', ')}`);
    }
    if (c.detectorCell) {
      lines.push(`    detector: ${c.detectorCell} (collateral: ${c.collateralRedCells?.join(', ') || 'none'})`);
    }
    if (Array.isArray(c.callLines)) lines.push(`    call sites: ${c.callLines.join(', ')}`);
    if (Array.isArray(c.consumers)) {
      for (const consumer of c.consumers) {
        lines.push(`    ${consumer.relativePath}: calls=${consumer.callCount ?? 'unreadable'}`
          + `${Array.isArray(consumer.callLines) && consumer.callLines.length ? ` @${consumer.callLines.join(',')}` : ''}`);
      }
    }
    if (Array.isArray(c.decoysThatPaidThePin)) {
      lines.push(`    decoys checked: ${c.decoysChecked}, paid the pin: ${c.decoysThatPaidThePin.join(', ') || 'none'}`);
    }
    if (c.reason) lines.push(`    ${c.reason}`);
    if (c.location) lines.push(`    ${c.location} — ${c.consequence}`);
  }
  lines.push('');
  lines.push(`Summary: ${report.allPass ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}
