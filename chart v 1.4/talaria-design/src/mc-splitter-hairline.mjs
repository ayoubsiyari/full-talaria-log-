/**
 * SPLITTER-BORDERS-B90 — resting hairlines on multichart splitter hit targets.
 *
 * Grid gap stays `background:#000000` (layout-gap flash fix). Dividers are
 * painted as a 1px #2a2e3a hairline centred in the 10px [data-col-splitter] /
 * [data-row-splitter] hit strips.
 *
 * Kill-switch: window.__TALARIA_DISABLE_MC_SPLITTER_HAIRLINE_V1
 *   - absent / falsy → feature ON (default)
 *   - any truthy value → transparent resting fill (pre-b90 invisible dividers)
 *   - read per call so a console toggle applies on next render / mouseleave
 */

export const MC_SPLITTER_HAIRLINE_SWITCH = "__TALARIA_DISABLE_MC_SPLITTER_HAIRLINE_V1";
export const MC_SPLITTER_HAIRLINE_COLOR = "#2a2e3a";
export const MC_SPLITTER_HOVER_BG = "rgba(41,98,255,0.45)";

/** Default ON. Truthiness kills. Per-call. */
export function mcSplitterHairlineV1Enabled() {
    try {
        return !(typeof globalThis !== "undefined"
            && globalThis.window
            && globalThis.window[MC_SPLITTER_HAIRLINE_SWITCH]);
    } catch (_) {
        return true;
    }
}

/**
 * Resting background for a 10px splitter hit strip centred on the 4px gap.
 * @param {"col"|"row"} axis
 */
export function mcSplitterRestingBackground(axis) {
    if (!mcSplitterHairlineV1Enabled()) return "transparent";
    // Hit target is 10px; gap is 4px centred → hairline at 4.5..5.5px.
    if (axis === "row") {
        return `linear-gradient(to bottom, transparent 4.5px, ${MC_SPLITTER_HAIRLINE_COLOR} 4.5px, ${MC_SPLITTER_HAIRLINE_COLOR} 5.5px, transparent 5.5px)`;
    }
    return `linear-gradient(to right, transparent 4.5px, ${MC_SPLITTER_HAIRLINE_COLOR} 4.5px, ${MC_SPLITTER_HAIRLINE_COLOR} 5.5px, transparent 5.5px)`;
}
