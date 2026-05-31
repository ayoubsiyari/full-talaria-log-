/**
 * Drawing Tools - Text & Annotation Tools Module
 * Implements: Text, Note Box
 */

const TEXT_TOOL_PLACEHOLDER = 'Type here';
const TEXT_TOOL_PLACEHOLDER_COLOR = 'rgba(120, 123, 134, 0.75)';

function isTextToolPlaceholder(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return true;
    if (/^add text$/i.test(t)) return true;
    if (/^type here$/i.test(t)) return true;
    if (/^enter text/i.test(t)) return true;
    if (t === 'text') return true;
    if (t === 'note') return true;
    if (t === 'anchored text') return true;
    return false;
}

function resolveTextToolDisplay(text, placeholder = TEXT_TOOL_PLACEHOLDER) {
    if (isTextToolPlaceholder(text)) {
        return { text: placeholder, isPlaceholder: true };
    }
    return { text: String(text == null ? '' : text), isPlaceholder: false };
}

function parseCssColorToRgb(color) {
    if (!color || color === 'none' || color === 'transparent') return null;
    const c = String(color).trim();
    let m = c.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
        let h = m[1];
        if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
        if (h.length >= 6) {
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16),
            };
        }
    }
    m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return null;
}

function cssColorLuminance(color) {
    const rgb = parseCssColorToRgb(color);
    if (!rgb) return 0;
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function colorsAreTooSimilar(c1, c2) {
    const a = parseCssColorToRgb(c1);
    const b = parseCssColorToRgb(c2);
    if (!a || !b) return false;
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return (dr * dr + dg * dg + db * db) < 3200;
}

/** SVG / inline-editor fill: honor textColor (incl. placeholder) and stay readable on backgroundColor. */
function resolveAnnotationTextFill(textColor, backgroundColor, isPlaceholder) {
    const fg = (textColor && textColor !== 'none') ? textColor : '#ffffff';
    const bg = (backgroundColor && backgroundColor !== 'none' && backgroundColor !== 'transparent')
        ? backgroundColor
        : null;
    if (bg && colorsAreTooSimilar(fg, bg)) {
        return cssColorLuminance(bg) > 0.45 ? '#131722' : '#ffffff';
    }
    if (isPlaceholder && bg) {
        return fg;
    }
    if (isPlaceholder) {
        return fg || TEXT_TOOL_PLACEHOLDER_COLOR;
    }
    return fg;
}

/** Resolved line/box colors for Note (SVG + inline editor must match). */
function resolveNoteBoxStyle(style = {}) {
    const lineStroke = (style.stroke && style.stroke !== 'none')
        ? style.stroke
        : '#787b86';
    const boxFill = (style.fill && style.fill !== 'none' && style.fill !== 'transparent')
        ? style.fill
        : ((style.backgroundColor && style.backgroundColor !== 'transparent')
            ? style.backgroundColor
            : 'rgba(50, 50, 50, 0.9)');
    const borderOn = !!(style.stroke && style.stroke !== 'none' && (Number(style.strokeWidth) || 1) > 0);
    const boxStroke = borderOn ? lineStroke : 'none';
    return { lineStroke, boxFill, boxStroke, borderOn };
}

/** Inline editor width/wrap options that match the on-chart text box. */
function buildWrapAwareInlineEditorOptions(drawing, bbox, padding = 6, extra = {}) {
    const style = drawing.style || {};
    const wrap = style.wrapText === true;
    const maxW = (Number.isFinite(Number(style.maxWidth)) && Number(style.maxWidth) > 0)
        ? Number(style.maxWidth)
        : 260;
    const pad = Number(padding) || 0;
    const innerMax = Math.max(20, maxW - pad * 2);
    const opts = {
        noWrap: !wrap,
        maxWidth: wrap ? innerMax : maxW,
        autoGrowWidth: !wrap,
        ...extra
    };
    if (bbox) {
        if (bbox.width > 0) {
            opts.editorMinWidth = bbox.width;
            if (wrap) opts.editorWidth = bbox.width;
        }
        if (bbox.height > 0) opts.editorMinHeight = bbox.height;
    }
    return opts;
}

/** Clip SVG text to a rectangle so wrapped lines never paint outside the box. */
function attachTextClipRect(group, clipKey, x, y, w, h) {
    if (!group || group.empty() || !(w > 0) || !(h > 0)) return null;
    const clipId = `txt-clip-${clipKey}`;
    group.select(`#${clipId}`).remove();
    group.append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', w)
        .attr('height', h);
    return clipId;
}

/** Best on-chart box node for sizing/placing the inline text editor. */
function resolveTextAnnotationEditBoxNode(drawing, fallbackNode) {
    if (!drawing || !drawing.group || typeof drawing.group.select !== 'function') {
        return fallbackNode || null;
    }
    const byType = {
        note: 'rect.note-body-hit',
        notebox: 'rect.note-body-hit',
        comment: 'rect.comment-body-hit',
        callout: 'rect.shape-border-hit',
        pin: 'path.note-body-hit',
        'signpost-2': 'rect.signpost-label-fill',
        text: 'rect.text-background, rect.text-body-hit'
    };
    const sel = byType[drawing.type];
    if (!sel) return fallbackNode || null;
    for (const part of sel.split(',')) {
        const node = drawing.group.select(part.trim()).node();
        if (node && document.contains(node)) return node;
    }
    return fallbackNode || null;
}

/** Standard inline editor options for any wrap-capable text annotation. */
function buildStandardInlineEditorOptions(drawing, bbox, config = {}) {
    const style = drawing.style || {};
    const padding = Number(config.padding) || 6;
    const chart = drawing.chart;
    const scales = chart ? { chart, xScale: chart.xScale, yScale: chart.yScale } : {};
    const scaleFactor = (typeof drawing.getZoomScaleFactor === 'function')
        ? drawing.getZoomScaleFactor(scales)
        : 1;
    const scaledFontSize = Math.max(8, (Number(style.fontSize) || 12) * scaleFactor);
    const fontSize = config.fontSize || `${scaledFontSize}px`;
    return {
        inline: true,
        fontSize,
        fontFamily: style.fontFamily || 'Roboto, sans-serif',
        fontWeight: style.fontWeight || 'normal',
        fontStyle: style.fontStyle || 'normal',
        color: config.color || style.textColor || '#FFFFFF',
        textAlign: config.textAlign || style.textAlign || 'left',
        hideSelector: config.hideSelector || `.drawing[data-id="${drawing.id}"] text`,
        editorBackground: config.editorBackground,
        editorPadding: config.editorPadding,
        editorBorder: config.editorBorder,
        editorBorderRadius: config.editorBorderRadius,
        placeholderMode: config.placeholderMode,
        placeholderColor: config.placeholderColor,
        onInput: config.onInput,
        ...buildWrapAwareInlineEditorOptions(drawing, bbox, padding),
        ...(config.focusOpts || {}),
        ...config.extra
    };
}

/** Inline editor options aligned with the on-chart note box. */
function buildNoteInlineEditorOptions(drawing, bbox, extra = {}) {
    const style = drawing.style || {};
    const chart = drawing.chart;
    const scales = chart ? { chart, xScale: chart.xScale, yScale: chart.yScale } : {};
    const scaleFactor = (typeof drawing.getZoomScaleFactor === 'function')
        ? drawing.getZoomScaleFactor(scales)
        : 1;
    const scaledFontSize = Math.max(8, (style.fontSize || 12) * scaleFactor);
    const noteDisplay = resolveTextToolDisplay(drawing.text);
    const initialText = extra.initialText != null ? extra.initialText : '';
    const { boxFill, boxStroke, borderOn } = resolveNoteBoxStyle(style);
    const typedColor = (style.textColor && style.textColor !== 'none') ? style.textColor : '#FFFFFF';
    const hideSelector = `.drawing[data-id="${drawing.id}"] > text.inline-editable-text, .drawing[data-id="${drawing.id}"] > rect.note-body-hit`;
    const notePadding = 6;
    const opts = {
        inline: true,
        placeholderMode: !String(initialText).trim(),
        fontSize: `${scaledFontSize}px`,
        fontFamily: style.fontFamily || 'Roboto, sans-serif',
        fontWeight: style.fontWeight || 'normal',
        fontStyle: style.fontStyle || 'normal',
        color: typedColor,
        placeholderColor: TEXT_TOOL_PLACEHOLDER_COLOR,
        textAlign: 'left',
        hideSelector,
        editorBackground: boxFill,
        editorPadding: '6px 8px',
        editorBorder: borderOn ? `1px solid ${boxStroke}` : 'none',
        editorBorderRadius: '4px',
        ...buildWrapAwareInlineEditorOptions(drawing, bbox, notePadding),
        ...(extra.focusOpts || {}),
        ...extra
    };
    return opts;
}

/**
 * Inline editor onSave: keep drawing when user clicks away without typing.
 * Delete only when confirmed (Enter) with empty/placeholder text.
 */
function openTextAnnotationSettings(drawing, event) {
    if (!drawing || drawing.locked) return;
    if (event) {
        event.stopPropagation();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }
    const manager = drawing.chart && drawing.chart.drawingManager;
    if (!manager || typeof manager.editDrawing !== 'function') return;
    if (typeof manager.selectDrawing === 'function') {
        manager.selectDrawing(drawing);
    }
    manager.editDrawing(drawing, event && event.pageX, event && event.pageY);
}

/** Keep resize handles aligned during live text redraws (no handle DOM teardown). */
function syncTextHandlePositions(group, bbox) {
    if (!group || group.empty() || !bbox) return false;
    const existing = group.selectAll('.resize-handle-group');
    if (existing.empty()) return false;
    const minX = bbox.x;
    const maxX = bbox.x + bbox.width;
    const minY = bbox.y;
    const maxY = bbox.y + bbox.height;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const roles = [
        { x: minX, y: minY, role: 'corner-tl' },
        { x: maxX, y: minY, role: 'corner-tr' },
        { x: maxX, y: maxY, role: 'corner-br' },
        { x: minX, y: maxY, role: 'corner-bl' },
        { x: midX, y: minY, role: 'side-top' },
        { x: maxX, y: midY, role: 'side-right' },
        { x: midX, y: maxY, role: 'side-bottom' },
        { x: minX, y: midY, role: 'side-left' }
    ];
    roles.forEach((pos) => {
        const hg = group.select(`.resize-handle-group[data-handle-role="${pos.role}"]`);
        if (hg.empty()) return;
        hg.selectAll('circle').attr('cx', pos.x).attr('cy', pos.y);
    });
    return true;
}

function scheduleTextAnnotationLiveRender(drawing) {
    if (!drawing) return;
    const manager = drawing.chart && drawing.chart.drawingManager;
    if (manager && typeof manager.scheduleRenderDrawing === 'function') {
        manager.scheduleRenderDrawing(drawing);
        return;
    }
    if (drawing._lastContainer && drawing._lastScales) {
        const liveOpts = {
            reuseGroup: !!(drawing.group && !drawing.group.empty()),
            skipHandles: true
        };
        drawing.render(drawing._lastContainer, drawing._lastScales, liveOpts);
        if (drawing.bbox) syncTextHandlePositions(drawing.group, drawing.bbox);
    }
}

function beginTextAnnotationInlineEdit(drawing) {
    const manager = drawing && drawing.chart && drawing.chart.drawingManager;
    if (manager && typeof manager.beginTextInlineEdit === 'function') {
        manager.beginTextInlineEdit(drawing);
    } else if (drawing) {
        drawing._inlineTextEditing = true;
    }
}

function endTextAnnotationInlineEdit(drawing) {
    const manager = drawing && drawing.chart && drawing.chart.drawingManager;
    if (manager && typeof manager.endTextInlineEdit === 'function') {
        manager.endTextInlineEdit(drawing);
    } else if (drawing) {
        drawing._inlineTextEditing = false;
    }
}

function createInlineTextSaveHandler(drawing) {
    return (newText, confirmed = false) => {
        const manager = drawing.chart && drawing.chart.drawingManager;
        endTextAnnotationInlineEdit(drawing);
        const normalized = (newText || '').replace(/\r\n/g, '\n');
        const empty = isTextToolPlaceholder(normalized);
        if (empty) {
            if (confirmed && manager && typeof manager.deleteDrawing === 'function') {
                manager.deleteDrawing(drawing);
                return;
            }
            drawing.setText('');
            if (manager && typeof manager.renderDrawing === 'function') {
                manager.renderDrawing(drawing);
            } else if (drawing.chart) {
                drawing.chart.render();
            }
            return;
        }
        drawing.setText(normalized);
        if (manager && typeof manager.renderDrawing === 'function') {
            manager.renderDrawing(drawing);
        } else if (drawing.chart) {
            drawing.chart.render();
        }
        if (typeof window !== 'undefined') {
            try {
                window.dispatchEvent(new CustomEvent('v9TxtDrawingContentChanged', {
                    detail: { id: drawing.id, text: normalized },
                }));
            } catch (_) {}
        }
    };
}

/** Timestamp double-click: select when unselected, edit only when already selected. */
function handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, minMs, maxMs, onEdit) {
    if (timeSinceLastClick >= maxMs || timeSinceLastClick <= minMs) {
        return false;
    }
    if (self.locked) {
        return true;
    }
    const manager = self.chart && self.chart.drawingManager;
    if (self.selected) {
        if (typeof onEdit === 'function') {
            onEdit();
        }
    } else if (manager && typeof manager.selectDrawing === 'function') {
        manager.selectDrawing(self);
        document.body.classList.add('text-selected');
    }
    return true;
}

function inlineEditorFocusOptions(event, selectAll) {
    if (selectAll) {
        return { selectAllOnFocus: true };
    }
    if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return {
            selectAllOnFocus: false,
            focusClientX: event.clientX,
            focusClientY: event.clientY
        };
    }
    return { selectAllOnFocus: false, focusAtEnd: true };
}

/** If this drawing is already in inline edit, move caret and skip reopening the editor. */
function prepareTextInlineEditFocus(drawing, event, selectAll) {
    const manager = drawing && drawing.chart && drawing.chart.drawingManager;
    if (manager && manager._textInlineEditDrawing === drawing) {
        const editor = manager.textEditor;
        const field = (editor && editor.editor && !editor.editor.empty())
            ? editor.editor.select('.inline-text-editor-field').node()
            : null;
        if (field) {
            if (typeof editor._focusEditableField === 'function') {
                if (selectAll) {
                    editor._focusEditableField(field, { selectAll: true });
                } else if (event && typeof event.clientX === 'number') {
                    editor._focusEditableField(field, { clientX: event.clientX, clientY: event.clientY });
                } else {
                    editor._focusEditableField(field, { atEnd: true });
                }
            } else {
                field.focus();
            }
            return null;
        }
    }
    beginTextAnnotationInlineEdit(drawing);
    return inlineEditorFocusOptions(event, selectAll);
}

// ============================================================================
// Text Tool
// ============================================================================
class TextTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('text', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        this.style.textAlign = style.textAlign || 'left';
        this.style.wrapText = !!style.wrapText;
        this.style.anchored = !!style.anchored;
        this.style.maxWidth = style.maxWidth || 200;
        this.style.anchorLength = style.anchorLength || 24;
        // Store base scale for chart zoom scaling
        this.baseScale = null;
    }

    /** Word-wrap plain text to fit maxWidth (px); preserves explicit newlines. */
    static wrapTextLines(rawText, maxWidth, fontSize, fontFamily, fontWeight, fontStyle) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${fontStyle || 'normal'} ${fontWeight || 'normal'} ${fontSize}px ${fontFamily || 'Roboto, sans-serif'}`;
        const measure = (str) => {
            try { return ctx.measureText(str || '').width; } catch (e) { return (str || '').length * fontSize * 0.55; }
        };
        const breakToken = (token) => {
            const chunks = [];
            let chunk = '';
            for (const ch of token) {
                const test = chunk + ch;
                if (measure(test) > maxWidth && chunk) {
                    chunks.push(chunk);
                    chunk = ch;
                } else {
                    chunk = test;
                }
            }
            if (chunk) chunks.push(chunk);
            return chunks.length ? chunks : [''];
        };
        const out = [];
        const paragraphs = String(rawText || '').split('\n');
        paragraphs.forEach((para) => {
            const words = para.split(/\s+/).filter((w) => w.length > 0);
            if (!words.length) {
                out.push('');
                return;
            }
            let line = '';
            words.forEach((word) => {
                const tokens = measure(word) > maxWidth ? breakToken(word) : [word];
                tokens.forEach((token) => {
                    const test = line ? `${line} ${token}` : token;
                    if (measure(test) > maxWidth && line) {
                        out.push(line);
                        line = token;
                    } else {
                        line = test;
                    }
                });
            });
            if (line) out.push(line);
        });
        return out.length ? out : [''];
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        // Remove existing if any
        if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling (same as other tools)
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(6, this.style.fontSize * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing text', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        if (this.style.anchored) {
            const anchorLen = (this.style.anchorLength || 24) * scaleFactor;
            const anchorColor = (this.style.stroke && this.style.stroke !== 'none')
                ? this.style.stroke
                : (this.style.textColor || '#787b86');
            this.group.append('line')
                .attr('class', 'text-anchor-stem')
                .attr('x1', x)
                .attr('y1', y)
                .attr('x2', x)
                .attr('y2', y + anchorLen)
                .attr('stroke', anchorColor)
                .attr('stroke-width', Math.max(1, 1.5 * scaleFactor))
                .attr('stroke-linecap', 'round')
                .style('pointer-events', 'none');
            this.group.append('circle')
                .attr('class', 'text-anchor-dot')
                .attr('cx', x)
                .attr('cy', y + anchorLen)
                .attr('r', Math.max(2, 3 * scaleFactor))
                .attr('fill', anchorColor)
                .style('pointer-events', 'none');
        }

        // Draw the text with scaled font size (no transform locking)
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', x)
            .attr('y', y)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'start')
            .attr('xml:space', 'preserve')
            .style('pointer-events', 'all')
            .style('cursor', this.selected ? 'text' : 'move')
            .style('user-select', 'none');

        const lineHeight = scaledFontSize * 1.2;
        const maxWrapWidth = Math.max(40, (this.style.maxWidth || 200) * scaleFactor);
        const display = resolveTextToolDisplay(this.text);
        if (display.isPlaceholder) {
            const phBg = this.style.fill && this.style.fill !== 'none' ? this.style.fill : null;
            textElement.attr('fill', resolveAnnotationTextFill(this.style.textColor, phBg, true));
        }
        const lines = this.style.wrapText
            ? TextTool.wrapTextLines(
                display.text,
                maxWrapWidth,
                scaledFontSize,
                this.style.fontFamily,
                this.style.fontWeight,
                this.style.fontStyle
            )
            : display.text.split('\n');
        lines.forEach((line, index) => {
            const sanitizedLine = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
            textElement.append('tspan')
                .attr('x', x)
                .attr('dy', index === 0 ? 0 : lineHeight)
                .text(sanitizedLine);
        });

        // Keep the left edge of the text fixed at x regardless of alignment.
        // Measure width first (with text-anchor:start), then shift the anchor.
        if (this.style.textAlign === 'center' || this.style.textAlign === 'right') {
            let textWidth = 0;
            try { textWidth = textElement.node().getBBox().width; } catch (e) {}
            const anchorX = this.style.textAlign === 'center' ? x + textWidth / 2 : x + textWidth;
            const textAnchor = this.style.textAlign === 'center' ? 'middle' : 'end';
            textElement.attr('x', anchorX).attr('text-anchor', textAnchor);
            textElement.selectAll('tspan').attr('x', anchorX);
        }

        // Add optional text shadow for better readability (disabled by default)
        if (this.style.textShadow === true) {
            textElement.style('text-shadow', '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)');
        }

        // Get text bounding box for handles
        const textNode = textElement.node();
        let bbox;
        try {
            bbox = textNode.getBBox();
        } catch (e) {
            bbox = { x: x, y: y - scaledFontSize, width: 50, height: scaledFontSize * 1.2 };
        }
        
        // Add background rectangle if enabled
        const padding = 6;
        const hasBackground = this.style.fill && this.style.fill !== 'none' && this.style.fill !== 'transparent';
        const hasBorder = this.style.stroke && this.style.stroke !== 'none';
        
        if (hasBackground || hasBorder) {
            this.group.insert('rect', 'text')
                .attr('class', hasBackground ? 'text-background' : 'text-border')
                .attr('x', bbox.x - padding)
                .attr('y', bbox.y - padding)
                .attr('width', bbox.width + padding * 2)
                .attr('height', bbox.height + padding * 2)
                .attr('rx', 4)
                .attr('ry', 4)
                .attr('fill', hasBackground ? this.style.fill : 'none')
                .attr('stroke', hasBorder ? this.style.stroke : 'none')
                .attr('stroke-width', hasBorder ? 1 : 0)
                .style('pointer-events', 'none');
            
            // Expand bbox to include padding
            bbox = {
                x: bbox.x - padding,
                y: bbox.y - padding,
                width: bbox.width + padding * 2,
                height: bbox.height + padding * 2
            };
        } else {
            // Always add some padding to bbox for handle positioning even without border/background
            bbox = {
                x: bbox.x - padding,
                y: bbox.y - padding,
                width: bbox.width + padding * 2,
                height: bbox.height + padding * 2
            };
        }
        
        // Store bbox for handle creation
        this.bbox = bbox;

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, bbox.x, bbox.y, bbox.width, bbox.height);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        // Store for live-update during inline editing
        this._lastContainer = container;
        this._lastScales = scales;

        const bodyHitArea = this.group.insert('rect', 'text')
            .attr('class', 'shape-border-hit text-body-hit')
            .attr('x', bbox.x)
            .attr('y', bbox.y)
            .attr('width', bbox.width)
            .attr('height', bbox.height)
            .attr('fill', 'transparent')
            .attr('stroke', this.selected && !hasBorder ? '#2962FF' : 'none')
            .attr('stroke-width', this.selected && !hasBorder ? 1 : 0)
            .attr('stroke-dasharray', this.selected && !hasBorder ? '4,3' : 'none')
            .attr('rx', 4)
            .attr('ry', 4)
            .style('pointer-events', 'all')
            .style('cursor', this.selected ? 'text' : 'move');

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
            moved = false;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            // Resolve live element — selectDrawing re-renders so captured node may be detached
            const liveNode = (self.group && typeof self.group.select === 'function')
                ? self.group.select('text.inline-editable-text').node()
                : null;
            const targetNode = (liveNode && document.contains(liveNode))
                ? liveNode : textElement.node();
            const posNode = resolveTextAnnotationEditBoxNode(self, targetNode);
            const rect = posNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter text…',
                buildStandardInlineEditorOptions(self, rect, {
                    focusOpts,
                    padding,
                    color: self.style.textColor,
                    textAlign: self.style.textAlign || 'left',
                    editorBackground: hasBackground ? self.style.fill : undefined,
                    editorPadding: hasBackground ? '6px 8px' : undefined,
                    editorBorder: hasBorder ? `1px solid ${self.style.stroke}` : undefined,
                    editorBorderRadius: hasBackground ? '4px' : undefined,
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
        };

        const handleSingleClick = function(event) {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            // Double-click detection via timestamps stored on instance (survives re-renders)
            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            // 1st click on unselected → select only
            if (!self.selected) {
                const manager = self.chart && self.chart.drawingManager;
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                }
                return;
            }

            // Already selected → open inline editor after delay (cursor at click — continue typing)
            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit(event, false);
            }, CLICK_DELAY);
        };

        const handleTextDblClickEdit = function(event) {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const handleBodyClick = function(event) {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                }
            }
        };

        const handleHitDblClickSettings = function(event) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const textDblClickNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            textDblClickNodes.push(this);
        });
        textDblClickNodes.forEach((node) => {
            if (!node) return;
            node.addEventListener('mousedown', handleMouseDown, true);
            node.addEventListener('click', handleSingleClick, true);
            node.addEventListener('dblclick', handleTextDblClickEdit, true);
        });

        if (bodyHitArea && bodyHitArea.node()) {
            bodyHitArea.node().addEventListener('mousedown', handleMouseDown, true);
            bodyHitArea.node().addEventListener('click', handleBodyClick, true);
            bodyHitArea.node().addEventListener('dblclick', handleHitDblClickSettings, true);
        }

        // Plain text: move/select only — font size via toolbar, not corner handles.
        this.group.selectAll('.resize-handle, .resize-handle-group, .resize-handle-hit').remove();
        this.handles = [];

        return this.group;
    }

    _shouldCreateHandles(opts = {}) {
        return false;
    }

    _syncTextHandlePositions(group, bbox) {
        if (!syncTextHandlePositions(group, bbox)) {
            this.createTextHandles(group, bbox);
        }
    }

    /**
     * Create 8-point resize handles for text (4 corners + 4 sides) like rectangle
     */
    createTextHandles(group, bbox) {
        const handleRadius = 3;  // Visual handle size
        const hitRadius = 12;    // Larger hit area for easier clicking
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        const minX = bbox.x;
        const maxX = bbox.x + bbox.width;
        const minY = bbox.y;
        const maxY = bbox.y + bbox.height;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        
        // Define 8 handle positions: 4 corners + 4 sides
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            // Invisible larger hit area for easier clicking - only active when selected
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', pos.cursor)
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            // Visual handle circle (white fill, blue outline)
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('opacity', this.selected ? 1 : 0)  // Only visible when selected
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });
    }

    /**
     * Begin handle drag - store initial state
     */
    beginHandleDrag(handleRole, context) {
        this.dragStartFontSize = this.style.fontSize || 14;
        this.dragStartScreenX = context.screen.x;
        this.dragStartScreenY = context.screen.y;
        // Fallback bbox if not set
        this.dragStartBbox = this.bbox ? { ...this.bbox } : { x: 0, y: 0, width: 100, height: 50 };
        this.dragHandleRole = handleRole;
    }

    /**
     * Handle custom handle drag for resizing (like rectangle)
     */
    handleCustomHandleDrag(handleRole, context) {
        if (this.dragStartFontSize === undefined || !this.dragStartBbox) {
            return;
        }

        const deltaX = context.screen.x - this.dragStartScreenX;
        const deltaY = context.screen.y - this.dragStartScreenY;
        const role = this.dragHandleRole || handleRole;
        
        // Calculate scale factor based on handle role and drag direction
        let scaleFactor = 1;
        const bbox = this.dragStartBbox;
        
        if (role === 'corner-br' || role === 'corner-tr') {
            // Right corners: expand right = bigger
            const newWidth = bbox.width + deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'corner-bl' || role === 'corner-tl') {
            // Left corners: expand left = bigger
            const newWidth = bbox.width - deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-right') {
            // Right side: expand right = bigger
            const newWidth = bbox.width + deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-left') {
            // Left side: expand left = bigger
            const newWidth = bbox.width - deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-bottom') {
            // Bottom side: expand down = bigger
            const newHeight = bbox.height + deltaY;
            scaleFactor = newHeight / bbox.height;
        } else if (role === 'side-top') {
            // Top side: expand up = bigger
            const newHeight = bbox.height - deltaY;
            scaleFactor = newHeight / bbox.height;
        }
        
        // Apply scale to font size
        scaleFactor = Math.max(0.2, Math.min(5, scaleFactor)); // Clamp scale
        const newFontSize = Math.max(8, Math.min(200, Math.round(this.dragStartFontSize * scaleFactor)));
        
        this.style.fontSize = newFontSize;
    }

    /**
     * End handle drag - clean up
     */
    endHandleDrag(handleRole, context) {
        this.dragStartFontSize = undefined;
        this.dragStartScreenX = undefined;
        this.dragStartScreenY = undefined;
        this.dragStartBbox = null;
        this.dragHandleRole = null;
    }

    /**
     * Update text content
     */
    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    deselect() {
        document.body.classList.remove('text-selected');
        super.deselect();
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text,
            baseScale: this.baseScale
        };
    }

    static fromJSON(data, chart) {
        const text = new TextTool(data.points, data.style, data.text);
        text.id = data.id;
        text.visible = data.visible;
        text.meta = data.meta;
        text.baseScale = data.baseScale || null;
        text.chart = chart; // Set chart reference for multi-timeframe support
        return text;
    }
}

// ============================================================================
// Note Box Tool (Text with background)
// ============================================================================
class NoteBoxTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('notebox', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.backgroundColor = style.backgroundColor || 'rgba(41, 98, 255, 0.9)';
        this.style.padding = style.padding || 8;
        this.style.borderRadius = style.borderRadius || 4;
        this.style.maxWidth = style.maxWidth || 200;
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        if (this.points.length < 1) return;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing notebox', renderOpts);
        this._clearDrawingLabels(scales);

        this._lastContainer = container;
        this._lastScales = scales;

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        const noteboxDisplay = resolveTextToolDisplay(this.text);
        const padding = this.style.padding || 8;
        const maxBubbleWidth = this.style.maxWidth || 200;
        const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);

        const _nbCanvas = document.createElement('canvas');
        const _nbCtx = _nbCanvas.getContext('2d');
        _nbCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily || 'Roboto, sans-serif'}`;
        const measureWidth = (str) => {
            try { return _nbCtx.measureText(str || '').width || ((str || '').length * scaledFontSize * 0.6); }
            catch (e) { return (str || '').length * scaledFontSize * 0.6; }
        };

        const splitLines = (rawText) => {
            const lines = String(rawText || '').split('\n');
            return lines.length ? lines : [''];
        };
        const lines = this.style.wrapText
            ? TextTool.wrapTextLines(
                noteboxDisplay.text,
                innerMaxW,
                scaledFontSize,
                this.style.fontFamily || 'Roboto, sans-serif',
                this.style.fontWeight || 'normal',
                this.style.fontStyle || 'normal'
            )
            : splitLines(noteboxDisplay.text);
        const lineHeight = scaledFontSize * 1.2;
        let maxLineWidth = 40;
        lines.forEach((line) => {
            const w = measureWidth(line || ' ');
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const boxWidth = this.style.wrapText
            ? Math.max(Math.min(maxLineWidth + padding * 2, maxBubbleWidth), 60)
            : Math.max(maxLineWidth + padding * 2, 60);
        const boxHeight = Math.max(lines.length * lineHeight + padding * 2, scaledFontSize + padding);
        const boxX = x;
        const boxY = y - boxHeight;

        const box = this.group.append('rect')
            .attr('class', 'note-body-hit text-body-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.backgroundColor)
            .attr('rx', this.style.borderRadius)
            .attr('stroke', this.style.stroke || 'none')
            .attr('stroke-width', this.style.strokeWidth || 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', this.style.borderRadius)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', boxX + padding)
            .attr('y', boxY + padding + scaledFontSize)
            .attr('fill', resolveAnnotationTextFill(this.style.textColor, this.style.backgroundColor, noteboxDisplay.isPlaceholder))
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('dominant-baseline', 'alphabetic')
            .style('pointer-events', 'all')
            .style('cursor', 'text')
            .style('user-select', 'none');

        lines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', boxX + padding)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, boxX, boxY, boxWidth, boxHeight);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        this.bbox = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

        if (this._shouldCreateHandles(renderOpts)) {
            this.createTextHandles(this.group, this.bbox);
        } else if (this.bbox) {
            this._syncTextHandlePositions(this.group, this.bbox);
        }

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            const posNode = resolveTextAnnotationEditBoxNode(self, textElement.node());
            const rect = posNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const hasBorder = self.style.stroke && self.style.stroke !== 'none';
            editor.show(
                editX,
                editY,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter note text…',
                buildStandardInlineEditorOptions(self, rect, {
                    focusOpts,
                    padding,
                    color: self.style.textColor,
                    textAlign: 'left',
                    editorBackground: self.style.backgroundColor,
                    editorPadding: '6px 8px',
                    editorBorder: hasBorder ? `1px solid ${self.style.stroke}` : 'none',
                    editorBorderRadius: '4px',
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
        };

        const handleTextClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleBodyClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
            }
        };

        const handleOpenSettings = (event) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextDblClickEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const noteboxTextNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            noteboxTextNodes.push(this);
        });
        noteboxTextNodes.forEach((n) => {
            if (!n) return;
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleTextClick, true);
            n.addEventListener('dblclick', handleTextDblClickEdit, true);
        });

        const borderHitNode = this.group.select('.shape-border-hit').node();

        box.node().addEventListener('mousedown', handleMouseDown, true);
        box.node().addEventListener('click', handleBodyClick, true);
        box.node().addEventListener('dblclick', handleOpenSettings, true);
        if (borderHitNode) {
            borderHitNode.addEventListener('mousedown', handleMouseDown, true);
            borderHitNode.addEventListener('click', handleBodyClick, true);
            borderHitNode.addEventListener('dblclick', handleOpenSettings, true);
        }

        return this.group;
    }

    _syncTextHandlePositions(group, bbox) {
        if (!syncTextHandlePositions(group, bbox)) {
            this.createTextHandles(group, bbox);
        }
    }

    /**
     * Create 8-point resize handles for notebox (4 corners + 4 sides) like rectangle
     */
    createTextHandles(group, bbox) {
        const handleRadius = 2.5;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.custom-handle').remove();
        
        const minX = bbox.x;
        const maxX = bbox.x + bbox.width;
        const minY = bbox.y;
        const maxY = bbox.y + bbox.height;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        
        // Define 8 handle positions: 4 corners + 4 sides
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'custom-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });
    }

    /**
     * Begin handle drag - store initial state
     */
    beginHandleDrag(handleRole, context) {
        this.dragStartFontSize = this.style.fontSize;
        this.dragStartScreenY = context.screen.y;
    }

    /**
     * Handle custom handle drag for resizing
     */
    handleCustomHandleDrag(handleRole, context) {
        if (this.dragStartFontSize === undefined) return;

        // Calculate screen distance moved
        const deltaY = context.screen.y - this.dragStartScreenY;
        
        // Convert to font size change (moving UP = bigger, down = smaller)
        // Negative deltaY because screen Y increases downward
        const fontSizeChange = -deltaY * 0.3;
        const newFontSize = Math.max(8, Math.min(200, this.dragStartFontSize + fontSizeChange));
        
        this.style.fontSize = Math.round(newFontSize);
    }

    /**
     * End handle drag - clean up
     */
    endHandleDrag(handleRole, context) {
        this.dragStartFontSize = undefined;
        this.dragStartScreenY = undefined;
    }

    /**
     * Update text content
     */
    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text
        };
    }

    static fromJSON(data, chart) {
        const note = new NoteBoxTool(data.points, data.style, data.text);
        note.id = data.id;
        note.visible = data.visible;
        note.meta = data.meta;
        note.chart = chart; // Set chart reference for multi-timeframe support
        return note;
    }
}

// ============================================================================
// Anchored Text Tool - Text with anchor arrow
// ============================================================================
class AnchoredTextTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Anchored Text') {
        super('anchored-text', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.backgroundColor = style.backgroundColor || 'rgba(41, 98, 255, 0.9)';
        this.style.borderColor = style.borderColor || '#B2B5BE';
        this.style.anchorLength = style.anchorLength || 30;
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
        if (this.style.maxWidth === undefined) this.style.maxWidth = style.maxWidth || 200;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        if (this.points.length < 1) return;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);
        const scaledAnchorLen = (this.style.anchorLength || 30) * scaleFactor;

        this._prepareRenderGroup(container, 'drawing anchored-text', renderOpts);
        this._clearDrawingLabels(scales);

        this._lastContainer = container;
        this._lastScales = scales;

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        this.group.append('line')
            .attr('x1', x).attr('y1', y)
            .attr('x2', x).attr('y2', y - scaledAnchorLen)
            .attr('stroke', this.style.stroke || '#787b86')
            .attr('stroke-width', 2);

        this.group.append('circle')
            .attr('cx', x).attr('cy', y)
            .attr('r', 4)
            .attr('fill', this.style.stroke || '#787b86');

        const padding = 6;
        const maxBubbleWidth = this.style.maxWidth || 200;
        const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);
        const anchoredDisplay = resolveTextToolDisplay(this.text);

        const _atCanvas = document.createElement('canvas');
        const _atCtx = _atCanvas.getContext('2d');
        _atCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily || 'Roboto, sans-serif'}`;
        const measureWidth = (str) => {
            try { return _atCtx.measureText(str || '').width || ((str || '').length * scaledFontSize * 0.6); }
            catch (e) { return (str || '').length * scaledFontSize * 0.6; }
        };

        const splitLines = (rawText) => {
            const lines = String(rawText || '').split('\n');
            return lines.length ? lines : [''];
        };
        const lines = this.style.wrapText
            ? TextTool.wrapTextLines(
                anchoredDisplay.text,
                innerMaxW,
                scaledFontSize,
                this.style.fontFamily || 'Roboto, sans-serif',
                this.style.fontWeight || 'normal',
                this.style.fontStyle || 'normal'
            )
            : splitLines(anchoredDisplay.text);
        const lineHeight = scaledFontSize * 1.2;
        let maxLineWidth = 40;
        lines.forEach((line) => {
            const w = measureWidth(line || ' ');
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const boxWidth = this.style.wrapText
            ? Math.max(Math.min(maxLineWidth + padding * 2, maxBubbleWidth), 60)
            : Math.max(maxLineWidth + padding * 2, 60);
        const boxHeight = Math.max(lines.length * lineHeight + padding * 2, scaledFontSize + padding);
        const boxX = x - boxWidth / 2;
        const boxY = y - scaledAnchorLen - boxHeight;

        const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
        const background = this.group.append('rect')
            .attr('class', 'note-body-hit text-body-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.backgroundColor)
            .attr('rx', 4)
            .attr('stroke', hasBorder ? this.style.borderColor : 'none')
            .attr('stroke-width', hasBorder ? 1 : 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 4)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const textStartY = boxY + padding + scaledFontSize;
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', x)
            .attr('y', textStartY)
            .attr('fill', resolveAnnotationTextFill(this.style.textColor, this.style.backgroundColor, anchoredDisplay.isPlaceholder))
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        lines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', x)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, boxX, boxY, boxWidth, boxHeight);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        this.bbox = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            const posNode = resolveTextAnnotationEditBoxNode(self, textElement.node());
            const rect = posNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter text…',
                buildStandardInlineEditorOptions(self, rect, {
                    focusOpts,
                    padding,
                    color: self.style.textColor,
                    textAlign: 'center',
                    editorBackground: self.style.backgroundColor,
                    editorPadding: '6px 8px',
                    editorBorder: hasBorder ? `1px solid ${self.style.borderColor}` : 'none',
                    editorBorderRadius: '4px',
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
        };

        const handleTextClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleBodyClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
            }
        };

        const handleOpenSettings = (event) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextDblClickEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const anchoredTextHitNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            anchoredTextHitNodes.push(this);
        });
        anchoredTextHitNodes.forEach((n) => {
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleTextClick, true);
            n.addEventListener('dblclick', handleTextDblClickEdit, true);
        });
        if (background && background.node()) {
            background.node().addEventListener('mousedown', handleMouseDown, true);
            background.node().addEventListener('click', handleBodyClick, true);
            background.node().addEventListener('dblclick', handleOpenSettings, true);
        }
        const anchoredBorderHit = this.group.select('.shape-border-hit').node();
        if (anchoredBorderHit) {
            anchoredBorderHit.addEventListener('dblclick', handleOpenSettings, true);
        }

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new AnchoredTextTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

/** Start moving an annotation when the user drags from its text/box (not only the leader line). */
function v9StartAnnotationDragFromTextPointer(self, event) {
    const manager = self.chart && self.chart.drawingManager;
    if (!manager || typeof manager.startDrag !== 'function' || self.locked) return false;
    if (!self.selected && typeof manager.selectDrawing === 'function') {
        manager.selectDrawing(self);
    }
    manager.startDrag(self, event);
    return true;
}

// ============================================================================
// Note Tool - Line with text box at end point (like TradingView callout)
// ============================================================================
class NoteTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('note', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 1;
        // Use fill for background color (UI uses fill)
        this.style.fill = style.fill || style.backgroundColor || 'rgba(50, 50, 50, 0.9)';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
        if (this.style.maxWidth === undefined) this.style.maxWidth = style.maxWidth || 260;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing note', renderOpts);
        this._clearDrawingLabels(scales);

        // Store for live-update during inline editing
        this._lastContainer = container;
        this._lastScales = scales;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const noteDisplay = resolveTextToolDisplay(this.text);
        const { lineStroke, boxFill, boxStroke, borderOn } = resolveNoteBoxStyle(this.style);

        // Invisible hit area for easier selection (rendered first, behind visible line)
        const noteLineHitEl = this.group.append('line')
            .attr('class', 'note-line-hit shape-border-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 20)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw the visible line
        const noteLineEl = this.group.append('line')
            .attr('class', 'note-line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', lineStroke)
            .attr('stroke-width', scaledStrokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Text box at end point (p2)
        const padding = 6;
        const noteMaxWidth = this.style.maxWidth || 260;

        // Helper: measure single-line text width via canvas (reliable, no DOM dependency)
        const _nCanvas = document.createElement('canvas');
        const _nCtx = _nCanvas.getContext('2d');
        _nCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily || 'Arial, sans-serif'}`;
        const measureWidth = (str) => {
            try { return _nCtx.measureText(str || '').width || ((str || '').length * scaledFontSize * 0.6); }
            catch(e) { return (str || '').length * scaledFontSize * 0.6; }
        };

        // Word-wrap or explicit newlines
        const innerMaxW = Math.max(20, noteMaxWidth - padding * 2);
        const wrappedLines = this.style.wrapText
            ? TextTool.wrapTextLines(
                noteDisplay.text,
                innerMaxW,
                scaledFontSize,
                this.style.fontFamily || 'Arial, sans-serif',
                this.style.fontWeight || 'normal',
                this.style.fontStyle || 'normal'
            )
            : noteDisplay.text.split('\n');
        const lineHeight = scaledFontSize * 1.3;
        const totalTextHeight = wrappedLines.length * lineHeight;

        // Measure actual max line width
        let maxLineWidth = 60;
        wrappedLines.forEach(line => {
            const w = measureWidth(line || ' ');
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const boxWidth = this.style.wrapText
            ? Math.max(Math.min(maxLineWidth + padding * 2, noteMaxWidth), 60)
            : Math.max(maxLineWidth + padding * 2, 60);
        const boxHeight = totalTextHeight + padding * 2;

        // Position box so its nearest edge always touches p2, regardless of line direction
        const _dx = x2 - x1;
        const _dy = y2 - y1;
        const _len = Math.hypot(_dx, _dy);
        const _ux = _len > 0 ? _dx / _len : 1;
        const _uy = _len > 0 ? _dy / _len : 0;
        const _tEdgeX = Math.abs(_ux) > 1e-9 ? (boxWidth  / 2) / Math.abs(_ux) : Infinity;
        const _tEdgeY = Math.abs(_uy) > 1e-9 ? (boxHeight / 2) / Math.abs(_uy) : Infinity;
        const _tEdge  = Math.min(_tEdgeX, _tEdgeY);
        const _labelCX = x2 + _ux * _tEdge;
        const _labelCY = y2 + _uy * _tEdge;
        const boxX = _labelCX - boxWidth  / 2;
        const boxY = _labelCY - boxHeight / 2;

        // Line ends exactly at p2, which is now the near edge mid-point of the box
        noteLineEl.attr('x2', x2).attr('y2', y2);
        noteLineHitEl.attr('x2', x2).attr('y2', y2);

        // Background rectangle - use fill for background color
        const textBox = this.group.append('rect')
            .attr('class', 'note-body-hit text-body-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', boxFill)
            .attr('rx', 4)
            .attr('stroke', boxStroke)
            .attr('stroke-width', borderOn ? 1 : 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        const textFill = noteDisplay.isPlaceholder
            ? TEXT_TOOL_PLACEHOLDER_COLOR
            : resolveAnnotationTextFill(this.style.textColor, boxFill, false);

        // Text with wrapped lines
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', boxX + padding)
            .attr('y', boxY + padding + scaledFontSize)
            .attr('fill', textFill)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        wrappedLines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', boxX + padding)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, boxX, boxY, boxWidth, boxHeight);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        // Add double-click to edit text inline using native addEventListener (won't be overwritten)
        const self = this;
        const openNoteInlineEditor = function(event, selectAll = false) {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            const helpers = (typeof window !== 'undefined' && window.DrawingTextHelpers) || null;
            const placeholderLabel = helpers ? helpers.TEXT_TOOL_PLACEHOLDER : 'Type here';
            const isPlaceholder = helpers
                ? helpers.isTextToolPlaceholder(self.text)
                : !String(self.text || '').trim();
            const initialText = isPlaceholder ? '' : (self.text || '');

            if (!editor || typeof editor.show !== 'function') {
                return false;
            }

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return true;

            const liveBox = (self.group && typeof self.group.select === 'function')
                ? self.group.select('rect.note-body-hit').node()
                : null;
            const liveText = (self.group && typeof self.group.select === 'function')
                ? self.group.select('text.inline-editable-text').node()
                : null;
            const posNode = (liveBox && document.contains(liveBox))
                ? liveBox
                : ((liveText && document.contains(liveText)) ? liveText : textBox.node());
            const bbox = posNode.getBoundingClientRect();
            if (bbox.width <= 0 && bbox.height <= 0) {
                return false;
            }

            editor.show(
                bbox.left + window.scrollX,
                bbox.top + window.scrollY,
                initialText,
                createInlineTextSaveHandler(self),
                placeholderLabel,
                buildNoteInlineEditorOptions(self, bbox, {
                    focusOpts,
                    initialText,
                    onInput: (newText) => {
                        const next = (newText || '').replace(/\r\n/g, '\n');
                        self.setText(helpers && helpers.isTextToolPlaceholder(next) ? '' : next);
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
            return true;
        };

        const startInlineEdit = function(event, selectAll = false) {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;

            if (editor && typeof editor.show === 'function') {
                if (!self.selected && manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => openNoteInlineEditor(event, selectAll));
                    });
                    return;
                }
                openNoteInlineEditor(event, selectAll);
                return;
            }

            // Remove any existing inline editor
            d3.select('.note-inline-editor').remove();
            
            // Get position of text box on screen
            const textBoxNode = textBox.node();
            const bbox = textBoxNode.getBoundingClientRect();
            
            // Create inline editor
            const editorEl = d3.select('body').append('div')
                .attr('class', 'note-inline-editor')
                .style('position', 'fixed')
                .style('left', bbox.left + 'px')
                .style('top', bbox.top + 'px')
                .style('width', Math.max(bbox.width, 120) + 'px')
                .style('min-height', bbox.height + 'px')
                .style('z-index', '10000')
                .style('background', self.style.fill || 'rgba(50, 50, 50, 0.95)')
                .style('border', '2px solid #2962ff')
                .style('border-radius', '4px')
                .style('padding', '4px 6px')
                .style('box-sizing', 'border-box');
            
            const input = editorEl.append('input')
                .attr('type', 'text')
                .attr('value', self.text || '')
                .attr('placeholder', 'Add text')
                .style('width', '100%')
                .style('background', 'transparent')
                .style('border', 'none')
                .style('outline', 'none')
                .style('color', self.style.textColor || '#ffffff')
                .style('font-size', (self.style.fontSize || 12) + 'px')
                .style('font-family', self.style.fontFamily || 'Roboto, sans-serif')
                .style('padding', '0')
                .style('margin', '0');
            
            const inputNode = input.node();
            inputNode.focus();
            inputNode.select();
            
            // Save function
            const saveAndClose = () => {
                const newText = inputNode.value.trim() || '';
                self.setText(newText);
                editorEl.remove();
                if (self.chart) self.chart.render();
            };
            
            // Handle Enter to save, Escape to cancel
            input.on('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAndClose();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    editorEl.remove();
                }
            });
            
            // Save on blur (clicking outside)
            input.on('blur', function() {
                setTimeout(saveAndClose, 100);
            });
        };

        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
            moved = false;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            moved = false;
            downPos = { x: event.clientX, y: event.clientY };
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const handleOpenSettings = function(event) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextClick = function(event) {
            event.stopPropagation();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            // Double-click (timestamp fallback when native dblclick is lost after re-render)
            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 20, 450, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            // Already selected: second single click opens edit (TradingView-style)
            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleTextDblClick = function(event) {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            self._lastClickTime = 0;
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const handleBodyClick = function(event) {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
            }
        };
        
        // 1st click = select; 2nd click or dblclick on text = edit; box/line dblclick = settings
        const noteTextHitNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            noteTextHitNodes.push(this);
        });
        noteTextHitNodes.forEach((node) => {
            if (!node) return;
            node.addEventListener('mousedown', handleMouseDown, true);
            node.addEventListener('click', handleTextClick, true);
            node.addEventListener('dblclick', handleTextDblClick, true);
        });

        if (textBox && textBox.node()) {
            const boxNode = textBox.node();
            boxNode.addEventListener('mousedown', handleMouseDown, true);
            boxNode.addEventListener('click', handleBodyClick, true);
            boxNode.addEventListener('dblclick', handleOpenSettings, true);
        }

        if (noteLineHitEl && noteLineHitEl.node()) {
            const lineNode = noteLineHitEl.node();
            lineNode.addEventListener('dblclick', handleOpenSettings, true);
        }

        // Create handles at both endpoints
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new NoteTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Price Note Tool - Line with price label at end point (2-point like TradingView)
// ============================================================================
class PriceNoteTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-note', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.borderColor = style.borderColor || 'none';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing price-note', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const noteLineHitEl = this.group.append('line')
            .attr('class', 'note-line-hit shape-border-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 20)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const lineStroke = (this.style.stroke && this.style.stroke !== 'none')
            ? this.style.stroke
            : (typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined' ? DRAWING_TOOL_DEFAULT_STROKE : '#2962ff');
        const noteLineEl = this.group.append('line')
            .attr('class', 'note-line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', lineStroke)
            .attr('stroke-width', scaledStrokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        const chart = scales.chart;
        let decimals = 5;
        if (chart && typeof chart.getPriceDecimals === 'function') {
            const dom = chart.yScale && chart.yScale.domain ? chart.yScale.domain() : null;
            const range = Array.isArray(dom) && dom.length === 2 ? Math.abs(dom[1] - dom[0]) : 0;
            const d = chart.getPriceDecimals(range);
            if (Number.isFinite(d) && d >= 0) decimals = d;
        }
        const priceText = Number.isFinite(p1.y) ? p1.y.toFixed(decimals) : '';

        const padding = 6;
        const _nCanvas = document.createElement('canvas');
        const _nCtx = _nCanvas.getContext('2d');
        _nCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily || 'Roboto, sans-serif'}`;
        let textWidth = 60;
        try {
            textWidth = _nCtx.measureText(priceText || '').width || ((priceText || '').length * scaledFontSize * 0.6);
        } catch (_) {
            textWidth = (priceText || '').length * scaledFontSize * 0.6;
        }

        const lineHeight = scaledFontSize * 1.3;
        const boxWidth = Math.max(textWidth + padding * 2, 60);
        const boxHeight = lineHeight + padding * 2;

        const _dx = x2 - x1;
        const _dy = y2 - y1;
        const _len = Math.hypot(_dx, _dy);
        const _ux = _len > 0 ? _dx / _len : 1;
        const _uy = _len > 0 ? _dy / _len : 0;
        const _tEdgeX = Math.abs(_ux) > 1e-9 ? (boxWidth / 2) / Math.abs(_ux) : Infinity;
        const _tEdgeY = Math.abs(_uy) > 1e-9 ? (boxHeight / 2) / Math.abs(_uy) : Infinity;
        const _tEdge = Math.min(_tEdgeX, _tEdgeY);
        const _labelCX = x2 + _ux * _tEdge;
        const _labelCY = y2 + _uy * _tEdge;
        const boxX = _labelCX - boxWidth / 2;
        const boxY = _labelCY - boxHeight / 2;

        noteLineEl.attr('x2', x2).attr('y2', y2);
        noteLineHitEl.attr('x2', x2).attr('y2', y2);

        const boxFill = (this.style.fill && this.style.fill !== 'none')
            ? this.style.fill
            : '#2962ff';
        const brd = this.style.borderColor;
        const hasLabelBorder = brd && brd !== 'none' && brd !== 'transparent';
        const boxStroke = hasLabelBorder ? brd : 'none';

        this.group.append('rect')
            .attr('class', 'note-body-hit text-body-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', boxFill)
            .attr('rx', 4)
            .attr('stroke', boxStroke)
            .attr('stroke-width', hasLabelBorder ? 1 : 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('text')
            .attr('class', 'price-note-text')
            .attr('x', boxX + boxWidth / 2)
            .attr('y', boxY + padding + scaledFontSize)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceNoteTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Pin Tool - Location marker with text box above (TradingView style)
// ============================================================================
class PinTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('pin', points, style);
        this.requiredPoints = 1;
        this.text = text || '';
        this.style.fill = style.fill || '#2962ff';
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.backgroundColor = style.backgroundColor || '#363a45';
        this.style.borderColor = style.borderColor || '#555';
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
        if (this.style.maxWidth === undefined) this.style.maxWidth = style.maxWidth || 180;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(11, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing pin', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Pin dimensions - classic location marker style
        const pinRadius = 12; // Radius of the circular bulb
        const pinHeight = 36; // Total height from point to top
        const bulbCenterY = y - pinHeight + pinRadius; // Center of the circular bulb

        // Text box above the pin (only if text exists) - hidden by default, shown on hover
        const pinDisplay = resolveTextToolDisplay(this.text);
        const displayText = pinDisplay.text;
        let textBoxGroup = null;
        
        const boxGap = 8;
        if (displayText) {
            const padding = 14;
            const maxBubbleWidth = this.style.maxWidth || 180;
            const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);
            const _pinCanvas = document.createElement('canvas');
            const _pinCtx = _pinCanvas.getContext('2d');
            _pinCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily}`;
            const measureWidth = (str) => {
                try { return _pinCtx.measureText(str || '').width || ((str || '').length * scaledFontSize * 0.6); }
                catch (e) { return (str || '').length * scaledFontSize * 0.6; }
            };

            const pinLines = this.style.wrapText
                ? TextTool.wrapTextLines(
                    displayText,
                    innerMaxW,
                    scaledFontSize,
                    this.style.fontFamily,
                    this.style.fontWeight || 'normal',
                    this.style.fontStyle || 'normal'
                )
                : displayText.split('\n');
            const lineHeight = scaledFontSize * 1.3;
            let maxLineWidth = 40;
            pinLines.forEach((line) => {
                const w = measureWidth(line || ' ');
                if (w > maxLineWidth) maxLineWidth = w;
            });

            const boxWidth = this.style.wrapText
                ? Math.max(80, Math.min(maxLineWidth + padding * 2, maxBubbleWidth))
                : Math.max(maxLineWidth + padding * 2, 80);
            const boxHeight = Math.max(pinLines.length * lineHeight + padding, scaledFontSize + padding);
            const arrowSize = 8;
            const edgeMargin = 4;

            // Clamp horizontal so bubble stays within the SVG container
            const svgEl = container.node().ownerSVGElement || container.node();
            const svgWidth = svgEl ? (svgEl.clientWidth || 800) : 800;
            const rawBoxX = x - boxWidth / 2;
            const boxX = Math.max(edgeMargin, Math.min(rawBoxX, svgWidth - boxWidth - edgeMargin));

            // Flip below pin when bubble would go above the container top
            const boxY_above = y - pinHeight - boxGap - boxHeight - 8;
            const renderBelow = boxY_above < edgeMargin;
            const boxY = renderBelow ? (y + 8) : boxY_above;

            // Clamp arrow tip X so it stays within the box
            const tipX = Math.max(boxX + arrowSize + 8, Math.min(x, boxX + boxWidth - arrowSize - 8));

            // Create text box group - hidden by default, visible when selected
            const isSelected = this.selected || false;
            textBoxGroup = this.group.append('g')
                .attr('class', 'pin-text-box')
                .style('opacity', isSelected ? 1 : 0)
                .style('pointer-events', isSelected ? 'all' : 'none')
                .style('transition', 'opacity 0.15s ease');

            // Text box background with pointer arrow
            let boxPath;
            if (renderBelow) {
                // Arrow points up from top of box
                boxPath = `
                    M ${boxX + 8} ${boxY + arrowSize}
                    L ${tipX - arrowSize} ${boxY + arrowSize}
                    L ${tipX} ${boxY}
                    L ${tipX + arrowSize} ${boxY + arrowSize}
                    L ${boxX + boxWidth - 8} ${boxY + arrowSize}
                    Q ${boxX + boxWidth} ${boxY + arrowSize}, ${boxX + boxWidth} ${boxY + arrowSize + 8}
                    L ${boxX + boxWidth} ${boxY + boxHeight + arrowSize - 8}
                    Q ${boxX + boxWidth} ${boxY + boxHeight + arrowSize}, ${boxX + boxWidth - 8} ${boxY + boxHeight + arrowSize}
                    L ${boxX + 8} ${boxY + boxHeight + arrowSize}
                    Q ${boxX} ${boxY + boxHeight + arrowSize}, ${boxX} ${boxY + boxHeight + arrowSize - 8}
                    L ${boxX} ${boxY + arrowSize + 8}
                    Q ${boxX} ${boxY + arrowSize}, ${boxX + 8} ${boxY + arrowSize}
                    Z
                `;
            } else {
                // Arrow points down from bottom of box (default: above pin)
                boxPath = `
                    M ${boxX + 8} ${boxY}
                    L ${boxX + boxWidth - 8} ${boxY}
                    Q ${boxX + boxWidth} ${boxY}, ${boxX + boxWidth} ${boxY + 8}
                    L ${boxX + boxWidth} ${boxY + boxHeight - 8}
                    Q ${boxX + boxWidth} ${boxY + boxHeight}, ${boxX + boxWidth - 8} ${boxY + boxHeight}
                    L ${tipX + arrowSize} ${boxY + boxHeight}
                    L ${tipX} ${boxY + boxHeight + arrowSize}
                    L ${tipX - arrowSize} ${boxY + boxHeight}
                    L ${boxX + 8} ${boxY + boxHeight}
                    Q ${boxX} ${boxY + boxHeight}, ${boxX} ${boxY + boxHeight - 8}
                    L ${boxX} ${boxY + 8}
                    Q ${boxX} ${boxY}, ${boxX + 8} ${boxY}
                    Z
                `;
            }

            const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
            const boxPathEl = textBoxGroup.append('path')
                .attr('class', 'shape-border note-body-hit')
                .attr('d', boxPath)
                .attr('fill', this.style.backgroundColor)
                .attr('stroke', hasBorder ? this.style.borderColor : 'none')
                .attr('stroke-width', hasBorder ? 1 : 0)
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            // Text (center within body; for below-render the body starts at boxY + arrowSize)
            const textBodyTop = renderBelow ? boxY + arrowSize : boxY;
            const totalTextHeight = pinLines.length * lineHeight;
            const firstLineY = textBodyTop + (boxHeight - totalTextHeight) / 2 + scaledFontSize * 0.85;
            const boxTextEl = textBoxGroup.append('text')
                .attr('class', 'inline-editable-text')
                .attr('x', boxX + boxWidth / 2)
                .attr('y', firstLineY)
                .attr('fill', this.style.textColor)
                .attr('font-size', `${scaledFontSize}px`)
                .attr('font-family', this.style.fontFamily)
                .attr('font-weight', this.style.fontWeight || 'normal')
                .attr('font-style', this.style.fontStyle || 'normal')
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            pinLines.forEach((line, i) => {
                boxTextEl.append('tspan')
                    .attr('x', boxX + boxWidth / 2)
                    .attr('dy', i === 0 ? 0 : lineHeight)
                    .text(line || '\u00A0');
            });

            if (this.style.wrapText) {
                const clipId = attachTextClipRect(textBoxGroup, `${this.id}-pin`, boxX, textBodyTop, boxWidth, boxHeight);
                if (clipId) boxTextEl.attr('clip-path', `url(#${clipId})`);
            }

            const self = this;
            const CLICK_DELAY = 250;
            let clickTimer = null;
            let downPos = null;
            let moved = false;

            const cleanupDragListeners = () => {
                document.removeEventListener('mousemove', handleMouseMove, true);
                document.removeEventListener('mouseup', handleMouseUp, true);
            };

            const handleMouseMove = (event) => {
                if (!downPos) return;
                const dx = event.clientX - downPos.x;
                const dy = event.clientY - downPos.y;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    moved = true;
                    if (clickTimer) {
                        clearTimeout(clickTimer);
                        clickTimer = null;
                    }
                    cleanupDragListeners();
                }
            };

            const handleMouseUp = () => {
                cleanupDragListeners();
                downPos = null;
            };

            const handleMouseDown = (event) => {
                downPos = { x: event.clientX, y: event.clientY };
                moved = false;
                document.addEventListener('mousemove', handleMouseMove, true);
                document.addEventListener('mouseup', handleMouseUp, true);
            };

            const startInlineEdit = (event, selectAll = false) => {
                const manager = self.chart && self.chart.drawingManager;
                const editor = manager && manager.textEditor;
                if (!editor || typeof editor.show !== 'function') return;

                const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
                if (focusOpts === null) return;

                const posNode = resolveTextAnnotationEditBoxNode(self, boxTextEl.node());
                const rect = posNode.getBoundingClientRect();
                const editX = rect.left + window.scrollX;
                const editY = rect.top + window.scrollY;

                if (typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                }

                editor.show(
                    editX,
                    editY,
                    self.text || '',
                    createInlineTextSaveHandler(self),
                    'Enter text…',
                    buildStandardInlineEditorOptions(self, rect, {
                        focusOpts,
                        padding,
                        color: self.style.textColor,
                        textAlign: 'center',
                        editorBackground: self.style.backgroundColor,
                        editorPadding: '4px 8px',
                        onInput: (newText) => {
                            self.setText((newText || '').replace(/\r\n/g, '\n'));
                            scheduleTextAnnotationLiveRender(self);
                        }
                    })
                );
            };

            const handleTextClick = (event) => {
                event.stopPropagation();
                event.preventDefault();

                if (moved) {
                    moved = false;
                    return;
                }

                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }

                const now = Date.now();
                const timeSinceLastClick = now - (self._lastClickTime || 0);
                self._lastClickTime = now;

                if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                    return;
                }

                const manager = self.chart && self.chart.drawingManager;
                if (!self.selected) {
                    if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                        manager.selectDrawing(self);
                        document.body.classList.add('text-selected');
                    }
                    return;
                }

                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    if (!self.locked) {
                        startInlineEdit(event, false);
                    }
                }, CLICK_DELAY);
            };

            const handleBodyClick = (event) => {
                event.stopPropagation();
                event.preventDefault();

                if (moved) {
                    moved = false;
                    return;
                }

                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }

                const manager = self.chart && self.chart.drawingManager;
                if (!self.selected) {
                    if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                        manager.selectDrawing(self);
                        document.body.classList.add('text-selected');
                    }
                }
            };

            const handleOpenSettings = (event) => {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                openTextAnnotationSettings(self, event);
            };

            const handleTextDblClickEdit = (event) => {
                event.stopPropagation();
                event.preventDefault();
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                if (!self.locked) {
                    startInlineEdit(event, true);
                }
            };

            const pinTextNodes = [boxTextEl.node()];
            boxTextEl.selectAll('tspan').each(function() {
                pinTextNodes.push(this);
            });
            pinTextNodes.forEach((n) => {
                if (!n) return;
                n.addEventListener('mousedown', handleMouseDown, true);
                n.addEventListener('click', handleTextClick, true);
                n.addEventListener('dblclick', handleTextDblClickEdit, true);
            });
            if (boxPathEl && boxPathEl.node()) {
                boxPathEl.node().addEventListener('mousedown', handleMouseDown, true);
                boxPathEl.node().addEventListener('click', handleBodyClick, true);
                boxPathEl.node().addEventListener('dblclick', handleOpenSettings, true);
            }
        } else {
            // No text yet — render an invisible anchor so _triggerAutoInlineEdit
            // can find a real DOM element with the correct screen position.
            const anchorW = 100;
            const anchorH = 28;
            const anchorX = x - anchorW / 2;
            const anchorY = Math.max(4, y - pinHeight - boxGap - anchorH - 8);
            this.group.append('rect')
                .attr('class', 'pin-text-anchor inline-editable-text')
                .attr('x', anchorX)
                .attr('y', anchorY)
                .attr('width', anchorW)
                .attr('height', anchorH)
                .attr('fill', 'none')
                .attr('stroke', 'none')
                .style('pointer-events', 'none')
                .style('opacity', 0);
        }

        // Map pin marker - classic location pin with round bulb and sharp point
        // The shape is: circular bulb at top, curves down to a sharp point
        const pinPath = `
            M ${x} ${y}
            C ${x - 6} ${y - 10}, ${x - pinRadius} ${y - pinHeight + pinRadius + 8}, ${x - pinRadius} ${bulbCenterY}
            A ${pinRadius} ${pinRadius} 0 1 1 ${x + pinRadius} ${bulbCenterY}
            C ${x + pinRadius} ${y - pinHeight + pinRadius + 8}, ${x + 6} ${y - 10}, ${x} ${y}
            Z
        `;

        const pinMarker = this.group.append('path')
            .attr('class', 'pin-body-hit')
            .attr('d', pinPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pinPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 16)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Inner hole - dark circle in center of bulb
        this.group.append('circle')
            .attr('class', 'pin-center-hole')
            .attr('cx', x)
            .attr('cy', bulbCenterY)
            .attr('r', 5)
            .attr('fill', '#131722')
            .style('pointer-events', 'none');

        // Add hover handlers to show/hide text box (keep visible when selected)
        if (textBoxGroup) {
            const self = this;
            this.group
                .on('mouseenter.textbox', () => {
                    textBoxGroup.style('opacity', 1);
                    textBoxGroup.style('pointer-events', 'all');
                })
                .on('mouseleave.textbox', () => {
                    // Only hide if not selected
                    if (!self.selected) {
                        textBoxGroup.style('opacity', 0);
                        textBoxGroup.style('pointer-events', 'none');
                    }
                });
        }

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new PinTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        return tool;
    }
}

// ============================================================================
// Table Tool - Info table showing candle OHLC data at placed point
// ============================================================================
class TableTool extends BaseDrawing {
    constructor(points = [], style = {}, data = null) {
        super('table', points, style);
        this.requiredPoints = 1;
        this.tableData = data;
        this.style.backgroundColor = style.backgroundColor || 'rgba(30, 34, 45, 0.98)';
        this.style.textColor = style.textColor || '#D1D4DC';
        this.style.headerColor = style.headerColor || '#787B86';
        this.style.borderColor = style.borderColor || '#363A45';
        this.style.accentColor = style.accentColor || '#787b86';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        this._prepareRenderGroup(container, 'drawing table', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        
        // Get candle data at this index
        const chart = scales.chart;
        const candleIndex = Math.round(p.x);
        const candle = chart?.data?.[candleIndex];
        
        // Format helpers
        const formatPrice = (price) => {
            if (!price && price !== 0) return '-';
            if (price > 1000) return price.toFixed(2);
            if (price > 1) return price.toFixed(4);
            return price.toFixed(5);
        };
        
        const formatDate = (timestamp) => {
            if (!timestamp) return '-';
            const d = new Date(timestamp);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        };
        
        const formatTime = (timestamp) => {
            if (!timestamp) return '';
            const d = new Date(timestamp);
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        };

        // Build table data from candle
        const tableRows = candle ? [
            ['Date', formatDate(candle.t)],
            ['Time', formatTime(candle.t)],
            ['Open', formatPrice(candle.o)],
            ['High', formatPrice(candle.h)],
            ['Low', formatPrice(candle.l)],
            ['Close', formatPrice(candle.c)],
            ['Volume', candle.v ? candle.v.toLocaleString() : '-']
        ] : this.tableData || [
            ['Label', 'Value'],
            ['Row 1', '100']
        ];

        const labelWidth = 60;
        const valueWidth = 80;
        const cellHeight = 22;
        const totalWidth = labelWidth + valueWidth;
        const totalHeight = tableRows.length * cellHeight;
        const padding = 8;

        // Draw shadow
        this.group.append('rect')
            .attr('x', x + 3).attr('y', y + 3)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', 'rgba(0,0,0,0.3)')
            .attr('rx', 6);

        // Draw background
        const tableBackground = this.group.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', this.style.borderColor)
            .attr('rx', 6)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 6)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Accent bar at top
        this.group.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', 3)
            .attr('fill', this.style.accentColor)
            .attr('rx', 6);

        // Draw rows
        for (let r = 0; r < tableRows.length; r++) {
            const rowY = y + padding + r * cellHeight;
            
            // Row separator (except first)
            if (r > 0) {
                this.group.append('line')
                    .attr('x1', x + padding)
                    .attr('y1', rowY)
                    .attr('x2', x + padding + totalWidth)
                    .attr('y2', rowY)
                    .attr('stroke', this.style.borderColor)
                    .attr('stroke-opacity', 0.5);
            }

            // Label
            this.group.append('text')
                .attr('x', x + padding + 4)
                .attr('y', rowY + cellHeight/2 + 4)
                .attr('fill', this.style.headerColor)
                .attr('font-size', '10px')
                .style('pointer-events', 'none')
                .text(tableRows[r][0]);

            // Value
            this.group.append('text')
                .attr('x', x + padding + labelWidth + valueWidth - 4)
                .attr('y', rowY + cellHeight/2 + 4)
                .attr('fill', this.style.textColor)
                .attr('font-size', '11px')
                .attr('text-anchor', 'end')
                .attr('font-weight', '500')
                .style('pointer-events', 'none')
                .text(tableRows[r][1]);
        }

        return this.group;
    }

    toJSON() { return { ...super.toJSON(), tableData: this.tableData }; }
    static fromJSON(data, chart) {
        const tool = new TableTool(data.points, data.style, data.tableData);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Callout Tool - Clean speech bubble with customizable direction
// ============================================================================
class CalloutTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('callout', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE; // Circle/anchor color
        this.style.backgroundColor = style.backgroundColor || '#FFFFFF';
        this.style.borderColor = style.borderColor || '#B2B5BE';
        this.style.textColor = style.textColor || '#F23645';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || 'Arial, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        this.style.wrapText = !!style.wrapText;
        this.style.maxWidth = style.maxWidth || 280;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(8, (this.style.fontSize || 14) * scaleFactor);

        this._prepareRenderGroup(container, 'drawing callout', renderOpts);
        this._clearDrawingLabels(scales);

        // Store for live-update during inline editing
        this._lastContainer = container;
        this._lastScales = scales;

        // Point 1: anchor/tip point, Point 2: bubble position
        const p1 = this.points[0];
        const p2 = this.points[1];
        const tipX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const tipY = scales.yScale(p1.y);
        const bubbleCenterX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const bubbleCenterY = scales.yScale(p2.y);

        const padding = 12;
        const minWidth = 80;
        const minHeight = 32;
        const cornerRadius = 8;
        const maxBubbleWidth = this.style.maxWidth || 280;

        // Helper: measure single line width via canvas (reliable, no DOM dependency)
        const _cFontSize = scaledFontSize;
        const _cFontFamily = this.style.fontFamily || 'Arial, sans-serif';
        const _cFontWeight = this.style.fontWeight || 'normal';
        const _cFontStyle = this.style.fontStyle || 'normal';
        const _measCanvas = document.createElement('canvas');
        const _measCtx = _measCanvas.getContext('2d');
        _measCtx.font = `${_cFontStyle} ${_cFontWeight} ${_cFontSize}px ${_cFontFamily}`;
        const measureW = (str) => {
            try { return _measCtx.measureText(str || '').width || (str.length * _cFontSize * 0.6); }
            catch(e) { return (str || '').length * _cFontSize * 0.6; }
        };

        const calloutDisplay = resolveTextToolDisplay(this.text);
        const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);
        const calloutSplitLines = (rawText) => {
            const lines = String(rawText || '').split('\n');
            return lines.length ? lines : [''];
        };

        const wrappedLines = this.style.wrapText
            ? TextTool.wrapTextLines(
                calloutDisplay.text,
                innerMaxW,
                _cFontSize,
                _cFontFamily,
                _cFontWeight,
                _cFontStyle
            )
            : calloutSplitLines(calloutDisplay.text);
        const lineHeight = this.style.fontSize * 1.3;

        let maxLineW = 40;
        wrappedLines.forEach(l => { const w = measureW(l || ' '); if (w > maxLineW) maxLineW = w; });

        const bubbleWidth = this.style.wrapText
            ? Math.max(minWidth, Math.min(maxLineW + padding * 2, maxBubbleWidth))
            : Math.max(maxLineW + padding * 2, minWidth);
        const bubbleHeight = Math.max(wrappedLines.length * lineHeight + padding * 2, minHeight);

        // Bubble positioned at second point (left-aligned, vertically centered)
        const bubbleX = bubbleCenterX;
        const bubbleY = bubbleCenterY - bubbleHeight / 2;

        // Tapered pointer - connects tip to bubble left edge
        const pointerBaseWidth = 14;
        
        // Triangle: tip point, top of base at bubble edge, bottom of base at bubble edge
        const pointerPath = `
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY - pointerBaseWidth / 2}
            L ${bubbleX} ${bubbleCenterY + pointerBaseWidth / 2}
            Z
        `;

        // Draw tapered pointer fill (same as bubble background)
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pointerPath)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pointerPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw pointer border (only the two outer edges, not the base)
        const pointerBorderPath = `
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY - pointerBaseWidth / 2}
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY + pointerBaseWidth / 2}
        `;
        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', pointerBorderPath)
            .attr('fill', 'none')
            .attr('stroke', this.style.borderColor)
            .attr('stroke-width', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Create bubble rectangle with rounded corners
        this.group.append('rect')
            .attr('class', 'shape-fill')
            .attr('x', bubbleX)
            .attr('y', bubbleY)
            .attr('width', bubbleWidth)
            .attr('height', bubbleHeight)
            .attr('rx', cornerRadius)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', this.style.borderColor)
            .attr('stroke-width', 1)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', bubbleX)
            .attr('y', bubbleY)
            .attr('width', bubbleWidth)
            .attr('height', bubbleHeight)
            .attr('rx', cornerRadius)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Text with wrapped lines
        const textStartY = bubbleY + padding + scaledFontSize;
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', bubbleX + padding)
            .attr('y', textStartY)
            .attr('text-anchor', 'start')
            .attr('fill', resolveAnnotationTextFill(this.style.textColor, this.style.backgroundColor, calloutDisplay.isPlaceholder))
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', _cFontFamily)
            .attr('font-weight', _cFontWeight)
            .attr('font-style', _cFontStyle)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        wrappedLines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', bubbleX + padding)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, bubbleX, bubbleY, bubbleWidth, bubbleHeight);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            const posNode = resolveTextAnnotationEditBoxNode(self, textElement.node());
            const rect = posNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const calloutEditDisplay = resolveTextToolDisplay(self.text);
            const calloutEditFill = resolveAnnotationTextFill(
                self.style.textColor,
                self.style.backgroundColor,
                calloutEditDisplay.isPlaceholder,
            );
            editor.show(
                editX,
                editY,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter text…',
                buildStandardInlineEditorOptions(self, rect, {
                    focusOpts,
                    padding,
                    color: calloutEditFill,
                    textAlign: 'left',
                    editorBackground: self.style.backgroundColor,
                    editorPadding: '4px 8px',
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
        };

        const handleTextClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleOpenSettings = (event) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextDblClickEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const calloutTextNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            calloutTextNodes.push(this);
        });
        calloutTextNodes.forEach((n) => {
            if (!n) return;
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleTextClick, true);
            n.addEventListener('dblclick', handleTextDblClickEdit, true);
        });
        this.group.selectAll('.shape-border-hit').each(function() {
            this.addEventListener('mousedown', handleMouseDown, true);
            this.addEventListener('dblclick', handleOpenSettings, true);
        });

        // Resize handles
        const handleRadius = 4;
        const handleStrokeWidth = 2;

        // Handle for anchor point (point 0)
        const handle0 = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', tipX)
            .attr('cy', tipY)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);

        // Handle for bubble position (point 1)
        const handle1 = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', bubbleCenterX)
            .attr('cy', bubbleCenterY)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 1);

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new CalloutTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Comment Tool - Speech bubble with curved tail
// ============================================================================
class CommentTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('comment', points, style);
        this.requiredPoints = 1;
        this.text = text || '';
        this.style.backgroundColor = style.backgroundColor || '#2962FF';
        this.style.borderColor = style.borderColor || 'transparent';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        this.style.textAlign = style.textAlign || 'center';
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
        if (this.style.maxWidth === undefined) this.style.maxWidth = style.maxWidth || 280;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(8, (this.style.fontSize || 14) * scaleFactor);

        this._prepareRenderGroup(container, 'drawing comment', renderOpts);
        this._clearDrawingLabels(scales);

        // Store for live-update during inline editing
        this._lastContainer = container;
        this._lastScales = scales;

        const p = this.points[0];
        const centerX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const centerY = scales.yScale(p.y);

        const padding = 12;
        const minWidth = 50;
        const minHeight = 30;
        const r = 16; // Larger radius for more rounded corners
        
        // Canvas-based measurement (reliable, no DOM dependency)
        const _cFontSize = scaledFontSize;
        const _cFontFamily = this.style.fontFamily || 'Arial, sans-serif';
        const _cFontWeight = this.style.fontWeight || 'normal';
        const _cFontStyle = this.style.fontStyle || 'normal';
        const _measCanvas = document.createElement('canvas');
        const _measCtx = _measCanvas.getContext('2d');
        _measCtx.font = `${_cFontStyle} ${_cFontWeight} ${_cFontSize}px ${_cFontFamily}`;
        const measureW = (str) => {
            try { return _measCtx.measureText(str || '').width || ((str || '').length * _cFontSize * 0.6); }
            catch(e) { return (str || '').length * _cFontSize * 0.6; }
        };

        const commentDisplay = resolveTextToolDisplay(this.text);
        const maxBubbleWidth = this.style.maxWidth || 280;
        const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);
        const commentSplitLines = (rawText) => {
            const lines = String(rawText || '').split('\n');
            return lines.length ? lines : [''];
        };
        const lines = this.style.wrapText
            ? TextTool.wrapTextLines(
                commentDisplay.text,
                innerMaxW,
                _cFontSize,
                _cFontFamily,
                _cFontWeight,
                _cFontStyle
            )
            : commentSplitLines(commentDisplay.text);
        const lineHeight = _cFontSize * 1.3;
        let maxLineW = minWidth - padding * 2;
        lines.forEach(l => { const lw = measureW(l || ' '); if (lw > maxLineW) maxLineW = lw; });

        const w = this.style.wrapText
            ? Math.max(minWidth, Math.min(maxLineW + padding * 2, maxBubbleWidth))
            : Math.max(maxLineW + padding * 2, minWidth);
        const h = Math.max(lines.length * lineHeight + padding * 2, minHeight);

        // Center the bubble on the point
        const bubbleX = centerX - w / 2;
        const bubbleY = centerY - h / 2;

        // Rounded rectangle with sharp bottom-left corner
        const bubblePath = `
            M ${bubbleX + r} ${bubbleY}
            L ${bubbleX + w - r} ${bubbleY}
            Q ${bubbleX + w} ${bubbleY} ${bubbleX + w} ${bubbleY + r}
            L ${bubbleX + w} ${bubbleY + h - r}
            Q ${bubbleX + w} ${bubbleY + h} ${bubbleX + w - r} ${bubbleY + h}
            L ${bubbleX + r} ${bubbleY + h}
            L ${bubbleX} ${bubbleY + h}
            L ${bubbleX} ${bubbleY + r}
            Q ${bubbleX} ${bubbleY} ${bubbleX + r} ${bubbleY}
            Z
        `;

        const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', bubblePath)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', hasBorder ? this.style.borderColor : 'none')
            .attr('stroke-width', hasBorder ? 1 : 0)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit comment-body-hit')
            .attr('d', bubblePath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.insert('rect', ':first-child')
            .attr('class', 'comment-body-hit')
            .attr('x', bubbleX)
            .attr('y', bubbleY)
            .attr('width', w)
            .attr('height', h)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Calculate text position based on alignment
        let textX = bubbleX + w / 2;
        let textAnchor = 'middle';
        
        if (this.style.textAlign === 'left') {
            textX = bubbleX + padding;
            textAnchor = 'start';
        } else if (this.style.textAlign === 'right') {
            textX = bubbleX + w - padding;
            textAnchor = 'end';
        }

        const textStartY = bubbleY + padding + _cFontSize;
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', textX)
            .attr('y', textStartY)
            .attr('text-anchor', textAnchor)
            .attr('fill', resolveAnnotationTextFill(this.style.textColor, this.style.backgroundColor, commentDisplay.isPlaceholder))
            .attr('font-size', `${_cFontSize}px`)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        lines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', textX)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, bubbleX, bubbleY, w, h);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        const self = this;

        // In-place live updater — avoids full re-render, updates paths + tspans directly
        self._updateCommentBubble = () => {
            const liveDisplay = resolveTextToolDisplay(self.text);
            const resolveLines = (rawText) => {
                if (self.style.wrapText) {
                    return TextTool.wrapTextLines(
                        rawText,
                        innerMaxW,
                        _cFontSize,
                        _cFontFamily,
                        _cFontWeight,
                        _cFontStyle
                    );
                }
                const split = String(rawText || '').split('\n');
                return split.length ? split : [''];
            };
            const lNew = resolveLines(liveDisplay.text);
            let mLW = minWidth - padding * 2;
            lNew.forEach(l => { const lw = measureW(l || ' '); if (lw > mLW) mLW = lw; });
            const wN = self.style.wrapText
                ? Math.max(minWidth, Math.min(mLW + padding * 2, maxBubbleWidth))
                : Math.max(mLW + padding * 2, minWidth);
            const hN = Math.max(lNew.length * lineHeight + padding * 2, minHeight);
            const bX = centerX - wN / 2;
            const bY = centerY - hN / 2;
            const np = `M ${bX+r} ${bY} L ${bX+wN-r} ${bY} Q ${bX+wN} ${bY} ${bX+wN} ${bY+r} L ${bX+wN} ${bY+hN-r} Q ${bX+wN} ${bY+hN} ${bX+wN-r} ${bY+hN} L ${bX+r} ${bY+hN} L ${bX} ${bY+hN} L ${bX} ${bY+r} Q ${bX} ${bY} ${bX+r} ${bY} Z`;
            self.group.selectAll('path').attr('d', np);
            self.group.selectAll('rect.comment-body-hit')
                .attr('x', bX)
                .attr('y', bY)
                .attr('width', wN)
                .attr('height', hN);
            let tXN = bX + wN / 2, tAN = 'middle';
            if (self.style.textAlign === 'left')  { tXN = bX + padding;       tAN = 'start'; }
            if (self.style.textAlign === 'right') { tXN = bX + wN - padding;  tAN = 'end'; }
            const tEl = self.group.select('text.inline-editable-text');
            const liveFill = resolveAnnotationTextFill(
                self.style.textColor,
                self.style.backgroundColor,
                liveDisplay.isPlaceholder,
            );
            tEl.attr('x', tXN).attr('y', bY + padding + _cFontSize).attr('text-anchor', tAN).attr('fill', liveFill);
            tEl.selectAll('tspan').remove();
            lNew.forEach((line, i) => {
                tEl.append('tspan').attr('x', tXN).attr('dy', i === 0 ? 0 : lineHeight).text(line || '\u00A0');
            });
            // Sync inline editor position to new text element location
            const edDiv = document.querySelector('.inline-text-editor--inline');
            if (edDiv && tEl.node()) {
                const nr = tEl.node().getBoundingClientRect();
                if (nr.left || nr.top) {
                    edDiv.style.left = (nr.left + window.scrollX) + 'px';
                    edDiv.style.top  = (nr.top  + window.scrollY) + 'px';
                }
            }
        };
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
            moved = false;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            const posNode = resolveTextAnnotationEditBoxNode(self, textElement.node());
            const rect = posNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const commentEditDisplay = resolveTextToolDisplay(self.text);
            const commentEditFill = resolveAnnotationTextFill(
                self.style.textColor,
                self.style.backgroundColor,
                commentEditDisplay.isPlaceholder,
            );
            editor.show(
                editX,
                editY,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter text…',
                buildStandardInlineEditorOptions(self, rect, {
                    focusOpts,
                    padding,
                    color: commentEditFill,
                    textAlign: self.style.textAlign || 'left',
                    editorBackground: self.style.backgroundColor,
                    editorPadding: '4px 8px',
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        if (typeof self._updateCommentBubble === 'function') {
                            self._updateCommentBubble();
                        }
                    }
                })
            );
        };

        const handleTextClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleBodyClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
            }
        };

        const handleOpenSettings = (event) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextDblClickEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            self._lastClickTime = 0;
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const commentTextNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            commentTextNodes.push(this);
        });
        commentTextNodes.forEach((n) => {
            if (!n) return;
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleTextClick, true);
            n.addEventListener('dblclick', handleTextDblClickEdit, true);
        });
        this.group.selectAll('.comment-body-hit').each(function() {
            this.addEventListener('mousedown', handleMouseDown, true);
            this.addEventListener('click', handleBodyClick, true);
            this.addEventListener('dblclick', handleOpenSettings, true);
        });

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new CommentTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Price Label Tool - EXACT duplicate of Price Note but 1 point instead of 2
// ============================================================================
class PriceLabelTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-label', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing price-label', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0]; // Start point (where line starts)
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        // For single point, use same position for both x2/y2
        const x2 = x1;
        const y2 = y1;

        // Format price from START point (p1) - the point we drag from
        const formatPrice = (price) => {
            if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(5);
        };

        const priceText = formatPrice(p1.y);
        const padding = 8;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .text(priceText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 60, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding;

        // Position box centered below/at the end point
        const boxX = x2 - boxWidth / 2;
        const boxY = y2 + 5;

        // Background rectangle for price
        this.group.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.fill)
            .attr('rx', 4)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 4)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Price text
        this.group.append('text')
            .attr('x', x2)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        // Small dot at start point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', this.style.stroke || DRAWING_TOOL_DEFAULT_STROKE)
            .style('pointer-events', 'none');

        // Create handles at both endpoints
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceLabelTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Price Label 2 Tool - Callout-style price label with anchor point
// ============================================================================
class PriceLabel2Tool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-label-2', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'bold';
        this.style.fontStyle = style.fontStyle || 'normal';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(10, this.style.fontSize * scaleFactor);

        this._prepareRenderGroup(container, 'drawing price-label-2', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);

        // Format price
        const formatPrice = (price) => {
            if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(5);
        };

        const priceText = formatPrice(p1.y);
        const padding = 12;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .attr('font-style', this.style.fontStyle || 'normal')
            .text(priceText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 80, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding * 1.2;
        const cornerRadius = 8;
        
        // Position box above and to the right of the anchor point
        const anchorOffsetX = -15;
        const anchorOffsetY = -10;
        const boxX = x1 + anchorOffsetX;
        const boxY = y1 + anchorOffsetY - boxHeight;

        // Create callout path with anchor point at bottom left
        const anchorSize = 6;
        const calloutPath = `
            M ${boxX + cornerRadius} ${boxY}
            L ${boxX + boxWidth - cornerRadius} ${boxY}
            Q ${boxX + boxWidth} ${boxY} ${boxX + boxWidth} ${boxY + cornerRadius}
            L ${boxX + boxWidth} ${boxY + boxHeight - cornerRadius}
            Q ${boxX + boxWidth} ${boxY + boxHeight} ${boxX + boxWidth - cornerRadius} ${boxY + boxHeight}
            L ${boxX + anchorSize + 10} ${boxY + boxHeight}
            L ${x1} ${y1}
            L ${boxX + anchorSize} ${boxY + boxHeight}
            L ${boxX + cornerRadius} ${boxY + boxHeight}
            Q ${boxX} ${boxY + boxHeight} ${boxX} ${boxY + boxHeight - cornerRadius}
            L ${boxX} ${boxY + cornerRadius}
            Q ${boxX} ${boxY} ${boxX + cornerRadius} ${boxY}
            Z
        `;

        // Background callout shape
        this.group.append('path')
            .attr('d', calloutPath)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', calloutPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Price text
        this.group.append('text')
            .attr('x', boxX + boxWidth / 2)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        // Small anchor circle at the point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', 1.5)
            .style('pointer-events', 'none');

        // Create handles
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceLabel2Tool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Signpost 2 Tool - Vertical line with text label below
// ============================================================================
class Signpost2Tool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('signpost-2', points, style);
        this.requiredPoints = 1;
        this.text = text || '';
        this.style.stroke = style.stroke || '#787b86';
        this.style.borderColor = style.borderColor !== undefined ? style.borderColor : (style.stroke || '#787b86');
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || '#2e3238';
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 13;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        this.style.lineLength = style.lineLength || 100;
        if (this.style.wrapText === undefined) this.style.wrapText = !!style.wrapText;
        if (this.style.maxWidth === undefined) this.style.maxWidth = style.maxWidth || 180;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(1, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(10, this.style.fontSize * scaleFactor);
        const scaledLineLength = this.style.lineLength * scaleFactor;

        this._prepareRenderGroup(container, 'drawing signpost-2', renderOpts);
        this._clearDrawingLabels(scales);
        this._lastContainer = container;
        this._lastScales = scales;

        const p1 = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const lineColor = this.style.stroke || '#787b86';
        const labelFill = (this.style.fill && this.style.fill !== 'none' && this.style.fill !== 'transparent')
            ? this.style.fill
            : '#2e3238';
        const rawTextBorderColor = this.style.borderColor;
        const textBorderColor = (rawTextBorderColor === undefined || rawTextBorderColor === null || rawTextBorderColor === '')
            ? 'none'
            : rawTextBorderColor;
        const hasTextBorder = textBorderColor !== 'none' && textBorderColor !== 'transparent';

        // Vertical line from point going down
        const lineEndY = y1 + scaledLineLength;
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', lineColor)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none');

        this.group.append('line')
            .attr('class', 'shape-border-hit signpost-stem-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(12, scaledStrokeWidth * 4))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const signDisplay = resolveTextToolDisplay(this.text);
        const displayText = signDisplay.text;
        const padding = 10;
        const maxBubbleWidth = this.style.maxWidth || 180;
        const innerMaxW = Math.max(20, maxBubbleWidth - padding * 2);
        const _spCanvas = document.createElement('canvas');
        const _spCtx = _spCanvas.getContext('2d');
        _spCtx.font = `${this.style.fontStyle || 'normal'} ${this.style.fontWeight || 'normal'} ${scaledFontSize}px ${this.style.fontFamily}`;
        const measureWidth = (str) => {
            try { return _spCtx.measureText(str || '').width || ((str || '').length * scaledFontSize * 0.6); }
            catch (e) { return (str || '').length * scaledFontSize * 0.6; }
        };

        const signLines = this.style.wrapText
            ? TextTool.wrapTextLines(
                displayText,
                innerMaxW,
                scaledFontSize,
                this.style.fontFamily,
                this.style.fontWeight || 'normal',
                this.style.fontStyle || 'normal'
            )
            : displayText.split('\n');
        const lineHeight = scaledFontSize * 1.3;
        let maxLineWidth = 40;
        signLines.forEach((line) => {
            const w = measureWidth(line || ' ');
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const boxWidth = this.style.wrapText
            ? Math.max(50, Math.min(maxLineWidth + padding * 2, maxBubbleWidth))
            : Math.max(maxLineWidth + padding * 2, 50);
        const boxHeight = Math.max(signLines.length * lineHeight + padding, scaledFontSize + padding);
        const cornerRadius = 6;
        
        // Position box below the line end, centered
        const boxX = x1 - boxWidth / 2;
        const boxY = lineEndY + 5;

        // Label box (pin-style hit target: click to edit, dblclick for settings)
        const labelBox = this.group.append('rect')
            .attr('class', 'shape-fill note-body-hit signpost-label-fill')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', labelFill)
            .attr('stroke', hasTextBorder ? textBorderColor : 'none')
            .attr('stroke-width', hasTextBorder ? 1 : 0)
            .attr('rx', cornerRadius)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Text
        const totalTextHeight = signLines.length * lineHeight;
        const firstLineY = boxY + (boxHeight - totalTextHeight) / 2 + scaledFontSize * 0.85;
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', x1)
            .attr('y', firstLineY)
            .attr('fill', resolveAnnotationTextFill(this.style.textColor, labelFill, signDisplay.isPlaceholder))
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        signLines.forEach((line, i) => {
            textElement.append('tspan')
                .attr('x', x1)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line || '\u00A0');
        });

        if (this.style.wrapText) {
            const clipId = attachTextClipRect(this.group, this.id, boxX, boxY, boxWidth, boxHeight);
            if (clipId) textElement.attr('clip-path', `url(#${clipId})`);
        }

        // Double-click label text = edit; double-click line/border = settings
        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
                if (v9StartAnnotationDragFromTextPointer(self, event)) {
                    downPos = null;
                }
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
            moved = false;
        };

        const handleMouseDown = (event) => {
            if (event.button !== 0) return;
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (event, selectAll = false) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const focusOpts = prepareTextInlineEditFocus(self, event, selectAll);
            if (focusOpts === null) return;

            const posNode = resolveTextAnnotationEditBoxNode(self, textElement.node());
            const bbox = posNode.getBoundingClientRect();
            const x = bbox.left + window.scrollX;
            const y = bbox.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const editDisplay = resolveTextToolDisplay(self.text);
            const editFill = resolveAnnotationTextFill(
                self.style.textColor,
                self.style.fill,
                editDisplay.isPlaceholder,
            );

            editor.show(
                x,
                y,
                self.text || '',
                createInlineTextSaveHandler(self),
                'Enter text…',
                buildStandardInlineEditorOptions(self, bbox, {
                    focusOpts,
                    padding,
                    color: editFill,
                    textAlign: 'center',
                    editorBackground: self.style.fill,
                    editorPadding: '4px 8px',
                    onInput: (newText) => {
                        self.setText((newText || '').replace(/\r\n/g, '\n'));
                        scheduleTextAnnotationLiveRender(self);
                    }
                })
            );
        };

        const handleTextClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const now = Date.now();
            const timeSinceLastClick = now - (self._lastClickTime || 0);
            self._lastClickTime = now;

            if (handleTextAnnotationQuickSecondClick(self, timeSinceLastClick, 30, 400, () => startInlineEdit(event, true))) {
                return;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                if (!self.locked) {
                    startInlineEdit(event, false);
                }
            }, CLICK_DELAY);
        };

        const handleBodyClick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (!self.selected) {
                if (manager && typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                    document.body.classList.add('text-selected');
                }
            }
        };

        const handleOpenSettings = (event) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            openTextAnnotationSettings(self, event);
        };

        const handleTextDblClickEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (!self.locked) {
                startInlineEdit(event, true);
            }
        };

        const signpostTextNodes = [textElement.node()];
        textElement.selectAll('tspan').each(function() {
            signpostTextNodes.push(this);
        });
        signpostTextNodes.forEach((n) => {
            if (!n) return;
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleTextClick, true);
            n.addEventListener('dblclick', handleTextDblClickEdit, true);
        });
        if (labelBox && labelBox.node()) {
            const boxNode = labelBox.node();
            boxNode.addEventListener('mousedown', handleMouseDown, true);
            boxNode.addEventListener('click', handleBodyClick, true);
            boxNode.addEventListener('dblclick', handleOpenSettings, true);
        }
        this.group.selectAll('.signpost-stem-hit').each(function() {
            this.addEventListener('mousedown', handleMouseDown, true);
            this.addEventListener('dblclick', handleOpenSettings, true);
        });

        // Small circle at the anchor point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', lineColor)
            .style('pointer-events', 'none');

        // Create handles
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit')
            .style('cursor', 'move');

        return this.group;
    }

    setText(newText) { 
        this.text = newText || ''; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new Signpost2Tool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Signpost Tool - Location marker
// ============================================================================
class SignpostTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('signpost', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.color = style.color || '#787b86';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        this._prepareRenderGroup(container, 'drawing signpost', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Signpost pin shape (like Google Maps marker)
        this.group.append('path')
            .attr('d', `M${x} ${y} 
                       C${x-12} ${y-20} ${x-12} ${y-35} ${x} ${y-45}
                       C${x+12} ${y-35} ${x+12} ${y-20} ${x} ${y}`)
            .attr('fill', this.style.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', `M${x} ${y} 
                       C${x-12} ${y-20} ${x-12} ${y-35} ${x} ${y-45}
                       C${x+12} ${y-35} ${x+12} ${y-20} ${x} ${y}`)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 16)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Inner circle
        this.group.append('circle')
            .attr('cx', x).attr('cy', y - 32)
            .attr('r', 6)
            .attr('fill', '#fff');

        // Create handle
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit')
            .style('cursor', 'move');

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new SignpostTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Flag Mark Tool - Flag on pole
// ============================================================================
class FlagMarkTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('flag-mark', points, style);
        this.requiredPoints = 1;
        const flagColor = style.fill || style.stroke || '#787b86';
        this.style.stroke = flagColor;
        this.style.fill = flagColor;
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.lineLength = 24;
        this.style.flagWidth = 22;
        this.style.flagHeight = 14;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 1) return;

        this._prepareRenderGroup(container, 'drawing flag-mark', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y1 = scales.yScale(p.y);

        // Get zoom scale factor
        const scaleFactor = scales.chart?.getZoomScaleFactor ? scales.chart.getZoomScaleFactor() : 1;
        const scaledStrokeWidth = (this.style.strokeWidth || 2) * scaleFactor;
        const lineLength = (this.style.lineLength || 24);
        const flagWidth = (this.style.flagWidth || 22);
        const flagHeight = (this.style.flagHeight || 14);

        // Vertical line (pole) extending upward
        const lineEndY = y1 - lineLength;
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none');

        this.group.append('line')
            .attr('class', 'shape-border-hit flag-stem-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(12, scaledStrokeWidth * 4))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Flag shape with notch on the right side
        // Starting from top of pole, going right, then notch, then back to pole
        const flagTop = lineEndY;
        const flagBottom = lineEndY + flagHeight;
        const flagRight = x1 + flagWidth;
        const notchDepth = flagWidth * 0.25; // 25% notch depth
        const notchY = flagTop + flagHeight / 2; // Middle of flag

        const flagPath = `
            M ${x1} ${flagTop}
            L ${flagRight} ${flagTop}
            L ${flagRight - notchDepth} ${notchY}
            L ${flagRight} ${flagBottom}
            L ${x1} ${flagBottom}
            Z
        `;

        this.group.append('path')
            .attr('class', 'flag-visual')
            .attr('d', flagPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        const flagBodyHit = this.group.append('path')
            .attr('class', 'shape-fill flag-body-hit shape-border-hit')
            .attr('d', flagPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        const self = this;
        const handleOpenSettings = (event) => {
            event.stopPropagation();
            event.preventDefault();
            openTextAnnotationSettings(self, event);
        };

        if (flagBodyHit && flagBodyHit.node()) {
            flagBodyHit.node().addEventListener('dblclick', handleOpenSettings, true);
        }
        this.group.selectAll('.flag-stem-hit').each(function() {
            this.addEventListener('dblclick', handleOpenSettings, true);
        });

        // Create handles
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    toJSON() { 
        return { ...super.toJSON() }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new FlagMarkTool(data.points, data.style);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TEXT_TOOL_PLACEHOLDER,
        TEXT_TOOL_PLACEHOLDER_COLOR,
        isTextToolPlaceholder,
        resolveTextToolDisplay,
        resolveNoteBoxStyle,
        prepareTextInlineEditFocus,
        inlineEditorFocusOptions,
        buildWrapAwareInlineEditorOptions,
        buildStandardInlineEditorOptions,
        resolveTextAnnotationEditBoxNode,
        buildNoteInlineEditorOptions,
        createInlineTextSaveHandler,
        openTextAnnotationSettings,
        TextTool,
        NoteBoxTool,
        AnchoredTextTool,
        NoteTool,
        PriceNoteTool,
        PinTool,
        TableTool,
        CalloutTool,
        CommentTool,
        PriceLabelTool,
        PriceLabel2Tool,
        Signpost2Tool,
        SignpostTool,
        FlagMarkTool
    };
}

if (typeof window !== 'undefined') {
    window.DrawingTextHelpers = {
        TEXT_TOOL_PLACEHOLDER,
        TEXT_TOOL_PLACEHOLDER_COLOR,
        isTextToolPlaceholder,
        resolveTextToolDisplay,
        resolveNoteBoxStyle,
        prepareTextInlineEditFocus,
        inlineEditorFocusOptions,
        buildWrapAwareInlineEditorOptions,
        buildStandardInlineEditorOptions,
        resolveTextAnnotationEditBoxNode,
        buildNoteInlineEditorOptions,
        createInlineTextSaveHandler,
        openTextAnnotationSettings,
        syncTextHandlePositions,
        scheduleTextAnnotationLiveRender,
        beginTextAnnotationInlineEdit,
        endTextAnnotationInlineEdit
    };
}
