#!/usr/bin/env node
/**
 * Live-surface probe — report what the RUNNING system returns.
 *
 * Answers DISPATCH-BC-20260728-1610 §4. Exists because DEPLOY-01's edge clause
 * ("a fix is not shipped until the artifact the user loads is shown to contain it")
 * was unsatisfiable: nothing in this repository could tell us what the deployed
 * surface serves, so the clause and D-5's single-push rule deadlocked.
 *
 * THE POINT OF THIS TOOL IS THE THIRD STATE.
 *
 *   PRESENT       we hold bytes, we proved they are the artifact, the marker is in them
 *   ABSENT        we hold bytes, we proved they are the artifact, the marker is NOT in them
 *   UNDETERMINED  anything else, with a reason
 *
 * ABSENT is a load-bearing claim: it means the deployed surface is serving a build
 * without the fix. It is only ever emitted when identity was independently
 * established first. A 404, a 401, a timeout, or an HTML login page returned with
 * status 200 are all UNDETERMINED. Reporting those as ABSENT would manufacture an
 * incident; reporting them as PRESENT would hide one. Both are worse than "I could
 * not tell you", which is why that is a first-class result rather than an error.
 *
 * SAFETY. Read-only by construction: GET and HEAD only, enforced in the one function
 * that issues requests. Safe to point at production. Sends no credential unless one
 * is explicitly supplied, and never writes one to output.
 *
 * USAGE (one command, per the PO constraint):
 *   node live-surface-probe.mjs --base-url=https://host
 *
 * Optional:
 *   --module=/chart/modules/order-manager.js   (default; repeatable)
 *   --marker=journalVouchedFor                 (default; repeatable)
 *   --session-id=123                           probe GET /api/sessions/{id}
 *   --token=...   or  env LIVE_PROBE_TOKEN     bearer credential, never printed
 *   --out=DIR                                  write EVID-01 evidence to DIR
 *   --timeout-ms=10000
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PRESENT = 'PRESENT';
const ABSENT = 'ABSENT';
const UNDETERMINED = 'UNDETERMINED';

/**
 * Structural anchors that identify the artifact as order-manager.js REGARDLESS of
 * whether the fix is in it. They must be things the pre-fix and post-fix builds
 * both contain, or identity would be a proxy for the marker and ABSENT could never
 * be distinguished from "served something else".
 */
const MODULE_IDENTITY_ANCHORS = ['class OrderManager', 'persistJournal'];
const MIN_PLAUSIBLE_MODULE_BYTES = 2048;

function usage(msg) {
    if (msg) console.error(`\n${msg}`);
    console.error(`
live-surface-probe — report what the running deployment serves. Read-only.

  node live-surface-probe.mjs --base-url=https://host [options]

  --base-url=URL        required
  --module=PATH         module path to fetch (repeatable)
                        default: /chart/modules/order-manager.js
  --marker=STRING       string to look for in the module (repeatable)
                        default: journalVouchedFor
  --shell=PATH          HTML shell to read the build id from (repeatable)
  --session-id=ID       also probe GET /api/sessions/{ID}
  --token=TOKEN         bearer token; or set LIVE_PROBE_TOKEN. Never printed.
  --cookie=COOKIE       session cookie for auth-gated shells; or LIVE_PROBE_COOKIE. Never printed.
  --out=DIR             write an immutable JSON record here (EVID-01)
  --timeout-ms=N        per-request timeout, default 10000
  --json                machine-readable output only

Exit codes:
  0  every finding was PRESENT
  1  at least one finding was ABSENT   (the surface lacks the fix)
  3  at least one finding was UNDETERMINED and none were ABSENT
  2  the probe could not run at all (bad arguments)
`);
    process.exit(msg ? 64 : 0);
}

function parseArgs(argv) {
    const out = { modules: [], markers: [], shells: [], timeoutMs: 10000, json: false };
    for (const a of argv) {
        const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
        if (!m) usage(`Unrecognised argument: ${a}`);
        const [, k, v] = m;
        if (k === 'help') usage();
        else if (k === 'base-url') out.baseUrl = v;
        else if (k === 'module') out.modules.push(v);
        else if (k === 'marker') out.markers.push(v);
        else if (k === 'shell') out.shells.push(v);
        else if (k === 'session-id') out.sessionId = v;
        else if (k === 'token') out.token = v;
        else if (k === 'cookie') out.cookie = v;
        else if (k === 'out') out.out = v;
        else if (k === 'timeout-ms') out.timeoutMs = Number(v);
        else if (k === 'json') out.json = true;
        else usage(`Unrecognised option: --${k}`);
    }
    if (!out.modules.length) out.modules = ['/chart/modules/order-manager.js'];
    if (!out.markers.length) out.markers = ['journalVouchedFor'];
    if (!out.shells.length) {
        out.shells = ['/chart/dist-v9/index.html', '/chart/legacy-index.html',
            '/chart/multichart-prod/chart-embed.html'];
    }
    out.token = out.token || process.env.LIVE_PROBE_TOKEN || null;
    out.cookie = out.cookie || process.env.LIVE_PROBE_COOKIE || null;
    return out;
}

/** A credential must never reach stdout or the evidence file. */
function redact(s, token) {
    let v = String(s ?? '');
    if (token) v = v.split(token).join('«redacted»');
    return v.replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//«redacted»@');
}

/**
 * The ONLY function that performs network I/O, so read-only is enforced in one
 * place rather than trusted across call sites. A non-GET/HEAD method is a
 * programming error and throws rather than being sent.
 */
async function readOnlyFetch(url, { method = 'GET', token, cookie, timeoutMs }) {
    if (method !== 'GET' && method !== 'HEAD') {
        throw new Error(`live-surface-probe is read-only; refusing method ${method}`);
    }
    const headers = { 'cache-control': 'no-cache' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (cookie) headers.cookie = cookie;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
        // 'manual', never 'follow'. A redirect is a statement about the surface and
        // must reach the report intact. Following one lets an auth gate answer for the
        // shell: the probe describes the login page and calls it an unstamped build.
        const res = await fetch(url, { method, headers, redirect: 'manual', signal: ac.signal });
        const body = method === 'HEAD' ? '' : await res.text();
        return {
            ok: true,
            status: res.status,
            location: res.headers.get('location'),
            finalUrl: res.url || url,
            contentType: res.headers.get('content-type') || null,
            bytes: Buffer.byteLength(body, 'utf8'),
            body,
            elapsedMs: Date.now() - startedAt,
            cache: {
                cfCacheStatus: res.headers.get('cf-cache-status'),
                age: res.headers.get('age'),
                etag: res.headers.get('etag'),
                lastModified: res.headers.get('last-modified'),
                cacheControl: res.headers.get('cache-control'),
            },
        };
    } catch (err) {
        return {
            ok: false,
            transportError: err?.name === 'AbortError'
                ? `timed out after ${timeoutMs}ms`
                : (err?.cause?.code || err?.message || String(err)),
            elapsedMs: Date.now() - startedAt,
        };
    } finally {
        clearTimeout(timer);
    }
}

const LOGIN_LIKE = /\/(login|signin|sign-in|auth|account)\b/i;

/**
 * A redirect is never followed, so it always has to be explained rather than
 * silently resolved. A redirect to a login route is the specific case that
 * produced a false "unstamped build" reading on 2026-07-28: the shell is gated,
 * not unstamped, and the two demand completely different responses.
 */
function describeRedirect(res) {
    const to = res.location || '(no location header)';
    if (res.location && LOGIN_LIKE.test(res.location)) {
        return `HTTP ${res.status} to ${to} — this path is behind an authentication gate. `
            + 'The probe did not follow it, because the page on the other side is not this '
            + 'shell and must not be described as if it were. Supply --cookie or --token to '
            + 'see what a signed-in user is actually served. This is CANNOT DETERMINE, not absent.';
    }
    return `HTTP ${res.status} to ${to} — redirect not followed. Re-point the probe at the `
        + 'destination if that is the surface you meant to inspect.';
}

function looksLikeHtml(contentType, body) {
    if (contentType && /text\/html/i.test(contentType)) return true;
    return /^\s*(<!doctype html|<html[\s>])/i.test(body.slice(0, 400));
}

/**
 * Establish that the bytes we hold ARE the module, before any statement about
 * what is or is not inside them. This is the guard that stops an SPA fallback —
 * a login page or index.html returned with status 200 — from being reported as a
 * module that lacks the fix.
 */
function establishModuleIdentity(res) {
    if (!res.ok) return { identified: false, reason: `transport failure: ${res.transportError}` };
    if (res.status === 401 || res.status === 403) {
        return { identified: false, reason: `HTTP ${res.status}: the surface requires a credential to serve this path` };
    }
    if (res.status === 404) {
        return { identified: false, reason: 'HTTP 404: nothing served at this path — the path may be wrong, not the build' };
    }
    if (res.status >= 400) return { identified: false, reason: `HTTP ${res.status}` };
    if (res.status >= 300) return { identified: false, reason: describeRedirect(res) };
    if (looksLikeHtml(res.contentType, res.body)) {
        return {
            identified: false,
            reason: `HTTP 200 but the body is HTML (content-type ${res.contentType || 'unset'}) — `
                + 'almost certainly a fallback page, not the module. This is the case that would '
                + 'otherwise be misreported as ABSENT.',
        };
    }
    if (res.bytes < MIN_PLAUSIBLE_MODULE_BYTES) {
        return { identified: false, reason: `HTTP 200 but only ${res.bytes} bytes — too small to be the module` };
    }
    const missing = MODULE_IDENTITY_ANCHORS.filter((a) => !res.body.includes(a));
    if (missing.length) {
        return {
            identified: false,
            reason: `HTTP 200 with ${res.bytes} bytes, but the structural anchors ${JSON.stringify(missing)} `
                + 'are not present, so this is not recognisably order-manager.js. Refusing to report on '
                + 'the contents of a file we cannot identify.',
        };
    }
    return { identified: true };
}

async function probeModule(base, modulePath, markers, opts) {
    const url = new URL(modulePath, base).toString();
    const res = await readOnlyFetch(url, { token: opts.token, cookie: opts.cookie, timeoutMs: opts.timeoutMs });
    const identity = establishModuleIdentity(res);
    const finding = {
        kind: 'module',
        url: redact(url, opts.token),
        status: res.ok ? res.status : null,
        transportError: res.ok ? null : res.transportError,
        bytes: res.ok ? res.bytes : null,
        contentType: res.ok ? res.contentType : null,
        cache: res.ok ? res.cache : null,
        stampInUrl: /[?&]v=([^&#]+)/.exec(modulePath)?.[1] ?? null,
        identified: identity.identified,
        markers: {},
    };
    for (const marker of markers) {
        finding.markers[marker] = identity.identified
            ? {
                state: res.body.includes(marker) ? PRESENT : ABSENT,
                occurrences: res.body.split(marker).length - 1,
            }
            : { state: UNDETERMINED, reason: identity.reason };
    }
    return finding;
}

/**
 * GET /api/sessions/{id}. An unauthenticated 401 is a perfectly good answer to
 * "is this endpoint reachable" and is NOT evidence the endpoint is missing —
 * it is reported as UNDETERMINED with the reason, never as ABSENT.
 */
async function probeSessionEndpoint(base, sessionId, opts) {
    const url = new URL(`/api/sessions/${encodeURIComponent(sessionId)}`, base).toString();
    const res = await readOnlyFetch(url, { token: opts.token, cookie: opts.cookie, timeoutMs: opts.timeoutMs });
    const finding = {
        kind: 'session-endpoint',
        url: redact(url, opts.token),
        credentialSupplied: Boolean(opts.token || opts.cookie),
        status: res.ok ? res.status : null,
        transportError: res.ok ? null : res.transportError,
        state: UNDETERMINED,
        reason: null,
        sessionName: null,
    };
    if (!res.ok) {
        finding.reason = `transport failure: ${res.transportError}`;
        return finding;
    }
    if (res.status === 401 || res.status === 403) {
        finding.reason = opts.token
            ? `HTTP ${res.status}: the supplied credential was rejected — reachability confirmed, contents not`
            : `HTTP ${res.status}: endpoint is reachable and refused an unauthenticated read, which is correct behaviour. `
              + 'Supply --token to read the body.';
        finding.reachable = true;
        return finding;
    }
    if (res.status !== 200) {
        finding.reason = `HTTP ${res.status}`;
        return finding;
    }
    if (looksLikeHtml(res.contentType, res.body)) {
        finding.reason = 'HTTP 200 but the body is HTML, not JSON — a fallback page, not the API';
        return finding;
    }
    let parsed;
    try {
        parsed = JSON.parse(res.body);
    } catch {
        finding.reason = `HTTP 200 but the body is not JSON (content-type ${res.contentType || 'unset'})`;
        return finding;
    }
    const name = parsed?.session?.name;
    if (typeof name !== 'string') {
        finding.state = ABSENT;
        finding.reason = 'HTTP 200 with a JSON body, but it carries no .session.name — '
            + 'the field B-W19 depends on is genuinely not served here';
        return finding;
    }
    finding.state = PRESENT;
    finding.reachable = true;
    finding.sessionName = name;
    return finding;
}

/** Build ids the surface reports, per shell, plus whether the shells agree. */
async function probeBuildIds(base, shells, opts) {
    const perShell = [];
    for (const shell of shells) {
        const url = new URL(shell, base).toString();
        const res = await readOnlyFetch(url, { token: opts.token, cookie: opts.cookie, timeoutMs: opts.timeoutMs });
        if (!res.ok) {
            perShell.push({ shell, state: UNDETERMINED, reason: `transport failure: ${res.transportError}` });
            continue;
        }
        if (res.status >= 300 && res.status < 400) {
            perShell.push({
                shell, status: res.status, state: UNDETERMINED,
                redirectedTo: res.location, reason: describeRedirect(res),
            });
            continue;
        }
        if (res.status !== 200) {
            perShell.push({ shell, status: res.status, state: UNDETERMINED, reason: `HTTP ${res.status}` });
            continue;
        }
        const stamps = [...new Set([...res.body.matchAll(/[?&]v=([0-9]{8}[ab][0-9]+)/g)].map((m) => m[1]))];
        const declared = /__TALARIA_CHART_BUILD_ID\s*=\s*(?:p\.get\('v'\)\s*\|\|\s*)?'([^']+)'/.exec(res.body)?.[1] ?? null;
        if (!stamps.length && !declared) {
            perShell.push({
                shell,
                status: 200,
                state: UNDETERMINED,
                reason: 'served, but carries no recognisable build id — an unstamped build cannot be named',
            });
            continue;
        }
        perShell.push({ shell, status: 200, state: PRESENT, stamps, declaredBuildId: declared });
    }
    const seen = [...new Set(perShell.flatMap((s) => s.stamps || []).concat(
        perShell.map((s) => s.declaredBuildId).filter(Boolean),
    ))];
    return {
        kind: 'build-id',
        perShell,
        distinctBuildIds: seen,
        coherent: seen.length <= 1,
        coherenceNote: seen.length > 1
            ? 'Shells disagree. They share /chart/modules/* URLs, so one surface can serve a module '
              + 'another has already cache-busted.'
            : null,
    };
}

function summarise(findings) {
    const states = [];
    for (const f of findings) {
        if (f.kind === 'module') states.push(...Object.values(f.markers).map((m) => m.state));
        else if (f.kind === 'session-endpoint') states.push(f.state);
        // A shell list that was never probed contributes nothing. Treating "we asked
        // about no shells" as UNDETERMINED would make every verdict undetermined.
        else if (f.kind === 'build-id' && f.perShell.length) {
            states.push(f.perShell.every((s) => s.state === PRESENT) ? PRESENT : UNDETERMINED);
        }
    }
    if (states.includes(ABSENT)) return { verdict: ABSENT, exitCode: 1 };
    if (states.includes(UNDETERMINED)) return { verdict: UNDETERMINED, exitCode: 3 };
    return { verdict: PRESENT, exitCode: 0 };
}

function render(report) {
    const L = [];
    L.push('');
    L.push(`LIVE SURFACE PROBE  ${report.baseUrl}`);
    L.push(`${report.startedAtUtc}   read-only: GET/HEAD only, no writes issued`);
    L.push('');
    for (const f of report.findings) {
        if (f.kind === 'module') {
            L.push(`MODULE  ${f.url}`);
            L.push(`  http ${f.status ?? '—'}   ${f.bytes ?? '—'} bytes   ${f.contentType ?? '—'}`);
            if (f.transportError) L.push(`  transport: ${f.transportError}`);
            if (f.cache) {
                const c = f.cache;
                L.push(`  cache: cf-cache-status=${c.cfCacheStatus ?? '—'} age=${c.age ?? '—'} etag=${c.etag ?? '—'}`);
            }
            L.push(`  identified as the module: ${f.identified ? 'yes' : 'NO'}`);
            for (const [marker, r] of Object.entries(f.markers)) {
                L.push(`  ${r.state.padEnd(13)} ${marker}${r.state === PRESENT ? `  (${r.occurrences}x)` : ''}`);
                if (r.reason) L.push(`      why undetermined: ${r.reason}`);
            }
            L.push('');
        } else if (f.kind === 'session-endpoint') {
            L.push(`SESSION ENDPOINT  ${f.url}`);
            L.push(`  http ${f.status ?? '—'}   credential supplied: ${f.credentialSupplied ? 'yes' : 'no'}`);
            L.push(`  ${f.state}${f.sessionName ? `  name=${JSON.stringify(f.sessionName)}` : ''}`);
            if (f.reason) L.push(`      ${f.reason}`);
            L.push('');
        } else if (f.kind === 'build-id') {
            L.push('BUILD ID REPORTED BY THE SURFACE');
            for (const s of f.perShell) {
                const val = s.state === PRESENT
                    ? `${(s.stamps || []).join(', ') || '—'}${s.declaredBuildId ? `  declared=${s.declaredBuildId}` : ''}`
                    : s.reason;
                L.push(`  ${s.state.padEnd(13)} ${s.shell}`);
                L.push(`      ${val}`);
            }
            if (f.coherenceNote) L.push(`  INCOHERENT: ${f.coherenceNote}`);
            L.push('');
        }
    }
    L.push(`VERDICT: ${report.summary.verdict}`);
    if (report.summary.verdict === UNDETERMINED) {
        L.push('  "Undetermined" is a result, not a failure of the probe. It means the running');
        L.push('  system did not give us enough to answer. Do NOT read it as "the fix is absent".');
    }
    if (report.summary.verdict === ABSENT) {
        L.push('  The surface was identified and does NOT carry the marker. The deployed build');
        L.push('  lacks the fix, or an intermediary is serving a cached copy that predates it.');
    }
    L.push('');
    return L.join('\n');
}

/** EVID-01: written once, never overwritten by a later run. */
function writeEvidence(dir, report, token) {
    fs.mkdirSync(dir, { recursive: true });
    const host = (() => { try { return new URL(report.baseUrl).host.replace(/[^\w.-]/g, '_'); } catch { return 'unknown-host'; } })();
    const stamp = report.startedAtUtc.replace(/[:.]/g, '-');
    const file = path.join(dir, `probe-${stamp}-${host}.json`);
    if (fs.existsSync(file)) {
        console.error(`REFUSED: ${file} already exists. EVID-01: a probe record is written once.`);
        process.exit(2);
    }
    const serialised = redact(JSON.stringify(report, null, 2), token);
    fs.writeFileSync(file, `${serialised}\n`, { flag: 'wx' });
    try { fs.chmodSync(file, 0o444); } catch { /* best effort; the wx flag is the real guard */ }
    return file;
}

export async function probe(opts) {
    const startedAtUtc = new Date().toISOString();
    const findings = [];
    for (const m of opts.modules) findings.push(await probeModule(opts.baseUrl, m, opts.markers, opts));
    if (opts.sessionId != null) findings.push(await probeSessionEndpoint(opts.baseUrl, opts.sessionId, opts));
    findings.push(await probeBuildIds(opts.baseUrl, opts.shells, opts));
    const report = {
        tool: 'live-surface-probe',
        contract: 'PRESENT = identified and found. ABSENT = identified and not found. '
            + 'UNDETERMINED = could not identify, with a reason. ABSENT is never inferred from a failure.',
        startedAtUtc,
        baseUrl: redact(opts.baseUrl, opts.token),
        credentialSupplied: Boolean(opts.token || opts.cookie),
        readOnly: true,
        findings,
    };
    report.summary = summarise(findings);
    return report;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.baseUrl) usage('--base-url is required.');
    try { new URL(opts.baseUrl); } catch { usage(`--base-url is not a URL: ${opts.baseUrl}`); }
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) usage('--timeout-ms must be a positive number.');

    const report = await probe(opts);
    if (opts.out) report.evidenceFile = writeEvidence(opts.out, report, opts.token);
    console.log(opts.json ? redact(JSON.stringify(report, null, 2), opts.token) : render(report));
    if (report.evidenceFile) console.log(`evidence: ${report.evidenceFile}\n`);

    // Set the code and let the loop drain. Calling process.exit() here races
    // libuv's teardown of the fetch handles and aborts the process on Windows with
    // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — the report is
    // printed correctly and then the exit code is replaced by a crash code, which
    // would make the PO's one command look like the probe had broken. The unref'd
    // timer is a backstop for a keep-alive socket holding the loop open.
    process.exitCode = report.summary.exitCode;
    setTimeout(() => process.exit(report.summary.exitCode), 3000).unref();
}

// pathToFileURL, not string concatenation: on Windows import.meta.url is
// file:///C:/... and a hand-built file://C:/... never matches, so the CLI would
// silently produce no output while every in-process test still passed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

export { ABSENT, PRESENT, UNDETERMINED, establishModuleIdentity, parseArgs, readOnlyFetch, redact, summarise };
