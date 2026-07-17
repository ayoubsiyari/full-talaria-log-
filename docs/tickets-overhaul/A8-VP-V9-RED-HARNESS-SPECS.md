# A8-VP — RED-first harness scenario specs (Lane 4 wire-up)

**Authority:** D-023 (named switch-OFF RED per fix from birth) + I15 (real pointer actuation, honest end-state).  
**Purpose:** Full scenario definitions for **H-A8-VP-1** and **H-A8-VP-2** so Lane 4 can register rows in **`react-parity-scenarios.mjs`** before or with PR-VP-1 / PR-VP-2 lands.  
**Scope:** **Docs only** — no `react-parity-scenarios.mjs`, `react-parity-lib.mjs`, or product edits in this deliverable.

**Parent spec:** [`A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md`](A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md)  
**Sibling template:** [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) (A8-1…4 host harness — **different runner**)

**Prerequisite engine legs (must be ON on test build):** R4a `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX`, R4b `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` (LANDED b15). These scenarios test the **V9 `avStyle` bridge gap**, not engine geometry.

---

## 0. Harness surface + global wiring

| Property | Value |
|----------|--------|
| **Runner** | `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` |
| **Scenario file** | `react-parity-scenarios.mjs` (**built React dist-v9** — not `run.mjs` / host-only) |
| **Boot** | `runWithReact(ctx, body)` → `builtReactParityUrl` (`mcLayout=2v`, `mode=backtest`) |
| **Mouse / keyboard** | **Puppeteer `page.mouse` + `page.keyboard`** on **parent page** (V9 settings) and **iframe** (canvas anchor drag). No synthetic `MouseEvent` dispatch. |
| **Panel under test** | **Host panel A** (`panelId: 'A'`) — V9 settings render on parent; anchored VP placed in host iframe. |

**Why React parity (not host `run.mjs`):** Production path for anchored VP labels/coordinates is **`TalariaV8bLive.jsx`** floating settings (`avSettOpen`), not legacy `drawing-tools-ui.js` modal. Host harness cannot reach V9 Style/Coordinates tabs.

### 0.1 Pre-boot kill-switch injection

Fixes default **ON** (`unset`). Discriminator via new CLI flags on **`react-run.mjs`** (Lane 4 implements — mirror `--panelb-settings-transport-off` pattern):

| CLI flag | Pre-boot assignment | Tranche |
|----------|---------------------|---------|
| `--vp-v9-av-label-bridge-off` | `window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX = true` | A8-VP-1 |
| `--vp-v9-av-coord-reposition-off` | `window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX = true` | A8-VP-2 |

**Implementation sketch (`react-run.mjs` `parseArgs` + boot `evaluateOnNewDocument`):**

```javascript
// parseArgs
else if (a === '--vp-v9-av-label-bridge-off') args.vpV9AvLabelBridgeOff = true;
else if (a === '--vp-v9-av-coord-reposition-off') args.vpV9AvCoordRepositionOff = true;

// evaluateOnNewDocument (before navigation)
if (ctx.vpV9AvLabelBridgeOff) {
  window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX = true;
}
if (ctx.vpV9AvCoordRepositionOff) {
  window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX = true;
}
```

**Env aliases (optional):** `REACT_PARITY_VP_V9_AV_LABEL_BRIDGE_OFF=1`, `REACT_PARITY_VP_V9_AV_COORD_REPOSITION_OFF=1`.

| Leg | Flags | Expect |
|-----|-------|--------|
| Default (fix ON) | none | **GREEN** after PR-VP-* lands |
| Pre-fix capture | none on build **without** A8-VP-* | **RED** ≥8/10 |
| Switch-OFF discriminator | matching `--*-off` on **post-fix** build | **RED** 10/10 |

### 0.2 Registration table

| Scenario ID | Tranche | Ticket | Topology |
|-------------|---------|--------|----------|
| `H-A8-VP-1` | A8-VP-1 av label bridge | TAL-01662 (anchored) | **Built dist-v9**, `mcLayout=2v`, **host panel A** |
| `H-A8-VP-2` | A8-VP-2 av coord reposition | TAL-01664 | Same |

**Optional companion (Lane 4 — not bless-blocking):** `H-A8-VP-1-CTRL` — fixed-range VP label toggle on same build (regression fence); reuse `vpc-priceLabels` / `vpc-timeLabels` selectors (~`TalariaV8bLive.jsx:30854–30855`).

### 0.3 Shared imports (Lane 4)

Add to `react-parity-scenarios.mjs`:

```javascript
import {
  runWithReact,
  makeChecks,
  placeTool,
  disarmDrawTool,
  singleClickDrawing,
  doubleClickDrawing,
  waitForReactSelection,
  waitForPanelSettle,
  waitForParentV9ChromeDomReady,
  focusReactPanelSoft,
  chartTarget,
  sleep,
  // NEW (§6):
  defaultVolumeAnchorPoints,
  waitForAvVolumeProfileSettingsOpen,
  clickAvSettingsTab,
  clickAvLabelCheckbox,
  readAvVpLabelBridgeProbe,
  readAvVpCoordTabFields,
  readAvVpAnchorGeometryProbe,
  editAvCoordFieldViaSpinner,
  resolveAnchoredVpAnchorHandlePagePoint,
  dragPointerPath,
} from './react-parity-lib.mjs';
```

(`defaultVolumeAnchorPoints` may be **moved** from `scenarios.mjs:5203–5225` into `react-parity-lib.mjs` when implementing — do not duplicate logic divergently.)

### 0.4 Invalid actuation (all rows — I15)

| Forbidden as **primary** CORE path | Why |
|-----------------------------------|-----|
| `d.style.showPriceLabel = false` in evaluate **as the toggle under test** | Bypasses V9 `avStyle` bridge |
| `d.points[0].x = …` in evaluate **as coord edit under test** | Bypasses Coordinates tab + `v9ApplyAnchorPointsFromAvStyle` |
| Calling `window.__v9OpenDrawingSettings(drawing)` without prior dbl-click | Skips real open gesture (OK for **debug only**) |
| Asserting only `avStyle.priceLabels` React state via devtools | Not production-faithful; engine + DOM required |
| Opening legacy `.tv-settings-modal` | Not V9 production path for VP |
| Skipping real pointer on label checkboxes / coord spinners | I15 violation |

**Allowed in setup:** `placeTool(page, 'A', 'anchored-volume-profile', pts)` — same as H-S42 / existing VP rows.

---

## 1. H-A8-VP-1 — Anchored VP V9 Price/Time label bridge

### 1.1 Symptom / discriminator

**User-visible failure:** Anchored Volume Profile V9 settings show (or will show) Price/Time label toggles, but toggling them does **not** change axis highlight bands on the chart; engine `drawing.style.showPriceLabel` / `showTimeLabel` do not follow UI (TAL-01662 anchored path).

**Switch:** `window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX` (unset = fix ON).

**V9 bridge contract (product):** `avStyle.priceLabels` / `timeLabels` → `d.style.showPriceLabel` / `showTimeLabel` + **`v9SyncDrawingAxisHighlights(d)`** (`TalariaV8bLive.jsx:23387–23432` gap vs fixed-range `applyVpStyleBridgeFromSnapshot:23291–23333`).

### 1.2 Topology

| Param | Value |
|-------|--------|
| Runner | `react-run.mjs` |
| URL | `builtReactParityUrl` — `dist-v9/index.html?mode=backtest&mcLayout=2v` |
| Panel | **A (host)** only for CORE |
| TF | `1m` (default boot) |
| Replay | OFF |
| Engine R4a/R4b | **ON** (unset) — required so highlights *can* appear when style flags flip |

**Why host-only (not panel B):** Discriminator is V9 `avStyle` bridge, not iframe settings transport (D-026). Panel B adds flake without strengthening the mechanism proof. Optional hardening row later: duplicate on B after VP-1 GREEN on A.

### 1.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `runWithReact` boot; `waitForPanelSettle(page, 'A')` |
| 2 | `const pts = await defaultVolumeAnchorPoints(page, 1)` |
| 3 | `const placed = await placeTool(page, 'A', 'anchored-volume-profile', pts)` |
| 4 | `await disarmDrawTool(page, 'A')` |
| 5 | `await singleClickDrawing(page, 'A', placed.id)` — **real click** selects drawing |
| 6 | `await waitForReactSelection(page, 'A', [placed.id])` |
| 7 | `await waitForParentV9ChromeDomReady(page, 'A', placed.id, 4000)` |
| 8 | `await doubleClickDrawing(page, 'A', placed.id)` — **real dbl-click** opens settings |
| 9 | `const open = await waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored', timeoutMs: 6000 })` |
| 10 | Setup assert: `open.ok && open.hasLabelsRow` (post A8-VP-1); pre-fix may fail here → **honest RED** |
| 11 | Ensure **Style** tab active (`clickAvSettingsTab(page, 'style')` if needed) |
| 12 | Snapshot `before = await readAvVpLabelBridgeProbe(page, 'A', placed.id)` |

### 1.4 CORE actuation (I15 — real label toggle clicks)

Execute **in order** on the **parent** V9 settings surface (not iframe):

| Step | Mechanism | Notes |
|------|-----------|-------|
| **A** | `await clickAvLabelCheckbox(page, 'price')` | Real `page.mouse.click` on Price checkbox hit target (`avc-priceLabels` — **Lane 5 impl id**; mirror `vpc-priceLabels` at `30854`) |
| **A′** | `await sleep(150)` | Allow `useLayoutEffect` av bridge + `v9SyncDrawingAxisHighlights` |
| **A″** | `probeA = await readAvVpLabelBridgeProbe(page, 'A', placed.id)` | |
| **B** | `await clickAvLabelCheckbox(page, 'price')` | Toggle **back ON** |
| **B′** | `await sleep(150)` | |
| **B″** | `probeB = await readAvVpLabelBridgeProbe(...)` | |
| **C** | `await clickAvLabelCheckbox(page, 'time')` | Toggle Time **OFF** |
| **C′** | `await sleep(150)` | |
| **C″** | `probeC = await readAvVpLabelBridgeProbe(...)` | |
| **D** | `await clickAvLabelCheckbox(page, 'time')` | Toggle Time **back ON** |
| **D′** | `await sleep(150)` | |
| **D″** | `probeD = await readAvVpLabelBridgeProbe(...)` | |

**Invalid:** setting flags in iframe evaluate between clicks; clicking outside Labels row expecting side effects.

### 1.5 End-state probe (honest)

`readAvVpLabelBridgeProbe(page, panelId, drawId)` — **merge** parent + iframe evaluates:

**Iframe (engine truth):**

```javascript
(frame, drawId) => frame.evaluate((id) => {
  const ch = window.chart;
  const dm = ch && ch.drawingManager;
  const d = dm && (dm.drawings || []).find((x) => x && String(x.id) === String(id));
  if (!d || !d.style) return { ok: false, reason: 'drawing missing' };
  const svg = ch && ch.svg;
  let highlightNodes = 0;
  if (svg && typeof svg.selectAll === 'function') {
    highlightNodes = svg.selectAll(`.axis-highlight-group[data-drawing-id="${id}"]`).nodes().length;
  }
  const priceLabelEls = svg && typeof svg.selectAll === 'function'
    ? svg.selectAll('.axis-highlight-price, .axis-highlight-price-text').nodes().length
    : 0;
  const timeLabelEls = svg && typeof svg.selectAll === 'function'
    ? svg.selectAll('.axis-highlight-time, .axis-highlight-time-text, .axis-highlight-time-start, .axis-highlight-time-end').nodes().length
    : 0;
  return {
    ok: true,
    type: d.type,
    selected: !!d.selected,
    showPriceLabel: d.style.showPriceLabel !== false,
    showTimeLabel: d.style.showTimeLabel !== false,
    highlightGroupCount: highlightNodes,
    priceAxisLabelCount: priceLabelEls,
    timeAxisLabelCount: timeLabelEls,
    highlightsVisible: highlightNodes > 0 && (priceLabelEls > 0 || timeLabelEls > 0),
  };
}, drawId);
```

**Parent (UI truth — post A8-VP-1):**

```javascript
() => {
  const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
    .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
  if (!panel) return { panelOpen: false };
  const text = panel.innerText || '';
  const hasLabelsRow = /\bLabels\b/i.test(text) && /\bPrice\b/i.test(text) && /\bTime\b/i.test(text);
  return { panelOpen: true, hasLabelsRow, snippet: text.slice(0, 200) };
}
```

| Assertion | GREEN (fix ON) | RED (pre-fix or `--vp-v9-av-label-bridge-off`) |
|-----------|----------------|--------------------------------------------------|
| Setup: panel open | `open.ok` | `!open.ok` |
| Setup: Labels row (post VP-1 land) | `hasLabelsRow === true` | `hasLabelsRow === false` **OR** toggles ineffective |
| **CORE-1** Price OFF | After step A: `showPriceLabel === false` | `showPriceLabel !== false` after OFF click |
| **CORE-2** Price ON | After step B: `showPriceLabel === true` && `highlightsVisible === true` | `highlightsVisible === false` while selected |
| **CORE-3** Time OFF | After step C: `showTimeLabel === false` | `showTimeLabel !== false` |
| **CORE-4** Time ON | After step D: `showTimeLabel === true` && `highlightsVisible === true` | highlights stay absent |

**Non-vacuous RED (pre-fix build, default flags):** ≥8/10 runs fail **CORE-1 or CORE-2** because Labels row missing **or** Price OFF click does not clear `showPriceLabel` / highlights.

**Switch-OFF on post-fix build:** Steps A–D execute (UI present) but **CORE-1..4** fail — engine flags stuck / highlights unchanged.

### 1.6 Switch-OFF discriminator (D-023)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-1 --runs=10
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-1 --runs=10 --vp-v9-av-label-bridge-off
```

| Leg | Expect |
|-----|--------|
| Default | **10/10 PASS** (post PR-VP-1) |
| `--vp-v9-av-label-bridge-off` | **10/10 RED** (non-vacuous) |

**Post land:** run **D-026** H-R04/H-R05 ×10 if not already on same build (`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md` §6.3).

### 1.7 `react-parity-scenarios.mjs` skeleton

```javascript
async function hA8Vp1(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const panelId = 'A';

    const pts = await defaultVolumeAnchorPoints(page, 1);
    const placed = await placeTool(page, panelId, 'anchored-volume-profile', pts);
    checks.check('H-A8-VP-1 setup: anchored VP placed', placed && placed.id, placed ? placed.id : 'null');
    if (!placed?.id) return checks;

    await disarmDrawTool(page, panelId);
    await singleClickDrawing(page, panelId, placed.id);
    await waitForReactSelection(page, panelId, [placed.id]);
    await waitForParentV9ChromeDomReady(page, panelId, placed.id, 4000);
    const dbl = await doubleClickDrawing(page, panelId, placed.id);
    checks.check('H-A8-VP-1 probe: dbl-click dispatched', dbl && dbl.ok, dbl?.reason || '');

    const open = await waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored', timeoutMs: 6000 });
    checks.check('H-A8-VP-1 setup: AV settings open', open.ok, JSON.stringify(open));
    checks.check('H-A8-VP-1 setup: Labels row present', open.hasLabelsRow, open.snippet || '');

    await clickAvSettingsTab(page, 'style');

    await clickAvLabelCheckbox(page, 'price');
    await sleep(150);
    let probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Price OFF → engine showPriceLabel false',
      probe.ok && probe.showPriceLabel === false,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'price');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Price ON → highlights visible',
      probe.ok && probe.showPriceLabel === true && probe.highlightsVisible === true,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'time');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Time OFF → engine showTimeLabel false',
      probe.ok && probe.showTimeLabel === false,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'time');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Time ON → highlights visible',
      probe.ok && probe.showTimeLabel === true && probe.highlightsVisible === true,
      JSON.stringify(probe));

    return checks;
  });
}
```

Register: `{ id: 'H-A8-VP-1', title: 'A8-VP-1: anchored VP V9 label bridge (Price/Time toggles → engine + axis highlights)', run: hA8Vp1 }`.

---

## 2. H-A8-VP-2 — Anchored VP Coordinates tab + canvas anchor sync

### 2.1 Symptom / discriminator

**User-visible failure:** Coordinates tab edits (`anchorPrice`, `anchorBar`) do not move the profile anchor; dragging the anchor on canvas does not update open Coordinates fields (TAL-01664).

**Switch:** `window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX` (unset = fix ON).

**V9 events / helpers (product):**

| Direction | Mechanism | File:lines |
|-----------|-----------|------------|
| Tab → canvas | `v9ApplyAnchorPointsFromAvStyle` via `avCoordBridge` | `TalariaV8bLive.jsx:23444–23464` |
| Canvas → tab | `v9DrawingGeometryLive` → patch `avStyle` | emitter `drawing-tools-manager.js:3589–3595`; listener gap `20412–20427`, `20348–20363` |

### 2.2 Topology

Same as §1.2 (built dist-v9, host panel A, R4a ON).

**Settings must stay open** across both legs — do not press Esc between tab edit and canvas drag.

### 2.3 Setup

| Step | Mechanism |
|------|-----------|
| 1–6 | Same as H-A8-VP-1 through `placed` + select |
| 7 | Dbl-click → `waitForAvVolumeProfileSettingsOpen` |
| 8 | `await clickAvSettingsTab(page, 'coordinates')` — **real click** tab button (text **Coordinates**, `avSettTab`; button uses `setAvSettTab('coordinates')` ~`31080–31092`) |
| 9 | `const fields0 = await readAvVpCoordTabFields(page)` |
| 10 | `const geo0 = await readAvVpAnchorGeometryProbe(page, 'A', placed.id)` |
| 11 | Setup asserts: `fields0.ok`, `geo0.ok`, `Math.abs(parseFloat(fields0.anchorBar) - geo0.barIndex) < 0.05` (initial sync) |

### 2.4 CORE actuation A — Coordinates tab → canvas (I15)

| Step | Mechanism |
|------|-----------|
| 1 | `const barBefore = geo0.barIndex` |
| 2 | `await editAvCoordFieldViaSpinner(page, 'anchorBar', +10)` — **real click** on ▲ spinner beside Bar input (~`31220–31228`), not evaluate |
| 3 | `await sleep(200)` — allow `avCoordBridge` + render |
| 4 | `geo1 = await readAvVpAnchorGeometryProbe(page, 'A', placed.id)` |
| 5 | `fields1 = await readAvVpCoordTabFields(page)` |
| 6 | Optional price leg: `editAvCoordFieldViaSpinner(page, 'anchorPrice', +1 tick)` using price ▲ (uses `_pxStep` parity ~`31206–31207`) |

**Invalid:** `d.points[0].x += 10` in iframe evaluate as CORE.

### 2.5 CORE actuation B — Canvas anchor drag → Coordinates tab (I15)

| Step | Mechanism |
|------|-----------|
| 1 | Keep settings open on **Coordinates** tab |
| 2 | `const handle = await resolveAnchoredVpAnchorHandlePagePoint(page, 'A', placed.id)` |
| 3 | `await page.mouse.move(handle.x, handle.y); down()` |
| 4 | `await dragPointerPath(page, handle.x, handle.y, handle.x - 70, handle.y + 18, { steps: 12 })` — diagonal drag ≥60px |
| 5 | Sample mid-drag optional: `readAvVpCoordTabFields` may update live via `v9DrawingGeometryLive` |
| 6 | `await page.mouse.up()` |
| 7 | `await sleep(250)` |
| 8 | `geo2 = await readAvVpAnchorGeometryProbe(...)` |
| 9 | `fields2 = await readAvVpCoordTabFields(page)` |

**Invalid:** `_notifyV9DrawingGeometryLive` direct call; moving points without `page.mouse`.

### 2.6 End-state probe (honest)

**`readAvVpAnchorGeometryProbe(page, panelId, drawId)`** (iframe):

```javascript
(frame, drawId) => frame.evaluate((id) => {
  const ch = window.chart;
  const d = ch?.drawingManager?.drawings?.find((x) => String(x.id) === String(id));
  if (!d || !d.points?.[0]) return { ok: false, reason: 'no anchor point' };
  const p = d.points[0];
  const dec = typeof ch.priceDecimals === 'number' ? ch.priceDecimals : 5;
  return {
    ok: true,
    barIndex: Number(p.x),
    price: Number(p.y),
    priceFormatted: Number(p.y).toFixed(dec),
    type: d.type,
  };
}, drawId);
```

**`readAvVpCoordTabFields(page)`** (parent — open AV settings, Coordinates tab):

```javascript
() => {
  const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
    .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
  if (!panel) return { ok: false, reason: 'panel closed' };
  if (!/\bCoordinates\b/i.test(panel.innerText)) return { ok: false, reason: 'not on coordinates tab' };
  const inputs = panel.querySelectorAll('input.tlr-nospinner[type="number"]');
  // Order in JSX: Price row then Bar row (~31240–31246)
  const anchorPrice = inputs[0]?.value ?? '';
  const anchorBar = inputs[1]?.value ?? '';
  return { ok: true, anchorPrice, anchorBar, inputCount: inputs.length };
};
```

| Assertion | GREEN (fix ON) | RED (pre-fix or `--vp-v9-av-coord-reposition-off`) |
|-----------|----------------|------------------------------------------------------|
| **CORE-A** Tab → canvas | `\|geo1.barIndex - barBefore - 10\| ≤ 0.05` | `\|Δbar\| < 0.5` after spinner |
| **CORE-A′** Tab field match | `\|parseFloat(fields1.anchorBar) - geo1.barIndex\| ≤ 0.05` | fields stale vs geo |
| **CORE-B** Canvas → tab | `\|geo2.barIndex - geo1.barIndex\| ≥ 0.5` OR `\|geo2.price - geo1.price\| ≥ tick` | anchor unmoved |
| **CORE-B′** Live tab sync | `\|parseFloat(fields2.anchorBar) - geo2.barIndex\| ≤ 0.05` && price within 1 tick | `fields2` still equals `fields1` while geo moved |

**Non-vacuous pre-fix RED:** ≥8/10 fail **CORE-A** or **CORE-B′** (bidirectional break is the documented gap).

### 2.7 Switch-OFF discriminator (D-023)

```bash
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-2 --runs=10
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-2 --runs=10 --vp-v9-av-coord-reposition-off
```

### 2.8 `react-parity-scenarios.mjs` skeleton

```javascript
async function hA8Vp2(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const panelId = 'A';

    const placed = await placeTool(page, panelId, 'anchored-volume-profile',
      await defaultVolumeAnchorPoints(page, 1));
    checks.check('H-A8-VP-2 setup: placed', placed?.id, placed?.id || 'null');
    if (!placed?.id) return checks;

    await disarmDrawTool(page, panelId);
    await singleClickDrawing(page, panelId, placed.id);
    await waitForReactSelection(page, panelId, [placed.id]);
    await doubleClickDrawing(page, panelId, placed.id);
    const open = await waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored', timeoutMs: 6000 });
    checks.check('H-A8-VP-2 setup: settings open', open.ok, JSON.stringify(open));

    await clickAvSettingsTab(page, 'coordinates');
    const fields0 = await readAvVpCoordTabFields(page);
    const geo0 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-2 setup: coord fields readable', fields0.ok, JSON.stringify(fields0));
    checks.check('H-A8-VP-2 setup: initial tab/geo bar match',
      fields0.ok && geo0.ok && Math.abs(parseFloat(fields0.anchorBar) - geo0.barIndex) < 0.05,
      `tab=${fields0.anchorBar} geo=${geo0.barIndex}`);

    const barBefore = geo0.barIndex;
    await editAvCoordFieldViaSpinner(page, 'anchorBar', +10);
    await sleep(200);
    const geo1 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    const fields1 = await readAvVpCoordTabFields(page);
    const dBar = geo1.barIndex - barBefore;
    checks.check('H-A8-VP-2 CORE-A: coord tab Bar +10 moves anchor',
      geo1.ok && Math.abs(dBar - 10) <= 0.05,
      `dBar=${dBar} geo1=${JSON.stringify(geo1)}`);
    checks.check('H-A8-VP-2 CORE-A′: tab Bar field matches geometry',
      fields1.ok && Math.abs(parseFloat(fields1.anchorBar) - geo1.barIndex) <= 0.05,
      JSON.stringify({ fields1, geo1 }));

    const handle = await resolveAnchoredVpAnchorHandlePagePoint(page, panelId, placed.id);
    checks.check('H-A8-VP-2 setup: anchor handle resolved', handle?.ok, JSON.stringify(handle || null));
    if (handle?.ok) {
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await dragPointerPath(page, handle.x, handle.y, handle.x - 70, handle.y + 18, { steps: 12 });
      await page.mouse.up();
      await sleep(250);
    }
    const geo2 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    const fields2 = await readAvVpCoordTabFields(page);
    const moved = geo2.ok && (Math.abs(geo2.barIndex - geo1.barIndex) >= 0.5
      || Math.abs(geo2.price - geo1.price) >= 1e-5);
    checks.check('H-A8-VP-2 CORE-B: canvas drag moves anchor', moved, JSON.stringify({ geo1, geo2 }));
    checks.check('H-A8-VP-2 CORE-B′: coord tab tracks canvas drag',
      fields2.ok && geo2.ok
        && Math.abs(parseFloat(fields2.anchorBar) - geo2.barIndex) <= 0.05,
      JSON.stringify({ fields1, fields2, geo2 }));

    return checks;
  });
}
```

Register: `{ id: 'H-A8-VP-2', title: 'A8-VP-2: anchored VP coord tab ↔ canvas anchor sync', run: hA8Vp2 }`.

**Dependency:** Register **after** H-A8-VP-1 in `known-failing.json` promotion order optional; scenarios are independent but VP-2 should not run on build missing Coordinates tab transport.

---

## 3. Proof bar (both rows — binding)

Execute on **pre-fix** dist (bless **`b16`** ok for RED capture) **before** merging PR-VP-1 / PR-VP-2.

| Leg | Pre-fix (default) | Fix ON `--runs=10` | Switch-OFF `--runs=10` |
|-----|-------------------|--------------------|-------------------------|
| H-A8-VP-1 | **RED** ≥8/10 | **GREEN** 10/10 | **RED** 10/10 |
| H-A8-VP-2 | **RED** ≥8/10 | **GREEN** 10/10 | **RED** 10/10 |

**Registry (Lane 4 when pre-fix RED confirmed):**

- Add `"H-A8-VP-1"`, `"H-A8-VP-2"` to `known-failing.json` → `reactParity` section until GREEN stable.
- Link in `RESOLUTION-TRACKER.csv` with switch names from [`A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md`](A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md) §3.

**Does not replace PO NEEDS-LIVE** for TAL-01662/01664 ticket closure — harness rows are D-023 engineering discriminators.

**After each VP PR merge:** D-026 H-R04 + H-R05 ×10 on same build (`TalariaV8bLive.jsx` touched).

---

## 4. File ownership

| Piece | Owner |
|-------|--------|
| `hA8Vp1`, `hA8Vp2` bodies | **Lane 4** — `react-parity-scenarios.mjs` |
| Helpers §6 | **Lane 4** — `react-parity-lib.mjs` |
| CLI flags §0.1 | **Lane 4** — `react-run.mjs` |
| Product fixes | **Lane 5 / V9 tranche** — `TalariaV8bLive.jsx` (HOLD until A6-4 gate) |

---

## 5. Lane 4 helper stubs (`react-parity-lib.mjs`)

### 5.1 `defaultVolumeAnchorPoints(page, pointCount = 1)`

Move verbatim from `scenarios.mjs:5203–5225` (off-5m-boundary anchor index + close price).

### 5.2 `waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored'|'fixed', timeoutMs })`

Poll parent `readParentReactSettings`-style scan for panel text **`Anchored Volume Profile`** (or Fixed Range VP for CTRL row). Return `{ ok, hasLabelsRow, snippet, hasCoordinatesTab }`.

### 5.3 `clickAvSettingsTab(page, tabId)`

`page.evaluate` → find AV settings panel → click button whose text matches `/^Style$|^Coordinates$|^Inputs$|^Visibility$/i` for `tabId`. Then **`page.mouse.click(x, y)`** on returned rect center.

### 5.4 `clickAvLabelCheckbox(page, which: 'price'|'time')`

Locate Labels row in open AV panel; find checkbox container adjacent to label text **Price** or **Time** (post VP-1: implementer may add `data-testid={`avc-${which}Labels`}` — until then, text+structure walk). **Real mouse click** center of 10×10 checkbox div.

### 5.5 `editAvCoordFieldViaSpinner(page, field: 'anchorBar'|'anchorPrice', deltaSteps)`

On Coordinates tab: resolve the **Bar** or **Price** row's ▲ button (second column grid ~`31240–31246`); repeat `deltaSteps` times with `page.mouse.click` on ▲ (or ▼ for negative delta). **Do not** set input `.value` directly.

### 5.6 `resolveAnchoredVpAnchorHandlePagePoint(page, panelId, drawId)`

In iframe: selected `anchored-volume-profile` → `.custom-handle`, `.resize-handle`, or anchor circle; `getBoundingClientRect` + iframe offset → page coords. Fallback: `drawingHitLocalPoint(page, panelId, drawId, { aim: 'center' })` + `localToPagePoint`.

### 5.7 `dragPointerPath(page, x0, y0, x1, y1, { steps })`

Reuse same helper spec as [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) §7.2 (share one implementation in `react-parity-lib.mjs` or import from `interactive-helpers.mjs` if extracted).

---

## 6. Selector / impl contract (Lane 5)

When landing A8-VP-1, **prefer stable harness selectors** (non-binding but reduces flake):

| UI element | Suggested `data-testid` or `hKey` | Reference |
|------------|-----------------------------------|-----------|
| Price label checkbox | `avc-priceLabels` (mirror `vpc-priceLabels`) | VP-1b impl spec |
| Time label checkbox | `avc-timeLabels` | same |
| Coordinates tab | button text **Coordinates** | `31040`, `31204` |
| Bar spinner ▲ | `av-coord-bar-up` (optional) | `31220–31228` |

Harness must work with **text+layout walk** if testids not yet landed; testids are follow-up hardening only.

---

## 7. References

- [`A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md`](A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md) — product hunks + switches  
- [`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md`](POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md) — PR-VP-1/2 queue + D-026  
- [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) — RED-first template (host harness)  
- [`worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`](worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md) — R4a/R4b landed baseline  
- `react-parity-scenarios.mjs` — H-R04 dbl-click / settings-open pattern  
- `scenarios.mjs` — H-S42 anchored VP placement + `defaultVolumeAnchorPoints`
