/**
 * DRAW-SMOKE-01 — the runtime half of market-time drawing persistence.
 *
 * `drawing-market-time-persist.test.mjs` proves that `_serializeDrawingForStorage`
 * refreshes its timestamp anchors before writing. It is a STATIC_SOURCE gate: it
 * calls one function with a mock and never opens a browser, never writes storage
 * and never reloads a page. Under SEAL-EVIDENCE-01 it cannot bless served bytes.
 * This is the other half — plant, refresh, read back from the served build.
 *
 * WHAT IT ACTUALLY ASSERTS, AND ONE THING IT CANNOT
 *
 * The ask was "trendline plus horizontal on two panels, refresh, assert both
 * persist on the correct panels at the correct prices". The first three hold. The
 * fourth is not a property this product has, and asserting it would encode a
 * defect:
 *
 *   `DrawingToolsManager.getStorageKey()` keys drawings on
 *   `chart_drawings_s{sessionId}_{fileId}` — the SYMBOL and session, never the
 *   panel letter. Panels are identified (`chart._getMultichartPanelId()`) for
 *   focus and settings routing, not for storage.
 *
 * The soak runs same-symbol by construction (`HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL`,
 * one file at 1m/5m/15m/1h) so that multi-timeframe sync has a common window. All
 * four panels therefore share one fileId and one drawings blob, and a drawing made
 * on any panel is EXPECTED to appear on all of them after a refresh. That is the
 * TradingView-shaped behaviour: a drawing belongs to the symbol.
 *
 * So "the correct panel" is asserted as: the drawing is present on the panel it was
 * planted on. Its presence elsewhere is recorded as an observation, not a failure.
 *
 * And the same-symbol layout turns out to give something stronger than the
 * per-panel check would have. The four panels are on FOUR DIFFERENT TIMEFRAMES. A
 * drawing planted on the 1m panel and read back on the 1h panel with byte-equal
 * anchors is a direct runtime proof that persistence is in market time: bar index
 * 4,000 on 1m is not bar index 4,000 on 1h, so an index-anchored drawing lands
 * somewhere else entirely. That is exactly the failure the unit test was written
 * against, observed on the served build instead of on a mock.
 *
 * WHY IT RIDES THE SMOKE AND NOT THE TEN-HOUR ARMS
 *
 * Same reasoning already applied to the N3 offline probe: planting drawings writes
 * bytes to storage, and the arms publish storage-retention figures. Contaminating
 * someone else's measurement to run my own is not a trade worth making, so this is
 * `--drawingsSmoke=1`, pushed only for `--smoke`. The planted byte cost is reported
 * either way so any diff that does include it can be corrected rather than guessed.
 */

/** Timestamps must match exactly; they are integers carried through JSON untouched. */
export const PRICE_EPSILON = 1e-9;

/** How long to wait for the load path to populate drawings after a reload. */
export const READBACK_TIMEOUT_MS = 15000;

/**
 * Plants one drawing in one frame, through the same entry point the mouse gesture
 * ends in: `DrawingToolsManager.addDrawing()`, which converts index-space points
 * to market time, pushes, renders and saves.
 *
 * Not driven by synthetic mouse events on purpose. A drag gesture would also
 * exercise hit-testing, snapping and tool selection, all of which fail in their own
 * ways and none of which are persistence. This step is a tourniquet for the
 * persistence chain; full drawings verification is a round-two row and should drive
 * the pointer.
 */
export const PLANT_IN_FRAME = (spec) => {
  const chart = window.chart;
  if (!chart || !chart.drawingManager) return { state: 'NO_CHART' };
  const mgr = chart.drawingManager;
  const data = chart.data;
  if (!Array.isArray(data) || data.length < 8) {
    return { state: 'NO_BARS', bars: Array.isArray(data) ? data.length : 0 };
  }
  const reg = mgr.toolRegistry && mgr.toolRegistry[spec.type];
  if (!reg || typeof reg.class !== 'function') return { state: 'TOOL_ABSENT', type: spec.type };

  // Anchor to real bars a little inside the right edge. The last bar is avoided:
  // during replay it is the playhead and is still being mutated.
  const i2 = Math.max(1, data.length - 3);
  const i1 = Math.max(0, i2 - 20);
  const priceOf = (b) => (b && (typeof b.close === 'number' ? b.close : b.c));
  const p2 = priceOf(data[i2]);
  const p1 = priceOf(data[i1]);
  if (typeof p1 !== 'number' || typeof p2 !== 'number') return { state: 'NO_PRICE' };

  const points = spec.type === 'horizontal'
    ? [{ x: i2, y: p2 }]
    : [{ x: i1, y: p1 }, { x: i2, y: p2 }];

  let drawing;
  try {
    drawing = new reg.class(points, {});
    mgr.addDrawing(drawing);
  } catch (err) {
    return { state: 'PLANT_THREW', why: String((err && err.message) || err).slice(0, 160) };
  }

  const anchors = Array.isArray(drawing.timestampPoints)
    ? drawing.timestampPoints.map((p) => ({ timestamp: p.timestamp, price: p.price }))
    : [];
  return {
    state: 'PLANTED',
    type: drawing.type,
    id: drawing.id,
    coordinateSystem: drawing.coordinateSystem,
    points: anchors,
    expectedPoints: spec.type === 'horizontal' ? 1 : 2,
    timeframe: chart.currentTimeframe || null,
    fileId: chart.currentFileId || null,
    panelId: typeof chart._getMultichartPanelId === 'function'
      ? (() => { try { return chart._getMultichartPanelId(); } catch { return null; } })()
      : null,
    isHost: window.top === window,
  };
};

/** Reads every drawing this frame currently holds, in market-time space. */
export const READ_IN_FRAME = () => {
  const chart = window.chart;
  if (!chart || !chart.drawingManager) return null;
  const mgr = chart.drawingManager;
  const drawings = (mgr.drawings || []).map((d) => ({
    id: d.id,
    type: d.type,
    coordinateSystem: d.coordinateSystem,
    points: Array.isArray(d.timestampPoints)
      ? d.timestampPoints.map((p) => ({ timestamp: p.timestamp, price: p.price }))
      : [],
  }));
  return {
    isHost: window.top === window,
    timeframe: chart.currentTimeframe || null,
    fileId: chart.currentFileId || null,
    panelId: typeof chart._getMultichartPanelId === 'function'
      ? (() => { try { return chart._getMultichartPanelId(); } catch { return null; } })()
      : null,
    bars: Array.isArray(chart.data) ? chart.data.length : 0,
    drawings,
  };
};

const labelOf = (f) => f.panelId || (f.isHost ? 'A(host)' : `tf:${f.timeframe || '?'}`);

/**
 * THE VERDICT, with no page and no puppeteer in it.
 *
 * Kept pure so every RED branch can be reached from a fixture. A grader that can
 * only be exercised by running a twenty-minute soak against a live canary is one
 * whose failure paths are never executed, which is the defect class this whole
 * gate family exists to answer -- and it would have to be re-run on the shared box
 * every time the logic changed.
 */
export function gradeDrawingsPersistence(planted, frames, opts = {}) {
  const epsilon = opts.epsilon ?? PRICE_EPSILON;
  const live = (frames || []).filter(Boolean);

  if (!planted || !planted.length) {
    return {
      state: 'DRAWINGS_NOT_PLANTED',
      ok: false,
      verdict: 'nothing was planted, so the refresh proved nothing about drawings',
      detail: 'An empty plant must never read as a pass: no drawings to lose is not the same as no drawings lost.',
      perDrawing: [],
    };
  }
  if (!live.length) {
    return {
      state: 'NO_PANELS_READ',
      ok: false,
      verdict: 'no frame exposed a chart after the refresh, so persistence is unmeasured',
      detail: 'Distinct from DRAWINGS_LOST: the panels themselves did not come back.',
      perDrawing: [],
    };
  }

  const perDrawing = planted.map((p) => {
    const hits = live
      .map((f) => ({ frame: f, hit: (f.drawings || []).find((d) => d.id === p.id) }))
      .filter((x) => x.hit);
    const foundOn = hits.map((x) => labelOf(x.frame));
    const home = hits.find((x) => labelOf(x.frame) === labelOf(p));

    if (!hits.length) {
      return {
        id: p.id, type: p.type, state: 'LOST', plantedOn: labelOf(p), foundOn: [],
        why: 'not present on any panel after the refresh',
      };
    }
    if (!home) {
      return {
        id: p.id, type: p.type, state: 'WRONG_PANEL', plantedOn: labelOf(p), foundOn,
        why: 'survived the refresh but is absent from the panel it was drawn on',
      };
    }

    const problems = [];
    for (const { frame, hit } of hits) {
      const where = labelOf(frame);
      if (hit.coordinateSystem !== 'timestamp') {
        problems.push(`${where}: coordinateSystem is "${hit.coordinateSystem}", not "timestamp" — `
          + 'anchored to bar index, so it moves when bars reload');
        continue;
      }
      if ((hit.points || []).length !== (p.points || []).length) {
        problems.push(`${where}: ${hit.points.length} anchor(s), planted with ${p.points.length}`);
        continue;
      }
      p.points.forEach((want, i) => {
        const got = hit.points[i];
        if (got.timestamp !== want.timestamp) {
          problems.push(`${where}: anchor ${i} market time ${got.timestamp} != planted ${want.timestamp} `
            + `(${Math.round((got.timestamp - want.timestamp) / 1000)}s out)`);
        }
        if (Math.abs(got.price - want.price) > epsilon) {
          problems.push(`${where}: anchor ${i} price ${got.price} != planted ${want.price}`);
        }
      });
    }

    // The cross-timeframe reading is the market-time proof: same anchors on a panel
    // whose bar indices are entirely different.
    const timeframes = [...new Set(hits.map((x) => x.frame.timeframe).filter(Boolean))];
    return {
      id: p.id,
      type: p.type,
      state: problems.length ? 'MOVED' : 'PERSISTED',
      plantedOn: labelOf(p),
      foundOn,
      timeframes,
      crossTimeframe: timeframes.length > 1,
      problems,
    };
  });

  const lost = perDrawing.filter((d) => d.state === 'LOST');
  const wrongPanel = perDrawing.filter((d) => d.state === 'WRONG_PANEL');
  const moved = perDrawing.filter((d) => d.state === 'MOVED');
  const kept = perDrawing.filter((d) => d.state === 'PERSISTED');

  if (lost.length) {
    return {
      state: 'DRAWINGS_LOST', ok: false, perDrawing,
      verdict: `${lost.length} of ${planted.length} drawing(s) did not survive the refresh`,
      detail: lost.map((d) => `${d.type} planted on ${d.plantedOn}`).join('; '),
    };
  }
  if (wrongPanel.length) {
    return {
      state: 'DRAWINGS_WRONG_PANEL', ok: false, perDrawing,
      verdict: `${wrongPanel.length} drawing(s) came back on the wrong panel`,
      detail: wrongPanel.map((d) => `${d.type}: planted ${d.plantedOn}, found ${d.foundOn.join(',') || 'nowhere'}`).join('; '),
    };
  }
  if (moved.length) {
    return {
      state: 'DRAWINGS_MOVED', ok: false, perDrawing,
      verdict: `${moved.length} drawing(s) survived but not at the planted price or market time`,
      detail: moved.flatMap((d) => d.problems).slice(0, 6).join(' | '),
    };
  }
  const cross = kept.filter((d) => d.crossTimeframe);
  return {
    state: 'DRAWINGS_PERSIST', ok: true, perDrawing,
    verdict: `${kept.length} drawing(s) survived the refresh at the planted price and market time`,
    detail: cross.length
      ? `${cross.length} of them read back identically across ${Math.max(...cross.map((d) => d.timeframes.length))} `
        + 'timeframes, which is the market-time anchoring proven at runtime'
      : 'all on a single timeframe: survival is proven, cross-timeframe anchoring is NOT',
  };
}

/** Plants a trendline on one panel and a horizontal level on another. */
export async function plantDrawings(page, { log = () => {} } = {}) {
  const frames = page.frames();
  const planted = [];
  const refusals = [];
  const wanted = ['trendline', 'horizontal'];
  let next = 0;

  for (const fr of frames) {
    if (next >= wanted.length) break;
    let res = null;
    try {
      res = await fr.evaluate(PLANT_IN_FRAME, { type: wanted[next] });
    } catch (err) {
      res = { state: 'EVALUATE_THREW', why: String(err).slice(0, 120) };
    }
    if (!res) continue;
    if (res.state === 'PLANTED') {
      planted.push(res);
      log(`drawings-smoke: planted ${res.type} on panel ${res.panelId || (res.isHost ? 'A(host)' : '?')} `
        + `(${res.timeframe || '?'}) at ${res.points.map((p) => p.price).join(', ')}`);
      next += 1;
    } else if (res.state !== 'NO_CHART') {
      refusals.push(res);
    }
  }
  return { planted, refusals, panelsSeen: frames.length };
}

/** Reads back after the reload, polling until the load path has run. */
export async function readDrawings(page, { timeoutMs = READBACK_TIMEOUT_MS, expectIds = [] } = {}) {
  const deadline = Date.now() + timeoutMs;
  let frames = [];
  let waitedMs = 0;
  for (;;) {
    frames = await Promise.all(page.frames().map(async (fr) => {
      try { return await fr.evaluate(READ_IN_FRAME); } catch { return null; }
    }));
    const seen = new Set(frames.filter(Boolean).flatMap((f) => (f.drawings || []).map((d) => d.id)));
    waitedMs = timeoutMs - (deadline - Date.now());
    if (!expectIds.length || expectIds.every((id) => seen.has(id))) break;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { frames: frames.filter(Boolean), waitedMs: Math.max(0, Math.round(waitedMs)) };
}
