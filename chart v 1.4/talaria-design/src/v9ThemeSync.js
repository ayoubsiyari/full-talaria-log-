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

function resolveV9Precision(settingsPrecision) {
  if (settingsPrecision == null) return null;
  const raw = String(settingsPrecision).trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "default") return { precision: "Default", pricePrecision: "default" };
  if (/^\d+$/.test(raw)) return { precision: raw, pricePrecision: raw };
  const dot = raw.indexOf(".");
  if (dot >= 0) {
    const decimals = Math.max(0, raw.length - dot - 1);
    const v = String(decimals);
    return { precision: v, pricePrecision: v };
  }
  return null;
}

const LEGACY_V9_TIMEZONE_LABELS = {
  UTC: "UTC",
  "UTC+3 (Riyadh)": "Europe/Moscow",
  "UTC+4 (Dubai)": "Asia/Dubai",
  "UTC+5:30 (IST)": "Asia/Kolkata",
  "UTC+8 (Asia)": "Asia/Singapore",
  "UTC-5 (EST)": "America/New_York",
  "UTC-8 (PST)": "America/Los_Angeles",
};

/** Legacy UI labels or any valid IANA zone id stored from Settings → Time zone */
function v9CandleBorderColorsDistinct(settings) {
  if (!settings) return false;
  const norm = (c) => String(c ?? "").trim().toLowerCase();
  return norm(settings.bullBorder) !== norm(settings.bullBody)
    || norm(settings.bearBorder) !== norm(settings.bearBody);
}

export function resolveV9TimezoneToId(value) {
  if (value == null || value === "") return "UTC";
  const v = String(value).trim();
  if (Object.prototype.hasOwnProperty.call(LEGACY_V9_TIMEZONE_LABELS, v)) {
    return LEGACY_V9_TIMEZONE_LABELS[v];
  }
  if (v === "UTC") return "UTC";
  if (/^[A-Za-z_]+\/.+$/.test(v)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v });
      return v;
    } catch (_) {
      /* fall through */
    }
  }
  return "UTC";
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
  // V9 settings UI exposes textColor (OHLC + axis labels). scaleTextColor is legacy
  // state that must not override template / picker updates.
  const axisTextColor = settings.textColor ?? settings.scaleTextColor;
  const normalizeTvCandle = (value, legacySet, target) => {
    const v = String(value || "").trim().toLowerCase();
    return legacySet.has(v) ? target : value;
  };
  const legacyUp = new Set(["#00d4a1", "#00d4aa", "#26a69a", "#00d4a0", "#4caf50", "#00bcd4"]);
  const legacyDown = new Set(["#ff5068", "#ff4757", "#ef5350", "#ff4081", "#ff6b6b"]);
  const bullBody = settings.bullBody != null ? normalizeTvCandle(settings.bullBody, legacyUp, "#089981") : null;
  const bullBorder = settings.bullBorder != null ? normalizeTvCandle(settings.bullBorder, legacyUp, "#089981") : null;
  const bullWick = settings.bullWick != null ? normalizeTvCandle(settings.bullWick, legacyUp, "#089981") : null;
  const bearBody = settings.bearBody != null ? normalizeTvCandle(settings.bearBody, legacyDown, "#f23645") : null;
  const bearBorder = settings.bearBorder != null ? normalizeTvCandle(settings.bearBorder, legacyDown, "#f23645") : null;
  const bearWick = settings.bearWick != null ? normalizeTvCandle(settings.bearWick, legacyDown, "#f23645") : null;
  const map = {
    bodyUpColor: bullBody,
    candleUpColor: bullBody,
    borderUpColor: bullBorder,
    wickUpColor: bullWick,
    bodyDownColor: bearBody,
    candleDownColor: bearBody,
    borderDownColor: bearBorder,
    wickDownColor: bearWick,
    backgroundColor: settings.background,
    gridColor: settings.gridColor,
    crosshairColor: settings.crosshairColor,
    priceLineColor: settings.priceLineColor,
    showPriceLine: settings.priceLine,
    scaleTextColor: axisTextColor,
    symbolTextColor: axisTextColor,
    scaleLinesColor: settings.scaleLineColor,
    timeFormat: settings.timeFormat,
    timezone: settings.timezone,
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
  if (typeof settings.showOrderHistory === "boolean" && cs.showOrderHistory !== settings.showOrderHistory) {
    cs.showOrderHistory = settings.showOrderHistory;
    changed = true;
  }
  if (typeof settings.showOpenOrders === "boolean" && cs.showOpenOrders !== settings.showOpenOrders) {
    cs.showOpenOrders = settings.showOpenOrders;
    changed = true;
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
  const wantBorders = v9CandleBorderColorsDistinct(settings) || cs.showCandleBorders !== false;
  if (cs.showCandleBorders !== wantBorders) {
    cs.showCandleBorders = wantBorders;
    changed = true;
  }
  const p = resolveV9Precision(settings.precision);
  if (p) {
    if (cs.precision !== p.precision) {
      cs.precision = p.precision;
      changed = true;
    }
    if (cs.pricePrecision !== p.pricePrecision) {
      cs.pricePrecision = p.pricePrecision;
      changed = true;
    }
  }
  if (applyCanvasTheme(cs, settings)) changed = true;
  try {
    const tm = typeof window !== "undefined" ? window.timezoneManager : null;
    const tzId = resolveV9TimezoneToId(settings.timezone);
    if (tm && typeof tm.setTimezone === "function" && tm.getTimezone?.()?.id !== tzId) {
      tm.setTimezone(tzId);
      changed = true;
    }
  } catch (_) {}

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
      if (typeof settings.showOrderHistory === "boolean") {
        pcs.showOrderHistory = settings.showOrderHistory;
      }
      if (typeof settings.showOpenOrders === "boolean") {
        pcs.showOpenOrders = settings.showOpenOrders;
      }
      if (pcs.unifiedBarColorEnabled !== wantUnified) pcs.unifiedBarColorEnabled = wantUnified;
      if (settings.unifiedBarColorVal) pcs.unifiedBarColor = settings.unifiedBarColorVal;
      if (p) {
        pcs.precision = p.precision;
        pcs.pricePrecision = p.pricePrecision;
      }
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
