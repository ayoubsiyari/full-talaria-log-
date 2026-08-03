# V8 Retainer Diff Lookup

Timestamp: 2026-08-03 00:20+01:00  
Scope: Cleared priority plus D-owned medium candidates. This is a lookup sheet for E's heap diff, not a fix plan.

## Decision Rule

If E's forced-GC 30-minute diff shows total retained JS heap growth <= 5 MB and no single constructor/retainer path above 2 MB, D stands this list down as warm-up/thin ordinary growth.

If total retained growth is > 5 MB but spread across ordinary short-lived shapes with no stable retainer path to one of the owners below, D does not claim ownership from static shape alone.

For comparison, C's observed direction was +29.77 MB V8 in 50 minutes. A real continuation over 30 minutes should be large enough to clear the 5 MB floor by a wide margin.

Active order after E's clearance: `_orderExecutionSeriesByFileId`, `_miSeriesByFileId`, then `_m20Q9PrefixByMaster`.

Stopping rule before spending the active candidates:
- Compute the combined retained size attributed to `_orderExecutionSeriesByFileId`, `_miSeriesByFileId`, and `_m20Q9PrefixByMaster` in E's forced-GC real-playback diff.
- Compare that combined size to the measured retained-growth delta for the same window. Use C's rough slope of 36 MB/hour only as the expectation scale when the artifact reports a slope rather than an already-windowed delta.
- If the three active candidates together account for less than one tenth of the measured retained-growth delta, D reports `V8-CANDIDATE-CENSUS-UNDERFIT` and stops naming constructors from this list.
- In that underfit branch, the next instrument is retained size per dominator subtree, not another per-class constructor census, because the retained mass is then somewhere the class-level candidate list cannot structurally see.

## Cleared Candidate: `m20Q6CapturedClear`

Location: `chart v 1.4/chart/modules/replay-system.js`

Status:
- `CLEARED_BY_E`: E's real-playback heap verdict put this path at 416 bytes retained.
- Demoted from the top row. The promotion was correct on the evidence at the time because it crossed CPU freeze stacks and V8 heap-grower shapes, but the measured retained size is below the 2 MB single-path threshold.
- The medium rows below are back on top of D's lookup order.

Expected diff signature:
- Constructor/function names: `m20Q6CapturedClear`, `m20Q6CapturedScheduler`, `m20Q6TrackScheduler`, `M20Q6ReplaySystem`; DevTools may instead show `Function`, `(closure)`, `Array`, `Object`, `Map`, or `WeakMap` rows with these names only in retaining edges.
- Retainer path: `M20Q6ReplaySystem` -> `m20Q6States`/lifecycle state -> `schedulers` or `schedulerPool` -> scheduler entries/closures; or shared scheduler patches retaining wrapper closures named `m20Q6CapturedClear`.
- CPU/freezer cross-check: the dashboard/replay freeze stacks already identify `m20Q6CapturedClear` as the synchronous clear path that can rescan scheduler state. A heap match needs the same family retaining memory across forced collection, not just appearing in sampled CPU stacks.

Why it would match:
- It is keyed to elapsed scheduled callbacks rather than resident bars. That shape can grow with wall-clock replay time even while EVICT-03 keeps price bars bounded.
- It crosses the two observed symptom families: CPU freeze stacks name the clear path, and the heap curve is monotone under real playback with zero pair switches.
- The earlier allocation rows showed M20-Q6 machinery could dominate sampled allocation. Even after the pool/capture-reuse fixes, the named clear/capture family is the first thing to exonerate before lower-priority product caches.

Confirming perturbation:
- Positive confirmation: before snapshot B, drain/destroy the active replay systems or force the M20-Q6 lifecycle cleanup path; a true owner should drop retained `M20Q6ReplaySystem`/scheduler-state/closure growth.
- Kill-switch control: `window.__TALARIA_DISABLE_M20Q6_POOL_V1 = true` should worsen or reshape scheduler retention if the pool bound is carrying the current health. `window.__TALARIA_DISABLE_M20Q6_CAPTURE_REUSE_V1 = true` should restore legacy capture-wrapper churn; if the owner is capture wrappers, the constructor/closure signature should move immediately.
- Full legacy control: `window.__TALARIA_DISABLE_M20_Q6_REPLAY_FLOAT_LISTENER_TEARDOWN_V1 = true` disables the M20-Q6 lifecycle wrapper. Use only as a diagnostic control because it also restores known listener/lifecycle defects.

Stand-down signal:
- Met: E saw only 416 bytes retained for this path. Do not keep it ahead of the product/cache candidates unless a later real-playback diff contradicts that measurement.

## Candidate: `_orderExecutionSeriesByFileId`

Location: `chart v 1.4/chart/modules/order-manager.js`

Expected diff signature:
- Constructor names: `Array`, `Object`, possibly DevTools `(array)` / plain object rows rather than a named class.
- Retainer path: `OrderManager` -> `_orderExecutionSeriesByFileId` -> `Map` -> per-file `Map` -> `{ cadenceMs, series }` -> `series:Array`.
- Bar rows should look like plain OHLC objects with `t/o/h/l/c/v`-style keys, not DOM nodes or typed arrays.

Why it would match:
- It pins replay/raw series by reference. If EVICT-03 trims or replaces live `fullRawData` while this map still points at an older master, V8 can rise while the visible resident-bar count oscillates.
- Current cap is 8 files x 4 timeframes, so this should be a bounded owner unless a live series itself grows or old file refs are held.

Confirming perturbation:
- Positive confirmation: clear `orderManager._orderExecutionSeriesByFileId` before snapshot B, or temporarily bypass `_retainCurrentOrderExecutionSeries`; the constructor delta should collapse if this is the owner.
- Negative/worsening control: `window.__TALARIA_SERIES_LRU_V1 = true` disables the cap and restores the unbounded per-timeframe map. If this candidate is real, that should increase retained `Array/Object` growth, not fix it.

Stand-down signal:
- E sees no retainer path through `_orderExecutionSeriesByFileId`, or sees only a small stable map with <= 4 timeframe entries for the active file and no growing retained arrays.

## Candidate: `_miSeriesByFileId`

Location: `chart v 1.4/chart/modules/order-manager.js`

Expected diff signature:
- Constructor names: `Array`, `Object`, possibly `Map`.
- Retainer path: `OrderManager` -> `_miSeriesByFileId` -> `Map` key like `<fileId>::<tf>` -> `{ raw, builtForEndTs, timeframe }` -> `raw:Array`.
- Rows should be normalized `/smart` candle objects.

Why it would match:
- It stores background `/smart` series for off-chart order evaluation, up to 20k bars per key.
- Static priority is lower because stable keys overwrite rather than append, so this should plateau unless new keys appear or `builtForEndTs` advances while old arrays remain retained elsewhere.

Confirming perturbation:
- Clear `orderManager._miSeriesByFileId` before snapshot B; a true owner should drop the retained `raw:Array` delta.
- Bypass `_scheduleMiSeriesFetch` for a repeat arm; if the diff constructor disappears, `_miSeriesByFileId` was the source.
- No current kill switch was found for this cache; use the clear/bypass perturbation rather than a product flag.

Stand-down signal:
- E sees stable one-key replacement behavior, no old `raw` arrays retained, or total retained size consistent with a single <=20k-bar background fetch and not a monotone slope.

## Candidate: `_m20Q9PrefixByMaster`

Location: `chart v 1.4/chart/modules/replay-system.js`

Expected diff signature:
- Constructor names: `Array` first; possibly `WeakMap` / `ReplaySystem` in the retainer path.
- Retainer path: `ReplaySystem` -> `_m20Q9PrefixByMaster` -> `WeakMap` value -> prefix `Array`.
- Values are owned prefix shells containing references to existing bar objects. The key is weak, so the master must still be strongly reachable somewhere else for this to retain.

Why it would match:
- `_installPlayheadPrefix()` reuses one growing owned prefix per master and appends with `buf.push(master[i])`.
- It is released by `_invalidatePlayheadPrefixes()` on replay exit and pause drain, but not during continuous play.
- If another cache keeps the master alive, the WeakMap value can also stay alive and grow with playhead progress.

Confirming perturbation:
- Positive confirmation: call `replaySystem._invalidatePlayheadPrefixes()` before snapshot B, or run a repeat arm that invalidates prefixes periodically; the retained prefix `Array` delta should collapse.
- Kill-switch control: `window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1 = true` bypasses the reusable WeakMap prefix and restores fresh legacy slices. If this candidate is real, the WeakMap-retained prefix arrays should disappear, though allocation churn may rise.

Stand-down signal:
- E sees no `WeakMap`/`ReplaySystem._m20Q9PrefixByMaster` retainer path, or prefix arrays are small and not growing while total V8 growth lives elsewhere.

## Null Branch

Pre-decided null answer: if forced-GC retained JS heap growth over E's 30-minute arm is <= 5 MB, with no single constructor/retainer path above 2 MB, D reports `V8-LIST-STAND-DOWN`.

Interpretation: C's six-sample V8 curve was likely warm-up plateau or ordinary dispersed allocation under contention, not an owned monotone retainer. No speculative fixes from this list.
