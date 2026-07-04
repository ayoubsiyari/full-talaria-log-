# Phase 1 — Single Data Owner per File

**Root cause fixed:** RC1 (distributed data ownership). After this phase, for any file
shown on multiple panels there is exactly ONE network client. Duplicate fetches, cursor
divergence between panels, and cross-panel seam bugs become structurally impossible for
same-pair panels.

**Gate to Phase 2:** scenarios S2, S3, S6, S8: host (`HOST` row) is the ONLY row with
`fetches > 0` for same-pair panels; `seams = 0` everywhere; S1/S11 single-chart numbers
unchanged from baseline.

**Scope guard:** independent-pair panels (different fileId from host) keep their own
fetching — they are their own owner. Do NOT change their paths in this phase.

---

## Existing building blocks (workers reuse, do not reinvent)

The codebase already contains most of the machinery; Phase 1 makes it authoritative
instead of best-effort:

| Existing piece | Where | Role today |
|---|---|---|
| `_multichartSamePairDataShareActive()` | `chart.js` | detects "same file as host, can share" |
| `_tryExtendReplayMasterFromParent(opts)` | `chart.js` | contiguous copy of host master into panel (the ONLY approved consumer merge) |
| `_delegateSamePairPanLoadToHost(force)` | `chart.js` | panel asks host to fetch backward |
| `_broadcastMultichartMasterExtendIfHost(opts)` | `chart.js` | host → panels "my master grew" notification (currently only when viewport sync is ON) |
| `extendReplayMasterFromHost` command | `panel-cmd-bridge.js` | panel-side handler that pulls from parent on notification |
| shared bar store `_sharedBarStore()` etc. | `chart.js` | cross-panel bar cache (READ side stays as-is; see warning below) |

**WARNING (history):** an earlier attempt wired the shared bar store into the pan-back
path with a non-contiguous prepend. It corrupted cursors and caused refetch storms; it was
fully reverted. Any task here that merges bars MUST go through
`_tryExtendReplayMasterFromParent` semantics (contiguity from the host master by
reference), never through store windows of unknown adjacency. See INVARIANTS I2.

---

## Task 1.1 — Central fetch gate

**Files:** `chart v 1.4/chart/chart.js` (+ mirror).

Create ONE function that every bar-fetch entry point consults:

```js
/**
 * @param {'pan-back'|'pan-fwd'|'tf-switch'|'zoom-fill'|'replay-cover'|'initial'} reason
 * @returns {boolean} true when THIS instance may hit the network for currentFileId
 */
_mcMayFetch(reason) {
  if (window.__TALARIA_MC_DISABLE_FETCH_GATE) return true;      // kill-switch
  if (!this._isMultichartEmbedPanel || !this._isMultichartEmbedPanel()) return true; // host/single: owner
  if (typeof this._multichartSamePairAsHost === 'function'
      && this._multichartSamePairAsHost(this.currentFileId)) {
    return false;  // same file as host → host is the owner, panel never fetches
  }
  return true;     // independent pair → panel is its own owner
}
```

Call sites to gate (locate by name; add `if (!this._mcMayFetch('<reason>')) { <delegate>; return ...; }`):
1. `checkViewportLoadMore` — replace the existing scattered same-pair conditions at the top
   of the backward branch with: gate check → if blocked, run the delegation sequence
   (Task 1.2) and return.
2. `_fillVisibleWindowAfterZoomOut` — if blocked: request host fill (Task 1.2 queue) instead.
3. `ensureReplayDataCoversTimestamp` — if blocked: `_syncReplayMasterFromParentIfCovers(ts)`
   first; if host doesn't cover, enqueue a host fetch request; never fetch locally.
4. `_refetchBacktestTimeframeCore` — if blocked: fall back to the existing parent-mirror
   TF-switch tiers (they already exist in `_tryMultichartEmbedBacktestTimeframeFastPath`);
   if none cover, enqueue host fetch for the needed window, then mirror.

Do NOT delete the existing same-pair special cases yet — Task 1.4 cleans up after the gate
is proven. First make the gate authoritative ON TOP of them (it should be a no-op where
delegation already happens).

**Diagnostics:** add `gateBlocked` counter to `_mcDiag`, incremented whenever the gate
returns false.

**Acceptance criteria:** S2/S3/S6: panel rows show `fetches = 0`, `gateBlocked > 0`;
S5 (independent pair): panel B `fetches > 0` unchanged from baseline; S1/S11 unchanged.
**Kill-switch:** `window.__TALARIA_MC_DISABLE_FETCH_GATE = true`.

---

## Task 1.2 — Owner request queue (replace ad-hoc delegation)

**Files:** `chart v 1.4/chart/chart.js` (+ mirror).

Today a blocked panel calls `host.checkViewportLoadMore('backward', force)` directly and
then POLLS. Formalize the ask instead:

```js
// PANEL side
_mcRequestOwnerFetch(spec) // spec: { direction: 'backward'|'forward', reason, coverTs? }
  → host._mcEnqueueFetchRequest(spec)  (direct same-origin call, like today)

// HOST side
_mcEnqueueFetchRequest(spec)
  - dedupe: identical pending spec (same direction while _panLoading) → ignore
  - execute via the host's EXISTING loaders (checkViewportLoadMore etc. on the host)
  - on merge completion → _broadcastMultichartMasterExtendIfHost({ direction, lite })
```

Key change vs today: the completion notification (`_broadcastMultichartMasterExtendIfHost`)
must fire for same-pair panels **regardless of the viewport-sync toggle** (today it early
returns when `_multichartVisibleRangeSyncOn` is false — keep that early-return for
VIEWPORT-mirroring side effects, but the DATA notification must always go out; if
separating those concerns inside the function is needed, add a `dataOnly` broadcast).
The panel-side `extendReplayMasterFromHost` handler already applies data without moving
the viewport when sync is off — verify, don't assume.

**Acceptance criteria:** S3 and S4: dragging panel B fills B's history with host as the
only fetcher, in BOTH sync modes; no panel polls the host in a loop (verify:
`extendsFromParent` increments roughly once per host fetch, not once per frame).
**Kill-switch:** `window.__TALARIA_MC_DISABLE_OWNER_QUEUE = true` (falls back to current
direct-call delegation).

---

## Task 1.3 — Boot path through the owner

**Files:** `chart v 1.4/chart/multichart-prod/embed-bridge.js`, `chart.js` (+ mirrors).

At panel boot, same-pair panels already prefer host memory (`loadFileData` tiers 0–1).
Harden it: when `_multichartSamePairAsHost(fileId)` is true at boot, the network tiers
(3–4) must be unreachable — if host data isn't ready yet, WAIT for it (bounded retry,
~10s) instead of fetching a divergent window. On timeout, log one diagnostic error and
only then fall through to network (never silently).

Also fixes the known "panel boots on a different default fileId" class: if the URL has no
`fileId` but the host has one, inherit the host's — never load a server default in a
multichart panel. (See `docs/multichart-loading-fixes-handoff.md` §3 for that open issue.)

**Acceptance criteria:** S10: same-pair panels boot with `fetches = 0` (all data from
host), identical first/last bar timestamps on all panels; no panel ever shows a different
file than the host unless the user explicitly picked one.
**Kill-switch:** `window.__TALARIA_MC_DISABLE_OWNER_BOOT = true`.

---

## Task 1.4 — Remove the now-dead panel fetch branches (cleanup)

**Files:** `chart v 1.4/chart/chart.js`, `sync-bridge.js` (+ mirrors).

Only after 1.1–1.3 are verified in production for a full test pass:
- In `checkViewportLoadMore`: collapse the pre-gate same-pair special cases that the gate
  made unreachable (the leader/follower checks and inline delegation at the top of the
  backward branch).
- In `sync-bridge.js` `ensureHistoryForVisibleStart`: remove the direct
  `_scheduleReplayPanLoadLeft` / `checkViewportLoadMore` fallback calls for same-pair
  panels (route through `_mcRequestOwnerFetch`). Keep behavior for independent pairs.

**Acceptance criteria:** full matrix (S1–S11) equal or better than post-1.3 numbers;
`git diff` shows only deletions/redirections in the listed functions.
**Kill-switch:** not applicable (pure removal of unreachable code) — which is why this
task ships LAST and alone.
