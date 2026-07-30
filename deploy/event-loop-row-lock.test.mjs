// GATE: an async FastAPI endpoint must not take a PostgreSQL row lock on the event loop.
//
// THE DEFECT THIS GATE EXISTS FOR
// `async def chart_window_claim` opens a SYNCHRONOUS SQLAlchemy session and calls
// `_lock_user_for_session_quota`, which issues `SELECT ... FOR UPDATE`. Because the endpoint is
// `async def`, FastAPI runs it ON THE EVENT LOOP rather than in the threadpool, so the lock wait
// blocks the loop thread — and with it every other request that worker is serving.
//
// Two chart tabs belong to the same user, so their claims contend on the same user row. The second
// claim waits, the loop is blocked while it waits, and everything queues behind it. That is the
// server-side mechanism behind the P0: two POSTs on the claim path appearing to hang forever while
// unrelated requests stall. Measured on the deployed b113 canary at 17:25Z:
// POST /api/chart/windows/claim returned 504 after 60.4s while /api/auth/me answered in 3ms.
//
// The client-side ceiling in chart-window-limit.js bounds what the BROWSER suffers. It does not
// stop the server blocking its own event loop, and no amount of client work can.
//
// WHY A RATCHET RATHER THAN A FLAT ASSERTION
// Two endpoints do this today and both need a backend change that is not in B's territory. Failing
// the build on them now would only teach people to skip the gate. So the two are named, and any
// THIRD goes RED immediately. When they are fixed, the allowlist shrinks and this gate tightens on
// its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SERVER = join(HERE, '..', 'chart v 1.4', 'chart', 'api_server.py');

// Known offenders. Emptied 2026-07-30 when claim became sync def and session-state DB
// work moved into run_in_threadpool. Shrink-only: never re-add without a Director ruling.
const KNOWN_LOOP_ROW_LOCKS = new Set([]);

const ROW_LOCK_MARKERS = ['with_for_update', '_lock_user_for_session_quota'];

export function findLoopRowLocks(source = readFileSync(API_SERVER, 'utf8')) {
  const lines = source.split('\n');

  // Decorator -> the function it decorates, so only real HTTP endpoints are considered.
  const routes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^@app\.(get|post|put|patch|delete)\("([^"]+)"/.exec(lines[i].trim());
    if (!m) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      const f = /^(async )?def (\w+)\(/.exec(lines[j]);
      if (f) {
        routes.push({
          method: m[1].toUpperCase(), path: m[2], name: f[2], isAsync: Boolean(f[1]), start: j,
        });
        break;
      }
    }
  }

  const found = [];
  for (const r of routes) {
    if (!r.isAsync) continue; // a sync endpoint goes to the threadpool; it cannot block the loop
    let end = lines.length;
    for (let j = r.start + 1; j < lines.length; j += 1) {
      const s = lines[j];
      if (s && !/^\s/.test(s) && (/^def /.test(s) || /^async def /.test(s) || /^@app\./.test(s))) {
        end = j;
        break;
      }
    }
    const body = lines.slice(r.start + 1, end).join('\n');
    if (!body.includes('SessionLocal()')) continue;
    if (ROW_LOCK_MARKERS.some((mk) => body.includes(mk))) {
      found.push({ ...r, line: r.start + 1 });
    }
  }
  return found;
}

test('no NEW async endpoint takes a row lock on the event loop', { skip: !existsSync(API_SERVER) && 'api_server.py not present' }, () => {
  const found = findLoopRowLocks();
  const unexpected = found.filter((f) => !KNOWN_LOOP_ROW_LOCKS.has(f.name));
  assert.deepEqual(
    unexpected.map((f) => `${f.method} ${f.path} (${f.name} L${f.line})`),
    [],
    'a new async endpoint blocks the event loop on a PostgreSQL row lock. Two concurrent callers '
    + 'serialise on the lock and the loop thread waits, stalling every request that worker holds. '
    + 'Make the endpoint sync (def) so FastAPI runs it in the threadpool, or move the locked '
    + 'section into run_in_threadpool, and bound the wait with a lock_timeout.');
});

test('the allowlist does not rot: every named offender still exists', () => {
  const found = new Set(findLoopRowLocks().map((f) => f.name));
  for (const name of KNOWN_LOOP_ROW_LOCKS) {
    assert.ok(found.has(name),
      `${name} no longer takes a row lock on the loop — remove it from KNOWN_LOOP_ROW_LOCKS so the `
      + 'gate tightens instead of silently permitting a regression');
  }
});

test('the detector actually detects: a synthetic offender is caught', () => {
  const synthetic = [
    '@app.post("/api/thing/lock")',
    'async def thing_lock(request: Request):',
    '    db = SessionLocal()',
    '    locked = _lock_user_for_session_quota(db, 1)',
    '    return {"ok": True}',
    '',
  ].join('\n');
  const found = findLoopRowLocks(synthetic);
  assert.equal(found.length, 1, 'detector missed a plain synthetic offender');
  assert.equal(found[0].name, 'thing_lock');
});

test('a SYNC endpoint doing the same thing is NOT reported — it runs in the threadpool', () => {
  const synthetic = [
    '@app.post("/api/thing/lock")',
    'def thing_lock(request: Request):',
    '    db = SessionLocal()',
    '    locked = _lock_user_for_session_quota(db, 1)',
    '    return {"ok": True}',
    '',
  ].join('\n');
  assert.deepEqual(findLoopRowLocks(synthetic), [],
    'sync endpoints are handed to the threadpool by FastAPI and do not block the loop; reporting '
    + 'them would bury the two that matter in 130 false positives');
});

test('an async endpoint with a session but NO row lock is not reported', () => {
  // 134 endpoints do blocking session work without a lock. They are a real latency problem but a
  // different one, and folding them in here would make this gate unactionable.
  const synthetic = [
    '@app.get("/api/thing")',
    'async def thing(request: Request):',
    '    db = SessionLocal()',
    '    return {"ok": True}',
    '',
  ].join('\n');
  assert.deepEqual(findLoopRowLocks(synthetic), []);
});
