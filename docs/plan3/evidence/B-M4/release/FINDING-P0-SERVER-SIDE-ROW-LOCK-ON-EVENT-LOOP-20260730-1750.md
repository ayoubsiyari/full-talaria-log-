# The window-claim P0 has a second half, and it is server-side: a row lock taken on the event loop

**Date:** 2026-07-30 17:50
**Found while:** confirming the client-side P0 fix was on the wire (Director queue item 1)
**Status:** client half verified live on b113. **Server half is live, unfixed, and not in B's territory.**
**Gate landed:** `deploy/event-loop-row-lock-ratchet.test.mjs` (ratchet, 4 cells)

---

## 1. Queue item 1, answered first

The client-side ceiling **is on the wire**, not just on the branch. Read off the running page:

- `__TALARIA_CHART_BUILD_ID='20260730b113'`
- `/chart/modules/chart-window-limit.js` served 200, 32,259 bytes, and it carries `controlFetch` (5),
  `CONTROL_TIMEOUT_MS = 10000` (3), `AbortController` (2), `GATE_WAIT_TIMEOUT_MS` (4),
  `heartbeatInFlight` (4), the kill-switch (2), and `/release` routed through `controlFetch` (1).
- **Both** shells reference it: `dist-v9/index.html` at
  `/chart/modules/chart-window-limit.js?v=20260730b113`, and `multichart-prod/chart-embed.html`.

That last point is the one that matters for the Director's concern about fixes sitting off builds:
the file is not merely present in the served tree, it is referenced by the shells that boot, with
the current build id on the cache-stamp.

## 2. What the same check found by accident

The behavioural probe against the live wire returned:

```
claim     : 504 in 60.418s
release   : 401 in 6.463s
heartbeat : 401 in 0.012s
```

Three retries a minute later were all `401` in 2-9 ms, so the stall is intermittent, not constant.
An unauthenticated claim is rejected before any database work, so a 60-second unauthenticated
claim means the **worker itself was not running**, and nginx timed it out at 60 s.

## 3. Root cause, one line

`chart_window_claim` is an `async def` endpoint that opens a **synchronous** SQLAlchemy session and
takes a `SELECT ... FOR UPDATE` row lock **on the event loop**, so a contended claim blocks every
request that worker is handling for as long as another transaction holds the user row.

```python
@app.post("/api/chart/windows/claim")
async def chart_window_claim(request: Request, body: _ChartWindowClaimIn):   # api_server.py:14321
    ...
    db = SessionLocal()                                    # sync session
    locked = _lock_user_for_session_quota(db, user.id)     # -> q.with_for_update()  (13057-13062)
```

FastAPI runs a `def` endpoint in the anyio threadpool but an `async def` endpoint **on the loop**.
Blocking DB work in an async endpoint therefore stalls the loop; when that work is `FOR UPDATE`,
the stall is unbounded by construction.

## 4. Census: exactly two endpoints can do this, and they are C's two

Run against the deployed `api_server.py` and confirmed identical in the repo (same line numbers):

- **136** async endpoints do blocking DB work on the event loop.
- **2** of them take a `FOR UPDATE` row lock there:

| method | path | function | line |
|---|---|---|---|
| POST | `/api/chart/windows/claim` | `chart_window_claim` | 14321 |
| PATCH | `/api/sessions/{session_id}/state` | `patch_trading_session_state` | 25259 |

Those are **the two endpoints in C's report**. A second tab on the same account contends for the
same user row; the loser blocks the loop; everything queues behind it. It reads as browser-wide
because it is worse than browser-wide — it is server-wide, and it explains why `/api/auth/me`
sometimes answered normally (other workers, or no contention at that instant).

It also explains the "persists until the browser is closed" character without needing socket
exhaustion: while both tabs live, both keep claiming and keep re-entering the contended lock.

`PATCH /api/sessions/{session_id}/state` is the same endpoint whose 636,776-byte body I sized the
nginx buffer for earlier today. It is written on every autosave of a working session, so the second
offender fires continuously in normal use.

## 5. What this does and does not settle

**Settles:** the client-side fix is on the wire and bounds the browser — a hung claim is aborted at
10 s and the gate opens, which is why the chart still boots on b113 and why a one-tab user never
sees it. My earlier socket-level reproduction stands: two POSTs held pre-fix, zero on b113.

**Does not settle:** I have *not* reproduced the server-side stall on demand. An unauthenticated
claim returns 401 before the lock, so the two-tab authenticated contention test needs a session
token — which is Director queue item 4, and the two are now one job. The mechanism is established
by reading the deployed source, and it is consistent with the one 60 s / 504 measured above, but
under `DECL-01` "consistent with" is not "demonstrated" and I am not claiming it.

A separate blocking source is also in the log and is *not* the same defect:
`_proxy_finnhub_json` (`api_server.py:11365`) does `urllib.request.urlopen(req, timeout=45)` from
`api_finnhub_economic_calendar` (11411). That endpoint is sync, so it runs in the threadpool and
occupies a worker thread for up to 45 s rather than blocking the loop. Recorded because it is
throwing `TimeoutError` repeatedly right now and it degrades the threadpool the 136 blocking
endpoints share.

## 6. Proposed fix, not applied

`api_server.py` is not in B's granted territory, so this is routed rather than landed. Smallest
safe change, in order of preference:

1. **Bound the wait.** `SET LOCAL lock_timeout = '3s'` on the transaction that takes the lock, so a
   contended claim fails fast and loudly instead of stalling. This mirrors the client-side ceiling
   and is the change most in keeping with "a hung POST must be impossible".
2. **Get it off the loop.** Wrap the locked section in `run_in_threadpool`, or make the endpoint
   `def`. Making it `def` is one word but changes concurrency semantics for the whole handler, so
   it wants the owner's judgement, not mine.

Doing 1 and 2 together is what makes it impossible rather than unlikely.

## 7. The gate that is landed

`deploy/event-loop-row-lock-ratchet.test.mjs` — a **ratchet**, not a red. The two known offenders
are frozen; a third fails the build; and fixing one fails the gate until it is removed from the
list, so the set can only shrink. A permanently-red gate would be switched off within a day, and
then the freeze could quietly add a third. Also asserts the safe shape (a `def` endpoint taking the
same lock) is *not* flagged, so the gate is not noise.
