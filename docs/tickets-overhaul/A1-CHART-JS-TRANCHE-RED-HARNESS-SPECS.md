# A1 chart.js tranches — RED-first harness specs (Lane 4 wire-up)

**Author:** Lane 2 (read-only pre-spec)  
**Date:** 2026-07-17  
**Scope:** Tranches **B / A / F / E / C** only — all gated in `chart.js` (both I8 trees).  
**Out of scope:** Tranche **G** (implemented as **H-S85** in `chart-indicators-full.js`). Tranche **D** cancelled (D-019).

**Template depth:** Same contract as **H-S85** — exact repro, real actuation (I15), end-state measurement (not proxies), fix-ON pass criteria, switch-OFF discriminator, `--runs=10` gate.

**Worker 4 token:** Do **not** implement these scenarios until the matching tranche lands in `chart.js`. This document is specs-only.

---

## Shared wiring (all five scenarios)

| Item | Value |
|------|--------|
| **Runner** | `chart v 1.4/chart/multichart-prod/harness/run.mjs` |
| **Registration** | Add to `scenarioList()` in `scenarios.mjs` (+ mirror `homepage/public/chart/...`) |
| **Wrapper** | `runWith(ctx, bootOpts, body)` — always ends with H-INV |
| **Gate command** | `node run.mjs --only=H-A1-<letter> --runs=10` |
| **Pass bar** | 10/10 PASS fix-ON leg **and** switch-OFF leg fails the CORE checks (discriminator), same run |
| **Pattern** | One scenario function per id; `*Core(page, checks, expectFixOn, skipSetup?)` + switch toggle at end (see H-S85) |

### Shared probe module (proposed — add near H-S21 helpers)

Implement once in `scenarios.mjs` (or `interactive-helpers.mjs` if reused):

```javascript
// ── A1 axis probes (chart.js end-state) ──────────────────────────────────

/** Fresh full tick build + tail geometry (tranche B). */
async function readTimeAxisTailProbe(page, panelId = 'A') {
  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch || !Array.isArray(ch.data) || !ch.data.length) return { ok: false, reason: 'no data' };
    const m = ch.margin || { l: 60, r: 60 };
    const plotLeft = m.l;
    const plotRight = ch.w - (m.r || 0);
    const tfMs = typeof ch.parseTimeframe === 'function'
      ? Number(ch.parseTimeframe(ch.currentTimeframe)) : NaN;
    let ticks = [];
    try {
      ticks = typeof ch._buildTimeTicks === 'function'
        ? ch._buildTimeTicks({ full: true })
        : (Array.isArray(ch._timeTicks) ? ch._timeTicks.slice() : []);
    } catch (_) { ticks = []; }
    const labeled = ticks.filter((t) => t && t.label && Number.isFinite(t.x) && t.idx != null);
    const tail = labeled.filter((t) => t.x >= plotLeft + (plotRight - plotLeft) * 0.72);
    const interior = labeled.filter((t) => t.x >= plotLeft && t.x < plotLeft + (plotRight - plotLeft) * 0.72);
    const halfHourMs = 30 * 60 * 1000;
    const checkAlign = (t) => {
      const c = ch.data[t.idx];
      if (!c || !Number.isFinite(c.t)) return { aligned: false, ts: null };
      if (String(ch.currentTimeframe || '').toLowerCase() === '30m') {
        const rem = ((c.t % halfHourMs) + halfHourMs) % halfHourMs;
        return { aligned: rem < 500 || rem > halfHourMs - 500, ts: c.t };
      }
      if (Number.isFinite(tfMs) && tfMs > 0) {
        const rem = ((c.t % tfMs) + tfMs) % tfMs;
        return { aligned: rem < 500 || rem > tfMs - 500, ts: c.t };
      }
      return { aligned: true, ts: c.t };
    };
    const tailDetail = tail.map((t) => ({ ...t, ...checkAlign(t) }));
    const spacing = (arr) => {
      const dx = [];
      for (let i = 1; i < arr.length; i++) dx.push(arr[i].x - arr[i - 1].x);
      const pos = dx.filter((d) => d > 0);
      if (pos.length < 2) return null;
      return Math.max(...pos) / Math.min(...pos);
    };
    const tailSpacingRatio = spacing(tail);
    const interiorSpacingRatio = spacing(interior.slice(-4));
    const misaligned = tailDetail.filter((t) => !t.aligned).length;
    return {
      ok: true,
      tf: String(ch.currentTimeframe || ''),
      tfMs,
      tailCount: tail.length,
      misaligned,
      tailSpacingRatio,
      interiorSpacingRatio,
      tailDetail: tailDetail.slice(-4),
      offsetX: Number(ch.offsetX),
    };
  });
}

/** Label + bar binding at a viewport fraction (tranches A, E, C). */
async function readTimeAxisAnchorProbe(page, panelId, fractionX = 0.5) {
  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((fx) => {
    const ch = window.chart;
    if (!ch || typeof ch.dataIndexToPixel !== 'function') return { ok: false, reason: 'no chart' };
    const m = ch.margin || { l: 60, r: 60 };
    const plotW = Math.max(1, ch.w - m.l - (m.r || 0));
    const x = m.l + fx * plotW;
    const rawIdx = typeof ch.pixelToDataIndex === 'function' ? ch.pixelToDataIndex(x) : NaN;
    const barIdx = Math.max(0, Math.min(ch.data.length - 1, Math.round(rawIdx)));
    const bar = ch.data[barIdx];
    let labelAtX = '';
    const ticks = Array.isArray(ch._timeTicks) ? ch._timeTicks : [];
    let best = Infinity;
    for (const t of ticks) {
      if (!t || !t.label) continue;
      const d = Math.abs(t.x - x);
      if (d < best) { best = d; labelAtX = String(t.label); }
    }
    return {
      ok: true,
      fractionX: fx,
      x,
      barIdx,
      barTs: bar && Number.isFinite(bar.t) ? bar.t : null,
      labelAtX,
      offsetX: Number(ch.offsetX),
      candleWidth: Number(ch.candleWidth),
      renderTf: typeof ch._getRenderTimeframe === 'function' ? String(ch._getRenderTimeframe() || '') : '',
    };
  }, fractionX);
}

/** Canvas labeled tick snapshot (tranche C — not DOM crosshair). */
async function readCanvasAxisLabelSnapshot(page, panelId = 'A') {
  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no chart' };
    let ticks = [];
    try {
      ticks = typeof ch._buildTimeTicks === 'function'
        ? ch._buildTimeTicks({ full: true }) : (ch._timeTicks || []);
    } catch (_) { ticks = []; }
    const labeled = ticks
      .filter((t) => t && t.label && Number.isFinite(t.x))
      .map((t) => ({ x: Math.round(t.x), label: String(t.label), idx: t.idx }))
      .sort((a, b) => a.x - b.x);
    return {
      ok: true,
      tf: String(ch.currentTimeframe || ''),
      count: labeled.length,
      labels: labeled,
    };
  });
}

/** TF-switch commit probe (tranche F) — extends readAxis21. */
async function readTfSwitchAxisCommitProbe(page, panelId = 'A') {
  const axis21 = await readAxis21(page, panelId);
  const anchor = await readTimeAxisAnchorProbe(page, panelId, 0.85);
  if (!axis21 || !anchor || !anchor.ok) return { ok: false, axis21, anchor };
  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  const skew = await frame.evaluate((playheadIdx) => {
    const ch = window.chart;
    if (!ch || !ch.data || playheadIdx < 0) return null;
    const bar = ch.data[playheadIdx];
    const tfMs = typeof ch.parseTimeframe === 'function'
      ? Number(ch.parseTimeframe(ch.currentTimeframe)) : NaN;
    const x = typeof ch.dataIndexToPixel === 'function'
      ? ch.dataIndexToPixel(playheadIdx) : NaN;
    let axisLabel = '';
    let best = Infinity;
    for (const t of (ch._timeTicks || [])) {
      if (!t || !t.label || !Number.isFinite(t.x)) continue;
      const d = Math.abs(t.x - x);
      if (d < best) { best = d; axisLabel = String(t.label); }
    }
    return {
      playheadTs: bar && bar.t,
      tfMs,
      axisLabel,
      labelDistPx: best,
      destBarsMatched: typeof ch._committedBarsMatchTimeframe === 'function'
        ? ch._committedBarsMatchTimeframe(ch.currentTimeframe) : null,
    };
  }, anchor.barIdx).catch(() => null);
  return { ok: true, axis21, anchor, skew };
}
```

### Switch constants (add next to `A1_TRANCHE_G_SWITCH`)

```javascript
const A1_TRANCHE_B_SWITCH = '__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX';
const A1_TRANCHE_A_SWITCH = '__TALARIA_DISABLE_AXIS_CLICK_TICK_INVALIDATION_FIX';
const A1_TRANCHE_F_SWITCH = '__TALARIA_DISABLE_TF_SWITCH_AXIS_DATA_COMMIT_FIX';
const A1_TRANCHE_E_SWITCH = '__TALARIA_DISABLE_REPLAY_TIME_AXIS_ZOOM_ANCHOR_FIX';
const A1_TRANCHE_C_SWITCH = '__TALARIA_DISABLE_CUSTOM_TF_TIME_ANCHOR_TICK_FIX';
```

---

## H-A1-B — Right-edge grid align (tranche B)

| Field | Value |
|-------|--------|
| **Tickets** | TAL-01565 (grid), TAL-01618, TAL-01625, TAL-01639 (grid half) |
| **Switch** | `window.__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX` |
| **RC** | Tick-math (+ RC-2 tail when fast/full toggles) |
| **Owner** | `chart.js` — `_fillTimeTicksToViewport`, `_fastTimeTickAlignStart`, `_buildTimeTicksFast` |
| **Reference** | T2 step 2 defect 2; diagnostic `A1-axis-family-diagnostic-2026-07-17.md` |

### Topology

```javascript
runWith(ctx, { pair: 'same', panels: 1, tf: '30m' }, ...)
```

Host tile **A** only (in-process `window.chart`). Native **30m** → half-hour cadence (`labelIntervalMs = 1_800_000`).

### Setup

1. `waitBootSettled(page, ['A'], 20_000)` + `sleep(400)`.
2. Zoom until **8–14** labeled verticals visible: call existing `wheelZoomOutPanel(page, 'A', 18)` then optional zoom-in ticks until `readTimeAxisTailProbe.tailCount >= 3`.
3. **Do not pan** after zoom (pan optional as secondary leg — tail bug visible at idle settle).

### Actuation (real)

| Step | Actuation | I15 |
|------|-----------|-----|
| Zoom settle | `wheelZoomOutPanel` — real `WheelEvent` on `#chartCanvas` (see `scenarios.mjs:928`) | Real wheel |
| (Optional stress) | Short `dragCellRightBackward(page, 'A', { strokes: 1, distancePx: 80 })` then release | Real mouse pan |

### Measurement (end-state)

Use `readTimeAxisTailProbe(page, 'A')` — **not** screenshot, **not** tick count alone.

### Pass criteria (fix ON — `expectFixOn === true`)

| Check id | Assertion |
|----------|-----------|
| `H-A1-B setup: 30m tail has labeled ticks` | `tailCount >= 3` |
| `H-A1-B CORE: right-edge bar times TF-aligned` | `misaligned === 0` |
| `H-A1-B CORE: tail spacing matches interior` | `tailSpacingRatio <= 1.25` when `interiorSpacingRatio` finite |
| `H-A1-B CORE: no filler index-step drift` | Last 3 `tailDetail` entries all `aligned === true` |

### Switch-OFF discriminator (`expectFixOn === false`)

| Check id | Assertion (must FAIL when fix ON) |
|----------|-----------------------------------|
| `H-A1-B switch-OFF: tail misalignment RED` | `misaligned >= 1` **OR** `tailSpacingRatio > 1.4` |

Pre-fix RED evidence: run fix-ON checks **before** tranche B lands → expect `misaligned >= 1` on 30m right edge (mechanism: `_fillTimeTicksToViewport` index-step filler).

### Scenario skeleton

```javascript
async function hA1B(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '30m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await page.evaluate((f) => { try { delete window[f]; } catch (_) { window[f] = undefined; } }, A1_TRANCHE_B_SWITCH);
    await hA1BCore(page, checks, true);
    await page.evaluate((f) => { window[f] = true; }, A1_TRANCHE_B_SWITCH);
    await hA1BCore(page, checks, false, true);
    await page.evaluate((f) => { try { delete window[f]; } catch (_) { window[f] = undefined; } }, A1_TRANCHE_B_SWITCH);
    return checks;
  });
}
```

### Gate

```text
node run.mjs --only=H-A1-B --runs=10
```

---

## H-A1-A — Click tick stability (tranche A)

| Field | Value |
|-------|--------|
| **Tickets** | TAL-01565 (click), TAL-01583, (TAL-01604 if click repro) |
| **Switch** | `window.__TALARIA_DISABLE_AXIS_CLICK_TICK_INVALIDATION_FIX` |
| **RC** | RC-2 invalidation (fast vs full tick builder on no-move click) |
| **Owner** | `chart.js` — `render()` tick branch, pan mousedown/`panCommitted`, mouseup click cleanup |
| **Note** | Partial guard exists (`panCommitted`); tranche A completes contract |

### Topology

```javascript
runWith(ctx, { pair: 'same', panels: 1, tf: '30m' }, ...)
```

Alternative TF **`1h`** acceptable if 30m calendar-mode flaky — prefer **30m** (ticket repro).

### Setup

1. `waitBootSettled` + zoom to ~60–120 visible bars (`wheelZoomOutPanel` 12–20).
2. `before = await readTimeAxisAnchorProbe(page, 'A', 0.50)` — record `labelAtX`, `barIdx`, `barTs`, `offsetX`.

### Actuation (real)

Single **plot click** with no drag (movement &lt; 5px):

```javascript
// Host A canvas center — page.mouse (not synthetic evaluate click)
const pt = await page.evaluate(() => {
  const canvas = document.getElementById('chartCanvas');
  const ch = window.chart;
  if (!canvas || !ch) return null;
  const r = canvas.getBoundingClientRect();
  const m = ch.margin || { l: 60, r: 60 };
  const x = r.left + m.l + (r.width - m.l - m.r) * 0.50;
  const y = r.top + r.height * 0.42;
  return { x: Math.round(x), y: Math.round(y) };
});
await page.mouse.move(pt.x, pt.y);
await page.mouse.click(pt.x, pt.y, { delay: 30 });
await sleep(120); // mouseup click cleanup + render
```

**Not** `dispatchEvent('click')` — must be Puppeteer mouse down/up.

### Pass criteria (fix ON)

| Check id | Assertion |
|----------|-----------|
| `H-A1-A setup: anchor probe ok` | `before.ok && before.labelAtX` |
| `H-A1-A CORE: offset unchanged on click` | `Math.abs(after.offsetX - before.offsetX) < 0.5` |
| `H-A1-A CORE: time label string stable` | `after.labelAtX === before.labelAtX` |
| `H-A1-A CORE: bar index at anchor unchanged` | `after.barIdx === before.barIdx` |

Optional stricter: `after.renderTf === before.renderTf`.

### Switch-OFF discriminator

| Check id | Assertion |
|----------|-----------|
| `H-A1-A switch-OFF: label jump RED` | `after.labelAtX !== before.labelAtX` **OR** `after.barIdx !== before.barIdx` while offset stable |

Pre-fix RED: label/day string changes on single click without horizontal scroll (T2 step 2 repro steps 1–5).

### Gate

```text
node run.mjs --only=H-A1-A --runs=10
```

---

## H-A1-F — TF-switch axis/data commit (tranche F)

| Field | Value |
|-------|--------|
| **Ticket** | TAL-01641 — *"changing the timeframe, the time and date axes display incorrect times"* |
| **Switch** | `window.__TALARIA_DISABLE_TF_SWITCH_AXIS_DATA_COMMIT_FIX` |
| **RC** | RC-2 + TF commit (`_endTimeframeSwitching`, axis-before-data) |
| **Owner** | `chart.js` — `_endTimeframeSwitching` (~21900), `_committedBarsMatchTimeframe`, tick cache invalidation |
| **Reference** | `readAxis21`, H-S21 sampling pattern |

### Topology

```javascript
runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, ...)
```

**Live chart** (replay optional second leg). Primary repro is non-replay TF change.

### Setup

1. `waitBootSettled(page, ['A'], 20_000)`.
2. `before = await readTfSwitchAxisCommitProbe(page, 'A')` at **1m**.

### Actuation (real)

Production host TF path:

```javascript
await hostSetTimeframe(page, '4h');  // harness-lib.mjs — ch.setTimeframe in-process
await sleep(600); // allow _endTimeframeSwitching + render settle
```

Optionally sample interim frames (50ms loop) like `switchTfDuringReplayAndSample` — assert `!sawMalformed` during switch.

### Pass criteria (fix ON)

| Check id | Assertion |
|----------|-----------|
| `H-A1-F setup: 1m baseline committed` | `before.axis21.dataMatchesTf === true` |
| `H-A1-F CORE: 4h bars committed at settle` | `after.axis21.tf === '4h' && after.axis21.dataMatchesTf === true` |
| `H-A1-F CORE: not stuck switching` | `after.axis21.switching === false` |
| `H-A1-F CORE: playhead axis label matches bar time` | `after.skew.labelDistPx < 80` and playhead bar ts aligns to 4h bucket (evaluate: `(playheadTs % tfMs) < 500`) |
| `H-A1-F CORE: dest bars matched` | `after.skew.destBarsMatched !== false` |

### Switch-OFF discriminator

| Check id | Assertion |
|----------|-----------|
| `H-A1-F switch-OFF: axis/data skew RED` | `after.axis21.dataMatchesTf === false` **OR** playhead ts not aligned to 4h **OR** `destBarsMatched === false` at settle |

Pre-fix RED: axis repaints 4h grid while `this.data` still 1m cadence → wrong labels at playhead (01641 screenshot class).

### Gate

```text
node run.mjs --only=H-A1-F --runs=10
```

---

## H-A1-E — Replay zoom axis anchor (tranche E)

| Field | Value |
|-------|--------|
| **Tickets** | TAL-01613, TAL-01639 (axis half) |
| **Switch** | `window.__TALARIA_DISABLE_REPLAY_TIME_AXIS_ZOOM_ANCHOR_FIX` |
| **RC** | Replay × wheel invalidation + tick rebuild |
| **Owner** | `chart.js` — wheel burst (`31939–31997`), `_finishWheelBurstInteraction`, `_clearPanTimeTickCache`, `useReplayIndexCadence` (~27554) |

### Topology

```javascript
runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, ...)
```

### Setup

1. `waitBootSettled` → `ts0 = await enterReplayPausedAll(page)` (real replay enter — `hostReplayEnter` + `broadcastCmd`).
2. `checks.check('H-A1-E setup: replay paused', ts0 != null)`.
3. Baseline zoom: `wheelZoomOutPanel(page, 'A', 14)` → ~40–80 bars visible.
4. `before = await readTimeAxisAnchorProbe(page, 'A', 0.40)`.

### Actuation (real)

**Wheel zoom-in** during paused replay (anchor near playhead):

```javascript
async function wheelZoomInPanel(page, id, ticks = 16) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  return frame.evaluate(async (n) => {
    const canvas = document.getElementById('chartCanvas');
    const ch = window.chart;
    if (!canvas || !ch) return { ok: false };
    const r = canvas.getBoundingClientRect();
    const cx = Math.round(r.left + r.width * 0.82);
    const cy = Math.round(r.top + r.height * 0.5);
    for (let i = 0; i < n; i++) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120, clientX: cx, clientY: cy,
      }));
      await new Promise((res) => setTimeout(res, 15));
    }
    return { ok: true, candleWidth: Number(ch.candleWidth) };
  }, ticks);
}
```

Then wait for wheel burst settle: `sleep(700)` or poll until `!ch._isWheelZoomBurst()`.

### Pass criteria (fix ON)

| Check id | Assertion |
|----------|-----------|
| `H-A1-E setup: replay active` | `before` probe with `replaySystem.isActive` via evaluate |
| `H-A1-E CORE: anchor bar index stable after zoom` | `after.barIdx === before.barIdx` |
| `H-A1-E CORE: anchor bar timestamp stable` | `after.barTs === before.barTs` |
| `H-A1-E CORE: canvas label at anchor stable` | `after.labelAtX === before.labelAtX` |

Interpretation: zoom may change `candleWidth` but the **historical bar** bound to viewport fraction **0.40** must not relabel to a different time.

### Switch-OFF discriminator

| Check id | Assertion |
|----------|-----------|
| `H-A1-E switch-OFF: relabel drift RED` | `after.barIdx !== before.barIdx` **OR** `after.labelAtX !== before.labelAtX` while `Math.abs(after.offsetX - before.offsetX) < 2` |

Pre-fix RED: 01613 — replay + zoom causes time label to slide with chart without user pan.

### Gate

```text
node run.mjs --only=H-A1-E --runs=10
```

---

## H-A1-C — Custom TF time anchor (tranche C)

| Field | Value |
|-------|--------|
| **Ticket** | TAL-01572 — custom 3m axis sparse; crosshair DOM label dominates |
| **Switch** | `window.__TALARIA_DISABLE_CUSTOM_TF_TIME_ANCHOR_TICK_FIX` |
| **RC** | Tick-math + label-source (canvas axis vs DOM `.time-label`) |
| **Owner** | `chart.js` — `_buildTimeTicks` else branch, `_getFastTimeLabelIntervalBars`, optional `updateCrosshair` split |

### Topology

```javascript
runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, ...)
```

### Setup

1. `waitBootSettled`.
2. Switch to custom TF in-process (no modal — harness API):

```javascript
await page.evaluate(() => {
  const ch = window.chart;
  if (!ch || typeof ch.setTimeframe !== 'function') return { ok: false };
  ch.setTimeframe('3m');
  return { ok: true, tf: ch.currentTimeframe };
});
await sleep(500);
```

3. Zoom to ~80–150 visible bars (`wheelZoomOutPanel` 10–16).
4. `snapshot0 = await readCanvasAxisLabelSnapshot(page, 'A')`.

### Actuation (real)

Crosshair move — **horizontal + vertical** on plot (proves canvas axis decoupled from crosshair DOM):

```javascript
const pt = await page.evaluate(() => { /* canvas center rect */ });
await page.mouse.move(pt.x, pt.y);
await sleep(80);
const snapshot1 = await readCanvasAxisLabelSnapshot(page, 'A');
await page.mouse.move(pt.x + 120, pt.y + 60);
await sleep(80);
const snapshot2 = await readCanvasAxisLabelSnapshot(page, 'A');
```

### Pass criteria (fix ON)

| Check id | Assertion |
|----------|-----------|
| `H-A1-C setup: on 3m TF` | `snapshot0.tf === '3m'` |
| `H-A1-C CORE: canvas has fixed axis labels` | `snapshot0.count >= 2` |
| `H-A1-C CORE: 3m time-aligned cadence` | Evaluate: consecutive labeled `idx` deltas imply 180_000ms bar spacing (3× 1m master) OR `_buildTimeTicks` majors every 3m wall-clock |
| `H-A1-C CORE: canvas labels stable across crosshair move` | `JSON.stringify(snapshot0.labels) === JSON.stringify(snapshot1.labels)` and same vs `snapshot2` |

**Crosshair DOM** `.time-label` **may** move — not asserted on fix ON (expected). Optionally log `document.querySelector('.time-label').textContent` for PO notes only.

### Switch-OFF discriminator

| Check id | Assertion |
|----------|-----------|
| `H-A1-C switch-OFF: sparse canvas axis RED` | `snapshot0.count < 2` **OR** canvas label set changes on crosshair move without TF/zoom change |

Pre-fix RED: only crosshair time label visible; canvas `_buildTimeTicks` sparse (`ceil(visible/8)` branch).

### Gate

```text
node run.mjs --only=H-A1-C --runs=10
```

---

## Lane 4 implementation checklist

When Worker 4 lands tranche **X**:

1. Implement gated fix in **both** `chart.js` mirrors (I8).
2. Bump `CHART_ENGINE_BUILD` + harness `serve.mjs` / `chart-embed.html` `?v=` (separate checkpoint per tranche or combined A1 bundle — Manager call).
3. Copy probe helpers + `hA1X` / `hA1XCore` from this spec into `scenarios.mjs`.
4. Register `{ id: 'H-A1-X', title: '...', run: hA1X }` in `scenarioList()`.
5. Run RED with switch deleted → CORE checks fail.
6. Run GREEN: `node run.mjs --only=H-A1-X --runs=10` → 10/10 PASS.
7. Worker report per `WORKER-REPORT-STANDARD.md` — status **DONE (dev only) — NEEDS-LIVE** until PO confirms on dist-v9.

### Suggested landing order (matches diagnostic dispatch)

| Order | Scenario | Tranche | Depends on |
|-------|----------|---------|------------|
| 1 | H-A1-B | B | — |
| 2 | H-A1-A | A | — |
| 3 | H-A1-F | F | — |
| 4 | H-A1-E | E | B helps grid half of 01639 |
| 5 | H-A1-C | C | — |

### Related existing scenarios (do not conflate)

| Id | Purpose |
|----|---------|
| **H-S21** | Finer TF acquire during replay — malformed axis / owner contract (BL-15), not tail filler |
| **H-S85** | Tranche G — indicator axis pill (implemented) |
| **H-S38/H-S39** | RC-2 drawing invalidation — different surface |

---

## I15 summary (all five)

| Scenario | Actuation | Measurement (end-state) |
|----------|-----------|-------------------------|
| H-A1-B | Real wheel (+ optional pan) | `_buildTimeTicks` tail alignment + spacing ratios |
| H-A1-A | Real `page.mouse.click` on canvas | Label string + barIdx + offsetX at fixed viewport X |
| H-A1-F | Real `hostSetTimeframe('4h')` | Committed bar cadence + playhead label/bar ts parity |
| H-A1-E | Real replay enter + wheel zoom-in | Anchor barIdx/barTs/label at viewport 0.40 stable |
| H-A1-C | Real `setTimeframe('3m')` + mouse move | Canvas `_timeTicks` labeled snapshot stable (≥2 labels) |

No synthetic greens: do not pass on `render()` count, tick count alone, or crosshair DOM-only reads for B/A/F/E.

---

## Status

**PRE-SPEC (read-only)** — scenarios **not** wired in `scenarios.mjs` until matching `chart.js` tranche lands. Tranche **G** reference implementation: **H-S85** (10/10 PASS on `20260718b02`).
