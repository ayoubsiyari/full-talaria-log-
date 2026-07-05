# DIAG-B9 - Boundary And Drift

## Pre-Task Git Status

Captured before this read-only diagnosis:

```text
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-ESCALATIONS.md
```

No source file was edited for this diagnosis.

## Scope

Build b18 observation to explain:

- 2x2 backtest, armed but not playing, all sync off.
- Host displays `4h`; panels B/C/D display `1m`.
- Host reports `fetches 29 / fetchedBars 34000`.
- Panels report `fetches 0`, `ownerFetches 0`, `handovers 0`.

The questions are:

1. Why do the `1m` mirror panels drift/shift when the host backward-pan-loads old candles?
2. Why does the armed-not-playing host still hold/commit a `1m` master despite 6a/6b?

## Q1 - Drift Mechanism

### Verdict

The drift mechanism is: **same-pair mirror commits replace the panel's bar arrays with a prepended host array but do not apply the same left-prepend viewport/index compensation that `checkViewportLoadMore()` applies on the chart that performed the prepend.**

The compensation missing from the mirror path is the prepend delta:

- Raw/replay index delta: `currentIndex += number of prepended raw bars`.
- Viewport delta: `offsetX -= number of prepended display bars * candle spacing`.

The single-chart/local pan-load path has both. The multichart mirror paths replace arrays and then recompute, preserve, or copy viewport state without first adding the prepend delta.

### Existing Compensation In The Owner Path

In `chart v 1.4/chart/chart.js`, function `checkViewportLoadMore()`, the replay merge path snapshots the old replay index and, on a backward prepend, shifts `replay.currentIndex` by `uniqueNew.length`:

```text
chart v 1.4/chart/chart.js:22179-22186
```

Then it computes the number of display bars added and compensates `offsetX`:

```text
chart v 1.4/chart/chart.js:22201-22214
```

The non-replay path has the same visual invariant: for a backward prepend it resamples only the new left chunk and applies `this.offsetX -= backwardChunk.length * this.getCandleSpacing()`:

```text
chart v 1.4/chart/chart.js:22261-22277
```

That is the "prepend without jump" contract the owner chart honors.

### Mirror Paths Missing The Equivalent Delta

#### 1. `_multichartMirrorHostTfSwitchIfReady()`

In `chart v 1.4/chart/chart.js`, function `_multichartMirrorHostTfSwitchIfReady()`, the panel adopts the host arrays directly:

```text
chart v 1.4/chart/chart.js:2791-2804
```

If replay is active, it also adopts the parent replay master and syncs current index from timestamp, but there is no comparison of the panel's previous first timestamp to the new host first timestamp and no `offsetX -= prependDisplayBars * spacing`.

The viewport is then recomputed as a right-edge formula:

```text
chart v 1.4/chart/chart.js:2843-2854
```

That is where the prepend delta should be applied or preserved before/while assigning `offsetX`. Instead the panel is positioned against the new array length/right index, so a host prepend changes the panel's data coordinate system without the owner's offset compensation.

#### 2. Replay same-pair fast mirror: `_tryMirrorFrameFromParentData()`

In `chart v 1.4/chart/modules/replay-system.js`, function `_tryMirrorFrameFromParentData()`, same-pair same-TF panels reuse host arrays by reference:

```text
chart v 1.4/chart/modules/replay-system.js:6247-6250
```

When passively following, the path then right-anchors via `getReplayAutoScrollState()` or host offset fallback:

```text
chart v 1.4/chart/modules/replay-system.js:6257-6283
```

It then copies/syncs current index from the frame payload:

```text
chart v 1.4/chart/modules/replay-system.js:6286-6289
```

Again, there is no `oldFirstTs -> newFirstTs` prepend measurement and no replay-index/offset delta. This is the mirror-frame equivalent of the same bug: array coordinates change, viewport/index compensation does not.

#### 3. Replay bridge fallback: `forceSamePairParentDataMirror()`

In `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js`, function `forceSamePairParentDataMirror()`, the fallback path directly assigns host arrays and parent replay index:

```text
chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1032-1049
```

The same function snapshots prior `offsetX`/`candleWidth`, then either recomputes replay autoscroll or restores prior offset depending on state:

```text
chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1018-1030
chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1095-1146
```

Neither branch computes the number of bars prepended to the host array. Preserving `prevOffsetX` is not equivalent to prepend compensation, because after a left prepend the same `offsetX` now addresses different data indices.

### Exact Fix Site For A Future Task

The delta belongs at the mirror commit boundary immediately after old/new series are known and before render/offset finalization:

- `_multichartMirrorHostTfSwitchIfReady()` after `this.rawData = parent.rawData; this.data = parent.data;`, before `this.offsetX = plotW - ...`.
- `_tryMirrorFrameFromParentData()` after `chart.rawData = pRaw; chart.data = pData;`, before passive-follow offset/index assignment.
- `forceSamePairParentDataMirror()` fallback after `ch.rawData = pc.rawData; ch.data = pc.data;`, before assigning/restoring `offsetX` and `rs.currentIndex`.

The future fix should mirror the owner-path invariant: detect a contiguous left prepend by comparing previous first timestamp to new first timestamp, count display bars added, then shift `offsetX` and index state by that delta. That affects only multichart mirror paths; the single-chart owner path already has the compensation.

## Q2 - Armed Host Still Commits A 1m Master

### Verdict

The first hard pin is **not** B8. The host is still committing `1m` because 6a's display-TF host branch is disabled whenever replay is merely armed (`replaySystem.isActive`), even if not playing. That forces `masterTf = '1m'` in the multichart host load path. `_emitMultichartHostDataCommit()` then reports the active replay raw timeframe, which is also `1m`.

As a result, B8 sees host committed native TF = `1m`; a `1m` panel is not finer than `1m`, so `_multichartFinerSamePairPanelSelfOwns()` returns false and B8 remains inert.

### Actual Predicate And Commit Chain

In `chart v 1.4/chart.js`, function `loadMultichartPanelFromHost()`, the 6a display-TF host branch is:

```text
chart v 1.4/chart/chart.js:3909-3916
```

The critical predicate is:

```text
displayTf !== '1m' && !(rs0 && rs0.isActive) && ... && this._isMultichartHostPanel()
```

In an armed backtest, `ReplaySystem.enterReplayMode()` sets `isActive = true` immediately:

```text
chart v 1.4/chart/modules/replay-system.js:2373-2392
```

It also stores full replay data and detects/stores `rawTimeframe`:

```text
chart v 1.4/chart/modules/replay-system.js:2485-2489
```

`startBacktestingReplay()` calls `enterReplayMode()` during backtest boot, so the chart is "armed" even before play:

```text
chart v 1.4/chart/chart.js:9235-9244
```

Therefore, when host display TF is `4h` but replay is armed, `displayTfMasterHost` is false and:

```text
const masterTf = displayTfMasterHost ? displayTf : '1m';
```

selects `1m` (`chart v 1.4/chart/chart.js:3911-3916`).

Later in the same function, the loaded native TF is derived from `result.nativeRawFetchTf || masterTf`, written to `_nativeRawFetchTf`, and assigned to `replay.rawTimeframe`:

```text
chart v 1.4/chart/chart.js:4249-4255
```

The host commit event then prefers active replay `rawTimeframe` over `_nativeRawFetchTf`:

```text
chart v 1.4/chart/chart.js:3161-3183
```

So the current chain is:

```text
armed replay -> rs0.isActive true -> displayTfMasterHost false -> masterTf '1m'
-> _nativeRawFetchTf '1m' / replay.rawTimeframe '1m'
-> talariaMcHostDataCommit nativeRawFetchTf '1m'
-> B8 panel-finer test sees panel 1m vs host 1m -> false
```

### B8 Gate Confirmation

In `chart v 1.4/chart.js`, function `_multichartFinerSamePairPanelSelfOwns()`, B8 compares panel TF to the committed host native TF:

```text
chart v 1.4/chart/chart.js:2932-2952
```

The final predicate is:

```text
return panelMs < hostMs * 0.92;
```

With current b18 behavior, host committed native TF is `1m`. Therefore `panel 1m < host 1m * 0.92` is false. This directly explains `ownerFetches 0` and `handovers 0`.

### 6b Lazy-Master Predicate

The 6b lazy-master need predicate is `_multichartReplayNeedsFineMaster()`:

```text
chart v 1.4/chart/chart.js:5582-5592
```

It requires:

- backtest mode,
- replay exists and `replay.isActive`,
- chart is multichart host,
- replay step ms is materially finer than raw master ms.

The replay step is resolved from explicit replay interval / hidden replay select / selected timeframe option / current chart timeframe:

```text
chart v 1.4/chart/modules/replay-system.js:3565-3597
```

The lazy hydration preflight is correctly attached to actual replay actions:

```text
chart v 1.4/chart/chart.js:5704-5744
```

`_installLazyReplayMasterGuards()` wraps `play`, `requestStepForward`, and `stepForward`, so the hydration-before-step mechanism is action-oriented.

However, `_getReplayPanFetchTimeframe()` also evaluates `_multichartReplayNeedsFineMaster()` during pan loading:

```text
chart v 1.4/chart/chart.js:6917-6937
```

This means that after the host is allowed to stay on a `4h` native master, a separate B-FIX-6b-2 spec should also decide whether armed-idle panning may consult replay-step granularity. If the replay interval is set to `1m`, `_multichartReplayNeedsFineMaster()` can make `_getReplayPanFetchTimeframe()` fall through to `return '1m'` even when the user is merely dragging an armed-but-paused host. That is the "too-loose armed predicate" surface for pan-loads.

### Would Tightening The Predicates Make Idle-Armed Host Commit Display TF?

Yes, with two precise changes in a future task:

1. In `loadMultichartPanelFromHost()`, replace "not replay active" with a predicate closer to "not actually playing/stepping and no current playhead operation requires finer granularity." That lets an armed-but-idle host take the 6a display-TF master path and set `masterTf = displayTf`.
2. In `_emitMultichartHostDataCommit()`, prefer active replay `rawTimeframe` only when replay is actually using a fine master for play/step correctness, not merely because `replay.isActive` is true. Otherwise commit `_nativeRawFetchTf`, which should be the display TF after item 1.

If the host truly loads and commits `4h`, B8's existing gate fires naturally for a `1m` same-pair panel because `panelMs < hostMs * 0.92` becomes true. Director's hypothesis is therefore confirmed **if** the underlying host data/native commit is display-TF. It is not enough to only make the commit event claim `4h` while the host replay/raw master still holds `1m`; the actual load/commit source must change.

### What Replay Start/First Fine Step Must Hydrate

If the armed-idle host remains on a display-TF native master, replay start/first fine step must hydrate a fine master via the existing 6b path:

- `_installLazyReplayMasterGuards()` wraps `play`, `requestStepForward`, and `stepForward` (`chart v 1.4/chart/chart.js:5704-5744`).
- `_ensureLazyReplayMasterBeforeStep()` calls `ensureReplayDataCoversTimestamp(ts, { forceFineMaster: true })` (`chart v 1.4/chart/chart.js:5704-5708`).
- `ensureReplayDataCoversTimestamp()` converts `forceFineMaster` into `replayRawTf = '1m'` and fetches the playhead-centered lazy master (`chart v 1.4/chart/chart.js:5755-5890`).

That is the correct B-FIX-6b-2 boundary: display-TF master is allowed while armed/idle/browsing; first actual fine replay operation hydrates `1m` around the playhead.

## Predicate-Change Impact

### Single-Chart Parity (I7)

- `loadMultichartPanelFromHost()` display-TF host logic is already gated on `_isMultichartHostPanel()` (`chart v 1.4/chart/chart.js:3911-3915`), so tightening that predicate would be multichart-host-only.
- `_emitMultichartHostDataCommit()` is already no-op for embeds and requires `_isMultichartHostPanel()` (`chart v 1.4/chart/chart.js:3161-3165`), so changing commit cadence selection is multichart-host-only.
- `_getReplayPanFetchTimeframe()` changes must be scoped inside `_usesMultichartReplayMaster()` and host/panel checks (`chart v 1.4/chart/chart.js:6917-6937`) to preserve single-chart behavior.

### Replay Stepping

Do not remove the 6b preflight. If display-TF master remains active while armed/idle, the first `play` / `requestStepForward` / `stepForward` that needs finer granularity must still hydrate via `_ensureLazyReplayMasterBeforeStep()` before stepping (`chart v 1.4/chart/chart.js:5704-5744`).

The fine-master need itself is legitimate when `stepMs < rawMs * 0.92` (`chart v 1.4/chart/chart.js:5582-5592`). The unsafe part is treating armed-idle browsing/panning as if that need must already be paid.

### Cross-TF Panels

If host commits display TF (`4h`) while same-pair panels are `1m`, B8's owner predicate will classify those panels as finer owners (`chart v 1.4/chart/chart.js:2932-2952`). Same-TF panels remain mirror panels, and coarser-than-host panels remain host-fed when the host cadence is fine enough to downsample per I1.

## Answers

### Q1

The named drift mechanism is **missing prepend-delta viewport/index compensation on same-pair mirror commits**. Owner pan-loads compensate in `checkViewportLoadMore()` by shifting `currentIndex` and `offsetX` after a backward prepend (`chart v 1.4/chart/chart.js:22179-22214`, `chart v 1.4/chart/chart.js:22261-22277`). Mirror paths do not: `_multichartMirrorHostTfSwitchIfReady()` replaces arrays and recomputes `offsetX` from the new right index (`chart v 1.4/chart/chart.js:2791-2804`, `chart v 1.4/chart/chart.js:2843-2854`); `_tryMirrorFrameFromParentData()` replaces arrays, right-anchors/autoscrolls, and copies the parent index without prepend-delta math (`chart v 1.4/chart/modules/replay-system.js:6247-6289`); `forceSamePairParentDataMirror()` fallback replaces arrays/index and preserves/recomputes offset without measuring the prepend (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1032-1049`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1095-1146`).

### Q2

The armed-not-playing host is still on `1m` because `loadMultichartPanelFromHost()` only enables the display-TF host master when `!(rs0 && rs0.isActive)` (`chart v 1.4/chart/chart.js:3909-3916`). Backtest arming calls `enterReplayMode()`, which sets `isActive = true` before play (`chart v 1.4/chart/modules/replay-system.js:2373-2392`; caller at `chart v 1.4/chart/chart.js:9235-9244`). Therefore `masterTf` becomes `1m`, `loadedNativeTf`/`replay.rawTimeframe` become `1m`, and `_emitMultichartHostDataCommit()` commits `1m` while replay is active (`chart v 1.4/chart/chart.js:4249-4255`, `chart v 1.4/chart/chart.js:3161-3183`). Fixing that boundary so idle-armed browsing commits display TF would let B8 fire naturally for `1m` panels against a `4h` host; first actual fine replay step must hydrate through the 6b lazy path.

## Verification

- Source files read only; no `.js`, `.jsx`, `.ts`, `.py`, build output, or existing docs were edited by this task.
- Only intended file created: `docs/multichart-overhaul/DIAG-B9-boundary-and-drift.md`.
- Pre-task git status:

```text
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-ESCALATIONS.md
```

- Post-task git status:

```text
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-ESCALATIONS.md
?? docs/multichart-overhaul/DIAG-B9-boundary-and-drift.md
```
