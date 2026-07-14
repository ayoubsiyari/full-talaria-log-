# TAL-01564 — Version-reload prompt hygiene report

## 1. Task + RC

- **Task:** TAL-01564 — reload prompt returns after clicking Reload or Cancel (plan-1 SW hygiene regression).
- **RC:** Tooling/diagnostic — no RC (UX hygiene; not T8).

## 2. What I changed — file by file

| File | Change |
| --- | --- |
| `chart v 1.4/chart/modules/talaria-version-reload.js` | Persist dismiss in `sessionStorage` (`talaria_vr_dismissed_for`); hydrate via `readDismissedFor` / `writeDismissedFor`; guard `showToast` + serialize `check()`; clear dismiss on version MATCH; 80ms settle after SW/cache teardown before `reloadNow()` (TAL-01564 reload loop). |
| `homepage/public/chart/modules/talaria-version-reload.js` | Byte-identical mirror (P-invariant). |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | H-S22 extended: dismiss setup + sessionStorage + re-nag suppression sub-checks (TAL-01564). |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Byte-identical mirror. |

**No other files touched.** Legacy `multichart/` dev-shell not touched. SW strategy (`sw.js`) unchanged.

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT` (default **OFF** = feature ON).
- **Gated file:** `talaria-version-reload.js` only (`killed()` at `check()` / `start()` entry).
- Switch ON: no polling, no fetch, no toast — prior behavior fully restored.

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S22 --runs=1
npm run gate
```

### RED (before fix — symptom)

- Dismiss used in-memory `_dismissedFor` only → focus/visibility `check()` could re-show toast immediately after Cancel.
- `hardReload()` navigated before SW unregister settled → reload loop when stale SW survived.

### GREEN (after fix)

```
H-S22 dismiss setup: mismatch shows toast — ok
H-S22 dismiss: sessionStorage records deployed id — stored="20260712b8"
H-S22 TAL-01564: dismiss suppresses re-nag on second check() — returned=false dom=false
RESULT H-S22 PASS
```

Gate: `[gate] PASS: no new regressions; 15 known-failing tracked.`

## 5. Invariants checked

| Invariant | Status |
| --- | --- |
| **I3** Kill-switch | `__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT` unchanged; H-S22 kill sub-check proves A/B |
| **L2** Production tree | Module in `chart/modules/`; harness reads same path |
| **Security** | No SW strategy edit; no bypass of security guards |
| **I9** Gate | PASS; 0 regressions |

## 6. What I did NOT do / limits

- Did not bump `?v=` on `talaria-version-reload.js` script tag in `dist-v9/index.html` (deploy pipeline owns bump).
- Live PO confirmation of full reload-after-deploy cycle not run in this session (harness proves dismiss + match logic).
- Did not add localStorage dismiss (sessionStorage only — per-tab; sufficient for cancel + same-session re-nag).

## 7. Live-verification handoff

1. Deploy a build with a **new** `__TALARIA_CHART_BUILD_ID` while a tab stays on an older build.
2. Confirm toast appears once.
3. Click **×** → toast must **not** return on focus/visibility within the same session.
4. Hard-refresh with mismatch still present → dismiss may re-show (new session) — expected.
5. Click **Reload** → page loads new build; toast must **not** immediately reappear if versions now match.

Build id: confirm per L1 on deployed `sw.js` SW_VERSION vs page `__TALARIA_CHART_BUILD_ID`.

## 8. Status

**DONE (proven)** — H-S22 PASS including TAL-01564 dismiss sub-checks; gate GREEN.
