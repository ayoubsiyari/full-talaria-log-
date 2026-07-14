# T1 Step 12 — Panel B iframe engine gear opens parent settings

## 1. Task + RC

- **Task:** T1 step 12 — iframe panel B/C/D engine floating-toolbar `#tb-settings` must open parent drawing settings on real user timing (not callback-only / not fixed-sleep proof).
- **RC:** RC-1 (multichart selection / quick-settings routing).

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | **Root fix:** iframe selection now calls `__v9OrigShow` via `_invokeIframeToolbarOrigShow()` so the engine toolbar renders even when the parent React hook swallows `toolbar.show`. Skips `toolbar.hide()` on `forSelectionChange` deselect in iframe+fix-ON. Replaced `setTimeout(0/80/200)` rescue with **rAF settle loop** that emits `talaria:iframe-toolbar-gear-ready` / `window.__talariaIframeToolbarGearReady` when `#tb-settings` has non-zero layout. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror of the above (I8). |
| `chart v 1.4/chart/modules/drawing-toolbar.js` | Gear click arms parent `__v9DrawingSettingsOpenGuardUntil` + `__v9DrawingSettingsOpenSource` (settings-flash guard) when fix switch is ON; gated on `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`. |
| `homepage/public/chart/modules/drawing-toolbar.js` | Byte-identical mirror of the above (I8). |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | **Companion fix:** early iframe-embed `tb.show` path (lightweight parent quick-bar sync + `origShow`); `v9PreserveIframeEngineToolbarOnHide(dm)` skips hooked `tb.hide` on iframe embed DMs when fix ON so peer quick-bar sync does not erase `#tb-settings`. Gated on same switch. |
| `chart v 1.4/chart/multichart-prod/harness/t1-step12-iframe-gear-proof.mjs` | Deterministic proof script (10×) for dev:live fast loop; waits on settle signal, immediate gear click, parent settings assert. |

**No other files touched.** Build-id / dist HTML unchanged (Manager bump still pending).

### Why step 11 did not cover iframe gear (file:line)

Step 11 wired `toolbar.onSettings` → `editDrawing()` for iframe context (`drawing-tools-manager.js:1842-1845`) and gated it on the kill switch, but **did not make `#tb-settings` reliably present or clickable**:

1. Parent React hooks `tb.show` on iframe drawing managers (`TalariaV8bLive.jsx:20648+`) run the full host quick-bar bridge; in iframe context that path returns without calling `origShow`, so the engine toolbar never builds `#tb-settings` after selection.
2. Hooked `tb.hide` (`TalariaV8bLive.jsx:20871+`) still called `origHide` whenever the parent had a live quick-bar selection, clearing the iframe engine toolbar immediately after select.
3. `_rescueMultichartIframeToolbarAfterSelection` (`drawing-tools-manager.js:9008+`, prior agent) used fixed `setTimeout` delays — proof sampled too early; not a settle signal.

The **routing** was present; the **render/retain/click surface** was not.

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` — **default ON** (unset/false = fix active).
- **Gated files (switch OFF fully reverts in each):**
  - `drawing-tools-manager.js` (both trees): no `_invokeIframeToolbarOrigShow`, no rAF settle emit, `deselectAll` hides toolbar again, `onSettings` iframe branch returns inert (`1843`).
  - `drawing-toolbar.js` (both trees): no extra settings-open guard arming on gear click.
  - `TalariaV8bLive.jsx`: iframe early `tb.show` path inactive; `v9PreserveIframeEngineToolbarOnHide` returns false → hooked hide behaves as before.

## 4. Proof — RED → GREEN

### Part 1 — Fast-loop repro (RED before fix)

- **Env:** harness `serve.mjs` `:8791` + `npm run dev:live` → `http://127.0.0.1:5175/pricing/?devMultichart=2v&mode=backtest`
- **Symptom:** After `selectDrawing` on panel B iframe, `toolbar.visible=false`, `#tb-settings` missing; hooked `tb.show` called once but `origShow` never surfaced gear. Prior agent rescue only passed with artificial delay.
- **Distinction confirmed:** `dm.editDrawing()` / `onSettings` route opens parent Trend Line settings when invoked directly; failure was toolbar gear surface + timing, not parent transport.

### GREEN — default ON, 10/10 determinism

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
$env:T1_STEP12_URL='http://127.0.0.1:5175/pricing/?devMultichart=2v&mode=backtest'
$env:T1_STEP12_RUNS='10'
node t1-step12-iframe-gear-proof.mjs
```

```
run 1/10: PASS (signal=cached)
...
run 10/10: PASS (signal=cached)
T1 step12 iframe panel B gear: 10/10 (default ON)
```

- **Settle signal gated:** `talaria:iframe-toolbar-gear-ready` (and cached `window.__talariaIframeToolbarGearReady`) — **no fixed sleep before gear click**.
- **Parent settings:** `multichart-global-settings-root` shows Trend Line / Style / Coordinates text after immediate `#tb-settings` click.

### RED again — switch OFF

```powershell
node t1-step12-iframe-gear-proof.mjs --switch-off  # 0/3 — gear-ready signal not emitted; settings stay closed
```

Manual probe with switch injected before boot: `#tb-settings` not clickable / parent `__harnessParentSettingsOpen=false`.

### Gate (focused harness)

```
npm run test -- --only=H-S32,H-S33,H-S43,H-S44 --runs=1
```

- PASS: H-S32, H-S33, H-S43
- H-S44: **FAIL-REAL-BUG** (Esc does not close parent settings — pre-existing tracked red; unchanged)

### Checks

- `node --check`: clean on both `drawing-tools-manager.js` and both `drawing-toolbar.js`.
- Build-id diff: no changes in `chart/dist-v9/index.html`, `homepage/public/chart/dist-v9/index.html`, `talaria-design/live/index.html`.

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I1 RC-1 | Fix targets iframe quick-bar gear → parent settings route only. |
| I2 RED first | Reproduced missing gear surface; GREEN 10/10; RED on switch OFF. |
| I3 / I13 kill-switch | All touched paths gated; listed above. |
| I5 | Host tile A + single-chart paths unchanged (iframe-only branches). |
| I8 byte-identical engine | SHA256 match both trees (below). |
| I9 gate | Tracked reds unchanged; no scenario assertion edits. |
| L2 production trees | Engine + `TalariaV8bLive.jsx` only; no `multichart/` dev-shell edits. |

## 6. What I did NOT do / limits

- Did not bump build id (Manager coordinates).
- Did not run full 29-scenario harness (focused gate only).
- Live PO retest on `20260713b6` not executed here — handoff below.
- Host-tile A gear manually re-spot-checked via shared switch logic only; no separate 10× host-tile script in this step.
- Esc on panel-B settings after open not re-proven (H-S44 tracked red remains).

## 7. Live-verification handoff

After Manager deploys build with these changes:

1. Hard-reload host + **all** iframe panels (confirm build id on every frame — L1).
2. 2-panel layout (`2v`); panel B iframe.
3. Place + select a trendline on panel B.
4. **Immediately** click engine floating-toolbar gear (`#tb-settings` in iframe) — settings must open in parent and stay open.
5. Esc closes settings + deselects.
6. Optional: set `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true`, reload, repeat — gear inert; double-click settings still works (step 10).

## 8. Status

**DONE (proven)** — fast-loop 10/10 on real click timing gated on `talaria:iframe-toolbar-gear-ready`; switch OFF RED; gate tracked reds unchanged. **NEEDS-LIVE-CONFIRM** on next deployed build id.

---

## SHA256 (engine trees)

| File | SHA256 |
|------|--------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `d9ff73c29b7bf11fbdcb965e4eb64f2529d82400ec4b15d1895bd66dbbe0833c` |
| `homepage/public/chart/modules/drawing-tools-manager.js` | `d9ff73c29b7bf11fbdcb965e4eb64f2529d82400ec4b15d1895bd66dbbe0833c` |
| `chart v 1.4/chart/modules/drawing-toolbar.js` | `7687ba7cceaaa97dbf9eb48bf9711d8d9e4ba6e053ca48e152e58738b4b81feb` |
| `homepage/public/chart/modules/drawing-toolbar.js` | `7687ba7cceaaa97dbf9eb48bf9711d8d9e4ba6e053ca48e152e58738b4b81feb` |
