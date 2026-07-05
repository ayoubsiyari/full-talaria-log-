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

## 6s. [SUPERSEDED] CROSSROADS — B-FIX-3c direction (see ESC-007)

**SUPERSEDED by D-016.** ESC-007 resolved to Option B (remove the 1m-master tax at source via
lazy display-TF/1m hydration), NOT the "B-FIX-3c re-enable viewport-first" path this section
proposed. Viewport-first stays default-OFF permanently (D-013/D-015). Kept as a stub only so
prior section references resolve; the live plan is §6t→§6x. (Note: this section sits out of
numeric order at file end for the same reason — do not append below it; append after §6x.)
