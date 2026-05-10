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
const BRIDGE_VERSION = "20260511T2000";
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

// ─── iframe URL ─────────────────────────────────────────────────────────────
function buildIframeSrc({ panelId, fileId, tf, sessionId /*, mode — intentionally NOT forwarded, see note */ }) {
    const params = new URLSearchParams();
    params.set("multichart", "1");
    params.set("panelId", panelId);
    if (fileId)    params.set("fileId",    String(fileId));
    if (tf)        params.set("tf",        String(tf));
    if (sessionId) params.set("sessionId", String(sessionId));
    //
    // NOTE: we deliberately do NOT forward `mode=backtest|propfirm` into
    // iframe panels even when the parent /chart/ is in backtest mode.
    // Reasons:
    //   1. mode=backtest triggers the bt-preload splash overlay
    //      (#backtestingLoader, "Talaria-Log" loading screen) and hides
    //      #root until chart.js auto-loads the session — that takes
    //      ~1-2s per iframe and visually masks every panel.
    //   2. The iframe would also kick off its own autoLoadBacktestingData
    //      pipeline (read /api/sessions/X or localStorage backtestingSession,
    //      apply order manager, propfirm tracker, etc) — all duplicate
    //      work that the parent already does.
    //   3. The parent owns the backtest UI (orders, balance, trade list,
    //      propfirm tracking) via the topbar/leftbar/bottom bar that stays
    //      visible around the grid. Iframes only need the price chart.
    //
    // Each iframe boots in "no-mode" (plain chart shell), then
    // embed-bridge.js calls window.chart.loadFileData(fileId) the moment
    // the engine is ready. End result: panels paint the chart directly
    // with no splash and no duplicated auto-load.
    //
    // BUT — we DO forward `sessionId` so the iframe's chart engine builds
    // the SAME drawings storage key as the parent (chart.js:2181 →
    // `chart_drawings_s<sessionId>_<fileId>` when a session is active).
    // Without sessionId, the iframe looks under `chart_drawings_<fileId>`
    // and finds nothing, even though the parent has been saving the
    // user's drawings under the session-scoped key for hours. That's why
    // multichart panels showed empty even when single-chart reload
    // restored everything.
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
    const wrapper   = document.getElementById(HOST_WRAPPER_ID);
    const container = document.getElementById(HOST_CONTAINER_ID);
    if (!wrapper || !container) return;
    const cellRect      = cellEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Subpixel-friendly coords. We round to the nearest int to avoid
    // hairline anti-alias gaps where cell.outline meets the wrapper edge.
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
    overlay.style.cssText = [
        "position: absolute",
        "inset: 0",
        "pointer-events: none",
        "border: 2px solid #3a6db5",
        "box-sizing: border-box",
        "box-shadow: 0 0 0 1px rgba(58,109,181,0.35), inset 0 0 12px rgba(58,109,181,0.18)",
        "z-index: 9999",
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
            overlay.style.cssText = [
                "position: absolute",
                "inset: 0",
                "pointer-events: none",
                "border: 2px solid #3a6db5",
                "box-sizing: border-box",
                "box-shadow: 0 0 0 1px rgba(58,109,181,0.35), inset 0 0 12px rgba(58,109,181,0.18)",
                "z-index: 9999",
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
    initialMode, // currently unused — see buildIframeSrc note
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
    useEffect(() => { initialFileIdRef.current    = initialFileId;    }, [initialFileId]);
    useEffect(() => { initialTimeframeRef.current = initialTimeframe; }, [initialTimeframe]);
    useEffect(() => { initialSessionIdRef.current = initialSessionId; }, [initialSessionId]);

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

    const layout = useMemo(
        () => resolveLayout(layoutId, panelCount),
        [layoutId, panelCount]
    );

    // Inject the loading-overlay CSS once (idempotent — checks for existing
    // <style> tag by id).
    useEffect(() => { ensureLoadingStyleInjected(); }, []);

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
                        // mode intentionally omitted — see note in buildIframeSrc
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
    // We deliberately do NOT mirror parent's PLAY/PAUSE state to iframes
    // — only the timestamp. Each iframe seeks on every tick, which is
    // the correct behavior whether the parent is playing (continuous
    // ticks) or paused (no ticks → iframes hold position). Speed is
    // also implicitly handled: parent's tick rate IS the playback
    // speed; iframes inherit it for free.
    //
    // The shared replay state is held in a ref so the listener effect
    // (mount-once) and the prime-on-ready effect (depends on
    // readyPanels) can both read/write the same lastBroadcastTs and
    // everEntered fields without re-creating the listeners on every
    // ready change.
    const replayStateRef = useRef({
        lastBroadcastTs: 0,
        everEntered: false,
    });

    // Prime helper: shared between the mount-once tick listener and the
    // readyPanels-watching effect. If parent is in active replay, send
    // replayEnter to every iframe panel that's bridge-ready but hasn't
    // been told yet.
    function _primeReplayFromParent() {
        try {
            const ch = (typeof window !== "undefined") ? window.chart : null;
            if (!ch || !ch.replaySystem || !ch.replaySystem.isActive) return;
            const ts = ch.replaySystem.replayTimestamp;
            if (!Number.isFinite(ts)) return;
            replayStateRef.current.lastBroadcastTs = ts;
            replayStateRef.current.everEntered = true;
            const mgr = managerRef.current;
            if (!mgr || !mgr.charts) return;
            for (const c of mgr.charts.values()) {
                if (!c || c.host || !c.ready) continue;
                try { mgr.sendCommand(c.id, "replayEnter", { timestamp: ts }); }
                catch (_) {}
            }
        } catch (_) {}
    }

    useEffect(() => {
        if (typeof window === "undefined") return;

        const onReplayTick = (ev) => {
            const mgr = managerRef.current;
            if (!mgr || typeof mgr.sendCommand !== "function") return;
            const ts = ev && ev.detail && ev.detail.timestamp;
            if (!Number.isFinite(ts)) return;
            if (ts === replayStateRef.current.lastBroadcastTs) return;
            replayStateRef.current.lastBroadcastTs = ts;
            const cmd = replayStateRef.current.everEntered ? "replayTick" : "replayEnter";
            replayStateRef.current.everEntered = true;
            for (const c of mgr.charts.values()) {
                if (!c || c.host) continue;
                try { mgr.sendCommand(c.id, cmd, { timestamp: ts }); }
                catch (_) { /* ignore — the next tick retries */ }
            }
        };

        window.addEventListener("replayVirtualTimeChanged", onReplayTick);

        // On mount: prime any iframes that are already ready before the
        // first tick (covers "user opens layout 2v while paused at
        // session start" — no tick will fire until they hit play).
        _primeReplayFromParent();

        // Monkey-patch parent's exitReplayMode so iframes drop replay
        // mode in lockstep. Done lazily because replaySystem may not
        // exist yet at mount — retry up to 5s.
        let patchedRs = null;
        let patchOriginalExit = null;
        const tryPatch = (deadline) => {
            const ch = window.chart;
            if (ch && ch.replaySystem && typeof ch.replaySystem.exitReplayMode === "function"
                && !ch.replaySystem.__multichartExitPatched) {
                patchedRs = ch.replaySystem;
                patchOriginalExit = patchedRs.exitReplayMode.bind(patchedRs);
                patchedRs.__multichartExitPatched = true;
                patchedRs.exitReplayMode = function () {
                    try {
                        const mgr = managerRef.current;
                        if (mgr) {
                            for (const c of mgr.charts.values()) {
                                if (!c || c.host) continue;
                                try { mgr.sendCommand(c.id, "replayExit", {}); }
                                catch (_) {}
                            }
                        }
                    } catch (_) {}
                    replayStateRef.current.everEntered = false;
                    replayStateRef.current.lastBroadcastTs = 0;
                    return patchOriginalExit();
                };
                return;
            }
            if (Date.now() < deadline) {
                setTimeout(() => tryPatch(deadline), 200);
            }
        };
        tryPatch(Date.now() + 5000);

        return () => {
            window.removeEventListener("replayVirtualTimeChanged", onReplayTick);
            // Restore exitReplayMode if we patched it — keeps single-
            // chart behavior intact when the user picks layout 1 again.
            if (patchedRs && patchOriginalExit && patchedRs.__multichartExitPatched) {
                try {
                    patchedRs.exitReplayMode = patchOriginalExit;
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
    useEffect(() => {
        applyHostFocusOutline(focusedPanelId === HOST_PANEL_ID);
        return () => applyHostFocusOutline(false);
    }, [focusedPanelId]);

    // ─── Focus border for iframe cells (vanilla DOM injection) ──────────
    //
    // Runs whenever focusedPanelId changes. Strips any existing focus
    // border from every cell, then appends a fresh overlay <div> as the
    // LAST child of the focused cell. Vanilla DOM (not React) is used so
    // the overlay sits AFTER the manager-appended iframe in DOM order;
    // combined with z-index:9999 this is the only reliable way to paint
    // a border on top of an iframe across browsers.
    //
    // The effect also depends on `managerReady` + `layout.tiles` so that
    // when the manager has just added a new iframe (e.g. user splits 2→4
    // and immediately clicks D), the cell is in cellRefs and the overlay
    // can be injected.
    useEffect(() => {
        clearIframeFocusBorders(cellRefs.current);
        if (!focusedPanelId || focusedPanelId === HOST_PANEL_ID) return;
        const cell = cellRefs.current[focusedPanelId];
        if (!cell) return;
        applyIframeFocusBorder(cell);
        return () => clearIframeFocusBorders(cellRefs.current);
    }, [focusedPanelId, managerReady, layout.tiles]);

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

    return (
        <div
            ref={containerRef}
            data-multichart-grid="1"
            style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: layout.cols,
                gridTemplateRows: layout.rows,
                gap: "1px",
                background: "#1c1f2a",
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
        </div>
    );
}
