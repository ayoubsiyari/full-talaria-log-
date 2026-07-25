/**
 * M21 VALUE/Y — harness-only pre-document flag hook (W5).
 *
 * STATUS: PRELIMINARY-HARNESS-READY
 * NO product edits. NO eval/Function. NO secret logging.
 *
 * Env: M21_VY_PREDOC_FLAGS — strict JSON object of allowlisted boolean kill-switches.
 * Injected via page.evaluateOnNewDocument BEFORE any app code (bootLayout preDocument).
 *
 * Contract for W1 A/B adapter:
 *   ab-on  → unset / {}  (fix ON: exact-tail paint enabled when product lands)
 *   ab-off → {"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}
 *   red    → omit env (no-op)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Sprint allowlist — boolean kill-switches only. */
export const M21_VY_PREDOC_ALLOWLIST = Object.freeze([
  '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1',
  // Related M19-I toggles (boolean only) for future A/B cells; still harness-only.
  '__TALARIA_DISABLE_M19I_TAIL_SEND_V1',
  '__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1',
  '__TALARIA_DISABLE_M19I_WORKER_PORT_V1',
  '__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1',
  '__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1',
  '__TALARIA_DISABLE_M19I_TICK_COHERENT_V1',
]);

const ALLOW = new Set(M21_VY_PREDOC_ALLOWLIST);

/**
 * Parse + validate M21_VY_PREDOC_FLAGS.
 * @returns {{
 *   ok: boolean,
 *   noop: boolean,
 *   applied: Record<string, boolean>,
 *   appliedKeys: string[],
 *   error: string|null,
 *   rejectedKeys: string[],
 * }}
 */
export function parsePredocFlagsEnv(rawEnv) {
  const raw = rawEnv == null ? '' : String(rawEnv).trim();
  if (!raw) {
    return {
      ok: true,
      noop: true,
      applied: {},
      appliedKeys: [],
      error: null,
      rejectedKeys: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      noop: false,
      applied: {},
      appliedKeys: [],
      error: `M21_VY_PREDOC_FLAGS must be strict JSON object (parse failed)`,
      rejectedKeys: [],
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      noop: false,
      applied: {},
      appliedKeys: [],
      error: 'M21_VY_PREDOC_FLAGS must be a JSON object (not array/null/primitive)',
      rejectedKeys: [],
    };
  }

  const applied = {};
  const rejectedKeys = [];
  for (const key of Object.keys(parsed)) {
    if (!ALLOW.has(key)) {
      rejectedKeys.push(key);
      continue;
    }
    const val = parsed[key];
    if (typeof val !== 'boolean') {
      return {
        ok: false,
        noop: false,
        applied: {},
        appliedKeys: [],
        error: `M21_VY_PREDOC_FLAGS[${key}] must be literal boolean (got ${typeof val})`,
        rejectedKeys: [key],
      };
    }
    if (val !== true && val !== false) {
      return {
        ok: false,
        noop: false,
        applied: {},
        appliedKeys: [],
        error: `M21_VY_PREDOC_FLAGS[${key}] must be true|false literal`,
        rejectedKeys: [key],
      };
    }
    applied[key] = val;
  }

  if (rejectedKeys.length) {
    return {
      ok: false,
      noop: false,
      applied: {},
      appliedKeys: [],
      error: `M21_VY_PREDOC_FLAGS unknown key(s) rejected: ${rejectedKeys.join(',')}`,
      rejectedKeys,
    };
  }

  // Nested values already impossible for JSON primitives; reject prototype pollution.
  if (Object.prototype.hasOwnProperty.call(parsed, '__proto__')
    || Object.prototype.hasOwnProperty.call(parsed, 'constructor')
    || Object.prototype.hasOwnProperty.call(parsed, 'prototype')) {
    return {
      ok: false,
      noop: false,
      applied: {},
      appliedKeys: [],
      error: 'M21_VY_PREDOC_FLAGS rejects prototype-pollution keys',
      rejectedKeys: ['__proto__|constructor|prototype'],
    };
  }

  const appliedKeys = Object.keys(applied).sort();
  return {
    ok: true,
    noop: appliedKeys.length === 0,
    applied,
    appliedKeys,
    error: null,
    rejectedKeys: [],
  };
}

/**
 * Resolve from process.env (never logs the raw env string).
 */
export function resolvePredocFlagsFromEnv(env = process.env) {
  return parsePredocFlagsEnv(env.M21_VY_PREDOC_FLAGS);
}

/**
 * Build bootLayout-compatible preDocument fragment.
 * Flags are passed as evaluateOnNewDocument *arguments* (structured clone) —
 * never interpolated into a source string, never eval'd.
 *
 * @param {Record<string, boolean>} applied
 */
export function buildPredocFlagsHook(applied) {
  const flags = { ...(applied || {}) };
  return {
    fn: (flagMap) => {
      // Runs before any page/app script in host + iframes.
      const sink = (window.__m21vyPredoc = window.__m21vyPredoc || {
        appliedAt: performance.now(),
        applied: {},
        beforeApp: true,
      });
      const map = flagMap && typeof flagMap === 'object' ? flagMap : {};
      for (const key of Object.keys(map)) {
        const v = map[key];
        if (typeof v === 'boolean') {
          window[key] = v;
          sink.applied[key] = v;
        }
      }
      sink.appliedAt = performance.now();
      sink.beforeApp = typeof window.chart === 'undefined';
    },
    args: [flags],
  };
}

/**
 * Compose with an existing preDocument hook (flags first, then probe hooks).
 */
export function composePredocWithProbe(predocHook, probeHook) {
  if (!predocHook && !probeHook) return null;
  if (!predocHook) return probeHook;
  if (!probeHook) return predocHook;
  const flagMap = (predocHook.args && predocHook.args[0]) || {};
  const probeFn = probeHook.fn;
  const probeArgs = probeHook.args || [];
  return {
    fn: (flags, ...rest) => {
      // 1) kill-switches before anything else in this composed fn
      const sink = (window.__m21vyPredoc = window.__m21vyPredoc || {
        appliedAt: performance.now(),
        applied: {},
        beforeApp: true,
      });
      const map = flags && typeof flags === 'object' ? flags : {};
      for (const key of Object.keys(map)) {
        if (typeof map[key] === 'boolean') {
          window[key] = map[key];
          sink.applied[key] = map[key];
        }
      }
      sink.appliedAt = performance.now();
      sink.beforeApp = typeof window.chart === 'undefined';
      // 2) probe instrumentation
      if (typeof probeFn === 'function') probeFn(...rest);
    },
    args: [flagMap, ...probeArgs],
  };
}

/** Sanitized evidence stub (never includes raw env). */
export function predocEvidenceStub(parsed) {
  return {
    envPresent: !parsed.noop || (parsed.appliedKeys && parsed.appliedKeys.length > 0)
      ? parsed.noop === false || parsed.appliedKeys.length > 0
      : false,
    noop: !!parsed.noop,
    ok: !!parsed.ok,
    applied: { ...(parsed.applied || {}) },
    appliedKeys: [...(parsed.appliedKeys || [])],
    rejectedKeys: [...(parsed.rejectedKeys || [])],
    error: parsed.error || null,
    allowlist: [...M21_VY_PREDOC_ALLOWLIST],
    injection: 'evaluateOnNewDocument (bootLayout preDocument, before app)',
    noEval: true,
    noFunctionCtor: true,
    noSourceInterpolation: true,
  };
}

/**
 * Derive apply-tip fingerprint from worker apply results (harness-observable).
 * Returns UNOBSERVED fields when tip cannot be read safely.
 */
export function deriveApplyTipFingerprint(results, activeIndicators, formingClose) {
  const out = {
    applyTipFingerprint: null,
    applyTemaTip: null,
    applyFormingCloseAtSample: Number.isFinite(formingClose) ? formingClose : null,
    applyTipSource: 'UNOBSERVED',
  };
  if (!results || typeof results !== 'object') {
    out.applyTipSource = 'UNOBSERVED';
    return out;
  }
  const tema = (activeIndicators || []).find((i) => String(i?.type || '').toLowerCase() === 'tema');
  if (!tema?.id || results[tema.id] == null) {
    out.applyTipSource = 'UNOBSERVED';
    return out;
  }
  const pack = results[tema.id];
  let tip = null;
  if (Array.isArray(pack)) {
    for (let i = pack.length - 1; i >= 0; i--) {
      const v = Number(pack[i]);
      if (Number.isFinite(v)) { tip = v; break; }
    }
  } else if (pack && typeof pack === 'object') {
    const arr = pack.values || pack.data || pack.line || pack.y;
    if (Array.isArray(arr)) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const v = Number(arr[i]);
        if (Number.isFinite(v)) { tip = v; break; }
      }
    }
  }
  if (tip == null) {
    out.applyTipSource = 'UNOBSERVED';
    return out;
  }
  out.applyTemaTip = tip;
  out.applyFormingCloseAtSample = Number.isFinite(formingClose) ? formingClose : null;
  out.applyTipFingerprint = [
    'tema',
    String(tip),
    Number.isFinite(formingClose) ? String(formingClose) : 'na',
  ].join('|');
  out.applyTipSource = 'worker_apply_results_pack';
  return out;
}

export function predocModulePath() {
  return path.resolve(__dirname, 'm21-vy-predoc-flags.mjs');
}

// Re-export allowlist length for tests.
export const PREDOC_ALLOWLIST_COUNT = M21_VY_PREDOC_ALLOWLIST.length;
