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

## 6s. [SUPERSEDED] CROSSROADS — B-FIX-3c direction (see ESC-007)

**SUPERSEDED by D-016.** ESC-007 resolved to Option B (remove the 1m-master tax at source via
lazy display-TF/1m hydration), NOT the "B-FIX-3c re-enable viewport-first" path this section
proposed. Viewport-first stays default-OFF permanently (D-013/D-015). Kept as a stub only so
prior section references resolve; the live plan is §6t→§6x. (Note: this section sits out of
numeric order at file end for the same reason — do not append below it; append after §6x.)
