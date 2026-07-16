# T8 step 14 (Lane 2) — H-S25 eased-follow seam: re-check under finest-TF cadence (diagnostic-first)

## Why this now (and why read-only-first)
Finest-TF cadence just landed on staging b1 (T8 step 13, awaiting PO A/B). It changed the replay-follow path (`replay-system.js`, `panel-cmd-bridge.js` `_panelPlayFollowContinuousOffsetX`) — which is exactly where **H-S25** (eased-follow seam, `maxStepDeviceDelta==candleSpacing` at bar seams) was reclassified to (out of RC-3 anchoring). **Do NOT stack another unverified fix on the replay path before PO confirms b1** — this step is diagnostic-first.

## Tasks
1. **Re-run H-S25 with cadence switch A/B:**
   - `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` **unset (fix ON)** vs **set (fix OFF)**.
   - Report `maxStepDeviceDelta` in both. Does the finest-TF cadence already reduce/eliminate the seam jump (finer sub-steps → smaller per-step delta)?
2. **Verdict:**
   - If cadence ON already greens H-S25 → mark it a cadence beneficiary; hand to Lane 4 to re-baseline after PO accepts b1 (no new code).
   - If still red → root the residual seam mechanism (index vs pixel follow at the bar boundary) and write a fix PLAN (switch name, files, RED assertion) — but do NOT implement yet; it waits behind the b1 PO A/B.
3. Note any interaction between the seam and H-S73 (B-FIX-C prepend compensation) if they share the follow-offset path.

## Guardrails
- **Read-only / diagnostic** this step. No product edits until PO confirms b1 and I authorize.
- Do NOT edit `known-failing.json` / scenario ids — report to Lane 4.
- If you must run built dist, confirm build id `20260715b1` inside the panel iframe.

## Report — WORKER-REPORT-STANDARD.md
The A/B `maxStepDeviceDelta` numbers, the verdict (cadence-fixes vs residual), and — if residual — the fix plan (files/switch/RED) for a later authorized step.
