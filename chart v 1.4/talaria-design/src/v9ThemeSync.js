/**
 * V9 settings state → window.chart.chartSettings.
 * Bundled with the live app so theme sync works even when /chart/modules/ is
 * proxied to a backend that does not host v9-theme-bridge.js (see vite.config.live.js).
 */

function applyCanvasTheme(targetCs, settings) {
  let c = false;
  const wantGrid = !!settings.gridLinesOn;
  if (targetCs.showGrid !== wantGrid) {
    targetCs.showGrid = wantGrid;
    c = true;
  }
  const gridStyleVal = wantGrid ? "Vert and horz" : "None";
  if (targetCs.gridStyle !== gridStyleVal) {
    targetCs.gridStyle = gridStyleVal;
    c = true;
  }
  const gMap = { solid: "solid", dashed: "dashed", dotted: "dotted", longDash: "longDash" };
  const gPat = gMap[settings.gridLineStyle] || "solid";
  if (targetCs.gridPattern !== gPat) {
    targetCs.gridPattern = gPat;
    c = true;
  }
  const gLw = Math.max(1, parseInt(settings.gridLineThickness, 10) || 1);
  if (targetCs.gridLineWidth !== gLw) {
    targetCs.gridLineWidth = gLw;
    c = true;
  }

  const wantCross = settings.crosshairOn !== false;
  if (targetCs.showCrosshair !== wantCross) {
    targetCs.showCrosshair = wantCross;
    c = true;
  }
  let cxPat = settings.crosshairStyle || "dashed";
  if (cxPat === "longDash") cxPat = "dashed";
  if (cxPat !== "solid" && cxPat !== "dotted") cxPat = "dashed";
  if (targetCs.crosshairPattern !== cxPat) {
    targetCs.crosshairPattern = cxPat;
    c = true;
  }

  const pMap = { solid: "solid", dashed: "dashed", dotted: "dotted", longDash: "longDash" };
  const pPat = pMap[settings.priceLineStyle] || "solid";
  if (targetCs.priceLinePattern !== pPat) {
    targetCs.priceLinePattern = pPat;
    c = true;
  }
  const pLw = Math.max(1, parseInt(settings.priceLineThickness, 10) || 1);
  if (targetCs.priceLineWidth !== pLw) {
    targetCs.priceLineWidth = pLw;
    c = true;
  }
  return c;
}

/**
 * @param {object} settings V9 settings state
 * @returns {boolean} true if chart exists and sync completed (or nothing to do); false if window.chart not ready
 */
export function applyV9ThemeSettingsToChart(settings) {
  if (!settings) return true;
  const chart = typeof window !== "undefined" ? window.chart : null;
  if (!chart || !chart.chartSettings) return false;
  const cs = chart.chartSettings;
  const map = {
    bodyUpColor: settings.bullBody,
    candleUpColor: settings.bullBody,
    borderUpColor: settings.bullBorder,
    wickUpColor: settings.bullWick,
    bodyDownColor: settings.bearBody,
    candleDownColor: settings.bearBody,
    borderDownColor: settings.bearBorder,
    wickDownColor: settings.bearWick,
    backgroundColor: settings.background,
    gridColor: settings.gridColor,
    crosshairColor: settings.crosshairColor,
    priceLineColor: settings.priceLineColor,
    showPriceLine: settings.priceLine,
    scaleTextColor: settings.textColor,
    symbolTextColor: settings.textColor,
  };
  let changed = false;
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v == null) continue;
    if (cs[k] !== v) {
      cs[k] = v;
      changed = true;
    }
  }
  const wantUnified = !!settings.unifiedBarColor;
  if (cs.unifiedBarColorEnabled !== wantUnified) {
    cs.unifiedBarColorEnabled = wantUnified;
    changed = true;
  }
  if (settings.unifiedBarColorVal && cs.unifiedBarColor !== settings.unifiedBarColorVal) {
    cs.unifiedBarColor = settings.unifiedBarColorVal;
    changed = true;
  }
  if (applyCanvasTheme(cs, settings)) changed = true;

  if (!changed) return true;

  try {
    chart.applyChartSettings?.();
  } catch (_) {}
  try {
    chart.render?.();
  } catch (_) {}

  try {
    const panels = window.panelManager?.getPanels?.() || [];
    for (const p of panels) {
      const pc = p?.chartInstance;
      if (!pc || pc === chart || !pc.chartSettings) continue;
      const pcs = pc.chartSettings;
      for (const k of Object.keys(map)) {
        const v = map[k];
        if (v != null) pcs[k] = v;
      }
      if (pcs.unifiedBarColorEnabled !== wantUnified) pcs.unifiedBarColorEnabled = wantUnified;
      if (settings.unifiedBarColorVal) pcs.unifiedBarColor = settings.unifiedBarColorVal;
      applyCanvasTheme(pcs, settings);
      try {
        pc.applyChartSettings?.();
      } catch (_) {}
      try {
        pc.render?.();
      } catch (_) {}
    }
  } catch (_) {}

  return true;
}
