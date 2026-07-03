# Multichart data-loading / replay handoff

Context for another agent picking up the "multichart panels load badly / candle-by-candle /
panels don't match" work. Written 2026-07-03.

---

## 1. System shape (only what matters here)

- **Host page** = the main chart (`/chart/dist-v9/` → `chart.js`). One instance, `window.chart`.
- **Panels** = iframes (`/chart/multichart-prod/chart-embed.html?...`), each a full `chart.js`
  instance. Orchestrated by `MultichartManager` (parent) ↔ `panel-cmd-bridge.js` (inside iframe)
  over `postMessage`.
- **Replay**: host tile A is the sole playhead driver. It broadcasts a `replayFrame` postMessage
  on every animation frame; each panel renders it via
  `replay-system.js → applyMultichartMirrorFrame(detail)`.
- **Sync toggles** (`layoutSync`): `interval` (fan out host TF to panels) and `symbol`
  (fan out host file to panels). Both can be OFF → panels are independent.

### Canonical vs served copies (IMPORTANT)
Every engine file exists twice and BOTH must be edited:
- Canonical (source of truth, what Docker builds from): `chart v 1.4/chart/...`
- Served mirror (used by local/static serving): `homepage/public/chart/...`
Keep them byte-identical. `MultichartGrid.jsx` lives only in
`chart v 1.4/talaria-design/src/` and is bundled by vite into `dist-v9`.

### Deploy pipeline (why "nothing changes" happens)
The running site is served by a **Docker/nginx image**, not the edited files directly.
`homepage/Dockerfile`:
- `chart_assets` stage runs `npm run build:live:chart` from `chart v 1.4/chart` + `talaria-design`,
  then copies `chart.js`, `dist-v9`, `modules`, `multichart-prod` into `homepage/public`.
- `builder` stage runs `next build` → `homepage/out`.
- nginx stage serves `homepage/out`.

Server is remote: `root@srv904606:/opt/talaria`. To actually deploy a change:
```bash
# local
git add <files> && git commit -m "..." && git push
# server
cd /opt/talaria && git pull
docker compose build homepage trading-chart   # MUST take real time, not "1.7s" (cache hit = old code)
docker compose up -d
# browser: hard reload (Ctrl+F5) so bumped service worker fetches new bundle
```
Confirm on server: `git rev-parse --short HEAD` matches the pushed commit.
Confirm in browser: `window.__talariaBarStoreStats()` returns an object (not undefined).

---

## 2. What we changed (chronological)

### A. Phase 1+2 — shared bar store + coarse-TF coverage gate (in `chart.js`)
Committed earlier ("new multi clean" commits). Reduces refetches; lets panels reuse bars.
Functions: `_sharedBarStore`, `_publishMasterToSharedStore`, `_takeSharedStoreSmartWindow`,
`_topUpMasterFromSharedStore`, `_multichartMasterCoversTimeframe`. Debug hook:
`window.__talariaBarStoreStats()`. **Leave these as-is.**

### B. Timeframe-revert fix — same-file, different-TF panel (COMMITTED, HEAD `0f49d6f`)
Problem: with Interval sync OFF + replay playing, a same-file panel put on a different TF
(e.g. host 1m, panel 1D) got silently reverted to the host TF because `applyReplayFrame`
force-mirrored host TF on EVERY frame, ignoring the Interval-sync setting.

Files: `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` (+ homepage mirror),
`chart v 1.4/talaria-design/src/MultichartGrid.jsx`.

Changes:
1. `panel-cmd-bridge.js` `case 'syncFromHost'`: `ch._mcIntervalSyncOn = !!args.syncTimeframe;`
2. `panel-cmd-bridge.js` `case 'setTimeframe'`:
   `if (args.__fromHostFanout === true) ch._mcIntervalSyncOn = true;`
   (a manual TF pick on the panel does NOT set it.)
3. `panel-cmd-bridge.js` `applyReplayFrame` same-symbol block: gate the revert with
   `if (ch._mcIntervalSyncOn && hostTf && panelTf && hostTf !== panelTf && !ch._timeframeSwitching)`.
4. `panel-cmd-bridge.js` second same-symbol branch: if host TF !== panel TF, `return` early
   (don't step/mirror host bars onto a panel intentionally on a different TF).
5. `MultichartGrid.jsx`: tag the 3 host-fan-out `setTimeframe` sends (lines ~2364, ~2559, ~3632)
   with `{ ..., __fromHostFanout: true }`. All 3 only run when `layoutSync.interval` is ON.

Note: `sendCommandNoReply` forwards `args` verbatim, so `__fromHostFanout` reaches the panel.
Default `_mcIntervalSyncOn` is undefined→falsy = safe (never force-reverts).
Known minor gap: toggling Interval ON→OFF mid-session without a following `syncFromHost`
leaves the flag stale until the next sync. Cleaner fix (not done): broadcast a
`setSyncSettings {interval}` command on every `layoutSync` change.

### C. Empty-viewport / "candle by candle" flood fix — independent panel (COMMITTED)
Problem: an independent panel (different file id from host) during replay flooded the console
with `chart.js:26374  "No candles drawn! All N candles are outside viewport"`, N climbing each
frame. Root cause: the panel's **price (Y) scale was stale**, so every candle was culled
*vertically* (`_isOhlcVerticallyInPlot`, chart.js ~26390). The two recovery guards
(`_multichartViewportNeedsRecovery`, `_scheduleViewportEmptyRecovery`) only checked **horizontal**
visibility via `_countVisiblePlotBars()` (chart.js:3802, index window only) → thought bars were
visible → never reset the price scale.

Fix in `chart.js` + `homepage/public/chart/chart.js`, function `_scheduleViewportEmptyRecovery`
(~line 15586): replaced the horizontal-only `if (i1 > i0) return;` early-out with a check that
only bails when at least one horizontally-present bar is ALSO vertically in-plot; otherwise falls
through to the existing `_ensureMultichartViewportVisible({ resetPriceScale: true,
forceRecenter: true })`, which sets `autoScale = true` (see
`replay-system.js syncReplayViewportToPlayhead` ~line 2845) → next render rescales Y → candles
appear → flood stops. Behavior unchanged whenever a bar is actually visible.

Status: flood confirmed FIXED in browser after deploy. Committed + pushed (present in HEAD,
`chart.js` + homepage mirror). Working tree is clean except this doc.

---

## 3. OPEN ISSUE (the current focus) — 2-panel layout loads a DIFFERENT file id

### Symptom
Main chart = EUR/USD (host file **25**). Open a 2-panel layout. The new panel comes up on file
**27** (different id) even though the user only uploaded EUR/USD **once**. Result: the two panels
show different date ranges / different last candle. During replay, the panel whose data doesn't
cover the playhead parks on its furthest candle (circuit-breaker in
`panel-cmd-bridge.js scheduleMirrorCatchUp`).

User's expectation (confirmed): opening a 2-layout of EUR/USD should show the **same** EUR/USD on
both panels by default. Independent pairs are only expected when the user deliberately changes a
panel's symbol.

### Where it comes from (MultichartGrid.jsx)
- Panels are created with `fileId: effFile`, where
  `effFile = propFid || hostNt.fileId || null` (`readHostChartFileAndTf()` reads
  `window.chart.currentFileId`). Panel creation loop ~line 2100-2128; `cfg` ~line 2106.
- If the host's `currentFileId` isn't available at panel-boot, `effFile` falls back to `null` →
  the embed loads a **default dataset** (file 27) instead of the host's file.
- The reconcile effect (~line 2324-2366) only forces the host file onto panels when
  **Symbol sync is ON** (`forceHostFileOnEveryTile = symFollow`). With Symbol sync OFF, a panel
  reporting a different file is left alone (`continue` at ~line 2359).
- `buildIframeSrc` (~line 670) only sets `fileId` param `if (fileId)`; empty → no fileId in URL.

### Next diagnostic (RUN THIS FIRST — decides the fix)
Ask the user to open the layout and run in the console:
```js
const h = window.chart;
console.log("HOST", h && h.currentFileId, h && h.currentSymbol);
[...document.querySelectorAll("iframe")].forEach((f,i)=>{
  try { const c=f.contentWindow.chart; console.log("PANEL",i,c && c.currentFileId, c && c.currentSymbol); }
  catch(e){ console.log("PANEL",i,"cross-origin"); }
});
```

### Candidate fixes (pick after the diagnostic)
1. **Both EUR/USD, different ids (most likely):** make every NEW layout panel inherit the host's
   `currentFileId` at boot, and correct a panel that boots on a different id when there's only one
   dataset — regardless of Symbol sync. i.e. don't let `effFile` fall back to a server default;
   wait for / read the real host fileId. Touch: `MultichartGrid.jsx` panel-create path (~2086-2128)
   and possibly the reconcile effect (~2324-2366). Consider also the embed-bridge default-file
   behavior when no `fileId` URL param is present.
2. **Same id after all:** it's a viewport/playhead desync — make the panel follow the host's
   range/last candle (extend the price-scale/viewport recovery to also re-anchor the time window).

### Guardrails
- Don't regress the independent-pair feature (deliberately different symbols must stay allowed).
- Don't remove/weaken security guards (see `.cursor/rules/security-and-supply-chain.mdc`).
- Edit BOTH canonical + homepage mirror for engine files; rebuild Docker to actually deploy.

---

## 4. Key files & functions
- `chart v 1.4/chart/chart.js` (+ `homepage/public/chart/chart.js`):
  `_scheduleViewportEmptyRecovery` (15555), `_ensureMultichartViewportVisible` (15463),
  `_multichartViewportNeedsRecovery` (3828), `_countVisiblePlotBars` (3802),
  `_syncIndependentPanelViewportIfNeeded` (3857); candle draw cull + flood warn (~26372-26374).
- `chart v 1.4/chart/modules/replay-system.js`:
  `applyMultichartMirrorFrame` (6281), `_finishMultichartMirrorRender` (6063),
  `syncReplayViewportToPlayhead` (2824).
- `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` (+ homepage mirror):
  `applyReplayFrame` (~440-541), `isSameSymbolAsHost` (891, compares **fileId** not symbol),
  `scheduleMirrorCatchUp` (778), `renderFurthestLoadedMirrorFrame` (584),
  `case 'setTimeframe'` (~1401), `case 'syncFromHost'` (~1827).
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`:
  panel create (~2100-2128), reconcile/loadFile effect (~2324-2366),
  `timeframeChanged` fan-out (~2540-2582), bidirectional fan-out (~3616-3634),
  `readHostChartFileAndTf` (591), `buildIframeSrc` (670).

## 5. Gotchas
- "Built … 1.7s" in the docker build = cache hit = OLD code shipped. A real change rebuilds slowly.
- `isSameSymbolAsHost()` is misnamed: it compares `currentFileId`, NOT the trading symbol. Two
  EUR/USD files with different ids are treated as independent pairs.
- `_countVisiblePlotBars()` is horizontal-only; it does not detect vertical (price-scale) culling.
