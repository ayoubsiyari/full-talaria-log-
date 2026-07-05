# Director Decisions Log

Consumed by the Manager. Newest at the bottom. Each decision is binding until superseded.

---

## D-001 — Ratify Option B deviation + B-FIX-1 closure (2026-07-05)

**Decision:** APPROVED, retroactively. The §5 crossroads in `MANAGER-FINDINGS.md` was
resolved correctly: instrumentation exists precisely to re-aim the plan when measurements
contradict assumptions. The phase ORDER is negotiable; the PROCESS (read-only diagnosis →
one gated, kill-switched fix → both-copies proof → live numbers) is not, and it was
followed. B-FIX-1 stays closed.

**Amendment to the plan:** treat `README.md` §3 phase order as a priority queue that the
Director may reorder on evidence, never as a fixed sequence. Phases/tasks themselves and
`INVARIANTS.md` remain unchanged.

**One follow-up owed (5 minutes, next session):** the causality check — set
`window.__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK = true`, replay 2×2, confirm the
flood returns, unset. Record one line in MANAGER-FINDINGS §6c. We keep the habit of
proving kill-switches actually revert behavior — they are our production safety net.

---

## D-002 — Next work queue (strict order)

### 1. B-DIAG-2 — read-only diagnosis: why panel B fetches while C/D copy (RC1-pan)

The §6b pan capture is the user's original felt pain (slow old-data load when dragging
right in multichart): B fetched **58,000 bars itself** (`extendsFromParent = 0`) while
C/D correctly copied from the host (`fetches ≈ 2`). Before any fix, one worker,
**zero code changes**, reproduces the §6b pan and captures per panel:

- `currentFileId` (host + B + C + D) — **prime suspect:** B booted on a different fileId
  (see `docs/multichart-loading-fixes-handoff.md` §3: 2-panel layouts loading file 27
  while host has 25). `isSameSymbolAsHost()` compares fileId, so a different id makes B
  "independent" and legitimately self-fetching — the bug would be at BOOT (wrong file),
  not in the pan path.
- `currentTimeframe` per panel — second suspect: the hybrid independent-pair backfill
  (`_indepNativeBack`) fetches at display TF; a TF mismatch changes path and volume.
- On panel B specifically: `_multichartSamePairDataShareActive()`,
  `_isIndependentMultichartPair()`, `_multichartVisibleRangeSyncOn`, and which panel was
  physically dragged.
- The `pan loads via: candles` vs `bar loads via: tiles` branch (server-side log line) —
  note which panel produces which, in case B is also on a slower server path.

**Deliverable:** a table of the above + a one-paragraph verdict naming the exact
condition that routes B to self-fetch. Report facts only; no fix proposals mixed in.

### 2. B-FIX-2 — fix whatever B-DIAG-2 names (gated, kill-switched)

Pre-authorized shapes, pick per the verdict:
- If wrong fileId at boot → implement **Phase 1 Task 1.3** (boot through the owner /
  inherit host fileId; never a server default in a panel). That task is already specced.
- If B is same-file but the share-detection declines → fix the detection condition (one
  function), NOT by adding new fetch suppression elsewhere.
- Anything else → back to Director with the evidence.

### 3. Baseline completion (parallel with 1–2, no code changes)

`BASELINE-RESULTS.md` is still all TODO. Fill it on the current build (post-B-FIX-1,
note build id in the header) — this becomes the reference for every later gate. Priority
scenarios if time is short: S1, S2, S3, S8, S11. The replay/pan captures pasted in
MANAGER-FINDINGS are good evidence but do not replace the matrix.

### 4. Side ticket (separate from multichart phases): drawings 403 flood

`POST /api/chart/drawings/25 403 (FORBIDDEN)` flooding during replay is console/CPU
noise contaminating every capture. Separate small task: find why panels retry a
forbidden save in a loop (likely per-frame retry without backoff) and stop the RETRY
LOOP client-side. Do NOT touch the server-side permission check (see INVARIANTS I6) —
the 403 itself may be correct (panels probably should not save drawings at all).

### Queued behind the above (do not start): RC2/RC4 render budget

`renders ≈ 1000/panel`, `resamples ≈ 782/panel` per replay minute is the residual from
B-FIX-1 and maps to existing specs: **Phase 2 Task 2.1** (throttled mid-drag flush),
**Phase 2 Task 2.2** (notification-driven extends), **Phase 3 Task 3.1** (follower
half-rate paints). Order stands: correctness (RC1-pan) before throughput (RC2/RC4),
because ownership fixes change what the render path has to do.

---

## D-003 — Standing guidance

- Every fix ships with its scenario numbers from the matrix, not ad-hoc captures.
- When a capture contradicts an assumption in the plan docs, do what §6b did: record the
  correction in MANAGER-FINDINGS and escalate — never silently re-plan.
- Kill-switch names keep the `__TALARIA_MC_DISABLE_*` pattern and get listed in
  MANAGER-FINDINGS when shipped.

---

## D-004 — B-FIX-2 disposition: held pending objective repro, not memory (2026-07-05)

**Context:** B-DIAG-2b (build b586, fileId/tf diag columns) shows ownership working
correctly in a clean same-symbol 2×2 (B fetches = 0, copies from host). The §6b
"B fetched 58,000 bars" capture is now ambiguous: legitimate independent symbol vs
transient boot fileId mismatch. Manager asks which.

**Decision: do NOT answer this from anyone's memory of §6b.** The old capture predates
the fileId diag column, so any recollection is unverifiable. We answer it by
construction, with two cheap read-only captures on the current build:

1. **REPRO-A (different symbol):** 2×2, panel B deliberately set to a different
   instrument, sustained pan-back on B. Expected: B self-fetches (correct owner of its
   own file), batches ≈ 2000–5000 bars each, C/D copy, seams 0. If observed → this
   matches §6b and B-FIX-2 is CLOSED AS NOT-A-BUG.
   - While there: sanity-check B's fetch VOLUME. §6b showed 33 fetches / 58k bars in one
     gesture. If B is on a coarse display TF, confirm the hybrid native-TF backfill
     (`_indepNativeBack`) is engaging (fetch tf == display tf in the diag), not pulling
     1m for a 1h panel. Volume finding goes in the report either way.
2. **REPRO-B (boot mismatch hunt):** the §6f anomaly is the live lead — server logs show
   bar loads for files 22/27/29 during 2×2 boot while all panels report fileId 25.
   Something loads OTHER files at boot. Read-only task: instrument/trace which code path
   issues those requests (candidates: default-file fallback when the iframe URL lacks
   `fileId` — the known handoff-doc §3 issue; a prefetch/favorites/compare path; stale
   session restore). Deliverable: the call site + trigger condition.

**Pre-authorized outcomes:**
- REPRO-B finds a panel transiently booting on a wrong fileId (even if later corrected)
  → **B-FIX-2 = Phase 1 Task 1.3** (panel inherits host fileId at boot; never a server
  default; wait bounded for host readiness). The transient window also explains wasted
  boot bandwidth and "random loading" feel — fixing boot ownership closes both.
- REPRO-B shows the 22/27/29 loads come from a legitimate non-panel feature (e.g.
  compare overlay, watchlist prefetch) → record it in MANAGER-FINDINGS as explained
  noise, close B-FIX-2 as not-a-bug, and proceed to the render-budget queue (D-002
  "queued behind" section).
- Anything else → escalate with the evidence.

**Also ratified in this decision:** B-FIX-1 holding (flood reduced to occasional
`Skipped: 1`), S-403-2 effective, B-DIAG-2b deployed. Good discipline on refusing to
build a fix for an unconfirmed bug — that refusal is the process working.

---

## D-005 — §6h independent-panel pan desync: diagnose BEFORE Phase 2 (2026-07-05)

**Ratified first:** B-FIX-2 closed as not-a-bug per D-004 outcome #2 — REPRO-A and
REPRO-B both executed with objective evidence (§6g). RC1 same-symbol ownership is
confirmed working; boot loads for files 22/27/29 are the symbol-switcher prefetch
(`_scheduleSmartPrefetchOthers`), legitimate. The §6b mystery is resolved: B was a
different symbol; self-fetch was correct.

**Crossroad call: option (a) — correctness before throughput.** §6h stays ahead of the
Phase 2/3 render-budget queue. Rationale: non-painting candles during pan is a
correctness failure users see; and if we fix render budget first, §6h's ~1600 wasted
renders would contaminate every Phase 2/3 before/after measurement.

**But not three parallel fixes — one diagnosis with a causal hypothesis first.**
The three §6h symptoms are likely ONE chain, with **#3 (TF flip `1d → 1m`) as the root**:

> B's display TF silently resets to 1m mid-pan → the engine backfills/resamples at the
> wrong resolution (`_indepNativeBack` disengages; fetch volume grows) → display array
> and viewport indices shift → "All N candles outside viewport" (#1) → the empty-viewport
> recovery + pan-follow loops repaint continuously (#2, renders 793→1626).

This mechanism has precedent in the codebase: `docs/multichart-panel-data-and-rendering.md`
§4.2 documents a generation guard added because *"a stale `ensureReplayDataCoversTimestamp`
fetch could otherwise reset `currentTimeframe` back to 1m after the switch"* — and the
`applyReplayFrame` host-TF force-mirror needed the `_mcIntervalSyncOn` gate for the same
class of bug (handoff doc §B). §6h may be a surviving member of that family on the
independent-panel pan path.

### B-DIAG-3 (read-only, one worker)

Reproduce §6h exactly (B = independent symbol on a coarse TF, sustained pan-back on B).
Capture an ORDERED timeline (timestamps or sequence counter), specifically:

1. **Every write to B's `currentTimeframe`** — add a temporary (not shipped) debug hook
   or breakpoint-based capture on the setter path; record the STACK/caller for each
   change. Candidates to confirm/eliminate: `ensureReplayDataCoversTimestamp` stale
   completion, `applyReplayFrame` force-mirror (is `_mcIntervalSyncOn` set correctly in
   this layout?), `syncFromHost` / TF fan-out, `_refetchBacktestTimeframeCore` completion.
2. **Fetch tf per request** on B (diag `tf` column + server log line) — was
   `_indepNativeBack` engaged (fetch tf == display tf) before the flip, and did fetches
   switch to 1m after?
3. **For each `No candles drawn / Skipped: N` burst:** B's `offsetX`, first/last loaded
   bar time, and whether it fired before or after the TF flip.
4. **Render-loop attribution for #2:** which scheduler drives the ~1600 renders —
   `_scheduleViewportEmptyRecovery` retry loop, `_schedulePanSyncFollowRender`, pan render
   loop, or mirror-frame renders (sample 3–4 stacks during the thrash).

**Deliverable:** verdict on the causal chain — did the TF flip precede #1/#2? Who flipped
it? If the flip did NOT occur in a clean repro, report the actual first-domino with the
same rigor. Also answer the §6h PO question factually if possible (was TF changed by the
user?) from the captured caller stacks, not memory.

### Pre-authorized fix shapes (pick per verdict)

- Stale/racing cover-fetch resets TF → strengthen/extend the existing generation guard
  (one function, kill-switch `__TALARIA_MC_DISABLE_TF_GEN_GUARD_V2`).
- Replay-frame force-mirror misfires on independent panels → tighten the
  `applyReplayFrame` gate condition only (panel-cmd-bridge.js), preserving the §B contract
  (`__fromHostFanout`, `_mcIntervalSyncOn`).
- Non-paint independent of any TF flip → extend the B-FIX-1 recovery fallback to the pan
  path, same pattern, separate kill-switch.
- Render thrash NOT explained by the above → do not patch it here; it becomes the first
  measured target of Phase 2/3 as queued.

Phase 2 Task 2.1 / 2.2 and Phase 3 Task 3.1 remain queued immediately behind this.

### Standing-guidance addition (capture hygiene)

The REPRO-A ordering artifact (`reset → pan → reset → report` self-zeroing the evidence)
is now a named failure mode: capture order is **`reset → act → report`**, and any capture
whose ordering is uncertain is invalid — re-run it rather than interpreting around it.

---

## D-006 — Retarget approved: host pair+TF switch latency is the next target (2026-07-05)

**§6h dispositions ratified (PO evidence):** #1 non-paint downgraded to cosmetic
(logged: MC-COSMETIC-1, low priority); #3 TF flip was the PO's manual action — not a bug,
B-DIAG-3 as specced in D-005 is CANCELLED (its causal hypothesis died with the facts —
good); #2 render thrash (~1626 repaints/gesture) folds into the render-budget debt,
now measured in two places (§6h pan, §6i switch).

**Retarget: APPROVED.** §6i is exactly the PO's original complaint ("fast like
TradingView"), and it arrives with measurements: a pair+TF switch pages **~90–106k bars
in ~50 sequential ~2000-bar fetches at ~1s each, rendering once per chunk (~1200
renders)**, while a 4h viewport needs a few hundred bars. Phase 2/3 generic render-budget
work stays queued behind this — same correctness-first logic as D-005, now applied to
the biggest felt latency.

### B-DIAG-4 (read-only, one worker) — name the machine, not just the cost

§6i measured WHAT; the fix needs WHO and WHY. Deliverables:

1. **The driver loop.** Which code path issues the ~50 sequential fetches on host
   pair+TF switch? Prime suspects (confirm by stack/log, not assumption):
   `_fillViewportHistoryAfterTfSwitch` (self-retrying up to 28 attempts),
   `autoLoadBacktestingData` / pair-switch session load, `ensureReplayDataCoversTimestamp`,
   forward/backward `checkViewportLoadMore` chains. Record the exact sequence for ONE
   switch (ordered log of fetch → merge → render).
2. **The history consumer.** In backtest, the replay playhead requires a 1m session
   master (`docs/multichart-panel-data-and-rendering.md` §3.3: pair switch fetches a
   session-spanning window BY DESIGN). Establish precisely what breaks if full history
   arrives lazily: replay start position? playhead scrub range? indicators? This defines
   how much of the eager load is contractual vs waste.
3. **Per-fetch latency (~0.9–1.2s is high).** Server-side split for those fetches: Redis
   bar-cache hit/miss, `via: tiles` vs `via: candles` path, QuestDB on/off. If each 2000-bar
   chunk costs ~1s server-side, 50 round trips is 50s of pure serialization — check
   whether the `/smart` endpoint (higher limit, anchor-based) could deliver the same
   window in 1–3 requests instead.
4. **Render-per-chunk attribution.** Confirm each chunk merge triggers a full render
   (and which scheduler), so the coalescing fix has a single hook point. Include the
   idle-panel fan-out repaints (B/C/D 171–196×) — which message drives them during a
   host-only load.

### Pre-authorized fix directions (separate gated tasks AFTER the verdict, in order)

1. **Viewport-first switch:** first fetch sized to the visible window (+margin) →
   first paint fast; remainder of the session master hydrates in the background
   respecting the replay contract from deliverable #2. Kill-switch
   `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH`.
2. **Render coalescing during hydration:** render at most every ~250 ms (or every N
   chunks) while a multi-chunk load is in flight; final full render on completion.
   Kill-switch `__TALARIA_MC_DISABLE_HYDRATION_RENDER_COALESCE`.
3. **Round-trip reduction:** if #3 supports it, fewer/bigger windows (e.g. /smart) or
   bounded parallelism for the background hydration — server capacity permitting; no
   rate-limit changes (I6).
4. **Idle-panel damping** during host-only loads (skip fan-out repaints for panels whose
   data/viewport didn't change).

Constraint: single-chart pair/TF switch shares these paths — unlike previous multichart
tasks, changes here are NOT panel-gated, so I7 is satisfied by the kill-switches plus
running S1/S6/S11 (and the single-chart TF-switch scenario) before/after. Baseline
matrix completion (D-002 item 3) is now BLOCKING: capture at least S1, S6, S11 on the
current build before the first fix task ships.

> **Superseded in part by D-007 (§6j):** the "NOT panel-gated" premise above is
> contradicted by PO evidence — single-chart switch is fast; the eager load is
> multichart-only. See D-007 for the re-scoped B-DIAG-4.

---

## D-007 — B-DIAG-4 re-scoped to the single-vs-multichart DELTA (2026-07-05)

**Manager's §6j escalation: ACCEPTED, premise correction ratified.** PO evidence
(single-chart switch fast, multichart-hosted switch slow) supersedes D-006's
shared-path assumption. The manager's "proceed unless countermanded" is confirmed —
proceed, with the deliverables below replacing D-006 deliverables #1/#2. D-006
deliverables #3 (per-fetch latency) and #4 (render-per-chunk attribution) stand
unchanged. Consequence welcomed: the fix will be multichart-gated, so I7 compliance is
the easy path again, and S1/S6/S11 baselines double as the "fast reference" numbers.

### Director's technical lead for the worker (verify, don't trust)

The codebase already names a mechanism that matches §6j exactly — hand these to the
worker as PRIME SUSPECTS to confirm or eliminate first:

1. **The multichart 1m-master contract.** `docs/multichart-panel-data-and-rendering.md`
   §3.3: in multichart backtest, *"the replay playhead always advances on a 1m master
   (`masterTf = '1m'`); the display TF is resampled client-side so every panel stays
   candle-for-candle aligned"* — and on a pair switch the host *"fetches a
   session-spanning window."* A host displaying 4h ALONE can load native 4h bars
   (hundreds for the viewport); the same host in multichart may be forced to page the
   ENTIRE SESSION AT 1m to feed same-pair panels. Months of 1m ≈ 90–106k bars ≈ §6i's
   measured volume. If confirmed, this is the diverging branch.
2. **The chunk-loop driver.** `_fillViewportHistoryAfterTfSwitch` (chart.js) carries the
   comment *"Big-TF tiles pull many 1m chunks (shared-master design fetches at 1m), so
   allow more iterations"* and self-retries up to 28 attempts at 90–260 ms poll — the
   shape of the ~50-fetch sequence. Confirm via the ordered fetch→merge→render log
   whether this loop (and/or `checkViewportLoadMore` forward chains) issues the pages.

### Re-scoped deliverables (replace D-006 #1/#2)

- **A/B differential:** the SAME pair+TF switch (same fileId, same TF, same session)
  captured twice — host alone vs host inside 2×2 — with ordered fetch logs (tf per
  request, window per request) and final diag tables. The deliverable is the DIFF and
  the exact condition (function + branch) that makes multichart take the slow path
  (candidates: `_isMultichartHostPanel()` checks, `masterTf='1m'` forcing, panel-feed
  requirements in `loadMultichartPanelFromHost` / `_multichartSamePairTimeframeResampleFromParent`).
- **The panel-feed contract, precisely:** what do same-pair panels actually REQUIRE from
  the host at switch time — full-session 1m immediately, or can they (a) render from a
  viewport-sized window first and (b) hydrate the deep master lazily? Answer from code
  (who reads `replaySystem.fullRawData`/`_panelFullRawData` and when), not from design
  docs alone.

### Fix directions (refined; still pre-authorized as separate gated tasks)

Priority reordered by the new evidence — target the multichart branch only:

1. **Viewport-first, master-later (multichart-gated):** on a multichart host pair/TF
   switch, load and PAINT the display-TF viewport window first (single-chart parity),
   then hydrate the 1m session master in the background for panel feeding + replay.
   Same-pair panels tolerate a short master-lag window (they already handle "host not
   ready" at boot). Kill-switch `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH`.
2. **Render coalescing during hydration** (as D-006 #2) — applies to the background
   hydration loop; ~250 ms cadence, final full render on completion.
3. **Round-trip reduction for hydration** (as D-006 #3) — fewer/bigger windows via
   `/smart` if the latency findings support it.
4. **Idle-panel damping** (as D-006 #4).

Gate for the eventual fix: multichart switch time comparable to single-chart reference
(S6 vs S1-class numbers); replay scrub/playhead still correct after hydration completes;
same-pair panels still candle-aligned post-switch; single-chart S1/S6/S11 byte-identical
behavior (they should not even execute the new branch).

---

## D-008 — B-FIX-3 authorized: viewport-first, master-later (2026-07-05)

**B-DIAG-4 accepted.** Root cause pinned with code-verified claims:
`loadMultichartPanelFromHost()` hard-sets `masterTf = '1m'` for a multichart host, and
`_fillViewportHistoryAfterTfSwitch()` foreground-hydrates the full left history in ~50
retrying backward chunks before the switch feels complete. The 1m master is contractual
(replay + panel feed); the synchronous full hydration is the waste. This is the answer
to the PO's original "fast like TradingView" complaint.

### B-FIX-3 task spec (one worker, one change, kill-switched)

**Change (multichart-gated only):** on a multichart host pair/TF switch, reorder the
load: (1) fetch + paint the display-TF viewport window FIRST (single-chart parity —
user sees the chart immediately); (2) hydrate the 1m session master in the BACKGROUND
afterwards for replay/panel-feed. Do not change what is loaded — only WHEN and whether
it blocks first paint.

**Hard requirements:**
- **Generation-tagged + cancellable hydration.** A new pair/TF switch, or leaving
  multichart, must cancel in-flight hydration (stale completions dropped). The TF-switch
  path already has a generation-guard precedent — follow it.
- **Graceful un-hydrated access.** If the user scrubs/plays replay into a region the
  master doesn't cover yet, the existing `ensureReplayDataCoversTimestamp` path must
  catch it (verify, and state in the report what happens in that window). Same for a
  same-pair panel asking for master data mid-hydration — the existing "host not ready"
  wait/retry paths at panel boot are the pattern.
- **No new fetch call sites.** Reuse the existing loaders; the change is sequencing.
- Kill-switch `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH = true` restores the current
  eager-foreground behavior exactly.

**Acceptance criteria (measured, 2×2 same-pair, host pair+TF switch):**
- First paint: ≤ 2 fetches before candles visible; wall-clock to first paint within
  ~1.5× the single-chart reference for the same switch (S6-class vs S1-class capture).
- Post-hydration correctness: replay scrub across the session works; same-pair panels
  candle-aligned with host; seams = 0 on all panels; master first/last == session span.
- Single-chart S1/S6/S11: identical numbers pre/post (must not execute the new branch).
- Kill-switch flip mid-session restores old behavior without reload errors.

**BLOCKING precondition (unchanged, now enforced):** S1/S6/S11 baseline captured on
b586 and pasted into `BASELINE-RESULTS.md` BEFORE this task's build ships. The manager
must reject the B-FIX-3 report if the baseline is still TODO.

### Follow-up order (re-sequenced from D-007, with rationale)

1. **B-FIX-3** (above) — removes the user-facing wait entirely.
2. **Round-trip reduction for background hydration** — B-DIAG-4 found server `/smart`
   accepts `limit` up to 100k while the client self-caps at 2000: the whole master could
   arrive in 1–3 requests instead of ~50. MOVED AHEAD of render-coalescing because fewer
   chunks mechanically removes most per-chunk renders too. Must verify the high-limit
   route live first (payload size, gzip, Redis cache behavior at that window size) —
   half of this task is server-side measurement. No rate-limit/security changes (I6).
3. **Hydration render-coalescing** — only if renders are still thrashy after #2
   (measure first; it may become a no-op).
4. **Idle-panel damping** (B/C/D repainting 171–196× during host-only loads).

### Hygiene ruling (§6k note)

`M "Sources Handoff/TalariaV16.jsx"` in a read-only diagnosis worker's tree: PO to
confirm provenance. Standing rule going forward: workers run `git status` BEFORE
starting and include it in the report header — any modification outside the task's
listed files invalidates the report (I5). Diagnosis tasks are zero-diff by definition.

---

## D-009 — Baseline gate cleared; B-FIX-3 review checklist (2026-07-05)

Acknowledged §6l: S1/S6/S11 captured on b586, recorded in `BASELINE-RESULTS.md`,
D-008 precondition satisfied, B-FIX-3 correctly released. No new decision required.

**Canonical "before" clarification:** the S6 baseline (87–91 fetches / 170–178k bars,
renders → 1152) is larger than the §6i ad-hoc capture (~50 fetches / ~90–106k bars)
because §6i measured the host alone while S6 is the full 2×2 (panels consume via
`extendsFromParent` 85–89, fetches 0 — ownership confirmed working). **S6 is the
canonical before-number for B-FIX-3.** Do not evaluate the fix against §6i.

**Manager checklist for the B-FIX-3 report (reject if any item is missing):**
1. First paint: ≤ 2 fetches before candles visible on the switched host; wall-clock
   within ~1.5× the single-chart reference (4 fetches / 4000 bars class).
2. Background hydration completes: master first/last == session span; replay scrub
   across the session works; same-pair panels candle-aligned; seams 0 on all panels.
3. Un-hydrated-window behavior documented: what the worker observed when scrubbing
   replay into a not-yet-hydrated region (which fallback path caught it).
4. Cancellation proven: a second pair/TF switch fired mid-hydration — stale
   completions dropped (no mixed-pair bars, no generation-guard errors in console).
5. Kill-switch flip (`__TALaria`… exact name per D-008) restores eager behavior
   without reload errors.
6. Single-chart S1/S6-ref/S11 re-run: numbers unchanged (new branch must not execute).
7. Report header includes pre-task `git status` (D-008 hygiene rule); diff touches
   only listed files, both engine copies byte-identical if chart.js is duplicated.

Still open: PO confirmation on `Sources Handoff/TalariaV16.jsx` provenance.

---

## D-010 — B-FIX-3 code sign-off acknowledged; live acceptance script (2026-07-05)

§6m accepted. The implementation review hit every structural requirement (multichart-
host-only gate, kill-switch that also cancels in-flight hydration, generation checks
at every await boundary, byte-identical copies, clean pre-task git status). Build
authorized. What remains is the D-009 live checklist; to make the PO run repeatable
and conclusive, run it in this exact order on the new build:

**Live acceptance run (PO, one session, diag panel open, copy numbers after each step):**
1. **Single-chart control first:** load the pair single-chart, do the same TF switch —
   confirm S1/S6-ref/S11-class numbers unchanged and diag shows the new branch never
   fired (hydration seq stays 0). If this step fails, STOP — kill-switch on, escalate.
2. **The headline case:** 2×2 same-pair, switch host pair+TF. Expect: candles visible
   after ≤ 2 fetches, wall-clock ~single-chart feel; background hydration then runs;
   when it settles — seams 0 on all panels, panels candle-aligned, master spans session.
3. **Un-hydrated scrub:** immediately after the switch (hydration still running), scrub
   replay far left. Note what happens (brief load vs error). Any console error = FAIL.
4. **Mid-hydration cancel:** switch pair again while hydration is running. Expect clean
   restart on the new pair; no mixed-pair bars, no stale-generation console errors.
5. **Kill-switch flip:** set `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH = true`, repeat
   step 2 — old eager behavior returns (S6-class fetch count), no reload errors.

**Rollback policy:** first response to any live failure is the kill-switch (no deploy
needed), not a code revert. Capture the diag numbers + console before flipping it so
the failure is diagnosable.

**Pass ⇒** B-FIX-3 CLOSED; manager proceeds to follow-up #2 (round-trip reduction via
high-limit `/smart`, per D-008 — remember half that task is live server-side
verification before any client change). **Fail ⇒** kill-switch on, evidence to a
read-only diagnosis worker, no patch-on-patch.
