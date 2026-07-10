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

---

## D-019 — Pre-dispatch gate accepted; 6c ledger gap + baseline refresh (2026-07-05)

§6y accepted: the attribution was done the right way — tree clean vs HEAD, both
copies byte-identical (I4), every engine signature tied to a signed-off task, the
"contamination" explained as parallel-task edits landing in a shared working tree
(plus the PO's own commit `a38d299d`). **B8 impl dispatch stands authorized.**
Ownership-table adoption into INVARIANTS confirmed.

Two corrections before the B8 build is measured:

1. **6c has no sign-off entry in the ledger.** §6y's attribution calls the 6c edits
   (`_highLimitBulkHistoryDisabled`) "signed-off", but FINDINGS has no §6 entry
   recording a 6c code sign-off — no review, no hashes, no kill-switch check. D-017
   allowed 6c to proceed in parallel; it did not exempt it from the process. Manager:
   write the 6c sign-off entry (code review vs its spec, kill-switch verified, copies
   byte-identical — the hash in §6y likely already covers this) before any B8
   measurement is taken. Unrecorded-but-shipped is exactly the pattern this overhaul
   exists to eliminate.
2. **The B8 "before" must be re-captured on the current build.** The ~116k-bars /
   ~58-chunk mixed-TF baseline (§6w) was captured before 6c changed the fetch chunk
   shape. B8's acceptance is stated in bars, so the headline criterion survives, but
   chunk counts and any fetch-count comparisons do not. One PO capture of the §6x
   mixed-TF scenario on the current build (6a+6a-2+6b+6c live, B8 not yet) becomes
   the canonical B8 "before". Cheap, and it prevents an apples-to-oranges dispute at
   B8 acceptance time.

Unchanged: 6b replay smoke test blocks B8 ship (not dispatch); PO audit of the two
non-chart files stays due this week. Good marker discipline on the §6s stub note —
append future entries after §6y.

---

## D-020 — ESC-009 ruling: DIAG first (two questions, not one), then A; B rejected (2026-07-05)

The manager's diagnosis of why B8 cannot fire is confirmed and well-evidenced (all B8
counters zero on b18 — structurally inert, not misbehaving). Ruling follows the
manager's shape (read-only DIAG, then the cheap fix) with one significant expansion.

### The bigger finding hiding in the capture

The b18 numbers show the HOST hauling a 1m master (29 fetches / 34k bars) in an
**armed-but-not-playing** backtest. Under 6a+6b that should not happen: 6a gives the
browsing host a display-TF master, and 6b's whole contract is "1m lazily, only when
replay actually steps finer." An armed-not-playing session hauling 34k 1m bars means
**6b's lazy boundary is not holding in exactly the scenario it was built for** — and
recall this same trap (`replaySystem.isActive` true when merely armed, DIAG-B8 root)
has now bitten twice. This was the proof the deferred 6b smoke test was meant to
supply; ESC-008 folded it into B8 acceptance, and here is the first live evidence it
would have failed.

Connection that matters: **if the 6b boundary held** (armed-not-playing host commits
display-TF native, e.g. 4h), then 1m panels WOULD be finer-than-native, B8's existing
gate would fire naturally, panels would self-own bounded windows, and both the drift
AND the group-by-group host hauling disappear — no re-keying needed. The two "dead"
fixes may both come alive by fixing one boundary.

### B-DIAG-9 (read-only, dispatch now) — answers BOTH questions

1. **Drift mechanism, named by line:** when the shared host master prepends older
   bars on backward pan-load, what do mirror panels fail to compensate?
   The single-chart engine already solves prepend-without-jump for its own pan loads
   (offset/index re-anchoring in the `checkViewportLoadMore` merge path) — find why
   the mirror-commit path lacks the equivalent compensation. Suspect list: the
   mirror clone in `_multichartMirrorHostTfSwitchIfReady` / replay-frame mirror
   resetting `offsetX`/indices against the NEW array length without adding the
   prepend delta.
2. **Why is the armed-not-playing host still on a 1m master despite 6a+6b?** Trace
   the actual commit: is `_emitMultichartHostDataCommit`'s
   `replaySystem.isActive ? rawTimeframe : _nativeRawFetchTf` the pin (armed ⇒
   isActive ⇒ 1m), and does 6b's gate use the same too-loose "armed" predicate?
   Deliverable: whether tightening the predicate to "actually stepping/playing or
   playhead requires finer" makes the host commit display-TF native when idle-armed,
   and what replay-start then requires (the 6b lazy hydrate on first step).

### Fix ruling

- **Option A (viewport-stability on prepend) is pre-approved** as an immediate,
  gated, kill-switched fix once DIAG-9 names the line — it is I3-clean (viewport
  channel only), keeps fetches=0, and kills the user's sharpest pain regardless of
  what happens with the boundary. Ship it first.
- **The 6b-boundary tightening is the expected structural fix** for group-by-group
  hauling (and B8's activation), pending DIAG-9 Q2 — it will be specced as its own
  task (B-FIX-6b-2), NOT bundled with A.
- **Option B (re-key finer-than-host to DISPLAY TF) is REJECTED**, not deferred:
  it duplicates 1m storage host+panels, re-opens the ESC-006 ownership axis, and —
  decisive — it patches around the same broken boundary that Q2 fixes properly. If
  DIAG-9 proves the boundary cannot be tightened safely, re-open via escalation.
- B8 itself stays shipped and inert; its counters are the proof harness for whether
  the boundary fix activates it. Do not modify B8 in either task.

---

## D-021 — §6z–§6ab review: ledger closed, DIAG-B9 ratified, 6b-2 spec constraints (2026-07-05)

Acknowledgments, then the constraints that matter for the next two builds.

- **§6z closes D-019 correction #1 properly** — the 6c sign-off is a real review
  (panel exclusion preserving I1, kill-switch causality read in code, `/bars` bypass
  scoped), not a backfilled rubber stamp. Ledger is whole again.
- **§6aa B8-IMPL sign-off accepted**; the build-id collision catch (worker built b11
  behind the deployed b14) was exactly the kind of operational hazard the manager
  layer exists to catch. B8 live acceptance on b15 remains pending and is now
  partially subsumed by the ESC-009/D-020 finding — B8 cannot fire until 6b-2 lands,
  so B8's live proof rides the 6b-2 acceptance run.
- **DIAG-B9 ratified.** Both linchpins verified (armed ⇒ isActive ⇒ 1m pin at
  chart.js:3911; prepend compensation exists in the owner path but is absent at the
  three mirror-commit sites). B-FIX-A dispatch confirmed per the D-020 pre-approval.

### B-FIX-A acceptance (gated, kill-switched — the PO run)

PO's own repro is the test: host 4h over 1m master, panels 1m, backtest armed, all
sync OFF, drag host into empty space to trigger backward pan-load. Pass = candles in
B/C/D stay anchored (no backward shift), panel fetches stay 0, seams 0, kill-switch
restores the drift, single-chart unaffected (all three sites are multichart-only
paths). All three mirror sites must use ONE shared compensation helper — three
hand-rolled copies of prepend math is how the next drift bug gets written.

### B-FIX-6b-2 spec constraints (binding; spec after A ships)

1. **Fix the master source, not the label.** DIAG-B9's nuance is adopted as a hard
   requirement: the idle-armed host must actually LOAD/COMMIT a display-TF master;
   merely emitting a display-TF native in the commit event makes B8 fire against a
   phantom master. Both `loadMultichartPanelFromHost` (3911) and
   `_emitMultichartHostDataCommit` change together, plus the second surface DIAG-B9
   flagged (`_getReplayPanFetchTimeframe` returning 1m on armed-paused pan).
2. **The replay-start transition is the riskiest moment — spec it explicitly.**
   When the user actually presses play/steps, 6b hydrates 1m and the host's
   committed native flips display-TF → 1m. At that instant: 1m panels flip
   owner → mirror (B8 handover, generation-tagged), coarser panels re-key against
   the new native. The 6b-2 report must describe and live-test this transition —
   no blank frames, no refetch storm, B8 `handovers` counter increments, B-FIX-A's
   compensation holds through the flip.
3. **Acceptance doubles as the missing 6b boundary proof** (ESC-008's folded test):
   idle-armed host boot shows display-TF-sized `fetchedBars` (thousands, not 34k);
   first play hydrates 1m lazily (bounded, via 6c in 1–3 requests); kill-switch
   comparison shows eager reverts. Plus B8 activation: with a 4h host and 1m panels,
   `ownerFetches > 0`, `ownerBars ≤ cap`, drift stays gone.

Order confirmed: B-FIX-A ships and passes the PO run FIRST; 6b-2 is specced against
that accepted state. Nothing else rides in either build.

---

## D-022 — Drift thread CLOSED (B-FIX-C); new standing rule; back to plan (2026-07-06)

### Closure and credit

B-FIX-C accepted live ("the drifted movement is fixed") — the drift thread that ran
B-FIX-A → DIAG-B9 → DIAG-B10 → B-INSTR-B10b → B-FIX-C is closed. The final mechanism
(panels share the host replay master by reference; `currentIndex` was compensated on
left-growth but `chart.offsetX` never was — host compensates its own, panels don't:
asymmetry = drift) was proven by live logs, not argued from code. The §6af capture is
a model artifact: four log lines that settle what two static diagnoses could not.

### Standing rule (binding, add to INVARIANTS as I10)

**A fix targeting a live-reproducible symptom requires a live-verified mechanism.**
DIAG-B9 Q1 named a plausible-but-wrong site family from static reading; B-FIX-A was
implemented faithfully against it and was inert for the actual repro. Static code
tracing may SCOPE a diagnosis, but before a fix task is dispatched for a symptom the
PO can reproduce, the diagnosis must include an instrumented live capture showing the
faulty variable doing the faulty thing (as B10b did: offsetX constant while firstVisTs
jumps). "The code reads like it should do X" is spec input, not proof. This formalizes
the manager's own "no more blind fixes" call — correct call, now policy.

B-FIX-A stays in (correct for its sites, kill-switched, harmless) — concur with the
manager; no revert.

### Backlog triage RATIFIED; PO's return-to-plan is the right call

BL-1 (switch-back flicker) and BL-3 (replay render lag) fold into Phase 3 render
budget; BL-2 (cross-panel price-scale coupling) gets its own DIAG when scheduled —
note BL-2 is an INVARIANT violation (price-axis independence), so when Phase-3
planning starts it outranks the cosmetic items. None block 6b-2. Chasing each new
symptom as it appears is the old whack-a-mole loop; logging + triaging + returning to
plan is exactly the discipline this overhaul exists to enforce.

### Next step: B-FIX-6b-2, D-021 constraints unchanged, two additions

1. The §6af capture independently confirmed the group-by-group hauling live
   (`hostLoad prepended=2000` ×12, ~24k bars) — that capture is the 6b-2 "before";
   no new baseline needed.
2. **Interaction check for the 6b-2 report:** B-FIX-C compensates panel offsetX on
   shared-master left-growth. After 6b-2, the idle-armed host holds a display-TF
   master and 1m panels become B8 owners — the shared-master growth path B-FIX-C
   compensates largely stops firing in this scenario. The report must state which
   compensation paths are active in each mode (idle-armed browse / playing / owner
   panels) and confirm no double-shift and no orphaned path.

### Hygiene register (schedule after 6b-2 ships — one cleanup task)

- `[B10]` instrumentation: keep through 6b-2 acceptance (it directly verifies the
  before/after), then gate behind a diag flag or strip.
- Viewport-first dead code removal (per D-016, "after B lands").
- Kill-switch inventory: we now carry 8+ flags; the cleanup task must produce a
  table (flag → fix → default → can it be retired) so the flag surface doesn't
  become its own bug source.

---

## D-023 — 6b-2 + D/E/F ratified; G closes the thread; then CONSOLIDATE (2026-07-06)

### Ratifications

- **B-FIX-6b-2 ACCEPTED** (idle-armed host 4h: fetchedBars 34k → 4000). With B-FIX-C
  (drift) this closes both halves of the ESC-009 pathology. The single-source
  predicate `_multichartReplayFineMasterInUse()` driving all three sites is the right
  shape — no scattered copies.
- **B-FIX-D (fill-loop plateau guard), B-FIX-E (cache playhead-coverage guard),
  B-FIX-F (panel mirror hold)** — all three sign-offs and live verifications
  accepted. The chain LOOKS like symptom-chasing but is not: it is one pre-existing
  composite pathology (the host replay-TF-switch settling path) peeled layer by
  layer, each layer instrumented per I11, DIAG'd read-only, fixed with one gated
  change, and live-verified before the next. The rejected-fix write-up under B-FIX-E
  (why gating the first paint fails) is exactly the kind of negative result that
  belongs in the ledger. This chain is hereby named the **TF-SWITCH SETTLING
  thread** and closes as a unit when B-FIX-G passes.

### B-FIX-G acceptance run — fold four checks into ONE PO session

1. G acceptance as written (§6 spec): C and D no longer flash / show stale prices;
   all four settle to the host frame; B stays perfect; kill-switch reverts.
2. **BL-1 reconciliation:** the switch-back flicker IS this thread. If G passes,
   the manager updates BL-1 to resolved-by-F/G (or narrows it to what remains).
3. **§6al(b) check:** confirm the host price-scale-off-screen-until-double-click is
   gone post-D/E (the offsetX runaway driver was removed); if it persists, it stays
   a named backlog item, not a silent loose end.
4. **B8 activation counters** (soft-outstanding from §6ak): during the same session,
   one drag/play capture showing `ownerFetches>0` / `handovers` incrementing.
   Cheap, same session, closes the last D-021 #3 box.

### After G passes: STOP FIXING, CONSOLIDATE (binding order)

No new fix tasks (backlog items included) until these three land:
1. **Cleanup task** (D-022 hygiene register, now larger): strip or flag-gate `[B10]`
   instrumentation; remove viewport-first dead code (D-016); kill-switch inventory
   table (flag → fix → default → retire?) — we now carry 12+ flags.
2. **Baseline re-capture** on the post-G build: S1/S6-class scenarios plus the two
   canonical repros (armed-idle pan-load; 1m→4h→1m switch-back) recorded in
   BASELINE-RESULTS as the new reference state. This is what future regressions get
   measured against; without it every fix we just shipped is unprotected.
3. **Plan re-baseline (Director + Manager):** the original Phase 1/2 root causes have
   been substantially addressed out of order (ownership via B8+6b-2, event-driven
   commits via `talariaMcHostDataCommit`, poll-and-mutate partially retired). The
   phase docs no longer describe reality. One short session to mark what is DONE,
   what remains (Phase 3 render budget: renders-high, BL-1 remnant, BL-3; BL-2
   price-scale coupling; BL-4 playhead-centered bulk window), and in what order.

Register updates: **BL-4** (bound the session-start bulk fetch to a playhead-centered
window, from B-FIX-E's secondary note) is formally in the backlog. BL-2 remains the
top-priority backlog item after consolidation (invariant violation, per D-022).

---

## D-024 — COURSE CORRECTION: ledger repair, BL-5 finishes, then a hard freeze (2026-07-06)

### What the record shows

Since D-023 ("after G passes, STOP FIXING, CONSOLIDATE"): B-FIX-H, B-FIX-I, and
B-FIX-J shipped; builds ran b46 → b67; BL-5 is open with two admitted
patch-on-patch attempts behind it. Meanwhile the ledger has HOLES:
- **B-FIX-G live acceptance: not recorded.** Nor the four checks D-023 folded into
  that session (BL-1 reconciliation, §6al price-scale, B8 counters).
- **B-FIX-H live verification: explicitly REQUIRED in its own entry, result not
  recorded.** Same for the BL-2b isolation test (settled-resync flag).
- **B-FIX-I and B-FIX-J have NO ledger entries at all** — they exist only as
  passing mentions inside the BL-5 brief. This is the 6c gap (D-019) again, ×2.
- Section numbering collided again (two §6ak).
- The D-023 consolidation (cleanup, baseline re-capture, plan re-baseline):
  none of it happened.

The PO authorized fix-now on BL-2b — that override was the PO's call to make, and
B-FIX-H itself was disciplined. But the freeze then dissolved entirely, and §6ak's
own words ("prior patch-on-patch attempts did NOT resolve it — do NOT iterate
blindly") describe the exact loop this overhaul was commissioned to break, now
running in fast-forward: 12+ builds in a day, fixes shipping without ledger
entries, baselines three generations stale, ~17 kill-switches uninventoried.

### Rulings

1. **BL-5 proceeds** — the §6ak worker brief is good (facts pinned, caller-name
   requirement per I11, one gated fix, narrowest entry). Dispatch as written.
   One addition: the report must state whether B-FIX-I and B-FIX-J are still
   needed once the real driver is fixed, or are dead scar tissue to retire.
2. **Ledger repair is mandatory and parallel** (docs-only, no build): entries for
   B-FIX-G acceptance result, B-FIX-H live result, BL-2b isolation-test result,
   and full sign-off entries for B-FIX-I and B-FIX-J (site, mechanism, kill-switch,
   hashes, live status). If any of these was never actually verified live, the
   entry must SAY so — an honest hole beats a smooth narrative. Fix the §6ak
   collision (renumber the BL-5 entry).
3. **After BL-5: HARD freeze.** No fix tasks — PO fix-now requests included —
   until D-023's three consolidation items land (cleanup + flag inventory;
   baseline re-capture on the current build; plan re-baseline). To the PO
   directly: every fix shipped without re-captured baselines is unprotected —
   the next regression lands silently, exactly like the weeks before this
   process existed. The freeze is not bureaucracy; it is what keeps the last
   48 hours' wins from unwinding. If a true showstopper appears mid-freeze,
   it comes through ESCALATIONS with a Director ruling, not a chat authorization.
4. **Scope note for consolidation:** the flag inventory now also decides, for each
   of F/G/H/I/J (five overlapping mirror-hold/recovery patches on one path),
   whether it is load-bearing or superseded. Five interacting holds on
   `applyReplayFrame` is a maintenance hazard; the consolidation should propose a
   single coherent hold policy if the BL-5 root cause makes any of them redundant.

---

## D-025 — Ledger repair ACCEPTED; deferred-checks manifest; freeze stands (2026-07-06)

§6ap satisfies D-024 #2, and satisfies it the right way: real results recorded where
they exist (G accepted; I accepted twice, including its own b56 regression and b58
re-fix — which should have been ledgered at the time, but is now honestly on record),
and **NOT CAPTURED written where nothing was captured** instead of a smoothed
narrative. Two findings in the repair materially change the working picture:
- **B-FIX-H is INERT for its target symptom** — BL-2b's mechanism remains
  static-derived and unproven. Whatever resets the sync-off panel scale on host
  1m↔4h is still unidentified. BL-2b therefore goes back on the backlog as OPEN
  (not fixed-by-H), and H is a retire-candidate in the flag inventory.
- **B-FIX-J is INSUFFICIENT by its own honest status** — its intent is subsumed by
  the BL-5 root fix. The manager's provisional classification (F+G load-bearing,
  H inert-harmless, I load-bearing, J insufficient) is accepted as the working
  input to the consolidation's single-hold-policy proposal.

### Deferred-checks manifest (so nothing evaporates a second time)

The following owed items are now a NAMED checklist, executed as part of the
consolidation baseline re-capture — each gets a PASS / FAIL / STILL-NOT-CAPTURED
line in BASELINE-RESULTS:
1. BL-1 reconciliation (resolved-by-F/G, or narrowed remnant).
2. §6al host price-scale-off-screen-until-double-click check.
3. B8 activation counters (`ownerFetches > 0`, `handovers` incrementing) during
   one drag/play capture.
4. BL-2b isolation test (`__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC=true`) — now
   doubly relevant since H's inertness reopened the question.
5. BL-2 (sync-ON price reframe) — specced fix exists (§BL-2 DIAG), held by freeze.

### Standing state (no change)

BL-5 worker runs per D-024 #1 (name the caller live, one gated fix, report rules on
I/J retirement). After BL-5: hard freeze → cleanup + flag inventory → baseline
re-capture incl. the manifest above → plan re-baseline. Escalations file is the only
path for exceptions.

---

## D-026 — BL-5 + BL-2b closed; escalation ratified retroactively; FREEZE IS NOW ACTIVE (2026-07-06)

### Ratifications

- **B-FIX-BL5 accepted** (b68, live-verified). Model execution: caller named by live
  trace before the fix (the coalesced-seek rAF driving
  `ensureReplayDataCoversTimestamp` → adopt host 1m master → full reslice+resample
  per frame), guard placed at the narrowest entry with an already-aligned check so
  genuine scrubs still seek. The why-only-coarser explanation is coherent and on
  record.
- **B-FIX-BL2b accepted; BL-2b CLOSED.** The [BL2B_PRICE] probe capture is exactly
  what I11 demands — zero sync-bus events, driver named to the line
  (`_multichartMirrorHostTfSwitchIfReady` copying host price-state; secondary
  host-driven `resetPriceScale`). The price-axis-independence invariant is restored,
  and the capture also permanently settles WHY sync-off never helped: the coupling
  lived on the never-sync-gated replay bus. Note for the record: the DIAG found no
  price-sync toggle exists anywhere — price independence is therefore UNCONDITIONAL,
  which simplifies the invariant.
- **D-024 #1 verdict accepted:** I and J both KEEP (distinct paths, labeled for the
  flag inventory); H remains the sole retire-candidate.
- The **TF-SWITCH SETTLING / price-axis thread is closed** end-to-end
  (C→D→E→F→G→I→J→BL-5→BL-2b).

### Process notes (correct, do not repeat)

1. **The BL-2b fix-now exception is ratified retroactively** — it genuinely
   qualified (invariant violation, PO core target, live-instrumented DIAG first,
   one gated fix). But the ledger says "ESCALATION GRANTED — D-026" written by the
   MANAGER before any D-026 existed. Decision numbers and escalation grants are
   issued by this log, not pre-assigned in FINDINGS; the request also bypassed
   MANAGER-ESCALATIONS. Going forward: exception request → ESC entry → Director
   ruling → work. Manager: add a stub ESC-010 pointing here so the escalation
   ledger stays complete.
2. **Build-id inconsistency to correct in FINDINGS:** the DIAG capture is labeled
   b72 while the fix it "led to" shipped b70. If the probe capture actually
   happened before the fix on an earlier build, fix the label; if the fix shipped
   before the confirming capture, the entry must say so honestly (it would then be
   verified-after-ship, which I11 tolerates only with the live verification it in
   fact got).

### THE FREEZE IS NOW ACTIVE

No open fix targets remain; the PO's core target (all-sync-off ⇒ host actions have
zero effect on panels) is met and live-verified. Effective immediately, no fix
tasks of any kind. Consolidation deliverables, in order:
1. **Cleanup + flag inventory** (one task): strip/flag-gate `[B10]`, `[BL2B_PRICE]`,
   `_traceEmptyRenderDriver` instrumentation; remove viewport-first dead code
   (D-016); the full kill-switch table (now ~18 flags: flag → fix → path → verdict
   [load-bearing / backstop / retire], with F/G/H/I/J + BL5 given the single-hold-
   policy analysis from D-024 #4; H is the first retire candidate).
2. **Baseline re-capture** on the post-BL2b build: S1/S6-class scenarios, the two
   canonical repros (armed-idle pan-load; 1m→4h→1m switch-back), AND the D-025
   deferred-checks manifest (BL-1 reconciliation, §6al price-scale, B8 counters,
   BL-2b isolation flag — items 4–5 of the manifest are now largely settled by
   BL-2b's closure; record them as such with the evidence pointer).
3. **Plan re-baseline** (Director + Manager session): mark Phases 0–2 status
   against reality, scope what remains of Phase 3 (render budget: renders-high,
   BL-3) and Phase 4 (regression harness — the lwc-proto test rig from the
   prototype work is the seed), and set the order. BL-4 stays backlogged.

The regression-harness item deserves emphasis: this 48-hour sprint shipped ~15
gated fixes verified by ONE person's manual runs. The harness (Phase 4) is what
makes these wins durable without the PO hand-testing every future build.

---

## D-027 — Item-1 accepted; viewport-first deferral APPROVED as D-026 amendment (2026-07-06)

### Accepted

- **Process directive ACK + traceability backfill** — done properly (briefs verbatim,
  agent IDs, independent-verification statement). The build-id honesty note resolves
  D-026 #2: capture-before-fix order held (probe b69 → fix b70; "b72" was PO-side
  deploy-label drift), so I11 is satisfied.
- **Consolidation Item-1 (flag inventory + partial cleanup, b71)** — accepted. The
  inventory is the artifact this decision log has been asking for since D-022:
  22 behavioral flags, each with code path, default, and verdict; the four-phase
  single-hold policy (hard hold → F → G release; BL-5 seek skip; J/I recovery
  backstops; BL-2b price orthogonal) is a coherent model of what grew organically.
  Two catches earn specific credit: the **in-repo sw.js drift** (`dist-v9/sw.js`
  stuck at b36 while the mirror said b70 — a stale-serve hazard now reconciled) and
  documenting the **un-flagged hard hold** at panel-cmd-bridge.js:516.

### Ruling: the viewport-first deferral is APPROVED (amends D-026 item 1)

The manager deferred viewport-first dead-code removal (and H retirement) to a
post-baseline reviewed pass, against D-026's instruction to remove it in cleanup.
This deviation is CORRECT and is hereby the order of operations: deleting ~700
lines from the engine with no baseline to diff against and no regression harness
would have been the process's own rules violated in cleanup clothing. Removal
(viewport-first + H flag together, one reviewed task) is scheduled AFTER Item-2
baselines exist. This also sets a precedent worth naming: dead-code removal is a
behavior-affecting change for gating purposes, never "just cleanup."

### Endorsed for the plan re-baseline (Item-3 agenda)

- **CI check: all `sw.js` SW_VERSION === `__TALARIA_CHART_BUILD_ID`** — the
  b36/b70/b72 episode shows build-id drift is a recurring hazard class (it already
  caused the b11 collision). This belongs with the Phase-4 harness work.
- The `[BL2B_PRICE]` probe retention until the Item-2 BL-2b isolation re-capture is
  the right call; strip it in the post-baseline pass with viewport-first.

### Next

Item-2 (baseline re-capture + D-025 deferred-checks manifest) is now the only open
work item. Then Item-3 (plan re-baseline session), then the post-baseline removal
pass. Freeze holds throughout.

---

## [SUPERSEDED] D-026(mgr) — Manager pre-issued escalation grant; retroactively ratified by the Director's D-026 above (2026-07-06)

> NOTE (Manager, reconciliation): this entry and D-027 below were Manager-authored before the
> Director issued the binding **D-026 (freeze active)** above (1214). Decision numbers/escalation
> grants are issued by the Director, not pre-assigned by the Manager (Director D-026 process-note #1).
> Retained for history; the binding freeze decision is the Director's D-026 above. The escalation is
> now logged properly as ESC-010 in MANAGER-ESCALATIONS.

### Ratifications
- **BL-5 (B-FIX-BL5, b68) ACCEPTED live.** PO: "perfect it's fixed" — coarse-panel
  candle-by-candle re-render on paused host 4h→1m is gone. I4 hashes identical,
  node --check clean, kill-switch orthogonal. D-024 #1 satisfied: **B-FIX-I and
  B-FIX-J both KEEP** (load-bearing on different paths — held-panel off-screen
  backstop / mid-switch empty-render quieting); H remains the only retire-candidate.

### The question (PO): BL-2b now, or freeze first?
BL-2b (sync-OFF host TF switch rescales panels B/C/D Y-axis) is the surviving
symptom. It is a **price-axis-independence INVARIANT violation** (D-022 flagged it
top-priority) AND the PO's explicitly stated core target ("all sync off ⇒ host must
not affect B/C/D"). That clears the D-024 escalation bar for a fix-now exception.

### Ruling — GRANT the escalation, run BOTH in a STRICT sequence
1. **BL-2b DIAG (live-instrumented, read-only) FIRST.** I11 is binding and
   non-negotiable here: B-FIX-H already shipped INERT against a static-derived BL-2b
   mechanism. No fix leaves the gate until an instrumented live capture NAMES the
   exact function that rescales a panel Y-axis on a sync-off host TF switch. If the
   DIAG cannot reproduce/name it, we STOP and report — no third guess.
2. **BL-2b FIX** — one minimal gated guard at the named driver, own kill-switch,
   both copies, live-verified. This closes the TF-SWITCH SETTLING / price-axis thread.
3. **THEN the D-024/D-025 freeze runs in full** — cleanup + flag inventory (now also
   ruling on H retire + whether BL-2b's driver makes any of F/G/H/I/J redundant),
   baseline re-capture incl. the D-025 5-item manifest, plan re-baseline.

Rationale for this order (not freeze-first): BL-2b's driver is on the same
host-TF-switch path as F/G/H/I/J; identifying it makes the flag-inventory and
plan-re-baseline ACCURATE instead of speculative. Doing consolidation before we know
the last driver would just force a re-do. One more disciplined DIAG→fix, then the
freeze is real and complete. No further fix-now exceptions after BL-2b until
consolidation lands — this is the last one.

---

## [SUPERSEDED] D-027(mgr) — duplicate freeze activation; folded into the Director's D-026 above (2026-07-06)

> NOTE (Manager, reconciliation): duplicate of the Director's binding **D-026 (freeze active)** above.
> Retained for history only; the three consolidation items + sequence are governed by Director D-026.

### Ratification
- **B-FIX-BL2b (b70) ACCEPTED live.** PO: "perfect now all good" — sync-off host 1m↔4h no longer
  rescales panels B/C/D; kill-switch reverts; own scrub/playback unaffected. DIAG was live-proven
  ([BL2B_PRICE] capture, I11 satisfied) BEFORE the fix — the exact discipline that was missing when
  B-FIX-H shipped inert. I4 hashes match, node --check clean, one kill-switch
  (`__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE`).
- The **TF-SWITCH SETTLING / price-axis thread closes as a unit**: C (drift) → D/E (host cascade) →
  F/G (panel flash) → H (inert) → I (fast-switch) → J (empty-recovery) → BL-5 (candle-by-candle) →
  BL-2b (price coupling). The PO's felt pain on host TF switching is resolved.

### THE FREEZE IS NOW ACTIVE (binding — no exceptions)
No new fix tasks — PO fix-now requests included — until the three consolidation items land. Any true
showstopper comes through ESCALATIONS with a Director ruling, not chat authorization. The three items:

1. **Cleanup + kill-switch inventory.** Strip or flag-gate the `[B10]` and `[BL2B_PRICE]` probes;
   remove viewport-first dead code (D-016). Produce a table: flag → fix → default → load-bearing?
   → retire?. We now carry ~18 flags. Rule specifically on: H (retire-candidate, inert), J (subsumed
   by BL-5? — re-check now that BL-5 shipped), and whether BL-5/BL-2b make any of F/G/I redundant.
   Propose a single coherent hold/price policy on the `applyReplayFrame` path.
2. **Baseline re-capture** on b70: S1/S6-class scenarios + the canonical repros (armed-idle pan-load;
   1m→4h→1m switch-back; paused 4h→1m coarse-panel; sync-off host 1m↔4h price-independence) recorded
   in BASELINE-RESULTS as the new reference. Execute the D-025 deferred-checks manifest here (BL-1
   reconciliation, §6al host price-scale, B8 counters, BL-2b isolation, BL-2 sync-ON reframe) — each
   gets PASS/FAIL/STILL-NOT-CAPTURED.
3. **Plan re-baseline (Director + Manager).** The phase docs no longer describe reality (Phase 1/2
   substantially done out of order; Phase 3 is the render-budget remnant; Phase 4 harness untouched).
   One session to mark DONE vs REMAINING and set the order for the true remaining work.

Sequence: 1 → 2 → 3. Item 1 is docs+cleanup (safe, no behavior change beyond removing probes). Item 2
needs PO capture time. Item 3 is a planning session. Recommend starting with Item 1.

---

## D-028 — Self-dispatch directive binding; Item 1 DONE (b71); Item 2 in progress (2026-07-06)

(Numbered D-028 to avoid collision with the superseded Manager-authored D-027 stub above.)

### Process directive (now binding, ratified into the log)
The Manager may dispatch worker subagents directly, under five binding rules: (1) every worker brief
recorded VERBATIM in MANAGER-FINDINGS at dispatch; (2) agent ID recorded; (3) acceptance = INDEPENDENT
re-derivation (recompute I4 hashes, re-read shipped guard lines, run node --check/lints, confirm
kill-switch name+default), never the worker's self-report; (4) fresh-context retries after a
PROVEN-WRONG diagnosis go to a COLD PO-started worker (not a Manager-spawned child that inherits the
Manager's framing); (5) all else unchanged (I1–I11, one gated change/task, I11 live-verify, ESC→ruling,
ACTIVE freeze). Manager ACK + traceability backfill recorded in MANAGER-FINDINGS. Compliant.

### Consolidation progress
- **Item 1 DONE (b71).** Kill-switch inventory + single-hold policy + cleanup plan in
  CONSOLIDATION-ITEM1-FLAG-INVENTORY.md. Executed freeze-safe subset: stripped [B10]/[EMPTYRENDER]/
  [PANLOAD] probes (both trees, 0 matches), kept [BL2B_PRICE] for Item 2, reconciled build-id drift
  (all sw.js = b71; stale dist-v9/sw.js b36→b71). Manager independently verified (hashes, grep, node
  --check). DEFERRED (correct call): viewport-first dead-code removal + H-flag retire → a reviewed pass
  AFTER Item-2 baseline exists to diff against (no regression harness yet). H stays shipped/inert meanwhile.
- **Item 2 IN PROGRESS.** BASELINE-RESULTS re-baseline scaffold added (R1–R4 canonical repros + M1–M5
  D-025 manifest). Needs PO capture on b71. This is the sequence-blocking step.
- **Item 3 PENDING** (plan re-baseline) — Manager may pre-draft, but it is not ratified until the Item-2
  numbers exist to ground it.

### Standing
Freeze remains ACTIVE (consolidation only; no fix tasks; exceptions via ESC→ruling). Next action: PO
captures Item-2 R1–R4 + M1–M5 on b71; Manager records PASS/FAIL/NOT-CAPTURED; then Item 3.

---

## D-029 — Consolidation COMPLETE; plan re-baselined; go-forward order set (2026-07-07)

### Ratifications
- **Item 2 (baseline re-capture) DONE.** BASELINE-RESULTS b72+: R1–R4 PASS (armed-idle pan-load, switch-back,
  paused coarse-panel, price-independence). M-checks recorded HONESTLY incl. STILL-NOT-CAPTURED (B8 owner
  activation) and deferred residuals (BL-7 transient flood; BL-2b-r intermittent tiny Y move) — honest gaps
  over a smoothed narrative, per standing discipline.
- **BL-6 (ESC-011) closed live** (coarse panels stay centered) — the last of the TF-SWITCH SETTLING /
  price-axis thread. The PO's felt pain is resolved.
- **Item 3 (plan re-baseline) DONE** — `PLAN-REBASELINE.md`. Phase 0 DONE; Phase 1 DONE out-of-order
  (residuals noted); Phase 2 ~50%; Phase 3 ~70% (felt pain closed, cosmetic/budget remainder); Phase 4
  (harness) NOT started.

### Go-forward order (ratified; supersedes the strict README §3 sequence)
1. Item-1 deferred cleanup (viewport-first removal + retire H) — safe now a baseline exists.
2. **Phase 4 regression harness FIRST** — ~17 gated fixes are protected only by manual runs; encode
   R1–R4 + the scenario matrix as automated checks BEFORE more engine surgery. Highest durability value.
3. Phase 2 finish (event-sync) behind the harness.
4. Phase 3 remainder (renders-high budget, BL-3, cosmetic BL-7/BL-2b-r, B-FIX-I predicate hardening).
5. Backlog BL-1/BL-2/BL-4.

### Freeze status
The D-026 consolidation freeze is **LIFTED** — its three items are complete. Normal work resumes UNDER the
above order and all standing rules (I1–I11, one gated change/task, I11 live-verify, briefs+IDs in ledger at
dispatch per D-028, ESC→ruling for scope changes). No return to whack-a-mole: work the ordered plan.

---

## D-030 — Reorder: Phase-4 harness BEFORE Item-1 removals (2026-07-07)

### Decision
Swap D-029 go-forward steps 1 and 2. **Phase 4 regression harness is now step 1**; the Item-1 deferred
removals (viewport-first dead-code removal + retire H) drop to step 2, executed UNDER the harness.

### Rationale
Both Item-1 removals are behavior-adjacent, not inert deletions: viewport-first is ~300+ lines across both
37k-line engine copies, and H (`__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH`) gates a hold that
still *runs* (inert for BL-2b only, not dead). Deleting/altering that surface with no automated net is the
exact regression risk Phase 4 exists to kill. Building the harness first means the removals — and every
subsequent Phase 2/3 change — merge only against a green machine check. PO concurred (harness-first).

### Effect on order
1. **Phase 4 regression harness** (Task 4.1 skeleton → 4.2 scenario assertions → 4.3 workflow wiring).
2. Item-1 deferred cleanup (viewport-first removal + retire H) — now protected by the harness.
3. Phase 2 finish (event-sync) behind the harness.
4. Phase 3 remainder.
5. Backlog BL-1/BL-2/BL-4.

All standing rules unchanged. H stays shipped/inert until step 2.

---

## D-031 — Core multichart overhaul COMPLETE; regression gate fully green (2026-07-07)

### Ratification
D-030 go-forward steps 1–3 are DONE and Manager-verified (independent gate runs, hash checks,
kill-switch causal proofs — see MANAGER-FINDINGS §6au–§6ay):
- **Step 1 — Phase 4 regression harness + CI gate:** COMPLETE (4.1 skeleton, 4.1c real-host fidelity,
  4.2 scenarios, 4.2b cross-session determinism, 4.3 gate+ratchet+PR CI). RC5 (whack-a-mole) closed.
- **Step 2 — Item-1 cleanup:** COMPLETE (b73) — viewport-first dead code + H flag removed, both trees
  hash-identical, gate unchanged.
- **Step 3 — the three ownership defects the gate surfaced:** ALL FIXED, each behind a kill-switch,
  each ratcheted out of the baseline:
  - H-S6 host-TF fan-out mirror wait (`__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT`, b74).
  - H-S3 same-pair pan ownership decoupled from viewport sync
    (`__TALARIA_MC_DISABLE_SAME_PAIR_PAN_HOST_OWNER`, b75).
  - H-S2 host history-growth mirror to same-pair peers
    (`__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR`, b76).

**The harness gate is FULLY GREEN: 9/9 scenarios pass, `known-failing.json` = {}.** Every future
multichart engine change now merges only against this green machine gate (PR CI on chart paths).

### Standing / remainder
Freeze remains LIFTED. The go-forward FIX QUEUE is empty. What remains is OPTIONAL and non-blocking:
D-030 step 4 (Phase-3 polish: renders-high budget, cosmetic BL-7 transient flood, BL-2b-r intermittent
tiny Y nudge, B-FIX-I predicate hardening) and D-030 step 5 backlog (BL-1/BL-2/BL-4). Neither is a
felt/blocking defect; starting the backlog requires a fresh decision per the Phase-4 doc. Any new work
here follows all standing rules (I1–I11, one gated change/task, gate-green precondition, briefs+IDs in
ledger per D-028).

---

## D-032 — Multichart overhaul CLOSED at core-complete; polish + backlog deferred (2026-07-07)

### Decision (PO/Director ruling)
Declare the core multichart overhaul **DONE and CLOSED** at D-031's fully-green state. Do NOT start
D-030 step 4 (Phase-3 polish) or step 5 (backlog BL-1/BL-2/BL-4) now — both are deferred until a future
explicit decision.

### Rationale
The PO's felt experience is resolved, the three machine-caught ownership defects are fixed, the scar
tissue is removed, and a green CI regression gate now protects every future multichart change. The
remaining items are non-blocking (cosmetic residuals + efficiency polish + backlog); their cost is not
justified right now.

### Standing state (frozen baseline for resumption)
- Gate: **9/9 green, `known-failing.json` = {}**. Build id **20260707b76**.
- Active multichart fix kill-switches (all default = fix ON): `…HOST_TF_MIRROR_WAIT` (H-S6),
  `…SAME_PAIR_PAN_HOST_OWNER` (H-S3), `…HOST_HISTORY_GROWTH_MIRROR` (H-S2), plus the pre-existing
  F/G/I/J, price-independence, and coarse-seek switches. Retired: viewport-first, H (B-FIX-H).
- Deferred (need a fresh decision to start): Phase-3 polish (renders-high budget, BL-7 transient flood,
  BL-2b-r intermittent tiny Y nudge, B-FIX-I predicate hardening); backlog BL-1/BL-2/BL-4.
- Housekeeping for next commit: commit `harness/package-lock.json` (CI `npm ci` depends on it).

Resuming any deferred work re-enters under all standing rules (I1–I11, one gated change/task,
gate-green precondition, briefs+IDs per D-028).

---

## D-033 — REOPEN for a felt cross-panel scale-coupling defect (BL-8) (2026-07-10)

### Trigger
PO live-verified b82: multichart "works perfect" EXCEPT — with **all sync toggles OFF**, same-pair
4-panel layout, switching one iframe panel's timeframe (PO: the top-right tile) causes the OTHER panels
(C/D) price scale to change. This violates the core invariant (sync OFF ⇒ a panel's action has zero
effect on other panels) and is therefore an in-scope felt defect, NOT optional polish. D-032 "closed"
is superseded for this item.

### Ruling
Reopen under the standing DIAG→gated-FIX→ratchet discipline, protected by the now-green gate. Track as
**BL-8**. Because the symptom is price-scale coupling on a PANEL-initiated TF switch (a case the current
9 scenarios do not cover), FIRST add a harness scenario (H-S13) that reproduces it as a deterministic
RED, THEN diagnose. Prime suspect: a side-effect of the recent H-S2 (`…HOST_HISTORY_GROWTH_MIRROR`) or
sync-bridge pan-follow mirror over-firing on a peer TF switch; the diagnosis must test the three new
kill-switches to confirm/exclude a regression before any new engine change.

### Scope guard
This reopen is limited to BL-8. Phase-3 polish + backlog remain deferred (D-032). All standing rules
apply (one gated change/task, kill-switch, both trees hash-identical, gate-green + H-S13-green
precondition to close, briefs+IDs per D-028).

---

## D-034 — BL-8: H-S13 revision spec; kill-switch exclusion must be RE-RUN (2026-07-10)

§6az accepted. The first H-S13 non-repro was correctly read as a harness-fidelity gap,
not evidence of no-bug — the PO's pinned conditions (backtest replay ACTIVE but PAUSED,
peer iframe panel switched to a HIGHER TF, all sync OFF, no indicators) are the
scenario contract. Three rulings:

1. **The kill-switch exclusion is NOT yet established.** §6az's "the 3 recent
   kill-switches all left it green" was observed under the NON-reproducing scenario —
   it excludes nothing. Once revised H-S13 is deterministically RED, re-run the
   triage under the TRUE trigger: `…HOST_HISTORY_GROWTH_MIRROR`,
   `…SAME_PAIR_PAN_HOST_OWNER`, `…HOST_TF_MIRROR_WAIT`, and also
   `…PANEL_PRICE_INDEPENDENCE` (if flipping the BL-2b guard OFF changes the symptom
   shape, that localizes the family). Only flags that flip RED→GREEN under the true
   trigger count as implicated.

2. **Revised H-S13 requirements:** enter backtest replay and PAUSE (armed+paused
   state, not merely armed-at-boot); peer panel (an iframe, not the host) switches
   5m→1h or →4h; all sync OFF. Assertion = C/D price-scale state STRICTLY unchanged
   across the switch (priceZoom, priceOffset, autoScale, and the rendered Y domain
   min/max from the diag), sampled at a settled point per the 4.2b determinism
   pattern. RED must be stable across two independent 5-run sessions before any
   DIAG conclusions are drawn from it.

3. **Name the sink with the probe, not by eyeball:** the `[BL2B_PRICE]` probe
   (`__TALARIA_BL2B_PRICE_PROBE`) was purpose-built to log the first Y-scale
   mutation site with bus origin. If it survived the cleanup passes, enable it
   inside the H-S13 run (harness can set the flag pre-boot); if it was stripped,
   re-install it gated, harness-only trigger. Harness + probe = the mechanism is
   named by machine in the same run that reproduces it — no manual PO capture
   needed this time.

**Suspect list for the DIAG (static leads only, I10/I11 still govern):** the BL-2b
secondary guard marks host-replay context via `markHostReplayContext` with a **2-second
window** — a peer-TF-switch-triggered replay-mirror frame landing outside that window
(or originating from the PEER, which never gets marked) would reach
`syncReplayViewportToPlayhead`'s price reset unguarded. Also check whether the peer's
TF switch triggers the B-FIX-G settled broadcast / host rebroadcast whose frame C/D
adopt outside the marked context. The probe capture decides; these are priors, not
conclusions.

Close conditions for BL-8 (unchanged from D-033, made explicit): revised H-S13
deterministic RED → probe names sink → one gated fix → H-S13 GREEN + full gate green
(now 10 scenarios) + PO live confirm on the deployed build → H-S13 stays in the suite
permanently as the BL-8 regression guard.

---

## D-034b — REOPEN for BL-9 (panel pan-to-load-history stalls until click)
*(renumbered from a duplicate "D-034" — two sessions issued the same ID on 2026-07-10;
this entry is D-034b so citations stay unambiguous)*

BL-8 is CLOSED (PO live-confirmed on b84). PO immediately surfaced a distinct defect
(BL-9, MANAGER-FINDINGS §6bb): on a same-pair 2×2 layout with backtest replay ACTIVE
but PAUSED, dragging a PANEL (B/C/D, not the host) backward loads a few candles then
STALLS until the PO clicks. All sync OFF.

This is a real engine defect in the same-pair delegate-to-host history path, NOT a
deploy/harness artifact — the static lead (`_scheduleMultichartHostMasterSyncPoll`
terminating on gesture-end instead of gap-coverage, chart.js:3462/~3476) is concrete.
Reopen under the standing invariants (I10/I11: live-verified mechanism, minimal
kill-switchable fix, RED-first harness proof, mirror both trees, gate stays green).

Close conditions for BL-9:
1. **H-S14 built RED-first** — panel + paused replay + drag-back-needs->1-batch +
   gesture ends with NO click → panel left gap persists / not covered. RED must be
   stable across the flake protocol before any fix lands.
2. **One gated fix** (`__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE`, default fix
   ON) that keeps the delegate+mirror driving while the PANEL's own viewport left gap
   persists AND history remains, independent of the gesture. Must NOT spin when host
   history is exhausted and must NOT introduce per-tile /bars fetches (delegate only).
3. **Verify**: H-S14 GREEN under fix, RED under kill-switch (causal proof, flake-stable
   ×2); full gate GREEN (now 11 scenarios, 0 known-failing); both engine trees hash-
   match; sw.js/build id bumped; `security.yml` + `gate.mjs` untouched.
4. **PO live confirm** on the deployed build → H-S14 stays permanently as the BL-9 guard.

**D-034b STATUS (2026-07-10): CLOSED in-harness (build 20260707b85), PENDING PO live confirm.**
- Same-pair delegate path: FIXED, causal kill-switch proof (H-S14 RED under
  `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE`, GREEN with the fix).
- Independent/new-pair path: could NOT be reproduced RED (H-S15 GREEN with AND without the
  kill-switch — the self-fetch continuation is already robust). Per I11 no speculative fix was
  landed; H-S15 kept as a permanent POSITIVE guard. If the PO still perceives an independent
  stall on b85, root-cause with live Network-tab timing before any independent-path change.
- Gate 12/12 GREEN, 0 known-failing; both engine trees + harness hash-match; all sw.js + HTML at
  b85; `security.yml` + `gate.mjs` untouched; `node --check` clean. See MANAGER-FINDINGS §6bb.

---

## D-035 — Status report VALIDATED; three rulings; Phase-5 defined; state-matrix rule (2026-07-10)

The manager's 2026-07-10 status report is validated against the ledger and the gate
state — accurate, honest about the two open items, and the discipline it describes
(RED-first, causal kill-switch proof, ratchet) is being followed. On track.

### Rulings on the three flagged questions

1. **Play-storm gate guard: APPROVE the harness history-deepening + permanent H-S16.**
   Refusing to ship a flaky assertion was correct (4.2b rule), and the interim
   coverage argument (H-S8 "0 fetches during play" + H-S14/S15 paused-only) is
   acceptable SHORT-term. But this regression class — a continuation loop crossing a
   replay-mode boundary — has now occurred once in production code; it earns a
   permanent wide-margin guard. Deepen the synthetic backward history, land H-S16,
   normal harness-only task.
2. **Independent-panel stall: APPROVED as already disposed (D-034b)** — live
   Network-tab timing capture BEFORE any independent-path change. If timing shows
   slow-but-completing batches, the follow-up is window-sizing/prefetch, not stall
   logic, and it goes to the backlog as its own item rather than riding BL-9.
3. **Deferred backlog: stays deferred.** One exception: if the PO still FEELS
   BL-2b-r (tiny Y nudge) after confirming b86, it may be promoted — it is the only
   deferred item that is a felt correctness symptom rather than efficiency polish.
   Nothing else starts without a new decision.

### The root-vs-patch question (PO's standing concern), answered honestly

The shipped fixes split into two classes:
- **Structural root fixes** — display-TF master + lazy 1m (6a/6b-2/6c), finer-panel
  self-ownership (B8), pan ownership decoupled from viewport sync (H-S3), host
  history fan-out (H-S2), TF fan-out mirror-wait (H-S6), price-axis independence
  (BL-2b). These changed WHO owns data / WHAT a bus carries. Root-level. Done.
- **Narrow guards on the replay-mirror path** — F, G, I, J, BL-5 seek-skip, BL-6
  recenter, BL-8 aligned-tick guard, BL-9 continuation + its play guard. Each is
  correct, but they are all compensations around ONE remaining unconsolidated root:
  **a replay-mirror frame carries data + X-viewport + Y-price together, and every
  panel type must selectively ignore parts of it depending on mode.** Every new
  (TF-relation × replay-state × sync-state) combination risks exposing a new cell —
  which is exactly why BL-6 and BL-9-play "popped out" of prior fixes. The PO's
  instinct is correct: this family will keep producing BL-N until the frame
  application is consolidated.

**Therefore: Phase-5 "mirror policy consolidation" is hereby DEFINED (not scheduled).**
One explicit policy function/table — per (same-pair/independent × same/coarser/finer
TF × paused/playing/idle × sync flags), what does a panel adopt from a mirror frame:
data? X-viewport? Y-price? — replacing the scattered guards, which it should subsume
and retire (the Item-1 inventory's "single-hold policy" section is the design seed).
**Preconditions to schedule it:** (a) b86 PO-confirmed and BL-8/9 threads closed,
(b) a quiet period — no new felt multichart defect for ~1–2 weeks of normal use,
(c) gate green including H-S16. Executing a consolidation refactor mid-defect-flow
would be the overkill the PO wants to avoid; executing it never means guard-count
grows forever. The gate is what makes it safe when the time comes.

### New standing rule (cheap, prevents the second-order regressions)

BL-6 and BL-9-play were both "missing complement" regressions: a guard removed or
extended a behavior and missed what that behavior ALSO did in another mode.
**Effective now: every fix that adds/modifies a guard or predicate must include a
STATE-MATRIX statement in its report** — enumerate paused / playing / idle ×
sync-on / sync-off × same-TF / coarser / finer / independent, and state per relevant
cell: unchanged, or affected how. The harness cannot cover every cell; the reasoning
must. The manager rejects reports lacking it.

### Hygiene
Two sessions both issued "D-034" on 2026-07-10; the BL-9 reopen is renumbered
**D-034b**. Next free ID after this entry is D-036. Sessions must check the last
issued ID before writing.

---

## D-036 — H-S16 predicate-contract guard ACCEPTED; clamp-lift REJECTED (2026-07-10)

The D-035 #1 deviation is accepted — and the investigation that produced it was the
right kind: the original lever (deepen history → wide fetch margin) was tested
(90d vs 180d, both backward=2 with AND without the guard), proven vacuous, and
reverted, rather than shipped as a green-but-meaningless assertion. The min-
candleWidth clamp capping the exposable left gap is a legitimate physical ceiling
in the engine; asserting fetch counts under it can never be causal.

**Ruling: the predicate-contract H-S16 is ACCEPTED as the permanent BL-9-play
guard. Lifting the clamp in a harness-only build is REJECTED** — a harness that
tests a build different from production violates the fidelity principle that made
this harness trustworthy in the first place (the 4.1c lesson). A deterministic,
causal contract test on the real engine beats an observable-storm test on a
modified one.

**One residual risk, one cheap hardening required:** a contract test proves the
predicate BEHAVES correctly, not that the continuation path still CONSULTS it — a
future refactor could bypass `_panelPanHistoryGapNeedsHostMore` at the call site
and H-S16 would stay green while the storm returns. Mitigation (harness-only
follow-up, no urgency, fold into the next harness touch): during H-S14's paused
continuation, assert the predicate is actually invoked ≥1 time (instrument via a
harness-installed wrapper, not an engine change). Defense in depth: H-S8's
"0 data fetches during play" remains the observable backstop that a sustained
real-world storm would trip.

Gate at 13/13 green, 0 known-failing, engine untouched — acknowledged. The §6bb.1
state-matrix (exactly one cell changed vs b85) is the first application of the
D-035 rule and is exactly what it should look like.

---

## D-037 — REOPEN GRANTED: BL-10 (coarser same-pair panel frozen during PLAY) (2026-07-10)

Reopen granted — this is a felt correctness defect (shared-playhead invariant: all
same-pair panels show the same moment in time; a frozen coarser panel violates it),
not polish. The request itself is well-formed: static lead with file:lines, RED-first
harness before any fix, kill-switch named up front.

**Authorized, in order:**
1. **H-S17 RED-first** — same-pair 2×2, one panel coarser than host (e.g. host 1m,
   panel 4h), all sync OFF, REAL play (not synthetic tick injection): assert the
   coarser panel's playhead timestamp advances with the host's within a bounded
   settle budget, and its forming coarse candle updates. RED must be flake-stable
   per the 4.2b protocol before diagnosis conclusions are drawn.
2. Confirm the static lead against the RED run (the harness IS the live capture —
   I10/I11 satisfied by machine, as with H-S13): coarser same-pair panels hit the
   unconditional return in `applyReplayFrame` (:675-684) because the seek branch is
   gated on finer-only `_multichartFinerSamePairPanelSelfOwns()`.
3. **One gated fix**, `__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE` (default fix
   ON). Constraints beyond the standing rules:
   - **Do not resurrect BL-5.** The BL-5 storm was a coarse panel doing per-frame
     reseed/reslice work while PAUSED. Advancing the playhead during PLAY must not
     reintroduce per-1m-tick full reslices on a 4h panel — advance the playhead and
     update the FORMING candle, coalescing work so a coarse panel repaints at its
     own cadence (or cheaply), not the host's. If the implementation risks per-tick
     resample of the full series, say so in the report with numbers (renders/sec on
     the coarse panel during play becomes an H-S17 assertion bound).
   - **State-matrix (D-035 rule) with two cells called out explicitly:** the
     paused-coarse cell (BL-5 guard `shouldSkipCoarsePanelHostSwitchSeek` must
     remain in force — the new advance path is PLAY-only) and the finer cell
     (self-own seek unchanged).
4. Close conditions: H-S17 GREEN under fix / RED under kill-switch, flake-stable;
   full gate green (14 scenarios); trees hash-match; PO live confirm on deployed
   build; H-S17 permanent.

**Phase-5 ledger note:** BL-10 is replay-mirror-frame family case #9 (F, G, I, J,
BL-5, BL-6, BL-8, BL-9-play, BL-10) — the same unconsolidated root D-035 named:
`applyReplayFrame` decides per-relationship behavior with scattered branches, and
the coarser-panel column simply had no play-advance cell. The Phase-5 policy table
gains a row; the quiet-period clock for scheduling Phase-5 resets with this defect.

---

## D-038 — REOPEN GRANTED: BL-11 (panel viewport doesn't follow playhead during PLAY) (2026-07-10)

Reopen granted. Felt correctness defect: viewport-follow parity — host A auto-scrolls
during play, B/C/D let the playhead exit the visible window. The manager's request
already carries the right constraints; approved as submitted, with two additions:

**Approved sequence:** H-S18 RED-first (assert each panel's playhead timestamp stays
within its visible time window while the host advances, bounded settle budget,
flake-stable per 4.2b) → confirm the static lead against the RED run → one gated fix
`__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` (default fix ON).

**Manager's constraints ratified:** (1) PLAY-only — no re-fit/snap-back on pause or
scrub (the mirror path's BL-2b-era protections stay); (2) X/time viewport only —
price-axis independence untouched. State-matrix must call out the paused-panel cell
(follow OFF) and the host cell (unchanged). Worker localizes same-TF vs coarser and
states the interaction with BL-10's coalesced advance path explicitly.

**Two additions to the spec:**
1. **User-drag disengage parity.** The host's auto-scroll almost certainly disengages
   when the user pans away during play (standard chart behavior, and B-FIX-C's
   compensation is explicitly gated on `autoScroll===false`). The panel follow must
   mirror that contract exactly: follow only while the panel is at/near the leading
   edge; a user who drags a panel back mid-play has OPTED OUT for that panel until
   they return to the edge (or whatever the host's own re-engage rule is — copy it,
   don't invent one). H-S18 should include this as a second assertion: drag panel
   away during play → viewport does NOT snap back.
2. **B-FIX-C interaction cell in the state-matrix.** Follow-on-play changes the
   panel's effective autoScroll state, which is the gate on B-FIX-C's left-prepend
   offsetX compensation. The report must state what happens when a backward history
   load lands while follow is active (compensation skipped because auto-scrolling —
   correct? or double-shift?). This is exactly the kind of complement cell the
   D-035 rule exists to force.

Close conditions: standard (H-S18 green under fix / red under kill-switch,
flake-stable; gate green at 15; trees hash-match; PO live confirm; H-S18 permanent).
**Phase-5 ledger note:** BL-11 is family case #10 — the panel viewport-follow column
of the same policy table. The quiet-period clock resets again; at this defect rate,
once BL-10/BL-11 close and the PO confirms a stable build, the manager should
prepare the Phase-5 design doc so it is ready the moment the quiet period is met.

---

## D-039 — REOPEN GRANTED: BL-12 (drag lags during play — BL-11 side-effect) (2026-07-10)

**Severity ruling (the manager asked): in-scope felt defect, not polish.** Two
reasons: it is a regression introduced by our own change (BL-11's per-frame
`syncReplayViewportToPlayhead({render:true})`), and "drag is instant when paused but
laggy during play" is a felt-smoothness break in the PO's primary workflow. A
regression we caused does not go to the backlog; it gets fixed under the reopen
discipline. Note for the ledger: this is a state-matrix escape — D-038 forced the
drag-disengage CORRECTNESS cell, but not its COST cell. The D-035 matrix rule is
hereby extended: for fixes that add per-frame work, the matrix must state the
render/work cost per cell, not only the behavior.

**One spec correction to the proposed H-S19 (important):** do NOT gate on wall-clock
frame-time — timing assertions on shared CI runners are flake bait and violate the
4.2b anti-flake rule the moment the runner is slow. Assert on DETERMINISTIC counters
instead: renders (and follow-invocations, if instrumented) per N host play-frames on
(a) an idle panel and (b) a panel being dragged, with the bound expressed relative
to the paused-drag render count. Wall-clock numbers may be REPORTED as context, never
asserted. Causal attribution via the BL-11 kill-switch A/B stands as proposed.

**Fix direction approved** (pending the RED run confirming attribution): two-part,
one flag —
1. Suspend the follow CALL (not just the recenter) for a panel during active user
   interaction — drag already disengages follow semantically (D-038 #1), so the
   per-frame invocation on that panel is pure waste.
2. Coalesce/no-op the follow render for non-dragged panels: render only when the
   follow actually MOVES the viewport by ≥1 candle-width of offset (a playhead
   advancing within the same pixel column should cost zero renders).
Kill-switch: own flag (not BL-11's), so follow-correctness and follow-cost revert
independently. Constraints ratified: BL-11 must stay green (follow works when not
dragging), play-only, X-viewport-only; state-matrix calls out
actively-dragging-during-play and not-dragging cells WITH cost columns.

Close conditions: standard (H-S19 green/red-causal, flake-stable; gate 16 green;
trees hash-match; PO live confirm — specifically "drag during play feels like drag
while paused"; H-S19 permanent). **Phase-5 ledger:** case #11 — the policy table
needs a COST column per cell, not just behavior. Quiet-period clock resets; the
D-038 instruction stands — Phase-5 design doc gets written in parallel NOW.
