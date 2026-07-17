# A8 — RED-first harness scenario specs (Lane 4 wire-up)

**Authority:** D-023 (named switch-OFF RED per fix from birth) + I15 (real pointer actuation, honest end-state).  
**Purpose:** Full scenario definitions for **H-A8-1 … H-A8-4** so Lane 4 can register rows in `scenarios.mjs` **before or with** Lane 5 A8 lands.  
**Scope:** **Docs only** — no `scenarios.mjs`, `interactive-helpers.mjs`, or product edits in this deliverable.

**Parent spec:** [`A8-FREEZE-SAFE-IMPL-SPEC.md`](A8-FREEZE-SAFE-IMPL-SPEC.md)  
**Diagnostic:** [`worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md`](worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md)

---

## 0. Harness surface + global wiring

| Property | Value |
|----------|--------|
| **Runner** | `chart v 1.4/chart/multichart-prod/harness/run.mjs` |
| **Scenario file** | `scenarios.mjs` (host-engine harness — **not** React parity) |
| **Boot helper** | `runWith(ctx, bootOpts, body)` + `bootLayout` from `harness-lib.mjs` |
| **Mouse** | **Puppeteer `page.mouse`** only for CORE actuation (down / move / up / click). No `drawingManager` point injection during the discriminating gesture. |
| **Shift** | `page.keyboard.down('Shift')` before drag, `page.keyboard.up('Shift')` in `finally`. |

### 0.1 Pre-boot kill-switch injection

Fixes default **ON** (`unset`). Harness proves **switch-OFF RED** via existing `--bugswitch=` path (`run.mjs` ~65–68):

| CLI flag (Lane 4 registers) | `bugSwitches` entry | Tranche |
|-----------------------------|---------------------|---------|
| `--a8-box-shift-off` | `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` | A8-1 |
| `--a8-stale-transform-off` | `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` | A8-2 |
| `--a8-live-sync-off` | `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` | A8-3 |
| `--a8-locked-pan-off` | `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` | A8-4 |

**Lane 4 `run.mjs` patch (when implementing):** map each flag to `args.bug = true` + single-element `bugSwitches` (same pattern as `--bugswitch=__TALARIA_MC_DISABLE_*`).

**Default leg (fix ON):** no flags — expect **GREEN** after product land, **RED** on pre-fix build.

**Discriminator leg (fix OFF):** matching `--a8-*-off` — expect **RED** (≥8/10) on post-fix build; must **not** be vacuous on pre-fix (pre-fix should already RED on default path).

### 0.2 Registration table

| Scenario ID | Tranche | Ticket | Topology summary |
|-------------|---------|--------|------------------|
| `H-A8-1` | A8-1 box Shift square | TAL-01593 | **1 panel** host-only (`panels: 1`) |
| `H-A8-2` | A8-2 stale transform / ghost | TAL-01655 | **1 panel** host-only |
| `H-A8-3` | A8-3 live cross-panel sync | TAL-01651 | **2 panels**, same pair, **drawing sync ON**, **A=1m B=5m** |
| `H-A8-4` | A8-4 locked pan pass-through | TAL-01652 | **1 panel** host-only |

### 0.3 Shared imports (Lane 4)

Add to `scenarios.mjs` import block from `interactive-helpers.mjs` (existing + **new helpers §7**):

```javascript
import {
  placeTool,
  selectTool,
  defaultRectanglePoints,
  defaultTrendlinePoints,
  chartCanvasPagePoint,
  frameRectForPanel,
  readPanelDrawingGeometry,
  // NEW (§7):
  resolveResizeHandlePagePoint,
  dragPointerPath,
  lockDrawingViaManager,
  readDrawingShiftSquareProbe,
  readDrawingGhostMidDragProbe,
  readDrawingTimestampAnchors,
} from './interactive-helpers.mjs';
import { setSync, panelCmd, waitBootSettled, sleep } from './harness-lib.mjs';
```

### 0.4 Invalid actuation (all rows — I15)

| Forbidden as **primary** CORE path | Why |
|-----------------------------------|-----|
| `frame.evaluate(() => { drawing.points[i] = … })` during Shift drag | Bypasses resize/body-drag handlers |
| `dm._assignResizePoint` / `_applyLiveDrawingMovePixels` direct call | Not user gesture |
| `placeTool` **during** the Shift+drag under test | OK for **setup only**, not for CORE probe stroke |
| Dispatching synthetic `MouseEvent` on SVG without `page.mouse` | Must use puppeteer mouse at translated page coords |
| Asserting only `dm.isCustomHandleDrag` without geometry | Proxy — need price/bbox/offsetX |

---

## 1. H-A8-1 — Shift + rectangle corner must not explode vertically

### 1.1 Symptom / discriminator

**User-visible failure:** Shift + corner drag (mostly horizontal) shoots rectangle to chart top/bottom.  
**Switch:** `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` (unset = fix ON).

### 1.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Replay | **OFF** (not required) |
| Sync | N/A (single tile) |
| Instrument | Default harness file (25) |

**Why single-panel:** Root is data-space square math in `drawing-tools-shapes.js`; multichart does not change the failure mode. Keeps flake surface small.

### 1.3 Setup (may use programmatic placement)

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests)` |
| 2 | `const pts = await defaultRectanglePoints(page, 'A')` — moderate box (~20 bars wide) |
| 3 | `const placed = await placeTool(page, 'A', 'rectangle', pts)` |
| 4 | `await selectTool(page, 'A', placed, { click: true })` — **real click** selects + shows handles |
| 5 | Snapshot `before = await readDrawingShiftSquareProbe(page, 'A', placed.id)` |

### 1.4 CORE actuation (I15 — real Shift + handle drag)

| Step | Mechanism | Notes |
|------|-----------|-------|
| 1 | `const handle = await resolveResizeHandlePagePoint(page, 'A', placed.id, 'corner-br')` | Bottom-right corner; use role matching `_resizeRole` after select |
| 2 | `await page.keyboard.down('Shift')` | |
| 3 | `await page.mouse.move(handle.x, handle.y)` | |
| 4 | `await page.mouse.down()` | |
| 5 | `await dragPointerPath(page, handle.x, handle.y, handle.x + 90, handle.y + 6, { steps: 12 })` | **≥85% horizontal** delta; minimal vertical |
| 6 | `await page.mouse.up()` | |
| 7 | `finally { await page.keyboard.up('Shift') }` | |
| 8 | `await sleep(200)` — one settle frame | |

**Invalid:** calling `squareConstrainedBoxPoint` or setting `points[1]` in evaluate for step 5.

### 1.5 End-state probe (honest)

Evaluate in panel A (`readDrawingShiftSquareProbe`):

```javascript
(() => {
  const ch = window.chart;
  const dm = ch && ch.drawingManager;
  const d = dm && dm.drawings.find((x) => String(x.id) === DRAW_ID);
  if (!d || !Array.isArray(d.points) || d.points.length < 2 || !ch.yScale) {
    return { ok: false, reason: 'missing drawing/scales' };
  }
  const y0 = Number(d.points[0].y);
  const y1 = Number(d.points[1].y);
  const priceSpan = Math.abs(y0 - y1);
  const yDom = ch.yScale.domain();
  const visibleSpan = Math.abs(Number(yDom[1]) - Number(yDom[0]));
  const ratio = visibleSpan > 0 ? priceSpan / visibleSpan : 0;

  // Pixel aspect: square constraint should keep w≈h on screen
  const xL = Math.min(d.points[0].x, d.points[1].x);
  const xR = Math.max(d.points[0].x, d.points[1].x);
  const pxW = Math.abs(ch.dataIndexToPixel(xR) - ch.dataIndexToPixel(xL));
  const pxH = Math.abs(ch.yScale(y0) - ch.yScale(y1));
  const aspect = pxW > 1 ? pxH / pxW : null;
  const aspectOk = aspect != null && aspect > 0.65 && aspect < 1.35;

  const jump = ratio > 0.42; // pre-fix horizontal shift-drag often >50% domain
  return {
    ok: true,
    priceSpan,
    visibleSpan,
    ratio,
    aspect,
    aspectOk,
    jump,
    points: d.points.map((p) => ({ x: p.x, y: p.y })),
  };
})()
```

| Assertion | GREEN (fix ON) | RED (pre-fix or switch OFF) |
|-----------|----------------|----------------------------|
| **CORE** | `!probe.jump && probe.aspectOk` | `probe.jump === true` **OR** `!probe.aspectOk` with `ratio > 0.42` |
| Setup | `placed.id` truthy | — |

**Non-vacuous requirement:** On **pre-fix** build, default (fix ON absent) run must fail CORE on **≥8/10** runs. If always pass, tighten horizontal drag delta or pick smaller starting box.

### 1.6 Switch-OFF discriminator (D-023)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-A8-1 --runs=10 --a8-box-shift-off   # post-fix: 10/10 RED
node run.mjs --only=H-A8-1 --runs=10                       # post-fix: 10/10 GREEN
```

### 1.7 `scenarios.mjs` skeleton

```javascript
async function hA8_1(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const pts = await defaultRectanglePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'rectangle', pts);
    checks.check('H-A8-1 setup: rectangle placed', placed && placed.id, placed ? placed.id : 'null');
    await selectTool(page, 'A', placed, { click: true });
    await sleep(200);

    const handle = await resolveResizeHandlePagePoint(page, 'A', placed.id, 'corner-br');
    checks.check('H-A8-1 setup: corner handle resolved', handle && handle.ok, JSON.stringify(handle || null));
    if (!handle || !handle.ok) return checks;

    await page.keyboard.down('Shift');
    try {
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await dragPointerPath(page, handle.x, handle.y, handle.x + 90, handle.y + 6, { steps: 12 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up('Shift');
    }
    await sleep(200);

    const probe = await readDrawingShiftSquareProbe(page, 'A', placed.id);
    checks.check(
      'H-A8-1 CORE: Shift+corner horizontal drag stays square (no Y-domain jump)',
      probe && probe.ok && !probe.jump && probe.aspectOk,
      JSON.stringify(probe || null),
    );
    return checks;
  });
}
```

Register: `{ id: 'H-A8-1', title: 'A8-1: Shift+rectangle corner square constraint (pixel space)', run: hA8_1 }`.

---

## 2. H-A8-2 — Shift + body drag must not leave origin ghost

### 2.1 Symptom / discriminator

**User-visible failure:** Shift + move trendline → shape at new location **and** duplicate at origin mid-drag.  
**Switch:** `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` (unset = fix ON).

### 2.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Tool | `trendline` (representative `angleSnapTools` member) |

### 2.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled` |
| 2 | `const placed = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'))` |
| 3 | `await selectTool(page, 'A', placed, { click: true })` |
| 4 | Store start points in frame: `window.__hA82Start = { id, points: clone }` via evaluate (snapshot only — not mutation) |

### 2.4 CORE actuation (I15)

| Step | Mechanism |
|------|-----------|
| 1 | Resolve **body hit** same as `selectTool` click path (stroke midpoint in page coords) — reuse `selectTool` hit evaluate |
| 2 | `page.keyboard.down('Shift')` |
| 3 | `page.mouse.move(hit.x, hit.y); page.mouse.down()` |
| 4 | **Mid-drag sample:** after `move` +80px X, +12px Y (steps 10), call `readDrawingGhostMidDragProbe` **before** mouseup |
| 5 | `page.mouse.up()`; `keyboard.up('Shift')` |

**Critical:** Mid-drag probe must run **while button down** (between steps 4 move and mouseup) to catch ghost, not only after commit.

### 2.5 End-state probe (honest)

`readDrawingGhostMidDragProbe(page, 'A', drawId, startPoints)`:

```javascript
(() => {
  const ch = window.chart;
  const dm = ch && ch.drawingManager;
  const d = dm && dm.drawings.find((x) => String(x.id) === DRAW_ID);
  if (!d || !d.group || !START_POINTS || !ch.yScale) return { ok: false, reason: 'missing' };

  const transform = d.group.attr('transform') || '';
  const hasTransform = transform && transform !== 'null' && !/^translate\\(0[,\\s]0\\)/.test(transform);

  const p0s = START_POINTS[0];
  const p0c = d.points && d.points[0];
  if (!p0s || !p0c) return { ok: false, reason: 'no points' };

  const dataMoved = Math.hypot(p0c.x - p0s.x, p0c.y - p0s.y) > 0.0005;

  const node = d.group.node();
  const bb = node.getBBox();
  const svg = dm.svg.node();
  const sr = svg.getBoundingClientRect();
  const bboxCx = sr.left + bb.x + bb.width / 2;
  const bboxCy = sr.top + bb.y + bb.height / 2;

  const startCx = sr.left + (typeof ch.dataIndexToPixel === 'function'
    ? ch.dataIndexToPixel((START_POINTS[0].x + START_POINTS[1].x) / 2)
    : 0);
  const startCy = sr.top + ch.yScale((START_POINTS[0].y + START_POINTS[1].y) / 2);

  const curCx = sr.left + (typeof ch.dataIndexToPixel === 'function'
    ? ch.dataIndexToPixel((d.points[0].x + d.points[1].x) / 2)
    : 0);
  const curCy = sr.top + ch.yScale((d.points[0].y + d.points[1].y) / 2);

  const bboxNearOrigin = Math.hypot(bboxCx - startCx, bboxCy - startCy) < 12;
  const dataNearCurrent = Math.hypot(bboxCx - curCx, bboxCy - curCy) < 20;

  // Ghost: data points moved but SVG bbox still anchored at start (stale transform / dual render)
  const ghost = dataMoved && bboxNearOrigin && !dataNearCurrent;
  const staleTransform = dataMoved && hasTransform;

  return {
    ok: true,
    dataMoved,
    hasTransform,
    ghost,
    staleTransform,
    bboxNearOrigin,
    dataNearCurrent,
    transform,
  };
})()
```

| Assertion | GREEN | RED |
|-----------|-------|-----|
| **CORE (mid-drag)** | `!probe.ghost && !probe.staleTransform` | `probe.ghost \|\| probe.staleTransform` |
| **Post-drag (secondary)** | Single drawing count; points committed away from start | Optional sanity — not bless substitute |

### 2.6 Switch-OFF

```bash
node run.mjs --only=H-A8-2 --runs=10 --a8-stale-transform-off   # RED
node run.mjs --only=H-A8-2 --runs=10                             # GREEN
```

### 2.7 `scenarios.mjs` skeleton

```javascript
async function hA8_2(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const placed = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
    checks.check('H-A8-2 setup: trendline placed', placed && placed.id, placed ? placed.id : 'null');
    const hit = await selectTool(page, 'A', placed, { click: true });
    checks.check('H-A8-2 setup: body hit resolved', hit && hit.ok, hit?.reason || '');

    await page.evaluate((id, pts) => {
      window.__hA82Start = { id: String(id), points: pts.map((p) => ({ x: p.x, y: p.y })) };
    }, placed.id, (await readPanelDrawingGeometry(page, 'A'))?.drawings?.find((d) => d.id === placed.id)?.points || []);

    const startX = hit.clicked.x;
    const startY = hit.clicked.y;
    await page.keyboard.down('Shift');
    let midProbe = null;
    try {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await dragPointerPath(page, startX, startY, startX + 80, startY + 12, { steps: 10 });
      midProbe = await readDrawingGhostMidDragProbe(page, 'A', placed.id);
      await page.mouse.up();
    } finally {
      await page.keyboard.up('Shift');
    }

    checks.check(
      'H-A8-2 CORE: no origin ghost / stale transform during Shift+body drag',
      midProbe && midProbe.ok && !midProbe.ghost && !midProbe.staleTransform,
      JSON.stringify(midProbe || null),
    );
    return checks;
  });
}
```

---

## 3. H-A8-3 — Shift + move syncs timestamp anchors to mixed-TF peer

### 3.1 Symptom / discriminator

**User-visible failure:** Shift + move on host; peer on **different TF** shows line at wrong level / wrong start bar.  
**Switch:** `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` (unset = fix ON).

### 3.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 2, tf: '1m' }` |
| Sync | **`await setSync(page, true)`** — `drawings: true` via `harness-lib.setSync` |
| TF split | Host **A** stays **1m**; panel **B** → **`panelCmd(page, 'B', 'setTimeframe', { tf: '5m' })`** after sync seed |
| Panels under test | **A** actuation, **B** assertion |

**Why 2-panel not 4:** Minimizes boot time; drawing sync + mixed TF is the defect class (TAL-01651).

### 3.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `waitBootSettled(page, ['A', 'B'], 20_000, …)` |
| 2 | `setSync(page, true)`; `sleep(400)` |
| 3 | `placeTool` trendline on **A**; `sleep(600)` — wait peer mirror |
| 4 | Verify B has drawing: `readPanelDrawingGeometry(page, 'B').drawings.length >= 1` |
| 5 | `panelCmd(page, 'B', 'setTimeframe', { tf: '5m' })`; `sleep(800)` |
| 6 | Snapshot `anchorA0 = readDrawingTimestampAnchors(page, 'A', id)` and same on B |

### 3.4 CORE actuation (I15)

Same Shift + **body drag** on **A** as H-A8-2 (~80px / +12px), but:

- Do **not** switch TF on A during drag.
- Mid-drag optional; **post-drag** timestamp compare is primary for this leg (live broadcast fires during drag).

### 3.5 End-state probe (honest)

After drag + settle on A, read both panels:

```javascript
// readDrawingTimestampAnchors(panelId, drawId)
(() => {
  const dm = window.chart && window.chart.drawingManager;
  const d = dm && dm.drawings.find((x) => String(x.id) === DRAW_ID);
  if (!d) return { ok: false, reason: 'no drawing' };
  const pts = Array.isArray(d.timestampPoints) && d.timestampPoints.length
    ? d.timestampPoints
    : null;
  const barPts = Array.isArray(d.points) ? d.points : [];
  const tf = window.chart.currentTimeframe || null;
  return {
    ok: true,
    tf,
    timestampPoints: pts,
    barPoints: barPts,
    p0ts: pts && pts[0] ? Number(pts[0].timestamp) : null,
    p0price: pts && pts[0] ? Number(pts[0].price) : null,
    p0bar: barPts[0] ? Number(barPts[0].x) : null,
  };
})()
```

**Cross-panel compare (harness Node side):**

| Field | GREEN | RED |
|-------|-------|-----|
| `p0ts` A vs B | `\|A.p0ts - B.p0ts\| ≤ 1 × 1m bar ms` (60000) after move | Delta **> 120000** ms OR null on one side |
| `p0price` A vs B | `\|Δprice\| ≤ 0.05%` relative or ≤ 2 ticks | **> 0.2%** relative |
| `p0bar` B vs A | Not compared directly (different TF) — **timestamp** is oracle | Using bar index only → **invalid proxy** |

**Invalid proxy:** `points[0].x` equal across A and B (different TF bar indices **should** differ when timestamps align).

### 3.6 Switch-OFF RED

With `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX = true`:

- **Expected:** After Shift+move on A, B's `p0ts` or `p0price` stale vs A (matches pre-fix live index-only broadcast) — **≥8/10** RED.

### 3.7 Negative control (same-TF)

Optional companion **`H-A8-3-SAMETF`** (non-bless): B stays 1m — should PASS even with switch OFF. Documents that mixed TF is required for non-vacuous RED.

### 3.8 Proof commands

```bash
node run.mjs --only=H-A8-3 --runs=10 --a8-live-sync-off
node run.mjs --only=H-A8-3 --runs=10
```

### 3.9 `scenarios.mjs` skeleton

```javascript
async function hA8_3(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    checks.check('H-A8-3 setup: drawing sync enabled', await setSync(page, true), 'setSync failed');
    await sleep(400);

    const placed = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
    checks.check('H-A8-3 setup: trendline on A', placed && placed.id, placed ? placed.id : 'null');
    await sleep(600);
    const geoB = await readPanelDrawingGeometry(page, 'B');
    checks.check('H-A8-3 setup: peer B received drawing', geoB?.drawings?.length >= 1,
      `B.count=${geoB?.drawings?.length || 0}`);

    await panelCmd(page, 'B', 'setTimeframe', { tf: '5m' });
    await sleep(800);

    const hit = await selectTool(page, 'A', placed, { click: true });
    const sx = hit.clicked.x;
    const sy = hit.clicked.y;
    await page.keyboard.down('Shift');
    try {
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await dragPointerPath(page, sx, sy, sx + 80, sy + 12, { steps: 10 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up('Shift');
    }
    await sleep(400);

    const a = await readDrawingTimestampAnchors(page, 'A', placed.id);
    const b = await readDrawingTimestampAnchors(page, 'B', placed.id);
    const tsDelta = (a?.p0ts != null && b?.p0ts != null) ? Math.abs(a.p0ts - b.p0ts) : Infinity;
    const priceBase = Math.abs(a?.p0price) || 1;
    const priceDeltaPct = (a?.p0price != null && b?.p0price != null)
      ? (Math.abs(a.p0price - b.p0price) / priceBase) * 100
      : Infinity;

    checks.check(
      'H-A8-3 CORE: mixed-TF peer B matches A timestamp anchor after Shift+move',
      a?.ok && b?.ok && tsDelta <= 60000 && priceDeltaPct <= 0.05,
      `tsDelta=${tsDelta} priceDeltaPct=${priceDeltaPct} A=${JSON.stringify(a)} B=${JSON.stringify(b)}`,
    );
    return checks;
  });
}
```

---

## 4. H-A8-4 — Locked rectangle body drag must pan chart

### 4.1 Symptom / discriminator

**User-visible failure:** Drag on locked shape → chart frozen (no pan).  
**Switch:** `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` (unset = fix ON).

### 4.2 Topology

| Param | Value |
|-------|--------|
| `runWith` boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Cursor mode | **No draw tool armed** (`dm.currentTool == null`) |

### 4.3 Setup

| Step | Mechanism |
|------|-----------|
| 1 | `placeTool` rectangle on A; `selectTool` |
| 2 | **`lockDrawingViaManager(page, 'A', placed.id, true)`** — sets `drawing.locked`, re-runs interaction setup (real manager path, not raw DOM) |
| 3 | Verify `locked === true` in evaluate |
| 4 | `deselectAllViaCanvas` optional — locked body should still receive pass-through when fix ON |
| 5 | Snapshot `offsetX0 = chart.offsetX` |

### 4.4 CORE actuation (I15 — pan gesture on locked body)

| Step | Mechanism |
|------|-----------|
| 1 | Resolve locked body hit (stroke midpoint — same as selectTool geometry) |
| 2 | **No Shift** |
| 3 | `page.mouse.move(hit.x, hit.y); page.mouse.down()` |
| 4 | `dragPointerPath` **horizontal** Δx ≈ **−100px** (pan chart right / reveal history — match engine pan sign) |
| 5 | Sample `offsetXMid` **while button down** |
| 6 | `page.mouse.up()` |

**Invalid:** pan starting on empty canvas only (that tests generic pan, not pass-through); calling `chart.panBy` in evaluate.

### 4.5 End-state probe

```javascript
(() => {
  const ch = window.chart;
  if (!ch) return { ok: false };
  const spacing = typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : (ch.candleWidth + 2);
  return {
    ok: true,
    offsetX: Number(ch.offsetX),
    spacing,
    panActive: !!(ch.drag && ch.drag.active && ch.drag.type === 'pan'),
  };
})()
```

| Assertion | GREEN | RED |
|-----------|-------|-----|
| **CORE** | `\|offsetXMid - offsetX0\| ≥ spacing * 0.35` | `\|ΔoffsetX\| < spacing * 0.15` |
| Locked unchanged | `drawing.locked === true` after gesture | Points unchanged (optional sub-check) |

### 4.6 Switch-OFF

```bash
node run.mjs --only=H-A8-4 --runs=10 --a8-locked-pan-off   # RED (no pan)
node run.mjs --only=H-A8-4 --runs=10                        # GREEN
```

### 4.7 `scenarios.mjs` skeleton

```javascript
async function hA8_4(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const placed = await placeTool(page, 'A', 'rectangle', await defaultRectanglePoints(page, 'A'));
    await selectTool(page, 'A', placed, { click: true });
    const lockRes = await lockDrawingViaManager(page, 'A', placed.id, true);
    checks.check('H-A8-4 setup: drawing locked', lockRes && lockRes.ok && lockRes.locked, JSON.stringify(lockRes || null));

    const hit = await selectTool(page, 'A', placed, { click: false }); // get hit coords only — or dedicated body hit helper
    const bodyHit = await /* resolve body page coords */;
    const offsetX0 = await page.evaluate(() => Number(window.chart && window.chart.offsetX));

    await page.mouse.move(bodyHit.x, bodyHit.y);
    await page.mouse.down();
    await dragPointerPath(page, bodyHit.x, bodyHit.y, bodyHit.x - 100, bodyHit.y, { steps: 10 });
    const offsetXMid = await page.evaluate(() => Number(window.chart && window.chart.offsetX));
    await page.mouse.up();

    const spacing = await page.evaluate(() => {
      const ch = window.chart;
      return ch && typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 8;
    });
    const delta = Math.abs(offsetXMid - offsetX0);
    checks.check(
      'H-A8-4 CORE: drag on locked body pans chart (offsetX moves)',
      delta >= spacing * 0.35,
      `offsetX0=${offsetX0} offsetXMid=${offsetXMid} delta=${delta} spacing=${spacing}`,
    );
    return checks;
  });
}
```

---

## 5. Proof bar (all rows — binding)

Execute on **pre-fix** build first (RED capture), then after each A8 tranche lands.

| Leg | Pre-fix (default) | Fix ON `--runs=10` | Switch-OFF `--runs=10` |
|-----|-------------------|--------------------|-------------------------|
| H-A8-1 | **RED** ≥8/10 | **GREEN** 10/10 | **RED** 10/10 |
| H-A8-2 | **RED** ≥8/10 | **GREEN** 10/10 | **RED** 10/10 |
| H-A8-3 | **RED** ≥8/10 (mixed TF) | **GREEN** 10/10 | **RED** 10/10 |
| H-A8-4 | **RED** ≥8/10 | **GREEN** 10/10 | **RED** 10/10 |

**Registry (Lane 4 when RED confirmed on pre-fix):**

- Add rows to `known-failing.json` with `"id": "H-A8-*"`.
- Promote to gate when GREEN stable; link in `RESOLUTION-TRACKER.csv` per tranche FIX report.

**Does not replace PO NEEDS-LIVE** for ticket closure — harness rows are D-023 discriminators for engineering bless.

---

## 6. File ownership

| Piece | Owner |
|-------|--------|
| Scenario bodies `hA8_1` … `hA8_4` | **Lane 4** — `scenarios.mjs` |
| Helpers §7 | **Lane 4** — `interactive-helpers.mjs` |
| CLI flags §0.1 | **Lane 4** — `run.mjs` |
| Product fixes | **Lane 5** — drawing modules (HOLD until A6-4 gate) |

---

## 7. Lane 4 helper stubs (implement in `interactive-helpers.mjs`)

### 7.1 `resolveResizeHandlePagePoint(page, panelId, drawId, role)`

- Evaluate in frame: find `.resize-handle-group[data-handle-role="${role}"]` or `.custom-handle[data-handle-role]`, `getBoundingClientRect()`, translate to **page** coords (add iframe rect when `panelId !== 'A'`).
- Return `{ ok, x, y, role, actuation: 'page.mouse' }`.

### 7.2 `dragPointerPath(page, x0, y0, x1, y1, { steps })`

- Loop `page.mouse.move` with linear interpolation; `sleep(16–25)` between steps (matches existing `probeDrawingDragPastTile` pattern).

### 7.3 `lockDrawingViaManager(page, panelId, drawId, locked)`

```javascript
return frame.evaluate((id, flag) => {
  const dm = window.chart && window.chart.drawingManager;
  const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
  if (!d) return { ok: false, reason: 'not found' };
  d.locked = !!flag;
  if (typeof dm.renderDrawing === 'function') dm.renderDrawing(d);
  if (typeof dm.setupDrawingInteraction === 'function') dm.setupDrawingInteraction(d);
  if (typeof dm._broadcastDrawingStateSync === 'function') dm._broadcastDrawingStateSync(d);
  if (typeof dm.saveDrawings === 'function') dm.saveDrawings();
  return { ok: true, locked: !!d.locked };
}, drawId, locked);
```

### 7.4 `readDrawingShiftSquareProbe` / `readDrawingGhostMidDragProbe` / `readDrawingTimestampAnchors`

- Thin wrappers around §1.5 / §2.5 / §3.5 evaluate blocks (pass `DRAW_ID`, `START_POINTS` as args).

### 7.5 `resolveBodyHitPagePoint(page, panelId, drawId)`

- Extract shared hit logic from `selectTool` (stroke midpoint → page coords) without requiring selection toggle.

---

## 8. References

- [`A8-FREEZE-SAFE-IMPL-SPEC.md`](A8-FREEZE-SAFE-IMPL-SPEC.md) — product hunks + switches
- [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md) — **H-A8-VP-1 / H-A8-VP-2** (React parity / V9 avStyle bridge — different runner)
- [`T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md`](T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md) — RED-first template
- [`D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`](D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md) — harness probe + proof-bar pattern
- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` — `H-S43`, `H-S44`, `runWith`, `readPanelDrawingGeometry`
- `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` — `selectTool`, `placeTool`, `probePanDragPastTile`
