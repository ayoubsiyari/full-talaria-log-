# Lane 4 (Worker 4) — D-027: implement quarantine-flake bucket → assemble combined build → proof bar → 3× clean gate → BLESS

**Ruling:** D-027 (ESC-024 GRANTED). This clears the last mechanical gate blocker. Read D-027 in `DIRECTOR-DECISIONS.md` in full before starting.

## STEP 1 — Quarantine-flake bucket (harness)
Add a named `quarantine` allowlist distinct from `known-failing` — rows tolerated on EITHER outcome, ratchet-neutral in both directions. Move **H-S27, H-S30, H-S83** in with their triage reasons + measured fail-rates + run counts.

**Gate definition (ratified):** clean gate = 0 unexpected regressions + all non-quarantine `known-failing` rows FAIL as expected + quarantine rows tolerated. Wire Criterion 5 accordingly.

**Four binding hardenings (all mandatory):**
- (a) Quarantine rows still RUN every gate; their pass/fail is **logged and printed in the gate summary** (ratchet-neutral ≠ invisible). Accumulate the per-build outcome log — a quarantined row drifting to 100%-fail re-escalates as a real regression.
- (b) Entry bar: a row enters ONLY with a completed flake-triage (isolation runs, measured rate, exonerated recent fixes) + recorded run count. A flaky row without triage stays a gate failure.
- (c) Exclusion: NO bless-path discriminator-of-record or acceptance row may ever be quarantined (none of the three are — keep it true).
- (d) Growth alarm: >5 rows OR any row past its review point (first review = post-bless T8 sweep) auto-escalates to the Director.

Never fix-counted, never ticket-closing.

## STEP 2 — Assemble the combined build (reconcile build ids)
The bless build MUST contain ALL landed work on one build. Critically reconcile:
- D-026 panel-B settings transport fix (proven on `20260717b03`)
- ORD-LEVEL-VIS marker revert (`20260717b4`)
- re-migration engine (H-R02/03/06/07) + cadence + order-entry + settings/Esc/Delete + TF-label
Verify no hunk fell out during assembly (diff against the combined-build manifest, both I8 trees byte-identical). Stamp a fresh combined build id.

**CAUTION — b14 order interims overlap the D-026 files.** Worker 3's multichart order interims (build `20260717b14`, commits `0415cabe`/`cf32a86d`) edited `MultichartGrid.jsx` + `TalariaV8bLive.jsx` — the SAME re-migration files as the D-026 transport fix, and they landed AFTER `b03`. They are kill-switched but **NEEDS-LIVE / unproven** (no harness, no live repro). Therefore:
- Assemble the combined build on top of `b14` (so the interims + revert + D-026 + re-migration are all present).
- **MANDATORY: re-run the full D-026 proof bar (STEP 3, including the `focusReactPanelSoft` stress leg) on the b14-inclusive build** — because the interims mutated the same files, the transport fix's 10/10 must be re-confirmed, not assumed. This is the acceptance that the interims did not perturb the settings-transport ordering.
- **If D-026 proof holds:** proceed to bless; PO parity-checklist then also live-confirms the interims (satisfies their NEEDS-LIVE in the same pass).
- **If D-026 proof regresses:** do NOT delay the bless — flip the interim switches (`__TALARIA_DISABLE_ORDER_MC_*` / `__TALARIA_MC_*`) OFF for the bless build to isolate them, bless the clean re-migration+transport set, and report so the interims land in a proven follow-up build. Escalate to Manager either way.

## STEP 3 — Proof bar (D-026, binding, restated)
On the assembled build:
- H-R04 panel-B **10/10** ON + H-R05 panel-B **10/10** ON (honest `hasStyleSection`)
- switch-OFF honest RED (`--panelb-settings-transport-off`)
- **10/10 with the `focusReactPanelSoft` amplifier still in place** (the stress leg — proves hunk B cured the ordering, not hunk A widening the window)

## STEP 4 — Standard bless
- 3× consecutive clean `gate:react`
- manager gate 0 unexpected regressions (quarantine rows tolerated + printed)
- Then **bless** the combined build for PO parity-checklist.

## Deliverable
`docs/tickets-overhaul/worker-reports/T0-lane4-quarantine-assembly-bless-report.md`: quarantine implementation + the 4 hardenings evidence; assembly reconciliation (build ids folded, hunk diff clean); proof-bar results (all legs incl. stress); 3× gate:react logs; manager gate summary (with quarantine outcomes printed); final blessed build id — or, if any leg fails, STOP and report (no retry-to-green, I15).

## Also (D-028, non-blocking, after bless work is underway)
You own `PLAN2-SCOREBOARD.csv` going forward (`scripts/build-scoreboard.py`). `TICKET-STATUS-SIMPLE` + `RESOLUTION-TRACKER` become VIEWS of it, not competitors. Keep the seeding script as the regenerator; Manager updates rows on each report. Do not let scoreboard maintenance delay the bless.
