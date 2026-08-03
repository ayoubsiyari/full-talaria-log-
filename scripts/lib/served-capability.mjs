/**
 * SERVED-CAPABILITY: does the build I am about to measure actually CONTAIN the fix?
 *
 * The seal answers "which bytes", never "what is in them". Those are different questions and we have now
 * been burned on the gap twice: the roster's switches were present in the tree and absent from the served
 * build, and a b122 deploy was read mid-flight while one file was still the old copy. A ten-hour arm that
 * measures a build lacking the fix is not a null result, it is ten hours describing a build nobody meant
 * to test.
 *
 * TWO HOLES, not one, and the second is mine.
 *
 * SEAL_PATHS covers six files and NONE of them is replay-system.js, order-manager.js or
 * chart-indicators-full.js - the three files carrying most of the roster. So the seal I re-verify every
 * sample would not notice the replay engine itself being replaced mid-run. That is closed here with a
 * SEPARATE capability digest rather than by extending SEAL_PATHS, deliberately: the seal digest has to
 * keep agreeing with build-passport, and two tools disagreeing about one build has already cost us once.
 *
 * The runtime half matters as much as the static half. Bytes on the origin are not bytes in the page - a
 * service worker can serve a cached copy - so the ladder is also read off the live object.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Files that carry the roster's fixes and are NOT in SEAL_PATHS. */
export const CAPABILITY_PATHS = [
  '/chart/modules/replay-system.js',
  '/chart/modules/order-manager.js',
  '/chart/modules/chart-indicators-full.js',
];

/** What SPEED-01 must look like in the served bytes. Named by A, verified against the local tree. */
export const SPEED01_MARKERS = {
  file: '/chart/modules/replay-system.js',
  requires: ['SPEED_GOV_LADDER_BPS', '_speedGovNearestRung', 'normalizeSpeed', 'migrateStoredSpeed', '__TALARIA_SPEED_GOV_V1'],
  localMirror: path.join('chart v 1.4', 'chart', 'modules', 'replay-system.js'),
};

const fetchText = async (url, timeoutMs = 30000) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    const ct = r.headers.get('content-type') || '';
    return { ok: r.status === 200, status: r.status, contentType: ct, body: await r.text() };
  } finally { clearTimeout(t); }
};

/**
 * Static half: fetch the served file and assert the markers are in it.
 *
 * A 200 is not enough and this is the trap that produced a "376 KB with no ladder" reading: this origin
 * answers 200 with text/html for ANY missing path under /chart/, so a mistyped path returns the SPA
 * fallback and every marker is legitimately absent from it. Content type is checked before content.
 */
export async function checkSpeed01Served(origin, { markers = SPEED01_MARKERS } = {}) {
  const url = origin.replace(/\/$/, '') + markers.file;
  let res;
  try { res = await fetchText(url); } catch (err) { return { ok: false, state: 'UNREACHABLE', url, why: String(err).slice(0, 160) }; }
  if (!res.ok) return { ok: false, state: 'NOT_SERVED', url, status: res.status };
  if (!/javascript|ecmascript/.test(res.contentType)) {
    return {
      ok: false, state: 'SPA_FALLBACK', url, contentType: res.contentType, bytes: Buffer.byteLength(res.body),
      why: 'The origin returned 200 with HTML — this path does not exist and the server answered with the app shell. Any marker check against this body is meaningless.',
    };
  }
  const bytes = Buffer.byteLength(res.body);
  const present = markers.requires.filter((m) => res.body.includes(m));
  const missing = markers.requires.filter((m) => !res.body.includes(m));
  let localBytes = null;
  try { localBytes = Buffer.byteLength(fs.readFileSync(markers.localMirror, 'utf8')); } catch { /* mirror absent is not fatal */ }
  return {
    ok: missing.length === 0,
    state: missing.length === 0 ? 'PRESENT' : 'MISSING_MARKERS',
    // SEAL-EVIDENCE-01: PRESENT means the markers are in the served bytes. It does not mean the
    // governor runs. readSpeed01Runtime + gradeRuntimeLadder are the runtime half, and the soak's
    // effective-speed readback is the behavioural one.
    evidenceClass: 'STATIC_SERVED_BYTES',
    behaviouralEvidence: false,
    url, bytes, localBytes,
    servedPctOfLocal: localBytes ? +(100 * bytes / localBytes).toFixed(1) : null,
    present, missing,
    sha256: crypto.createHash('sha256').update(res.body).digest('hex').slice(0, 16),
  };
}

/** A digest over the engine files the seal does not cover, re-verifiable per sample. */
export async function capabilityDigest(origin, { paths = CAPABILITY_PATHS } = {}) {
  const base = origin.replace(/\/$/, '');
  const files = [];
  const h = crypto.createHash('md5');
  for (const p of paths) {
    try {
      const r = await fetchText(base + p);
      const isJs = /javascript|ecmascript/.test(r.contentType);
      if (!r.ok || !isJs) { files.push({ path: p, ok: false, status: r.status, contentType: r.contentType }); h.update(`${p}:UNREADABLE`); continue; }
      const d = crypto.createHash('md5').update(r.body).digest('hex');
      files.push({ path: p, ok: true, bytes: Buffer.byteLength(r.body), md5: d });
      h.update(`${p}:${d}`);
    } catch (err) { files.push({ path: p, ok: false, why: String(err).slice(0, 100) }); h.update(`${p}:ERROR`); }
  }
  return { digest: h.digest('hex'), files, ok: files.every((f) => f.ok), at: new Date().toISOString() };
}

/**
 * Runtime half: is the ladder live in the PAGE, not merely on the origin?
 *
 * Served bytes and executed bytes are different things when a service worker sits between them, and this
 * app registers one. Reads the ladder off the live replay system and reports which resource URL the page
 * actually loaded, so a stale cached copy is visible rather than assumed away.
 */
export async function readSpeed01Runtime(frame) {
  return frame.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    const out = { hasReplaySystem: !!rs, ladder: null, ladderSource: null, hasNearestRung: null, hasTargetGetter: null, govFlag: null, resource: null };
    if (rs) {
      // Product surface (SPEED-01): getSpeedLadderBarsPerSecond() / getTickSpeedLadder().
      // The ladder constant and _speedGovNearestRung are module-private; they are NOT on the
      // instance. A probe that only looked for getSpeedLadder() / rs._speedGovNearestRung
      // reported "this build has no governor" on a live b122 whose getTargetBarsPerSecond()
      // was already delivering the requested 10 bars/s — a false red that would have blocked
      // the soak on a working build. Prefer the real getters; keep the old names as fallbacks.
      for (const [name, get] of [
        ['getSpeedLadderBarsPerSecond()', () => (typeof rs.getSpeedLadderBarsPerSecond === 'function' ? rs.getSpeedLadderBarsPerSecond() : undefined)],
        ['getTickSpeedLadder()', () => (typeof rs.getTickSpeedLadder === 'function' ? rs.getTickSpeedLadder() : undefined)],
        ['getSpeedLadder()', () => (typeof rs.getSpeedLadder === 'function' ? rs.getSpeedLadder() : undefined)],
        ['SPEED_GOV_LADDER_BPS', () => rs.SPEED_GOV_LADDER_BPS ?? rs.constructor?.SPEED_GOV_LADDER_BPS],
        ['speedLadder', () => rs.speedLadder],
      ]) {
        let v; try { v = get(); } catch (_) { continue; }
        if (Array.isArray(v) && v.length) { out.ladder = v.slice(0, 20); out.ladderSource = name; break; }
      }
      out.hasNearestRung = typeof rs._speedGovNearestRung === 'function'
        || typeof rs.getSpeedLadderBarsPerSecond === 'function';
      out.hasTargetGetter = typeof rs.getTargetBarsPerSecond === 'function';
    }
    try { out.govFlag = window.__TALARIA_SPEED_GOV_V1 ?? null; } catch (_) { out.govFlag = null; }
    try {
      const e = performance.getEntriesByType('resource').find((r) => /replay-system\.js/.test(r.name));
      if (e) out.resource = { name: e.name, transferSize: e.transferSize, decodedBodySize: e.decodedBodySize, fromServiceWorker: !!e.workerStart };
    } catch (_) { /* resource timing unavailable */ }
    return out;
  });
}

/**
 * The ladder is the integers 1..10; anything else means the governor is absent or different.
 *
 * SEAL-EVIDENCE-01: this grade carries its own `evidenceClass`, because two of its three passing
 * routes are not the same strength of evidence and were previously both reported as a bare `ok`.
 *
 *   LADDER_OBSERVED   the ladder array was read off the live object and matches. Behaviour.
 *   CAPABILITY_PRESENT the array is module-private, so the grade falls back to two functions
 *                     EXISTING. That is configured intent, not observed behaviour — `typeof` says
 *                     nothing about what the governor does when asked for a speed. Still passes,
 *                     because refusing would false-red a working build (it did once), but it must
 *                     not be quoted as behavioural proof. The behavioural companion is the soak's
 *                     effective-speed readback, which calls getTargetBarsPerSecond() and refuses
 *                     on a mismatch or a null.
 */
export function gradeRuntimeLadder(runtime, expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  if (!runtime || !runtime.hasReplaySystem) {
    return { ok: false, evidenceClass: 'UNREADABLE', why: 'no replaySystem on the page' };
  }
  if (!Array.isArray(runtime.ladder)) {
    const ok = runtime.hasNearestRung === true && runtime.hasTargetGetter === true;
    if (ok) {
      return {
        ok: true,
        evidenceClass: 'CAPABILITY_PRESENT',
        behaviouralEvidence: false,
        why: 'ladder array not exposed; the snap function and target getter both EXIST. Presence only — '
          + 'pair this with the effective-speed readback before treating the governor as verified.',
      };
    }
    const missing = [
      runtime.hasNearestRung === true ? null : 'nearest-rung/ladder accessor',
      runtime.hasTargetGetter === true ? null : 'getTargetBarsPerSecond',
    ].filter(Boolean).join(' + ');
    return {
      ok: false,
      evidenceClass: 'CAPABILITY_ABSENT',
      behaviouralEvidence: false,
      why: `ladder array not reachable; missing ${missing || 'governor accessors'}`,
    };
  }
  const same = runtime.ladder.length === expected.length && runtime.ladder.every((v, i) => Number(v) === expected[i]);
  return {
    ok: same,
    evidenceClass: 'LADDER_OBSERVED',
    behaviouralEvidence: true,
    why: same ? null : `ladder is [${runtime.ladder.join(',')}], expected [${expected.join(',')}]`,
  };
}
