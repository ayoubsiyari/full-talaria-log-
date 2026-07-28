/**
 * SUPPORT-PASSPORT-DEGRADED-MODULES-V1 (W36 / CONCLUSION-48H M6)
 * Signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1
 *
 * Hermetic mirror of `buildSupportContext()` degradedModules wiring in
 * homepage/src/app/dashboard/support/supportUi.tsx (production source of truth).
 * Product chart modules are not imported here.
 */

export const TALARIA_SUPPORT_PASSPORT_DEGRADED_V1 = 'TALARIA_SUPPORT_PASSPORT_DEGRADED_V1';
export const SUPPORT_PASSPORT_DEGRADED_GATE_NAME = 'SUPPORT-PASSPORT-DEGRADED-MODULES-V1';

/** Must stay byte-identical to supportUi.tsx `boundedId` (source-contract pin). */
export const DEGRADED_MODULE_ID_PATTERN_SOURCE = '/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/';

export const DEGRADED_MODULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export const MAX_PASSPORT_DEGRADED_MODULES = 32;

/** Static pins — loss of any token is RED (wiring / VER-01). */
export const SUPPORT_UI_DEGRADED_CONTRACT_TOKENS = [
  'ctx.degradedModules',
  'window.__TALARIA_DEGRADED_STATE',
  'window.__TALARIA_DEGRADED_STATE__',
  'window.__TALARIA_DEGRADED_MODE__',
  '?.degradedModules',
  DEGRADED_MODULE_ID_PATTERN_SOURCE,
  '.slice(0, 32)',
];

const BOUNDED_ID_DECL_RE = /const boundedId = (\/.+?\/);/;

/**
 * @param {typeof globalThis | Record<string, unknown>} globalLike
 * @returns {string[]}
 */
export function extractDegradedModulesForPassport(globalLike) {
  const boundedId = DEGRADED_MODULE_ID_PATTERN;
  try {
    const values = (
      globalLike?.__TALARIA_DEGRADED_STATE ??
      globalLike?.__TALARIA_DEGRADED_STATE__ ??
      globalLike?.__TALARIA_DEGRADED_MODE__
    )?.degradedModules;
    return Array.isArray(values)
      ? [...new Set(values.filter((value) =>
          typeof value === 'string' && boundedId.test(value),
        ))].slice(0, MAX_PASSPORT_DEGRADED_MODULES)
      : [];
  } catch {
    return [];
  }
}

/**
 * Passport slice: always exposes `degradedModules` as an array (possibly empty).
 * @param {typeof globalThis | Record<string, unknown>} globalLike
 */
export function passportDegradedModulesSlice(globalLike) {
  return { degradedModules: extractDegradedModulesForPassport(globalLike) };
}

/**
 * @param {string} supportUiSource
 */
export function assertSupportUiDegradedSourceContract(supportUiSource) {
  const missing = SUPPORT_UI_DEGRADED_CONTRACT_TOKENS.filter(
    (token) => !supportUiSource.includes(token),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      pass: false,
      status: 'RED',
      cell: 'SUPPORT-UI-SOURCE-CONTRACT',
      coverage: 'wiring',
      ver: 'VER-01',
      missingTokens: missing,
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    };
  }
  const decl = supportUiSource.match(BOUNDED_ID_DECL_RE);
  if (!decl || decl[1] !== DEGRADED_MODULE_ID_PATTERN_SOURCE) {
    return {
      ok: false,
      pass: false,
      status: 'RED',
      cell: 'SUPPORT-UI-SOURCE-CONTRACT',
      coverage: 'wiring',
      ver: 'VER-01',
      missingTokens: ['boundedId-regex-parity'],
      signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    };
  }
  return {
    ok: true,
    pass: true,
    status: 'GREEN',
    cell: 'SUPPORT-UI-SOURCE-CONTRACT',
    coverage: 'wiring',
    ver: 'VER-01',
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * NC: strip passport assignment from source; contract must fail (wiring proof).
 * @param {string} supportUiSource
 */
export function runNcPassportDegradedMutation(supportUiSource) {
  const mutated = supportUiSource
    .replace(/ctx\.degradedModules\s*=[^;]+;/g, '')
    .replace(/ctx\.degradedModules\s*=\s*\[\];/g, '');
  const base = assertSupportUiDegradedSourceContract(supportUiSource);
  const injected = assertSupportUiDegradedSourceContract(mutated);
  const pass = base.ok && !injected.ok;
  return {
    cell: 'NC-PASSPORT-DEGRADED-MUTATION',
    coverage: 'wiring',
    ver: 'VER-01',
    baseStatus: base.status,
    mutatedStatus: injected.status,
    status: pass ? 'GREEN' : 'RED',
    pass,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * @param {typeof globalThis | Record<string, unknown>} globalLike
 */
export function runPassportDegradedKeyAlwaysCell(globalLike) {
  const slice = passportDegradedModulesSlice(globalLike);
  const pass = Object.prototype.hasOwnProperty.call(slice, 'degradedModules')
    && Array.isArray(slice.degradedModules);
  return {
    cell: 'PASSPORT-DEGRADED-KEY-ALWAYS',
    coverage: 'soundness',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    slice,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * @param {typeof globalThis | Record<string, unknown>} globalLike
 * @param {string[]} expected
 */
export function runPassportDegradedRoundTripCell(globalLike, expected) {
  const modules = extractDegradedModulesForPassport(globalLike);
  const pass = JSON.stringify(modules) === JSON.stringify(expected);
  return {
    cell: 'PASSPORT-DEGRADED-ROUND-TRIP',
    coverage: 'soundness',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    modules,
    expected,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  };
}

/**
 * @param {{ supportUiSource: string, globalLike?: typeof globalThis | Record<string, unknown> }} opts
 */
export function runSupportPassportDegradedGate(opts) {
  const globalLike = opts.globalLike ?? {};
  const cells = [
    runPassportDegradedKeyAlwaysCell(globalLike),
    runPassportDegradedRoundTripCell(
      {
        ...globalLike,
        __TALARIA_DEGRADED_STATE: { degradedModules: ['IndicatorPerf'] },
      },
      ['IndicatorPerf'],
    ),
    assertSupportUiDegradedSourceContract(opts.supportUiSource),
    runNcPassportDegradedMutation(opts.supportUiSource),
  ];
  const allPass = cells.every((c) => c.pass === true);
  return {
    gate: SUPPORT_PASSPORT_DEGRADED_GATE_NAME,
    signature: TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
    coverage: 'mixed',
    ver: 'VER-01',
    cells,
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
    lines.push(`${c.cell} [${c.coverage}]: ${c.status}`);
  }
  lines.push('');
  lines.push(`Summary: ${report.allPass ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}
