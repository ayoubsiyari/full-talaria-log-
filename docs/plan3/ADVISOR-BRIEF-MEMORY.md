# Talaria — Memory/Lag Investigation Brief (response to advisor request)

Date: 2026-07-24 · Author: Director · Status of source evidence: code-audit-verified (file:line anchors); live-measurement items are explicitly marked PENDING and are already tasked to the team.

Framing accepted: we agree the GB-scale figure is RAM, and our own audit findings match the "leak + GC pressure" signature (both are present — see D-prediction and E5). The investigation was NOT CPU-only: the M19 fix family included heap-growth bounds (M19-G), but full heap-snapshot tooling has not yet been used systematically. It is now the first task of the current sprint (see F).

---

## A. What is actually growing

**PENDING live capture** (tasked, highest priority): Performance Monitor counters (JS heap / DOM nodes / listeners / CPU) during a scripted reproduction, plus whether the 3–8GB is tab vs whole browser vs server. Backend check (`htop`/`pm2 monit` on EC2 during a session) is included in the task; our code evidence gives no reason to expect server-side growth (per-session state on the server is a bounded PATCH payload), but it will be measured, not assumed.

**Code-evidence prediction of what the counters will show:**
- **JS heap**: grows. Retained: base64 screenshots on every closed trade held in memory (`order-manager.js:5801, :9978-9982`), uncapped per-bar `trail_sl_path` arrays (`order-manager.js:29931, :30244`), `tickPathCache` keyed by every candle timestamp with no LRU (`replay-system.js:67, :5609-5643`), superseded full master arrays retained by reference per timeframe (`order-manager.js:1507-1529`), shared bar store up to 200k bars × every TF used per file (`chart.js:3172-3225`).
- **JS event listeners**: grows with specific user actions. Floating replay toolbar leaks one permanent document `mousemove`+`mouseup` pair per float/close cycle (`replay-system.js:1406-1445`); `timezoneManager.addListener` is push-only (`timezone-manager.js:309`); drawing/favorites managers install document listeners with no teardown.
- **DOM nodes**: slow growth — SVG glow `<filter>` defs are never removed when trade markers prune (`order-manager.js:37970-37982, :41488-41532`); marker/connector groups accumulate one set per historical trade.
- **CPU**: elevated as a side effect (GC + per-tick O(N) work below), consistent with the advisor's framing.

## B. Reproduction behavior (code-evidence predictions; live confirmation PENDING in the same task)

- **Zero indicators/drawings/orders**: heap still steps up at replay enter (a tick-path cache is built over the full master) and churns per tick (see E4 prefix-slice), but the steep growth requires orders (screenshots, trail paths) or indicators (per-tick clone churn). Live run will quantify the clean-replay slope.
- **Fastest single indicator**: any "sync-only" type (sessions/killzones/ICT*/FVG/Talaria*) — these force a full main-thread recompute over ALL bars per bar advance (`chart-indicators-full.js:8758-8775`). For pure heap churn, ANY worker-eligible indicator triggers a fresh ~N×6×8-byte Float64Array pack + structured clone to the worker per bar advance (`chart-indicators-full.js:8806-8823`) — ~4.5MB per advance on 90d of 1m data.
- **Paused vs playing**: per-tick churn stops when paused; background growth continues from always-on timers — a 600ms full-DOM `querySelectorAll('span')` poll that is never cleared (`chart.js:1554`), local session backup serializing open orders INCLUDING base64 screenshots to localStorage every 5s idle / 20s playing (`chart.js:11125-11225`), a 500ms alert-checker interval, and ~1Hz full repaints from the bar-close countdown (`chart.js:28268-28300`).
- **After restart**: the core replay loops are correctly cancelled (verified — play/tick intervals and loop IDs are cleared on pause/stop/speed change), so growth-rate doubling from stacked main loops is NOT expected. However, two per-cycle accumulators exist: the floating-toolbar document listeners (above) and a multichart same-pair mirror `setInterval` that can stack on rapid replay re-enter (`panel-cmd-bridge.js:2769-2779`).

## C. Does memory come back after stopping?

**PENDING measurement.** Code prediction: **partially**. The churn component (packed-array clones, prefix slices, render allocations) is collectible and should drop within seconds. The retained component will NOT drop: journal screenshots, trail paths, tick-path cache, retained masters, and cache maps all stay referenced after replay exit. So we expect the snapshot to show a permanent floor that ratchets up with each session segment — a true leak on top of GC pressure, i.e. both of the advisor's categories at once.

## D. Heap snapshots

**PENDING — now the first deliverable of the sprint** (three snapshots: pre-replay, +2min, +4min; Comparison view; retainer paths; detached-node census). Predicted top growers, to be confirmed or falsified: `(string)` — base64 data-URLs from trade screenshots; `Float64Array` — per-advance packed bar clones; plain `Object`/`Array` — bar objects from prefix slices and retained masters; detached `SVGElement` — pruned marker groups/filters. If the snapshots contradict these predictions, the snapshot wins and the plan re-ranks.

## E. Architecture facts

1. **Replay loop**: hybrid — `setInterval`/`setTimeout` chains for bar/tick cadence plus `requestAnimationFrame` for candle animation and paint coalescing. Previous loops ARE explicitly cancelled on restart/speed change (interval handles + a loop-generation ID that stales orphan callbacks). One permanent `animate()` rAF loop runs for chart lifetime by design (it also forces ~1Hz idle repaints via the countdown — flagged for fix). One stacking exception in multichart noted in B.
2. **Rendering**: custom in-house engine (no third-party chart library in production). Candles/axes/indicators on `<canvas>` (2D), drawing tools on an SVG layer via D3, plus DOM overlays (legend, labels, toolbars). Known hot-path defect: the SVG drawings layer is fully cleared and rebuilt every pan/replay frame; a CSS-transform fast path exists in code but is never invoked (`chart.js:36513, :27854`).
3. **Indicator computation per tick**: nominally incremental — a worker computes a tail window and merges. But (a) the input is a fresh pack + structured clone of the ENTIRE history per bar advance (not a tail send, not a transferred buffer), and (b) sessions/ICT/FVG-class indicators bypass the worker and do a full synchronous recompute over all bars on the main thread per advance. This is exactly the advisor's hypothesis #2 in a partial form and is already specced as fix M19-I.
4. **Where candle data lives**: module/class fields (`chart.data`, `replaySystem.fullRawData`), NOT React state — React hosts the shell only, so hypothesis #4 (state churn re-rendering the tree) does not apply. However, an equivalent churn exists inside the engine: every bar advance allocates `fullRawData.slice(0, currentIndex+1)` — a fresh prefix copy of the entire session history per tick, in both the normal and fast paths (`replay-system.js:3804, :5526, :6129, :8706`). On a mature session this is an O(N) allocation per tick and a major GC-pressure source. Added to the fix list.
5. **Uncapped session arrays** (audit-verified): `trail_sl_path` (per-bar while trailing), `sl_modifications` log, in-memory journal/closed-positions screenshot fields, `tickPathCache`, `_orderExecutionSeriesByFileId` (retained masters), `_miSeriesByFileId` (~20k bars per symbol/TF, no global cap), shared-bar-store per-TF slots, propfirm `allTrades`/`dailyTrades`. (Undo stack is capped at 50 — checked, not an issue. Per-bar excursion arrays were capped in an earlier fix wave.)

## F. Current status — done, in flight, planned

**Already fixed and verified (build b55–b57, "M19 A–H"):**
- Per-tick full order-panel DOM rebuild → dirty-flag/throttle (A); per-bar excursion arrays → capped (B); session autosave payload → slimmed, screenshots stripped from journal rows (C); journal-marker redraw → delta-scoped (D); hot-path console logging → gated (E); replay slowdown with pending/active orders (F); long-replay memory/CPU growth bounds (G); rapid timeframe-switch freezes → atomic switching, stale-worker rejection, SVG reuse (H). Negative-control verified ~13× improvement on the TF-switch stress; retained-growth checks green at the soak scale used.
- Each fix is behind its own kill-switch, so any of them can be A/B-toggled live during the advisor's investigation.

**Identified, specced, not yet fixed:**
- **M19-I** (indicator pipeline): tail-only worker sends with buffer reuse/transfer; incremental recompute for sync-only types; shrink worker-skip list; remove forced recalcs that bypass change-detection.
- **M20** (~30 audited latent sources, file:line-anchored): quick-kill list (DOM poll, idle repaints, screenshot stripping from local backup + cross-window snapshots, trail-path caps, ungated cross-iframe messages, listener leaks, interval stacking) then four families: idle drains / unbounded growth / render hot path / cross-window+storage. A permanent regression gate is specced: 10-minute idle soak, loaded soak (trades+screenshots+drawings+multichart), a timer/listener census asserting flat counts across enter/exit cycles, and byte budgets on storage writes and postMessage payloads, all wired into CI.

**Mapping to the advisor's six hypotheses:** #1 partially confirmed (main loops clean; two per-cycle accumulators found); #2 confirmed in partial form (clone-per-tick + sync-only full recompute = M19-I); #3 confirmed (list in E5); #4 not applicable as stated, but the engine-internal per-tick prefix slice is the moral equivalent; #5 confirmed (multiple never-removed listener/timer sites, no destroy path — matches "stays high after stopping"); #6 partially confirmed statically (SVG filter defs, marker groups; plus canvas backing-store churn from resize-in-mousemove) — snapshot census will settle counts.

**Immediate measurement tasks (owners assigned, results will be appended to this brief):**
1. Performance Monitor capture during scripted reproduction (heap / DOM nodes / listeners / CPU) + tab-vs-browser-vs-server attribution + EC2 `htop` during the same run.
2. Three-snapshot heap comparison with retainer paths and detached-element census, on two cells: clean replay (no objects) and loaded replay (orders+indicators+drawings).
3. Stop-session recovery check (does heap return within 30s) with the kill-switch matrix available for A/B attribution.

---

# G. Addendum 2026-07-24 — first live measurements, competitive baseline, and a new visible symptom

## G1. First real numbers (PO capture, browser task manager, 4-panel multichart + several indicators + one running order, high replay speed)

- **Attribution settled for section A:** the growth is the **browser tab process** (`Private Tab: Talaria — V9 Live`), not the whole browser and not the server.
- **Talaria tab:** memory footprint observed at **1,085,100K → 1,343,772K (~1.06 → ~1.31 GB) during the session — still growing, slower than pre-M19 builds but not flat.** CPU on the tab process observed at **58.6 and later 187.5** (≈ two cores saturated) during 4-panel high-speed replay. Network ~1.4 KB/s (consistent with bounded session PATCH traffic, supports "no server-side leak" prediction).
- **Same-conditions competitor baseline (TradeZella, TradingView-based, 4 charts + multiple indicators + open position, replay running):** tab reports **~714 MB and stable**; the browser task manager shows **low tab CPU with the work appearing under the GPU process** (GPU process ~776 MB / 23.9 CPU; browser shell ~285 MB / 5.6).
- **Interpretation of the GPU observation** (PO asked what it tells us): TradeZella's renderer pushes rasterization/compositing to the GPU process and keeps its main thread almost idle; its tab process is therefore inconspicuous in the task manager. Talaria's engine renders on the **main thread**: immediate-mode 2D canvas (`chart.js:919` — default context, no `desynchronized` hint; only the indicator layer canvas opts in at `chart-indicators-full.js:8318`), a D3/SVG drawings layer, and DOM overlays — multiplied by our 4-iframe multichart topology (4 full engines vs their 1 runtime with 4 views). So our per-frame cost lands on CPU where theirs lands on GPU. This is an architecture-level ceiling on top of the leak/churn issues: the M19/M20 work removes the *growth* and the *waste*, but main-thread rendering × 4 engines sets the floor. (A single-runtime rendering prototype on lightweight-charts already exists in-repo from an earlier phase, so the long-term option is scoped, not speculative.)
- **Conclusion for the advisor:** both problem classes are now measured — a **ratcheting footprint** (1.06→1.31 GB, matches the retained-object list in section A) and **structurally high main-thread CPU** (matches sections E2-E4). Heap snapshots (task 2) remain the missing evidence and stay first priority.

## G2. New visible symptom — indicator endpoint trails the price at high replay speed, HOST chart only

PO observation on build b61: at high replay speeds the indicator lines visibly lag behind the latest candle **on the host chart only**; in a 4-panel multichart running the same speed, the **panel charts show no such lag**.

- **Working diagnosis (fits the code):** the host computes indicators through the **asynchronous worker pipeline** — at high speed the worker is busy-coalescing (`_indicatorWorkerBusy` → coalesce, `chart-indicators-full.js:8722-8724`), so results merge one-or-more frames **after** the candle paints; the painted indicator endpoint is therefore always a few bars stale while price keeps advancing. Panels do not run this pipeline — they recompute synchronously on the mirrored frame they apply — so their indicator paint is atomic with their candle paint. The lag is thus a **paint-synchronization defect of the async path**, not data staleness: the very optimization that keeps the main thread free makes the endpoint visibly trail unless the last segment is reconciled at paint time.
- **Verification/acceptance gap found by the manager (build b61):** the M1 gate asserted **indicator data freshness, not the final painted endpoint**, and sampled only 11 frames at 60× and 8 at 100× — so automation is GREEN while the PO's eyes are RED. Ruling: b61 stays test-only; a **visible-frame RED** (assert painted endpoint bar-distance from last candle ≤ 1 at 60×/100×, sampled densely) must exist and fail on b61 before any b62 fix builds. This continues the plan's standing lesson: proxy assertions are forbidden (I15); the probe must measure what the user sees.
- **Candidate fix directions for the b62 worker** (after the RED exists): paint-time tail extrapolation (draw the last indicator segment synchronously from the forming bar while the worker fills history), or a synchronous incremental step for the visible tail with the worker handling everything older. Either preserves the M19-I main-thread win while making the visible endpoint frame-accurate.

## G3. CPU growth status

PO confirms CPU usage still grows over the session — **slower than before** (M19 A–H effect is real) but not flat. Consistent with the not-yet-landed items: M19-I clone churn, Q9 per-tick full-history prefix copy, and the M20 idle drains, all specced with anchors above. The growth curve should be re-measured after quick-kills land; if slope survives the full M20 set, the heap-snapshot comparisons become the arbiter of what we missed.
