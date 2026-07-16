# T8 step 11 (Lane 2) — TAL-01579 release snap-back: H-S73 pin + diagnostic (READ-ONLY)

## Authorization
D-014 ruling 3 queued this **behind the freeze fix** in Lane 2's queue — the freeze fix (D-015) is now PO-confirmed, so this is next. **Escalation-class** per D-014: pin current behavior first, then a separate diagnostic proposes the prepend-compensation policy — **do NOT fold into a migration or fix silently.**

## Symptom (TAL-01579)
On drag-release during/near replay, the chart **snaps back to the grab point** on release (index-pin fights the drag-release delta). Prepend-compensation conflict suspected (H-S73 = `MIRROR_PREPEND_COMPENSATION`, already a pending scenario from T8 step 1).

## Task — READ-ONLY (pin + diagnose, no product edits)
1. **Pin H-S73:** confirm the existing pending `H-S73` scenario actually captures the snap-back (RED reflecting current behavior). If it doesn't reproduce it, tighten the scenario spec so it does (assert final viewport/anchor after drag-release ≠ grab point). Report whether H-S73 is a faithful pin.
2. **Diagnose the mechanism:** trace the drag-release path — what pins the index/anchor on release, and how prepend/history-growth compensation interacts with the release delta. Cite file:line. Distinguish: (a) index-pin restoring the pre-drag anchor vs (b) prepend-compensation offset applied twice.
3. **Propose the prepend-compensation policy** for the cell (with TAL-01579 as evidence) — what the correct release behavior is, and whether it's a scoped fix or a shipped-behavior change needing Director sign-off (likely the latter → escalation candidate).
4. **RED scenario spec** for the eventual fix (do not implement).

## Guardrails
- READ-ONLY. No product/harness edits beyond tightening the H-S73 scenario spec if needed (host `scenarios.mjs`, NOT `react-parity-lib.mjs`).
- Freeze-exempt path; if the fix later touches iframe-panel coordination → I14.
- Not a mirror-frame guard — belongs in the anchor/prepend policy, not guard #21.

## Report — WORKER-REPORT-STANDARD.md
Whether H-S73 faithfully pins the snap-back, the drag-release mechanism trace, the proposed prepend-compensation policy + escalation verdict, and the RED scenario spec.
