# Lane 3 — FIX v2 (correction): SL/TP full line must FOLLOW provisional during drag, not freeze

## What b12 got wrong (PO live, screenshots)
The b12 fix (`__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1`, `_shouldSkipOpenSltpLineReposition`) **skipped** repositioning the dragged row in `updateSLTPLines`. But the SL/TP row has TWO visual elements:
- the draggable element moved directly by `makeLineDraggable` mousemove (`order-manager.js:30212` `line.attr('y1'/'y2', newY)`) — this is the **"small line"** the PO sees move, and
- the **full-width dashed SL/TP line drawn by `updateSLTPLines`** — which the b12 skip now leaves **frozen** until release.

Result: during drag the full line is stuck / laggy and only the small element follows; on release `updateSLTPLines` runs and the full line jumps to committed. (BE didn't have this because BE has only the one element — that's why mirroring the BE guard was wrong here.)

## Correct fix (menu option 2 — provisional-follow)
During an open SL/TP drag with A6-1 apply-on-release active, `updateSLTPLines` must reposition the dragged row to the **provisional price** (the one written by `_oiUpdateProvisionalPrice` at 30135/30151), NOT skip it and NOT read committed store. So the full dashed line tracks the cursor smoothly alongside the small drag element; on release, committed == provisional → no jump.

- Replace the `_shouldSkipOpenSltpLineReposition` **skip** with a **provisional-read**: in the SL/TP loops (~38545, ~38756), if this row's order is the actively-dragged one AND a provisional price exists (`_oiGetProvisionalPrice()` / the A6-1 provisional state), position the line/label/price-box/hit-line at `yScale(provisional)` instead of `yScale(committed)`.
- Keep the same kill-switch `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` (default ON = follow provisional; OFF = old committed-read behavior).
- Ensure ALL row elements move together (line, hit-line, label box/text, price box/text, pnl text) — no orphaned fragment left behind (the stray short segment in the PO screenshot must not remain).
- Do NOT change A6-1 commit-on-release semantics (commit + hit-test still on release).

## Also confirm (the "small line" artifact)
Verify the draggable element (`line` at 30212) and the full `updateSLTPLines` line are consistent width/length during drag — the PO sees a SHORT segment. If the draggable element renders shorter than the full line, make the visible dragged line full-width during drag (or ensure the full line following via provisional covers it). No floating stub at any point in the drag.

## Proof (honest, I15 — real place→fill→drag on rebuilt dist)
- **GREEN (fix ON):** drag SL and TP → the **full-width dashed line follows the cursor smoothly** (no freeze, no lag, no stray short segment) → release → commits; no jump/snap.
- **RED-again (switch OFF):** old behavior (frozen full line).
- Verify multi-TP and BE drags unaffected.
- Include before/after description matching the PO screenshots (small-line-only → full-line-follows).

## Constraints
- `order-manager.js` BOTH trees (I8), rebuild dist-v9, bump build id. No chart.js/replay edits. Own file-scoped commit.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-EXEC-SLTP-DRAG-FIX-v2-report.md`: the provisional-follow hunk (both trees), the small-line/full-line consistency confirmation, build id, RED→GREEN→RED-again evidence, multi-TP/BE no-regression, commit hash. NEEDS-LIVE.
