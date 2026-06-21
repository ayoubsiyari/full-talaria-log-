/** Persist V9 Settings modal state (candles, canvas, grid, crosshair) across refresh/logout. */

export const V9_UI_SETTINGS_STORAGE_KEY = "v9_ui_settings";

const GRID_STYLE_TO_PATTERN = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
  longDash: "longDash",
};

const PATTERN_TO_GRID_STYLE = Object.fromEntries(
  Object.entries(GRID_STYLE_TO_PATTERN).map(([k, v]) => [v, k])
);

function readRaw(key) {
  if (typeof window === "undefined") return null;
  try {
    return window.userStorage?.getItem?.(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key, payload) {
  if (typeof window === "undefined") return;
  try {
    if (window.userStorage?.setItem) window.userStorage.setItem(key, payload);
    else localStorage.setItem(key, payload);
  } catch {
    /* quota / private mode */
  }
}

function mergeSettings(defaults, patch) {
  if (!patch || typeof patch !== "object") return { ...defaults };
  return { ...defaults, ...patch };
}

/** Reverse-map chart.js chartSettings → V9 settings object. */
export function chartSettingsToV9Settings(chartSettings, defaults = {}) {
  if (!chartSettings || typeof chartSettings !== "object") return { ...defaults };
  const cs = chartSettings;
  const out = { ...defaults };

  const pick = (v9Key, csKeys) => {
    for (const k of csKeys) {
      if (cs[k] !== undefined && cs[k] !== null) {
        out[v9Key] = cs[k];
        return;
      }
    }
  };

  pick("bullBody", ["bodyUpColor", "candleUpColor"]);
  pick("bullBorder", ["borderUpColor"]);
  pick("bullWick", ["wickUpColor"]);
  pick("bearBody", ["bodyDownColor", "candleDownColor"]);
  pick("bearBorder", ["borderDownColor"]);
  pick("bearWick", ["wickDownColor"]);
  pick("background", ["backgroundColor"]);
  pick("gridColor", ["gridColor"]);
  pick("crosshairColor", ["crosshairColor"]);
  pick("priceLineColor", ["priceLineColor"]);
  pick("scaleLineColor", ["scaleLinesColor"]);
  pick("textColor", ["scaleTextColor", "symbolTextColor"]);
  pick("unifiedBarColorVal", ["unifiedBarColor"]);
  pick("timezone", ["timezone"]);
  pick("timeFormat", ["timeFormat"]);

  if (typeof cs.showPriceLine === "boolean") out.priceLine = cs.showPriceLine;
  if (typeof cs.unifiedBarColorEnabled === "boolean") out.unifiedBarColor = cs.unifiedBarColorEnabled;
  if (typeof cs.showOrderHistory === "boolean") out.showOrderHistory = cs.showOrderHistory;
  if (typeof cs.showOpenOrders === "boolean") out.showOpenOrders = cs.showOpenOrders;

  if (cs.showGrid === false || cs.gridStyle === "None") {
    out.gridLinesOn = false;
  } else if (cs.showGrid === true || cs.gridStyle === "Vert and horz" || cs.gridStyle === "Vertical" || cs.gridStyle === "Horizontal") {
    out.gridLinesOn = true;
  }
  if (cs.gridPattern && PATTERN_TO_GRID_STYLE[cs.gridPattern]) {
    out.gridLineStyle = PATTERN_TO_GRID_STYLE[cs.gridPattern];
  }
  if (Number.isFinite(Number(cs.gridLineWidth))) {
    out.gridLineThickness = Math.max(1, parseInt(cs.gridLineWidth, 10) || 1);
  }

  if (typeof cs.showCrosshair === "boolean") out.crosshairOn = cs.showCrosshair;
  if (cs.crosshairPattern && PATTERN_TO_GRID_STYLE[cs.crosshairPattern]) {
    out.crosshairStyle = PATTERN_TO_GRID_STYLE[cs.crosshairPattern];
  }
  if (Number.isFinite(Number(cs.crosshairWidth))) {
    out.crosshairLineThickness = Math.max(1, parseInt(cs.crosshairWidth, 10) || 1);
  }

  if (cs.priceLinePattern && PATTERN_TO_GRID_STYLE[cs.priceLinePattern]) {
    out.priceLineStyle = PATTERN_TO_GRID_STYLE[cs.priceLinePattern];
  }
  if (Number.isFinite(Number(cs.priceLineWidth))) {
    out.priceLineThickness = Math.max(1, parseInt(cs.priceLineWidth, 10) || 1);
  }

  const prec = cs.pricePrecision ?? cs.precision;
  if (prec != null && String(prec).trim() !== "") {
    out.precision = String(prec).trim();
  }

  return out;
}

export function readV9UiSettingsLocal(defaults = {}) {
  if (typeof window === "undefined") return { ...defaults };

  const rawV9 = readRaw(V9_UI_SETTINGS_STORAGE_KEY);
  if (rawV9) {
    try {
      const parsed = JSON.parse(rawV9);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return mergeSettings(defaults, parsed);
      }
    } catch {
      /* fall through */
    }
  }

  const rawChart = readRaw("chartSettings");
  if (rawChart) {
    try {
      const cs = JSON.parse(rawChart);
      if (cs && typeof cs === "object") {
        return chartSettingsToV9Settings(cs, defaults);
      }
    } catch {
      /* ignore */
    }
  }

  return { ...defaults };
}

export function writeV9UiSettingsLocal(settings) {
  if (!settings || typeof settings !== "object") return;
  writeRaw(V9_UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function persistV9UiSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  writeV9UiSettingsLocal(settings);

  if (typeof window === "undefined") return;
  window.__talariaV9SettingsSnapshot = settings;

  const chart =
    (typeof window.getActiveChart === "function" ? window.getActiveChart() : null) ||
    window.chart ||
    null;

  const applyFn = window.talariaApplyV9ThemeSettings;
  if (chart?.chartSettings && typeof applyFn === "function") {
    try {
      applyFn(settings);
    } catch (_) {}
  }

  if (chart && typeof chart.saveSettings === "function") {
    try {
      chart.saveSettings();
    } catch (_) {}
  }
}
