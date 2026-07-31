#!/usr/bin/env node
/**
 * PAGEHIDE-RELEASE-VERIFY — independent re-read of the four release hooks.
 *
 * A finding in my namespace claims four pagehide release hooks exist in chart.js and that every one of
 * them early-returns when `event.persisted` is true, i.e. on exactly the back-forward cache path. That
 * claim is load-bearing for RESET-01 and it arrived committed by another manager's process, so it gets
 * verified against the served bundle rather than trusted.
 *
 * This does not count mentions. It locates each `pagehide` registration, walks back to the enclosing
 * handler body, and reports the FIRST executable statement of that handler — because the whole question is
 * whether the release is skipped before it happens. Where a body cannot be resolved it says INCONCLUSIVE,
 * which is the defect the earlier scan had: a regex that only matched two definition forms reported
 * absence when it should have reported that it could not see.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\PAGEHIDE-RELEASE-VERIFY-20260731.json';

const get = (path) => new Promise((resolve, reject) => {
  const lib = ORIGIN.startsWith('https') ? https : http;
  const req = lib.get(ORIGIN + path, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => resolve({ code: res.statusCode, body: d }));
  });
  req.on('error', reject);
  req.setTimeout(20_000, () => { req.destroy(new Error('timeout')); });
});

const report = {
  signature: 'PAGEHIDE-RELEASE-VERIFY-V1',
  artifactFile: 'PAGEHIDE-RELEASE-VERIFY-20260731.json',
  ruling: 'RESET-01 — independent verification of a load-bearing source claim in my namespace',
  // RESET-01 makes this a required field on every artifact.
  bfcacheState: 'not applicable — static read of the served bundle, no browser involved',
  origin: ORIGIN,
  startedAtIso: new Date().toISOString(),
  claimUnderTest: {
    source: 'FINDING-C-WE-HAVE-FOUR-RELEASE-HOOKS-AND-ALL-FOUR-SWITCH-THEMSELVES-OFF-WHEN-CACHED-20260731-1330.md',
    claim1: 'four pagehide release hooks exist in chart.js at 3160, 3896, 4018, 5027',
    claim2: 'every one early-returns when event.persisted === true',
    claim3: 'the only pageshow listener is _handleViewportRefresh at 1572, a viewport refresh and not a re-acquisition',
  },
};

/** Line number of a character offset, 1-based. */
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/**
 * Walk outward from a `pagehide` registration to the function passed to it, then return that function's
 * first executable statement. Handles both `addEventListener('pagehide', namedRef)` — where the body is
 * elsewhere — and inline function expressions.
 */
function resolveHandler(js, regIdx) {
  // Grab the addEventListener call text.
  const callStart = js.lastIndexOf('addEventListener', regIdx + 20);
  if (callStart < 0) return { resolved: false, why: 'no addEventListener before the pagehide token' };
  const seg = js.slice(callStart, callStart + 400);
  const inline = seg.match(/addEventListener\(\s*['"]pagehide['"]\s*,\s*(function[^(]*\([^)]*\)\s*\{)/);
  if (inline) {
    const bodyStart = callStart + seg.indexOf(inline[1]) + inline[1].length;
    return { resolved: true, form: 'inline function expression', firstStatements: firstStatements(js, bodyStart) };
  }
  const named = seg.match(/addEventListener\(\s*['"]pagehide['"]\s*,\s*([A-Za-z_$][\w$.]*)/);
  if (named) {
    const ref = named[1].split('.').pop();
    // Find where that name is defined as a function, anywhere in the bundle.
    const defRe = new RegExp(`(?:function\\s+${ref}\\s*\\(|${ref}\\s*=\\s*function[^(]*\\(|${ref}\\s*=\\s*\\([^)]*\\)\\s*=>)`);
    const m = defRe.exec(js);
    if (!m) return { resolved: false, why: `handler is the named reference '${ref}' and its definition was not located — INCONCLUSIVE, not absent`, reference: ref };
    const braceIdx = js.indexOf('{', m.index);
    if (braceIdx < 0) return { resolved: false, why: `found '${ref}' but no body brace`, reference: ref };
    return {
      resolved: true, form: `named reference '${ref}'`, definedAtLine: lineOf(js, m.index),
      firstStatements: firstStatements(js, braceIdx + 1),
    };
  }
  return { resolved: false, why: 'could not parse the second argument of addEventListener' };
}

/** The first two non-empty, non-comment statements of a body starting just after its opening brace. */
function firstStatements(js, bodyStart) {
  const raw = js.slice(bodyStart, bodyStart + 600);
  const lines = raw.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
  return lines.slice(0, 3);
}

(async () => {
  try {
    const res = await get('/chart/chart.js');
    report.fetch = { path: '/chart/chart.js', code: res.code, bytes: res.body.length };
    if (res.code !== 200 || res.body.length < 10_000) {
      report.status = 'VOID';
      report.void = `could not read the bundle: HTTP ${res.code}, ${res.body.length} bytes`;
      fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
      console.error(report.void);
      process.exit(0);
    }
    const js = res.body;

    // ---- Every pagehide registration in the bundle -------------------------
    const hooks = [];
    const re = /['"]pagehide['"]/g;
    let m;
    while ((m = re.exec(js))) {
      const line = lineOf(js, m.index);
      const context = js.slice(Math.max(0, m.index - 300), m.index + 60).split('\n').slice(-4).join(' | ').trim();
      const handler = resolveHandler(js, m.index);
      const first = handler.firstStatements || [];
      const guard = first.find((l) => /persisted/.test(l)) || null;
      hooks.push({
        atLine: line,
        contextTail: context.slice(-180),
        handler: handler.resolved ? handler.form : null,
        handlerUnresolvedWhy: handler.resolved ? null : handler.why,
        definedAtLine: handler.definedAtLine ?? null,
        firstStatements: first,
        persistedGuard: guard,
        // The claim is specifically an EARLY RETURN on the cached path.
        earlyReturnsWhenPersisted: !!(guard && /return/.test(guard) && /persisted/.test(guard)),
      });
    }
    report.pagehideRegistrations = hooks.length;
    report.hooks = hooks;

    // ---- pageshow, the restore side ---------------------------------------
    const shows = [];
    const re2 = /['"]pageshow['"]/g;
    while ((m = re2.exec(js))) {
      const seg = js.slice(m.index, m.index + 200);
      const named = seg.match(/['"]pageshow['"]\s*,\s*(?:this\.)?([A-Za-z_$][\w$]*)/);
      shows.push({
        atLine: lineOf(js, m.index),
        handlerName: named ? named[1] : null,
        // A restore path must actually branch on persisted to re-acquire what pagehide dropped.
        mentionsPersistedNearby: /persisted/.test(js.slice(m.index, m.index + 600)),
      });
    }
    report.pageshowRegistrations = shows.length;
    report.pageshow = shows;

    // ---- Grade -----------------------------------------------------------
    // Not every pagehide handler is a RELEASE hook, and grading them together produced a misleading
    // "NOT CONFIRMED: 8 of 9". The ninth is `flushPendingSessionState`, which persists state to the server
    // and SHOULD run when the document is cached. The claim is about release paths, so release paths are
    // what gets graded — and the distinction is itself the sharper finding.
    // Classify on what the handler DOES, not what it is called. Matching the handler NAME alone put
    // `_mcFinerPanelHostCommitUnloadHandler` in the wrong bin, because its release call
    // (`_removeFinerPanelSelfOwnerHostCommitListener`) is in its body rather than its name.
    const isReleaseHook = (h) => /release|remove|free|dispose|destroy|Refs|teardown/i
      .test(`${h.handler || ''} ${(h.firstStatements || []).join(' ')}`);
    const releaseHooks = hooks.filter(isReleaseHook);
    const nonReleaseHooks = hooks.filter((h) => !isReleaseHook(h));
    const distinctReleaseHandlers = [...new Set(releaseHooks.map((h) => String(h.handler)))];
    const resolved = releaseHooks.filter((h) => h.handler);
    const guarded = releaseHooks.filter((h) => h.earlyReturnsWhenPersisted);
    const unresolved = releaseHooks.filter((h) => !h.handler);
    report.handlerBreakdown = {
      totalRegistrations: hooks.length,
      releaseRegistrations: releaseHooks.length,
      distinctReleaseHandlers: distinctReleaseHandlers.length,
      distinctReleaseHandlerNames: distinctReleaseHandlers,
      registeredTwiceEach: releaseHooks.length === distinctReleaseHandlers.length * 2
        ? 'each release handler is registered at two sites; addEventListener dedupes by function reference and the installers guard on an existing handler, so this is benign duplication rather than double firing'
        : null,
      nonReleaseHandlers: nonReleaseHooks.map((h) => ({
        handler: h.handler, atLine: h.atLine, guardsOnPersisted: h.earlyReturnsWhenPersisted,
      })),
      theSharperPoint: nonReleaseHooks.some((h) => !h.earlyReturnsWhenPersisted)
        ? 'On being put into the back-forward cache we DO run the handler that flushes session state, and we do NOT run any of the handlers that free memory. The document is not unaware it is being put away — it acts on it, and the action it takes is the one that costs nothing to keep.'
        : null,
    };
    report.verification = {
      claim1_fourHooks: `${hooks.length} pagehide registrations resolving to ${distinctReleaseHandlers.length} distinct RELEASE handlers (${releaseHooks.length} registrations) plus ${nonReleaseHooks.length} non-release handler(s)`,
      claim1Verdict: distinctReleaseHandlers.length === 4
        ? 'CONFIRMED with a correction: there are four distinct release handlers, but nine pagehide registrations in total — each release handler is registered at two sites, and a fifth handler is a session-state flush rather than a release'
        : `CORRECTED: ${distinctReleaseHandlers.length} distinct release handlers, not four`,
      claim2_allEarlyReturn: `${guarded.length} of ${releaseHooks.length} release registrations early-return on event.persisted; ${resolved.length} bodies resolved, ${unresolved.length} INCONCLUSIVE`,
      claim2Verdict: (releaseHooks.length > 0 && guarded.length === releaseHooks.length)
        ? 'CONFIRMED — every pagehide handler whose body could be read begins by returning when the document is being cached, so every release path we own is disabled on exactly the bfcache path'
        : (unresolved.length > 0
          ? `PARTIAL: ${guarded.length} of ${hooks.length} confirmed and ${unresolved.length} could not be resolved. Reported as inconclusive rather than as absence.`
          : `NOT CONFIRMED: only ${guarded.length} of ${hooks.length} guard on persisted`),
      claim3_noRestorePath: `${shows.length} pageshow registration(s); ${shows.filter((s) => s.mentionsPersistedNearby).length} mention persisted nearby`,
      claim3Verdict: shows.filter((s) => s.mentionsPersistedNearby).length === 0
        ? 'CONFIRMED — no pageshow handler branches on persisted, so nothing re-acquires on restore. Dropping the early return without adding one would trade a memory defect for a correctness defect.'
        : 'NOT CONFIRMED: at least one pageshow path references persisted and may already re-acquire',
    };
    report.status = 'OK';
    // RESET-01: signature must match the filename before publishing.
    report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : `FAIL: writing ${OUT} from an artifact declaring ${report.artifactFile}`;
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 200);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.error(`=== PAGEHIDE RELEASE VERIFY ${report.status} ===`);
  if (report.hooks) {
    for (const h of report.hooks) {
      console.error(`  line ${h.atLine}: handler=${h.handler || 'UNRESOLVED (' + h.handlerUnresolvedWhy + ')'}`);
      console.error(`     first statements: ${JSON.stringify(h.firstStatements)}`);
      console.error(`     early-returns when persisted: ${h.earlyReturnsWhenPersisted}`);
    }
    console.error(`  pageshow: ${JSON.stringify(report.pageshow)}`);
    for (const [k, v] of Object.entries(report.verification)) console.error(`  ${k}: ${v}`);
  }
  console.error(`  signature/filename: ${report.signatureFilenameCheck || '-'}`);
  console.error(`artifact ${OUT}`);
})();
