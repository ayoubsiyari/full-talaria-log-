/**
 * MultichartGrid.jsx — Phase 7.2.2 (in-page iframe grid)
 *
 * Renders an in-page grid of dist-v9 iframes inside `#chart-container` when
 * the user picks layout > 1 from the React layout picker. Each iframe loads:
 *
 *   /chart/dist-v9/index.html?multichart=1&panelId=A&fileId=...&tf=...&mode=...
 *
 * The dist-v9 shim added in Phase 7.2.1 recognizes `?multichart=1` and:
 *   - adds `html.multichart-embed` so injected CSS hides chrome
 *   - hides every [data-v9-chrome="1"] element (top toolbar, left tools,
 *     bottom replay/balance bar, trade list, right panel) so each iframe
 *     collapses to chart canvas + axes + crosshair + OHLC legend
 *   - loads the verified bridge stack from /chart/multichart-prod/:
 *       1) engine-api-guards.js  (FORBIDDEN_SYNC_FIELDS + filter)
 *       2) sync-bridge.js         (iframe-side bridge)
 *       3) embed-bridge.js        (waits for window.chart, installs bridge,
 *                                  applies fileId/tf from URL)
 *
 * One MultichartManager (loaded lazily into the parent on first mount) owns
 * inter-iframe sync via the verified PEER topology + FORBIDDEN_SYNC_FIELDS
 * allowlist guard. Crosshair, visible-range, and symbol sync flow through
 * postMessage; price-axis remains independent per panel (the original-bug
 * guard).
 *
 * Layout 1 unmounts this entire component, exposing the parent's existing
 * `#chartWrapper` canvas — single-chart UX is byte-identical to before this
 * component existed.
 *
 * NOT YET WIRED in this phase:
 *   - Per-panel topbar action redirect (Phase 7.2.4)
 *   - Per-panel symbol/file picker overlay (Phase 7.2.4)
 *   - Layout picker in topbar (Phase 7.2.3) — for now uses existing
 *     right-panel layout tab.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Phase 7.2.5: tile id "A" is the HOST tile — it does NOT spawn an iframe.
// Instead, the parent's existing #chartWrapper (the original main chart with
// all its drawings, indicators, visible range, OHLC legend etc.) is moved
// into cell A's grid slot via inline left/top/width/height. This means:
//   - splitting 1→2v shows tile A INSTANTLY with the user's current chart
//   - tiles B/C/D are fresh iframes that boot independently
//   - drawings/indicators/replay state are all preserved on tile A across
//     every layout transition (no save/restore round-trip)
//   - returning to layout 1 unmounts the grid and the inline styles are
//     cleared, restoring #chartWrapper to its CSS default fill behavior
const HOST_PANEL_ID = "A";
const HOST_WRAPPER_ID = "chartWrapper";
const MULTICHART_GLOBAL_SETTINGS_ROOT_ID = "multichart-global-settings-root";
const HOST_CONTAINER_ID = "chart-container";

// ─── parent-side bridge loader ──────────────────────────────────────────────
//
// /chart/ does NOT load the bridge by default (it's only loaded inside
// iframes via the dist-v9 ?multichart=1 shim). When MultichartGrid mounts
// for the first time we lazily inject:
//   - engine-api-guards.js → window.MultichartGuards
//   - multichart-manager.js → window.MultichartManager
//
// Both scripts come from the static mount added in Phase 7.2.1
// (api_server.py /chart/multichart-prod/). Same-origin, no CORS.
//
// Cached as a module-level promise so subsequent mounts are instant.
// Cache-bust key for the multichart bridge scripts (multichart-manager.js,
// sync-bridge.js, panel-cmd-bridge.js, engine-api-guards.js). These are loaded
// at runtime via injectScript("…?v=" + BRIDGE_VERSION), so they are NOT covered
// by the build's HTML `?v=` rewrite (bump-dist-v9-cache.mjs only rewrites <script
// src> tags + SW_VERSION). When this was a hardcoded constant it stayed frozen
// across builds, so edits to the bridge scripts kept loading from the browser's
// stale cache while chart.js got a fresh `?v=` every build — a version skew that
// shows up as `panel-cmd timeout` (new chart.js talking to an old cached bridge).
// Track the per-build id (set in live/index.html <head>, bumped every build) so
// the bridge scripts cache-bust in lockstep with chart.js. Fallback keeps a
// stable key if the global is ever missing.
const BRIDGE_VERSION =
    (typeof window !== "undefined" && window.__TALARIA_CHART_BUILD_ID)
        ? String(window.__TALARIA_CHART_BUILD_ID)
        : "20260609b07";
let bridgeLoadPromise = null;

function loadParentBridge() {
    if (typeof window === "undefined") return Promise.reject(new Error("no window"));
    if (window.MultichartManager && window.MultichartGuards) return Promise.resolve();
    if (bridgeLoadPromise) return bridgeLoadPromise;

    function injectScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(
                'script[data-multichart-bridge="' + src + '"]'
            );
            if (existing) {
                if (existing.dataset.loaded === "1"
                    && existing.dataset.bridgeVersion === BRIDGE_VERSION) {
                    resolve();
                    return;
                }
                try { existing.remove(); } catch (_) {}
            }
            const s = document.createElement("script");
            s.src = src + "?v=" + BRIDGE_VERSION;
            s.async = false;
            s.dataset.multichartBridge = src;
            s.dataset.bridgeVersion = BRIDGE_VERSION;
            s.addEventListener("load", () => {
                s.dataset.loaded = "1";
                resolve();
            }, { once: true });
            s.addEventListener("error", () => reject(new Error("failed: " + src)), { once: true });
            document.head.appendChild(s);
        });
    }

    bridgeLoadPromise = injectScript("/chart/multichart-prod/engine-api-guards.js")
        // sync-bridge.js exposes window.MultichartBridge.installBridge.
        // Required to install the host bridge on the parent's window.chart
        // so tile A participates in crosshair / visible-range / symbol sync
        // alongside the iframe panels (B/C/D/…).
        .then(() => injectScript("/chart/multichart-prod/sync-bridge.js"))
        .then(() => injectScript("/chart/multichart-prod/multichart-manager.js"))
        .then(() => {
            if (!window.MultichartManager || !window.MultichartGuards || !window.MultichartBridge) {
                throw new Error("bridge scripts loaded but globals missing");
            }
        })
        .catch((err) => {
            bridgeLoadPromise = null; // allow retry
            throw err;
        });
    return bridgeLoadPromise;
}

// ─── host-bridge install (one-time per page) ────────────────────────────────
//
// The bridge monkey-patches `window.chart.broadcastCrosshairSync` and adds a
// global 'message' listener — both side-effects we should NOT redo every time
// MultichartGrid mounts. Cache the bridge instance on window so successive
// mounts (e.g. user goes 1 → 2v → 1 → 4) reuse it.
//
// Returns null if window.chart isn't ready yet; caller should retry.
function ensureHostBridge() {
    if (typeof window === "undefined") return null;
    if (window.__multichartBridgeVersion !== BRIDGE_VERSION) {
        try { delete window.__multichartHostBridge; } catch (_) {}
        window.__multichartBridgeVersion = BRIDGE_VERSION;
    }
    if (window.__multichartHostBridge) return window.__multichartHostBridge;
    if (!window.MultichartBridge) return null;
    const ch = window.chart;
    if (!ch) return null;
    try {
        const bridge = window.MultichartBridge.installBridge(ch, {
            chartId:      HOST_PANEL_ID,
            parentOrigin: "*",
            verbose:      false,
        });
        window.__multichartHostBridge = bridge;
        try { console.log("[MultichartGrid] host bridge installed on window.chart as", HOST_PANEL_ID); } catch (_) {}
        return bridge;
    } catch (err) {
        console.error("[MultichartGrid] installBridge on host failed:", err);
        return null;
    }
}

// Wait up to `timeoutMs` for window.chart to exist, then install the bridge.
// Resolves with the bridge or null if window.chart never appears.
function waitForHostBridge(timeoutMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => {
            const b = ensureHostBridge();
            if (b) { resolve(b); return; }
            if (Date.now() - t0 >= timeoutMs) { resolve(null); return; }
            setTimeout(tick, 100);
        };
        tick();
    });
}

// ─── layout templates ───────────────────────────────────────────────────────
//
// Maps a layout id (e.g. '2v', '3l', '4', '2x2') to a CSS grid description
// + per-tile placement. Tile ids are A, B, C, … so the same id space is
// used by per-panel state (focused panel, sync source, etc.).
//
// IDs and visual ordering MUST match TalariaV8bLive.jsx
// `LAYOUT_LY_LINES` + `LAYOUT_ID_MAP` so the dropdown preview matches what
// actually renders. Each entry below has a comment showing the matching
// `LAYOUT_LY_LINES` row so a future re-derivation is auditable.
const LAYOUT_TEMPLATES = {
    "1":   { cols: "1fr",     rows: "1fr",     tiles: [{ id: "A" }] },

    // ─── 2 panels ───────────────────────────────────────────────────────
    // 2v: vertical split  (LAYOUT_LY_LINES idx 0)
    "2v":  { cols: "1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }] },
    // 2h: horizontal split (LAYOUT_LY_LINES idx 1)
    "2h":  { cols: "1fr",     rows: "1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }] },

    // ─── 3 panels ───────────────────────────────────────────────────────
    // 3v: 3 columns
    "3v":  { cols: "1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }] },
    // 3h: 3 rows
    "3h":  { cols: "1fr",         rows: "1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }] },
    // 3l: 1 big left + 2 stacked right
    "3l":  { cols: "1fr 1fr",     rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1", gridRow: "1 / 3" },
                 { id: "B", gridColumn: "2", gridRow: "1" },
                 { id: "C", gridColumn: "2", gridRow: "2" },
             ] },
    // 3r: 2 stacked left + 1 big right
    "3r":  { cols: "1fr 1fr",     rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1", gridRow: "1" },
                 { id: "B", gridColumn: "1", gridRow: "2" },
                 { id: "C", gridColumn: "2", gridRow: "1 / 3" },
             ] },
    // 3t: 1 wide top + 2 small bottom
    "3t":  { cols: "1fr 1fr",     rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 3", gridRow: "1" },
                 { id: "B", gridColumn: "1",     gridRow: "2" },
                 { id: "C", gridColumn: "2",     gridRow: "2" },
             ] },
    // 3b: 2 small top + 1 wide bottom
    "3b":  { cols: "1fr 1fr",     rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1",     gridRow: "1" },
                 { id: "B", gridColumn: "2",     gridRow: "1" },
                 { id: "C", gridColumn: "1 / 3", gridRow: "2" },
             ] },

    // ─── 4 panels ───────────────────────────────────────────────────────
    // 4: 2x2 grid
    "4":   { cols: "1fr 1fr", rows: "1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] },
    // 4h: 4 stacked rows
    "4h":  { cols: "1fr",     rows: "1fr 1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] },
    // 4v: 4 columns
    "4v":  { cols: "1fr 1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] },
    // 4b: 3 small top + 1 wide bottom (LAYOUT_LY_LINES idx 3)
    "4b":  { cols: "1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1",     gridRow: "1" },
                 { id: "B", gridColumn: "2",     gridRow: "1" },
                 { id: "C", gridColumn: "3",     gridRow: "1" },
                 { id: "D", gridColumn: "1 / 4", gridRow: "2" },
             ] },
    // 4t: 1 wide top + 3 small bottom (LAYOUT_LY_LINES idx 4)
    "4t":  { cols: "1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 4", gridRow: "1" },
                 { id: "B", gridColumn: "1",     gridRow: "2" },
                 { id: "C", gridColumn: "2",     gridRow: "2" },
                 { id: "D", gridColumn: "3",     gridRow: "2" },
             ] },
    // 4l: 1 tall left + 3 stacked right (LAYOUT_LY_LINES idx 5)
    "4l":  { cols: "1fr 1fr", rows: "1fr 1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1", gridRow: "1 / 4" },
                 { id: "B", gridColumn: "2", gridRow: "1" },
                 { id: "C", gridColumn: "2", gridRow: "2" },
                 { id: "D", gridColumn: "2", gridRow: "3" },
             ] },
    // 4r: 3 stacked left + 1 tall right (LAYOUT_LY_LINES idx 6)
    "4r":  { cols: "1fr 1fr", rows: "1fr 1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1", gridRow: "1" },
                 { id: "B", gridColumn: "1", gridRow: "2" },
                 { id: "C", gridColumn: "1", gridRow: "3" },
                 { id: "D", gridColumn: "2", gridRow: "1 / 4" },
             ] },
    // 4tl: 1 big left + 1 wide top-right + 2 small bottom-right (LAYOUT_LY_LINES idx 7)
    "4tl": { cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 3", gridRow: "1 / 3" },
                 { id: "B", gridColumn: "3 / 5", gridRow: "1" },
                 { id: "C", gridColumn: "3",     gridRow: "2" },
                 { id: "D", gridColumn: "4",     gridRow: "2" },
             ] },

    // ─── 5 panels ───────────────────────────────────────────────────────
    // 5a: 2 top + 3 bottom (LAYOUT_LY_LINES idx 0)
    "5a":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 4", gridRow: "1" },
                 { id: "B", gridColumn: "4 / 7", gridRow: "1" },
                 { id: "C", gridColumn: "1 / 3", gridRow: "2" },
                 { id: "D", gridColumn: "3 / 5", gridRow: "2" },
                 { id: "E", gridColumn: "5 / 7", gridRow: "2" },
             ] },
    // 5b: 3 top + 2 bottom (LAYOUT_LY_LINES idx 1)
    "5b":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 3", gridRow: "1" },
                 { id: "B", gridColumn: "3 / 5", gridRow: "1" },
                 { id: "C", gridColumn: "5 / 7", gridRow: "1" },
                 { id: "D", gridColumn: "1 / 4", gridRow: "2" },
                 { id: "E", gridColumn: "4 / 7", gridRow: "2" },
             ] },
    // 5c: 1 big left + 4-tile 2x2 right (LAYOUT_LY_LINES idx 2)
    "5c":  { cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 3", gridRow: "1 / 3" },
                 { id: "B", gridColumn: "3",     gridRow: "1" },
                 { id: "C", gridColumn: "4",     gridRow: "1" },
                 { id: "D", gridColumn: "3",     gridRow: "2" },
                 { id: "E", gridColumn: "4",     gridRow: "2" },
             ] },
    // 5v: 5 columns
    "5v":  { cols: "1fr 1fr 1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }] },
    // 5h: 5 rows
    "5h":  { cols: "1fr", rows: "1fr 1fr 1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }] },

    // ─── 6 panels ───────────────────────────────────────────────────────
    // 6: 3 cols x 2 rows (LAYOUT_LY_LINES idx 0)
    "6":   { cols: "1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }] },
    // 6b: 2 cols x 3 rows (LAYOUT_LY_LINES idx 1)
    "6b":  { cols: "1fr 1fr", rows: "1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }] },
    // 6v: 6 columns
    "6v":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }] },
    // 6h: 6 rows
    "6h":  { cols: "1fr", rows: "1fr 1fr 1fr 1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }] },

    // ─── 7 panels ───────────────────────────────────────────────────────
    // 7a: 3 top + 4 bottom (LAYOUT_LY_LINES idx 0). LCM(3,4)=12 column grid.
    "7a":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [
                 { id: "A", gridColumn: "1 / 5",   gridRow: "1" },
                 { id: "B", gridColumn: "5 / 9",   gridRow: "1" },
                 { id: "C", gridColumn: "9 / 13",  gridRow: "1" },
                 { id: "D", gridColumn: "1 / 4",   gridRow: "2" },
                 { id: "E", gridColumn: "4 / 7",   gridRow: "2" },
                 { id: "F", gridColumn: "7 / 10",  gridRow: "2" },
                 { id: "G", gridColumn: "10 / 13", gridRow: "2" },
             ] },
    // 7v: 7 columns
    "7v":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }] },

    // ─── 8 panels ───────────────────────────────────────────────────────
    // 8: 4 cols x 2 rows (LAYOUT_LY_LINES idx 0)
    "8":   { cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }, { id: "H" }] },
    // 8b: 2 cols x 4 rows (LAYOUT_LY_LINES idx 1)
    "8b":  { cols: "1fr 1fr", rows: "1fr 1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }, { id: "H" }] },
    // 8v: 8 columns
    "8v":  { cols: "1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }, { id: "H" }] },
    // 8h: 8 rows
    "8h":  { cols: "1fr", rows: "1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
             tiles: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }, { id: "H" }] },
};

// Closest-fit fallback for layout ids not in LAYOUT_TEMPLATES (defensive
// — every id in LAYOUT_LY_LINES / LAYOUT_ID_MAP IS templated above, but if
// a future variant is added to the dropdown without a matching template,
// fall back to the simplest grid for that panel count.
const PANEL_COUNT_FALLBACK = {
    1: "1",
    2: "2v",
    3: "3v",
    4: "4",
    5: "5v",
    6: "6",
    7: "7v",
    8: "8",
};

function resolveLayout(layoutId, panelCount) {
    if (layoutId && LAYOUT_TEMPLATES[layoutId]) return LAYOUT_TEMPLATES[layoutId];
    const fb = PANEL_COUNT_FALLBACK[panelCount] || "1";
    return LAYOUT_TEMPLATES[fb];
}

/**
 * Normalize tickers for order ↔ multichart panel matching (aligns with
 * multichart-manager `_normalizeSymbol`: strip slashes, dashes, spaces, dots).
 */
function normalizeOrderTickerForMirror(s) {
    if (s == null || s === "") return "";
    return String(s).replace(/[\/\-:\s\.]+/g, "").toUpperCase();
}

/** Manager iframe chart-state still uses the placeholder em-dash before the first full chart-state. */
function isPlaceholderMultichartSymbol(s) {
    const t = String(s == null ? "" : s).trim();
    if (!t) return true;
    return t === "—" || t === "–" || t === "-" || t === "…";
}

/** Cancel in-progress draw / rect select, clear armed tool; deselect shapes only when keepSelection is false (Escape). */
function dismissActiveDrawingTool(dm, mirrored = false, opts = null) {
    if (!dm) return false;
    const keepSelection = !!(opts && opts.keepSelection);
    if (dm.isRectSelecting) {
        if (typeof dm.cancelRectangularSelection === "function") {
            dm.cancelRectangularSelection();
        }
        return true;
    }
    if (dm.drawingState && dm.drawingState.isDrawing) {
        if (typeof dm.cancelDrawing === "function") dm.cancelDrawing();
        return true;
    }
    const had = !!(dm.currentTool
        || (dm.selectedDrawings && dm.selectedDrawings.length));
    if (!keepSelection && typeof dm.deselectAll === "function") dm.deselectAll();
    if (typeof dm.clearTool === "function") dm.clearTool(!!mirrored);
    else dm.currentTool = null;
    return had;
}

function isDrawingToolDismissKeyTarget(dm) {
    if (!dm) return false;
    return !!(dm.currentTool
        || (dm.drawingState && dm.drawingState.isDrawing)
        || dm.isRectSelecting
        || (dm.selectedDrawings && dm.selectedDrawings.length));
}

/**
 * Pixel gap between CSS grid tracks — must match `gap` on the multichart grid container.
 */
const MULTICHART_GRID_GAP_PX = 4;

/**
 * Parse `grid-column` / `grid-row` placement like "1 / 4" or shorthand "2".
 * When `spec` is missing, the tile is treated as spanning the full axis (auto-flow layouts).
 */
function parseGridLineRange(spec, maxLine) {
    if (spec == null || spec === "") {
        return { start: 1, end: maxLine };
    }
    const s = String(spec).trim();
    const parts = s.split(/\s*\/\s*/);
    if (parts.length === 1) {
        const n = parseInt(parts[0], 10);
        if (!Number.isFinite(n)) return { start: 1, end: maxLine };
        return { start: n, end: n + 1 };
    }
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { start: 1, end: maxLine };
    return { start: a, end: b };
}

/**
 * Column gutters where two tiles actually meet on a row (asymmetric layouts like 5a:
 * 2+3 split). Merges contiguous rows that share the same vertical boundary so we
 * still render one full-height handle when appropriate.
 */
function computeColumnSplitterSegments(layoutTiles, numColTracks, numRowTracks) {
    const maxColLine = numColTracks + 1;
    const maxRowLine = numRowTracks + 1;
    const tiles = layoutTiles.map((t) => ({
        id: t.id,
        col: parseGridLineRange(t.gridColumn, maxColLine),
        row: parseGridLineRange(t.gridRow, maxRowLine),
    }));
    const segments = [];
    for (let r = 0; r < numRowTracks; r++) {
        const inRow = tiles.filter(
            (t) => t.row.start <= r + 1 && t.row.end >= r + 2
        );
        inRow.sort((a, b) => a.col.start - b.col.start);
        for (let i = 1; i < inRow.length; i++) {
            const left = inRow[i - 1];
            const right = inRow[i];
            if (left.col.end !== right.col.start) continue;
            const line = left.col.end;
            const gutterIndex = line - 2;
            if (gutterIndex < 0 || gutterIndex >= numColTracks - 1) continue;
            const last = segments[segments.length - 1];
            if (last && last.gutterIndex === gutterIndex && last.row1 === r - 1) {
                last.row1 = r;
            } else {
                segments.push({ gutterIndex, row0: r, row1: r });
            }
        }
    }
    return segments;
}

/**
 * Row gutters where tiles stack vertically within a column strip — may be shorter than
 * full grid width (e.g. 3l). Adjacent column strips with the same horizontal boundary merge.
 */
function computeRowSplitterSegments(layoutTiles, numColTracks, numRowTracks) {
    const maxColLine = numColTracks + 1;
    const maxRowLine = numRowTracks + 1;
    const tiles = layoutTiles.map((t) => ({
        id: t.id,
        col: parseGridLineRange(t.gridColumn, maxColLine),
        row: parseGridLineRange(t.gridRow, maxRowLine),
    }));
    const segments = [];
    for (let c = 0; c < numColTracks; c++) {
        const inCol = tiles.filter(
            (t) => t.col.start <= c + 1 && t.col.end >= c + 2
        );
        inCol.sort((a, b) => a.row.start - b.row.start);
        for (let i = 1; i < inCol.length; i++) {
            const top = inCol[i - 1];
            const bot = inCol[i];
            if (top.row.end !== bot.row.start) continue;
            const line = top.row.end;
            const gutterIndex = line - 2;
            if (gutterIndex < 0 || gutterIndex >= numRowTracks - 1) continue;
            const last = segments[segments.length - 1];
            if (last && last.gutterIndex === gutterIndex && last.col1 === c - 1) {
                last.col1 = c;
            } else {
                segments.push({ gutterIndex, col0: c, col1: c });
            }
        }
    }
    return segments;
}

/** Top/left pixel start and end of each grid track (excluding gaps inside the band). */
function trackBandsPx(fracs, totalPx, gap) {
    if (!fracs || !fracs.length || totalPx <= 0) return [];
    const sumF = fracs.reduce((a, b) => a + b, 0) || 1;
    const N = fracs.length;
    const avail = Math.max(0, totalPx - (N - 1) * gap);
    const out = [];
    let pos = 0;
    for (let i = 0; i < N; i++) {
        const sz = (fracs[i] / sumF) * avail;
        const start = pos;
        const end = pos + sz;
        out.push({ start, end });
        pos = end;
        if (i < N - 1) pos += gap;
    }
    return out;
}

/**
 * Read the parent page's main chart file + timeframe so iframe panels can
 * bootstrap even when React's initialFileId prop was still empty on the
 * first paint (chart.js finishes loading a tick later). multichart-manager
 * also calls window.__multichartRealData() as a URL fallback when cfg.fileId
 * is missing — without that hook, iframes boot with no fileId → embed-bridge
 * skips loadFileData → permanent "No data to display".
 */
function readHostChartFileAndTf() {
    try {
        const ch = window.chart;
        if (!ch) return { fileId: "", tf: "" };
        const fid = ch.currentFileId != null ? String(ch.currentFileId).trim() : "";
        const tf = typeof ch.currentTimeframe === "string" ? ch.currentTimeframe.trim() : "";
        return { fileId: fid, tf: tf };
    } catch (_) {
        return { fileId: "", tf: "" };
    }
}

/** Host tile A already has bars the iframe can clone (backtest master or live data). */
function hostHasCloneableBars(fileId) {
    try {
        const ch = window.chart;
        if (!ch || !fileId || String(ch.currentFileId) !== String(fileId)) return false;
        const prs = ch.replaySystem;
        if (prs && Array.isArray(prs.fullRawData) && prs.fullRawData.length > 0) return true;
        return Array.isArray(ch.data) && ch.data.length > 0;
    } catch (_) {
        return false;
    }
}

/**
 * Resolve `mode=` for iframe URLs from the **parent page URL only**.
 *
 * Do NOT infer from `window.chart.isBacktestMode` / `isPropFirmMode`: the
 * journal often opens backtest without `?mode=` on the URL while the chart
 * engine is already in a session. Adding `mode=backtest` in that case makes
 * embed-bridge skip `loadFileData` and defer to `checkBacktestingMode` →
 * `autoLoadBacktestingData`, which can fail to complete inside the iframe
 * (session/bootstrap/redirect timing) so the multichart manager never sees
 * `bridge-ready` and panels stick on "LOADING …".
 *
 * embed-bridge mirrors `parent.chart.backtestingSession` before
 * `loadFileData`, so the non-`mode=` path still loads the correct session
 * window for B/C/D (see embed-bridge.js "mirrored parent backtestingSession").
 */
function readUrlChartMode() {
    try {
        const u = new URLSearchParams(window.location.search || "");
        const m = (u.get("mode") || "").toLowerCase();
        if (m === "backtest" || m === "propfirm" || m === "live") return m;
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * True when every bridge-ready iframe's chart-state fileId matches the host's
 * currentFileId (or is still blank). Used so order mirror can fan to every tile
 * when all charts already share one dataset, without requiring Symbol sync on.
 */
function allReadyIframesShareHostFileForMirror(managerCharts, hostChart) {
    try {
        const ch = hostChart || (typeof window !== "undefined" ? window.chart : null);
        const hostFid = ch && ch.currentFileId != null ? String(ch.currentFileId) : "";
        if (!hostFid || !managerCharts || typeof managerCharts.values !== "function") {
            return false;
        }
        let n = 0;
        for (const c of managerCharts.values()) {
            if (!c || c.host || !c.ready) continue;
            n += 1;
            const fid = c.state && c.state.fileId != null ? String(c.state.fileId) : "";
            // chart-state fileId can lag empty after bridge-ready; treat
            // blank as "same dataset" unless we already know a different file.
            if (fid && fid !== hostFid) return false;
        }
        return n > 0;
    } catch (_) {
        return false;
    }
}

// ─── iframe URL ─────────────────────────────────────────────────────────────
function buildIframeSrc({ panelId, fileId, tf, sessionId, mode }) {
    const params = new URLSearchParams();
    params.set("multichart", "1");
    params.set("panelId", panelId);
    if (fileId)    params.set("fileId",    String(fileId));
    if (tf)        params.set("tf",        String(tf));
    if (sessionId) params.set("sessionId", String(sessionId));
    //
    // DELIBERATELY DO NOT forward `mode=backtest|propfirm` into panel
    // iframes.
    //
    // Forwarding mode makes chart.js's constructor call
    // `checkBacktestingMode` → `autoLoadBacktestingData` INSIDE every
    // iframe. That pipeline is auth/session/redirect/timing sensitive,
    // and when 3–4 iframes run it at once it frequently stalls before
    // `window.chart` is usable — so the bridge never installs, the
    // manager never sees `bridge-ready`, and panels stick on
    // "Loading …" forever (this is the exact symptom the dist-v9 shim
    // comment and `readUrlChartMode` both warn about).
    //
    // Without `mode`, chart.js does NO automatic load, and `embed-bridge`
    // takes its deterministic panel path instead:
    //   1. mirrors `window.parent.chart.backtestingSession` onto the
    //      iframe's chart BEFORE loading (see embed-bridge.js
    //      "mirrored parent backtestingSession"),
    //   2. calls `chart.loadFileData(fileId)` once — which, for a
    //      backtest-style session, builds the SAME end-anchored,
    //      skipSessionDates smart-window the parent used, so the data
    //      window matches.
    // The host's visible range + replay position are then pushed to the
    // panel via `_initialSyncToHost` and the replay command stream
    // (`replayEnter` / `replayTick`), so any residual window difference
    // is realigned immediately.
    //
    // (The `mode` argument is still accepted for signature stability and
    // possible future use, but is intentionally not written to the URL.)
    void mode;
    // We DO forward `sessionId` so the iframe's chart engine builds
    // the SAME drawings storage key as the parent (chart.js:2181 →
    // `chart_drawings_s<sessionId>_<fileId>` when a session is active).
    // Without sessionId, the iframe looks under `chart_drawings_<fileId>`
    // and finds nothing, even though the parent has been saving the
    // user's drawings under the session-scoped key for hours.
    const buildV =
        (typeof window !== "undefined" && window.__TALARIA_CHART_BUILD_ID)
            ? String(window.__TALARIA_CHART_BUILD_ID)
            : "";
    if (buildV) params.set("v", buildV);
    // Lightweight chart-only page — no React bundle per iframe (major multichart perf win).
    return "/chart/multichart-prod/chart-embed.html?" + params.toString();
}

// ─── loading overlay keyframes (injected once into parent /chart/ head) ─────
//
// TradingView-style 3-dot pulsing indicator + soft chart skeleton silhouette
// behind it. Lives in the PARENT page (not the iframe) because the iframe
// content is exactly what we're hiding while it boots.
const LOADING_STYLE_ID = "multichart-loading-style";
const LOADING_STYLE_CSS = `
@keyframes tlrMultichartDot {
  0%, 80%, 100% { opacity: 0.28; transform: scale(0.82); }
  40%           { opacity: 1;    transform: scale(1);
                  box-shadow: 0 0 8px rgba(74,106,255,0.55); }
}
@keyframes tlrMultichartSkeletonShimmer {
  0%   { transform: translateX(-30%); }
  100% { transform: translateX(130%); }
}
.multichart-loading-overlay {
    position: absolute; inset: 0; z-index: 5;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: linear-gradient(180deg, #0b0c14 0%, #0d1018 100%);
    pointer-events: none;
    overflow: hidden;
    transition: opacity 0.18s ease;
}
.multichart-loading-overlay::before {
    /* Faint horizontal grid-line skeleton — hints that this is a chart. */
    content: "";
    position: absolute; inset: 0;
    background-image:
        linear-gradient(rgba(140,160,255,0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(140,160,255,0.025) 1px, transparent 1px);
    background-size: 60px 40px, 60px 40px;
    opacity: 0.6;
}
.multichart-loading-overlay::after {
    /* Sweeping shimmer band over the skeleton. */
    content: "";
    position: absolute; top: 0; bottom: 0; left: 0; width: 30%;
    background: linear-gradient(90deg,
        transparent 0%,
        rgba(140,160,255,0.06) 50%,
        transparent 100%);
    animation: tlrMultichartSkeletonShimmer 2.6s linear infinite;
    will-change: transform;
}
.multichart-loading-dots {
    position: relative; z-index: 1;
    display: flex; gap: 8px;
}
.multichart-loading-dots > span {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4a6aff;
    opacity: 0.28;
    animation: tlrMultichartDot 1.35s ease-in-out infinite both;
}
.multichart-loading-dots > span:nth-child(2) { animation-delay: 0.18s; }
.multichart-loading-dots > span:nth-child(3) { animation-delay: 0.36s; }
.multichart-loading-label {
    position: relative; z-index: 1;
    margin-top: 14px;
    font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(255,255,255,0.32);
    font-family: 'Exo 2', system-ui, sans-serif;
}
.multichart-error-overlay {
    gap: 8px;
    padding: 16px;
    text-align: center;
}
.multichart-error-overlay::after { display: none; }
.multichart-error-title {
    position: relative; z-index: 1;
    font-size: 13px; font-weight: 700;
    color: #ff7a85;
    font-family: 'Exo 2', system-ui, sans-serif;
}
.multichart-error-reason {
    position: relative; z-index: 1;
    max-width: 90%;
    font-size: 11px; line-height: 1.45;
    color: rgba(255,255,255,0.55);
    font-family: 'JetBrains Mono', monospace;
}
.multichart-error-actions {
    position: relative; z-index: 1;
    display: flex; gap: 8px; margin-top: 6px;
}
.multichart-error-btn {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid rgba(140,160,255,0.35);
    background: rgba(74,106,255,0.14);
    color: #c8d4ff;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    text-decoration: none;
    font-family: 'Exo 2', system-ui, sans-serif;
    transition: background 0.15s, border-color 0.15s;
}
.multichart-error-btn:hover {
    background: rgba(74,106,255,0.28);
    border-color: rgba(140,160,255,0.6);
}
`;

function ensureLoadingStyleInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById(LOADING_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = LOADING_STYLE_ID;
    s.textContent = LOADING_STYLE_CSS;
    document.head.appendChild(s);
}

function ensureMultichartGlobalSettingsRoot() {
    if (typeof document === "undefined") return null;
    let el = document.getElementById(MULTICHART_GLOBAL_SETTINGS_ROOT_ID);
    if (!el) {
        el = document.createElement("div");
        el.id = MULTICHART_GLOBAL_SETTINGS_ROOT_ID;
        el.setAttribute("data-multichart-global-settings", "1");
        el.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
        document.body.appendChild(el);
    }
    return el;
}

function clearMultichartGlobalSettingsRoot() {
    if (typeof document === "undefined") return;
    closeGlobalLegacyDrawingSettings();
    const el = document.getElementById(MULTICHART_GLOBAL_SETTINGS_ROOT_ID);
    if (el) {
        try { el.remove(); } catch (_) {}
    }
}

/** Remove every legacy tv-settings-modal from the parent shell. */
function closeGlobalLegacyDrawingSettings() {
    if (typeof document === "undefined") return;
    try {
        document.querySelectorAll(".tv-settings-modal").forEach((el) => {
            try {
                if (el.externalDropdowns) {
                    el.externalDropdowns.forEach((d) => { try { d.remove(); } catch (_) {} });
                }
                el.remove();
            } catch (_) {}
        });
        document.querySelectorAll(".tv-external-dropdown").forEach((d) => {
            try { d.remove(); } catch (_) {}
        });
    } catch (_) {}
    try {
        const hostDm = window.chart && window.chart.drawingManager;
        if (hostDm && hostDm.settingsPanel && typeof hostDm.settingsPanel.hide === "function") {
            hostDm.settingsPanel.hide();
        }
    } catch (_) {}
}

// ─── host-slot positioning ──────────────────────────────────────────────────
//
// applyHostSlot: position the parent's #chartWrapper to overlay cell A's grid
// bbox. Coords are converted to be relative to #chart-container (the parent
// the wrapper lives inside), and z-index:13 lifts it above the grid container
// (which is at z-index:12) so it paints on top of the cell's background while
// the iframes in cells B/C/D stay safely inside their own (smaller) cell
// bboxes.
//
// clearHostSlot: blow away every inline style we set so #chartWrapper falls
// back to its CSS default of `inset:0` and refills the entire chart slot
// (single-chart UX is byte-identical to before MultichartGrid existed).
//
// Both call window.chart.resize()+render() so chart.js picks up the new
// canvas dimensions immediately. We zero `_lastResizeDpr` first because
// chart.js bails out of resize() when DPR is unchanged, and only the size
// changed here.
function resolveHostReplayPlayheadMs(ch, mgr) {
    if (!ch) return null;
    try {
        const rs = ch.replaySystem;
        if (rs && rs.isActive && Number.isFinite(rs.replayTimestamp)) {
            return rs.replayTimestamp;
        }
        if (rs && Number.isFinite(rs.replayTimestamp)) return rs.replayTimestamp;
        const sid = (typeof ch.getActiveTradingSessionId === "function")
            ? ch.getActiveTradingSessionId()
            : ch.activeTradingSessionId;
        if (sid && typeof ch._getSavedReplayRestoreState === "function") {
            const saved = ch._getSavedReplayRestoreState(sid);
            const ts = saved && Number(saved.replayTimestamp);
            if (Number.isFinite(ts)) return ts;
        }
    } catch (_) {}
    // Do not pull playhead from iframe peers while host replay is active — a
    // user pair switch on B/C/D must not re-seek host A to another instrument's slice.
    return null;
}

/** Re-enter backtest replay on tile A when layout split left it on full-file view. */
function alignHostChartForMultichart(ch, mgr) {
    if (!ch) return;
    if (_hostViewportFrozenCheck()) return;
    const bootSoft = isMultichartBootSettling();
    try {
        const rs = ch.replaySystem;
        // User panned this tile — don't recenter on playhead after split/resize.
        if (rs && rs.userHasPanned) {
            if (typeof ch.constrainOffset === "function") ch.constrainOffset();
            if (typeof ch.render === "function") ch.render();
            return;
        }
        const inBacktest = !!(ch.isBacktestMode && ch.backtestingSession);
        if (!inBacktest || !rs) {
            if (rs && rs.isActive && typeof rs.syncReplayViewportToPlayhead === "function") {
                rs.syncReplayViewportToPlayhead(ch, {
                    centerPlayhead: true,
                    resetPriceScale: !bootSoft,
                    render: true,
                });
                return;
            }
            if (typeof ch.fitToView === "function") {
                ch._chartViewRestored = false;
                ch.fitToView();
                if (typeof ch.render === "function") ch.render();
            }
            return;
        }

        const playheadMs = resolveHostReplayPlayheadMs(ch, mgr);

        if (!rs.isActive && typeof rs.enterReplayMode === "function") {
            const enterOpts = { startAtBeginning: true };
            if (Number.isFinite(playheadMs)) {
                enterOpts.preservePlayhead = true;
                enterOpts.initialReplayTimestamp = playheadMs;
            }
            rs.enterReplayMode(enterOpts);
        } else if (rs.isActive && Number.isFinite(playheadMs)
            && typeof rs.goToReplayTimestamp === "function") {
            rs.goToReplayTimestamp(playheadMs);
        }

        if (typeof rs.syncReplayViewportToPlayhead === "function") {
            rs.syncReplayViewportToPlayhead(ch, {
                centerPlayhead: true,
                resetPriceScale: !bootSoft,
                render: true,
            });
        } else if (typeof ch.render === "function") {
            ch.render();
        }
    } catch (_) {}
}

function syncHostReplayViewport(ch) {
    alignHostChartForMultichart(ch, null);
}

function isMultichartBootSettling() {
    try {
        if (typeof window !== "undefined"
            && Number.isFinite(window.__multichartBootRevealAfter)
            && performance.now() < window.__multichartBootRevealAfter) {
            return true;
        }
    } catch (_) {}
    return false;
}

function syncAllIframesToHost(mgr) {
    if (!mgr || typeof mgr._initialSyncToHost !== "function") return;
    let hostFid = "";
    try {
        if (window.chart && window.chart.currentFileId != null) {
            hostFid = String(window.chart.currentFileId).trim();
        }
    } catch (_) {}
    const symSync = !!(mgr.syncMode && mgr.syncMode.symbol);
    try {
        for (const c of mgr.charts.values()) {
            if (!c || c.host || !c.ready) continue;
            if (!symSync && hostFid) {
                const panelFid = c.state && c.state.fileId != null
                    ? String(c.state.fileId).trim()
                    : "";
                if (panelFid && panelFid !== hostFid) continue;
            }
            mgr._initialSyncToHost(c);
        }
    } catch (_) {}
}

/** Coalesce host replay/viewport align only (no viewport stamp onto other pairs). */
let _alignHostSyncTimer = 0;
let _hostViewportFrozenCheck = () => false;
let _hostBootResizeTimer = 0;
/** Debounced viewport re-sync after panel focus (drawing tool / click switch). */
let _focusViewportSyncTimer = 0;
/** Wired by the order-mirror effect when multichart mounts. */
let _broadcastClearDraftPreviewImpl = null;

/**
 * Fan-out draft preview clear to every other multichart tile (host + iframes).
 * @param {string} sourceId
 */
function broadcastClearDraftPreview(sourceId) {
    if (typeof _broadcastClearDraftPreviewImpl === "function") {
        try { _broadcastClearDraftPreviewImpl(sourceId); } catch (_) {}
        return;
    }
    const sid = sourceId != null ? String(sourceId) : "";
    if (!sid) return;
    const grid = typeof window !== "undefined" ? window.__multichartGrid : null;
    if (!grid || typeof grid.runCommand !== "function") return;
    const hid = grid.hostPanelId != null ? grid.hostPanelId : "A";
    if (String(sid) === String(hid)) return;
    try {
        grid.runCommand("clearDraftPreview", null, { panelId: sid }).catch(() => {});
    } catch (_) {}
}
function setHostViewportFrozenCheck(fn) {
    _hostViewportFrozenCheck = typeof fn === "function" ? fn : () => false;
}
function syncHostViewportFrozenFlag(frozen) {
    try {
        const ch = window.chart;
        if (ch) {
            ch._multichartHostViewportFrozen = !!frozen;
            if (frozen) ch._multichartSkipResizeOffsetAdjust = true;
            else delete ch._multichartSkipResizeOffsetAdjust;
        }
    } catch (_) {}
}
function scheduleHostBootResize(cellEl) {
    applyHostSlotPositionOnly(cellEl);
    if (_hostBootResizeTimer) clearTimeout(_hostBootResizeTimer);
    _hostBootResizeTimer = setTimeout(() => {
        _hostBootResizeTimer = 0;
        if (!_hostViewportFrozenCheck()) return;
        applyHostSlotPositionOnly(cellEl);
        try {
            const ch = window.chart;
            if (ch && typeof ch.resize === "function") {
                ch._multichartSkipResizeOffsetAdjust = true;
                ch._lastResizeDpr = 0;
                ch.resize();
                if (typeof ch.constrainOffset === "function") ch.constrainOffset();
                if (typeof ch.render === "function") ch.render();
            }
        } catch (_) {}
    }, 320);
}
function scheduleAlignHostOnly(mgr, delayMs) {
    if (_hostViewportFrozenCheck()) return;
    if (_alignHostSyncTimer) clearTimeout(_alignHostSyncTimer);
    const wait = Number.isFinite(delayMs) ? delayMs : 220;
    _alignHostSyncTimer = setTimeout(function () {
        _alignHostSyncTimer = 0;
        try {
            alignHostChartForMultichart(window.chart, mgr);
        } catch (_) {}
    }, wait);
}

function applyHostSlot(cellEl, opts) {
    if (!cellEl) return;
    if (typeof document === "undefined") return;
    // `reanchor` (default true) controls whether we re-center the host
    // viewport on the replay playhead / refit AFTER the resize. During the
    // multichart boot and on plain resize/scroll ticks we pass false so the
    // candles keep their current horizontal position instead of jumping
    // left/right on every staggered panel-ready + ResizeObserver fire (the
    // "chart shaking while loading" symptom). A single intentional re-anchor
    // is scheduled once via scheduleAlignHostOnly after the layout/boot
    // settles, so the host still snaps to the correct replay window.
    const reanchor = !opts || opts.reanchor !== false;
    applyHostSlotPositionOnly(cellEl);
    if (_hostViewportFrozenCheck()) {
        scheduleHostBootResize(cellEl);
        return;
    }
    // Force chart.js to re-measure and repaint into the new bbox.
    try {
        const ch = window.chart;
        if (ch && typeof ch.resize === "function") {
            ch._lastResizeDpr = 0;
            ch.resize();
            if (typeof ch.render === "function") ch.render();
            if (reanchor) alignHostChartForMultichart(ch, null);
        }
    } catch (_) {}
}

// Lightweight position update — moves #chartWrapper to match cellEl's
// current bbox WITHOUT calling chart.resize(). Used during splitter
// drag where we want the wrapper to track the cell visually but can't
// afford the cost of resize() + render() on every mousemove (each
// resize is 5–20ms; at 60Hz that's a budget blowout).
//
// The chart's canvas is set to fill the wrapper via CSS, so the canvas
// will visually grow/shrink with the wrapper even though chart.js
// hasn't redrawn yet. Pixels look slightly stretched mid-drag (because
// the canvas's internal buffer is still the old size) but the user
// sees fluid layout motion. On mouseup we call the full applyHostSlot
// once, which triggers a single resize() + render() to repaint at
// the final pixel-perfect resolution.
function applyHostSlotPositionOnly(cellEl) {
    if (!cellEl) return;
    if (typeof document === "undefined") return;
    const wrapper   = document.getElementById(HOST_WRAPPER_ID);
    const container = document.getElementById(HOST_CONTAINER_ID);
    if (!wrapper || !container) return;
    const cellRect      = cellEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left   = Math.round(cellRect.left   - containerRect.left);
    const top    = Math.round(cellRect.top    - containerRect.top);
    const width  = Math.round(cellRect.width);
    const height = Math.round(cellRect.height);
    wrapper.style.left   = left   + "px";
    wrapper.style.top    = top    + "px";
    wrapper.style.width  = width  + "px";
    wrapper.style.height = height + "px";
    wrapper.style.right  = "auto";
    wrapper.style.bottom = "auto";
    wrapper.style.zIndex = "13";
    wrapper.dataset.multichartHost = "1";
    // Stretch the canvas via CSS only (no buffer realloc) so the host
    // panel tracks splitter drag fluidly until mouseup repaint.
    try {
        const ch = window.chart;
        if (ch && ch.canvas) {
            const w = Math.max(1, width);
            const h = Math.max(1, height);
            ch.canvas.style.width = w + "px";
            ch.canvas.style.height = h + "px";
            const svgNode = ch.svg && ch.svg.node ? ch.svg.node() : null;
            if (svgNode) {
                svgNode.style.width = w + "px";
                svgNode.style.height = h + "px";
            }
        }
    } catch (_) {}
}

/** CSS-only stretch for iframe charts during splitter drag (no resize()). */
function previewIframeChartsInContainer(container) {
    if (!container) return;
    container.querySelectorAll("iframe").forEach((ifr) => {
        try {
            const ch = ifr.contentWindow && ifr.contentWindow.chart;
            if (!ch || !ch.canvas) return;
            const parent = ch.canvas.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));
            ch.canvas.style.width = w + "px";
            ch.canvas.style.height = h + "px";
            const svgNode = ch.svg && ch.svg.node ? ch.svg.node() : null;
            if (svgNode) {
                svgNode.style.width = w + "px";
                svgNode.style.height = h + "px";
            }
        } catch (_) {}
    });
}

function clearHostSlot() {
    if (typeof document === "undefined") return;
    const wrapper = document.getElementById(HOST_WRAPPER_ID);
    if (!wrapper) return;
    wrapper.style.left      = "";
    wrapper.style.top       = "";
    wrapper.style.width     = "";
    wrapper.style.height    = "";
    wrapper.style.right     = "";
    wrapper.style.bottom    = "";
    wrapper.style.zIndex    = "";
    wrapper.style.outline   = "";
    wrapper.style.outlineOffset = "";
    delete wrapper.dataset.multichartHost;
    delete wrapper.dataset.multichartHostFocused;
    // Phase 7.2.4: tear down the host focus overlay if any. Defensive —
    // applyHostFocusOutline(false) is also called on unmount, but if
    // something raced and the overlay survived, this guarantees a clean
    // single-chart state.
    const overlay = wrapper.querySelector("#" + HOST_FOCUS_OVERLAY_ID);
    if (overlay) overlay.remove();
    try {
        const ch = window.chart;
        if (ch && typeof ch.resize === "function") {
            ch._lastResizeDpr = 0;
            ch.resize();
            if (typeof ch.render === "function") ch.render();
        }
    } catch (_) {}
}

/** Suppress chart.resize() storms while the user drags panel splitters. */
function setLayoutDragActive(active) {
    try {
        window.__multichartLayoutDragging = !!active;
        const ch = window.chart;
        if (ch) ch._multichartLayoutDragging = !!active;
    } catch (_) {}
}

/**
 * Pause iframe pointer input and suppress chart.resize() inside iframe
 * panels during splitter drag. Iframes stay at width/height 100% so they
 * track their grid cell fluidly (same UX as the host #chartWrapper).
 * Full chart.resize() runs once on thaw when the drag ends.
 */
function freezePanelSurfaces(container) {
    const locked = { iframes: [] };
    if (container) {
        container.querySelectorAll("iframe").forEach((ifr) => {
            locked.iframes.push({
                el: ifr,
                pe: ifr.style.pointerEvents,
            });
            ifr.style.pointerEvents = "none";
            ifr.style.position = "";
            ifr.style.left = "";
            ifr.style.top = "";
            ifr.style.width = "100%";
            ifr.style.height = "100%";
            try {
                const w = ifr.contentWindow;
                if (w) w.__multichartLayoutDragging = true;
                const ch = w && w.chart;
                if (ch) ch._multichartLayoutDragging = true;
            } catch (_) {}
        });
    }
    setLayoutDragActive(true);
    return locked;
}

function clearIframeLayoutDragFlags(ifr) {
    try {
        const w = ifr.contentWindow;
        if (w) w.__multichartLayoutDragging = false;
        const ch = w && w.chart;
        if (ch) ch._multichartLayoutDragging = false;
    } catch (_) {}
}

function thawPanelSurfaces(locked, cellA, container) {
    setLayoutDragActive(false);
    if (locked && locked.iframes) {
        locked.iframes.forEach(({ el, pe }) => {
            el.style.pointerEvents = pe || "";
            clearIframeLayoutDragFlags(el);
        });
    }
    if (container) {
        normalizeIframeStyles(container);
        container.querySelectorAll("iframe").forEach(clearIframeLayoutDragFlags);
    }
    if (cellA) applyHostSlot(cellA);
    if (container) {
        resizeAllIframesInContainer(container);
    } else if (locked && locked.iframes) {
        locked.iframes.forEach(({ el }) => {
            try {
                const ch = el.contentWindow && el.contentWindow.chart;
                if (ch && typeof ch.resize === "function") {
                    ch._lastResizeDpr = 0;
                    ch.resize();
                    if (typeof ch.render === "function") ch.render();
                }
            } catch (_) {}
        });
    }
}

function normalizeIframeStyles(container) {
    if (!container) return;
    container.querySelectorAll("iframe").forEach((ifr) => {
        ifr.style.position = "";
        ifr.style.left = "";
        ifr.style.top = "";
        ifr.style.width = "100%";
        ifr.style.height = "100%";
        ifr.style.maxWidth = "";
        ifr.style.maxHeight = "";
    });
}

function resizeIframeInCell(cell) {
    if (!cell) return;
    const ifr = cell.querySelector("iframe");
    if (!ifr) return;
    ifr.style.position = "";
    ifr.style.left = "";
    ifr.style.top = "";
    ifr.style.width = "100%";
    ifr.style.height = "100%";
    try {
        const ch = ifr.contentWindow && ifr.contentWindow.chart;
        if (ch && typeof ch.resize === "function") {
            const oldW = ch.w;
            const oldH = ch.h;
            ch._lastResizeDpr = 0;
            ch.resize();
            const bootLocked = isMultichartBootSettling()
                || (ch._multichartBootViewportPositioned
                    && Number.isFinite(ch._multichartViewportSettleUntil)
                    && performance.now() < ch._multichartViewportSettleUntil
                    && typeof ch._countVisiblePlotBars === "function"
                    && ch._countVisiblePlotBars() > 0);
            if (!bootLocked) {
                if (typeof ch._syncMultichartViewportFromHost === "function") {
                    try { ch._syncMultichartViewportFromHost({ render: false }); } catch (_) {}
                } else if (typeof ch._realignMultichartViewportAfterResize === "function") {
                    try { ch._realignMultichartViewportAfterResize(oldW, oldH); } catch (_) {}
                }
            }
            if (typeof ch.render === "function") ch.render();
        }
    } catch (_) {}
}

function resizeAllIframesInContainer(container) {
    if (!container) return;
    normalizeIframeStyles(container);
    container.querySelectorAll("iframe").forEach((ifr) => {
        try {
            const ch = ifr.contentWindow && ifr.contentWindow.chart;
            if (ch && typeof ch.resize === "function") {
                ch._lastResizeDpr = 0;
                ch.resize();
                if (typeof ch.render === "function") ch.render();
            }
        } catch (_) {}
    });
}

function repaintAllPanelSurfaces(container, cellA, opts) {
    normalizeIframeStyles(container);
    if (cellA) applyHostSlot(cellA, opts);
    resizeAllIframesInContainer(container);
}

function updateFocusFrameDom(panelId, cellRefs) {
    if (typeof document === "undefined" || !panelId) return;
    const frame = document.querySelector("[data-multichart-focus-frame=\"1\"]");
    const cell = cellRefs && cellRefs[panelId];
    const parent = document.getElementById(HOST_CONTAINER_ID);
    if (!frame || !cell || !parent) return;
    const cellRect = cell.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    frame.style.left = Math.round(cellRect.left - parentRect.left) + "px";
    frame.style.top = Math.round(cellRect.top - parentRect.top) + "px";
    frame.style.width = Math.round(cellRect.width) + "px";
    frame.style.height = Math.round(cellRect.height) + "px";
}

// Apply / clear the per-tile FOCUSED border on an iframe cell.
//
// CSS outline on the cell is invisible behind the iframe (some browsers
// composite iframe content above outline / box-shadow on the parent). A
// React-rendered overlay div is also unreliable because the iframe is
// appended by the manager via vanilla appendChild AFTER React commits, so
// React inserts the overlay at its tracked sibling position — typically
// BEFORE the iframe in DOM order — and z-index alone doesn't always win.
//
// Solution: append the border overlay via vanilla DOM AFTER the iframe is
// in place, so it's the LAST child of the cell. Combined with a very high
// z-index (9999), this gives a focus border that is reliably visible
// across browsers and across the iframe's compositor layer.
//
// pointerEvents:none keeps clicks reaching the iframe so the user can
// continue to interact with the focused chart normally.
const IFRAME_FOCUS_BORDER_ATTR = "data-multichart-focus-border";

function clearIframeFocusBorders(cellRefs) {
    if (typeof document === "undefined") return;
    if (!cellRefs) return;
    for (const id in cellRefs) {
        const cell = cellRefs[id];
        if (!cell) continue;
        const existing = cell.querySelector("[" + IFRAME_FOCUS_BORDER_ATTR + "]");
        if (existing) existing.remove();
    }
}

function applyIframeFocusBorder(cellEl) {
    if (typeof document === "undefined") return;
    if (!cellEl) return;
    let overlay = cellEl.querySelector("[" + IFRAME_FOCUS_BORDER_ATTR + "]");
    if (overlay) return; // already present
    overlay = document.createElement("div");
    overlay.setAttribute(IFRAME_FOCUS_BORDER_ATTR, "1");
    overlay.setAttribute("aria-hidden", "true");
    // Bright TradingView-style focus border (0.75px).
    overlay.style.cssText = [
        "position: absolute",
        "inset: 0",
        "pointer-events: none",
        "border: 0.75px solid #2962ff",
        "border-radius: 2px",
        "box-sizing: border-box",
        "box-shadow: " + [
            "0 0 6px 1px rgba(41,98,255,0.35)",
            "inset 0 0 6px rgba(41,98,255,0.18)",
        ].join(", "),
        "z-index: 2147483647",
    ].join(";");
    cellEl.appendChild(overlay); // appendChild = LAST child, sits over iframe
}

// Apply / clear the per-tile FOCUSED border on the host's #chartWrapper.
//
// CSS outline does not paint above an element's own children — the canvas,
// drawing svg, and panels-container inside #chartWrapper would all paint on
// top of any outline we set on the wrapper. Same problem the iframe cells
// have, solved the same way: inject a real overlay <div> as a child of the
// wrapper. The wrapper has z-index:13 (set in applyHostSlot) which makes it
// a stacking context, so a child div at z-index:100 paints above the
// canvas + svg locally while still respecting the parent's z-index 13
// globally.
//
// pointerEvents:none on the overlay so it never intercepts chart clicks.
const HOST_FOCUS_OVERLAY_ID = "multichart-host-focus-overlay";

function applyHostFocusOutline(focused) {
    if (typeof document === "undefined") return;
    const wrapper = document.getElementById(HOST_WRAPPER_ID);
    if (!wrapper) return;
    let overlay = wrapper.querySelector("#" + HOST_FOCUS_OVERLAY_ID);
    if (focused) {
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = HOST_FOCUS_OVERLAY_ID;
            overlay.setAttribute("aria-hidden", "true");
            // Clean TradingView-style frame: 0.75px solid blue with a soft halo.
            overlay.style.cssText = [
                "position: absolute",
                "inset: 0",
                "pointer-events: none",
                "border: 0.75px solid #2962ff",
                "box-sizing: border-box",
                "box-shadow: 0 0 6px 1px rgba(41,98,255,0.35)",
                "z-index: 2147483647",
            ].join(";");
            wrapper.appendChild(overlay);
        }
        wrapper.dataset.multichartHostFocused = "1";
    } else {
        if (overlay) overlay.remove();
        delete wrapper.dataset.multichartHostFocused;
    }
}

// ─── component ──────────────────────────────────────────────────────────────
export default function MultichartGrid({
    layoutId,
    panelCount,
    layoutSync,
    initialFileId,
    initialTimeframe,
    initialMode, // forwarded as ?mode=backtest|propfirm so iframe runs the
                 // same checkBacktestingMode → autoLoadBacktestingData
                 // pipeline as the parent (matched data slice).
    initialSessionId, // forwarded as ?sessionId= so iframe builds the
                      // same per-session drawings storage key as parent
    focusedPanelId,
    setFocusedPanelId,
}) {
    const containerRef = useRef(null);
    const cellRefs = useRef({});             // panelId -> cell <div>
    const managerRef = useRef(null);
    const [managerReady, setManagerReady] = useState(false);
    // Host tile A is "ready" from frame 0 — it just shows the parent's
    // existing #chartWrapper, which has been alive (with all the user's
    // drawings, indicators, replay state, etc.) since the user first
    // opened /chart/. No loading overlay needed.
    // bridge-ready (commands/sync) vs data-ready (hide loading overlay)
    const [readyPanels, setReadyPanels] = useState(() => new Set([HOST_PANEL_ID]));
    const [dataReadyPanels, setDataReadyPanels] = useState(() => new Set([HOST_PANEL_ID]));
    // Fallback when chart-state never reports candleCount (partial deploy / load race).
    const [overlayFallbackPanels, setOverlayFallbackPanels] = useState(() => new Set([HOST_PANEL_ID]));
    // panelId -> { reason, src }. Set by the manager's onChartBootFailed when an
    // iframe never reaches `bridge-ready` (boot timeout) or its iframe errors.
    // Drives a visible error overlay so a stuck panel no longer shows an
    // endless "Loading …" spinner.
    const [failedPanels, setFailedPanels] = useState(() => new Map());

    // panelId -> timeout id. When a panel's first bars arrive we DON'T hide
    // its loading overlay immediately: the iframe chart still runs a viewport
    // settle pass (canvas 0→real resize + _finalizeMultichartPanelAfterPairLoad,
    // ~1.2s) that re-anchors the candles horizontally. Dismissing the overlay
    // on "first bars" let the user watch that re-anchor as a left/right shake.
    // We hold the overlay across the settle window so the reposition happens
    // behind it; the chart only becomes visible once it's stable.
    const overlayHoldTimersRef = useRef({});
    /** True while splitting 1→N with host already holding cloneable bars for effFile. */
    const samePairCacheBootRef = useRef(false);
    /** Freeze host viewport re-anchor until every iframe has bars (no shake mid-boot). */
    const hostViewportFrozenRef = useRef(false);
    const OVERLAY_SETTLE_HOLD_CACHE_MS = 0;
    const OVERLAY_SETTLE_HOLD_DEFAULT_MS = 0;
    const OVERLAY_FALLBACK_MS = 0;
    useEffect(() => {
        return () => {
            const timers = overlayHoldTimersRef.current || {};
            for (const k in timers) {
                if (timers[k]) clearTimeout(timers[k]);
            }
            overlayHoldTimersRef.current = {};
        };
    }, []);

    // Capture initial context in refs so the per-tile add closure always
    // uses the LATEST values when a new tile is added (e.g. user opens
    // file X, splits to 2 panels, switches to file Y in the parent, then
    // splits to 4 — tiles C and D should boot with file Y).
    const initialFileIdRef    = useRef(initialFileId);
    const initialTimeframeRef = useRef(initialTimeframe);
    const initialSessionIdRef = useRef(initialSessionId);
    const initialModeRef      = useRef(initialMode);
    useEffect(() => { initialFileIdRef.current    = initialFileId;    }, [initialFileId]);
    useEffect(() => { initialTimeframeRef.current = initialTimeframe; }, [initialTimeframe]);
    useEffect(() => { initialSessionIdRef.current = initialSessionId; }, [initialSessionId]);
    useEffect(() => { initialModeRef.current      = initialMode;      }, [initialMode]);

    // ─── Focus-related refs (Phase 7.2.4) ───────────────────────────────
    // Both the manager mount effect (callbacks closed over the first
    // render) and the per-panel command bus (window global) need to read
    // the LATEST focusedPanelId without re-installing themselves on
    // every focus change. Capture in a ref synced via useEffect.
    //
    // onStateAnyRef holds the latest "any panel's chart-state changed"
    // delegate. The manager's onState opt is wired to call this ref so
    // we can change the delegate body across renders without rebuilding
    // the manager. Used to push topbar reflection updates the moment a
    // focused panel reports a new tf / fileId / symbol.
    const focusedPanelIdRef = useRef(focusedPanelId);
    useEffect(() => { focusedPanelIdRef.current = focusedPanelId; }, [focusedPanelId]);

    /** Keep ref + React state in sync immediately — runCommand reads the ref, not state. */
    const focusPanelById = useCallback((id) => {
        if (!id) return;
        focusedPanelIdRef.current = id;
        if (typeof setFocusedPanelId === "function") setFocusedPanelId(id);
    }, [setFocusedPanelId]);
    const focusPanelByIdRef = useRef(focusPanelById);
    focusPanelByIdRef.current = focusPanelById;
    const onStateAnyRef = useRef(null);

    const markPanelDataReady = useCallback((id, { immediate = false } = {}) => {
        if (!id || id === HOST_PANEL_ID) return;
        const hostNt = readHostChartFileAndTf();
        const cacheBoot = samePairCacheBootRef.current && hostHasCloneableBars(hostNt.fileId);
        const holdMs = immediate || cacheBoot
            ? OVERLAY_SETTLE_HOLD_CACHE_MS
            : OVERLAY_SETTLE_HOLD_DEFAULT_MS;
        if (overlayHoldTimersRef.current[id]) {
            clearTimeout(overlayHoldTimersRef.current[id]);
            delete overlayHoldTimersRef.current[id];
        }
        const apply = () => {
            setDataReadyPanels((prev) => {
                if (prev.has(id)) return prev;
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            setOverlayFallbackPanels((prev) => {
                if (prev.has(id)) return prev;
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            const mgr = managerRef.current;
            if (mgr && typeof mgr.showPanelFrame === "function") {
                try { mgr.showPanelFrame(id); } catch (_) {}
            }
        };
        if (holdMs <= 0) {
            apply();
            return;
        }
        overlayHoldTimersRef.current[id] = setTimeout(() => {
            delete overlayHoldTimersRef.current[id];
            apply();
        }, holdMs);
    }, []);
    const markPanelDataReadyRef = useRef(markPanelDataReady);
    markPanelDataReadyRef.current = markPanelDataReady;

    useEffect(() => {
        setHostViewportFrozenCheck(() => hostViewportFrozenRef.current);
        return () => {
            setHostViewportFrozenCheck(() => false);
            syncHostViewportFrozenFlag(false);
        };
    }, []);

    // ─── per-host order forwarding state ──────────────────────────────
    //
    // suppressEmitId — set to an order.id during an applyHostCommand
    //   "addOrder" call so the host's eventBus listener (installed in
    //   the order-mirror useEffect below) can skip THAT id and not
    //   re-broadcast it back to the originating panel. Same trick the
    //   iframe side uses (panel-cmd-bridge panelOrderState).
    // listenerInstalled — guard so the host eventBus subscription is
    //   installed at most once per page session.
    const hostOrderStateRef = useRef({
        suppressEmitId:    null,
        listenerInstalled: false,
    });

    const layout = useMemo(
        () => resolveLayout(layoutId, panelCount),
        [layoutId, panelCount]
    );

    // ─── Resizable column / row fractions ──────────────────────────────
    //
    // Layout templates declare grid tracks like "1fr 1fr" which means
    // "two equal-weight tracks". To make the splitter between them
    // draggable we need to mutate those fractions per user gesture.
    //
    // We parse the template's `Nfr` segments into a numeric array on
    // first render and on every layoutId change (so picking 2v then
    // 4 then back to 2v starts from clean equal splits each time).
    // Subsequent fraction state lives in `colFractions` / `rowFractions`
    // and the gridTemplateColumns/Rows in the JSX is rebuilt from them.
    //
    // Only "1fr"-style segments are resizable. Layouts using `gridColumn`
    // SPAN like "1 / 3" still work — the splitter operates on the
    // underlying TRACK, not on individual cells. A spanning cell just
    // rides along.
    function parseFrTemplate(tpl) {
        if (!tpl) return [1];
        const parts = String(tpl).trim().split(/\s+/).map((p) => {
            const m = p.match(/^([\d.]+)fr$/);
            if (m) return parseFloat(m[1]) || 1;
            return 1; // unknown unit → treat as 1fr (no resize fidelity)
        });
        return parts.length ? parts : [1];
    }
    const initialColFracs = useMemo(() => parseFrTemplate(layout.cols), [layout.cols]);
    const initialRowFracs = useMemo(() => parseFrTemplate(layout.rows), [layout.rows]);
    const [colFractions, setColFractions] = useState(initialColFracs);
    const [rowFractions, setRowFractions] = useState(initialRowFracs);
    const isDraggingRef = useRef(false);
    const liveDragRef = useRef(null); // { axis: 'col'|'row', fracs: number[] }
    // Reset fractions whenever the layout changes. Must key on layoutId —
    // many layouts share identical cols/rows strings (3l, 3r, 4 all use
    // "1fr 1fr" × "1fr 1fr"); without layoutId, uneven splits from a
    // prior layout persist and squash the right-hand panels in 4-up view.
    useEffect(() => {
        const cols = parseFrTemplate(layout.cols);
        const rows = parseFrTemplate(layout.rows);
        liveDragRef.current = null;
        setColFractions(cols);
        setRowFractions(rows);
        const container = containerRef.current;
        if (container) {
            container.style.gridTemplateColumns = cols.map((f) => f.toFixed(4) + "fr").join(" ");
            container.style.gridTemplateRows = rows.map((f) => f.toFixed(4) + "fr").join(" ");
        }
    }, [layoutId, layout.cols, layout.rows]);

    // Live container size (in CSS px). Declared HERE — high in the
    // component body — so any later useEffect / useLayoutEffect /
    // useMemo can list `containerSize` in its deps without hitting
    // a temporal-dead-zone error. (The ResizeObserver wiring is set
    // up further down once `containerRef` is bound.)
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    const colsTemplate = useMemo(
        () => colFractions.map((f) => f.toFixed(4) + "fr").join(" "),
        [colFractions]
    );
    const rowsTemplate = useMemo(
        () => rowFractions.map((f) => f.toFixed(4) + "fr").join(" "),
        [rowFractions]
    );

    // Whenever the fractions change (drag, layout swap), reposition the
    // host's #chartWrapper to match cell A's new bbox AND trigger a
    // full chart.resize() + render() so the canvas repaints crisply
    // at the new dimensions.
    //
    // GATED by `isDraggingRef`: during an active splitter drag the
    // drag handler itself calls applyHostSlotPositionOnly each frame
    // (cheap reposition, no resize). The expensive chart.resize() is
    // deferred until mouseup — without this gate every mousemove
    // would queue a 5–20ms resize, pegging the main thread and
    // making the drag visibly "stutter".
    // liveDragRef holds the IN-FLIGHT drag's latest fractions. Set
    // each rAF flush during drag, cleared on mouseup. The
    // useLayoutEffect below reads it on every render — if a render
    // happens mid-drag for unrelated reasons (focus change, replay
    // tick, etc.) the effect re-applies our drag's inline style so
    // the splitter doesn't snap back to the React-state position.
    useEffect(() => {
        if (isDraggingRef.current) return;
        const container = containerRef.current;
        const cellA = cellRefs.current[HOST_PANEL_ID];
        const t = setTimeout(() => {
            requestAnimationFrame(() => {
                repaintAllPanelSurfaces(container, cellA);
            });
        }, 60);
        return () => clearTimeout(t);
    }, [colFractions, rowFractions]);

    // Re-apply the live drag's inline style after EVERY render. This
    // is the safety net that lets the drag handler skip setState
    // without risking a snap-back when an unrelated re-render lands.
    // useLayoutEffect (not useEffect) so the re-apply happens before
    // the browser paints.
    useLayoutEffect(() => {
        const drag = liveDragRef.current;
        if (!drag) return;
        const container = containerRef.current;
        if (!container) return;
        const styleProp = (drag.axis === "col")
            ? "gridTemplateColumns"
            : "gridTemplateRows";
        container.style[styleProp] = drag.fracs.map(
            (f) => f.toFixed(4) + "fr"
        ).join(" ");
    });

    // Inject the loading-overlay CSS once (idempotent — checks for existing
    // <style> tag by id).
    useEffect(() => { ensureLoadingStyleInjected(); }, []);

    // Diagnostic — prints the current bundle version so we (and the
    // user) can confirm a hard-refresh actually picked up the new code
    // when the focus border / splitter changes feel "missing". Logs
    // once per mount.
    useEffect(() => {
        try {
            console.log("[MultichartGrid] mounted, BRIDGE_VERSION =", BRIDGE_VERSION);
        } catch (_) {}
    }, []);

    // ─── Mount the MultichartManager ONCE on first render of the grid ───
    //
    // The manager outlives layout changes (2v → 4 → 3l etc); switching
    // layout only adds/removes individual charts via the diff effect
    // below, so panels that exist in both old and new layouts keep
    // their iframes alive (no flicker, no reload, no lost crosshair sync).
    //
    // Manager + iframes are torn down only when MultichartGrid unmounts
    // entirely (i.e. the user picks layout 1 from the dropdown).
    useEffect(() => {
        let cancelled = false;
        const prevMultichartRealData =
            typeof window !== "undefined" ? window.__multichartRealData : undefined;
        if (typeof window !== "undefined") {
            window.__multichartRealData = function () {
                const h = readHostChartFileAndTf();
                if (!h.fileId) return null;
                return { useReal: true, fileId: h.fileId };
            };
        }

        loadParentBridge().then(() => {
            if (cancelled) return;
            if (!containerRef.current) return;
            if (!window.MultichartManager) {
                console.error("[MultichartGrid] MultichartManager not available after bridge load");
                return;
            }

            const manager = new window.MultichartManager({
                container: containerRef.current,
                silentPanelBoot: true,
                deferInitialRangeSync: true,
                iframeSrcBuilder: function (cfg) {
                    return buildIframeSrc({
                        panelId:   cfg.id,
                        fileId:    cfg.fileId,
                        tf:        cfg.tf,
                        sessionId: cfg.sessionId || initialSessionIdRef.current || null,
                        mode:      cfg.mode || initialModeRef.current || readUrlChartMode(),
                    });
                },
                onLog: function (entry) {
                    const tag = "[multichart-mgr]";
                    if (entry.level === "error")      console.error(tag, entry.text);
                    else if (entry.level === "warn")  console.warn(tag, entry.text);
                    // Info/out spam (crosshair fan-out, cmd-result OK) tanks perf in 4-up.
                },
                onAssertion: function (msg) {
                    if (msg && msg.ok === false) {
                        console.error("[multichart-mgr] PRICE-AXIS ASSERTION FAIL:", msg);
                    }
                },
                // Phase 7.2.4 topbar reflection: every chart-state update
                // (timeframe change, file load, symbol change inside an
                // iframe) flows through here. We forward to the latest
                // delegate via onStateAnyRef so the React state machine
                // and topbar can react.
                onState: function (id, state) {
                    const fn = onStateAnyRef.current;
                    if (typeof fn === "function") {
                        try { fn(id, state); } catch (_) {}
                    }
                },
                onChartBootFailed: function (id, reason, src) {
                    setFailedPanels((prev) => {
                        const next = new Map(prev);
                        next.set(id, { reason: reason || "boot failed", src: src || null });
                        return next;
                    });
                },
                onPanelCacheReady: function (id) {
                    const fn = markPanelDataReadyRef.current;
                    if (typeof fn === "function") {
                        try { fn(id, { immediate: true }); } catch (_) {}
                    }
                    const mgr = managerRef.current;
                    if (mgr && typeof mgr.showPanelFrame === "function") {
                        try { mgr.showPanelFrame(id); } catch (_) {}
                    }
                },
                onChartReady: function (id) {
                    setReadyPanels((prev) => {
                        if (prev.has(id)) return prev;
                        const next = new Set(prev);
                        next.add(id);
                        return next;
                    });
                    // TradingView-style: no loading overlay — treat bridge-ready as visible.
                    if (id !== HOST_PANEL_ID) {
                        setDataReadyPanels((prev) => {
                            if (prev.has(id)) return prev;
                            const next = new Set(prev);
                            next.add(id);
                            return next;
                        });
                        setOverlayFallbackPanels((prev) => {
                            if (prev.has(id)) return prev;
                            const next = new Set(prev);
                            next.add(id);
                            return next;
                        });
                        const mgr = managerRef.current;
                        if (mgr && typeof mgr.showPanelFrame === "function") {
                            try { mgr.showPanelFrame(id); } catch (_) {}
                        }
                    }
                    // A panel that recovered after a prior boot failure clears
                    // its error overlay here.
                    setFailedPanels((prev) => {
                        if (!prev.has(id)) return prev;
                        const next = new Map(prev);
                        next.delete(id);
                        return next;
                    });
                    // New iframe panels boot with default V9 settings; push the
                    // host shell's current snapshot so every tile matches.
                    try {
                        window.dispatchEvent(new CustomEvent("multichartUiPeersDirty", { detail: { panelId: id } }));
                    } catch (_) {}
                    // NOTE: the host viewport re-anchor used to run here on
                    // EVERY panel-ready, which (with the 700ms staggered boot)
                    // re-centered the host chart several times in a row and made
                    // it visibly shake left/right while loading. It now runs
                    // exactly once, after all panels in the layout report ready
                    // (see the "host re-anchor once boot settles" effect below).
                },
                // Phase 7.2.4: iframe-side `panel-focus` events bubble up
                // here. Iframe events don't propagate to the parent DOM,
                // so the cell <div>'s onMouseDownCapture never fires for
                // clicks on B/C/D — we rely on the iframe to tell us
                // explicitly via panel-cmd-bridge's focus broadcast.
                onPanelFocus: function (id) {
                    try {
                        const ch = window.chart;
                        if (ch && typeof ch.hideContextMenu === "function") ch.hideContextMenu();
                    } catch (_) {}
                    const prev = focusedPanelIdRef.current;
                    focusPanelByIdRef.current(id);
                    const grid = window.__multichartGrid;
                    if (!grid) return;
                    // Defer peer cleanup so iframe mousedown can finish shape select first.
                    setTimeout(() => {
                        if (prev !== id) {
                            if (typeof grid.clearDrawingUiOnOtherPanels === "function") {
                                grid.clearDrawingUiOnOtherPanels(id);
                            }
                        } else if (typeof grid.deselectDrawingsOnNonFocusedPanels === "function") {
                            grid.deselectDrawingsOnNonFocusedPanels(id);
                        }
                    }, 0);
                },
                onContextMenu: function (panelId, msg) {
                    const ch = window.chart;
                    if (!ch || typeof ch.showChartContextMenu !== "function") return;
                    const mgr = managerRef.current;
                    if (!mgr) return;
                    const entry = mgr.charts.get(panelId);
                    if (!entry || !entry.frame) return;
                    const rect = entry.frame.getBoundingClientRect();
                    const hostX = rect.left + (msg.clientX || 0);
                    const hostY = rect.top  + (msg.clientY || 0);
                    ch.showChartContextMenu(hostX, hostY, msg.offsetX || 0, msg.offsetY || 0, {
                        priceAtCursor: msg.priceAtCursor,
                        priceText:     msg.priceText,
                        symbolName:    msg.symbolName,
                        currentPrice:  msg.currentPrice,
                    });
                    // Sync V9 left rail AFTER the menu is shown — posting
                    // v9-drawing-tool-cleared before iframe-contextmenu raced
                    // React/rail updates against showChartContextMenu.
                    if (msg.toolDismissed) {
                        try {
                            window.dispatchEvent(new CustomEvent("v9DrawingToolCleared", {
                                detail: { panelId },
                            }));
                        } catch (_) {}
                    }
                },
            });
            managerRef.current = manager;
            // Apply current sync mode immediately so the very first
            // initial-sync-to-host (fired when the first iframe goes ready)
            // honors the user's sync toggles instead of the manager's
            // defaults. layoutSync ref isn't available here; the dedicated
            // syncMode useEffect below pushes any updates after this anyway.
            setManagerReady(true);

            // ─── Install + register the host bridge ───────────────────
            //
            // Tile A (HOST_PANEL_ID) is the parent's already-loaded
            // window.chart. The bridge wires its native crosshair /
            // chartScrolled events to outbound postMessage and exposes a
            // `deliver` for inbound. Manager registers it as a peer so
            // every fan-out includes A automatically.
            //
            // window.chart should already exist by the time MultichartGrid
            // mounts (the parent /chart/ page boots chart.js on initial
            // load), but we wait up to 10s defensively in case the user
            // picks a layout while chart.js is still booting (e.g. fast
            // page-load + immediate dropdown click).
            waitForHostBridge(10000).then((hostBridge) => {
                if (cancelled || !managerRef.current || !hostBridge) {
                    if (!hostBridge) {
                        console.warn("[MultichartGrid] host bridge install timed out — "
                            + "tile A will display the parent chart but won't sync with iframe panels");
                    }
                    return;
                }
                try {
                    managerRef.current.addHostChart({
                        id:     HOST_PANEL_ID,
                        tf:     initialTimeframeRef.current || "1m",
                        fileId: initialFileIdRef.current    || null,
                    }, hostBridge);
                    // Wire the manager's syncMode object into the host bridge
                    // so its message listener respects sync toggles (the raw
                    // listener would otherwise bypass the manager's _fanOut gate).
                    if (typeof hostBridge.setSyncModeGate === "function") {
                        hostBridge.setSyncModeGate(managerRef.current.syncMode);
                    }
                } catch (e) {
                    console.error("[MultichartGrid] addHostChart failed:", e);
                }
            });
        }).catch((err) => {
            console.error("[MultichartGrid] failed to load parent bridge:", err);
        });

        return () => {
            cancelled = true;
            if (typeof window !== "undefined") {
                window.__multichartRealData = prevMultichartRealData;
            }
            if (managerRef.current) {
                try { managerRef.current.dispose(); } catch (_) {}
                managerRef.current = null;
            }
            setManagerReady(false);
            setReadyPanels(new Set());
            setDataReadyPanels(new Set([HOST_PANEL_ID]));
            setOverlayFallbackPanels(new Set([HOST_PANEL_ID]));
            setFailedPanels(new Map());
        };
        // Mount-once — never re-run.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Sync layout.tiles ↔ manager.charts incrementally ────────────────
    //
    // On each layout change, compute the diff:
    //   - `removed`: panels in manager but not in new layout → removeChart
    //   - `added`:   panels in new layout but not in manager → addChart
    //   - everything else: untouched (iframe + chart state preserved)
    //
    // The cell <div> for each existing tile id is REUSED across renders
    // (React reconciles by `key`), so its iframe child stays mounted.
    // Only the new cell divs (e.g. C, D when going 2v→4) get fresh iframes.
    useEffect(() => {
        if (!managerReady) return;
        const mgr = managerRef.current;
        if (!mgr) return;

        // Tile A is the HOST tile — backed by the parent's #chartWrapper,
        // never an iframe. Exclude it from every manager operation so the
        // manager only ever sees iframe-backed tiles (B, C, D, …).
        const desiredIframeIds = new Set(
            layout.tiles.map((t) => t.id).filter((id) => id !== HOST_PANEL_ID)
        );

        // Remove iframe charts no longer in the layout
        for (const existingId of Array.from(mgr.charts.keys())) {
            if (!desiredIframeIds.has(existingId)) {
                try { mgr.removeChart(existingId); } catch (_) {}
                if (overlayHoldTimersRef.current[existingId]) {
                    clearTimeout(overlayHoldTimersRef.current[existingId]);
                    delete overlayHoldTimersRef.current[existingId];
                }
                setReadyPanels((prev) => {
                    if (!prev.has(existingId)) return prev;
                    const next = new Set(prev);
                    next.delete(existingId);
                    return next;
                });
                setDataReadyPanels((prev) => {
                    if (!prev.has(existingId)) return prev;
                    const next = new Set(prev);
                    next.delete(existingId);
                    return next;
                });
                setOverlayFallbackPanels((prev) => {
                    if (!prev.has(existingId)) return prev;
                    const next = new Set(prev);
                    next.delete(existingId);
                    return next;
                });
                setFailedPanels((prev) => {
                    if (!prev.has(existingId)) return prev;
                    const next = new Map(prev);
                    next.delete(existingId);
                    return next;
                });
            }
        }

        // Add iframe charts that exist in the layout but not yet in the manager.
        // (The cell <div> is already mounted by React's render that just
        // committed — useEffect runs AFTER commit, so cellRefs are set.)
        //
        // Stagger spawns slightly: each iframe loads the full dist-v9 bundle;
        // firing 3× addChart in one tick makes B/C/D fight for CPU + HTTP/2
        // streams so the last panel often misses the old 5s bridge-ready gate.
        // Even when the host already has cloneable bars (same-pair boot), the
        // iframes must still parse the full ~1.5MB bundle + boot a full chart
        // instance each. Spawning all of them in a single tick parses 3 bundles
        // back-to-back on one thread and locks the tab ("Page Unresponsive" when
        // adding a 2x2 layout). Keep a smaller stagger for same-pair so boots are
        // spread across frames; use the larger gap when bars must be fetched too.
        const hostNt = readHostChartFileAndTf();
        const propFid = initialFileIdRef.current && String(initialFileIdRef.current).trim();
        const propTf = initialTimeframeRef.current && String(initialTimeframeRef.current).trim();
        const effFile = propFid || hostNt.fileId || null;
        const effTf = propTf || hostNt.tf || "1m";
        const effMode = initialModeRef.current || readUrlChartMode();
        const sessId = initialSessionIdRef.current || null;
        const IFRAME_ADD_STAGGER_MS = hostHasCloneableBars(effFile) ? 250 : 700;
        samePairCacheBootRef.current = hostHasCloneableBars(effFile);
        if (layout.tiles.some((t) => t.id !== HOST_PANEL_ID)) {
            hostViewportFrozenRef.current = true;
            syncHostViewportFrozenFlag(true);
        }

        const staggerTimeouts = [];
        let staggerCancelled = false;
        let staggerSlot = 0;
        for (const tile of layout.tiles) {
            if (tile.id === HOST_PANEL_ID) continue; // host has no iframe
            if (mgr.charts.has(tile.id)) continue;
            const cellEl = cellRefs.current[tile.id];
            if (!cellEl) continue;

            const cfg = {
                id:        tile.id,
                tf:        effTf,
                fileId:    effFile,
                sessionId: sessId,
                mode:      effMode,
            };
            const delayMs = staggerSlot * IFRAME_ADD_STAGGER_MS;
            staggerSlot += 1;

            const runAdd = () => {
                if (staggerCancelled) return;
                try {
                    const m = managerRef.current;
                    if (!m || m !== mgr) return;
                    if (m.charts.has(tile.id)) return;
                    setFailedPanels((prev) => {
                        if (!prev.has(tile.id)) return prev;
                        const next = new Map(prev);
                        next.delete(tile.id);
                        return next;
                    });
                    m.addChart(cfg, cellEl);
                } catch (e) {
                    console.error("[MultichartGrid] addChart failed for", tile.id, e);
                }
            };

            if (delayMs === 0) {
                runAdd();
            } else {
                staggerTimeouts.push(setTimeout(runAdd, delayMs));
            }
        }

        return () => {
            staggerCancelled = true;
            staggerTimeouts.forEach((tid) => clearTimeout(tid));
        };
    }, [layout.tiles, managerReady]);

    // Freeze host viewport before any resize/re-anchor when multi-panel layout mounts.
    useLayoutEffect(() => {
        const hasIframes = layout.tiles.some((t) => t.id !== HOST_PANEL_ID);
        hostViewportFrozenRef.current = hasIframes;
        syncHostViewportFrozenFlag(hasIframes);
    }, [layout.tiles]);

    // When layout shape changes (2v → 4, etc.), every cell gets new
    // dimensions — iframe charts must resize or they render at the old
    // pixel width (price axis clipped / black void beside the chart).
    useEffect(() => {
        if (!managerReady) return;
        const container = containerRef.current;
        const cellA = cellRefs.current[HOST_PANEL_ID];
        const iframeCount = layout.tiles.filter((t) => t.id !== HOST_PANEL_ID).length;
        let raf1 = 0;
        let raf2 = 0;
        // Repaint as soon as the grid reflows with reset fractions.
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                if (isDraggingRef.current) return;
                const cellA = cellRefs.current[HOST_PANEL_ID];
                if (_hostViewportFrozenCheck() && cellA) {
                    scheduleHostBootResize(cellA);
                } else {
                    repaintAllPanelSurfaces(container, cellA, { reanchor: false });
                }
            });
        });
        const delay = 100 + iframeCount * 320;
        const t = setTimeout(() => {
            if (isDraggingRef.current) return;
            requestAnimationFrame(() => {
                const cellA = cellRefs.current[HOST_PANEL_ID];
                if (_hostViewportFrozenCheck() && cellA) {
                    scheduleHostBootResize(cellA);
                } else {
                    repaintAllPanelSurfaces(container, cellA, { reanchor: false });
                }
                if (computeFocusedRectRef.current) {
                    computeFocusedRectRef.current();
                }
            });
        }, delay);
        return () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            clearTimeout(t);
        };
    }, [layoutId, layout.cols, layout.rows, managerReady]);

    // ─── Host re-anchor once ALL iframe panels have bars ───────────────
    //
    // Wait for dataReadyPanels (bars committed), not just bridge-ready.
    // Re-centering while iframes are still booting made panel A shake.
    useEffect(() => {
        if (!managerReady) return;
        const expected = layout.tiles
            .filter((t) => t.id !== HOST_PANEL_ID)
            .map((t) => t.id);
        if (expected.length === 0) {
            hostViewportFrozenRef.current = false;
            return;
        }
        const allDataReady = expected.every((id) =>
            dataReadyPanels.has(id) || overlayFallbackPanels.has(id)
        );
        hostViewportFrozenRef.current = !allDataReady;
        syncHostViewportFrozenFlag(!allDataReady);
        if (!allDataReady) return;
        const mgr = managerRef.current;
        const cellA = cellRefs.current[HOST_PANEL_ID];
        const revealAll = () => {
            if (!mgr || typeof mgr.showPanelFrame !== "function") return;
            for (const id of expected) {
                try { mgr.showPanelFrame(id); } catch (_) {}
            }
        };
        if (mgr) {
            if (typeof mgr.flushPendingRangeSync === "function") {
                try { mgr.flushPendingRangeSync(); } catch (_) {}
            } else if (typeof mgr._markBootRevealHold === "function") {
                try { mgr._markBootRevealHold(3600); } catch (_) {}
            }
        }
        // Reveal panels only AFTER the host re-anchor/align pass below, so they
        // fade in already positioned instead of popping in (opacity 0 → 1) and then
        // visibly jumping while the host settles its own viewport — that pop+jump is
        // the boot "shaking". silentPanelBoot keeps them at opacity:0 until
        // showPanelFrame. The safety timer guarantees they are never left hidden if
        // the align path bails for any reason.
        const BOOT_ALIGN_DELAY_MS = 80;
        const BOOT_REVEAL_AFTER_ALIGN_MS = 350;
        let revealTimer = 0;
        const t = setTimeout(() => {
            if (isDraggingRef.current) { revealAll(); return; }
            // Same-pair cache boot: host viewport was correct before split — only
            // resize canvas to cell A once and sync iframes; never re-seek playhead.
            if (samePairCacheBootRef.current) {
                try {
                    const ch = window.chart;
                    if (ch) delete ch._multichartSkipResizeOffsetAdjust;
                    if (cellA) applyHostSlot(cellA, { reanchor: false });
                } catch (_) {}
                syncAllIframesToHost(mgr);
            } else {
                scheduleAlignHostOnly(mgr, 0);
                syncAllIframesToHost(mgr);
            }
            // Hold opacity:0 until settle window completes; showPanelFrame also
            // defers via __multichartBootRevealAfter set in flushPendingRangeSync.
            revealTimer = setTimeout(() => {
                try {
                    if (typeof window !== "undefined") {
                        window.__multichartBootRevealAfter = 0;
                    }
                } catch (_) {}
                revealAll();
            }, BOOT_REVEAL_AFTER_ALIGN_MS);
        }, BOOT_ALIGN_DELAY_MS);
        const safetyReveal = setTimeout(() => {
            try {
                if (typeof window !== "undefined") {
                    window.__multichartBootRevealAfter = 0;
                }
            } catch (_) {}
            revealAll();
        }, 1800);
        return () => {
            clearTimeout(t);
            clearTimeout(revealTimer);
            clearTimeout(safetyReveal);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managerReady, dataReadyPanels, overlayFallbackPanels, layout.tiles]);

    // Per-iframe cell ResizeObserver — debounced resize when any panel
    // cell changes size (splitter release, layout switch, sidebar, etc.).
    useLayoutEffect(() => {
        if (!managerReady) return;
        const timers = new Map();
        const observers = [];

        for (const tile of layout.tiles) {
            if (tile.id === HOST_PANEL_ID) continue;
            const cell = cellRefs.current[tile.id];
            if (!cell) continue;
            const panelId = tile.id;
            const ro = new ResizeObserver(() => {
                if (isDraggingRef.current) return;
                if (isMultichartBootSettling()) return;
                clearTimeout(timers.get(panelId));
                timers.set(panelId, setTimeout(() => {
                    if (isDraggingRef.current) return;
                    resizeIframeInCell(cellRefs.current[panelId]);
                }, 100));
            });
            ro.observe(cell);
            observers.push(ro);
        }

        return () => {
            timers.forEach((tid) => clearTimeout(tid));
            observers.forEach((ro) => ro.disconnect());
        };
    }, [layout.tiles, managerReady, layoutId]);

    // When a NEW iframe becomes bridge-ready, push the host's current
    // file + timeframe so it boots with data even if the iframe URL was
    // missing a fileId (e.g. props were empty on first paint).
    //
    // IMPORTANT: only depends on `readyPanels` (+ managerReady).
    // initialFileId / initialTimeframe are deliberately read from REFS
    // (not props) so that a timeframe change on Panel A does NOT push
    // to every iframe — that would override Panel B's independent tf
    // even when sync.interval is off.  Timeframe sync is handled by the
    // dedicated "Interval sync" effect above which checks layoutSync.
    //
    // File / pair: only force the host dataset onto every iframe when
    // layout "Symbol" sync is ON. When it is off (including full backtest
    // replay), a tile that already reports its own fileId (user picked a
    // different pair on Panel B) must NOT be reset to the host when other
    // tiles become ready or when Panel A changes pair.
    useEffect(() => {
        if (!managerReady) return;
        const hostNt = readHostChartFileAndTf();
        const fid = (initialFileIdRef.current && String(initialFileIdRef.current).trim())
            || hostNt.fileId;
        const tf = (initialTimeframeRef.current && String(initialTimeframeRef.current).trim())
            || hostNt.tf;
        if (!fid) return;
        const mgr = managerRef.current;
        if (!mgr || !mgr.charts) return;
        const pushTf = !!(layoutSync && layoutSync.interval);
        const symFollow = !!(layoutSync && layoutSync.symbol);
        // Only stamp the host file onto every iframe when Symbol sync is on.
        // Backtest/replay file-lock must NOT override this — users turn all
        // layout toggles off to keep independent instruments per tile.
        const forceHostFileOnEveryTile = symFollow;
        const hostFidStr = String((hostNt.fileId || fid || "")).trim();
        const hostInBacktest = !!(typeof window !== "undefined"
            && window.chart
            && (window.chart.isBacktestMode || window.chart.backtestingSession));
        for (const c of mgr.charts.values()) {
            if (!c || c.host || !c.ready) continue;
            try {
                if (hostInBacktest) {
                    mgr.sendCommand(c.id, "syncFromHost", {
                        force: true,
                        syncTimeframe: pushTf,
                        syncSymbol: symFollow,
                    });
                } else if (forceHostFileOnEveryTile) {
                    mgr.sendCommandNoReply(c.id, "loadFile", { fileId: fid });
                } else {
                    const reported = c.state && c.state.fileId != null
                        ? String(c.state.fileId).trim()
                        : "";
                    if (reported && reported !== hostFidStr) {
                        continue;
                    }
                    mgr.sendCommandNoReply(c.id, "loadFile", { fileId: fid });
                }
                if (pushTf && tf) mgr.sendCommandNoReply(c.id, "setTimeframe", { tf });
            } catch (_) {}
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managerReady, readyPanels, layoutSync && layoutSync.interval, layoutSync && layoutSync.symbol]);

    // ─── Host-tile positioning ──────────────────────────────────────────
    //
    // Mount-once effect that positions the parent's #chartWrapper to
    // overlay cell A's grid bbox, then keeps it in sync via:
    //   - ResizeObserver on cell A   → grid template changes (2v→4→3l),
    //                                   right-panel resize, sidebar collapse
    //   - window 'resize' / 'scroll' → window/zoom changes (cell A's
    //                                   viewport coords shift)
    //
    // On unmount (user picks layout 1 from dropdown), every inline style
    // we set is cleared and chartWrapper falls back to its CSS default
    // (`inset: 0`), so single-chart UX is byte-identical to before this
    // component existed.
    //
    // useLayoutEffect (not useEffect) so the host slot is positioned in
    // the same paint frame as the grid mount — no flash where the parent
    // chart still fills the full container.
    useLayoutEffect(() => {
        const cellA = cellRefs.current[HOST_PANEL_ID];
        if (!cellA) return;

        let raf = 0;
        let settleTimer = 0;
        const positionHostOnly = () => {
            applyHostSlotPositionOnly(cellA);
        };
        const repaintHost = () => {
            if (_hostViewportFrozenCheck()) {
                scheduleHostBootResize(cellA);
                return;
            }
            // Resize/reposition only — do NOT re-anchor the viewport on every
            // ResizeObserver/window tick (that caused the host chart to drift
            // left/right while panels were loading). The intentional re-anchor
            // is handled once after the boot settles.
            applyHostSlot(cellA, { reanchor: false });
        };
        const schedule = () => {
            if (isDraggingRef.current) return;
            if (!raf) {
                raf = window.requestAnimationFrame(() => {
                    raf = 0;
                    positionHostOnly();
                });
            }
            clearTimeout(settleTimer);
            settleTimer = window.setTimeout(repaintHost, 150);
        };

        repaintHost();

        const ro = new ResizeObserver(schedule);
        ro.observe(cellA);

        const onWin = () => schedule();
        window.addEventListener("resize", onWin, { passive: true });
        window.addEventListener("scroll", onWin, { passive: true, capture: true });

        // Focus-tracking shim: cell A has pointerEvents:none (so the
        // parent chartWrapper captures pointer activity), so the cell's
        // own onMouseDownCapture never fires. Listen on #chartWrapper
        // instead — clicking anywhere on the parent chart means the
        // user is interacting with tile A.
        const wrapper = document.getElementById(HOST_WRAPPER_ID);
        const onHostPointerDown = (ev) => {
            try {
                if (ev && ev.target && typeof ev.target.closest === "function") {
                    if (ev.target.closest("#multichart-global-settings-root")) return;
                }
            } catch (_) {}
            // Shape select runs in drawing-tools-manager document capture (svg + canvas).
            // Here we only focus panel A and defer peer UI cleanup.
            try {
                const ch = window.chart;
                if (ch && typeof ch.hideContextMenu === "function") ch.hideContextMenu();
            } catch (_) {}
            const prev = focusedPanelIdRef.current;
            focusPanelById(HOST_PANEL_ID);
            const grid = window.__multichartGrid;
            if (!grid) return;
            setTimeout(() => {
                try {
                    if (typeof window !== "undefined" && window.__v9DrawingSelectionGuardUntil) {
                        if (performance.now() < window.__v9DrawingSelectionGuardUntil) return;
                    }
                } catch (_) {}
                if (prev !== HOST_PANEL_ID) {
                    if (typeof grid.clearDrawingUiOnOtherPanels === "function") {
                        grid.clearDrawingUiOnOtherPanels(HOST_PANEL_ID);
                    }
                }
            }, 0);
        };
        if (wrapper) {
            wrapper.addEventListener("pointerdown", onHostPointerDown, { capture: true });
        }

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            clearTimeout(settleTimer);
            ro.disconnect();
            window.removeEventListener("resize", onWin);
            window.removeEventListener("scroll", onWin, { capture: true });
            if (wrapper) {
                wrapper.removeEventListener("pointerdown", onHostPointerDown, { capture: true });
            }
            clearHostSlot();
        };
        // Mount-once. Subsequent layout.tiles changes are handled by the
        // ResizeObserver (cell A's bbox changes when grid template changes,
        // which fires the observer and re-applies the host slot).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Push sync-mode changes to the live manager ─────────────────────
    //
    // The MultichartManager constructor defaults syncMode to crosshair +
    // drawings only. React's layoutSync state matches (time/dateRange/symbol OFF).
    // If we only pushed on `[layoutSync]` change the user would see this
    // mismatch on first split: panels would actually pan/zoom together
    // (manager default visibleRange:true) even though the dropdown
    // reads "Time / Date Range OFF".
    //
    // Fix: also depend on `managerReady` so the same useEffect fires the
    // moment the manager is created — pushing the user's CURRENT toggle
    // state instead of the manager's all-true defaults. Subsequent
    // toggle clicks re-fire via the layoutSync dep as before.
    useEffect(() => {
        const mgr = managerRef.current;
        if (!mgr || typeof mgr.setSyncMode !== "function") return;
        try {
            // Only these four map into MultichartManager / sync-bridge postMessage
            // fan-out. `layoutSync.interval`, `indicators`, and `chartType` are
            // handled elsewhere (React timeframe listener; legacy panelManager;
            // indicator chips always target the focused panel in V9).
            const dateRangeOn = !!(layoutSync && layoutSync.dateRange);
            const timeOn = !!(layoutSync && layoutSync.time);
            // Date Range = continuous TradingView wall-clock sync (wins when both on).
            // Time only = discrete right-edge sync per timeframe (5m jumps every 5m).
            mgr.setSyncMode({
                crosshair:    !!(layoutSync && layoutSync.crosshair),
                visibleRange: dateRangeOn,
                timeSync:     timeOn && !dateRangeOn,
                symbol:       !!(layoutSync && layoutSync.symbol),
                drawings:     !!(layoutSync && layoutSync.drawings),
            });
            const hostBridge = typeof window !== "undefined" ? window.__multichartHostBridge : null;
            if (hostBridge && typeof hostBridge.refreshSyncFlags === "function") {
                try { hostBridge.refreshSyncFlags(); } catch (_) {}
            }
        } catch (_) {}
    }, [layoutSync, managerReady]);

    // ─── Interval (timeframe) sync ──────────────────────────────────────
    //
    // Fan out the host chart's timeframe to every iframe **only** when the
    // layout "Interval" toggle is on. Same-dataset / backtest replay still
    // share one virtual playhead (replayTick) and one file lock (loadFile),
    // but independent per-panel timeframes are a supported UX when Interval
    // is off — do not override them when the user changes TF on tile A.
    //
    // Listen on chart.js's `timeframeChanged` on the parent window (tile A).
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onTfChanged = (ev) => {
            const mgr = managerRef.current;
            if (!(layoutSync && layoutSync.interval)) {
                return;
            }
            if (!mgr || typeof mgr.sendCommand !== "function") return;
            const tf = (ev && ev.detail && ev.detail.timeframe)
                || (window.chart && window.chart.currentTimeframe)
                || null;
            if (!tf) return;
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue; // host already changed; iframes only
                try { mgr.sendCommand(c.id, "setTimeframe", { tf }); } catch (_) {}
            }
        };
        window.addEventListener("timeframeChanged", onTfChanged);
        return () => window.removeEventListener("timeframeChanged", onTfChanged);
    }, [layoutSync]);

    // ─── Symbol/file sync ───────────────────────────────────────────────
    //
    // Same pattern as Interval. When the host loads a new file (user
    // picks a different pair from the symbol selector) AND
    // layoutSync.symbol is on, broadcast loadFile to every iframe.
    // chart.js fires `chartDataLoaded` on every successful load with
    // the new fileId in its detail.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let lastBroadcastFileId = null;
        const onDataLoaded = (ev) => {
            if (!(layoutSync && layoutSync.symbol)) return;
            const mgr = managerRef.current;
            if (!mgr || typeof mgr.sendCommand !== "function") return;
            const fileId = (window.chart && window.chart.currentFileId) || null;
            if (!fileId) return;
            // Coalesce: chartDataLoaded can fire many times for a single
            // file (resamples, refetches). Broadcast only when the file
            // id actually changes.
            if (String(fileId) === String(lastBroadcastFileId)) return;
            lastBroadcastFileId = String(fileId);
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue;
                try { mgr.sendCommand(c.id, "loadFile", { fileId }); } catch (_) {}
            }
        };
        window.addEventListener("chartDataLoaded", onDataLoaded);
        return () => window.removeEventListener("chartDataLoaded", onDataLoaded);
    }, [layoutSync]);

    // ─── Replay sync (parent → iframes) ─────────────────────────────────
    //
    // When the parent enters backtest replay (mode=backtest), each candle
    // tick fires `replayVirtualTimeChanged` on `window` with `{ timestamp,
    // symbol }` (replay-system.js:4745, 4783). We mirror that timestamp
    // to every iframe panel via panel-cmd-bridge `replayTick`, and the
    // iframe's own replaySystem calls goToReplayTimestamp(ts) to slide
    // its visible candle slice to the same virtual time.
    //
    // The iframe's replay TOOLBAR is hidden by the multichart shim
    // (data-v9-chrome="1"), so only the parent's toolbar shows
    // play/pause/seek controls. The iframe's chart engine STILL runs its
    // replaySystem internals — that's the mechanism that knows how to
    // slice fullRawData and resample to the current timeframe.
    //
    // Lifecycle:
    //   • First tick after grid mount → broadcast `replayEnter` (sets
    //     up isActive + fullRawData on the iframe, then seeks).
    //   • Subsequent ticks → broadcast `replayTick` (fast seek only).
    //   • Newly-added iframes mid-replay receive `replayEnter` on the
    //     next tick (via lazy enter inside panel-cmd-bridge replayTick).
    //   • Parent exits replay → monkey-patched exitReplayMode broadcasts
    //     `replayExit` so iframes return to full-file view.
    //
    // HYBRID MODEL: iframes run their OWN local play loops (for smooth
    // animation) AND receive a drift-correcting replayTick on every
    // parent candle advance. panel-cmd-bridge forces a seek on every
    // tick (no drift tolerance) so panels never diverge.
    //
    // PASSIVE MIRROR: parent tile A is the only play loop. Parent broadcasts
    // replayMultichartFrame on every animation frame; iframe panels apply
    // replayFrame and never start a local play loop.
    //
    // The shared replay state is held in a ref so the listener effect
    // (mount-once) and the prime-on-ready effect (depends on
    // readyPanels) can both read/write the same lastBroadcastTs and
    // everEntered fields without re-creating the listeners on every
    // ready change.
    const replayStateRef = useRef({
        lastBroadcastTs: 0,
        /** Dedupe multichart `replayTick` / `replayEnter`: `${ts}:${idx}` — futures data may repeat `t`. */
        lastReplayDedupe: null,
        everEntered: false,
        // Tri-state — has the PARENT chart's replaySystem ever entered
        // replay since the page loaded?
        //   null  = unknown (pre-monkey-patch install or parent never
        //                    touched replay yet — could be either
        //                    "bootstrap still in flight" or "no
        //                    backtest mode at all"; primeFromParent
        //                    treats this as "wait, do nothing")
        //   true  = parent IS or HAS BEEN in replay (so isActive=false
        //                    means user explicitly exited; safe to
        //                    broadcast replayExit to iframes)
        //   false = unused (kept the type tri-state for future use)
        //
        // Without this flag primeFromParent races with parent's async
        // autoLoadBacktestingData: parent.replaySystem.isActive is
        // false during the bootstrap window, prime sends replayExit,
        // iframes auto-enter replay AFTER and immediately exit (because
        // pendingReplayDesired=false sticks via drainPendingReplay).
        // Result: every iframe shows full data window while parent
        // shows session-start replay slice. User reports "panels show
        // different ranges, not in replay".
        parentEverEntered: null,
    });

    // Prime helper: shared between the mount-once tick listener and the
    // readyPanels-watching effect. If parent is in active replay, send
    // replayEnter to every iframe panel that's bridge-ready but hasn't
    // been told yet.
    function _primeReplayFromParent() {
        try {
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return;
            const ch = (typeof window !== "undefined") ? window.chart : null;
            const rs = ch && ch.replaySystem;
            const parentInReplay = !!(rs && rs.isActive);
            const ts = parentInReplay ? rs.replayTimestamp : null;

            if (parentInReplay) {
                if (!Number.isFinite(ts)) return;
                replayStateRef.current.lastBroadcastTs = ts;
                replayStateRef.current.everEntered = true;
                // Catch "patch hasn't installed yet but parent is
                // already in replay" race — set the flag so any later
                // prime call (e.g. user exits later) can distinguish
                // exit from bootstrap-in-flight.
                replayStateRef.current.parentEverEntered = true;
                const parentIsPlaying = !!rs.isPlaying;
                const parentSpeed = Number(rs.speed) || 1;
                const parentMode = (typeof rs.getPlaybackMode === "function")
                    ? rs.getPlaybackMode()
                    : (rs.playbackMode || "tick");
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.ready) continue;
                    try {
                        if (typeof mgr.sendCommandNoReply === "function") {
                            mgr.sendCommandNoReply(c.id, "replayEnter", { timestamp: ts });
                        } else {
                            mgr.sendCommand(c.id, "replayEnter", { timestamp: ts });
                        }
                    } catch (_) {}
                    try {
                        const stf = rs.stepTimeframeOverride;
                        mgr.sendCommand(c.id, "replaySetStepTf", {
                            tf: stf == null ? null : stf,
                        });
                    }
                    catch (_) {}
                    try {
                        const syncTf = !!(layoutSyncRef.current && layoutSyncRef.current.interval);
                        const syncSym = !!(layoutSyncRef.current && layoutSyncRef.current.symbol);
                        mgr.sendCommand(c.id, "syncFromHost", {
                            force: true,
                            syncTimeframe: syncTf,
                            syncSymbol: syncSym,
                        });
                    }
                    catch (_) {}
                    try { mgr.sendCommand(c.id, "replaySetSpeed", { speed: parentSpeed }); }
                    catch (_) {}
                    try { mgr.sendCommand(c.id, "replaySetMode", { mode: parentMode }); }
                    catch (_) {}
                    if (parentIsPlaying) {
                        try { mgr.sendCommand(c.id, "replayPlay", { speed: parentSpeed, mode: parentMode }); }
                        catch (_) {}
                    }
                }
            } else if (replayStateRef.current.parentEverEntered === true) {
                // Parent IS NOT currently in replay BUT has entered
                // replay at least once during this page session →
                // user explicitly exited (or paused-and-exited).
                // Tell iframes to drop their auto-entered replay
                // state so they show the full slice like parent.
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.ready) continue;
                    try { mgr.sendCommand(c.id, "replayExit", {}); }
                    catch (_) {}
                }
            }
            // else: parent has NEVER entered replay yet. This is the
            // "page just opened with mode=backtest, parent's async
            // autoLoadBacktestingData → enterReplayMode chain hasn't
            // completed yet" window. Sending replayExit here would
            // kick iframes OUT of replay just as they're about to
            // auto-enter via their own autoLoad — visible bug:
            // panels show full data while Panel A shows session-start
            // replay slice. Solution: do nothing. The monkey-patched
            // enterReplayMode (above) re-runs primeFromParent the
            // moment parent enters, so iframes will receive
            // replayEnter at parent's ts as soon as parent is ready.
        } catch (_) {}
    }

    useEffect(() => {
        if (typeof window === "undefined") return;

        const onReplayTick = (ev) => {
            const mgr = managerRef.current;
            if (!mgr) return;
            // During play, iframes mirror via replayMultichartFrame — replayTick
            // seeks to a closed bar and can desync / stall tick animation.
            const hostRs = window.chart && window.chart.replaySystem;
            if (hostRs && hostRs.isActive && hostRs.isPlaying) return;
            const ts = ev && ev.detail && ev.detail.timestamp;
            if (!Number.isFinite(ts)) return;
            const idx = ev.detail && ev.detail.currentIndex;
            const dedupe = Number.isFinite(idx) ? `${ts}:${idx}` : String(ts);
            if (dedupe === replayStateRef.current.lastReplayDedupe) return;
            replayStateRef.current.lastReplayDedupe = dedupe;
            replayStateRef.current.lastBroadcastTs = ts;
            const cmd = replayStateRef.current.everEntered ? "replayTick" : "replayEnter";
            replayStateRef.current.everEntered = true;
            // Use sendCommandNoReply for the hot tick path — at 60x
            // playback speed this fires 60 events/sec * N panels and
            // the per-call Promise + Map.set + setTimeout overhead of
            // sendCommand becomes measurable. Fire-and-forget cuts
            // ~0.3ms/call, freeing the parent's main thread to keep
            // running its own play loop without stuttering.
            const useNoReply = (cmd === "replayTick")
                && typeof mgr.sendCommandNoReply === "function";
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue;
                try {
                    if (useNoReply) {
                        mgr.sendCommandNoReply(c.id, cmd, { timestamp: ts });
                    } else {
                        mgr.sendCommand(c.id, cmd, { timestamp: ts });
                    }
                } catch (_) { /* ignore — the next tick retries */ }
            }
        };

        window.addEventListener("replayVirtualTimeChanged", onReplayTick);

        // Parent tile A streams every replay animation frame (tick-by-tick
        // forming candle, fast mode, candle mode). Coalesce to one postMessage
        // per display frame, capped at 30fps to iframes (reduces client CPU).
        let coalescedFrameDetail = null;
        let coalescedFrameScheduled = false;
        let lastReplayFrameBroadcastAt = 0;
        // Cap iframe frame delivery. During play we stream at most one frame per
        // display refresh (~60fps) and DROP intermediate sub-frames — at high
        // playback speeds the host ticks many virtual candles per real frame, but
        // each iframe can only paint once per refresh anyway. Sending every host
        // tick just floods the iframe with slice+resample+render work it can't keep
        // up with (the freeze). Paused (step/scrub) stays at ~30fps. TradingView
        // likewise never repaints panes faster than the display.
        const REPLAY_BROADCAST_MIN_MS_PLAY = 1000 / 60;
        const REPLAY_BROADCAST_MIN_MS_PAUSED = 1000 / 30;

        const broadcastReplayFrameToIframes = (detail) => {
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts || !detail) return;
            for (const c of mgr.charts.values()) {
                if (!c || c.host || !c.frame) continue;
                try {
                    if (typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(c.id, "replayFrame", detail);
                    } else {
                        mgr.sendCommand(c.id, "replayFrame", detail);
                    }
                } catch (_) {}
            }
        };

        const flushCoalescedReplayFrame = () => {
            coalescedFrameScheduled = false;
            const detail = coalescedFrameDetail;
            if (!detail || !Number.isFinite(Number(detail.timestamp))) {
                coalescedFrameDetail = null;
                return;
            }
            // Prefer manager fast path when chart bundle is updated; skip duplicate
            // React-grid broadcast to avoid double postMessage per frame.
            if (typeof window.__multichartManagerBroadcastReplay === "function") {
                coalescedFrameDetail = null;
                window.__multichartManagerBroadcastReplay(detail);
                return;
            }
            coalescedFrameDetail = null;
            lastReplayFrameBroadcastAt = performance.now();
            broadcastReplayFrameToIframes(detail);
        };

        const onMultichartReplayFrame = (ev) => {
            const detail = ev && ev.detail;
            if (!detail || !Number.isFinite(Number(detail.timestamp))) return;
            // Always coalesce to the display refresh — keep only the LATEST frame
            // and drop everything in between. This caps per-iframe work to one
            // mirror+render per refresh whether playing, stepping, or scrubbing.
            coalescedFrameDetail = detail;
            if (coalescedFrameScheduled) return;
            coalescedFrameScheduled = true;
            window.requestAnimationFrame(flushCoalescedReplayFrame);
        };
        window.addEventListener("replayMultichartFrame", onMultichartReplayFrame);

        // ─── Replay keyboard forward (iframe → parent) ─────────────
        //
        // Iframes intercept SPACE / Shift+Arrow / ./ , and post
        // `replay-keyboard` here instead of toggling their OWN
        // replaySystem. We route the action to the parent's
        // replaySystem — its monkey-patched play/pause/etc methods
        // then broadcast back out to every iframe, so all panels
        // toggle together. Single source of truth, no more "panel B
        // plays alone".
        const onReplayKeyboard = (ev) => {
            const data = ev && ev.data;
            if (!data || data.type !== "replay-keyboard") return;
            const ch = (typeof window !== "undefined") ? window.chart : null;
            const rs = ch && ch.replaySystem;
            if (!rs) return;
            switch (data.action) {
                case "togglePlay":
                    if (typeof rs.togglePlay === "function") {
                        try { rs.togglePlay(); } catch (_) {}
                    } else if (rs.isActive) {
                        // Fallback for older replay system versions
                        if (rs.isPlaying && typeof rs.pause === "function") {
                            try { rs.pause(); } catch (_) {}
                        } else if (!rs.isPlaying && typeof rs.play === "function") {
                            try { rs.play(); } catch (_) {}
                        }
                    }
                    break;
                case "stepForward":
                    if (rs.isActive && typeof rs.requestStepForward === "function") {
                        try { rs.requestStepForward(); } catch (_) {}
                    }
                    break;
                case "stepBackward":
                    if (rs.isActive && typeof rs.requestStepBackward === "function") {
                        try { rs.requestStepBackward(); } catch (_) {}
                    }
                    break;
                default:
                    break;
            }
        };
        window.addEventListener("message", onReplayKeyboard);

        // On mount: prime any iframes that are already ready before the
        // first tick (covers "user opens layout 2v while paused at
        // session start" — no tick will fire until they hit play).
        _primeReplayFromParent();

        // Hard guard: while parent is in replay, re-align iframe playheads only
        // when the host is PLAYING and panels may drift. The old 800ms poll while
        // paused sent syncReplayFromHost to every iframe continuously (cmd-result
        // + render churn) even when the user was only panning charts.
        const replayAlignGuardMs = 2500;
        const runReplayAlignGuard = () => {
            try {
                const mgr = managerRef.current;
                if (!mgr || !mgr.charts) return;
                const ch = window.chart;
                const rs = ch && ch.replaySystem;
                if (!rs || !rs.isActive || !rs.isPlaying) return;
                const ts = Number(rs.replayTimestamp);
                if (!Number.isFinite(ts)) return;
                replayStateRef.current.lastBroadcastTs = ts;
                replayStateRef.current.everEntered = true;
                replayStateRef.current.parentEverEntered = true;
                const send = typeof mgr.sendCommandNoReply === "function"
                    ? mgr.sendCommandNoReply.bind(mgr)
                    : mgr.sendCommand.bind(mgr);
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.ready) continue;
                    try {
                        send(c.id, "syncReplayFromHost", { force: true });
                    } catch (_) {}
                }
            } catch (_) {}
        };
        const replayAlignGuard = setInterval(runReplayAlignGuard, replayAlignGuardMs);

        // Helper: broadcast a replay command to every non-host iframe.
        // Used by all the playback-state monkey-patches below.
        const broadcastToIframes = (cmd, args) => {
            try {
                const mgr = managerRef.current;
                if (!mgr) return;
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.ready) continue;
                    try { mgr.sendCommand(c.id, cmd, args || {}); }
                    catch (_) {}
                }
            } catch (_) {}
        };

        const onReplayCut = (e) => {
            const d = e?.detail;
            if (!d || !Number.isFinite(d.timestamp)) return;
            replayStateRef.current.lastBroadcastTs = d.timestamp;
            broadcastToIframes("replayPause", {});
            broadcastToIframes("replayCut", {
                timestamp: d.timestamp,
                orderCutoff: d.orderCutoff,
            });
        };
        window.addEventListener("talariaReplayCut", onReplayCut);

        // Monkey-patch parent's exitReplayMode + play + pause + setSpeed
        // + setPlaybackMode so iframes mirror the parent's full playback
        // state (not just the per-tick timestamp). Done lazily because
        // replaySystem may not exist yet at mount — retry up to 5s.
        let patchedRs = null;
        let patchOriginalExit = null;
        let patchOriginalEnter = null;
        let patchOriginalPlay = null;
        let patchOriginalPause = null;
        let patchOriginalSetSpeed = null;
        let patchOriginalSetMode = null;
        let patchOriginalSetStepTf = null;
        let patchOriginalGoTo = null;
        let patchOriginalRequestStepFwd = null;
        let patchOriginalRequestStepBack = null;
        let patchOriginalStepFwd = null;
        let patchOriginalStepBack = null;
        // After host step forward/back: snap every iframe to the same bar immediately
        // (same path as goToReplayTimestamp + replayFrame mirror on tile A).
        const syncPanelsAfterHostStep = (rs) => {
            if (!rs || !rs.isActive) return;
            const ts = Number(rs.replayTimestamp);
            const idx = rs.currentIndex;
            if (!Number.isFinite(ts)) return;
            replayStateRef.current.lastBroadcastTs = ts;
            replayStateRef.current.everEntered = true;
            replayStateRef.current.lastReplayDedupe = Number.isFinite(idx)
                ? `${ts}:${idx}`
                : String(ts);
            forceAllPanelsToTimestamp(ts);
            let detail = null;
            if (typeof rs._buildMultichartReplayFrameDetail === "function") {
                try { detail = rs._buildMultichartReplayFrameDetail(); } catch (_) {}
            }
            if (detail && Number.isFinite(Number(detail.timestamp))) {
                lastReplayFrameBroadcastAt = performance.now();
                broadcastReplayFrameToIframes(detail);
            }
        };
        const wrapStepWithPanelSync = (original) => function (...args) {
            const result = original.apply(this, args);
            try {
                Promise.resolve().then(() => syncPanelsAfterHostStep(this));
            } catch (_) {}
            return result;
        };
        // Authoritative "force every panel to the parent's exact candle".
        // Shared by the goToReplayTimestamp guard AND the
        // replayVirtualTimeChanged listener so there is ONE place that
        // decides what each panel must show.
        const forceAllPanelsToTimestamp = (ts) => {
            if (!Number.isFinite(ts)) return;
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return;
            replayStateRef.current.lastBroadcastTs = ts;
            const cmd = replayStateRef.current.everEntered ? "replayTick" : "replayEnter";
            replayStateRef.current.everEntered = true;
            for (const c of mgr.charts.values()) {
                if (!c || c.host || !c.ready) continue;
                try {
                    if (cmd === "replayTick" && typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(c.id, "replayTick", { timestamp: ts });
                    } else {
                        mgr.sendCommand(c.id, cmd, { timestamp: ts });
                    }
                } catch (_) {}
            }
        };
        const tryPatch = (deadline) => {
            const ch = window.chart;
            if (ch && ch.replaySystem
                && typeof ch.replaySystem.exitReplayMode === "function"
                && !ch.replaySystem.__multichartExitPatched) {
                patchedRs = ch.replaySystem;

                // If parent already entered replay before we got around
                // to patching (e.g. mode=backtest autoLoad fired its
                // queueMicrotask enterReplayMode before MultichartGrid
                // mounted), pick up the existing state so primeFromParent
                // doesn't think parent has never been in replay.
                if (patchedRs.isActive) {
                    replayStateRef.current.parentEverEntered = true;
                }

                // ── enterReplayMode → mark parentEverEntered, re-prime
                //    iframes so a panel that was out of sync (e.g. it
                //    had auto-exited via the previous race) snaps to
                //    parent's new ts ──
                if (typeof patchedRs.enterReplayMode === "function") {
                    patchOriginalEnter = patchedRs.enterReplayMode.bind(patchedRs);
                    patchedRs.enterReplayMode = function (options) {
                        const result = patchOriginalEnter(options);
                        replayStateRef.current.parentEverEntered = true;
                        // Defer one microtask so any synchronous state
                        // updates inside the original (isActive flip,
                        // replayTimestamp set) have settled before we
                        // read them.
                        Promise.resolve().then(() => {
                            try { _primeReplayFromParent(); } catch (_) {}
                        });
                        return result;
                    };
                }

                // ── exitReplayMode → broadcast replayExit ──
                patchOriginalExit = patchedRs.exitReplayMode.bind(patchedRs);
                patchedRs.exitReplayMode = function () {
                    broadcastToIframes("replayExit", {});
                    replayStateRef.current.everEntered = false;
                    replayStateRef.current.lastBroadcastTs = 0;
                    replayStateRef.current.lastReplayDedupe = null;
                    return patchOriginalExit();
                };

                // ── play → broadcast replayPlay {speed, mode} ──
                if (typeof patchedRs.play === "function") {
                    patchOriginalPlay = patchedRs.play.bind(patchedRs);
                    patchedRs.play = function () {
                        const result = patchOriginalPlay();
                        try {
                            const speed = Number(this.speed) || 1;
                            const mode = (typeof this.getPlaybackMode === "function")
                                ? this.getPlaybackMode()
                                : (this.playbackMode || "tick");
                            const stf = this.stepTimeframeOverride;
                            broadcastToIframes("replaySetStepTf", {
                                tf: stf == null ? null : stf,
                            });
                            broadcastToIframes("replayPlay", { speed, mode });
                            // Defer one frame so play() finishes arming the loop, then
                            // mirror the exact host slice to iframes (not replayTick seek).
                            const rsPlay = this;
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    try {
                                        if (typeof rsPlay._multichartBroadcastReplayFrame === 'function') {
                                            rsPlay._multichartBroadcastReplayFrame();
                                        }
                                    } catch (_) {}
                                });
                            });
                        } catch (_) {}
                        return result;
                    };
                }

                // ── pause → broadcast replayPause + final replayTick ──
                if (typeof patchedRs.pause === "function") {
                    patchOriginalPause = patchedRs.pause.bind(patchedRs);
                    patchedRs.pause = function () {
                        const result = patchOriginalPause();
                        broadcastToIframes("replayPause", {});
                        // Mid-tick pause: mirror frozen forming candle (not a bare timestamp seek).
                        try {
                            if (typeof this._buildMultichartReplayFrameDetail === "function") {
                                const detail = this._buildMultichartReplayFrameDetail();
                                if (this._savedTickState) {
                                    detail.tickProgress = Number(this._savedTickState.tickProgress) || 0;
                                    detail.tickElapsedMs = Number(this._savedTickState.tickElapsedMs) || 0;
                                    const ac = this._savedTickState.animatingCandle;
                                    if (ac) {
                                        detail.animatedCandle = {
                                            t: ac.t,
                                            o: ac.open,
                                            h: ac.high,
                                            l: ac.low,
                                            c: ac.close,
                                            v: ac.volume || 0,
                                        };
                                    }
                                }
                                detail.isPlaying = false;
                                lastReplayFrameBroadcastAt = performance.now();
                                broadcastReplayFrameToIframes(detail);
                            }
                        } catch (_) {}
                        return result;
                    };
                }

                // ── setSpeed → broadcast replaySetSpeed {speed} ──
                if (typeof patchedRs.setSpeed === "function") {
                    patchOriginalSetSpeed = patchedRs.setSpeed.bind(patchedRs);
                    patchedRs.setSpeed = function (speed) {
                        const result = patchOriginalSetSpeed(speed);
                        try {
                            broadcastToIframes("replaySetSpeed", {
                                speed: Number(this.speed) || 1,
                            });
                        } catch (_) {}
                        return result;
                    };
                }

                // ── setPlaybackMode → broadcast replaySetMode {mode} ──
                if (typeof patchedRs.setPlaybackMode === "function") {
                    patchOriginalSetMode = patchedRs.setPlaybackMode.bind(patchedRs);
                    patchedRs.setPlaybackMode = function (mode, opts) {
                        const result = patchOriginalSetMode(mode, opts);
                        try {
                            const stf = this.stepTimeframeOverride;
                            broadcastToIframes("replaySetStepTf", {
                                tf: stf == null ? null : stf,
                            });
                            const m = (typeof this.getPlaybackMode === "function")
                                ? this.getPlaybackMode()
                                : (this.playbackMode || "tick");
                            broadcastToIframes("replaySetMode", { mode: m });
                        } catch (_) {}
                        return result;
                    };
                }

                // ── setStepTimeframe (replay INTERVAL / candle step) ──
                if (typeof patchedRs.setStepTimeframe === "function") {
                    patchOriginalSetStepTf = patchedRs.setStepTimeframe.bind(patchedRs);
                    patchedRs.setStepTimeframe = function (timeframe) {
                        const result = patchOriginalSetStepTf(timeframe);
                        try {
                            const stf = this.stepTimeframeOverride;
                            broadcastToIframes("replaySetStepTf", {
                                tf: stf == null ? null : stf,
                            });
                        } catch (_) {}
                        return result;
                    };
                }

                // ── goToReplayTimestamp → HARD GUARD: every seek / scrub /
                //    go-to-date forces ALL panels onto the parent's exact
                //    candle ──
                //
                // Requirement: no matter the action — play, pause, step
                // forward/back, scrub the timeline, or a go-to-date jump —
                // every panel MUST sit on the same candle/timestamp as
                // Panel A. Step + play already broadcast via the
                // `replayVirtualTimeChanged` listener; this patch closes the
                // seek/scrub path (and acts as a belt-and-suspenders re-sync
                // for the others). It re-broadcasts the parent's resulting
                // candle to every panel. The panel-cmd `replayTick` handler
                // coalesces per animation frame and forces a seek, so this is
                // idempotent and cannot cause drift even if it overlaps the
                // event-driven broadcast.
                if (typeof patchedRs.goToReplayTimestamp === "function") {
                    patchOriginalGoTo = patchedRs.goToReplayTimestamp.bind(patchedRs);
                    patchedRs.goToReplayTimestamp = function (targetTs, options) {
                        const result = patchOriginalGoTo(targetTs, options);
                        try {
                            // Only mirror real moves: goToReplayTimestamp
                            // returns false when replay isn't active or the
                            // target was invalid — don't push a stale ts then.
                            if (this.isActive && result !== false) {
                                forceAllPanelsToTimestamp(Number(this.replayTimestamp));
                            }
                        } catch (_) {}
                        return result;
                    };
                }

                if (typeof patchedRs.requestStepForward === "function") {
                    patchOriginalRequestStepFwd = patchedRs.requestStepForward.bind(patchedRs);
                    patchedRs.requestStepForward = wrapStepWithPanelSync(patchOriginalRequestStepFwd);
                }
                if (typeof patchedRs.requestStepBackward === "function") {
                    patchOriginalRequestStepBack = patchedRs.requestStepBackward.bind(patchedRs);
                    patchedRs.requestStepBackward = wrapStepWithPanelSync(patchOriginalRequestStepBack);
                }
                if (typeof patchedRs.stepForward === "function") {
                    patchOriginalStepFwd = patchedRs.stepForward.bind(patchedRs);
                    patchedRs.stepForward = wrapStepWithPanelSync(patchOriginalStepFwd);
                }
                if (typeof patchedRs.stepBackward === "function") {
                    patchOriginalStepBack = patchedRs.stepBackward.bind(patchedRs);
                    patchedRs.stepBackward = wrapStepWithPanelSync(patchOriginalStepBack);
                }

                patchedRs.__multichartExitPatched = true;
                return;
            }
            if (Date.now() < deadline) {
                setTimeout(() => tryPatch(deadline), 200);
            }
        };
        tryPatch(Date.now() + 5000);

        return () => {
            clearInterval(replayAlignGuard);
            window.removeEventListener("replayVirtualTimeChanged", onReplayTick);
            window.removeEventListener("replayMultichartFrame", onMultichartReplayFrame);
            window.removeEventListener("talariaReplayCut", onReplayCut);
            window.removeEventListener("message", onReplayKeyboard);
            // Restore originals if we patched them — keeps single-
            // chart behavior intact when the user picks layout 1 again.
            if (patchedRs && patchedRs.__multichartExitPatched) {
                try {
                    if (patchOriginalExit)     patchedRs.exitReplayMode  = patchOriginalExit;
                    if (patchOriginalEnter)    patchedRs.enterReplayMode = patchOriginalEnter;
                    if (patchOriginalPlay)     patchedRs.play            = patchOriginalPlay;
                    if (patchOriginalPause)    patchedRs.pause           = patchOriginalPause;
                    if (patchOriginalSetSpeed) patchedRs.setSpeed        = patchOriginalSetSpeed;
                    if (patchOriginalSetMode)  patchedRs.setPlaybackMode = patchOriginalSetMode;
                    if (patchOriginalSetStepTf) patchedRs.setStepTimeframe = patchOriginalSetStepTf;
                    if (patchOriginalGoTo)     patchedRs.goToReplayTimestamp = patchOriginalGoTo;
                    if (patchOriginalRequestStepFwd) patchedRs.requestStepForward = patchOriginalRequestStepFwd;
                    if (patchOriginalRequestStepBack) patchedRs.requestStepBackward = patchOriginalRequestStepBack;
                    if (patchOriginalStepFwd) patchedRs.stepForward = patchOriginalStepFwd;
                    if (patchOriginalStepBack) patchedRs.stepBackward = patchOriginalStepBack;
                    delete patchedRs.__multichartExitPatched;
                } catch (_) {}
            }
        };
        // Mount-once. Re-prime on readyPanels change is in the next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-prime when a new iframe becomes bridge-ready DURING an active
    // parent replay. Without this, the user splits 1 → 2 mid-replay
    // and Panel B sits at the file's last bar while Panel A shows the
    // session at, say, the 30%-replay mark. The next tick eventually
    // catches B up via the lazy-enter in panel-cmd-bridge replayTick,
    // but for paused replay (no ticks) B would stay misaligned forever.
    // Sending replayEnter the moment B is ready closes that window.
    const orderSyncedPanelsRef = useRef(new Set([HOST_PANEL_ID]));
    useEffect(() => {
        // Defer to next microtask so the manager's `c.ready` flag has
        // been set (onChartReady runs synchronously before this state
        // update is processed, but the iframe's mgr.charts.get(id) may
        // not yet reflect c.ready=true in the same tick).
        const t = setTimeout(() => {
            _primeReplayFromParent();

            // Push host's existing open positions + pending orders to
            // newly-ready panels so order level lines appear immediately.
            try {
                const ch = (typeof window !== "undefined") ? window.chart : null;
                const om = ch && ch.orderManager;
                const grid = window.__multichartGrid;
                if (om && grid && typeof grid.runCommand === "function") {
                    const openPositions = Array.isArray(om.openPositions) ? om.openPositions : [];
                    const pendingOrders = Array.isArray(om.pendingOrders) ? om.pendingOrders : [];
                    for (const panelId of readyPanels) {
                        if (panelId === HOST_PANEL_ID) continue;
                        if (orderSyncedPanelsRef.current.has(panelId)) continue;
                        orderSyncedPanelsRef.current.add(panelId);
                        for (const pos of openPositions) {
                            if (!pos || pos.id == null) continue;
                            try { grid.runCommand("addOrder", { order: pos, kind: "opened" }, { panelId }).catch(() => {}); } catch (_) {}
                        }
                        for (const pend of pendingOrders) {
                            if (!pend || pend.id == null) continue;
                            try { grid.runCommand("addOrder", { order: pend, kind: "pending" }, { panelId }).catch(() => {}); } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        }, 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readyPanels]);

    // ─── Focus outline on the host's #chartWrapper ──────────────────────
    // Iframe tiles get their focused border via vanilla DOM injection
    // (see iframe focus-border effect below). The host's cell is invisible
    // behind the wrapper, so when tile A is focused we inject the same
    // overlay <div> as a child of #chartWrapper instead.
    // (Phase 7.2.4-fix) Host focus outline retired in favour of the
    // unified focus frame rendered as a sibling of #chartWrapper —
    // see focusedRect + the Fragment-sibling overlay at the bottom of
    // the JSX. We still call applyHostFocusOutline(false) once here
    // as cleanup so any overlay from older bundles or hot-reload
    // sessions is stripped on first mount.
    useEffect(() => {
        applyHostFocusOutline(false);
    }, []);

    // ─── Focus border for iframe cells (legacy cell-internal path) ──────
    //
    // Both the cell-internal vanilla-DOM injection AND the
    // grid-sibling React overlay have been retired in favour of a
    // SINGLE focus frame rendered as a sibling of #chartWrapper
    // inside #chart-container (see the focusedRect logic + the
    // bottom-of-return "Unified focus frame" JSX). That placement
    // wins because:
    //   • #chart-container has `isolation:isolate` → its children
    //     share one stacking context.
    //   • #chartWrapper sits at z-index 13 in that context (Panel A).
    //   • The grid container (with iframes inside) sits at z-12.
    //   • A sibling at z-14 paints above BOTH, so the same overlay
    //     works for the host AND for every iframe panel.
    //   • It's outside the grid container, so Chromium iframe
    //     compositing inside the grid cannot occlude it.
    //
    // We KEEP this effect, but only as a teardown — it strips any
    // legacy overlay still attached from older bundles or hot-reload
    // sessions.
    useEffect(() => {
        clearIframeFocusBorders(cellRefs.current);
        return () => clearIframeFocusBorders(cellRefs.current);
    }, [focusedPanelId, managerReady, layout.tiles]);

    // ─── Focused cell bounding rect (for the unified focus frame) ──────
    //
    // Single source of truth for where to draw the blue selection
    // outline. Coords are relative to #chart-container so the frame
    // (rendered as a sibling of #chartWrapper at z-14) lands exactly
    // over the focused cell, whether that's the host (Panel A — read
    // from cell A's slot, which the host wrapper is positioned to)
    // or any iframe panel.
    const [focusedRect, setFocusedRect] = useState(null);
    const computeFocusedRect = () => {
        if (typeof document === "undefined") return;
        if (!focusedPanelId) { setFocusedRect(null); return; }
        const cell = cellRefs.current[focusedPanelId];
        const parent = document.getElementById(HOST_CONTAINER_ID);
        if (!cell || !parent) { setFocusedRect(null); return; }
        const cellRect = cell.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const next = {
            left:   Math.round(cellRect.left   - parentRect.left),
            top:    Math.round(cellRect.top    - parentRect.top),
            width:  Math.round(cellRect.width),
            height: Math.round(cellRect.height),
        };
        // During splitter drag, move the focus frame via DOM only — avoid
        // setState every rAF (was re-rendering the whole grid at 60Hz).
        if (isDraggingRef.current) {
            updateFocusFrameDom(focusedPanelId, cellRefs.current);
            return;
        }
        setFocusedRect((prev) => {
            if (prev
                && prev.left === next.left
                && prev.top === next.top
                && prev.width === next.width
                && prev.height === next.height) {
                return prev;
            }
            return next;
        });
    };
    // Recompute on every input that can move/resize cells.
    useLayoutEffect(() => {
        computeFocusedRect();
        // (computeFocusedRect intentionally not in deps — it's an
        // inline closure rebuilt every render and depends only on
        // focusedPanelId via the ref, which is stable.)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedPanelId, layout, colFractions, rowFractions, containerSize, managerReady]);
    // Window resize — viewport change can shift cells if the parent
    // container is sized fluidly.
    useEffect(() => {
        function onWinResize() { computeFocusedRect(); }
        window.addEventListener("resize", onWinResize);
        return () => window.removeEventListener("resize", onWinResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedPanelId]);
    // Expose the rect computer so the splitter drag's flush() can
    // call it on every rAF tick to keep the focus frame glued to the
    // cell as the user resizes.
    const computeFocusedRectRef = useRef(computeFocusedRect);
    computeFocusedRectRef.current = computeFocusedRect;

    // ─── Focused-panel state → topbar reflection ────────────────────────
    //
    // When the user clicks panel B (which is on 5m showing GOLD), the
    // topbar's TF button row and symbol badge should switch to "5m" /
    // "GOLD" so they know which panel they're driving. We broadcast a
    // `multichartFocusChanged` window event with the focused panel's
    // current symbol + timeframe; TalariaV8bLive listens and updates its
    // local `tf` / `symbol` state.
    //
    // Dispatched whenever:
    //   • focusedPanelId changes (user clicked a different panel)
    //   • the focused panel's chart-state updates (it loaded a new file
    //     or changed timeframe via its own internal mechanism — e.g. host
    //     A's existing topbar wiring before the user has clicked another
    //     panel; or an iframe panel that received a panel-cmd)
    //
    // Round-trip safety: when the topbar reacts to this event by calling
    // setTf(...) → useEffect([tf]) → runCommand("setTimeframe", {tf:X}) →
    // host or iframe sees `currentTimeframe === X` and short-circuits to
    // a no-op. Same for symbol via loadFile.
    function readPanelState(panelId) {
        if (panelId === HOST_PANEL_ID) {
            const ch = window.chart;
            if (!ch) return null;
            return {
                symbol:    ch.currentSymbol    || null,
                timeframe: ch.currentTimeframe || null,
                fileId:    ch.currentFileId    || null,
            };
        }
        const mgr = managerRef.current;
        const c = mgr && mgr.charts && mgr.charts.get(panelId);
        if (!c || !c.state) return null;
        return {
            symbol:    c.state.symbol    || null,
            timeframe: c.state.timeframe || null,
            fileId:    c.state.fileId    || null,
        };
    }

    /** Dedupe mirror broadcasts — replay chart-state ticks must not re-fire tool sync every bar. */
    const lastFocusMirrorKeyRef = useRef("");

    function focusMirrorKey(panelId) {
        const state = readPanelState(panelId);
        return [
            String(panelId || ""),
            String(state && state.symbol != null ? state.symbol : ""),
            String(state && state.timeframe != null ? state.timeframe : ""),
            String(state && state.fileId != null ? state.fileId : ""),
        ].join("|");
    }

    function dispatchFocusChanged(panelId, opts) {
        const force = !!(opts && opts.force);
        const key = focusMirrorKey(panelId);
        if (!force && lastFocusMirrorKeyRef.current === key) return;
        lastFocusMirrorKeyRef.current = key;
        const state = readPanelState(panelId);
        try {
            window.dispatchEvent(new CustomEvent("multichartFocusChanged", {
                detail: {
                    panelId:   panelId,
                    symbol:    state ? state.symbol    : null,
                    timeframe: state ? state.timeframe : null,
                    fileId:    state ? state.fileId    : null,
                },
            }));
        } catch (_) {}
    }

    // Fire when the focused id changes.
    useEffect(() => {
        if (!focusedPanelId) return;
        // Defer one tick: when the user just clicked an iframe, the
        // panel-focus message arrives in the same task as the iframe's
        // chart event handler, which may then post a fresh chart-state
        // a moment later. Microtask defer means we publish AFTER state
        // has settled if both arrive in the same frame.
        const t = setTimeout(function runFocusPanelSideEffects() {
            try {
                if (typeof window !== "undefined" && window.__v9DrawingSelectionGuardUntil
                    && performance.now() < window.__v9DrawingSelectionGuardUntil) {
                    setTimeout(runFocusPanelSideEffects, 40);
                    return;
                }
            } catch (_) {}
            // Panel id changed — always publish even when symbol/tf/file match a prior visit.
            lastFocusMirrorKeyRef.current = "";
            dispatchFocusChanged(focusedPanelId, { force: true });
            const grid = window.__multichartGrid;
            if (grid && typeof grid.clearDrawingUiOnOtherPanels === "function") {
                grid.clearDrawingUiOnOtherPanels(focusedPanelId);
            } else if (grid && typeof grid.deselectDrawingsOnNonFocusedPanels === "function") {
                grid.deselectDrawingsOnNonFocusedPanels(focusedPanelId);
            }
            const syncDate = !!(layoutSyncRef.current && layoutSyncRef.current.dateRange);
            const mgr = managerRef.current;
            if (syncDate && mgr) {
                clearTimeout(_focusViewportSyncTimer);
                _focusViewportSyncTimer = setTimeout(() => {
                    try {
                        const ch = window.chart;
                        if (ch && typeof ch.dispatchScrollSync === "function") {
                            ch.dispatchScrollSync(true);
                        }
                        if (mgr) {
                            syncAllIframesToHost(mgr);
                        }
                    } catch (_) {}
                }, 60);
            }
        }, 0);
        return () => clearTimeout(t);
    }, [focusedPanelId]);

    // Stable ref to the latest layoutSync so the onState delegate below
    // can read it without re-running on every toggle change.
    const layoutSyncRef = useRef(layoutSync);
    useEffect(() => { layoutSyncRef.current = layoutSync; }, [layoutSync]);

    // Track per-panel last-broadcast tf/fileId so we don't echo a sync
    // back to the same panel and don't re-broadcast on noise updates
    // (chart-state from iframes can re-fire many times per pan).
    const lastBroadcastTfRef = useRef({});       // panelId -> tf
    const lastBroadcastFileRef = useRef({});     // panelId -> fileId
    /** Skip symbol-sync pull-back briefly after user picks a pair on this iframe tile. */
    const userPairLoadGuardRef = useRef({});

    // Fire when ANY panel's state updates. Two responsibilities:
    //
    //   (a) Update focused-panel mirror UI (existing behavior — drives
    //       the topbar OHLC + indicator chips when the focused panel
    //       reports new tf / fileId / candle counts).
    //
    //   (b) Bidirectional Interval fan-out (TradingView UX).
    //       When sync.interval is on, a tf change on ANY iframe panel
    //       propagates to the host and every other iframe.
    //       When Interval is off, do not push timeframe — panels keep their own TF
    //       even in backtest / same-file layouts (replay wall-clock sync is separate).
    //       The host's own tf changes are handled by `timeframeChanged`
    //       (effect above); iframe tf/fileId arrive via sync-bridge
    //       `chart-state` postMessage.
    onStateAnyRef.current = (id, state) => {
        // Hide the tile loading overlay only once bars exist AND the iframe's
        // viewport settle window has elapsed — bridge-ready fires before
        // loadFileData finishes (empty-chart flash), and "first bars" fires
        // before the panel finishes re-anchoring its viewport (left/right
        // shake). We hold the overlay across OVERLAY_SETTLE_HOLD_MS so the
        // reposition happens behind it.
        if (state && Number(state.candleCount) > 0
            && id !== HOST_PANEL_ID
            && !dataReadyPanels.has(id)
            && !overlayHoldTimersRef.current[id]) {
            const hostNt = readHostChartFileAndTf();
            const cacheBoot = samePairCacheBootRef.current && hostHasCloneableBars(hostNt.fileId);
            const holdMs = cacheBoot
                ? OVERLAY_SETTLE_HOLD_CACHE_MS
                : OVERLAY_SETTLE_HOLD_DEFAULT_MS;
            if (holdMs <= 0) {
                markPanelDataReadyRef.current(id, { immediate: true });
            } else {
                overlayHoldTimersRef.current[id] = setTimeout(() => {
                    delete overlayHoldTimersRef.current[id];
                    markPanelDataReadyRef.current(id);
                }, holdMs);
            }
        }

        // (a) focus mirror
        if (id === focusedPanelIdRef.current) {
            dispatchFocusChanged(id);
        }

        // (b) bidirectional fan-out — only act on iframe sources; host
        // changes are handled by the parent-side timeframeChanged /
        // chartDataLoaded listeners (see effects above) which also
        // reach the host. Without this gate, a host change would be
        // double-fanned (once via the parent listener, once via this
        // path after the host's own bridge echoed chart-state back).
        const mgr = managerRef.current;
        if (!mgr || typeof mgr.sendCommand !== "function") return;
        const sourceChart = mgr.charts && mgr.charts.get(id);
        if (!sourceChart || sourceChart.host) return; // skip host echoes

        const sync = layoutSyncRef.current || {};
        const hostCh = window.chart;
        const hostFid = hostCh && hostCh.currentFileId != null && String(hostCh.currentFileId).trim() !== ""
            ? String(hostCh.currentFileId)
            : "";
        // When Symbol sync is on, pull a lagging iframe back to the host file.
        // Skip pull-back while userPairLoadGuard is active — that tile is
        // mid user-initiated load and should fan out (below), not revert.
        if (sync.symbol && hostFid && state && state.fileId != null
            && String(state.fileId) !== hostFid) {
            const guardUntil = userPairLoadGuardRef.current[id];
            const userInitiated = !!(guardUntil && performance.now() < guardUntil);
            if (!userInitiated) {
                try { mgr.sendCommand(id, "loadFile", { fileId: hostFid }); } catch (_) {}
                lastBroadcastFileRef.current[id] = hostFid;
                return;
            }
        }

        if (state && state.timeframe && sync.interval) {
            const tf = String(state.timeframe);
            if (lastBroadcastTfRef.current[id] !== tf) {
                lastBroadcastTfRef.current[id] = tf;
                // 1) push to the host (in-process call) — host doesn't
                // run panel-cmd-bridge, so we hit window.chart directly.
                try {
                    if (window.chart && typeof window.chart.setTimeframe === "function"
                        && window.chart.currentTimeframe !== tf) {
                        window.chart.setTimeframe(tf);
                        lastBroadcastTfRef.current[HOST_PANEL_ID] = tf;
                    }
                } catch (_) {}
                // 2) push to every other iframe panel
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || c.id === id) continue;
                    try { mgr.sendCommand(c.id, "setTimeframe", { tf }); } catch (_) {}
                }
            }
        }
        if (state && state.fileId && sync.symbol) {
            const fid = String(state.fileId);
            if (lastBroadcastFileRef.current[id] !== fid) {
                lastBroadcastFileRef.current[id] = fid;
                try {
                    if (window.chart && String(window.chart.currentFileId || "") !== fid) {
                        const ch = window.chart;
                        const useMc = !!(ch.isBacktestMode || ch.backtestingSession)
                            && typeof ch.loadMultichartPanelFile === "function";
                        if (useMc) ch.loadMultichartPanelFile(fid, { force: true });
                        else if (typeof ch.loadFileData === "function") ch.loadFileData(fid);
                        lastBroadcastFileRef.current[HOST_PANEL_ID] = fid;
                    }
                } catch (_) {}
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || c.id === id) continue;
                    try { mgr.sendCommand(c.id, "loadFile", { fileId: fid }); } catch (_) {}
                }
            }
        }

    };

    // ─── Phase 7.2.4: expose the per-panel command bus to the parent ────
    //
    // The topbar's existing timeframe buttons and file picker call
    // `window.__multichartGrid.runCommand(cmd, args)` when this grid is
    // mounted. The bus routes by `focusedPanelId`:
    //   • A (host)        → direct call to window.chart (in-process; no
    //                       postMessage round-trip, no panel-cmd-bridge)
    //   • B / C / D (iframe) → manager.sendCommand → panel-cmd-bridge in
    //                          that iframe applies it to its own
    //                          window.chart
    //
    // Returns true if the command was dispatched (caller should NOT also
    // hit the global window.chart fallback). Returns false if the command
    // can't be dispatched (no manager, unknown cmd, etc.) so the caller
    // can fall back to legacy behavior.
    //
    // The `focusedPanelId` is captured via `focusedPanelIdRef` (declared
    // near the top of the component) so the bus always reads the LATEST
    // value without re-installing on every focus change.
    useEffect(() => {
        const isMounted = true;

        // applyHostCommand always RETURNS A PROMISE so callers (and the
        // iframe path via manager.sendCommand) share a single interface:
        //   runCommand(cmd, args) → Promise<data|null>
        // Resolved value mirrors the iframe's cmd-result.data shape so
        // callers can `await runCommand("addIndicator", …)` and read
        // .chartId regardless of whether the focused panel is the host
        // or an iframe.
        function applyHostCommand(cmd, args) {
            const ch = window.chart;
            if (!ch) return Promise.reject(new Error("host chart not ready"));
            args = args || {};
            try {
                switch (cmd) {
                    case "setTimeframe": {
                        if (typeof ch.setTimeframe !== "function") {
                            return Promise.reject(new Error("chart.setTimeframe is not a function"));
                        }
                        if (!args.tf) return Promise.reject(new Error("setTimeframe: missing tf"));
                        if (ch.currentTimeframe !== args.tf) ch.setTimeframe(args.tf);
                        return Promise.resolve(null);
                    }
                    case "loadFile": {
                        if (typeof ch.loadFileData !== "function"
                            && typeof ch.loadMultichartPanelFromHost !== "function"
                            && typeof ch.loadMultichartPanelFile !== "function") {
                            return Promise.reject(new Error("chart.loadFileData is not a function"));
                        }
                        if (args.fileId === undefined || args.fileId === null || args.fileId === "") {
                            return Promise.reject(new Error("loadFile: missing fileId"));
                        }
                        const fid = String(args.fileId);
                        const useMc = !!(ch.isBacktestMode || ch.backtestingSession)
                            && typeof ch.loadMultichartPanelFile === "function";
                        const loadFn = useMc
                            ? () => ch.loadMultichartPanelFile(fid, { force: !!args.force })
                            : (typeof ch.loadMultichartPanelFromHost === "function"
                                && (ch.isBacktestMode || ch.backtestingSession))
                                ? () => ch.loadMultichartPanelFromHost({
                                    fileId: fid,
                                    force: !!args.force,
                                    replayTimestamp: typeof ch._resolveMultichartReplayPlayheadMs === "function"
                                        ? ch._resolveMultichartReplayPlayheadMs()
                                        : undefined,
                                })
                                : () => ch.loadFileData(fid);
                        const r = loadFn();
                        if (r && typeof r.then === "function") return r.then(() => null);
                        return Promise.resolve(null);
                    }
                    case "setActiveDrawingTool": {
                        const dm = ch.drawingManager;
                        if (!dm) return Promise.reject(new Error("drawingManager not available"));
                        const tool = args.tool ? String(args.tool) : null;
                        if (!tool) {
                            if (typeof dm.clearTool === "function") dm.clearTool();
                            else dm.currentTool = null;
                            return Promise.resolve(null);
                        }
                        if (typeof dm.setTool !== "function") {
                            return Promise.reject(new Error("drawingManager.setTool is not a function"));
                        }
                        if (dm.currentTool !== tool) dm.setTool(tool);
                        return Promise.resolve(null);
                    }
                    case "clearActiveDrawingTool": {
                        const dmc = ch.drawingManager;
                        if (!dmc) return Promise.resolve(null);
                        dismissActiveDrawingTool(dmc, !!(args && args.mirrored), args);
                        return Promise.resolve(null);
                    }
                    case "addIndicator": {
                        const type = String(args.type || "").trim();
                        if (!type) return Promise.reject(new Error("addIndicator: missing type"));
                        if (typeof ch.addIndicator !== "function") {
                            return Promise.reject(new Error("chart.addIndicator is not a function"));
                        }
                        if (!ch.data || ch.data.length === 0) {
                            return Promise.reject(new Error("chart data not loaded yet"));
                        }
                        if (ch._timeframeSwitching || ch._pairSwitchLoading) {
                            return Promise.reject(new Error("chart timeframe switch in progress"));
                        }
                        const wantType = type.toLowerCase();
                        const existing = (ch.indicators && Array.isArray(ch.indicators.active))
                            ? ch.indicators.active.find((i) => i && String(i.type || "").toLowerCase() === wantType)
                            : null;
                        if (existing && existing.id) {
                            return Promise.resolve({ chartId: existing.id, type, deduped: true });
                        }
                        const ind = ch.addIndicator(type);
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        try { if (typeof ch.recalculateIndicators === "function") ch.recalculateIndicators(); } catch (_) {}
                        try { if (typeof ch.updateOHLCIndicators === "function") ch.updateOHLCIndicators(); } catch (_) {}
                        return Promise.resolve({
                            chartId: (ind && ind.id) ? ind.id : null,
                            type:    type,
                        });
                    }
                    case "removeIndicator": {
                        const indId = args.chartId;
                        if (indId === undefined || indId === null || indId === "") {
                            return Promise.reject(new Error("removeIndicator: missing chartId"));
                        }
                        if (typeof ch.removeIndicator !== "function") {
                            return Promise.reject(new Error("chart.removeIndicator is not a function"));
                        }
                        ch.removeIndicator(indId);
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        try { if (typeof ch.updateOHLCIndicators === "function") ch.updateOHLCIndicators(); } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "getIndicators": {
                        const list = (ch.indicators && Array.isArray(ch.indicators.active))
                            ? ch.indicators.active : [];
                        return Promise.resolve({
                            indicators: list.map((i) => ({ id: i.id, type: i.type || i.name || null })),
                        });
                    }
                    case "setVisibilityMenuState": {
                        const visState = (args && args.state) || {};
                        const visSilent = !!(args && args.silent);
                        if (typeof ch.applyVisibilityMenuState === "function") {
                            ch.applyVisibilityMenuState(visState, { silent: visSilent });
                        }
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "clearOnlyDrawings": {
                        if (typeof ch.clearOnlyDrawings === "function") {
                            ch.clearOnlyDrawings({ confirmPrompt: false, skipBroadcast: true });
                        } else if (ch.drawingManager && typeof ch.drawingManager.clearDrawings === "function") {
                            ch.drawingManager.clearDrawings({ confirmPrompt: false, skipBroadcast: true });
                        }
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "clearOnlyIndicators": {
                        if (typeof ch.clearOnlyIndicators === "function") {
                            ch.clearOnlyIndicators({ confirmPrompt: false });
                        }
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "closeDrawingSettings": {
                        const dmSet = ch.drawingManager;
                        let hadModal = false;
                        try { hadModal = !!document.querySelector(".tv-settings-modal"); } catch (_) {}
                        if (dmSet) {
                            if (hadModal && dmSet.settingsPanel && typeof dmSet.settingsPanel.hide === "function") {
                                dmSet.settingsPanel.hide();
                            }
                            if (dmSet.contextMenu && typeof dmSet.contextMenu.hide === "function") {
                                dmSet.contextMenu.hide();
                            }
                        }
                        if (hadModal) {
                            try {
                                document.querySelectorAll(".tv-settings-modal").forEach((el) => {
                                    try {
                                        if (el.externalDropdowns) {
                                            el.externalDropdowns.forEach((d) => { try { d.remove(); } catch (_) {} });
                                        }
                                        el.remove();
                                    } catch (_) {}
                                });
                            } catch (_) {}
                        }
                        return Promise.resolve(null);
                    }
                    case "deselectDrawings": {
                        const dmDes = ch.drawingManager;
                        if (!dmDes) return Promise.resolve(null);
                        if (typeof dmDes.deselectAll === "function") {
                            dmDes.deselectAll({ forSelectionChange: true });
                        } else {
                            dmDes.selectedDrawing = null;
                            if (Array.isArray(dmDes.selectedDrawings)) dmDes.selectedDrawings = [];
                            if (dmDes.toolbar && typeof dmDes.toolbar.hide === "function") {
                                dmDes.toolbar.hide();
                            }
                            if (dmDes.settingsPanel && typeof dmDes.settingsPanel.hide === "function") {
                                dmDes.settingsPanel.hide();
                            }
                        }
                        try {
                            if (typeof ch._syncMultichartViewportFromHost === 'function') {
                                ch._syncMultichartViewportFromHost();
                            } else {
                                if (typeof ch._realignMultichartViewportAfterResize === 'function') {
                                    ch._realignMultichartViewportAfterResize(ch.w, ch.h);
                                }
                                if (typeof ch.render === "function") ch.render();
                            }
                        } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "clearDrawingsAndIndicators": {
                        if (typeof ch.clearDrawingsAndIndicators === "function") {
                            ch.clearDrawingsAndIndicators({ confirmPrompt: false, skipBroadcast: true });
                        } else {
                            if (typeof ch.clearOnlyDrawings === "function") {
                                ch.clearOnlyDrawings({ confirmPrompt: false, skipBroadcast: true });
                            } else if (ch.drawingManager && typeof ch.drawingManager.clearDrawings === "function") {
                                ch.drawingManager.clearDrawings({ confirmPrompt: false, skipBroadcast: true });
                            }
                            if (typeof ch.clearOnlyIndicators === "function") {
                                ch.clearOnlyIndicators({ confirmPrompt: false });
                            }
                        }
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        return Promise.resolve(null);
                    }
                    case "getOrderPanelPriceSnapshot": {
                        const omSnap = ch.orderManager;
                        if (!omSnap || typeof omSnap.getCurrentCandle !== "function") {
                            return Promise.reject(new Error("orderManager.getCurrentCandle is not a function"));
                        }
                        const cnd = omSnap.getCurrentCandle();
                        if (!cnd) return Promise.resolve({ close: null, formatted: null });
                        const closePx = Number.parseFloat(cnd.c != null ? cnd.c : cnd.close);
                        if (!Number.isFinite(closePx)) {
                            return Promise.resolve({ close: null, formatted: null });
                        }
                        const fmt = typeof omSnap.formatPrice === "function"
                            ? omSnap.formatPrice(closePx)
                            : String(closePx);
                        return Promise.resolve({ close: closePx, formatted: fmt });
                    }
                    case "removeMirroredOrder": {
                        const omRm = ch.orderManager;
                        if (!omRm || typeof omRm.multichartRemoveMirroredOrderClone !== "function") {
                            return Promise.reject(new Error(
                                "orderManager.multichartRemoveMirroredOrderClone is not a function"));
                        }
                        if (args.orderId == null) {
                            return Promise.reject(new Error("removeMirroredOrder: missing orderId"));
                        }
                        try {
                            omRm.multichartRemoveMirroredOrderClone(args.orderId);
                        } catch (e) {
                            return Promise.reject(e);
                        }
                        return Promise.resolve({ ok: true });
                    }
                    case "clearDraftPreview": {
                        const omPv = ch.orderManager;
                        if (!omPv || typeof omPv.removePreviewLines !== "function") {
                            return Promise.reject(new Error("orderManager.removePreviewLines is not a function"));
                        }
                        try {
                            omPv.removePreviewLines({ multichartSkipBroadcast: true });
                            try { window.__talariaMultichartDraftActive = false; } catch (_) {}
                        } catch (e) {
                            return Promise.reject(e);
                        }
                        return Promise.resolve({ ok: true });
                    }
                    // Symmetric host-side counterpart of panel-cmd-bridge `setDraftPreview`.
                    // Called when the focused panel IS the host (panel A); writes form
                    // values into parent #orderPanel and asks the host orderManager to
                    // redraw its draft preview. The V9 React rail already keeps the
                    // host's #orderPanel in sync, but routing through this case lets
                    // TalariaV8bLive use one uniform `runCommand("setDraftPreview", …)`
                    // call regardless of which panel has focus.
                    case "setDraftPreview": {
                        const omSet = ch.orderManager;
                        if (!omSet || typeof omSet.updatePreviewLines !== "function") {
                            return Promise.reject(new Error("orderManager.updatePreviewLines is not a function"));
                        }
                        const setVal = (id, v) => {
                            const el = document.getElementById(id);
                            if (!el) return;
                            const nv = (v == null) ? "" : String(v);
                            if (el.value !== nv) el.value = nv;
                            try { el.dispatchEvent(new Event("input",  { bubbles: true })); } catch (_) {}
                            try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
                        };
                        const setChk = (id, v) => {
                            const el = document.getElementById(id);
                            if (!el) return;
                            if (el.checked !== !!v) {
                                el.checked = !!v;
                                try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
                            }
                        };
                        const sideSet = (args.side === "SELL") ? "SELL" : "BUY";
                        omSet.orderSide = sideSet;
                        const bt = document.getElementById("buyTab");
                        const st = document.getElementById("sellTab");
                        if (bt) bt.classList.toggle("active", sideSet === "BUY");
                        if (st) st.classList.toggle("active", sideSet === "SELL");
                        const otSet = (args.type === "limit" || args.type === "stop") ? args.type : "market";
                        omSet.orderType = otSet;
                        document.querySelectorAll("#orderPanel .order-type-btn").forEach((b) => {
                            b.classList.toggle("active", b.getAttribute("data-type") === otSet);
                        });
                        if (args.entryPrice != null) setVal("orderEntryPrice", args.entryPrice);
                        setChk("enableSL", !!args.slEnabled);
                        if (args.slPrice != null)   setVal("slPrice", args.slPrice);
                        setChk("enableTP", !!args.tpEnabled);
                        if (args.tpPrice != null)   setVal("tpPrice", args.tpPrice);
                        try {
                            omSet.updatePreviewLines();
                        } catch (e) {
                            return Promise.reject(e);
                        }
                        return Promise.resolve({ ok: true });
                    }

                    // ─── orders (host-side) ─────────────────────────
                    //
                    // The host already owns the parent's #orderPanel
                    // DOM and the React rail keeps its inputs in sync,
                    // so placeOrder on the host is just "click the
                    // existing button" — no argument shimming needed.
                    // We mark the click as multichart-internal so the
                    // capture-phase interceptor (installed below)
                    // doesn't re-route it back into runCommand and
                    // recursively re-fire forever.
                    case "placeOrder": {
                        const om = ch.orderManager;
                        if (!om || typeof om.placeAdvancedOrder !== "function") {
                            return Promise.reject(new Error("orderManager.placeAdvancedOrder is not a function"));
                        }
                        if (!ch.replaySystem || !ch.replaySystem.isActive) {
                            return Promise.reject(new Error("host replay not active — cannot place order"));
                        }
                        try {
                            om.placeAdvancedOrder({ keepPanelOpen: true });
                            const arr = (om.orders && om.orders.length) ? om.orders : [];
                            const newest = arr.length ? arr[arr.length - 1] : null;
                            return Promise.resolve({ orderId: newest ? newest.id : null });
                        } catch (e) {
                            return Promise.reject(e);
                        }
                    }
                    case "addOrder": {
                        const om = ch.orderManager;
                        const svc = om && om.orderService;
                        if (!svc) return Promise.reject(new Error("orderService not available"));
                        const order = args && args.order;
                        if (!order) return Promise.reject(new Error("addOrder: missing args.order"));
                        const kind = (args.kind === "pending") ? "pending" : "opened";
                        const existing = (om.orders || []).some((o) => o && o.id != null && o.id === order.id);
                        if (existing) return Promise.resolve({ skipped: true, reason: "duplicate" });
                        // Loop guard — same trick as iframe side; the
                        // host's eventBus listener (installed below)
                        // will skip emitting THIS id.
                        hostOrderStateRef.current.suppressEmitId = order.id;
                        try {
                            if (kind === "pending" && typeof svc.registerPendingOrder === "function") {
                                svc.registerPendingOrder(order);
                            } else if (typeof svc.registerOpenOrder === "function") {
                                svc.registerOpenOrder(order);
                            }
                        } finally {
                            setTimeout(() => {
                                if (hostOrderStateRef.current.suppressEmitId === order.id) {
                                    hostOrderStateRef.current.suppressEmitId = null;
                                }
                            }, 0);
                        }
                        if (kind === "pending" && typeof om.scheduleRefreshPendingOrderGraphicsForChart === "function") {
                            om.scheduleRefreshPendingOrderGraphicsForChart(order, ch);
                        } else if (kind === "pending" && typeof om.refreshPendingOrderGraphicsForChart === "function") {
                            om.refreshPendingOrderGraphicsForChart(order, ch);
                        } else {
                            try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                            try { if (om.updateOrderLines) om.updateOrderLines(ch); } catch (_) {}
                        }
                        return Promise.resolve({ ok: true });
                    }
                    case "syncPendingOrder": {
                        const snap = args && args.order;
                        if (!snap || snap.id == null) {
                            return Promise.reject(new Error("syncPendingOrder: missing args.order"));
                        }
                        if (!applyMirroredPendingOrderSnapshot(ch, snap)) {
                            return Promise.resolve({ skipped: true, reason: "no_local_pending" });
                        }
                        const omSync = ch.orderManager;
                        let po = null;
                        if (omSync && omSync.pendingOrders) {
                            po = omSync.pendingOrders.find((o) => o && o.id === snap.id);
                        }
                        if (!po && omSync && omSync.orderService && omSync.orderService.pendingOrders) {
                            po = omSync.orderService.pendingOrders.find((o) => o && o.id === snap.id);
                        }
                        if (po && typeof omSync.scheduleRefreshPendingOrderGraphicsForChart === "function") {
                            omSync.scheduleRefreshPendingOrderGraphicsForChart(po, ch);
                        } else if (po && typeof omSync.refreshPendingOrderGraphicsForChart === "function") {
                            omSync.refreshPendingOrderGraphicsForChart(po, ch);
                        } else {
                            try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                            try {
                                if (omSync && typeof omSync.updateOrderLines === "function") {
                                    omSync.updateOrderLines(ch);
                                }
                            } catch (_) {}
                        }
                        return Promise.resolve({ ok: true });
                    }
                    case "closeOrder": {
                        const om = ch.orderManager;
                        if (!om || typeof om.closePosition !== "function") {
                            return Promise.reject(new Error("orderManager.closePosition is not a function"));
                        }
                        if (args.orderId == null) return Promise.reject(new Error("closeOrder: missing orderId"));
                        hostOrderStateRef.current.suppressEmitId = args.orderId;
                        try { om.closePosition(args.orderId); }
                        catch (e) { return Promise.reject(e); }
                        finally {
                            setTimeout(() => {
                                if (hostOrderStateRef.current.suppressEmitId === args.orderId) {
                                    hostOrderStateRef.current.suppressEmitId = null;
                                }
                            }, 0);
                        }
                        return Promise.resolve({ ok: true });
                    }
                    case "cancelOrder": {
                        const om = ch.orderManager;
                        if (!om || typeof om.cancelPendingOrder !== "function") {
                            return Promise.reject(new Error("orderManager.cancelPendingOrder is not a function"));
                        }
                        if (args.orderId == null) return Promise.reject(new Error("cancelOrder: missing orderId"));
                        hostOrderStateRef.current.suppressEmitId = args.orderId;
                        try { om.cancelPendingOrder(args.orderId, { silent: true }); }
                        catch (e) { return Promise.reject(e); }
                        finally {
                            setTimeout(() => {
                                if (hostOrderStateRef.current.suppressEmitId === args.orderId) {
                                    hostOrderStateRef.current.suppressEmitId = null;
                                }
                            }, 0);
                        }
                        return Promise.resolve({ ok: true });
                    }

                    default:
                        return Promise.reject(new Error("unknown host cmd: " + cmd));
                }
            } catch (e) {
                return Promise.reject(e);
            }
        }

        // runCommand routes to either the host (in-process) or one of
        // the iframes via manager.sendCommand. Always returns a Promise
        // resolving with the cmd-result.data payload (may be null) or
        // rejecting with the underlying error message.
        //
        // Optional opts.panelId pins the command to a specific panel
        // (used by per-panel persistence flows). Without opts.panelId
        // the bus targets the currently focused panel.
        function mirrorHostSessionOntoChart(ch) {
            if (!ch) return;
            const host = window.chart;
            if (!host) return;
            try {
                if (host.backtestingSession) ch.backtestingSession = host.backtestingSession;
                if (host.activeTradingSessionId && !ch.activeTradingSessionId) {
                    ch.activeTradingSessionId = host.activeTradingSessionId;
                }
                if (typeof host.isBacktestMode === "boolean") ch.isBacktestMode = host.isBacktestMode;
                if (typeof host.isPropFirmMode === "boolean") ch.isPropFirmMode = host.isPropFirmMode;
            } catch (_) {}
        }

        function resolveHostReplayPlayheadMs() {
            const host = window.chart;
            const rs = host && host.replaySystem;
            if (!rs || !rs.isActive) return null;
            const ts = Number(rs.replayTimestamp);
            return Number.isFinite(ts) ? ts : null;
        }

        function markUserPairLoadGuard(panelId) {
            if (!panelId || panelId === HOST_PANEL_ID) return;
            userPairLoadGuardRef.current[panelId] = performance.now() + 4000;
        }

        /** One-shot: align panel-cmd replay state (pendingPlayDesired) with host A. */
        function syncIframeReplayPlaybackOnce(panelId) {
            const mgr = managerRef.current;
            if (!mgr || !panelId || panelId === HOST_PANEL_ID) return;
            const host = window.chart;
            const hostRs = host && host.replaySystem;
            if (!hostRs || !hostRs.isActive) return;
            const ts = Number(hostRs.replayTimestamp);
            if (!Number.isFinite(ts)) return;
            const speed = Number(hostRs.speed) || 1;
            const mode = (typeof hostRs.getPlaybackMode === "function")
                ? hostRs.getPlaybackMode()
                : (hostRs.playbackMode || "tick");
            try {
                if (typeof mgr.sendCommandNoReply === "function") {
                    mgr.sendCommandNoReply(panelId, "replayEnter", { timestamp: ts });
                } else {
                    mgr.sendCommand(panelId, "replayEnter", { timestamp: ts });
                }
            } catch (_) {}
            if (hostRs.isPlaying) {
                try {
                    if (typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(panelId, "replayPlay", { speed, mode });
                    } else {
                        mgr.sendCommand(panelId, "replayPlay", { speed, mode });
                    }
                } catch (_) {}
            }
        }

        /**
         * Load a session file on one tile — same in-process path as panel A.
         * Iframe B/C/D: call contentWindow.chart.loadMultichartPanelFile directly
         * (panel-cmd postMessage was unreliable for pair switches).
         */
        function loadFileOnPanel(panelId, fileId, opts) {
            const o = opts && typeof opts === "object" ? opts : {};
            const fid = fileId != null ? String(fileId).trim() : "";
            if (!fid) return Promise.reject(new Error("loadFile: missing fileId"));
            let pid = panelId || focusedPanelIdRef.current || HOST_PANEL_ID;
            // Symbol sync ON: tile A is the canonical data source — load there
            // once; chartDataLoaded fans loadFile to every iframe (B/C/D).
            // Without this, picking a symbol while focused on B/C/D only
            // updated that tile and onState pull-back blocked fan-out.
            const symSyncOn = !!(layoutSyncRef.current && layoutSyncRef.current.symbol);
            if (symSyncOn && pid !== HOST_PANEL_ID) {
                pid = HOST_PANEL_ID;
            } else if (pid !== HOST_PANEL_ID) {
                markUserPairLoadGuard(pid);
            }

            if (pid === HOST_PANEL_ID) {
                return applyHostCommand("loadFile", { fileId: fid, force: !!o.force }).then((data) => {
                    if (typeof window.chart?._finalizeMultichartPanelAfterPairLoad === "function") {
                        try { window.chart._finalizeMultichartPanelAfterPairLoad(); } catch (_) {}
                    }
                    return data;
                });
            }

            const ch = getChartForPanelId(pid);
            if (!ch) {
                const mgr = managerRef.current;
                if (!mgr || typeof mgr.sendCommand !== "function") {
                    return Promise.reject(new Error("panel chart not ready"));
                }
                return mgr.sendCommand(pid, "loadFile", { fileId: fid, force: true }).then((data) => {
                    const ch2 = getChartForPanelId(pid);
                    if (ch2 && typeof ch2._finalizeMultichartPanelAfterPairLoad === "function") {
                        try { ch2._finalizeMultichartPanelAfterPairLoad(); } catch (_) {}
                    }
                    return data;
                });
            }

            mirrorHostSessionOntoChart(ch);
            const replayTs = resolveHostReplayPlayheadMs();
            const tf = ch.currentTimeframe || window.chart?.currentTimeframe || "5m";
            const useMc = !!(ch.isBacktestMode || ch.backtestingSession)
                && typeof ch.loadMultichartPanelFile === "function";

            let loadPromise;
            if (useMc) {
                loadPromise = ch.loadMultichartPanelFile(fid, {
                    force: true,
                    replayTimestamp: replayTs,
                    timeframe: tf,
                });
            } else if (typeof ch.loadMultichartPanelFromHost === "function"
                && (ch.isBacktestMode || ch.backtestingSession)) {
                loadPromise = ch.loadMultichartPanelFromHost({
                    fileId: fid,
                    force: true,
                    replayTimestamp: replayTs,
                    timeframe: tf,
                });
            } else if (typeof ch.loadFileData === "function") {
                loadPromise = ch.loadFileData(fid);
            } else {
                return Promise.reject(new Error("loadFile not available on panel " + pid));
            }

            const finish = () => {
                try {
                    if (typeof ch._finalizeMultichartPanelAfterPairLoad === "function") {
                        ch._finalizeMultichartPanelAfterPairLoad();
                    }
                } catch (_) {}
                // Let pair-load seek + fitToView paint the full prefix before 60x catch-up.
                setTimeout(() => {
                    try { syncIframeReplayPlaybackOnce(pid); } catch (_) {}
                }, 500);
                if (focusedPanelIdRef.current === pid) {
                    dispatchFocusChanged(pid);
                }
            };

            if (loadPromise && typeof loadPromise.then === "function") {
                return loadPromise.then(finish).then(() => null);
            }
            finish();
            return Promise.resolve(null);
        }

        function runCommand(cmd, args, opts) {
            const target = (opts && opts.panelId)
                ? opts.panelId
                : (focusedPanelIdRef.current || HOST_PANEL_ID);
            if (cmd === "loadFile" && args && args.fileId != null && args.fileId !== "") {
                return loadFileOnPanel(target, args.fileId, { force: !!args.force });
            }
            if (target === HOST_PANEL_ID) {
                return applyHostCommand(cmd, args);
            }
            const mgr = managerRef.current;
            if (!mgr || typeof mgr.sendCommand !== "function") {
                return Promise.reject(new Error("manager not ready"));
            }
            return mgr.sendCommand(target, cmd, args);
        }

        // Helper: query indicators on the focused (or specified) panel.
        // Returns Promise<Array<{id, type}>>. Used by TalariaV8bLive on
        // focus change to mirror the toolbar chips to the focused panel.
        function getPanelIndicators(panelId) {
            const target = panelId || focusedPanelIdRef.current || HOST_PANEL_ID;
            return runCommand("getIndicators", null, { panelId: target })
                .then((d) => (d && Array.isArray(d.indicators)) ? d.indicators : []);
        }

        // runCommandIframes — still used for rare broadcast-style ops; the
        // drawing-tool path moved to syncDrawingToolAcrossPanels so we do
        // NOT keep every iframe armed at once (that made clicks on any
        // panel start a stroke even after "switching" focus).
        function runCommandIframes(cmd, args) {
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts || typeof mgr.charts.values !== "function") {
                return Promise.resolve();
            }
            const proms = [];
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue; // skip host on purpose
                proms.push(
                    mgr.sendCommand(c.id, cmd, args).catch((e) => {
                        console.warn("[MultichartGrid] runCommandIframes", c.id, cmd, "failed:", e && e.message || e);
                    })
                );
            }
            return Promise.all(proms).then(() => undefined);
        }

        /** Fire-and-forget panel-cmd to every iframe (host excluded). */
        function broadcastToIframesNoReply(cmd, args) {
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts || typeof mgr.charts.values !== "function") return;
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue;
                try {
                    if (typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(c.id, cmd, args);
                    }
                } catch (e) {
                    console.warn("[MultichartGrid] broadcastToIframesNoReply", c.id, cmd, e && e.message || e);
                }
            }
        }

        function forEachIframePanelExcept(sourceId, fn) {
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts || typeof mgr.charts.values !== "function") return;
            for (const c of mgr.charts.values()) {
                if (!c || c.host || c.id === sourceId) continue;
                fn(c.id, c);
            }
        }

        /**
         * Close legacy settings modals on EVERY tile (host + all iframes).
         * Only one global shape settings dialog may exist at a time.
         */
        function closeDrawingSettingsOnAllPanels() {
            closeGlobalLegacyDrawingSettings();
            const mgr = managerRef.current;
            const proms = [
                applyHostCommand("closeDrawingSettings", null).catch((e) => {
                    console.warn("[MultichartGrid] closeDrawingSettings host failed", e && e.message || e);
                }),
            ];
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    if (typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(c.id, "closeDrawingSettings", null);
                    } else {
                        proms.push(
                            mgr.sendCommand(c.id, "closeDrawingSettings", null).catch((e) => {
                                console.warn("[MultichartGrid] closeDrawingSettings", c.id, "failed", e && e.message || e);
                            })
                        );
                    }
                }
            }
            return Promise.all(proms);
        }

        /**
         * @deprecated use closeDrawingSettingsOnAllPanels — kept for callers that
         * previously closed "other" panels only; settings are now globally exclusive.
         */
        function closeDrawingSettingsOnOtherPanels(sourceId) {
            void sourceId;
            return closeDrawingSettingsOnAllPanels();
        }

        /**
         * Deselect shapes + hide floating toolbars on every tile EXCEPT the
         * focused one. TradingView-style: clicking another panel clears the
         * previous panel's selection chrome.
         */
        function deselectDrawingsOnNonFocusedPanels(focusedId) {
            const focus = focusedId || focusedPanelIdRef.current || HOST_PANEL_ID;
            const mgr = managerRef.current;
            const proms = [];
            if (focus !== HOST_PANEL_ID) {
                proms.push(
                    applyHostCommand("deselectDrawings", null).catch((e) => {
                        console.warn("[MultichartGrid] deselect host failed", e && e.message || e);
                    })
                );
            }
            forEachIframePanelExcept(focus, (id) => {
                if (mgr && typeof mgr.sendCommandNoReply === "function") {
                    mgr.sendCommandNoReply(id, "deselectDrawings", null);
                } else if (mgr) {
                    proms.push(
                        mgr.sendCommand(id, "deselectDrawings", null).catch((e) => {
                            console.warn("[MultichartGrid] deselect", id, "failed", e && e.message || e);
                        })
                    );
                }
            });
            return Promise.all(proms);
        }

        /**
         * TradingView-style exclusive drawing UI: deselect shapes, hide floating
         * toolbars, and close settings/context menus on every tile except `sourceId`.
         */
        function clearDrawingUiOnOtherPanels(sourceId, opts) {
            const source = sourceId || focusedPanelIdRef.current || HOST_PANEL_ID;
            const skipDismiss = !!(opts && opts.skipV9Dismiss);
            if (!skipDismiss) {
                closeGlobalLegacyDrawingSettings();
                try {
                    // Do not dispatch talaria:v9-cleared-selection here — that hides the
                    // parent V9 quick bar even on the source tile that just selected/drew.
                    window.dispatchEvent(new CustomEvent("multichart-dismiss-drawing-settings"));
                } catch (_) {}
            }
            return Promise.all([
                deselectDrawingsOnNonFocusedPanels(source),
                closeDrawingSettingsOnAllPanels(),
            ]);
        }

        /**
         * Open shape settings globally on the parent shell (V9 panel or legacy modal
         * on the host document) for one tile. Iframe tiles postMessage here.
         */
        function openDrawingSettingsForPanel(sourceId, drawingOrId, x, y) {
            let source = sourceId || focusedPanelIdRef.current || HOST_PANEL_ID;
            let drawing = null;
            if (drawingOrId && typeof drawingOrId === "object" && drawingOrId.type) {
                drawing = drawingOrId;
            }

            let ch = getChartForPanelId(source);
            let dm = ch && ch.drawingManager;

            if (!drawing) {
                const drawId = drawingOrId;
                if (dm && Array.isArray(dm.drawings) && drawId != null) {
                    const want = String(drawId);
                    drawing = dm.drawings.find((d) => d && d.id != null && String(d.id) === want) || null;
                }
                if (!drawing && dm && dm.selectedDrawing) {
                    drawing = dm.selectedDrawing;
                }
            }

            const wantId = drawing && drawing.id != null
                ? String(drawing.id)
                : (drawingOrId != null && typeof drawingOrId !== "object" ? String(drawingOrId) : null);

            // Resolve chart/dm from iframe tiles when panel lookup failed or drawing came from an iframe.
            if (!drawing || !dm || (wantId && drawing && !dm.drawings?.some((d) => d && String(d.id) === wantId))) {
                const mgr = managerRef.current;
                if (mgr && mgr.charts && typeof mgr.charts.entries === "function") {
                    for (const [pid, entry] of mgr.charts.entries()) {
                        if (!entry || entry.host || !entry.frame) continue;
                        try {
                            const cw = entry.frame.contentWindow;
                            const ch2 = cw && cw.chart;
                            const dm2 = ch2 && ch2.drawingManager;
                            if (!dm2 || !Array.isArray(dm2.drawings)) continue;
                            let found = null;
                            if (wantId) {
                                found = dm2.drawings.find(
                                    (d) => d && d.id != null && String(d.id) === wantId
                                ) || null;
                            }
                            if (!found && drawing && drawing.type) {
                                found = dm2.drawings.find((d) => d === drawing) || null;
                            }
                            if (!found && dm2.selectedDrawing) {
                                found = dm2.selectedDrawing;
                            }
                            if (found) {
                                source = pid;
                                ch = ch2;
                                dm = dm2;
                                drawing = found;
                                break;
                            }
                        } catch (_) {}
                    }
                }
            }

            if (!drawing || !dm) return Promise.resolve(false);

            ensureMultichartGlobalSettingsRoot();

            // Close stale legacy modals only — do NOT fire multichart-dismiss here;
            // that event closes the parent V9 panel synchronously and races with open.
            closeGlobalLegacyDrawingSettings();

            if (dm.toolbar && typeof dm.toolbar.hide === "function") {
                dm.toolbar.hide();
            }

            // One global dialog centered on the parent viewport (all multichart tiles).
            let px = Math.max(10, (window.innerWidth - 440) / 2);
            let py = Math.max(
                60,
                Math.min((window.innerHeight - 500) / 2, window.innerHeight - 500 - 50)
            );

            try {
                window.__v9MultichartSettingsPanelId = source;
            } catch (_) {}
            const v9Open = typeof window.__v9OpenDrawingSettings === "function"
                ? window.__v9OpenDrawingSettings
                : null;
            if (v9Open) {
                try {
                    if (v9Open(drawing, px, py)) {
                        try { delete window.__v9MultichartSettingsPanelId; } catch (_) {
                            window.__v9MultichartSettingsPanelId = null;
                        }
                        closeDrawingSettingsOnAllPanels().catch(() => {});
                        return Promise.resolve(true);
                    }
                } catch (e) {
                    console.warn("[MultichartGrid] openDrawingSettingsForPanel V9 failed", e && e.message || e);
                }
            }
            try {
                delete window.__v9MultichartSettingsPanelId;
            } catch (_) {
                window.__v9MultichartSettingsPanelId = null;
            }

            const hostDm = window.chart && window.chart.drawingManager;
            if (!hostDm || !hostDm.settingsPanel || typeof hostDm.settingsPanel.show !== "function") {
                console.warn("[MultichartGrid] openDrawingSettingsForPanel: legacy settingsPanel unavailable");
                return Promise.resolve(false);
            }

            hostDm.settingsPanel.show(
                drawing,
                px,
                py,
                (updatedDrawing) => {
                    if (typeof dm.renderDrawing === "function") dm.renderDrawing(updatedDrawing);
                    if (typeof dm.persistPositionToolDefaults === "function") {
                        dm.persistPositionToolDefaults(updatedDrawing);
                    }
                    if (typeof dm.saveDrawings === "function") dm.saveDrawings();
                },
                (drawingToDelete) => {
                    if (typeof dm.deleteDrawing === "function") dm.deleteDrawing(drawingToDelete);
                }
            );
            closeDrawingSettingsOnAllPanels().catch(() => {});
            return Promise.resolve(true);
        }

        /**
         * Run a panel-cmd on host tile A AND every iframe peer. Used for
         * toolbar "Delete drawings / indicators / all objects" so the action
         * applies to the whole multichart layout, not only the focused panel.
         */
        function runCommandOnAllPanels(cmd, args) {
            args = args || {};
            const mgr = managerRef.current;
            const proms = [
                applyHostCommand(cmd, args).catch((e) => {
                    console.warn("[MultichartGrid] runCommandOnAllPanels host", cmd, e && e.message || e);
                }),
            ];
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    proms.push(
                        mgr.sendCommand(c.id, cmd, args).catch((e) => {
                            console.warn("[MultichartGrid] runCommandOnAllPanels", c.id, cmd, e && e.message || e);
                        })
                    );
                }
            }
            return Promise.all(proms).then(() => undefined);
        }

        /** chart.js legacy ids for continuous freehand (see drawing-tools-manager). */
        function isPersistentFreehandLegacyTool(lt) {
            const x = String(lt || "").toLowerCase();
            return x === "brush" || x === "highlighter";
        }

        /**
         * Multichart drawing-tool routing (called from TalariaV8bLive on rail
         * changes and on multichartFocusChanged):
         *
         *   • brush / highlighter — arm EVERY chart (host + all iframes) so the
         *     tool stays active when switching tiles (TradingView-style: one
         *     stroke can mirror via drawing sync; right-click clears per chart.js).
         *   • any other tool — arm the FOCUSED panel only and clear all others
         *     so switching tiles does not leave stale drawing mode elsewhere.
         */
        function syncDrawingToolAcrossPanels(legacyTool) {
            const mgr = managerRef.current;
            const focus = focusedPanelIdRef.current || HOST_PANEL_ID;
            const ids = [];
            if (mgr && mgr.charts && typeof mgr.charts.keys === "function") {
                for (const id of mgr.charts.keys()) ids.push(id);
            } else {
                ids.push(HOST_PANEL_ID);
            }
            const lt = legacyTool == null ? "" : String(legacyTool);
            const clearFocused = !lt
                || lt.toLowerCase() === "crosshair"
                || lt.toLowerCase() === "cursor";

            function runClear(panelId) {
                const clearArgs = { keepSelection: true };
                if (panelId === HOST_PANEL_ID) {
                    return applyHostCommand("clearActiveDrawingTool", clearArgs).catch(() => {});
                }
                if (!mgr) return Promise.resolve();
                if (typeof mgr.sendCommandNoReply === "function") {
                    mgr.sendCommandNoReply(panelId, "clearActiveDrawingTool", clearArgs);
                    return Promise.resolve();
                }
                return mgr.sendCommand(panelId, "clearActiveDrawingTool", clearArgs).catch(() => {});
            }

            function runSet(panelId) {
                if (panelId === HOST_PANEL_ID) {
                    return applyHostCommand("setActiveDrawingTool", { tool: lt }).catch(() => {});
                }
                if (!mgr) return Promise.resolve();
                return mgr.sendCommand(panelId, "setActiveDrawingTool", { tool: lt }).catch(() => {});
            }

            if (!clearFocused && isPersistentFreehandLegacyTool(lt)) {
                return Promise.all(ids.map(runSet));
            }

            const clears = ids.filter((id) => id !== focus).map(runClear);
            return Promise.all(clears).then(() => {
                if (clearFocused) return runClear(focus);
                if (focus === HOST_PANEL_ID) {
                    return applyHostCommand("setActiveDrawingTool", { tool: lt }).catch(() => {});
                }
                if (!mgr) return Promise.resolve();
                return mgr.sendCommand(focus, "setActiveDrawingTool", { tool: lt }).catch(() => {});
            });
        }

        function getChartForPanelId(panelId) {
            const pid = panelId || focusedPanelIdRef.current || HOST_PANEL_ID;
            if (pid === HOST_PANEL_ID) {
                return (typeof window !== "undefined" && window.chart) || null;
            }
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return null;
            const entry = mgr.charts.get(pid);
            if (!entry || entry.host || !entry.frame) return null;
            try {
                const cw = entry.frame.contentWindow;
                return (cw && cw.chart) || null;
            } catch (_) {
                return null;
            }
        }

        function getActiveChartForMultichart() {
            return getChartForPanelId(focusedPanelIdRef.current || HOST_PANEL_ID);
        }

        function enumerateMultichartDrawingManagers() {
            const out = [];
            const seen = new Set();
            const addChart = (ch) => {
                const dm = ch && ch.drawingManager;
                if (!dm || seen.has(dm)) return;
                seen.add(dm);
                out.push(dm);
            };
            addChart(window.chart);
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    try {
                        const cw = c.frame && c.frame.contentWindow;
                        addChart(cw && cw.chart);
                    } catch (_) {}
                }
            }
            return out;
        }

        function enumerateMultichartCharts() {
            const out = [];
            const seen = new Set();
            const addChart = (ch) => {
                if (!ch || seen.has(ch)) return;
                seen.add(ch);
                out.push(ch);
            };
            addChart(window.chart);
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    try {
                        const cw = c.frame && c.frame.contentWindow;
                        addChart(cw && cw.chart);
                    } catch (_) {}
                }
            }
            return out;
        }

        /** Hit-test which chart tile contains a viewport click (rollback cut, etc.). */
        function resolveChartAtClientPoint(clientX, clientY) {
            if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
            const charts = enumerateMultichartCharts();
            let best = null;
            let bestArea = Infinity;
            for (const chart of charts) {
                if (!chart) continue;
                let containerNode = null;
                try {
                    if (chart.container && typeof chart.container.node === "function") {
                        containerNode = chart.container.node();
                    } else if (chart.canvas && chart.canvas.parentElement) {
                        containerNode = chart.canvas.parentElement;
                    }
                } catch (_) { /* cross-origin */ }
                if (!containerNode) continue;
                let rect;
                try { rect = containerNode.getBoundingClientRect(); } catch (_) { continue; }
                if (clientX < rect.left || clientX >= rect.right) continue;
                if (clientY < rect.top || clientY >= rect.bottom) continue;
                const area = rect.width * rect.height;
                if (area >= bestArea) continue;
                const x = clientX - rect.left;
                const ml = chart.margin?.l || 0;
                let effectiveW = Number(chart.w) || 0;
                if (effectiveW < 80) effectiveW = rect.width;
                const mr = chart.margin?.r || 0;
                if (x < ml || x > effectiveW - mr) continue;
                best = { chart, x };
                bestArea = area;
            }
            return best;
        }

        function applyHostReplayCutFromPanel(ts, sourceChart, candleIndex) {
            const rs = window.chart && window.chart.replaySystem;
            if (!rs || typeof rs.applyReplayCutToWallClock !== "function") return false;
            try {
                return rs.applyReplayCutToWallClock(ts, { sourceChart, candleIndex });
            } catch (_) {
                return false;
            }
        }

        const onIframeRollbackCut = (e) => {
            const d = e && e.data;
            if (!d || d.type !== "v9-replay-rollback-cut") return;
            const ts = Number(d.timestamp);
            if (!Number.isFinite(ts)) return;
            const chart = getChartForPanelId(d.source);
            if (applyHostReplayCutFromPanel(ts, chart || undefined, d.candleIndex)) {
                try {
                    window.dispatchEvent(new CustomEvent("talariaReplayRollbackDone"));
                } catch (_) {}
            }
        };
        window.addEventListener("message", onIframeRollbackCut);

        const onReplayRollbackMode = (ev) => {
            const active = !!(ev && ev.detail && ev.detail.active);
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return;
            const cmd = active ? "rollbackPickStart" : "rollbackPickStop";
            for (const c of mgr.charts.values()) {
                if (!c || c.host || !c.ready) continue;
                try { mgr.sendCommand(c.id, cmd, {}); } catch (_) {}
            }
        };
        window.addEventListener("talariaReplayRollbackMode", onReplayRollbackMode);

        /** Iframe tile toolbar.show(x,y) is in iframe viewport — map to parent for V9 tlBar. */
        function findPanelFrameForDrawingManager(dm) {
            if (!dm) return null;
            const hostDm = window.chart && window.chart.drawingManager;
            if (dm === hostDm) return null;
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return null;
            for (const entry of mgr.charts.values()) {
                if (!entry || entry.host) continue;
                try {
                    const cw = entry.frame && entry.frame.contentWindow;
                    const ch = cw && cw.chart;
                    if (ch && ch.drawingManager === dm) return entry.frame || null;
                } catch (_) {}
            }
            return null;
        }

        function mapToolbarClientToParent(dm, x, y) {
            if (typeof x !== "number" || typeof y !== "number" || Number.isNaN(x) || Number.isNaN(y)) {
                return { x, y };
            }
            const frame = findPanelFrameForDrawingManager(dm);
            if (!frame) return { x, y };
            try {
                const r = frame.getBoundingClientRect();
                return { x: r.left + x, y: r.top + y };
            } catch (_) {
                return { x, y };
            }
        }

        /** Plot bounds in parent viewport coords for V9 quick-bar clamp (excludes price/time axes). */
        function getPanelPlotBoundsForDrawingManager(dm, zz, barW, barH) {
            const Z = zz || 1;
            const pad = 8;
            const bw = barW || 0;
            const bh = barH || 0;
            let marginR = 60;
            let marginB = 30;
            try {
                const ch = dm && dm.chart;
                if (ch && ch.margin) {
                    if (typeof ch.margin.r === "number" && ch.margin.r > 0) marginR = ch.margin.r;
                    if (typeof ch.margin.b === "number" && ch.margin.b > 0) marginB = ch.margin.b;
                }
            } catch (_) {}
            let r = null;
            const frame = findPanelFrameForDrawingManager(dm);
            if (frame) {
                try { r = frame.getBoundingClientRect(); } catch (_) {}
            } else {
                try {
                    const ch = dm && dm.chart;
                    const wrap = ch && ch.canvas && ch.canvas.parentElement;
                    const el = wrap || document.getElementById("chartWrapper") || document.getElementById("chart-container");
                    if (el) r = el.getBoundingClientRect();
                } catch (_) {}
            }
            if (!r) return null;
            return {
                minX: r.left / Z + pad,
                minY: r.top / Z + pad,
                maxX: (r.right - marginR) / Z - bw - pad,
                maxY: (r.bottom - marginB) / Z - bh - pad,
            };
        }

        /** Union of every multichart tile plot — quick bar can be dragged across all panels. */
        function getMultichartGridPlotBounds(zz, barW, barH, rightPanelW = 0) {
            const Z = zz || 1;
            const pad = 8;
            const bw = barW || 0;
            const bh = barH || 0;
            let union = null;
            const addPlot = (rect, marginR, marginB) => {
                if (!rect) return;
                const minX = rect.left / Z + pad;
                const minY = rect.top / Z + pad;
                const maxX = (rect.right - (marginR || 60)) / Z - bw - pad;
                const maxY = (rect.bottom - (marginB || 30)) / Z - bh - pad;
                if (!union) {
                    union = { minX, minY, maxX, maxY };
                    return;
                }
                union.minX = Math.min(union.minX, minX);
                union.minY = Math.min(union.minY, minY);
                union.maxX = Math.max(union.maxX, maxX);
                union.maxY = Math.max(union.maxY, maxY);
            };
            try {
                const hostWrap = document.getElementById(HOST_WRAPPER_ID);
                const hostCh = window.chart;
                const hostMr = hostCh && hostCh.margin && hostCh.margin.r > 0 ? hostCh.margin.r : 60;
                const hostMb = hostCh && hostCh.margin && hostCh.margin.b > 0 ? hostCh.margin.b : 30;
                if (hostWrap) addPlot(hostWrap.getBoundingClientRect(), hostMr, hostMb);
            } catch (_) {}
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const entry of mgr.charts.values()) {
                    if (!entry || entry.host || !entry.frame) continue;
                    try {
                        const cw = entry.frame.contentWindow;
                        const ch = cw && cw.chart;
                        const mr = ch && ch.margin && ch.margin.r > 0 ? ch.margin.r : 60;
                        const mb = ch && ch.margin && ch.margin.b > 0 ? ch.margin.b : 30;
                        addPlot(entry.frame.getBoundingClientRect(), mr, mb);
                    } catch (_) {}
                }
            }
            if (!union) return null;
            if (rightPanelW > 0) {
                try {
                    union.maxX = Math.min(union.maxX, window.innerWidth / Z - bw - rightPanelW - pad);
                } catch (_) {}
            }
            return union;
        }

        function getPanelIdForDrawingManager(dm) {
            if (!dm) return null;
            try {
                const hostDm = window.chart && window.chart.drawingManager;
                if (dm === hostDm) return HOST_PANEL_ID;
            } catch (_) {}
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const entry of mgr.charts.values()) {
                    if (!entry || entry.host) continue;
                    try {
                        const cw = entry.frame && entry.frame.contentWindow;
                        const ch = cw && cw.chart;
                        if (ch && ch.drawingManager === dm) return entry.id || null;
                    } catch (_) {}
                }
            }
            return null;
        }

        const prevGetActiveChart = typeof window.getActiveChart === "function"
            ? window.getActiveChart
            : null;
        window.getActiveChart = function multichartGetActiveChart() {
            const ch = getActiveChartForMultichart();
            if (ch) return ch;
            if (prevGetActiveChart) {
                try { return prevGetActiveChart(); } catch (_) {}
            }
            return window.chart || null;
        };

        window.__multichartGrid = {
            isMounted,
            runCommand,
            runCommandOnAllPanels,
            deselectDrawingsOnNonFocusedPanels,
            closeDrawingSettingsOnOtherPanels,
            closeDrawingSettingsOnAllPanels,
            closeGlobalLegacyDrawingSettings,
            clearDrawingUiOnOtherPanels,
            openDrawingSettingsForPanel,
            runCommandIframes,
            broadcastToIframesNoReply,
            syncDrawingToolAcrossPanels,
            isPersistentFreehandLegacyTool,
            getPanelIndicators,
            getFocusedPanelId: () => focusedPanelIdRef.current,
            getPanelIds: () => {
                const ids = [HOST_PANEL_ID];
                const mgr = managerRef.current;
                if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                    for (const c of mgr.charts.values()) {
                        if (!c || c.host || !c.id) continue;
                        if (!ids.includes(c.id)) ids.push(c.id);
                    }
                }
                return ids;
            },
            getChartForPanel: getChartForPanelId,
            resolveChartAtClientPoint,
            loadFileOnPanel,
            getActiveChart: getActiveChartForMultichart,
            enumerateCharts: enumerateMultichartCharts,
            mapToolbarClientToParent,
            getPanelPlotBoundsForDrawingManager,
            getMultichartGridPlotBounds,
            getPanelIdForDrawingManager,
            focusPanelById,
            enumerateDrawingManagers: enumerateMultichartDrawingManagers,
            hostPanelId: HOST_PANEL_ID,
            broadcastClearDraftPreview,
        };
        window.__multichartOpenShapeSettings = function multichartOpenShapeSettings(sourceId, drawingOrId, x, y) {
            return openDrawingSettingsForPanel(sourceId, drawingOrId, x, y);
        };
        ensureMultichartGlobalSettingsRoot();

        // Escape on the parent shell: keyboard focus often stays here even after
        // clicking an iframe tile, so route dismiss to the focused panel.
        function onParentDismissDrawingKey(e) {
            if (!e || e.key !== "Escape") return;
            const t = e.target;
            if (t && t.tagName) {
                const tag = String(t.tagName).toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select") return;
                if (t.isContentEditable) return;
            }
            const focused = focusedPanelIdRef.current || HOST_PANEL_ID;
            const ch = getChartForPanelId(focused);
            const dm = ch && ch.drawingManager;
            if (!isDrawingToolDismissKeyTarget(dm)) return;
            e.preventDefault();
            e.stopPropagation();
            void runCommand("clearActiveDrawingTool", null, { panelId: focused })
                .then(() => {
                    try {
                        window.dispatchEvent(new CustomEvent("v9DrawingToolCleared", {
                            detail: { panelId: focused },
                        }));
                    } catch (_) {}
                })
                .catch(() => {});
        }
        document.addEventListener("keydown", onParentDismissDrawingKey, true);

        return () => {
            document.removeEventListener("keydown", onParentDismissDrawingKey, true);
            try {
                if (window.__multichartOpenShapeSettings === multichartOpenShapeSettings) {
                    delete window.__multichartOpenShapeSettings;
                }
            } catch (_) {
                window.__multichartOpenShapeSettings = null;
            }
            clearMultichartGlobalSettingsRoot();
            if (prevGetActiveChart) window.getActiveChart = prevGetActiveChart;
            else {
                try { delete window.getActiveChart; } catch (_) {
                    window.getActiveChart = function () { return window.chart || null; };
                }
            }
            if (window.__multichartGrid && window.__multichartGrid.runCommand === runCommand) {
                delete window.__multichartGrid;
            }
            window.removeEventListener("message", onIframeRollbackCut);
            window.removeEventListener("talariaReplayRollbackMode", onReplayRollbackMode);
        };
        // Mount-once. The ref captures the latest focusedPanelId without
        // re-subscribing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Phase 7.2.4-orders: per-panel order placement + cross-panel mirror ─
    //
    // THREE responsibilities live in this effect, all scoped to the
    // grid's lifetime so they self-clean when the user switches back to
    // a single chart:
    //
    //   1. INTERCEPT the parent's #placeOrderButton click. When the
    //      focused panel is an iframe, collect the form values from
    //      the parent's hidden #orderPanel DOM and route a `placeOrder`
    //      command to that iframe instead of letting the host's
    //      orderManager.placeAdvancedOrder fire on the parent's
    //      window.chart. When the focused panel is the host, do
    //      NOTHING — let the original onclick run through unchanged
    //      (zero regression for single-panel-style use).
    //
    //   2. SUBSCRIBE to the host's orderService eventBus so any order
    //      that's `:opened` or `:pending` on the host gets fanned out
    //      to peer iframes. Matching rules:
    //        • Default: same normalized ticker OR same sourceFileId as
    //          the peer's chart-state (handles placeholder "—" symbol).
    //        • When every ready iframe already shows the host's currentFileId
    //          (or blank), fan to EVERY tile so orders appear on all charts
    //          at once. Otherwise match on ticker / sourceFileId per tile.
    //        • Host orders missing sourceFileId get currentFileId filled
    //          in for matching / payload mirroring.
    //      `order:pending-updated` (entry / SL / TP drag) is merged on
    //      every peer in lockstep via `syncPendingOrder`.
    //
    //   3. LISTEN for `iframe-order` postMessage envelopes (sent by
    //      panel-cmd-bridge.installOrderForwarders inside each iframe)
    //      and fan them out the same way: to the host (if symbol
    //      matches) and to every other iframe (if symbol matches),
    //      excluding the source — including `pending-updated` from
    //      iframe drag mirrors.
    //
    // Symbol matching uses normalizeOrderTickerForMirror (slashes, dashes,
    // spaces, dots stripped — same idea as multichart-manager). We also
    // match on sourceFileId/fileId when the manager's iframe state.symbol
    // is still the placeholder "—" (chart-state can lag behind visible data).
    useEffect(() => {

        // Read order spec from parent's hidden #orderPanel DOM.
        // React (TalariaV8bLive) keeps these inputs in sync with its
        // own form state via the useEffect at ~line 6008 — so by the
        // time the user clicks the rail's Execute button, this DOM
        // reflects exactly what the user typed.
        function collectOrderArgs() {
            const doc = document;
            const buyTab = doc.getElementById("buyTab");
            const side = (buyTab && buyTab.classList.contains("active"))
                ? "BUY"
                : "SELL";
            const activeTypeBtn = doc.querySelector("#orderPanel .order-type-btn.active");
            const type = activeTypeBtn
                ? (activeTypeBtn.getAttribute("data-type") || "market")
                : "market";
            const num = (id) => {
                const el = doc.getElementById(id);
                if (!el) return null;
                const n = parseFloat(el.value);
                return Number.isFinite(n) ? n : null;
            };
            const chk = (id) => {
                const el = doc.getElementById(id);
                return !!(el && el.checked);
            };
            return {
                side,
                type,
                quantity:    num("orderQuantity"),
                entryPrice:  num("orderEntryPrice"),
                slEnabled:   chk("enableSL"),
                slPrice:     num("slPrice"),
                tpEnabled:   chk("enableTP"),
                tpPrice:     num("tpPrice"),
            };
        }

        // Find every ready multichart tile except `excludeId` — used when
        // all panels are guaranteed the same dataset (backtest lock or
        // identical fileId) so orders/drags appear on every chart at once.
        function findAllSameDatasetMirrorPeers(excludeId) {
            const out = [];
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return out;
            if (excludeId !== HOST_PANEL_ID) {
                out.push({ id: HOST_PANEL_ID, isHost: true });
            }
            for (const c of mgr.charts.values()) {
                if (!c || c.host || !c.ready) continue;
                if (c.id === excludeId) continue;
                out.push({ id: c.id, isHost: false });
            }
            return out;
        }

        // Find all panels (host + iframes) that should receive a mirrored
        // order: same normalized ticker OR same dataset (fileId) when the
        // peer's cached symbol is still a placeholder or unknown.
        function findPanelsForSymbol(symNorm, excludeId, order) {
            const out = [];
            const orderFid = order && order.sourceFileId != null && String(order.sourceFileId) !== ""
                ? String(order.sourceFileId) : "";
            // Host
            if (excludeId !== HOST_PANEL_ID) {
                const ch = window.chart;
                if (ch) {
                    const hostSym = normalizeOrderTickerForMirror(ch.currentSymbol || "");
                    const hostFid = ch.currentFileId != null && String(ch.currentFileId) !== ""
                        ? String(ch.currentFileId) : "";
                    const symMatch = !!(symNorm && hostSym && hostSym === symNorm);
                    const fileMatch = !!(orderFid && hostFid && hostFid === orderFid);
                    if (symMatch || fileMatch) {
                        out.push({ id: HOST_PANEL_ID, isHost: true });
                    }
                }
            }
            // Iframes
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    if (c.id === excludeId) continue;
                    const rawSym = c.state && c.state.symbol;
                    const panelNorm = !isPlaceholderMultichartSymbol(rawSym)
                        ? normalizeOrderTickerForMirror(rawSym) : "";
                    const panelFid = c.state && c.state.fileId != null && String(c.state.fileId) !== ""
                        ? String(c.state.fileId) : "";
                    const symMatch = !!(symNorm && panelNorm && panelNorm === symNorm);
                    const fileMatch = !!(orderFid && panelFid === orderFid
                        && (!symNorm || !panelNorm || panelNorm === symNorm
                            || isPlaceholderMultichartSymbol(rawSym)));
                    if (symMatch || fileMatch) {
                        out.push({ id: c.id, isHost: false });
                    }
                }
            }
            return out;
        }

        /** Merge multichart `pending-updated` snapshot into local pending/open lists by order id. */
        function applyMirroredPendingOrderSnapshot(chart, snap) {
            const om = chart && chart.orderManager;
            if (!om || !snap || snap.id == null) return false;
            const id = snap.id;
            let hit = false;
            function mergeInto(list) {
                if (!Array.isArray(list)) return;
                list.forEach((o) => {
                    if (!o || o.id !== id) return;
                    Object.keys(snap).forEach((k) => {
                        if (k === "id") return;
                        try {
                            o[k] = snap[k];
                        } catch (_) { /* ignore */ }
                    });
                    hit = true;
                });
            }
            mergeInto(om.pendingOrders);
            mergeInto(om.orders);
            const svc = om.orderService;
            if (svc) {
                mergeInto(svc.pendingOrders);
                mergeInto(svc.orders);
            }
            return hit;
        }

        // Send addOrder to the given panel (host or iframe) using the
        // existing runCommand bus. Wrapped in try/catch so a single
        // bad panel can't break the others.
        function mirrorTo(panelId, isHost, kind, order) {
            const grid = window.__multichartGrid;
            if (!grid || typeof grid.runCommand !== "function") return;
            try {
                grid.runCommand("addOrder", { order, kind }, { panelId })
                    .catch((e) => {
                        console.warn("[MultichartGrid] addOrder",
                            panelId, "failed:", e && e.message || e);
                    });
            } catch (e) {
                console.warn("[MultichartGrid] addOrder", panelId, "threw:", e);
            }
        }

        function mirrorRemoveTo(panelId, orderId) {
            const grid = window.__multichartGrid;
            if (!grid || typeof grid.runCommand !== "function") return;
            try {
                grid.runCommand("removeMirroredOrder", { orderId }, { panelId })
                    .catch((e) => {
                        console.warn("[MultichartGrid] removeMirroredOrder",
                            panelId, "failed:", e && e.message || e);
                    });
            } catch (e) {
                console.warn("[MultichartGrid] removeMirroredOrder", panelId, "threw:", e);
            }
        }

        /** Fan-out draft preview clear to every other multichart tile (host + iframes). */
        _broadcastClearDraftPreviewImpl = function mcBroadcastClearDraftPreview(sourceId) {
            const sid = sourceId != null ? String(sourceId) : "";
            if (!sid) return;
            const mgr = managerRef.current;
            const targets = [];
            if (HOST_PANEL_ID !== sid) targets.push(HOST_PANEL_ID);
            if (mgr && mgr.charts) {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.id) continue;
                    if (c.id === sid) continue;
                    targets.push(c.id);
                }
            }
            for (const tid of targets) {
                try {
                    if (tid === HOST_PANEL_ID) {
                        applyHostCommand("clearDraftPreview", null).catch(() => {});
                    } else if (mgr && typeof mgr.sendCommandNoReply === "function") {
                        mgr.sendCommandNoReply(tid, "clearDraftPreview", {});
                    }
                } catch (_) { /* ignore */ }
            }
        }

        /**
         * Host chart keeps the canonical multichart session order list (open + pending).
         * Iframe-originated events must still touch the host even when the host tile was on
         * another pair — otherwise switching the host to that instrument later has nothing
         * for syncOrderVisualsToActiveChart (chart.js loadFileData) to draw.
         */
        function ensureHostInMirrorPeers(sourceId, peers) {
            const list = (peers && peers.slice()) || [];
            if (sourceId === HOST_PANEL_ID) return list;
            if (!list.some((p) => p && p.id === HOST_PANEL_ID)) {
                list.push({ id: HOST_PANEL_ID, isHost: true });
            }
            return list;
        }

        /** Fan-out order line / pending removal to every peer that mirrors this instrument (not the source). */
        function broadcastOrderRemoval(sourceId, kind, order) {
            if (!order || order.id == null) return;
            const oid = order.id;
            const mgr = managerRef.current;
            const symNorm = normalizeOrderTickerForMirror(
                order.symbol || order.ticker || order.pair || order.instrument || ""
            );
            let orderFid = order.sourceFileId != null && String(order.sourceFileId) !== ""
                ? String(order.sourceFileId) : "";
            if (!orderFid && sourceId === HOST_PANEL_ID) {
                const ch = window.chart;
                if (ch && ch.currentFileId != null && String(ch.currentFileId) !== "") {
                    orderFid = String(ch.currentFileId);
                }
            }
            const orderAug = orderFid && (order.sourceFileId == null || String(order.sourceFileId) === "")
                ? Object.assign({}, order, { sourceFileId: orderFid })
                : order;

            let peers;
            if (allReadyIframesShareHostFileForMirror(mgr && mgr.charts, window.chart)) {
                peers = findAllSameDatasetMirrorPeers(sourceId);
            } else {
                if (!symNorm && !orderFid) return;
                peers = findPanelsForSymbol(symNorm, sourceId, orderAug);
                if (sourceId === HOST_PANEL_ID && orderFid && mgr && mgr.charts) {
                    const hCh = window.chart;
                    if (hCh && String(hCh.currentFileId || "") === orderFid) {
                        const seen = new Set(peers.map((p) => p.id));
                        for (const c of mgr.charts.values()) {
                            if (!c || c.host || !c.ready) continue;
                            if (seen.has(c.id)) continue;
                            const pf = c.state && c.state.fileId != null ? String(c.state.fileId) : "";
                            if (!pf || pf === orderFid) {
                                peers.push({ id: c.id, isHost: false });
                                seen.add(c.id);
                            }
                        }
                    }
                }
            }
            peers = ensureHostInMirrorPeers(sourceId, peers);
            if (!peers || !peers.length) return;
            for (const p of peers) {
                mirrorRemoveTo(p.id, oid);
            }
        }

        function broadcastOrder(sourceId, kind, order) {
            if (!order || order.id == null) return;
            const mgr = managerRef.current;
            const symNorm = normalizeOrderTickerForMirror(
                order.symbol || order.ticker || order.pair || order.instrument || ""
            );
            let orderFid = order.sourceFileId != null && String(order.sourceFileId) !== ""
                ? String(order.sourceFileId) : "";
            if (!orderFid && sourceId === HOST_PANEL_ID) {
                const ch = window.chart;
                if (ch && ch.currentFileId != null && String(ch.currentFileId) !== "") {
                    orderFid = String(ch.currentFileId);
                }
            }
            const orderAug = orderFid && (order.sourceFileId == null || String(order.sourceFileId) === "")
                ? Object.assign({}, order, { sourceFileId: orderFid })
                : order;

            let peers;
            if (allReadyIframesShareHostFileForMirror(mgr && mgr.charts, window.chart)) {
                peers = findAllSameDatasetMirrorPeers(sourceId);
                if (!peers.length) return;
            } else {
                if (!symNorm && !orderFid) return;
                peers = findPanelsForSymbol(symNorm, sourceId, orderAug);
                // Host bus events: if the order is on the host's current file,
                // also push to any ready iframe whose chart-state fileId is
                // still blank (lag) or already matches — avoids empty peer list
                // when symbol/file matching misses.
                if (sourceId === HOST_PANEL_ID && orderFid && mgr && mgr.charts) {
                    const hCh = window.chart;
                    if (hCh && String(hCh.currentFileId || "") === orderFid) {
                        const seen = new Set(peers.map((p) => p.id));
                        for (const c of mgr.charts.values()) {
                            if (!c || c.host || !c.ready) continue;
                            if (seen.has(c.id)) continue;
                            const pf = c.state && c.state.fileId != null ? String(c.state.fileId) : "";
                            if (!pf || pf === orderFid) {
                                peers.push({ id: c.id, isHost: false });
                                seen.add(c.id);
                            }
                        }
                    }
                }
            }

            peers = ensureHostInMirrorPeers(sourceId, peers);

            const grid = window.__multichartGrid;
            if (kind === "pending-updated") {
                if (!grid || typeof grid.runCommand !== "function") return;
                for (const p of peers) {
                    try {
                        grid.runCommand("syncPendingOrder", { order: orderAug }, { panelId: p.id })
                            .catch((e) => {
                                console.warn("[MultichartGrid] syncPendingOrder",
                                    p.id, "failed:", e && e.message || e);
                            });
                    } catch (e) {
                        console.warn("[MultichartGrid] syncPendingOrder", p.id, "threw:", e);
                    }
                }
                return;
            }
            if (kind !== "opened" && kind !== "pending") return;
            for (const p of peers) {
                mirrorTo(p.id, p.isHost, kind, orderAug);
            }
        }

        // ─── 1. host eventBus subscription ─────────────────────────
        let hostOffOpened = null;
        let hostOffPending = null;
        let hostOffPendingUpdated = null;
        let hostOffClosed = null;
        let hostOffPendingRemoved = null;
        function tryInstallHostBus() {
            const ch = window.chart;
            const svc = ch && ch.orderManager && ch.orderManager.orderService;
            const bus = svc && svc.eventBus;
            if (!bus || typeof bus.on !== "function") return false;
            if (hostOrderStateRef.current.listenerInstalled) return true;
            hostOrderStateRef.current.listenerInstalled = true;
            hostOffOpened = bus.on("order:opened", (o) => {
                if (!o || o.id == null) return;
                if (hostOrderStateRef.current.suppressEmitId === o.id) return;
                broadcastOrder(HOST_PANEL_ID, "opened", o);
            });
            hostOffPending = bus.on("order:pending", (o) => {
                if (!o || o.id == null) return;
                if (hostOrderStateRef.current.suppressEmitId === o.id) return;
                broadcastOrder(HOST_PANEL_ID, "pending", o);
            });
            hostOffPendingUpdated = bus.on("order:pending-updated", (o) => {
                if (!o || o.id == null) return;
                if (hostOrderStateRef.current.suppressEmitId === o.id) return;
                broadcastOrder(HOST_PANEL_ID, "pending-updated", o);
            });
            hostOffClosed = bus.on("order:closed", (o) => {
                if (!o || o.id == null) return;
                if (hostOrderStateRef.current.suppressEmitId === o.id) return;
                broadcastOrderRemoval(HOST_PANEL_ID, "closed", o);
            });
            hostOffPendingRemoved = bus.on("order:pending-removed", (o) => {
                if (!o || o.id == null) return;
                if (hostOrderStateRef.current.suppressEmitId === o.id) return;
                broadcastOrderRemoval(HOST_PANEL_ID, "pending-removed", o);
            });
            return true;
        }
        if (!tryInstallHostBus()) {
            // chart.orderManager.orderService may not exist yet (chart
            // boots async). Poll for ~5s, then give up.
            let tries = 0;
            const id = setInterval(() => {
                tries += 1;
                if (tryInstallHostBus() || tries > 50) clearInterval(id);
            }, 100);
        }

        function onMultichartClearPreviewHost(ev) {
            const d = ev && ev.detail;
            if (!d || d.source == null) return;
            broadcastClearDraftPreview(String(d.source));
        }
        window.addEventListener("multichart-clear-preview", onMultichartClearPreviewHost);

        // ─── 2. iframe-order + clear-preview postMessage listener ──
        function onIframeOrder(ev) {
            const msg = ev && ev.data;
            if (!msg || typeof msg !== "object") return;
            if (msg.type === "multichart-clear-preview") {
                if (msg.source != null) broadcastClearDraftPreview(String(msg.source));
                return;
            }
            if (msg.type === "multichart-clear-drawing-tool") {
                const grid = window.__multichartGrid;
                if (grid && typeof grid.runCommandOnAllPanels === "function") {
                    grid.runCommandOnAllPanels("clearActiveDrawingTool", { mirrored: true })
                        .then(() => {
                            try {
                                window.dispatchEvent(new CustomEvent("multichartDrawingToolCleared"));
                            } catch (_) {}
                        })
                        .catch(() => {});
                }
                return;
            }
            if (msg.type === "multichart-close-drawing-settings") {
                const grid = window.__multichartGrid;
                const sourceId = msg.source != null ? String(msg.source) : null;
                if (grid && typeof grid.clearDrawingUiOnOtherPanels === "function") {
                    grid.clearDrawingUiOnOtherPanels(sourceId).catch(() => {});
                } else if (grid && typeof grid.closeDrawingSettingsOnOtherPanels === "function") {
                    grid.closeDrawingSettingsOnOtherPanels(sourceId).catch(() => {});
                }
                return;
            }
            if (msg.type === "multichart-clear-drawing-ui") {
                const grid = window.__multichartGrid;
                const sourceId = msg.source != null ? String(msg.source) : null;
                if (grid && typeof grid.clearDrawingUiOnOtherPanels === "function") {
                    grid.clearDrawingUiOnOtherPanels(sourceId).catch(() => {});
                }
                return;
            }
            if (msg.type === "multichart-drawing-deselected") {
                try {
                    window.dispatchEvent(new CustomEvent("talaria:v9-cleared-selection"));
                    window.dispatchEvent(new CustomEvent("multichart-dismiss-drawing-settings"));
                } catch (_) {}
                return;
            }
            if (msg.type === "multichart-drawing-selected") {
                try {
                    if (msg.drawingType) {
                        window.dispatchEvent(new CustomEvent("talaria:v9-selected-drawing", {
                            detail: {
                                drawingType: msg.drawingType,
                                drawingId: msg.drawingId != null ? msg.drawingId : null,
                                panelId: msg.source != null ? String(msg.source) : null,
                            },
                        }));
                    }
                } catch (_) {}
                return;
            }
            if (msg.type === "multichart-open-drawing-settings") {
                const grid = window.__multichartGrid;
                const sourceId = msg.source != null ? String(msg.source) : null;
                if (grid && typeof grid.openDrawingSettingsForPanel === "function") {
                    grid.openDrawingSettingsForPanel(
                        sourceId,
                        msg.drawingId != null ? msg.drawingId : null,
                        msg.x,
                        msg.y
                    ).catch(() => {});
                }
                return;
            }
            if (msg.type !== "iframe-order") return;
            const sourceId = msg.source;
            const kind     = msg.kind;
            const order    = msg.order;
            if (!order || order.id == null) return;
            if (kind !== "opened" && kind !== "pending" && kind !== "pending-updated"
                && kind !== "closed" && kind !== "pending-removed") return;
            if (kind === "closed" || kind === "pending-removed") {
                broadcastOrderRemoval(sourceId, kind, order);
                return;
            }
            broadcastOrder(sourceId, kind, order);
        }
        window.addEventListener("message", onIframeOrder);

        // ─── 3. #placeOrderButton click interceptor ────────────────
        //
        // We attach in CAPTURE phase on document so we run BEFORE the
        // element's onclick handler (set by order-manager). When the
        // focused panel is an iframe we stopImmediatePropagation +
        // preventDefault and route via runCommand. When focus is the
        // host (or no panel focused / no multichart active), we let
        // the click through unchanged.
        function onPlaceOrderClickCapture(ev) {
            const t = ev && ev.target;
            if (!t || t.id !== "placeOrderButton") return;
            const focused = focusedPanelIdRef.current;
            if (!focused || focused === HOST_PANEL_ID) return;
            // Iframe focused — route there.
            ev.stopImmediatePropagation();
            ev.preventDefault();
            const args = collectOrderArgs();
            const grid = window.__multichartGrid;
            if (!grid || typeof grid.runCommand !== "function") {
                console.warn("[MultichartGrid] placeOrder intercept: __multichartGrid not ready");
                return;
            }
            grid.runCommand("placeOrder", args, { panelId: focused })
                .then(() => {
                    // Drain "Execute" rail visual feedback by firing
                    // the same talaria event chart.orderManager would
                    // fire — keeps any badges / journal listeners in
                    // sync. order-manager's own emit handles this in
                    // single-chart mode; here we wait for the iframe-
                    // order broadcast to mirror the rest.
                })
                .catch((e) => {
                    console.warn("[MultichartGrid] iframe placeOrder failed:", e && e.message || e);
                });
        }
        document.addEventListener("click", onPlaceOrderClickCapture, true);

        return () => {
            _broadcastClearDraftPreviewImpl = null;
            document.removeEventListener("click", onPlaceOrderClickCapture, true);
            window.removeEventListener("multichart-clear-preview", onMultichartClearPreviewHost);
            window.removeEventListener("message", onIframeOrder);
            try { if (typeof hostOffOpened === "function") hostOffOpened(); } catch (_) {}
            try { if (typeof hostOffPending === "function") hostOffPending(); } catch (_) {}
            try { if (typeof hostOffPendingUpdated === "function") hostOffPendingUpdated(); } catch (_) {}
            try { if (typeof hostOffClosed === "function") hostOffClosed(); } catch (_) {}
            try { if (typeof hostOffPendingRemoved === "function") hostOffPendingRemoved(); } catch (_) {}
            hostOrderStateRef.current.listenerInstalled = false;
        };
        // Mount-once. Refs supply the latest focused panel + manager
        // so we never need to re-install on focus change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Find the tile descriptor for the focused panel so we can render
    // a sibling focus frame at the GRID level — sidesteps the iframe-
    // compositing bug where the iframe layer paints above any child
    // overlay regardless of z-index.
    const focusedTile = focusedPanelId
        ? layout.tiles.find((t) => t.id === focusedPanelId)
        : null;

    // ─── splitter drag handlers ────────────────────────────────────────
    //
    // High-perf design (matches TradingView / Phabricator / VS Code):
    //
    //   Per mousemove we DO NOT call setState. React re-render of the
    //   grid container on every event was the source of the jank —
    //   each render rebuilt all cell styles, fired the
    //   useEffect([colFractions, rowFractions]) → applyHostSlot →
    //   chart.resize() chain, and triggered ResizeObserver inside
    //   every iframe simultaneously. At 60Hz that pegs the main
    //   thread.
    //
    //   Instead we directly mutate `container.style.gridTemplateColumns`
    //   and call applyHostSlotPositionOnly(cellA) — both are cheap
    //   style writes. The grid reflows synchronously, the iframes'
    //   internal ResizeObservers fire (cheap), but the HOST's
    //   chart.resize() (expensive) is deferred until mouseup.
    //
    //   On mouseup we commit the final fractions to React state
    //   (single re-render) AND call applyHostSlot once for the
    //   final pixel-perfect host repaint.
    //
    // Pixel math:
    //   container width        = W
    //   N tracks with N-1 gaps = available = W - (N-1)*gap
    //   trackPx[i] = (frac[i] / sumFracs) * available
    //   delta_frac = (mouseDelta_px * sumFracs) / available
    //
    // Without the gap subtraction the splitter slides ~3-4px PAST
    // the actual divider on each move (visible drift the user sees
    // as "lag"), which is what made it feel "not smooth".
    function makeSplitterDown(axis /* 'col' | 'row' */, idx) {
        return function onDown(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            const captureEl = ev.currentTarget;
            if (captureEl && captureEl.setPointerCapture && ev.pointerId != null) {
                try { captureEl.setPointerCapture(ev.pointerId); } catch (_) {}
            }
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const startFracs = (axis === "col") ? [...colFractions] : [...rowFractions];
            const sumFracs   = startFracs.reduce((a, b) => a + b, 0) || 1;
            const N          = startFracs.length;
            const totalPx    = (axis === "col" ? rect.width : rect.height) || 1;
            const availPx    = Math.max(1, totalPx - (N - 1) * MULTICHART_GRID_GAP_PX);
            const startMouse = (axis === "col" ? ev.clientX : ev.clientY);
            const sumPair    = (startFracs[idx] || 0) + (startFracs[idx + 1] || 0);

            // Min track size in pixels — anything smaller and the chart
            // can't render its right axis without overflow.
            const MIN_PX = 80;
            const minFrac = Math.max(0.05, (MIN_PX / availPx) * sumFracs);

            // Mark drag active so the host-resize useEffect skips its
            // expensive chart.resize() chain until we release.
            isDraggingRef.current = true;

            const lockedSurfaces = freezePanelSurfaces(container);

            const styleProp = (axis === "col")
                ? "gridTemplateColumns"
                : "gridTemplateRows";
            function fracsToTemplate(fracs) {
                return fracs.map((f) => f.toFixed(4) + "fr").join(" ");
            }

            let raf = 0;
            let pendingDx = 0;
            let lastApplied = startFracs;
            function flush() {
                raf = 0;
                const dPx = pendingDx;
                const dFrac = (dPx * sumFracs) / availPx;
                let nextA = startFracs[idx]     + dFrac;
                let nextB = startFracs[idx + 1] - dFrac;
                if (nextA < minFrac) { nextB = sumPair - minFrac; nextA = minFrac; }
                if (nextB < minFrac) { nextA = sumPair - minFrac; nextB = minFrac; }
                if (nextA < minFrac) nextA = minFrac;
                // Renormalize so this pair's sum stays constant — keeps
                // every other track unaffected by this drag.
                const sNow = nextA + nextB;
                if (sumPair && Math.abs(sNow - sumPair) > 1e-6) {
                    const k = sumPair / sNow;
                    nextA *= k;
                    nextB *= k;
                }
                const updated = [...startFracs];
                updated[idx]     = nextA;
                updated[idx + 1] = nextB;
                lastApplied = updated;
                // FAST PATH: direct DOM mutation, ZERO React work.
                // setColFractions/setRowFractions during drag was the
                // root cause of the lag — each setState fires a full
                // MultichartGrid re-render (5–15ms) which blew the
                // 16ms frame budget at 60Hz, making the splitter
                // visibly chase the mouse. By writing the inline
                // style here AND stashing in liveDragRef (so the
                // useLayoutEffect re-applies if React renders for
                // unrelated reasons), the drag stays at 60fps even
                // on a busy main thread.
                container.style[styleProp] = fracsToTemplate(updated);
                liveDragRef.current = { axis, fracs: updated };
                const cellA = cellRefs.current[HOST_PANEL_ID];
                if (cellA) applyHostSlotPositionOnly(cellA);
                previewIframeChartsInContainer(container);
                if (focusedPanelId) {
                    updateFocusFrameDom(focusedPanelId, cellRefs.current);
                }
            }

            function onMove(e) {
                pendingDx = (axis === "col" ? e.clientX : e.clientY) - startMouse;
                if (raf) return;
                raf = requestAnimationFrame(flush);
            }
            function onPointerMove(e) { onMove(e); }
            function onUp(e) {
                if (captureEl && captureEl.releasePointerCapture && e && e.pointerId != null) {
                    try { captureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                }
                if (raf) {
                    cancelAnimationFrame(raf);
                    flush();
                }
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", onUp);
                document.removeEventListener("pointercancel", onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                isDraggingRef.current = false;
                liveDragRef.current = null;
                if (axis === "col") setColFractions(lastApplied);
                else setRowFractions(lastApplied);
                const cellA = cellRefs.current[HOST_PANEL_ID];
                requestAnimationFrame(() => {
                    thawPanelSurfaces(lockedSurfaces, cellA, container);
                    if (focusedPanelId && computeFocusedRectRef.current) {
                        computeFocusedRectRef.current();
                    }
                });
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onUp);
            document.addEventListener("pointercancel", onUp);
            // Keep the resize cursor while dragging even if the mouse
            // leaves the splitter strip.
            document.body.style.cursor = (axis === "col") ? "col-resize" : "row-resize";
            document.body.style.userSelect = "none";
        };
    }

    // ─── splitter positions ───────────────────────────────────────────
    //
    // Position each splitter at the EXACT center of the corresponding
    // grid gap, accounting for the gap's pixel width. Without the
    // gap-aware math the splitter drifts ~3-4px from the actual
    // divider per drag and the user has to chase it.
    //
    //   trackPx[i]   = (frac[i] / sumFracs) * (W - (N-1)*gap)
    //   trackEnd[i]  = sum(trackPx[0..i]) + i*gap
    //   gapCenterX[i] = trackEnd[i] + gap/2  (boundary between i and i+1)
    function gapCenterPx(fracs, totalPx, gap) {
        if (!fracs || fracs.length < 2) return [];
        const sumF = fracs.reduce((a, b) => a + b, 0) || 1;
        const N    = fracs.length;
        const avail = Math.max(0, totalPx - (N - 1) * gap);
        const out  = [];
        let acc = 0;
        for (let i = 0; i < N - 1; i++) {
            const tw = (fracs[i] / sumF) * avail;
            acc += tw;
            out.push(acc + i * gap + gap / 2);
            acc += 0; // gap added in next iter via i*gap
        }
        return out;
    }

    // ResizeObserver wiring for `containerSize` (the state itself is
    // declared near the top of the component so cross-cutting
    // effects can reference it without TDZ). Splitter pixel math
    // and the focus-frame rect both depend on it.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let raf = 0;
        let lastW = 0;
        let lastH = 0;
        const update = () => {
            const r = el.getBoundingClientRect();
            const w = Math.round(r.width);
            const h = Math.round(r.height);
            if (w === lastW && h === lastH) return;
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const r2 = el.getBoundingClientRect();
                lastW = Math.round(r2.width);
                lastH = Math.round(r2.height);
                setContainerSize({ w: lastW, h: lastH });
            });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const hasExplicitGridPlacement = useMemo(
        () => layout.tiles.some((t) => !!(t.gridColumn || t.gridRow)),
        [layout]
    );

    const columnSplittersToRender = useMemo(() => {
        const gap = MULTICHART_GRID_GAP_PX;
        const W = containerSize.w;
        const H = containerSize.h;
        if (colFractions.length < 2 || W <= 0) return [];
        const colCenter = gapCenterPx(colFractions, W, gap);
        if (!hasExplicitGridPlacement) {
            return colCenter.map((px, i) => ({
                key: `col-splitter-${i}`,
                gutterIndex: i,
                left: Math.round(px) - 5,
                top: 0,
                height: H,
            }));
        }
        const rowBands = trackBandsPx(rowFractions, H, gap);
        const segs = computeColumnSplitterSegments(
            layout.tiles,
            colFractions.length,
            rowFractions.length
        );
        return segs
            .map((s, idx) => {
                const top = rowBands[s.row0]?.start ?? 0;
                const bot = rowBands[s.row1]?.end ?? H;
                const px = colCenter[s.gutterIndex];
                if (!Number.isFinite(px)) return null;
                const height = Math.max(8, Math.round(bot - top));
                return {
                    key: `col-splitter-${s.gutterIndex}-r${s.row0}-${s.row1}-${idx}`,
                    gutterIndex: s.gutterIndex,
                    left: Math.round(px) - 5,
                    top: Math.round(top),
                    height,
                };
            })
            .filter(Boolean);
    }, [
        hasExplicitGridPlacement,
        layout.tiles,
        colFractions,
        rowFractions,
        containerSize.w,
        containerSize.h,
    ]);

    const rowSplittersToRender = useMemo(() => {
        const gap = MULTICHART_GRID_GAP_PX;
        const W = containerSize.w;
        const H = containerSize.h;
        if (rowFractions.length < 2 || H <= 0) return [];
        const rowCenter = gapCenterPx(rowFractions, H, gap);
        if (!hasExplicitGridPlacement) {
            return rowCenter.map((px, i) => ({
                key: `row-splitter-${i}`,
                gutterIndex: i,
                top: Math.round(px) - 5,
                left: 0,
                width: W,
            }));
        }
        const colBands = trackBandsPx(colFractions, W, gap);
        const segs = computeRowSplitterSegments(
            layout.tiles,
            colFractions.length,
            rowFractions.length
        );
        return segs
            .map((s, idx) => {
                const lef = colBands[s.col0]?.start ?? 0;
                const rig = colBands[s.col1]?.end ?? W;
                const px = rowCenter[s.gutterIndex];
                if (!Number.isFinite(px)) return null;
                const width = Math.max(8, Math.round(rig - lef));
                return {
                    key: `row-splitter-${s.gutterIndex}-c${s.col0}-${s.col1}-${idx}`,
                    gutterIndex: s.gutterIndex,
                    top: Math.round(px) - 5,
                    left: Math.round(lef),
                    width,
                };
            })
            .filter(Boolean);
    }, [
        hasExplicitGridPlacement,
        layout.tiles,
        colFractions,
        rowFractions,
        containerSize.w,
        containerSize.h,
    ]);

    return (
        <>
        <div
            ref={containerRef}
            data-multichart-grid="1"
            style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: colsTemplate,
                gridTemplateRows:    rowsTemplate,
                // Wider gap (was 1px, now 4px) so the divider line
                // between panels is unmistakable. Combined with the
                // lighter background color below the splitter reads
                // as a clean TradingView-style separator.
                gap: `${MULTICHART_GRID_GAP_PX}px`,
                background: "#2a2e3a",
                zIndex: 12,
            }}
        >
            {layout.tiles.map((tile) => {
                const isHost    = tile.id === HOST_PANEL_ID;
                const isFocused = focusedPanelId === tile.id;
                // Host tile is always "ready" (it's the parent's already-loaded
                // chart) — never show the loading overlay for it.
                const isReady   = isHost || dataReadyPanels.has(tile.id)
                    || overlayFallbackPanels.has(tile.id);
                const failure   = isHost ? null : failedPanels.get(tile.id);
                return (
                    <div
                        key={tile.id}
                        ref={(el) => {
                            if (el) cellRefs.current[tile.id] = el;
                            else delete cellRefs.current[tile.id];
                        }}
                        data-panel-id={tile.id}
                        data-multichart-host-cell={isHost ? "1" : undefined}
                        onMouseDownCapture={(ev) => {
                            if (ev && ev.target && typeof ev.target.closest === "function") {
                                if (ev.target.closest("#multichart-global-settings-root")) return;
                            }
                            focusPanelById(tile.id);
                            const grid = window.__multichartGrid;
                            if (!grid || typeof grid.clearDrawingUiOnOtherPanels !== "function") return;
                            setTimeout(() => {
                                try {
                                    if (typeof window !== "undefined" && window.__v9DrawingSelectionGuardUntil) {
                                        if (performance.now() < window.__v9DrawingSelectionGuardUntil) return;
                                    }
                                } catch (_) {}
                                grid.clearDrawingUiOnOtherPanels(tile.id);
                            }, 0);
                        }}
                        style={{
                            gridColumn: tile.gridColumn || "auto",
                            gridRow:    tile.gridRow    || "auto",
                            position: "relative",
                            // Host cell is the slot for the parent's
                            // #chartWrapper — keep it transparent so the
                            // wrapper paints cleanly over it (the wrapper
                            // is at z-index:13, this cell is z-index auto,
                            // so the wrapper covers the cell exactly).
                            background: isHost ? "transparent" : "#000000",
                            // Static border only — focused border is painted
                            // by the overlay <div> below because CSS outline
                            // is painted by the parent element and gets
                            // covered by the iframe / canvas children
                            // (outline isn't a stacking context).
                            outline: isHost ? "none" : "1px solid #15171f",
                            outlineOffset: "-1px",
                            overflow: "hidden",
                            minWidth: 0,
                            minHeight: 0,
                            // pointer-events: none on host means clicks on the
                            // chart canvas in tile A's slot reach the parent
                            // #chartWrapper (which sits above this cell at
                            // z-index:13) instead of being captured here. The
                            // mouse-down focus handler still fires because
                            // focusing tile A by clicking the parent chart
                            // is naturally implied by it being the host.
                            pointerEvents: isHost ? "none" : "auto",
                        }}
                    >
                        {/* Boot failure only — no TradingView-style loading spinner. */}
                        {!isReady && failure && (
                            <div
                                className="multichart-loading-overlay multichart-error-overlay"
                                style={{ pointerEvents: "auto" }}
                            >
                                <div className="multichart-error-title">Panel {tile.id} failed to load</div>
                                <div className="multichart-error-reason">{failure.reason}</div>
                                <div className="multichart-error-actions">
                                    <button
                                        type="button"
                                        className="multichart-error-btn"
                                        onClick={() => {
                                            const mgr = managerRef.current;
                                            if (!mgr) return;
                                            const cellEl = cellRefs.current[tile.id];
                                            try { mgr.removeChart(tile.id); } catch (_) {}
                                            setReadyPanels((prev) => {
                                                if (!prev.has(tile.id)) return prev;
                                                const n = new Set(prev); n.delete(tile.id); return n;
                                            });
                                            setDataReadyPanels((prev) => {
                                                if (!prev.has(tile.id)) return prev;
                                                const n = new Set(prev); n.delete(tile.id); return n;
                                            });
                                            setOverlayFallbackPanels((prev) => {
                                                if (!prev.has(tile.id)) return prev;
                                                const n = new Set(prev); n.delete(tile.id); return n;
                                            });
                                            setFailedPanels((prev) => {
                                                if (!prev.has(tile.id)) return prev;
                                                const n = new Map(prev); n.delete(tile.id); return n;
                                            });
                                            const hostNt = readHostChartFileAndTf();
                                            if (cellEl) {
                                                try {
                                                    mgr.addChart({
                                                        id:        tile.id,
                                                        tf:        (initialTimeframeRef.current || hostNt.tf || "1m"),
                                                        fileId:    (initialFileIdRef.current || hostNt.fileId || null),
                                                        sessionId: initialSessionIdRef.current || null,
                                                        mode:      initialModeRef.current || readUrlChartMode(),
                                                    }, cellEl);
                                                } catch (_) {}
                                            }
                                        }}
                                    >
                                        Retry
                                    </button>
                                    {failure.src && (
                                        <a
                                            className="multichart-error-btn multichart-error-link"
                                            href={failure.src}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Open in new tab
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        {/*
                          NOTE: the focused-panel border for iframe cells is
                          NOT rendered here. It is injected as a VANILLA DOM
                          element AFTER the iframe via the focus-border
                          effect (see applyIframeFocusBorder). React-rendered
                          overlays would be inserted at React's child-position
                          slot, which (because the iframe is appended outside
                          React) ended up rendered BEFORE the iframe in DOM
                          order — and even with z-index:6 the iframe still
                          covered it on Chromium iframes due to iframe
                          compositing quirks. Doing it via DOM injection
                          guarantees the overlay is the LAST child of the
                          cell and z-index:9999 sits unambiguously on top.
                        */}
                    </div>
                );
            })}

            {/* ─── Draggable column splitters ─────────────────────────
                One <div> per grid-gap boundary, positioned in PIXELS
                (computed from cell bounding rects via `gapCenterPx`)
                so it lands EXACTLY on the divider regardless of how
                the user has resized adjacent panels. Width 10px
                straddles the 4px gap with ±3px overlap into the
                cells for a forgiving click target.

                Hover state paints the gap a soft blue so the user
                sees what they're about to grab. */}
            {columnSplittersToRender.map((s) => (
                <div
                    key={s.key}
                    data-col-splitter={s.gutterIndex}
                    onMouseDown={makeSplitterDown("col", s.gutterIndex)}
                    style={{
                        position: "absolute",
                        top: `${s.top}px`,
                        left: `${s.left}px`,
                        width: "10px",
                        height: `${s.height}px`,
                        cursor: "col-resize",
                        zIndex: 30,
                        background: "transparent",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(41,98,255,0.45)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                />
            ))}

            {/* ─── Draggable row splitters ────────────────────────────
                Mirror of column splitters but along the horizontal
                axis. */}
            {rowSplittersToRender.map((s) => (
                <div
                    key={s.key}
                    data-row-splitter={s.gutterIndex}
                    onMouseDown={makeSplitterDown("row", s.gutterIndex)}
                    style={{
                        position: "absolute",
                        left: `${s.left}px`,
                        width: `${s.width}px`,
                        top: `${s.top}px`,
                        height: "10px",
                        cursor: "row-resize",
                        zIndex: 30,
                        background: "transparent",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(41,98,255,0.45)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                />
            ))}
        </div>

        {/* ─── Unified focus frame ─────────────────────────────────────
            Single overlay, sibling of #chartWrapper inside
            #chart-container. Positioned absolutely from the focused
            cell's bbox (relative to #chart-container).

            Why this placement wins:
              • #chart-container has `isolation: isolate` → all
                children share ONE stacking context.
              • #chartWrapper (Panel A's host) sits at z-index:13.
              • The grid container above (with iframes inside) sits
                at z-index:12.
              • This frame at z-index:14 paints above BOTH, so the
                same overlay works uniformly for the host AND every
                iframe — no per-cell DOM injection, no host-only
                special case, no Chromium iframe-compositing bypass
                needed.

            Visual: 0.75px solid #2962ff with a soft halo. Matches
            TradingView's focused-tile treatment. */}
        {focusedRect && (
            <div
                aria-hidden="true"
                data-multichart-focus-frame="1"
                data-focused-panel-id={focusedPanelId || ""}
                style={{
                    position: "absolute",
                    left:   `${focusedRect.left}px`,
                    top:    `${focusedRect.top}px`,
                    width:  `${focusedRect.width}px`,
                    height: `${focusedRect.height}px`,
                    pointerEvents: "none",
                    // Bumped from 2px → 3px and added a stronger
                    // outer halo + inset glow so the focus state
                    // reads against the dark chart background. Even
                    // at a glance the user should see "this panel
                    // is selected" without squinting.
                    border: "0.75px solid #2962ff",
                    boxSizing: "border-box",
                    boxShadow: [
                        "0 0 6px 1px rgba(41,98,255,0.35)",
                        "inset 0 0 6px rgba(41,98,255,0.18)",
                    ].join(", "),
                    // High z-index inside #chart-container's stacking
                    // context — above #chartWrapper (z:13) and the
                    // grid container (z:12).
                    zIndex: 50,
                }}
            />
        )}
        </>
    );
}
