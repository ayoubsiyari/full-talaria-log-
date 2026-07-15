# T8 step 5 (Lane 2) — unified play edge-park advance FIX (D-015)

## Authorization
D-015 (resolves ESC-013): extend the step-3 own-master play-advance to **all playing panels** as ONE root fix. This supersedes the independent-only step-3 gating. Freeze-exempt (data/replay path). Staging-only ship while the D-012 deploy freeze holds.

## The one rule (D-015)
During PLAY, **every** panel advances on its **own loaded data**, keyed to the shared playhead timestamp; the async catch-up becomes a **fallback for genuinely missing data only**, not the primary advance path. Applies to all relations:
- **same-TF × playing** — the 3-strike breaker park (`panel-cmd-bridge.js:1147–1154`) is the TAL-01590 mechanism; advance on own master instead of parking.
- **coarser × playing** — `scheduleCoalescedSeek(ch, ts, true)` during PLAY, **skip the mirror-first fetch** that leaves the panel parked at loaded edge.
- **finer self-owner × playing** — same own-master principle (resolve the `forceReplaySeek` + `_ensureFinerPanelOwnerCoversPlayhead` race by advancing on own loaded data).
- **independent × playing** — already the step-3 behavior; now folded under the same rule.

## Kill-switch (D-015 — unified)
`window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` — default = **fix ON**. **Fold in** the step-3 switch `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` — retire it; there must be **no window where two switches gate overlapping behavior** (D-015). Cover every file the fix touches (I13).

## HARD CONSTRAINT (D-015 regression fence)
The fix **must NOT reintroduce the Plan-1 coarse-panel reslice storm**. The coarse-panel reslice-storm scenario family (BL-5/BL-14/17 — `shouldSkipCoarsePanelHostSwitchSeek`, `TF_SWITCH_FILL_STORM_GUARD`, etc.) **stays GREEN** as the regression fence. Prove it green before/after.

## RED / dev evidence
- Extend **H-S59b** to same-TF and coarser variants (H-S59b-sameTF, H-S59b-coarse) as **dev evidence** — actuation honest (real tick play, per-iframe `replayTs`, I15), but per the H-S59b WEAK sign-off the local harness **cannot force the breaker**, so label them **GREEN-SYNTHETIC**, NOT proven-fix acceptance. Do not promote as proof.
- Full `npm run gate` GREEN (29 + coverage), **reslice-storm family GREEN** (the fence), BL-10/11/12/13 family GREEN.

## Acceptance (D-015)
**PO staging live-confirm is the acceptance authority** (harness can't force the breaker). Ship staging build; PO tests mixed-TF + independent layouts under play and confirms no panel parks. + gate/fence green + kill-switch A/B (dev) + I8 both trees + one Lane 4 actuation note if a new harness variant is added.

## Guardrails
- I8: mirror both trees byte-identical; SHA256.
- I9: 29-scenario gate + reslice-storm fence stay green.
- I11/T8: sanctioned policy-cell change, NOT a new mirror-frame guard (do not add guard #21).
- Do NOT touch `react-parity-lib.mjs`.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Diff + unified-switch coverage (incl. the step-3 switch retirement, proof of no double-gate), RED/dev evidence per relation (labeled GREEN-SYNTHETIC), **reslice-storm fence green proof**, BL-family + full gate result, both trees SHA256, and the staging build id for PO confirm.
