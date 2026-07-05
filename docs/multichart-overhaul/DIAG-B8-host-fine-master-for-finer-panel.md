# DIAG-B8 - Host Fine Master For Finer Same-Pair Panel

## Pre-Task Git Status

```text
 M "Sources Handoff/TalariaV16.jsx"
 M homepage/src/app/dashboard/strategies/strategyLabV9Mappers.ts
```

## Scope And References

This diagnosis covers the browse/no-playback issue where a same-pair layout has host tile A on a coarse display TF such as `4h` and a same-pair panel on a finer TF such as `1m`, yet the host becomes the owner of a large `1m` master that the panel mirrors. Canonical before/related references are not re-measured here: S6-a records the original host 91 fetches / 178k-bar 1m-master tax (`docs/multichart-overhaul/BASELINE-RESULTS.md:160-176`), S6-b records the same-TF zero-fetch mirror contract (`docs/multichart-overhaul/BASELINE-RESULTS.md:178-211`), S6-c records the mixed-TF ownership gap (`docs/multichart-overhaul/BASELINE-RESULTS.md:213-230`), §6u records the 6a display-TF host win and same-TF defect (`docs/multichart-overhaul/MANAGER-FINDINGS.md:599-621`), and §6v records the accepted 6a-2 same-TF remirror fix (`docs/multichart-overhaul/MANAGER-FINDINGS.md:623-639`).

Unless otherwise noted, code evidence is in `chart v 1.4/chart/chart.js`.

## Where The Host Gets Pulled Into 1m

B-FIX-6a itself is not bypassed in `loadMultichartPanelFromHost()`: for a host display TF such as `4h`, `displayTfMasterHost` is true when replay is not active, the disable flag is not set, and the chart is tile A, so `masterTf` becomes the display TF instead of `1m` (`chart v 1.4/chart/chart.js:3553-3577`). The display-TF host branch then fetches `displayTf`, marks the successful result as a display-TF host load, and records `_nativeRawFetchTf = displayTf` (`chart v 1.4/chart/chart.js:3704-3724`, `chart v 1.4/chart/chart.js:3802-3812`). That is the 6a branch and it is lean by construction.

The finer-panel trigger is a separate shared-master role path after multichart/backtest boot or TF settling. The React grid keeps tile A as the existing parent chart and creates iframe panels with their own `tf` URL parameter (`chart v 1.4/talaria-design/src/MultichartGrid.jsx:39-47`, `chart v 1.4/talaria-design/src/MultichartGrid.jsx:684-736`). It intentionally does not forward `mode=backtest` into iframe URLs, so `embed-bridge` mirrors the parent session and uses its deterministic panel path rather than auto-running `autoLoadBacktestingData()` inside every iframe (`chart v 1.4/talaria-design/src/MultichartGrid.jsx:693-721`, `chart v 1.4/chart/multichart-prod/embed-bridge.js:1020-1058`).

For same-pair backtest panels, that deterministic panel path waits for a host replay master before loading: `hostReadyForMirror()` returns true only when the parent `replaySystem.fullRawData` exists (`chart v 1.4/chart/multichart-prod/embed-bridge.js:362-369`), and same-pair panel boot waits up to 8s for that condition before calling `loadMultichartPanelFile()` (`chart v 1.4/chart/multichart-prod/embed-bridge.js:1101-1106`). The chart-side same-pair load then tries `_pollTakeParentNativeMasterSmartWindow()` / `_takeParentNativeMasterSmartWindow()` before any panel fetch (`chart v 1.4/chart/chart.js:3677-3687`). `_takeParentNativeMasterSmartWindow()` reads `parent.replaySystem.fullRawData`, exposes it as `source: 'parent-native-master'`, and labels the copied native TF as `1m` (`chart v 1.4/chart/chart.js:3357-3387`). This is the same-pair ownership contract that makes the panel report `fetchedBars=0`.

The code path that can actively push host tile A to grow that shared master is `_fillViewportHistoryAfterTfSwitch()`. After a TF switch, `_finishTfSwitchViewportRestore()` schedules `_fillViewportHistoryAfterTfSwitch(0)` (`chart v 1.4/chart/chart.js:28591-28601`). If the panel is same-pair, replay-active, and has a host, the panel first tries `_tryExtendReplayMasterFromParent()`; if that cannot pull enough data, it calls `host.checkViewportLoadMore('backward', true)` so the host fetches once and all same-pair panels mirror the result (`chart v 1.4/chart/chart.js:28661-28680`). This is not the ordinary browse-pan path the task ruled out; it is a TF-switch/history-fill shared-owner path.

Once the host receives that delegated load while its replay system is active, `checkViewportLoadMore()` computes `isReplay` from `replaySystem.isActive && replaySystem.fullRawData`, and `_getReplayPanFetchTimeframe()` returns `1m` for multichart host/panel replay masters (`chart v 1.4/chart/chart.js:21129-21151`, `chart v 1.4/chart/chart.js:6299-6309`). The resulting cursor fetch goes through `_fetchCandlesCursor(this.currentFileId, tf, cursorNum, direction, barLimit)`, so the host fetch is at `1m` even if the host display label is `4h` (`chart v 1.4/chart/chart.js:21310-21318`). That is the exact site/condition that reintroduces the host fine master: same-pair finer panel history-fill delegates to host, and host replay-master pan-loading forces `tf='1m'`.

`autoLoadBacktestingData()` is also relevant background: base backtest boot resolves `replayRawTf` from current TF with a `|| '1m'` fallback, fetches that TF, records `_nativeRawFetchTf = replayRawTf`, and queues `startBacktestingReplay()` (`chart v 1.4/chart/chart.js:1768-1825`, `chart v 1.4/chart/chart.js:1894-1907`, `chart v 1.4/chart/chart.js:1948-1953`, `chart v 1.4/chart/chart.js:1991-1994`). Starting replay copies `chart.rawData` into `replaySystem.fullRawData` (`chart v 1.4/chart/modules/replay-system.js:2485-2489`). So if tile A already holds a 1m boot master, panels clone it; if tile A is lean display-TF, the delegated fill path above is the later shared-master hydration that can grow it at `1m`.

`loadFileData()` contains older 1m pins, but they are not the clean explanation for the observed panel `fetchedBars=0`: in a backtest session it forces same-pair-as-host `requestTimeframe = '1m'` and can fetch 1m when memory/cache paths miss (`chart v 1.4/chart/chart.js:7835-7854`, `chart v 1.4/chart/chart.js:7915-7960`, `chart v 1.4/chart/chart.js:8040-8044`). The deterministic multichart iframe path prefers `loadMultichartPanelFile()` / `loadMultichartPanelFromHost()` instead (`chart v 1.4/chart/multichart-prod/embed-bridge.js:1049-1058`, `chart v 1.4/chart/chart.js:4347-4372`), and same-pair panels clone host memory there.

Verdict: this is not 6a being bypassed at `masterTf = displayTf`; it is a post-6a shared-master role path. The finer same-pair panel is treated as a zero-fetch dependent, and when its finer/history needs cannot be satisfied locally, the code asks the host to extend the shared replay master. The host extension path still collapses multichart replay-master loads to `1m`.

## What Forces The Chunking

The first hard cap is the smart-window builder. `_backtestFetchLimitForTimeframe('1m')` returns 2000 for TFs up to and including `4h` (`chart v 1.4/chart/chart.js:20805-20808`), and `_buildSmartWindowParams()` clamps backtest `/smart` limits to `Math.min(2000, backtestBatch)` (`chart v 1.4/chart/chart.js:5377-5405`). The server-side `/smart` endpoint itself accepts much more, clamping only at 100000 (`chart v 1.4/chart/api_server.py:21572-21593`), so the 2000 size is a client-side limit.

The delegated host extension then uses cursor pagination. Manual/non-playing pan chunks are sized to 2000-5000 based on visible span, but replay-playing chunks cap at 2000; the call site passes `barLimit` into `_fetchCandlesCursor()` (`chart v 1.4/chart/chart.js:21250-21299`, `chart v 1.4/chart/chart.js:21310-21318`). `_fetchCandlesCursor()` defaults to 2000 and sends a cursor request for the chosen timeframe (`chart v 1.4/chart/chart.js:5739-5751`). In the shared-history-fill loop, only one host fetch is in flight at a time, then `_fillViewportHistoryAfterTfSwitch()` retries while data grows or the host is still busy (`chart v 1.4/chart/chart.js:28684-28715`).

At the reported size, `116000 / 2000 = 58`. If the path uses the manual 5000 cap for some chunks, the lower bound is about 24 chunks; if it uses the common 2000 replay/backtest cap, it is about 58 sequential requests. That matches the user's "group by group" observation and the earlier S6-a/S6-b tax shape without needing a new measurement.

## Panel-Feed Dependency

The finer same-pair panel is designed to avoid self-fetching when host memory is available. On boot, `embed-bridge` logs same-pair parent native master availability and calls `loadMultichartPanelFile()` with the panel TF (`chart v 1.4/chart/multichart-prod/embed-bridge.js:1041-1058`). `loadMultichartPanelFromHost()` then tries parent-cache warming and parent-native clone before any network fallback (`chart v 1.4/chart/chart.js:3677-3687`). When the clone succeeds, `_takeParentNativeMasterSmartWindow()` returns the host master as a `/smart`-shaped result with no panel fetch (`chart v 1.4/chart/chart.js:3357-3387`).

After load, same-pair panels keep using the parent as the data owner. `_multichartSeedPanelMasterFromParent()` copies `parent.replaySystem.fullRawData` into `_panelFullRawData` (`chart v 1.4/chart/chart.js:2653-2672`), and `_tryExtendReplayMasterFromParent()` merges earlier/later host master bars into the panel replay master, increments `extendsFromParent`, and sets `_nativeRawFetchTf = '1m'` (`chart v 1.4/chart/chart.js:4936-4987`, `chart v 1.4/chart/chart.js:5065-5085`). The same-pair data-sharing predicate is independent of viewport sync when replay is active, and is always true when visible-range sync is on (`chart v 1.4/chart/chart.js:2862-2884`).

If the host stays lean on `4h`, a same-pair `1m` panel cannot be fed by host bars without upsampling. `_multichartSamePairTimeframeResampleFromParent()` explicitly rejects a switch to a finer TF than the previous TF (`chart v 1.4/chart/chart.js:2697-2706`), and `_independentPanelTimeframeSwitch()` rejects a master whose estimated step is coarser than the destination TF (`chart v 1.4/chart/chart.js:4568-4586`). Therefore a finer same-pair panel would have to self-fetch its own `1m` native data, using the deferred mixed-TF/pain #2 route rather than host mirroring.

## Minimal Fix Options

### Option A - Host Stays Lean; Finer Same-Pair Panel Self-Fetches

Change the same-pair data-owner decision so a panel whose requested TF is finer than the host's native/display master does not delegate history-fill to the host and does not wait for a host fine master. The narrow decision sites are the same-pair clone/extend gates in `loadMultichartPanelFromHost()` and `_fillViewportHistoryAfterTfSwitch()`: same-pair panels currently poll/copy the parent master first (`chart v 1.4/chart/chart.js:3677-3687`), and same-pair history-fill currently calls `host.checkViewportLoadMore('backward', true)` when the panel cannot pull enough parent data (`chart v 1.4/chart/chart.js:28661-28680`).

A kill switch could guard only the mixed-TF/finer-than-host condition. The must-preserve invariant is same-pair same-TF `fetches=0`: `_multichartMirrorHostTfSwitchIfReady()` already clones host committed bars for same-TF panels (`chart v 1.4/chart/chart.js:2720-2766`), and S6-b records the zero-fetch same-TF baseline (`docs/multichart-overhaul/BASELINE-RESULTS.md:184-211`). Option A should not touch that branch; it should split only `panelTf < hostNativeTf/hostDisplayTf`.

Risk: the finer panel will fetch like a single 1m chart, so panel `fetchedBars` is no longer zero in this intentional mixed-TF layout. That is acceptable for pain #2 if scoped narrowly, but it changes the current "host is single data owner for same pair" invariant. It is the safest UX choice for the host tile because the user's coarse host remains fast and lean.

### Option B - Host Hydrates Fine Master Lazily/In Larger Requests

Keep the current same-pair host-owner model, but make the delegated fine-master hydration explicit and efficient. The smallest request-size site is `_buildSmartWindowParams()` where the 2000 clamp is applied (`chart v 1.4/chart/chart.js:5377-5405`), with the backend `/smart` already accepting up to 100000 (`chart v 1.4/chart/api_server.py:21572-21593`). A kill switch could lift the clamp only for an intentional lazy fine-master hydration mode, not for all backtest `/smart` calls.

Risk: even 1-3 large requests still make the host tile pay for a panel's finer TF, which conflicts with the stated UX: host-coarse + panel-finer should leave the host feeling fast. Larger 1m responses also move parsing/resample work onto the main thread in one or a few larger bursts. This option is more compatible with the old same-pair single-owner model, but less compatible with D-016 Option B's "host browses on display TF" direction.

Safest option: Option A. It matches the user's intentional layout: the host tile is coarse and should not become a 1m data owner merely because a same-pair dependent panel is finer. The exact site to split is the same-pair host-delegation in `_fillViewportHistoryAfterTfSwitch()` plus the same-pair parent-master clone decision in `loadMultichartPanelFromHost()`; the condition must be "panel requested TF is finer than host native/display TF", so same-TF panels keep the zero-fetch mirror (`chart v 1.4/chart/chart.js:28661-28680`, `chart v 1.4/chart/chart.js:3677-3687`, `chart v 1.4/chart/chart.js:2720-2766`).

## Interaction With B-FIX-6b

B-FIX-6b should land before, or at least define the contract before, the B8 fix. Both changes decide when the host is allowed to hold a fine master. The replay contract already says multichart replay loads use a shared replay master: `_usesMultichartReplayMaster()` is true for host and embed panels (`chart v 1.4/chart/chart.js:2282-2285`), `ensureReplayDataCoversTimestamp()` forces `1m` for embeds and for host viewport-first hydration but otherwise uses the display TF (`chart v 1.4/chart/chart.js:5220-5229`), and `_getReplayPanFetchTimeframe()` still forces `1m` for multichart replay masters (`chart v 1.4/chart/chart.js:6299-6309`).

B8 and 6b share the theme but should not share the same trigger. B-FIX-6b should hydrate host fine data when replay stepping/forming-candle correctness needs a finer master. B8 should not treat "a same-pair panel has a finer browse TF" as equivalent to "host replay needs a fine master." If Option A is chosen, B8 can land after 6b using the 6b predicate as the boundary: host hydrates fine for replay, while a finer browse panel self-fetches.

## Verification

- Source files were read only. No `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, or existing markdown file was edited by this task.
- Only this new report file was created: `docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md`.
- I could not verify the exact browser event order that produced the reported `~116k` host total from code alone. The code verifies the path that can delegate same-pair finer/history needs to host and force `1m`, and it verifies the 2000-ish sequential chunk shape; the observed final bar count remains a runtime measurement supplied by the task.
- I could not verify whether `replaySystem.isActive` was false in the user's exact capture. The code path that forces host `1m` requires an active host replay master (`chart v 1.4/chart/chart.js:21129-21151`, `chart v 1.4/chart/chart.js:6299-6309`); multichart/backtest boot can create or require that master even while playback is not running (`chart v 1.4/talaria-design/src/MultichartGrid.jsx:942-997`, `chart v 1.4/chart/modules/replay-system.js:2485-2489`).
