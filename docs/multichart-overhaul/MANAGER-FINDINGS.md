# Manager Findings — Phase 0 Baseline Read

**Author:** Agent Manager
**For:** Director (decision required)
**Date:** 2026-07-04
**Build under test:** `20260627b580` (Task 0.1 diagnostics live)

---

## 1. Purpose of this report

We instrumented the engine in Phase 0 (Task 0.1) with per-panel counters exposed via
`window.__mcDiagReport()` / `window.__mcDiagReset()`. The intent was to capture an
objective baseline against the S1–S11 matrix before touching any root cause.

Partial baseline captures are in and they surface a signal strong enough that I am
pausing to escalate to the Director **before** committing worker effort to Phase 1.
The numbers suggest the plan's phase order may be pointed at a root cause that is not
the one producing the user's visible pain.

---

## 2. What the diagnostics confirmed (good news)

- `__mcDiagReport()` / `__mcDiagReset()` work on single-chart and 2×2 layouts.
- Counters populate one row per panel (`HOST`, `B`, `C`, `D`) and increment live.
- `seams = 0` in every capture so far — no join/contiguity corruption detected.
- Increments are guarded (`_mcDiag &&`), so instrumentation cannot throw in hot paths.

Instrumentation is fit for purpose. Phase 0 tooling is a pass.

---

## 3. The signal that changes the picture

### 3.1 `fetches = 0` almost everywhere

Across the pan and timeframe-switch captures taken in a **backtest** session, every
panel reports `fetches = 0` / `fetchedBars = 0`.

Representative 2×2 capture (replay session):

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST    | 0       | 0           | 0                 | 1646      | 2597    | 0     | 0           |
| B       | 0       | 0           | 0                 | 556       | 980     | 0     | 0           |
| C       | 0       | 0           | 0                 | 558       | 1029    | 0     | 0           |
| D       | 0       | 0           | 0                 | 556       | 1401    | 0     | 0           |

**Implication:** In the user's real backtest usage, data is fully pre-loaded and
timeframe changes resolve from cache/resample. The network-fetch path — **RC1, the
target of Phase 1** — is essentially **not firing**. If we ship Phase 1 now, the
counters will look clean but the user will feel **no change**, because duplicate
fetches are not their current problem.

> Note: an earlier smoke capture on build `b577` did show a single panel with
> `fetches = 2, fetchedBars = 20000` at boot, so the path *can* fire — but it is not
> the dominant cost during live interaction.

### 3.2 The real, repeatable pain is a render/viewport desync

The console during the 2×2 replay capture is flooded with:

- `No candles drawn! All N candles are outside viewport. Skipped: N` — repeating
  continuously, with **N climbing 45 → 73** as replay advances. The follower panels'
  viewports are drifting **off their own data**; candles fall outside the visible
  range and nothing paints.
- `[Violation] 'requestAnimationFrame' handler took 53–58ms` — main-thread jank.
- `POST /api/chart/drawings/25 403 (FORBIDDEN)` — flooding (pre-existing drawings
  entitlement error; separate issue, but adds console/CPU noise).

The counters corroborate this: `resamples` (HOST 1646) and `renders` (HOST 2597) are
enormous while `fetches = 0`. **The cost and the breakage live in the
resample/render/viewport path, not the network path** — i.e. RC2 (poll-and-mutate)
and RC4 (deferred/again render) plus viewport-follow logic, not RC1.

---

## 4. Caveat we must not hide

Build `b580` includes recent Manager-era viewport/offset edits shipped before the
diagnostics:

- pan-load `offsetX` compensation switched to resampled **display-bar** count,
- timeframe-switch window range derived from captured viewport,
- same-pair mirror idle dedup in `panel-cmd-bridge.js`.

Any of these could interact with the "all candles outside viewport" flood. A
read-only diagnosis must confirm or clear these before we assume the desync is
pre-existing.

---

## 5. The crossroads (Director decides)

### Option A — Follow the plan strictly
Finish S1–S11 baseline, then execute Phase 1 (fetch-ownership gate) exactly as
written.
- **Pro:** Clean, fully gated, honors the original design order.
- **Con:** Baseline says `fetches ≈ 0` in real usage, so **the user likely feels no
  improvement** until Phase 2/3. Effort spent before impact.

### Option B — Retarget to the observed root cause first (Manager recommendation)
Keep the director's *process* (gated tasks, kill-switches, both-copies, numbers over
feelings) but re-point the next task at the measured top failure: the
**"candles outside viewport" render desync + rAF jank during replay.**
- **Step 1:** One worker, **read-only diagnosis task** (no code changes) using the new
  diagnostics to locate exactly where the follower viewport drifts off its data during
  replay, and report the precise function + trigger condition (and clear/confirm the
  §4 caveat).
- **Step 2:** Fix under the same gated discipline.
- **Pro:** Aims effort at the numbers we actually measured and the user's felt pain.
- **Con:** Deviates from the plan's phase ordering; RC1 gets deferred.

---

## 6. Outstanding input needed from Product Owner

To aim the next worker prompt precisely, we need one answer:

**When does the "all candles outside viewport" flood occur** —
(a) during replay playback, (b) while dragging, or (c) immediately on 2×2 boot?
And which exact action produced the capture in §3.1?

That single answer determines whether this is a replay-follow bug, a pan bug, or a
boot bug.

---

## 6b. Pan capture update (2026-07-05) — corrects §3.1

A later capture taken while **panning** (dragging to load old data) in a 2×2 shows a
different story than the replay captures, and I am recording it to keep the record
honest.

Report after sustained pan:

| panel | fetches | fetchedBars | extendsFromParent | resamples | renders | seams |
|-------|---------|-------------|-------------------|-----------|---------|-------|
| HOST  | 30      | 27026       | 0                 | 517       | 810     | 0     |
| B     | 33      | 58000       | 0                 | 492       | 882     | 0     |
| C     | 2       | ~           | 3                 | 513       | 754     | 0     |
| D     | 2       | ~           | 2                 | 503       | 800     | 0     |

Findings:

1. **RC1 is real under pan.** Panel B fetched **58,000 bars independently**
   (`extendsFromParent = 0`), more than the HOST's 27,026, while C and D correctly
   **copied from parent** (`extendsFromParent = 3 / 2`, fetches ~2). Fetch-ownership is
   **inconsistent across panels** — C/D obey the copy path; B does not. This is exactly
   the RC1 duplicate-fetch bug, firing on pan. It was invisible in the replay captures
   because replay does not pan.
2. **The "outside viewport" flood also fires during pan** (`All 99 candles outside
   viewport`), plus rAF violations 52–59ms. So the render/viewport desync is the
   **common thread across both gestures**, not replay-only.
3. New load-path logging observed: `pan loads via: candles` vs `bar loads via: tiles` —
   a branch worth tracing.

**Corrected conclusion:** §3.1's "fetches ≈ 0 in real usage" holds for **replay** but is
**wrong for pan**. This is not an A-vs-B either/or. The render/viewport desync is the
universal symptom; RC1 is a real additional pan-time cost with inconsistent ownership
(B fetches, C/D copy). Option B still stands as the first task, but Worker 1 should also
capture *why B takes the fetch path while C/D take the copy path*, since we have it
reproduced here.

## 6c. B-FIX-1 outcome (2026-07-05) — CLOSED

Fix shipped in build `20260627b583`: in `_finishMultichartMirrorRender`
(`replay-system.js`), when `_syncIndependentPanelViewportIfNeeded` declines recovery
(vetoed by `_multichartVisibleRangeSyncOn`), fall through to the already-computed
replay auto-scroll `st.offsetX`. Kill-switch:
`window.__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK`.

Live verification (2×2, Date-Range sync ON, replay playing):

| panel | fetches | fetchedBars | extendsFromParent | resamples | renders | seams |
|-------|---------|-------------|-------------------|-----------|---------|-------|
| HOST  | 15      | 828         | 0                 | 790       | 1038    | 0     |
| B     | 0       | 0           | 0                 | 782       | 1106    | 0     |
| C     | 0       | 0           | 0                 | 782       | 1103    | 0     |
| D     | 0       | 0           | 0                 | 782       | 1101    | 0     |

Result: the `No candles drawn! ... outside viewport` flood (was climbing 45→99 at
baseline) is **gone**; `seams = 0` on all panels. Followers track the playhead as data
advances. **B-FIX-1 CLOSED (pass).**

Residual observation (not a regression, future work): `renders` ~1000/panel and
`resamples` ~782/panel during replay remain high — RC2/RC4 render-budget territory,
not addressed by this fix.

**PENDING debt (per D-001, next session, Product Owner):** kill-switch causality check —
set `window.__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK = true`, replay 2×2, confirm the
`outside viewport` flood RETURNS, then unset. This proves the kill-switch actually reverts
behavior (production safety net). Record the one-line result here when done.

## 6d. B-DIAG-2 sign-off (2026-07-05) — mechanism verified, trigger pending

`DIAG-B2-pan-fetch-ownership.md` accepted. Code-trace verdict verified: routing to
self-fetch happens when `B.currentFileId !== host.currentFileId`
(`_multichartSamePairDataShareActive` → `_isIndependentMultichartPair` →
`_shouldAnchorPairSwitchToHostPlayhead`; then `checkViewportLoadMore` falls through to
`_fetchCandlesCursor`). **Open decisive fact:** whether B actually boots on a different
fileId than the host is NOT yet captured live. B-FIX-2 branch selection depends on it:
- different fileId at boot → Phase 1 Task 1.3 (boot through owner / inherit host fileId).
- same fileId but share-detection declines → fix the detection condition only.
Gate: capture per-panel `currentFileId` before choosing the fix.

## 6e. S-403 sign-off (2026-07-05) — diagnosis complete

`DIAG-S403-drawings-retry.md` accepted. Verified: 403 gate is a class `static`
(`_drawingsCloudSubscriptionBlocked`, drawing-tools-manager.js:1316) → per-iframe-realm,
not shared across panels; replay-maintenance re-issuer is `scheduleRefreshAfterTimeframe()`
→ `saveDrawings()`. Server 403 is likely correct (I6 — untouched). Ready for a gated,
kill-switchable client fix (`__TALARIA_MC_DISABLE_DRAWINGS_403_RETRY_GUARD`).

**S-403-2 fix signed off (code) 2026-07-05:** both `drawing-tools-manager.js` copies
(SHA-256 `FC7ED1470F39F98579A84DBC8DD479D0ADEEBDB4C74AAF094792EE7A57B7D722`), node --check
clean. Session-wide 403 gate via `sessionStorage` marker shared across same-origin iframe
panels; keepalive honors it; server check untouched (I6). Live flood-count UNVERIFIED —
pending build. **Build batched with B-DIAG-2b to save a deploy cycle.**

## 6f. B-DIAG-2b live capture (build b586) — RC1 did NOT reproduce

Fresh build `b586`, `fileId`/`tf` columns present (canary passed). Same-symbol 2×2:

| panel | fileId | tf  | fetches (post-pan) | seams |
|-------|--------|-----|--------------------|-------|
| HOST  | 25     | 1d  | 14                 | 0     |
| B     | 25     | 1d  | 0                  | 0     |
| C     | 25     | 1d  | 0                  | 0     |
| D     | 25     | 1d  | 0                  | 0     |

Findings:
- **All panels share fileId 25** → the Director's prime suspect (B boots on a different
  fileId) does NOT hold in this run.
- **B fetches 0** post-pan → B copied from host correctly; **RC1 did not reproduce.**
- "Outside viewport" now only `All 1 ... Skipped: 1` a few times (was 45→99) → B-FIX-1
  holding.
- No `drawings 403` flood visible → S-403-2 appears effective (pending explicit confirm).
- Anomaly to watch: top logs show `file 22 / 27 / 29 bar loads via: tiles` while diag
  reports all panels on 25 — other files touched at boot (consistent with a transient
  boot-fileId window).

**Consequence for B-FIX-2 — HOLD.** The §6b "B fetched 58,000" was either (1) B on a
*different symbol* than host (self-fetch is CORRECT — no bug), or (2) a transient
boot-time fileId mismatch not hit here. Do not build B-FIX-2 until the PO reproduces the
exact §6b layout and reports, per panel, symbol + `fileId`. If B is a different symbol,
there is no RC1 bug to fix. If B is same-symbol but different fileId, B-FIX-2 = inherit
host fileId at boot (Phase 1 Task 1.3).

## 6g. REPRO-B verdict + B-FIX-2 closing (2026-07-05)

`DIAG-REPRO-B-boot-file-loads.md` accepted and verified. The boot `file 22/27/29 bar
loads via: tiles` come from `_scheduleSmartPrefetchOthers()` (chart.js:5175, scheduled
at :1954 after the active backtest file loads) → `getSymbolSwitcherEntries()` →
`_fetchSmartWindowViaBars` → `_fetchBarsWindow`. This is the **backtest symbol-switcher
prefetch** (cache-warming for instant pair-switches), NOT a panel booting on a wrong
fileId.

**B-FIX-2 disposition — CLOSED as NOT-A-BUG** (maps to D-004 pre-authorized outcome #2),
on objective evidence:
- §6f: same-symbol 2×2, B `fileId = 25`, B `fetches = 0` → same-symbol ownership works.
- REPRO-B: boot non-host loads are legitimate prefetch, not transient wrong-file boot.

REPRO-A CONFIRMED (2026-07-05): B set to a different instrument reported `fileId = 22`
(host/C/D = 25); logs show `file 22 pan loads via: candles` → B self-fetches its OWN
file. Different-symbol self-fetch is correct owner behavior, confirming §6b was a
different-symbol case. (Capture note: the report table showed `fetches = 0` only because
of a `reset → pan → reset → report` ordering artifact; the pan logs are the evidence.
Correct order is `reset → act → report`.)

Two REPRO-A side observations (flagged, not yet acted on):
- `No candles drawn! All 99 ... Skipped: 99` reappeared during B's PAN on the
  independent-symbol panel. B-FIX-1 fixed the replay-follow desync; this is the pan-time
  desync on an independent panel (different path). Seen once — needs a clean repro to
  confirm whether it is a real residual or a transient mid-load frame.
- `Drawings synced to cloud (0 drawings)` succeeded with no 403 flood → consistent with
  S-403-2 effective.

**Next queue (D-002 "queued behind"):** render budget RC2/RC4 — Phase 2 Task 2.1
(throttled mid-drag flush), Task 2.2 (notification-driven extends), Phase 3 Task 3.1
(follower half-rate paints). Residual target: `renders ≈ 1000/panel`,
`resamples ≈ 782/panel` per replay minute.

## 6h. NEW issue — independent-symbol panel pan desync (build b586, 2026-07-05)

Clean capture (`reset → pan B → report`), B = different symbol on `fileId 27`, host/C/D on
25:

| panel | fileId | tf      | fetches | fetchedBars | resamples | renders    |
|-------|--------|---------|---------|-------------|-----------|------------|
| HOST  | 25     | 4h      | 0       | 0           | 0         | 35 → 58    |
| B     | 27     | 1d → 1m | 12 → 16 | 4000 → 6000 | 17 → 21   | 793 → 1626 |
| C     | 25     | 4h      | 0       | 0           | 0         | 2          |
| D     | 25     | 4h      | 0       | 0           | 0         | 2          |

Three real problems on the actively-panned independent panel B:
1. **`No candles drawn ... Skipped: 79` ×3 during pan** — viewport off data; candles don't
   paint. Same CLASS as B-FIX-1 but on the independent-panel PAN path (untouched by
   B-FIX-1).
2. **Render thrash** — B rendered 793 then 1626× vs C/D = 2, host 35–58, with only ~20
   resamples. ~1000 wasted repaints per gesture.
3. **TF instability** — B `tf` flipped `1d → 1m` between reports (possible "wrong-TF data"
   class); needs PO confirmation whether user changed it or it drifted.

B's self-fetch (file 27) is CORRECT (different instrument). The defect is paint/render/TF
stability during the independent panel's pan — user-visible.

**PO real-world clarification (2026-07-05):** panning B (independent panel) to load old
data is **fast and visually perfect**, including on daily TF. So the `Skipped: 79`
warnings are **cosmetic/transient, NOT a user-visible break** — downgrade #1 from
correctness bug to cosmetic. The `tf 1d→1m` (#3) was the PO manually trying daily TF, not
drift — NOT a bug. #2 (render thrash ~1626 repaints/gesture) remains as perf-only debt.

**Reframed target (PO felt pain):** changing the HOST to another pair AND changing its
timeframe shows a visible LOADING delay. This is the original "fast like TradingView"
goal — host pair-switch + TF-switch load latency. This, not the independent-panel pan,
is the next priority.

**Escalation to Director:** propose retargeting the queue to diagnose host
**pair-switch + TF-switch load latency** (measure fetch vs resample vs render split via
diagnostics) before generic Phase 2 render-budget work. Independent-panel-pan cosmetic
non-paint is logged as low-priority follow-up. Awaiting Director call.

## 6i. Host pair+TF switch load latency — measured (build b586, 2026-07-05)

HOST switched pair to `fileId 27` @ `4h`; B/C/D idle on 25/1m.

| metric (HOST) | report 1 | report 2 |
|---------------|----------|----------|
| fetches       | 49       | 57       |
| fetchedBars   | 90000    | 106000   |
| resamples     | 97       | 113      |
| renders       | 1187     | 1301     |
| lastFetchMs   | 1217     | 904      |

Root cause (measured, not guessed): pair+TF switch **eagerly pages ~90–106k bars in ~50
sequential ~2000-bar fetches** (~1s each) and **re-renders ~1200×** (once per chunk). A
4h viewport needs only a few hundred bars. This eager full-history load + render-per-chunk
IS the loading delay. Idle panels B/C/D also repaint 171–196× from host fan-out (0 fetch).

Fix direction (for the eventual gated task): **viewport-first fetch** on pair/TF switch
(small window → instant first paint), defer history to on-demand pan-load; **coalesce
renders** during multi-chunk loads; consider damping idle-panel fan-out repaints. Primary
cost = network round trips (fetches), secondary = render thrash.

This is the concrete evidence behind the §6h retarget proposal. Recommend Director approve
a read-only diagnosis (B-DIAG-4) of the pair/TF-switch fetch strategy next.

## 6j. CRITICAL scoping — §6i latency is MULTICHART-ONLY (PO, 2026-07-05)

PO reports: the host pair+TF switch is **fast/perfect when the main chart is ALONE**, and
only exhibits the §6i eager-load behavior (~90–106k bars / ~50 fetches / ~1200 renders)
**when the same host is inside a multichart/multi-panel layout.**

**This contradicts D-006's stated constraint** that the switch paths are "NOT panel-gated
(single chart shares them)." Evidence says the opposite: single-chart switch is already
optimal; a **multichart-specific condition forces the host into eager full-history load.**

Implications:
- The fix is likely **multichart-gated** after all → I7 is easier (single-chart path is
  already good and must stay byte-identical).
- B-DIAG-4 must be re-centered on the **single-chart-fast vs multichart-slow DELTA**: what
  multichart condition (session-master/replay-armed mode? mirror priming? sibling
  data-share? forced 1m session master for panel feeding?) switches the host from
  viewport-first (single) to full-session paging (multi).
- The BLOCKING baseline S1/S6/S11 (single chart) now doubles as the **"good/fast"
  reference numbers** to compare the multichart-slow switch against.

**Escalation to Director:** D-006's non-panel-gated premise is contradicted by PO
evidence. Recommend B-DIAG-4 deliverable #1/#2 be re-scoped to a single-vs-multichart diff
(find the branch that diverges), and note the fix will most likely be multichart-gated.
Awaiting acknowledgement; proceeding to dispatch the re-scoped B-DIAG-4 unless countermanded.

## 6k. B-DIAG-4 sign-off (2026-07-05) — root cause pinned

`DIAG-B4-switch-latency.md` accepted; both load-bearing claims verified in code:
- `loadMultichartPanelFromHost()` hard-sets `masterTf = '1m'` (chart.js:3563) → a 4h host
  inside multichart is forced onto a 1m session master (single-chart path uses display TF).
- `_fillViewportHistoryAfterTfSwitch()` (chart.js:28278, scheduled :28269) self-retries
  (`attempt+1` :28367) calling `checkViewportLoadMore('backward', true)` repeatedly →
  the ~50 sequential 1m backward chunks measured in §6i.

Root cause: multichart forces host onto 1m master, then FOREGROUND-hydrates full left
history via a retrying backward-chunk loop. Eventual 1m master is contractual (replay/panel
feed); the SYNCHRONOUS full hydration before first paint is the waste.

Latency feasibility (verified in report, server route UNVERIFIED live): client caps `/bars`
+ `/smart`-via-bars at 2000; server `/smart` accepts limit up to 100000 → a 90–100k window
could come in 1–3 requests instead of ~50 if the client uses high-limit `/smart` directly.

Fix = D-007 direction #1 **viewport-first, master-later (multichart-gated)**, kill-switch
`__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH`; then hydration render-coalescing; then
round-trip reduction; then idle-panel damping. **GATE: baseline S1/S6/S11 must be captured
on b586 before the first fix task ships (D-006/D-007).**

Hygiene note: worker reported `M "Sources Handoff/TalariaV16.jsx"` in the tree — flagged as
pre-existing/unrelated; PO to confirm it is not an accidental edit.

## 6l. Baseline gate CLEARED — B-FIX-3 released (2026-07-05)

D-008 blocking precondition satisfied: S1, S6, S11 captured on b586 and recorded in
`BASELINE-RESULTS.md`. Reference numbers:
- S1 single drag: 3 fetches / 6000 bars.
- Single-chart TF-switch ref: 4 fetches / 4000 bars (first-paint target).
- S6 multichart 2×2 TF switch: 87–91 fetches / 170–178k bars, renders → 1152 (the "before";
  panels B/C/D copy correctly: fetches 0, extendsFromParent 85–89, seams 0).
- S11 return-to-single drag: 10 fetches / 8000 bars (regression PASS — single sheds the
  1m-master eager load).

B-FIX-3 (viewport-first, master-later, multichart-gated,
`__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH`) released to a worker per D-008 spec.

## 6m. B-FIX-3 code sign-off (2026-07-05) — live acceptance pending

Implementation verified vs spec. Multichart-host-gated viewport-first load + cancellable,
generation-tagged background 1m hydration. Key checks:
- I7: `_multichartViewportFirstSwitchEnabled` (chart.js:4035) requires `_isMultichartHostPanel()`
  + backtest + kill-switch off; single chart never enters the branch.
- Kill-switch `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH` bypasses branch AND cancels
  in-flight hydration (checked at 4038 + 4069).
- Cancellation: `_mcViewportFirstHydrationSeq` + `_multichartViewportFirstHydrationStillCurrent`
  re-checked at every await boundary; cancel on pair switch (3591).
- Both copies byte-identical `54CAA53B3BF48DDBA59C23ECC3CF82F546CFFAE876EC6BCC69EB79AEC3F241BD`;
  node --check clean; pre-start git status shows chart.js clean before task (report valid).

Status: CODE SIGNED OFF. D-009 live acceptance checklist (first-paint ≤2 fetches, hydration
completes/seams 0, un-hydrated scrub, mid-hydration cancellation, kill-switch flip,
single-chart S1/S6-ref/S11 unchanged) requires build + PO run. Build authorized.
Open: PO confirm `Sources Handoff/TalariaV16.jsx` provenance.

## 6n. B-FIX-3 live result — PARTIAL win, TF-switch path still eager (2026-07-05)

Build b592, PO live feedback:
- ✅ **Pair switch now fast** — switching a panel to another pair (+ any TF) "loads so fast
  and good." Viewport-first path confirmed working.
- ❌ **Same-pair TF switch still slow** — "open on 1m → set multichart → switch to 1D loads
  one by one." Still eager.
- Counters safe throughout: seams 0 all panels; B/C/D fetches 0 / extendsFromParent rising
  (ownership + contiguity intact during background hydration).

Root of the gap (code-verified): `_multichartViewportFirstSwitchEnabled` returns false when
`!switchingPair` (chart.js:4037), so a pure same-pair TF switch never engages viewport-first.
Per B-DIAG-4, a TF switch routes `setTimeframe() → _refetchBacktestTimeframeCore() →
_hotSwapBacktestReplayTimeframe() → _finishTfSwitchViewportRestore() →
_fillViewportHistoryAfterTfSwitch()` — a SEPARATE path from `loadMultichartPanelFromHost`,
and B-FIX-3 only rewired the pair path. The S6 baseline (the canonical before-number) is a
TF switch, so it is NOT yet improved.

**Escalation to Director:** B-FIX-3 accepted as a partial win (pair-switch). Propose
**B-FIX-3b** — extend viewport-first, master-later to the same-pair TF-switch path
(`_fillViewportHistoryAfterTfSwitch` / `_refetchBacktestTimeframeCore`), same gating +
kill-switch pattern, measured against S6. Awaiting Director call.

## 6o. B-FIX-3b code sign-off (2026-07-05) — live acceptance pending

Implementation verified vs D-011. Same-pair multichart-host TF switch now diverts from the
foreground `_fillViewportHistoryAfterTfSwitch` paging into the B-FIX-3 hydration controller.
- I7 (highest-risk): `_multichartViewportFirstTfSwitchEnabled` (chart.js:4250) gated on
  `isBacktestMode` + `_isMultichartHostPanel()` + not-embed + active 1m master; divert at
  :28629 returns early ONLY when engaged → single chart runs old path unchanged.
- Dual kill-switches, mode-aware in `_multichartViewportFirstHydrationStillCurrent`
  (:4073-4078): `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH` (tf) vs
  `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH` (pair) — independent rollback.
- Reuses `_mcViewportFirstHydrationSeq` + stillCurrent; new TF/pair switch cancels prior.
- Zero-fetch fast path: `_mcViewportFirstMasterReady=true` immediately → paint now, hydrate
  remainder in background.
- Both copies byte-identical `9682C04F94B144833D10A72C25C36023D49EA19D88FBF6AA2FFE7C1063E84E08`;
  node --check clean.

Status: CODE SIGNED OFF. **Built by manager: active build id `20260627b598`** (npm run
build:live, exit 0; both chart.js copies post-build SHA-256 `9682C04F…` == signed-off).
D-011/D-012 live acceptance (S6 TF switch ≤2 fetches / 0 if covered; seams 0; single-chart
S6-ref UNCHANGED = highest-risk; boot-race switch has no dead zone; both kill-switches;
mid-hydration cancel; un-hydrated scrub) requires PO run.

## 6p. REGRESSION — viewport-first broke same-pair panel copy (2026-07-05, build b601)

PO: "single chart still good, but multichart — when I change TF on host A, the other
panels re-render each time." Diagnostic (2×2, host TF switch):

| panel | fetches | fetchedBars | extendsFromParent | (S6 baseline was) |
|-------|---------|-------------|-------------------|-------------------|
| HOST  | 65→76   | 88k→112k    | 0                 | 91 / 178k / 0     |
| B     | 60→63   | 120k→126k   | 1                 | 0 / 0 / 88        |
| C     | 47      | 94k         | 1                 | 0 / 0 / 89        |
| D     | 58→77   | 114k→150k   | 2                 | 0 / 0 / 89        |

Regression: same-pair panels B/C/D were COPYING from host (fetches 0, extendsFromParent
85–89). After viewport-first (B-FIX-3/3b), they SELF-FETCH ~100k+ bars each
(extendsFromParent 1–3) and re-render on every host TF switch. Aggregate fetches went
UP (host + N panels each paging) — violates I1 (single data owner).

Mechanism: viewport-first defers the host's full 1m master to background; same-pair panels
need a COMPLETE host master to clone. Finding it incomplete, they fall back to self-fetch
instead of waiting/mirroring the host's viewport-first window. seams still 0 (no
corruption) — but ownership contract broken. Single chart unaffected.

Mitigation: kill-switch (D-010 rollback policy). Escalated as ESC-006 → ruled D-013 (Option A).

### D-013 Step-1 isolation matrix (build b601)
| flag state | HOST fetches | B/C/D fetches | B/C/D extendsFromParent | panels-copy restored? |
|------------|--------------|---------------|-------------------------|-----------------------|
| TF flag ON only (`__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH=true`) | 76–77 | 47 / 63 / 102 | 1–6 | **NO** — still self-fetch |
| both flags ON | 43 / 52000 | 0 / 0 / 0 | 0 | **YES** — panels fetches 0 |

Reading: TF-flag-alone did NOT restore panels-copy; **both-off DID** (B/C/D fetches 0).
→ regression source CONFIRMED as the viewport-first family; the essential culprit is
B-FIX-3 (pair-load) deferring the host master at 2×2 setup so panels can't clone.
seams 0 in all states (no corruption). **Rollback = both flags off.** ESC-006 step 1 done.

CAVEAT (durability): kill-switches are runtime `window` flags that reset on reload — this
mitigates for the tester but is NOT a durable production rollback. Until B-FIX-3c ships,
either (a) ship a build defaulting viewport-first OFF, or (b) fast-track 3c. Raised to
Director. Proceeding to B-DIAG-5.

## 6q. B-DIAG-5 sign-off (2026-07-05) — self-fetch fallback pinned

`DIAG-B5-panel-selffetch-fallback.md` accepted; cited lines verified:
- chart.js:4963 `_tryExtendReplayMasterFromParent`: `if (!earlier.length && !later.length)
  return false;` — host master doesn't extend beyond panel local master → "nothing to copy".
- chart.js:21117 `checkViewportLoadMore`: falls through to panel's own fetch
  (`_fetchCandlesCursor` ~21246) after the extend miss.
- Boot has an 8s host-master poll; TF/pan fallback BYPASSES it → panel self-fetches.

B-FIX-3c target (specced): before the 21117 fall-through, same-pair embed panels must
consult host hydration state (`_mcViewportFirstHydrationSeq` / `_mcViewportFirstMasterReady`)
and WAIT/POLL while host hydration is in progress, then extend from host — never self-fetch.
Self-fetch stays legal only for independent-symbol panels (I1).

Sequence (D-015): default-OFF build (W1, dispatched) → PO S6 re-capture (fresh 3c before) →
B-DIAG-5 (DONE) → B-FIX-3c spec.

**Option B.** Instrumentation did its job: it told us the plan may be aimed at the
wrong root cause for *these* symptoms. RC1 remains worth fixing later, but the
baseline evidence points to a render/viewport desync as the dominant, user-visible
failure. I recommend a read-only diagnosis task next, then a gated fix — pending the
Director's decision and the Product Owner's answer in §6.

## 6r. B-FIX-ROLLBACK sign-off + clean S6 re-capture (2026-07-05, build b604)

B-FIX-ROLLBACK code verified: opt-in guard present in BOTH
`_multichartViewportFirstSwitchEnabled` (chart.js:4038) and
`_multichartViewportFirstTfSwitchEnabled` (chart.js:4253); both copies SHA-256
`AC412F8B…`; node --check + lints clean. Local build id b601; PO deployed/tested b604
(server pipeline bumped further — verified guard present in shipped source, and PO
console `window.__TALARIA_MC_ENABLE_VIEWPORT_FIRST` = `undefined`, so viewport-first
confirmed OFF on the tested build). **CODE SIGNED OFF.**

Clean S6 re-capture (BASELINE-RESULTS §S6-b), all four panels same pair (fileId 25), all
1m, host TF 1m→1h→1m:
- **Rollback HELD (durable):** B/C/D `fetches = 0` (pure mirror). This is the default-OFF
  build, not a runtime flag, so it is a real production rollback (closes the §6p CAVEAT).
- **D-015 anomaly SETTLED:** `extendsFromParent = 0` is not a bug. It scales with host
  master size. Fast 1m→1h→1m loads only an 8000-bar host master → nothing to extend, panels
  resample the mirror (12→18). S6-a's 89 came from a 178k master (1d). Both = correct copy.
- Host TF switch (1m→1h): 0 extra fetches, +36 renders. seams 0.

Mixed-TF observation (BASELINE-RESULTS §S6-c): same-symbol panels on a DIFFERENT TF than the
host (panels 4h, host 1m, shared fileId 25) still self-fetch (10/10/19). This is a genuine
gap that survives the rollback and is DIFFERENT from the viewport-first hydration race that
DIAG-B5 originally framed: here the host 1m viewport master (24k bars) simply does not span
the 4h panel viewport, so there is legitimately nothing to extend. → raises ESC-007: B-FIX-3c
scope + whether viewport-first is re-enabled at all.

## 6t. B-DIAG-6 sign-off (2026-07-05) — 1m-master tax mapped

`DIAG-B6-1m-master-tax.md` accepted. Two load-bearing anchors spot-verified by Manager:
- `loadMultichartPanelFromHost` hardcodes `const masterTf = '1m'` at **chart.js:3573** (comment
  confirms intent: "playhead always advances on 1m master bars"). This is the broadest pin.
- `_buildSmartWindowParams` clamps `/smart` limit to `Math.min(2000, …)` at **chart.js:5390/5392**;
  server route accepts `min(limit,100000)` (api_server.py:21572-21593). Confirms the ~50-chunk
  behavior for a ~100k 1m hydration is client-driven.

Key findings for the fix:
- A display-TF host fetch path ALREADY EXISTS (the `loadedViewportFirstHost` branch,
  chart.js:3667-3718 / 3795-3799) — gated behind `__TALARIA_MC_ENABLE_VIEWPORT_FIRST`. B-FIX-6
  can reuse this plumbing WITHOUT the background-1m-hydration pump that caused the ESC-006
  regression.
- Replay contract: replay does NOT universally need 1m; it needs a master **at or finer than
  the replay step**. `_getWalkForwardOhlcToPlayhead` (6852-6907) returns null if no finer
  series exists → that's the only hard breaker. So "lazy 1m when replay step is finer than the
  host master" is contract-safe.
- Riskiest single site: `_getReplayPanFetchTimeframe` (6292-6302) — collapses all multichart
  replay loading to 1m; must not force 1m during display-TF browsing.

### B-FIX-6 staging (Manager decision, within D-016; no Director hop needed)
Split into 3 gated stages, each kill-switched and independently measurable:
- **B-FIX-6a (browsing tax — dispatched):** host fetches DISPLAY TF for first-paint + TF switch
  when NOT in active replay. Fixes the user's #1 pain (S6-a 1d "candle by candle": host ~91
  fetches → target single-digit). MUST NOT run any background 1m hydration during browsing
  (that was the ESC-006 cause). Replay paths untouched. Same-TF panels stay fetches=0.
  Kill-switch `__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER`.
- **B-FIX-6b (lazy 1m on replay):** when replay activates and its step is finer than the host
  display-TF master, hydrate 1m lazily via `ensureReplayDataCoversTimestamp`. Own kill-switch.
- **B-FIX-6c (high-limit /smart):** raise the client clamp so lazy 1m arrives in 1-3 requests,
  not ~50. Own kill-switch. Folds in old Follow-up #2.

## 6u. B-FIX-6a live result (2026-07-05, build 20260705b4) — win + boot-window defect

S6-a re-run (2×2 same-pair, all 1m, host 1m→1d→1h→1m), viewport-first OFF, 6a ON:

| panel | fetches | fetchedBars | resamples | renders | seams |
|-------|---------|-------------|-----------|---------|-------|
| HOST  | 23–25   | 40–43k      | 49–453    | 967–1596| 0     |
| B/C/D | 2       | **0**       | 86–492    | 143–755 | 0     |

- **Tax reduced ~70%:** host fetches 91→23–25, bars 178k→40–43k vs S6-a baseline. Switch no
  longer "candle by candle." Panels `fetchedBars = 0` (the `fetches=2` are empty probes, not
  data ownership — I1 intact). seams 0.
- Renders still high (host ~1600) = RC2, deferred.

**DEFECT (new, 6a-introduced): host/panel window-extent mismatch at boot/browse.** PO (mostly
-replay) reports: same TF, host shows fewer candles / a different range than panels until
replay runs, then they align. Mechanism: pre-6a, a 1d switch accumulated a wide 1m master, so
returning to 1m left the host wide (matching panels). With 6a the host loads a narrow display-TF
window and, on return to 1m, refetches only a narrow 1m window while panels retain their wider
seed → same-TF extent mismatch. Replay re-anchors to the shared 1m master → self-heals. No
corruption. → B-DIAG-7 (read-only) to name the exact seed/window site, then a targeted fix so
same-TF panels and the display-TF host share one window. 6a stays ON (default) meanwhile; win
is real and mismatch is non-corrupting.

## 6v. B-DIAG-7 sign-off + B-FIX-6a-2 spec (2026-07-05)

`DIAG-B7-host-panel-window-mismatch.md` accepted. Root confirmed (Manager spot-check): the
iframe `setTimeframe` idempotency guard returns early when the panel already holds the TF with
matching cadence (`panel-cmd-bridge.js:1577-1582`), so a host-fanout `setTimeframe(1m)` after
the host commits its new narrow 1m window does NOT re-run `_multichartMirrorHostTfSwitchIfReady`
— panel keeps its wider seed → same-TF extent mismatch during browsing. Replay heals via the
frame mirror path (`panel-cmd-bridge.js:537-596` / `forceSamePairParentDataMirror`).

Chosen fix = DIAG-7 Option B (panels follow host's lean window; zero added fetches; preserves
6a win + S6-b `fetches=0`). **B-FIX-6a-2 (dispatched):** in the setTimeframe idempotency block,
when `__fromHostFanout` + same-pair + parent committed a materially different extent (first/last
ts or length differ), re-mirror via `_multichartMirrorHostTfSwitchIfReady(tf)` instead of the
early return. Gate on extent-actually-differs to avoid re-render thrashing (the prior
"panels re-render each host switch" regression). Kill-switch
`__TALARIA_MC_DISABLE_SAMETF_REMIRROR`. Not-Option-A (host reloads wide window) — that re-spends
the tax 6a removed.

## 6w. B-FIX-6a-2 live confirm + B-DIAG-8 sign-off + sequencing (2026-07-05, build 20260705b8)

- **6a-2 CONFIRMED live:** PO reports "same same candles" — host/panel boot-alignment gap
  closed. 6a + 6a-2 complete for same-TF.
- **New pain (browse, intentional mixed-TF host 4h + panel 1m):** host loads ~116k 1m bars
  "group by group." `DIAG-B8-host-fine-master-for-finer-panel.md` signed off. Root (verified):
  in a backtest session `replaySystem.isActive` is TRUE even when NOT playing (armed at boot),
  so the finer panel's `_fillViewportHistoryAfterTfSwitch` delegates history-fill to
  `host.checkViewportLoadMore('backward', true)` (chart.js:28661-28680), and the host's
  replay-master pan-load forces `tf='1m'` via `_getReplayPanFetchTimeframe` (6299-6309) →
  ~58 chunks (2000-clamp at 5377-5405). This is the deferred **pain #2** surfacing as
  host-pays-tax, NOT a 6a bypass (6a's `masterTf=displayTf` still holds at 3572-3577).
- **Chosen fix:** Option A — same-pair panel whose TF is FINER than the host's native/display
  master self-fetches instead of delegating to the host; host stays lean. Must preserve same-TF
  `fetches=0` mirror (only split `panelTf` finer-than-host).

### Sequencing decision (Manager, within D-016; no Director hop)
Per DIAG-B8 §"Interaction with 6b" + Director's original deferral rationale: **B-FIX-6b first,
then B8.** Both decide "when may the host hold a fine master." 6b defines that boundary (host
holds fine master only when replay stepping/forming-candle needs finer-than-display); B8 then
lets a finer *browse* panel self-fetch outside that boundary. Doing B8 first risks the rework
the Director warned of. User has a clean workaround meanwhile: keep panels on the host's TF
(fast + aligned, proven). User is mostly-replay, so 6b is also their highest-value win.

## 6x. 6b cleared of drift; B8 scope expands to cover mixed-TF DRIFT (2026-07-05, build b9)

PO on b9, 4-layout, backtest (armed), **all sync OFF**, host 1m→4h, panels on a DIFFERENT TF:
"loads a little faster but still group-by-group, AND B/C/D move/drift even with all sync off."
Isolation: setting `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER = true` made **no difference** →
**6b is NOT the cause** (6b remains signed off; replay smoke test still outstanding, deferred).

Both symptoms are the mixed-TF same-pair coupling (pain #2):
1. **Drift w/ sync off:** same-pair backtest panels share the host replay master independent of
   the sync toggles (`_multichartSamePairDataShareActive` true under replay regardless of
   viewport/interval sync — DIAG-B8 §Panel-Feed). Host TF switch mutates that shared master →
   panels shift. User expects sync-off ⇒ independent; engine couples them.
2. **Group-by-group:** finer panels pull 1m history through the host / self-fetch in chunks.

→ **B8 scope now covers BOTH**: make same-pair panels whose TF is FINER than the host own their
own data (independent master), so they (a) don't drift when the host switches TF, (b) don't drag
the host to 1m. MUST preserve: same-TF `fetches=0` mirror; replay PLAYHEAD sharing (panels still
show the same moment in time — only their data ownership/viewport decouples); no ESC-006-style
aggregate-fetch blowup. Kill-switch. Risk = same-pair ownership (ESC-006 territory) → design-first
in report, Manager review before deploy.

## 6y. D-018 pre-dispatch gate cleared — tree attribution + B8 contract adopted (2026-07-05)

Director (D-018) approved DIAG-B8b as the B8 implementation contract, gated on resolving the
"tree contamination" the design worker disclosed (both `chart.js` copies appeared modified during
a read-only design task) BEFORE dispatching the impl worker. Manager verification:

- **Working tree clean vs HEAD.** `git status --porcelain` / `git diff --numstat` / `--cached`
  are all empty for both `chart v 1.4/chart/chart.js` and `homepage/public/chart/chart.js`. The
  edits the worker saw uncommitted have since been committed by the PO (`a38d299d "layout
  dignoosti"`, Sun Jul 5 17:20:10 2026, author siyari ayoub). Both files tracked, not ignored.
- **Both copies byte-identical:** SHA-256 `bfbe1f623028452cc7d2946927d077b5769c9aa5722b7a94690704f4e4c85116`
  for both (I4 satisfied).
- **Attribution:** all signed-off task signatures present in the committed file — `_ensureMcDiag`
  (diagnostics), `__TALARIA_MC_ENABLE_VIEWPORT_FIRST` (B-FIX-ROLLBACK), `displayTfMasterHost`
  (6a), `_lazyReplayMasterDisabled` + `_getReplayPanFetchTimeframe` (6b), `_highLimitBulkHistoryDisabled`
  (6c). No unattributable engine content: the "contamination" is the 6c (signed-off) edits landing
  in the shared working tree during the parallel read-only B8-design task — explained, not rogue.
  **Gate CLEARED; B8 impl may be dispatched.**

- **Ownership table adopted** into `INVARIANTS.md` as the I1 clarification (D-018 directive), so the
  impl worker inherits it as an invariant with the exact bounded-fetch caps.

Still outstanding before the B8 build SHIPS (not before dispatch):
- **6b replay smoke test (BLOCKING, D-017/D-018 #4)** — PO to run live on the current build.
- PO audit clear (once, this week): `Sources Handoff/TalariaV16.jsx` and
  `journal-backend/routes/journal/live_accounts.py` (non-chart, standing audit hygiene per D-018).

B8 impl conditions (D-018, all binding on the impl task): (1) fetch caps land EXACTLY as written
in DIAG-B8b §2; (2) new diag counters `ownerFetches`, `ownerBars`, `boundedMisses`, `handovers`
per owner panel; (3) owner-flip rides host COMMIT events (generation-tagged), never in-flight
state; (4) 6b smoke test blocks ship; (5) kill-switch restoring today's shared-master coupling.

## 6z. B-FIX-6c code sign-off (ledger entry, per D-019 correction #1)

D-019 flagged that §6y called the 6c edits "signed-off" while FINDINGS had no §6 ledger entry
recording an actual 6c review. Recording it now (D-017 allowed 6c to run in parallel with B8
design but did not exempt it from process). Manager review of `B-FIX-6c-high-limit-smart-plumbing.md`
against the code:

- **Scope vs spec — correct.** 6c extends the 6b `allowHighLimit` opt-in to exactly two host/self
  bulk-history call sites: initial backtest history in `autoLoadBacktestingData()` (chart.js:1885)
  and the backtest TF-switch history fill in the replay refetch core (chart.js:21219). Incremental
  pan (`checkViewportLoadMore` → `_fetchCandlesCursor`, 2000/5000 caps) is untouched.
- **I1 (single owner) preserved.** `_shouldUseHighLimitBulkHistory()` (chart.js:5272) returns false
  when `_isMultichartEmbedPanel()` is true — panels never take the high-limit bulk path, so panel
  data-ownership is unchanged. High-limit only applies to the host's own backtest loads.
- **I8 (kill-switch) verified in code.** `_highLimitBulkHistoryDisabled()` (chart.js:5252) reads
  `window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK`; when set, `_shouldUseHighLimitBulkHistory()`
  returns false before any call site can pass `allowHighLimit`/`skipBars`, reverting to the old
  `_backtestFetchLimitForTimeframe()` sizing. Causality confirmed by reading, not just claimed.
- **I4 (both copies byte-identical) verified.** SHA-256
  `bfbe1f623028452cc7d2946927d077b5769c9aa5722b7a94690704f4e4c85116` for both `chart v 1.4/chart/chart.js`
  and `homepage/public/chart/chart.js` (same hash proved in §6y).
- **I9 (checks).** Report states `node --check` passed both copies, lints clean, `build:live`
  succeeded (b11; current deployed b14 supersedes). Live speed acceptance folded into the D-019
  B8 "before" re-capture (see below).
- **`/bars` bypass** (`skipBars` when bulk) is intentional and scoped — `/bars` stays 2000-capped
  and would defeat the high `/smart` limit otherwise. Server already clamps `/smart` to 100000.

**Verdict: B-FIX-6c signed off.** No I1/I7 violation, kill-switch reverts, copies identical.

## 6aa. B8-IMPL code sign-off + build-id correction (2026-07-05, build b15)

Worker 1 implemented B8-IMPL (finer-than-host same-pair panels → bounded self-owners) as a
test build. Manager code review (chart.js + panel-cmd-bridge.js, both copies):

- **I4 verified live:** chart.js both `9018c601a4432e538494260f95d798c6bc87b27d4b54d9e9efcf5bdd4179b962`;
  panel-cmd-bridge both `ef39b05a9743c71cb74bb005c360e543935e691f34386642f067a557759ec0ef`.
- **Kill-switch** `__TALARIA_MC_DISABLE_FINER_PANEL_SELFOWN`: `_finerPanelSelfOwnDisabled()` (2893)
  → `_multichartFinerSamePairPanelSelfOwns()` (2932) returns false → old clone/extend/delegate
  reachable. Reverts cleanly (I8).
- **I7:** self-own gated on `_isMultichartEmbedPanel()`; single chart frozen.
- **D-018 cond 3 (commit-tagged flips):** `_readCommittedHostStateForFinerOwner()` (2899) reads
  `host._mcCommittedNativeRawFetchTf` / `_mcCommitGeneration`, not in-flight state. New event
  `talariaMcHostDataCommit`.
- **D-018 cond 4 (no host delegation):** owner path early-returns before `host.checkViewportLoadMore()`
  (3276). Owners never grow the host master.
- **D-018 cond 1 (caps):** per-request `Math.min(5000,…)`; replay catch-up `2000`; finer test
  `panelMs < hostMs*0.92`. Single conservative initial fetch, under the 2×5000/10000 ceiling —
  within contract.
- **D-018 cond 2 (counters):** `ownerFetches`, `ownerBars`, `boundedMisses`, `handovers` wired to
  `__mcDiagReport()`.
- **I1 clarification honored:** self-fetch is the sanctioned finer-owner exception; same-TF panels
  still hit the mirror path (fetches=0).

**Build-id correction (Manager):** Worker built as `b11`, colliding with 6c's build and *behind*
the `b14` the PO already ran — a cache-bust/SW-update hazard. Manager rebuilt
`BUILD_ID=20260705b15 npm run build:live`; both `sw.js` now `talaria-chart-20260705b15`, chart.js
hash unchanged (B8 code intact). **B8 test build = b15.**

**Verdict: B8-IMPL code signed off; live acceptance PENDING PO on b15.** Ship still gated by the
6b replay smoke test (D-018 #4).

## 6ab. DIAG-B9 signed off; two-track fix (A now, 6b-2 next) per D-020 (2026-07-05)

Worker 1 delivered `DIAG-B9-boundary-and-drift.md` (read-only, zero-diff confirmed). Manager
independently verified both linchpin claims:
- **Q2 pin:** `loadMultichartPanelFromHost` `displayTfMasterHost = displayTf !== '1m' && !(rs0 &&
  rs0.isActive) && … _isMultichartHostPanel()` (chart.js:3911) → armed backtest sets replay
  `isActive` true → `masterTf = '1m'` → `_nativeRawFetchTf`/`replay.rawTimeframe` = 1m →
  `_emitMultichartHostDataCommit` commits 1m → B8 gate `panel 1m < host 1m*0.92` false → inert.
  Confirmed in code.
- **Q1 drift:** owner path compensates a backward prepend (`offsetX -= shiftBars*spacing`,
  `currentIndex += prepended`) in `checkViewportLoadMore`; the three mirror-commit sites do NOT:
  `_multichartMirrorHostTfSwitchIfReady`, `_tryMirrorFrameFromParentData` (replay-system.js),
  `forceSamePairParentDataMirror` (panel-cmd-bridge.js). Confirmed the compensation primitive
  exists and the mirror paths lack it.

Key nuance from the report (matters for B-FIX-6b-2): making the commit event merely *claim* 4h is
insufficient — the host's actual load/commit source must be display-TF, else B8 fires against a
phantom master. Second too-loose surface flagged: `_getReplayPanFetchTimeframe()` can return '1m'
on an armed-but-paused pan when the replay interval is 1m.

**Verdict: DIAG-B9 signed off.** Per D-020 the fix is two tracks, NOT bundled:
1. **B-FIX-A (viewport-stability on prepend)** — Director pre-approved; ship first. Add prepend-delta
   compensation (compare prev firstTs → new firstTs, count display bars, shift `offsetX` + index)
   at the three named mirror-commit sites. I3-clean (viewport channel only), keeps fetches=0,
   kill-switched. Dispatch now.
2. **B-FIX-6b-2 (boundary tightening)** — tighten the "armed ⇒ isActive ⇒ 1m" predicate in
   `loadMultichartPanelFromHost` + `_emitMultichartHostDataCommit` (and the pan surface) so an
   idle-armed host commits display-TF native; first real play/step still hydrates 1m via the
   existing 6b lazy guards. This is the structural fix that also activates B8 naturally. Specced
   as its own task after A ships. B8 itself untouched (its zero counters are the proof harness).

## 6ac. B-FIX-A code sign-off (mirror prepend compensation) (2026-07-05, build b19)

Worker 1 implemented B-FIX-A (D-020 Option A, pre-approved). Manager independent verification:
- **I4:** all three touched files byte-identical across both copies —
  chart.js `feedd66c…`, replay-system.js `10616036…`, panel-cmd-bridge.js `428408a6…`.
- **Kill-switch** `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION`: `_mirrorPrependCompensationDisabled()`
  gates both `_captureMultichartMirrorPrependSnapshot` and `_applyMultichartMirrorPrependCompensation`
  (return null → old no-delta behavior). I8 satisfied.
- **I7:** both helpers require `_isMultichartEmbedPanel()`; single chart never enters.
- **I2 (contiguity):** `_countCleanMirrorPrependedBars` returns 0 unless it's a genuine contiguous
  left prepend (array grew, new firstTs strictly older, old-first located by ts match at idx>0,
  prefix bar verified adjacent-older). No guessing on gaps/short arrays.
- **Correct site placement:** snapshot before adopting parent arrays, apply after, before offset
  finalize — at all three DIAG-B9 sites (`_multichartMirrorHostTfSwitchIfReady`,
  `_tryMirrorFrameFromParentData`, `forceSamePairParentDataMirror`).
- **Applies** `offsetX = previousOffsetX - addedDisplayBars*spacing`, `replay.currentIndex +=
  addedRawBars` (clamped). No fetch added. **B8 gate `panelMs < hostMs*0.92` unchanged.**
- node --check passed all 6; lints clean; build b19; both sw.js `talaria-chart-20260705b19`.

**Verdict: B-FIX-A signed off.** Live acceptance pending PO on b19 (deploy: server git pull +
docker compose up --build -d). Fixes DRIFT only; group-by-group host hauling is B-FIX-6b-2 (next).

## 6ad. B-FIX-A is a NO-OP for the PO's real scenario — DIAG-B9 Q1 named wrong sites (2026-07-05, b22)

PO on b22 (B-FIX-A live, confirmed by build tag): drift UNCHANGED in the canonical repro (2×2,
same pair, backtest ARMED not playing, all sync OFF, drag host A to load old candles → panels
B/C/D drift AND price scale looks wrong/compressed).

Manager code trace of the ACTUAL path for that scenario:
- Same-pair panels following a host pan-load in armed-idle+sync-off go through
  `_tryExtendReplayMasterFromParent()` (prepends host's older bars into the panel's own
  `replaySystem.fullRawData`; `extendsFromParent++`). This is NOT one of the three mirror-commit
  sites B-FIX-A patched (`_multichartMirrorHostTfSwitchIfReady`, `_tryMirrorFrameFromParentData`,
  `forceSamePairParentDataMirror`). **So B-FIX-A never executed here — it is a no-op for this repro.**
- Worse for the theory: `_tryExtendReplayMasterFromParent()` ALREADY contains prepend compensation
  (chart.js ~5449-5468: `replay.currentIndex += earlier.length`, `offsetX -= shiftBars*spacing`).
  So the panel drifts DESPITE existing compensation on its real path. The true mechanism is not yet
  understood — candidates: (a) compensation skipped because `prevReplayIndex` not finite or
  `earlier.length===0` (panel not actually extending); (b) a downstream re-anchor overwrites
  `offsetX` after the extend; (c) price-scale autoscale blowing out vertically (the "scale wrong"
  symptom) as a downstream effect of a wrong horizontal window.

Process note: DIAG-B9 Q1 correctly described the mirror-commit family but did not identify
`_tryExtendReplayMasterFromParent` as the hot path for armed-idle+sync-off host pan-load. B-FIX-A
was implemented faithfully to an incomplete diagnosis. **No more blind fixes** — dispatching a
read-only DIAG-B10 to instrument the actual path live before any further code. B-FIX-A stays in
(kill-switched, harmless, still correct for TF-switch/replay-frame mirror commits); do not revert.

This is a plan deviation worth Director visibility: a signed-off fix that proved inert against the
target repro because the upstream diagnosis under-scoped the path. Recorded for DIRECTOR review.

## 6ae. DIAG-B10 conclusion — the "compressed candles" tell + the sync-state fork (2026-07-05)

DIAG-B10 (Worker 1, read-only) relocated the mechanism to the **sync-bridge visible-range /
pan-follow path**, not `_tryExtendReplayMasterFromParent`'s own (already-present) prepend
compensation. That compensation runs but is then **overwritten** by host-led viewport application
(`applyPanDragFollow` / `applyLightweightPanFollow` / `applyWallClockDateRange` set `chart.offsetX`
+ `chart.candleWidth` from the host).

**Decisive tell (Answer 3):** the "compressed candles / wrong scale" symptom is produced by
`applyWallClockDateRange()` mapping the host 4h wall-clock window onto the panel's 1m data (many
more bars → tiny spacing). That function ONLY runs when a **visibleRange message is applied to the
panel**. So the very fact the PO SEES compressed 1m candles is hard evidence that **the panels are
receiving + applying host visible-range updates.**

Manager cross-check of `multichart-manager.js::_fanOut()`: for `visibleRange`, if
`!syncMode.visibleRange && !syncMode.timeSync` it returns (blocks) — the gate does NOT leak for
ongoing pans. Bypasses that DO deliver visibleRange with sync off: the one-time `forceInitialSync`
snapshot at iframe-add (`_send` direct, by design), and there are TWO independent range flags
(`visibleRange` AND `timeSync`).

**Therefore the fork to resolve BEFORE any fix:**
- (A) The PO actually has one of the two range-sync flags still ON (visibleRange OR timeSync). Then
  panels following + compressing is **EXPECTED behavior**, not a bug — remedy is clearer toggles /
  user education, NOT engine code. Cheapest to check first.
- (B) Both range flags are genuinely OFF but panels still apply host visible-range → real leak
  (repeated forceInitialSync, or a panSync/release path reaching the iframe). Then the fix is in
  `sync-bridge.js::applyVisibleRange()`: for same-pair mixed-TF panels with range sync OFF, allow
  `_tryExtendReplayMasterFromParent()` as data-only and PRESERVE the panel's own offsetX/candleWidth
  (do not call the pan-follow/wall-clock viewport mutators). No double-compensation risk vs B-FIX-A
  (different sites).

Disambiguation is near-zero cost: confirm the live `syncMode` (both range flags) during the repro.
Recorded for Director; leading with the cheap check before spending another build.

## 6af. ROOT CAUSE CONFIRMED (live logs, b27+B10b) — panel offsetX not compensated on shared-master left-growth (2026-07-06)

After B9/B10 theories were disproven by live logs, the B-INSTR-B10b render/hostLoad/updateChartData
logs pinned it definitively. Filtered `[B10]` capture during host-A backward pan-load (host 4h,
panels 1m, backtest armed, sync OFF):

```
render id=B offsetX=-6059.694 firstVisTs=1574708100000 rawLen=28001 fullLen=94535
hostLoad id=A prepended=2000 newLen=96535 isHost=true
updateChartData id=B currentIndex=30000 fullLen=96535 sliceEnd=30001
render id=B offsetX=-6059.694 firstVisTs=1574415000000 rawLen=30001 fullLen=96535
```

Facts proven:
1. **Panels share the host's replay master** — panel `fullLen` tracks host exactly and instantly
   (94535→96535→…→118535) with NO `[B10] extend`, NO inbound message. It's shared/refreshed data,
   not a sync message (both B9 and B10 message theories are dead).
2. **Panel `currentIndex` IS compensated** on prepend (30000→32000→…, +prepended, playhead stays
   on the same bar).
3. **Panel `offsetX` is NOT compensated** — constant `-6059.694` across every load while
   `firstVisTs` jumps older and `fullLen` grows. Inserting N bars before index 0 without shifting
   offsetX slides the visible window left by N bars each load → THE DRIFT.
4. The **host** compensates its own offsetX (its offsetX varies per load: -131→-70→…→223), which is
   why the host doesn't drift but the panels do. Asymmetry = the bug.

Mechanism: the panel's `updateChartData` (`replay-system.js`) re-slices the grown `fullRawData`
(`slice(0, currentIndex+1)`) and renders, and something recompensates `currentIndex` — but nothing
compensates `chart.offsetX` for the left-prepend on the panel side. The existing offsetX
compensation lives in the host's `checkViewportLoadMore` and in `_tryExtendReplayMasterFromParent`
(offsetX -= shiftBars*spacing), but NEITHER runs for the panels in this scenario (panels get the
growth via the shared-master refresh + direct updateChartData, not via extend).

**FIX (B-FIX-C):** in the panel path where the grown master becomes visible (`updateChartData`,
embed-gated), detect a left-prepend (fullRawData[0].t older than last committed first-ts) and apply
`chart.offsetX -= prependedDisplayBars * spacing`, ONLY when not auto-scrolling. Mirrors the host's
own compensation. Kill-switched, embed-only (I7), no double-count (the extend path isn't active
here; guard by tracking last-first-ts so a single prepend is counted once).

Separately (NOT this fix): `hostLoad prepended=2000` repeating (~24k bars over 12 loads) is the 1m
group-by-group hauling = B-FIX-6b-2 territory. Drift fix (B-FIX-C) first.

## 6ag. B-FIX-C code sign-off (panel master-growth offsetX compensation) (2026-07-06, build b25)

Worker 1 implemented B-FIX-C targeting the §6af proven mechanism. Manager verification:
- **I4:** both copies byte-identical — chart.js `1b28244d…`, replay-system.js `06171dd4…`.
- **Site + logic:** `replay-system.js::updateChartData()` top — when embed panel, `autoScroll===false`,
  and `fullRawData[0].t` older than stored `_mcLastMasterFirstTs` (genuine left-prepend), computes
  display bars added (`_countReplayBackwardDisplayBarsAdded`) and applies `chart.offsetX -=
  shiftBars*spacing`. `findIndex` of the old first-ts serves as a contiguity guard (returns -1 →
  rawAdded not >0 → skip if not a clean prepend).
- **Single-count:** `_mcLastMasterFirstTs` stamped every call (finally); worker also stamped it in
  `_tryExtendReplayMasterFromParent`/owner prepend paths so exactly one site compensates per prepend
  (no double-shift).
- **I7 embed-only** (`_isMultichartEmbedPanel()` gate); **I8 kill-switch**
  `__TALARIA_MC_DISABLE_PANEL_MASTER_GROWTH_OFFSET`; node --check + lints clean; build b25.
- B-FIX-A / B8 untouched.

**Verdict: B-FIX-C signed off.** Live acceptance pending PO on b25. Since the b25 build still carries
the `[B10]` instrumentation, PO can VERIFY the fix directly: on host left-load, panel `render` offsetX
should now CHANGE by the prepend delta while `firstVisTs` stays anchored (was: offsetX constant,
firstVisTs jumping). Fixes DRIFT only; group-by-group 1m hauling remains B-FIX-6b-2.

## 6ah. B-FIX-C ACCEPTED live (drift GONE) + new symptom: same-TF switch-back re-render (2026-07-06, b25)

PO on b25: "the drifted movement is fixed." **B-FIX-C acceptance = PASS.** The armed-idle host
pan-load no longer drifts same-pair panels. Root cause (panel offsetX not compensated on shared-
master left-growth) is resolved. This closes the drift thread that spanned B-FIX-A → B9 → B10 →
B-INSTR → B-FIX-C.

**New symptom reported same session:** all panels on 1m → switch host A to 4h (panels hold, good)
→ switch host A back to 1m → "the multichart hid like it's re-rendering" (visible blank/flicker/
re-render on the panels when the host returns to the panels' TF).

Prime suspects (unconfirmed): the same-TF re-mirror path (`_multichartMirrorHostTfSwitchIfReady` /
6a-2 same-TF remirror) replacing panel arrays with a visible blank frame on switch-back, OR a B8
owner→mirror handover if the 4h/1m step engaged B8 (only in live mode where host native=4h). Need
to confirm: (a) live-browse vs backtest, (b) whether it's a regression from B-FIX-A/B-FIX-C (test
with kill-switches) or pre-existing mirror-commit re-render. Read-only diagnosis before any fix.

## 6ak. B-FIX-6b-2 ACCEPTED live (group-by-group GONE) (2026-07-06, b29)

PO on b29: idle-armed host 4h now shows `fetchedBars=4000` (14 fetches) vs the ~34k 1m haul before
(§6af). **The group-by-group slow loading is fixed** and PO confirmed "it's fixed." Host holds a
display-TF (4h) master while idle-armed, lazily hydrating 1m only on real play/step. Drift stays
gone (B-FIX-C holds). **B-FIX-6b-2 acceptance = PASS** (headline fetchedBars criterion). Note: full
B8-activation counters (`ownerFetches>0`, `handovers`) during drag/play were not separately captured
before the PO moved on — the boundary/loading win is confirmed; B8 owner-fetch counter proof is
softly outstanding but non-blocking (host-master win is the user-visible result).

## 6al. Switch-back symptom refined (BL-1 + host price-scale) — next target (2026-07-06)

PO after 6b-2: switching host BACK to 1m (from 4h) → (a) other panels re-render/flicker (BL-1), AND
(b) **the HOST chart's price scale goes off-screen until a double-click resets it.** (b) is new
detail — a host price-axis/autoscale failure on the 4h→1m switch-back, not just the panel repaint.
Could be pre-existing OR a 6b-2 interaction (6b-2 changes host master/commit on switch). Per I11:
read-only DIAG with a live capture (incl. a `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER` regression
check) before any fix. This is now the sharpest remaining user-facing item; per D-022 the price-scale
class (BL-2 family) outranks cosmetic flicker. Recommend pulling this DIAG forward ahead of Phase 2.

## 6am. REPRO SPEC — host TF switch-back cascade (b29, the next target) (2026-07-06)

PO's exact reproducible sequence:
1. Fresh reload → 1m default → perfect.
2. Set 2×2, all panels 1m → good.
3. Host → 4h → perfect (6b-2: fast display-TF master, 4000 bars).
4. **Host back to 1m → host chart HIDES (blanks), other panels re-render AND refetch/reload all
   charts** (not a clean mirror; a full reload storm).
5. **Host → 4h AGAIN → reverts to candle-by-candle (group-by-group) loading** — i.e. the 2nd 4h
   switch is SLOW, unlike the first. Suggests host is stuck on a retained 1m master after the 1m
   episode and resamples 4h from it in chunks instead of loading a fresh 4h display master.

Hypotheses (UNPROVEN — I11 requires live capture before fix):
- Switch-back 4h→1m: host legitimately needs 1m (it now displays 1m) but does a full blanking
  reload; panels refetch instead of mirroring the host's new 1m (should be fetches=0).
- 2nd 4h slow: `_mcFineMasterHydrated` / `_nativeRawFetchTf='1m'` state persists from the 1m episode,
  so `_multichartReplayFineMasterInUse()` / the display-TF-master gate no longer takes the clean
  path → host resamples 4h from retained 1m candle-by-candle.
- Regression suspect: this switch-back path is what 6b-2 changed → check with
  `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER=true`.

Next: live `[B10]` capture of the 4h→1m→4h sequence (instrumentation still in build), then DIAG.

## 6an. LIVE EVIDENCE — host 4h→1m switch-back cascade (b29 [B10] capture) (2026-07-06)

Capture of host switching to 1m (armed replay, 2×2):
```
updateChartData id=A currentIndex=0 fullLen=66535 sliceEnd=1   ← host reloads FULL 66k 1m master; currentIndex RESET to 0 → slices to 1 bar
hostLoad id=A prepended=2000 newLen=68535 offsetX=462.132
updateChartData id=A currentIndex=2000 fullLen=68535 sliceEnd=2001
hostLoad id=A prepended=2000 newLen=70535 offsetX=-13337.868   ← offsetX running away negative
hostLoad id=A prepended=2000 newLen=72535 offsetX=-27341.868   ← further runaway
updateChartData id=A currentIndex=6000 fullLen=72535 sliceEnd=6001
```

Three distinct host bugs proven (all on chartId=A, the host):
1. **Playhead lost:** on 4h→1m, host `currentIndex` RESETS to 0 → `sliceEnd=1` → host renders 1 bar =
   the "host chart hides."
2. **offsetX runaway:** host auto-loads history in 2000-bar chunks and its own prepend compensation
   drives offsetX hugely negative (462 → -13337 → -27341) → view off-screen → needs double-click
   (fit/autoscale) to recover = the "scale hides until double-click."
3. **Full 66k 1m reload** on the switch (not bounded) + chunked auto-load = the reload storm /
   candle-by-candle.

Likely 6b-2 interaction: pre-6b-2 the host always held a 1m master, so 4h→1m was a resample (no
reload). 6b-2 makes idle-armed host hold 4h (great for loading), but switching back to 1m now must
(re)load 1m — and that path resets the playhead + runs offsetX away. This is exactly the switch-back
transition D-021 #2 / D-022 #2 flagged as riskiest. NOT yet confirmed regression vs pre-existing —
need `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER=true` comparison. (Panel B/C/D activity not in this
capture slice; host is the dominant symptom.)

Next: confirm regression via kill-switch, then read-only DIAG to name the playhead-reset +
offsetX-runaway sites on the host's own replay TF-switch reload path.

### UPDATE (kill-switch result + panel logs) — PRE-EXISTING, not a 6b-2 regression
`__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER=true` → **no change** (PO: "same like before"). So the
switch-back cascade is a PRE-EXISTING host replay-TF-switch bug that 6b-2 merely exposed, not caused.

Refined from the fuller capture (host 4h→1m, armed replay, 2×2):
- **Host does MULTIPLE full reloads** on the one switch: `updateChartData id=A currentIndex=0
  fullLen=50000 sliceEnd=1` … then `fullLen=12000 sliceEnd=1` … then `fullLen=2000 sliceEnd=1` —
  the host reloads/reslices from scratch several times.
- **Host playhead resets to index 0** each reload (`currentIndex=0 sliceEnd=1` → 1 bar rendered =
  the "host hides"), then currentIndex walks 0→2000→…→48000 as it auto-prepends 2000-bar chunks,
  re-slicing `0..currentIndex` — i.e. re-building history from the oldest bar (the reload storm /
  candle-by-candle, up to ~50k bars).
- **Panels are NOT drifting:** panel B/C/D `render` shows `firstVisTs` CONSTANT (e.g. 1576554960000)
  while offsetX runs hugely negative — that is B-FIX-C correctly anchoring the visible window as the
  shared master grows. So B-FIX-C holds; the panels just RE-RENDER on every host reload step (the
  "other panels re-render" the PO sees is the downstream repaint of the host's reload storm, not a
  drift).

Net: the problem is entirely the HOST's replay-TF-switch reload path (playhead reset + repeated
full reload + unbounded history auto-load). Pre-existing, complex, and now the sharpest remaining
TF-switch pain. Warrants a focused read-only DIAG (and likely Director prioritization — pre-existing
scope, not part of the drift/6b-2 threads).

### DIAG-B11 RESULT (read-only, agent 7a995e0d) — single root cause chain identified
Host 4h→1m in armed replay: `setTimeframe` → `_refetchBacktestTimeframeCore` →
`_hotSwapBacktestReplayTimeframe` → deferred follow-up → backward history loaders.

ROOT CAUSE (one chain, three visible symptoms):
1. Host 1m bulk fetch uses **session-start** high-limit window (`_getBacktestBulkHistoryFetchRange`,
   chart.js:21732-21740, 5772-5776), NOT a playhead-centered window. The saved playhead timestamp
   often does not map into the freshly replaced `fullRawData`.
2. When `_findLastRawIndexAtOrBefore(...)` returns `hit < 0`, both `applyPersistedState`
   (replay-system.js:186-202) and `syncCurrentIndexFromReplayTimestamp` (118-143) **collapse
   currentIndex to sessionStartIndex (=0)** → `updateChartData sliceEnd=1` = "host hides".
   Same collapse doc'd in `goToReplayTimestamp` (replay-system.js:5528-5546).
3. With playhead pinned at oldest bar, `_snapReplayViewportAfterTfSwitch` (chart.js:21617-21620)
   + `_fillViewportHistoryAfterTfSwitch` (29448-29553) + `_scheduleReplayPanLoadLeft` force
   repeated 2000-bar backward loads; each prepend walks currentIndex forward
   (chart.js:22325-22328: `replayIndex + uniqueNew.length`) and reslices 0..currentIndex →
   the 0→2000→…→48000 storm. `hasMoreLeft` is force-set true (chart.js:21803-21804) so the
   normal stop condition never fires until session start (~48k bars).
Multiple full rebuilds (50000→12000→2000) = cache-hit swap + network bulk swap +
`ensureGoToWindowContainsTimestamp` (2000-bar) swap, each re-running the failing playhead restore.

Host offsetX prepend-compensation (chart.js:22307-22356, B-FIX-C sibling) IS reached but runs
AFTER the reset — it can't restore a playhead that was already collapsed upstream.

### DIAG-B11 FOLLOW-UP (read-only, agent 7a995e0d) — original B-FIX-D model was WRONG; corrected
Reading the actual code refuted two parts of the first DIAG's model:
- The bulk fetch ALREADY centers on the playhead (`_getBacktestBulkHistoryFetchRange`
  chart.js:5779-5786 splits backward/forward around playhead); "playhead-centered fetch" is not the
  missing lever.
- During the 2000-chunk WALK the playhead is PRESERVED, not reset (chart.js:22325
  `replayIndex + uniqueNew.length`); `currentIndex=0` only appears on the separate reload cycles.

VERIFIED STORM DRIVER (the real one):
The backward-fill loop `_fillViewportHistoryAfterTfSwitch` stops only when
`leftIdx = floor(pixelToDataIndex(m.l)) >= 6` (chart.js:29475-29476). But the B-FIX-C prepend
compensation (`offsetX -= shiftBars*spacing`, chart.js:22343-22356) keeps the SAME logical bars on
screen after each prepend, so `leftIdx` never climbs past 6. The loop's continue condition is only
`grew || busy` (29552), so it chains 2000-bar backward loads to session start (~24 chunks / ~48k
bars) = the candle-by-candle reload storm. The observed host offsetX "~60/step" is CORRECT
compensation at zoomed-out spacing (~0.03 px/bar, plotW/~2000 visible bars), not a bug. Autoscroll
does NOT override it during the storm (`updateChartData(false)` skips `syncReplayViewportToPlayhead`,
replay-system.js:3108-3120).

### B-FIX-D (SHIPPED, gated) — fill-loop plateau guard
Fix: in `_fillViewportHistoryAfterTfSwitch` recursion callback (chart.js ~29545), stop when the
master grew but the visible left window gained NO headroom (`grew && leftIdxAfter < 6 &&
leftIdxAfter <= leftIdx`). This halts the storm after ONE useless prepend cycle without touching
B-FIX-C compensation (drift fix preserved) and without affecting a normal single-chart gap-fill
(there `leftIdx` actually increases, so recursion continues as before).
Kill-switch: `__TALARIA_MC_DISABLE_TF_SWITCH_FILL_STORM_GUARD` (I8).
Acceptance (live, host 4h→1m in armed replay): no 2000-chunk walk to ~48k bars (expect ≤ ~2-3
backward loads to fill the visible left gap), host TF switch fast (not candle-by-candle);
kill-switch=true reverts to the storm; panels still don't drift (B-FIX-C intact).
NOTE: the transient "host hides" (`currentIndex=0 sliceEnd=1`) on the reload cycles is a SEPARATE
playhead-restore path (`applyPersistedState` idx=smin when `hit<0`, replay-system.js:191-192) —
deferred; address only if still visible after the storm guard lands.

### DIAG-B11 host-hides flash follow-up (read-only, agent 7a995e0d) + REJECTED naive fix
Root of the flash: on a reload cycle the freshly loaded window can have
`fullRawData[0].t > savedReplayTimestamp` (playhead is a sub-bar intraday moment from the coarse TF;
the applied dataset is NOT the playhead-centered bulk window but a cache entry
(`_applyBacktestTimeframeCacheEntry`, chart.js:8272-8280) or a start-anchored `ensureGoToWindow`
fetch (chart.js:19985-19991)). Then `_findLastRawIndexAtOrBefore` returns hit<0 →
`applyPersistedState`/`syncCurrentIndexFromReplayTimestamp` set currentIndex=sessionStartIndex(0) →
hot swap paints `updateChartData(false)` → sliceEnd=1 → "host hides". Defer follow-up repairs it
later (too late to prevent the flash).

REJECTED FIX (tried + reverted): gating the hot-swap first paint on `syncCurrentIndexFromReplayTimestamp`
returning true. Reason it fails: when hit<0 the ENTIRE loaded window is in the FUTURE relative to
the playhead, and `_endTimeframeSwitching` (chart.js:20826, 20852-20869) re-renders the committed
window via a `!destBarsMatched` safety net + unconditional `render()` regardless — so skipping the
first paint merely trades the 1-bar flash for a full FUTURE-window flash. No net win.

CORRECT FIX (deferred, needs its own gated task): prevent the non-covering window from being applied
at the SOURCE — add a playhead-coverage guard to the cache fast-path
(`_applyBacktestTimeframeFromCache`/`_applyBacktestTimeframeCacheEntry`): if the cached entry does
not bracket the saved playhead, skip the cache and fall through to the playhead-centered network
refetch. Optionally add a small backward margin to `ensureGoToWindowContainsTimestamp` so a bar
<= playhead is always returned (kills hit<0 on the start-anchored path). Do NOT ship this on the
same build as B-FIX-D — verify B-FIX-D live first (I8/I11: one change per verifiable build on this
hot path), then dispatch the flash fix as its own gated task.

### B-FIX-D LIVE-VERIFIED (build b35) — storm gone; master-thrash exposed as the remaining cost
PO live logs on b35: the 24-chunk backward march is GONE (each phase now does 1-2 prepends). But a
1m→4h→1m sequence still shows the host replacing its ENTIRE master multiple times with two
host-hides flashes: `fullLen 68535 (bulk, playhead valid @2000)` → `12000 (cache, idx→0 flash)` →
`2000 (ensureGoTo, idx→0 flash)`. B-FIX-D confirmed working; remaining pain = the reload cascade.

### DIAG (read-only, agent 76a76a11) — reload cascade root, verified
On return to a finer TF, `_applyBacktestTimeframeFromCache` applies a tail-truncated cache entry
(max 12000 bars, `_saveBtTfDataCacheFromChart`/`maxCacheBars`) WITHOUT checking playhead coverage
(`_applyBacktestTimeframeCacheEntry` never calls `_replayPlayheadOutsideMasterWindow`). When the
playhead sits near session start, that tail does not bracket it → `applyPersistedState` idx=smin(0)
→ sliceEnd=1 flash (reload 2). That non-covering master then makes `_deferBacktestTfSwitchFollowUp`
see `_replayPlayheadOutsideMasterWindow=true` and fire `ensureGoToWindowContainsTimestamp` (2000-bar
'start'-anchored) = reload 3 + second flash. Reload 3 is a downstream CONSEQUENCE of reload 2.

### B-FIX-E (SHIPPED, gated) — cache playhead-coverage guard
Fix: in `_applyBacktestTimeframeCacheEntry` (chart.js ~8275, before `this.rawData = entry.rawData`),
if armed replay and the cached entry does NOT bracket the saved playhead
(`savedReplayTimestamp < entry.rawData[0].t || >= lastEnd`), return false → fall through to the
covering network load. Eliminates reload 2, its downstream reload 3, and BOTH host-hides flashes in
one change. Covering caches still apply instantly (fast-path preserved).
Kill-switch: `__TALARIA_DISABLE_BT_TF_CACHE_PLAYHEAD_COVER` (I8).
Isolation: does not touch B-FIX-C prepend compensation or B-FIX-D fill-loop plateau guard.
Acceptance (live, 1m→4h→1m armed): on the 1m return — a SINGLE covering master load (no 12000 then
2000 re-replace), no `currentIndex=0 sliceEnd=1` flash; kill-switch reverts to the 3-reload cascade.
SECONDARY (not in this build): the covering network load is ~68535 bars because the session-start
branch of `_getBacktestBulkHistoryFetchRange` (chart.js:5772-5776) pulls session-start→end. Consider
bounding it to a playhead-centered window later (BL-4) — lower priority than removing the cascade.

### B-FIX-E LIVE-VERIFIED (PO: "much better") — host reload cascade + flash GONE.
Remaining: PANELS flash on host TF-switch (the analogous problem on the embed side). PO wants the
same treatment for panels — stop the flash + old-data reload when the host switches TF.
Next: read-only DIAG on the panel TF-switch/mirror path (panel-cmd-bridge.js
`_multichartReplayTimeframeSwitch`, sync-bridge mirror, panel updateChartData) to find whether panels
hit the same non-covering-window collapse (sliceEnd=1) or re-mirror the host's transient reload
states. Then a contained, kill-switched panel fix mirroring B-FIX-E.

### DIAG (read-only, agent 69ff5317) — panel flash root, verified
Primary cause (b): panels MIRROR the host's transient post-switch reload frames. The panel's existing
hold in `applyReplayFrame` (panel-cmd-bridge.js:454-460) only blocks while
`parent._timeframeSwitching || _pairSwitchLoading`, but the host clears `_timeframeSwitching` at
`_endTimeframeSwitching` (chart.js:8223) BEFORE `_deferBacktestTfSwitchFollowUp`/ensureGoToWindow/
prepends settle. So panels repaint each transient host frame (`_syncReplayMasterFromParentIfCovers`,
`forceSamePairParentDataMirror` → `_tryMirrorFrameFromParentData` copies parent.rawData by reference)
= flash + old-data paint. B-FIX-E only guards the cache-APPLY path; the mirror-by-reference path
bypasses it. Secondary (c): panel independent refetch race when `_multichartMirrorHostTfSwitchIfReady`
misses.

### B-FIX-F (SHIPPED, gated) — hold panel mirror while host master doesn't bracket playhead
Fix: extend the `applyReplayFrame` hold (panel-cmd-bridge.js:454) — also `return` (keep last good
frame) when the parent replay is active and `parent._replayPlayheadOutsideMasterWindow(hostPlayheadTs,
hostReplay)` is true. This suppresses mirroring of the host's non-covering transient reload frames
until the host settles, then resumes on the next covering broadcast. Same bracket semantics as B-FIX-E,
applied to the parent on the mirror path.
Kill-switch: `__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST` (I8).
Isolation: only skips transient frames; does not change B-FIX-C compensation math, B-FIX-D fill guard,
or B-FIX-E cache guard. Worst case a paused panel shows its last-good frame until a covering frame
arrives (no flash, no clear).
Acceptance (live, host 1m→4h→1m armed, same-pair + independent panels): panels do NOT flash/reload old
data during host switch; they settle to the correct frame once host completes; kill-switch reverts.

### B-FIX-G (SHIPPED, gated, b42) — settled resync so ALL held same-pair panels re-mirror (fixes C/D)
Symptom (b41, all panels same 1m TF as host): B-FIX-F fully fixes panel B (kill-switch proves it — off
⇒ B flashes like C/D), but C/D still flash + show STALE old data (last candle ~1.094 vs host ~1.112),
console `No candles drawn! All N candles are outside viewport` (chart.js:28758) → `_scheduleViewportEmptyRecovery`.
Root (DIAG 3a75092f): NO per-panel special-case exists. B wins a race — it is the first iframe / first
in fan-out order, so it catches the brief window where the host master momentarily brackets the playhead
(before backward prepends resume) and clones `parent.rawData` by reference. C/D process a tick later
(still held, or host churning again) and NEVER clone the post-switch arrays. Then two things trap them:
(1) idle dedup at the SAME paused playhead ts (`_mcLastAppliedFrameTs`/`_mcLastSamePairMirrorTs`) blocks
any later recovery; (2) a PAUSED host emits NO further tick broadcast after `_deferBacktestTfSwitchFollowUp`,
so no covering frame ever arrives. `_scheduleViewportEmptyRecovery` then recenters on the panel's OWN
stale bars → old prices + "content jumps".
Fix (two parts, one kill-switch):
- Host (chart.js `_deferBacktestTfSwitchFollowUp`, after `_snapReplayViewportAfterTfSwitch`, ~8007): emit
  ONE authoritative `replay._multichartBroadcastReplayFrame()` once the switch has settled, so held
  (esp. paused) panels receive a final COVERING frame.
- Panel (panel-cmd-bridge.js `applyReplayFrame`): when B-FIX-F holds a panel, set `ch._mcMirrorHeldUnsettled=true`.
  On the first frame after the hold releases (host settled), if same-symbol + same-TF, set a one-shot
  `_mcForceSettledResync` that BYPASSES the three idle dedups (general/independent/same-pair) so the panel
  re-mirrors + re-anchors host data, then clears the flag.
Kill-switch: `__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC` (reverts both parts).
Isolation: B unaffected (if it already mirrored, `rawData===parent.rawData` so the re-mirror re-clones
identical data, no visible change); does not touch B-FIX-C/D/E math; the dedup bypass is one-shot (flag
cleared on the settled frame) so it does NOT reintroduce paused re-render/drift. I4: both copies edited;
build id b42.
Acceptance (live, host 1m→4h→1m armed, all four same 1m): C AND D no longer flash / show stale ~1.094 /
"change place"; all panels settle to the host's current frame; B stays perfect; kill-switch reverts.

### DIAG BL-2 (read-only, b45) — cross-panel price-scale coupling on host TF switch
PO symptom: all four EUR/USD; host TF 1m→4h reframes panels B/C/D price-axis scale, 1m→ reverts. Panels'
1m data unchanged; only framing.
Root (DIAG 6982c08f, CONFIRMED indirect — NOT a direct price-value leak; guards block priceMin/priceMax
fan-out per I6): host TF switch reframes the host visible TIME window (4h spans days vs 1m hours); when
Date Range (`layoutSync.dateRange`) and/or Time (`layoutSync.time`) sync is ON, the host emits the SAME
`visibleRange` message pan/zoom uses (tagged `panSync:false`) via `chartScrolled` (sync-bridge.js:1322) →
manager `_fanOut` → panel `applyVisibleRange`/`applyWallClockDateRange`/`setVisibleTimeRange`. Each panel
then re-autoscales its Y axis to ITS OWN newly-visible bars via `refitPriceAutoScale` (sync-bridge.js:858)
— host min/max never copied. Reversible because the window reverts on switch-back.
Decisive: with ALL sync toggles OFF the coupling is blocked at THREE layers (host outbound 1322, manager
1068, panel 2071) — so BL-2 only manifests with range/time sync enabled. A host TF switch is NOT a
distinct event; it rides the pan/zoom viewport pipeline as `panSync:false`.
Second path REFUTED for this scenario: same-pair replay mirror returns early when hostTf≠panelTf
(panel-cmd-bridge.js:613); direct priceScale copy exists only in `_multichartMirrorHostTfSwitchIfReady`
(chart.js:2921) and only when panel TF already matches host.
Fix shape (SPECCED, NOT shipped — D-023 freeze): gate TF-switch-originated outbound `visibleRange` at
sync-bridge.js:1322 (skip when `chart._timeframeSwitching` or a short `_tfSwitchRangeSuppressUntil`
window, UNLESS `panSync===true` so real pan/zoom still syncs). Optional panel-side backstop at
sync-bridge.js:2203 (skip when `m.sourceTimeframe!==chart.currentTimeframe && !m.panSync`). Kill-switch
`__TALARIA_MC_DISABLE_TF_SWITCH_RANGE_FANOUT`. No regression to same-TF mirror, B-FIX-C/D/E/F/G (uses
`_multichartBroadcastReplayFrame`, not this gate), single-chart, or legit pan/zoom sync.
Immediate PO workaround: turn OFF Date Range / Time sync → coupling stops. BL-2 remains top post-
consolidation backlog item (D-022/D-023).

### DIAG BL-2b (read-only, b45) — sync-OFF viewport/scale coupling REFUTES BL-2 as the whole story
PO retested with ALL sync toggles OFF (Symbol/Interval/Crosshair/Time/Date Range/Drawings/Indicators/
Chart Type) and the panels STILL reframe + re-scale on host 1m↔4h. So the BL-2 visibleRange path is NOT
the (only) cause — DIAG c23f1163 found a SECOND path that ignores sync toggles entirely: the replay
mirror bus (`replayFrame` fan-out, multichart-manager.js:1145; also B-FIX-G's settled broadcast
chart.js:8009), which is never sync-gated.
Root (CONFIRMED): a BY-REFERENCE data trap across the TF switch. During 1m→4h there is a race window
where the host label still reads 1m (host clears `_timeframeSwitching` before the 4h bars settle,
B-FIX-F comment). A `replayFrame` landing there passes the same-TF mirror and assigns
`panel.data = host.data` / `panel.rawData = host.rawData` BY REFERENCE (replay-system.js:6305-6306;
panel-cmd-bridge.js:1083-1084). The host then commits 4h and resamples those SAME array objects IN
PLACE (`_commitTimeframeChange`/`_emitMultichartHostDataCommit`, chart.js:20874-20892). The panel now
points at 4h bars but keeps its 1m viewport (offsetX/candleWidth) → visible window jumps ~10h off
(~06:00 vs 16:00 playhead) + wider auto-scaled Y. INTERMITTENT: only when a replayFrame slips into the
transient label-still-1m window past the B-FIX-F hold + dedup; otherwise panel keeps its detached own
slice and stays perfect.
B-FIX-G disposition: NOT the cause of the forward jump (`_mcForceSettledResync` requires host TF ==
panel TF, false while host=4h). G participates only in switch-BACK to 1m (by design). PO isolation test:
`__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC=true` — forward jump should persist (confirms by-ref trap,
not G).
Eliminated under sync-off: visibleRange/chartScrolled fan-out (sync-gated 1322/1068/2071),
setTimeframe iframe fan-out (interval sync off), `_multichartMirrorHostTfSwitchIfReady` (host 4h ≠
panel 1m), `talariaMcHostDataCommit` finer-owner path (returns when not finer-owner).
Fix shape (SPECCED, NOT shipped — D-023 freeze): the by-ref share is intentional for a stable same-TF
panel, but must NOT survive a host TF change. Smallest gated fix: in `applyReplayFrame` skip the same-TF
mirror (return to the independent branch, never `forceSamePairParentDataMirror` /
`_syncReplayMasterFromParentIfCovers` / `_tryMirrorFrameFromParentData`) when `hostTf !== panelTf` OR the
host is switching; AND detach (`.slice()` / `_multichartDetachViewportFromHost`) instead of by-ref so a
panel can never keep pointing at arrays the host later resamples to another TF. Kill-switch
`__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH` (orthogonal to F/G flags). No regression to
B-FIX-C/D/E/F/G, same-TF mirroring (unchanged when hostTf==panelTf && !switching), or single-chart.
NOTE: this is a correctness glitch (panels show the wrong window/bars), arguably above "cosmetic" — it
belongs to the TF-SWITCH SETTLING family, not the render-budget backlog. Recommend escalation for a
fix-now ruling rather than holding behind full consolidation.

### B-FIX-H (SHIPPED, gated, b46) — hold panel mirror across the same-label TF-switch window
PO authorized fix-now. Correction to the BL-2b DIAG hypothesis: chart.js:20883 `_endTimeframeSwitching`
REPLACES `this.data` (does not mutate in place), so the "shared array mutated underneath" theory is not
the surviving mechanism. The mechanism that holds: during the START of a host TF switch there is a
transient window where the host TF LABEL still equals the panel TF (both '1m' before a 1m→4h commit); a
broadcast `replayFrame` landing there passes the same-TF mirror and the panel adopts a TRANSITIONAL host
frame; the host then commits the new TF and the different-TF guard (panel-cmd-bridge.js:613) locks the
panel out from correction → stuck on the wrong window/scale until switch-back. Intermittent = whether a
frame lands in that window.
Fix: in `applyReplayFrame`, hold (return, keep last good frame, mark `_mcMirrorHeldUnsettled`) when
`pcSwitching._switchingToTimeframe` is set AND its target differs from this panel's TF. The host sets
`_switchingToTimeframe` at `_beginTimeframeSwitching` (chart.js:20776) and clears it at
`_endTimeframeSwitching` (chart.js:20852); the label flips within that span, so coverage is CONTINUOUS —
label==panelTf ⇒ flag set ⇒ B-FIX-H holds; label flips ⇒ guard 613 takes over. No gap. NOT sync-gated
(the replay mirror bus never was). Switch-back (target==panelTf) is intentionally not held by H — guard
613 covers the pre-commit window and B-FIX-G re-syncs on commit.
Kill-switch: `__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH` (orthogonal to F/G flags).
Isolation: only adds a hold during an active host TF switch to a DIFFERENT target TF; same-TF mirroring,
B-FIX-C/D/E/F/G, and single-chart untouched. Worst case (if inert) = panel shows last-good frame slightly
longer. I4: both copies edited; build id b46.
LIVE-VERIFICATION REQUIRED (I10/I11): mechanism is static-derived after one wrong prior DIAG (BL-2) and a
partially-contradicted second (BL-2b in-place claim). PO must confirm b46 stops the sync-off reframe on
host 1m↔4h; if it does NOT, the fix may be inert (frame processed outside the flag window) and we
instrument the exact trigger before iterating — do NOT patch-on-patch.

## 6ai. Backlog (observed on b25, NOT yet worked — deferred to stay on plan) (2026-07-06)

PO explicitly asked to return to the structured plan rather than chase each new symptom. Logging
these so they are tracked, triaged, and not lost:

- **BL-1: same-TF switch-back re-render/flicker.** All panels 1m → host→4h (panels hold) →
  host→1m: panels visibly blank/re-render. Suspect: same-TF re-mirror (`_multichartMirrorHostTfSwitchIfReady`
  / 6a-2) repainting with a blank frame. Family: Phase 3 render-budget / mirror-commit smoothness.
- **BL-2: cross-panel price-scale coupling.** "Some timeframe controls the scale of another chart"
  — changing one panel's TF changes another panel's PRICE (Y) scale. Violates the standing design
  invariant "price-axis independent per panel" (MultichartGrid header). Suspect: shared autoscale /
  shared master min-max leaking across panels. Distinct from horizontal drift; own diagnosis when
  scheduled.
- **BL-3 (known): single-chart replay render lag** (shared `resampleData`/render hot path) — Phase 3.

Triage: BL-1 and BL-3 fold into Phase 3 (render budget). BL-2 is a targeted price-axis-independence
bug (own DIAG when reached). None block the current plan step (B-FIX-6b-2).

## 6aj. B-FIX-6b-2 code sign-off (idle-armed host holds display-TF master) (2026-07-06, b26)

Worker 1 implemented B-FIX-6b-2. Manager verification:
- **I4:** both chart.js copies byte-identical `49767de2…`.
- **Single-source predicate `_multichartReplayFineMasterInUse()`** (chart.js:5643) drives all three
  sites — clean, no scattered copies:
  - `loadMultichartPanelFromHost` gate (4008): `displayTfMasterHost = displayTf!=='1m' &&
    !fineReplayMasterInUse && …` → idle-armed host takes display-TF master (`masterTf=displayTf`),
    genuinely LOADS it (source fixed, not label — D-021 #1).
  - `_emitMultichartHostDataCommit` (3256): commits `replaySystem.rawTimeframe` ONLY when fine
    master truly in use, else `_nativeRawFetchTf` (no phantom label).
  - `_getReplayPanFetchTimeframe` (7052): returns display TF on armed-paused pan when no fine master
    (third surface DIAG-B9 flagged).
- **Predicate logic:** kill-switch → old `isActive` coupling; idle-armed (not playing/preflight,
  `_mcFineMasterHydrated` false) → false → display-TF master; true only when 1m genuinely hydrated
  or playing+needs-fine.
- **Transition flip wired:** `_mcFineMasterHydrated` set true on real 1m load/lazy-hydrate
  (4352/4372/6056); after hydration host emits fresh commit → B8 owner→mirror handover. Preserves
  6b lazy guards (`_ensureLazyReplayMasterBeforeStep` → `ensureReplayDataCoversTimestamp(forceFineMaster)`).
- **I8 kill-switch** `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER` reverts to eager; I7 host-gated;
  interaction map provided (idle-browse/playing/owner — no B-FIX-C double-shift, no orphaned path).
- node --check + lints clean; build b26; both sw.js `talaria-chart-20260706b26`.

**Verdict: B-FIX-6b-2 signed off (code).** Per **I11**, this fixes a PO-reproducible symptom
(group-by-group) so it REQUIRES live acceptance before "done" — PO must capture the D-021 #3
before/after (idle boot fetchedBars ≪34k; first-play lazy 1m 1–3 reqs; kill-switch reverts; B8
`ownerFetches>0`; drift stays gone; no blank frames on the play transition). §6af is the "before".

## 6ao. BL-5 — paused COARSER-panel candle-by-candle re-render on host FINER TF switch (2026-07-06, b67)

**Status:** OPEN. Diagnosis converged; caller not yet name-confirmed live (I11 blocker). This is the
Manager brief + Worker handoff for the next fix attempt. Prior patch-on-patch attempts (B-FIX-J,
self-heal gating) did NOT resolve it — do NOT iterate blindly; NAME the caller first.

### Symptom (PO, reproducible, b66/b67)
- All four panels opened on 4h. Host paused. Host switches 4h → **1m**.
- Panels B/C/D (which stay 4h — COARSER than the new host 1m) visibly re-render **candle by candle**
  (slow). Switching host back to 4h re-renders them **fast** (one shot).
- Console: bursts of `No candles drawn! All N candles are outside viewport. Skipped: N`
  (chart.js `drawCandlesticks` ~28800/28924) where **N INCREMENTS** across frames (captured 43→67).
- `[Violation] 'requestAnimationFrame' handler took 50ms` at **panel-cmd-bridge.js:1375**
  (inside `scheduleCoalescedSeek`'s rAF body).

### Established facts (do NOT re-litigate)
1. Replay is **PAUSED** → this is NOT a play-loop broadcast; a paused host emits at most ONE settled
   broadcast (B-FIX-G, chart.js ~8016).
2. It is **NOT** `checkViewportLoadMore` — the B-TRACE-PANLOAD probe on that function did NOT fire.
3. Panels are **COARSER** than the host after the switch (4h panel vs 1m host) →
   `_multichartFinerSamePairPanelSelfOwns()` (panel-cmd-bridge.js ~3022, `panelMs < hostMs*0.92`)
   returns **FALSE**. So the finer-self-owns detach branch does not apply.
4. The **incrementing** empty-render count (43,44,…,67) means bars are being appended/stepped ONE AT A
   TIME into the panel's series while its viewport is off-screen → a per-frame append+render loop
   INSIDE the panel, re-entered ~once per rAF. It is NOT a single pan-load of a wide window.
5. Existing mitigations do NOT cover it: B-FIX-F/G/H (mirror holds), B-FIX-I (self-heal, gated to
   OFF-SCREEN playhead), B-FIX-J (empty-recovery suppression while `_timeframeSwitching`). All shipped,
   all confirmed deployed in b66 via grep. Kill-switching self-heal did NOT stop it → not self-heal.
6. Deploy is CONFIRMED current (b66/b67, grep verified) — this is a real code path, not a stale build.

### Leading hypothesis (needs the live caller name to confirm — I11)
The rAF at panel-cmd-bridge.js:1375 is `scheduleCoalescedSeek` → `forceReplaySeek` (~1414) →
`goToReplayTimestamp` + `ensureReplayDataCoversTimestamp`. Suspected mechanism: the host's settled
1m broadcast (or a mirror-catch-up retry, `scheduleMirrorCatchUp` ~757) drives the coarser panel to
SEEK to the host playhead ts and to lazily EXTEND/fill its own replay master toward that ts. Because
the panel is 4h its own bars are few and far from the 1m-scaled offsetX, so each fill chunk lands
off-viewport → empty-render, and the fill self-reschedules per rAF → candle-by-candle. Switch-BACK to
4h is fast because the panel TF then equals the host and the settled frame covers in one mirror.
WHY only coarser: a same-TF panel mirrors host data by reference in one shot; a FINER panel self-owns
and detaches; only a COARSER same-pair panel falls into the seek+fill-per-frame branch with a viewport
scaled to the (now finer) host.

### The ONE missing piece (blocks the gated fix — I11)
Which function appends bars per rAF? The b67 trace `_traceEmptyRenderDriver` (gated by
`window.__TALARIA_MC_TRACE_PANLOAD=true`) logs `[EMPTYRENDER]` + caller stack at the `drawn===0`
branch. It has NOT yet been captured live (flag resets on reload / prior deploy lag). Capturing ONE
`[EMPTYRENDER]` stack on a paused 4h→1m switch names the driver and unblocks the fix.

### Fix shape (SPECCED, gated, ship ONLY after caller confirmed)
When the HOST changes TF and a same-pair panel is COARSER than the new host TF (self-owns FALSE) AND
the panel's own playhead/data did not change, SKIP the seek+fill-per-frame path: keep the panel's own
detached slice and viewport, do not chase the host's finer playhead ts, do not lazily extend the
panel master toward an off-viewport ts. Concretely, guard the entry the trace names — most likely one
of: `scheduleCoalescedSeek`/`forceReplaySeek` (bail when `hostTf!==panelTf && !panelSelfOwnsFiner &&
paused`), or the empty-render-driven fill in `drawCandlesticks`/`_scheduleViewportEmptyRecovery`
(already partly guarded by B-FIX-J — extend to cover post-flag-clear window for coarser embeds).
Kill-switch: `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK` (new, orthogonal to F/G/H/I/J).
Isolation: only affects a coarser same-pair panel during a host switch to a finer TF; same-TF mirror,
finer self-own, single-chart, and real replay playback untouched.

### WORKER PROMPT (hand this to a fresh worker; read-only DIAG first, then one gated fix)

> Read-only-first investigation, then a single minimal gated fix. Multi-chart trading app; files are
> DUPLICATED in two trees that MUST stay byte-identical (I4): edit BOTH
> `chart v 1.4/chart/...` and `homepage/public/chart/...`. Engine: `chart/chart.js`; replay:
> `chart/modules/replay-system.js`; panel IPC: `chart/multichart-prod/panel-cmd-bridge.js`; grid:
> `talaria-design/src/MultichartGrid.jsx`.
>
> BUG (BL-5): host + 4 panels all on 4h, replay PAUSED. Host switches 4h→1m. The 4h panels
> (COARSER than the new 1m host) re-render CANDLE BY CANDLE (slow); switching back to 4h re-renders
> fast. Console shows `No candles drawn! All N candles are outside viewport` with N INCREMENTING
> (43→67), and `[Violation] requestAnimationFrame handler took 50ms` at panel-cmd-bridge.js:1375
> (scheduleCoalescedSeek rAF). This is a per-frame append+render loop INSIDE the coarser panel.
>
> FACTS (verified, do not re-litigate): replay PAUSED; it is NOT checkViewportLoadMore (traced, did
> not fire); `_multichartFinerSamePairPanelSelfOwns()` returns FALSE for these panels; B-FIX-F/G/H/I/J
> are all shipped and deployed (b66) and do NOT fix it; disabling self-heal does not stop it.
>
> TASK:
> 1. Trace the chain from "paused host switches 4h→1m" (settled broadcast at chart.js ~8016 and/or
>    scheduleMirrorCatchUp panel-cmd-bridge.js ~757) to the per-rAF append/fill+render at
>    panel-cmd-bridge.js:1375 (scheduleCoalescedSeek → forceReplaySeek ~1414 → goToReplayTimestamp /
>    ensureReplayDataCoversTimestamp) and the empty-render branch in chart.js drawCandlesticks
>    (~28800/28924). Name the EXACT function that appends bars one-at-a-time with file:line.
>    (A gated trace `_traceEmptyRenderDriver` already exists behind `window.__TALARIA_MC_TRACE_PANLOAD`
>    — you may rely on / extend it, but prefer static confirmation with cited line numbers.)
> 2. Explain WHY only coarser panels hit it and why slow for 1m-host / fast for 4h-host.
> 3. Ship ONE minimal, kill-switchable fix: stop an independent/coarser same-pair panel from running
>    the seek+fill-per-frame loop when only the HOST changed TF and the panel's own playhead/data did
>    not change (keep its detached slice + viewport). Kill-switch
>    `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK`. Guard the narrowest entry point; do NOT
>    touch same-TF mirror, finer self-own, single-chart, or real playback.
> 4. Invariants: I4 both copies byte-identical; `node --check` both edited files + lint clean; bump
>    build id (talaria-design/scripts/bump-dist-v9-cache.mjs), embed + sw.js. Report the exact
>    file:line of the culprit, the diff, the build id, and the kill-switch name.

### B-FIX-BL5 (SHIPPED, gated, b68) — skip paused coarser-panel host-switch no-op seek
Culprit (live-traced): `scheduleCoalescedSeek` rAF (panel-cmd-bridge.js:1375) → `forceReplaySeek`
(~1414) → `ch.ensureReplayDataCoversTimestamp` (chart.js:5873) → `_syncReplayMasterFromParentIfCovers`
(chart.js:5570, adopts host's now-1m master) → `replaySystem.goToReplayTimestamp` (replay-system.js:5513)
which reslices+resamples the large 1m prefix to the panel's 4h series EVERY rAF → off-viewport render
(`drawCandlesticks` 28802/28927) → `_scheduleViewportEmptyRecovery` re-arms → N increments 43→67.
Coarser-only: finer panels self-own+detach, same-TF mirror by-ref; only a coarser same-pair panel hits
the reseed+resample branch. Slow with 1m host (huge prefix) / fast with 4h host (tiny prefix).
Fix: `shouldSkipCoarsePanelHostSwitchSeek(ch, ts)` guard at top of `scheduleCoalescedSeek`
(panel-cmd-bridge.js:1381) — bails only when kill-switch off + iframe panel + replay active + PAUSED +
same symbol + different TF + NOT finer-self-own + coarser (panelMs>hostMs) + already aligned to own
playhead (`isPanelReplayAligned`, so genuine scrubs still seek). Keeps panel's detached slice+viewport.
Kill-switch: `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK` (flag on = no-op = old behavior;
orthogonal to F/G/H/I/J). Manager verify: I4 hashes identical (2B6380F8…), `node --check` clean both
copies, guard present both trees. Build id b68.
LIVE-VERIFIED (I11, b68): PO "perfect it's fixed" — coarse panels no longer re-render candle-by-candle
on paused host 4h→1m. RESIDUAL (separate bug, NOT re-render): panels still change PRICE SCALE on host
TF switch with all sync OFF → this is BL-2b (§6ao-residual below), the price-axis-independence invariant
violation, still OPEN.

### BL-2b RESURFACED (b68) — sync-OFF price-scale coupling is the remaining target
PO (post-BL-5): with ALL sync toggles OFF, switching host TF still rescales panels B/C/D's Y axis (no
re-render now — that's BL-5, fixed). Confirms the standing TARGET: all-sync-off ⇒ host TF switch / drag /
any host action must have ZERO effect on B/C/D (price-axis independence, MultichartGrid invariant).
Status: OPEN. B-FIX-H was INERT for this (§6ap); the reset driver is still UNIDENTIFIED. Prior BL-2b
mechanism is static-derived and unproven. Per I11, the NEXT step is a LIVE-INSTRUMENTED DIAG to name the
exact function that rescales the panel Y-axis on a sync-off host TF switch — NOT another static-guess fix
(H already burned that path). Per D-024/D-025 freeze, this is a fix-now candidate that requires a Director
escalation ruling; it qualifies (invariant violation, PO's core target). ESCALATION GRANTED — D-026.

### DIAG BL-2b (read-only, worker) — candidate Y-scale mutator map + gated price probe (SPECCED)
Three mutator families to prove/eliminate on a sync-off host TF switch:
1. Sync bus visible-range autoscale: manager gate `multichart-manager.js:1068-1070` (should block when
   visibleRange=false && timeSync=false); if it leaks → panel `applyVisibleRange` (sync-bridge.js:2005)
   → `refitPriceAutoScale` (sync-bridge.js:858).
2. Replay mirror bus (NOT sync-gated): host fan-out `multichart-manager.js:1132-1148` → panel
   `applyReplayFrame` (panel-cmd-bridge.js:498) → `_syncReplayMasterFromParentIfCovers`
   (chart.js:5570-5625) → `goToReplayTimestamp` (replay-system.js:5513); sink
   `syncReplayViewportToPlayhead` (replay-system.js:2834, mutates Y when resetPriceScale!==false).
3. Empty-render recovery: chart.js:28800-28803/28925-28928 → `_scheduleViewportEmptyRecovery`
   (chart.js:17321) → `_ensureMultichartViewportVisible({resetPriceScale:true})` (chart.js:17404).
   Plus direct copy `_multichartMirrorHostTfSwitchIfReady` (chart.js:2921, same-TF only) and the final
   Y-domain write `calculateScales` (chart.js:22963/23308).
Probe (gated `window.__TALARIA_BL2B_PRICE_PROBE`): `__talariaBl2bSnap/Mark/Log` helpers tag bus origin
(sync vs replay) + emit first Y-scale mutation site file:line for embed panels only. Placements: mark at
sync-bridge.js:2005, panel-cmd-bridge.js:498/1414/1461, replay-system.js:6386; wrap+log at
sync-bridge.js:858, replay-system.js:2834, chart.js:2841/17321/22963.
NEXT: install probe (both trees, gated, node --check), bump diag build, PO captures [BL2B_PRICE] on
sync-off host 1m→4h→1m; the bus tag + first mutation site names the driver → then one gated fix.

### DIAG BL-2b RESULT — LIVE-PROVEN (b72 [BL2B_PRICE] capture, I11 satisfied)
PO captured [BL2B_PRICE] on sync-off host 1m↔4h (all sync toggles off, 4 same-pair panels). Decisive:
- **ZERO `bus:'sync'` events.** Every line is `bus:null | 'replay-mirror' | 'replay-seek'`. The sync
  bus (visibleRange/manager gate) is NOT involved → confirms why sync-off never helped. BL-2b lives
  entirely on the NOT-sync-gated REPLAY bus. DIAG BL-2 (visibleRange) is fully eliminated for this.
- **Final mutator is always `chart.js:calculateScales`**, driven upstream by `applyMultichartMirrorFrame`
  (replay-mirror), `scheduleCoalescedSeek`/`forceReplaySeek` (replay-seek), and — the smoking gun —
  **`chart.js:_multichartMirrorHostTfSwitchIfReady`** and **`replay-system.js:syncReplayViewportToPlayhead`**.
- **ROOT price-axis coupler (direct):** `_multichartMirrorHostTfSwitchIfReady` (chart.js:2986-2994)
  copies `this.priceZoom/priceOffset/autoScale` and `priceScale.autoScale` FROM the host when the panel
  TF matches the host (both 4h). This runs for same-pair, non-independent, non-finer-self-own embed
  panels — i.e. exactly B/C/D — and is on the replay bus (fires with bus='replay-seek'). Adopting host
  Y-state on 1m→4h, dropped on switch-back (panelTf≠hostTf ⇒ func returns at 2918) = the reversible
  rescale PO sees. This DIRECTLY violates the price-axis-independence invariant (MultichartGrid header).
- **Secondary sink:** `syncReplayViewportToPlayhead` resets price scale when `resetPriceScale!==false`
  (fires via replay-seek). `calculateScales` autoscale then recomputes the visible Y domain.
FIX SHAPE (gated, per D-026 step 2): enforce price-axis independence on the HOST replay bus — do NOT
copy host price-state onto an embed panel (skip 2986-2994) and do NOT let a host-driven replay frame
force `resetPriceScale` on the panel, when no price/scale sync is active. Panel keeps autoscaling its
OWN visible bars via `calculateScales` (independent, correct). Kill-switch
`__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE` (new). No change to same-TF DATA mirror, X/time viewport,
finer self-own, single-chart, or real playback Y behavior. Live-verify: sync-off host 1m↔4h no longer
rescales B/C/D; kill-switch reverts; a genuine price-sync toggle (if any) still couples.

### B-FIX-BL2b (SHIPPED, gated, b70) — LIVE-VERIFIED (PO: "perfect now all good")
Fix (per DIAG result above): PRIMARY — `_multichartMirrorHostTfSwitchIfReady` (chart.js:~2994) skips the
host price-state copy (priceZoom/priceOffset/autoScale/priceScale.autoScale) for embed panels unless the
kill-switch is on (no price-sync toggle exists in the codebase — crosshair/visibleRange/timeSync are the
only sync flags and none couple price, so with all-sync-off the copy is simply skipped = the invariant).
`priceScale.locked=false` safety kept unconditional; DATA mirror + X/time viewport untouched. SECONDARY —
`syncReplayViewportToPlayhead` (replay-system.js:~2863) skips price reset via new
`_shouldSkipHostDrivenPanelPriceReset` when the frame is host-originated (marked by
`markHostReplayContext` at panel-cmd-bridge applyReplayFrame/scheduleCoalescedSeek/forceReplaySeek, 2s
window) and NOT genuine local playback; offsetX/X recenter still applied. Kill-switch
`__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE` (flag on = today's coupling). Manager verify: I4 hashes
MATCH (chart.js B8480573…, replay-system 1975A270…, panel-cmd-bridge 1DFA56A2…), guards symmetric in
both trees, node --check clean, build b70. PO live: sync-off host 1m↔4h no longer rescales B/C/D; own
scrub/playback unaffected. **BL-2b CLOSED.** Price-axis-independence invariant restored on the replay bus.
This closes the TF-SWITCH SETTLING / price-axis thread (C→D→E→F→G→I→J→BL-5→BL-2b).
BUILD-ID HONESTY NOTE (per Director D-026 #2): the [BL2B_PRICE] capture screenshot was labeled b72
(a PO-side deployed label) while the probe was bumped b69 and the fix bumped b70; the repo source of
truth (sw.js SW_VERSION) is **b70**. The DIAG capture happened BEFORE the fix (I11 order preserved),
and BL-2b was then live-verified on the deployed fix build ("perfect now all good"). The b72 vs b69/b70
mismatch is deploy-drift between PO's built container and the repo bump counter — it does NOT affect
correctness, but reconciling the build-id source of truth is folded into Item-1 cleanup.

### PROCESS DIRECTIVE ACK (Director, 2026-07-06) — Manager may self-dispatch workers under binding rules
ACK: Manager may dispatch worker subagents directly. Binding: (1) every worker brief recorded VERBATIM in
the ledger at dispatch; (2) record the agent ID; (3) acceptance = INDEPENDENT re-derivation (recompute I4
hashes, re-read shipped guard lines, run node --check/lints, confirm kill-switch name+default) — never the
worker's self-report; (4) fresh-context retries after a PROVEN-WRONG diagnosis go to a COLD PO-started
worker (not a Manager-spawned child that inherits my framing); (5) all else unchanged (I1–I11, one gated
change/task, I11 live-verify, ESC→Director ruling, ACTIVE D-026 freeze = consolidation only).

### TRACEABILITY BACKFILL — this session's dispatched workers (rules 1–2, retroactive)
Briefs for these lived only in subagent context at dispatch (pre-directive); recorded here now for audit:
- **BL-5 fix** — agent `eb140ecf` — brief = §6ao worker-prompt block (verbatim). Output: B-FIX-BL5 (b68).
- **BL-5 I/J retirement verdict** — agent `eb140ecf` (resume) — verdict recorded in §6ao (I & J both KEEP).
- **BL-2b price probe install** — agent `cb22fe5d` — brief: install gated `__TALARIA_BL2B_PRICE_PROBE`
  helpers + bus marks + mutator wrap/logs per §6ao DIAG spec, both trees, no fix. Output: probe build b69.
- **BL-2b gated fix** — agent `5f59b4c9` — brief: enforce price-axis independence (skip host price copy in
  `_multichartMirrorHostTfSwitchIfReady`; skip host-driven `resetPriceScale`), kill-switch
  `__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE`. Output: B-FIX-BL2b (b70), live-verified.
- **Item-1 inventory (read-only)** — agent `2832ae4d` — brief: kill-switch table + single-hold policy +
  cleanup disposition. Output: CONSOLIDATION-ITEM1-FLAG-INVENTORY.md.
- **Item-1 cleanup execution** — agent `f1b04f25` — brief: strip [B10]/[EMPTYRENDER]/[PANLOAD] probes (keep
  [BL2B_PRICE]), reconcile build-id drift, do NOT touch viewport-first. Output: b71.
Independent Manager verification was performed on each fix/cleanup (hashes recomputed, grep/guard re-read,
node --check) — not the workers' self-reports. Going forward, briefs+IDs are recorded at dispatch time.

### BL-6 (OPEN, ESC-011) — panel TIME-viewport parks off-screen on host TF switch (b74)
Surfaced in Item-2 R2 capture. PO-confirmed VISIBLE: on host TF switch, other panels' charts scroll OUT
OF VIEW → `No candles drawn! All 77–78 candles outside viewport` (chart.js:28813), STABLE count (NOT
BL-5's incrementing loop). Before/after fingerprint: pre-BL-5 the coarse panels re-rendered candle-by-
candle (incrementing); post-BL-5 they no longer re-render but sit parked off-screen (stable). Suspected
BL-5 side-effect: `shouldSkipCoarsePanelHostSwitchSeek` skips the coalesced seek (kills the resample
storm) but that seek also recentered the panel viewport onto its playhead → skipping leaves offsetX
parked. Competing hypotheses to rule out: B-FIX-J suppressing empty-recovery, or B-FIX-I self-heal not
firing (playhead judged "aligned"). ESC-011 GRANTED (regression from freeze-window fix = in scope).
I11-strict: read-only DIAG to NAME the mechanism BEFORE any fix (no BL-5-hypothesis patch — that is how H
went inert).

**DIAG-BL6 worker brief (verbatim, read-only) — agent `db6d3d80`:**
> Read-only, very thorough. NO edits. Multi-chart trading app; files duplicated in two trees
> (`chart v 1.4/chart/...`, `homepage/public/chart/...`). Read `docs/multichart-overhaul/MANAGER-FINDINGS.md`
> §6ao (BL-5 fix + BL-2b) and the BL-6 entry, and `CONSOLIDATION-ITEM1-FLAG-INVENTORY.md` §2 (hold policy).
> BUG (BL-6): on a host TF switch, a same-pair panel's TIME viewport ends up parked off-screen (all candles
> outside viewport → `No candles drawn`, chart.js:28813), STABLE count. Prime hypothesis: BL-5's
> `shouldSkipCoarsePanelHostSwitchSeek` (panel-cmd-bridge.js:1383) skips the coalesced seek that also
> recentered the panel viewport onto its playhead, leaving offsetX parked. TASK: (1) Trace what sets/moves
> a panel's offsetX after a host TF switch, and confirm/refute whether skipping `scheduleCoalescedSeek` /
> `forceReplaySeek` removes the ONLY recenter path (vs `syncReplayViewportToPlayhead` offsetX apply,
> `_scheduleViewportEmptyRecovery` (chart.js:17409, gated by B-FIX-J), `_mcScheduleSettledSelfHeal`
> (panel-cmd-bridge.js:446, gated to off-screen playhead)). (2) Determine WHY the parked panel is not
> recovered: is empty-recovery suppressed (B-FIX-J), is self-heal skipping because `isPanelReplayAligned`
> returns true while visibly off-screen, or does BL-5's skip pre-empt all three? (3) Propose the NARROWEST
> gated fix (own kill-switch `__TALARIA_MC_DISABLE_...`) that recenters the panel viewport after a host TF
> switch WITHOUT reintroducing the BL-5 resample storm — e.g. allow a ONE-SHOT recenter (offsetX only, no
> per-frame reslice) when the panel is parked off-screen, or narrow BL-5's skip so it does not suppress the
> initial recenter. Cite exact file:line. Do NOT edit. Do NOT weaken security guards.

**DIAG-BL6 RESULT (agent `db6d3d80`, read-only, static-confirmed):** BL-6 = BL-5 side-effect CONFIRMED +
a latent self-heal bug. (1) For a coarser paused same-pair panel, `applyReplayFrame` returns at
panel-cmd-bridge.js:700-708 (no recenter); the only routine offsetX recenter was via replayTick →
`scheduleCoalescedSeek` → `forceReplaySeek` → `goToReplayTimestamp` → `updateChartData` auto-scroll →
`syncReplayViewportToPlayhead` (offsetX applied at replay-system.js:2855). BL-5's skip at
panel-cmd-bridge.js:1429 removes that path. (2) BL-2b does NOT block offsetX (2855 still applies; only Y
reset skipped). (3) B-FIX-J only suppresses empty-recovery WHILE host switch flags set (chart.js:17405-06);
clears post-settle — not the stable blocker. (4) DECISIVE: B-FIX-I self-heal early-returns at
panel-cmd-bridge.js:470-482 using playhead-timestamp-∈-index-range with STALE/defaulted
visibleStartIndex/visibleEndIndex (`_ve` defaults to `data.length`), so it judges "in view" while every
candle is pixel-off-screen → backstop never fires. Fix: ONE-SHOT offsetX-only recenter after the BL-5 skip
when parked (`_countVisiblePlotBars()===0 || _multichartViewportNeedsRecovery()`) via
`syncReplayViewportToPlayhead({forceRecenter:true, resetPriceScale:false, render:true})` — no
seek/reslice/master-adoption, so BL-5 storm cannot return. Kill-switch
`__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER`. (Secondary, tracked separately: harden
the B-FIX-I predicate at 470-482 to use pixel visibility not stale-index timestamps.)

**FIX-BL6 worker brief (verbatim) — agent `cf13f1ec`:**
> Implement ONE minimal, kill-switchable fix (ESC-011 GRANTED). Multi-chart app; files DUPLICATED in two
> trees, edit BOTH `chart v 1.4/chart/...` AND `homepage/public/chart/...` byte-identical (I4). Do NOT
> touch api_server.py/docs/security guards. Read MANAGER-FINDINGS §6ao BL-6 + DIAG-BL6 RESULT.
> BUG (BL-6): coarser paused same-pair panel's TIME viewport parks off-screen after host TF switch because
> BL-5's `shouldSkipCoarsePanelHostSwitchSeek` skip (panel-cmd-bridge.js:1429) removed the only offsetX
> recenter path. FIX: in `scheduleCoalescedSeek`, when the BL-5 skip fires, do a ONE-SHOT offsetX-only
> recenter (NOT a seek/reslice): if the panel viewport is parked (`ch._countVisiblePlotBars?.() === 0 ||
> ch._multichartViewportNeedsRecovery?.()`), call `rs.syncReplayViewportToPlayhead(ch, {forceRecenter:true,
> resetPriceScale:false, render:true})` then return. Make it truly one-shot per host switch (e.g.
> `ch._mcCoarseHostSwitchRecenterDone`, cleared when host currentTimeframe changes) so it cannot loop.
> Kill-switch `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER` (unset=fix ON; true=today's
> BL-5-only behavior). MUST NOT call forceReplaySeek / ensureReplayDataCoversTimestamp /
> _syncReplayMasterFromParentIfCovers / goToReplayTimestamp (those are the BL-5 storm). Do NOT change
> BL-5's skip predicate, BL-2b, or the B-FIX-I predicate (secondary, separate task). Invariants: both
> copies byte-identical (Get-FileHash MD5 proof), node --check + lints clean, bump build id
> (bump-dist-v9-cache.mjs + all sw.js incl. dist-v9 + embed). Report: exact file:line both trees, diff,
> hash proof, node --check, new build id, kill-switch revert steps, and PO live-verify steps (paused host
> 4h→1m: coarse panels recenter onto their bars, no `No candles drawn` flood; flag on = park returns; no
> candle-by-candle storm = BL-5 stays fixed).

### D-024 #1 verdict — B-FIX-I and B-FIX-J both KEEP (load-bearing, different paths)
Worker read-only verdict (accepted): the BL-5 guard only intercepts the coalesced-seek fallback; it does
NOT cover the earlier `applyReplayFrame` hold paths (I) nor the render-side empty-recovery path (J).
- **B-FIX-I — KEEP.** Unique scenario: rapid host TF switching where a held panel misses/coalesces the
  settled re-mirror and ends with its own playhead OFF-SCREEN; `_mcScheduleSettledSelfHeal`
  (panel-cmd-bridge.js:446-488) heals only then. Not a BL-5 fix. Flag-inventory label:
  "fast-switch/off-screen held-panel backstop."
- **B-FIX-J — KEEP (narrow).** Unique path: `_scheduleViewportEmptyRecovery` triggered directly by a
  transient mid-switch empty render (chart.js:23121-23130, 28800-28803), blocked while host still
  switching/pair-loading (chart.js:17321-17336). BL-5 guard does not cover this (panel-side seek only).
  Flag-inventory label: "mid-switch empty-render quieting; not sufficient for BL-5."
Both remain in the consolidation flag inventory (neither retired); H stays the only retire-candidate.

## 6ap. LEDGER REPAIR (D-024 #2, docs-only) — G/H/I/J + BL-2b honest status (2026-07-06)

Per D-024 the following entries were missing or incomplete. Reconstructed from session record;
where a live result was never actually captured it is marked NOT CAPTURED rather than narrated.

### B-FIX-G — live acceptance
- **Result: ACCEPTED live.** PO: "perfect much better" — C and D no longer flash / show stale
  ~1.094; all four panels settle to the host frame on host 1m↔4h; B stayed perfect.
- **Owed checks folded by D-023 into the G session — NOT CAPTURED:** BL-1 reconciliation
  (resolved-by-F/G vs remnant), §6al host price-scale-off-screen check, B8 activation counters
  (`ownerFetches>0`/`handovers`). These remain open for the consolidation baseline re-capture.

### B-FIX-H — live verification (was flagged REQUIRED in its own entry)
- **Result: INERT for the target symptom.** The sync-off reframe/re-scale on host 1m↔4h was NOT
  on the mirror-hold path the H guard covers (`_switchingToTimeframe` + target≠panelTf); the reset
  driver sits elsewhere. H did not reproduce a fix for BL-2b.
- **Disposition:** retained (gated, harmless, worst-case shows last-good frame slightly longer),
  NOT load-bearing for BL-2b. Consolidation flag-inventory must decide retire vs keep.
- **BL-2b isolation test** (`__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC=true` to confirm by-ref trap
  vs B-FIX-G): **NOT CAPTURED.** Mechanism remains static-derived; do not treat as live-proven.

### B-FIX-I (SHIPPED, gated, b56; regression-fixed b58) — debounced panel settled self-heal
- **Site:** panel-cmd-bridge.js `_mcScheduleSettledSelfHeal` + three call points in `applyReplayFrame`
  (both copies). **Mechanism:** once the host fully settles after a TF switch, held panels re-anchor
  their viewport + price scale to their OWN playhead, debounced to coalesce rapid fast-switches.
- **Kill-switch:** `__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL`.
- **Live (b56): ACCEPTED.** PO: "perfect it works" — fast-switch panel corruption fixed.
- **Regression (b56):** on host 4h→1m the 4h panels refetched needlessly (self-heal recentered even
  fine cross-TF panels → `checkViewportLoadMore`). **Fix (b58):** gate self-heal to panels whose
  playhead is actually OFF-SCREEN (skip fine cross-TF panels). **Live (b58): ACCEPTED.** PO:
  "perfect now good".
- **BL-5 relevance:** disabling self-heal does NOT stop BL-5 → I is not the BL-5 driver. D-024 #1
  requires the BL-5 report to state whether I survives the real fix or retires.

### B-FIX-J (SHIPPED, gated, b62) — suppress panel empty-recovery while host mid-switch
- **Site:** chart.js `_scheduleViewportEmptyRecovery` — early-return (skip price-scale reset) for
  embed panels while the host is switching (`_timeframeSwitching` / `_switchingToTimeframe` /
  `_pairSwitchLoading`) (both copies). **Kill-switch:** `__TALARIA_MC_DISABLE_PANEL_HOSTSWITCH_QUIET`.
- **Live status: INSUFFICIENT (honest hole).** On a PAUSED host 4h→1m the coarser panels still
  re-render candle-by-candle AFTER the switch flags clear — the driver is inside the panel and fires
  post-flag-clear, outside J's guard window. This insufficiency is exactly what spawned **BL-5**
  (§6ao). J is retained gated pending the BL-5 root fix.
- **BL-5 relevance:** D-024 #1 — the BL-5 report must state whether J is still needed once the real
  driver is guarded, or is scar tissue to retire.

### Cross-cutting note for consolidation (D-024 #4)
F/G/H/I/J are five overlapping holds/recoveries on the `applyReplayFrame` / empty-recovery path.
Once BL-5 names the real driver, the flag inventory must classify each as load-bearing or superseded
and propose a single coherent hold policy. Current honest read: F+G load-bearing (same-TF panel
flash), H inert-but-harmless, I load-bearing (fast-switch), J insufficient (BL-5 supersedes intent).

## 6aq. Phase-4 harness Task 4.1 dispatch (D-030 step 1, 2026-07-07)

**Context:** D-030 reordered the go-forward plan so the Phase-4 regression harness lands BEFORE the
Item-1 removals (viewport-first + retire H). This is the Task 4.1 skeleton dispatch. Brief recorded
VERBATIM per D-028 rule (1); agent ID recorded on return; acceptance = INDEPENDENT re-derivation
(node --check, run npm test, confirm real tree served, zero console errors), never the worker's
self-report.

**Worker brief (verbatim):**
> Build Phase-4 Task 4.1 ONLY (harness skeleton + stub bar server). Read
> `docs/multichart-overhaul/PHASE-4-regression-harness.md` Task 4.1 first — it is authoritative.
> New files under `chart v 1.4/chart/multichart-prod/harness/`: `package.json` (private, single
> devDependency `puppeteer` — official npm package, install via `npm install`, do NOT hand-edit the
> lockfile), `serve.mjs` (Node, zero deps), `run.mjs` (puppeteer).
> `serve.mjs`: static-serve the REAL canonical tree (`chart v 1.4/chart/`) at the paths the engine
> expects (`/chart/chart.js`, `/chart/modules/*`, `/chart/multichart-prod/*`, `/chart/dist-v9/*`);
> emulate `/api/file/{id}/bars` (honor `has_more_left/right`, `resolution`, anchor-start truncation at
> `limit`), `/api/file/{id}/smart`, `/api/file/{id}/meta` with deterministic synthetic 1m candles
> (~90 days); two file ids (25 and 27); LOG every API hit with query params (fetch-count assertions
> depend on it). `run.mjs`: boot a 2x2 same-pair layout — prefer the production dist-v9 page; if it is
> too heavy to boot headless, fall back to composing `chart-embed.html` panels + a minimal host that
> wires `chart.js` + the manager mirroring `MultichartGrid`, and DOCUMENT which was chosen and why.
> Use REAL mouse events for any gesture (none needed yet for 4.1). Wait for 4 painted panels, call
> `window.__mcDiagReport()`, print a diag table, exit 0.
> ACCEPTANCE (4.1 only): `npm test` boots the 2x2, waits for 4 painted panels, prints the diag table,
> exits 0, with ZERO console errors during boot. Do NOT implement Task 4.2 scenario assertions yet.
> Do NOT touch engine code, bridges, build IDs, sw.js, or the security workflow. Confirm
> `.dockerignore` already excludes `**/node_modules` (report the line); nothing here ships in Docker.
> Report: files created, boot path chosen (dist-v9 vs composed) + rationale, exact `npm test` output,
> and any console warnings observed.

**Agent ID:** 5e47b9c8-e4ff-4d19-bec1-e6c58187dfae

**Manager INDEPENDENT verification (not the worker self-report) — PASS:**
- `node --check serve.mjs && node --check run.mjs` → exit 0.
- Read `serve.mjs`: `CHART_ROOT = path.resolve(__dirname,'..','..')` → serves the REAL canonical
  `chart v 1.4/chart/` tree at `/chart/*` (chart.js, modules, multichart-prod, dist-v9, vendor,
  fonts), confirmed 1:1 — not copies. API stubs match engine-read shapes (bars/smart/meta/candles).
- Ran `npm test` myself: exit 0; 4/4 panels painted; diag table printed; **0 console errors**; boot
  API hits `{auth.me:4, other:4, file.bars:8}`.
- Boot path chosen = composed `chart-embed.html` panels + minimal host mirroring `MultichartGrid`
  (dist-v9 React page rejected as too heavy — the doc-anticipated fallback), documented in run.mjs.
- `.dockerignore:9 = **/node_modules`; only `puppeteer` installed from npm; no engine/bridge/build-id/
  sw.js/security-workflow touched. **Task 4.1 acceptance MET.**

**Observation for Task 4.2 (not a 4.1 blocker):** same-pair 2x2 boot shows `file.bars:8` (≈2 per panel)
and per-panel `fetches:4` — i.e. panels self-fetch on cold boot rather than the host being the sole
fetcher. This is exactly the ownership defect H-S10 ("same-pair panels: 0 fetches") is meant to catch,
so 4.2 assertions should be written to FAIL against current behavior and thus flag the real bug.

---

## 6ar. Phase-4 harness Task 4.2 dispatch (D-030 step 1, 2026-07-07)

**Context:** 4.1 skeleton verified green (§6aq). Task 4.2 = scenario assertions mirroring the Phase-0
matrix. Brief verbatim per D-028 (1); agent ID + independent verification on return.

**Critical policy for this task (Manager ruling):** assertions encode INTENDED behavior, not current
behavior. Where current code violates an invariant (e.g. same-pair cold-boot self-fetch seen in §6aq),
the worker MUST write the assertion to the intended contract and let it FAIL — reporting it as a
harness-CAUGHT real defect — rather than weakening the assertion to force green. Do NOT relax an
assertion to match a buggy result (same spirit as the security rule against weakening guards to pass).
The 5-run flake check applies to assertion STABILITY (same verdict each run), not to forcing all-pass.

**Worker brief (verbatim):**
> Build Phase-4 Task 4.2 (scenario assertions) on top of the existing 4.1 harness at
> `chart v 1.4/chart/multichart-prod/harness/`. Read `PHASE-4-regression-harness.md` Task 4.2 — the
> table there is authoritative; keep test IDs in sync with the Phase-0 matrix. Implement each row as an
> individually-named test that resets diagnostics first (`window.__mcDiagReport`/reset hooks): H-S2,
> H-S3, H-S5, H-S6, H-S7, H-S8, H-S10, H-S11, and H-INV (run after every test). Simulate gestures with
> REAL puppeteer mouse events (`page.mouse.down/move/up`), never direct function calls, so drag/burst
> paths are exercised. Assert on FETCH COUNTS (from serve.mjs's per-hit log), first/last bar equality,
> seam counters, playhead equality, and offset-delta-at-release. Run each scenario under sync ON and
> sync OFF and same-pair / independent-pair where the row calls for it.
> POLICY: write assertions to the INTENDED contract. If current engine behavior violates it (e.g.
> same-pair cold boot currently self-fetches ~2 bars/panel instead of 0), let the assertion FAIL and
> label it clearly as a harness-CAUGHT real defect in the output — do NOT weaken the assertion to force
> a pass. Provide a machine-readable summary line (e.g. `RESULT <id> PASS|FAIL-REAL-BUG|FAIL-FLAKE`).
> Also add the deliberate-bug proof: a documented way (env var or kill-switch toggle) to re-enable a
> panel fetch path and show H-S2/H-S3 flip to FAIL — proving the harness catches the class it exists
> for. Run the full suite 5 consecutive times and report per-test verdict stability (flake = differing
> verdicts across runs; that IS a bug to report).
> Do NOT touch engine code, bridges, build IDs, sw.js, or the security workflow (toggling an EXISTING
> kill-switch from the harness via query param/env is fine; adding new engine flags is not). Report:
> every test's 5-run verdict table, which failures are real-bug vs flake, the exact deliberate-bug
> proof output, and any scenario you could not implement faithfully (with why). Windows/PowerShell env.

**Agent ID:** c02b8a0e-fd42-4409-82c3-4b479e8fa980

**Manager verification — 4.2 built, but ACCEPTANCE WITHHELD (harness fidelity defect):**
- Files (`harness-lib.mjs`, `scenarios.mjs`, rewritten `run.mjs`, modified `serve.mjs`/`package.json`)
  created; suite runs stable across 5 runs (zero flakes) with per-test `RESULT` lines and an H-S12
  deliberate-bug lever (`__TALARIA_DISABLE_SHARED_BAR_STORE`: 1→2 late-panel fetch) that flips PASS→FAIL.
  Green now: H-S5, H-S7, H-S8, H-S11, H-S12. Red: H-S2, H-S3, H-S6, H-S10.
- **BUT: the harness has NO in-process host chart.** `serve.mjs` `hostPageHtml` registers tile A as a
  4th `chart-embed.html` iframe (`ids=['A','B','C','D']`, all `mgr.addChart`). Production (verified in
  `MultichartGrid.jsx`) makes **tile A the parent page's real `window.chart`** with the host bridge
  installed on it (`installBridge`, `HOST_PANEL_ID`); only B/C/D are iframes. The host chart is the
  mirror/clone/fetch source (`allReadyIframesShareHostFileForMirror(managerCharts, hostChart)`,
  host replay fan-out). With no host actor, the ownership model is inverted → every tile is a peer with
  no mirror source.
- **Consequence:** H-S2/S3/S6/S10 RED are almost certainly TOPOLOGY ARTIFACTS, not proven engine
  defects. The worker disclosed this honestly (its §6). A gate that is red at baseline for harness
  reasons cannot distinguish a regression from known-red, so 4.2 is NOT accepted until the host is real.
- **Ruling:** the reds are RE-CLASSIFIED from "harness-caught real defect" to "UNPROVEN pending host
  fidelity." No engine fix may cite them yet. Next: Task 4.1c host-fidelity fix (below), then re-run 4.2
  and re-triage which reds survive (= real engine defects) vs turn green (= were artifacts).

---

## 6as. Phase-4 Task 4.1c dispatch — host-chart fidelity (D-030 step 1, 2026-07-07)

**Context:** §6ar verification found the harness lacks a real host chart. Task 4.1c makes tile A the
parent's real `window.chart` (chart.js + host bridge) mirroring `MultichartGrid`, then re-runs 4.2.
Brief verbatim per D-028 (1); agent ID + independent verification on return.

**Worker brief (verbatim):**
> Fix the Phase-4 harness so it faithfully mirrors production topology, then re-run Task 4.2 and
> re-triage. Repo root `c:\Users\user\Desktop\talaria1\full-talaria-log--main`; harness at
> `chart v 1.4/chart/multichart-prod/harness/`. Read `chart v 1.4/talaria-design/src/MultichartGrid.jsx`
> — it is authoritative for host wiring: tile A is the PARENT page's real `window.chart` (loads
> `chart.js` + `modules/*`), with the host bridge installed on it (see `installBridge`, `HOST_PANEL_ID`,
> host-bridge install block); ONLY B/C/D are `chart-embed.html` iframes; the `MultichartManager` owns
> them; host TF/replay/mirror fans out to panels; same-pair mirroring is gated by
> `allReadyIframesShareHostFileForMirror(managerCharts, hostChart)`.
> Change `serve.mjs` `hostPageHtml` (and any run.mjs assumptions) so cell A hosts a REAL in-process
> chart: load `/chart/chart.js` + required `modules/*` into the host page, construct the host chart the
> same way the production parent page does (inspect how dist-v9 / the parent boots `window.chart`), set
> `window.chart`, register it with the manager as the HOST panel (not an iframe), and install the host
> bridge exactly as MultichartGrid does. B/C/D remain iframes. Keep it MINIMAL but faithful — the goal
> is that the host→panel mirror/clone and host-replay fan-out paths are LIVE.
> Then re-run the full 4.2 suite (`npm run test:flake`, 5×) and RE-TRIAGE every previously-red test
> (H-S2/S3/S6/S10): report which are now GREEN (were topology artifacts) and which stay RED (candidate
> REAL engine defects) with the exact fetch/bar numbers. Keep the H-INV invariant and the H-S12
> deliberate-bug proof working. Update the run.mjs top comment to document the now-faithful topology.
> CONSTRAINTS: do NOT modify engine code, bridges, build IDs, sw.js, or the security workflow — only the
> harness folder. Toggling EXISTING kill-switches from the harness is fine; no new engine flags. Only
> the already-installed puppeteer. REPORT: exact host-boot approach + how you confirmed the host bridge
> installed and mirror path is live (e.g. a panel mirrors host without self-fetch), the re-triaged
> 5-run verdict table with before/after for each red test, and any scenario still not faithfully
> reproducible + why. Windows/PowerShell env; run via `npm test` / `npm run test:flake`.

**Status: host-fidelity landed (worker interrupted late, but the change is complete and functional).**
`serve.mjs` `hostPageHtml` now boots tile A as the PARENT page's REAL in-process `window.chart`
(chart.js auto-init on `#chartCanvas`) with the host bridge installed (`installBridge`, chartId 'A');
only B/C/D are `chart-embed.html` iframes. `confirm-host.mjs` added. No engine/bridge/sw.js/build-id
files touched (git confirms only harness files changed).

**Manager INDEPENDENT verification (ran `npm run test:flake` myself, 5 runs) — divergence found:**
My 5-run session is internally STABLE but DIFFERS from the worker's session on two tests:
| Test | Worker 5-run | Manager 5-run | Verdict |
|------|-------------|---------------|---------|
| H-S2 | FAIL×5 | FAIL×5 | **CONFIRMED real defect (10/10)** |
| H-S3 | FAIL×5 | FAIL×5 | **CONFIRMED real defect (10/10)** |
| H-S6 | FAIL×5 | FAIL×5 | **CONFIRMED real defect (10/10)** |
| H-S8 | PASS×5 | **FAIL×5** | **CROSS-SESSION FLAKE** |
| H-S10| FAIL×5 | **PASS×5** | **CROSS-SESSION FLAKE** |
| H-S5/S7/S11/S12 | PASS | PASS | stable PASS |

**Rulings:**
1. **Host fidelity ACCEPTED** — H-S8 (replay playhead equal, 0 fetch during play) exercising the
   host→panel replay-mirror path, plus H-S5/S7/S11/S12 green, prove the real host chart is live. The
   earlier §6ar reds are no longer topology artifacts.
2. **Three CONFIRMED-STABLE real engine ownership defects** (fail 10/10 across two independent sessions,
   now that the host is real):
   - **H-S2** — paused replay, sync ON: host A extends into history but same-pair peers B/C/D do NOT
     mirror the host's extended first bar (A first=…168…, B/C/D=…288…). Host history-extension not
     fanned out to same-pair panels.
   - **H-S3** — drag panel B (same-pair): B SELF-FETCHES (B=2) instead of the host being the sole
     fetcher; fails under sync ON and OFF. Peer-panel pan should route through host ownership.
   - **H-S6** — TF fan-out 1m→1h: ALL FOUR panels fetch (expected ≤1 owner). Each panel independently
     re-fetches on TF switch instead of one owner fetch + fan-out. (1h→1m step is clean.)
3. **H-S8 and H-S10 are CROSS-SESSION FLAKY** (verdict flips between machines) → NOT trustworthy, must
   NOT feed the engine fix queue. Root is harness timing (S8 playhead settle-window; S10 cold-boot fetch
   race), not proven engine behavior. Requires harness hardening before their verdicts count.
4. **Task 4.2 NOT yet a merge gate.** A gate with 2 cross-session-flaky scenarios is worse than none.
   Task 4.3 (wire as gate) is BLOCKED until S8/S10 give deterministic cross-session verdicts.

---

## 6at. Phase-4 Task 4.2b dispatch — de-flake H-S8/H-S10 (D-030 step 1, 2026-07-07)

**Context:** §6as found H-S8/H-S10 flip verdict across sessions. Harden their timing so verdicts are
deterministic, WITHOUT weakening the intended contract. Brief verbatim per D-028 (1); agent ID +
independent (own machine, 2 separate 5-run sessions) verification on return.

**Worker brief (verbatim):**
> The Phase-4 harness at `chart v 1.4/chart/multichart-prod/harness/` now boots a real host chart and
> its suite is stable WITHIN a session but H-S8 and H-S10 flip verdict ACROSS sessions/machines
> (Manager saw H-S8 FAIL×5 + H-S10 PASS×5; a prior session saw H-S8 PASS×5 + H-S10 FAIL×5). Make
> BOTH deterministic across runs WITHOUT weakening the intended contract from
> `PHASE-4-regression-harness.md`. Read `run.mjs`/`harness-lib.mjs`/`scenarios.mjs` for their current
> timing model. H-S8 (replay play 15s: playhead equal across panels + bounded fetch/render): replace
> any fixed sleeps / single-sample checks with deterministic convergence waits (poll `__mcDiagReport`
> until all panels report the same playhead within a bounded settle budget, or a hard timeout that
> fails LOUDLY — never a pass-by-timing) and sample only at quiescent points. H-S10 (cold-boot 2x2
> same-pair: 0 panel data fetches): the boot fetch race means the count is read at different lifecycle
> points across runs; anchor the assertion to a DETERMINISTIC lifecycle signal (wait until all 4 panels
> report painted AND the manager reports boot/mirror settled, then read the cumulative same-file data
> hits) so the number is reproducible. Do NOT relax the 0-fetch / equality contracts — if the engine
> truly self-fetches on cold boot, H-S10 must FAIL deterministically (it is then a real defect), not
> flip. Then RUN `npm run test:flake` TWICE (two full 5-run sessions, ideally with a gap) and show BOTH
> sessions produce IDENTICAL per-test verdicts for all 9 tests. Report the two session summaries side
> by side and state each test's now-deterministic verdict.
> CONSTRAINTS: harness folder ONLY; do NOT touch engine/bridges/sw.js/build-ids/security-workflow; no
> new engine flags (toggling existing kill-switches is fine); only the installed puppeteer. Windows/
> PowerShell. REPORT: exact timing changes per test, the two 5-run session tables proving determinism,
> and confirm H-S2/H-S3/H-S6 remain FAIL and H-S5/S7/S11/S12 remain PASS.

**Executed by a PO-dispatched external worker (no Task agent ID); result pasted back to Manager.**

**Manager INDEPENDENT verification (3rd session — ran `npm run test:flake` myself) — ACCEPTED:**
- My 5-run session verdicts match the worker's TWO sessions EXACTLY (3 independent sessions now agree):
  FAIL×5 → H-S2, H-S3, H-S6 · PASS×5 → H-S5, H-S7, H-S8, H-S10, H-S11, H-S12. Cross-session flake GONE.
- Read the actual assertions in `scenarios.mjs`:
  - **H-S8:** determinism = convergence polling (all panels settle @ts0, per-step exact-playhead
    convergence at quiescent points, hard-timeout fail-loud). Contract UNCHANGED/TIGHTENED
    (`data fetches during play == 0`, renders bounded). NOT weakened.
  - **H-S10:** the OLD assertion was BROKEN — a `page` typo meant the real contract check never ran and
    the verdict was decided by incidental H-INV boot noise (THIS is the true root of the S10 flip, not
    engine behavior). Fix resets the server log for a clean cold-boot count, anchors the read to a
    deterministic settled signal (all painted + nothing in-flight + viewport/mirror settle + stable
    diag.fetches), and measures the FAITHFUL Phase-4 contract: same-pair **panels B/C/D** self-fetch==0
    (they mirror the in-process host), while host A's own owner-load (file25 hits=2) is the intended
    design and is reported, not counted as a violation. My run: `B/C/D=0, host(A)=4, file25 hits=2`.
    This is a CORRECTION to the true contract, NOT a weakening — a genuine panel self-fetch would still
    FAIL it deterministically.
- Harness-only; no engine/bridge/sw.js/build-id/security-workflow changes.

**Rulings:**
1. **Task 4.2b ACCEPTED. The harness is now a TRUSTWORTHY deterministic gate** — 9 scenarios, identical
   verdicts across 3 independent sessions, with a working deliberate-bug lever (H-S12).
2. **H-S10 re-classified:** it was NEVER a real engine defect — it was a broken/noise-driven assertion +
   (in the pre-host harness) a topology artifact. With the real host, same-pair cold-boot ownership is
   CORRECT (peers mirror, 0 self-fetch). Removed from any fix queue.
3. **Confirmed real engine ownership defects remain exactly three:** H-S2 (host history-extension not
   mirrored to same-pair peers), H-S3 (panel self-fetch on its own drag, sync ON+OFF), H-S6 (all four
   panels fetch on 1m→1h fan-out instead of ≤1 owner). These are the Phase-2/3 fix targets.
4. **Task 4.3 (wire harness as merge gate) is now UNBLOCKED** — determinism precondition met.

---

## 6au. Phase-4 Task 4.3 COMPLETE — merge gate wired + verified (D-030 step 1 DONE, 2026-07-07)

**Executed by a PO-dispatched external worker (no Task agent ID); result pasted back + Manager-verified.**

**Files:** `harness/gate.mjs` (ratchet runner), `harness/known-failing.json` (expectedTests[9] +
knownFailing{H-S2,H-S3,H-S6} with reasons+tracking), `harness/package.json` (`npm run gate`),
`.github/workflows/multichart-harness.yml` (NEW, PR-only), `docs/.../CHECKLIST.md`,
`docs/multichart-panel-data-and-rendering.md` ("Phase 1–4 landed" section).

**Manager INDEPENDENT verification — ACCEPTED:**
- Ran `npm run gate` myself → **exit 0**: known-failing H-S2/S3/S6 still red, 0 regressions, 0
  newly-fixed; H-S5/S7/S8/S10/S11/S12 PASS. Matches report.
- Read `gate.mjs`: ratchet semantics correct — FAIL on (a) a non-baseline test failing [regression],
  (b) a baseline test passing [stale baseline → must remove/ratchet], (c) scenario-ID drift vs
  expectedTests, (d) known-failing IDs outside expectedTests, (e) raw exit≠0 not matching baseline.
  `node --check` clean.
- Read workflow: PR-triggered on `chart v 1.4/chart/**` + `chart v 1.4/talaria-design/src/Multichart*`
  only, `permissions: contents: read`, node 20, `npm ci`, `npm run gate` on ubuntu. Separate NEW file.
- `git status`: only harness files (+ the two intended docs); **no engine/bridge/sw.js/build-id changes,
  `security.yml` untouched** (independently confirmed via scoped git status).
- Minor follow-up for whoever commits: `harness/package-lock.json` must be committed (workflow
  `npm ci` + cache-dependency-path depend on it).

**PHASE 4 (regression harness) COMPLETE** — 4.1 (skeleton) + 4.1c (real host fidelity) + 4.2
(scenarios) + 4.2b (cross-session determinism) + 4.3 (gate+CI) all landed and Manager-verified. The
whack-a-mole root cause (RC5) is closed: multichart engine changes now ratchet against a deterministic
machine gate. **D-030 go-forward step 1 DONE.**

**Next per D-030:** step 2 = Item-1 deferred cleanup (viewport-first dead-code removal + retire H flag)
— now genuinely safe because the gate catches any regression. Then step 3 (Phase 2 finish) which
absorbs the three confirmed ownership defects H-S2/H-S3/H-S6 (each fix ratchets its ID out of
known-failing.json). No new Director decision required; D-030 is binding.

---

## 6av. Item-1 deferred cleanup DONE + verified (D-030 step 2, b73, 2026-07-07)

**Executed by a PO-dispatched external worker; Manager-verified against the live gate.**

**Removed (both mirrored trees):** viewport-first dead code + its flags
(`__TALARIA_MC_ENABLE_VIEWPORT_FIRST`, `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH`,
`__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH`) from chart.js (constructor state, load branches,
hydration helpers, `_takeParentNativeMasterSmartWindow`, `loadMultichartPanelFromHost`, replay
coverage, TF-switch begin, `_fillViewportHistoryAfterTfSwitch`); and the B-FIX-H hold + kill-switch
(`__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH`) from panel-cmd-bridge.js.

**Manager INDEPENDENT verification — ACCEPTED:**
- grep: the 4 removed flags appear ONLY in docs now — 0 matches in any `.js`/`.html`.
- Kept load-bearing flags CONFIRMED present in both trees: F/G/I/J-family
  (UNSETTLED_HOST/SETTLED_RESYNC/SETTLED_SELFHEAL/HOSTSWITCH_QUIET), PRICE_INDEPENDENCE,
  COARSE_PANEL_HOSTSWITCH_SEEK.
- Mirror hashes (my Get-FileHash) MATCH v1.4↔homepage for chart.js
  (DAD519E2…113CF) and panel-cmd-bridge.js (74FB7AA1…9B1A) — match the worker's reported hashes.
- Ran `npm run gate` MYSELF → exit 0, IDENTICAL verdict set (H-S2/S3/S6 known-failing, 0 regressions,
  0 newly-fixed, others PASS). No regression from the removal.
- `.github/workflows/security.yml` untouched (git status); build id `20260707b73` in both `sw.js`.

**D-030 step 2 DONE.** Next = step 3 (Phase 2): fix the three confirmed ownership defects
H-S6 → H-S3 → H-S2, each behind a kill-switch, each ratcheting its ID out of known-failing.json only
after the gate confirms it green. Discipline: DIAGNOSE (name the exact per-panel fetch driver with
harness evidence) before FIX (I11). No new Director decision required; D-030 binding.

---

## 6aw. H-S6 FIX — host-TF fan-out mirror wait (D-030 step 3, b74, 2026-07-07)

**Executed by a PO-dispatched external worker; Manager-verified against the live gate.**

**Diagnosis (evidence):** on host 1m→1h, B/C/D self-fetched via
`panel-cmd-bridge.js:1895 → chart.setTimeframe() → _loadTimeframeFromServer → _fetchSmartWindow →
_fetchBarsWindow`. Root = RACE: panels received the host TF fan-out while host A was still
switching/fetching 1h, so `_multichartMirrorHostTfSwitchIfReady()` missed and each panel fell through
to its own server load.

**Fix (both trees, panel-cmd-bridge.js ~1895–1945):** for host-originated same-pair TF fan-out, panels
now wait up to 5s for the host to commit the target TF, then reuse `_multichartMirrorHostTfSwitchIfReady()`
instead of immediately calling `setTimeframe()`. **Kill-switch:** `__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT`
(default = fix ON; set = restore old self-fetch behavior).

**Manager INDEPENDENT verification — ACCEPTED:**
- Ran `npm run gate` MYSELF → exit 0, **H-S6 PASS**, known-failing now {H-S2,H-S3}, 0 regressions.
- known-failing.json correctly ratcheted (H-S6 removed from knownFailing, retained in expectedTests).
- Kill-switch causal proof (my run): `--bugswitch=__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT` → H-S6 FAIL,
  `panels that fetched=[A,B,C,D]` — confirms the fix is the cause.
- panel-cmd-bridge.js mirror hashes MATCH (97793556…1FEF). `security.yml` + `gate.mjs` no diff. Build id
  `20260707b74` in both sw.js. New kill-switch present in both trees.

**H-S6 CLOSED.** 2 confirmed defects remain: H-S3 (panel self-fetch on drag), H-S2 (host history not
mirrored to peers). Next = H-S3, same DIAG→gated-FIX→ratchet discipline.

---

## 6ax. H-S3 FIX — same-pair pan ownership decoupled from viewport sync (D-030 step 3, b75, 2026-07-07)

**Executed by a PO-dispatched external worker; Manager-verified against the live gate.**

**Diagnosis (evidence):** sync-OFF B self-fetched via
`chart.js:_fetchCandlesCursor → checkViewportLoadMore → constrainOffset/handleMouseUp + deferred
replay-pan timer`. Root: `checkViewportLoadMore()` delegated a same-pair panel's history load to host A
ONLY when VIEWPORT SYNC was ON; with sync OFF the panel fell to its own server load. Confirmed the
independent-pair path is separate (H-S5 file/27 self-fetch is correct and must stay).

**Fix (both trees, chart.js around `checkViewportLoadMore()`):** same-pair DATA ownership now routes
through tile A regardless of viewport sync; viewport sync governs viewport SHARING only.
**Kill-switch:** `__TALARIA_MC_DISABLE_SAME_PAIR_PAN_HOST_OWNER` (default = fix ON).

**Manager INDEPENDENT verification — ACCEPTED:**
- Ran `npm run gate` MYSELF → exit 0, **H-S3 PASS, H-S5 PASS**, only H-S2 known-failing, 0 regressions.
- known-failing.json ratcheted to {H-S2} only (H-S3 removed from knownFailing, kept in expectedTests).
- Kill-switch causal proof (my run): `--bugswitch=…SAME_PAIR_PAN_HOST_OWNER` → H-S3 FAIL, sync-OFF B=1
  self-fetch returns — confirms the fix is the cause.
- No `_hs3` temp instrumentation remains (grep 0). chart.js mirror hashes MATCH (D4C796B7…69BD).
  `security.yml`+`gate.mjs` no diff. Build id `20260707b75` in both sw.js. New flag present both trees.

**H-S3 CLOSED.** ONE confirmed defect remains: **H-S2** (paused-replay host history-extension not
mirrored to same-pair peers) — closely related to the ownership work just landed. Next = H-S2, same
DIAG→gated-FIX→ratchet discipline. After H-S2, the gate goes fully green (0 known-failing).

---

## 6ay. H-S2 FIX — host history-growth mirror to same-pair peers (D-030 step 3 COMPLETE, b76, 2026-07-07)

**Executed by a PO-dispatched external worker; Manager-verified against the live gate.**

**Diagnosis (evidence):** with paused replay + sync ON, host A prepended older replay history via
`_fetchCandlesCursor → checkViewportLoadMore`, but same-pair peers stayed on their pre-fetch window
because (a) the host master-growth fan-out did not recognize the harness host shape
(panelId="HOST" while `_isMultichartHostPanel()` was false), and (b) the sync-ON path used
`sync-bridge.js` lightweight panSync follow, which copied offset/zoom and returned BEFORE any host-data
left-edge mirror could run.

**Fix (both trees), gated by `__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR` (default = fix ON):**
- chart.js: host master-growth broadcaster now recognizes the host/top-window shape and falls back to
  `window.__harnessManager` when `window.__multichartGrid` is absent.
- sync-bridge.js: before the lightweight host-led pan follow returns, same-pair peers check whether host
  A has an older first bar and mirror host data if needed.
- panel-cmd-bridge.js: same-pair paused-replay entry / host-growth commands get a gated host-history
  mirror fallback — no panel self-fetch.

**Manager INDEPENDENT verification — ACCEPTED:**
- Ran `npm run gate` MYSELF → exit 0, **ALL 9 PASS, 0 known-failing** (H-S2/S3/S5/S6/S7/S8/S10/S11/S12).
  `known-failing.json` = `{}`.
- Kill-switch causal proof (my run): `--bugswitch=…HOST_HISTORY_GROWTH_MIRROR` → H-S2 FAIL,
  first bars `A=…188…, B/C/D=…308…` — confirms the fix is the cause.
- All THREE edited engine mirror pairs MATCH: chart.js (0E774391…27BE), panel-cmd-bridge.js (E166A68F…
  1BB7), sync-bridge.js (EBAE70A0…C9C2F). Harness assertions (`scenarios.mjs`/`harness-lib.mjs`),
  `gate.mjs`, `security.yml` all unchanged. Build id `20260707b76` in both sw.js.

**H-S2 CLOSED. THE GATE IS FULLY GREEN (9/9, 0 known-failing). D-030 step 3 DONE → the go-forward fix
queue is empty.** Remaining is optional Phase-3 polish (render budget, cosmetic BL-7 transient / BL-2b-r
tiny Y nudge) and the explicit backlog (BL-1/BL-2/BL-4), neither of which is a felt/blocking defect.

---

## 6az. BL-8 (D-033) — cross-panel scale coupling repro conditions pinned (2026-07-10)

**First H-S13 attempt did NOT reproduce** (b83): a PLAIN peer-panel TF switch with sync OFF leaves
C/D price scale exactly unchanged; the 3 recent kill-switches all left it green. That was a harness
FIDELITY gap, not proof of no-bug — the scenario was missing the real trigger conditions.

**PO-confirmed real repro conditions (from live b82 + screenshot):**
- Backtest **replay ACTIVE but PAUSED**.
- **No** indicators.
- Peer panel (top-right, an iframe) switched to a **HIGHER** TF (e.g. 5m→4h/1h).
- All sync toggles OFF.

**Read:** this is the REPLAY-BUS price-coupling family (old BL-2b). The relevant guard is the existing
`__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE`; it likely does not cover this specific trigger (a peer
panel's TF-up switch fanning a replay-mirror frame that C/D adopt price-state from). H-S13 must be
REVISED to enter paused replay + higher-TF peer switch, reproduce RED, then diagnose the exact
price-mutation sink before a gated fix.

### D-034 refinements (Director ruling, binding) + Manager tree-verification
- **Kill-switch exclusion is VOID** until revised H-S13 reproduces — the earlier "3 flags left it green"
  observed under the non-reproducing scenario excludes nothing. Re-run triage under the true trigger;
  add `__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE` to the flags tested.
- **H-S13 contract (pinned):** replay ENTERED and PAUSED (armed-and-paused, not merely armed at boot);
  a PEER iframe (not the host) switches to a HIGHER TF; all sync OFF; assertion = C/D price-scale state
  STRICTLY unchanged (priceZoom, priceOffset, autoScale, rendered Y domain), sampled at a settled point
  via the 4.2b determinism pattern; RED must be STABLE across TWO independent 5-run sessions before any
  diagnosis is drawn.
- **Name the sink by machine:** enable the `[BL2B_PRICE]` probe inside the H-S13 run.
  **Manager-verified: the probe is STILL PRESENT** (`__talariaBl2bSnap`/`__talariaBl2bLog` in chart.js,
  replay-system.js, sync-bridge.js, panel-cmd-bridge.js, both trees) — no re-install needed; set
  `window.__TALARIA_BL2B_PRICE_PROBE=true` in ALL panel iframe contexts (not just host).
- **Static lead (PRIOR, not conclusion):** `panel-cmd-bridge.js:1397 markHostReplayContext(ch)` sets
  `ch._mcHostReplayContextUntil = Date.now()+2000` (Manager-confirmed). Frames originating from a peer's
  TF switch may never get marked → either path reaches `syncReplayViewportToPlayhead`'s price reset
  unguarded. The probe capture decides which sink fires first.

---

## 6ba. BL-8 FIX — paused-replay aligned-seek guard (D-033/D-034, b84, 2026-07-10)

**Executed by a PO-dispatched external worker; Manager-verified.**

**Repro (revised H-S13, now deterministic RED without the guard):** same-pair 4-panel, all sync OFF,
replay armed-AND-paused, C/D parked at independent paused-replay views, peer iframe B switches 5m→4h,
then the paused replay bus emits a `replayTick`. C/D Y-domain shifted (C `[0.9289,0.9482]→[0.9477,0.9628]`,
D `[0.9399,0.9522]→[0.9468,0.9568]`).

**Diagnosis:** flag triage under the reproducing scenario — `PANEL_PRICE_INDEPENDENCE`,
`HOST_HISTORY_GROWTH_MIRROR`, `HOST_TF_MIRROR_WAIT` all still FAIL; `SAME_PAIR_PAN_HOST_OWNER` → PASS,
implicating the same-pair host-owner replay/pan path. Driver: `panel-cmd-bridge.js:2661 replayTick →
:1475 scheduleCoalescedSeek` re-centered untouched C/D → Y-domain refit (host-owner path tied to
`chart.js:21734 checkViewportLoadMore`, gated ~:21761).

**Fix (both trees, panel-cmd-bridge.js), gated `__TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD`
(default = fix ON):** `shouldSkipPausedAlignedReplaySeek()` no-ops a SAME-timestamp paused `replayTick`
when the iframe panel is already replay-aligned, replay is paused, visible/time sync is off, and parent
is not playing. Real scrubs/steps (changed timestamps) still seek.

**Manager INDEPENDENT verification — ACCEPTED:**
- `npm run test:flake` (5 runs): ALL 10 PASS incl H-S13 — stable green.
- Kill-switch-off (`--bugswitch=…PAUSED_REPLAY_ALIGNED_SEEK_GUARD`) run ×2: H-S13 stable RED, identical
  C/D Y-domain shift — deterministic causal proof.
- panel-cmd-bridge.js mirror pair MATCH (6A6480BA…EB0A). Guard flag in both trees. `security.yml`+
  `gate.mjs` untouched. Build id `20260707b84` in both sw.js. S2/S3/S5/S6/S7/S8 all still green.

**BL-8 CLOSED in the harness.** Gate: 10/10 green, 0 known-failing. PENDING: PO live re-test on deployed
b84 to confirm the real-world symptom (C/D rescale on peer TF-up during paused replay) is gone.

**PO LIVE CONFIRMED (b84):** on 2026-07-10 the PO verified on the deployed build that C/D no longer
rescale on peer TF-up during paused replay. BL-8 fully closed live. H-S13 remains the permanent regression
guard.

---

## 6bb. BL-9 — panel pan-to-load-history STALLS until a click (paused replay)

**PO report (2026-07-10, screenshot):** on a same-pair 2×2 layout with **backtest replay ACTIVE but
PAUSED**, dragging a **panel** (B/C/D, NOT the host) backward to load older history fills **a few candles
then stalls** — the left gap stays empty until the PO **clicks** the chart, which unsticks it. All sync OFF.

**Static root-cause lead (chart.js).** Panel backward pan does not self-fetch — it delegates to the host
via `_delegateSamePairPanLoadToHost()` (chart.js:3441) and mirrors the host's growing master through the
self-continuing poll `_scheduleMultichartHostMasterSyncPoll()` (chart.js:3462). That poll only re-arms its
rAF while `stillPan || hostBusy` (chart.js:~3476). Failure sequence:
1. Panel drag drives ONE host batch (2000–5000 bars); panel mirrors it → the "few candles."
2. The **host's own viewport never moved** (only the panel panned), so the host has no reason to keep
   loading further back; its `.finally` rAF re-check (chart.js:~22368) sees no host-side left gap.
3. When the gesture ends, `stillPan` → false and host is idle → **the panel poll stops** even though the
   PANEL's viewport still has an uncovered left gap and more history is available.
4. Only a discrete interaction re-drives it: a click force-fires `checkViewportLoadMore('backward', true)`
   (chart.js:20900 / 21473) + `render()`, pulling the next host batch → "stuck until click."

The delegate path is the analogue of the direct-fetch `.finally` self-continue (chart.js:22368-22381),
but it terminates on gesture-end rather than on gap-coverage.

**Proposed fix (gated `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE`, default = fix ON):** extend the
poll continue-condition so a delegating same-pair panel keeps driving the host delegate + mirror while ITS
OWN viewport left gap persists AND history remains (host `hasMoreLeft` or host master does not yet cover
the panel's needed left edge), independent of `stillPan`. Terminate on gap-covered or no-more-history.
Must not spin when host has exhausted history, and must not fire per-tile /bars (delegate only).

**Harness scenario H-S14 (to build, RED-first):** boot same-pair 2×2, enter paused replay on all, snapshot
panel B viewport left-edge coverage, drag B backward far enough to need >1 host batch, let the gesture END
with NO click, wait for settle, assert B's left gap is covered (or `hasMoreLeft` exhausted). Under the fix
OFF (kill-switch) the gap must persist (deterministic RED). Add to gate as the permanent BL-9 guard.

**SCOPE BROADENED (PO 2026-07-10): BL-9 also affects INDEPENDENT (non-host / new-pair) panels.** PO
confirms the SAME symptom (stall-until-click, paused replay, panel-only; host fine) on a panel showing a
pair DIFFERENT from the host — i.e. the self-fetch path, not just the same-pair delegate path. Shared root
cause: the panel's post-gesture load-more re-check dies when the drag/inertia ends during paused replay.
- Same-pair panel: `_scheduleMultichartHostMasterSyncPoll` stops on `!stillPan && !hostBusy` (chart.js:~3476).
- Independent panel: the self-fetch `.finally` rAF re-check (chart.js:~22368) fires once, but the post-
  prepend offsetX anchoring (chart.js:~22191) moves the viewport off `constrainOffset`'s near-left-edge
  threshold (chart.js:~17710), so the chain does not continue; no persistent post-gesture loop covers the
  remaining left gap. A click re-drives it (chart.js:20900/21473).
The fix must cover BOTH panel paths under the SAME kill-switch `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE`:
after a pan gesture ends on any panel in paused replay, keep driving backward load-more (delegate for
same-pair, self-fetch for independent) while the PANEL's own viewport left gap persists AND history remains,
terminating on gap-covered or no-more-history. Add a companion harness scenario **H-S15** (independent /
new-pair panel, paused replay, drag-back-needs->1-batch, no click → gap persists = RED) so both variants are
gated. Host pan-back must remain unchanged (already correct).

**RESOLUTION (2026-07-10, verified in-harness, build 20260707b85):**
- **Same-pair delegate path — FIXED & CAUSALLY PROVEN.** `_scheduleMultichartHostMasterSyncPoll()` (chart.js,
  both trees) now keeps driving the host delegate + local mirror after the gesture ends while the panel's own
  viewport left gap persists AND history remains, via new helpers `_mcPanelPanHistoryContinueEnabled()` +
  `_panelPanHistoryGapNeedsHostMore(host)` (terminates on gap-covered / host-exhausted-and-fully-mirrored — no
  spin, no per-tile /bars). Kill-switch `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE` (default = fix ON).
  H-S14: PASS with fix (B left gap covered, `needsMoreLeft=false`); RED under the kill-switch
  (`needsMoreLeft=true`, `gapOnLeft=true`, leftIdx=-1123) — deterministic causal proof.
- **Independent / new-pair path — COULD NOT REPRODUCE A RED.** H-S15 (independent B on file27, paused replay,
  DEEP 5-stroke backward drag needing multiple batches, gesture ends with NO click) is GREEN on the engine
  WITH and WITHOUT the kill-switch: B self-continues across 3 sequential batches
  (`masterFirstT` 1783555500000→1782655500000) and covers its own left gap (`needsMoreLeft=false`). The
  independent self-fetch continuation (`checkViewportLoadMore` `.finally` → rAF `constrainOffset` →
  `_scheduleReplayPanLoadLeft`) is robust; the kill-switch only gates the same-pair delegate poll. Per I11
  (no fix without a reproducing RED) NO speculative independent fix was landed — that would risk a fetch-spin
  regression. H-S15 is kept as a permanent POSITIVE guard that the independent pan-back continuation never
  regresses. If the PO still observes an independent stall on b85, the likely cause is per-batch network
  latency (slow-but-completing) rather than a true stall; capture live Network-tab timing to build a faithful
  repro before any independent-path change.
- **Gate: 12/12 GREEN, 0 known-failing** (H-S2/S3/S5/S6/S7/S8/S10/S11/S12/S13/S14/S15). Both engine trees +
  harness files hash-MATCH. All sw.js + HTML build ids = `20260707b85`. `security.yml` + `gate.mjs` untouched.
  `node --check` passes on both chart.js and scenarios.mjs. PENDING: PO live re-test on deployed b85 (same-pair
  stall gone; independent panel behaviour observed with Network timing if still perceived slow).

### 6bb.1 — BL-9 FOLLOW-UP: b85 pan-history continuation storms backward fetches ON PLAY (regression) — FIXED (b86)

**PO report (2026-07-10, on b85):** "all good but it's broke and refetches the data over after I click play on
replay." The BL-9 same-pair pan-back stall is gone, but pressing PLAY now triggers a backward-history refetch
storm / visible break.

**Root cause:** the b85 continuation predicate `_panelPanHistoryGapNeedsHostMore(host)` (chart.js) had **no
playback guard**. During active playback the playhead advances forward every tick, so `_needsReplayHistoryLoadLeft()`
can stay true frame after frame. `_scheduleMultichartHostMasterSyncPoll`'s continuation branch then re-fired
`host.checkViewportLoadMore('backward', true)` on every rAF, colliding with playback's forward prefetch → the
"refetch over / break on play" the PO hit. The BL-9 continuation was only ever meant for the PAUSED manual-pan
case.

**Fix (b86):** at the top of `_panelPanHistoryGapNeedsHostMore`, return `false` when replay is actively PLAYING
(this panel's `replaySystem.isPlaying`, the host's, or `window.chart`'s). Makes the continuation strictly
paused-only; playback is untouched. Applied byte-identically to both engine trees (chart.js hash
`63766BD45EA3F729A8A48741FFF9902F0F08689068C212466F1A1DBCC7C0AA98`). No new kill-switch (behaviour is a narrowing
of the existing `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE` scope).

**Verification.** Paused BL-9 fix intact: H-S14/H-S15 still PASS with the guard; full gate GREEN.
Build ids bumped to `20260707b86`. PENDING: PO live re-test on b86.

**Permanent gate guard — H-S16 (landed per D-035 ruling #1, with a documented deviation).**
- **Deviation from the literal ruling:** the ruling directed *deepening the synthetic backward history* so a
  play-storm reaches a wide fetch-count margin. On implementation this was found to be the wrong lever: the
  engine clamps minimum `candleWidth` (~0.2), which caps a panel's exposed left gap at ~1.5 host batches, so an
  end-to-end play-storm self-limits to ~1–2 fetches **regardless of server history depth** (verified: 90d and
  180d both produced backward=2 with AND without the guard — a vacuous, non-causal fetch-count assertion). The
  synthetic history was temporarily raised to 180d, confirmed not to move the margin, and **reverted to 90d**
  (kept the gate fast; no scenario needs the extra depth).
- **What landed instead (robust + causal):** H-S16 asserts the guard's exact CONTRACT on panel B, viewport-
  IDENTICAL, toggling only `replaySystem.isPlaying`. With an uncovered left gap + history remaining:
  `_panelPanHistoryGapNeedsHostMore(host)` must be `true` while PAUSED and `false` while PLAYING. This is binary,
  deterministic, and independent of gap/history size. Causal A/B (temporary guard removal during the proof):
  guard ⇒ `{paused:true, playing:false}` PASS; no-guard ⇒ `{paused:true, playing:true}` RED. Gate now **13/13
  GREEN, 0 known-failing**; both engine trees hash-match (`63766BD4…`, unchanged — engine not touched, no build
  bump); `security.yml` + `gate.mjs` untouched.

**STATE-MATRIX (per D-035 new rule) — playback guard on `_panelPanHistoryGapNeedsHostMore` / the BL-9 continuation.**
The guard only affects whether the same-pair pan-history continuation keeps driving the host delegate + local
mirror after a gesture. Rows = replay state; the behaviour is identical across sync-on/sync-off (the continuation
never consults sync flags) and is only reachable for **same-pair delegating** panels (independent panels use the
self-fetch path, H-S15; the host itself never delegates to itself).

| Replay state | same-pair panel, uncovered left gap + history remains | same-pair, gap covered / history exhausted | independent panel | host (A) |
|---|---|---|---|---|
| **Paused** | continuation ACTIVE (drives delegate+mirror to cover gap) — BL-9 fix, unchanged by this guard | terminates (returns false) — unchanged | unaffected (self-fetch path) | unaffected |
| **Playing** | **continuation SUPPRESSED (returns false)** — THE FIX; was the storm | already false — unchanged | unaffected | unaffected |
| **Idle (no replay)** | predicate returns false early (no `replaySystem`/not active) — unchanged | false — unchanged | unaffected | unaffected |

Only ONE cell changes vs b85: (same-pair, uncovered gap, **Playing**) flips from "active → storm" to "suppressed".
Every other cell is provably unchanged. TF-relation (same/coarser/finer) does not enter this predicate — it keys
off viewport left-gap coverage + host history availability + isPlaying only — so no TF-relation cell is affected.
This is the "missing complement" check the rule requires: the b85 continuation added a paused behaviour and
missed its Playing complement; this guard supplies exactly that complement and nothing else.

## 6cc. BL-10 — coarser same-pair panel frozen during PLAY ("host runs alone") (D-037, b87)

**Symptom (PO live, b86).** With all panels on the SAME pair and all sync OFF: when every panel shares the
host's timeframe, replay play runs perfectly; but if one panel is switched to a DIFFERENT (coarser) timeframe
and the user clicks play, only the host advances — the coarser panel freezes ("the host run alone"). Violates
the shared-playhead invariant (all same-pair panels must show the same moment in time).

**Static lead (confirmed against the RED run — the harness is the live capture, I10/I11 by machine as with H-S13).**
During PLAY, iframe panels ignore `replayTick` and mirror `replayFrame` (`panel-cmd-bridge.js:2677`). In
`applyReplayFrame`, the different-TF same-pair branch (`panel-cmd-bridge.js:675-684`) seeks **only** when
`_multichartFinerSamePairPanelSelfOwns()` is true (FINER-only self-owner, `chart.js:3095-3116`). A COARSER
same-pair panel is neither a finer self-owner nor same-TF, so it falls straight to the unconditional `return`
with **no play-advance cell** → its `replaySystem.replayTimestamp` never moves. Case #9 of the replay-mirror-frame
family (F, G, I, J, BL-5, BL-6, BL-8, BL-9-play, BL-10): the coarser column simply had no play cell.

**RED-first — H-S17** (same-pair 2×2, all sync OFF, host 1m, panel B → 1h coarser; enter paused replay, then
stream REAL play fan-out `replayFrame {isPlaying:true}` 1m/frame ×180 = 3h). RED, flake-stable (deterministic):
B.replayTs frozen at `ts0`, forming candle (lastBarT) frozen, **renders during play = 0** (B does literally
nothing — the `return`). Setup guard confirms B is genuinely coarser (1h) with replay active before the play.

**Fix (b87).** In the different-TF branch, add a PLAY-only `else if` for the non-finer (coarser) case, gated by
the new kill-switch `__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE` (default fix ON):

```js
} else if (args.isPlaying && !window.__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE) {
    scheduleCoalescedSeek(ch, ts);   // advance coarse panel playhead + forming candle on its OWN master
}
```

`scheduleCoalescedSeek` is the correct, anti-BL-5 tool by construction: it is **rAF-coalesced** (one seek per
frame, newest ts wins — the coarse panel repaints at its own cadence, never per-1m-tick), and it already routes
through the **BL-5 coarse-host-switch guard** `shouldSkipCoarsePanelHostSwitchSeek` (which is PAUSED-only —
`panel-cmd-bridge.js:1367-1368` returns false while playing, so it does NOT re-freeze here) and the **BL-8
paused-aligned guard**. Applied byte-identically to both engine trees (`panel-cmd-bridge.js` hash
`D903EB00031E8077CE02007C1EB4B2BFA0381BB82030F2D12601507947C3335B`).

**D-037 constraint #1 (no BL-5 resurrection) — measured.** Over 180 host 1m frames the 1h panel repaints
**4 times** (renders during play = 4, flake-stable across 3 runs), decisively under the H-S17 assertion bound of
≤60 and nowhere near the ~180 a per-1m-tick full reslice would produce. There is no per-tick resample of the
full series; the coalesced seek collapses each burst of frames into a single own-cadence repaint.

**Verification.**
- H-S17 GREEN under fix, flake-stable ×3 (identical: B.replayTs→`…8080000`, forming candle→`…5200000`,
  renders=4). Playhead tracked host to within one 1h bucket; forming candle advanced 2 whole 1h candles.
- H-S17 RED under `--bugswitch=__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE` ×2 (frozen, renders=0) — causal.
- Full gate **14/14 GREEN, 0 known-failing** (H-S17 added to `expectedTests`). Both trees hash-match. Build ids
  bumped to `20260707b87`. `gate.mjs`/`security.yml` untouched.
- Adjacent cells confirmed unchanged: **H-S13** (paused-replay coarse peer TF-up; C/D price scales unchanged)
  PASS; **H-S8** (same-pair play) PASS.

**STATE-MATRIX (D-035 rule) — coarse-panel PLAY-advance in `applyReplayFrame`, with the two required cells called
out.** The change is a single `else if` reached ONLY when: same-pair, panel TF ≠ host TF, panel is NOT a finer
self-owner (⇒ coarser), AND `args.isPlaying`. Everything else is structurally untouched.

| Panel relationship | Paused (or scrub) | **Playing** | Idle (no replay) |
|---|---|---|---|
| **Coarser same-pair** | unchanged — this branch returns without seeking; paused scrubs take the `replayTick` path + its **BL-5 `shouldSkipCoarsePanelHostSwitchSeek` guard** (PAUSED-only), which stays in force. **[CALLED-OUT CELL #1]** | **THE FIX — advance playhead + forming candle via coalesced seek (renders=4/180 frames, no per-tick reslice)** | predicate never reached (branch requires active replay frame) — unchanged |
| **Finer same-pair (self-owner)** | unchanged (`forceReplaySeek` in the `if` branch) | unchanged — still the `if` branch's `forceReplaySeek`; the new `else if` is only entered when the finer `if` is false, so the finer path is byte-for-byte identical. **[CALLED-OUT CELL #2]** | unchanged |
| **Same-TF same-pair** | unchanged (does not enter the different-TF branch at all) | unchanged | unchanged |
| **Independent (other pair)** | unchanged (own replay master) | unchanged | unchanged |

Exactly ONE cell changes vs b86: (coarser same-pair, **Playing**) flips from "frozen `return`" to "coalesced
play-advance". The paused-coarse cell (#1) is preserved by two independent mechanisms — the new branch is gated
on `args.isPlaying`, AND the coalesced-seek path retains the PAUSED-only BL-5 guard — so a paused coarse panel
still cannot reslice (BL-5/BL-6 intact). The finer cell (#2) is untouched because the addition is an `else if`
of the existing finer `if`. This is the "missing complement" the rule targets: the scattered branch had a finer
play cell but no coarser play cell; this supplies exactly that one cell and nothing else.

**PENDING:** PO live re-test on deployed b87 — with all sync off, set one panel to a coarser TF and click play;
the coarse panel must advance in lock-step with the host (playhead + forming candle) and stay smooth (no reslice
flicker); same-TF play and paused/scrub behaviour unchanged.

## 6cd. BL-11 — panels don't auto-follow the play-time viewport ("playhead marches off the right edge") (D-038, b88)

**Symptom.** During replay PLAY, iframe panels B/C/D DO advance (bars form/play) but their TIME viewport does
NOT auto-follow the playhead: the playhead marches off the right edge and the user must manually drag to keep up.
Host tile A auto-follows correctly. Contract wanted: give panels the SAME play-time forward viewport follow the
host uses.

**RED-first repro (H-S18, flake-stable ×3 then kill-switch ×2).** Same-pair 2×2, all sync OFF, host 1m. Enter
paused replay, switch panel C to **5m (coarser)** while B/D stay 1m (same-TF); stream REAL play fan-out
(`replayFrame {isPlaying:true}`, 1m/frame) with the host advancing + auto-following. Measured "tracks the leading
edge" as: playhead (last data bar) inside the visible bar window AND `offsetX` within ≤3 candle-spacings of the
leading-edge target (`getReplayAutoScrollState().offsetX`).
- **Coarser panel C = RED** (localized): `playheadVisible=false`, `offsetToTarget≈315–329px` (≈8–10 bars past the
  right edge), frozen `offsetX≈-693..-721` while target marched to `-1029`. Flake-stable ×3 (322 / 329 / 322).
- **Same-TF panels B/D = already GREEN**: `offsetToTarget=0`. They follow via the same-TF mirror path
  (`forceSamePairParentDataMirror`, which already right-anchors during play). So the defect is the **coarser** cell.
- Host A reference GREEN throughout (`playheadVisible=true`).
This **localizes BL-11 to BL-10's coalesced path**: the coarser play-advance branch added for BL-10/D-037
(`applyReplayFrame` `else if (args.isPlaying)` → `scheduleCoalescedSeek`) advances the panel's bars but leaves the
viewport frozen.

**Confirmed static lead.** `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js`:
- Coarser same-pair PLAY branch `applyReplayFrame` (~:697) → `scheduleCoalescedSeek` (~:1492). The mirror exits
  (`applyParentReplayMirror`/`applyStaticMirrorFrame`) reject a coarse panel over a 1m host, so it advances via
  `forceReplaySeek` (~:1606) → `goToReplayTimestamp({preserveVisibleWindow:false})`.
- The re-anchor is then blocked by the ACCUMULATED-DRIFT heuristic in `replay-system.js`
  `_replayUserOwnsViewport` (~:2749), which `syncReplayViewportToPlayhead` (~:2841) consults: because the frozen
  offset already differs from the leading edge by ≫ `spacing*0.2`, the engine concludes "the user owns the
  viewport" and refuses to follow (also short-circuited by the fresh TF-switch anchor lock). The host never drifts
  (it follows every frame) so it never trips this heuristic — hence "host runs alone". Host follow lands at
  `syncReplayViewportToPlayhead` offsetX (`replay-system.js:2855`).

**The fix + kill-switch.** New `maybePanelPlayViewportFollow(ch)` in `panel-cmd-bridge.js`, invoked on all three
`scheduleCoalescedSeek` exit paths (`applyParentReplayMirror`, `applyStaticMirrorFrame`, and the `forceReplaySeek`
completion callback). It calls `rs.syncReplayViewportToPlayhead(ch, { forceRecenter:true, resetPriceScale:false,
render:true })`. Constraints honored exactly:
- **PLAY-ONLY** — gated on `isParentReplayPlaying() || pendingPlayDesired===true || _multichartPassivePlayActive`
  (the same play signal BL-10 keys off). Paused/scrub clears these ⇒ the window-preserving path is untouched
  (no BL-2b pause/scrub re-fit / snap-back).
- **X/TIME ONLY** — `resetPriceScale:false` preserves BL-2b price-axis independence (the price axis is never touched).
- **LEADING-EDGE DISENGAGE** — we skip when `userHasPanned || autoScrollEnabled===false` (the REAL user-intent
  signals), so we never fight the user's drag or BL-6 recenter. Only *because* we've proven the user did not move
  the panel do we pass `forceRecenter:true` — needed to defeat the bug-induced-drift `_replayUserOwnsViewport`
  false-positive and the TF-switch anchor lock. This matches the host's leading-edge follow contract exactly.
- Kill-switch `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` (default = fix ON; set = today's RED).

**Does the fix touch BL-10's path?** YES — deliberately. It augments the exact coalesced-seek coarse play-advance
path D-037 landed; that path now advances the playhead/forming candle (BL-10) AND carries the viewport forward
(BL-11). The same-TF mirror path (`forceSamePairParentDataMirror`) is untouched (it already followed). BL-10's
own PAUSED-only guards (`shouldSkipCoarsePanelHostSwitchSeek`, BL-8 aligned guard) are unchanged and still gate
paused/scrub.

**Verification numbers.**
- H-S18 **GREEN under fix ×2** (C `offsetToTarget=0`, `playheadVisible=true`, synced every frame).
- H-S18 **RED under `--bugswitch=__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` ×2** (C `offsetToTarget≈308–315`,
  `playheadVisible=false`) — causal.
- Full gate **15/15 GREEN, 0 known-failing** (H-S18 added to `expectedTests`). Both `panel-cmd-bridge.js` trees
  hash-match `07B736F5E1C19609A975AD14D8668F16F27B62C88F5B1664AC2AD0B3B5EBB038`. `chart.js` untouched. Build id
  bumped to `20260707b88`. `gate.mjs`/`security.yml` untouched.
- Adjacent cells confirmed unchanged: **H-S13** (paused-replay peer TF-up; C/D price scales unchanged) PASS;
  **H-S8** (same-pair play) PASS.

**STATE-MATRIX (D-035 rule).** X/time viewport follow during replay, with the four required cells called out.

| Cell | State | Behavior |
|---|---|---|
| **Paused-panel [CALLED-OUT]** | follow **OFF, preserved** | `maybePanelPlayViewportFollow` returns early (play-only gate false); the window-preserving `applyStaticMirrorFrame`/`applyParentReplayMirror` path is byte-for-byte unchanged; BL-2b pause/scrub no-re-fit and BL-5/BL-6 paused guards all intact. |
| **Host (tile A) [CALLED-OUT]** | unchanged | The host is not an iframe panel; it never enters `panel-cmd-bridge.js`. Its follow (`getReplayAutoScrollState`→`syncReplayViewportToPlayhead`, `replay-system.js:2855`) is the contract we copy, not modify. |
| **Drag-disengage parity [CALLED-OUT]** | follow **OFF for that panel until it returns to the edge** | A mid-play user drag sets `userHasPanned` (H-S18 measured `userHasPanned=true`, `offsetToTarget≈2494`); the follow skips on that signal, so after continued play the panel viewport does **NOT** snap back (measured `offsetX` identical before/after resume, `-6601.598`). No fighting the user — copies the host's `_replayUserOwnsViewport` opt-out contract. |
| **B-FIX-C interaction [CALLED-OUT]** | left-prepend compensation effectively **SKIPPED (no double-shift)** | Auto-scroll engaged is the gate: the play follow recomputes `offsetX` **absolutely** from the leading edge, which OVERRIDES B-FIX-C's *relative* `-addedDisplayBars*spacing` prepend shift. Measured on follow-active panel D after a host backward history load (left-prepend) mid-play: `offsetToTarget=0`, `playheadVisible=true` ⇒ **no double-shift**. This closes the BL-6/BL-9-play "missing complement" class: auto-scroll state is precisely the gate on whether B-FIX-C compensation applies. |
| Coarser same-pair, **Playing** | **THE FIX** | advances playhead + forming candle (BL-10) AND follows the leading-edge viewport (BL-11); `offsetToTarget→0`. |
| Same-TF same-pair, Playing | unchanged | already followed via `forceSamePairParentDataMirror`; measured `offsetToTarget=0` with and without the fix. |
| Independent (other pair), Playing | unchanged | own replay master + own follow path; not routed through the coarse coalesced-seek branch. |

**PENDING:** PO live re-test on deployed b88 — all sync off, set one panel to a coarser TF and click play; the
coarse panel's viewport must follow the playhead in lock-step with the host (no marching off the right edge),
paused/scrub and price-axis independence unchanged, and a mid-play drag must stay put (no snap-back).

## 6ce. BL-12 — play-time viewport follow is laggy on drag / renders per host frame (D-039, b90)

**SYMPTOM (PO live, b89).** Dragging a chart during replay PLAY is laggy, whereas dragging while replay is
STOPPED/paused is instant/smooth. Root suspicion (D-039): the BL-11 follow
(`maybePanelPlayViewportFollow` → `syncReplayViewportToPlayhead({forceRecenter:true, resetPriceScale:false,
render:true})`, `panel-cmd-bridge.js`) does a full recenter+**render on every host play-frame** for a panel
routed through `scheduleCoalescedSeek` (the coarser same-pair play-advance path), even when (a) the panel is
being actively dragged and (b) the playhead advanced only within the same pixel column (a sub-candle-width
viewport move). Self-introduced by BL-11, so it gets its OWN new kill-switch so cost and correctness revert
independently of BL-11.

**REPRO — H-S19 (RED-first, deterministic COUNTERS only; NO wall-clock — D-039 anti-flake).** Same-pair 2x2,
all sync OFF, host 1m, panels B/C set to 5m (coarse — the only path that reaches `maybePanelPlayViewportFollow`;
same-TF panels follow via `forceSamePairParentDataMirror` and never enter this branch). Real PLAY fan-out
(`replayFrame {isPlaying:true}`, 1m/frame, N=120). Renders are read from `ch._mcDiag.renders`. The BL-11
follow's render cost is isolated as a **follow-attributable delta** = renders(follow ON) − renders(follow OFF)
measured with identical pacing, so the coarse BL-10 reslice baseline (which BL-12 does NOT touch) cancels out.

**CONFIRMED ATTRIBUTION (kill-switch A/B on `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW`).** On the idle
coarse panel over N=120 play-frames: follow ON = **724** renders, follow OFF = **600** → the BL-11 follow adds
**124 ≈ N** renders (~1:1 per host frame). Toggling the BL-11 flag removes exactly that excess → the BL-11
follow is the cost source. Flake-stable: idleFollowCost measured **124 / 124 / 124** across runs (RED) and
**28 / 28** (GREEN).

**SURPRISE (flagged, not silently scoped away).** A pan **or** wheel-zoom during replay already calls
`replaySystem.onUserPan()` (`chart.js:24940`, :30368, …) which sets `userHasPanned=true`, so the follow is
**already semantically disengaged during the gesture** — measured `dragFollowCost ≈ 0` in BOTH RED and GREEN
(`playDrag − playDragFollowOff` = +10 / −25). Therefore the measurable per-frame render regression is the
**IDLE** panel (fixed by coalescing, part b); the drag-suspend (part a) is a ratified structural guard (the
follow must never fight the drag / BL-6 recenter, and also covers wheel/axis-zoom where the same
`userHasPanned` path applies). The raw play-drag total (≈1071) vs paused-drag (≈260) is ~4× but that gap is
the BL-10 coarse reslice, **out of BL-12 scope** — H-S19 does NOT gate on it (reported only).

**FIX — two parts, ONE new kill-switch `__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` (default = fix ON; setting
it restores today's laggy per-frame behaviour).** Both scoped to the BL-11 follow only, in
`maybePanelPlayViewportFollow`:
- **(a) SUSPEND** the follow entirely for a panel during ACTIVE user interaction —
  `rs._isUserInteractingWithChart(ch)` (drag/pan/box-zoom/wheel/axis). Skips the per-frame invocation so it can
  never fight the user's drag or the BL-6 recenter.
- **(b) COALESCE** the idle-panel render — compute the leading-edge target (`getReplayAutoScrollState().offsetX`,
  the same value `syncReplayViewportToPlayhead` uses) and skip the recenter+render when
  `|target − offsetX| < candleWidth`. A sub-candle-width playhead advance costs **ZERO** renders; the panel
  renders only when the edge actually moves ≥1 candle.

Constraints (ratified, all verified): BL-11 stays GREEN (H-S18 PASS); PLAY-ONLY; X/TIME-ONLY
(`resetPriceScale:false`, BL-2b intact); does not fight the user's drag or the BL-6 recenter. `chart.js` NOT
touched (reuses existing `rs._isUserInteractingWithChart` + `getReplayAutoScrollState`). Applied
**byte-identically** to both trees — `(Get-FileHash …).Hash` matches:
`0D47FE7681849A1720FC87A7500075C02A807BA256747EE9387A63E479871A83` for
`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` and
`homepage/public/chart/multichart-prod/panel-cmd-bridge.js`. `node --check` clean on both.

**VERIFICATION.** H-S19 GREEN under fix (idleFollowCost=28 ≤ 60, flake-stable 28/28) and RED under
`--bugswitch=__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` (idleFollowCost=124 > 60, flake-stable 124/124). H-S18
(BL-11) still GREEN; H-S8 (host play), H-S13 (paused), H-S17 (BL-10 coarse play) still GREEN. Full `npm run
gate` GREEN — 16 scenarios, H-S19 added to `expectedTests` (NOT knownFailing), 0 known-failing tracked. Build
bumped **b89 → 20260707b90** (uniform `SW_VERSION` + `__TALARIA_CHART_BUILD_ID` across dist-v9/live/legacy/embed
in both trees).

**STATE-MATRIX (D-035 rule, with the D-039 COST COLUMN — renders per N=120 play-frames; follow-attributable =
renders(follow ON) − renders(follow OFF)).** Cells called out per D-039: the dragging-panel cell and the
not-dragging (idle) cell, plus the paused reference and host.

| Cell | State | COST (renders / 120 play-frames) — RED (`…COST_GUARD` on) vs GREEN (fix) | Behavior |
|---|---|---|---|
| **Idle panel (not dragged) [CALLED-OUT]** | follow **coalesced** | follow-attributable **RED ≈124 (~1:1 with N)** → **GREEN ≈28 (~1/formed-candle, N/5)**; raw follow-on 724→628 vs 600 baseline | Renders only when the leading edge moves ≥1 candle-width; sub-candle playhead advance = ZERO renders. THE FIX (part b). |
| **Dragging panel [CALLED-OUT]** | follow **SUSPENDED during interaction** | follow-attributable **≈0 in BOTH** (dragFollowCost +10 / −25); raw play-drag ≈1071 (BL-10 reslice, out of scope) | `_isUserInteractingWithChart` gate skips the per-frame follow invocation; already disengaged via `userHasPanned`, now structural (part a). Never fights the drag. |
| **Paused-drag reference [CALLED-OUT]** | replay STOPPED — no follow | reference ≈260–377 renders (drag-only cost; zero follow renders) | The Director's relative bound: play-drag follow cost must stay bounded to this (it does — follow-attributable ≈0). |
| **Host (tile A)** | unchanged | n/a (not an iframe panel) | Same-TF host follows via the replay engine's own auto-scroll; never enters `panel-cmd-bridge.js`. |
| Same-TF same-pair panel, Playing | unchanged | n/a for this path | Follows via `forceSamePairParentDataMirror`; not routed through `maybePanelPlayViewportFollow`. |

**PENDING:** PO live re-test on deployed b90 — all sync off, coarser panel + play: dragging the chart during
play must be as smooth as dragging while stopped; a not-dragged coarse panel must still follow the playhead
(no marching off-screen), paused/scrub and price-axis independence unchanged.

## 6cf. BL-13 — play-follow smoothness: continuous sub-candle leading-edge follow (D-040 → D-041, b91)

**DEFECT (BL-13 / D-040).** After BL-12/D-039 the not-dragged coarse panel followed the
playhead but its follow render was **coalesced at one CANDLE-WIDTH**, so on a zoomed-in
coarse panel the viewport sat frozen for a whole forming candle then **JUMPED one
`candleSpacing`** ("stuck then jumps group-by-group") — chunky, not host-parity smooth.
D-040 asked to change the coalesce unit from one candle-width to **~1 device pixel**.

**PREMISE CORRECTION → D-041 (accepted).** The threshold swap alone was a **verified
no-op**. The BL-11 follow target is `replay-system.js:getReplayAutoScrollState` →
`offsetX = -scrollPosition · candleSpacing`, and `scrollPosition` is derived from
`data.length` — i.e. the target is **BAR-QUANTIZED**: it only moves when a whole candle
forms. Comparing that discrete target against the current offset in device pixels vs
candle-width changes nothing — the target itself never moves sub-candle, so H-S19b stayed
RED (`followRenders ≈ candlesCrossed ≪ pixelColumnsCrossed`) regardless of the threshold
unit. Director **D-041, Option A**: implement a genuine **continuous sub-candle
leading-edge follow** under the SAME flag `__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD`.

**MECHANISM (D-041, `panel-cmd-bridge.js:maybePanelPlayViewportFollow` + new
`_panelPlayFollowContinuousOffsetX`; `chart.js` untouched).** During PLAY, ease the
bar-quantized leading edge forward by the forming candle's fractional progress, derived
**purely from the SHARED PLAYHEAD TIMESTAMP** (never `Date.now()` / rAF / animation-tick):

```
fraction          = clamp01( (rs.replayTimestamp − formingBarStartTs) / barDurationMs )
continuousOffsetX = quantizedOffsetX − fraction · candleSpacing      // offsetX grows more
                                                                     // negative → leading edge
```

Repaint **only when `continuousOffsetX` crosses into a new DEVICE-PIXEL COLUMN**
(`Math.round(target·dpr) !== Math.round(applied·dpr)`); a sub-pixel / stationary / paused
advance stays in the same column → **ZERO renders** (the guard still coalesces). Two
subtleties that made it exact:
- **Coalesce baseline = last APPLIED eased offset tracked on the chart
  (`ch._mcPlayFollowAppliedOffsetX`), NOT the live `ch.offsetX`.** The per-frame seek
  (`goToReplayTimestamp`/mirror) runs *before* this callback and nudges `ch.offsetX`
  between frames; comparing against the live offset re-crossed the same pixel column
  ~twice → ~2× render count. Tracking the applied value gives a clean **1 render per
  device-pixel column**. On a coalesced (skip) frame the viewport is re-pinned to the
  applied offset (no repaint) so it stays exactly where the last paint left it.
- **Render once at the eased value:** `syncReplayViewportToPlayhead({render:false})`
  applies the BL-2b-safe forceRecenter (Y-scale skip, offset gating) without painting,
  then we override `offsetX = continuousOffsetX` and paint once.

**MONOTONICITY / SEAM (D-041 constraint 3 — the assertion that matters most).** At the
bar-boundary seam the pre-seam limit `q − candleSpacing` equals the post-seam value
`q_next − 0` (because `data.length++` shifts `q` by exactly one `candleSpacing` as
`fraction` resets to 0), so the ease is **C0-continuous and MONOTONIC across the seam** —
no rewind, jitter, or double-count. Backward jitter would be a worse felt defect than the
original chunkiness; H-S19b asserts `backwardSteps === 0` over ≥1 seam. **PAUSE mid-bar**
freezes the fraction exactly (the offset is a pure function of the frozen timestamp) — no
snap logic added; it falls out (`pauseDrift = 0`, offset stays a mid-bar value).

**REPRO — H-S19b (RED-first, DETERMINISTIC counters + per-frame offsetX sampling; NO
wall-clock).** Same-pair 2×2, all sync OFF, host 1m, panel C = **1h** (coarse — 60 host
frames/candle → ~0.12 px/frame, sub-pixel). Real PLAY fan-out (`replayFrame isPlaying=true`,
1m/frame, N=360 settled frames after a 120-frame warmup that drains boot history loads).
Deterministic follow-render counter `ch._mcPlayFollowRenders`.

- **GREEN (fix):** `followRendersScroll = 42` vs `pixelColumnsCrossed = 42` vs
  `candlesCrossed = 7` (candleWidth 6px, dpr 1) — per-frame delta histogram `{0:317, 1:42}`
  (never >1/frame); `stationary = 0`; `backwardSteps = 0` over 6 seams; `pauseDrift = 0`.
  Flake-stable **GREEN ×2**.
- **RED — b90 (bar-quantized candle-width threshold, verified no-op):**
  `followRenders ≈ candlesCrossed ≪ pixelColumnsCrossed` → fails the LOWER (smoothness)
  bound (chunky).
- **RED — kill-switch `--bugswitch=__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` (guard
  OFF):** `followRendersScroll = 359` (per-frame) ≫ `pixelColumnsCrossed + SMALL` → fails
  the UPPER bound **AND** `stationary = 60 ≠ 0`. Flake-stable **RED ×2**.

**KILL-SWITCH A/B (`__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD`, N=360 scroll / 60
stationary).** Guard **OFF** = unconditional per-frame follow render: scroll `359`,
stationary `60`. Guard **ON** (fix) = renders ≈ device-pixel columns crossed: scroll `42`
(= `pixelColumnsCrossed`), stationary `0`. The guard converts a per-frame repaint into a
per-device-pixel-column repaint while keeping the motion host-parity smooth.

**H-S19 RECONCILED (stale ≤60 idle bound).** D-041 redefines the coalesce unit from one
candle-width to one device pixel, so at the old 5m panel the leading edge moves **>1 device
pixel per host frame** and the (correct) follow now repaints every frame — nothing left to
coalesce, so `idleFollowCost = 124 > 60`. Reconciliation: move H-S19's idle/drag panels to
**1h** (where the sub-pixel coalesce genuinely engages) and reframe the bound as
"~1 render per device-pixel column ≈ N/8" (still ≤60). Result: default **GREEN
`idleFollowCost = 19`**, kill-switch **RED `124`** — the D-039 RED↔GREEN flip is preserved,
drag-suspend (part a) unchanged (`dragFollowCost` bounded). The device-pixel *smoothness*
itself is proved by H-S19b, not H-S19.

**VERIFICATION.** H-S19b GREEN ×2 under fix / RED ×2 under the kill-switch (flake-stable).
H-S17 (BL-10), H-S18 (BL-11), H-S13 (paused independence), H-S8 (host play) all still GREEN.
Full `npm run gate` **GREEN — 17 scenarios, 0 known-failing tracked, no regressions**.
Engine change applied **BYTE-IDENTICALLY** to both trees'
`chart/multichart-prod/panel-cmd-bridge.js` — SHA256
`B930BC8C8ADDA22ABB849A76C04EFA5297C166D442A760A9354E1CC3DC45F5A8` (equal). `node --check`
clean on all edited `.js`. Build bumped **b90 → 20260707b91** (uniform `SW_VERSION` +
`__TALARIA_CHART_BUILD_ID` across dist-v9/live/legacy/embed in both trees; no b90
stragglers).

**STATE-MATRIX (D-035 rule; D-041 continuity + cost column — renders per device-pixel
column; ✓ = holds).**

| Cell | State | Continuity | Cost (guard ON vs OFF) | Behavior |
|---|---|---|---|---|
| **Steady play [CALLED-OUT]** | eased forward follow | monotonic, offset ∝ shared timestamp | **ON ≈ pixelColumnsCrossed (42/360)** vs **OFF ≈ N (359/360)** | Repaint per device-pixel column; sub-pixel = ZERO. Host-parity smooth. THE FIX. |
| **Seam (forming bar completes) [CALLED-OUT]** | eased crosses bar boundary | `q − candleSpacing` == `q_next − 0` ⇒ **no rewind/jitter/double-count** (`backwardSteps=0`) | folded into steady cost | C0-continuous by construction; the worst felt defect is structurally excluded. |
| **Pause mid-bar [CALLED-OUT]** | timestamp frozen | fraction frozen ⇒ **offset frozen, NO snap** (`pauseDrift=0`) | 0 (play-only path not entered) | Falls out of the pure-timestamp formula; no snap logic added. |
| **Scrub (paused seek)** | paused | quantized static-mirror offset (play-only ease not active) | 0 follow renders | Unchanged — scrub uses the paused mirror path, not `maybePanelPlayViewportFollow`. |
| **Drag-disengage [CALLED-OUT]** | active interaction | follow SUSPENDED (`userHasPanned` + `_isUserInteractingWithChart`) | ≈0 in BOTH (part a) | Unchanged from D-039; never fights the drag / BL-6 recenter. |
| **B-FIX-C left-prepend while easing** | backward history load lands mid-ease | applied-offset baseline + auto-scroll gate ⇒ **no double-shift** | folded into steady cost | H-S18 (d) already bounds the left-prepend compensation (`offsetToTarget` bounded); the eased follow rides the same gate. |
| **Host (tile A)** | unchanged | n/a (not an iframe panel) | n/a | Same-TF host follows via the engine's own auto-scroll; never enters `panel-cmd-bridge.js`. |

**PENDING:** PO live re-test on deployed **b91** — coarse panel + play, all sync off:
motion must be visibly smooth (no candle-by-candle jumps) with **no backward jitter at the
candle seam**; pausing mid-candle must freeze in place (no snap to a boundary); paused/scrub
and price-axis independence unchanged.

## 6cg. BL-14 — panel coarse-display acquisition: bounded hybrid fetch + resample seam (D-042, b92)

**DEFECT (BL-14 / D-042).** With **sync OFF**, after replay has run a long way on a fine TF
(host 1m), switching a **PANEL (B/C/D)** to a big coarse TF like **1D** refetched and loaded
old data slowly. The **HOST doing the same is fine** — panel-only. It is a
data-acquisition/ownership defect (NOT the replay-mirror-frame family).

**RED-FIRST (H-S20).** Same-pair 2×2, all sync OFF, host 1m, **deep 400-day instrument
(serve.mjs file 28)**, faithful **backtest** replay (`isBacktestMode=true` + session on host +
all panels). Enter paused replay ~60% in, PLAY forward 300 host 1m frames (host 1m master →
bounded window), then switch **panel B → 1D**. DETERMINISTIC witnesses only (serve.mjs per-hit
API log + bar equality + diag counters; no wall-clock):
- **small fetch bound** on the panel's 1D acquisition,
- **NO 2000-chunk walk** (no long series of `limit=2000` backward `/candles`),
- **seams == 0** by BAR EQUALITY (resampled 1m-derived 1D bar == server-native 1D at the seam),
- **HOST UNTOUCHED** (host fetch count + master first/last/len identical),
- the coarse panel can **still advance its playhead** on the acquired 1D data (BL-10 cell).

Current **b91** reproduction (flake-stable, FAIL-REAL-BUG ×3 = one b91 run + kill-switch ×2):
`panelFetches = 33–34`, **chunkWalk = 33–34** (`/candles?timeframe=1m&limit=2000&direction=backward`
walked one page at a time), `seamMismatches = 1–2`, and the walk **mutated the shared/host 1m
master** (`len 2000 → ~68000`, `hostFetchDelta ≈ +34`) — the panel contaminated the host owner.

**DIAG — the two ledger leads (confirmed with evidence).**
1. **§6c I1 protection — CONFIRMED (code).** `_shouldUseHighLimitBulkHistory()` (chart.js
   `:5625`) returns FALSE for embed panels (`_isMultichartEmbedPanel()` guard `:5628`), so a
   panel that needs deep coarse history is denied the high-limit bulk path and walks the
   **2000-bar chunked** path — the exact slow "loading old data" feel.
2. **§6a display-TF direct-fetch — CONFIRMED.** The host has a display-TF fetch path; the panel
   never did. The 1D panel switch fell to `_multichartReplayTimeframeSwitch` →
   `_refetchBacktestTimeframeCore` and reused the **fine-TF (1m) backward** acquisition
   (`checkViewportLoadMore('backward')` → `_delegateSamePairPanLoadToHost`), pulling 1m one 2000
   page at a time instead of ONE bounded coarse fetch.

**COVERAGE MEASUREMENT (the contract).** Host 1m master span **≈ 1.39 days** (2000 bars around
the playhead); the panel's committed 1D window spans **≈ 48 completed days** (`dataFirst`
≈ 8 months back). The host master can only cover the **recent tail** of the 1D window → the fix
is a **HYBRID**.

**FIX — `_multichartPanelCoarseDisplayAcquire()` (chart.js, gated, bounded).** Invoked from the
embed backtest fast-path (`_tryMultichartEmbedBacktestTimeframeFastPath`) ONLY when the target is
**coarser-than-native** and the host-covered master does **NOT** span the coarse window (the gap):
1. **(i) ZERO-FETCH recent** — resample the host's in-memory 1m master to the coarse TF, keeping
   only buckets at/after the first FULL bucket the master covers (`seamTs = ceil(masterFirst/tfMs)*tfMs`).
2. **(ii) ONE bounded coarse fetch** — native 1D `/smart` for the OLDER remainder
   `[olderStart, seamTs)` with an **explicit bar bound** (`COARSE_DISPLAY_BAR_CAP = 1500`;
   `limit = min(smartCap, olderBars+40)`). `allowHighLimit` is set **only** when that bound
   exceeds one 2000-bar page — a narrow, sanctioned exception that does **NOT** broaden the §6c I1
   embed exclusion (the general `_shouldUseHighLimitBulkHistory` path is untouched).
3. **(iii) SEAM** — merge `older(native) + recent(resampled)`, de-duplicated by bucket start,
   recent winning at the seam (the live/forming bucket). Because `resampleData` buckets 1D as
   `floor(t/86400000)*86400000` — identical to the server's native aggregation — every COMPLETED
   resampled bucket is **bar-equal** to native; the seam (older-native meets recent-resampled) is
   clean by construction. Committed via `_ingestSmartWindowResult` + `_hotSwapBacktestReplayTimeframe`
   (`replaceReplayMaster:true`); the host 1m master is read-only throughout.

Kill-switch **`__TALARIA_MC_DISABLE_PANEL_COARSE_DISPLAY_ACQUIRE`** (default **fix ON**; disabling
restores today's chunked path). `panel-cmd-bridge.js` was **not** touched — the fix lives entirely
in the panel acquisition path in `chart.js`.

**KILL-SWITCH A/B (H-S20, deterministic).**

| Metric | Fix ON (GREEN) | Fix OFF / kill-switch (RED) |
|---|---|---|
| panel data fetches | **1** | **33** |
| 2000-chunk backward `/candles` | **0** | **33** |
| seam mismatches (completed 1D vs native) | **0** (298 compared) | **1** |
| host fetch delta during switch | **0** | **+34** |
| host 1m master mutated | **no** (len 2000 → 2000) | **yes** (2000 → 68000) |
| coarse panel playhead still advances | **yes** | yes |

**VERIFICATION.** H-S20 **GREEN ×2** under the fix / **RED ×2** under the kill-switch
(flake-stable), plus the original b91 RED = **RED ×3** total. **STATE-MATRIX
coarser-panel-during-play cell:** after the 1D acquisition, BL-10's playhead advance still works
on the newly acquired 1D data — asserted in H-S20 (`B.replayTs 1783641600000 → 1783708020000`) and
H-S17 (BL-10) still GREEN. H-S17/H-S18/H-S19b/H-S13/H-S8 all still GREEN. Full `npm run gate`
**GREEN — 18 scenarios, 0 known-failing tracked, no regressions**.

**STATE-MATRIX (D-035 rule; ✓ = holds under the fix).**

| Cell | State | Behavior |
|---|---|---|
| **Coarse panel display acquire [CALLED-OUT]** | sync OFF, long fine replay, panel → 1D | ONE bounded coarse fetch + zero-fetch recent resample; **no 2000-chunk walk**; host untouched. THE FIX. |
| **Seam (native older ↔ resampled recent) [CALLED-OUT]** | boundary bucket | completed resampled 1D bar == native 1D (same `floor(t/tfMs)` bucketing) ⇒ `seamMismatches=0`. |
| **Coarser-panel-during-play (BL-10) [CALLED-OUT]** | play after acquire | panel advances its playhead + forming candle on the 1D master; H-S17 GREEN. |
| **Host (tile A)** | unchanged | host 1m master read-only; fetch delta 0; master first/last/len identical. |
| **Independent pair** | different file | path declines (`_isIndependentMultichartPair`); existing 1m-master resample unchanged. |
| **Finer-or-equal target** | e.g. 1D→1m | path declines (`tfMs <= nativeMs`); existing finer paths unchanged. |

**ENGINE PARITY.** `_multichartPanelCoarseDisplayAcquire` + the fast-path hook applied
**BYTE-IDENTICALLY** to both trees' `chart/chart.js` — SHA256
`9C92F39842C9194877AA83F76E61D79192BAF18131FD121D07E84C4009B099D6` (equal). `node --check` clean
on all edited `.js`. Only the `chart v 1.4` harness got scenario/serve edits (H-S20 + deep file 28
+ `hostFile` param). Build bumped **b91 → 20260707b92** (uniform `SW_VERSION` +
`__TALARIA_CHART_BUILD_ID` across dist-v9/live/legacy/embed in both trees; no b91 stragglers).

## 6ch. BL-15 — finer same-pair panel acquires bars on TF switch during NON-backtest replay (D-043, b93)

**DEFECT (BL-15 / D-043, the PO's malformed-axis report).** In a same-pair 2×2 multichart with
**sync OFF**, switching a PANEL to a **finer** TF than the coarse host (e.g. host 1h, panel → 1m)
**during (non-backtest) replay** rendered the panel's **TIME (X) AXIS malformed** — compressed /
scrollbar-like, a label on every candle — while host + peers looked normal.

**ROOT CAUSE (verified, `chart.js setTimeframe`).** The multichart-embed **acquire** branch that
refetches/resamples panel data on a replay TF switch is gated on `if (this.isBacktestMode && this.currentFileId)`
(chart.js ~20590). A panel in **non-backtest** replay skips that branch entirely and falls through
to the client-resample / relabel fallback. `_canClientResampleToTimeframe('1m')` is **false** for a
coarser (1h) master (cannot upsample a coarse master to a finer TF), so it dropped to
`_commitTimeframeChange('1m')` — **relabeling the coarse 1h bars as 1m WITHOUT acquiring finer data.**
The axis then computes `labelIntervalMs = labelInterval × parseTimeframe('1m')`; the committed bars
are 1h-spaced = an exact multiple of that interval, so **every coarse bar lands on a "round" tick →
a label on every candle → the compressed/malformed axis**. Probe evidence (non-backtest replay,
host 1h → B 1m): `currentTimeframe='1m'` but `dominantBarDelta=3,600,000ms (1h)`, `dataMatchesTf=false`,
tick `spacingRatio ≈ 15`, `ownerFetches=0`. The previously-suspected replay-follow kill-switches
(`__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD`, `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW`) were
**exonerated** — the malformation reproduces while PAUSED and persists with those flags toggled.

**FIX (gated, chart.js ~20613–20655 + `_ensureFinerPanelOwnerCoversPlayhead` ~3401).** In the
non-backtest replay branch, **before** the relabel fallback, when
`currentFileId && _isMultichartEmbedPanel() && !_isIndependentMultichartPair()
&& _multichartFinerSamePairPanelSelfOwns({panelTimeframe: normalizedTf})`, route to the sanctioned
**B8 bounded-owner** acquisition `_ensureFinerPanelOwnerCoversPlayhead(playhead, {targetTimeframe,
forceAcquire:true, commitTimeframe:true, activeReplayCatchUp})` so the panel **fetches its own finer
window** instead of relabeling coarse bars. Gated behind new kill-switch
**`__TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE`** (default = **fix ON**). The cosmetic
axis-masking alternative was rejected — the felt defect is relabel-without-data, so the fix makes the
**data follow the relabel**.

**B8 BOUNDED-OWNER CONTRACT (D-043 #1) — PROVEN.** The acquisition goes through the sanctioned owner
primitive `_fetchFinerPanelOwnerWindow` (per DIAG-B8b §2: per-request ≤ **5000** bars / ≤ **2000**
during active play, ≤ **10000** per acquisition). H-S21 asserts the `ownerFetches`/`ownerBars` diag
counters: **GREEN `ownerFetchDelta=1`, `ownerBarsDelta=5000`** (one bounded owner fetch, exactly at
the 5000 request cap, well within the 10000 acquisition cap; **no chunk-walk**). RED (kill-switch):
`ownerFetchDelta=0` (never acquired). I1 single-owner + the B8 caps are untouched — no blanket
bulk-fetch re-enable.

**INTERIM-STATE MATRIX CELL (D-043 #2) — atomic commit.** The commit is **atomic**: the old (coarse)
data arrays stay untouched — and, behind the TF-switch freeze, still painted (`_getRenderTimeframe()`
returns the coarse `_switchingFromTimeframe` while bars don't match the destination) — until the finer
window is ingested. `_commitTimeframeChange(tf)` (label only, no render / no data mutation) fires
**synchronously immediately before** `_ingestSmartWindowResult` (data), so the `(label, data)` pair is
never observable in a mismatched state, then `_endTimeframeSwitching()` lifts the freeze on the correct
frame. Matrix:

| Case | What the panel shows |
| --- | --- |
| **Fix ON, acquire succeeds** | last-good **coarse** frame painted until the finer window commits **atomically**; then the correct finer axis. **Never** the malformed every-bar axis. |
| **Fix ON, acquire FAILS** | keep the **last-good coarse** frame; the switch is **aborted** (TF label NOT flipped, `_endTimeframeSwitching()` on the coarse frame) — **no relabel, no malformed axis**. |
| **Kill-switch ON** (`__TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE`) | today's relabel behavior (malformed axis) — the RED reference. |

H-S21 samples the axis **from switch-issue to settle** and asserts `sawMalformed=false` throughout
(not just at the settled end): **GREEN `worstRatioSeen=1.00`**; RED `worstRatioSeen=15.00`.

**COARSER-PATH SCOPE FINDING (D-043 #3) — STOPPED before expanding (same gate, NOT same fix).**
Confirmed empirically: non-backtest replay **also** bypasses BL-14's coarser acquire
(`_multichartPanelCoarseDisplayAcquire`) via the **same `isBacktestMode` gate**. BUT the **symptom
differs**: a coarser switch (host 1m → panel 1D) in non-backtest replay produces a **SANE axis** —
`onTimeframeChange` resamples the loaded fine window to a **genuine 1D cadence** (`dominantDelta=86,400,000`,
`dataMatchesTf=true`, `spacingRatio ≈ 1.03`) — its defect is instead a **slow ~51-fetch backward
chunk-walk** ("candles load one by one"), i.e. the BL-14 class, **not** the malformed axis.
`_multichartPanelCoarseDisplayAcquire` is a **different method** with its own `isBacktestMode` guard
and **backtest-session / `_hotSwapBacktestReplayTimeframe`** dependencies; making it work in
non-backtest replay is **larger than the finer route** and a different failure mode. Per the D-043
HARD RULE ("if the coarser-path scope check reveals something larger than 'same fix,' STOP and report
before expanding"), the coarser acquisition was **NOT** implemented here — flagged for a separate
task. H-S21 still **covers both directions**: the coarser cell asserts the axis stays sane (regression
guard) but does **not** assert a coarse fetch bound.

**RED-FIRST SCENARIO H-S21** (registered in `scenarioList` + `known-failing.json` `expectedTests`).
Deterministic (no wall-clock): after a TF switch during non-backtest replay it asserts (finer) data
**acquired not relabeled** (`dominantDelta==60000`), settled axis **sane** (ticks strictly increasing,
max/min spacing ratio ≤ 2), **interim never malformed**, and the **B8 owner contract**; plus a coarser
axis-sanity cell. **RED flake-stable** across 3 runs (identical: `spacingRatio=15.000…`, `ownerFetches=0`).

**KILL-SWITCH A/B (`__TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE`).**

| | data cadence | `dataMatchesTf` | tick `spacingRatio` | interim `sawMalformed` | `ownerFetchDelta` | `ownerBarsDelta` |
| --- | --- | --- | --- | --- | --- | --- |
| **Fix ON (b93)** | 60000ms (1m) | true | **1.00** | **false** | **1** | **5000** |
| **Kill-switch ON / b92** | 3,600,000ms (1h) | false | **15.00** | true | 0 | 0 |

**VERIFICATION.** Full `npm run gate` **GREEN — 19/19** (H-S2..H-S21; BL-10→BL-14 = H-S17/H-S18/H-S19/H-S19b/H-S20
and H-S8 all still PASS; no regressions, 0 known-failing tracked). `node --check` clean on the edited
`chart.js` (both trees). **ENGINE PARITY:** the `chart.js` change applied **BYTE-IDENTICALLY** to both
trees — SHA256 `307BE729A3072D536AB78A768E093FC770E8BEF99AD2E54B99AF3560316D79A3` (equal);
`panel-cmd-bridge.js` untouched. Build bumped **b92 → 20260707b93** (uniform across
dist-v9/live/legacy/embed + `SW_VERSION` in both trees; 0 b92 stragglers).

## 6ci. BL-17 — coarser same-pair panel acquires bars on TF switch during NON-backtest replay (D-044, b95)

**DEFECT (BL-17 / D-044, PO live-confirmed).** In a same-pair 2×2 multichart with **sync OFF**,
switching a **PANEL** to a **COARSER** TF than the host's native (e.g. host 1m, panel → **1D**)
**during (non-backtest) replay**, after a long fine replay run, **loads old data very slowly and
laggily** — the coarser sibling of BL-15. Host is fine, sync is OFF. This is the third visit to the
**same `isBacktestMode` gate** in `setTimeframe` (BL-14 fixed backtest coarse; BL-15 fixed
non-backtest finer; BL-17 fixes non-backtest coarser).

**ROOT CAUSE (verified).** The embed acquire branch that routes a backtest coarse switch to BL-14's
bounded hybrid (`_multichartPanelCoarseDisplayAcquire`) is gated on
`if (this.isBacktestMode && this.currentFileId)` (chart.js ~20590). A **non-backtest** replay panel
skips that block entirely. A coarser (1D) target is **not** client-resamplable
(`_canClientResampleToTimeframe` returns false for `newMs/rawMs > 6`, i.e. 1m→1D = ×1440), so it
falls to the **replay resample/relabel fallback** → `replaySystem.onTimeframeChange` resamples the
**bounded** fine window (~2000 1m bars ≈ 1.4 days) to a ~2-candle 1D stub, then backfills the 1D
viewport **one 2000-bar backward `/candles` page at a time** — the slow **~51-fetch chunk-walk**, and
(via same-pair pan-load delegation) it **mutates/contaminates the HOST 1m master**. Symptom differs
from BL-15's malformed axis: the axis is sane; the defect is the chunk-walk (BL-14 class).

**FIX (gated, chart.js).** In the non-backtest replay branch of `setTimeframe`, **immediately after
BL-15's finer routing** and **before** the client-resample/relabel fallback (chart.js
**~20657–20704**), route a **coarser-than-native same-pair embed panel** (embed, NOT independent,
`coarseTargetMs > nativeMs`, and only when a coverage **gap** exists —
`!_multichartMasterCoversTimeframe(normalizedTf)`) to BL-14's sanctioned bounded hybrid via a new
call `_multichartPanelCoarseDisplayAcquire(normalizedTf, { nonBacktestReplay: true })`. On acquire
failure it **keeps the last-good frame** and ends the switch (same graceful contract as BL-15) —
never the slow chunk-walk. The acquire machinery was **reused, not duplicated** (chart.js
**~2924–2960**): a `{ nonBacktestReplay }` option lifts the internal `isBacktestMode` requirement
(now only `replay.isActive && currentFileId`) and selects the new kill-switch; the backtest-session
helpers are null-safe (no session in non-backtest) and `_hotSwapBacktestReplayTimeframe` already
handles an active non-backtest replay master-replace, so **no D-042 logic was re-implemented**. The
D-042 hybrid shape is inherited **VERBATIM**: (i) **zero-fetch** resample of the host-covered recent
window from the host 1m master, (ii) **ONE bounded** coarse `/smart` fetch for the older remainder
(`COARSE_DISPLAY_BAR_CAP = 1500`), (iii) **bar-equal seam** (completed resampled 1D == native 1D by
identical `floor(t/86400000)` bucketing); the **host master is read-only** throughout.

**KILL-SWITCH (named up front): `__TALARIA_MC_DISABLE_COARSE_PANEL_REPLAY_TF_ACQUIRE`** (default =
**fix ON**; setting it restores today's chunk-walk). It is **SEPARATE** from BL-15's finer flag
(`__TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE`) and BL-14's backtest flag
(`__TALARIA_MC_DISABLE_PANEL_COARSE_DISPLAY_ACQUIRE`) — the three revert independently.

**FILE:LINE OF EACH CHANGE (both trees, byte-identical).**
- `chart.js` **~20657** — new BL-17 non-backtest coarser routing branch in `setTimeframe`'s
  `replaySystem.isActive` block (kill-switch + embed + not-independent + coarser + coverage-gap gate;
  delegates to the acquire; keep-last-good on failure).
- `chart.js` **~2924** — `_multichartPanelCoarseDisplayAcquire(normalizedTf, options)` gains the
  `nonBacktestReplay` option: per-path kill-switch selection and the relaxed replay gate
  (`isBacktestMode` no longer required when driven from the non-backtest entry).

**TASK 2 — `isBacktestMode` PREDICATE ENUMERATION (D-044 ledger lesson; ONE pass over every path the
`setTimeframe` replay-block gate guards + what it does under NON-backtest replay).** The governing
gate is `if (this.isBacktestMode && this.currentFileId)` (chart.js ~20590), plus two adjacent
`isBacktestMode` sub-gates in the same replay region (~20555, ~20578).

| # | `isBacktestMode`-guarded path (backtest) | file:line | NON-backtest-replay behavior | Verdict |
|---|---|---|---|---|
| 1 | `_multichartMirrorHostTfSwitchIfReady` (same-pair embed instant host-clone) | ~20592 | Bypassed. Same-pair **coarser** now → **BL-17 bounded acquire**; same-TF → idempotency no-op; small coarser (ratio ≤6) → client-resample. | **CORRECT** (was chunk-walk for big-coarser; fixed by BL-17) |
| 2 | `_isIndependentMultichartPair() && _independentPanelTimeframeSwitch` (own-master resample) | ~20596 | Bypassed. BL-17 **excludes** independent pairs (correct — NOT pulled into host resample). Small/equal coarser → client-resample OK. **BIG coarser (ratio>6)** → relabel fallback → `onTimeframeChange` resamples the panel's **own** bounded master → **chunk-walk on its OWN file**. | **FLAGGED** (see below) |
| 3 | `_multichartReplayTimeframeSwitch` → `_tryMultichartEmbedBacktestTimeframeFastPath` → else `_refetchBacktestTimeframeCore` (same-pair embed main) | ~20600 | Bypassed. Same-pair **finer** → **BL-15** acquire; **coarser** → **BL-17** acquire; equal/covered → client-resample. | **CORRECT** (finer BL-15 + coarser BL-17 close it) |
| 4 | Host (non-embed) `_applyBacktestTimeframeFromCache` → `_refetchBacktestTimeframe` | ~20602 | Bypassed. Host is **not** an embed panel, so it is **not** subject to the §6c I1 embed high-limit exclusion → its coarse history loads via the bulk path in one shot (PO-confirmed "host is fine"). | **CORRECT** (host unaffected) |
| 5 | Playhead capture / BT-TF cache save `if (replayActive && isBacktestMode && currentFileId)` | ~20555 | Skipped in non-backtest (there is no BT-TF cache); playhead is captured inside the acquire/resample paths instead. | **CORRECT** (benign) |
| 6 | Path-A live TF-cache skip-guard `!(replayActive && isBacktestMode && embed)` | ~20578 | In non-backtest embed the guard is false, so `_applyLiveTimeframeSwitchFromCache` **is** attempted first; it returns false for an uncached coarse target and falls through to BL-17. | **CORRECT** (falls through cleanly; verified — H-S23 GREEN reaches the acquire) |

**FLAGGED FINDING (path #2 — NOT fixed here, for a Director ruling).** An **independent-pair** panel
switching to a **big coarser** TF (ratio > 6) during **non-backtest** replay is, by code path, the
same relabel-fallback that BL-17 fixes for same-pair — but on the **independent panel's own bounded
master** (a *different owner*, not host contamination). It therefore **likely chunk-walks on its own
file**. It is deliberately **out of BL-17 scope** (the state-matrix requires independent pairs stay
on their own master and NOT be pulled into the host resample, which BL-17 honors by excluding them).
Recommend a **dedicated RED scenario + Director ruling** before touching it — reported, not silently
fixed, so the predicate can close cleanly. All same-pair and host paths (#1, #3, #4) are now closed;
this is the one residual `isBacktestMode`-relabel/starve candidate under non-backtest replay.

**RED-FIRST SCENARIO — H-S23** (registered in `scenarioList` + `known-failing.json` `expectedTests`;
deterministic, NO wall-clock — serve.mjs per-hit API log + bar equality + diag counters). Same-pair
2×2, all sync OFF, **NON-backtest** replay (`isBacktestMode=false`, asserted), host 1m, deep 400-day
instrument (serve.mjs file 28). Enter paused replay, PLAY 300 host 1m frames (host 1m master →
bounded window), then switch **panel B → 1D**. Asserts: bounded panel fetch (≤4), no 2000-chunk walk
(≤2), seam bar-equality (completed resampled 1D == native 1D), host fetch delta 0, host master
first/last/len unmutated, and BL-10 playhead advance on the acquired 1D data.

| Metric | GREEN (fix, b95) | RED (`__TALARIA_MC_DISABLE_COARSE_PANEL_REPLAY_TF_ACQUIRE` / b94) |
|---|---|---|
| panel data fetches | **1** | **53–55** |
| 2000-chunk backward `/candles` | **0** | **53–55** |
| seam mismatches (completed 1D vs native) | **0** (298 compared) | **1** |
| host fetch delta during switch | **0** | **+54…+56** |
| host 1m master mutated | **no** (len 2000 → 2000) | **yes** (2000 → ~110000) |
| coarse panel playhead still advances (BL-10) | **yes** (1783738980000 → 1783753380000) | n/a |

**FLAKE-STABILITY.** RED **×3 = FAIL-REAL-BUG** (identical class each run: chunkWalk 53/55/53,
hostFetchDelta 54/56/... , seamMismatch 1). GREEN ×1 PASS (and via full gate). Deterministic only.

**STATE-MATRIX (D-035 rule; direction × replay-state × sync × panel-relationship). "unchanged" =
byte-for-byte prior behavior; "THE FIX" = BL-17 bounded acquire.**

| Panel relationship | Replay state | Sync | Behavior under BL-17 |
|---|---|---|---|
| **Same-pair COARSER (host 1m → panel 1D) [CALLED-OUT]** | **playing** | off | **THE FIX** — bounded acquire lands the 1D master; **BL-10 playhead + forming candle keep advancing on the newly acquired 1D data** (H-S23 asserts `replayTs` advances post-acquire; H-S17 still GREEN). |
| Same-pair coarser | paused / idle | off | THE FIX — bounded acquire (zero-fetch recent + one bounded older fetch + bar-equal seam); no chunk-walk; host read-only. |
| Same-pair coarser (small step, ratio ≤6, or master covers) | any | off | **unchanged** — fast client-resample (acquire declines via `_multichartMasterCoversTimeframe`). |
| Same-pair coarser | any | **on** | **unchanged** — interval-sync fans the TF to all panels; the host owns acquisition; embed panels mirror. BL-17 gate is same-pair-embed-panel-initiated only. |
| Same-pair FINER (BL-15) | any | off | **unchanged** — BL-15's `_ensureFinerPanelOwnerCoversPlayhead` (separate flag); BL-17 excludes finer (`coarseTargetMs > nativeMs`). H-S21 still GREEN. |
| **Independent pair (other pair) [CALLED-OUT]** | any | any | **unchanged / NOT pulled into host resample** — BL-17 explicitly excludes `_isIndependentMultichartPair()`; keeps its own master. (Big-coarser-on-own-master chunk-walk = the FLAGGED finding above, out of scope.) |
| Host (tile A) | any | any | **unchanged** — not an embed panel; host fetch delta 0, master unmutated (H-S23 asserts). |
| Backtest replay (any direction) | any | any | **unchanged** — BL-14/BL-15 paths; the non-backtest option leaves the backtest gate + D-042 flag intact. H-S20 still GREEN. |

**VERIFICATION.** Full `npm run gate` **GREEN — 21/21** (H-S2..H-S23; H-S8 host-play, H-S17 BL-10,
H-S18 BL-11, H-S19/H-S19b BL-12/13, **H-S20 BL-14**, **H-S21 BL-15** all still PASS; 0 known-failing
tracked, no regressions). `node --check` clean on the edited `chart.js` **and** `scenarios.mjs` in
**both** trees (no ESLint config covers the static engine asset; `node --check` is the syntactic
gate, matching prior BL entries). **ENGINE PARITY:** every edited mirror pair is **byte-identical**
(SHA256): `chart.js` = `437136DA12A2B7EF170108D3CAF2F6C7435D05AE56C01B72580F3F19767668B8`;
`multichart-prod/harness/scenarios.mjs` = `C0925A196A841099B486A2DEAECCD0ACC641DD5B73BF6BE8D1C1FD1276C7F08D`;
`harness/known-failing.json` = `C103A7C47A4F6A6354DDD399CBB1B5BFD649D68965EB596CE16FB912599FD7F6`
(plus the build-bumped `dist-v9/index.html`, `dist-v9/sw.js`, `sw.js`, `legacy-index.html`,
`chart-embed.html` pairs all EQUAL). `panel-cmd-bridge.js` untouched. Build bumped **b94 →
20260707b95** (uniform `?v=` + `SW_VERSION` + embed default across dist-v9/live/legacy/embed in both
trees; **0 b94 stragglers**). **No security guard / SW-lifecycle logic / `gate.mjs` /
`.github/workflows/security.yml` touched** (only the standard `SW_VERSION` cache-string bump); **B8
owner caps and §6c I1 embed high-limit exclusion intact** — the BL-14 coarse fetch keeps its own
explicit `COARSE_DISPLAY_BAR_CAP` bound and does not broaden the general embed bulk-fetch path.

**PENDING:** PO live re-test on deployed **b95** — sync OFF, long fine (1m) replay run, switch a
same-pair panel to 1D during replay: it must load promptly (one bounded fetch, no slow one-by-one
backfill), the host must stay untouched, and the coarse panel must keep advancing its playhead on
play. Director ruling requested on the **flagged independent-pair big-coarser** path.

## 6cj. D-045 — TWO approved fixes: reload-prompt SW-cache bypass + coarse-acquire viewport clamp (b96)

Director decision **D-045** dispatched two approved fixes; one build bump **b95 → `20260707b96`** at the end.

### FIX 1 — Reload-prompt version-check no longer reads through the SW cache (tooling/hygiene, NO gate scenario)

**Mechanism + file:line.** `modules/talaria-version-reload.js` `fetchDeployedId()` (**:96–108**) now fetches
the **concrete asset `/chart/sw.js`** (not the host document) with `cache:'no-store'` **plus a unique
cache-buster** `?__vrc=<Date.now()>-<++seq>` (the monotonic per-tab `_vrcSeq` at **:87** guarantees a
distinct URL even for two checks in the same millisecond). `parseBuildId()` (**:75–83**) extracts the
build id from the marker: `SW_VERSION = "talaria-chart-<build>"` first (the sw.js marker, kept in
lockstep with the HTML build id by `bump-dist-v9-cache.mjs`), then the HTML `__TALARIA_CHART_BUILD_ID`
assignment, then a `?v=` fallback — so the same parser works against sw.js **or** a document.

**Why the old fetch read stale.** The b94 version fetched the **host document** (`location.pathname`)
with `cache:'no-store'`. `cache:'no-store'` only bypasses the **HTTP cache — it does NOT bypass an active
service worker.** A caching SW with a **navigation fallback** serves the STALE cached `index.html` for
**any navigation-shaped URL regardless of query**, so the detector compared **stale-vs-stale** (b94==b94)
and never fired. `/chart/sw.js` is a concrete `.js` asset (not a navigation) → never navigation-fallback-
served; combined with `no-store` + a unique buster the request must reach the network.

**How the new fetch is proven to reach the network (live, real deploy boundary).** A standalone live
harness (`harness/verify-fix1.mjs`, run once, not a gate scenario per Director) registers a **real caching
SW** whose navigation fallback serves a stale shell (loaded build **`b95-STALE`**) for any navigation URL
while passing concrete assets through, and serves a **newer deployed** marker `/chart/sw.js` →
`talaria-chart-20260707b96-DEPLOYED`. Result **7/7**:
- tab is running the stale SW-cached shell (loaded = `b95-STALE`);
- **(A)** OLD document fetch is **MASKED** — reads `b95-STALE` (network truth was `b96-DEPLOYED`);
- **(B)** NEW `/chart/sw.js` fetch **reaches the network** — reads `b96-DEPLOYED`; the **server logged the
  GET `/chart/sw.js?__vrc=…` hit** (network reached, not cache);
- **(B)** `check()` detects the mismatch and **shows the toast**;
- **(C)** kill switch `__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT` still fully suppresses on a real
  mismatch (returned=false, no DOM toast);
- unique cache-buster → two concurrent checks use DISTINCT URLs.

**Preserved behavior.** Host-only (`isPanel()` guard), dismissible toast, no auto-reload, kill switch
default-ON, no false alarm on a network hiccup (empty deployed id → no toast). **No SW caching-strategy
change:** `sw.js` diff is **version-string-only** (the standard `SW_VERSION` cache bump); the version-
reload module is a client script, not the SW. Gate scenario **H-S22 still PASS**.

### FIX 2 — Post-acquire coarse-panel viewport clamp (engine, gated, H-S23 extension)

**Kill switch + file:line.** `__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP` (default = fix ON,
SEPARATE flag, reverts independently of BL-17). One-shot clamp `_multichartClampCoarseAcquireViewport`
(`chart.js:3153`), invoked **once at acquire-commit** in `_multichartPanelCoarseDisplayAcquire`
(`chart.js:3107`, right after `_hotSwapBacktestReplayTimeframe`). Never continuous.

**ONE-LINE named root race (guard used, ledgered known-deferred).** The non-deterministic landing is a
race between **W1** the SYNCHRONOUS `_restoreTfSwitchViewport → syncReplayViewportToPlayhead`
(`chart.js:29632/29663`) and **W2** the DEFERRED `_deferBacktestTfSwitchFollowUp →
_snapReplayViewportAfterTfSwitch` + the `setTimeout` `_fillViewportHistoryAfterTfSwitch`
(`chart.js:~29653`); because **W2 legitimately awaits the async host backward fetch it is NOT trivially
orderable after W1**, so the **CLAMP GUARD stands** (no ordering fix) and the race is **ledgered here as
known-deferred** (not silently papered over). The clamp writes the authoritative viewport once and sets
`_chartViewRestored=true` so W2's snap skips.

Constraint 2 nuance: the clamp reuses `syncReplayViewportToPlayhead` for the deterministic follow offset +
BL-2b price-independence (`resetPriceScale:false`), THEN **tightens `offsetX` to a hard right-edge anchor**
(`RIGHT_EDGE_PAD_CANDLES=1`; `offsetX = plotW − (len−1)·spacing − PAD·spacing`). Reason:
`getReplayAutoScrollState` deliberately leaves a **~10–20 % ratio right-gap** — fine at a tight zoom, but
**tens of empty-future candles at the wide `candleWidth≈6` landing** (the exact D-045 defect). candleWidth
is left untouched (no zoom change); `constrainOffset` leaves the anchor within bounds (len ≫ 15).

**State-matrix (incl. dragged-during-acquire).**

| Panel state at acquire-commit | Clamp behavior | diag `.mode` |
|---|---|---|
| follow engaged / at-edge | right-edge anchor (reuse sync + right-edge tighten) | `right-edge` |
| **dragged-during-acquire** (live axis gesture surviving `_beginTimeframeSwitching:21087`) | **SKIP entirely — user viewport wins** | `skip-interaction` |
| panned into history (settled `userHasPanned` / follow off) | clamp empty-space bounds only, NO recenter | `clamp-bounds` |
| kill switch ON / replay inactive / no data | no-op | `disabled` / `skip-inactive` |

Note: a `type:'pan'` drag is intentionally cancelled by `_beginTimeframeSwitching` at switch start, so the
enduring in-flight gesture a real user keeps HELD across the async acquire is an **axis drag** — H-S23's
dragged-during-acquire cell arms `drag={active:true,type:'timeAxis'}` (which the cancel-list spares) and
asserts `skip-interaction`.

**H-S23 extension — RED vs GREEN numbers** (deterministic, sampled at settle, no wall-clock; existing
fetch/seam assertions kept intact):

| Metric | GREEN (fix ON) | RED (`--bugswitch=__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP`) |
|---|---|---|
| `leftEmptyDays` (leftmost visible bar present) | **0** | 0* |
| playhead → right-edge (candle-spacings) | **1.00** (≤3) | **36.66** (FAIL) |
| `candleWidth` at settle | **89** (tight) | **6** (wide, ~36 days empty future) |
| clamp `.mode` (follow cell) | **right-edge** | disabled |
| dragged-during-acquire `.mode` | **skip-interaction** | disabled |
| H-S23 verdict | **PASS** | **FAIL-REAL-BUG** |

\*RED still lands on real data at the left because it scrolls into history, but the playhead marches off
the right edge with the wide-zoom empty future — the defect the fix removes.

### Verification / report-back (both fixes)

- **Full `npm run gate` — GREEN 21/21** (H-S2..H-S23; all prior BL scenarios H-S17/18/19/19b/20/21/22/23
  PASS). **Known-failing baseline: none; regressions: none; newly-fixed: none.** In-gate H-S23 shows
  `clampMode=right-edge leftEmptyDays=0 playheadToRightEdgeSpacings=1.00 candleWidth=89` and dragged-cell
  `skip-interaction`.
- `node --check` clean on every edited JS in **both** trees (`chart.js`, `talaria-version-reload.js`,
  `scenarios.mjs`, `sw.js`, `dist-v9/sw.js`).
- **SHA256 — every edited mirror pair byte-identical:**
  `chart.js` = `21B7261F22C30917A9C881C15DD5F667D400575D2D9F28B04354B8FD634E4E89`;
  `modules/talaria-version-reload.js` = `291BA837C0A611C5E8FEF3071D2B3B7976E8AE718DA98E17C2D4FB52949AAE0D`;
  `multichart-prod/harness/scenarios.mjs` = `A2651FF467B44F1107A2CFA636AB393823CBD7ECADC057ABF48042626C2DE9D0`;
  `sw.js` = `dist-v9/sw.js` = `A0C9225AFB640121C73E3CE59C1419E23918BD3F36F32976909508B3BB23C090`;
  `dist-v9/index.html` = `2C56DEE417BB5E209FEF8DE8C43C3AB22A4D9EB87638587337965B3F2FA7878C`;
  `legacy-index.html` = `F9D95C594B7DD670B51A10940E33714C8D050D96B09285739E7F6D045FB02ADD`;
  `multichart-prod/chart-embed.html` = `9D5DA667270DBCE9073F81FE6D3A9412C20CE37E1EEF5EBCC9FF65A6C9E9E581`.
  `known-failing.json` **untouched** (H-S23 already registered from D-044; still GREEN, no baseline change).
- **ONE build bump** b95 → `20260707b96` via `bump-dist-v9-cache.mjs` (uniform `?v=` + `SW_VERSION` + embed
  default across dist-v9 / live / legacy / embed in both trees); **0 `20260707b95` stragglers** in shipped
  files (remaining matches are prior-build ledger history only).
- **No security guard / SW-lifecycle logic / `gate.mjs` / `.github/workflows/security.yml` touched** (only
  the standard `SW_VERSION` cache-string bump); **B8 owner caps + §6c I1 embed high-limit exclusion intact.**

**PENDING:** PO live re-test on deployed **b96** — (1) an old tab on a stale SW-cached bundle now shows the
"new version — Reload" toast once b96 is deployed; (2) sync OFF, long 1m replay, switch a same-pair panel
to 1D during replay lands deterministically (leftmost bar present, playhead at the right edge, no empty
future) with follow engaged, and is left alone if the user is mid-gesture.

## 6ck. D-046 / BL-18 — peer-refetch-on-TF-switch storm FIXED (2026-07-11, build 20260707b97)

**PO symptom (HIGH-PRIORITY regression, live):** during active replay, switching ONE panel's timeframe
(e.g. the HOST / panel A) caused **all other same-pair panels to re-fetch** their data — a cross-panel
fetch storm. Core-invariant violation: switching one panel's TF must not make peers self-fetch (they mirror).

### RED-first reproduction (harness)

Built **H-S24** (`scenarios.mjs` + homepage mirror; registered in `known-failing.json` expectedTests
21→22). A pre-fix probe swept the full switch × sync matrix during **active non-backtest replay** and
isolated the reproducing cell exactly:

| Switch under test | sync OFF | sync ON | peers self-fetch? |
|---|---|---|---|
| HOST fan-out 1m→1h (coarser) | 0 | 0 | no (mirror) |
| HOST fan-out 1m→5m (coarser) | 0 | 0 | no (mirror) |
| **HOST fan-out 1h→1m (FINER)** | **3** | **3** | **YES — storm** |
| non-host panel B→1m OWN (host 1h) | 0 | 0 | no (only B acquires) |
| non-host panel B→1d OWN (host 1m) | 0 | 0 | no (only B acquires) |

**RED cell = host switches its own TF from COARSE→FINER and fans out.** RED (peers B=1 C=1 D=1) in
**all** of sync{ON,OFF} × replay{paused,playing}; flake-stable. Other same-pair peers and the switching
panel's own acquire are unaffected.

### Root cause (exact path)

On a host fan-out to a finer TF, the bridge's H-S6 **mirror-wait**
(`panel-cmd-bridge.js` `case 'setTimeframe'` `__fromHostFanout` branch, ~line 2209) waits for the host to
commit then calls `chart.js:_multichartMirrorHostTfSwitchIfReady`. That mirror **declined** at
`chart.js:3264` because `_multichartFinerSamePairPanelSelfOwns` (`chart.js:3454`) read the host's **STALE
committed-native**: `_readCommittedHostStateForFinerOwner` (`chart.js:3421`) prefers
`host._mcCommittedNativeRawFetchTf`, which is only refreshed by `_emitMultichartHostDataCommit`
(`chart.js:3727`) and is **NOT updated on a client-resample fan-out back to a finer TF** — so it still read
`1h` while the live `host._nativeRawFetchTf` was already `1m`. The peer therefore wrongly concluded
"finer-than-host / self-own", the mirror-wait fell through to `ch.setTimeframe(1m)` (`panel-cmd-bridge.js`
~2240), which hit the **BL-15** finer branch (`chart.js:20799` →
`_ensureFinerPanelOwnerCoversPlayhead(... forceAcquire ...)`) → **every peer self-fetched**. Instrumented
trace: `mirror(1m)=>false selfOwn=true hostTf=1m hostNative=1m hostSwitching=false myTf=1h`.

### Fix (minimal, gated, default ON)

New kill-switch **`__TALARIA_MC_DISABLE_PEER_REFETCH_ON_TF_SWITCH_GUARD`** (default = fix ON), reverts
independently of BL-15/BL-17. On an explicit HOST-originated fan-out the host is the single owner and every
same-pair peer adopts the host TF by **mirroring**, so `_multichartMirrorHostTfSwitchIfReady` now takes an
`options.fromHostFanout` and, when set (guard ON), **skips the finer-self-own decline** at `chart.js:3264`.
The host-committed-TF + `_barsMatchTimeframe` cadence checks below it **still gate** the mirror (if the host
truly cannot serve the finer bars, the mirror declines and we fall back cleanly). The bridge passes
`{ fromHostFanout: true }` on its three fan-out mirror calls (`panel-cmd-bridge.js` ~2169, ~2196, ~2221).
The acquire path stays reserved for a panel's **OWN** switch (direct panel-cmd, no `__fromHostFanout`) —
BL-15/H-S21 and BL-17/H-S23 untouched.

- **file:line of fix:** `chart v 1.4/chart/chart.js:3258` (`_multichartMirrorHostTfSwitchIfReady` +
  `options.fromHostFanout` guard, ~3264); `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` (three
  fan-out mirror calls pass `fromHostFanout`). Mirrored byte-identically to `homepage/public/chart/…`.
- **regressing change:** BL-15 (D-043) `_ensureFinerPanelOwnerCoversPlayhead` finer replay-TF acquire, which
  a host-originated fan-out could reach via the mirror-wait fallback when the host committed-native was stale.

### State-matrix (H-S24, per cell: does any OTHER panel self-fetch? target = no)

| switcher | relationship | replay | sync | other peers self-fetch |
|---|---|---|---|---|
| host (fan-out) | same-pair finer | paused | OFF | **0** (RED 3 under kill-switch) |
| host (fan-out) | same-pair finer | paused | ON | **0** (RED 3) |
| host (fan-out) | same-pair finer | playing | OFF | **0** (RED 3) |
| host (fan-out) | same-pair coarser/equal | either | either | 0 (already mirrored pre-fix) |
| non-host panel | same-pair (own switch) | paused | OFF | 0 (only switcher acquires, BL-15 intact) |
| any | independent pair | — | — | own their data (excluded by mirror-wait `!_isIndependentMultichartPair()`) |

Switching panel itself still acquires correctly (finer axis sane, coarser fast+full); BL-10
coarser-play-advance unaffected.

### Verification / report-back

- **Reproduced: YES.** Peer fetch counts — **RED** (`--bugswitch=…PEER_REFETCH_ON_TF_SWITCH_GUARD`):
  B=1 C=1 D=1 (peerFetch=3) in all three host-fan-out cells; **GREEN** (fix): B=0 C=0 D=0, all peers land on
  1m with identical first/last bars and 60 000 ms cadence (`dataMatchesTf`).
- **H-S24 RED vs GREEN, flake-stable ×3:** GREEN `PASS,PASS,PASS`; RED cells `FAIL-REAL-BUG` (own-switch cell
  stays GREEN — correctly independent of this kill-switch).
- **Full `npm run gate` — GREEN 22/22** (H-S2..H-S24). Regressions: none. Newly-fixed: none. Known-failing:
  none. **H-S6 (host TF fan-out), H-S2/H-S3 (ownership), H-S21/H-S23 (own-switch acquire) all PASS.**
- `node --check` clean on every edited JS in **both** trees; **lints clean**.
- **SHA256 — every edited mirror pair byte-identical:**
  `chart.js` = `1B8B04F666C1A4834C417EBF29AA20B64E07A29E28F2DF05E393B356DCFF0EAD`;
  `multichart-prod/panel-cmd-bridge.js` = `CA1F6DBA73B1E9295138C42DCA72000A803DB3D0E038580F9494B03A41F3B7BB`;
  `multichart-prod/harness/scenarios.mjs` = `970D53D6A4F9A676D38A5BF30D2CC9C6A2A71C01EFCF89E175D7115B4C30DE14`;
  `multichart-prod/harness/known-failing.json` = `D0846720E1A4403C76AD9E10164641A843A86478D8E438CA9C1365936FEEC0AE`
  (plus the b97 bump HTML/sw mirror pairs — all EQ=True).
- **ONE build bump** b96 → `20260707b97` via `bump-dist-v9-cache.mjs`; **0 `20260707b96` stragglers** in
  shipped files.
- **No security guard / SW-lifecycle logic / `gate.mjs` / `.github/workflows/security.yml` touched** (only
  the standard `SW_VERSION` cache-string bump).

**PENDING:** PO live re-test on deployed **b97** — during active replay, switch the HOST (or any panel) from
a coarse TF to a finer one; same-pair peers must adopt the new TF instantly by mirroring, with **no**
cross-panel data re-fetch (network idle on peers).

### Root disposition of the stale `_mcCommittedNativeRawFetchTf` (D-046 follow-up #1)

The b97 guard routes **around** the stale marker on the fan-out mirror decision only; the marker itself
(`host._mcCommittedNativeRawFetchTf`, sole writer `_emitMultichartHostDataCommit` `chart.js:3731`) stays
stale after a client-resample fan-out back to a finer TF. That marker is the shared source read by
`_readCommittedHostStateForFinerOwner` (`chart.js:3440`) → `_multichartFinerSamePairPanelSelfOwns`, which has
**~20 consumers** (lazy-1m-master gate, viewport-load, replay-coverage, TF-switch begin, etc.), so the
staleness is broader than the one path we guarded.

**Should `_emitMultichartHostDataCommit` also fire on client-resample fan-out commits (fix at source)? Not
as-is — and the reason is ledgered so nobody "fixes" it naively:** a full emit dispatches the
`talariaMcHostDataCommit` event (`chart.js:3749`), which **every** finer-owner panel consumes via
`_mcFinerPanelHostCommitHandler` → `_applyFinerPanelHostCommit` (`chart.js:3687`) → a **B8 owner handover /
re-acquisition**. Firing the full commit on every resample fan-out would therefore trigger B8 handover
fetches on every fan-out — re-introducing the exact cross-panel storm from a different door.

**Recommended source cure (requires a Director ruling before shipping — NOT shipped):** split the commit into
(a) a cheap **marker refresh** (`_mcCommittedNativeRawFetchTf` / `_mcCommittedTimeframe` /
`_mcCommitGeneration`) and (b) the **handover-event dispatch**; fire only (a) on a client-resample fan-out so
the marker is fresh for all ~20 consumers **without** any B8 handover. Until that lands, the b97 route-around
is the mitigation for the one consumer (the fan-out mirror decision) proven to misfire; the remaining
consumers read the marker predominantly during a panel's own operations and it self-corrects on the next real
host commit, so the interim exposure is bounded — but this is a mitigation, not a cure.

**LEDGER (do-not-regress):** do NOT call `_emitMultichartHostDataCommit()` on a resample fan-out to "fix" the
staleness — it dispatches `talariaMcHostDataCommit` → `_applyFinerPanelHostCommit` → B8 handover fetches on
every fan-out = storm. Split marker-refresh from event-dispatch instead.

## 6cl. A7/A8/A11 batch — Fix A (same-TF play-follow X-jump) SHIPPED; Fix B (coarse follow Y-rescale) NOT-REPRODUCIBLE (D-048, build 20260707b98)

**What changed / proof / what PO tests:**
1. **Shipped Fix A only** — same-TF same-pair panels now follow the playhead with the EXISTING eased
   sub-candle offset instead of the bar-quantized one (X no longer freezes-then-leaps 1 candleSpacing/bar).
   Kill-switch `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` (default = fix ON).
2. **Proof:** new **H-S25** RED-first, flake-stable ×3 — GREEN `PASS×3` (eased motion, ~1 device-px/step,
   `_mcPlayFollowRenders>0`); RED (`--bugswitch=…SAMETF_PANEL_PLAY_EASED_FOLLOW`) `FAIL×3`
   (`changedFraction=0.077`≈1/13 steps, each step `|Δ|=candleSpacing=7.002px`, `followRenders=0`). Full
   `npm run gate` **GREEN 23/23** (22→23; all prior BL scenarios PASS).
3. **PO tests:** during replay PLAY with sync OFF, a same-pair SAME-TF panel should scroll the play viewport
   **smoothly** in lock-step with the host (no per-bar horizontal jump).

### Fix B reported NOT-REPRODUCIBLE (per the "do not force it" clause) — Fix B code REVERTED, H-S26 REMOVED

The Y-rescale defect (coarser same-pair panel's Y span ballooning ~292% during the BL-11 follow recenter)
**does not reproduce in the harness**. A follow-attributability probe on the coarse panel's `yScale` domain
span across 75 host play-frames returned a **byte-identical** trajectory in all three configurations —
fix ON, fix OFF (`--bugswitch=…COARSE_PANEL_FOLLOW_YHOLD`), and follow entirely disabled
(`__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW`):

```
span[C] = 0.01062, 0.04159, 0.04159, 0.04159, …  (identical across all 3 configs)
```

The span makes a **single monotone step to steady-state on the first play frame and never moves again** — a
first-frame acquire/seek settling artifact (the panel's initial narrow view widening to its true 1h window),
**not** the transient "balloon-then-settle" the DIAG describes. Because the harness fully settles the coarse
acquire **before** play, it never exercises the "refit while still acquiring history during play" window that
the live defect lives in. The candidate Fix B (freeze `autoScale` across the follow recenter) therefore
changed **nothing** measurable in the harness, so shipping it would be an unverifiable, un-RED-backed change.
Per the standing directive it was **reverted** and **H-S26 was removed** (scenario + `known-failing.json`
registration, both trees). **This points to a live layout the harness does not cover** (a coarse panel whose
history is still acquiring at the instant PLAY begins); recommend a follow-up that either (a) extends the
harness to enter PLAY *during* coarse acquire, or (b) re-scopes Fix B to the acquire-render path once a
reproducing harness cell exists.

### RULE 4 — state-matrix (before code), verified against the DIAG (no contradicting cell)

Per cell: **X behavior · Y behavior · which fix touches**. Sync OFF unless noted.

| relationship | replay | X behavior | Y behavior | fix touching |
|---|---|---|---|---|
| **same-TF** | **playing** | was bar-quantized leap/bar → **now eased sub-candle** | tracks host (benign) | **Fix A (X only)** |
| same-TF | paused | BL-8 dedup viewport hold (unchanged) | host-tracked (unchanged) | none (gated on play) |
| same-TF | either, **sync ON** | range-synced adopt host offset (unchanged) | unchanged | none (gated `!rangeSync`) |
| coarser | playing | BL-11 eased follow recenter (unchanged) | live: refit balloon (**target of Fix B**) | Fix B — **NOT SHIPPED** (not reproducible) |
| coarser | paused | unchanged | unchanged | none |
| finer | either | unchanged (BL-15 acquire) | unchanged | none |
| independent | either | own viewport (unchanged) | own axis (unchanged) | none |

No cell that the DIAG marks untouched (paused same-TF, range-synced, finer, independent, any coarser/finer X)
is altered by Fix A. Fix A is gated on **play + `!rangeSyncOn` + this same-TF `forceSamePairParentDataMirror`
call site**; every other path falls through to the original quantized/prev-offset branch unchanged.

### Fix A — implementation (helper reuse, no new easing math)

- **file:line:** `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1254-1300`
  (`forceSamePairParentDataMirror` follow block). Reuses the EXISTING
  `_panelPlayFollowContinuousOffsetX(ch, rs)` (defined `:1604`, same helper BL-13 wired into
  `maybePanelPlayViewportFollow`) at `:1272` — **no new easing math**. Applies the same
  device-pixel-column coalesce (`Math.round(offset*dpr)` compare against `_mcPlayFollowAppliedOffsetX`) used
  elsewhere; bumps `_mcPlayFollowRenders` and repaints once per device-pixel column; sub-pixel/stationary
  frames re-pin without repaint. Falls back to the original `getReplayAutoScrollState` quantized / hostOffset
  / prevOffset chain when the eased offset is non-finite or the kill-switch is ON.
- **kill-switch:** `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` (default = fix ON; ON-flag reverts to
  the bar-quantized follow). Mirrored byte-identically to `homepage/public/chart/…`.

### Verification / report-back

- **RED vs GREEN, flake-stable ×3 (H-S25):** GREEN `PASS,PASS,PASS`; RED `FAIL,FAIL,FAIL`
  (`changedFraction=0.077`, `maxStepDeviceDelta=7.002px==candleSpacing`, `followRendersDelta=0`).
- **Full `npm run gate` — GREEN 23/23** (H-S2..H-S25). Regressions: none. Known-failing: none. All prior
  BL-10..BL-18 scenarios (H-S17/18/19/19b/20/21/23/24 + H-S22) PASS.
- `node --check` clean on every edited JS in **both** trees; JSON parses; lints clean.
- **SHA256 — every edited mirror pair byte-identical (EQ=True):**
  `multichart-prod/panel-cmd-bridge.js` = `40B8F633B7C24C962463C12DF14CA783CEE3A3823F7CC24FAE140E842E8CA92E`;
  `multichart-prod/harness/scenarios.mjs` = `98DF69FDF130574792E62AACD2AB6EAA2A27E23D0758B29072257A9B22D665A7`;
  `multichart-prod/harness/known-failing.json` = `F1B313691CF7422CB5982637A21582822EC90B53CBA8EB0572855327D0C8770C`
  (plus all b98-bump HTML/sw mirror pairs — dist-v9 index/sw, chart/sw.js, legacy-index, chart-embed — all EQ=True).
- **ONE build bump** b97 → `20260707b98` via `bump-dist-v9-cache.mjs`; **0 `20260707b97` stragglers** repo-wide.
- **No security guard / SW-lifecycle logic / `gate.mjs` / `.github/workflows/security.yml` touched** (only the
  standard `SW_VERSION` cache-string bump).

**PENDING:** PO live re-test on deployed **b98** — (1) A7/A8/A11 same-TF: during replay PLAY (sync OFF) a
same-pair SAME-TF panel must scroll smoothly with the host, no per-bar X jump. (2) Fix B (coarse Y-rescale) is
**NOT in b98** — the coarse-panel Y balloon is a harness-uncovered layout (PLAY starting mid-acquire); needs a
reproducing harness cell before a scoped fix ships.

## 6s. [SUPERSEDED] CROSSROADS — B-FIX-3c direction (see ESC-007)

**SUPERSEDED by D-016.** ESC-007 resolved to Option B (remove the 1m-master tax at source via
lazy display-TF/1m hydration), NOT the "B-FIX-3c re-enable viewport-first" path this section
proposed. Viewport-first stays default-OFF permanently (D-013/D-015). Kept as a stub only so
prior section references resolve; the live plan is §6t→§6x. (Note: this section sits out of
numeric order at file end for the same reason — do not append below it; append after §6x.)
