# WORKER PROMPT — T3 step 2 (Lane 2): Row 2 + Row 11 RED-isolation / measurement probe

> Hand to the Lane 2 (panel) worker. **Director ruling D-002 authorizes this.** This step is RED-isolation + measurement only — **no fixes.** Findings return to the Director before any fix (retained checkpoint).

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T3 step 2 (isolation subset)**, Lane 2. The full contract-row scenario suite waits on PO retest results; this subset is the two Director-checkpoint rows, which are retest-independent diagnostics.

## READ FIRST (binding)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — **D-002** (your authorization + checkpoint)
- `docs/tickets-overhaul/T3-INTERACTION-PARITY-CONTRACT.md` — rows 2 and 11
- `docs/tickets-overhaul/ROOT-CAUSES.md` — **RC-4** (note footnoted stale line ref)
- `docs/tickets-overhaul/INVARIANTS.md` — all binding; especially I9, I11, L2, P2

## BINDING CONSTRAINTS (D-002)
- **No fixes this step.** Deliver isolation/probe findings only; fixes are dispatched after Director reviews.
- **I11:** No mirror-frame guard work. These are interaction-surface diagnostics.
- **L2:** Production `multichart-prod/` only; never legacy `multichart/`.
- **I9:** Do not alter existing scenario assertions. New probe scenarios may be added as tracked-red/diagnostic, not promoted.

## TASK

### Row 2 — Selection / Ctrl-select (TAL-01498): RED-isolation
Build a deterministic harness scenario that reproduces Ctrl-select-on-second-panel collapsing tools to one point, and **discriminate between the two candidate mechanisms**:
- (a) inbound coordinate decoration reusing the wrong frame — `decorateDrawingPointsWithLocalIndices` (`sync-bridge.js:1784-1838`)
- (b) parent focus-cleanup racing the selection guard — `clearDrawingUiOnOtherPanels` (`MultichartGrid.jsx:3737-3742`, `4754-4768`) vs `__v9DrawingSelectionGuardUntil` (`MultichartGrid.jsx:5847-5866`)

The scenario must **implicate exactly one** (or show both contribute, in which case each is a separate future gated fix). Report which, with the discriminating evidence (e.g. coordinates before/after, timing/order of the two paths).

### Row 11 — Pan drag bounds (TAL-01491): measurement probe
Build a probe that **measures host vs iframe effective plot rect** — the host tile canvas sized to `#chartWrapper` slot overlay (`MultichartGrid.jsx:905-919`) vs iframe full-document canvas, and `chart._constrainOffsetDuringDrag` (`chart.js:24993-25025`). Report the measured plot rectangles for host and an iframe tile in the same layout, and identify **which geometry violates the contract** (per-tile owns its own canvas pan bounds). Do NOT propose a host offset constant — the fix (later) corrects whichever geometry is wrong.

## KILL-SWITCH
- N/A (diagnostic). Fixes (post-checkpoint) will each get their own `__TALARIA_*` flag.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T3-step2-row2-row11-isolation-report.md`)
1. **Row 2:** the RED scenario spec + which mechanism is implicated (a / b / both), with discriminating evidence.
2. **Row 11:** measured host vs iframe plot rects + which geometry violates the contract.
3. Any probe scenarios added to the harness (diagnostic; not promoted; I9 intact).
4. Explicit confirmation: no fixes applied; no engine runtime edited beyond diagnostic probes; legacy `multichart/` untouched.

## STOP CONDITIONS
If a row cannot be reproduced deterministically in the harness, report the dead end + the exact manual repro needed from the tester rather than guessing. If tempted to fix — STOP; fixes wait for the Director checkpoint.
