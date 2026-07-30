# P0 window-claim reopened — markers shipped, defect survived (TEST-02)

**Date:** 2026-07-30 22:00  
**Ruling:** `docs/plan3/RULING-ATTRIBUTION-BEFORE-CONFIRMATION-AND-THE-WINDOW-CLAIM-IS-NOT-FIXED-20260730-2145.md` (`2a60e2cb3`)  
**Status:** reproduced behaviourally; fix landed (server + client incomplete half)

---

## 1. Delivery and behaviour both true

| check | result |
|---|---|
| Served `chart-window-limit.js` | 32,259 bytes on b114 (Director's number) |
| `CONTROL_TIMEOUT_MS` / `controlFetch` / `AbortController` / kill-switch | present |
| Idle authenticated claim | ~100–200 ms |
| Claim under held `users.id FOR UPDATE` | **27.6 s**, HTTP 200 when lock released |
| `/api/auth/me` during that wait | ~90 ms (other worker / no lock) |

The client ceiling bounds what the **browser** suffers. It does not stop an `async def` claim from taking `SELECT … FOR UPDATE` on the **event loop**, so a contended second tab still wedges a uvicorn worker for the life of the lock. That is why markers and hang can both be true.

Evidence JSON: `c:\Users\user\Desktop\talaria1\_evidence\manager-B\p0-window-claim-behavioural\`  
Host repro script: `repro-row-lock-v2.sh` (claim `time=27.598786` while `pg_locks` held).

## 2. Second incomplete half on the client

`release()` preferred `navigator.sendBeacon`, which **cannot be aborted**. The `controlFetch` ceiling sat behind that early return, so unload/reload releases were never under `CONTROL_TIMEOUT_MS`. Live browser probe left `/api/chart/windows/release` open for **51 s** with no response event after reload.

## 3. Fix (behavioural close conditions)

1. **`chart_window_claim` → sync `def`** — FastAPI runs it in the threadpool; contended lock cannot stall the loop.
2. **`SET LOCAL lock_timeout = '3s'`** in `_lock_user_for_session_quota` (and session-state `FOR UPDATE`) — wait fails fast as 503 `chart_window_claim_busy` / `session_state_busy`.
3. **`patch_trading_session_state`** — await body on the loop, then `run_in_threadpool` for all DB/`FOR UPDATE` work (the other endpoint C named).
4. **`release()`** — `controlFetch` first; `sendBeacon` only if fetch is unavailable.
5. Ratchet `KNOWN` sets emptied; closure cells assert the safe shapes.

## 4. Host route for C (item 2 of the ruling)

SSH is **port 443**, not 22. Port 22 is closed to everyone.

```
ssh -p 443 -i <mgr-c-testhost-key> mgr-c@31.97.192.82
```

Handoff: `c:\Users\user\Desktop\talaria1\_handoff\manager-C\HOST-ROUTE.md`  
On-box: `/home/mgr-c/gate/HOST-NOTES.md`  
Verified this session: `mgr-c_ssh_ok` via port 443.

## 5. Train (item 3)

SHA-resolved manifest: `docs/plan3/TRAIN-MANIFEST-b114-20260730.md`  
E bound to `71c4c1b0ea0d8b91d525b2da2992c5f5b27ac934`; orphan `9b0a1e0ea…` rejected.
