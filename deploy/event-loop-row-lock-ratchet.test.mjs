// GATE: no NEW async endpoint may take a database row lock on the event loop.
//
// THE DEFECT
// FastAPI runs a `def` endpoint in the anyio threadpool, but an `async def` endpoint runs on the
// event loop. An async endpoint that does blocking SQLAlchemy work therefore blocks the loop, and
// every other request that worker is handling waits — server-wide, not per-tab. When the blocking
// work is `SELECT ... FOR UPDATE`, the wait is unbounded: it lasts as long as another transaction
// holds the row.
//
// Two endpoints do this today, and they are exactly the two C reported hanging on the deployed
// build (P0, 13:25). A second tab on the same account contends for the same user row, the loser
// blocks the loop, and requests queue behind it until a tab goes away:
//
//   POST  /api/chart/windows/claim            chart_window_claim           api_server.py:14321
//   PATCH /api/sessions/{session_id}/state    patch_trading_session_state  api_server.py:25259
//
// Evidence: docs/plan3/evidence/B-M4/release/FINDING-P0-SERVER-SIDE-ROW-LOCK-ON-EVENT-LOOP-20260730-1750.md
//
// WHY THIS IS A RATCHET AND NOT A RED
// api_server.py is not in B's territory, so the fix is routed, not landed here. A gate that simply
// fails would be permanently red and would be switched off within a day. Instead it freezes the
// known set: the two above are recorded, and a THIRD one fails the build. The list may shrink and
// must never grow. When both are fixed this file asserts an empty set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SERVER = join(HERE, '..', 'chart v 1.4', 'chart', 'api_server.py');

// Helpers that take a row lock without the call site saying `with_for_update` itself.
const ROW_LOCK_TOKENS = ['with_for_update', '_lock_user_for_session_quota', '_check_session_create_quota'];

// Frozen. Shrink when fixed; never extend without a Director ruling recorded in the reason.
// 2026-07-30 P0 reopen: both offenders moved off the loop (claim → sync def; session-state →
// run_in_threadpool). Empty set is the closed state this ratchet was written for.
const KNOWN = new Set([]);

export function asyncEndpointsTakingRowLockOnLoop(source = readFileSync(API_SERVER, 'utf8')) {
  const lines = source.split(/\r?\n/);

  // Decorator -> the function it decorates. Only real HTTP endpoints count; a plain async helper
  // that takes a lock is fine, because it inherits whichever context its caller runs in.
  const endpoints = [];
  for (let i = 0; i < lines.length; i += 1) {
    const dec = lines[i].trim().match(/^@app\.(get|post|put|patch|delete)\("([^"]+)"/);
    if (!dec) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      const fn = lines[j].match(/^(async )?def (\w+)\(/);
      if (fn) {
        endpoints.push({
          method: dec[1].toUpperCase(),
          path: dec[2],
          name: fn[2],
          isAsync: Boolean(fn[1]),
          line: j + 1,
        });
        break;
      }
    }
  }

  const offenders = [];
  for (const ep of endpoints) {
    if (!ep.isAsync) continue; // threadpool: cannot block the loop
    // Body runs to the next top-level def/decorator.
    let end = lines.length;
    for (let j = ep.line; j < lines.length; j += 1) {
      const s = lines[j];
      if (s && !/^\s/.test(s) && (/^def /.test(s) || /^async def /.test(s) || /^@app\./.test(s))) {
        end = j;
        break;
      }
    }
    const body = lines.slice(ep.line, end).join('\n');
    const hits = ROW_LOCK_TOKENS.filter((t) => body.includes(t));
    if (hits.length && body.includes('SessionLocal()')) {
      offenders.push({ ...ep, tokens: hits });
    }
  }
  return offenders;
}

test('the set of async endpoints holding a row lock on the event loop has not grown', () => {
  const offenders = asyncEndpointsTakingRowLockOnLoop();
  const names = offenders.map((o) => o.name).sort();

  const added = names.filter((n) => !KNOWN.has(n));
  assert.deepEqual(added, [],
    'a NEW async endpoint takes a database row lock on the event loop. An async endpoint doing '
    + 'blocking SELECT ... FOR UPDATE stalls every request on that worker for as long as another '
    + 'transaction holds the row — this is the P0 C reported. Make the endpoint `def` so FastAPI '
    + `runs it in the threadpool, or wrap the locked section in run_in_threadpool. Added: ${added.join(', ')}`);

  // Shrinking is the goal, so a fixed endpoint must be removed from KNOWN rather than left to rot.
  const stillPresent = [...KNOWN].filter((n) => names.includes(n));
  const fixed = [...KNOWN].filter((n) => !names.includes(n));
  assert.deepEqual(fixed, [],
    `${fixed.join(', ')} no longer blocks the loop — remove it from KNOWN in this gate so the `
    + 'ratchet tightens. This assertion is the only thing that makes the list shrink.');
  assert.equal(stillPresent.length, KNOWN.size);
});

test('the former offenders are no longer async row-lock endpoints', () => {
  // Closure record: claim is sync def; session-state DB work runs in run_in_threadpool.
  // If either regresses to async+SessionLocal+FOR UPDATE, the empty-KNOWN cell above fails.
  const source = readFileSync(API_SERVER, 'utf8');
  assert.ok(/\ndef chart_window_claim\(/.test(source),
    'chart_window_claim must remain a sync def so FastAPI runs it in the threadpool');
  assert.ok(!/\nasync def chart_window_claim\(/.test(source),
    'chart_window_claim must not return to async def');
  assert.ok(source.includes('run_in_threadpool(_patch_trading_session_state_db)'),
    'patch_trading_session_state must keep its DB work off the loop via run_in_threadpool');
  assert.ok(source.includes('_set_local_lock_timeout'),
    'lock_timeout helper must remain so contended FOR UPDATE cannot wait unboundedly');
  const names = asyncEndpointsTakingRowLockOnLoop().map((o) => o.name);
  assert.ok(!names.includes('chart_window_claim'));
  assert.ok(!names.includes('patch_trading_session_state'));
});

test('a sync (def) endpoint taking the same lock is NOT reported', () => {
  // The gate must not flag the safe shape, or it will be read as noise and disabled.
  const src = [
    '@app.post("/api/thing")',
    'def thing_sync(request: Request):',
    '    db = SessionLocal()',
    '    locked = _lock_user_for_session_quota(db, 1)',
    '    return {}',
    '',
  ].join('\n');
  assert.deepEqual(asyncEndpointsTakingRowLockOnLoop(src), []);
});

test('mutation: a new async row-lock endpoint is detected', () => {
  const src = [
    '@app.post("/api/new/danger")',
    'async def brand_new_danger(request: Request):',
    '    db = SessionLocal()',
    '    row = db.query(User).filter(User.id == 1).with_for_update().first()',
    '    return {}',
    '',
  ].join('\n');
  const found = asyncEndpointsTakingRowLockOnLoop(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'brand_new_danger');
});
