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

  /**
   * @param {object} settings V9 settings state (same shape as TalariaV8bLive useState)
   * @returns {boolean} true if chart was ready and sync ran; false if window.chart not ready
   */
  function talariaApplyV9ThemeSettings(settings) {
    if (!settings) return true;
    var chart = window.chart;
    if (!chart || !chart.chartSettings) return false;
    var cs = chart.chartSettings;
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
      scaleTextColor: settings.textColor,
      symbolTextColor: settings.textColor,
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
