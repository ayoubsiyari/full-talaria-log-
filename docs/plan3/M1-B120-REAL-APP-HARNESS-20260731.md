# M1 — b120 Real-App Harness Fire

**Date:** 2026-07-31  
**Manager:** D  
**Harness:** `scripts/m1-b118-real-app-harness.mjs`  
**Artifact:** `docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json`

## Verdict

Bounded M1 fire completed and wrote an artifact. It is **not GREEN**.

| Field | Value |
|---|---|
| measuredAt | `2026-07-31T17:28:24.162Z` |
| build | `20260731b120` |
| expected | `b120` |
| authenticated route | B route imported; local login returned `HTTP 401` |
| final URL | `/login/?next=/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677` |
| verdict | `UNPROVEN_LOGIN_PATH` |
| reason | `real-app redirected to login; auth cookie required` |

This confirms the real app served b120, but it does **not** confirm M1 because the browser did not reach a journal-bearing product page. B's route module was used against the documented session (`sessionId=936`, `fileId=677`), but this local environment's `TEST_PASSWORD` failed login with `HTTP 401`; D could not run B's proven `/root/.talaria-test-env` host route from here. The one image present is the login page asset (`256x239`, thumbnail-sized, non-journal). No full-resolution journal image surface was measured.

## Bounds

This was a single bounded run: no `--wait`, no watcher, no multi-hour loop. It avoids the earlier `4294967295` non-evidence shape and exits non-zero because the verdict is not `GREEN_CANDIDATE`.

## Verification

- `test:m1-b120-real-app` — PASS
- `preflight:m1-b120-real-app` with `M1_EXPECTED_BUILD=b120` — READY
- Bounded authenticated-route live run — artifact written, B route login `HTTP 401`, `UNPROVEN_LOGIN_PATH`
