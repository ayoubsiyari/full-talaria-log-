# VP landed switches — RED-first harness scenario specs (Lane 4 wire-up)

**Authority:** D-023 (named switch-OFF RED per fix from birth) + I15 (real pointer actuation, honest end-state).  
**Purpose:** Full scenario definitions for **already-landed** VP engine fixes that today are **NEEDS-LIVE only** — no standing regression row (R3/R4a/R4b) or no switch-OFF discriminator wired (H-S42). Lane 4 registers rows so synthetic/dev confidence becomes **gate-verified** coverage.  
**Scope:** **Docs only** — no `scenarios.mjs`, `interactive-helpers.mjs`, `run.mjs`, or product edits in this deliverable.

**Blessed builds:** R3/R4a/R4b → **`20260717b15`**; H-S42 right-edge timestamp → **`20260717b16`**.

**Parent inventory:** [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §2.1 / §4.5  
**Product reports:** [`worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`](worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md), [`worker-reports/HS42-anchored-vp-drift-report.md`](worker-reports/HS42-anchored-vp-drift-report.md)  
**Template depth:** [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) (host `run.mjs` — **not** React parity)

---

## 0. Harness surface + global wiring

| Property | Value |
|----------|--------|
| **Runner** | `chart v 1.4/chart/multichart-prod/harness/run.mjs` |
| **Scenario file** | `scenarios.mjs` (host-engine harness) |
| **Boot helper** | `runWith(ctx, bootOpts, body)` + `bootLayout` from `harness-lib.mjs` |
| **Mouse** | **Puppeteer `page.mouse`** only for CORE actuation (down / move / up / click) |
| **Panel A** | Top-window host `window.chart` (same as H-S40–H-S42 family) |

### 0.1 Pre-boot kill-switch injection

Fixes default **ON** (`unset`). Harness proves **switch-OFF RED** via `--bugswitch=` (existing `run.mjs` ~65–68) **or** dedicated CLI aliases (Lane 4 registers — same `bugSwitches` array passed to `bootLayout`).

| CLI flag (Lane 4 registers) | `bugSwitches` entry | Build | Tranche |
|-----------------------------|---------------------|-------|---------|
| `--vp-pan-block-off` | `__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` | b15 | A7b R3 |
| `--vp-axis-highlight-geom-off` | `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` | b15 | A7b R4a |
| `--vp-axis-label-default-off` | `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` | b15 | A7b R4b |
| `--anchored-vp-right-edge-off` | `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX` | b16 | H-S42 |

**Equivalent (no dedicated flag required):**

```bash
node run.mjs --only=H-A7b-R3 --runs=10 --bugswitch=__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX
```

**Default leg (fix ON):** no flags — expect **GREEN** on b15/b16 post-fix build.

**Discriminator leg (fix OFF):** matching `--*-off` or `--bugswitch=` — expect **RED** (≥8/10) on post-fix build; must **not** be vacuous (switch OFF must restore pre-fix symptom).

**Lane 4 `run.mjs` patch (when implementing):** map each flag to `args.bug = true` + single-element `bugSwitches` (same pattern as `--bugswitch=__TALARIA_MC_DISABLE_*`).

### 0.2 Registration table

| Scenario ID | Leg | Switch (unset = ON) | Topology | Status in tree |
|-------------|-----|---------------------|----------|----------------|
| **`H-A7b-R3`** | R3 pan pass-through on VP zone background | `__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` | **1 panel**, `tf: '1m'`, fixed-range VP | **NEW** — Lane 4 adds |
| **`H-A7b-R4a`** | R4a axis highlight geometry (profile span) | `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` | **1 panel**, anchored VP (1-point) | **NEW** — Lane 4 adds |
| **`H-A7b-R4b`** | R4b VP axis labels default ON | `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` | **1 panel**, fresh placement, no explicit style keys | **NEW** — Lane 4 adds |
| **`H-S42`** | H-S42 anchored VP anchor + right-edge timestamp | `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX` | **1 panel**, 1m → 5m TF switch | **EXISTS** — `scenarios.mjs` ~5347–5367; formalize + wire switch-OFF |

**Naming:** `H-A7b-R*` aligns with [`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md`](POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md) (`H-A7b-R2` for D-029 R2). Keep **`H-S42`** id for continuity with RC-3 gate list and [`known-failing.json`](../../chart%20v%201.4/chart/multichart-prod/harness/known-failing.json) `expectedTests`.

### 0.3 Shared imports (Lane 4)

Add to `scenarios.mjs` import block (existing H-S42 helpers + **new §7 helpers**):

```javascript
import {
  placeTool,
  selectTool,
  deselectAllViaCanvas,
  chartCanvasPagePoint,
  dragPointerPath,
  // NEW (§7):
  resolveVpZoneBackgroundPagePoint,
  readVpAxisHighlightProbe,
  readVpLabelDefaultProbe,
  readAnchoredVpRightEdgeProbe,
} from './interactive-helpers.mjs';
import {
  hostSetTimeframe,
  waitBootSettled,
  sleep,
} from './harness-lib.mjs';
```

**Already local in `scenarios.mjs` (reuse — do not duplicate):**

- `defaultVolumeAnchorPoints` (~5203)
- `readAnchorSnapshot` (~5227)
- `switchHostTimeframeAndReadAnchor` (~5272)
- `assertAnchorTimestampsStable` (~5284)

### 0.4 Invalid actuation (all rows — I15)

| Forbidden as **primary** CORE path | Why |
|-----------------------------------|-----|
| `chart.panBy` / `offsetX += …` in `page.evaluate` | Bypasses pan-block hit test |
| `drawingManager` body-drag during pan probe | Not chart pan |
| Setting `showPriceLabel` / `showTimeLabel` in evaluate without select + real UI path (R4b) | R4b tests **constructor/default** path, not V9 bridge |
| TF switch via raw `chart.setTimeframe` without `hostSetTimeframe` | Must match production host path (H-S42) |
| Asserting only `dm.drawings.length` or placement id | Non-discriminating |

---

## 1. H-A7b-R3 — Pan on fixed-range VP zone background must move chart

### 1.1 Symptom / discriminator

**User-visible failure:** After placing a fixed-range Volume Profile, dragging on the **empty zone between anchor lines** (not on the bar column) does **not** pan the chart — user loses chart control (TAL-01666 / TAL-01667 partial).

**Switch:** `__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` (unset = fix ON).

**Product mechanism (b15):**

- `drawing-tools-advanced-volume.js`: `.volume-profile-hitbox` narrowed to **bar column**; `pointer-events: none` when unselected.
- `drawing-tools-manager.js`: `isVolumeProfileChartPanBlockedAtPoint` — fix ON: pass-through when VP **unselected**; block only on bar rects when selected.

### 1.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Instrument | Default harness file (25) |
| Tool type | **`fixed-range-volume-profile`** (2 anchor points — wide zone between anchors) |
| Selection state | **Deselected** before CORE gesture (`deselectAllViaCanvas`) |
| Cursor mode | No draw tool armed |

**Why fixed-range (not anchored):** R3 hitbox/pan-block logic targets the **anchor→anchor zone rectangle** (`.volume-profile-range`); two-point placement maximizes zone background area for a reliable pan probe.

### 1.3 Setup (may use programmatic placement)

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests)` |
| 2 | `const pts = await defaultVolumeAnchorPoints(page, 2)` |
| 3 | `const placed = await placeTool(page, 'A', 'fixed-range-volume-profile', pts)` |
| 4 | `await sleep(300)` — allow VP render + range SVG |
| 5 | `await deselectAllViaCanvas(page, 'A')` — **critical:** pan pass-through is unselected path |
| 6 | Verify `placed.id` and VP `.volume-profile-range` exists in evaluate |
| 7 | Snapshot `offsetX0 = Number(chart.offsetX)` |

### 1.4 CORE actuation (I15 — horizontal pan on zone background)

| Step | Mechanism | Notes |
|------|-----------|-------|
| 1 | `const hit = await resolveVpZoneBackgroundPagePoint(page, 'A', placed.id)` | Point inside `.volume-profile-range`, **outside** `.volume-profile-hitbox` bar column (~15% inset from range edge — see §7.1) |
| 2 | **No Shift** | |
| 3 | `page.mouse.move(hit.x, hit.y); page.mouse.down()` | |
| 4 | `dragPointerPath(page, hit.x, hit.y, hit.x - 100, hit.y, { steps: 10 })` | Horizontal Δx ≈ **−100px** (same sign convention as **H-A8-4**) |
| 5 | Sample `offsetXMid` **while button down** | |
| 6 | `page.mouse.up()` | |

**Invalid:** pan starting on empty canvas with no VP (tests generic pan only); pan on bar column hitbox (selected or unselected bar column — different contract).

### 1.5 End-state probe

```javascript
(() => {
  const ch = window.chart;
  if (!ch) return { ok: false };
  const spacing = typeof ch.getCandleSpacing === 'function'
    ? ch.getCandleSpacing()
    : (Number(ch.candleWidth) + 2 || 8);
  return {
    ok: true,
    offsetX: Number(ch.offsetX),
    spacing,
    selectedCount: (ch.drawingManager?.drawings || []).filter((d) => d && d.selected).length,
  };
})()
```

| Assertion | GREEN (fix ON) | RED (switch OFF or pre-fix) |
|-----------|----------------|----------------------------|
| **Setup** | VP placed, `selectedCount === 0` after deselect | — |
| **CORE** | `\|offsetXMid - offsetX0\| ≥ spacing * 0.35` | `\|ΔoffsetX\| < spacing * 0.15` |
| **Sub** | VP still present, points unchanged | Pan blocked / `offsetX` frozen |

### 1.6 Switch-OFF

```bash
node run.mjs --only=H-A7b-R3 --runs=10 --vp-pan-block-off          # RED (no pan on zone)
node run.mjs --only=H-A7b-R3 --runs=10                                # GREEN (b15+)
node run.mjs --only=H-A7b-R3 --runs=10 --bugswitch=__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX
```

### 1.7 `scenarios.mjs` skeleton

```javascript
async function hA7bR3(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const placed = await placeTool(
      page,
      'A',
      'fixed-range-volume-profile',
      await defaultVolumeAnchorPoints(page, 2),
    );
    checks.check('H-A7b-R3 setup: fixed-range VP placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(300);
    await deselectAllViaCanvas(page, 'A');

    const selectedCount = await page.evaluate(() =>
      (window.chart?.drawingManager?.drawings || []).filter((d) => d && d.selected).length,
    );
    checks.check('H-A7b-R3 setup: VP deselected', selectedCount === 0, `selectedCount=${selectedCount}`);

    const hit = await resolveVpZoneBackgroundPagePoint(page, 'A', placed.id);
    checks.check('H-A7b-R3 setup: zone background hit resolved', hit && hit.ok, hit?.reason || '');

    const offsetX0 = await page.evaluate(() => Number(window.chart && window.chart.offsetX));
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await dragPointerPath(page, hit.x, hit.y, hit.x - 100, hit.y, { steps: 10 });
    const offsetXMid = await page.evaluate(() => Number(window.chart && window.chart.offsetX));
    await page.mouse.up();

    const spacing = await page.evaluate(() => {
      const ch = window.chart;
      return ch && typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 8;
    });
    const delta = Math.abs(offsetXMid - offsetX0);
    checks.check(
      'H-A7b-R3 CORE: pan on VP zone background moves chart (offsetX)',
      delta >= spacing * 0.35,
      `offsetX0=${offsetX0} offsetXMid=${offsetXMid} delta=${delta} spacing=${spacing}`,
    );
    return checks;
  });
}
```

Register: `{ id: 'H-A7b-R3', title: 'A7b R3: chart pan pass-through on fixed-range VP zone background (unselected)', run: hA7bR3 }`.

---

## 2. H-A7b-R4a — VP axis highlight bands must span profile geometry

### 2.1 Symptom / discriminator

**User-visible failure:** With VP selected, price/time **axis highlight bands** are missing, zero-height, or collapsed to a single anchor Y (especially **anchored VP** with 1 `drawing.points` entry).

**Switch:** `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` (unset = fix ON).

**Product mechanism (b15):** `_buildVolumeProfileHighlightPoints` + `_volumeProfileShowAxisHighlights` on `VolumeProfileTool` / `AnchoredVolumeProfileTool`; price band from `_profileTopY/_profileBottomY`; time band anchor → latest bar for anchored VP.

### 2.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Tool type | **`anchored-volume-profile`** (1 anchor — exercises 1-point guard + proxy `_profileTopY/_profileBottomY` copy) |
| Selection | **Selected** before highlight probe |
| V9 / React | **Not required** — host engine only |

**Alternate row (optional, Lane 4):** `H-A7b-R4a-FIXED` with `fixed-range-volume-profile` + 2 points — same probe; not required if anchored alone discriminates RED reliably.

### 2.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled` |
| 2 | `placeTool(page, 'A', 'anchored-volume-profile', await defaultVolumeAnchorPoints(page, 1))` |
| 3 | `await sleep(400)` — profile bins + proxy render |
| 4 | `await selectTool(page, 'A', placed, { click: true })` |
| 5 | In evaluate: if `typeof d.showAxisHighlights === 'function'`, call `d.showAxisHighlights()`; `chart.scheduleRender()` if present |
| 6 | `await sleep(150)` |

### 2.4 CORE actuation (I15)

**Primary path:** Real **select click** (step 4) is the user gesture that enables axis highlights on selected drawings. No additional drag required.

**Optional secondary (if highlights lazy until first pointer):** single `page.mouse.click` on VP bar column — only if evaluate shows highlights absent after select alone on b15; document in FIX report if added.

### 2.5 End-state probe — `readVpAxisHighlightProbe`

```javascript
// evaluate in host frame — see §7.2 for full helper
{
  ok: true,
  type: 'anchored-volume-profile',
  profileTopY: Number(d._profileTopY),
  profileBottomY: Number(d._profileBottomY),
  profileSpanPx: Math.abs(Number(d._profileTopY) - Number(d._profileBottomY)),
  highlightGroupCount: /* .axis-highlight-group[data-drawing-id] */,
  priceBandHeight: /* max height of .axis-highlight-price rects */,
  timeBandWidth: /* max width of .axis-highlight-time rects */,
  highlightsNonDegenerate: /* priceBandHeight >= 4 && timeBandWidth >= 4 */,
  showPriceLabel: d.isAxisLabelEnabled?.('price'),
  showTimeLabel: d.isAxisLabelEnabled?.('time'),
}
```

| Assertion | GREEN (fix ON) | RED (switch OFF) |
|-----------|----------------|------------------|
| **Setup** | `profileSpanPx >= 8` (bins computed) | May still pass — not CORE |
| **CORE-1** | `highlightsNonDegenerate === true` | `highlightGroupCount === 0` **or** bands degenerate (h/w ≤ 2) |
| **CORE-2** | `profileTopY !== profileBottomY` | Often equal or undefined when OFF |
| **Sub** | With R4b ON: `showPriceLabel && showTimeLabel` effective true (defaults) | Labels may be off if R4b also OFF — run R4a with **only** R4a switch OFF |

**Isolation:** When testing R4a switch-OFF, keep R4b fix ON (default) so label **defaults** do not mask geometry failure.

### 2.6 Switch-OFF

```bash
node run.mjs --only=H-A7b-R4a --runs=10 --vp-axis-highlight-geom-off   # RED
node run.mjs --only=H-A7b-R4a --runs=10                                 # GREEN (b15+)
```

### 2.7 `scenarios.mjs` skeleton

```javascript
async function hA7bR4a(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const placed = await placeTool(
      page,
      'A',
      'anchored-volume-profile',
      await defaultVolumeAnchorPoints(page, 1),
    );
    checks.check('H-A7b-R4a setup: anchored VP placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(400);
    await selectTool(page, 'A', placed, { click: true });
    await page.evaluate((id) => {
      const dm = window.chart?.drawingManager;
      const d = dm?.drawings.find((x) => String(x.id) === String(id));
      if (d && typeof d.showAxisHighlights === 'function') d.showAxisHighlights();
      window.chart?.scheduleRender?.();
    }, placed.id);
    await sleep(150);

    const probe = await readVpAxisHighlightProbe(page, 'A', placed.id);
    checks.check('H-A7b-R4a setup: profile span computed', probe.ok && probe.profileSpanPx >= 8,
      JSON.stringify({ profileSpanPx: probe.profileSpanPx, top: probe.profileTopY, bottom: probe.profileBottomY }));
    checks.check(
      'H-A7b-R4a CORE: axis highlight bands span profile (non-degenerate)',
      probe.ok && probe.highlightsNonDegenerate === true,
      JSON.stringify(probe),
    );
    return checks;
  });
}
```

Register: `{ id: 'H-A7b-R4a', title: 'A7b R4a: VP axis highlight geometry spans profile top/bottom + time range', run: hA7bR4a }`.

---

## 3. H-A7b-R4b — Fresh VP must default axis labels ON (engine)

### 3.1 Symptom / discriminator

**User-visible failure:** Newly placed VP drawings require explicit `style.showPriceLabel` / `style.showTimeLabel` before axis labels/highlights appear — defaults treat VP like generic lines (TAL-01662 UX).

**Switch:** `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` (unset = fix ON).

**Product mechanism (b15):** `VP_AXIS_LABEL_DEFAULT_TYPES` + `isAxisLabelDefaultEnabled()` returns true for `fixed-range-volume-profile`, `anchored-volume-profile`, `volume-profile` when fix ON (`drawing-tools-base.js` ~698–710, ~2183–2201).

**Scope note:** This row tests **engine defaults on host placement** — not V9 `avStyle` bridge (anchored production shell gap remains **H-A8-VP-1** in [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md)).

### 3.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Tool types | Run **two registrations** or one scenario with sub-checks: **`fixed-range-volume-profile`** (2 pt) and **`anchored-volume-profile`** (1 pt) |
| Style injection | **`placeTool` must NOT pass `showPriceLabel` / `showTimeLabel`** in style snapshot |

### 3.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled` |
| 2 | `placeTool` VP **without** label style keys |
| 3 | `await sleep(250)` |
| 4 | **Do not** open settings panel — probe engine instance directly |
| 5 | Optionally `selectTool` + `showAxisHighlights()` to materialize SVG (combined with R4a ON) |

### 3.4 CORE actuation (I15)

**None required beyond placement** — discriminator is **default policy** immediately after `placeTool`. Selection click is optional setup to mirror “user just placed and selected” but must not toggle label style keys via UI.

### 3.5 End-state probe — `readVpLabelDefaultProbe`

```javascript
{
  ok: true,
  type: drawing.type,
  hasExplicitShowPriceLabel: Object.prototype.hasOwnProperty.call(d.style || {}, 'showPriceLabel'),
  hasExplicitShowTimeLabel: Object.prototype.hasOwnProperty.call(d.style || {}, 'showTimeLabel'),
  axisLabelDefaultEnabled: typeof d.isAxisLabelDefaultEnabled === 'function' && d.isAxisLabelDefaultEnabled(),
  priceLabelEnabled: typeof d.isAxisLabelEnabled === 'function' && d.isAxisLabelEnabled('price'),
  timeLabelEnabled: typeof d.isAxisLabelEnabled === 'function' && d.isAxisLabelEnabled('time'),
  fixSwitchOff: window.__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX === true,
}
```

| Assertion | GREEN (fix ON) | RED (switch OFF) |
|-----------|----------------|------------------|
| **Setup** | No explicit `showPriceLabel` / `showTimeLabel` keys in `style` | Same |
| **CORE-1** | `axisLabelDefaultEnabled === true` for VP types | `false` for VP types |
| **CORE-2** | `priceLabelEnabled && timeLabelEnabled` | At least one `false` without explicit style |
| **Sub (R4a ON)** | After select + highlights: `readVpAxisHighlightProbe.highlightsNonDegenerate` | Highlights absent when labels effectively off |

### 3.6 Switch-OFF

```bash
node run.mjs --only=H-A7b-R4b --runs=10 --vp-axis-label-default-off   # RED
node run.mjs --only=H-A7b-R4b --runs=10                                 # GREEN (b15+)
```

### 3.7 `scenarios.mjs` skeleton

```javascript
async function hA7bR4b(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    for (const [label, toolType, pointCount] of [
      ['fixed-range', 'fixed-range-volume-profile', 2],
      ['anchored', 'anchored-volume-profile', 1],
    ]) {
      const placed = await placeTool(
        page,
        'A',
        toolType,
        await defaultVolumeAnchorPoints(page, pointCount),
      );
      checks.check(`H-A7b-R4b setup: ${label} VP placed`, placed && placed.id, placed ? placed.id : 'null');
      await sleep(200);
      const probe = await readVpLabelDefaultProbe(page, 'A', placed.id);
      checks.check(
        `H-A7b-R4b CORE: ${label} VP axis labels default ON (no explicit style keys)`,
        probe.ok
          && !probe.hasExplicitShowPriceLabel
          && !probe.hasExplicitShowTimeLabel
          && probe.axisLabelDefaultEnabled
          && probe.priceLabelEnabled
          && probe.timeLabelEnabled,
        JSON.stringify(probe),
      );
      // cleanup between types — delete drawing or reload boot if needed
    }
    return checks;
  });
}
```

Register: `{ id: 'H-A7b-R4b', title: 'A7b R4b: VP types default showPriceLabel/showTimeLabel ON without explicit style', run: hA7bR4b }`.

---

## 4. H-S42 — Anchored VP anchor + right-edge timestamp across TF switch (formalize + switch-OFF)

### 4.1 Symptom / discriminator

**User-visible failure:** Anchored Volume Profile **right edge jumps** on 1m→5m timeframe switch; anchor timestamp may fall back to `barOpenFallback`; setup may expand to **2** `drawing.points` (breaking single-anchor model).

**Switch:** `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX` (unset = fix ON).

**Status:** Scenario **already implemented** and registered (`hS42`, `scenarioList` id `H-S42`). **10/10 PASS** on b16 per [`HS42-anchored-vp-drift-report.md`](worker-reports/HS42-anchored-vp-drift-report.md). Listed in `known-failing.json` **`expectedTests`** (gate expects PASS) — not a pending-fail bucket.

**Lane 4 remaining work:**

1. Wire **`--anchored-vp-right-edge-off`** (or document `--bugswitch=`) so D-023 switch-OFF RED is one command.
2. Add **CORE-B** probe (§4.5) so regression targets **`timestampPoints[1]`** (actual fix surface), not only `drawing.points[0]`.
3. Link row in `RESOLUTION-TRACKER.csv` / `PER-BUG-REGISTRY.csv` when switch-OFF RED captured.

### 4.2 Topology (existing — keep)

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Tool | `anchored-volume-profile`, 1 point via `defaultVolumeAnchorPoints(page, 1)` |
| Actuation | **`hostSetTimeframe(page, '5m')`** via `switchHostTimeframeAndReadAnchor` |
| Helpers | `readAnchorSnapshot`, `assertAnchorTimestampsStable` |

### 4.3 CORE-A (existing — keep as-is)

**Label:** `H-S42 CORE: anchored volume profile anchor survives TF switch`

| Check | GREEN | RED (switch OFF on b16) |
|-------|-------|-------------------------|
| Setup | `before.points.length === 1`, `hasTimestampPoints` | May become **2** points or unstable p0 |
| TF switch | `after.tf === '5m'` | — |
| **CORE-A** | `assertAnchorTimestampsStable(before, after)` on p0 timestamp + price | p0 drift and/or missing `hasTimestampPoints` |

### 4.4 Switch-OFF (wire in Lane 4)

```bash
node run.mjs --only=H-S42 --runs=10 --anchored-vp-right-edge-off   # RED (≥8/10)
node run.mjs --only=H-S42 --runs=10                                  # GREEN 10/10 (b16+)
node run.mjs --only=H-S42 --runs=10 --bugswitch=__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX
```

**Pre-fix historical RED:** 0/10 on b15 (report §1) — optional evidence file `harness/hs42-pre-fix-b15.txt` when capturing RED-first archive.

### 4.5 CORE-B (Lane 4 enhancement — recommended)

**Why:** Pre-fix drift was **`timestampPoints[1]`** (right edge) while `drawing.points` stayed length 1; `readAnchorSnapshot` only maps `tsPts[i]` for each **point** index — CORE-A alone may miss pure right-edge regression if p0 stays stable.

**Probe — `readAnchoredVpRightEdgeProbe` (§7.4):**

```javascript
{
  ok: true,
  pointsLength: drawing.points.length,
  tsPtsLength: timestampPoints.length,
  rightEdgeTimestamp: tsPts[1]?.timestamp ?? null,
  rightEdgeSource: tsPts[1] ? 'timestampPoints[1]' : 'missing',
  anchorTimestamp: tsPts[0]?.timestamp ?? null,
}
```

| Step | Action |
|------|--------|
| 1 | After `before = readAnchorSnapshot`, also `rightBefore = readAnchoredVpRightEdgeProbe` |
| 2 | After 5m switch, `rightAfter = readAnchoredVpRightEdgeProbe` |
| 3 | **CORE-B:** `rightBefore.rightEdgeTimestamp === rightAfter.rightEdgeTimestamp` (finite numbers) |
| 4 | **Setup-B:** `pointsLength === 1` after switch (fix ON); switch OFF may show `pointsLength === 2` |

**Assertion label:** `H-S42 CORE-B: anchored VP right-edge timestamp stable across TF switch`

Add to existing `hS42` body — do not fork scenario id.

### 4.6 Existing skeleton reference

Current implementation (`scenarios.mjs` ~5350–5367) — Lane 4 extends, does not replace:

```javascript
async function hS42(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(500);

    const placed = await placeTool(page, 'A', 'anchored-volume-profile', await defaultVolumeAnchorPoints(page, 1));
    checks.check('H-S42 setup: anchored volume profile placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(250);
    const before = await readAnchorSnapshot(page, placed);
    const rightBefore = await readAnchoredVpRightEdgeProbe(page, 'A', placed.id); // NEW
    checks.check('H-S42 setup: captured 1m timestamp+price anchor', before?.ok && before.points.length === 1,
      `before=${JSON.stringify(before?.points)}`);
    const after = await switchHostTimeframeAndReadAnchor(page, placed, '5m');
    const rightAfter = await readAnchoredVpRightEdgeProbe(page, 'A', placed.id); // NEW
    checks.check('H-S42 probe: switched host timeframe to 5m', after?.ok && after.tf === '5m',
      `tf=${after?.tf} dataLen=${after?.dataLen}`);
    assertAnchorTimestampsStable(checks, 'H-S42 CORE: anchored volume profile anchor survives TF switch', before, after);
    // NEW CORE-B:
    checks.check(
      'H-S42 CORE-B: right-edge timestamp stable across TF switch',
      rightBefore?.ok && rightAfter?.ok
        && Number.isFinite(Number(rightBefore.rightEdgeTimestamp))
        && Number(rightAfter.rightEdgeTimestamp) === Number(rightBefore.rightEdgeTimestamp)
        && rightAfter.pointsLength === 1,
      JSON.stringify({ rightBefore, rightAfter }),
    );
    return checks;
  });
}
```

### 4.7 Promotion / registry

| Artifact | Action when GREEN + switch-OFF RED proven |
|----------|------------------------------------------|
| `known-failing.json` | **No add** — H-S42 already in `expectedTests`; ensure **not** in pending-fail quarantine |
| `RESOLUTION-TRACKER.csv` | Row: `H-S42`, build `20260717b16`, switch `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX`, evidence 10/10 + OFF RED |
| `PER-BUG-REGISTRY.csv` | Link H-S42 as discriminator for anchored VP right-edge family |
| R3/R4a/R4b new rows | Add `H-A7b-R3/R4a/R4b` to `expectedTests` after first GREEN 10/10; capture switch-OFF RED before promote |

---

## 5. Proof bar (all rows — binding)

Execute on **post-fix** build (b15 for R3/R4, b16 for H-S42). **Switch-OFF on same build** proves D-023 discriminator. Optional: pre-fix b15 RED capture for H-S42 (0/10 documented).

| Leg | Pre-fix default (historical) | Fix ON `--runs=10` | Switch-OFF `--runs=10` |
|-----|------------------------------|--------------------|-------------------------|
| **H-A7b-R3** | RED expected (pan blocked) — capture once if b14 archive available | **GREEN** 10/10 (b15+) | **RED** ≥8/10 |
| **H-A7b-R4a** | RED expected (degenerate/missing bands) | **GREEN** 10/10 (b15+) | **RED** ≥8/10 |
| **H-A7b-R4b** | RED expected (defaults off) | **GREEN** 10/10 (b15+) | **RED** ≥8/10 |
| **H-S42** | **0/10** on b15 (reported) | **GREEN** 10/10 (b16+) | **RED** ≥8/10 |

**Registry workflow (R3/R4 new rows):**

1. Implement scenario + helpers.
2. Run default path on b15+ → confirm GREEN 10/10.
3. Run switch-OFF → confirm RED ≥8/10; save evidence txt under `harness/`.
4. Add ids to `known-failing.json` **`expectedTests`** (gate suite).
5. Update [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §4.5 harness column from NEEDS-LIVE → gate-verified.

**Does not replace PO NEEDS-LIVE** for ticket closure — harness rows are engineering bless discriminators; V9 shell gaps (anchored label bridge) remain [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md).

---

## 6. File ownership

| Piece | Owner |
|-------|--------|
| `hA7bR3`, `hA7bR4a`, `hA7bR4b` | **Lane 4** — `scenarios.mjs` |
| `hS42` CORE-B + switch-OFF wiring | **Lane 4** — extend existing body |
| Helpers §7 | **Lane 4** — `interactive-helpers.mjs` |
| CLI flags §0.1 | **Lane 4** — `run.mjs` |
| Product fixes R3/R4/H-S42 | **Already landed** Lane 5 — b15/b16 |

---

## 7. Lane 4 helper stubs (implement in `interactive-helpers.mjs`)

### 7.1 `resolveVpZoneBackgroundPagePoint(page, panelId, drawId)`

- Evaluate in host frame: locate drawing by id; query `.volume-profile-range` and `.volume-profile-hitbox` SVG rects via `d.group`.
- Compute page point **inside range**, **outside hitbox**:
  - Prefer x at `range.x + range.width * 0.12` (or opposite side from hitbox center if hitbox is right-weighted).
  - y at vertical center of range.
- Map SVG/user coords → page: `getBoundingClientRect()` on `#chartCanvas` or drawing SVG root + iframe offset (panel A = host, no iframe offset).
- Return `{ ok, x, y, reason, actuation: 'page.mouse' }`.

### 7.2 `readVpAxisHighlightProbe(page, panelId, drawId)`

- Reuse probe shape from [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md) §1.5 (`axis-highlight-group`, `.axis-highlight-price`, `.axis-highlight-time`).
- Add **`profileTopY` / `profileBottomY` / `profileSpanPx`** from drawing instance.
- Set `highlightsNonDegenerate` when max price rect height ≥ 4px **and** max time rect width ≥ 4px (tune after first RED capture).

### 7.3 `readVpLabelDefaultProbe(page, panelId, drawId)`

- Thin wrapper around §3.5 evaluate block.
- Assert placement did not inject explicit label keys (caller responsibility; probe reports `hasExplicit*`).

### 7.4 `readAnchoredVpRightEdgeProbe(page, panelId, drawId)`

```javascript
return frame.evaluate((id) => {
  const dm = window.chart?.drawingManager;
  const d = dm?.drawings.find((x) => String(x.id) === String(id));
  if (!d) return { ok: false, reason: 'not found' };
  const ts = Array.isArray(d.timestampPoints) ? d.timestampPoints : [];
  return {
    ok: true,
    pointsLength: Array.isArray(d.points) ? d.points.length : 0,
    tsPtsLength: ts.length,
    anchorTimestamp: ts[0] && Number.isFinite(Number(ts[0].timestamp)) ? Number(ts[0].timestamp) : null,
    rightEdgeTimestamp: ts[1] && Number.isFinite(Number(ts[1].timestamp)) ? Number(ts[1].timestamp) : null,
    rightEdgeSource: ts[1] ? 'timestampPoints[1]' : 'missing',
  };
}, drawId);
```

### 7.5 `dragPointerPath(page, x0, y0, x1, y1, { steps })`

- If not already extracted from A8 work: linear interpolation + `sleep(16–25)` between steps ([`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) §7.2).

---

## 8. References

| Doc / path | Relevance |
|------------|-----------|
| [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) | Host harness template, pan probe thresholds (H-A8-4), helper patterns |
| [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md) | V9 avStyle bridge (separate runner); axis highlight DOM probe shape |
| [`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md`](POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md) | Switch inventory b15/b16; harness registration queue |
| [`worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`](worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md) | R3/R4 product hunks + D-023 table |
| [`worker-reports/HS42-anchored-vp-drift-report.md`](worker-reports/HS42-anchored-vp-drift-report.md) | H-S42 0/10 → 10/10 + switch name |
| `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` | R3 hitbox, R4a `showAxisHighlights` |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | R3 `isVolumeProfileChartPanBlockedAtPoint` |
| `chart v 1.4/chart/modules/drawing-tools-base.js` | R4b defaults; H-S42 `ensureAnchoredVolumeProfileRightEdgeTimestamp` |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | H-S42 existing; `defaultVolumeAnchorPoints` |
| `chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs` | `bootLayout` bug switch injection ~117–122 |
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | `deselectAllViaCanvas`, `placeTool`, `selectTool` |

---

*End of VP landed switches RED harness specs — Lane 4 wire-up, docs only.*
