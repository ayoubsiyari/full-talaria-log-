# Lane 1 — Objects-Tree × lifecycle-store multi-select diagnostic (READ-ONLY)

Your integration contract surfaced that `ToolLifecycleStore._reduce` collapses to **single-select** on `toolSelected`, and click/marquee paths write straight to `dm.selectedDrawings` without emitting `toolSelected`. This is a narrow, read-only diagnostic connecting that finding to the open **Objects-Tree duplication** thread (PLAN2-FOUND#3). No implementation.

## Question to answer
Does the Objects-Tree (and any panel that reads `ToolLifecycleStore.getSelectedDrawings()` / the reduced snapshot) **under-report or mis-highlight multi-selection** because multi-select lives only in `dm.selectedDrawings`?

## Tasks (read-only)
1. Trace how the Objects-Tree renders selection/highlight: does it read `dm.selectedDrawings`, the lifecycle snapshot, `d.selected`, or a mix? Cite files/lines.
2. Determine whether a Ctrl+click / marquee multi-select (2+ shapes) would show correctly in the Objects-Tree, or whether the single-select collapse means only one shows highlighted.
3. Cross-check against the **PLAN2-FOUND#3 geometry-vs-id dedupe** prototype (staged b105): is the duplication root related to the store/snapshot split, or fully independent? State clearly.
4. If a real defect exists, propose the fix boundary + kill-switch and a RED spec (do NOT implement). If no defect (object-tree reads `dm` correctly), say so and close the thread.

## Guardrails
- READ-ONLY. No product/React/harness/`known-failing.json`/registry edits, no commit.
- Do not touch Phase-1 engine files further, order-entry, or replay-system.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-lane1-objecttree-lifecycle-diagnostic-report.md` — the object-tree selection read path, the multi-select verdict, relation to PLAN2-FOUND#3, and either a fix boundary+RED spec or a clean-close statement.
