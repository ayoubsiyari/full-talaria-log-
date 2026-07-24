# Plan 3 Board — mechanism rows

Status vocabulary: INTAKE → DIAGNOSED → FIX-LANDED → CLOSED-VERIFIED (member tickets close only on reporter/PO re-verify on their own surface at a named checkpoint, P5/L1). Recurrences use `RECURRENCE-A-PENDING` → `A-STALE` / `B-NEW-MECHANISM` / `STICKY`; see `STICKY-REGISTRY.md`.
Source: `tickets/support-export-full-all-7-20-26` — 32 threads / 36 distinct bugs (residuals as of 2026-07-20). Multi-bug threads split with letter suffixes.

## Execution status — 2026-07-20

Current provenance surface: CKPT-011 · `20260720b21` · `https://www.talaria-log.com` (Manager re-probed build id before dispatch).

**GLOBAL HARD STOP — updated 2026-07-21:** Manager re-probe found public shell/embed/SW `20260721b23` while `chart.js` engine remains `20260721b12`. The public surface is not a D-034 checkpoint. M19 is the only active engineering row, but no live verdict or P5 close is valid until an exact-digest restore or named successor SHA/build-id/digest checkpoint passes the tripwire.

**Checkpoint readiness — retained deploy gate, 2026-07-23:** Final A–E checkpoint `20260723b04` is local-source/build GREEN at commit `ba38525baf1e9b35a7552a5215d179c9cbc8ec97` (parent C `c9700ebc8`). Its strict chart/homepage build, in-image layout/I8 and 29-check image tripwire are GREEN. Local digests are chart `sha256:174063019f8b013cd428f699f397ee9f564b6d6cb262deb43f7db65717da0344` and homepage `sha256:b80b0f9793b7fde537c00509cc7c2cd72de92c156fb502f1c8e9aad8b4080baf`; labels bind both to `20260723b04` and `ba38525ba`. Source/tag and images are not remote. GHCR package-write authorization still blocks publication, and production is unchanged. Deployment remains forbidden until remote digests and the exact-digest runtime tripwire are verified.

**PO GLOBAL PRIORITY OVERRIDE — effective 2026-07-22, extended 2026-07-23:** M19 progressive session degradation is the single #1 priority of the entire plan. **2026-07-23 extension: M19 is NOT closed by b57 (A–H). The surviving multiple-indicators-during-replay lag is M19-I (see Director ruling at the bottom of this file) and is the immediate next work item.** **2026-07-24 extension: a Director four-track audit found ~30 additional latent lag sources — see M20 (latent lag inventory + permanent anti-lag gate) at the bottom of this file. Order: M19-I → M20 QUICK-KILL → M20 A→B→D→C. Nothing else unparks before M20 closes.** All other ticket work, including M10/TAL-01800, is parked cleanly. All four lanes work only on M19 until its gated fixes are landed and the canonical soak is GREEN. Fixes ship independently in value order; Fix (a) must not wait for (b)–(e). Every deploy remains bound by D-031/D-034, and D-030/I16 remain binding for persistence work.

**Parked M10 state:** TAL-01815 and TAL-01798 remain PO-verified with permanent gates. TAL-01800 and all remaining M10 work are parked without partial edits and resume immediately after M19. No worker may modify an M10 path during the override.

**Current board pulse:** in flight — final A–E checkpoint `20260723b04` is `LOCAL-SOURCE+BUILD-GREEN` at `ba38525ba`; local runtime buildcheck is uniform across dist-v9/modules/SW/embed/legacy. The 12-cell real-browser matrix is `BLOCKED-AUTH`, not failed: the local stack is running at `http://127.0.0.1:3000`, but `TEST_EMAIL` and `TEST_PASSWORD` were absent, so the chart redirected to login and no CPU/correctness cell ran. No admin substitute was used. The PO must export the dedicated non-admin QA credentials only in Worker 4's shell and rerun the retained matrix script. GHCR auth independently remains the publication blocker. Production is unchanged.

**Production QA data:** probes may create sessions/orders only under dedicated QA account ids supplied by the PO. Never use admin or real-user accounts; all QA records must remain filterable from customer data under I16.

**Recurrence triage — binding 2026-07-22:** nine unique reopen-signal tickets are recorded in `STICKY-REGISTRY.md`; the PO-stated tenth ID is missing from the listed IDs/exports. None is confirmed `STICKY` yet because every reporter-device URL/build/SW identity is absent. Triage step (a) runs before engineering. M19-R/TAL-01585 and M8/date-jump are first suspects; TAL-01617/01717/01723/01719 have strong stale-public-surface priors.

| Lane | First task | State |
|---|---|---|
| L1 — Rendering / checkpoint | M19(d), then M19(e) | FINAL A–E LOCAL-CHECKPOINT-GREEN — commit `ba38525ba`, build `20260723b04`, local D-031/D-034 tripwire GREEN; no publication/deploy |
| L2 — Sync + Replay | M19 acceptance instrument | ACTIVE — independently own baseline/per-fix soak execution, before/after slope and payload numbers, switch-OFF discrimination, evidence persistence, and flake classification; no product edits |
| L3 — Orders | M19(a), then (b), then (c) | FIX-A+B+C LOCAL-CHECKPOINT-GREEN — C commit `c9700ebc8`, strict build `20260723b03`, local tripwire GREEN. Lane 3 stands down; production unchanged; M10 parked |
| L4 — Interaction/UX | M19 state matrix | BLOCKED-AUTH — local b04 provenance GREEN; 12 cells did not run because QA env vars were unset. Rerun immediately after PO exports `TEST_EMAIL`/`TEST_PASSWORD`; no admin fallback or product edits |

TAL-01744a and TAL-01685 remain `NEEDS-PO-CLARIFY`; neither is dispatched. TAL-01736a is also `NEEDS-PO-CLARIFY` for one exact-action detail: does “switching to another layout while the mouse button is held” mean entering/focusing another existing panel, or changing the grid layout (for example 2→4)?

## Lane 1 — Rendering

### M4 — Axis/grid/tick correctness + render latency (P1) — 5 bugs
| Member | Symptom |
|---|---|
| TAL-01739 | Gridlines flicker (vanish/reappear) while dragging |
| TAL-01740 | Slow rendering; time/date scale misaligned |
| TAL-01734 | Custom TF (3m) + zoom out → gridline/time labels far apart (**recurrence of plan-2 A1 custom-interval tick basis — start from that diagnostic**) |
| TAL-01724 | Zoom-in per-candle gridlines survive Ctrl+R reset (stale tick cache not invalidated on reset) |
| TAL-01688 | Alert renders in a broken state (screenshot) |
Notes: likely 2 sub-mechanisms — (a) tick-builder basis/cache invalidation (01734/01724/01740-labels), (b) paint-order/flicker during interaction-lite render (01739). Diagnostic decides the split.

### M5 — Candle paint determinism / stuck-until-interaction (P1) — 3 bugs
| Member | Symptom |
|---|---|
| TAL-01726 | Candle colors change while slowly panning (video attached) |
| TAL-01725 | Same symbol+TF+zoom, different candle colors/shapes across panels |
| TAL-01709 | Symbol switch → partial candles, completes only after moving the chart (**RC-2 stuck-until-interaction family — plan-2 invalidation contract; check provenance first**) |
Notes: 01725/01726 suggest paint reads mutable state mid-pan (LOD path or resample seam) — determinism defect, not cosmetic.

## Lane 2 — Sync + Replay

### M1 — Sync-OFF coupling leak / sync-ON follow gaps (P1) — 4 bugs
| Member | Symptom |
|---|---|
| TAL-01743 | Moving one chart moves other layouts; manual rescale affects peers |
| TAL-01737b | Time/date-scale gesture on chart 2 moves chart 1 |
| TAL-01732b | (Darija, translated) split charts sometimes do NOT move together (sync-ON follow gap) |
| TAL-01744b | Crosshair customization not applied across layouts (settings-sync gap — spec: should apply to all) |
Notes: both directions of the same contract — coupling when OFF, missed follow when ON. Plan-2 T8/BL family is the reference; provenance check first (users may be on pre-fix surfaces).

### M2 — Replay cross-panel cadence + replay-time UI staleness (P1) — 2 bugs
| Member | Symptom |
|---|---|
| TAL-01733 | Visible lag between panels during replay play |
| TAL-01700 | Crosshair time label frozen during replay (should track replay clock) |
Notes: 01733 = plan-2 BL-11/13/finest-TF cadence family — verify build first, then extend H-S19/H-S83 REDs rather than writing new ones.

## Lane 3 — Orders

### M6 — Order-line anchoring, drag-follow, multi-TP, risk model (P0 — top of plan) — 8 bugs
| Member | Symptom |
|---|---|
| TAL-01696 | SL + entry lines shift left/right when chart or price label moves (anchoring) |
| TAL-01653 | SL/TP don't follow entry during drag, only on release (**A6-1 visual-follow clarification recurrence — verify staged fix reached this surface**) |
| TAL-01698 | Phantom TP1 appears during order drag, vanishes on release |
| TAL-01699 | Stacked TP1/TP2 stick together, can't be separated (hit-test needs z-order/cycle disambiguation) |
| TAL-01697 | PnL reads 0 while TP is being dragged, recalculates on release (provisional state not fed to PnL calc) |
| TAL-01683 | Fixed-$ risk: moving SL must hold risk constant and recompute quantity |
| TAL-01692 | Order label value precision mismatch (50 vs 500 — formatting/rounding truncation) |
| TAL-01658 | Add-Entry makes order+SL disappear; delete reverts to undeletable market order (**plan-2 T4 multi-entry residual — retest on current build first**) |
Notes: D-030 money-path ship-gate applies to every fix here. Likely 3 sub-mechanisms: (a) anchoring/coordinate resolve, (b) provisional-drag state model (phantom TP + PnL-0 + follow), (c) risk/quantity + formatting math.

### M7 — Cross-panel order sync asymmetry (P1) — 1 bug
| Member | Symptom |
|---|---|
| TAL-01691 | Order edits sync chart1→chart2 but not chart2→chart1 (panel edits don't route to host — the A6-4 host-canonical completion case) |

## Lane 4 — Interaction/UX + polish

### M3 — Pointer-capture / gesture ownership (P1) — 5 bugs
| Member | Symptom |
|---|---|
| TAL-01736a | Rescale gesture + switch layout with button held → chart uncontrollable |
| TAL-01736b | Same with an order on chart + release outside layout → chart permanently uninteractable |
| TAL-01735 | Dragging the time label makes the chart run away leftward until it disappears |
| TAL-01728 | Actions don't respond on first attempt (first-click family — verify against plan-2 T1 fixes/provenance first) |
| TAL-01714 | Text tool: selection stays on toolbar after draw instead of returning to crosshair (lifecycle store arm/disarm gap) |
Notes: 01736a/b + 01735 = one pointer-capture/release contract across tiles (plan-2 T3 Row 11 kin); the stuck-forever variant (01736b, order present) crosses into L3's hit-test — diagnose jointly, fix in one lane.

### M8 — Navigation + persistence (P2) — 3 bugs
| Member | Symptom |
|---|---|
| TAL-01747 | Symbol selection not persisted across refresh |
| TAL-01677 | Go To session (London→NY) shows error message consistently |
| TAL-01732a | (Darija, translated) following price on 1m at Jan 23, viewport lands at Mar 4 (goto/date-jump defect) |

### M9 — Polish batch (P3, fill work) — 4 bugs
| Member | Symptom |
|---|---|
| TAL-01744a | Crosshair snaps to candles — reporter says incorrect. **NEEDS-SPEC (PO):** is magnet-snap intended default? If yes → add free-crosshair option; if no → default free |
| TAL-01731 | Indicator-list arrow should appear only when indicators exist |
| TAL-01656 | Anchor tool shows too many control points (plan-2 A7b chrome residual) |
| TAL-01685 | Desktop app opens a new window per launch instead of reusing (app shell, not chart engine — PO may route outside plan) |

## Standing first action (all lanes)

Before any diagnostic: **provenance retest per D-034** — confirm the symptom on the current tripwire-verified build with build id recorded. At least six rows are recurrences of plan-2-fixed families (01653, 01658, 01709, 01728, 01733, 01734) — if the reporter was on a stale surface, the row closes by retest with zero engineering.

## Open PO questions

1. TAL-01744a — crosshair magnet-snap: intended default or defect?
2. TAL-01685 — desktop app window reuse: route into plan 3 (L4) or handle outside (it's the app shell/wrapper, not chart code)?

---

# Intake 2026-07-21 (export `support-export-full-all-21-07-26`, ~66 new tickets TAL-01748–01816 + 9 evidence-backed reopen signals; PO's tenth ID pending)

## NEW MECHANISM — M10: Execution & PnL correctness (P0 — OUTRANKS M6, Lane 3) — 11 bugs

The most serious family of the intake: **trades executing, closing, or marking at wrong prices/times without user action.** D-030 money ship-gate binds everything here.

| Member | Symptom |
|---|---|
| TAL-01815 (Arabic, translated) | Activating a market/pending order instantly exits at break-even as if a target was hit — SL and TP are far from price. **Worst bug on the board.** |
| TAL-01798 | Order gets CLOSED by changing TF in another layout |
| TAL-01800 | Moving chart / Ctrl+R closes orders and replaces them with new ones |
| TAL-01787 | TP1 computed at wrong level; TP2 never triggered |
| TAL-01788 | Multi-TP targets not executed at correct price levels |
| TAL-01786 | Duration calculation wrong; Net PnL not displayed with multi-TP |
| TAL-01809 | Balance goes negative when SL risk > balance (must clamp at 0) |
| TAL-01756, TAL-01810 | With spread enabled, SL/TP exit arrows render on the wrong candle (entry candle or spread-offset candle) |
| TAL-01807 | SL/TP arrows glitch after spread-SL + new order + replay; also wrong render after switching pair |
| TAL-01796 | Stray X/close marker on chart after TP hit |
Diagnostic guidance: 01798/01800 smell like one root — order lifecycle re-evaluated on chart-state changes that must not touch it (same class as plan-2's D-030). 01815 may share it (activation re-evaluates against wrong price). Diagnose 01815/01798/01800 as one candidate mechanism first.

Landed evidence (2026-07-22): current candle playback returned guard tick `-1`, so a newly placed/activated order could consume the already-rendered full-candle high/low and close at the current mark. `order-manager.js` now assigns each order a non-persisted canonical replay-event watermark, retains the fine execution feed across display-TF switches, advances every owned market event, rebases on TF/seek guard refresh, and uses a strict current-candle barrier. Host-owned replay-frame P&L projection is coalesced and bounded to live rows; canonical event timestamps/marks project across TFs; marker geometry updates once per live pan frame without a release snap. Permanent tests cover market/pending activation, 1m→1D source ownership, TF resample, pan/reset duplicates, bounded runtime P&L payloads, zero full-panel hot-path rebuilds, canonical marker projection/pan glue, restore baseline, replay-clock duration, non-blocking activation UI, legitimate future TP close, and RED-again switches. PO real-UI PASS: TAL-01815 exact 1m limit → 1D → Play; TAL-01798 A=1m/B=5m then 15m with synchronized P&L/current price/entry/SL/TP and continuous marker drag. TAL-01800 remains open.

## NEW MECHANISM — M11: Margin model (P1, Lane 3) — 3 bugs
TAL-01772, TAL-01776 (both Arabic — translated: NQ market + limit orders rejected "insufficient free margin" with $10,000 balance), TAL-01778 ($1,000 SL on $10k balance → insufficient margin). Futures contract margin computation is wrong or uses the wrong multiplier.

## NEW MECHANISM — M12: Order–symbol binding leak (P1, Lane 3) — 3 bugs
TAL-01777 (place-order panel stays open across pair switch; SL stays on first pair), TAL-01807b (SL/entry from another pair render after switching), TAL-01799 (order auto-appears on newly added layout). Orders must be bound to their symbol+session, and the order panel must close/rebind on pair switch. D-030 kin.

## NEW MECHANISM — M13: Futures tick-size quantization (P1, Lane 3) — 3 items
TAL-01774 (futures order inputs must snap to .25/.50/.75/.00), TAL-01808 (position tool moves in 0.25 steps but release shows a different value — quantize-on-release mismatch), TAL-01773 (spec request: ticks for futures, pts for forex — needs PO confirm as spec).

## NEW MECHANISM — M14: Tool-settings apply/persist (P1, Lane 4) — 5 bugs
TAL-01762 (Fib colors/settings revert), TAL-01813 (Fib level edits reverted on OK), TAL-01794 (Gann Box levels revert on save), TAL-01812 + TAL-01763 (Gann Box rejects levels >1 or <0 — validation too strict; TradingView draws them). Same apply-default/settings-write family as plan-2 TAL-01589/01594 — one settings-commit mechanism suspected.

## NEW MECHANISM — M15: Session/preference persistence (P1, Lane 4) — 5 bugs
TAL-01782 + TAL-01793 (backtest playhead resets to session start on exit/re-enter — **recurrence of plan-2 refresh-persistence fix**, provenance-check first), TAL-01792 (TF + favorite tools reset every enter/exit), TAL-01759 (layouts leak from previous session into new session — isolation, I16-adjacent), TAL-01687 (TF not retained on refresh). Fold existing M8 member TAL-01747 (symbol resets on refresh) into this row.

## NEW MECHANISM — M16: Sessions page CRUD staleness (P2, Lane 4) — 2 bugs
TAL-01767 + TAL-01679 (deleted session stays visible until refresh; second delete → "session does not exist"; can still open deleted session). Also TAL-01749 (link-screenshot-to-trade throws an error — trades page, same lane, own small row).

## NEW MECHANISM — M17: Cross-TF data consistency (P1, Lane 1) — 2 bugs
TAL-01802 (price differs between 1m and 5m of the same instant), TAL-01771 (1m and 5m render identical). Resample pipeline correctness — data-integrity class, not cosmetic.

## NEW MECHANISM — M18: Indicator compute staleness (P2, Lane 1) — 1 bug
TAL-01766 (Arabic, translated: FVG indicator not drawn on ES; drawn after page re-enter; NQ fine) — per-symbol indicator compute/invalidation gap.

## RECURRENCE ROW — M19-R: Drawing geometry ownership during TF transition (Lane 4)
TAL-01585: while the TF-change spinner is visible, dragging the chart moves the drawing layer with it. Plan 2 T5/RC-3 was PO-verified before the later `not sloved` follow-up. State is `RECURRENCE-A-PENDING`, not yet `STICKY`: capture the reporter's device URL/build/SW first. If current uniform provenance reproduces the exact spinner-visible drag cell, reopen the T5/RC-3 diagnostic and treat its former root cause as unproven.

## Member additions to existing rows
- **M6 (orders interaction):** TAL-01750 (hover sticks 2nd entry onto order), TAL-01805 (new order's SL/TP stick to previous order's), TAL-01795 (duplicate SL/TP levels), TAL-01751 (BE level shifts on place-order click), TAL-01760 (order+SL shake on chart move — 01696 dup), TAL-01780 (SL/TP labels keep original values after modify), TAL-01781 (order type not reclassified Market↔Stop/Limit on entry move — plan-2 T4 recurrence), TAL-01789 (entry level disappears; SL line broken), TAL-01791 (Arabic: sell-order box resizes but won't drag).
- **M8 (nav/viewport jumps):** TAL-01801 (Arabic: Go-To lands 14:00 instead of 8:00 NY), TAL-01806 (chart jumped to different date on zoom-out — reporter self-diagnosed), TAL-01761 (TF switch with order → viewport regresses half a day), TAL-01769 (TF switch after manual move → inconsistent position), plus reopens TAL-01707/TAL-01690 ("still jumping to far dates"). Also existing members TAL-01675/01677/01673 (session Go-To) — M8 is now the second-highest volume row.
- **M4 (axis/grid):** TAL-01755 + TAL-01745 (custom-TF zoom-out gridlines days apart / per-candle — 01734 duplicates), TAL-01770 (TF change misaligns gridlines), TAL-01741 (custom TF breaks time/date scale).
- **M3 (gestures):** TAL-01768 (price-scale rescale dead on first attempt — first-click kin), TAL-01779 (price-label drag during replay: double-click reset broken).
- **M2 (replay):** TAL-01738 (speed 50 vs 100 indistinguishable — cadence scaling), TAL-01765 (rollback depth too shallow), reopens TAL-01718 (tick-by-tick >30x falls back to candle) + TAL-01717 (2nd layout shakes in tick replay).
- **M1 (sync):** TAL-01790 (Arabic: helper chart sits in empty space far from price when main chart moves).

## Reopen-signal triage
Canonical evidence and state: `docs/plan3/STICKY-REGISTRY.md`.

- `RECURRENCE-A-PENDING`: TAL-01617→M6, TAL-01717/01718→M2, TAL-01723→M4, TAL-01585→M19, TAL-01719/01707/01690→M8.
- `DURABILITY-REVERIFY`, not present-evidence sticky: TAL-01584→M3 candidate; its `not sloved` message predates the later b07 PASS.
- `NEEDS-PO-CLARIFY`: TAL-01707 and TAL-01690 still lack the exact action that caused the far-date jump.
- Confirmed `STICKY`: none until a candidate reproduces on a reporter-device surface whose shell, engine, embed/SW, host, and panel IDs all match the named checkpoint.

## PO-MANUAL / NO WORKER DISPATCH
PO will handle these four manually; they consume no Plan 3 lane time and require no Manager clarification relay.

| Ticket | Parked context |
|---|---|
| TAL-01758 | (Arabic) "the arrow moves the whole screen when I want to return to the last candle" — which arrow (keyboard? go-to-realtime button?), and what was expected? |
| TAL-01804 | "place order percentage (EQ/BL) — check them plz" — check what, exactly? What's wrong with the EQ/BL numbers? |
| TAL-01816 | "scaling — drag up/down error" (from admin@talaria.io) — which scale, which chart, what error? |
| TAL-01797 | User's AI-assisted console-log findings about replay lag were referenced but the log content isn't in the ticket — ask reporter to paste the actual console excerpts. (M1 MacBook Air data point noted for the perf file.) |

## Polish / backlog / closed (out of the priority filter)
- Polish: TAL-01783 (entry line color), TAL-01803 (default 1% not 100%), TAL-01811 (entry price flashes red), TAL-01722 (order-line styling).
- Feature backlog (PO decisions): TAL-01784 (time-only presets), TAL-01785 (same indicator twice), TAL-01814 (SMC indicator request), TAL-01680 (YTD option), TAL-01773 (ticks/pts spec — see M13).
- Closed by reporter: TAL-01757, TAL-01764, TAL-01775, TAL-01704 (self-resolved), TAL-01748 (test ticket).

## NEW MECHANISM — M19: Progressive session degradation (P0 — PO-observed pattern, 2026-07-22; Director-researched, mechanism evidence already gathered) — Lane 3 lead + Lane 1 assist

**Symptom (PO):** after a few hours in one session (replay + orders + panning), ALL chart functions become laggy. Fresh sessions fast. Classic accumulation profile — confirmed by code research (Director exploration report, ranked evidence):

**Understanding sentence:** the user keeps replaying, panning, and trading in one session for hours, sees replay, chart interaction, and orders become progressively slower while a fresh session is fast, and expects per-tick work and persisted state size to remain bounded regardless of session age.

**Execution state (2026-07-23):** `GLOBAL-P0 / A–E FINAL-LOCAL-CHECKPOINT-GREEN / BROWSER BLOCKED-AUTH / REMOTE GATES PENDING`. Final source `ba38525ba` and local b04 runtime are uniform. Overall M19 remains open from the credential-blocked real-browser matrix, remote publication, exact-digest deployment/tripwire and PO verification. Production is unchanged.

| # | Sub-mechanism | Evidence anchor |
|---|---|---|
| a | `updatePositions()` → unconditional `updatePositionsPanel()` per replay tick: full trade-DOM rebuild + analytics + deep-clone persist, O(journal × ticks) | `order-manager.js:30083`, `42338-42958`; called from `replay-system.js:3798/5423/5854` |
| b | Unbounded per-bar excursion arrays (`bar_close_r`/`bar_high_r`/`bar_low_r`, post-exit variants) — no length cap; serialized on every persist | `order-manager.js:3719-3737`, appends at `29316/29379/28628/28654` |
| c | Session autosave stringifies full journal (incl. base64 screenshots + excursion arrays) on main thread every 4–8s | `persistJournal 4838-4861`, `flushSessionStateSave 12308-12344` |
| d | Journal-marker redraw walks FULL journal per replay frame; pan repositions all markers | `36708-36793`, `chart.js:27122` |
| e | Hot-path `console.log` per tick incl. full panel dumps | `29396`, `42352+` and siblings |

**Fix order (Director-recommended):** (1) dirty-flag/throttle the panel rebuild — per-tick path updates PnL text nodes only; (2) cap/summarize excursion arrays (keep MFE/MAE scalars + bounded tail) — **I16: additive schema change, no destruction of existing stored arrays**; (3) strip screenshots + heavy arrays from runtime persist patches; never embed base64 into per-tick `innerHTML`; (4) marker redraw only for newly-visible trades; (5) debug-flag the hot-path logs.
**RED (required before fixes):** a soak scenario — scripted replay of N-thousand ticks with ~50 closed trades + 2 open positions, assert per-tick frame cost stays flat (bounded slope) and persist payload stays bounded. RED today (cost grows), GREEN per fix, switch-OFF discriminator per fix.
**Gates:** D-030 binds (b) and (c) — persist-path changes touch order state; every fix its own switch. Member tickets: TAL-01797 (M1 MacBook replay lag — reporter's console logs pending), TAL-01633/01578 (lag/freeze reports likely late-session), future recurrences fold here.

## PO OVERRIDE (2026-07-22 21:45) — M19 IS THE SINGLE #1 PRIORITY, EFFECTIVE IMMEDIATELY

The PO has explicitly ordered M19 to the top of the entire plan, above M10 and all ticket work. All lanes pivot to M19 NOW: Lane 3 stops current ticket work and takes sub-mechanisms (a)/(b)/(c); Lane 1 takes (d)/(e); the soak RED (already built: `chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs`) is the acceptance instrument. Other rows resume only after M19 fixes are landed and the soak is GREEN. M10 is the immediate next after M19.

## Global priority override (binding)
1. **M19 is the sole #1 priority across all lanes.** Recurrence triage, M10, M17 and every other row are parked until M19's gated fixes are landed and the canonical soak is GREEN.
2. Lane 3 fix order is binding: (a) per-tick panel rebuild → (b) excursion-array bound → (c) persist-payload trim. Each is one independently switchable, measurable fix.
3. Lane 1 runs (d) marker redraw delta scope and (e) hot-path log guard in parallel with Lane 3. It must not concurrently edit Lane 3-owned `order-manager.js`; overlapping hunks queue for controlled integration.
4. Fix (a) ships at the first D-031/D-034-compliant opening and must not wait for later fixes. D-030 binds (b)/(c): switch-OFF proves today's persisted-record bytes. I16 requires additive schema and clean restore of old sessions.
5. Every cycle starts with a board pulse: mechanism in flight, exact soak before/after metrics, and blockers. M10 resumes immediately after M19.

---

# Director ruling 2026-07-23 (late) — M19-I: indicator replay compute budget (NEW, binding next M19 sub-mechanism)

## Decisions on the manager's 23-July progress report
1. **b57 commit + push: AUTHORIZED.** Follow the D-034 provenance chain exactly (commit SHA → strict build → image digests → tripwire).
2. **Test-environment deployment: AUTHORIZED.** Direct-origin AND public-origin build IDs must both read b57 (Cloudflare stale-surface check is mandatory, not optional).
3. **One-panel and four-panel loaded replay validation: AUTHORIZED** — run it on the deployed test build, not locally.
4. **Production deployment stays gated** on PO validation + public/direct parity, per the manager's own recommendation. Endorsed.
5. **M19 is NOT closed by b57.** The PO's surviving complaint — lag with multiple indicators while replay runs — lives in a code path M19 A–H never touched. That path is M19-I below, and it is the immediate next work item, above everything else.

## M19-I — Progressive/steady replay lag with multiple indicators (P0, Lane 1 lead + Lane 2 acceptance)

**Understanding sentence:** the user adds several indicators and presses play; every bar advance triggers indicator recompute work whose cost scales with the FULL loaded dataset and with main-thread synchronous passes, so with 8 indicators on 90 days of 1m data the session stutters even though M19 A–H are green.

**Why M19-H didn't cover it:** M19-H fixed overlapping *timeframe-switch* work (atomicity, stale-worker rejection, SVG reuse). The per-bar-advance recompute pipeline during steady play is a different path (`scheduleReplayIndicatorRecalc` → `recalculateIndicatorsIncremental`), and its verification scenario (20 TF switches) does not measure per-tick cost during continuous play.

**Code-verified sub-mechanisms** (Director inspection, `chart v 1.4/chart/modules/chart-indicators-full.js` + `indicator-performance.js` + `replay-system.js`):

| # | Sub-mechanism | Evidence anchor |
|---|---|---|
| I-a | **Full-array pack + structured clone per bar advance.** `recalculateIndicatorsIncremental` calls `packBarsCompact(chart.data)` — allocates a fresh Float64Array over ALL bars (90d of 1m ≈ 4.5 MB) and posts it with an EMPTY transfer list, so the buffer is cloned to the worker on every pass. Per-bar-advance at replay speed = constant multi-MB alloc + clone + GC churn. This is the prime suspect for the observed CPU/memory pressure. | `chart-indicators-full.js:8806-8823`, `indicator-performance.js:66-80` |
| I-b | **Sync-only indicator types force a FULL main-thread recompute per pass.** If ANY active indicator is in the sync-only list (sessions, killzones, all ICT*, openingrange, talariafvg/ratiogap/weeklymap/smc), `recalculateIndicators()` runs synchronously over the entire data array on every incremental pass — O(all bars) on the main thread per bar advance. One FVG or sessions indicator poisons the whole set. | `chart-indicators-full.js:8758-8775` |
| I-c | **Broad worker-skip list falls back to full sync recalc.** dema/tema/hma/supertrend/adr/volume/custom are excluded from the worker; if the active set is all-skip (or the worker is unavailable), the full synchronous `recalculateIndicators()` runs per pass. | `chart-indicators-full.js:8779-8804`, `:8749-8752` |
| I-d | **`force:true, immediate:true` bypasses the fingerprint dedupe.** Replay step/pause/restore/multichart paths call `scheduleIndicatorRecalc(..., {force:true, immediate:true})`, skipping the snapshot short-circuit — recalc runs even when bars/params did not change (e.g. repeated pause events, multichart re-sync). | `chart-indicators-full.js:8389-8396`; call sites `replay-system.js:3663, 3689, 3237, 8482` |
| I-e | **Multichart panels: full per-panel recalc every 18 ticks.** `pc.recalculateIndicators()` fires per panel on the live-tick loop — N panels × full recompute, main thread. | `replay-system.js:5957, 6076-6081` |
| I-f | **Full-length tail merges + repaint fan-out.** Worker results are merged back over full-length arrays and every pass bumps the indicator render version → indicator-layer repaint of all N indicator series per bar advance. Cost is bounded by visible bars but multiplies with indicator count; measure before optimizing. | `chart-indicators-full.js:8829-8850`, `:8694-8715` |

**Fix order (binding, one gated switchable fix each):**
1. **I-a — retained packed buffer + windowed tail send.** Keep a persistent Float64Array in the chart, append only new bars, and send the worker ONLY the tail window (`fromIndex − lookback` onward) instead of the whole history; transfer or reuse buffers instead of cloning. Kill-switch `__TALARIA_DISABLE_M19I_TAIL_SEND_V1`.
2. **I-b — incremental sync-only recompute.** Sessions/ICT/FVG types get a bounded-tail recompute during play (they are windowed/period structures; full-history rescan is only needed on TF change or data replacement, which M19-H already made atomic). Kill-switch `__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1`.
3. **I-c — shrink the worker-skip list.** Port dema/tema/hma/supertrend/adr to the worker (they are pure series math; no DOM). Volume/custom may stay sync but must go through the same bounded-tail path as I-b. Kill-switch `__TALARIA_DISABLE_M19I_WORKER_PORT_V1`.
4. **I-d — replace `force` with reason-scoped invalidation.** Pause/step/restore paths pass a reason; the scheduler dedupes by bar fingerprint unless the reason genuinely invalidates (TF change, param change, data replace). Kill-switch `__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1`.
5. **I-e/I-f — panel recalc budget + repaint delta** (only if the soak still shows slope after 1–4): panels share the host's computed tails where symbol/TF match; repaint only indicator panes whose data changed. Own switches.

**RED (required before any fix):** extend the canonical soak (`m19-progressive-session-soak.test.mjs`) with an 8-indicator cell — mix must include at least one sync-only type (FVG or sessions), one worker-skip type (supertrend or hma), and worker-eligible types (SMA/EMA/RSI) — replay at 100× on 90d of 1m data, NO timeframe switches. Assert per-bar-advance main-thread cost stays flat and bounded, worker `postMessage` payload bytes per pass are O(tail) not O(history), and heap growth stays within the M19-G bound. RED today, GREEN per fix, switch-OFF discriminator per fix.

**Gates:** D-031/D-034 bind every deploy. Lane 1 owns the fixes (indicator files are Lane 1 territory; no `order-manager.js` edits). Lane 2 owns the soak instrument and before/after numbers, no product edits. The M19-H one-panel/four-panel manual validation continues in parallel on the b57 test deploy — it does not block M19-I work starting now.

**Closure rule:** M19 closes only when BOTH the A–H soaks AND the M19-I 8-indicator soak are GREEN on a deployed, tripwire-verified build, and the PO confirms the loaded-replay feel on the test environment. Lag is a hard red flag — no other plan-3 row unparks before that.

---

# Director ruling 2026-07-24 — M20: latent lag inventory + permanent anti-lag gate (P0, binding)

**PO directive:** find every lag source that has not surfaced yet, kill it, and make sure it never comes back. Lag is a project-killer.

The Director ran a four-track code audit of the entire engine (`chart v 1.4/chart/`): (1) timers/rAF/listener accumulation, (2) unbounded memory growth, (3) render/DOM hot-path costs, (4) cross-window messaging + storage/network. ~30 sources were verified by code reading with file:line anchors. They are grouped below as M20-A..D. **Every anchor below was verified against the live source; workers re-verify before editing (lines shift).**

**Sequencing (binding):** M19-I remains the immediate active item (it is the PO's *felt* lag today). M20 starts in parallel where lanes are free and takes over as the sole engineering focus the moment M19-I's fixes are landed. Within M20, the QUICK-KILL list ships first — highest value per line of code — then families in the order A → B → D → C. Nothing else on the board unparks before M20 closure.

## QUICK-KILL list (small, gated, high-value — ship first, one switch each)

| # | Fix | Anchor | Why first |
|---|---|---|---|
| Q1 | Kill/gate the permanent 600ms full-DOM span poll (`_v9TimeSyncTimer` — `querySelectorAll('span')` + full walk, never cleared). Replace with event/MutationObserver on the settings panel only. | `chart.js:1554`, `:31307-31334` | ~6k full-DOM scans/hour even when idle |
| Q2 | Stop idle ~1Hz full renders from the bar-close countdown inside the forever `animate()` rAF loop; render only the countdown region or suspend when idle/hidden. | `chart.js:1398`, `:28268-28300` | ~3.6k full paints per idle hour on host |
| Q3 | Strip base64 screenshots from `open_positions`/`pending_orders`/`closed_positions` in the local-backup serializer (journal is already slimmed; these are not) and from full multichart order snapshots. **D-030/I16 bind: strip is serialize-time only, never destructive to stored session data.** | `chart.js:11125-11225`, `order-host-store.mjs:123-154` | Multi-MB synchronous `localStorage` writes every 20s playing / 5s idle |
| Q4 | Cap `trail_sl_path` per-bar array + `sl_modifications` log exactly like M19-B capped excursion arrays (bounded tail + scalars). I16 additive schema. | `order-manager.js:29931-29932`, `:30244-30245`, `:4066-4077` | Same uncapped-per-bar class M19-B fixed; sibling was missed |
| Q5 | Gate outbound crosshair + live-drawing `postMessage` on effective sync mode BEFORE sending (today panels serialize+post even with all sync OFF; the manager drops it after the cost is paid). | `sync-bridge.js:1526-1550`, `:1386-1411` | Continuous wasted cross-window traffic × panels |
| Q6 | Remove document `mousemove`/`mouseup` listeners when the floating replay-toolbar clone closes / replay exits (currently leak one permanent document listener per float cycle). | `replay-system.js:1406-1445`, `:1390-1396`, `:3214-3217` | Pointer-move cost grows for the rest of the session |
| Q7 | Store and clear the same-pair `replayEnter` mirror interval on the panel chart (rapid re-enter can stack unbounded 180ms intervals). | `panel-cmd-bridge.js:2769-2779` | Interval stacking under multichart replay churn |
| Q8 | Alert checker: don't run the 500ms interval with zero alerts; clear-before-restart; wire `destroy()`. | `alert-system.js:894-898`, `:318` | Permanent 2Hz wakeups for every session |
| Q9 | *(added 2026-07-24, advisor-brief finding)* Replay per-tick prefix copy: every bar advance allocates `fullRawData.slice(0, currentIndex+1)` — a fresh copy of the ENTIRE session history per tick, in both normal and fast paths. Replace with a bounded view/index-window (render reads `[0, sliceEnd)` without materializing a copy) or reuse a single growing array. Kill-switch `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1`. High regression risk (many consumers assume an owned array) — Fable Lane 1 owns it, consumer audit required before edit. | `replay-system.js:3804, :5526, :6129, :8706` | O(session bars) allocation per tick — top GC-pressure source on mature sessions |

## M20-A — Idle drains: timers, rAF, listeners (Lane 4)
Beyond Q1/Q2/Q6/Q7/Q8: no `Chart.destroy()` exists (animate loop, viewport listeners, `_v9TimeSyncTimer` are permanent); `DrawingToolsManager` installs document pointer/mousedown handlers with no teardown (`drawing-tools-manager.js:804, :6744, :6789-6790`); `timezoneManager.addListener` is push-only and called per chart init / Go-To setup / replay setup (`timezone-manager.js:309-311`; `chart.js:1538, :20666`; `replay-system.js:316`); favorites toolbar holds a permanent document mousemove (`favorites-manager.js:812-830`). **Deliverable:** a real destroy/teardown contract — every subsystem registers its timers/listeners/observers in a per-chart registry that teardown drains; a census probe (below) proves counts stay flat.

## M20-B — Unbounded memory growth (Lane 3 for order files, Lane 1 for engine caches)
Beyond Q3/Q4: in-memory `tradeJournal`/`closedPositions` keep base64 screenshots forever (`order-manager.js:5801, :9978-9982, :10150-10153` — externalize or cap); `tickPathCache` keyed by every candle timestamp, no LRU (`replay-system.js:67-68, :5609-5643`); `_orderExecutionSeriesByFileId` retains whole superseded master arrays by reference per TF with no per-file TF cap (`order-manager.js:1507-1529`); shared bar store allows every TF per file up to 200k bars each (`chart.js:3172-3225`); `_miSeriesByFileId` ~20k-bar entries with no global cap (`order-manager.js:575, :2344-2365`); trade-marker SVG glow `<filter>` defs never removed on prune (`order-manager.js:37970-37982, :41488-41532`); propfirm `allTrades`/`dailyTrades` unbounded (`propfirm-tracker.js:179, :192`); local backup deep-clones the ever-growing `closedPositions` per write (`chart.js:11139-11164`). **D-030 binds every order-file change; I16 additive schema; switch-OFF must reproduce today's bytes.**

## M20-C — Render/DOM hot-path costs (Lane 1)
Ranked: (1) **full SVG `redrawAll()` on every pan/replay/zoom frame** — clears and rebuilds every drawing's DOM per frame; the CSS pan-transform fast path `_applyPanDrawingsLayerTransform` exists but is **never called** (`chart.js:36513-36545, :27854, :28557-28561`; `drawing-tools-manager.js:12691-12773`) — wire the transform during pan, `redrawAll` only on pan-end/scale-change; (2) economic-calendar markers do a **linear scan of ALL bars per event per paint** (`chart.js:33556-33642, :33436-33465`) — binary search + skip on fast-pan; (3) crosshair mousemove: `getBoundingClientRect` + `querySelector` + possible canvas `resize()` + unconditional style writes per pointer frame (`chart.js:28088-28098, :37263-37792, :32585-32645`) — cache refs/rects, dirty-check writes; (4) indicator legend `innerHTML` rebuild per crosshair move (`indicator-ui.js:2867-2928`; `chart-indicators-full.js:11858-11894, :16489-16516`) — mutate text nodes; (5) `checkDrawingProximity` per hover move samples SVG geometry up to ~220 `getPointAtLength` calls (`drawing-tools-manager.js:2626-2638, :16697-16816`) — throttle + spatial index; (6) indicator paint layer cache is skipped entirely during interaction/replay fast render (`chart-indicators-full.js:8662-8668`); (7) `measureText` margin sync every `drawAxes` (`chart.js:28816-28819, :30282-30346`); (8) Heikin-Ashi full-series recompute per replay step when active (`chart.js:31764-31766`; `replay-system.js:3794-3796`).

## M20-D — Cross-window, storage, network (Lane 2)
Beyond Q3/Q5: independent-pair mirror catch-up can attempt a `/bars` fetch per coalesced frame until a 3-strike breaker, and play can clear the cooldown → refetch storms (`panel-cmd-bridge.js:1421-1533`); P&L fan-out applies ~20/s × peers and each apply runs `JSON.stringify` over all open+pending rows for the visual shape (`order-host-store.mjs:411-434`; `panel-cmd-bridge.js:176-272`) — cache/hash the shape; `syncReplayFromHost {force:true}` every ~2.5s per panel can re-mirror/seek even when already aligned (`panel-cmd-bridge.js:3669-3706`); same-pair cover sync can `master.slice()` the entire host array (`chart.js:6665-6722`) — bound or share by ref; drawing `saveDrawings` sync-writes full drawings JSON to localStorage per geometry commit (`drawing-tools-manager.js:13462-13478`).

## Permanent anti-lag gate (the "never appears again" mechanism — binding, Lane 2 owns)
1. **Idle soak (new RED):** chart open, replay OFF, no input, 10 minutes — assert near-zero full renders, zero DOM polls, zero network chatter beyond allowed keepalives, flat heap. Today this is RED (Q1/Q2/Q8 fire constantly).
2. **Loaded soak (extend canonical soak):** add cells for 50 closed trades WITH screenshots + 100 drawings + trailing-stop active + 4-panel multichart play. Assert flat per-tick cost, bounded heap slope, bounded localStorage write bytes/min, bounded postMessage msgs+bytes/min.
3. **Census probe:** instrument counts of live intervals/timeouts/rAF-loops/document+window listeners/observers; soak asserts the census is FLAT across replay enter/exit ×10, TF switch ×20, panel open/close ×10, toolbar float/close ×10. Kills the whole leak class, not just today's instances.
4. **Byte budgets as regression rows:** localStorage write ≤ a named budget per write and per minute; cross-window message payloads ≤ budget; any budget bump requires a Director-ratified cost-cell note (D-039 precedent).
5. **CI ratchet:** the idle soak, loaded soak, and census run in the standing gate; any regression is a RED that blocks bless, same as functional rows (I9).

## Execution model for the lag sprint (M19-I + M20) — PO-ratified 2026-07-24

- **Worker models:** Lane 1 (rendering/indicators) and Lane 3 (orders/memory) are upgraded to Fable 5 for this sprint — they own all edits in `chart.js`, `chart-indicators-full.js`, and `order-manager.js`. Lanes 2 and 4 stay on Grok 4.5. Fable workers MAY self-delegate mechanical subtasks (soak runs, homepage/ mirror copies, test boilerplate, log triage) to Grok 4.5 subagents, but every product edit is authored and verified by the Fable worker itself. Delegation does not dilute accountability: the lane worker signs the report.
- **M0 checkpoint (mandatory, before ANY edit):** after the b57/M19 A–H integration lands on main — commit clean tree, tag `pre-lag-sprint-<date>`, record commit SHA + build ID + chart/homepage image digests here on the board, verify the D-031/D-034 tripwire on that exact build. Rollback path = checkout tag + rebuild + digest verify. No worker starts before M0 is sealed and recorded.
- **M0 SEALED — CKPT-015 (2026-07-24):** lightweight rollback tag `pre-lag-sprint-20260724` resolves remotely to source `a8d5f721d4ba27e2fda1c7ffd18f91d3cc5a8bbc`; build ID `20260723b57`; chart image `ghcr.io/ayoubsiyari/talaria-trading-chart@sha256:f1057e01b021e1ad98f7418bf4464ccfb4868a205072d7d33c01a5fcf9a9d99f`; homepage image `ghcr.io/ayoubsiyari/talaria-homepage@sha256:9cbcd51c080cc6eef56c0058ed9fa6889fe736c2551b888bcbf6610b8ad47056`. Source/proof preflight is GREEN (33 uniformity checks), exact-digest image tripwire is GREEN (29 layout/label checks), and provenance manifest SHA-256 is `11fb4f120d52cbaef5c6841efe88982d3ddf86df731f375e7dc53df871e3c219`. Rollback remains b56 (`ef54bc45e236532925ce094271bdd19a1bf6dec4`) at its recorded immutable digests.
- **M1 CANDIDATE — CKPT-016 (not yet a milestone claim):** source tag `m1-m19i-20260724b58-source` resolves remotely to `9cacd3ec8db3f428fbc433725145aceb173eb27d`; build ID `20260724b58`; chart image `ghcr.io/ayoubsiyari/talaria-trading-chart@sha256:d29174d6c8ee5d32c15ecebd7d30c74fe681448b8ee29b21099a2226609acefc`; homepage image `ghcr.io/ayoubsiyari/talaria-homepage@sha256:63cdc998487642d08e4c83af6ec669150558e2ddac59b06f06588e2091fff678`. Local source/proof preflight is GREEN (33 checks), exact-digest image tripwire is GREEN (29 checks), and manifest SHA-256 is `07389b5b9d69f6d550bc6ab4120a16dfdec9bddd2790867f7192722884920834`. M19-I local acceptance is GREEN, but M1 remains OPEN until exact-digest test-environment deployment, tripwire, and deployed soak/switch evidence pass.
- **M1 CANDIDATE — CKPT-017 (superseded by CKPT-018; not a milestone claim):** source tag `m1-m19i-20260724b59-source` resolves remotely to `254051afe5c2b58f85c53763256a9641229f0656`; build ID `20260724b59`; chart image `ghcr.io/ayoubsiyari/talaria-trading-chart@sha256:270b4475642cac9166e9c5071a85f1328697f7c7d208a29b97d9192a57b6c99b`; homepage image `ghcr.io/ayoubsiyari/talaria-homepage@sha256:86162180e6759621660281f28056b5efb378c99612b06e84c315d86ba0a28c3c`. Source/proof preflight is GREEN (33 checks), exact-digest image tripwire is GREEN (29 checks), and provenance manifest SHA-256 is `cd1ccfa7ac5f79a3eca86eff1dbbfbf33f8bc21688e3133f80fe02e3079b654a`. Local M19-I compute and M19-I-f presentation gates are GREEN; I-f at 100x recorded 0 stale frames, 0 maximum bar delta, 0 ms p95/max catch-up lag, and 0 uncovered/rejected/full-async bridge fallbacks. PO feel on deployed b59 was still RED for SMA/EMA/WMA/DEMA/TEMA at high speed in tick mode → M19-I-g.
- **M1 CANDIDATE — CKPT-018 (supersedes CKPT-017; not yet a milestone claim):** source tag `m1-m19i-20260724b60-source` resolves remotely to `c9c5ee679ac41c79a6f32bb1dc697ca4d4c58707`; build ID `20260724b60`; chart image `ghcr.io/ayoubsiyari/talaria-trading-chart@sha256:40c8ab08ef91a73c83b944a9fab96baa72546abd64d5b00d0a86dc0938c8d945`; homepage image `ghcr.io/ayoubsiyari/talaria-homepage@sha256:0689f9654a4c55df1cca03f0093ce32dd9174e36bde996ed0cf7110ee8051c14`. Source/proof preflight is GREEN (33 checks); provenance manifest SHA-256 is `e70e37d48dc8080970ce810641b08d93321a8e76dd168fb9d1902d283b00ea57`. Adds M19-I-g tick-mode tip refresh (kill-switch `__TALARIA_DISABLE_M19I_TICK_COHERENT_V1`; requires I-f ON). Local I-g tick gate GREEN. M1 remains OPEN until CKPT-018 is deployed by exact digest to the test environment, the deployed tripwire and gates pass, and the PO feel-check passes at 60×/100× for the five MAs.
- **Milestones (manager reports each to the PO, who relays manually):**
  - **M0** — checkpoint sealed (SHA/build/digests on the board, tripwire green).
  - **M1** — M19-I green: 8-indicator soak flat, per-fix switch-OFF discriminators, deployed to test env.
  - **M2** — QUICK-KILL Q1–Q8 landed: idle soak RED→GREEN is the acceptance signal.
  - **M3** — families M20-A + M20-B landed: census flat across cycle tests, loaded-soak heap slope bounded, D-030 switch-OFF proofs for every order-file change.
  - **M4** — families M20-D + M20-C landed, anti-lag gate (idle soak + loaded soak + census + byte budgets) permanent in the standing CI gate, PO feel-check on deployed build. M20 closes here.
- Each milestone report must contain: build ID + SHA, soak before/after numbers, kill-switch inventory delta, and any Director-escalation-worthy deviation. No milestone is claimed on local-only evidence; M1+ require the deployed test surface.

## M20 rules
- One gated, switchable fix per sub-item; state-matrix per fix (idle / paused / playing / multichart on-off / sync on-off); RED-first via the relevant soak or census row.
- Lane ownership as marked; no cross-lane edits of `order-manager.js` outside Lane 3.
- Do NOT ship fixes for M20-C(1) (redrawAll/CSS transform) without re-proving M19-R/TAL-01585 (drawing layer must not visually detach from candles mid-pan) — that ticket is the known regression risk of exactly this optimization.
- Closure: M20 closes when the QUICK-KILL list + families A-D are landed or explicitly Director-waived with a written cost note, and the anti-lag gate (idle soak + loaded soak + census + budgets) is GREEN on a deployed tripwire-verified build, PO-felt-confirmed.
