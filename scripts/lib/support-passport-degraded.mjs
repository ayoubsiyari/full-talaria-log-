/**
 * SUPPORT-PASSPORT-DEGRADED-MODULES-V1 (W36 / CONCLUSION-48H M6, re-authored W40)
 * Signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1
 *
 * Soundness is proven by executing the REAL `buildSupportContext()` exported from
 * homepage/src/app/dashboard/support/supportUi.tsx: the .tsx is transpiled with the
 * TypeScript compiler API and evaluated inside a vm realm whose `window` is the one
 * published by chart v 1.4/chart/modules/module-presence-runtime.js. There is no
 * hand-copied re-implementation of the extractor in this file — a mirror can only ever
 * prove that the mirror agrees with itself.
 */
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

export const TALARIA_SUPPORT_PASSPORT_DEGRADED_V1 = 'TALARIA_SUPPORT_PASSPORT_DEGRADED_V1';
export const SUPPORT_PASSPORT_DEGRADED_GATE_NAME = 'SUPPORT-PASSPORT-DEGRADED-MODULES-V1';

/** Declared passport bound. Used as an oracle property, never as an implementation. */
export const MAX_PASSPORT_DEGRADED_MODULES = 32;
export const DEGRADED_MODULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/**
 * Source pins are limited to tokens that execution cannot observe. All three aliases
 * resolve to the same object at runtime (module-presence-runtime publishes one `degraded`
 * record under three names), so deleting one of them is behaviourally silent today and
 * only becomes a live bug when a consumer publishes under the trailing alias. The pin is
 * the sole detector for that class; everything else — the cap, the bounded-id regex, the
 * dedupe, the always-array key — is proven by running the real function instead.
 */
export const SUPPORT_UI_DEGRADED_CONTRACT_TOKENS = [
  'window.__TALARIA_DEGRADED_STATE',
  'window.__TALARIA_DEGRADED_STATE__',
  'window.__TALARIA_DEGRADED_MODE__',
];

export const SUPPORT_UI_RELATIVE_PATH = 'homepage/src/app/dashboard/support/supportUi.tsx';
export const MODULE_PRESENCE_RUNTIME_RELATIVE_PATH =
  'chart v 1.4/chart/modules/module-presence-runtime.js';
export const INDICATOR_PERFORMANCE_RELATIVE_PATH =
  'chart v 1.4/chart/modules/indicator-performance.js';
export const API_SERVER_RELATIVE_PATH = 'chart v 1.4/chart/api_server.py';

/* ------------------------------------------------------------------ *
 * Source-pin scanning: comments and string literals are erased first. *
 * ------------------------------------------------------------------ */

/**
 * Blanks comment bodies and string/template literal bodies, preserving offsets and line
 * breaks so a pin can never be satisfied by a token that only appears in prose.
 * @param {string} source
 * @returns {string}
 */
export function stripCommentsAndStringLiterals(source) {
  let out = '';
  let state = 'code';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { state = ch; out += ch; i += 1; continue; }
      out += ch; i += 1; continue;
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += '\n'; } else out += ' ';
      i += 1; continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += ch === '\n' ? '\n' : ' ';
      i += 1; continue;
    }
    if (ch === '\\') { out += '  '; i += 2; continue; }
    if (ch === state) { state = 'code'; out += ch; i += 1; continue; }
    out += ch === '\n' ? '\n' : ' ';
    i += 1;
  }
  return out;
}

/**
 * @param {string} supportUiSource
 */
export function assertSupportUiDegradedSourceContract(supportUiSource) {
  const scanned = stripCommentsAndStringLiterals(supportUiSource);
  const missing = SUPPORT_UI_DEGRADED_CONTRACT_TOKENS.filter(
    (token) => !scanned.includes(token),
  );
  const pass = missing.length === 0;
  return {
    cell: 'SUPPORT-UI-SOURCE-CONTRACT',
    coverage: 'wiring',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    scanned: 'comments-and-string-literals-stripped',
    missingTokens: missing,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/* ------------------------------------------------- *
 * Realm: real supportUi.tsx over the real runtime.  *
 * ------------------------------------------------- */

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

// One gate run builds ~20 realms over a handful of distinct sources; the bound keeps the
// cache from holding every mutant variant if a caller loops.
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

function reactStub() {
  const React = { createElement: () => null, Fragment: 'react.fragment' };
  return { ...React, default: React, __esModule: true };
}

/**
 * Boots module-presence-runtime.js (optionally with its indicator-performance provider)
 * and evaluates the transpiled supportUi module in the *same* realm, so the function under
 * test reads the very `window` the product runtime published.
 *
 * @param {{
 *   supportUiSource: string,
 *   runtimeSource: string,
 *   indicatorPerfSource: string,
 *   typescript: any,
 *   providerPresent?: boolean,
 *   href?: string,
 *   userAgent?: string,
 * }} opts
 */
export function createSupportPassportRealm(opts) {
  const { providerPresent = true, href = 'https://app.talaria.test/dashboard/support' } = opts;
  const listeners = {};
  const badges = [];
  const provider = { compareDocumentPosition: () => 4 };
  const consumer = {};
  const document = {
    readyState: 'loading',
    body: { appendChild: (node) => badges.push(node) },
    documentElement: { appendChild: (node) => badges.push(node) },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: (id) => badges.find((node) => node.id === id) ?? null,
    createElement: () => ({ style: {}, setAttribute() {} }),
    querySelector: (selector) => (selector.includes('indicator-performance') ? provider : consumer),
  };
  const events = [];
  const window = {
    document,
    dispatchEvent: (event) => events.push(event),
    console: { error() {} },
    location: { href },
  };
  const navigator = { userAgent: opts.userAgent ?? 'TalariaSupportPassportGate/1.0' };
  const moduleObj = { exports: {} };
  const context = vm.createContext({
    window,
    self: window,
    document,
    navigator,
    console: window.console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    setTimeout: (fn) => fn(),
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id) => {
      if (id === 'react') return reactStub();
      throw new Error(`supportUi.tsx required an unexpected module: ${id}`);
    },
  });

  vm.runInContext(opts.runtimeSource, context, { filename: MODULE_PRESENCE_RUNTIME_RELATIVE_PATH });
  if (providerPresent) {
    vm.runInContext(opts.indicatorPerfSource, context, { filename: INDICATOR_PERFORMANCE_RELATIVE_PATH });
  }
  listeners.DOMContentLoaded?.();

  vm.runInContext(
    transpileSupportUi({ typescript: opts.typescript, supportUiSource: opts.supportUiSource }),
    context,
    { filename: SUPPORT_UI_RELATIVE_PATH },
  );

  const buildSupportContext = moduleObj.exports?.buildSupportContext;
  if (typeof buildSupportContext !== 'function') {
    throw new Error('supportUi.tsx did not export buildSupportContext');
  }
  return { window, document, badges, events, buildSupportContext };
}

/* ---------------------------------------- *
 * Behavioural cells (soundness, VER-01).   *
 * ---------------------------------------- */

function redCell(cell, reason) {
  return {
    cell,
    coverage: 'soundness',
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

function cellResult(cell, pass, detail) {
  return {
    cell,
    coverage: 'soundness',
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
  ];
}

/* ------------------------------------------------------------ *
 * Negative controls: behavioural mutants of the real product.  *
 * ------------------------------------------------------------ */

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
    apply: (src) => (src.includes('  return ctx;\n}')
      ? src.replace('  return ctx;\n}', '  ctx.degradedModules = [];\n  return ctx;\n}')
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

const ALIAS_PIN_LINE = '      window.__TALARIA_DEGRADED_STATE__ ??\n';

/**
 * The alias pin is behaviourally invisible, so its negative control has to show two things
 * at once: dropping the alias goes RED on the pin, and stays GREEN everywhere else. That
 * asymmetry is the whole justification for keeping a source pin at all.
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runNcAliasPinCell(deps) {
  if (!deps.supportUiSource.includes(ALIAS_PIN_LINE)) {
    return {
      cell: 'NC-ALIAS-PIN-REMOVAL',
      coverage: 'wiring',
      ver: 'VER-01',
      status: 'RED',
      pass: false,
      reason: 'alias line not found in supportUi.tsx — mutation could not be applied',
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    };
  }
  const mutated = deps.supportUiSource.replace(ALIAS_PIN_LINE, '');
  const base = assertSupportUiDegradedSourceContract(deps.supportUiSource);
  const pinned = assertSupportUiDegradedSourceContract(mutated);
  let behaviourUnchanged = false;
  let behaviourError = null;
  try {
    behaviourUnchanged = runBehavioralCells({ ...deps, supportUiSource: mutated })
      .every((c) => c.pass === true);
  } catch (error) {
    behaviourError = String(error?.message ?? error);
  }
  const pass = base.pass === true && pinned.pass === false && behaviourUnchanged;
  return {
    cell: 'NC-ALIAS-PIN-REMOVAL',
    coverage: 'wiring',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    baseStatus: base.status,
    mutatedStatus: pinned.status,
    missingTokens: pinned.missingTokens,
    behaviourUnchanged,
    behaviourError,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * A pin that a comment can satisfy is not a pin. Re-adds the deleted alias as prose and as
 * a string literal; the contract must stay RED for both.
 * @param {Parameters<typeof createSupportPassportRealm>[0]} deps
 */
export function runNcCommentDoesNotSatisfyPinCell(deps) {
  if (!deps.supportUiSource.includes(ALIAS_PIN_LINE)) {
    return {
      cell: 'NC-COMMENT-DOES-NOT-SATISFY-PIN',
      coverage: 'wiring',
      ver: 'VER-01',
      status: 'RED',
      pass: false,
      reason: 'alias line not found in supportUi.tsx — mutation could not be applied',
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    };
  }
  const stripped = deps.supportUiSource.replace(ALIAS_PIN_LINE, '');
  const asLineComment = `// window.__TALARIA_DEGRADED_STATE__ still read here\n${stripped}`;
  const asBlockComment = `/* window.__TALARIA_DEGRADED_STATE__ */\n${stripped}`;
  const asStringLiteral = `${stripped}\nconst alias = "window.__TALARIA_DEGRADED_STATE__";\n`;
  const decoys = {
    lineComment: assertSupportUiDegradedSourceContract(asLineComment).pass,
    blockComment: assertSupportUiDegradedSourceContract(asBlockComment).pass,
    stringLiteral: assertSupportUiDegradedSourceContract(asStringLiteral).pass,
  };
  const pass = Object.values(decoys).every((satisfied) => satisfied === false);
  return {
    cell: 'NC-COMMENT-DOES-NOT-SATISFY-PIN',
    coverage: 'wiring',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    decoysThatSatisfiedThePin: Object.entries(decoys)
      .filter(([, satisfied]) => satisfied === true)
      .map(([kind]) => kind),
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
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
  };
  const cells = [
    ...runBehavioralCells(deps),
    assertSupportUiDegradedSourceContract(deps.supportUiSource),
    ...runBehavioralMutantCells(deps),
    runNcAliasPinCell(deps),
    runNcCommentDoesNotSatisfyPinCell(deps),
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
    if (c.reason) lines.push(`    ${c.reason}`);
    if (c.location) lines.push(`    ${c.location} — ${c.consequence}`);
    if (Array.isArray(c.missingTokens) && c.missingTokens.length > 0 && c.pass === false) {
      lines.push(`    missing: ${c.missingTokens.join(', ')}`);
    }
  }
  lines.push('');
  lines.push(`Summary: ${report.allPass ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}
