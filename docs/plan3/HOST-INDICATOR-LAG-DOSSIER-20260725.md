# Host-Chart High-Speed Indicator Lag — Blocking-Issue Dossier

Date: 2026-07-25, 11:00 · Rev 2.4 (2026-07-27, 00:30) · Author: Director · Audience: PO + external advisor + manager
Companion file: `PLAN3-PROGRESS-REPORT-20260725.md` (whole-plan status)

> **Rev 1.1:** §11 added — answers to the three advisor confirmation requests (candle paint path, backup-timer state classification, M21-2 scaffold inertness) plus the resulting suspect re-ranking. The candle-path answer **changes the leading hypothesis**: read §11.1 before acting on §4/§5.
>
> **Rev 1.2:** §12 added — Advisor Addendum 2 grep results. M-a (watchdog constant) and M-b (idle-callback gating) both came back **negative**; the diff review instead named a third mechanism, **M-c (full-async coalesce chain)**, now the leading candidate. §12 includes a sharpened one-reload discriminator for the PO and two live console counters that already exist in the build.
>
> **Rev 1.3:** §13 added — Advisor Addendum 3 responses. Git-history answer to "why is a single EMA slower than pre-b63": **B62 widened family-3 endpoint ownership** (classification diff, code-verified). This also exposes a **tension with the live B62-OFF exoneration** that must be re-tested; §13.2 gives the exact re-run protocol. Guardrails G1–G3 adopted into the fix lane's acceptance.
>
> **Rev 1.4:** §14 added — Advisor Addendum 4. The synchronized SMA+EMA jumps are now **code-explained** (the exact-tail memo is transaction-wide, not per-indicator); the 10× observation and the speed-cap question are recorded with the advisor's position adopted; the pending-evidence table is updated (E3′/E4′/E6′).
>
> **Rev 1.5:** §15 added — Advisor Addendum 5. Rev 1.4 endorsed in full; **G4 granularity invariant** specified (accounting unit = indicator *instance*, all series publish atomically from one version) and the G4 acceptance session fixed as killzone + SMA + VWAP. Post-close housekeeping order recorded.
>
> **Rev 1.6 (TRIAGE CLOSED — BUILD AUTHORIZED):** §16 added — PO confirmation-set results and advisor verdict. Mechanism confirmed armed at 100× / disarmed at 10×; Fact 1 (original B62-OFF exoneration) formally **downgraded to "unreproduced, presumed confounded"**; E3′ (SMA alone jumping) recorded as an open characterization question with a churn working hypothesis. **Two-lane build authorized** per §16.4. PO live-testing window is closed; all remaining verification is lab-side.
>
> **Rev 1.7 (CKPT-023/b66 FAILED — DIAGNOSIS REOPENED):** §17 added. The Lane-1 fix shipped as b66 produced **no observable improvement** at 60× on the host (panels clean) — M19-I family-tail ownership is **not the primary cause**. b66 is NOT promoted; b65 preserved as rollback; all work TEST-only. §17 also corrects a mode-scoping error in §11.1 (the 60× host path is FAST MODE, a third path the earlier trace never covered) and names a concrete host-only per-frame asymmetry as the new prime suspect. **No further fix is accepted without a harness that reproduces the host-only visual lag first.**

## 1. Symptom (as observed live by the PO on TEST build b63)

During replay at high speed on the **host** chart, with indicators active:

- Price/candles advance continuously and smoothly.
- **Indicator lines freeze, then jump to catch up, on a strikingly regular ~4–5 second cadence.** Between jumps the indicator tail visibly detaches from the moving price.
- Multichart panels do **not** show the cadence (panels stay in sync).
- The PO also reports overall multichart is "very slow and laggy" on b63, and separately that the lag on the chart appears uniform — both to be re-verified after the cadence issue is isolated, because a stuttering host can drag the whole sync fan-out with it.

This is a **regression relative to b61 feel** (b61 had the indicator-value-staleness bug, but not a metronomic multi-second repaint cadence).

## 2. Why this blocks everything

1. It fails the PO feel-test, which is the sprint's binding acceptance gate — no M2 milestone claim is possible.
2. It contaminates every before/after measurement: measurement 1a on b63 cannot be compared with baseline until repaint behavior is sane.
3. It sits in exactly the subsystem (replay render/indicator pipeline) that most of the remaining M20/M21 work builds on, so continuing to stack fixes on top of it would recreate the bug-loop this sprint exists to end.

Correct response, already in force: **all other ticket lanes hold; the manager's single active lane is this dossier's switch-matrix triage.**

## 3. What we already know (established facts)

| # | Fact | How established |
|---|---|---|
| 1 | ~~The cadence is **not caused by B62**~~ — **DOWNGRADED at Rev 1.6** to "unreproduced, presumed confounded" (see §16.2): the original toggle run predated read-back discipline, the E6′ retro shows no cumulative types were loaded (killing the legacy-trigger account), and the flagged E6 re-run showed the trigger demonstrably disarms. | Original: PO live toggle. Downgrade: §16 confirmation set. |
| 2 | The cadence is host-only; panels are smooth. | PO observation. Strongly narrows the suspect list: the guilty code path must be gated on `!isPanel` / non-embed. |
| 3 | The cadence is time-regular (~4–5 s), not data-regular. | PO observation. Suggests a timer/backpressure/coalescing loop, not a per-N-bars gate. |
| 4 | b63 provenance is verified end-to-end (source tag → digests → authenticated runtime tripwire incl. panel iframe). | Deploy evidence. "Stale bundle" is excluded as an explanation. |
| 5 | The b63 delta vs b61 = A1, Q8, Q6, favorites/timezone teardown APIs, B62, dormant M21-2 scaffold, login fix — **plus** the earlier-committed Q1/Q2/Q9 which were already in the branch. | Deploy manifest. |

## 4. Suspect list (ranked) and mechanism analysis

All anchors are in `chart v 1.4/chart/`.

### S1 — M20-Q2: countdown idle-render replacement (PRIME SUSPECT)

- What it changed: the forever-`animate()` rAF used to fire a **full `scheduleRender()` about once per second** for the bar-close countdown. Q2 replaced that with a suspended/region-paint path (`_tickBarCloseCountdown`, `chart.js` ~31005; enable check `_m20Q2CountdownIdleFixEnabled`, `chart.js` 30994).
- Host-only: yes — `_tickBarCloseCountdown` returns immediately for embed panels (`chart.js` 31006–31008). **Matches fact 2.**
- Mechanism hypothesis: before Q2, the ~1 Hz full render was **masking** the indicator pipeline's own repaint gaps — even if the async indicator recalc lagged, a full render every second repainted the indicator layer with whatever data existed, so staleness never accumulated visibly. With Q2 ON, during replay the countdown only region-paints the price badge; **if the replay tick path itself fails to trigger full renders after indicator updates arrive, nothing else repaints the indicator layer** until some slower coalesced event fires — producing a visible multi-second cadence.
- Note: this predicts Q2 is the *unmasker*, not necessarily the root defect. The root defect would then be "indicator recalc completion does not reliably schedule a render on the host at high speed" — with the 4–5 s period coming from whatever backstop still fires (see S3/S4).
- Kill-switch to test: `window.__TALARIA_DISABLE_M20_Q2_COUNTDOWN_IDLE_RENDER_V1 = true`.

### S2 — M20-Q1: v9 time-controls sync observer (replaced 600 ms DOM poll)

- Host-only: yes (`chart.js` 1583–1587, gated `!this.isPanel`). Matches fact 2.
- The old 600 ms poll also had render side effects in some paths; the strong review already flagged Q1 edge defects (rework lane open). Lower prior than S1 because its cadence signature would be sub-second, not 4–5 s, but the observer's failure mode (missed mutations → no updates until a fallback) could be slow.
- Kill-switch: `window.__TALARIA_DISABLE_M20_Q1_V9_TIME_SYNC_OBSERVER_V1 = true`.

### S3 — Indicator worker backpressure/coalescing loop

- `scheduleReplayIndicatorRecalc` (`modules/chart-indicators-full.js` 9455) gates worker sends during play; `recalculateIndicatorsIncremental` coalesces while a worker round-trip is in flight.
- At 60–100× speed the worker send→clone→compute→ACK→apply loop can saturate; if the "busy → remember one pending → re-send on ACK" chain drops a link (e.g. an ACK path that applies data but does not schedule a render, or a pending flag cleared without re-send), updates would batch up until an independent backstop flushes them. A stable 4–5 s period is plausible if the flush rides on a slow timer or on bar-boundary events at the replayed timeframe.
- This suspect is **not switchable** independently — it is the b61-era pipeline plus B62's tail bridge (already exonerated as B62-specific, but the *shared* pipeline remains suspect).

### S4 — Q9 prefix-slice reuse / layer-cache fingerprint

- `drawIndicatorsOptimized` keeps an offscreen indicator layer and skips re-composition when its fingerprint (viewport + data version) is unchanged. If a data update path fails to bump the version at high speed, the cached layer is re-blitted stale, and only a fingerprint-changing event (viewport shift crossing a threshold, autoscale change) forces a rebuild — visually identical to "indicator freezes then jumps".
- Interacts with S1: pre-Q2, the 1 Hz full render also went through the fingerprint check, so this alone doesn't explain the b61→b63 change unless combined with a version-bump miss introduced in this window.

### S5 — Ambient load from the new b63 residents (A1, Q8, Q6, M21-2 dormant scaffold)

- Lowest prior: these are off-hot-path or dormant, each kill-switched. Worth one matrix row each only after S1/S2 are cleared.

## 5. What the 4–5 s number itself tells us

No timer in the suspect set is literally 4–5 s, which is why the leading composite hypothesis is:

> The replay indicator pipeline on the host stopped getting "free" repaints (Q2 removed the 1 Hz backstop), and its own completion→render link is broken or starved at high speed; the visible period is the **beat frequency** of whatever still flushes (coalesced worker ACK bursts, bar-boundary full paints at the replay timeframe, or autoscale-triggered fingerprint changes).

This means the fix is likely **two-part**: (a) restore a guaranteed render after every applied indicator update on the host (root cause), and (b) keep Q2's idle-render savings — do **not** simply revert Q2 and re-mask the defect.

## 6. Live switch-matrix protocol (manager's active lane)

Run on TEST b63, same session, same symbol/timeframe/speed, one variable at a time; record cadence present/absent per row:

| Row | Console setting | Tests |
|---|---|---|
| 0 | (all defaults) | reproduce baseline cadence |
| 1 | `__TALARIA_DISABLE_M20_Q2_COUNTDOWN_IDLE_RENDER_V1 = true` | S1 |
| 2 | `__TALARIA_DISABLE_M20_Q1_V9_TIME_SYNC_OBSERVER_V1 = true` | S2 |
| 3 | rows 1+2 together | interaction |
| 4 | B62 switch (already done — cadence persisted) | S-B62 exonerated |
| 5 | remaining b63 switches one by one (A1/Q8/Q6/teardown APIs) | S5 |

Reload between rows; each row needs ~30 s of high-speed play with ≥1 indicator. If **no single row** kills the cadence, the defect is in the unswitchable shared pipeline (S3/S4) and we go straight to instrumentation (§7).

## 7. Instrumentation to demand before any code fix (advisor input)

The advisor's standing rules for this sprint apply with full force here: **measure what the user sees, and let a RED probe reproduce the symptom before writing the fix.** Concretely:

1. **Per-second counters on the host during 60× play** (console snippet, no build needed): count of `scheduleRender` calls, of actual `render`/draw executions, of `recalculateIndicatorsIncremental` entries, of worker ACK applies. The broken link is wherever a counter goes to ~0 between jumps.
2. **Worker round-trip latency histogram** at high speed: if round trips are >1 s each, this is a throughput problem (S3) and the fix is send-rate shaping/tail-only payloads, not render plumbing.
3. **Cadence oracle**: a RED test that plays N bars at high speed and asserts the painted indicator tail (value/Y, reusing the B62 oracle) is never more than K bars behind painted price. This is the acceptance instrument for whatever fix ships — it also permanently guards against re-masking, which is how b59–b61 produced false greens.

## 8. Ranked candidate fixes (pending triage outcome)

1. **If S1 confirmed (Q2 row kills cadence):** keep Q2, but add an explicit "render-after-indicator-apply" guarantee on the host replay path — every applied worker result or sync recalc during play must schedule a render (coalesced to rAF). Q2's savings were for *idle*; replay is not idle.
2. **If S3 (pipeline starvation):** shape the send rate (tail-window payloads at high speed instead of full-series clones; drop-intermediate policy keeping only the newest pending), and assert the ACK path always ends in a scheduled render.
3. **If S4 (fingerprint miss):** bump the indicator layer data-version on every applied result, and add a unit gate that a data apply always invalidates the layer cache.
4. **If S2 (Q1):** fold into the already-open Q1 rework lane with the cadence oracle added to its acceptance.
5. **Multichart slowness follow-up:** after the host cadence is fixed, re-test panel smoothness in the same session before opening a separate ticket — a stuttering host starves the sync fan-out, so panel lag is likely secondary.

## 9. Advisor suggestions on process (incorporated)

- **Do not revert Q2 as "the fix."** A revert that re-masks a broken render link would be the exact bug-loop pattern (symptom disappears, cause remains) this sprint was chartered to end. Revert is acceptable only as a *temporary* tester-relief measure, clearly labeled, with the root-cause lane still open.
- **One variable at a time, live, before any rebuild.** The switch matrix costs minutes and produces causal knowledge; rebuilding on a guess costs a deploy cycle and produces none.
- **The cadence oracle becomes a permanent gate.** Add it to the anti-lag CI gate (progress report §2, last row) so no future change can reintroduce a repaint starvation silently.
- **Keep the b61 rollback offer open for testers** if triage exceeds a day — tester throughput is also a sprint resource.
- **After the fix: re-run measurement 1a like-for-like** (60× verified engaged, same playback state) before making any before/after performance claim.

## 10. Acceptance criteria for closing this issue

1. Switch matrix (or instrumentation) identifies a single causal mechanism, written up with evidence.
2. A RED cadence-oracle run reproduces the symptom on the pre-fix build/switch state.
3. The fix turns that oracle GREEN with Q2's idle savings still ON (no re-masking), behind its own kill-switch.
4. PO feel-test at high speed on host + panels: no visible indicator detachment, no metronomic jumps.
5. Cadence oracle added to the permanent gate suite; measurement 1a re-run recorded.

## 11. Rev 1.1 — Answers to the advisor addendum (code-verified)

### 11.1 Confirmation A: which path paints candles during high-speed replay?

**Answer: the shared full render — and it runs on every tick frame.** Verified chain:

1. Every tick frame ends in `updateChartWithAnimatedCandle()` (`modules/replay-system.js` 6309), which routes the frame through `applyMultichartMirrorFrame(detail)` (7904) — the host and panels share this apply path.
2. The apply slices/patches the forming bar into `chart.rawData`/`chart.data` and **calls `chart.bumpDataVersion()` every frame** (8074, 7965, 8156).
3. It then calls `_finishMultichartMirrorRender(chart)` (7615), which ends in a **direct synchronous `chart.render()`** (7704–7711) — the full render, not a dedicated candle blitter.
4. The same function also calls `_scheduleReplayIndicatorRecalc()` every frame (7702; also 6334).

**Consequences — the advisor's deduction resolves to branch 2, with a refinement:**

- Full renders are NOT starved during play; they run at frame rate. **S1 (Q2 countdown) is demoted:** its removed ~1 Hz backstop render is negligible next to a per-frame `chart.render()`, and that extra render never refreshed indicator *data* anyway. Q2 stays in the matrix only as a cheap falsification row.
- Because `dataVersion` bumps every frame, the indicator **layer** likely recomposes every frame too — from **stale indicator result arrays**. The starvation is upstream of both the render and the layer cache: **worker recalc results are being applied only every ~4–5 s.**
- **New co-prime suspects: S3 (worker/recalc pipeline backpressure) and S4 (apply-side versioning), jointly.** The schedule side fires every frame; the dead link is between `_scheduleReplayIndicatorRecalc()` and an applied result. Note this pipeline was refactored in the B62 window — the B62 kill-switch exonerates B62's *own* tail bridge but the switch-OFF path still runs **shared** refactored scheduling/coalescing code (`scheduleReplayIndicatorRecalc`, `chart-indicators-full.js` 9455; coalescing in `recalculateIndicatorsIncremental`). That shared code is now the prime search area.
- **Decisive instrumented run (replaces beat-frequency inference):** three separate per-second counters during 60× play — (a) `render()` executions, (b) indicator-layer recompositions, (c) worker-result applies. Expected signature: (a) at frame rate, (c) at ~0 between jumps. Whichever of (b)/(c) tracks the 4–5 s period localizes the defect to layer-cache vs. recalc pipeline in one run. Tag the stack on each (c) event per addendum §B — the flush trigger names itself on the first jump.

### 11.2 Confirmation C: backup-timer playing-state classification

**Answer: replay IS classified as playing — the 5 s misclassification hypothesis is refuted.** The throttle check is `playing = !!(this.replaySystem && this.replaySystem.isPlaying)` (`chart.js` 11387–11390), and replay play sets `isPlaying = true` in both candle-by-candle and tick-animation modes (`replay-system.js` 918, 4467). During replay the backup runs on the **20 s** interval, which cannot produce a 4–5 s cadence. Residual note: each 20 s write is a full journal stringify on the main thread — a candidate for a once-per-20 s *hitch*, worth one glance in the instrumented run, but not this bug.

### 11.3 Confirmation E1: M21-2 scaffold inertness

**Answer: statically inert, confirmed.** `m21-2-candle-offscreen-bridge.mjs` and `workers/m21-2-candle-render-worker.js` are imported by **no product file** — zero references from `chart.js`, the HTML entry points, or any product module; the only importers are the scaffold's own tests, harnesses, and gate fixtures. Unwired means unloaded: no worker spawn, no rAF, no listeners. S5 row for M21-2 can be skipped.

### 11.4 Addendum items D, E2, F — adopted as written

- **D (fix placement):** the render-after-apply guarantee moves **inside the apply function** — any applied indicator result (worker ACK or sync recalc) must bump the indicator-layer version and schedule a coalesced rAF render in the same function. The unit gate asserts that invariant directly.
- **E2:** the Q1/Q2/Q8/Q6 rework lanes each inherit a cadence-oracle run in their acceptance criteria.
- **F:** the W5 measurement wrapper must hard-assert and record scenario state (speed engaged + verified, playing state, session shape) per row, refusing to emit on mismatch.

### 11.5 Updated matrix guidance (superseded in part by §12)

The matrix (§6) still runs — it is cheap and falsifies cleanly — but with re-ranked expectations: rows 1–2 (Q2/Q1) are now expected NOT to kill the cadence; M21-2's S5 row is dropped (§11.3); and the **instrumented run of §11.1 is promoted to co-first action** alongside row 0, since it localizes the defect in one pass. Per addendum §C, timestamp every jump in every row; a *changed* period under a toggle marks a contributor, not an innocent.

## 12. Rev 1.2 — Advisor Addendum 2: grep results and the M-c mechanism

### 12.1 M-a (3–6 s watchdog constant): NEGATIVE

Grepped `chart-indicators-full.js` and the replay scheduling path for timeout constants in the 3000–6000 ms range: the only hits are date math (ms-per-day/week conversions). No `setTimeout` watchdog, no `Date.now()` age check on the busy flag. The busy-flag lifecycle (`_indicatorWorkerBusy` / `_indicatorWorkerCoalesce`) sets and clears in paired sites (`chart-indicators-full.js` 10279–10311) with the clear inside `finishIncrementalPass`, which also re-triggers the coalesced follow-up. No watchdog exists whose value could *be* the 4–5 s period.

### 12.2 M-b (idle-callback gating): NEGATIVE

Four `requestIdleCallback` sites in `chart.js` (7399, 8419, 8595, 9134): three are symbol/timeframe **prefetch** paths, off the indicator pipeline entirely; the fourth is `_deferRecalculateIndicators` (8413), whose idle-callback branch is dead code in the product — its first branch routes to `scheduleIndicatorRecalc`, which always exists. Nothing on the send or apply path waits for idle.

### 12.3 M-c — the full-async coalesce chain (NEW, leading candidate)

The diff review the addendum ordered (checklist item 1–3) surfaced a mechanism neither M-a nor M-b anticipated. The pipeline classifies every active indicator into three families:

1. **Sync-only** (sessions, killzones, ICT/Talaria structural types, `M19I_SYNC_ONLY_TYPES`, 8885): recomputed synchronously on the main thread every pass — should never lag.
2. **Sync-exact tail families** (`M19I_B62_SYNC_FAMILIES`, 8817): SMA, WMA, HMA, Bollinger, envelope, stddev, ROC, momentum, Williams %R, MFI, CMF, Donchian(offset 0), stochastic, AO — the coherent bridge commits their exact tails at tick time.
3. **Everything else** — including **EMA, MACD, RSI, ATR, ADX, Keltner, CCI, aroon, and all cumulative types**: tail-eligible for the worker, but their *exact endpoint publication is owned by a full-history async pass*. When such an indicator is active, the pass sets `needsFullAsync`/`_m19iCoalesceFullAsync` (10400–10426), and `finishIncrementalPass` responds by launching a **full `recalculateIndicatorsAsync()`** (10300–10305). While that full pass runs, every tick merely sets the coalesce flag; when it completes, the *next* full pass launches immediately.

**Predicted signature:** painted endpoints for family-3 indicators update once per full-pass completion — a back-to-back chain of full-history recomputes whose duration (large replay history × active indicator count) plausibly *is* the observed 4–5 s. Candles stay smooth (per-frame render, §11.1), sync-only and sync-exact families stay glued, and the EMA-class line freezes and jumps on the chain period. This is the advisor's branch (ii) — sends flowing, round trips slow — but of the **full-pass** variety, so send-rate shaping alone would not fix it; the period would scale with loaded history, which is testable.

It also survives the B62 exoneration cleanly: the family-3 routing is shared M19-I code, active regardless of the B62 kill-switch.

### 12.4 Sharpened one-reload discriminator for the PO

Upgrade of the addendum's sync-vs-worker test — three indicators in one high-speed session: **one sessions-type (family 1), one SMA (family 2), one EMA (family 3)**.

- Only EMA jumps on the cadence → **M-c confirmed** (family-3 full-pass chain).
- SMA also jumps → coherent bridge itself failing (check `mergeRejects`, below).
- All three jump, sessions included → defect upstream in the shared scheduler entry; refocus the diff.

**Zero-instrumentation console evidence, available in b63 today:** after ~30 s of high-speed play, read `chart._m19ifStats` in the console — the pipeline already counts `bridgePasses`, `mergeRejects`, and `fullAsyncFallbacks`. A `fullAsyncFallbacks` counter climbing once per ~4–5 s is M-c's fingerprint, no rebuild needed.

### 12.5 Fix shapes if M-c confirms (for the manager's lane, RED-first, switched)

1. **Decouple painted tips from full-pass completion:** during play, let the coherent bridge commit converged tail values for family-3 *tail-safe* types (they are in `M19I_TAIL_SAFE_WORKER_TYPES` precisely because a lookback window re-seeds them within numeric noise), and demote the full pass to a periodic silent reconciler instead of the endpoint owner.
2. **Break the chain:** rate-limit the coalesced full-async relaunch (keep-newest, minimum interval) so it cannot run head-to-tail; combine with (1) so correctness never depends on its cadence.
3. Either way, the fix lands with the apply-site guarantee of §11.4-D and the cadence oracle as its acceptance instrument; the oracle's K-bars-behind bound is checked against family-3 indicators specifically.

## 13. Rev 1.3 — Advisor Addendum 3 responses

### 13.1 Classification-diff answer: B62 widened family-3 (code-verified in git history)

The advisor's follow-up grep hit. In the parent of the D-034 bundle commit (`f38333b95^` — the b61-era module, zero B62 references), the full-async chain machinery **already existed**, but `needsFullAsync` had exactly ONE trigger: `!_m19iIndicatorTailSafe(ind)` — i.e. only genuinely cumulative/whole-history types. **EMA, MACD, RSI, ATR are tail-safe, so pre-b63 they never entered the chain**; their tips painted from the bridge/worker tails every tick (smoothly — but with the value-staleness defect B62 was built to fix).

B62 added a second trigger (current code, `chart-indicators-full.js` 10404–10412): when the paint-time hook rejects a stale tail for a **non-sync-exact family** and requests fresh data (`_m19iB62EnsureFreshAsync` → `_m19iB62PendingFreshFp`), every subsequent incremental pass forces `needsFullAsync`. Since EMA/MACD/RSI/ATR are tail-safe but NOT in `M19I_B62_SYNC_FAMILIES`, **B62 moved their exact-endpoint ownership into the full-async chain** — during continuous high-speed play the memo re-arms every forming change, so the chain runs continuously.

This answers the addendum's question precisely: **a single EMA is slower than pre-b63 because pre-b63 its tip never rode the full-pass chain at all.** The observed period scaling with EMA count and history length follows directly (each full pass recomputes everything). The fix's restoration scope is confirmed as the advisor suspected: family-3 *tail-safe* types must regain tick-time tip ownership — with G1's epsilon proof replacing the old unguarded (and stale-prone) bridge trust.

### 13.2 The tension this creates — and the mandatory re-test

Fact 1 in §3 says the PO toggled B62 OFF live and the cadence persisted. But the widened trigger of §13.1 is fully gated behind `_m19iExactTailPaintEnabled()`: with the kill-switch set, a session with only EMA + killzone should NOT chain (killzone is sync-only; EMA is tail-safe, so the b61-era trigger never fires). Both observations cannot be simultaneously true of the same mechanism, so one of the following holds: (a) the toggle run was confounded (flag name typo, set after the session state was already chaining, or panel-vs-host console context); (b) another active indicator in that session was genuinely tail-unsafe (cumulative — e.g. VWAP/OBV class), which chains regardless of B62; or (c) M-c is not the whole story.

**Re-run protocol (one session, zero rebuild), added to the triage rows:**

1. Host console: `window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 = true`, then **read it back** to confirm spelling, and confirm you are in the HOST window's console (top frame), not a panel iframe.
2. Indicators: exactly killzone + one EMA. High-speed play ~30 s. Record: cadence present/absent, and `chart._m19ifStats.fullAsyncFallbacks` before/after.
3. Same session, flag removed (`delete window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1`), repeat.

Predictions if M-c-via-B62 is the whole story: step 2 smooth with a flat counter; step 3 cadenced with the counter climbing once per jump. If step 2 still shows the cadence with a flat counter, the painting starvation has a second leg and we go to the four-counter instrumented run before any fix is built.

### 13.3 Evidence rows recorded from the PO's live runs

| Row | Observation | Reading |
|---|---|---|
| E1 | Killzone (sync-only) smooth while EMA jumps, same session | Defect confined to family-3 endpoint ownership; scheduler entry and sync path healthy |
| E2 | Lag grows with more family-3 indicators; single EMA worse than pre-b63 | Period scales with per-pass workload — M-c signature (M-a/M-b would hold a constant beat); the "worse than pre-b63" part is now explained by §13.1 |
| E3 (pending) | SMA leg of the discriminator | SMA smooth = bridge healthy (fix precondition); SMA jumping = bridge defect, fix target moves |
| E4 (pending) | `fullAsyncFallbacks` climbing once per jump | M-c's fingerprint, zero rebuild |
| E5 (pending) | 1/3/5-EMA period scaling + shorter-history period check | Behavioral confirmation on both scaling axes |
| E6 (pending) | §13.2 B62-OFF re-run | Resolves the exoneration tension |

### 13.4 Guardrails G1–G3 — adopted into the fix lane's acceptance packet

- **G1 (numeric-accuracy oracle):** the value/Y oracle gains a per-type epsilon assertion — bridge-painted tip vs full-pass ground truth, across the corpus including high-volatility segments. Types failing epsilon at the default lookback get a longer per-type lookback or remain full-pass-owned with honest truncation. The per-type epsilon table ships in the packet.
- **G2 (silent reconciler):** reconciliation deltas asserted sub-pixel in the oracle run; breaches logged with type name.
- **G3 (kill the chain, not its visibility):** reconciler cadence becomes event-driven/slow-periodic (bar-close, pause, N-second floor) — never self-chaining. The CPU delta is recorded in the scorecard row as a Workstream-B win.

### 13.5 Sequencing (confirmed)

Live confirmations first (E3, E4, E5, E6 — all zero-rebuild, one to two sessions), then the §12.5 fix behind its switch with G1–G3 in acceptance, RED cadence oracle pre-fix, GREEN post-fix with Q2 ON, then the like-for-like measurement-1a re-run. If E3 or E6 surprises, stop and re-triage before building.

## 14. Rev 1.4 — Advisor Addendum 4: synchronized jumps, the 10× observation, speed cap

### 14.1 E-new-1 (SMA + EMA both jump, synchronized) — code-explained, M-c refined

The advisor predicted this must mean a single shared flush, and the code confirms it: **B62's exact-tail machinery is transaction-wide, not per-indicator.** The exactness memo (`_m19iExactTailLastFp`) is one chart-level fingerprint covering the whole active set, and it is published only when **every** transaction member is a sync-exact family — `allSyncExact` is an `.every()` over all active indicators (`chart-indicators-full.js` 10463–10477; contract comment at 10458: "published ONLY when every transaction member is a strictly-sync family"). With one EMA on the chart, no coherent pass can ever publish the memo, the paint hook keeps requesting fresh full passes for the whole set, and **every co-loaded indicator's painted tip — SMA included — waits on the same full-pass completion.** Synchronized jumps are exactly what this produces. E-new-1 therefore *strengthens* M-c rather than contradicting it, and the fix scope gains a requirement: exactness accounting must become **per-indicator (or per-family)** so one recursive type cannot hold the whole chart's tips hostage.

Evidence table update: **E3′ replaces E3 — SMA alone, zero family-3 types.** Smooth → transaction-wide contamination confirmed, bridge healthy, build proceeds. Jumping → defect upstream of classification; stop and re-triage.

### 14.2 E-new-2 (10× imperceptible) — consistent; the burn question

Refresh period is fixed by pass duration; visible detachment = period × price-advance rate, so 10× falls below the visual threshold while the defect persists. **E4′ added:** run `chart._m19ifStats.fullAsyncFallbacks` at 10×. Climbing → the full-history chain burns CPU/GC even when the chart looks healthy — recorded as a Workstream-B waste finding and proof that "looks fine at 10×" ≠ "is fine at 10×". Flat → the staleness rejection arms only above some tick rate; that threshold parameterizes the fix's rate-limit floor.

### 14.3 §13.2/E6 retro addition (E6′)

Record which indicators were loaded during the **original** B62-OFF exoneration run. A genuinely cumulative type (VWAP/OBV class) in that session would explain Fact 1 through the **legacy** trigger (predates B62, ignores its switch) with no confounding — resolving the contradiction and completing M-c as a two-trigger story. EMA-only in that session → the contradiction stands and E6 is decisive.

### 14.4 Consolidated pending-evidence table (all zero-rebuild, live b63)

| Row | Test | Decides |
|---|---|---|
| E3′ | SMA alone (no family-3 types) | transaction-wide contamination vs upstream defect |
| E4 | `fullAsyncFallbacks` during cadence at 100× | M-c fingerprint |
| E4′ | same counter at 10× | silent burn below visual threshold; rate-limit floor |
| E5 | jump period with 1 / 3 / 5 EMAs (+ shorter-history run) | workload scaling, both axes |
| E6 | B62-OFF re-run per §13.2 protocol | resolves the exoneration contradiction |
| E6′ | retro: indicator set of the original exoneration session | may resolve E6 unambiguously |

### 14.5 Speed cap (max 10×) — advisor position adopted as Director ruling

- **As the fix: rejected.** It masks the visible symptom while the chain keeps burning (E4′ will test this directly), concedes a professional-backtester capability against the sprint's stated target, and would be a product ceiling chosen under duress. The dossier's acceptance criteria stand unchanged: oracle RED pre-fix, GREEN post-fix at high speed, Q2 ON, no re-masking.
- **As temporary tester relief: available to the PO** — same category as the b61 rollback: clearly labeled as mitigation, time-boxed to the fix lane, root-cause lane stays open, cadence oracle remains the closing instrument.
- **As a product question: deferred until after the fix lands**, to be decided on user needs — a choice, not a bandage.

### 14.6 Fix-lane scope addition (from §14.1)

The §12.5 fix packet gains a fourth element alongside G1–G3: **per-indicator (or per-family) exactness accounting** — the transaction-wide memo is replaced or subdivided so sync-exact families publish and paint independently of any co-loaded recursive type. The cadence oracle's acceptance run must include the mixed SMA+EMA session specifically, asserting SMA stays glued while EMA is within its K-bar bound.

## 15. Rev 1.5 — Advisor Addendum 5: G4 granularity invariants (binding spec for the fix lane)

Advisor endorsed Rev 1.4 in full (mechanism story complete; speed-cap ruling and confirmation-before-build table proceed as written). The following G4 constraints are **binding** on the fix lane:

### 15.1 G4 accounting unit: the indicator INSTANCE — never a data-series within one

Multi-series indicators (MACD line + signal + histogram; Bollinger mid + bands; stochastic %K + %D) must publish their painted tips **atomically from one data version**. If G4's accounting ever let the MACD line update from the bridge while its signal line waited on a full pass, the painted *relationship* between them — a crossover, a trading signal — would be momentarily false. That is a worse defect than the cadence, because it looks meaningful. Spec statement for the packet: *the accounting unit is the indicator instance; all series of an instance share one version and one publish.*

### 15.2 Coherence regime, stated precisely

- **Within an instance:** strict — one version, one atomic publish (§15.1). The mixed-session oracle run asserts each instance's series all come from the same version, in addition to the per-type value bounds.
- **Across instances during play:** deliberately relaxed — SMA glued, EMA within its K-bar bound, each inside G1's epsilon/bound regime. This asymmetry is intentional and documented, not an oversight.

### 15.3 G4 acceptance session: killzone + SMA + VWAP at high speed

Once §12.5 restores bridge ownership for tail-safe family-3 types, the *realistic* remaining full-pass client is the cumulative family (VWAP/OBV class) — so G4's acceptance test uses exactly the hostage scenario that will actually occur in production: **VWAP honestly slower within its stated bound, while SMA and killzone are completely unaffected.** This session joins the SMA+EMA mixed run in the oracle suite.

### 15.4 Post-close housekeeping order (recorded)

When the confirmation set passes, the fix ships RED→GREEN, and the like-for-like measurement-1a re-run lands, the sprint returns to the wider board in this order: **(1) Q1/Q2/Q8/Q6 rework debt** (deployed fixes with known edge defects — parked correctly, must not be forgotten under the regression's noise; each lane inherits the cadence oracle), then **(2) M21-1 final acceptance → `chart.js` unlock → C2 wiring** — the road to the parity target.

## 16. Rev 1.6 — Confirmation-set results, verdict, and BUILD AUTHORIZATION

PO ran the §14.4 set live on b63 (3-year data range unless stated) and has closed the live-testing window. All remaining verification routes through the manager's instrumented lane.

### 16.1 Results and verdict per row

| Row | Result | Verdict |
|---|---|---|
| E4 (counter, EMA, 100×) | 314→663→943, climbing strongly | **Mechanism armed at 100× — confirmed.** |
| E4′ (counter, 10×) | 1003→1003→1003, flat | **Mechanism disarmed at 10× — confirmed**, the better outcome: no silent chain burn at 10×; the staleness rejection has a tick-rate arming threshold, which parameterizes the fix's rate-limit floor. Fully explains "10× feels fine": disarmed, not imperceptible. |
| E5 (workload/range) | Climbing under every load incl. 3-day range | Mechanism stays armed across loads and ranges. **Does NOT measure period scaling** (see counter semantics below); the period measurement moves to the fix lane's cadence oracle. |
| E6 (B62-OFF re-run) | Flag ON (read-back OK): 14→14 flat. Post-reload no-flag: 4→4 flat. Cadence yes/no not recorded either run. | Flag-ON flat = **the widened trigger demonstrably disarms when the flag is genuinely set.** The post-reload no-flag flat contradicts E4 — most probably the project's own documented pitfall (playback speed not re-engaged after reload, the exact measurement-1a confounder). **Lab E6 under the W5 harness supersedes both PO toggle runs.** |
| E6′ (retro) | Original exoneration session: SMA, EMA, WMA, DEMA — **no cumulative types** | **Legacy-trigger explanation is dead.** |
| E3′ (SMA alone, 100×, 3-year) | **JUMPING** — the surprise row | Open characterization question, see §16.3. Report does not distinguish metronomic cadence from irregular churn stutter. |

**Counter semantics (recorded so nobody divides by it later):** ~330 increments per E4 window is far above one-per-jump — `fullAsyncFallbacks` counts fallback *events* (per-tick diversions), not completed passes. Climbing/flat remains a valid armed/disarmed fingerprint; the counter can never measure the jump period.

### 16.2 Fact 1 formally downgraded

With E6′ eliminating the legacy-trigger account and E6 showing the trigger disarms under a verified flag, the original exoneration (§3 Fact 1) is downgraded from "established" to **"unreproduced, presumed confounded"** — it predated the read-back discipline and is subject to the wrong-frame/typo/mid-chain failure modes named in §13.2. The manager's lab E6 delivers the final word. Consequence: **M-c-via-B62 no longer has any standing contradiction.**

### 16.3 E3′ — the surprise, and its working hypothesis

Under §14.1, a lone SMA should publish per tick and stay glued; the PO observed jumping. Unknown: whether it is the **metronomic 4–5 s cadence** (memo/chain — would mean an arming path the diff review missed) or **irregular churn stutter**. On a 3-year 1m range (~10⁶ bars), the per-advance worker pack is tens of MB *per tick*; at 100× that alone produces heavy irregular stutter a user would honestly call "jumping" — no memo involved. **Working hypothesis: E3′ is a second, coarser bottleneck (large-range per-tick payload churn), not a refutation of M-c.** The remedy for that hypothesis — tail-only transferred payloads — is already inside the specced package (M19-I). One oracle-timestamped lab run distinguishes the signatures: regular period = chain; irregular = churn.

### 16.4 BUILD AUTHORIZED — two-lane structure (stop rule honored by scoping, not halting)

**Lane 1 — build (manager):** §12.5 + the §13 family restoration + G1–G4, as ONE package **explicitly including the M19-I tail-only transferred payloads** (double duty: family restoration AND the leading E3′ churn remedy). Behind its own kill-switch; RED cadence oracle reproduced pre-fix; GREEN post-fix with Q2 ON. Acceptance criteria of §10 unchanged.

**Lane 2 — instrument (manager; first or parallel; no PO involvement):** one lab session on b63 closing every ambiguity in a single run set:
- (a) **E3′ characterization** — SMA alone, 3-year range, 100×, oracle timestamps → metronomic vs irregular. **Gates final acceptance:** irregular churn → package covers it, acceptance proceeds; metronomic → one targeted re-triage for the missed arming path *before* GREEN is claimed.
- (b) **Lab E6** — flag ON/OFF under the W5 harness with speed hard-asserted, cadence + counter both recorded → formally settles the Fact-1 history.
- (c) **Jump-period measurement** at 1/3/5 family-3 indicators and 3-day vs 3-year range → the period-scaling numbers E5 could not provide.

Nothing in Lane 1 is wasted under any Lane 2 outcome — every component is independently justified.

**Acceptance addition (one row):** the oracle suite gains an **SMA-alone, 3-year-range, 100× row that must be smooth post-fix** — whatever E3′ turns out to be, the user-visible standard is fixed, and the surprise becomes permanently untestable-around.

### 16.5 Standing items

W5 hard-assert ships **before** any before/after measurement claim (E6 run 2 is its one-line justification). Speed-cap ruling stands (§14.5), strengthened by E4′: 10× is clean *for this mechanism*, but the parity target and the E3′ churn question live above 10×. Post-close housekeeping order stands (§15.4). **The PO's role in this issue is complete; remaining verification is lab-side by design.**

## 17. Rev 1.7 — CKPT-023/b66 FAILED: result, corrected model, and the reopened diagnosis

### 17.1 Result of record

**PO verdict on verified b66 (CKPT-023): FAIL — no observable improvement.** Host-chart indicators still lag behind price at 60×; iframe panels remain clean. Therefore **M19-I family-tail ownership (M-c) is not the primary cause of the visible host lag.** b66 is **not promoted**; b65 stands as the rollback build; all further work stays TEST-only. The M-c mechanism itself remains real (the §16 counter evidence stands) — but it is not what the user sees, or not the dominant term.

### 17.2 Model correction: the 60× host path was never the one we traced

§11.1 traced the host paint through `updateChartWithAnimatedCandle → applyMultichartMirrorFrame` — that is **tick/smooth mode**. At speeds ≥60× the host switches to **FAST MODE**: `animateFastMode` → `updateChartDataFast` → `_scheduleReplayIndicatorRecalc()` → `_renderReplayChartUpdate()` (`modules/replay-system.js` 5687, 5738, 5797). The mechanism theory was validated against a path the 60× host does not run. This mode-scoping error is why a pipeline-level fix could pass its lab oracle and still change nothing live: **the harness must reproduce FAST MODE on the HOST, with panels attached, or it is not reproducing the bug.**

### 17.3 The new prime suspect: host-only per-frame O(history) rebuild

A concrete, code-anchored host-vs-panel asymmetry in fast mode:

- **Host, every frame:** `updateChartDataFast` re-slices the playhead prefix and **re-runs `resampleData` over the entire sliced history** (`replay-system.js` 5751–5760), then bumps dataVersion and recalcs indicators — O(history) main-thread work per frame at 60×, on 3-year ranges ~10⁶ bars.
- **Panels, every frame:** the mirror fast path **reuses the host's already-built arrays by reference** (`applyMultichartMirrorFrame` fast path, 7925–7933 — "the single biggest replay-playback CPU saver in multichart").

The panels literally skip the work that the host redoes per frame. If the host's frame budget is consumed by slice+resample, the indicator recalc and/or paint slides to later frames while the (cheaper) candle update rides each frame — host-only visual indicator lag with clean panels, insensitive to indicator-family ownership. This also converges with §16.3's E3′ churn hypothesis: same O(history)-per-tick shape, observed there as SMA-alone stutter.

Secondary host-only candidates for the same instrumented run: `_trimLastDataBarToReplayPlayhead` per frame; auto-scroll state recompute; countdown/Q2 interactions; `syncPanelCharts(true)` every 3rd frame (5808–5812) landing broadcast cost on the host.

### 17.4 Manager directive — instrumented RED-first diagnosis (blocking gate)

Build the host-vs-panel instrumentation on b63/b66 and produce, **per replay tick**, one ledger row per chart (host AND one panel, same session):

| Field | Meaning |
|---|---|
| `tickSeq`, `wallTs` | tick ordinal + wall clock |
| `dataTailTs` | timestamp of last bar in `chart.data` after apply |
| `indTailTs` | timestamp of last indicator point actually in the painted arrays |
| `workerReqTs` / `workerReplyTs` | indicator worker send / reply times (if any) |
| `publishTs` | when indicator arrays were swapped/published |
| `renderSchedTs` / `paintTs` | render scheduled vs actual paint executed |
| `frameDropped` / `coalesced` | host frames skipped or coalesced this tick |
| `sliceResampleMs` | time spent in the per-frame slice+resample (host fast mode) |

**Acceptance gate (per PO directive): no further fix is accepted until a harness reproduces the host-only visual lag** — i.e. the ledger shows `dataTailTs − indTailTs` growing/oscillating on the host while staying ~0 on the panel, in FAST MODE at 60×, on a large range. The RED harness run comes first; the fix must turn that exact ledger signature GREEN. §17.3's suspect predicts the smoking column is `sliceResampleMs` (large, per-frame, host-only) with `paintTs`/`publishTs` slipping behind `tickSeq`.

### 17.5 Standing constraints

b65 = rollback; b66 not promoted; TEST-only until the harness-verified fix passes the PO feel-test. All §10 acceptance criteria, G1–G4 guardrails, and the SMA-alone/3-year/100× oracle row remain in force — they now bind the *next* fix. The b66 package's components (family restoration, per-instance accounting, tail-only payloads) remain individually justified and stay in the build; they are necessary-but-insufficient pending the fast-mode finding.

## 18. Rev 1.8 — 60× mode correction and authenticated no-repro

### 18.1 §17.2–§17.3 correction (history retained)

The authenticated b65 product run falsified §17.2's FAST-MODE premise for the binding 60× scenario. The selected product mode was `candle`; `startCandleByCandle` entered once, while `animateFastMode`, `updateChartDataFast`, `animateTick`, and `updateChartWithAnimatedCandle` entered zero times. With 1-minute raw data and one cadence subdivision, mode selection computed a 1000 ms real-time candle duration; the coherent FAST condition is strictly `< 32 ms`, and the legacy condition is strictly `rawCandlesPerSecond > 1` (60× gives exactly 1). Therefore the §17.3 fast-path O(history) hypothesis does not describe this observed 60× run.

The actual path was `startCandleByCandle → updateChartData → _scheduleReplayIndicatorRecalc → _renderReplayChartUpdate → syncPanelCharts`. Candidate instrumentation consequently moves to `updateChartData` resample/viewport work, render scheduling/coalescing, countdown/Q2, auto-scroll, and `syncPanelCharts`; `sliceResampleMs` remains the measured update/resample duration on host and zero on a panel mirror where no resample occurs.

### 18.2 Authenticated ledger result

Fail-closed full-product run: verified b65 build, 60× read-back, 1m timeframe, owner-scoped 3-year QA session, host plus one attached iframe, and four-indicator panel workload including TEMA(20). Over the observation window the host produced 402 rows and the panel 465. Host maximum `dataTailTs − indTailTs` was 3,840,000 ms (381 non-zero rows; 400 transitions); panel maximum was also 3,840,000 ms (458 non-zero rows). Path counts: `updateChartData=402`, `syncPanelCharts=402`, `_renderReplayChartUpdate=402`, `render=834`, countdown ticks `=422`, and all FAST/animated-mirror entries `=0`.

**Verdict: NO-REPRO for the required host-only signature.** Lag was present in both host and panel rather than host-only with panel approximately zero. This does not contradict the PO observation; it means the current automated cell has not reproduced it. No production fix is authorized. §17.4's core ledger columns and RED-first gate remain binding, but the path requirement is corrected from FAST MODE to the actual selected 60× playback path.

## 19. Rev 1.9 — paint-true ledger correction and binding RED closure

### 19.1 Rev 1.8 measurement invalidated

Independent audit invalidated §18.2's NO-REPRO result. That ledger read mutable indicator stores before paint, merged unrelated instances, inferred timestamps from array lengths, used unmatched host/panel workloads, and did not align panel rows to host ticks. The equal 64-bar maxima were a measurement artifact. §18.1's mode correction remains valid: the observed 1m/60× product route is candle-by-candle, not FAST MODE.

### 19.2 Binding RED reproduced on the actual 60× route

The corrected authenticated ledger measures one matched TEMA(20) instance after its real draw endpoint, observes actual worker request/reply and publication events, propagates host tick identity into the panel, and requires one-to-one aligned rows. On verified b66 it produced 413/413 aligned host/panel rows with zero missing rows: host painted lag was non-zero on 399 rows and reached 67 bars (`4,020,000 ms`), while panel painted lag remained zero. Endpoint-proof paint was observed on every row in both charts. This satisfies the substantive §17.4 RED gate on the actual selected 60× path.

### 19.3 Current candidate status

CKPT-68/b68 is TEST-only evidence, not a promotion; b65 remains rollback and b66 remains failed/unpromoted. b68 OFF reproduced host-only RED (448/448 aligned, host max 64 indices, panel zero). b68 opt-in ON remained RED because all 437 bounded atomic commit attempts failed before publication (`3,080` staged points, zero merged instances); worker fallback remained intact and frame drops stayed zero. Therefore GREEN is not achieved and no PO feel-test or default-ON promotion is authorized. The active diagnostic is the first failing atomic-bridge predicate, not the falsified FAST-mode slice/resample theory.

## 20. Rev 2.0 — b70 ledger NO-REPRO: verdict withheld, cell-parity directive

### 20.1 Result of record (manager report, 2026-07-26 ~13:25)

On TEST restored to healthy `20260725b70`, the §17.4 authenticated paint-true ledger returned **NO-REPRO, not GREEN**: across **29** real 60× ticks, host AND iframe panel both stayed at 0 ms endpoint lag with four painted indicators including TEMA(20); no black samples. **Promotion remains blocked** — correctly — because GREEN is only meaningful against a reproduced RED in the same cell.

### 20.2 Why this result is unusable as-is: the cell does not match the RED cell

The binding RED (§19.2/§19.3) was established with **413–448 aligned rows**; this run produced **29 ticks** — a ~15× shorter observation window. The RED signature is *accumulative* (host lag built up to 64–67 bars over the run); 29 ticks may simply be too short for backpressure to accumulate, regardless of build. Until the b70 run matches the RED cell, three explanations are indistinguishable:

1. **B70's fix works** (if its switch was ON or its Stage5 components are default-active in b70) — the happy case, unprovable at 29 ticks;
2. **Window too short / cell drift** — wrong data range, session shape, or run duration vs the §19.2 cell;
3. **The RED itself is cell-fragile** — reproducible on b66/b68 sessions but not on b70's, which would be its own finding.

### 20.3 Directive (single next step, blocking)

Re-run the ledger on b70 in **exact §19.2 cell parity**: same owner-scoped 3-year QA session shape, same TEMA(20) matched instance + workload, same 60× read-back, host + one attached panel, and **run length ≥ 400 aligned rows** (not 29). Two runs, one variable:

- **Run A — candidate switch OFF** (b61-era behavior): must reproduce host-only RED (~60+ bars, panel 0). If it does not, STOP: the cell or the build's OFF-path differs from b68's — reconcile before any claim.
- **Run B — candidate switch ON**, same session: GREEN required (host ≈ panel ≈ 0 across the full window).

RED(A) + GREEN(B) in the same cell = the §17.4 gate is satisfied → PO feel-test is authorized. Any other combination → report the pair verbatim and hold. Record switch state, run length, and session identity in both reports — absence of those three fields is what made this morning's result unusable.

## 21. Rev 2.1 — Run A HOLD: RED does not reproduce on b70-OFF; positive-control directive

### 21.1 Result of record (manager report, 2026-07-26 ~13:55)

§20.3 Run A: **457/457 aligned rows, switch explicitly OFF, host AND panel at zero lag.** RED did not reproduce; Run B correctly skipped. TEST healthy on b70.

### 21.2 What this means — a clean either/or

The identical protocol produced opposite results on two builds: **b68-OFF = RED (448 rows, host 64 bars, panel 0)** vs **b70-OFF = zero (457 rows)**. Exactly one of two things is true:

1. **The build changed the OFF path.** Something that landed between b68 and b70 (the Stage5 assembly, one of the six release/build commits, or a dependency of them) removes the lag *even with the candidate switch OFF*. If so, either (a) fix components shipped ungated — a kill-switch discipline violation that must be found and corrected regardless of the happy outcome, or (b) an unrelated change incidentally fixed the mechanism — which must be identified, named, and claimed as *the* fix with evidence, not by accident.
2. **The cell drifted.** Despite nominal parity, something about the session/workload/environment differs from the b68 RED cell (session identity, data range actually loaded, indicator instance binding, speed engagement, panel attachment). The three-field passport of §20.3 narrows this but does not eliminate it.

### 21.3 Directive: one positive-control run, then branch

**Control run: repeat the exact §20.3 Run A on b68** (the build where OFF-RED is proven), same cell, same ledger, ≥400 rows, switch OFF, **today**:

- **b68 = RED again** → the cell is healthy; the delta is the build. Branch to a **b68→b70 OFF-path diff audit**: enumerate every change between the two builds that can touch the replay/indicator/paint path with the switch OFF; identify the specific change that kills the lag; verify it is intentional, gated (or explicitly adopted as default with review), and write it up as the fix candidate with mechanism named. Then §20.3 Run B (switch ON) still runs to verify the gated candidate adds no regression, and the PO feel-test follows on b70.
- **b68 = zero too** → the cell has drifted from the §19.2 RED cell; the build is exonerated for now. Reconstruct the RED cell (diff the run manifests: session id, range, indicator binding, speed read-back, panel topology) until b68-OFF reproduces RED, then rerun the b70 pair.

**In parallel (cheap, decisive reality anchor):** one PO eyeball on TEST b70 — two minutes at 60× with EMA-class indicators on the 3-year session. Eyes-say-laggy + ledger-says-zero would mean the ledger is measuring the wrong thing again (the Rev 1.8 failure mode); eyes-say-smooth converges with branch 1's happy case. Either way this anchors the instruments to the only judge that matters.

### 21.4 Standing rule reaffirmed

No promotion, no GREEN claim, no feel-test authorization until RED reproduces somewhere current and the candidate (or identified incidental fix) turns that same cell GREEN, gated and named. "The bug went away and we don't know why" is explicitly not an acceptable close for this dossier — unexplained disappearance is how it returns in production.

## 22. Rev 2.2 — PO feel-test: lag symptom RESOLVED on b70; new promotion blocker (black panels on reload)

### 22.1 Result of record (PO live on TEST b70, 2026-07-26 ~14:25)

- **Lag symptom: PASS.** Host/panel lag fixed, no indicator slowdown, pause/resume/seek smooth. The reality anchor of §21.3 converges with branch 1: **b70 contains the cure.**
- **New defect found:** after **reload**, panels come up **black**; manually assigning a ticker to each black panel recovers that chart in ~3 s. PO's read (correct): a **panel session/ticker restore bootstrap failure**, not a rendering failure — the restore path fails to rebind the saved ticker/session to panels on boot, and a manual assignment re-runs the same bootstrap successfully.
- **Promotion remains blocked** pending automatic panel restoration.

### 22.2 What remains open on the LAG side (unchanged by the good news)

The §21.4 standing rule holds: the cure must be **named** before this dossier closes.

1. §21.3 control run on b68 (should be RED) — confirms the cell is healthy.
2. b68→b70 OFF-path diff audit — identify WHICH change kills the lag with the candidate switch OFF; verify it is intentional and correctly gated (or formally adopt it default-ON with review); write the mechanism up.
3. §20.3 Run B (switch ON, ≥400 rows, GREEN) for the gated candidate.
4. Then: cadence oracle into the permanent gate suite (§10.5), like-for-like measurement-1a re-run.

### 22.3 New lane: MC-RESTORE (black panels on reload) — RED-first, same discipline

Scope: reload of a multichart layout on b70 → panels black until manual ticker assignment.

- **Reproduction should be deterministic** (reload = the trigger); the RED harness is therefore cheap: boot a saved multichart layout, assert every panel reaches "chart painted with restored ticker" within a bound (e.g. 10 s) with zero manual input.
- **First suspects (code-anchored):** the panel restore/boot chain — saved-layout ticker rebinding on panel iframe boot, the boot-anchor/settle machinery, and the order/session restore fan-out (`_scheduleMultichartOrderSnapshotFanOutAfterRestore`, boot re-anchor kill-switch family, panel `loadPanelFileData` bootstrap). The ~3 s manual recovery says the load path works when *given* a ticker — the defect is upstream: the saved assignment never arrives.
- **Regression check:** determine whether this is NEW in b70 (test reload on b65/b68 in the same session shape). If new, the b68→b70 diff audit of §22.2-2 doubles as the suspect list for this lane — one audit, two customers.
- Fix behind its own kill-switch, RED→GREEN on the reload harness, then PO reload check.

### 22.4 Promotion checklist for b70 (or its successor)

1. Lag: §22.2 items 1–3 complete (cure named, gated, Run-B GREEN).
2. MC-RESTORE: reload harness GREEN + PO reload check.
3. Then promotion; measurement-1a re-run; M2 claim; wider board resumes per §15.4.

## 23. Rev 2.3 — LAG CLOSED (cure named); MC-RESTORE at TEST gate; two rulings

### 23.1 Manager status of record (2026-07-26 ~17:00)

- **LAG-CONTROL done:** b68 OFF positive control, 459/459 rows, host 64 bars, panel 0 — the cell is healthy.
- **LAG-NAME done — the cure has a name:** commit `852420adc` **unconditionally loaded `indicator-performance.js`**, which activated the (previously never-loading) default-ON exact-tail/family-tail ownership machinery. The loader fix was intentional; the behavioral activation was ungated. This retroactively explains the entire b66/b68 mystery: **the M19-I fix components were likely correct but never actually loading** — b68's "opt-in ON stayed RED with all 437 commits failing" is consistent with a module that wasn't there.
- **LAG-RUNB done:** b70 ON ledger, 451/451 rows, host/panel zero lag; 450/451 successful commits, one clean fallback.
- **MC-RESTORE running:** deterministic b70 RED reproduced; seven-file default-OFF fix independently accepted; local ON proof 10/10 strict reloads; b73 images built, authenticated TEST deploy in progress. Historical dating incomplete (b68 blocked by container health, b65 lacks a standalone manifest).
- **Deploy automation done, operationally parked** (`ckpt-ship.sh` + provenance/uniformity/runtime/rollback + tests exist; b73 uses the same controls manually while tooling settles).
- Parallelization: CONTROL ∥ NAME, RUNB correctly serialized after both, MC-RESTORE independent — as directed.

### 23.2 Director ruling 1 — historical regression dating: WAIVED

Exact b65/b68 dating of the MC-RESTORE regression is **not mandatory**. Dating was a means to a suspect list; the fix already exists, is reviewed, RED reproduces deterministically on b70, and local ON proof is 10/10. Record the dating as "incomplete — historical artifacts unavailable" and spend zero further hours on it. It does not gate b73.

### 23.3 Director ruling 2 — the ungated cure: ADOPT default-ON, with one verification

The lag cure is currently active because a loader fix activates machinery **outside any behavioral gate** — a kill-switch discipline exception that must be resolved by decision, not by silence. Ruling: **formally adopt the activated exact-tail/family-tail ownership as default-ON**, given Run-B GREEN (451/451) + PO feel-test PASS, on ONE condition: verify the **component-level kill-switches** of that machinery (the M19-I/B62-family flags) still function now that the module actually loads — one short ledger cell with a component switch toggled OFF must show a behavior delta. If a switch is dead, restore it before promotion; the production escape hatch must be real, not decorative. Record the adoption + switch verification in the checkpoint log.

### 23.4 Updated promotion checklist (supersedes §22.4)

1. ~~Lag closure~~ **DONE** (control RED · cause named `852420adc` · Run-B GREEN).
2. §23.3 component kill-switch verification (short, lab-side).
3. MC-RESTORE: authenticated b73 TEST A/B (RED with fix OFF, GREEN ≤10 s all panels with fix ON) + **PO reload check** (the single remaining PO action).
4. Promotion → like-for-like measurement-1a → M2 claim → wider board per §15.4.

**Status 17:20 (manager ack):** Rev 2.3 rulings accepted. Kill-switch gate prepared and locally verified — switch `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1`, expected OFF-delta: publication/version advancement stops and painted staleness grows. Sequencing: b73 A/B owns TEST now; the authenticated short cell runs immediately after b73 releases TEST; then PO reload check. Both gates correctly serialized on the single TEST environment.

## 24. Rev 2.4 — B74 release-governance rulings (manager request, 2026-07-27 00:15)

Context: b73 was superseded by b74 packaging, which surfaced repository-governance debt: baseline drift in the mandatory broad gate, dependency families living only in the dirty shared worktree, and divergent accepted histories (MC fix vs M21-2 prep). The manager's fail-closed handling (isolated reconciliation, clean prerequisite chain, refusing to package from dirty state) is endorsed in full. Rulings on the six requests:

1. **Five-failure broad baseline: APPROVED CONDITIONALLY.** Condition: the independent review confirms the ONLY snapshot delta is removal of the two now-passing expectations (M22-H-S78B browser RED cell; deferred-play rapid-switch), AND each newly-passing test carries a one-line attribution naming the commit/mechanism that made it pass (expected: the `852420adc` activation). Unexplained new passes are the mirror image of unexplained disappearing bugs — one line each, no full audit.
2. **Reconciled prerequisite chain: DECLARED AUTHORITATIVE** for B74 — `a5a564362` + the four clean prerequisite commits. Record the five SHAs in the checkpoint log.
3. **Freeze: GRANTED.** No unrelated merges, no broad-test/fixture changes until B74 packaging + A/B complete.
4. **Single integration branch: AUTHORIZED** as the sole release lineage. All lanes (MC, M21, CI, deploy) reach releases only through it, via review. Name it in the checkpoint log.
5. **Priority: CONFIRMED.** B74 MC-RESTORE promotion precedes M21-2 and backlog work until the PO reload check completes. **Refinement of the parallel-utilization rule:** background lanes may continue *during pure waiting periods only*, and only in **isolated worktrees/branches** — never the shared worktree, never the integration branch, never anything touching broad-gate fixtures. The dirty-shared-worktree cost identified in this report is the reason; parallelism yes, shared mutable state no.
6. **No gate bypass: CONFIRMED** — standing rule, unchanged.

Active blocking gate at time of ruling: the five-failure snapshot acceptance review. Chain after it: package → broad pairs → images → provenance → TEST deploy → B74 OFF/ON A/B → kill-switch cell → PO reload check.
