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
