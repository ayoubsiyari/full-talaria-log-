# Daily Tester Intake — Plan 2 Triage Ledger

Testers run daily this week; each evening's export is triaged here by the Director against plan 2. Every ticket gets exactly one disposition:

- **IN-PLAN** — the mechanism is already covered by an open track/step; ticket rides that work (no new task).
- **FIX-REGRESSION** — a plan-2 (or plan-1) fix touched this and didn't hold; goes to the owning lane with priority.
- **GAP** — not covered by remaining plan-2 work; plan amended (track scoped or registry row with RC).
- **OUT-OF-SCOPE / NEEDS-INPUT** — outside plan 2 (journal, features) or needs PO/tester clarification first.

Standing intake rules:
1. New tickets are appended to `TICKET-REGISTRY.csv` on triage day.
2. IN-PLAN tickets are cited in the owning track's acceptance so they close with tester confirmation (P5), not silently.
3. A GAP that matches an existing RC family extends that track's scope; a GAP with a new mechanism gets a registry RC guess and a Director scope ruling before any lane picks it up.
4. Build-id discipline (L1) applies to every retest of these tickets.

---

## Intake 2026-07-13 (export `tickets/support-export-full-14-07-26`, 28 tickets)

**Context for this batch:** testers ran during the T1 multichart instability window (b6–b8 regressions, step-7 partial recovery, fallback-B default-flip staged). Several drawing/selection tickets are photographs of exactly that window. **Action for the manager: after fallback-B (or step-8) lands and rebuilds, these specific rows get a first-pass retest before any new work** — they may already be gone.

### FIX-REGRESSION (plan-2/plan-1 work didn't hold) — 3 tickets

| Ticket | Symptom | Owner | Disposition |
|---|---|---|---|
| TAL-01569 | Ctrl-select: chart stuck during drag, selection only lands on Ctrl release | **Lane 1, T1 step 8** | Same family as R1/R2 residuals under D-007's isolation matrix. The marquee (`ctrlMarqueeSelect`) starts but its live-drag update/commit path is broken — matches the D-007 finding that steps 4–6 migrated the marquee's state predicates. Retest first on the fallback-B build; if it persists single-chart, it's the step-8 RED. |
| TAL-01564 | Reload prompt returns after clicking reload or cancel | **Lane 2 queue (plan-1 hygiene regression)** | Plan 1 shipped the SW-bypass version check (b101 journey item). "Prompt keeps returning" = the version compare still sees a mismatch after reload (stale SW survived) or cancel isn't persisted. Small, self-contained; RED-first live repro; do **not** fold into T8. |
| TAL-01584 | Crosshair snaps to tool's previous position on Ctrl-hold | **Lane 1, T1 family** | This is registry row TAL-00157#11's symptom ("crosshair stuck in tool's previous position") resurfacing — the T1 lifecycle owns crosshair/selection chrome. Cite in T1 step-8 acceptance; retest on fallback-B build first. |

### IN-PLAN (mechanism already owned by an open track) — 12 tickets

| Ticket | Symptom | Rides with |
|---|---|---|
| TAL-01560 | Unexpected gaps in layout chart | **T8** (mirror-frame/data-adoption family; matches DEFER-T8 TAL-01480 evidence set) |
| TAL-01562 | Price gaps during manual replay, clears on re-render | **T8** (adopt-data seam; new evidence row for the policy table) |
| TAL-01563 | Replay advances in candle groups + mismatch until pan | **T8** (plan-1 BL-13 family — panel playback cadence; policy-table cell, not guard #21) |
| TAL-01573 | Manual rescale triggers full re-render | **T8** evidence + **RC-2** flavor; log to policy-table inputs |
| TAL-01575 | Replay start shifts viewport in some layouts | **T8** (boot/replay-start commit family, plan-1 b105 sibling) |
| TAL-01577 | 1D/4H few candles → rescale → gap → re-render from seam | **T8** (coarse-TF acquisition seam; BL-14/17 family evidence) |
| TAL-01578 | Drag freeze — chart can't be moved | **T8-EVIDENCE / retest** (matches DEFER-T8 TAL-01489/01497 family) — if it reproduces *outside* replay, re-triage to T3 |
| TAL-01579 | Chart snaps back to grab point on release | **T8** (plan-1 boot-shake/index-pin family — b102/b103/b105 siblings; retest on current build first) |
| TAL-01568 | Brush doesn't move until clicked first | **T1** first-click family (H-S32 contract; brush = per-tool subscriber migration, step 7 of T1 migration order) |
| TAL-01570 | Crosshair appears at chart center when clicking a tool | **T1** lifecycle chrome (arm-tool transition side effect); cite in T1 step-8 acceptance |
| TAL-01585 | Drawing layer moves with chart while TF-switch spinner shows | **T5 live-evidence** — exactly the prepend/TF-switch drift the T0-step4 scoping note said needs live verification; attach to T5 acceptance |
| TAL-01587 | Drag past layout boundary loses control (host tile only) | **T3 Row 11 REOPENED** — this is TAL-01491's sibling with a cleaner repro (mouse leaves layout bounds → drag dies). D-004's "no repro = close" path is now off the table; the live drag-trace step is mandatory. Note: harness probe measured plot *rects* equal — this evidence points at **pointer-capture/mouseleave handling**, not rect geometry, consistent with both. |

### GAP (not covered by remaining plan-2 work — plan amended) — 9 tickets

| Ticket | Symptom | Gap + amendment |
|---|---|---|
| TAL-01565, TAL-01583 | Clicking chart shifts time label / changes day; last gridlines wrong at half-hour intervals | **New family: time-axis label/grid correctness (GAP-AXIS).** No plan-2 track owns the time-axis tick builder (`_buildTimeTicks` was only touched via BL-15 relabel). Added to T2's scope as a bounded sub-task (see amendment A1). |
| TAL-01572 | Custom TF (3m): time labels move with crosshair instead of staying fixed | Same GAP-AXIS family — custom-interval tick generation uses a different basis than native TFs. Rides A1. |
| TAL-01566 | Dragging price label pulls chart down | GAP-AXIS interaction half: price-axis drag gesture leaks into chart pan. Rides A1 (interaction rows). |
| TAL-01567 | Chart "brightness" drops panning into a region | **GAP-RENDER**: likely the interaction-lite LOD path (plan-1 pixel-column LOD) visibly degrading — a *felt* rendering-quality defect, no owner. Logged as registry row RC-2-adjacent; needs a live capture before scoping (screenshot suggests LOD threshold, not data). Manager: add to PO parity checklist as an observation row, not yet a task. |
| TAL-01571 | Page refresh resets layout to single | **GAP-T3-PERSIST**: layout persistence was never a contract row (T3 covers interaction, not layout state persistence). Amendment A2 adds contract row 13. |
| TAL-01574 | Chart disappears below a boundary area | **GAP-T3-GEOM**: tile geometry/clipping defect — new T3 row (A2, row 14). Needs the screenshot's layout to reproduce. |
| TAL-01576 | Add-layout menu flashes broken before settling | **GAP-UI-POLISH**: React shell render-before-style; registry row, batched low-priority (not a lane task this week). |
| TAL-01582 | Tick-by-tick mode silently reverts to candle-by-candle in replay | **GAP-REPLAY**: replay *mode selection* was never in plan 2 (plan 1 covered data/viewport, T4 covered order×replay). Amendment A3: scope one Lane 3 diagnostic (Lane 3 is nearly free post-T4). |
| TAL-01561 | "Rendering slow, needs improvement" (layouts) | **GAP-PERF (deferred)**: render-budget work is the post-plan-2 Phase (plan-1 §7 residual + indicator per-frame recompute). Not actionable as a ticket; registry row cites the perf backlog. PO informed. |

### OUT-OF-SCOPE / NEEDS-INPUT — 4 tickets *(all three clarified by PO, 2026-07-13 late — re-dispositioned below)*

| Ticket | Disposition |
|---|---|
| TAL-01580 | **CLARIFIED → GAP-UI-POLISH.** News item for the EU shows the text "EU" with no flag icon — the flag asset map lacks a European-Union entry (EU is not a country code in the flag set). Small cosmetic fix in the news panel; batched with TAL-01576 in the UI-polish batch, not a lane task. |
| TAL-01581 | **CLARIFIED → IN-PLAN (A3, Lane 3).** In candle-by-candle replay mode with an interval selected (e.g. interval 4h while on 4h TF), play misbehaves intermittently, and step-forward likewise. Same subsystem as TAL-01582 (replay mode/cadence selection) — folded into the A3 diagnostic, whose scope is now "replay mode + interval cadence ownership" covering both tickets. |
| TAL-01586 | **CLARIFIED → T3 contract row 15 (spec confirmed by PO).** With multichart panels on different tickers, enabling layout **symbol sync** must converge all panels to the same ticker (the focused/host panel's). Today it doesn't. This is a T3 interaction-surface row: target owner + transport need Director approval like rows 1–14 (expected: parent shell applies focused ticker via `runCommand` fan-out on sync-enable). |
| TAL-01587 | *(also listed under IN-PLAN Row 11)* — dual-logged intentionally: reopening evidence for Row 11. |

### Summary counts (after PO clarifications)

| Disposition | Count |
|---|---|
| IN-PLAN (T8: 8, T1: 3, T5: 1, T3: 1 reopen, A3/Lane 3: 1) | 13 (+1 dual) |
| FIX-REGRESSION | 3 |
| GAP → plan amended (incl. T3 row 15, UI-polish batch +1) | 11 |
| NEEDS-INPUT remaining | 0 |
| OUT-OF-SCOPE remaining | 0 |

All 28 tickets from this intake are now dispositioned with no open questions.

### Plan-2 amendments issued today

- **A1 (T2 scope extension — GAP-AXIS family):** T2 gains a bounded sub-task "time/price-axis label & gesture correctness": (i) time-axis tick/label stability on click and during crosshair moves (TAL-01565/01583), (ii) custom-interval tick basis parity with native TFs (TAL-01572), (iii) price-axis drag gesture isolation from chart pan (TAL-01566), (iv) last-gridline interval correctness (TAL-01565). RED-first per symptom; same invalidation-contract discipline; still Lane 1 after the T1 recovery stabilizes. Rationale: these are render/interaction-contract defects in shared chrome — closest existing track is T2, and creating a new track for 4 tickets would fragment lanes.
- **A2 (T3 contract rows 13–14):** row 13 = layout persistence across refresh (owner: parent shell; localStorage/session restore), TAL-01571. Row 14 = tile clip/visibility geometry (chart must fill its tile; no dead zones), TAL-01574. Both need Director-approved target owners before fixes (same process as rows 1–12); Lane 2 drafts them into the contract table.
- **A3 (Lane 3 next task):** one timeboxed diagnostic — replay tick-by-tick mode reverts to candle mode (TAL-01582): find the mode-selection owner and why replay start overrides it; report mechanism before any fix. Dispatched when Lane 3 clears its current queue (it is the freest lane).
- **Row 11 reopened (T3):** TAL-01587 supersedes the "retest-close" path from D-004; the live drag-trace is now mandatory and the mechanism hypothesis shifts from rect geometry to pointer-capture/`mouseleave` handling on the host tile.

### Priority note for the manager

Do not fan these out as 28 tasks. This intake adds: **zero new lanes**, 3 regression rows into existing recovery work (T1 step 8 + one plan-1 hygiene item), 2 new T3 contract rows, 1 Lane 3 diagnostic, and 1 T2 scope extension. Everything else rides existing tracks or waits on retest/clarification. The single most important sequencing fact: **a third of this batch was filed against the known-unstable T1 multichart window — land fallback-B/step-8, rebuild, and burn down the retest list before dispatching anything new from this intake.**
