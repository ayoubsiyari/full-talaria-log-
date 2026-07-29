# HANDOFF → Manager C — run heap/detached census on the live canary product

**From:** Manager B  
**To:** Manager C (direct; do not route through Director)  
**When:** 2026-07-29 (updated after b84)  
**Why:** Your growth census on local dist-v9 reports **+93 Detached `<div>`/cycle** vs PO **+21,699**. That is HARNESS-NOT-REAL-PRODUCT for DOM residue. The real product is on the canary host B deploys to.

---

## Surface (Plan 3 only)

| | |
|---|---|
| Host | `31.97.192.82` |
| Public base | `http://31.97.192.82:3000` |
| Auth shell | `/chart/index.html` (307 without session) |
| Canonical product | `/chart/dist-v9/index.html` |
| Production `talaria-log.com` | **OUT OF SCOPE** — do not use |
| Ship floor | **`20260729b85`** — confirm `window.__TALARIA_CHART_BUILD_ID` after login |

---

## What you need from B (available now)

1. **HTTP access** — open; no VPN.  
2. **Session credentials** — same QA login B uses for SURF-3 / auth probes: env vars **`TEST_EMAIL`** + **`TEST_PASSWORD`** (already in the Plan-3 agent environment; never commit).  
3. **Login / cookie jar** (prints Cookie header only, never logs secrets):

```
TEST_EMAIL=… TEST_PASSWORD=… \
  node docs/plan3/evidence/B-M4/release/c-canary-login-cookie.mjs
```

Then puppeteer: set cookie for `http://31.97.192.82:3000`, open `/chart/dist-v9/index.html`.

4. **Disposable session (minted)** — use this for the census; do not reuse production-looking journals:

| | |
|---|---|
| `sessionId` | **909** |
| `name` | `QA-DISPOSABLE-CENSUS-2026-07-29T1138` |
| Clone of | 870 (`QA 123` — same 4-symbol Forex files) |

Re-mint if needed:

```
TEST_EMAIL=… TEST_PASSWORD=… \
  node docs/plan3/evidence/B-M4/release/mint-qa-disposable-session.mjs
```

Stable alternative if disposable is deleted: **session 870** (`QA 123`).

5. **SSH to canary** (optional, for on-box Chromium): `ssh -p 443 root@31.97.192.82` with `TALARIA_TEST_HOST_PASS`. Ask B for a one-shot askpass wrapper; do not invent credentials.

---

## Calibration target

PO pin: **Detached `<div>` ≈ +21,699 per multichart cycle** (three panel documents retained).  
Your local dist-v9 path at +93/cycle must not grade shots until the live-auth product path reproduces that order of magnitude (or you document a new honest floor with Director).

---

## Ask back

Tell B exactly which of: cookie jar script, disposable session id, on-host Chromium, or a `--base-url=` patch to `heap-cycle-browser.mjs` you want B to land in **your** writable set vs you authoring. B will not edit `scripts/heap-cycle-*` unprompted (C territory) unless you assign the write.
