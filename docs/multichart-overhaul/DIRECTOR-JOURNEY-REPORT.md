# Multichart Overhaul — Journey Report for the Director

**Prepared by:** Manager
**Final build:** `20260707b105`
**Status:** CLOSED under standing discipline (D-048) — audited clean
**Report date:** 2026-07-12

---

## 0. TL;DR (read this if nothing else)

- **The goal was met.** Multichart data loading, timeframe switching, and replay now behave to the "TradingView-smooth" bar the PO set: no visible drift, no reload flashing, no stuck loading, consistent behavior across host + peer panels.
- **The work split cleanly into two halves.** The first half was **genuine root fixes** (who owns data, what the sync buses carry). The second half was a long tail of **compensating guards** around one un-consolidated root — a replay "mirror frame" that fuses data + X-viewport + Y-price into a single message that every panel type must selectively ignore depending on mode. That second half is where the recurring "fix one thing, another pops" pattern lived.
- **The honest weak spot** is that the guard tail was closed cell-by-cell rather than by the one structural refactor that would retire all of them at once (Phase-5). We chose targeted fixes under a growing regression gate rather than a risky mid-defect-flow rewrite. That was the right call for stability, but it means the guards are still scattered and Phase-5 remains the correct—but deferred—cleanup.
- **Regression safety is strong.** Every felt defect became a permanent, kill-switch-attributed harness scenario. The gate ended at **29 scenarios GREEN, 0 known-failing**. A post-closure audit confirmed security guards intact, mirror trees byte-identical, and build id consistent.
- **What is explicitly NOT done** (deferred backlog, written down, not dropped): the Phase-5 mirror-policy consolidation; a proper finer-owner "marker refresh" fix (we shipped a correct route-around instead); removal of one leftover debug probe; a drifting legacy dev-shell tree; and dedicated gate coverage for ~17 older kill-switches + BL-16.

---

## 1. The plan and its goals

**North star (from the PO):** a chart experience like TradingView — data loads on every panel smoothly and fast, timeframe switching is instant and stable, and multi-chart panels stay mutually consistent. No data drift, no lag, no slow/stuck loading, no flashing/reloading of stale data, and — critically — **when all sync settings are OFF, a host action must have zero effect on other panels.**

**How we ran it (the operating model):**
- **Director / Manager / Worker separation.** The Director issues decisions (D-0xx) and rulings; the Manager organizes, diagnoses, distributes work, and reports; Workers implement one gated fix at a time. (Mid-project the PO explicitly instructed the Manager to stop touching code and act purely as organizer/analyst/dispatcher — that was honored from that point on.)
- **Invariants (I1–I11)** as guardrails — e.g. same-pair panels share a single data owner; sync-off means isolation; every fix must be live-verified.
- **RED-first, kill-switchable fixes.** No fix ships without (a) a reproduction that fails first, (b) a named kill-switch defaulting to fix-ON so it can be reverted independently, and (c) a permanent harness scenario proving it.
- **A regression gate** (`npm run gate`) with a `known-failing.json` baseline, run in a headless-Chrome/Puppeteer harness against a synthetic-data stub server, that ratchets: newly-fixed tests must be promoted out of known-failing, and any new failure is a hard stop.

---

## 2. The two families of fixes (the core mental model)

Understanding the whole journey reduces to one distinction the Director named early and it held true to the end:

### 2a. Root fixes (durable — changed ownership and data flow)
These genuinely changed *who owns what* and *what the buses carry*, and they did not spawn follow-on defects:
- **Display-TF master + lazy 1m master** — the host owns a master series at the correct cadence; the fine (1m) master is hydrated lazily only when replay needs it, instead of eagerly bulk-loading.
- **Panel self-ownership rules** — a panel finer than the host self-owns its replay data; coarser/equal panels mirror. Codified in `_multichartFinerSamePairPanelSelfOwns()`.
- **Pan ownership decoupled from viewport sync** — same-pair data ownership routes through the host tile regardless of viewport-sync state; sync now controls *viewport sharing only*, not *data ownership*. (H-S3 fix.)
- **Price independence** — panels stop copying/adopting the host's price-scale state when sync is off. (BL-2b.)
- **Host history-growth mirroring** — when the host prepends older replay history, same-pair peers mirror it instead of self-fetching. (H-S2 fix.)

### 2b. Guard fixes (the long tail — compensating for one un-consolidated root)
The replay "mirror frame" carries **data + X-viewport + Y-price together**, and each panel type must selectively adopt or ignore parts of it depending on (timeframe relation × replay state × sync state). Because there was no single policy deciding this, each new *combination* exposed a new cell that needed its own guard. This is the family that produced the BL-N pop-outs:

F, G, I, J (early mirror/settle guards) → BL-5 (coarse seek) → BL-6 (viewport recenter) → BL-8 (paused aligned-seek) → BL-9 + BL-9-play (pan-history continuation) → BL-10 (coarse play-advance) → BL-11 (play viewport follow) → BL-12 (drag cost) → BL-13 (playback smoothness) → BL-14/15/17 (data acquisition on TF switch) → BL-18/19 (host-switch peer isolation) → b98–b105 (play-follow smoothing, isolation, peer-freeze, boot shake/slide).

Every one of these was individually correct. Collectively they are evidence that the frame-application policy needs consolidating — which is exactly what Phase-5 is designed to do, and exactly why we did **not** attempt it mid-flow.

---

## 3. Chronological journey (what happened, in order)

### Phase 1–4: foundation, ownership, and the harness
- Built the ownership/data-flow root fixes (Section 2a).
- Stood up the **regression harness and merge gate** (Task 4.3): scenario definitions, a gate runner with regression / stale-baseline / scenario-ID-drift detection, and a PR-only CI workflow. Deterministic sampling was added to kill timing flakiness (H-S8/H-S10 converted from fixed sleeps to polling-to-quiescence).
- Closed the three original stubborn defects **H-S2, H-S3, H-S6** (host history growth, same-pair pan ownership, host-TF mirror-wait race), each RED-first with kill-switch proof, ratcheting the gate to all-green.
- Did the **Item-1 flag cleanup**: retired dead viewport-first flags and an inert cross-TF hold guard, keeping mirror trees hash-identical.

### The visual-defect loop (Phases where the PO drove via live testing)
This is where most of the BL-N items came from. Each followed the same loop: PO reports a felt symptom → Manager dispatches a timeboxed read-only diagnostic → root cause pinned to exact call sites → one gated RED-first fix → PO re-tests. Highlights:

- **BL-8 — cross-panel scale coupling with sync off.** Switching one panel's TF rescaled others' price axes even with all sync off. Root: a same-timestamp paused `replayTick` during a peer TF switch. Fixed with an aligned-seek guard.
- **BL-9 — drag-to-load stall.** Panning back to load history got "stuck loading until a click." Fixed the continuation loop; then immediately hit **BL-9-play**: the same continuation, ungated against active playback, caused a backward-fetch storm when play started. Added playback guards. (This pop-out is a canonical example of the "missing complement" error class — a behavior extended in one mode without accounting for what it also did in another.)
- **BL-10 — mixed-TF play freeze.** With panels on different TFs, only the host advanced during play. Root: `applyReplayFrame` returned early for coarser same-pair panels. Added a coalesced play-advance branch.
- **BL-11/12/13 — the viewport-follow trilogy.** BL-11: panels advanced but their viewport didn't auto-follow the playhead. BL-12: the per-frame follow made dragging laggy during play. BL-13: the coalescing threshold (mis-specified in *candle-width* vs *device-pixel* units) made playback chunky. This trilogy is really *one feature* (panel viewport follow) being specified cell-by-cell through production — the sharpest single argument for Phase-5.
- **BL-14/15/17 — data acquisition on TF switch.** Switching a panel to a large TF (e.g. 1D) after a long replay triggered slow chunk-walk refetches; switching to a fine TF (1m) produced a malformed compressed time-axis. Root: panels were denied the host's bulk/display-TF fetch paths and an `isBacktestMode` gate relabeled without acquiring data. Fixed with a hybrid acquire (zero-fetch resample of the host-covered window + one bounded coarse fetch), routed through the sanctioned bounded-owner path.
- **BL-18/19 — host-switch peer isolation leak.** After a host TF switch during play, peers either refetched, or adopted the host's new-TF data under the old TF's label, or froze. A chain of three related fixes (b97 peer-refetch guard, b99 sync-off isolation, b100 finer-owner follow) closed it.
- **b101 — reload button.** The "new version" toast couldn't escape a controlling service worker; fixed by unregistering SWs + clearing caches before reload.

### The closing polish batch (this session)
- **b102 — host first-render shake** on single→multichart. Root: a boot viewport-freeze made the host repaint at the new (half) width with the old full-width `offsetX`, then snap ~612px. Fixed by index-pin re-anchoring on the first frozen boot resize.
- **b103 — peer first-render shake.** The exact panel analogue of b102 (b102 was host-only). Peers now index-pin on their boot-locked resize. ~15–68px snap eliminated.
- **b104 — host step-forward-spam refetch storm.** Rapid step-forward re-entered `checkViewportLoadMore('backward', force=true)` (bypassing the debounce), and a stale `currentIndex` captured at fetch start caused a backward jump plus a self-sustaining refetch chain. Fixed with a manual-step burst guard + stale-index hardening. Same BL-9 family, new trigger.
- **b105 — residual open-multichart slide.** After b102/b103 removed the big snap, a *second* boot commit (`getReplayAutoScrollState` / center-playhead at `allDataReady`) re-anchored with a different formula (~20% right-gap), sliding the viewport ~111px on first reveal. Fixed by making the index pin the single authoritative boot commit and suppressing the competing one during boot settle.

### Closure
- PO confirmed the acceptance workflows ("perfect all work") on b105.
- Closure hygiene: reconciled the drifted homepage harness copy, hardened the one load-sensitive test flake (H-S19) to a deterministic device-pixel-column model, and recorded D-048 closure across the ledger.
- Post-closure full audit (3 parallel read-only scans) confirmed the build is clean; a safe hygiene pass fixed a stale harness build id and refreshed 5 stale docs.

---

## 4. Findings — what we learned

1. **Ownership beats guarding.** Every durable win came from changing *who owns data*. Every fragile, pop-out-prone area came from *guarding a shared frame* instead of splitting it. This is the central technical finding.
2. **The mirror frame is over-fused.** Bundling data + X + Y into one broadcast forces every consumer to re-derive "which parts apply to me right now." That derivation is the un-consolidated root behind the entire BL-N tail.
3. **"Missing complement" is the dominant bug class.** BL-6 (out of BL-5), BL-9-play (out of BL-9), the BL-11→12→13 chain — repeatedly, extending/removing a behavior in one mode silently broke its counterpart in another. The Director's response — requiring a **state-matrix statement** (paused/playing/idle × sync on/off × same/coarser/finer/independent) in every guard fix's report — measurably reduced later pop-outs.
4. **Spec-unit discipline matters.** BL-13 was a *spec* defect: "≥1 candle-width" and "same pixel column" in one sentence are two different units. The lesson (numeric thresholds get exactly one unit; a two-reading spec is bounced back) became a standing rule.
5. **A green gate is what makes deferral safe.** We could responsibly *defer* Phase-5 only because the gate locks every fixed behavior. Without it, the guard tail would be un-auditable.

---

## 5. Obstacles — expected and unexpected

### Expected obstacles (anticipated, handled)
- **Combinatorial state space.** TF-relation × replay-state × sync-state is a large matrix; we knew new cells would surface. Handled via RED-first scenarios + state-matrix reasoning per fix.
- **Seam correctness on data acquisition.** Resampled-from-1m bars meeting server-native coarse bars is a classic mismatch point; the harness asserts bar equality across the seam, not just fetch counts.
- **Test flakiness on shared runners.** Anticipated; addressed by asserting on deterministic counters (renders-per-N-frames, fetch counts) rather than wall-clock time.

### Unexpected obstacles (the ones that cost us the most)
- **The stale-tab / service-worker red herring (biggest time sink).** Repeatedly, the PO tested on a tab still running old cached code while the host ran new code, producing "the fix didn't work" reports that the harness couldn't reproduce. This recurred across BL-14, BL-16, and BL-17 live tests. It was ultimately root-caused not to a caching *defect* but to **user-side stale open tabs**; we hardened vendor-script versioning and the reload prompt, and it stopped being folklore. **Lesson: environment verification (confirm build id on every frame) should have been step 0 of every live retest from the start.**
- **A self-inflicted regression from our own fix (BL-12).** BL-11's per-frame viewport follow was the thing that made dragging laggy during play. A fix creating the next defect is the exact pattern the PO was frustrated by; it's honest to name that this one was ours.
- **A decision-ID collision and a numbering slip.** Two decisions were both issued as "D-034" (renumbered to D-034b); and a fix logged as BL-18 was briefly conflated with BL-19. Minor, but process hygiene under rapid iteration slipped.
- **BL-14 "made it worse."** Our first acquisition fix (b92) briefly degraded panels on play before b93/b95 corrected direction. We shipped a fix that regressed the felt experience before improving it — a real cost of moving fast on a subtle path.

---

## 6. What we overcame

- **The scale-coupling-with-sync-off class** (BL-8, BL-18/19) — the invariant the PO cared about most ("sync off ⇒ zero cross-panel effect") is now enforced and gated.
- **The refetch-storm class** (BL-9, BL-9-play, b104) — pan-back and step-spam no longer trigger runaway backward loading.
- **The full replay playback experience on panels** (BL-10/11/12/13) — panels now advance, follow the playhead, stay smooth during drag, and scroll as smoothly as the host.
- **TF-switch data acquisition** (BL-14/15/17) — large/small TF switches during replay acquire correctly and fast, without chunk-walk refetches or malformed axes.
- **First-render polish** (b102/b103/b105) — enter-multichart is now snap-free and slide-free.
- **A trustworthy safety net** — 29 gated scenarios, 0 known-failing, deterministic, with a flake hardened out at closure.

---

## 7. What we did NOT fix well (honest assessment)

This is the section for the Director's scrutiny.

1. **Phase-5 was deferred, not done.** The single biggest structural debt. The mirror-frame guards (Section 2b) remain scattered rather than unified into one policy table. We made the defensible choice to not refactor mid-defect-flow, but the consequence is real: **the next novel (TF × replay × sync) combination could still expose a new cell.** The gate will catch it, but the design is not yet "closed at the root." *Recommendation: schedule Phase-5 now that a genuine quiet period can hold.*

2. **The finer-owner refetch fix is a route-around, not the specified cure.** The Director approved a proper "marker refresh / event split" for the stale committed-native-TF read (D-047). What actually shipped (b97) is a correct *guard* (`fromHostFanout` + kill-switch) that avoids the stale read rather than fixing the read itself. `_readCommittedHostStateForFinerOwner` can still read a stale marker after a client-resample fan-out in paths the guard doesn't cover. It is diagnosed, specced, and backlogged — but it is technical debt masquerading as done unless someone reads the fine print.

3. **One leftover debug probe ships in the engine.** The `__TALARIA_BL2B_PRICE_PROBE` install + `__talariaBl2b*` call sites remain in `chart.js` and three other engine files. It is a no-op in production (gated OFF), so it's harmless at runtime, but it's dangling debug surface that should have been stripped. (Not removed in the final pass because that requires a build bump + gate re-run, and the PO scoped the closing hygiene to zero-risk items.)

4. **Gate coverage is incomplete for older guards.** ~17 kill-switches (B-FIX-F/G/I/J, BL-5, price-independence, display-TF-master, high-limit-bulk, tf-switch-fill-storm, and others) have **no dedicated RED scenario** — they're only exercised incidentally. **BL-16** (drag-during-play) similarly has no scenario of its own (asserted only inside H-S18). If one of these regressed, the gate might not catch it directly. This is the most important *coverage* gap.

5. **A legacy `multichart/` dev-shell tree drifts from production `multichart-prod/`.** Production never loads it, so it's not a runtime risk — but it's an edit-on-wrong-tree hazard for future work and should be deleted or explicitly marked unmaintained.

6. **BL-2b residual Y-nudge.** A tiny price-axis nudge the Director flagged as the one deferred item that's a *felt correctness* symptom rather than polish. The PO did not re-raise it after b105, so it may be resolved or may be below the PO's notice threshold — status genuinely uncertain, which is itself a small gap.

7. **We leaned on live PO testing as the primary discovery mechanism.** Many BL-N items were found by the PO, not by us proactively. The harness codified them *after the fact*. A more proactive fuzzing/combination-sweep of the state matrix might have surfaced several of these before the PO felt them.

---

## 8. Final state and integrity (post-closure audit)

- **Security:** all protected guards present and intact — `assert_production_security` (escape hatch not enabled), redirect allow-list, JWT/admin checks, Stripe webhook signature verify, security headers/CORS/CSRF, and `security.yml`. No guard was weakened to fix a chart bug. Harness `serve.mjs` is isolated from production serving.
- **Consistency:** build id `20260707b105` across all 12 shipped entrypoints + service workers; all 12 engine mirror pairs byte-identical; compiled `talaria-v9-live.js` carries the b105 boot flags (no rebuild drift).
- **Gate:** 29 scenarios GREEN, 0 known-failing, 0 regressions; the one load-sensitive flake (H-S19) hardened to deterministic pixel-column counting.
- **Ledger:** D-048 closure recorded; ACCEPTANCE A1–A13 marked PASS on b105; findings through §6cu plus a §6cv post-closure backlog note.

---

## 9. Recommendations to the Director

1. **Schedule Phase-5** (mirror-policy consolidation) as the next real body of work — it retires the entire guard tail and closes the root the BL-N series kept re-exposing. The gate makes it safe; the quiet period is the only precondition.
2. **Fold items 2–5 from Section 7 into the Phase-5 work package** (finer-owner marker refresh, probe strip, coverage scenarios for BL-16 + the 17 kill-switches, legacy-tree resolution) rather than as one-off builds — they're all "close the root/coverage" tasks.
3. **Adopt "confirm build id on every frame" as step 0 of every live retest** — permanently retire the stale-tab red herring.
4. **Keep the state-matrix-per-fix and one-unit-per-threshold rules** — they demonstrably reduced pop-outs and cost nothing.
5. **Confirm the BL-2b Y-nudge status** with the PO explicitly before considering the correctness surface fully closed.

---

*End of report.*
