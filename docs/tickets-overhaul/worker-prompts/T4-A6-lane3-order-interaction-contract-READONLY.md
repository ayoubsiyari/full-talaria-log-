# T4 amendment A6 (Lane 3) — order-interaction contract DRAFT (READ-ONLY)

Director intake (2026-07-15) issued amendment A6: four new T4 order-interaction rows. **Contract-draft first, same discipline as T3's table — no fixes until rows are speced.** Read-only this step.

## The 4 rows to spec
| Row | Ticket | Symptom | Contract target |
|-----|--------|---------|-----------------|
| A6-1 | TAL-01602 | Dragging SL during replay closes the trade when the held line touches price | **SL/TP edits are apply-on-release.** While held, the line is provisional — must NOT trigger fills/closes. |
| A6-2 | TAL-01616 | Order disappears on refresh (F5) | **Open + pending order persistence across reload** (state save/restore). **SPEC SETTLED (D-019):** persist **both pending orders AND open positions**, **session-scoped**. No further PO input needed — spec this row for implementation. |
| A6-3 | TAL-01615 | Dragging price-scale label drags the order with it; only double-tap restores | **Price-axis gesture must not mutate order lines** (order-half sibling of A1's TAL-01566 axis-gesture isolation). |
| A6-4 | TAL-01601 | 2 layouts: SL move on panel 2 doesn't mirror to panel 1; limit lands below SL | **Cross-panel order-state convergence** — one order store, panels render projections. Per-panel divergence = RC-5 ownership defect. **Diagnostic-first:** where does panel 2 hold its copy? |

## Tasks (read-only)
1. For each row: precise contract statement (invariant), the RED scenario that pins it (how actuated / what measured, I15), the proposed kill-switch, and the `order-manager.js` / aggregate region it will touch.
2. **A6-4 is diagnostic-first** — trace the cross-panel order-state path (single store vs per-panel copy) before proposing a fix.
3. **A6-2 spec is settled (D-019)** — persist pending + open, session-scoped; spec it for implementation, no open question.
4. Note overlap/ordering with the held **#4/#5 replay×drag/keyboard-pan** cross-track pair (also `order-manager.js`) so they land coherently post-b1.
5. Flag which rows are freeze-safe (order-entry files only) vs which touch replay/axis regions owned by other lanes.

## Guardrails
- READ-ONLY. No product/harness/registry edits. This is a contract-design deliverable.
- Do NOT touch `chart.js`, `replay-system.js`, multichart-parent, indicator modules, `known-failing.json`.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/T4-A6-ORDER-INTERACTION-CONTRACT.md` (the 4-row contract table) + a short report summary. State the A6-2 PO question and the A6-4 diagnostic finding. No implementation.
