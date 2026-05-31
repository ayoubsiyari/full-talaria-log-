/**
 * V9 settings panel (React) → chart.js chartSettings.
 * Loaded by talaria-design live/index.html and chart/legacy-index.html so theme
 * sync is one implementation, independent of bundle load order.
 */
(function () {
  'use strict';

  function applyCanvasTheme(targetCs, settings) {
    var c = false;
    var wantGrid = !!settings.gridLinesOn;
    if (targetCs.showGrid !== wantGrid) {
      targetCs.showGrid = wantGrid;
      c = true;
    }
    var gridStyleVal = wantGrid ? 'Vert and horz' : 'None';
    if (targetCs.gridStyle !== gridStyleVal) {
      targetCs.gridStyle = gridStyleVal;
      c = true;
    }
    var gMap = { solid: 'solid', dashed: 'dashed', dotted: 'dotted', longDash: 'longDash' };
    var gPat = gMap[settings.gridLineStyle] || 'solid';
    if (targetCs.gridPattern !== gPat) {
      targetCs.gridPattern = gPat;
      c = true;
    }
    var gLw = Math.max(1, parseInt(settings.gridLineThickness, 10) || 1);
    if (targetCs.gridLineWidth !== gLw) {
      targetCs.gridLineWidth = gLw;
      c = true;
    }

    var wantCross = settings.crosshairOn !== false;
    if (targetCs.showCrosshair !== wantCross) {
      targetCs.showCrosshair = wantCross;
      c = true;
    }
    var cxPat = settings.crosshairStyle || 'dashed';
    if (cxPat === 'longDash') cxPat = 'dashed';
    if (cxPat !== 'solid' && cxPat !== 'dotted') cxPat = 'dashed';
    if (targetCs.crosshairPattern !== cxPat) {
      targetCs.crosshairPattern = cxPat;
      c = true;
    }

    var pMap = { solid: 'solid', dashed: 'dashed', dotted: 'dotted', longDash: 'longDash' };
    var pPat = pMap[settings.priceLineStyle] || 'solid';
    if (targetCs.priceLinePattern !== pPat) {
      targetCs.priceLinePattern = pPat;
      c = true;
    }
    var pLw = Math.max(1, parseInt(settings.priceLineThickness, 10) || 1);
    if (targetCs.priceLineWidth !== pLw) {
      targetCs.priceLineWidth = pLw;
      c = true;
    }
    return c;
  }

  function resolveV9Precision(settingsPrecision) {
    if (settingsPrecision == null) return null;
    var raw = String(settingsPrecision).trim();
    if (!raw) return null;
    if (raw.toLowerCase() === 'default') return { precision: 'Default', pricePrecision: 'default' };
    if (/^\d+$/.test(raw)) return { precision: raw, pricePrecision: raw };
    var dot = raw.indexOf('.');
    if (dot >= 0) {
      var decimals = Math.max(0, raw.length - dot - 1);
      var v = String(decimals);
      return { precision: v, pricePrecision: v };
    }
    return null;
  }

  function resolveV9Tz(value) {
    var LEGACY = {
      'UTC': 'UTC',
      'UTC+3 (Riyadh)': 'Europe/Moscow',
      'UTC+4 (Dubai)': 'Asia/Dubai',
      'UTC+5:30 (IST)': 'Asia/Kolkata',
      'UTC+8 (Asia)': 'Asia/Singapore',
      'UTC-5 (EST)': 'America/New_York',
      'UTC-8 (PST)': 'America/Los_Angeles'
    };
    if (value == null || value === '') return 'UTC';
    var v = String(value).trim();
    if (Object.prototype.hasOwnProperty.call(LEGACY, v)) return LEGACY[v];
    if (v === 'UTC') return 'UTC';
    if (/^[A-Za-z_]+\/.+$/.test(v)) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: v });
        return v;
      } catch (e0) { /* invalid */ }
    }
    return 'UTC';
  }

  function mapV9TimezoneToId(tzLabel) {
    return resolveV9Tz(tzLabel);
  }

  function v9CandleBorderColorsDistinct(settings) {
    if (!settings) return false;
    var norm = function (c) { return String(c == null ? '' : c).trim().toLowerCase(); };
    return norm(settings.bullBorder) !== norm(settings.bullBody)
      || norm(settings.bearBorder) !== norm(settings.bearBody);
  }

  function parseColorRgb(color) {
    if (color == null) return null;
    var value = String(color).trim();
    if (!value) return null;
    if (value.charAt(0) === '#') {
      var hex = value.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex.charAt(0) + hex.charAt(0), 16),
          parseInt(hex.charAt(1) + hex.charAt(1), 16),
          parseInt(hex.charAt(2) + hex.charAt(2), 16)
        ];
      }
      if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
      return null;
    }
    var rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
    }
    return null;
  }

  function isLightBackground(color) {
    var rgb = parseColorRgb(color);
    if (!rgb) return false;
    var brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128;
  }

  function contrastingAxisTextColor(backgroundColor) {
    return isLightBackground(backgroundColor) ? '#000000' : '#FFFFFF';
  }

  function resolveAxisTextColor(settings) {
    var bg = settings && settings.background;
    var preferred = settings && settings.textColor != null ? settings.textColor : settings && settings.scaleTextColor;
    if (!bg) return preferred || '#FFFFFF';
    if (!preferred) return contrastingAxisTextColor(bg);
    if (isLightBackground(bg) === isLightBackground(preferred)) return contrastingAxisTextColor(bg);
    return preferred;
  }

  /**
   * @param {object} settings V9 settings state (same shape as TalariaV8bLive useState)
   * @returns {boolean} true if chart was ready and sync ran; false if window.chart not ready
   */
  function talariaApplyV9ThemeSettings(settings) {
    if (!settings) return true;
    var chart = window.chart;
    if (!chart || !chart.chartSettings) return false;
    var cs = chart.chartSettings;
    // Auto-flip axis/OHLC text when background and text share the same lightness.
    var axisTextColor = resolveAxisTextColor(settings);
    var map = {
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
      scaleTextColor: axisTextColor,
      symbolTextColor: axisTextColor,
      scaleLinesColor: settings.scaleLineColor,
      timeFormat: settings.timeFormat,
      timezone: settings.timezone
    };
    var changed = false;
    var k;
    for (k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var v = map[k];
      if (v == null) continue;
      if (cs[k] !== v) {
        cs[k] = v;
        changed = true;
      }
    }
    var wantUnified = !!settings.unifiedBarColor;
    if (cs.unifiedBarColorEnabled !== wantUnified) {
      cs.unifiedBarColorEnabled = wantUnified;
      changed = true;
    }
    if (settings.unifiedBarColorVal && cs.unifiedBarColor !== settings.unifiedBarColorVal) {
      cs.unifiedBarColor = settings.unifiedBarColorVal;
      changed = true;
    }
    var wantBorders = v9CandleBorderColorsDistinct(settings) || cs.showCandleBorders !== false;
    if (cs.showCandleBorders !== wantBorders) {
      cs.showCandleBorders = wantBorders;
      changed = true;
    }
    var p = resolveV9Precision(settings.precision);
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
      var tm = typeof window !== 'undefined' ? window.timezoneManager : null;
      var tzId = resolveV9Tz(settings.timezone);
      if (tm && typeof tm.setTimezone === 'function') {
        var cur = tm.getTimezone && tm.getTimezone();
        if (!cur || cur.id !== tzId) {
          tm.setTimezone(tzId);
          changed = true;
        }
      }
    } catch (e0) {}

    if (!changed) return true;

    try {
      if (chart.applyChartSettings) chart.applyChartSettings();
    } catch (e1) {}
    try {
      if (chart.render) chart.render();
    } catch (e2) {}

    try {
      var panels = window.panelManager && window.panelManager.getPanels ? window.panelManager.getPanels() : [];
      var i;
      for (i = 0; i < panels.length; i++) {
        var p = panels[i];
        var pc = p && p.chartInstance;
        if (!pc || pc === chart || !pc.chartSettings) continue;
        var pcs = pc.chartSettings;
        for (k in map) {
          if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
          v = map[k];
          if (v != null) pcs[k] = v;
        }
        if (pcs.unifiedBarColorEnabled !== wantUnified) pcs.unifiedBarColorEnabled = wantUnified;
        if (settings.unifiedBarColorVal) pcs.unifiedBarColor = settings.unifiedBarColorVal;
        if (p) {
          pcs.precision = p.precision;
          pcs.pricePrecision = p.pricePrecision;
        }
        applyCanvasTheme(pcs, settings);
        try {
          if (pc.applyChartSettings) pc.applyChartSettings();
        } catch (e3) {}
        try {
          if (pc.render) pc.render();
        } catch (e4) {}
      }
    } catch (e5) {}

    return true;
  }

  window.talariaApplyV9ThemeSettings = talariaApplyV9ThemeSettings;
})();
