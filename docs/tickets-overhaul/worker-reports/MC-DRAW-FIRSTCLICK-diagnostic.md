# MC-DRAW-FIRSTCLICK — Multichart armed-tool first-click focus-swallow diagnostic

**Task:** Lane 1 — read-only diagnostic (no product/harness edits)  
**Scoreboard id:** `MC-DRAW-FIRSTCLICK` (`PLAN2-SCOREBOARD.csv`)  
**Symptom (PO):** With a drawing tool armed, clicking an **unfocused** multichart panel consumes click 1 for focus/selection; the stroke starts only on click 2. Expected: first click on panel-under-cursor **focuses and starts draw** in one gesture.  
**Build cited by PO:** `20260717b42`  
**Build traced (static):** same tree as b42 (`chart v 1.4/…` sources; mirrors under `homepage/public/chart/…` per P-invariant)  
**Date:** 2026-07-17  
**Status:** **DIAGNOSTIC-ONLY** — mechanism reported; fix not started

**Explicit confirmation: no files were edited during this diagnostic.**

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | MC-DRAW-FIRSTCLICK — armed-tool first-click focus-swallow (read-only) |
| Goal | Locate where click 1 is swallowed; classify re-migration vs baseline; pre-spec fix + kill-switch + RED harness contract |
| RC | **Tooling/diagnostic — no RC discharged.** Adjacent to **RC-4** (re-migration interaction family) but **distinct from RC-1** (fallback-B substrate / H-S32 first-click lifecycle). This is **Phase 7.2.4 focus-only tool sync** vs **legacy broadcast / panelManager inherit**. |
| Parity checklist | [`MULTICHART-PARITY-CHECKLIST.md`](../MULTICHART-PARITY-CHECKLIST.md) row 1 — *“Single-click select … first click”* (drawing variant: armed tool + unfocused tile) |

---

## 2. What I changed — file by file

N/A — diagnostic only; **no files touched.**

### Files traced (read-only)

| File | Role in failure |
|------|-----------------|
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | V9 tool bridge: **focused-only** `syncDrawingToolAcrossPanels` vs legacy **broadcast** `runCommandIframes` |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `syncDrawingToolAcrossPanels`, `onPanelFocus`, host/cell focus capture, deferred `multichartFocusChanged` |
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | Iframe `panel-focus` postMessage (deferred `setTimeout(0)`) |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Routes `panel-focus` → `onPanelFocus` |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `handleMouseDown`: `!currentTool` → selection/background path; legacy `panelManager` inherit **inactive** in v9 embed |

---

## 3. Kill-switch (I3 + I13) — proposed for fix task

Switch does **not** exist yet.

| Field | Value |
|---|---|
| **Proposed switch** | `window.__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1` |
| **Default (I3)** | **Unset = fix ON** (match repo `__TALARIA_DISABLE_*` convention: set `true` to revert to current 2-click behavior) |
| **Harness flag (proposed)** | `--multichart-armed-draw-focus-forward-off` → sets switch `true` in `serve.mjs` / `react-run.mjs` |

### Files the switch must gate

| File | Gated behavior |
|------|----------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` (+ mirror) | Synchronous **armed-tool inherit + same-gesture draw-start** on embed iframe when parent/host rail shows an armed shape tool and `!this.currentTool` |
| **Optional alternate / complement** | `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` — synchronous pre-arm query before deferring `panel-focus` (harder: cross-boundary sync) |
| **Optional alternate / complement** | `chart v 1.4/talaria-design/src/MultichartGrid.jsx` — `onPanelFocus` / focus side-effects: do **not** rely on async `sendCommand` alone for same pointerdown |

**Switch OFF must restore:** today’s sequence — click 1 focuses tile (parent + iframe state), click 2 starts draw because `setActiveDrawingTool` arrives after first `handleMouseDown`.

**Freeze-safe scope:** drawing focus/tool routing only — **no** order store, persistence, or replay cadence paths.

**Ungatable callout (I13):** If fix touches `TalariaV8bLive.jsx` tool-bridge routing (e.g. re-enabling broadcast for explicit sidebar pick), that JSX path needs the same switch or explicit live-only verification — prefer **iframe-side inherit** to avoid reopening “all panels armed” regression (`MultichartGrid.jsx:5141–5144`).

---

## 4. Proof — mechanism trace (diagnostic RED, no fix GREEN)

No harness row exists yet; proof is **static trace + expected RED** on current builds.

### 4.1 Failure sequence (armed on A, pointerdown on unfocused B)

```mermaid
sequenceDiagram
    participant User
    participant V9 as TalariaV8bLive
    participant Grid as MultichartGrid
    participant Bridge as panel-cmd-bridge (iframe B)
    participant DM as drawingManager (iframe B)

    Note over V9,Grid: Prior state: focus=A, trendline armed on A only
    V9->>Grid: syncDrawingToolAcrossPanels("trendline")
    Grid->>Grid: clearActiveDrawingTool on B (async sendCommand)
    Note over DM: B.currentTool === null

    User->>DM: pointerdown on B canvas (click 1)
    DM->>DM: handleMouseDown: !currentTool → background/select path; return
    Bridge->>Grid: setTimeout(0) postMessage panel-focus B
    Grid->>Grid: focusPanelById(B); deferred multichartFocusChanged
    V9->>Grid: syncDrawingToolAcrossPanels → setActiveDrawingTool on B
    Note over DM: Re-arm arrives AFTER click 1 consumed

    User->>DM: pointerdown on B (click 2)
    DM->>DM: currentTool set → startDrawing()
```

### 4.2 Where click 1 is intercepted

#### A. Parent focus routing (does not forward draw)

**Iframe clicks never hit parent cell capture** — focus is iframe-driven:

```2338:2349:chart v 1.4/talaria-design/src/MultichartGrid.jsx
                // Phase 7.2.4: iframe-side `panel-focus` events bubble up
                // here. Iframe events don't propagate to the parent DOM,
                // so the cell <div>'s onMouseDownCapture never fires for
                // clicks on B/C/D — we rely on the iframe to tell us
                // explicitly via panel-cmd-bridge's focus broadcast.
                onPanelFocus: function (id) {
                    ...
                    focusPanelByIdRef.current(id);
```

Parent **cell** capture only runs for clicks on the cell chrome/wrapper, not iframe document:

```7419:7436:chart v 1.4/talaria-design/src/MultichartGrid.jsx
                        onMouseDownCapture={(ev) => {
                            ...
                            focusPanelById(tile.id);
                            const grid = window.__multichartGrid;
                            if (!grid || typeof grid.clearDrawingUiOnOtherPanels !== "function") return;
                            setTimeout(() => {
```

**Host panel A** has a parallel shim — focus only, peer cleanup deferred; **no draw forward**:

```2990:3016:chart v 1.4/talaria-design/src/MultichartGrid.jsx
            // Shape select runs in drawing-tools-manager document capture (svg + canvas).
            // Here we only focus panel A and defer peer UI cleanup.
            ...
            focusPanelById(HOST_PANEL_ID);
            ...
            setTimeout(() => {
                ...
                if (prev !== HOST_PANEL_ID) {
                    if (typeof grid.clearDrawingUiOnOtherPanels === "function") {
                        grid.clearDrawingUiOnOtherPanels(HOST_PANEL_ID);
```

#### B. Iframe `panel-focus` — intentionally deferred (not the primary swallow)

`panel-cmd-bridge.js` defers parent notification so parent sync does not race **the same** pointerdown — but that fix assumes the iframe **already has** `currentTool` set:

```3974:3996:chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js
    // Defer postMessage to the NEXT task (setTimeout(0)), not the capture
    // phase of the same event: the parent's multichartFocusChanged handler
    // runs syncDrawingToolAcrossPanels, which can clear/re-arm tools while
    // this iframe's drawingManager is still handling the SAME pointerdown —
    // the first click would then miss starting a stroke. Letting the
    // current event finish first fixes "pick tool → first click doesn't draw".
        setTimeout(function () {
            ...
                global.parent.postMessage({
                    type:   'panel-focus',
                    source: panelId,
                }, '*');
```

**Diagnosis:** deferral solves *parent sync racing an already-armed iframe*; it does **not** solve *iframe disarmed before mousedown* (this ticket).

#### C. Drawing-tool path — primary swallow (`!currentTool`)

After tool sync, **non-focused iframes are cleared**:

```5141:5144:chart v 1.4/talaria-design/src/MultichartGrid.jsx
        // drawing-tool path moved to syncDrawingToolAcrossPanels so we do
        // NOT keep every iframe armed at once (that made clicks on any
        // panel start a stroke even after "switching" focus).
```

```5704:5751:chart v 1.4/talaria-design/src/MultichartGrid.jsx
        function syncDrawingToolAcrossPanels(legacyTool) {
            ...
            const clears = ids.filter((id) => id !== focus).map(runClear);
            return Promise.all(clears).then(() => {
                ...
                return mgr.sendCommand(focus, "setActiveDrawingTool", { tool: lt }).catch(() => {});
            });
        }
```

On pointerdown, iframe B’s `handleMouseDown` hits the **no-tool** branch and returns without `startDrawing`:

```3909:3933:chart v 1.4/chart/modules/drawing-tools-manager.js
        // First-click draw in multi-panel mode:
        // if this panel has no active tool yet, adopt the currently active tool
        // from main/selected chart and continue this same click as draw-start.
        if (!this.currentTool && window.panelManager && window.panelManager.currentLayout !== '1') {
            ...
            if (inheritedTool && typeof this.setTool === 'function') {
                this.setTool(inheritedTool, true);
            }
        }
```

**This inherit block does not run in v9 multichart embed** — there is no `window.panelManager` on the iframe grid path. Empty-canvas click 1 therefore ends here:

```4597:4603:chart v 1.4/chart/modules/drawing-tools-manager.js
            } else {
                // Clicked on empty space - deselect on mousedown (one click; do not wait for click after pan)
                this._tryDeselectOnBackgroundPointer(event, mouseX, mouseY);
                // Ensure SVG is transparent so canvas can receive panning events
                this.svg.style('pointer-events', 'none');
            }
            return;
```

Draw would start only when `currentTool` is set — **click 2**, after async `setActiveDrawingTool`:

```4614:4616:chart v 1.4/chart/modules/drawing-tools-manager.js
        if (!this.drawingState.isDrawing) {
            this.drawingState.startDrawing(this.currentTool, toolInfo.points);
```

#### D. V9 tool bridge — arms focused panel only (re-migration)

Phase 7.2.4 routes **explicit sidebar pick** and **focus change** through focused-only sync, not broadcast:

```19689:19708:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
      // Phase 7.2.4 — multichart routing (two modes):
      //   • Toolbar / chartDataLoaded / panelSelected: BROADCAST the tool to
      //     every iframe (runCommandIframes) so the user can pick a tool and
      //     mousedown on a tile that is not focused yet — the stroke still
      //     starts (TradingView behaviour).
      //   • multichartFocusChanged: syncDrawingToolAcrossPanels — arm ONLY the
      //     focused chart for most tools; brush + highlighter arm every panel
      ...
      const useFocusedPanelToolSync = focusOnlyMultichartToolTick || explicitSidebarPick;
      if (grid && typeof grid.syncDrawingToolAcrossPanels === "function" && useFocusedPanelToolSync) {
```

Focus change listener sets the tick flag then `apply()` → sync:

```19840:19852:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
    const onMultichartFocusChanged = () => {
      ...
        if (typeof window !== "undefined") window.__v9MultichartFocusToolTick = true;
        apply();
      } finally {
        if (typeof window !== "undefined") window.__v9MultichartFocusToolTick = false;
```

Parent focus side-effects are **also deferred** one tick before `multichartFocusChanged`:

```4157:4175:chart v 1.4/talaria-design/src/MultichartGrid.jsx
    useEffect(() => {
        if (!focusedPanelId) return;
        // Defer one tick: when the user just clicked an iframe, the
        // panel-focus message arrives in the same task as the iframe's
        // chart event handler...
        const t = setTimeout(function runFocusPanelSideEffects() {
            ...
            dispatchFocusChanged(focusedPanelId, { force: true });
```

**Net:** three stacked async layers (iframe bridge 0ms → React focus effect 0ms → `sendCommand` round-trip) all arrive **after** click-1 `handleMouseDown` on a disarmed iframe.

### 4.3 Re-migration regression vs long-standing / b16 baseline

| Question | Finding |
|----------|---------|
| **New b42 regression?** | **No** — mechanism is **Phase 7.2.4 architectural** (focused-only `syncDrawingToolAcrossPanels`, explicit sidebar pick included). PO symptom on b42 matches scoreboard suspicion; not introduced by H-R09 / b42-only churn. |
| **Same on blessed b16?** | **Expected yes** — same Phase 7.2.4 stack shipped in b16 re-migration closure (`PLAN2-SCOREBOARD.csv` RC-4 / H-R* rows). No code path on b16 restores broadcast-arm for sidebar pick while another tile is focused. |
| **RC-1 / H-S32?** | **Different family.** RC-1 = fallback-B substrate + placement `toolSelected` chain. **MC-DRAW-FIRSTCLICK** = cross-panel **armed state** not present on iframe at mousedown. H-S45 proves draw-on-**focused** B works; it does **not** cover armed-on-A → click-unfocused-B. |
| **panel-cmd-bridge partial fix?** | Comments describe fixing “pick tool → first click doesn’t draw” when sync **raced** same pointerdown on an **already-armed** panel — orthogonal to **disarmed peer iframe**. |

**Classification:** **Re-migration focus-gating swallow** (intentional disarm of non-focused tiles + missing v9 embed inherit), **not** a revert of b16 bless — **latent / PO-visible gap** since Phase 7.2.4.

### 4.4 Proposed fix direction (spec only)

**Recommended:** When V9/parent shows an armed **non-crosshair** shape tool and pointerdown lands on an **embed iframe** with `!currentTool`:

1. **Synchronously** resolve armed tool from parent (`window.parent.__multichartGrid` + host `drawingManager`, or parent rail state), `setTool(..., true)` on **this** iframe, then fall through to existing draw-start (`startDrawing`) in the **same** `handleMouseDown` — mirror intent of legacy `panelManager` block at `3909–3933` for v9 embed.
2. **In parallel** (unchanged): deferred `panel-focus` + `syncDrawingToolAcrossPanels` for chrome/topbar ownership.

**Alternatives (lower preference):**

- Re-enable `runCommandIframes` for `v9UserExplicitToolRef` sidebar picks — **reopens** stale-arm-on-all-tiles bug (`5141–5144`).
- Parent synchronous `sendCommandNoReply` from `onPanelFocus` before iframe handler runs — **cannot** beat same-task iframe mousedown without bridge capture-phase hook.

Gate entire behavior behind **`__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1`**.

**Brush / highlighter:** already armed on all panels via `syncDrawingToolAcrossPanels` (`5739–5740`) — this ticket primarily affects **shape tools** (trendline, rectangle, etc.).

---

## 5. RED harness scenario (proposed — not registered)

### Identity

| Field | Value |
|-------|-------|
| **Id** | `MC-DRAW-FIRSTCLICK` (or `H-S54` class — coordinate with Lane 4 registry) |
| **Title** | `multichart-armed-draw-firstclick: unfocused panel starts draw on click 1` |
| **Ticket hook** | Parity checklist row 1; scoreboard `MC-DRAW-FIRSTCLICK` |

### Setup

| Step | Detail |
|------|--------|
| Layout | `mcLayout=2v`, **dist-v9**, `REACT_PARITY_ISOLATE_SESSION=1` |
| Boot | `waitBootSettled(['A','B'])` |
| Focus | `focusPanelByClick(page, 'A')` — **A focused** |
| Arm (honest path) | Parent evaluate: call `window.__multichartGrid.syncDrawingToolAcrossPanels('rectangle')` **after** host `drawingManager.setTool('rectangle')` **or** real V9 rail click on Rectangle — **not** `armDrawTool(page, 'B', …)` (that bypasses sync and would false-green) |
| Precondition assert | `readInteractiveState(page, 'A').currentTool === 'rectangle'` **and** `readInteractiveState(page, 'B').currentTool === null` |

### Actuation (I15 — real mouse)

Single gesture on **unfocused B** empty canvas:

```javascript
// Pseudocode — use chartCanvasPagePoint + page.mouse.down/move/up
const p1 = await chartCanvasPagePoint(page, 'B', 0.35, 0.40);
const p2 = await chartCanvasPagePoint(page, 'B', 0.55, 0.60);
await page.mouse.move(p1.x, p1.y);
await page.mouse.down({ button: 'left' });
await page.mouse.move(p2.x, p2.y, { steps: 8 });
await page.mouse.up({ button: 'left' });
```

**Do not** call `focusPanelByClick('B')` before actuation — that would false-green by focusing first.

### Assertions (real end-state)

| Check | PASS (fix ON) | FAIL (baseline / switch OFF) |
|-------|---------------|------------------------------|
| **CORE click-1 draw** | After first down (before up): iframe B `drawingState.isDrawing === true` **OR** after full gesture `readInteractiveState('B').drawingCount >= 1` | B focused (`getFocusedPanelId() === 'B'`) but `drawingCount === 0` and `isDrawing === false` after click 1; draw only after repeat |
| **Host isolation** | `readInteractiveState('A').drawingCount === 0` | — |
| **Focus follows click** | `getFocusedPanelId() === 'B'` after gesture | May pass on both — **not sufficient alone** |

Extend `readInteractiveState` (implementation task) with `isDrawing: !!(dm.drawingState && dm.drawingState.isDrawing)`.

### Switch-OFF discriminator (D-023)

| Leg | Command / env | Expected |
|-----|---------------|----------|
| **A — fix ON (default)** | `node run.mjs --only=MC-DRAW-FIRSTCLICK --runs=10` | **10/10 PASS** |
| **B — fix OFF** | same + `--multichart-armed-draw-focus-forward-off` | **≥8/10 FAIL** (2-click behavior) |
| **C — vacuous guard** | OFF on pre-fix build without forward code | Document as vacuous RED only if switch is no-op |

Register in `known-failing.json` as **expected FAIL** until fix lands (RED-first).

### Harness helpers (existing)

| Helper | Path | Use |
|--------|------|-----|
| `focusPanelByClick` | `interactive-helpers.mjs:414` | Setup focus on A only |
| `armDrawTool` | `interactive-helpers.mjs:450` | Host arm only (+ trigger sync) |
| `chartCanvasPagePoint` | `interactive-helpers.mjs:429` | Real coordinates |
| `readInteractiveState` | `interactive-helpers.mjs:17` | `currentTool`, `drawingCount` |
| `readHarnessFocusedPanelId` / grid `getFocusedPanelId` | `interactive-helpers.mjs:902`, `react-parity-lib.mjs:411` | Focus assert |

**Contrast:** **H-S45** (`scenarios.mjs:5535`) focuses B **then** draws on B — proves focused-target routing, **not** unfocused first-click.

---

## 6. Invariants checked

| Invariant | Finding |
|-----------|---------|
| I3 / I13 | Proposed switch + file list documented; no implementation |
| I15 | RED spec requires **real mouse** on iframe canvas + **store/isDrawing** end-state — not toolbar-visible proxy |
| I4 | Fix should be **one embed inherit path**, not per-tool patches |
| P-invariant | Trace cites `chart v 1.4/…`; implement on both mirrors when authorized |
| Read-only scope | No product/harness edits |

---

## 7. Live-verification handoff (PO)

**Build:** `20260717b42` or later with fix + forward switch default ON.

1. Open multichart **2-up** (dist-v9 / production path PO uses).
2. Focus **panel A** (click A once).
3. Arm **Trend Line** or **Rectangle** from V9 left rail (confirm rail shows tool active on A).
4. **Without** clicking B first, click-drag on **empty canvas of panel B** to place a shape.
5. **PASS:** shape anchor appears on **first** click-drag; B becomes focused. **FAIL (today):** B focuses/highlights but no shape until second click-drag.

**Switch A/B:** In dev console on host: `window.__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1 = true` → reload → expect 2-click behavior returns.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

| Item | State |
|------|-------|
| Root mechanism | **Identified** — disarmed iframe + `!currentTool` swallow; focus routing async and non-forwarding |
| Regression class | **Phase 7.2.4 re-migration focus-gating** — expected on b16 and b42, not b42-only |
| Fix pre-spec | **Embed synchronous armed-tool inherit + same-gesture draw-start**, kill-switched |
| RED harness | **Specified** — `MC-DRAW-FIRSTCLICK` with switch-OFF discriminator |
| Implementation | **Not authorized in this task** |

**Next authorized step (Lane 1 impl):** implement gated inherit in `drawing-tools-manager.js`, register harness row, proof **10/10 ON + switch-OFF RED** on isolated session.
