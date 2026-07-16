# T4 (Lane 3) — order-manager landing-sequence consolidation (READ-ONLY)

A6 fixes are escalated to the Director (ESC-017) — do NOT implement yet. This read-only step consolidates all the pending `order-manager.js` interaction work into ONE coherent landing plan so Lane 3 can execute the instant ESC-017 approves, without re-touching the same regions repeatedly.

## Why
Four separate items all live in the same `order-manager.js` drag/replay regions and will collide if landed piecemeal:
- **A6-1** — SL/TP apply-on-release (TAL-01602) — `makeLineDraggable` onMouseMove/onMouseUp, `updatePositions` hit-test.
- **TAL-00752 #4** — replay×drag limit → SL glitch (`_syncPreviewToReplayPrice` race while `isDraggingPreviewLine`).
- **TAL-00752 #5** — keyboard-pan×replay draft desync (scale/offset during replay redraw).
- **A6-3 order-half** — price-axis gesture must not mutate order prices (order-side only; the chart.js axis-drag guard is separate/gated).

## Tasks (read-only — no product/harness/registry edits)
1. Produce a single **`order-manager.js` change map**: for each of the 4 items, the exact functions/regions touched, and where they **overlap** (esp. the drag-guard + replay `onUpdate` hit-test path).
2. Define the **coherent landing order** and a **shared guard model** (one provisional-while-dragging concept that A6-1, #4, #5 all consume) so we don't add 4 overlapping guards. Name each item's kill-switch and whether any should be consolidated.
3. Confirm each item's **freeze-safety** (order-manager only vs chart.js/replay-system spillover). Flag any chart.js touch (A6-3 axis guard) for a separate gated slot.
4. For each, the RED scenario (I15 — real replay drag-hold / real pan / real axis gesture; measure order end-state) — reconcile with the A6 contract's RED specs (don't duplicate ids; coordinate with Lane 4).
5. **Do NOT edit `replay-system.js`** — all replay coupling stays as `order-manager.js` guards consuming existing `onUpdate`.

## Guardrails
- READ-ONLY. No product/harness/`known-failing.json` edits. Docs only.
- No implementation until ESC-017 rules.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T4-order-interaction-landing-sequence-report.md` — the unified change map, shared-guard model, landing order, per-item freeze-safety + RED spec. State "order-manager slot ready to execute on ESC-017 approval."
