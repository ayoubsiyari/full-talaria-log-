# WORKER PROMPT — T0 step 5 (Lane 4): fast local React/chart test loop + gate bookkeeping

> Hand to the Lane 4 worker. This removes the biggest process pain in Plan 2: React/engine fixes currently need a ~15–20 min server Docker rebuild to test, which caused repeated "nothing changed" loops. Give us a **seconds-fast local test path**. Serves D-006's parity-check tooling.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T0 step 5**, Lane 4 (verification/harness lane).

## PROBLEM
`npm run dev:live` (Vite, `chart v 1.4/talaria-design`, HMR, instant) cannot initialize the chart locally: `vite.config.live.js` proxies only specific `/chart/*` paths (`/chart/chart.js`, `/chart/modules`, …) and **omits `/chart/vendor/d3.min.js`** (and possibly other `/chart/vendor/*` / assets), so chart init fails with `d3 load failed` and `window.chart=false`. This blocked step-6/7/8 workers from live-verifying React and engine fixes locally.

## TASK A — make `dev:live` init the real chart locally
1. Diagnose exactly which `/chart/*` requests 404 during `dev:live` boot (start with `/chart/vendor/d3.min.js`).
2. Fix `vite.config.live.js` so the chart boots locally. Prefer serving the missing assets from the local `../chart` tree via the existing `localChartModulesPlugin` / `USE_LOCAL_CHART` mechanism (extend it to cover `/chart/vendor/*` and any other missing static paths), OR add the missing proxy entries. Keep `USE_LOCAL_CHART=1` working so a dev can test **local** `chart.js`/modules edits without a backend.
3. **Do NOT change production build behavior** (`base`, `outDir`, rollup output). This is dev-server only.
4. Document the one-command local test recipe in the report (e.g. `USE_LOCAL_CHART=1 npm run dev:live` → open localhost:5173 → chart boots → set `window.__TALARIA_*` flags in console and interact — no reload/rebuild).

## TASK B — gate bookkeeping (fallback-window)
Move **H-S34, H-S35, H-S44** to `known-failing.json` (both harness trees) with a note: `"T1 fallback-(b) rollback window — migrated multichart behavior intentionally disabled; restore when T1 re-migration lands"`. This is not an assertion change (behavior is intentionally reverted per D-006 fallback), so no I9 escalation — but record it clearly.

## BINDING CONSTRAINTS
- No engine logic changes (Task A = Vite dev config + dev-only static serving; Task B = known-failing.json only).
- L2: production trees only where relevant; both harness trees mirrored for Task B.
- Do NOT bump build id.
- Do NOT disturb the current green gate (H-S32/33/36/37/43) or the intentional fallback reds beyond reclassifying them.

## DELIVER (report `.md`: `worker-reports/T0-step5-vite-devproxy-fast-test-report.md`)
1. Task A: root-cause of the boot 404(s), the config fix diff, and a verified transcript of the chart booting under `dev:live` (screenshot/log that `window.chart` is truthy).
2. The exact fast-test recipe (commands + how to flip `__TALARIA_*` flags live).
3. Task B: known-failing.json diff (both trees) + gate re-run showing H-S32/33/36/37/43 green and H-S34/35/44 tracked.
4. SHA256 for known-failing.json both trees; confirm no engine files changed.
