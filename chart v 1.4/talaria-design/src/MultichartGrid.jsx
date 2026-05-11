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

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
const BRIDGE_VERSION = "20260513T2330";
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
                if (existing.dataset.loaded === "1") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error("failed: " + src)), { once: true });
                return;
            }
            const s = document.createElement("script");
            s.src = src + "?v=" + BRIDGE_VERSION;
            s.async = false;
            s.dataset.multichartBridge = src;
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
    if (window.__multichartHostBridge) return window.__multichartHostBridge;
    if (!window.MultichartBridge) return null;
    const ch = window.chart;
    if (!ch) return null;
    try {
        const bridge = window.MultichartBridge.installBridge(ch, {
            chartId:      HOST_PANEL_ID,
            parentOrigin: "*",
            // Phase 7.2.7: leave verbose ON for the host while we shake out
            // sync issues. Outbound logs (`[bridge:A] out crosshair {...}`,
            // `[bridge:A] out visibleRange {...}`) confirm the host is
            // emitting; absence of those lines means the wrapper isn't
            // being reached by chart.js.
            verbose:      true,
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

// ─── iframe URL ─────────────────────────────────────────────────────────────
function buildIframeSrc({ panelId, fileId, tf, sessionId, mode }) {
    const params = new URLSearchParams();
    params.set("multichart", "1");
    params.set("panelId", panelId);
    if (fileId)    params.set("fileId",    String(fileId));
    if (tf)        params.set("tf",        String(tf));
    if (sessionId) params.set("sessionId", String(sessionId));
    //
    // Forward `mode=backtest|propfirm` so chart.js's checkBacktestingMode
    // runs the canonical backtest pipeline inside the iframe. Without
    // it, the iframe loads via the wrong code path:
    //
    //   • loadFileData uses _buildSmartWindowParams(fileId, '1m', session)
    //     which builds {start_ts, end_ts} bounded to the session window
    //     → fetches in-session 1m bars only.
    //   • autoLoadBacktestingData uses _fetchSmartWindow(fileId, '1d', …,
    //     'end', {endTs: sessionEndMs}, {skipSessionDates:true}) → fetches
    //     up to 100k 1D bars ENDING at session end (year of context).
    //
    // The two paths fetch DIFFERENT slices, so panels visibly load
    // different date ranges. Forwarding mode=backtest lets each iframe
    // hit the same server endpoint as the parent.
    //
    // The visual side-effects (splash overlay, hidden #root) are
    // suppressed by the dist-v9 multichart shim:
    //   <style html.multichart-embed #backtestingLoader { display: none }>
    //   <style html.multichart-embed #root { visibility: visible }>
    // and the shim head-script strips the bt-preload class as soon as
    // it sees ?multichart=1.
    //
    // The duplicated orderManager / propfirm-tracker setup happens but
    // is harmless — every chrome element it touches is hidden by the
    // shim's [data-v9-chrome="1"] rule, so the user sees only the
    // price chart canvas + axes inside each panel.
    if (mode === "backtest" || mode === "propfirm") {
        params.set("mode", mode);
    }
    // BUT — we DO forward `sessionId` so the iframe's chart engine builds
    // the SAME drawings storage key as the parent (chart.js:2181 →
    // `chart_drawings_s<sessionId>_<fileId>` when a session is active).
    // Without sessionId, the iframe looks under `chart_drawings_<fileId>`
    // and finds nothing, even though the parent has been saving the
    // user's drawings under the session-scoped key for hours.
    return "/chart/dist-v9/index.html?" + params.toString();
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
`;

function ensureLoadingStyleInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById(LOADING_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = LOADING_STYLE_ID;
    s.textContent = LOADING_STYLE_CSS;
    document.head.appendChild(s);
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
function applyHostSlot(cellEl) {
    if (!cellEl) return;
    if (typeof document === "undefined") return;
    applyHostSlotPositionOnly(cellEl);
    // Force chart.js to re-measure and repaint into the new bbox.
    try {
        const ch = window.chart;
        if (ch && typeof ch.resize === "function") {
            ch._lastResizeDpr = 0;
            ch.resize();
            if (typeof ch.render === "function") ch.render();
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
    // Bright, thick TradingView-style focus border. Previous values
    // (2px / #3a6db5 / soft inset shadow) read as "barely tinted" on
    // a dark chart background — user couldn't tell which panel was
    // selected. New look:
    //   • 3px solid border in #2962ff (TradingView's active-blue)
    //   • outer glow via box-shadow that bleeds 6-12px into the gap
    //     so even the panel sides next to a peer panel are obviously
    //     highlighted
    //   • stronger inset glow so the border is unmistakable against
    //     the chart canvas it's painted on top of
    overlay.style.cssText = [
        "position: absolute",
        "inset: 0",
        "pointer-events: none",
        "border: 3px solid #2962ff",
        "border-radius: 2px",
        "box-sizing: border-box",
        "box-shadow: " + [
            "0 0 0 1px rgba(41,98,255,0.85)",
            "0 0 12px 2px rgba(41,98,255,0.55)",
            "inset 0 0 14px rgba(41,98,255,0.25)",
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
            // Clean TradingView-style frame: 2px solid blue with a
            // single 1px halo. Matches the iframe focus frame exactly
            // so focus state reads identically across all panels.
            overlay.style.cssText = [
                "position: absolute",
                "inset: 0",
                "pointer-events: none",
                "border: 2px solid #2962ff",
                "box-sizing: border-box",
                "box-shadow: 0 0 0 1px rgba(41,98,255,0.45)",
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
    const [readyPanels, setReadyPanels] = useState(() => new Set([HOST_PANEL_ID]));

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
    const onStateAnyRef = useRef(null);

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
    // Reset fractions whenever the layout TEMPLATE (not just id) changes
    // so a layout switch always opens with even splits.
    useEffect(() => {
        setColFractions(parseFrTemplate(layout.cols));
        setRowFractions(parseFrTemplate(layout.rows));
    }, [layout.cols, layout.rows]);

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
    const isDraggingRef = useRef(false);
    // liveDragRef holds the IN-FLIGHT drag's latest fractions. Set
    // each rAF flush during drag, cleared on mouseup. The
    // useLayoutEffect below reads it on every render — if a render
    // happens mid-drag for unrelated reasons (focus change, replay
    // tick, etc.) the effect re-applies our drag's inline style so
    // the splitter doesn't snap back to the React-state position.
    const liveDragRef = useRef(null); // { axis: 'col'|'row', fracs: number[] }
    useEffect(() => {
        if (isDraggingRef.current) return;
        const cellA = cellRefs.current[HOST_PANEL_ID];
        if (cellA) {
            // Defer one rAF so the grid has actually committed the new
            // template before we measure the cell bbox.
            requestAnimationFrame(() => applyHostSlot(cellA));
        }
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

        loadParentBridge().then(() => {
            if (cancelled) return;
            if (!containerRef.current) return;
            if (!window.MultichartManager) {
                console.error("[MultichartGrid] MultichartManager not available after bridge load");
                return;
            }

            const manager = new window.MultichartManager({
                container: containerRef.current,
                iframeSrcBuilder: function (cfg) {
                    return buildIframeSrc({
                        panelId:   cfg.id,
                        fileId:    cfg.fileId,
                        tf:        cfg.tf,
                        sessionId: cfg.sessionId || initialSessionIdRef.current || null,
                        mode:      cfg.mode      || initialModeRef.current      || null,
                    });
                },
                onLog: function (entry) {
                    const tag = "[multichart-mgr]";
                    if (entry.level === "error")      console.error(tag, entry.text);
                    else if (entry.level === "warn")  console.warn(tag, entry.text);
                    else                              console.log(tag, entry.text);
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
                onChartReady: function (id) {
                    setReadyPanels((prev) => {
                        if (prev.has(id)) return prev;
                        const next = new Set(prev);
                        next.add(id);
                        return next;
                    });
                },
                // Phase 7.2.4: iframe-side `panel-focus` events bubble up
                // here. Iframe events don't propagate to the parent DOM,
                // so the cell <div>'s onMouseDownCapture never fires for
                // clicks on B/C/D — we rely on the iframe to tell us
                // explicitly via panel-cmd-bridge's focus broadcast.
                onPanelFocus: function (id) {
                    if (typeof setFocusedPanelId === "function") {
                        setFocusedPanelId(id);
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
                } catch (e) {
                    console.error("[MultichartGrid] addHostChart failed:", e);
                }
            });
        }).catch((err) => {
            console.error("[MultichartGrid] failed to load parent bridge:", err);
        });

        return () => {
            cancelled = true;
            if (managerRef.current) {
                try { managerRef.current.dispose(); } catch (_) {}
                managerRef.current = null;
            }
            setManagerReady(false);
            setReadyPanels(new Set());
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
                setReadyPanels((prev) => {
                    if (!prev.has(existingId)) return prev;
                    const next = new Set(prev);
                    next.delete(existingId);
                    return next;
                });
            }
        }

        // Add iframe charts that exist in the layout but not yet in the manager.
        // (The cell <div> is already mounted by React's render that just
        // committed — useEffect runs AFTER commit, so cellRefs are set.)
        for (const tile of layout.tiles) {
            if (tile.id === HOST_PANEL_ID) continue; // host has no iframe
            if (mgr.charts.has(tile.id)) continue;
            const cellEl = cellRefs.current[tile.id];
            if (!cellEl) continue;
            try {
                mgr.addChart({
                    id:        tile.id,
                    tf:        initialTimeframeRef.current || "1m",
                    fileId:    initialFileIdRef.current    || null,
                    sessionId: initialSessionIdRef.current || null,
                    mode:      initialModeRef.current      || null,
                }, cellEl);
            } catch (e) {
                console.error("[MultichartGrid] addChart failed for", tile.id, e);
            }
        }
    }, [layout.tiles, managerReady]);

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
        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                applyHostSlot(cellA);
            });
        };

        applyHostSlot(cellA);

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
        const onWrapperDown = () => {
            if (typeof setFocusedPanelId === "function") {
                setFocusedPanelId(HOST_PANEL_ID);
            }
        };
        if (wrapper) {
            wrapper.addEventListener("mousedown", onWrapperDown, { capture: true });
        }

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener("resize", onWin);
            window.removeEventListener("scroll", onWin, { capture: true });
            if (wrapper) {
                wrapper.removeEventListener("mousedown", onWrapperDown, { capture: true });
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
    // The MultichartManager constructor defaults syncMode to ALL true
    // (multichart-manager.js:75). React's layoutSync state, however,
    // defaults to crosshair/symbol/drawings ON but time/dateRange OFF.
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
            mgr.setSyncMode({
                crosshair:    !!(layoutSync && layoutSync.crosshair),
                visibleRange: !!(layoutSync && (layoutSync.dateRange || layoutSync.time)),
                symbol:       !!(layoutSync && layoutSync.symbol),
                drawings:     !!(layoutSync && layoutSync.drawings),
            });
        } catch (_) {}
    }, [layoutSync, managerReady]);

    // ─── Interval (timeframe) sync ──────────────────────────────────────
    //
    // The manager's syncMode does NOT cover Interval — chart.js's
    // setTimeframe is an action, not a sync envelope. We implement
    // Interval sync at the React layer instead: whenever the host's
    // current timeframe changes AND layoutSync.interval is on, fan it
    // out to every iframe panel via panel-cmd-bridge.setTimeframe.
    //
    // Listen on chart.js's `timeframeChanged` event (chart.js:11587 →
    // _emitTimeframeChanged). The event fires on the parent window only
    // (each iframe fires on its own contentWindow), so this listener
    // naturally only sees host tile A's timeframe changes.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onTfChanged = (ev) => {
            if (!layoutSync || !layoutSync.interval) return;
            const mgr = managerRef.current;
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
            if (!layoutSync || !layoutSync.symbol) return;
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
    // We ALSO mirror parent's play/pause/speed/playbackMode to iframes
    // so each panel runs its OWN replay loop in lockstep — see the
    // monkey-patch block below. This gives smooth tick animation on
    // every panel without bouncing every animation frame through
    // postMessage. The replayTick fan-out above still runs on each
    // bar advance to correct any drift between local loops.
    //
    // The shared replay state is held in a ref so the listener effect
    // (mount-once) and the prime-on-ready effect (depends on
    // readyPanels) can both read/write the same lastBroadcastTs and
    // everEntered fields without re-creating the listeners on every
    // ready change.
    const replayStateRef = useRef({
        lastBroadcastTs: 0,
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
                // Capture parent's current play/speed/mode so a panel
                // that joins mid-playback boots into the same loop
                // (otherwise it would sit paused at parent's ts until
                // the user clicks pause-then-play).
                const parentIsPlaying = !!rs.isPlaying;
                const parentSpeed = Number(rs.speed) || 1;
                const parentMode = (typeof rs.getPlaybackMode === "function")
                    ? rs.getPlaybackMode()
                    : (rs.playbackMode || "tick");
                for (const c of mgr.charts.values()) {
                    if (!c || c.host || !c.ready) continue;
                    try { mgr.sendCommand(c.id, "replayEnter", { timestamp: ts }); }
                    catch (_) {}
                    // After enter, push the current speed + mode so the
                    // iframe's local loop matches before play arrives.
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
            const ts = ev && ev.detail && ev.detail.timestamp;
            if (!Number.isFinite(ts)) return;
            if (ts === replayStateRef.current.lastBroadcastTs) return;
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
                    if (rs.isActive && typeof rs.stepForward === "function") {
                        if (rs.isPlaying && typeof rs.pause === "function") {
                            try { rs.pause(); } catch (_) {}
                        }
                        try { rs.stepForward(); } catch (_) {}
                    }
                    break;
                case "stepBackward":
                    if (rs.isActive && typeof rs.stepBackward === "function") {
                        if (rs.isPlaying && typeof rs.pause === "function") {
                            try { rs.pause(); } catch (_) {}
                        }
                        try { rs.stepBackward(); } catch (_) {}
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
                    return patchOriginalExit();
                };

                // ── play → broadcast replayPlay {speed, mode} ──
                //
                // Send AFTER calling original so the parent's UI/state
                // is already updated when iframes start their loops.
                // Read speed + mode from `this` (the replaySystem) AFTER
                // play() so any lazy initialization (saved tick state,
                // etc.) has run.
                if (typeof patchedRs.play === "function") {
                    patchOriginalPlay = patchedRs.play.bind(patchedRs);
                    patchedRs.play = function () {
                        const result = patchOriginalPlay();
                        try {
                            const speed = Number(this.speed) || 1;
                            const mode = (typeof this.getPlaybackMode === "function")
                                ? this.getPlaybackMode()
                                : (this.playbackMode || "tick");
                            broadcastToIframes("replayPlay", { speed, mode });
                        } catch (_) {}
                        return result;
                    };
                }

                // ── pause → broadcast replayPause ──
                if (typeof patchedRs.pause === "function") {
                    patchOriginalPause = patchedRs.pause.bind(patchedRs);
                    patchedRs.pause = function () {
                        const result = patchOriginalPause();
                        broadcastToIframes("replayPause", {});
                        return result;
                    };
                }

                // ── setSpeed → broadcast replaySetSpeed {speed} ──
                //
                // Re-read from `this` post-call because setSpeed
                // normalizes (clamp 1..100) and we want iframes to
                // receive the post-clamp value, not the raw input.
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
                            const m = (typeof this.getPlaybackMode === "function")
                                ? this.getPlaybackMode()
                                : (this.playbackMode || "tick");
                            broadcastToIframes("replaySetMode", { mode: m });
                        } catch (_) {}
                        return result;
                    };
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
            window.removeEventListener("replayVirtualTimeChanged", onReplayTick);
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
    useEffect(() => {
        // Defer to next microtask so the manager's `c.ready` flag has
        // been set (onChartReady runs synchronously before this state
        // update is processed, but the iframe's mgr.charts.get(id) may
        // not yet reflect c.ready=true in the same tick).
        const t = setTimeout(_primeReplayFromParent, 0);
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
        // Both host AND iframe paths read from the cell <div> — the
        // host wrapper is sized to cell A, so the cell's bbox is the
        // correct rect for either case. This keeps the math uniform.
        const cell = cellRefs.current[focusedPanelId];
        const parent = document.getElementById(HOST_CONTAINER_ID);
        if (!cell || !parent) { setFocusedRect(null); return; }
        const cellRect = cell.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        setFocusedRect({
            left:   Math.round(cellRect.left   - parentRect.left),
            top:    Math.round(cellRect.top    - parentRect.top),
            width:  Math.round(cellRect.width),
            height: Math.round(cellRect.height),
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

    function dispatchFocusChanged(panelId) {
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
        const t = setTimeout(() => dispatchFocusChanged(focusedPanelId), 0);
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

    // Fire when ANY panel's state updates. Two responsibilities:
    //
    //   (a) Update focused-panel mirror UI (existing behavior — drives
    //       the topbar OHLC + indicator chips when the focused panel
    //       reports new tf / fileId / candle counts).
    //
    //   (b) Bidirectional Interval / Symbol fan-out (TradingView UX).
    //       When sync.interval is on, a tf change on ANY panel (host
    //       or iframe) should propagate to every other panel. Same
    //       for sync.symbol with file changes. The host listens to
    //       its own `timeframeChanged` / `chartDataLoaded` events
    //       (effects above), and each iframe reports tf / fileId via
    //       sync-bridge `chart-state` postMessage which lands here.
    onStateAnyRef.current = (id, state) => {
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
                    if (window.chart && typeof window.chart.loadFileData === "function"
                        && String(window.chart.currentFileId || "") !== fid) {
                        window.chart.loadFileData(fid);
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
                        if (typeof ch.loadFileData !== "function") {
                            return Promise.reject(new Error("chart.loadFileData is not a function"));
                        }
                        if (args.fileId === undefined || args.fileId === null || args.fileId === "") {
                            return Promise.reject(new Error("loadFile: missing fileId"));
                        }
                        const r = ch.loadFileData(String(args.fileId));
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
                        if (typeof dmc.clearTool === "function") dmc.clearTool();
                        else dmc.currentTool = null;
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
                        const ind = ch.addIndicator(type);
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
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
                        try { if (typeof ch.render === "function") ch.render(); } catch (_) {}
                        try { if (om.updateOrderLines) om.updateOrderLines(ch); } catch (_) {}
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
        function runCommand(cmd, args, opts) {
            const target = (opts && opts.panelId)
                ? opts.panelId
                : (focusedPanelIdRef.current || HOST_PANEL_ID);
            if (target === HOST_PANEL_ID) return applyHostCommand(cmd, args);
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

        // runCommandIframes broadcasts the command to every IFRAME panel
        // (B / C / D), explicitly SKIPPING the host. Used by drawings:
        // TradingView arms the active drawing tool on every panel so
        // whichever one the user clicks first is already armed when the
        // canvas's mousedown fires.
        //
        // We deliberately skip the host here — the parent's React tree
        // already has its OWN proven legacy code path that wires
        // `chart.drawingManager.setTool` directly. Routing the host
        // through this bus introduced a feedback loop where the
        // chart engine's internal `finalizeDrawing → clearTool`
        // (line 3759 of drawing-tools-manager.js) hit our wrapped
        // clearTool → syncRailIfCursor → setTool("crosshair") → React
        // re-render → drawing-tool effect → runCommandAll →
        // dm.clearTool again. That chain crashed the page when
        // drawing on the host with iframes open. By keeping the
        // host on the legacy direct path, the host's drawing flow
        // is byte-identical to single-chart mode (zero regression
        // risk for the most-used panel).
        //
        // Returns Promise<void> (resolves once every iframe call has
        // settled; individual rejections are swallowed so one bad
        // iframe doesn't break the others).
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

        window.__multichartGrid = {
            isMounted,
            runCommand,
            runCommandIframes,
            getPanelIndicators,
            getFocusedPanelId: () => focusedPanelIdRef.current,
        };

        return () => {
            if (window.__multichartGrid && window.__multichartGrid.runCommand === runCommand) {
                delete window.__multichartGrid;
            }
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
    //      to all peer iframes whose currentSymbol matches. This
    //      covers the case where the user kept Panel A focused and
    //      placed via the rail — the order appears on the host AND
    //      on every same-pair iframe.
    //
    //   3. LISTEN for `iframe-order` postMessage envelopes (sent by
    //      panel-cmd-bridge.installOrderForwarders inside each iframe)
    //      and fan them out the same way: to the host (if symbol
    //      matches) and to every other iframe (if symbol matches),
    //      excluding the source.
    //
    // Symbol matching is done on a NORMALIZED form (slash stripped,
    // upper-cased) because order objects store symbol like 'EURUSD'
    // while chart.currentSymbol is 'EUR/USD'. Without the normalize,
    // every cross-panel mirror would silently fail.
    useEffect(() => {
        const normalize = (s) => String(s || "").replace(/\//g, "").toUpperCase();

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

        // Find all panels (host + iframes) whose currentSymbol matches
        // the given normalized symbol, excluding the panel id in
        // `excludeId`. Returns array of { id, isHost }.
        function findPanelsForSymbol(symNorm, excludeId) {
            const out = [];
            // Host
            if (excludeId !== HOST_PANEL_ID) {
                const ch = window.chart;
                if (ch && normalize(ch.currentSymbol) === symNorm) {
                    out.push({ id: HOST_PANEL_ID, isHost: true });
                }
            }
            // Iframes
            const mgr = managerRef.current;
            if (mgr && mgr.charts && typeof mgr.charts.values === "function") {
                for (const c of mgr.charts.values()) {
                    if (!c || c.host) continue;
                    if (c.id === excludeId) continue;
                    const sym = c.state && c.state.symbol;
                    if (sym && normalize(sym) === symNorm) {
                        out.push({ id: c.id, isHost: false });
                    }
                }
            }
            return out;
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

        function broadcastOrder(sourceId, kind, order) {
            if (!order || order.id == null) return;
            const symNorm = normalize(order.symbol || order.ticker);
            if (!symNorm) return;
            const peers = findPanelsForSymbol(symNorm, sourceId);
            for (const p of peers) {
                mirrorTo(p.id, p.isHost, kind, order);
            }
        }

        // ─── 1. host eventBus subscription ─────────────────────────
        let hostOffOpened = null;
        let hostOffPending = null;
        let hostOffClosed = null;
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
            // Note: we do NOT mirror order:closed yet — the chart
            // engine handles SL/TP hits + manual closes per-panel
            // already via shared session state on the next render.
            // Adding it here would risk double-closing positions
            // that the iframe's own simulated price already closed.
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

        // ─── 2. iframe-order postMessage listener ──────────────────
        function onIframeOrder(ev) {
            const msg = ev && ev.data;
            if (!msg || typeof msg !== "object") return;
            if (msg.type !== "iframe-order") return;
            const sourceId = msg.source;
            const kind     = msg.kind;
            const order    = msg.order;
            if (!order || order.id == null) return;
            if (kind !== "opened" && kind !== "pending") return;
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
            document.removeEventListener("click", onPlaceOrderClickCapture, true);
            window.removeEventListener("message", onIframeOrder);
            try { if (typeof hostOffOpened  === "function") hostOffOpened(); }  catch (_) {}
            try { if (typeof hostOffPending === "function") hostOffPending(); } catch (_) {}
            try { if (typeof hostOffClosed  === "function") hostOffClosed(); }  catch (_) {}
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

            // CRITICAL: iframes capture mouse events from their own
            // window. Once the cursor crosses into an iframe during a
            // drag, the parent document's mousemove listener simply
            // stops firing — that's the #1 reason splitter drags
            // feel "stuck" or stuttery. Disabling pointer-events on
            // every iframe lets the cursor glide over them while the
            // parent keeps receiving mousemove. We restore the
            // original value on mouseup.
            const lockedIframes = [];
            try {
                const ifrs = container.querySelectorAll("iframe");
                ifrs.forEach((ifr) => {
                    lockedIframes.push({ el: ifr, prev: ifr.style.pointerEvents });
                    ifr.style.pointerEvents = "none";
                });
            } catch (_) {}

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
                // Cheap host reposition (no chart.resize()).
                const cellA = cellRefs.current[HOST_PANEL_ID];
                if (cellA) applyHostSlotPositionOnly(cellA);
                // Keep the focus frame glued to the focused cell as
                // the splitter moves — without this the blue border
                // would stay frozen at the pre-drag bbox and snap
                // only on mouseup.
                if (computeFocusedRectRef.current) {
                    computeFocusedRectRef.current();
                }
            }

            function onMove(e) {
                pendingDx = (axis === "col" ? e.clientX : e.clientY) - startMouse;
                if (raf) return;
                raf = requestAnimationFrame(flush);
            }
            function onUp() {
                if (raf) {
                    cancelAnimationFrame(raf);
                    flush(); // ensure the very last position is applied
                }
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup",   onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                // Restore iframe pointer-events so user interaction
                // resumes inside the panels.
                lockedIframes.forEach(({ el, prev }) => {
                    el.style.pointerEvents = prev || "";
                });
                // Release the drag gate FIRST and clear the live
                // drag stash, then commit final state to React. After
                // this point unrelated re-renders won't snap back
                // because the JSX template now matches what we wrote.
                isDraggingRef.current = false;
                liveDragRef.current  = null;
                if (axis === "col") setColFractions(lastApplied);
                else                setRowFractions(lastApplied);
                // Force final crisp repaint regardless of React
                // bailout (same-reference state would skip the
                // useEffect that normally drives applyHostSlot).
                requestAnimationFrame(() => {
                    const cellA = cellRefs.current[HOST_PANEL_ID];
                    if (cellA) applyHostSlot(cellA);
                });
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup",   onUp);
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
        const update = () => {
            const r = el.getBoundingClientRect();
            setContainerSize({ w: r.width, h: r.height });
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
                const isReady   = isHost || readyPanels.has(tile.id);
                return (
                    <div
                        key={tile.id}
                        ref={(el) => {
                            if (el) cellRefs.current[tile.id] = el;
                            else delete cellRefs.current[tile.id];
                        }}
                        data-panel-id={tile.id}
                        data-multichart-host-cell={isHost ? "1" : undefined}
                        onMouseDownCapture={() => {
                            if (typeof setFocusedPanelId === "function") {
                                setFocusedPanelId(tile.id);
                            }
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
                            background: isHost ? "transparent" : "#0b0c14",
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
                        {/* Loading overlay (TradingView-style 3 dots + faint
                             chart skeleton). Renders ABOVE the manager-spawned
                             iframe (z-index:5 > iframe default) until the
                             panel's bridge fires `bridge-ready`. Unmounted
                             once `onChartReady(id)` adds id to readyPanels.
                             Skipped for the host cell — parent chart is
                             already loaded with full state. */}
                        {!isReady && (
                            <div className="multichart-loading-overlay" aria-hidden="true">
                                <div className="multichart-loading-dots">
                                    <span/><span/><span/>
                                </div>
                                <div className="multichart-loading-label">Loading {tile.id}</div>
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

            Visual: clean 2px solid #2962ff with a 1px halo. Matches
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
                    border: "3px solid #2962ff",
                    boxSizing: "border-box",
                    boxShadow: [
                        "0 0 0 1px #2962ff",                // crisp outer line
                        "0 0 8px 2px rgba(41,98,255,0.55)", // soft outer glow
                        "inset 0 0 8px rgba(41,98,255,0.30)", // inner glow
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
