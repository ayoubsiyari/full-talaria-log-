/**
 * ORD-LEVEL-VIS Option B — pure off-screen edge marker helpers (property tests).
 * Browser logic mirrored in order-manager.js.
 */

export function orderOffscreenMarkerV1Enabled(scope) {
    const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
    return !(g.__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1 === true);
}

/** @returns {'above'|'below'|null} */
export function resolveOffscreenMarkerEdge(y, plotTop, plotBottom) {
    if (!Number.isFinite(y) || !Number.isFinite(plotTop) || !Number.isFinite(plotBottom)) return null;
    if (y >= plotTop && y <= plotBottom) return null;
    return y < plotTop ? 'above' : 'below';
}

export function clampOffscreenMarkerY(edge, plotTop, plotBottom, inset = 12) {
    const pad = Number.isFinite(inset) ? inset : 12;
    if (edge === 'above') return plotTop + pad;
    if (edge === 'below') return plotBottom - pad;
    return null;
}

export function markerLabelInPlot(markerY, plotTop, plotBottom) {
    return Number.isFinite(markerY) && markerY >= plotTop && markerY <= plotBottom;
}
