# T3 Phase 5 (Lane 2) — H-R07 cross-panel select isolation IMPLEMENT (D-021)

D-021 confirmed **H-R07 (cross-panel select — selecting in one panel leaves peer store empty / leaks)** as one of the two remaining honest engine REDs. This is Phase 5 (peer isolation). Design + implement in one pass (your Phase-5 PREP wasn't separately banked — do the design inline).

**IMPORTANT correction:** the earlier Phase-5 PREP prompt said "H-R07 was dropped (green on fallback-B)." That was the *pre-hit-coord* matrix. Post-revalidation (D-021), **H-R07 is HONEST-RED** — it is your target. Do not treat it as green.

## STEP 0 — design + region map (in-report)
1. Confirm H-R07 honest actuation (I15) on the **frozen hit-coord harness**: real select gesture in panel B → assert the **source panel's store/selection is populated** and peers neither leak nor clear incorrectly. Name the end-state measures (`readReactParityState.selectedIds` per panel, not a `toolbarVisible` proxy).
2. Map the peer-isolation path: `clearDrawingUiOnOtherPanels` / peer-clear / cross-panel selection broadcast (postMessage/CustomEvent only — I14, no parent globals).
3. Region map: confirm your `MultichartGrid.jsx` / manager hunks are **disjoint from Lane 1's H-R06 Delete** hunks (Delete = keyboard/bridge; peer-iso = MultichartGrid/manager). **One-phase-per-PR on `MultichartGrid.jsx` binds** — if you and Lane 1 both edit `MultichartGrid.jsx` in overlapping ranges, STOP and report for sequencing. Avoid T8 cadence bands + P3 flash-guard zone (`~5074–5213`).

## Switch (D-018 #2 — new master)
`window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` (unset = ON). One-knob revert covering every file incl. React (I13). Do NOT extend P1/P2/P3 masters.

## Dependency / ordering
Rides P1 (store selection) + P2 (focus/routing); peer-clear must not race P3 select/open guards (`__v9DrawingSelectionGuardUntil`). P5 lands after P4 in principle, but since P4=Delete is disjoint, parallel is allowed per D-021.

## Proof (I15, D-011) — on the FROZEN harness
- `node react-run.mjs --only=H-R07 --runs=10` → **10/10 PASS**.
- Switch-OFF A/B (coordinate the `--phase5-off` / peer-isolation hook with Lane 4, who owns `react-parity-lib.mjs`) → **10/10 FAIL-REAL-BUG**.
- `npm run gate:react` clean. Also handle the **H-S34/H-S35/H-S44 promotion** duties tied to P5 (coordinate baseline with Lane 4).

## Guardrails
- Both trees I8, SHA256 in report. File-scoped commit (never `git add -A`).
- No Phase-1 engine files, no order-entry, no `replay-system.js`, no `known-failing.json` (Lane 4 registers).
- Build bump to the combined-build id when landing (coordinate with Manager).

## Report — WORKER-REPORT-STANDARD.md
`docs/tickets-overhaul/worker-reports/T3-remig-phase5-HR07-peer-isolation-IMPL-report.md` — peer-isolation path map, new switch, H-R07 RED→GREEN 10/10 + switch-OFF A/B, MultichartGrid.jsx disjoint-from-Lane-1 confirmation, H-S34/35/44 disposition, commit hash + SHA256, NEEDS-LIVE PO steps.
