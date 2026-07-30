#!/usr/bin/env node
/**
 * Live API probe for backend money row TAL-01926 (journal prune guard).
 *
 * Method (no auth write required for reachability; write path when token provided):
 *  1) GET /api/sessions/{id}/state — prove API surface (401 = reachable-but-unread).
 *  2) Optional authenticated shorter journal PATCH without explicit replace — orphans must remain.
 *
 * Discriminator vs pre-fix: with guard ON, shorter additive PATCH must not delete
 * absent SQL journal trades. Without auth we still certify endpoint shape + document
 * the write recipe for B/PO.
 *
 * Usage:
 *   node scripts/backend-journal-prune-live-probe.mjs --base http://31.97.192.82:3000 --stamp 20260730b113
 *   node scripts/backend-journal-prune-live-probe.mjs --base ... --token <JWT> --session-id <id>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const stamp = arg('--stamp', '20260730b113');
const base = (arg('--base', 'http://31.97.192.82:3000') || '').replace(/\/$/, '');
const token = arg('--token', process.env.TALARIA_PROBE_TOKEN || null);
const sessionId = arg('--session-id', process.env.TALARIA_PROBE_SESSION_ID || '1');
const outPath = arg('--out', resolve(root, 'docs/plan3', `BACKEND-LIVE-PROBE-TAL-01926-${stamp}.json`));

async function req(method, path, body = null) {
  const headers = { accept: 'application/json', 'cache-control': 'no-cache' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body != null) headers['content-type'] = 'application/json';
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      redirect: 'follow',
      cache: 'no-store',
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return {
      ok: res.ok,
      status: res.status,
      url,
      len: text.length,
      json,
      snippet: text.slice(0, 240),
      html: /<!DOCTYPE|<html/i.test(text.slice(0, 200)),
    };
  } catch (e) {
    return { ok: false, status: 0, url, err: String(e), html: false, len: 0 };
  }
}

function journalIds(state) {
  const j = state?.journal || state?.state?.journal || [];
  if (!Array.isArray(j)) return [];
  return j.map((t) => t?.id ?? t?.tradeId ?? t?.client_trade_id).filter((x) => x != null);
}

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();

const healthCandidates = ['/api/health', '/health', '/api/sessions/1', `/api/sessions/${sessionId}/state`];
const reachability = [];
for (const p of healthCandidates) {
  reachability.push({ path: p, ...(await req('GET', p)) });
}

const stateGet = await req('GET', `/api/sessions/${sessionId}/state`);

let writeProbe = null;
if (token) {
  // Snapshot → PATCH with empty/short journal (additive path) → GET → orphans must remain.
  const before = await req('GET', `/api/sessions/${sessionId}/state`);
  const beforeIds = journalIds(before.json || {});
  const shortJournal = Array.isArray(before.json?.journal)
    ? before.json.journal.slice(0, Math.max(0, before.json.journal.length - 1))
    : [];
  const patch = await req('PATCH', `/api/sessions/${sessionId}/state`, {
    journal: shortJournal,
    // explicit_replace omitted / false — guard must refuse prune
  });
  const after = await req('GET', `/api/sessions/${sessionId}/state`);
  const afterIds = journalIds(after.json || {});
  const pruned = beforeIds.filter((id) => !afterIds.includes(id));
  writeProbe = {
    beforeCount: beforeIds.length,
    afterCount: afterIds.length,
    prunedCount: pruned.length,
    patchStatus: patch.status,
    pass: beforeIds.length === 0 ? null : pruned.length === 0,
    detail:
      beforeIds.length === 0
        ? 'no journal rows to discriminate — create fixture session first'
        : pruned.length === 0
          ? 'shorter PATCH did not prune absent trades — guard behaviour observed'
          : 'PRUNE OBSERVED — guard absent or off on live API',
  };
}

const endpointReachable =
  stateGet.status === 401 ||
  stateGet.status === 403 ||
  stateGet.status === 200 ||
  stateGet.status === 404;

let verdict;
let detail;
if (writeProbe && writeProbe.pass === true) {
  verdict = 'on-wire-api';
  detail = writeProbe.detail;
} else if (writeProbe && writeProbe.pass === false) {
  verdict = 'off-wire-api';
  detail = writeProbe.detail;
} else if (endpointReachable && !token) {
  verdict = 'api-reachable-unread';
  detail = `GET /api/sessions/${sessionId}/state → HTTP ${stateGet.status} (no token). Endpoint present; write discriminator needs --token + disposable session. Coordinate with B — do not wait.`;
} else if (!endpointReachable) {
  verdict = 'api-unreachable';
  detail = `state endpoint not responding as API (status=${stateGet.status}, html=${stateGet.html})`;
} else {
  verdict = 'api-reachable-unread';
  detail = 'insufficient auth/fixture for write discriminator';
}

const out = {
  schema: 'talaria.backend-live-probe.v1',
  ticket: 'M24 / TAL-01926',
  stamp,
  tip,
  base,
  sessionId: Number(sessionId),
  authProvided: Boolean(token),
  verdict,
  detail,
  reachability: reachability.map((r) => ({
    path: r.path,
    status: r.status,
    html: r.html,
    err: r.err || null,
  })),
  stateGet: {
    status: stateGet.status,
    html: stateGet.html,
    err: stateGet.err || null,
  },
  writeProbe,
  recipe: {
    green: 'PATCH journal shorter array without explicit_replace → prior SQL trades remain on subsequent GET',
    red: 'SESSION_JOURNAL_PATCH_DELETE_GUARD=0 → same PATCH prunes orphans',
    ownerFiles: ['session_journal_store.py', 'api_server.py (_sync_trading_session_journal_trades)'],
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  schema: out.schema,
  ticket: out.ticket,
  stamp,
  tip,
  verdict: out.verdict,
  detail: out.detail,
  outPath,
}, null, 2));

if (verdict === 'off-wire-api') process.exit(2);
