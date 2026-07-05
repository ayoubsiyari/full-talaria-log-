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

---

## D-011 — B-FIX-3b authorized: viewport-first for the same-pair TF switch (2026-07-05)

§6n accepted. B-FIX-3 stands as a partial win: pair-switch path is fast live, and the
safety counters (seams 0, panel fetches 0, extendsFromParent rising) prove the
background-hydration machinery is sound under real use. The gap is understood and
code-verified: `_multichartViewportFirstSwitchEnabled` requires `switchingPair`, and a
pure TF switch travels a completely different route
(`setTimeframe → _refetchBacktestTimeframeCore → _hotSwapBacktestReplayTimeframe →
_finishTfSwitchViewportRestore → _fillViewportHistoryAfterTfSwitch`) that B-FIX-3 never
touched. The manager's read is correct — and note the S6 baseline (canonical before)
is exactly this untouched path, which is why S6 hasn't moved. **B-FIX-3b authorized.**

### B-FIX-3b spec (one worker, one change)

**Why this path is slow only in multichart (context for the worker):** single chart's
master is the display TF, so switching to 1D fetches a small 1D window — fast. The
multichart host is contractually pinned to a 1m master; a 1D viewport spans months of
1m bars, so `_fillViewportHistoryAfterTfSwitch`'s retry loop foreground-pages the whole
span in 2000-bar chunks. That loop is the target.

**Change (gated inside the shared path — CAUTION, single chart uses these functions):**
in `_fillViewportHistoryAfterTfSwitch` (and/or its scheduling in
`_finishTfSwitchViewportRestore`), when `_isMultichartHostPanel()` + backtest + switch
enabled: paint first, hydrate later.
- **Expected fast path:** if the existing 1m master already covers the new viewport,
  resample and paint immediately — zero fetches. Only the uncovered remainder is
  hydration work.
- The uncovered remainder moves to BACKGROUND hydration — **reuse the B-FIX-3
  hydration controller** (`_mcViewportFirstHydrationSeq` + stillCurrent checks), do
  not build a second cancellation mechanism. A TF switch mid-hydration must cancel
  the prior run exactly like a pair switch does.
- **Separate kill-switch** `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH` — B-FIX-3
  is proven live and must not be re-risked; the two behaviors roll back independently.
- No new fetch call sites; sequencing only (same rule as D-008).

**Acceptance (measured against S6, the canonical before: 87–91 fetches / 170–178k
bars / renders 1152):**
- Same-pair 1m → 1D TF switch in 2×2: candles visible ≤ 2 fetches (0 if master covers
  viewport); "loads one by one" gone per PO.
- Post-hydration: seams 0, panels aligned, replay scrub works, master spans session.
- **Single-chart TF switch re-run mandatory** (S6-ref 4 fetches / 4000 bars unchanged)
  — this fix lives inside a SHARED function, so the single-chart regression check is
  the highest-risk item on the report, not a formality.
- Both kill-switches tested: 3b switch restores eager TF behavior while pair-switch
  stays fast; B-FIX-3 switch untouched by this change.
- Mid-hydration TF switch + pair switch each cancel cleanly.

Same hygiene rules (pre-task `git status` in header, byte-identical copies).
Follow-up #2 (high-limit `/smart` round-trip reduction) remains queued behind 3b —
do not parallelize; 3b changes the fetch pattern that #2 would measure.

---

## D-012 — B-FIX-3b code sign-off acknowledged; live acceptance order (2026-07-05)

§6o accepted; build authorized. Implementation matches D-011: TF-switch divert into the
shared B-FIX-3 hydration controller, mode-aware dual kill-switches, zero-fetch fast
path present, byte-identical copies. Two review notes before the PO run:

1. **The divert-point return (chart.js:28629) is the single highest-risk line.** It
   sits inside `_fillViewportHistoryAfterTfSwitch`, which single chart executes on
   every TF switch. The gate reads correct (backtest + multichart host + not-embed +
   active 1m master), but the live single-chart control run is the item that closes
   this risk — treat a single-chart deviation of ANY size as a hard fail.
2. **The `active 1m master` gate term is new relative to D-011 — verify its polarity
   live.** If a multichart host somehow reaches a TF switch without a 1m master
   (e.g. fresh boot race), the branch silently falls back to the OLD eager path.
   That is safe-by-default (correct choice), but the PO run should include one
   switch-immediately-after-entering-multichart case to confirm no dead zone where
   neither fast path engages.

**Live acceptance order (same discipline as D-010):**
1. Single-chart control: TF switch 1m→1D — S6-ref numbers unchanged (4 fetches /
   4000 bars), new branch never fires. Deviation = STOP, kill-switch, escalate.
2. Headline S6 case: 2×2 same-pair, host 1m→1D. Expect ≤ 2 fetches before paint
   (0 if master covers viewport), then background hydration; settled state seams 0,
   panels aligned, master spans session. Compare against S6 before (87–91 fetches).
3. Immediately-after-boot TF switch (note 2 above): enter multichart, switch TF
   within ~2s. Either fast path or clean eager fallback — no blank chart.
4. Mid-hydration cancels: TF switch during hydration, then pair switch during
   hydration — clean restart both times.
5. Kill-switch matrix: tf-switch flag on → TF switch eager again while pair switch
   stays fast; pair flag on → inverse. Both off → both fast.
6. Un-hydrated replay scrub during background hydration — no console errors.

Rollback = kill-switch first, evidence captured, no patch-on-patch (D-010 policy).
**Pass ⇒** B-FIX-3 family CLOSED against the original PO complaint; S6 re-captured
as the new baseline in `BASELINE-RESULTS.md` (it becomes the "before" for follow-up
#2); manager dispatches follow-up #2 (high-limit `/smart`), server-side verification
first. **Fail ⇒** kill-switch, read-only diagnosis.

---

## D-013 — ESC-006 ruling: Option A. Kill-switch now, panel-feed fix next (2026-07-05)

**Ruling: Option A**, exactly as the manager recommends. B is rejected on policy: we do
not leave a known ownership regression live while a fix is authored (D-010 rollback
policy exists for precisely this). Note what the counters bought us: `seams = 0`
everywhere means no data corruption — the invariant machinery contained the blast
radius to wasted fetches and re-renders. This is the process working, not failing.

### Step 1 — kill-switch isolation (PO, no deploy, do first)

Flip flags in this order, repeating the 2×2 host TF-switch capture after each state:
1. `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH = true` only (pair flag off).
   The §6p capture was a TF switch, so this alone should restore B/C/D to
   fetches 0 / extendsFromParent rising. Also do one PAIR switch in this state —
   if panels self-fetch on pair switch too, the regression spans both halves.
2. If panels still self-fetch: both flags true → must fully restore S6-baseline
   panel behavior. If it does NOT, the regression is not viewport-first and §6p
   is misattributed — stop and escalate.
Record the matrix in FINDINGS. Leave the minimal set of flags disabled that restores
panels-copy; keep the other half of the win live if isolation shows it is safe.

### Step 2 — B-DIAG-5 (read-only, before any fix)

The fix target must be named by line, not by theory. The worker answers ONE question:
**which exact check makes a same-pair panel fall back to self-fetch when the host
master is incomplete?** Suspects to check first: the coverage/completeness test in
`_tryExtendReplayMasterFromParent` (or its caller) whose failure falls through to
`checkViewportLoadMore` self-fetch, and any "host not ready" boot-wait path that is
bypassed on TF switch. Deliverable: file:line of the fallback decision, plus what
signal the panel WOULD need to keep waiting (e.g. "host hydration in progress" flag).

### Step 3 — B-FIX-3c spec (panel-feed, gated, after B-DIAG-5)

Direction, subject to B-DIAG-5 confirmation: same-pair panels must treat "host
hydration in progress" as WAIT-AND-MIRROR, never self-fetch. Concretely: the host
already exposes its hydration state (`_mcViewportFirstHydrationSeq` /
`_mcViewportFirstMasterReady`); panels mirror the host's viewport-first window
immediately (small copy — same UX as host), then consume background extends exactly
as they did in the S6 baseline (extendsFromParent rising). Self-fetch remains legal
ONLY for independent-symbol panels (I1). Own kill-switch; re-enable 3/3b flags only
together with 3c in the same build.

**Acceptance adds one NON-NEGOTIABLE item to every future multichart report:
same-pair panel `fetches` MUST be 0 in the 2×2 capture.** That column was in the S6
baseline and in §6p's diagnosis, but it was not an explicit pass/fail line in the
D-012 live checklist — that is the process gap that let this ship. It is now a
standing acceptance criterion alongside seams = 0.

ESC-006 remains open until Step 1 matrix is recorded; close it citing this decision
plus the B-FIX-3c live pass.

---

## D-014 — Step-1 matrix row 1 read; METHOD CORRECTION for row 2 (2026-07-05)

§6p Step-1 row 1 acknowledged: TF flag alone did not restore panels-copy. The manager's
interpretation (source includes B-FIX-3 pair-load at 2×2 setup) is plausible — entering
multichart routes through `loadMultichartPanelFromHost`, i.e. the B-FIX-3 path, so the
host master is deferred from the moment the layout is created, before any TF switch.

**Method correction (binding for row 2 and any re-run of row 1):** the kill-switches
must be set BEFORE the session loads, not flipped mid-session. Two reasons:
1. The flags gate FUTURE switches only. If the host master was already left incomplete
   by an earlier viewport-first load in the same session, flipping a flag afterwards
   does not retroactively hydrate it — panels still see an incomplete master and
   self-fetch. A mid-session flip therefore cannot distinguish "flag doesn't fix it"
   from "state was already contaminated."
2. Worse: per §6m the kill-switch also CANCELS in-flight hydration — flipping it
   mid-session can freeze the master permanently incomplete, which is precisely the
   self-fetch trigger. A mid-session flip can manufacture the very symptom being
   measured.

**Row-1 result is therefore INCONCLUSIVE if it was captured after a mid-session flip**
(the report does not say). Required procedure for each matrix state: set flag(s) via
console → full reload → enter multichart fresh → host TF switch → capture. Re-run
row 1 this way, then row 2 (both flags). Persist flags across the reload (set them in
an early inline console snippet or localStorage-backed bootstrap if the flags are read
at engine init — worker/PO to confirm how the flags are read; if they are only read
live, set them in the console immediately after load, BEFORE entering multichart).

**B-DIAG-5 dispatch is authorized NOW, in parallel** — it is read-only and its question
(which exact check makes a same-pair panel self-fetch on incomplete host master) is
load-bearing under every matrix outcome. Do not wait for the matrix to finish.

Standing note: whatever B-FIX-3c does, the 2×2 SETUP path (entering multichart) is now
in scope alongside pair/TF switches — the incomplete-master window exists from layout
creation, not just from switches.

---

## D-015 — Matrix complete: source confirmed; durable rollback ruling (2026-07-05)

Step-1 matrix accepted as conclusive: both-flags-off restores panels-copy (B/C/D
fetches 0), TF-flag-alone does not → the viewport-first family is confirmed as the
regression source, with B-FIX-3 (pair-load at 2×2 setup) as the essential culprit,
exactly as D-014 anticipated. ESC-006 step 1 CLOSED.

### Durability ruling: option (a) — ship a default-OFF build now

The manager's caveat is correct and (a) is the ruling: runtime `window` flags reset on
reload and protect only a tester who knows to set them. Authorize immediately a
minimal, one-worker change: **default both viewport-first behaviors OFF in code**
(initialize the enable-state so the gate functions return false unless an explicit
opt-in flag is set — e.g. invert to `__TALARIA_MC_ENABLE_VIEWPORT_FIRST*` opt-ins, or
a hardcoded `const VIEWPORT_FIRST_DEFAULT = false`). Constraints:
- Do NOT delete or refactor the viewport-first code — 3c will re-enable it; this is a
  default flip only, smallest possible diff, both copies byte-identical.
- Verification: fresh reload with no console flags → 2×2 TF switch → panels fetches 0,
  host behaves like S6 baseline. Opt-in flag set → viewport-first engages (proves the
  code path is preserved).
- (b) fast-tracking 3c under time pressure is REJECTED — that is patch-on-patch with a
  live regression as the clock; 3c proceeds at normal rigor behind B-DIAG-5.

### One anomaly to close before B-FIX-3c is specced (manager: small follow-up)

In the both-flags-off row the panels show `extendsFromParent = 0` — but the S6
baseline for the same host TF switch showed extends 85–89, and the host numbers are
also smaller (43 fetches / 52k bars vs 91 / 178k). Panels fetches 0 satisfies the
ownership criterion, but 0 extends raises the question of how panels obtained the
new-TF data at all in that capture (initial boot clone covering the window? capture
taken too early? different pair with shorter history?). Not blocking the default-OFF
build; DO answer it before 3c's acceptance numbers are set, otherwise 3c will be
measured against an inconsistent \"restored baseline.\" One PO re-capture on the
default-OFF build (full S6 procedure, same pair as the original baseline) should
settle it and simultaneously serve as the fresh \"before\" for 3c.

Sequence from here: default-OFF build ships → PO re-capture (S6 procedure) →
B-DIAG-5 report (already dispatched per D-014) → B-FIX-3c spec.

---

## D-016 — ESC-007 ruling: Option B direction, gated on B-DIAG-6 (2026-07-05)

First, state of the world acknowledged: the default-OFF build (b604) is a good,
durable production state — same-pair/same-TF 2×2 is fast and correct (host 4 fetches,
panels 0, seams 0), the extendsFromParent=0 anomaly is settled as scale-dependent and
correct, and ESC-006 is fully closed. Ship-state pressure is off; we can pick the
right fix, not the fast one.

**Ruling: Option B is the direction — remove the 1m-master tax at the source.**
The manager's rationale is adopted: viewport-first only ever *masked* the tax behind
background hydration, and the mask is what regressed ownership. A 22×/44× structural
penalty (91 fetches/178k bars vs 4/4000 for the same user action) should be removed,
not hidden. This also converges with the overhaul's own architecture findings: the
lightweight-charts prototype proved display-TF-first with on-demand resampling is the
sound model.

**But B is conditional on B-DIAG-6 (read-only, dispatch now), because the 1m master
is contractual.** The diagnosis must answer, with file:line evidence:
1. Where exactly is the multichart host pinned to a 1m master
   (`loadMultichartPanelFromHost` masterTf='1m' per DIAG-B4 — plus ALL other sites
   that assume it), and which consumers rely on 1m granularity: replay
   frame-stepping/scrub, same-pair panel feed (incl. cross-TF resample), indicators,
   playhead math.
2. **Feasibility of the expected landing zone — a HYBRID, not deletion:** host uses a
   display-TF master for browsing/switching (single-chart parity), and hydrates the
   1m session master LAZILY only when replay actually needs bar-level stepping
   (play/scrub), reusing nothing from viewport-first's deferred-hydration code unless
   it genuinely fits. The DIAG's job is to say whether the replay/panel contracts
   allow this and what the seams are.
3. What cross-TF same-pair panels (pain #2, S6-c) would consume under B — if the host
   master is display-TF, a 4h panel with a 1m host still can't extend from it; name
   the mechanism (host extends its master on panel request? panel resamples from a
   shared store? panel self-fetch stays legal?). **Pain #2's fix is deferred until
   DIAG-6 answers this** — its correct shape depends on what the master becomes;
   fixing it now against the 1m contract could be immediate rework.

**Standing decisions attached to this ruling:**
- Viewport-first stays default-OFF permanently. It is superseded as an approach; the
  code remains in place (kill-switched) only until B lands, then a cleanup task
  removes it (I-clean, not now).
- Fallback: if B-DIAG-6 concludes the replay contract makes B infeasible or
  replay-endangering, we fall back to Option A (re-enable + DIAG-B5 wait-and-mirror
  as a hard gate) — but that requires a new escalation with the DIAG evidence, not a
  silent pivot.
- Follow-up #2 (high-limit `/smart` round-trips) folds INTO B's implementation if B
  proceeds (lazy 1m hydration should arrive in 1–3 big requests, not ~50 chunks) —
  it is no longer a separate queued task.
- The S6-b/S6-c captures on b604 are the canonical "before" for B.

ESC-007 CLOSED by this ruling; next artifact expected: B-DIAG-6 report.

---

## D-017 — §6t–§6x review: staging ratified; expanded B8 gets a design gate (2026-07-05)

### Ratifications (manager decisions within the D-016 mandate — all correct calls)

1. **B-FIX-6 staging (6a browsing / 6b lazy-1m / 6c high-limit)** — ratified. Each
   stage kill-switched and independently measurable is exactly the shape D-016 wanted.
2. **6a result accepted:** host 91→23–25 fetches, 178k→40–43k bars, panels
   `fetchedBars = 0` with empty probes only — I1 intact. The ~70% tax cut is the first
   direct hit on the user's original complaint. Renders-high stays RC2, deferred.
3. **6a-2 accepted:** correct root (idempotency early-return swallowing the host
   fanout after a narrow commit), correct fix choice (re-mirror on material extent
   change, not re-widening the host), and the extent-actually-differs gate shows the
   ESC-006 lesson is being applied. PO confirm ("same same candles") closes it.
4. **Sequencing 6b before B8** — ratified; B8 depends on where 6b draws the
   "host may hold a fine master" boundary. Doing B8 first invited rework.
5. **6b isolation in §6x is clean method:** flag made no difference → 6b not the
   cause. 6b stays signed off. **However: the deferred 6b replay smoke test is now a
   BLOCKING precondition for the B8 build** (see below) — B8 is being designed
   against 6b's boundary, so that boundary must be proven live first, not assumed.

### Ruling on expanded B8 (§6x): approved in direction, GATED on a design review

The expanded scope is right — both symptoms (group-by-group loading AND drift with
all sync off) are one root: same-pair coupling that ignores the user's sync toggles.
But be clear about what this is: **not a perf fix — a semantic change to the sync
contract.** Panels sharing the host replay master regardless of toggles was a design
decision; B8 revokes it for finer-TF panels. That is ESC-006 territory (same-pair
ownership) and the manager's design-first instinct is confirmed and hardened:

**The B8 design doc must be escalated to the Director before any build** (not just
manager review), and must answer:
1. **The new ownership contract, stated as a table** — for same-pair panels:
   same-TF ⇒ mirror (fetches 0, unchanged); finer-TF ⇒ independent owner
   (own master, own viewport); independent symbol ⇒ unchanged. Sync toggles govern
   viewport/crosshair/interval only; data ownership follows the TF relationship.
   This table goes into INVARIANTS as an I1 clarification once approved.
2. **Bounded fetch, defined numerically.** A finer panel owns a VIEWPORT-SIZED
   window plus replay-playhead coverage — never full session history. State the cap
   (bars per fetch, max chunks per switch) and the acceptance numbers. "Independent
   owner" without a bound is how ESC-006's aggregate blowup happened.
3. **Replay semantics for an independent finer panel:** who computes its forming
   candle and playhead position (it no longer reads the host master); confirm
   playhead-moment sharing survives (panels show the same time, own data);
   what happens when the playhead advances past the panel's loaded window
   (lazy extend via its own master — which is 6b's pattern, panel-side).
4. **Memory statement:** N finer panels = N independent masters; give the expected
   worst-case bars-in-memory for a 4-layout and confirm it is acceptable.
5. **Migration/interaction:** what happens live when the host switches TF such that
   a panel flips between same-TF (mirror) and finer-TF (owner) — the handover in
   both directions, without refetch storms.

Acceptance for the eventual B8 build inherits the standing criteria (same-TF panels
fetches = 0; seams 0 everywhere) plus: aggregate fetches across the 2×2 must be LOWER
than the §6w mixed-TF capture (~116k bars through the host), and drift-with-sync-off
must be demonstrably gone (PO scenario from §6x re-run).

Order from here: 6b replay smoke test (blocking) → B8 design doc → Director review →
B8 build. 6c (high-limit /smart) may proceed in parallel with B8 design if worker
capacity allows — it is orthogonal plumbing with its own kill-switch.

---

## D-018 — B8 design (DIAG-B8b) APPROVED as implementation contract, with conditions (2026-07-05)

Read directly (not only the manager summary). All five D-017 questions are answered
with code evidence, and the ESC-006 lesson is structural, not cosmetic: the cap is
numeric (2×5000 per acquisition, +5000 per pan-edge, 2000 replay catch-up; 30k bars
worst-case in a 4-layout vs ~116k today), the handover is generation-tagged and
atomic, and the design explicitly forbids the exact DIAG-B8 path (delegating history
fill to `host.checkViewportLoadMore()`). **Approved as the B8 implementation
contract.** The ownership table in §1 is adopted — manager: copy it into
`INVARIANTS.md` as the I1 clarification now, so the impl worker inherits it as an
invariant, not a suggestion.

### Conditions (all binding on the impl task)

1. **Fetch caps land exactly as written** — the numbers in §2 are contract terms,
   not guidance. Any deviation (even "5000 → 6000 because the helper rounds") is a
   report-rejection item.
2. **New diag counters required** so acceptance is measurable, per owner panel:
   `ownerFetches`, `ownerBars`, `boundedMisses` (playhead outside owned window),
   `handovers` (mirror→owner and owner→mirror counts). Without these the cap and
   the handover claims are unverifiable live.
3. **Owner-flip decisions ride host COMMIT events, not polls.** The mirror↔owner
   classification must be evaluated against the host's committed native TF after a
   switch (generation-tagged), never against in-flight state — this is where a race
   would reintroduce ESC-006-style behavior. The design implies this (§5); the impl
   must make it explicit.
4. **6b replay smoke test remains BLOCKING** (D-017) — must pass live before the
   B8 build ships. No change.
5. **Kill-switch** per §6x, restoring today's shared-master coupling exactly.

### TREE CONTAMINATION — resolve BEFORE dispatching the impl worker

The report's own Verification section discloses that post-task `git status` showed
`chart v 1.4/chart/chart.js` AND `homepage/public/chart/chart.js` modified, while the
pre-task status did not list them. A read-only design task is zero-diff by
definition (D-013/D-014 hygiene). The worker disclaims authorship; that may well be
true (e.g. 6a-2/6b work landing in the same tree), but "probably fine" is not the
standard. **Manager, before B8 impl dispatch:** diff both files, attribute every
hunk to a signed-off task (6a/6a-2/6b/rollback), record the attribution in FINDINGS,
and confirm both copies are byte-identical. If any hunk cannot be attributed, STOP
and escalate. The impl worker starts from a clean, attributed tree or not at all.

Also still dangling since §6k: PO confirmation on `Sources Handoff/TalariaV16.jsx`
(it appears again in this report's pre-task status, now joined by
`journal-backend/routes/journal/live_accounts.py`). Neither touches the chart, but
unexplained modifications in the working tree during a disciplined overhaul are a
standing audit risk — PO to clear both, once, this week.

### Acceptance for the B8 build (inherits D-017 + standing criteria)

- Same-TF panels: fetches = 0 (unchanged, non-negotiable).
- §6x PO scenario re-run: drift with all-sync-off GONE; group-by-group GONE.
- Owner panels: ownerBars ≤ cap in every capture; boundedMisses observed only with
  the documented clamp behavior (no blank frames, no console errors).
- Aggregate bars across the 2×2 mixed-TF capture strictly below the ~116k baseline.
- Both handover directions exercised live (host TF switch across the panel's TF in
  both directions) — no refetch storm, no blank frame, playhead stays shared.
