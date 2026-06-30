/**
 * Drawing Tools Base Module
 * Core infrastructure for D3.js drawing tools system
 * Provides base classes, utilities, and common functionality
 */

// ============================================================================
// UUID Generator
// ============================================================================
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/** Shared default stroke/fill for all drawing tools (V9 toolbar + new placements). */
const DRAWING_TOOL_DEFAULT_STROKE = '#8C8C8C';
const DRAWING_TOOL_DEFAULT_FILL = 'rgba(140, 140, 140, 0.2)';

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DRAWING_TEXT_ARABIC_FONT_FAMILY = '"Segoe UI", "Noto Sans Arabic", "Arial", sans-serif';
const DRAWING_TEXT_ITALIC_SKEW_DEG = -12;

function normalizeFibLevelsLabelPosition(style) {
    const raw = style && style.levelsLabelPosition;
    const pos = String(raw || 'right').trim().toLowerCase();
    if (pos === 'left' || pos === 'top') return 'left';
    if (pos === 'center' || pos === 'middle') return 'center';
    if (pos === 'right' || pos === 'bottom') return 'right';
    return 'right';
}

/** Price-plot vertical span in pixels (excludes time/price axis margins). */
function fibChartPlotVerticalSpan(scales) {
    const yRange = scales?.yScale?.range?.();
    if (Array.isArray(yRange) && yRange.length >= 2 && Number.isFinite(yRange[0]) && Number.isFinite(yRange[1])) {
        return {
            plotTop: Math.min(yRange[0], yRange[1]),
            plotBottom: Math.max(yRange[0], yRange[1]),
        };
    }
    const chart = scales?.chart;
    if (chart && chart.margin && Number.isFinite(chart.h)) {
        const m = chart.margin;
        return {
            plotTop: m.t || 0,
            plotBottom: chart.h - (m.b || 0),
        };
    }
    const h = chart?.h || 500;
    return { plotTop: 0, plotBottom: h };
}

/** Horizontal span: label at left edge, center, or right edge of [spanMinX, spanMaxX]. */
function fibHorizontalSpanLabelPlacement(style, spanMinX, spanMaxX, pad = 5) {
    const pos = normalizeFibLevelsLabelPosition(style);
    const minX = Math.min(spanMinX, spanMaxX);
    const maxX = Math.max(spanMinX, spanMaxX);
    if (pos === 'left') return { x: minX - pad, anchor: 'end' };
    if (pos === 'center') return { x: (minX + maxX) / 2, anchor: 'middle' };
    return { x: maxX + pad, anchor: 'start' };
}

/** Fib Arcs: semi-circle labels on the flat diameter (left/center/right); full circle uses cardinals. */
function fibArcsLevelLabelPlacement(style, cx, cy, r, isDown, fullCircle) {
    const pad = 5;
    if (!fullCircle) {
        const lp = fibHorizontalSpanLabelPlacement(style, cx - r, cx + r, pad);
        return {
            x: lp.x,
            y: cy,
            anchor: lp.anchor,
            dominantBaseline: 'middle',
        };
    }
    const pos = normalizeFibLevelsLabelPosition(style);
    if (pos === 'left') {
        return { x: cx - r - pad, y: cy, anchor: 'end', dominantBaseline: 'middle' };
    }
    if (pos === 'center') {
        return { x: cx, y: cy - r - pad, anchor: 'middle', dominantBaseline: 'auto' };
    }
    return { x: cx + r + pad, y: cy, anchor: 'start', dominantBaseline: 'middle' };
}

/** Nudge Fib Arcs labels apart when radii are close (common with Value and Percent text). */
function resolveFibArcLabelCollisions(slots, group, fontSize, fontWeight = '700') {
    if (!Array.isArray(slots) || !slots.length) return [];
    const gap = Math.max(2, fontSize * 0.25);
    const measured = slots.map((slot) => ({
        ...slot,
        block: measureFibLabelTextBlock(group, slot.text, fontSize, fontWeight),
    }));
    const sameRow = measured.length > 1
        && measured.every((s) => Math.abs(s.y - measured[0].y) < fontSize * 0.75);
    if (sameRow) {
        measured.sort((a, b) => a.x - b.x);
        for (let i = 1; i < measured.length; i++) {
            const prev = measured[i - 1];
            const cur = measured[i];
            const minGap = (prev.block.width + cur.block.width) / 2 + gap;
            if (cur.x - prev.x < minGap) cur.x = prev.x + minGap;
        }
        measured.forEach((cur, i) => {
            cur.y = cur.y + (i % 2 === 0 ? -1 : 1) * (fontSize * 0.42);
        });
        return measured;
    }
    measured.sort((a, b) => a.y - b.y);
    for (let i = 1; i < measured.length; i++) {
        const prev = measured[i - 1];
        const cur = measured[i];
        const minGap = (prev.block.height + cur.block.height) / 2 + gap;
        if (cur.y - prev.y < minGap) cur.y = prev.y + minGap;
    }
    return measured;
}

function measureFibLabelTextWidth(group, text, fontSize = 11, fontWeight = '600') {
    if (!group || text == null || `${text}` === '') return 0;
    const temp = group.append('text')
        .attr('font-size', `${fontSize}px`)
        .attr('font-weight', fontWeight)
        .attr('visibility', 'hidden')
        .text(String(text));
    let w = 0;
    try { w = temp.node().getBBox().width; } catch (_) {}
    temp.remove();
    return Number.isFinite(w) && w > 0 ? w : String(text).length * fontSize * 0.55;
}

function measureFibLabelTextBlock(group, text, fontSize = 10, fontWeight = '600') {
    if (!group || text == null || `${text}` === '') return { width: 0, height: fontSize };
    const temp = group.append('text')
        .attr('font-size', `${fontSize}px`)
        .attr('font-weight', fontWeight)
        .attr('visibility', 'hidden')
        .text(String(text));
    let width = 0;
    let height = fontSize;
    try {
        const bbox = temp.node().getBBox();
        width = bbox.width;
        height = bbox.height;
    } catch (_) {}
    temp.remove();
    if (!Number.isFinite(width) || width <= 0) width = String(text).length * fontSize * 0.55;
    if (!Number.isFinite(height) || height <= 0) height = fontSize;
    return { width, height };
}

/** Gap in a horizontal level line when the label sits in the center (TradingView-style). */
function fibHorizontalCenterLabelGap(style, group, labelText, textX, fontSize = 11, fontWeight = '600') {
    if (normalizeFibLevelsLabelPosition(style) !== 'center') return null;
    const w = measureFibLabelTextWidth(group, labelText, fontSize, fontWeight);
    if (!w) return null;
    const pad = Math.max(4, fontSize * 0.35);
    return { left: textX - w / 2 - pad, right: textX + w / 2 + pad };
}

function appendFibHorizontalLineWithCenterGap(group, x1, x2, y, gap, lineAttrs) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const append = (xa, xb) => {
        const left = Math.max(minX, Math.min(xa, xb));
        const right = Math.min(maxX, Math.max(xa, xb));
        if (right - left < 0.5) return;
        const line = group.append('line').attr('x1', left).attr('y1', y).attr('x2', right).attr('y2', y);
        if (lineAttrs) {
            Object.keys(lineAttrs).forEach((key) => {
                const val = lineAttrs[key];
                if (val !== undefined && val !== null) line.attr(key, val);
            });
        }
        line.style('pointer-events', 'stroke');
    };
    if (gap && Number.isFinite(gap.left) && Number.isFinite(gap.right) && gap.left < gap.right) {
        append(minX, gap.left);
        append(gap.right, maxX);
    } else {
        append(minX, maxX);
    }
}

function fibHorizontalLabelBaselineY(style, lineY, offsetBelow = 4) {
    return normalizeFibLevelsLabelPosition(style) === 'center' ? lineY : lineY + offsetBelow;
}

/** Vertical span: top / middle / bottom along [spanMinY, spanMaxY] (maps left/center/right). */
function fibVerticalSpanLabelFontSize(scaleFactor, base = 11) {
    const sf = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
    return Math.max(11, Math.round(base * sf));
}

function fibVerticalSpanLabelPlacement(style, lineX, spanMinY, spanMaxY, fontSize = 11) {
    const pos = normalizeFibLevelsLabelPosition(style);
    const minY = Math.min(spanMinY, spanMaxY);
    const maxY = Math.max(spanMinY, spanMaxY);
    const inset = Math.max(12, Math.round(fontSize * 0.9) + 8);
    if (pos === 'left') {
        return { x: lineX, y: minY + inset, anchor: 'middle', dominantBaseline: 'hanging' };
    }
    if (pos === 'center') {
        return { x: lineX, y: (minY + maxY) / 2, anchor: 'middle', dominantBaseline: 'middle' };
    }
    // Bottom: keep the full label block above the plot edge (time axis clips `dominant-baseline: auto`).
    return {
        x: lineX,
        y: maxY - inset - fontSize * 0.45,
        anchor: 'middle',
        dominantBaseline: 'middle',
    };
}

function applyFibSpanLabelTextStyle(textSel, color, fontSize, fontWeight = '700') {
    textSel
        .attr('fill', color)
        .attr('font-size', `${fontSize}px`)
        .attr('font-weight', fontWeight)
        .attr('stroke', 'rgba(13, 17, 23, 0.9)')
        .attr('stroke-width', Math.max(2.5, fontSize * 0.32))
        .attr('paint-order', 'stroke fill')
        .attr('stroke-linejoin', 'round')
        .style('pointer-events', 'none');
}

/** Gap in a vertical level line when the label sits in the middle. */
function fibVerticalCenterLabelGap(style, group, labelText, labelY, fontSize = 10, fontWeight = '600') {
    if (normalizeFibLevelsLabelPosition(style) !== 'center') return null;
    const block = measureFibLabelTextBlock(group, labelText, fontSize, fontWeight);
    const pad = Math.max(4, fontSize * 0.35);
    return { top: labelY - block.height / 2 - pad, bottom: labelY + block.height / 2 + pad };
}

function appendFibVerticalLineWithCenterGap(group, x, y1, y2, gap, lineAttrs) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const append = (ya, yb) => {
        const top = Math.max(minY, Math.min(ya, yb));
        const bottom = Math.min(maxY, Math.max(ya, yb));
        if (bottom - top < 0.5) return;
        const line = group.append('line').attr('x1', x).attr('y1', top).attr('x2', x).attr('y2', bottom);
        if (lineAttrs) {
            Object.keys(lineAttrs).forEach((key) => {
                const val = lineAttrs[key];
                if (val !== undefined && val !== null) line.attr(key, val);
            });
        }
        line.style('pointer-events', 'stroke');
    };
    if (gap && Number.isFinite(gap.top) && Number.isFinite(gap.bottom) && gap.top < gap.bottom) {
        append(minY, gap.top);
        append(gap.bottom, maxY);
    } else {
        append(minY, maxY);
    }
}

/** Point along segment (x1,y1)→(x2,y2) for ray / axis labels. */
function fibSegmentParamPlacement(style, x1, y1, x2, y2) {
    const pos = normalizeFibLevelsLabelPosition(style);
    const t = pos === 'left' ? 0.15 : pos === 'center' ? 0.5 : 0.85;
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}

function fibPointTextAnchor(style) {
    const pos = normalizeFibLevelsLabelPosition(style);
    if (pos === 'left') return 'start';
    if (pos === 'center') return 'middle';
    return 'end';
}

function drawingTextHasArabicScript(text) {
    return ARABIC_SCRIPT_RE.test(String(text || ''));
}

/** Layout-independent key token from KeyboardEvent.code (Arabic/FR/etc. keep Ctrl+Z on the Z key). */
function physicalShortcutKeyTokenFromEvent(event) {
    const e = event;
    if (!e) return '';
    const code = e.code || '';

    if (code.startsWith('Key') && code.length === 4) {
        return code.slice(3).toLowerCase();
    }
    if (code.startsWith('Digit') && code.length === 6) {
        return code.slice(5);
    }

    if (code === 'Slash' && e.shiftKey) return '?';
    if (code === 'Slash') return '/';
    if (code === 'Equal' && e.shiftKey) return '+';
    if (code === 'Equal') return '=';
    if (code === 'Minus') return '-';
    if (code === 'Period') return '.';
    if (code === 'Comma') return ',';
    if (code === 'NumpadAdd') return '+';
    if (code === 'NumpadSubtract') return '-';

    const codeMap = {
        Space: 'Space',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        ArrowUp: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        Escape: 'Escape',
        Delete: 'Delete',
        Backspace: 'Backspace',
        Enter: 'Enter',
        Tab: 'Tab',
        Home: 'Home',
        End: 'End'
    };
    if (codeMap[code]) return codeMap[code];

    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (typeof key === 'string' && key.length === 1) key = key.toLowerCase();
    return key || '';
}

function isPhysicalShortcutKey(event, keyToken) {
    const want = String(keyToken || '').toLowerCase();
    return physicalShortcutKeyTokenFromEvent(event).toLowerCase() === want;
}

function buildPhysicalShortcutKey(event) {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    const key = physicalShortcutKeyTokenFromEvent(event);
    if (key) parts.push(key);
    return parts.join('+');
}

function resolveDrawingTextStyle(text, fontStyle, fontFamily) {
    const wantsItalic = fontStyle === 'italic';
    const hasArabic = drawingTextHasArabicScript(text);
    if (hasArabic) {
        return {
            fontStyle: wantsItalic ? 'normal' : (fontStyle || 'normal'),
            fontFamily: fontFamily && !/roboto/i.test(fontFamily)
                ? fontFamily
                : DRAWING_TEXT_ARABIC_FONT_FAMILY,
            direction: 'rtl',
            italicSkew: wantsItalic ? DRAWING_TEXT_ITALIC_SKEW_DEG : 0
        };
    }
    return {
        fontStyle: fontStyle || 'normal',
        fontFamily: fontFamily || 'Roboto, sans-serif',
        direction: null,
        italicSkew: 0
    };
}

function buildDrawingTextTransform(x, y, rotation, italicSkew, nudgeX = 0, nudgeY = 0) {
    const rot = Number(rotation) || 0;
    const skew = Number(italicSkew) || 0;
    const nx = Number(nudgeX) || 0;
    const ny = Number(nudgeY) || 0;
    const parts = [];
    if (nx !== 0 || ny !== 0) {
        parts.push(`translate(${nx}, ${ny})`);
    }
    // Skew in local space first, then rotate around anchor — avoids Arabic spike artifacts on line labels.
    if (skew !== 0) {
        parts.push(`translate(${x}, ${y}) skewX(${skew}) translate(${-x}, ${-y})`);
    }
    if (rot !== 0) {
        parts.push(`rotate(${rot}, ${x}, ${y})`);
    }
    return parts.length ? parts.join(' ') : null;
}

/** Gap from stroke to nearest text edge (line tools, rectangle external labels). */
function lineLabelGapFromStroke(fontSize) {
    const fs = Number(fontSize) || 14;
    // ~6–8px at default size; scales gently for larger fonts (was 14+ and felt too loose).
    return 6 + Math.max(0, fs / 2 - 6);
}

function lineLabelBlockHeight(text, fontSize) {
    const fs = Number(fontSize) || 14;
    const lines = String(text || '').split('\n');
    return Math.max(lines.length, 1) * fs * 1.2;
}

/** Measure line-label width with full font style (italic, RTL) for on-line gap sizing. */
function measureLineLabelTextWidth(group, text, options = {}) {
    const label = String(text || '').trim();
    if (!group || !label) return 0;

    const fontSize = Number(options.fontSize) || 14;
    const fontFamily = options.fontFamily || 'Roboto, sans-serif';
    const fontWeight = options.fontWeight || 'normal';
    const fontStyle = options.fontStyle || 'normal';
    const anchor = options.anchor || 'middle';

    const resolved = resolveDrawingTextStyle(label, fontStyle, fontFamily);
    const tempText = group.append('text')
        .attr('font-size', `${fontSize}px`)
        .attr('font-family', resolved.fontFamily)
        .attr('font-weight', fontWeight)
        .attr('font-style', resolved.fontStyle)
        .attr('text-anchor', anchor)
        .style('visibility', 'hidden')
        .style('pointer-events', 'none');

    if (resolved.direction) {
        tempText.style('direction', resolved.direction);
        tempText.attr('unicode-bidi', 'plaintext');
    }
    tempText.text(label);

    let width = 0;
    try {
        width = tempText.node().getBBox().width;
    } catch (_) { /* ignore measure failures */ }
    tempText.remove();
    if (Number.isFinite(width) && width > 0) return width;
    return fontSize * Math.max(label.length, 1) * 0.55;
}

/** Readable label rotation (deg) aligned with line direction. */
function resolveLineLabelReadableAngleDeg(deltaX, deltaY) {
    let angleDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
    return angleDeg;
}

/** Unit normal matching the rotation angle used for line labels. */
function lineLabelPerpFromAngleDeg(angleDeg) {
    const rad = (Number(angleDeg) || 0) * Math.PI / 180;
    return { x: -Math.sin(rad), y: Math.cos(rad) };
}

function resolveLineLabelSide(textVAlign) {
    if (textVAlign === 'top') return 'above';
    if (textVAlign === 'bottom') return 'below';
    return null;
}

/** Unit vector from the stroke toward the label (top/bottom). */
function lineLabelPerpTowardText(textVAlign, perpX, perpY, signUp) {
    if (textVAlign !== 'top' && textVAlign !== 'bottom') return null;
    const sign = textVAlign === 'top' ? 1 : -1;
    let px = perpX * signUp * sign;
    let py = perpY * signUp * sign;
    const len = Math.hypot(px, py) || 1;
    return { x: px / len, y: py / len };
}

/** Horizontal lines: unit vector from stroke toward label. */
function horizontalLineLabelPerp(textVAlign) {
    if (textVAlign === 'top') return { x: 0, y: -1 };
    if (textVAlign === 'bottom') return { x: 0, y: 1 };
    return null;
}

/**
 * Nudge label so the edge nearest the stroke sits exactly `gap` px away.
 * Uses font block height for the perpendicular span — axis-aligned bbox corners
 * grow with label width on rotated/diagonal lines and wrongly push text farther away.
 */
function nudgeLineLabelFromStroke(textEl, lineRef, linePerp, fontSize, text, options = {}) {
    const gap = lineLabelGapFromStroke(fontSize);
    const anchorOnStroke = !!options.anchorOnStroke;
    const node = textEl && typeof textEl.node === 'function' ? textEl.node() : null;
    if (!node || !lineRef || !linePerp) return { nudgeX: 0, nudgeY: 0 };

    let px = linePerp.x;
    let py = linePerp.y;
    const plen = Math.hypot(px, py) || 1;
    px /= plen;
    py /= plen;

    const lx = lineRef.x;
    const ly = lineRef.y;
    const halfPerp = lineLabelBlockHeight(text, fontSize) / 2;

    let centerAlong = 0;
    if (!anchorOnStroke) {
        let bb;
        try { bb = node.getBBox(); } catch (_) { return { nudgeX: 0, nudgeY: 0 }; }
        if (!Number.isFinite(bb.width) && !Number.isFinite(bb.height)) {
            return { nudgeX: 0, nudgeY: 0 };
        }
        const cx = bb.x + bb.width / 2;
        const cy = bb.y + bb.height / 2;
        centerAlong = (cx - lx) * px + (cy - ly) * py;
    }

    const edgeTowardLine = centerAlong - halfPerp;
    if (!Number.isFinite(edgeTowardLine)) return { nudgeX: 0, nudgeY: 0 };

    const adjust = gap - edgeTowardLine;
    if (Math.abs(adjust) < 0.01) return { nudgeX: 0, nudgeY: 0 };
    return { nudgeX: px * adjust, nudgeY: py * adjust };
}

/** @deprecated Use lineRef + linePerp + nudgeLineLabelFromStroke in appendTextLabel. */
function horizontalLineLabelOffsetY(_text, _fontSize, _textVAlign) {
    return 0;
}

/** Flip start/end anchors for RTL so endpoint labels grow along the line. */
function resolveLineEndpointSvgAnchor(which, text) {
    const isRtl = drawingTextHasArabicScript(text);
    if (which === 'left') return isRtl ? 'end' : 'start';
    if (which === 'right') return isRtl ? 'start' : 'end';
    return 'middle';
}

function resolveVerticalLineSvgAnchor(which, text) {
    const isRtl = drawingTextHasArabicScript(text);
    if (which === 'left') return isRtl ? 'start' : 'end';
    if (which === 'right') return isRtl ? 'end' : 'start';
    return 'middle';
}

function resolveRayEndpointSvgAnchor(which, text, lineGoesRight) {
    let anchor = which === 'left'
        ? (lineGoesRight ? 'start' : 'end')
        : (lineGoesRight ? 'end' : 'start');
    if (drawingTextHasArabicScript(text)) {
        anchor = anchor === 'start' ? 'end' : 'start';
    }
    return anchor;
}

function applyLineLabelPerpOffset(baseX, baseY, _perpX, _perpY, _signUp, _textVAlign, _text, _fontSize) {
    return { x: baseX, y: baseY };
}

const AXIS_LABEL_DEFAULT_LINE_TYPES = new Set([
    'trendline',
    'horizontal',
    'vertical',
    'ray',
    'horizontal-ray',
    'extended-line',
    'cross-line',
    'path',
    'curve',
    'double-curve',
    'parallel-channel',
    'regression-trend',
    'flat-top-bottom',
    'disjoint-channel',
    'arrow'
]);

/** Freehand strokes: axis labels only at path endpoints (not every point). */
const FREEHAND_AXIS_LABEL_TYPES = new Set(['brush', 'highlighter']);

/**
 * Only these tools must stay on loaded candle indices (range anchored to data).
 * All other drawing types may use future/past bar padding and skip replay clamp-to-last-bar.
 */
const CANDLE_INDEX_CLAMPED_TYPES = new Set([
    'volume-profile',
    'fixed-range-volume-profile',
]);

/** Box shapes — axis labels only when border, fill, or middle line is visible. */
const SHAPE_BOX_GEOMETRY_TYPES = new Set([
    'rectangle',
    'rotated-rectangle',
    'ellipse',
    'circle',
    'triangle'
]);

/** Shape tools: labels off by default; user may enable via style tab. */
const AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES = new Set([
    'rectangle',
    'rotated-rectangle',
    'ellipse',
    'circle',
    'triangle',
    'arc',
    'polyline',
    'arrow-marker',
    'arrow-mark-up',
    'arrow-mark-down'
]);

/** Line tools that support direct move from stroke hit (plus fib/pattern families). */
const DIRECT_MOVE_LINE_TYPE_SET = new Set([
    'trendline',
    'horizontal',
    'vertical',
    'ray',
    'horizontal-ray',
    'extended-line',
    'cross-line',
    'arrow',
    'arrow-marker',
    'arrow-mark-up',
    'arrow-mark-down',
    'curve',
    'double-curve',
    'polyline',
    'path'
]);

const FIB_LIKE_DRAWING_TYPES_EXACT = new Set(['pitchfork', 'pitchfan']);

const PATTERN_LIKE_DRAWING_TYPES_EXACT = new Set([
    'head-shoulders',
    'three-drives',
    'cyclic-lines',
    'time-cycles',
    'sine-line'
]);

function isFibLikeDrawingType(type) {
    if (!type) return false;
    return type.startsWith('fibonacci-')
        || type.startsWith('fib-')
        || type.startsWith('trend-fib-')
        || FIB_LIKE_DRAWING_TYPES_EXACT.has(type);
}

function isPatternLikeDrawingType(type) {
    if (!type) return false;
    return type.includes('pattern')
        || type.startsWith('elliott-')
        || PATTERN_LIKE_DRAWING_TYPES_EXACT.has(type);
}

function isLineLikeDrawingType(type) {
    return DIRECT_MOVE_LINE_TYPE_SET.has(type)
        || isFibLikeDrawingType(type)
        || isPatternLikeDrawingType(type);
}

function getDrawingStrokeHitTolerances(type) {
    const loose = isFibLikeDrawingType(type) || isPatternLikeDrawingType(type);
    return {
        hitTolerance: loose ? 18 : 12,
        minLineHitTolerance: loose ? 14 : 0,
        lineHitTolerance: loose ? 14 : 8
    };
}

// ============================================================================
// Base Drawing Class
// ============================================================================
class BaseDrawing {
    constructor(type, points = [], style = {}) {
        this.id = generateUUID();
        this.type = type;
        this.points = points; // Array of {x, y} coordinates (x = index, y = price)
        this.style = {
            stroke: style.stroke || style.color || DRAWING_TOOL_DEFAULT_STROKE,
            strokeWidth: style.strokeWidth || 2,
            fill: style.fill !== undefined && style.fill !== null ? style.fill : 'none',
            opacity: style.opacity || 1,
            dashArray: style.dashArray || 'none',
            ...style
        };
        this.selected = false;
        this.visible = true;
        this.text = typeof style.text === 'string' ? style.text : '';
        this.meta = {
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.handles = [];
        this.group = null; // SVG group element
        this.hasAxisHighlightZones = false; // Track whether this drawing currently owns canvas axis zones
        
        // Multi-timeframe support
        this.coordinateSystem = 'timestamp'; // 'timestamp' or 'index' (legacy)
        this.chart = null; // Reference to chart instance (set by manager)
        this.timestampPoints = null; // Store original timestamps permanently (once set, never recalculate)
        
        // Zoom scaling support
        this.baseScale = null; // Store initial scale for zoom-based scaling
    }
    
    /**
     * Calculate zoom scale factor for consistent visual scaling
     * @param {Object} scales - {xScale, yScale} D3 scales
     * @returns {number} Scale factor (1.0 = original scale)
     */
    getZoomScaleFactor(scales) {
        return 1;
    }

    /** Default line endpoints: plain start, arrow at the end (trendline / curve / path). */
    ensureEndpointStyleDefaults() {
        if (this.style.startStyle === undefined || this.style.startStyle === null) {
            this.style.startStyle = 'normal';
        }
        if (this.style.endStyle === undefined || this.style.endStyle === null) {
            this.style.endStyle = 'arrow';
        }
    }

    /**
     * Normalize render() third argument (boolean isPreview legacy or opts object).
     */
    static normalizeRenderOpts(renderOpts) {
        if (renderOpts === true) {
            return { isPreview: true, reuseGroup: false, skipHandles: false };
        }
        if (renderOpts === false || renderOpts == null) {
            return { isPreview: false, reuseGroup: false, skipHandles: false };
        }
        if (typeof renderOpts === 'object') {
            return {
                isPreview: !!renderOpts.isPreview,
                reuseGroup: !!renderOpts.reuseGroup,
                skipHandles: !!renderOpts.skipHandles
            };
        }
        return { isPreview: false, reuseGroup: false, skipHandles: false };
    }

    /** Truthy style flag (boolean, 1, or persisted string "true"). */
    static isStyleFlagOn(style, key) {
        const v = style && style[key];
        return v === true || v === 1
            || (typeof v === 'string' && /^(true|1|yes)$/i.test(String(v).trim()));
    }

    /** Same dash resolution as TrendlineTool (`strokeDasharray ?? dashArray ?? ''`). */
    static resolveStrokeDasharray(style) {
        if (!style) return '';
        const raw = style.strokeDasharray ?? style.dashArray ?? '';
        if (raw === '0' || raw === 'none' || raw == null || raw === '') return '';
        return String(raw);
    }

    _shouldCreateHandles(opts = {}) {
        if (opts.skipHandles) return false;
        const mgr = this.chart && this.chart.drawingManager;
        // In-place patch resize (trendline, ray, …): handles move via updateHandlePositions.
        if (mgr && mgr.isResizing && mgr.resizingDrawing === this
            && typeof mgr._supportsLiveHandleGeometryPatch === 'function'
            && mgr._supportsLiveHandleGeometryPatch(this)) {
            return false;
        }
        return true;
    }

    _isHandleNode(node) {
        let el = node;
        const root = this.group ? this.group.node() : null;
        while (el && el.getAttribute) {
            const cls = el.getAttribute('class') || '';
            if (/resize-handle|custom-handle|resize-handle-group/.test(cls)) return true;
            if (el === root) break;
            el = el.parentNode;
        }
        return false;
    }

    _clearGeometryChildren(group) {
        if (!group || group.empty()) return;
        const nodes = group.selectAll('*').nodes();
        nodes.slice().reverse().forEach((node) => {
            if (!node || this._isHandleNode(node)) return;
            try { node.parentNode && node.parentNode.removeChild(node); } catch (_) {}
        });
    }

    _clearDrawingLabels(scales) {
        const labelsGroup = scales && scales.labelsGroup;
        if (!labelsGroup || labelsGroup.empty()) return;
        try {
            labelsGroup.selectAll(`[data-id="${this.id}"]`).remove();
        } catch (_) {}
    }

    /**
     * Reuse existing SVG group during hot-path redraws (pan/resize) instead of remove+append.
     * @returns {boolean} true when group was reused
     */
    _prepareRenderGroup(container, className, opts = {}) {
        const normalized = BaseDrawing.normalizeRenderOpts(opts);
        const opacity = this.visible ? (this.style.opacity != null ? this.style.opacity : 1) : 0;

        if (normalized.reuseGroup && this.group && !this.group.empty()) {
            const node = this.group.node();
            if (node && node.parentNode) {
                const mgr = this.chart && this.chart.drawingManager;
                const keepDragTransform = mgr
                    && typeof mgr._isDrawingGeometryMoveActive === 'function'
                    && mgr._isDrawingGeometryMoveActive();
                const dragTransform = keepDragTransform ? this.group.attr('transform') : null;
                this._clearGeometryChildren(this.group);
                this.group
                    .attr('class', className)
                    .attr('data-id', this.id)
                    .style('opacity', opacity)
                    .attr('transform', dragTransform || null);
                return true;
            }
        }

        if (this.group) {
            try { this.group.remove(); } catch (_) {}
        }

        this.group = container.append('g')
            .attr('class', className)
            .attr('data-id', this.id)
            .style('opacity', opacity);
        return false;
    }

    /** Drop consecutive duplicate/near-duplicate freehand samples (dense strokes + copy/paste). */
    static sanitizeFreehandPoints(points) {
        if (!Array.isArray(points) || points.length < 2) return points || [];
        const out = [];
        const minDistSq = 1e-10;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (!p || typeof p !== 'object') continue;
            const x = Number(p.x);
            const y = Number(p.price !== undefined ? p.price : p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (out.length > 0) {
                const prev = out[out.length - 1];
                const dx = x - prev.x;
                const dy = y - prev.y;
                if (dx * dx + dy * dy < minDistSq) continue;
            }
            out.push({ x, y });
        }
        if (out.length < 2 && points.length >= 2) {
            const first = points[0];
            const last = points[points.length - 1];
            out.length = 0;
            out.push(
                { x: Number(first.x), y: Number(first.price !== undefined ? first.price : first.y) },
                { x: Number(last.x), y: Number(last.price !== undefined ? last.price : last.y) }
            );
        }
        return out;
    }

    /** Shared arrowhead sizing for trendlines and freehand strokes. */
    static arrowEndpointMetrics(strokeWidth, scaleFactor = 1) {
        const scaledStrokeWidth = Math.max(0.5, Number(strokeWidth || 2) * (scaleFactor || 1));
        const aLen = Math.max(8, scaledStrokeWidth * 5);
        const aHalf = Math.max(4, scaledStrokeWidth * 2.5);
        return { scaledStrokeWidth, aLen, aHalf };
    }

    /** Virtual lead/tail points stabilize Catmull-Rom tangents and prevent endpoint loops. */
    static padPointsForCatmullRom(points, pad = {}) {
        if (!Array.isArray(points) || points.length < 2) return points || [];
        if (points.length === 2) return points;
        const p0 = points[0];
        const p1 = points[1];
        const pn = points[points.length - 1];
        const pn1 = points[points.length - 2];
        const out = [];
        if (pad.skipStartPad !== true) {
            out.push({ x: p0.x - (p1.x - p0.x) * 0.5, y: p0.y - (p1.y - p0.y) * 0.5 });
        }
        out.push(...points);
        if (pad.skipEndPad !== true) {
            out.push({ x: pn.x + (pn.x - pn1.x) * 0.5, y: pn.y + (pn.y - pn1.y) * 0.5 });
        }
        return out;
    }

    static buildFreehandPathData(points, scales, opts = {}) {
        const clean = BaseDrawing.sanitizeFreehandPoints(points);
        const curvePts = BaseDrawing.padPointsForCatmullRom(clean, opts.pad || {});
        const lineGenerator = d3.line()
            .x((d) => (scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(d.x)
                : scales.xScale(d.x)))
            .y((d) => scales.yScale(d.y))
            .curve(d3.curveCatmullRom.alpha(0.5));
        return { pathData: lineGenerator(curvePts), renderPoints: clean };
    }

    /**
     * Freehand path + optional arrow endpoints (ep1/ep2 → startStyle/endStyle).
     * Highlighter does not support endpoints.
     */
    _appendStrokePathWithEndpoints(group, container, pathData, hitWidth) {
        const stroke = this.style.stroke || this.style.color || '#787b86';
        const strokeWidth = this.style.strokeWidth != null ? this.style.strokeWidth : 2;
        const noEndpoints = this.type === 'highlighter';
        const startStyle = noEndpoints ? 'normal' : (this.style.startStyle || 'normal');
        const endStyle = noEndpoints ? 'normal' : (this.style.endStyle || 'normal');
        const pathOpacity = this.style.opacity != null ? this.style.opacity : 1;
        const usePathMarkers = !noEndpoints && this.type !== 'brush' && this.type !== 'path';

        if (usePathMarkers && (startStyle === 'arrow' || endStyle === 'arrow')) {
            const svgRoot = container && container.node && container.node().ownerSVGElement
                ? d3.select(container.node().ownerSVGElement)
                : null;
            if (svgRoot && typeof SVGHelpers !== 'undefined') {
                if (startStyle === 'arrow') {
                    SVGHelpers.createArrowMarker(svgRoot, `arrow-start-${this.id}`, stroke);
                }
                if (endStyle === 'arrow') {
                    SVGHelpers.createArrowMarker(svgRoot, `arrow-end-${this.id}`, stroke);
                }
            }
        }

        group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, hitWidth || strokeWidth * 5))
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const path = group.append('path')
            .attr('d', pathData)
            .attr('stroke', stroke)
            .attr('stroke-width', strokeWidth)
            .attr('stroke-dasharray', null)
            .attr('fill', 'none')
            .attr('opacity', pathOpacity)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        if (usePathMarkers && startStyle === 'arrow') {
            path.attr('marker-start', `url(#arrow-start-${this.id})`);
        }
        if (usePathMarkers && endStyle === 'arrow') {
            path.attr('marker-end', `url(#arrow-end-${this.id})`);
        }
        return path;
    }

    /** Draw arrow polygons at freehand path ends (avoids SVG marker bowties on curved paths). */
    _drawFreehandEndpointArrows(group, scales, visiblePath) {
        if (!group || group.empty() || !scales || !Array.isArray(this.points) || this.points.length < 2) return;
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        if (startStyle !== 'arrow' && endStyle !== 'arrow') return;

        const toPx = (p) => {
            const x = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p.x)
                : scales.xScale(p.x);
            const y = scales.yScale(p.y);
            return { x, y };
        };

        const stroke = this.style.stroke || this.style.color || '#787b86';
        const strokeWidth = this.style.strokeWidth != null ? this.style.strokeWidth : 2;
        const { aLen, aHalf, scaledStrokeWidth } = BaseDrawing.arrowEndpointMetrics(strokeWidth, 1);

        const drawArrow = (tipX, tipY, fromX, fromY, className) => {
            const adx = tipX - fromX;
            const ady = tipY - fromY;
            const alen = Math.sqrt(adx * adx + ady * ady);
            if (!Number.isFinite(alen) || alen < 0.5) return;
            const ux = adx / alen;
            const uy = ady / alen;
            const bx = tipX - ux * aLen;
            const by = tipY - uy * aLen;
            const points = `${tipX},${tipY} ${bx - uy * aHalf},${by + ux * aHalf} ${bx + uy * aHalf},${by - ux * aHalf}`;
            group.selectAll(`polygon.${className}`).remove();
            group.append('polygon')
                .attr('class', className)
                .attr('points', points)
                .attr('fill', stroke)
                .style('pointer-events', 'none');
        };

        let pathNode = visiblePath && visiblePath.node ? visiblePath.node() : null;
        if (!pathNode && group.select) {
            const paths = group.selectAll('path');
            paths.each(function eachPath() {
                if (pathNode) return;
                const sel = d3.select(this);
                if (sel.attr('stroke') !== 'transparent') pathNode = this;
            });
        }

        const sampleAlongPath = (atStart) => {
            if (!pathNode || typeof pathNode.getTotalLength !== 'function') return null;
            const len = pathNode.getTotalLength();
            if (!Number.isFinite(len) || len < 1) return null;
            const step = Math.min(Math.max(6, scaledStrokeWidth * 3), len * 0.15);
            const tip = atStart ? pathNode.getPointAtLength(0) : pathNode.getPointAtLength(len);
            const from = atStart
                ? pathNode.getPointAtLength(Math.min(step, len * 0.5))
                : pathNode.getPointAtLength(Math.max(0, len - step));
            if (![tip.x, tip.y, from.x, from.y].every(Number.isFinite)) return null;
            return { tip, from };
        };

        if (startStyle === 'arrow') {
            const along = sampleAlongPath(true);
            if (along) {
                drawArrow(along.tip.x, along.tip.y, along.from.x, along.from.y, 'freehand-arrow-start');
            } else {
                const tip = toPx(this.points[0]);
                const from = toPx(this.points[Math.min(1, this.points.length - 1)]);
                if ([tip.x, tip.y, from.x, from.y].every(Number.isFinite)) {
                    drawArrow(tip.x, tip.y, from.x, from.y, 'freehand-arrow-start');
                }
            }
        }
        if (endStyle === 'arrow') {
            const along = sampleAlongPath(false);
            if (along) {
                drawArrow(along.tip.x, along.tip.y, along.from.x, along.from.y, 'freehand-arrow-end');
            } else {
                const tip = toPx(this.points[this.points.length - 1]);
                const from = toPx(this.points[Math.max(0, this.points.length - 2)]);
                if ([tip.x, tip.y, from.x, from.y].every(Number.isFinite)) {
                    drawArrow(tip.x, tip.y, from.x, from.y, 'freehand-arrow-end');
                }
            }
        }
    }

    /** Hide path stroke under polygon arrowheads (keeps hit path full length). */
    _trimFreehandPathForArrows(visiblePath, startStyle, endStyle, aLen) {
        if (!visiblePath || visiblePath.empty()) return;
        const pathNode = visiblePath.node ? visiblePath.node() : null;
        if (!pathNode || typeof pathNode.getTotalLength !== 'function') return;
        const len = pathNode.getTotalLength();
        if (!Number.isFinite(len) || len < 1) {
            visiblePath.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
            return;
        }
        const startTrim = startStyle === 'arrow' ? aLen : 0;
        const endTrim = endStyle === 'arrow' ? aLen : 0;
        const drawLen = Math.max(0, len - startTrim - endTrim);
        if (startTrim <= 0 && endTrim <= 0) {
            visiblePath.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
            return;
        }
        visiblePath
            .attr('stroke-dasharray', `${drawLen} ${startTrim + endTrim + len}`)
            .attr('stroke-dashoffset', startTrim > 0 ? startTrim : null);
    }

    /**
     * Pan/zoom hot path: update existing SVG geometry in place (no DOM teardown).
     * Subclasses return true when geometry was patched successfully.
     */
    patchPanZoomGeometry(scales) {
        return false;
    }

    /**
     * Live resize-handle drag: patch stroke + handles in one synchronous pass (no SVG rebuild).
     * @returns {boolean} true when geometry and handles were updated in place
     */
    patchLiveHandleResize(scales, pointIndex) {
        let patched = false;
        if (typeof this.patchLiveAnchorGeometry === 'function' && this.patchLiveAnchorGeometry(scales)) {
            patched = true;
        } else if (typeof this._patchLiveTwoPointGeometry === 'function' && this._patchLiveTwoPointGeometry(scales, pointIndex)) {
            patched = true;
        } else if (typeof this.patchPanZoomGeometry === 'function' && this.patchPanZoomGeometry(scales)) {
            patched = true;
        }
        if (patched) {
            this._pruneDuplicateResizeHandles();
            if (typeof this.updateHandlePositions === 'function') {
                this.updateHandlePositions(scales);
            }
            this._patchLiveInlinePriceLabel(scales);
        }
        return patched;
    }

    /** Move the optional on-chart price badge during live handle resize (no full SVG rebuild). */
    _patchLiveInlinePriceLabel(scales) {
        if (this.style?.showPriceLabel === false) return;
        if (!this.group || this.group.empty() || !scales?.yScale || !scales?.xScale) return;
        const labelGroup = this.group.select('.price-label');
        if (labelGroup.empty()) return;
        const point = this.points?.[0];
        if (!point || !Number.isFinite(point.y)) return;
        const y = scales.yScale(point.y);
        if (!Number.isFinite(y)) return;
        const chart = scales.chart || this.chart;
        let decimals = 5;
        if (chart && typeof chart.getPriceDecimals === 'function') {
            const dom = chart.yScale?.domain?.();
            const range = Array.isArray(dom) && dom.length === 2 ? Math.abs(dom[1] - dom[0]) : 0;
            const d = chart.getPriceDecimals(range);
            if (Number.isFinite(d) && d >= 0) decimals = d;
        }
        const formattedPrice = point.y.toFixed(decimals);
        const xRange = scales.xScale.range();
        const labelX = xRange[1] - 5;
        const texts = labelGroup.selectAll('text');
        texts.attr('y', y);
        const textNode = texts.node();
        if (!textNode) return;
        texts.text(formattedPrice);
        const bbox = textNode.getBBox();
        const padding = 6;
        const rectWidth = bbox.width + padding * 2;
        const rectHeight = 20;
        labelGroup.select('rect')
            .attr('x', labelX - rectWidth)
            .attr('y', y - rectHeight / 2)
            .attr('width', rectWidth);
        texts.attr('x', labelX - rectWidth / 2);
    }

    /** Remove bare `.resize-handle` / hit circles (horizontal line, vertical line, …). */
    _clearDirectResizeHandles() {
        if (!this.group || this.group.empty()) return;
        this.group.selectAll('.resize-handle, .resize-handle-hit').remove();
    }

    _pruneDuplicateGroupHandles() {
        if (!this.group || this.group.empty()) return;
        const seen = new Set();
        this.group.selectAll('.resize-handle-group').nodes().slice().reverse().forEach((node) => {
            if (!node || !node.getAttribute) return;
            const key = node.getAttribute('data-point-index');
            const normalized = key != null ? String(key) : '?';
            if (seen.has(normalized)) {
                try { node.remove(); } catch (_) {}
            } else {
                seen.add(normalized);
            }
        });
    }

    _pruneDuplicateResizeHandles() {
        const points = this.virtualPoints || this.points;
        const count = Array.isArray(points) ? points.length : 1;
        for (let i = 0; i < Math.max(1, count); i++) {
            this._pruneDuplicateDirectHandles(i);
        }
        this._pruneDuplicateGroupHandles();
    }

    static fibIndexToPixel(scales, xIdx) {
        if (!scales || !Number.isFinite(xIdx)) return NaN;
        return scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(xIdx)
            : scales.xScale(xIdx);
    }

    static fibPriceToPixel(scales, price) {
        if (!scales || !Number.isFinite(price)) return NaN;
        return scales.yScale(price);
    }

    /** extendLeft / extendRight with legacy `extendLines` (= both) compatibility. */
    static resolveFibExtendFlags(style) {
        const s = style || {};
        const legacyBoth = !!s.extendLines;
        const extendLeft = s.extendLeft === true || legacyBoth;
        const extendRight = s.extendRight === true || legacyBoth;
        return { extendLeft, extendRight, anyExtend: extendLeft || extendRight };
    }

    /** Horizontal fib level span in pixel x (retracement / extension legs). */
    static computeFibHorizontalSpanPx(style, xRange, x1, x2, minWidth = 50) {
        const { extendLeft, extendRight } = BaseDrawing.resolveFibExtendFlags(style);
        let fibX1;
        let fibX2;
        if (extendLeft || extendRight) {
            fibX1 = extendLeft ? xRange[0] : Math.min(x1, x2);
            fibX2 = extendRight ? xRange[1] : Math.max(x1, x2);
        } else {
            fibX1 = Math.min(x1, x2);
            fibX2 = Math.max(x1, x2);
        }
        let fibWidth = Math.abs(fibX2 - fibX1);
        if (!extendLeft && !extendRight && fibWidth < minWidth) {
            const centerX = (x1 + x2) / 2;
            fibX1 = centerX - minWidth;
            fibX2 = centerX + minWidth;
            fibWidth = minWidth * 2;
        }
        return { fibX1, fibX2, fibWidth };
    }

    static computeTwoPointHorizontalFibLayout(tool, scales) {
        if (!tool || !scales || !Array.isArray(tool.points) || tool.points.length < 2) return null;
        const p1 = tool.points[0];
        const p2 = tool.points[1];
        if (!p1 || !p2) return null;

        const x1 = BaseDrawing.fibIndexToPixel(scales, p1.x);
        const y1 = BaseDrawing.fibPriceToPixel(scales, p1.y);
        const x2 = BaseDrawing.fibIndexToPixel(scales, p2.x);
        const y2 = BaseDrawing.fibPriceToPixel(scales, p2.y);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

        const xRange = scales.xScale.range();
        const { fibX1, fibX2, fibWidth } = BaseDrawing.computeFibHorizontalSpanPx(
            tool.style, xRange, x1, x2,
        );

        const priceDiff = p2.y - p1.y;
        const reverse = !!(tool.style && tool.style.reverse);
        const getPriceAtLevel = (levelValue) => {
            if (!reverse) return p1.y + (priceDiff * levelValue);
            return p1.y + (priceDiff * (1 - levelValue));
        };

        const levels = [];
        (tool.levels || []).forEach((level, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(level)) return;
            const priceAtLevel = getPriceAtLevel(level.value);
            const yAtLevel = BaseDrawing.fibPriceToPixel(scales, priceAtLevel);
            if (!Number.isFinite(yAtLevel)) return;
            levels.push({ idx, value: level.value, y: yAtLevel });
        });

        const zoneBands = BaseDrawing.buildFibHorizontalZoneBands(
            tool.levels,
            getPriceAtLevel,
            scales.yScale
        );

        return { x1, y1, x2, y2, fibX1, fibX2, fibWidth, levels, zoneBands };
    }

    /**
     * Horizontal fib zone fills: pair adjacent levels by on-screen Y (not array order).
     * Avoids a single band spanning 0→1 when levels are listed 0, 1, 0.236, …
     */
    static buildFibHorizontalZoneBands(levels, getPriceAtLevel, yScale) {
        if (!levels || !levels.length || typeof getPriceAtLevel !== 'function' || !yScale) return [];
        const rows = [];
        levels.forEach((level) => {
            if (!level || level.visible === false) return;
            const price = getPriceAtLevel(level.value);
            const y = yScale(price);
            if (!Number.isFinite(y) || !Number.isFinite(price)) return;
            rows.push({
                zoneKey: level.value,
                y,
                color: level.color || '#787b86',
            });
        });
        rows.sort((a, b) => a.y - b.y);
        const bands = [];
        for (let i = 0; i < rows.length - 1; i++) {
            bands.push({
                zoneKey: rows[i].zoneKey,
                y1: rows[i].y,
                y2: rows[i + 1].y,
                color: rows[i].color,
            });
        }
        return bands;
    }

    /** Fib channel geometry in data space (stable under non-uniform x/y zoom). */
    static computeFibChannelGeometry(tool, scales) {
        if (!tool || !scales || !Array.isArray(tool.points) || tool.points.length < 3) return null;
        const p1 = tool.points[0];
        const p2 = tool.points[1];
        const p3 = tool.points[2];
        if (!p1 || !p2 || !p3) return null;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (!len) return null;

        const nx = -dy / len;
        const ny = dx / len;
        const channelOffset = (p3.x - p1.x) * nx + (p3.y - p1.y) * ny;
        const reverse = !!(tool.style && tool.style.reverse);
        const { extendLeft, extendRight, anyExtend } = BaseDrawing.resolveFibExtendFlags(tool.style);
        const xRange = scales.xScale.range();

        const toPx = (dp) => ({
            x: BaseDrawing.fibIndexToPixel(scales, dp.x),
            y: BaseDrawing.fibPriceToPixel(scales, dp.y)
        });

        const getSegment = (dA, dB) => {
            const a = toPx(dA);
            const b = toPx(dB);
            if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
            if (!anyExtend) return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            const xMin = Math.min(xRange[0], xRange[1]);
            const xMax = Math.max(xRange[0], xRange[1]);
            const dx2 = b.x - a.x;
            if (Math.abs(dx2) < 1e-6) return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            const m = (b.y - a.y) / dx2;
            const yAt = (x) => a.y + m * (x - a.x);
            const leftAnchorX = Math.min(a.x, b.x);
            const rightAnchorX = Math.max(a.x, b.x);
            const segX1 = extendLeft ? xMin : leftAnchorX;
            const segX2 = extendRight ? xMax : rightAnchorX;
            return { x1: segX1, y1: yAt(segX1), x2: segX2, y2: yAt(segX2) };
        };

        const offsetPoint = (dp, mult) => ({
            x: dp.x + nx * channelOffset * mult,
            y: dp.y + ny * channelOffset * mult
        });

        return { channelOffset, reverse, getSegment, offsetPoint, p1, p2, p3, toPx, nx, ny };
    }

    static fibLevelRowVisible(level) {
        if (!level) return false;
        if (level.visible === false) return false;
        if (level.enabled === false) return false;
        return true;
    }

    /** Value / Percent / Value+Percent label text for fib family tools (never price unless `showPrices === true`). */
    static formatFibLevelLabel(style, value, options = {}) {
        const {
            price,
            priceDecimals = 2,
            label,
            valueFormatter,
        } = options;
        const rawMode = style.levelsLabelMode;
        const levelsLabelMode = (rawMode === 'percent' || rawMode === 'values' || rawMode === 'both')
            ? rawMode
            : 'values';
        const showPrices = style.showPrices === true;

        const formatValueText = () => {
            if (typeof valueFormatter === 'function') return valueFormatter(value);
            if (label != null && label !== '') return String(label);
            const n = parseFloat(value);
            if (!Number.isFinite(n)) return String(value);
            return (Math.round(n * 1000) / 1000).toString();
        };

        const formatPercentText = () => {
            const n = parseFloat(value);
            if (!Number.isFinite(n)) return '';
            const pct = n * 100;
            const pctText = (Math.round(pct * 100) / 100).toString();
            return `${pctText}%`;
        };

        if (levelsLabelMode === 'percent') {
            return formatPercentText();
        }

        let base = formatValueText();

        if (levelsLabelMode === 'both') {
            const pct = formatPercentText();
            if (pct) base = `${base} (${pct})`;
        }

        if (showPrices && price != null && Number.isFinite(Number(price))) {
            const dec = Number.isFinite(priceDecimals) ? priceDecimals : 2;
            return `${base} (${Number(price).toFixed(dec)})`;
        }
        return base;
    }

    static patchTwoPointHorizontalFib(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('line[data-fib-idx]').node()) return false;

        const layout = BaseDrawing.computeTwoPointHorizontalFibLayout(tool, scales);
        if (!layout) return false;

        const { x1, y1, x2, y2, fibX1, fibX2, fibWidth, levels, zoneBands } = layout;
        const group = tool.group;
        const trend = group.select('.fib-trend-line');
        if (!trend.empty()) {
            trend.attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
        }

        (zoneBands || []).forEach((band) => {
            const key = `${band.zoneKey}`;
            group.selectAll(`rect[data-fib-zone="${key}"]`)
                .attr('x', fibX1)
                .attr('y', Math.min(band.y1, band.y2))
                .attr('width', fibWidth)
                .attr('height', Math.abs(band.y2 - band.y1));
        });

        levels.forEach(({ idx, y }) => {
            group.selectAll(`line[data-fib-idx="${idx}"]`)
                .attr('x1', fibX1)
                .attr('y1', y)
                .attr('x2', fibX2)
                .attr('y2', y);
            group.selectAll(`text[data-fib-label-idx="${idx}"]`)
                .attr('y', y + 4);
        });

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    static patchFibTimeZone(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('.fib-tz-vertical').node()) return false;
        if (!Array.isArray(tool.points) || tool.points.length < 2) return false;

        const xIndex1 = tool.points[0].x;
        const xIndex2 = tool.points[1].x;
        const baseDx = xIndex2 - xIndex1;
        if (!baseDx) return false;

        const x1 = BaseDrawing.fibIndexToPixel(scales, xIndex1);
        const y1 = BaseDrawing.fibPriceToPixel(scales, tool.points[0].y);
        const x2 = BaseDrawing.fibIndexToPixel(scales, xIndex2);
        const y2 = BaseDrawing.fibPriceToPixel(scales, tool.points[1].y);
        const { plotTop, plotBottom } = fibChartPlotVerticalSpan(scales);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return false;

        const group = tool.group;
        group.select('.fib-tz-anchor')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2);

        group.selectAll('.fib-tz-vertical').each(function () {
            const fibN = parseFloat(d3.select(this).attr('data-fib-tz'));
            if (!Number.isFinite(fibN)) return;
            const xIndex = xIndex1 + (baseDx * fibN);
            const x = BaseDrawing.fibIndexToPixel(scales, xIndex);
            if (!Number.isFinite(x)) return;
            d3.select(this)
                .attr('x1', x).attr('y1', plotTop)
                .attr('x2', x).attr('y2', plotBottom);
        });

        group.selectAll('.fib-tz-label').each(function () {
            const fibN = parseFloat(d3.select(this).attr('data-fib-tz'));
            if (!Number.isFinite(fibN)) return;
            const xIndex = xIndex1 + (baseDx * fibN);
            const x = BaseDrawing.fibIndexToPixel(scales, xIndex);
            if (!Number.isFinite(x)) return;
            const label = d3.select(this);
            const fsRaw = parseFloat(String(label.attr('font-size') || '').replace('px', ''));
            const fontSize = Number.isFinite(fsRaw) && fsRaw > 0 ? fsRaw : 11;
            const lp = fibVerticalSpanLabelPlacement(tool.style, x, plotTop, plotBottom, fontSize);
            label.attr('x', lp.x);
            label.attr('y', lp.y);
            label.attr('text-anchor', lp.anchor || 'middle');
            if (lp.dominantBaseline) label.attr('dominant-baseline', lp.dominantBaseline);
            else label.attr('dominant-baseline', null);
        });

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    static patchFibChannel(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('line[data-fib-channel-idx]').node()) return false;
        if (!Array.isArray(tool.points) || tool.points.length < 3) return false;

        const geom = BaseDrawing.computeFibChannelGeometry(tool, scales);
        if (!geom) return false;

        const { reverse, getSegment, offsetPoint, p1, p2 } = geom;
        const group = tool.group;

        (tool.levels || []).forEach((levelObj, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            if (level == null || isNaN(parseFloat(level))) return;
            const lvl = parseFloat(level);
            const actualLevel = reverse ? (1 - lvl) : lvl;
            const seg = getSegment(offsetPoint(p1, actualLevel), offsetPoint(p2, actualLevel));
            if (!seg) return;
            group.selectAll(`line[data-fib-channel-idx="${idx}"]`)
                .attr('x1', seg.x1).attr('y1', seg.y1)
                .attr('x2', seg.x2).attr('y2', seg.y2);
            group.selectAll(`text[data-fib-channel-label-idx="${idx}"]`)
                .attr('x', seg.x2 + 5).attr('y', seg.y2 + 4);
        });

        if (tool.style.showZones) {
            const zoneLevels = (tool.levels || [])
                .map((l) => {
                    const rawValue = typeof l === 'object' ? l.value : l;
                    const enabled = typeof l === 'object' ? l.enabled !== false : true;
                    const color = typeof l === 'object' ? (l.color || tool.style.stroke) : tool.style.stroke;
                    const value = parseFloat(rawValue);
                    const actual = reverse ? (1 - value) : value;
                    return { value, actual, enabled, color };
                })
                .filter((l) => l.enabled && l.value != null && Number.isFinite(l.value) && Number.isFinite(l.actual))
                .sort((a, b) => a.actual - b.actual);

            group.selectAll('path[data-fib-zone-idx]').each(function () {
                const idx = parseInt(d3.select(this).attr('data-fib-zone-idx'), 10);
                if (!Number.isFinite(idx) || idx < 0 || idx >= zoneLevels.length - 1) return;
                const aV1 = zoneLevels[idx].actual;
                const aV2 = zoneLevels[idx + 1].actual;
                const a1 = getSegment(offsetPoint(p1, aV1), offsetPoint(p2, aV1));
                const a2 = getSegment(offsetPoint(p1, aV2), offsetPoint(p2, aV2));
                if (!a1 || !a2) return;
                d3.select(this).attr('d', `M ${a1.x1},${a1.y1} L ${a1.x2},${a1.y2} L ${a2.x2},${a2.y2} L ${a2.x1},${a2.y1} Z`);
            });
        }

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    /** Fib Wedge geometry in pixel space (3-point sector + ratio arcs). */
    static computeFibWedgeLayout(tool, scales) {
        if (!tool || !scales || !Array.isArray(tool.points) || tool.points.length < 3) return null;

        const getX = (p) => BaseDrawing.fibIndexToPixel(scales, p.x);
        const getY = (p) => BaseDrawing.fibPriceToPixel(scales, p.y);

        const x1 = getX(tool.points[0]);
        const y1 = getY(tool.points[0]);
        const x2 = getX(tool.points[1]);
        const y2 = getY(tool.points[1]);
        const x3 = getX(tool.points[2]);
        const y3 = getY(tool.points[2]);
        if (![x1, y1, x2, y2, x3, y3].every(Number.isFinite)) return null;

        const baseRadius = Math.hypot(x2 - x1, y2 - y1);
        if (!baseRadius || !Number.isFinite(baseRadius)) return null;

        const a1 = Math.atan2(y2 - y1, x2 - x1);
        const a2 = Math.atan2(y3 - y1, x3 - x1);
        const twoPi = Math.PI * 2;
        const deltaCW = (a2 - a1 + twoPi) % twoPi;
        const deltaCCW = (a1 - a2 + twoPi) % twoPi;
        const sweepFlag = (deltaCW <= deltaCCW) ? 1 : 0;
        const delta = (sweepFlag === 1) ? deltaCW : deltaCCW;
        const largeArcFlag = delta > Math.PI ? 1 : 0;
        const innerSweepFlag = sweepFlag === 1 ? 0 : 1;
        const midAngle = sweepFlag === 1 ? (a1 + delta / 2) : (a1 - delta / 2);

        const polar = (ang, r) => ({ x: x1 + Math.cos(ang) * r, y: y1 + Math.sin(ang) * r });
        const p2 = polar(a1, baseRadius);
        const p3 = polar(a2, baseRadius);

        const wedgeArcD = (r) => {
            const start = polar(a1, r);
            const end = polar(a2, r);
            return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
        };

        const wedgeZoneD = (r, prevR) => {
            const outerStart = polar(a1, r);
            const outerEnd = polar(a2, r);
            let d = `M ${outerStart.x} ${outerStart.y} ` +
                `A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${outerEnd.x} ${outerEnd.y} `;
            if (prevR > 0) {
                const innerEnd = polar(a2, prevR);
                const innerStart = polar(a1, prevR);
                d += `L ${innerEnd.x} ${innerEnd.y} ` +
                    `A ${prevR} ${prevR} 0 ${largeArcFlag} ${innerSweepFlag} ${innerStart.x} ${innerStart.y} Z`;
            } else {
                d += `L ${x1} ${y1} Z`;
            }
            return d;
        };

        const levelsSource = Array.isArray(tool.levels) && tool.levels.length
            ? tool.levels
            : (Array.isArray(tool.style?.levels) ? tool.style.levels : []);

        const levels = [];
        levelsSource.forEach((levelObj, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const lvl = parseFloat(level);
            if (!Number.isFinite(lvl)) return;
            const r = baseRadius * lvl;
            if (!Number.isFinite(r) || r <= 0) return;
            const color = typeof levelObj === 'object' ? levelObj.color : tool.style.stroke;
            levels.push({ idx, value: lvl, r, color: color || tool.style.stroke });
        });

        const zones = [];
        const sorted = levels.slice().sort((a, b) => a.r - b.r);
        let prevR = 0;
        sorted.forEach((lvl, zoneIdx) => {
            zones.push({ zoneIdx, r: lvl.r, prevR, color: lvl.color });
            prevR = lvl.r;
        });

        const levelOneEnabled = levelsSource.some((levelObj) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return false;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            return Math.abs(parseFloat(level) - 1) < 1e-6;
        });

        return {
            x1, y1, x2, y2, p2, p3, baseRadius,
            a1, a2, sweepFlag, delta, largeArcFlag, innerSweepFlag, midAngle,
            polar, wedgeArcD, wedgeZoneD, levels, zones, levelOneEnabled,
            bodyPath: `M ${p2.x} ${p2.y} A ${baseRadius} ${baseRadius} 0 ${largeArcFlag} ${sweepFlag} ${p3.x} ${p3.y} L ${x1} ${y1} Z`,
            outerBoundaryD: `M ${p2.x} ${p2.y} A ${baseRadius} ${baseRadius} 0 ${largeArcFlag} ${sweepFlag} ${p3.x} ${p3.y}`,
        };
    }

    static patchFibWedge(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('path[data-fib-wedge-idx]').node()) return false;

        const layout = BaseDrawing.computeFibWedgeLayout(tool, scales);
        if (!layout) return false;

        const {
            x1, y1, x2, y2, p3, zones, polar, wedgeArcD, wedgeZoneD, midAngle,
            bodyPath, outerBoundaryD, levelOneEnabled, baseRadius,
        } = layout;
        const group = tool.group;
        const pos = normalizeFibLevelsLabelPosition(tool.style);
        const labelT = pos === 'left' ? 0.35 : pos === 'center' ? 0.65 : 0.92;
        const showLevelValues = tool.style.levelsEnabled !== false;

        group.selectAll('.fib-wedge-trend-hit, .fib-wedge-trend')
            .each(function () {
                const sel = d3.select(this);
                const isSecond = sel.attr('data-wedge-ray') === '2';
                if (isSecond) {
                    sel.attr('x1', x1).attr('y1', y1).attr('x2', p3.x).attr('y2', p3.y);
                } else {
                    sel.attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
                }
            });

        group.select('.fib-wedge-hitbox').attr('d', bodyPath);

        if (tool.style.showZones !== false) {
            group.selectAll('path[data-fib-wedge-zone-idx]').each(function () {
                const zoneIdx = parseInt(d3.select(this).attr('data-fib-wedge-zone-idx'), 10);
                if (!Number.isFinite(zoneIdx) || zoneIdx < 0 || zoneIdx >= zones.length) return;
                const z = zones[zoneIdx];
                d3.select(this).attr('d', wedgeZoneD(z.r, z.prevR));
            });
        }

        const levelsSource = Array.isArray(tool.levels) && tool.levels.length
            ? tool.levels
            : (Array.isArray(tool.style?.levels) ? tool.style.levels : []);

        levelsSource.forEach((levelObj, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const lvl = parseFloat(level);
            if (!Number.isFinite(lvl)) return;
            const r = baseRadius * lvl;
            if (!Number.isFinite(r) || r <= 0) return;
            const arcD = wedgeArcD(r);
            group.selectAll(`path[data-fib-wedge-idx="${idx}"]`).attr('d', arcD);
            if (showLevelValues) {
                const labelR = Math.max(0, r * labelT);
                const lp = polar(midAngle, labelR);
                group.selectAll(`text[data-fib-wedge-label-idx="${idx}"]`)
                    .attr('x', lp.x)
                    .attr('y', lp.y)
                    .text(String(lvl));
            }
        });

        if (zones.length > 0 && !levelOneEnabled) {
            group.select('path[data-fib-wedge-boundary="1"]').attr('d', outerBoundaryD);
        }

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    /**
     * Patch resize-handle positions without recreating handle DOM (hot path).
     */
    updateHandlePositions(scales) {
        if (!this.group || this.group.empty() || !scales) return;
        const pointsToRender = this.virtualPoints || this.points;
        if (!Array.isArray(pointsToRender)) return;

        pointsToRender.forEach((point, index) => {
            if (!point) return;
            const cx = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(point.x)
                : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
            this._pruneDuplicateDirectHandles(index);
            this.group.selectAll(`.resize-handle-group[data-point-index="${index}"] circle`)
                .attr('cx', cx)
                .attr('cy', cy);
        });
        this._pruneDuplicateGroupHandles();
    }

    /** Tools that append bare `.resize-handle` circles (not resize-handle-group). */
    _pruneDuplicateDirectHandles(pointIndex = 0) {
        if (!this.group || this.group.empty()) return;
        ['resize-handle', 'resize-handle-hit'].forEach((cls) => {
            const nodes = this.group.selectAll(`circle.${cls}[data-point-index="${pointIndex}"]`).nodes();
            if (nodes.length > 1) {
                nodes.slice(1).forEach((node) => {
                    try { node.remove(); } catch (_) {}
                });
            }
        });
    }

    /**
     * @param {Object} [screenPos] - Optional { cx, cy } when handle is not at the data anchor (e.g. horizontal line center).
     */
    syncDirectPointHandleDom(scales, pointIndex = 0, screenPos = null) {
        if (!this.group || this.group.empty() || !scales) return;
        let cx;
        let cy;
        if (screenPos && Number.isFinite(screenPos.cx) && Number.isFinite(screenPos.cy)) {
            cx = screenPos.cx;
            cy = screenPos.cy;
        } else {
            const points = this.virtualPoints || this.points;
            const point = points && points[pointIndex];
            if (!point) return;
            cx = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(point.x)
                : scales.xScale(point.x);
            cy = scales.yScale(point.y);
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        this._pruneDuplicateDirectHandles(pointIndex);
        this.group.selectAll(
            `circle.resize-handle[data-point-index="${pointIndex}"], circle.resize-handle-hit[data-point-index="${pointIndex}"]`
        )
            .attr('cx', cx)
            .attr('cy', cy);
    }

    /**
     * Render the drawing to SVG
     * @param {d3.Selection} container - D3 selection of the drawings container
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Update drawing position/size based on new points
     * @param {Array} points - New points array
     */
    update(points) {
        this.points = points;
        this.meta.updatedAt = Date.now();
        // Recalculate timestamps from new indices
        this.recalculateTimestamps();
    }
    
    /**
     * Recalculate timestamps from current indices
     * Called after moving or resizing a drawing
     * Supports extrapolation for areas without data (replay mode)
     */
    recalculateTimestamps() {
        if (this.chart && this.chart.data && this.chart.data.length > 0) {
            const timeframe = this.chart.currentTimeframe || null;
            this.timestampPoints = this.points.map(p => {
                // Use CoordinateUtils for extrapolation support with correct timeframe
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
        }
    }

    /**
     * Update optional text label if supported by the drawing
     * @param {string} text
     */
    setText(text) {
        this.text = typeof text === 'string' ? text : '';
        this.meta.updatedAt = Date.now();
    }

    isAxisLabelDefaultEnabled() {
        if (AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES.has(this.type)) return false;
        if (FREEHAND_AXIS_LABEL_TYPES.has(this.type)) return false;
        return AXIS_LABEL_DEFAULT_LINE_TYPES.has(this.type);
    }

    isAxisLabelEnabled(labelType) {
        if (typeof this.hasVisibleDrawingGeometry === 'function' && !this.hasVisibleDrawingGeometry()) {
            return false;
        }

        const prop = labelType === 'time' ? 'showTimeLabel' : 'showPriceLabel';
        const explicitValue = this.style ? this.style[prop] : undefined;

        if (explicitValue === true) return true;
        if (explicitValue === false) return false;

        return this.isAxisLabelDefaultEnabled();
    }

    /** True when the drawing still renders visible geometry (border, fill, or middle line for box shapes). */
    hasVisibleDrawingGeometry() {
        if (this.visible === false || this.hidden === true) return false;
        if (!Array.isArray(this.points) || this.points.length === 0) return false;

        if (!SHAPE_BOX_GEOMETRY_TYPES.has(this.type)) {
            return true;
        }

        const s = this.style || {};
        const borderOn = s.borderEnabled !== false;
        const stroke = s.stroke ?? s.borderColor;
        const strokeW = Number(s.strokeWidth);
        const borderVisible = borderOn
            && stroke
            && stroke !== 'none'
            && stroke !== 'transparent'
            && !(Number.isFinite(strokeW) && strokeW <= 0);

        const bgOn = s.showBackground !== false;
        const fill = s.fill ?? s.backgroundColor;
        const fillVisible = bgOn
            && fill
            && fill !== 'none'
            && fill !== 'transparent';

        const sm = s.showMiddleLine;
        const middleVisible = sm === true
            || sm === 1
            || (typeof sm === 'string' && /^(true|1|yes)$/i.test(String(sm).trim()));

        return borderVisible || fillVisible || middleVisible;
    }

    /**
     * Create resize handles for the drawing
     * @param {d3.Selection} group - The drawing's SVG group
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;  // Visual handle size
        const hitRadius = 14;    // Larger hit area for easier clicking
        const handleFill = 'transparent';  // No background
        const handleStroke = '#2962FF';  // Blue stroke
        const handleStrokeWidth = 2;  // Thinner border
        
        // Remove existing handles and handle groups
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        // Use virtualPoints if available, otherwise use points
        const pointsToRender = this.virtualPoints || this.points;
        pointsToRender.forEach((point, index) => {
            // Convert data index to screen position
            const cx = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            
            // Create handle group
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            // Invisible larger hit area for easier clicking
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-point-index', index);
            
            // Visual handle circle (blue outline, no fill)
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });
    }

    /**
     * Optional hook for point-handle drags. Return true if handled.
     * @param {number} index
     * @param {{x:number, y:number}} point
     * @returns {boolean}
     */
    onPointHandleDrag(index, context = {}) {
        return false;
    }

    /**
     * Optional hook invoked when a custom handle drag starts.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    beginHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Handle drag for resize handles - updates the point at the given index.
     * This is the default implementation that works for simple point-based tools.
     * @param {string|number} handleRole - Role name or point index
     * @param {Object} context - Contains dataPoint, pointIndex, scales
     * @returns {boolean} - true if drawing was updated
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex } = context;
        
        // Get the point index - either from context or parse from handleRole
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        // Validate
        if (!dataPoint || isNaN(index) || index < 0 || index >= this.points.length) {
            return false;
        }
        
        // Update the point
        this.points[index] = { x: dataPoint.x, y: dataPoint.y };
        this.meta.updatedAt = Date.now();
        return true;
    }

    /**
     * Optional hook invoked when a custom handle drag ends.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    endHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Show selection state
     */
    select(opts = {}) {
        this.selected = true;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 1);
            this.group.selectAll('.resize-handle').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'all');
            this.group.selectAll('.resize-handle-group').raise();
            this.group.selectAll('.resize-handle-glow-outer').style('opacity', 0.15);
            this.group.selectAll('.resize-handle-glow').style('opacity', 0.3);
            this.group.selectAll('.resize-handle-shadow').style('opacity', 0.3);
            this.group.selectAll('.custom-handle').style('opacity', 1);
            this.group.selectAll('.custom-handle').style('pointer-events', 'all');
            this.group.raise(); // Bring to front
        }
        if (!opts.skipAxisHighlights) {
            this.showAxisHighlights();
        }
    }

    /**
     * Hide selection state
     */
    deselect() {
        this.selected = false;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 0);
            this.group.selectAll('.resize-handle').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-glow').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('pointer-events', 'none');
        }
        // Hide axis price/time labels when the drawing is not selected.
        this.hideAxisHighlights();
    }
    
    /**
     * Show highlighted labels on price and time axes for drawing points
     * TradingView style: cyan background for time, colored backgrounds for prices
     */
    showAxisHighlights(opts = {}) {
        if (!this.selected && opts.force !== true) {
            this.hideAxisHighlights();
            return;
        }
        const axisPoints = Array.isArray(opts.pointsOverride) ? opts.pointsOverride : this.points;
        if (!this.chart || !axisPoints || axisPoints.length === 0) return;
        if (!this.hasVisibleDrawingGeometry()) {
            this.hideAxisHighlights();
            return;
        }

        const mgr = this.chart.drawingManager;
        if (!opts.live && mgr && typeof mgr._shouldSkipAxisHighlights === 'function' && mgr._shouldSkipAxisHighlights()) {
            return;
        }

        const savedPoints = Array.isArray(opts.pointsOverride) ? this.points : null;
        if (Array.isArray(opts.pointsOverride)) {
            this.points = opts.pointsOverride;
        }

        try {
        
        // Remove any existing highlights first
        this.hideAxisHighlights();
        
        const svg = this.chart.svg;
        if (!svg) return;
        
        const yScale = this.chart.yScale || this.chart.scales?.yScale;
        const xScale = this.chart.xScale || this.chart.scales?.xScale;
        if (!yScale || !xScale) return;
        
        const margin = this.chart.margin || { t: 5, r: 60, b: 30, l: 0 };
        const chartWidth = this.chart.w || this.chart.canvas?.width || 800;
        const chartHeight = this.chart.h || this.chart.canvas?.height || 600;
        
        // Compute price decimals matching the chart's current precision setting
        let priceDecimals;
        const _precisionSetting = this.chart.chartSettings?.precision;
        if (_precisionSetting && _precisionSetting !== 'Default') {
            priceDecimals = Math.max(0, Math.min(8, parseInt(_precisionSetting, 10) || 5));
        } else if (typeof this.chart.getPriceDecimals === 'function' && yScale) {
            const _d = yScale.domain();
            const _range = Math.abs((Array.isArray(_d) && _d.length === 2) ? (_d[1] - _d[0]) : 0);
            priceDecimals = this.chart.getPriceDecimals(_range);
        } else {
            priceDecimals = this.chart.priceDecimals || 5;
        }
        
        // Create highlight group for SVG labels only (zones are drawn on canvas)
        this.axisHighlightGroup = svg.append('g')
            .attr('class', 'axis-highlight-group')
            .attr('data-drawing-id', this.id)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer');

        // Keep price/time endpoint labels inside the chart tile (not over V9 side panels).
        const hlClipId = `axis-highlight-clip-${this.id}`;
        let hlDefs = svg.select('defs');
        if (hlDefs.empty()) hlDefs = svg.append('defs');
        hlDefs.select(`#${hlClipId}`).remove();
        hlDefs.append('clipPath')
            .attr('id', hlClipId)
            .append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', Math.max(1, chartWidth))
            .attr('height', Math.max(1, chartHeight));
        this.axisHighlightGroup.attr('clip-path', `url(#${hlClipId})`);
        
        // Use the shape's color for time highlights (like TradingView)
        const timeHighlightColor = this.style?.color || this.style?.lineColor || this.style?.stroke || '#2962ff';
        
        // Helper function to determine if color is light (needs dark text)
        const isLightColor = (color) => {
            if (!color) return false;
            let r, g, b;
            if (color.startsWith('#')) {
                const hex = color.replace('#', '');
                if (hex.length === 3) {
                    r = parseInt(hex[0] + hex[0], 16);
                    g = parseInt(hex[1] + hex[1], 16);
                    b = parseInt(hex[2] + hex[2], 16);
                } else {
                    r = parseInt(hex.substr(0, 2), 16);
                    g = parseInt(hex.substr(2, 2), 16);
                    b = parseInt(hex.substr(4, 2), 16);
                }
            } else if (color.startsWith('rgb')) {
                const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    r = parseInt(match[1]);
                    g = parseInt(match[2]);
                    b = parseInt(match[3]);
                }
            } else {
                return false;
            }
            // Calculate luminance (perceived brightness)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance > 0.6; // Light colors have luminance > 0.6
        };
        
        // Determine text color based on background brightness
        const textColor = isLightColor(timeHighlightColor) ? '#131722' : '#ffffff';
        
        // Get unique X positions for time highlights (avoid duplicates)
        const timePositions = new Set();
        
        // Prepare canvas-based zone highlights (drawn behind labels)
        const canvasZones = [];
        const showPriceLabels = this.isAxisLabelEnabled('price');
        const showTimeLabels = this.isAxisLabelEnabled('time');
        
        // Calculate price axis zone (Y-axis)
        if (this.points.length >= 2) {
            let prices = this.points.map(p => p.y);
            if ((this.type === 'long-position' || this.type === 'short-position') && this.meta) {
                ['extraTargets', 'extraEntries', 'extraStops'].forEach((key) => {
                    const arr = this.meta[key];
                    if (!Array.isArray(arr)) return;
                    arr.forEach((row) => {
                        if (row && Number.isFinite(row.y)) prices.push(row.y);
                    });
                });
            }
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const minY = yScale(maxPrice); // Note: Y is inverted
            const maxY = yScale(minPrice);
            const zoneHeight = maxY - minY;
            
            if (showPriceLabels && zoneHeight > 0) {
                canvasZones.push({
                    type: 'price',
                    y: minY,
                    height: zoneHeight
                });
            }
        }
        
        // Calculate time axis zone (X-axis)
        // For position tools, use meta.zoneWidth since all points are on same candle
        let timeZoneStartX = null;
        let timeZoneWidth = 0;
        
        if ((this.type === 'long-position' || this.type === 'short-position') && this.meta?.zoneWidth) {
            // Position tools: use the stored zone width
            const entryIndex = this.points[0]?.x;
            if (entryIndex !== undefined) {
                timeZoneStartX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(entryIndex) : xScale(entryIndex);
                timeZoneWidth = this.meta.zoneWidth;
            }
        } else if (this.points.length >= 2) {
            // Other tools: calculate from point positions
            const indices = this.points.map(p => p.x);
            const minIndex = Math.min(...indices);
            const maxIndex = Math.max(...indices);
            let minX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(minIndex) : xScale(minIndex);
            let maxX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(maxIndex) : xScale(maxIndex);
            if (this.type === 'rectangle' || this.type === 'rotated-rectangle') {
                const extL = SVGHelpers.isStyleFlagOn(this.style, 'extendLeft');
                const extR = SVGHelpers.isStyleFlagOn(this.style, 'extendRight');
                if (extL || extR) {
                    const p1 = this.points[0];
                    const p2 = this.points[1];
                    const px1 = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p1.x) : xScale(p1.x);
                    const px2 = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p2.x) : xScale(p2.x);
                    const hb = (typeof SVGHelpers !== 'undefined' && SVGHelpers.getChartHorizontalPixelBounds)
                        ? SVGHelpers.getChartHorizontalPixelBounds({ chart: this.chart, xScale, yScale })
                        : { left: xScale.range()[0], right: xScale.range()[1] };
                    const leftEdge = Math.min(px1, px2);
                    const rightEdge = Math.max(px1, px2);
                    minX = extL ? hb.left : leftEdge;
                    maxX = extR ? hb.right : rightEdge;
                }
            }
            timeZoneStartX = minX;
            timeZoneWidth = maxX - minX;
        }
        
        if (showTimeLabels && timeZoneWidth > 0 && timeZoneStartX !== null) {
            canvasZones.push({
                type: 'time',
                x: timeZoneStartX,
                width: timeZoneWidth
            });
            
            // Add start and end time labels for ALL tools with time zones
            const boxWidth = 100;
            const boxHeight = 20;
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Get start index - for position tools use entry point, for others use min X
            let startIndex;
            if ((this.type === 'long-position' || this.type === 'short-position')) {
                startIndex = this.points[0]?.x;
            } else {
                const indices = this.points.map(p => p.x);
                startIndex = Math.min(...indices);
            }
            
            // START time label (left edge)
            if (startIndex !== undefined) {
                const roundedStartIndex = Math.round(startIndex);
                let startTime = null;
                const dataLength = this.chart.data?.length || 0;
                
                if (roundedStartIndex >= 0 && roundedStartIndex < dataLength) {
                    const startCandle = this.chart.data?.[roundedStartIndex];
                    if (startCandle && startCandle.t) {
                        startTime = startCandle.t;
                    }
                } else if (roundedStartIndex < 0 && dataLength >= 2) {
                    // Start is before data - extrapolate backwards
                    const firstCandle = this.chart.data[0];
                    const secondCandle = this.chart.data[1];
                    if (firstCandle?.t && secondCandle?.t) {
                        const candleInterval = secondCandle.t - firstCandle.t;
                        startTime = firstCandle.t + (candleInterval * roundedStartIndex);
                    }
                } else if (roundedStartIndex >= dataLength && dataLength >= 2) {
                    // Start is beyond data - extrapolate forward
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedStartIndex - (dataLength - 1);
                        startTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (startTime) {
                    const date = new Date(startTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-start')
                        .attr('x', timeZoneStartX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('stroke', 'rgba(0,0,0,0.35)')
                        .attr('stroke-width', 1)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-start-text')
                        .attr('x', timeZoneStartX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
            
            // END time label (right edge)
            const endX = timeZoneStartX + timeZoneWidth;
            const endIndex = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(endX) : null;
            if (endIndex !== null && endIndex >= 0) {
                let endTime = null;
                const dataLength = this.chart.data?.length || 0;
                const roundedEndIndex = Math.round(endIndex);
                
                if (roundedEndIndex < dataLength) {
                    // End is within candle data
                    const endCandle = this.chart.data?.[roundedEndIndex];
                    if (endCandle && endCandle.t) {
                        endTime = endCandle.t;
                    }
                } else if (dataLength >= 2) {
                    // End is beyond candle data - extrapolate time
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedEndIndex - (dataLength - 1);
                        endTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (endTime) {
                    const date = new Date(endTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-end')
                        .attr('x', endX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('stroke', 'rgba(0,0,0,0.35)')
                        .attr('stroke-width', 1)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-end-text')
                        .attr('x', endX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
        }
        
        let pointsToLabel = this.points;

        if (FREEHAND_AXIS_LABEL_TYPES.has(this.type) && this.points.length >= 2) {
            pointsToLabel = [this.points[0], this.points[this.points.length - 1]];
        }

        if ((this.type === 'long-position' || this.type === 'short-position') && this.meta) {
            const x0 = Number.isFinite(this.points[0]?.x) ? this.points[0].x : 0;
            const extraPts = [];
            ['extraTargets', 'extraEntries', 'extraStops'].forEach((key) => {
                const arr = this.meta[key];
                if (!Array.isArray(arr)) return;
                arr.forEach((row) => {
                    if (row && Number.isFinite(row.y)) {
                        extraPts.push({ x: x0, y: row.y, _rrExtra: key });
                    }
                });
            });
            pointsToLabel = pointsToLabel.concat(extraPts);
        }
        
        // Process each point
        pointsToLabel.forEach((point, idx) => {
            const price = point.y;
            const index = point.x;
            
            // Determine color based on point type for position tools
            let priceColor = this.style?.color || this.style?.lineColor || this.style?.stroke || '#2962ff';
            if (this.type === 'long-position' || this.type === 'short-position') {
                if (point._rrExtra === 'extraEntries') priceColor = '#2196f3';
                else if (point._rrExtra === 'extraStops') priceColor = '#f44336';
                else if (point._rrExtra === 'extraTargets') priceColor = '#4caf50';
                else if (idx === 0) priceColor = '#2196f3'; // Entry - blue
                else if (idx === 1) priceColor = '#f44336'; // Stop - red
                else if (idx === 2) priceColor = '#4caf50'; // Target - green
            }
            
            // Price highlight on Y-axis (right side)
            const yPos = yScale(price);
            if (showPriceLabels && yPos >= margin.t && yPos <= chartHeight - margin.b) {
                const priceText = price.toFixed(priceDecimals);
                const boxWidth = 58;
                const boxHeight = 20;
                
                // Background box with slight transparency
                this.axisHighlightGroup.append('rect')
                    .attr('class', 'axis-highlight-price')
                    .attr('x', chartWidth - margin.r + 2)
                    .attr('y', yPos - boxHeight / 2)
                    .attr('width', boxWidth)
                    .attr('height', boxHeight)
                    .attr('fill', priceColor)
                    .attr('stroke', 'rgba(0,0,0,0.35)')
                    .attr('stroke-width', 1)
                    .attr('rx', 3);
                
                // Price text - determine text color based on price background
                const priceTextColor = isLightColor(priceColor) ? '#131722' : '#ffffff';
                this.axisHighlightGroup.append('text')
                    .attr('class', 'axis-highlight-price-text')
                    .attr('x', chartWidth - margin.r + 2 + boxWidth / 2)
                    .attr('y', yPos + 5)
                    .attr('fill', priceTextColor)
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .attr('text-anchor', 'middle')
                    .text(priceText);
            }
            
            // Time highlight on X-axis (bottom) - only add if not already added for this x position
            const roundedIndex = Math.round(index);
            if (showTimeLabels && !timePositions.has(roundedIndex)) {
                timePositions.add(roundedIndex);
                
                // Use dataIndexToPixel if available, otherwise use xScale
                const xPos = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(index) : xScale(index);
                if (xPos >= margin.l && xPos <= chartWidth - margin.r) {
                    // Get time from candle data, extrapolating if index is out of range
                    const dataLength = this.chart.data?.length || 0;
                    let candleTime = null;
                    const candle = this.chart.data?.[roundedIndex];
                    if (candle && candle.t) {
                        candleTime = candle.t;
                    } else if (dataLength >= 2) {
                        const firstCandle = this.chart.data[0];
                        const lastCandle = this.chart.data[dataLength - 1];
                        const prevCandle = this.chart.data[dataLength - 2];
                        const candleInterval = lastCandle.t - prevCandle.t;
                        if (roundedIndex < 0 && firstCandle?.t) {
                            candleTime = firstCandle.t + (candleInterval * roundedIndex);
                        } else if (roundedIndex >= dataLength && lastCandle?.t) {
                            candleTime = lastCandle.t + (candleInterval * (roundedIndex - (dataLength - 1)));
                        }
                    }
                    if (candleTime !== null) {
                        const date = new Date(candleTime);
                        const day = date.getDate().toString().padStart(2, '0');
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = months[date.getMonth()];
                        const year = date.getFullYear().toString().slice(-2);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const mins = date.getMinutes().toString().padStart(2, '0');
                        const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                        
                        const boxWidth = 100;
                        const boxHeight = 20;
                        
                        // Background box
                        this.axisHighlightGroup.append('rect')
                            .attr('class', 'axis-highlight-time')
                            .attr('x', xPos - boxWidth / 2)
                            .attr('y', chartHeight - margin.b + 4)
                            .attr('width', boxWidth)
                            .attr('height', boxHeight)
                            .attr('fill', timeHighlightColor)
                            .attr('stroke', 'rgba(0,0,0,0.35)')
                            .attr('stroke-width', 1)
                            .attr('rx', 3)
                            .style('pointer-events', 'all')
                            .style('cursor', 'pointer');
                        
                        // Time text
                        this.axisHighlightGroup.append('text')
                            .attr('class', 'axis-highlight-time-text')
                            .attr('x', xPos)
                            .attr('y', chartHeight - margin.b + 17)
                            .attr('fill', textColor)
                            .attr('font-size', '11px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle')
                            .text(timeText)
                            .style('pointer-events', 'all')
                            .style('cursor', 'pointer');
                    }
                }
            }
        });
        
        // Set canvas-based zones (drawn behind labels in drawAxes)
        // Keep these shaded zones ONLY for selected drawings.
        if (this.selected && this.chart.setAxisHighlightZones && canvasZones.length > 0) {
            this.chart.setAxisHighlightZones(canvasZones);
            this.hasAxisHighlightZones = true;
            const skipCanvasSchedule = mgr
                && typeof mgr._isDrawingGeometryMoveActive === 'function'
                && mgr._isDrawingGeometryMoveActive();
            if (this.chart.scheduleRender && !skipCanvasSchedule) {
                if (opts.live) {
                    requestAnimationFrame(() => {
                        if (this.chart && this.chart.scheduleRender) {
                            this.chart.scheduleRender();
                        }
                    });
                } else if (!this.chart._isRendering) {
                    this.chart.scheduleRender();
                }
            }
        }
        } finally {
            if (savedPoints) {
                this.points = savedPoints;
            }
        }
    }
    
    /**
     * Hide axis highlight labels
     */
    hideAxisHighlights() {
        if (this.axisHighlightGroup) {
            this.axisHighlightGroup.remove();
            this.axisHighlightGroup = null;
        }
        if (this._labelGroup) {
            this._labelGroup.remove();
            this._labelGroup = null;
        }
        // Also remove orphaned groups for this drawing only (do not affect other drawings)
        if (this.chart?.svg) {
            this.chart.svg.selectAll(`.axis-highlight-group[data-drawing-id="${this.id}"]`).remove();
            this.chart.svg.selectAll(`.drawings-labels [data-id="${this.id}"]`).remove();
        }
        // Clear canvas-based zones only if this drawing had set them.
        // Guard: never call scheduleRender from inside a render cycle (would cause
        // infinite recursion when scheduleRender is synchronous, e.g. during replay).
        if (this.hasAxisHighlightZones && this.chart?.clearAxisHighlightZones) {
            this.chart.clearAxisHighlightZones();
            const mgr = this.chart.drawingManager;
            const skipSchedule = this.chart._isRendering
                || (mgr && typeof mgr._isDrawingGeometryMoveActive === 'function' && mgr._isDrawingGeometryMoveActive())
                || (mgr && typeof mgr._shouldSkipAxisHighlights === 'function' && mgr._shouldSkipAxisHighlights());
            if (this.chart.scheduleRender && !skipSchedule) {
                this.chart.scheduleRender();
            }
        }
        this.hasAxisHighlightZones = false;
    }

    /**
     * Serialize to JSON for persistence
     * Stores timestamps for multi-timeframe support
     */
    toJSON() {
        let serializedPoints = this.points;
        let coordinateSystem = 'index';
        
        // CRITICAL: Use stored timestamps if available (never recalculate from indices)
        // This ensures drawings maintain their position across timeframe changes
        if (this.timestampPoints && this.timestampPoints.length > 0) {
            serializedPoints = this.timestampPoints;
            coordinateSystem = 'timestamp';
        } 
        // Only calculate timestamps if not already stored (first save after creation)
        else if (this.chart && this.chart.data && this.chart.data.length > 0) {
            // Use CoordinateUtils for extrapolation support with correct timeframe
            const timeframe = this.chart.currentTimeframe || null;
            serializedPoints = this.points.map(p => {
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
            coordinateSystem = 'timestamp';
            
            // Store these timestamps permanently
            this.timestampPoints = serializedPoints;
        }
        
        return {
            id: this.id,
            type: this.type,
            points: serializedPoints,
            coordinateSystem: coordinateSystem,
            style: this.style,
            visible: this.visible,
            locked: !!this.locked,
            visibility: this.visibility,
            meta: this.meta,
            text: this.text,
            baseScale: this.baseScale
        };
    }

    /**
     * Create from JSON
     * Handles both timestamp-based (new) and index-based (legacy) formats
     * Note: Points will be in timestamp format here, conversion to indices happens in manager
     */
    static fromJSON(data, chart = null) {
        const rawPoints = Array.isArray(data.points) ? data.points : [];
        const looksTimestamp = rawPoints.length > 0
            && rawPoints.every((p) => p && Number.isFinite(p.timestamp));
        const clonedPoints = looksTimestamp ? [] : rawPoints.map((p) => {
            if (!p || typeof p !== 'object') return null;
            const x = Number(p.x);
            const y = Number(p.price !== undefined ? p.price : p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { x, y };
        }).filter(Boolean);
        const drawing = new this(clonedPoints, data.style || {});
        drawing.id = data.id;
        drawing.visible = data.visible !== undefined ? data.visible : true;
        drawing.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        drawing.text = data.text || '';
        drawing.coordinateSystem = data.coordinateSystem || 'index'; // Default to legacy format
        drawing.chart = chart;
        drawing.baseScale = data.baseScale || null; // Restore zoom scale reference
        
        // Restore locked state
        if (data.locked !== undefined) {
            drawing.locked = data.locked;
        }
        
        // Restore timeframe visibility
        if (data.visibility) {
            drawing.visibility = data.visibility;
        }
        
        // Store timestamp points only when JSON still has wall-clock anchors (not post-conversion {x,y})
        if (data.coordinateSystem === 'timestamp' && Array.isArray(data.points) && data.points.length > 0) {
            const first = data.points[0];
            if (first && Number.isFinite(first.timestamp)) {
                drawing.timestampPoints = data.points.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price !== undefined ? p.price : p.y
                }));
            }
        }
        
        return drawing;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        // Hide axis highlights before removing the drawing
        this.hideAxisHighlights();

        // Safety cleanup for any detached label groups outside the drawing group
        if (this.chart?.svg) {
            this.chart.svg.selectAll(`.drawings-labels [data-id="${this.id}"]`).remove();
        }
        
        if (this.group) {
            this.group.remove();
        }
        this.handles = [];
        this.group = null;
    }
}

// ============================================================================
// Drawing State Manager
// ============================================================================
class DrawingState {
    constructor() {
        this.currentTool = null;
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    reset() {
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    startDrawing(tool, requiredPoints) {
        this.currentTool = tool;
        this.isDrawing = true;
        this.tempPoints = [];
        this.requiredPoints = requiredPoints;
    }

    addPoint(point) {
        this.tempPoints.push(point);
        // For continuous drawing (requiredPoints = -1), never auto-complete
        if (this.requiredPoints === -1) {
            return false;
        }
        // For point-by-point drawing (requiredPoints = -2), never auto-complete
        if (this.requiredPoints === -2) {
            return false;
        }
        return this.tempPoints.length >= this.requiredPoints;
    }

    isComplete() {
        // For continuous drawing (requiredPoints = -1), check for minimum points
        if (this.requiredPoints === -1) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a path
        }
        // For point-by-point drawing (requiredPoints = -2), check for minimum points
        if (this.requiredPoints === -2) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a polyline
        }
        return this.tempPoints.length >= this.requiredPoints;
    }
}

// ============================================================================
// Coordinate Utilities
// ============================================================================
class CoordinateUtils {
    /**
     * Convert screen coordinates to data coordinates
     * Note: X coordinate is candle INDEX, not timestamp - snapped to candle center unless continuous mode
     * @param {boolean} continuous - If true, don't round x to allow smooth freehand drawing
     */
    static screenToData(screenX, screenY, scales, chart = null, continuous = false) {
        if (!scales || !scales.yScale || typeof scales.yScale.invert !== 'function') {
            return { x: NaN, y: NaN };
        }
        const hasXInvert = scales.xScale && typeof scales.xScale.invert === 'function';
        // Use chart's helper methods if available for accurate index calculation
        const rawX = chart && chart.pixelToDataIndex ? 
            chart.pixelToDataIndex(screenX) : 
            (hasXInvert ? scales.xScale.invert(screenX) : NaN);
            
        return {
            x: continuous ? rawX : Math.round(rawX),  // Keep fractional for freehand, snap for others
            y: scales.yScale.invert(screenY)  // This is the price
        };
    }

    /**
     * Convert data coordinates to screen coordinates
     * Note: dataX should be candle INDEX, not timestamp
     */
    static dataToScreen(dataX, dataY, scales, chart = null) {
        if (!scales || !scales.yScale || typeof scales.yScale !== 'function') {
            return { x: NaN, y: NaN };
        }
        // Use chart's helper methods if available for accurate pixel calculation
        const x = chart && chart.dataIndexToPixel ? 
            chart.dataIndexToPixel(dataX) : 
            (scales.xScale && typeof scales.xScale === 'function' ? scales.xScale(dataX) : NaN);
            
        return {
            x: x,
            y: scales.yScale(dataY)
        };
    }

    /**
     * Snap to nearest OHLC value (for magnet mode)
     * @param {Object} point - {x: dataIndex, y: price}
     * @param {Array} data - Chart candle data
     * @param {Object} scales - {xScale, yScale}
     * @param {string|boolean} magnetMode - 'off', 'weak', 'strong', or boolean for backward compatibility
     * @returns {Object} - Snapped point {x: dataIndex, y: price}
     */
    static snapToOHLC(point, data, scales, magnetMode = 'off') {
        // Handle boolean for backward compatibility
        if (magnetMode === false || magnetMode === 'off') {
            return point;
        }
        if (magnetMode === true) {
            magnetMode = 'weak'; // Default to weak for backward compatibility
        }
        
        if (!data || data.length === 0) {
            return point;
        }

        // Define snap thresholds based on magnet strength
        // Weak: only snap if very close to OHLC (within ~20% of price range)
        // Strong: always snap to nearest OHLC
        const isStrong = magnetMode === 'strong';
        
        // Point.x is already a candle index, so just round it to nearest integer
        const nearestIndex = Math.round(Math.max(0, Math.min(data.length - 1, point.x)));
        const nearestCandle = data[nearestIndex];
        
        if (!nearestCandle) {
            return point;
        }

        // Find nearest OHLC value (handle both short and long property names)
        const open = nearestCandle.o ?? nearestCandle.open;
        const high = nearestCandle.h ?? nearestCandle.high;
        const low = nearestCandle.l ?? nearestCandle.low;
        const close = nearestCandle.c ?? nearestCandle.close;
        
        const ohlc = [open, high, low, close].filter(v => v !== undefined && v !== null && !isNaN(v));
        
        // If no valid OHLC values, return original point
        if (ohlc.length === 0) {
            return point;
        }

        const nearestPrice = ohlc.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev - point.y);
            const currDiff = Math.abs(curr - point.y);
            return currDiff < prevDiff ? curr : prev;
        });

        // For weak magnet, check if we're close enough to snap
        if (!isStrong) {
            const candleRange = high - low;
            const snapThreshold = candleRange * 0.3; // 30% of candle range
            const distanceToNearest = Math.abs(nearestPrice - point.y);
            
            // Only snap if within threshold
            if (distanceToNearest > snapThreshold) {
                return {
                    x: nearestIndex,  // Still snap X to candle
                    y: point.y        // Keep original Y
                };
            }
        }

        // Strong magnet or within threshold: snap both X and Y
        return {
            x: nearestIndex,
            y: nearestPrice
        };
    }

    /**
     * Get interval in milliseconds from timeframe string
     * @param {string} timeframe - Timeframe like '1m', '5m', '1h', etc.
     * @returns {number|null} - Interval in milliseconds or null if unknown
     */
    static getIntervalFromTimeframe(timeframe) {
        if (!timeframe) return null;
        
        const tf = timeframe.toLowerCase();
        const num = parseInt(tf) || 1;
        
        if (tf.includes('m') && !tf.includes('mo')) {
            return num * 60 * 1000; // minutes
        } else if (tf.includes('h')) {
            return num * 60 * 60 * 1000; // hours
        } else if (tf.includes('d')) {
            return num * 24 * 60 * 60 * 1000; // days
        } else if (tf.includes('w')) {
            return num * 7 * 24 * 60 * 60 * 1000; // weeks
        } else if (tf.includes('mo')) {
            return num * 30 * 24 * 60 * 60 * 1000; // months (approx)
        }
        
        return null;
    }

    /**
     * Convert candle index to timestamp
     * Supports extrapolation for indices beyond data range (for replay mode)
     * @param {number} index - Candle index in data array
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Timestamp in milliseconds
     */
    static indexToTimestamp(index, data, timeframe = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ indexToTimestamp: No data!');
            return Date.now(); // Return current time if no data
        }
        
        // CRITICAL: Preserve fractional index for brush stroke smoothness
        const baseIndex = Math.floor(index);
        const fraction = index - baseIndex;
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        // If index is within data range, use actual bucket span (handles weekend gaps on 1d/1h)
        if (baseIndex >= 0 && baseIndex < data.length) {
            const baseTs = data[baseIndex]?.t || 0;
            const nextTs = (baseIndex < data.length - 1) ? data[baseIndex + 1].t : (baseTs + interval);
            const bucketMs = Math.max(1, nextTs - baseTs);
            return baseTs + (fraction * bucketMs);
        }
        
        // Extrapolate for indices beyond data range (preserve fractional precision)
        if (index >= data.length) {
            // Beyond end of data - extrapolate forward
            const lastCandle = data[data.length - 1];
            const candlesBeyond = index - (data.length - 1);
            return lastCandle.t + (candlesBeyond * interval);
        } else if (index < 0) {
            // Before start of data - extrapolate backward
            const firstCandle = data[0];
            return firstCandle.t + (index * interval); // index is negative
        }
        
        return 0;
    }

    /**
     * Convert timestamp to candle index using binary search
     * Supports extrapolation for timestamps beyond data range (for replay mode)
     * @param {number} timestamp - Timestamp in milliseconds
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Candle index (may be beyond data range for extrapolated positions)
     */
    static timestampToIndex(timestamp, data, timeframe = null, options = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ timestampToIndex: No data!');
            return 0;
        }
        
        const firstCandle = data[0];
        const lastCandle = data[data.length - 1];
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        const firstT = firstCandle.t;
        const lastT = lastCandle.t;
        const replayClamp = !!(options && options.replayClampToLastBar);

        // Extrapolate before/after loaded window (replay drawings off-screen left/right)
        if (timestamp < firstT) {
            return -(firstT - timestamp) / interval;
        }
        if (timestamp > lastT) {
            if (replayClamp) {
                return data.length - 1;
            }
            return (data.length - 1) + (timestamp - lastT) / interval;
        }

        // Binary search: largest i where data[i].t <= timestamp
        let lo = 0;
        let hi = data.length - 1;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (data[mid].t <= timestamp) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        const i = lo;
        const candleT = data[i].t;
        if (timestamp === candleT) {
            return i;
        }

        const nextT = (i < data.length - 1) ? data[i + 1].t : (candleT + interval);
        const bucketMs = Math.max(1, nextT - candleT);
        const fraction = Math.min(1, Math.max(0, (timestamp - candleT) / bucketMs));
        return i + fraction;
    }

    /**
     * Convert points from index-based to timestamp-based coordinates
     * @param {Array} points - Array of {x: index, y: price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {timestamp, price} points
     */
    static pointsToTimestamps(points, data, timeframe = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => ({
            timestamp: this.indexToTimestamp(p.x, data, timeframe),
            price: p.y
        }));
    }

    /**
     * Convert points from timestamp-based to index-based coordinates
     * Preserves extrapolated indices for areas beyond data range (replay mode)
     * @param {Array} points - Array of {timestamp, price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {x: index, y: price} points
     */
    static pointsFromTimestamps(points, data, timeframe = null, options = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => {
            const index = this.timestampToIndex(p.timestamp || 0, data, timeframe, options);
            
            // Don't clamp - allow extrapolated indices for replay mode
            return {
                x: index,
                y: p.price || p.y
            };
        });
    }

    /** True when X may sit in future/past padding beyond loaded candles (text tools, markers). */
    static allowsExtrabarBarIndex(type) {
        return !!type && !CANDLE_INDEX_CLAMPED_TYPES.has(type);
    }

    /**
     * Replay mode clamps future timestamps to the last visible bar unless the tool allows extrabar indices.
     * Single source of truth for load + render timestamp resolution (avoids snap-back to last candle).
     */
    static buildTimestampResolveOptions(drawing, chart) {
        if (!drawing || !drawing.type || !chart || !chart.replaySystem || !chart.replaySystem.isActive) {
            return null;
        }
        if (CoordinateUtils.allowsExtrabarBarIndex(drawing.type)) {
            return null;
        }
        return { replayClampToLastBar: true };
    }

    /**
     * Resolve live drawing points from persisted timestamp anchors + current chart.data.
     * chart.data is the same series dataIndexToPixel/xScale use (required for TF switches).
     */
    static resolveDrawingPoints(drawing, chart, tsOptsOverride = undefined) {
        if (!drawing || !chart || !Array.isArray(chart.data) || chart.data.length === 0) {
            return drawing?.points || [];
        }
        const tsOpts = tsOptsOverride !== undefined
            ? tsOptsOverride
            : CoordinateUtils.buildTimestampResolveOptions(drawing, chart);
        if (drawing.timestampPoints && drawing.timestampPoints.length > 0) {
            return this.pointsFromTimestamps(
                drawing.timestampPoints,
                chart.data,
                chart.currentTimeframe,
                tsOpts
            );
        }
        return drawing.points || [];
    }

    /**
     * Calculate distance between two points
     */
    static distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Check if point is near a line segment
     */
    static isNearLine(point, lineStart, lineEnd, threshold = 5) {
        const d = this.distanceToLine(point, lineStart, lineEnd);
        return d < threshold;
    }

    /**
     * Calculate distance from point to line segment
     */
    static distanceToLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// ============================================================================
// SVG Helper Functions
// ============================================================================
class SVGHelpers {
    /**
     * Create arrow marker definition.
     * @param {object|boolean} [opts] - markerUnits, markerWidth, markerHeight, refX, refY, orient
     */
    static createArrowMarker(svg, id, color = '#5dd3edff', opts = {}) {
        if (!opts || opts === true) opts = {};
        const markerUnits = opts.markerUnits || 'strokeWidth';
        const markerWidth = opts.markerWidth != null ? opts.markerWidth : 6;
        const markerHeight = opts.markerHeight != null ? opts.markerHeight : 6;
        const refX = opts.refX != null ? opts.refX : 9;
        const refY = opts.refY != null ? opts.refY : 5;
        const orient = opts.orient || 'auto-start-reverse';

        let defs = svg.select('defs');
        if (defs.empty()) {
            defs = svg.append('defs');
        }

        let marker = defs.select(`marker#${id}`);
        if (marker.empty()) {
            marker = defs.append('marker')
                .attr('id', id)
                .attr('viewBox', '0 0 10 10');

            marker.append('path')
                .attr('d', 'M 0 0 L 10 5 L 0 10 z');
        }

        marker
            .attr('markerUnits', markerUnits)
            .attr('markerWidth', markerWidth)
            .attr('markerHeight', markerHeight)
            .attr('refX', refX)
            .attr('refY', refY)
            .attr('orient', orient);

        marker.select('path')
            .attr('fill', color);

        return `url(#${id})`;
    }

    /**
     * Apply hover effect to drawing
     */
    static applyHoverEffect(element, isHovering) {
        if (isHovering) {
            element
                .style('cursor', 'default');
        } else {
            element
                .style('cursor', 'default');
        }
    }

    /**
     * Full horizontal plot bounds in pixel space (left/right pane edges).
     * Used by rectangle extend — must span the drawable chart area (incl. empty space
     * right of the last bar), not only the currently visible bar index range.
     */
    static getChartHorizontalPixelBounds(scales) {
        const chart = scales && scales.chart;
        const m = (chart && chart.margin) ? chart.margin : { l: 0, r: 60 };
        const plotLeft = typeof m.l === 'number' ? m.l : 0;
        let plotW = chart && chart.w;
        if (!Number.isFinite(plotW) && chart && chart.svg && typeof chart.svg.node === 'function') {
            const attrW = parseFloat(chart.svg.node().getAttribute('width'));
            if (Number.isFinite(attrW)) plotW = attrW;
        }
        if (!Number.isFinite(plotW) && chart && chart.canvas) {
            plotW = chart.canvas.clientWidth || chart.canvas.width;
        }
        if (Number.isFinite(plotW)) {
            const plotRight = plotW - (typeof m.r === 'number' ? m.r : 0);
            if (plotRight > plotLeft) return { left: plotLeft, right: plotRight };
        }
        if (scales && scales.xScale && typeof scales.xScale.range === 'function') {
            const r = scales.xScale.range();
            if (r && r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0]) {
                return { left: r[0], right: r[1] };
            }
        }
        return { left: plotLeft, right: plotLeft + 1 };
    }

    /** @deprecated Use BaseDrawing.isStyleFlagOn */
    static isStyleFlagOn(style, key) {
        return BaseDrawing.isStyleFlagOn(style, key);
    }

    /** @deprecated Use BaseDrawing.resolveStrokeDasharray */
    static resolveStrokeDasharray(style) {
        return BaseDrawing.resolveStrokeDasharray(style);
    }

    /**
     * Apply selection effect to drawing
     */
    static applySelectionEffect(element, isSelected) {
        if (isSelected) {
            element
                .style('stroke-width', parseFloat(element.style('stroke-width') || 2) + 1);
        } else {
            element
                .style('stroke-width', parseFloat(element.attr('data-original-width') || 2));
        }
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof window !== 'undefined') {
    window.physicalShortcutKeyTokenFromEvent = physicalShortcutKeyTokenFromEvent;
    window.isPhysicalShortcutKey = isPhysicalShortcutKey;
    window.buildPhysicalShortcutKey = buildPhysicalShortcutKey;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateUUID,
        BaseDrawing,
        DrawingState,
        CoordinateUtils,
        SVGHelpers,
        physicalShortcutKeyTokenFromEvent,
        isPhysicalShortcutKey,
        buildPhysicalShortcutKey
    };
}
