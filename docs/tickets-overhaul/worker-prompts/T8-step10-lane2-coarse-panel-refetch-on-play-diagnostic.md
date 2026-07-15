# T8 step 10 (Lane 2) — coarse-panel refetch + re-render on Play, multichart-only (READ-ONLY)

## Symptom (PO, staging a4)
Heavy mixed-TF layout (1m / 4H / 1H / 5m / 1D / 4H). **On Play, the bigger-TF panels refetch and full-re-render** each advance. **Single/main chart never did this.** Multichart-only.

## Why this needs a regression check FIRST (not "assume pre-existing")
D-015 step 5 changed coarse-panel play behavior — all playing panels now advance on their **own master** via `scheduleCoalescedSeek(ch, ts, true)`. If that triggers a **refetch/reslice per advance** on coarse panels, it could be **adjacent to the "coarse-panel reslice storm"** the D-015 fence (H-S17/H-S19/H-S19b) was meant to prevent — the fence passed, but it may not cover this refetch-on-play case. So:

**STEP 0 (mandatory):** determine regression vs pre-existing —
- Reproduce on a4, then with `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE=true` (revert step-5 behavior) and reload. **If the refetch/re-render stops with the switch OFF → it's a step-5 regression.** If it persists → pre-existing RC-2 coarse re-render.
- Also compare a pre-D-015 build if available.
- Report the verdict explicitly. If regression, this is higher priority (we introduced it).

## Diagnostic (read-only, no product edits)
1. **What fires on Play for a coarse panel:** trace whether the own-master `scheduleCoalescedSeek` path triggers a **data refetch** (network) and/or a **full re-render** vs an incremental advance. Cite file:line (`panel-cmd-bridge.js` coarse play path, the fetch/reslice call, render invalidation).
2. **Separate refetch from re-render:** is it (a) refetching bars each advance (data path) or (b) re-rendering the whole chart without refetch (RC-2 invalidation), or both? These route differently.
3. **Fence gap check:** why did H-S17/H-S19/H-S19b stay green while this happens live? Is the fence exercising the wrong TF set / not asserting refetch count / not on a 6-panel layout? Propose a fence extension (e.g. assert bounded refetch/render count per advance on coarse panels in a heavy layout).
4. **RC + recommendation:** if step-5 regression → the fix keeps own-master advance but avoids the per-advance refetch (reuse loaded bars; refetch only on genuine miss) under the existing switch. If pre-existing RC-2 → hand to T2 with a registry row. Name it.

## Guardrails
- READ-ONLY. No product/harness edits. Do NOT touch `react-parity-lib.mjs`.
- Freeze-exempt path.

## Report — WORKER-REPORT-STANDARD.md
Step-0 regression verdict (switch A/B result), refetch-vs-re-render mechanism, fence-gap analysis + proposed assertion, RC/track + fix recommendation.
