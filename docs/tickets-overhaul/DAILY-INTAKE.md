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

---

## Intake 2026-07-14 (export `tickets/support-export-full-15-07-26`, 5 new tickets: TAL-01588–TAL-01592)

**Context for this batch:** filed on 2026-07-14 — the same day ESC-011 (false-green retraction, D-012) landed. The live product is on **fallback-B** with the deploy frozen, so none of these were filed against the retracted interaction fixes. Three of five are Layouts (multichart) tickets from the same tester — consistent with the harness's honest finding that multichart is the weak surface. Screenshots reviewed for all five.

### IN-PLAN (mechanism already owned by an open track) — 2 tickets

| Ticket | Symptom | Rides with |
|---|---|---|
| TAL-01592 | Resizing the layout breaks the price scale AND the time/date scale in panels (screenshots: axes compressed/blank, tick labels wrong after resize) | **T3 row 14 (GAP-T3-GEOM, scope clarified)** — row 14 was "tile clip/visibility geometry (chart must fill its tile)"; this is the same resize-invalidation family, and the row's acceptance now explicitly includes **axis re-layout on tile resize** (price scale + time scale must recompute for the new tile dimensions, not keep stale metrics). Same owner decision as rows 13–15. Cite TAL-01574 + TAL-01592 together in the row's acceptance. |
| TAL-01589 | Drawing-tool settings (Fib speed fan, Visibility tab): press *Apply default*, then hide a timeframe row → it hides; pressing *show* again doesn't re-show unless the cycle is repeated several times | **T1 lifecycle (visibility state) + T2 invalidation** — the lifecycle store owns `visibility`; "toggle back on does nothing until repeated" is the classic stuck-state + missing-invalidation pair (RC-1 state desync after *Apply default* rewrites the config object; RC-2 no render/state refresh on the re-show edge). Cite in T1's visibility-migration acceptance; if isolation shows the settings panel writes to a stale drawing ref after Apply-default (ghost-ref family, ESC-001 finding 2), it stays T1 outright. |

### GAP (not covered by remaining plan-2 work — plan amended) — 2 tickets

| Ticket | Symptom | Gap + amendment |
|---|---|---|
| TAL-01591 | With the layout **Interval** sync option enabled, all panels should converge to the same timeframe — today they don't | **GAP-T3-SYNC (amendment A4):** exact sibling of row 15 (symbol-sync convergence, TAL-01586) but for the **interval/TF toggle**. New **T3 contract row 16**: on Interval-sync enable (false→true edge), all panels converge to the focused/host panel's TF; while enabled, a TF change on any synced panel fans out. Same owner/transport pattern as row 15 (parent shell `runCommand` fan-out) — Lane 2 drafts, Director approves the owner line, one gated fix. Rows 15 and 16 should be designed together: they are the same convergence mechanism parameterized by (symbol | interval). |
| TAL-01590 | Replay across panels with **different symbols**: only one layout advances correctly; others freeze entirely or show gaps | **GAP-MC-REPLAY-INDEP (amendment A5):** plan 1 proved same-pair replay ownership exhaustively, but **independent-symbol panels during replay** were only covered by the ownership table's "self-owned" row — never by a play-advance scenario. Freeze = the independent panel's playhead-advance path likely gated on same-pair predicates (BL-10 family, but the independent-symbol branch); gaps = self-owned acquisition seam during play. Amendment: one **timeboxed diagnostic** (read-only) — trace how an independent-symbol panel receives/advances the shared playhead during play vs. the same-pair path — plus one RED harness scenario (2 panels, different symbols, play → assert both advance). Owner: the plan-1-experienced lane (Lane 2 or Lane 3 when free — Manager's call by queue); the fix itself waits for the diagnostic. **Priority high**: full replay freeze is a P1-severity symptom, and it is NOT covered by the frozen interaction family (data/replay path, unaffected by D-012's freeze on interaction fixes). |

### OUT-OF-SCOPE / product decision — 1 ticket

| Ticket | Disposition |
|---|---|
| TAL-01588 | Desktop install: app opens into the chart session pinned to a pair different from the backtest pair, with "No data to display"; tester asks that the app open on the dashboard first. **CLOSED — fixed directly by the PO (2026-07-14); no lane work.** Retained note: the ticket's screenshot also showed the "A new version is available" prompt — that evidence stays attached to the existing TAL-01564 row (reload-prompt hygiene, Lane 2 queue). |

### Summary counts

| Disposition | Count |
|---|---|
| IN-PLAN (T3 row 14: 1, T1/T2: 1) | 2 |
| GAP → plan amended (A4: T3 row 16, A5: independent-symbol replay diagnostic) | 2 |
| OUT-OF-SCOPE → CLOSED (fixed directly by PO) | 1 |

All 5 tickets dispositioned; registry append pending with the next registry build.

### Plan-2 amendments issued today

- **A4 (T3 contract row 16 — interval-sync convergence):** TAL-01591. Same convergence mechanism as row 15 parameterized by interval instead of symbol; Lane 2 drafts both rows together; Director approves owners before any fix (rows 13–16 now form the T3 "layout state" block).
- **A5 (independent-symbol replay diagnostic — GAP-MC-REPLAY-INDEP):** TAL-01590. Timeboxed read-only diagnostic + one RED scenario (different-symbol panels must both advance during play, no freeze/gaps). High priority; not blocked by the D-012 interaction freeze (different subsystem). Fix authorized only after the mechanism report.
- **T3 row 14 scope clarified:** acceptance explicitly includes axis re-layout (price + time scale) on tile resize (TAL-01592 + TAL-01574 cited together).

### Priority note for the manager

Small batch, but **TAL-01590 is the standout** — a full replay freeze on independent-symbol layouts is the most severe symptom on the board this week and it runs on the data/replay path, which is *not* under the D-012 interaction freeze. Sequence: A5 diagnostic dispatches as soon as a plan-1-experienced lane is free (don't preempt Lane 4's harness rebuild or Lane 1's transport diagnostic — both are D-012 critical path). Rows 13–16 go to the Director as one T3 "layout state" contract block rather than four separate escalations. TAL-01588 is closed (PO fixed it directly).

---

## Intake 2026-07-15 (export `tickets/support-export-full-16-07-26`, 31 new tickets: TAL-01593–TAL-01623)

**Context for this batch — read this first:** testers ran on the **frozen production deploy (fallback-B)**, which contains **none** of this week's fixes: the D-015 edge-park freeze fix (PO-confirmed on staging a4), the D-009 replay mode/cadence fixes, the D-016 cadence design, and the order-entry family are all staged behind the deploy freeze. A large share of this batch photographs already-fixed defects. Per D-018, the freeze lifts on the combined build after the interaction re-migration — every "PENDING-DEPLOY" row below closes by retest on that build, no new work.

### IN-PLAN — PENDING-DEPLOY (fix already on staging; retest on the combined build) — 6 tickets

| Ticket | Symptom | Staged fix |
|---|---|---|
| TAL-01609 | One chart in layout freezes during replay play | **D-015 edge-park fix** (unified own-master play advance) — exactly the TAL-01590/ESC-013 mechanism |
| TAL-01610 | Only one chart updates in replay, others frozen (also after refresh) | **D-015** — same; the "after refresh" note gets one verification pass on the combined build (fresh-boot cell of the state matrix) |
| TAL-01611 | Replay tick animation while in candle-by-candle mode | **D-009 fix (a)** mode/play routing (TAL-01582 sibling) |
| TAL-01612 | Replay date jumps forward in weeks | **D-009 fix (b)** interval cadence (stale interval-layer family) — verify on combined build; if weekly stepping persists, re-triage to A3 owner |
| TAL-01600 | 2-layout play: layout 1 fast, layout 2 lags | **D-015 + D-016** (cadence parity across panels) |
| TAL-01603 (parts b+c) | Replay follows selected panel's TF instead of smallest; finer-than-host panels don't respond | **D-016 finest-TF cadence** (part b is literally its spec) + **D-015** (part c freeze) |

### IN-PLAN (rides an open track) — 12 tickets

| Ticket | Symptom | Rides with |
|---|---|---|
| TAL-01595 | Single chart: pressing replay jumps viewport A→B in one step | **T8** replay-start/viewport commit family (TAL-01575 sibling, single-chart variant) |
| TAL-01597 | TF switch slow; only a few candles shown until chart is moved | **T8** acquisition seam (BL-14/17 family) + **RC-2** stuck-until-interaction render half — dual-cite T2 |
| TAL-01605 | Re-render resets the other chart's viewport to layout left edge | **T8/T3** — viewport reset on peer re-render; cite with T3 row 14 geometry + T8 policy `adopt-X` cells |
| TAL-01603 (part a) | Main-chart TF stuck — only 1D/4h respond | **T8** TF-switch response family with TAL-01597; single diagnostic covers both |
| TAL-01614 | Open-order PNL only updates on tap/click | **T4 (RC-5)** stale aggregate + **RC-2** invalidation — the canonical T4 symptom |
| TAL-01594 | Apply-default leaves "show info" stuck ON with button gone until OK | **T1/T2** apply-default family — same mechanism cluster as TAL-01589 (settings rewrite desyncs state); cite together |
| TAL-01606 | Chart type doesn't respond first time; needs multiple switches | **T1/T2** first-click-fails family (H-S32 contract) — chart-type control variant |
| TAL-01613 | Time label moves with chart on zoom during replay | **A1 GAP-AXIS** (T2 axis sub-task) |
| TAL-01619 | Indicator price label moves with crosshair | **A1 GAP-AXIS** (TAL-01572 sibling) |
| TAL-01604 | Label keeps moving from its position | **A1 GAP-AXIS** |
| TAL-01618 | Gridline mismatch | **A1 GAP-AXIS** (TAL-01565 gridline row) |
| TAL-01622 | Indicator name options flicker on hover during replay | **T2/T6** — per-frame replay re-render tears down hover chrome; RC-2 invalidation + RC-6 indicator lifecycle |

### GAP (not covered — plan amended, A6) — 6 tickets

| Ticket | Symptom | Gap + amendment |
|---|---|---|
| TAL-01602 | Dragging SL during replay: trade closes when the held line touches price — should apply only on release | **A6 (T4 order-interaction contract):** new row — SL/TP edits are **apply-on-release**; while held, the line is provisional and must not trigger fills/closes. RED-first (replay + drag-hold across price). |
| TAL-01616 | Order disappears on refresh (F5) | **A6:** new row — open-order persistence across reload (state save/restore). Needs a spec decision from PO: persist pending *and* open orders? (Default: both, per-session file.) |
| TAL-01615 | Dragging the price-scale label drags the order with it; only double-tap restores | **A6:** new row — price-axis gesture must not mutate order lines (sibling of A1's TAL-01566 gesture-isolation, but the order half lives in T4). |
| TAL-01601 | 2 layouts: SL move on layout 2 doesn't mirror to layout 1; limit move lands below SL | **A6:** new row — **cross-panel order-state convergence**: one order store, panels render projections; per-panel divergence is an RC-5 ownership defect. Diagnostic-first (where does panel 2 hold its copy?). |
| TAL-01593 | Holding Shift on a rectangle corner snaps the shape to chart top/bottom | **T1 GAP row:** modifier-drag (Shift=aspect/constrain) path in resize handler broken — registry row, rides T1 per-tool migration; not urgent. |
| TAL-01599 | Chart type Bar/Line/Area render defect (screenshot) | **Needs repro detail** — image shows the defect but not the trigger; registry row logged; tester asked for steps (P5) before scoping. |

### UI-polish batch / perf backlog / closed — 7 tickets

| Ticket | Disposition |
|---|---|
| TAL-01623 | Holding Shift+→ spams a notification per step — **UI-polish batch** (debounce/coalesce the toast; keyboard repeat) |
| TAL-01607 | Compare-Symbol blue button visibility — **UI-polish batch** |
| TAL-01608, TAL-01598 | Compare Symbol makes chart heavy/laggy; renders slowly — **GAP-PERF (perf backlog)** with TAL-01561; Compare Symbol adds a per-frame overlay series; scoped in the post-plan-2 render-budget phase. If PO deems it P1, it needs its own escalation. |
| TAL-01620 | VWAP + replay = large lag (+note: replay runs candle-by-candle at speed 60) | **Split:** VWAP lag → **T6/RC-6** indicator per-frame recompute (anchored VWAP recomputes full series per frame — known RC-3-adjacent hotspot); cadence note → rides D-009/D-016 retest |
| TAL-01621 | Opening-range indicator: input change doesn't update the value shown next to indicator name | **T6/RC-6** settings→label invalidation (same family as T4's label-refresh fix, indicator flavor) |
| TAL-01596 | CSV suffix on pair names — **already closed** by tester |

### Summary counts

| Disposition | Count |
|---|---|
| IN-PLAN — PENDING-DEPLOY (closes with the D-018 combined build) | 6 |
| IN-PLAN (T8: 4, T4: 1, T1/T2: 2, A1-axis: 4, T2/T6: 1) | 12 |
| GAP → A6 (T4 order-interaction contract: 4) + T1 row + needs-repro | 6 |
| UI-polish / perf backlog / T6 / closed | 7 |

### Plan-2 amendments issued today

- **A6 (T4 order-interaction contract):** four new rows — SL/TP apply-on-release (TAL-01602), order persistence across refresh (TAL-01616, PO spec needed on scope), price-axis gesture isolation from orders (TAL-01615), cross-panel order-state convergence (TAL-01601, diagnostic-first). Lane 3 owns; contract rows before fixes, same discipline as T3's table.
- **T6 evidence:** TAL-01620 (VWAP replay lag) + TAL-01621 (settings→label staleness) + TAL-01622 (hover chrome flicker) form T6's opening evidence set — T6 was thin on live evidence until today.

### Priority note for the manager

**Six tickets close with zero work the moment the D-018 combined build ships — the re-migration is now blocking visible tester pain, not just process.** Sequencing unchanged (phases are the critical path), but this is the strongest argument yet for no scope creep inside the phases. New dispatchable work this intake: A6 contract drafting (Lane 3, after its current queue), the TAL-01597/01603a TF-response diagnostic (T8, after current queue). Everything else rides.
