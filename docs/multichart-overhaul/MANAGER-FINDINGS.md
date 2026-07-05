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

## 7. Manager recommendation

**Option B.** Instrumentation did its job: it told us the plan may be aimed at the
wrong root cause for *these* symptoms. RC1 remains worth fixing later, but the
baseline evidence points to a render/viewport desync as the dominant, user-visible
failure. I recommend a read-only diagnosis task next, then a gated fix — pending the
Director's decision and the Product Owner's answer in §6.
