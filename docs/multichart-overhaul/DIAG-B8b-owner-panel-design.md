# DIAG-B8b - Owner-Panel Design For Finer Same-Pair Panels

## Pre-Task Git Status

Captured before this design write-up:

```text
 M "Sources Handoff/TalariaV16.jsx"
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
 M journal-backend/routes/journal/live_accounts.py
```

No B8 chart source file was modified before starting this read-only design task.

## 1. New Ownership Contract

I1 clarification candidate:

| Layout relationship | Data owner | Fetches expected | Follows host master? | Follows replay playhead? |
|---|---|---:|---|---|
| Same-pair same-TF | Host | Panel fetches `0`; panel mirrors host committed data. | Yes. Same-TF panels use `_multichartMirrorHostTfSwitchIfReady()` / replay-frame mirroring rather than fetching. | Yes. Replay frames and parent master sync seek to the shared timestamp. |
| Same-pair coarser-than-host | Host, when host native/master cadence is fine enough to downsample. | Panel fetches `0` when host master covers the panel window; otherwise bounded panel fetch only after host cannot cover. | Yes, if the host master is same or finer cadence than panel TF. | Yes. The panel consumes the shared playhead but renders from downsampled host-owned bars. |
| Same-pair finer-than-host | Panel owner for its finer native window. | Bounded owner fetches are allowed: automatic owner acquisition is capped at two requests of max `5000` bars each, so `10000` bars per owner-panel acquisition. | No. It must not ask the host to grow a finer master solely to feed this panel. | Yes. The playhead remains shared; only data ownership splits. |
| Independent-symbol | Panel owner. | Existing independent-panel bounded fetch behavior; not host-owned. | No. | Yes. Independent panels already sync to the replay playhead using their own data. |

Evidence: S6-b is the same-pair same-TF zero-fetch baseline: panels B/C/D stayed at `fetches 0` and `fetchedBars 0` while mirroring host data (`docs/multichart-overhaul/BASELINE-RESULTS.md:184-211`). S6-c shows the mixed-TF ownership gap, where same-symbol different-TF panels self-fetched because the host viewport master did not cover their calendar viewport (`docs/multichart-overhaul/BASELINE-RESULTS.md:213-230`). DIAG-B7 identifies the same-TF mirror primitive and replay convergence path (`docs/multichart-overhaul/DIAG-B7-host-panel-window-mismatch.md:32-48`). DIAG-B8 identifies the current finer-panel issue: same-pair panels clone or extend the host master and can delegate missing history back to the host, forcing host `1m` growth (`docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md:42-66`).

Code evidence: same-pair boot currently polls or copies the parent native master before fetching (`chart v 1.4/chart/chart.js:3681-3690`). Same-TF host mirroring clones host `rawData`, `data`, cursors, and native TF (`chart v 1.4/chart/chart.js:2714-2766`). Current replay parent sync copies parent master and seeks the panel replay to the shared timestamp (`chart v 1.4/chart/chart.js:5118-5153`). The granularity gate already states that a coarse master must not be upsampled to a finer TF (`chart v 1.4/chart/chart.js:4577-4589`).

## 2. Numerically Bounded Fetch Policy For Owner Panels

Owner panels are not unbounded independent owners. For same-pair finer-than-host panels, the proposed hard cap is:

- Initial owner acquisition after boot, TF switch, or mirror-to-owner handover: at most two network requests.
- Per request cap: `5000` bars.
- Per acquisition cap: `10000` bars per owner panel.
- Subsequent user pan at a data edge: at most one additional `5000`-bar request per pan-edge trigger.
- Active replay playback catch-up keeps the stricter `2000`-bar request cap.

This keeps the expensive automatic case numerically bounded while preserving single-chart parity for manual pan. The design intentionally reuses existing request-size shapes: `/smart` is normally clamped to `2000` unless an explicit high-limit path opts out (`chart v 1.4/chart/chart.js:5548-5573`), `_backtestFetchLimitForTimeframe()` returns `2000` for TFs up to `4h` (`chart v 1.4/chart/chart.js:20988-20990`), and cursor pan already computes `2000-5000` bars, with active playback capped at `2000` and paused/manual panning capped at `5000` (`chart v 1.4/chart/chart.js:21469-21482`). `_fetchCandlesCursor()` also defaults to `2000` if no limit is supplied (`chart v 1.4/chart/chart.js:5917-5924`).

The cap is designed specifically to avoid the DIAG-B8 failure mode, where a finer panel can cause the host to extend a shared replay master in roughly `2000`-bar chunks until a large `1m` window exists (`docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md:34-40`). The backend can accept much larger `/smart` limits (`chart v 1.4/chart/api_server.py:21572-21593`), so this must remain a client-side contract, not a backend accident.

## 3. Replay Semantics For Independent Finer Panels

The replay playhead remains shared, but the finer panel renders from its own owned native window. On each shared replay timestamp, the owner panel seeks within `_panelFullRawData` / local replay data and resamples or trims from that local data only. It must not borrow host bars to fill a finer candle, because the current granularity guard explicitly rejects upsampling a coarser master into a finer TF (`chart v 1.4/chart/chart.js:4577-4589`).

Forming-candle behavior: the independent finer panel forms and trims the active candle from its owned raw data at the shared playhead. Current replay slicing sets `chart.rawData` to `fullRawData.slice(0, currentIndex + 1)`, resamples for display TF, and then calls `_trimLastDataBarToReplayPlayhead()` when present (`chart v 1.4/chart/modules/replay-system.js:3017-3031`). That behavior remains valid as long as `fullRawData` is the panel-owned finer window rather than a host-owned coarse master.

If the shared playhead is before the panel-owned window, the panel issues one bounded backward owner fetch, capped by the policy above. Until it lands, the panel keeps its last valid rendered frame and does not mirror host data. If the fetch cannot cover because the playhead is before available/session data, the panel clamps to the first owned bar and reports a bounded miss.

If the shared playhead is after the panel-owned window, the panel issues one bounded forward/end owner fetch, capped by the policy above. Until it lands, the panel keeps its last valid rendered frame. If the fetch cannot cover because the playhead is beyond available/session data, it clamps to the last owned bar and reports a bounded miss.

This preserves DIAG-B7's replay convergence principle while changing only the data source for the finer panel. Current replay initialization stores a full local raw dataset and playhead bounds (`chart v 1.4/chart/modules/replay-system.js:2485-2495`), and update clamps `currentIndex` inside the available dataset (`chart v 1.4/chart/modules/replay-system.js:2987-2993`). Same-symbol replay frames already distinguish different-TF panels from same-TF mirror panels, so finer different-TF panels should follow the timestamp without forcing host data mirroring (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-596`).

## 4. Worst-Case Memory Statement For A 4-Layout

Worst case under this design: host plus three non-host panels, where all three non-host panels are same-pair finer-than-host owner panels.

Numerical cap:

- `3` owner panels.
- `10000` bars per automatic owner acquisition.
- `30000` owned finer bars total across non-host panels.

Memory estimate:

- Logical numeric payload: `30000 bars * 6 numbers * 8 bytes = 1,440,000 bytes` (`~1.4 MB`) for `t/o/h/l/c/v` values.
- Conservative JavaScript heap budget: `30000 bars * 256 bytes = 7,680,000 bytes` (`~7.7 MB`) for candle objects.
- Replay/reference arrays add roughly `3 panels * 10000 refs * 2 arrays * 8 bytes = 480,000 bytes` (`~0.5 MB`) because replay initialization shallow-copies chart arrays (`chart v 1.4/chart/modules/replay-system.js:2485-2489`).
- Total design budget: under `~8.2 MB` for the three owner panels' capped automatic windows, excluding indicators/overlays.

The key invariant is bars, not the exact heap overhead: the automatic owner-panel path can add at most `30000` finer bars in a 4-layout. This avoids the unbounded aggregate blowup shape identified in DIAG-B8, where host-owned `1m` master growth could accumulate roughly `116000` bars through repeated chunks (`docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md:34-40`).

## 5. Live Handover

Mirror to owner: when a host TF switch makes a same-pair panel finer than the host-owned native/master cadence, the panel keeps its current rendered frame, cancels or ignores any stale host-mirror/poll result by generation, and performs one owner acquisition under the `10000`-bar cap. It must not first delegate to `host.checkViewportLoadMore()`, because that is the path DIAG-B8 identifies as growing the host `1m` master (`docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md:24-26`, `docs/multichart-overhaul/DIAG-B8-host-fine-master-for-finer-panel.md:54-66`). No blank frame: the old data remains painted until the bounded owner window commits atomically.

Owner to mirror: when a later host TF switch makes the host master same-TF or fine enough to downsample, the panel stops owner acquisition, ignores stale owner-fetch completions by load sequence, and runs the existing host mirror once after the host commits. `_multichartMirrorHostTfSwitchIfReady()` already copies host bars, display bars, cursors, totals, and native TF in a single handover (`chart v 1.4/chart/chart.js:2714-2766`). DIAG-B7's accepted direction is to make same-TF panels reliably re-mirror the host's current extent without adding network load (`docs/multichart-overhaul/DIAG-B7-host-panel-window-mismatch.md:58-72`).

No double-fetch: only the new owner side fetches during mirror-to-owner, and only the host mirror path runs during owner-to-mirror. No blank frame: data arrays are replaced only after the target owner/mirror window is ready. No drift spike: the shared playhead remains the same timestamp, and the panel either seeks within its owned data or clones the host committed data before rendering.

## Verification

- Design-only task completed; no source build was run.
- No `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, or build output was edited by this task.
- The only intended file created by this task is `docs/multichart-overhaul/DIAG-B8b-owner-panel-design.md`.
- Post-task status surfaced `chart v 1.4/chart/chart.js` and `homepage/public/chart/chart.js` as modified; no source patch was applied while producing this report, and those source diffs are outside this B8-DESIGN deliverable.
- All five requested design questions are answered with file:line references.
- Runtime claims remain design-level and unverified in browser; this report is intended for Director review before implementation.
