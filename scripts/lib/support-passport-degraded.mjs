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
 * W44 (R-M6-4 REJECT) closes the unbounded "unmodelled API" class.
 *
 *   1. The realm models sessionStorage, localStorage, performance.now (tied to the same
 *      clock), and document.visibilityState="visible", so caches that use those APIs are
 *      live inside the gate and are killed by TEMPORAL-RECOMPUTE (mutants M8/M9).
 *   2. window/document are Proxies: any property read by buildSupportContext that is not
 *      an own modelled/runtime property fails PASSPORT-DEGRADED-REALM-FIDELITY — so the
 *      next unmodelled API is RED by construction rather than another blacklist entry.
 *
 * W51 (RUNTIME-FREEZE / Director C-4) inverts W43-W50's consumer mutation arms:
 * instead of adding more AST patterns, the product deep-freezes the published context.
 * PASSPORT-CONTEXT-DEEP-FROZEN and PASSPORT-CONTEXT-MUTATION-CORPUS prove the returned
 * object and degradedModules array are immutable at runtime; NC-MUTANT-NO-DEEP-FREEZE
 * strips publication freezing and must be killed only by those runtime-freeze cells.
 *
 * W53 (C-RUL-M6-ENVELOPE) moves envelope integrity to the transport boundary. The
 * createThread body is extracted by AST only to execute it; the gate then stubs transport
 * and asserts the observable outgoing body, avoiding another spelling detector.
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
 *   productionShaped?: boolean,
 *   userAgent?: string,
 * }} opts
 */
export function createSupportPassportRealm(opts) {
  const {
    providerPresent = true,
    aliasOnly = null,
    // Support tickets are filed after load. A permanently-"loading" document made any
    // readyState==="complete" cache dead inside the gate and live in every real browser.
    postBootReadyState = 'complete',
    browserRealistic = false,
    // R-M6-8: a third profile with production host/UA so caches gated on
    // `!host.endsWith(".test")` or `!/Gate/.test(userAgent)` cannot hide.
    productionShaped = false,
  } = opts;
  const href = opts.href
    ?? (productionShaped
      ? 'https://app.talaria.io/dashboard/support'
      : 'https://app.talaria.test/dashboard/support');
  let locationHost;
  let locationPathname;
  try {
    const parsed = new URL(href);
    locationHost = parsed.host;
    locationPathname = parsed.pathname;
  } catch {
    locationHost = productionShaped ? 'app.talaria.io' : 'app.talaria.test';
    locationPathname = '/dashboard/support';
  }
  const userAgent = opts.userAgent
    ?? (productionShaped
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      : 'TalariaSupportPassportGate/1.0');
  const listeners = {};
  const badges = [];
  const provider = { compareDocumentPosition: () => 4 };
  const consumer = {};
  const accessTracker = { enabled: false, unknownReads: [] };
  let nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : 1_700_000_000_000;
  /** @type {{ due: number, fn: Function }[]} */
  const timerQueue = [];
  let nextTimerId = 1;
  const drainTimers = () => {
    timerQueue.sort((a, b) => a.due - b.due);
    while (timerQueue.length > 0 && timerQueue[0].due <= nowMs) {
      const job = timerQueue.shift();
      try { job.fn(); } catch { /* ignore timer errors */ }
      timerQueue.sort((a, b) => a.due - b.due);
    }
  };
  const clock = {
    now: () => nowMs,
    // Step through timer due-times so a callback that schedules +25ms from "now"
    // still fires inside a larger advance (presence tripwire chain).
    advance: (ms) => {
      const target = nowMs + ms;
      while (nowMs < target) {
        timerQueue.sort((a, b) => a.due - b.due);
        const next = timerQueue[0];
        if (!next || next.due > target) {
          nowMs = target;
          break;
        }
        nowMs = next.due;
        const job = timerQueue.shift();
        try { job.fn(); } catch { /* ignore timer errors */ }
      }
      drainTimers();
      return nowMs;
    },
    set: (ms) => { nowMs = ms; drainTimers(); return nowMs; },
  };
  const realmSetTimeout = (fn, delay = 0) => {
    const id = nextTimerId++;
    const ms = Math.max(0, Number(delay) || 0);
    // Zero-delay stays synchronous so runtime boot helpers that schedule microtasks keep working.
    // Positive delays are deferred onto clock.advance (R-M6-9 TTL-cache carrier).
    if (ms === 0) {
      try { fn(); } catch { /* ignore */ }
      return id;
    }
    timerQueue.push({ due: nowMs + ms, fn, id });
    return id;
  };
  const realmClearTimeout = (id) => {
    const idx = timerQueue.findIndex((job) => job.id === id);
    if (idx >= 0) timerQueue.splice(idx, 1);
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
    userAgent,
    hardwareConcurrency: 4,
    onLine: true,
    ...((browserRealistic || productionShaped)
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
    host: locationHost,
    pathname: locationPathname,
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
  const contextGlobals = (browserRealistic || productionShaped)
    ? {
        indexedDB: { open() { return null; } },
        caches: { open: async () => ({}) },
        requestIdleCallback: (fn) => { try { fn({ didTimeout: false, timeRemaining: () => 0 }); } catch { /* ignore */ } return 0; },
        matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
        BroadcastChannel: class { constructor() {} postMessage() {} close() {} addEventListener() {} },
      }
    : {};
  if (browserRealistic || productionShaped) {
    Object.assign(window, contextGlobals);
  }
  // Bare sessionStorage/localStorage must resolve to the same modelled stores as
  // window.sessionStorage — otherwise M8 (qualified) is killed while the idiomatic
  // bare spelling walks through (R-M6-7).
  const hostBuiltins = {
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    RegExp,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Reflect,
    Proxy,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    URIError,
    eval: undefined,
    Function,
    Infinity,
    NaN,
    undefined,
  };
  const contextBase = {
    ...hostBuiltins,
    window,
    self: window,
    globalThis: window,
    document,
    navigator,
    performance,
    location,
    sessionStorage,
    localStorage,
    console: window.console,
    Date: RealmDate,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    setTimeout: realmSetTimeout,
    clearTimeout: realmClearTimeout,
    setInterval: (fn, delay = 0) => realmSetTimeout(fn, delay),
    clearInterval: realmClearTimeout,
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id) => {
      if (id === 'react') return reactStub();
      throw new Error(`supportUi.tsx required an unexpected module: ${id}`);
    },
    ...contextGlobals,
  };
  // Fail-closed bare-global Proxy (R-M6-7): any identifier outside the modelled set is
  // recorded while the tracker is armed. `has` returns true so `typeof x` never throws.
  const modelledBare = new Set(Object.keys(contextBase));
  // TypeScript CommonJS emit helpers — written during module eval, not product reads.
  const tsEmitHelpers = new Set([
    '__importDefault',
    '__importStar',
    '__createBinding',
    '__exportStar',
    '__esModule',
    '__awaiter',
    '__generator',
    '__spreadArray',
    '__assign',
  ]);
  const isTsEmitHelper = (prop) => typeof prop === 'string' && tsEmitHelpers.has(prop);
  const contextSandbox = new Proxy(contextBase, {
    has(target, prop) {
      if (typeof prop === 'string'
        && !modelledBare.has(prop)
        && !Object.prototype.hasOwnProperty.call(target, prop)
        && !isTsEmitHelper(prop)
        && accessTracker.enabled) {
        accessTracker.unknownReads.push(`global.${prop}`);
      }
      // Own/modelled keys behave normally; unknown keys still `has === true` for typeof.
      if (typeof prop === 'string'
        && (modelledBare.has(prop)
          || Object.prototype.hasOwnProperty.call(target, prop)
          || isTsEmitHelper(prop))) {
        return true;
      }
      return typeof prop === 'string';
    },
    get(target, prop, receiver) {
      if (typeof prop === 'string'
        && !modelledBare.has(prop)
        && !Object.prototype.hasOwnProperty.call(target, prop)
        && !isTsEmitHelper(prop)) {
        if (accessTracker.enabled) accessTracker.unknownReads.push(`global.${prop}`);
        return undefined;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') modelledBare.add(prop);
      return Reflect.set(target, prop, value, receiver);
    },
  });
  const context = vm.createContext(contextSandbox);

  // Runtime boot may touch many host keys; fidelity tracking starts at supportUi eval.
  vm.runInContext(opts.runtimeSource, context, { filename: MODULE_PRESENCE_RUNTIME_RELATIVE_PATH });
  if (providerPresent) {
    vm.runInContext(opts.indicatorPerfSource, context, { filename: INDICATOR_PERFORMANCE_RELATIVE_PATH });
  }
  listeners.DOMContentLoaded?.();
  document.readyState = postBootReadyState;
  // module-presence-runtime retries the tripwire 20× at +25ms each. Settle the full
  // chain so absent-provider degradation is visible before any passport call (was free
  // when setTimeout ignored delay and ran synchronously).
  clock.advance(25 * 21);

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
function runTemporalSequence(deps, profile) {
  const realm = createSupportPassportRealm({ ...deps, providerPresent: true, ...profile });
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
    host: realm.window.location.host,
    userAgent: realm.window.navigator.userAgent,
    hasServiceWorker: realm.window.navigator.serviceWorker != null,
    hasIndexedDB: realm.window.indexedDB != null,
  };
}

export function runPassportDegradedTemporalCell(deps) {
  try {
    // Multi-environment (R-M6-6 / R-M6-8): sparse + browserRealistic + productionShaped
    // must all produce the same passport sequence. Production uses a non-.test host and a
    // real Chrome UA so identity-gated caches cannot hide behind gate branding.
    const sparse = runTemporalSequence(deps, { browserRealistic: false, productionShaped: false });
    const browser = runTemporalSequence(deps, { browserRealistic: true, productionShaped: false });
    const production = runTemporalSequence(deps, { browserRealistic: true, productionShaped: true });

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
      && browser.readyStateAtTicket === 'complete'
      && production.readyStateAtTicket === 'complete';
    const noUnmodelledReads = sparse.unknownReads.length === 0;
    const environmentsAgree = JSON.stringify(sparse.observed) === JSON.stringify(browser.observed)
      && JSON.stringify(sparse.observed) === JSON.stringify(production.observed)
      && JSON.stringify(sparse.runtimeSeen) === JSON.stringify(browser.runtimeSeen)
      && JSON.stringify(sparse.runtimeSeen) === JSON.stringify(production.runtimeSeen);
    const browserProfileArmed = browser.hasServiceWorker === true;
    const productionProfileArmed = production.host === 'app.talaria.io'
      && !production.host.endsWith('.test')
      && !/Gate|HeadlessChrome|jsdom/i.test(production.userAgent);
    const pass = runtimeAdvanced
      && trackedRuntime
      && laterCallsSawNewModules
      && clockAdvancedBetweenTickets
      && realmLooksLikePostLoad
      && noUnmodelledReads
      && environmentsAgree
      && browserProfileArmed
      && productionProfileArmed;

    return cellResult('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE', pass, {
      calls: sparse.observed.length,
      runtimeSeen: sparse.runtimeSeen,
      observed: sparse.observed,
      browserObserved: browser.observed,
      productionObserved: production.observed,
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
      productionProfileArmed,
      productionHost: production.host,
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

function nestedObjectsFrozen(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value)
    && Reflect.ownKeys(value).every((key) => nestedObjectsFrozen(value[key], seen));
}

/**
 * Publication freeze: the real support context object and its nested array must be frozen
 * after buildSupportContext returns. Object.freeze is shallow; this cell makes the
 * degradedModules array load-bearing.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
function observePublishedFreeze(deps, profile) {
  const realm = createSupportPassportRealm({
    ...deps,
    providerPresent: false,
    ...profile,
  });
  realm.window.__talariaMarkMissingModule('OrderOverlay');
  const ctx = realm.buildSupportContext();
  const modules = ctx.degradedModules;
  return {
    host: realm.window.location.host,
    userAgent: realm.window.navigator.userAgent,
    contextFrozen: Object.isFrozen(ctx),
    degradedModulesFrozen: Object.isFrozen(modules),
    nestedValuesFrozen: nestedObjectsFrozen(ctx),
    arrayPublished: Array.isArray(modules),
    passportModules: hostArray(modules),
  };
}

/**
 * Publication freeze across sparse + browserRealistic + productionShaped (same profiles
 * as TEMPORAL-RECOMPUTE). A freeze gated on `.test` host or Gate UA must not stay GREEN
 * while production remains mutable (R-W51 Break 1).
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runPassportContextDeepFrozenCell(deps) {
  const cell = 'PASSPORT-CONTEXT-DEEP-FROZEN';
  try {
    const sparse = observePublishedFreeze(deps, {
      browserRealistic: false, productionShaped: false,
    });
    const browser = observePublishedFreeze(deps, {
      browserRealistic: true, productionShaped: false,
    });
    const production = observePublishedFreeze(deps, {
      browserRealistic: true, productionShaped: true,
    });
    const profileOk = (obs) => obs.contextFrozen
      && obs.arrayPublished
      && obs.degradedModulesFrozen
      && obs.nestedValuesFrozen;
    const productionProfileArmed = production.host === 'app.talaria.io'
      && !production.host.endsWith('.test')
      && !/Gate|HeadlessChrome|jsdom/i.test(production.userAgent);
    const profilesAgree = profileOk(sparse) && profileOk(browser) && profileOk(production);
    const pass = profilesAgree && productionProfileArmed;
    return cellResult(cell, pass, {
      sparse,
      browser,
      production,
      profilesAgree,
      productionProfileArmed,
      passportModules: production.passportModules,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
  }
}

export const PASSPORT_CONTEXT_MUTATION_CORPUS = [
  {
    id: 'dot-assign-root',
    shape: 'ctx.degradedModules = []',
    apply: (ctx) => { ctx.degradedModules = []; },
  },
  {
    id: 'bracket-assign-root',
    shape: "ctx['degradedModules'] = []",
    apply: (ctx) => { ctx['degradedModules'] = []; },
  },
  {
    id: 'object-assign-root',
    shape: "Object.assign(ctx, { degradedModules: ['X'] })",
    apply: (ctx) => { Object.assign(ctx, { degradedModules: ['X'] }); },
  },
  {
    id: 'array-push',
    shape: "ctx.degradedModules.push('X')",
    apply: (ctx) => { ctx.degradedModules.push('X'); },
  },
  {
    id: 'array-splice',
    shape: "ctx.degradedModules.splice(0, 1, 'X')",
    apply: (ctx) => { ctx.degradedModules.splice(0, 1, 'X'); },
  },
  {
    id: 'array-pop',
    shape: 'ctx.degradedModules.pop()',
    apply: (ctx) => { ctx.degradedModules.pop(); },
  },
  {
    id: 'object-assign-array-index',
    shape: "Object.assign(ctx.degradedModules, { 0: 'X' })",
    apply: (ctx) => { Object.assign(ctx.degradedModules, { 0: 'X' }); },
  },
  {
    id: 'delete-root-key',
    shape: 'delete ctx.degradedModules',
    apply: (ctx) => { delete ctx.degradedModules; },
  },
];

function contextSnapshot(ctx) {
  return {
    hasDegradedModules: Object.prototype.hasOwnProperty.call(ctx, 'degradedModules'),
    degradedModules: hostArray(ctx.degradedModules),
  };
}

function sameContextSnapshot(a, b) {
  return a.hasDegradedModules === b.hasDegradedModules
    && JSON.stringify(a.degradedModules) === JSON.stringify(b.degradedModules);
}

/**
 * Runtime inheritance of the eight W43-W50 rejection shapes. This is a corpus of
 * previously rejected mutation shapes, not a new AST detector spec: each shape is attempted
 * against the returned object and must throw in strict mode or no-op with values unchanged.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
function runMutationCorpusOnProfile(deps, profile) {
  return PASSPORT_CONTEXT_MUTATION_CORPUS.map((entry) => {
    const realm = createSupportPassportRealm({
      ...deps,
      providerPresent: false,
      ...profile,
    });
    realm.window.__talariaMarkMissingModule('OrderOverlay');
    const ctx = realm.buildSupportContext();
    const before = contextSnapshot(ctx);
    let threw = false;
    let errorName = null;
    try {
      entry.apply(ctx);
    } catch (error) {
      threw = true;
      errorName = error?.name ?? 'Error';
    }
    const after = contextSnapshot(ctx);
    const valuesUnchanged = sameContextSnapshot(before, after);
    const arrayPublished = Array.isArray(ctx.degradedModules);
    return {
      id: entry.id,
      shape: entry.shape,
      host: realm.window.location.host,
      arrayPublished,
      threw,
      errorName,
      valuesUnchanged,
      rejected: arrayPublished && (threw || valuesUnchanged),
    };
  });
}

export function runPassportContextMutationCorpusCell(deps) {
  const cell = 'PASSPORT-CONTEXT-MUTATION-CORPUS';
  try {
    const sparse = runMutationCorpusOnProfile(deps, {
      browserRealistic: false, productionShaped: false,
    });
    const production = runMutationCorpusOnProfile(deps, {
      browserRealistic: true, productionShaped: true,
    });
    const results = production;
    const sparsePass = sparse.length === 8 && sparse.every((r) => r.rejected && r.valuesUnchanged);
    const productionPass = results.length === 8 && results.every((r) => r.rejected && r.valuesUnchanged);
    const pass = sparsePass && productionPass;
    return cellResult(cell, pass, {
      inheritance: 'W43-W50 eight-rejection runtime corpus',
      corpusSize: results.length,
      sparsePass,
      productionPass,
      productionHost: production[0]?.host,
      results,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
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
    runPassportContextDeepFrozenCell(deps),
    runPassportContextMutationCorpusCell(deps),
  ];
}

/* ------------------------------------------------------------ *
 * Negative controls: behavioural mutants of the real product.  *
 * ------------------------------------------------------------ */

const MEMOIZED_PASSPORT_HEADER =
  'export function buildSupportContext(): Record<string, string | string[]> {';
const MEMOIZED_PASSPORT_TAIL = '  return deepFreeze(ctx);\n}';

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
      ? src.replace(MEMOIZED_PASSPORT_TAIL, '  ctx.degradedModules = [];\n  return deepFreeze(ctx);\n}')
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
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
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
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
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
          + '  return deepFreeze(ctx);\n}',
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
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
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
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
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
          + '  return deepFreeze(ctx);\n}',
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
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
    },
  },
  {
    id: 'M14',
    name: 'NC-MUTANT-BARE-SESSION-STORAGE-CACHE',
    describes:
      'context cached via bare sessionStorage — the R-M6-7 spelling that bypassed window.sessionStorage',
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
          + '    const __raw = sessionStorage.getItem(__sk);\n'
          + '    if (__raw) return JSON.parse(__raw);\n'
          + '  } catch { /* ignore */ }\n',
        )
        .replace(
          MEMOIZED_PASSPORT_TAIL,
          '  try { sessionStorage.setItem(__sk, JSON.stringify(ctx)); } catch { /* ignore */ }\n'
          + '  return deepFreeze(ctx);\n}',
        );
    },
  },
  {
    id: 'M15',
    name: 'NC-MUTANT-HOST-GATED-CACHE',
    describes:
      'cache armed when location.host does not end with .test — dead under gate branding, '
      + 'live under productionShaped (R-M6-8 primary carrier)',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null && !window.location.host.endsWith(".test")) '
          + 'return __passportCache;',
        )
        .replace(MEMOIZED_PASSPORT_TAIL, '  __passportCache = deepFreeze(ctx);\n  return __passportCache;\n}');
    },
  },
  {
    id: 'M16',
    name: 'NC-MUTANT-SETTIMEOUT-TTL-CACHE',
    describes:
      'module-scope cache cleared by setTimeout(60s) — dead when setTimeout fires synchronously '
      + '(R-M6-9), live when timers are deferred onto the realm clock',
    apply: (src) => {
      if (!src.includes(MEMOIZED_PASSPORT_HEADER) || !src.includes(MEMOIZED_PASSPORT_TAIL)) {
        return null;
      }
      return src
        .replace(
          MEMOIZED_PASSPORT_HEADER,
          'let __passportCache: Record<string, string | string[]> | null = null;\n'
          + `${MEMOIZED_PASSPORT_HEADER}\n`
          + '  if (__passportCache !== null) return __passportCache;',
        )
        .replace(
          MEMOIZED_PASSPORT_TAIL,
          '  __passportCache = deepFreeze(ctx);\n'
          + '  setTimeout(() => { __passportCache = null; }, 60_000);\n'
          + '  return __passportCache;\n}',
        );
    },
  },
  {
    id: 'M17',
    name: 'NC-MUTANT-ENV-GATED-FREEZE',
    describes:
      'deepFreeze no-ops outside .test hosts — GREEN under gate branding, unfrozen in production '
      + '(R-W51 Break 1)',
    apply: (src) => {
      if (!src.includes('return Object.freeze(value);')) return null;
      return src.replace(
        'return Object.freeze(value);',
        'if (typeof window !== "undefined" && window.location '
        + '&& !String(window.location.host).endsWith(".test")) return value;\n'
        + '  return Object.freeze(value);',
      );
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

export function stripSupportContextDeepFreeze(source) {
  if (!source.includes('return deepFreeze(ctx);')) return null;
  const stripped = source
    .replace('if (typeof window === "undefined") return deepFreeze({});', 'if (typeof window === "undefined") return {};')
    .replace('  return deepFreeze(ctx);\n}', '  return ctx;\n}');
  return stripped === source ? null : stripped;
}

/**
 * W51 negative control: remove only publication freezing. The extraction logic still
 * round-trips and remains temporal, so the sole blockers should be the runtime-freeze cells.
 *
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runNcMutantNoDeepFreezeCell(deps) {
  const cell = 'NC-MUTANT-NO-DEEP-FREEZE';
  const mutatedSource = stripSupportContextDeepFreeze(deps.supportUiSource);
  if (mutatedSource === null) {
    return redCell(cell, 'deep-freeze publication return could not be stripped from supportUi.tsx');
  }
  const cells = runBehavioralCells({ ...deps, supportUiSource: mutatedSource });
  const killedBy = cells.filter((c) => c.pass === false).map((c) => c.cell);
  const runtimeFreezeCells = ['PASSPORT-CONTEXT-DEEP-FROZEN', 'PASSPORT-CONTEXT-MUTATION-CORPUS'];
  const soleRuntimeFreezeKill = killedBy.length > 0
    && killedBy.every((name) => runtimeFreezeCells.includes(name));
  return cellResult(cell, soleRuntimeFreezeKill, {
    describes: 'publication deep-freeze stripped while degradedModules extraction stays intact',
    killedBy,
    runtimeFreezeCells,
    soleRuntimeFreezeKill,
    survivedCells: cells.filter((c) => c.pass !== false).map((c) => c.cell),
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
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier?.(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
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

/** Wiring-only: call result reaches the request `context` field (not a mutation detector). */
export function callResultReachesContextPayload(ts, callNode) {
  const parent = callNode.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))
    && propertyNameText(ts, parent.name) === 'context') {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    && parent.initializer === callNode) {
    const binding = parent.name.text;
    const scope = enclosingFunctionNode(ts, callNode);
    if (!scope) return false;
    let reaches = false;
    const visit = (node) => {
      if (reaches) return;
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
        && propertyNameText(ts, node.name) === 'context') {
        if (ts.isShorthandPropertyAssignment(node) && node.name.text === binding) reaches = true;
        if (node.initializer && ts.isIdentifier(node.initializer)
          && node.initializer.text === binding) reaches = true;
      }
      if (ts.isCallExpression(node) && calleeName(ts, node.expression) === 'append'
        && node.arguments.length >= 2
        && ts.isStringLiteral(node.arguments[0])
        && node.arguments[0].text === 'context') {
        const arg = node.arguments[1];
        if (ts.isCallExpression(arg) && calleeName(ts, arg.expression) === 'stringify'
          && arg.arguments[0] && ts.isIdentifier(arg.arguments[0])
          && arg.arguments[0].text === binding) {
          reaches = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    return reaches;
  }
  return false;
}

/**
 * Wiring-only envelope integrity (R-W51b): after the call binds into the request, a later
 * write to `.context` / `["context"]` / `Object.assign(..., { context })` on the payload
 * blanks the ticket while the frozen passport object itself stays pristine. Deep-freeze
 * cannot see this — it is value-flow at the transport envelope, not consumer mutation AST
 * of the returned object (helper-indirection freeze walks stay withdrawn).
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
        if (ts.isPropertyAccessExpression(node.left)
          && (node.left.name.text === 'context' || node.left.name.text === 'degradedModules')) {
          found = true;
          return;
        }
        if (ts.isElementAccessExpression(node.left)
          && ts.isStringLiteral(node.left.argumentExpression)
          && (node.left.argumentExpression.text === 'context'
            || node.left.argumentExpression.text === 'degradedModules')) {
          found = true;
          return;
        }
      }
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
 * W51/W51b/W52: import + createThread call + value-flow to request `context` that is not
 * overwritten on the payload envelope afterwards. Publication immutability of the returned
 * object is deepFreeze (runtime); envelope overwrite is a separate wiring pin (R-W51b).
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
 * R-W51 Break 2: call still fires on the submit handler, but the return value never
 * reaches the request `context` field. Runtime freeze of a discarded object must not
 * keep the wiring cell GREEN.
 *
 * @param {string} source
 * @returns {string | null}
 */
export function discardConsumerContextPayload(source) {
  let next = source;
  const before = next;
  // Inline send-site: keep the call (discard the value) so callCount/submitHandler stay green.
  next = next.replace(
    /context:\s*buildSupportContext\(\)/g,
    'context: (buildSupportContext(), {})',
  );
  next = next.replace(/context:\s*ctx\b/g, 'context: {}');
  next = next.replace(
    /fd\.append\(\s*["']context["']\s*,\s*JSON\.stringify\(\s*ctx\s*\)\s*\)/g,
    'fd.append("context", JSON.stringify({}))',
  );
  if (next === before) return null;
  // Call must survive: this hole is value-flow, not call deletion.
  if (!next.includes('buildSupportContext()')) return null;
  return next;
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcConsumerContextDiscardedCell(deps) {
  const cell = 'NC-CONSUMER-CONTEXT-DISCARDED';
  try {
    const results = SUPPORT_PASSPORT_CONSUMERS.map((consumer) => {
      const source = consumerSource(deps, consumer);
      if (source === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'consumer source unreadable' };
      }
      const mutated = discardConsumerContextPayload(source);
      if (mutated === null) {
        return { id: consumer.id, applied: false, wentRed: false, reason: 'discard could not be applied' };
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
        callCountSurvived: facts.callCount >= 1,
        submitHandlerSurvived: facts.submitHandlerCallCount >= 1,
        valueFlowLost: facts.valueFlowCallCount === 0 && baseline.valueFlowCallCount >= 1,
        wentRed: mutatedCell.pass === false
          && facts.valueFlowCallCount === 0
          && facts.submitHandlerCallCount >= 1,
      };
    });
    const pass = results.length > 0 && results.every(
      (r) => r.applied && r.wentRed && r.callCountSurvived
        && r.submitHandlerSurvived && r.valueFlowLost,
    );
    return cellResult(cell, pass, { results }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

/**
 * R-W51b carrier: overwrite `payload.context` after the frozen passport is attached.
 * Deep-freeze of the builder return stays intact; the ticket ships empty modules.
 *
 * @param {string} source
 * @returns {string | null}
 */
export function reassignConsumerContextAfterPayload(source) {
  if (source.includes('context: buildSupportContext()')) {
    const replaced = source.replace(
      /(context: buildSupportContext\(\),[\s\S]*?\n\s*\};)/,
      '$1\n    payload.context = { ...(payload.context as Record<string, unknown>), degradedModules: [] };',
    );
    return replaced === source ? null : replaced;
  }
  if (source.includes('const ctx = buildSupportContext();')) {
    const replaced = source.replace(
      /const ctx = buildSupportContext\(\);/,
      'const ctx = buildSupportContext();\n'
      + '      const __passportEnvelope = { context: ctx as Record<string, unknown> };\n'
      + '      __passportEnvelope.context = { ...__passportEnvelope.context, degradedModules: [] };\n'
      + '      void __passportEnvelope;',
    );
    // Force the send sites to use the overwritten envelope context.
    const wired = replaced
      .replace(
        /fd\.append\(\s*["']context["']\s*,\s*JSON\.stringify\(\s*ctx\s*\)\s*\)/g,
        'fd.append("context", JSON.stringify(__passportEnvelope.context))',
      )
      .replace(
        /body:\s*JSON\.stringify\(\s*\{\s*subject,\s*category:\s*newCategory,\s*body,\s*context:\s*ctx\s*\}\s*\)/g,
        'body: JSON.stringify({ subject, category: newCategory, body, context: __passportEnvelope.context })',
      );
    return wired === source ? null : wired;
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
 * Transport-boundary oracle: execute real createThread bodies.        *
 * ------------------------------------------------------------------ */

/**
 * AST use here is limited to locating the real declaration for execution. Envelope
 * integrity is asserted at the outgoing transport body, not by syntax arms.
 *
 * @param {{ typescript: any, source: string, relativePath: string }} opts
 * @returns {string}
 */
export function extractCreateThreadDeclaration({ typescript: ts, source, relativePath }) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  let declaration = null;
  const visit = (node) => {
    if (declaration) return;
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'createThread'
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      declaration = node.parent?.parent ?? node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  if (!declaration) {
    throw new Error(`${relativePath}: const createThread declaration not found`);
  }
  return source.slice(declaration.getStart(sourceFile), declaration.end);
}

function createThreadHarnessSource(createThreadDeclaration) {
  return `
const __transportCalls = [];
class RecordingFormData {
  constructor() { this.__entries = []; }
  append(name, value) { this.__entries.push([String(name), value]); }
}
const FormData = RecordingFormData;
const MAX_IMAGE_UPLOAD_BYTES = 1024 * 1024;
const imageUploadTooLargeError = () => 'too large';
const newSubject = 't';
const newBody = 'b';
const newCategory = 'bug';
const newThreadFile = __file;
const newFile = __file;
const newTags = '';
const structChange = '';
const structCurrent = '';
const structExpected = '';
const structFeature = '';
const structUseCase = '';
const newThreadFileRef = { current: { value: '' } };
const newFileRef = { current: { value: '' } };
const setUploadErr = () => {};
const setError = () => {};
const setSending = () => {};
const setNewSubject = () => {};
const setNewBody = () => {};
const setNewTags = () => {};
const setStructChange = () => {};
const setStructCurrent = () => {};
const setStructExpected = () => {};
const setStructFeature = () => {};
const setStructUseCase = () => {};
const setNewThreadFile = () => {};
const setNewFile = () => {};
const setNewCategory = () => {};
const setShowNew = () => {};
const setNewThread = () => {};
const setSelectedId = () => {};
const setSelThread = () => {};
const loadThreads = async () => {};
const loadMessages = async () => {};
const markThreadRead = async () => {};
const markRead = async () => {};
const connectWs = () => {};
function __recordTransport(url, opts = {}) {
  __transportCalls.push({ url, opts, body: opts.body });
  return { thread: { id: 123, user_id: 1, subject: 't', category: 'bug', status: 'open' } };
}
// Transport stubs are intentionally non-thenable so createThread records the outgoing
// body before its first await suspends. The oracle reads __transportCalls synchronously
// after kicking the async function; do not make these return Promises.
const api = __recordTransport;
const supportApi = __recordTransport;
${createThreadDeclaration}
globalThis.__talariaRunCreateThread = () => {
  const pending = createThread();
  if (pending && typeof pending.then === 'function') {
    pending.catch(() => {});
  }
  return __transportCalls;
};
`;
}

function transpileCreateThreadHarness({ typescript: ts, relativePath, harnessSource }) {
  const emitted = ts.transpileModule(harnessSource, {
    fileName: `${relativePath}.w53-harness.tsx`,
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
    throw new Error(`${relativePath}: createThread harness transpile failed: `
      + ts.flattenDiagnosticMessageText(fatal[0].messageText, ' '));
  }
  return emitted.outputText;
}

function decodeTransportContext(body) {
  if (typeof body === 'string') {
    const payload = JSON.parse(body);
    return { bodyKind: 'json', context: payload.context ?? null };
  }
  if (body && Array.isArray(body.__entries)) {
    const entry = body.__entries.find(([name]) => name === 'context');
    const raw = entry?.[1];
    return {
      bodyKind: 'formData',
      context: typeof raw === 'string' ? JSON.parse(raw) : raw ?? null,
      formFields: body.__entries.map(([name]) => name),
    };
  }
  return { bodyKind: body == null ? 'none' : typeof body, context: null };
}

function executeConsumerCreateThreadTransport({ deps, consumer, source, fileMode }) {
  const normalized = normalizeLineEndings(source);
  const declaration = extractCreateThreadDeclaration({
    typescript: deps.typescript,
    source: normalized,
    relativePath: consumer.relativePath,
  });
  const realm = createSupportPassportRealm({
    ...deps,
    providerPresent: true,
  });
  realm.window.__talariaMarkMissingModule('OrderOverlay');
  const fakeFile = fileMode === 'formData'
    ? { name: 'tiny.png', type: 'image/png', size: 1 }
    : null;
  const moduleObj = { exports: {} };
  const sandbox = {
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Error,
    TypeError,
    Promise,
    console: realm.window.console,
    window: realm.window,
    self: realm.window,
    globalThis: realm.window,
    buildSupportContext: realm.buildSupportContext,
    __file: fakeFile,
    module: moduleObj,
    exports: moduleObj.exports,
    require: () => ({}),
  };
  const context = vm.createContext(sandbox);
  const harnessSource = createThreadHarnessSource(declaration);
  const compiled = transpileCreateThreadHarness({
    typescript: deps.typescript,
    relativePath: consumer.relativePath,
    harnessSource,
  });
  vm.runInContext(compiled, context, { filename: `${consumer.relativePath}.w53-harness.cjs` });
  const calls = realm.window.__talariaRunCreateThread();
  const call = calls[0] ?? null;
  const decoded = decodeTransportContext(call?.body);
  const modules = decoded.context?.degradedModules;
  const carriesOrderOverlay = Array.isArray(modules) && modules.includes('OrderOverlay');
  return {
    id: consumer.id,
    relativePath: consumer.relativePath,
    fileMode,
    callCount: calls.length,
    url: call?.url ?? null,
    bodyKind: decoded.bodyKind,
    formFields: decoded.formFields,
    degradedModules: hostArray(modules),
    carriesOrderOverlay,
    ok: calls.length === 1 && carriesOrderOverlay,
  };
}

function observeTransportConsumers(deps) {
  const observations = [];
  for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
    const source = consumerSource(deps, consumer);
    if (source === null) {
      observations.push({
        id: consumer.id,
        relativePath: consumer.relativePath,
        ok: false,
        reason: 'consumer source unreadable',
      });
      continue;
    }
    for (const fileMode of ['json', 'formData']) {
      observations.push(executeConsumerCreateThreadTransport({
        deps,
        consumer,
        source,
        fileMode,
      }));
    }
  }
  return observations;
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runPassportTransportDegradedModulesCell(deps) {
  const cell = 'PASSPORT-TRANSPORT-DEGRADED-MODULES';
  try {
    const observations = observeTransportConsumers(deps);
    const pass = observations.length === SUPPORT_PASSPORT_CONSUMERS.length * 2
      && observations.every((obs) => obs.ok === true);
    return cellResult(cell, pass, {
      blocking: false,
      observations,
    }, 'wiring');
  } catch (error) {
    return { ...redCell(cell, String(error?.message ?? error), 'wiring'), blocking: false };
  }
}

function blankConsumerEnvelopeForTransport(source) {
  return reassignConsumerContextAfterPayload(source)
    ?? discardConsumerContextPayload(source);
}

/**
 * @param {Parameters<typeof runConsumerCallPathCell>[0]} deps
 */
export function runNcTransportEnvelopeBlankedCell(deps) {
  const cell = 'NC-TRANSPORT-ENVELOPE-BLANKED';
  try {
    const consumerSources = {};
    const mutations = [];
    for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
      const source = consumerSource(deps, consumer);
      const mutated = source === null ? null : blankConsumerEnvelopeForTransport(source);
      mutations.push({
        id: consumer.id,
        relativePath: consumer.relativePath,
        applied: mutated !== null && mutated !== source,
      });
      if (mutated === null || mutated === source) {
        return cellResult(cell, false, {
          blocking: false,
          mutations,
          reason: `${consumer.relativePath}: envelope blanking negative control could not be applied`,
        }, 'wiring');
      }
      consumerSources[consumer.relativePath] = mutated;
    }
    const transportCell = runPassportTransportDegradedModulesCell({
      ...deps,
      consumerSources: { ...deps.consumerSources, ...consumerSources },
    });
    const redObservations = transportCell.observations?.filter((obs) => obs.ok === false) ?? [];
    const pass = transportCell.pass === false
      && redObservations.length === SUPPORT_PASSPORT_CONSUMERS.length * 2;
    return cellResult(cell, pass, {
      blocking: false,
      mutations,
      transportWentRed: transportCell.pass === false,
      redObservations,
    }, 'wiring');
  } catch (error) {
    return { ...redCell(cell, String(error?.message ?? error), 'wiring'), blocking: false };
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
    runNcConsumerContextDiscardedCell(deps),
    runNcConsumerContextReassignedCell(deps),
    runNcConsumerPinDecoysCell(deps),
    runNcMutantNoDeepFreezeCell(deps),
    runPassportTransportDegradedModulesCell(deps),
    runNcTransportEnvelopeBlankedCell(deps),
    probeServerContextCoercionFinding(opts.apiServerSource ?? null),
  ];
  const blocking = cells.filter((c) => typeof c.pass === 'boolean' && c.blocking !== false);
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
    const suffix = c.pass === null || c.blocking === false ? ' [non-blocking]' : '';
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
