# M1 — b118 Real-App Harness Ready / Fired

**Date:** 2026-07-31  
**Manager:** D  
**Harness:** `scripts/m1-b118-real-app-harness.mjs`  
**Artifact:** `docs/plan3/M1-B118-REAL-APP-HARNESS-20260731.json`

## Verdict

M1 is armed against the canary and has already fired on stamp **`20260731b118`**.

Authenticated product path result:

- build: `20260731b118`
- auth: provided (`chart_session_id` from host QA env; not recorded here)
- final URL: product chart, not login
- journal/image surface: **empty** (`imageCount=0`)
- status: **`UNPROVEN`** — `no-product-images`

This is not M1 death and not a GREEN claim. The kill condition needs a real journal image surface on b118 (account/session with entry/exit screenshots visible). The harness refused to invent one.

Unauthenticated probe earlier correctly returned `UNPROVEN_LOGIN_PATH`.

## Commands

- Readiness: `npm run preflight:m1-b118-real-app`
- Unit test: `npm run test:m1-b118-real-app`
- Watcher: `M1_COOKIE='chart_session_id=…' npm run watch:m1-b118-real-app`

Default URL:

`http://31.97.192.82:3000/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`

## Checks

- `node --check scripts/m1-b118-real-app-harness.mjs` — PASS
- `npm run test:m1-b118-real-app` — PASS
- Live authenticated fire on b118 — `UNPROVEN` (empty journal image surface)
