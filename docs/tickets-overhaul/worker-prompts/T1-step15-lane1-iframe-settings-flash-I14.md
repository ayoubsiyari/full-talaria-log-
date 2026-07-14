# T1 step 15 (Lane 1) — settings-flash on real iframe panel (I14 re-fix)

**Cold-start:** read `INVARIANTS.md` (esp. **I14** — postMessage-bridge-only, parent globals forbidden in panel-facing paths), `WORKER-REPORT-STANDARD.md` (status must be real-built for parent↔iframe fixes), and the step-14 report `worker-reports/T1-step14-iframe-legacy-toolbar-kill-report.md` — you reuse its `__talariaV9PanelEmbed` in-iframe flag pattern. Engine mirrored across both trees (SHA256 both).

## SYMPTOM (caught by the real-iframe parity harness, T0 step 8b)
- **H-R13 RED on real built dist-v9 iframe:** double-click a drawing on panel B → settings open then immediately close (`open:false` at 0ms and 400ms). Step 10 "fixed" this but only on dev:live (same-context), so it never worked across the real iframe boundary — same class as the gear (I14).

## FIX (reuse step-14 pattern)
- The settings-flash fix must run off the authoritative **in-iframe** signal (`window.__talariaV9PanelEmbed`, set by the parent `setV9PanelEmbed` bridge cmd), NOT parent globals/shared closures.
- Ensure the panel-B settings open path is not torn down by the parent-wide close race in the iframe context; keep settings open + stay (per step 10 intent) and Esc closes.
- Same switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (I13 — all touched files, both trees); OFF reverts. Single chart + host tile unchanged (I5).

## ACCEPTANCE (real product only — D-010)
- **H-R13 must flip RED→GREEN on the T0-step8b real-iframe harness** (built dist-v9, real iframes, build id asserted inside panel B). 10× deterministic, settle-signal gated (no fixed sleep).
- Switch OFF → RED again. Full `npm run gate` green (I9). SHA256 both trees.

## DELIVER
`worker-reports/T1-step15-iframe-settings-flash-report.md` per WORKER-REPORT-STANDARD — mechanism (why step 10 failed across the iframe), diff + switch coverage, H-R13 RED→GREEN on the 8b harness, gate result, SHA256. Coordinate a **single combined deploy** with steps 14 + 16 (Manager bundles one build).
