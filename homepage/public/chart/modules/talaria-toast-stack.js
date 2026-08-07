/**
 * Talaria bottom toast stack — Obsidian chrome (flat surface, thin border, no glow).
 * Items anchor just above the chart time axis and stack upward so nothing overlaps.
 *
 * API: window.__TalariaToastStack.show(message, opts), .pushElement(el, opts),
 *      .setPinned(key, el), .clearPinned(key), .remove(el), .relayout()
 */
(function (root) {
    'use strict';
    const doc = root.document;
    if (!doc) return;

    const GAP = 8;
    const Z = 100060;
    const CSS_ID = 'tlr-toast-obsidian-css';

    /** @type {Map<string, { el: HTMLElement }>} */
    const pinned = new Map();
    /** @type {{ el: HTMLElement, t: ReturnType<typeof setTimeout>|null, replaceKey?: string }[]} */
    const transient = [];

    function ensureToastCss() {
        // Always refresh — kill legacy left-rail glow / Exo toast skins.
        const prev = doc.getElementById(CSS_ID);
        if (prev) prev.remove();
        const style = doc.createElement('style');
        style.id = CSS_ID;
        style.textContent = [
            '.tlr-toast-stack-msg,',
            '.chart-notification.tlr-toast-stack-msg,',
            '.chart-toast-tooltip.tlr-toast-stack-msg{',
            'display:inline-flex!important;',
            'align-items:center!important;',
            'gap:8px!important;',
            'min-height:28px!important;',
            'background:var(--surface-raised,#141416)!important;',
            'border:1px solid var(--line,rgba(162,161,205,0.22))!important;',
            'border-radius:6px!important;',
            'box-shadow:none!important;',
            'filter:none!important;',
            'outline:none!important;',
            'text-shadow:none!important;',
            "font-family:var(--font-ui,\"Helvetica Now\",\"Helvetica Neue\",Helvetica,Arial,sans-serif)!important;",
            'font-size:12px!important;',
            'font-weight:600!important;',
            'font-style:normal!important;',
            'letter-spacing:0!important;',
            'line-height:1.2!important;',
            'color:var(--text-muted,rgba(244,244,245,0.72))!important;',
            'padding:0 12px!important;',
            'max-width:min(92vw,360px)!important;',
            'box-sizing:border-box!important;',
            '}',
            '.tlr-toast-stack-msg::before,',
            '.tlr-toast-stack-msg::after{',
            'content:none!important;',
            'display:none!important;',
            '}',
            'body.light-mode .tlr-toast-stack-msg{',
            'background:#FFFFFF!important;',
            'border-color:rgba(0,0,0,0.12)!important;',
            'color:rgba(0,0,0,0.72)!important;',
            '}',
            /* Tone via text only — never a colored border rail */
            '.tlr-toast-stack-msg[data-toast-type="success"]{color:var(--up,#00d4a1)!important;}',
            '.tlr-toast-stack-msg[data-toast-type="error"]{color:var(--down,#e53935)!important;}',
            '.tlr-toast-stack-msg[data-toast-type="warning"]{color:var(--warn,#F5A020)!important;}',
            '.tlr-toast-stack-msg[data-toast-type="info"]{color:var(--text,rgba(244,244,245,0.92))!important;}',
            'body.light-mode .tlr-toast-stack-msg[data-toast-type="success"]{color:#059669!important;}',
            'body.light-mode .tlr-toast-stack-msg[data-toast-type="error"]{color:#DC2626!important;}',
            'body.light-mode .tlr-toast-stack-msg[data-toast-type="warning"]{color:#D97706!important;}',
            'body.light-mode .tlr-toast-stack-msg[data-toast-type="info"]{color:rgba(0,0,0,0.88)!important;}',
        ].join('');
        (doc.head || doc.documentElement).appendChild(style);
    }

    function armTransientDismiss(row, duration) {
        if (!row || !row.el) return;
        if (row.t) {
            clearTimeout(row.t);
            row.t = null;
        }
        const el = row.el;
        row.t = setTimeout(() => {
            try {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.16s ease';
            } catch (_) { /* ignore */ }
            setTimeout(() => removeTransientEl(el), 180);
        }, duration);
    }

    function sanitizeToastMessage(message) {
        return String(message != null ? message : '')
            .replace(/\s*[✓✔❌]\s*$/u, '')
            .replace(/^\s*[✓✔❌]\s*/u, '')
            .trim();
    }

    function setToastMessage(el, message) {
        if (!el) return;
        const text = sanitizeToastMessage(message);
        for (let i = 0; i < el.childNodes.length; i++) {
            const n = el.childNodes[i];
            if (n && n.nodeType === 3) {
                n.nodeValue = text;
                return;
            }
        }
        el.appendChild(doc.createTextNode(text));
    }

    function baseBottomPx() {
        try {
            const ch = typeof root.getActiveChart === 'function' ? root.getActiveChart() : root.chart;
            const cv = ch && ch.canvas;
            const m = ch && ch.margin;
            if (cv && m && typeof cv.getBoundingClientRect === 'function' && Number.isFinite(ch.h) && ch.h > 0) {
                const r = cv.getBoundingClientRect();
                const sy = r.height > 0 ? r.height / ch.h : 1;
                const mB = Math.max(20, Number(m.b) || 30);
                const timeAxisTop = r.top + (ch.h - mB) * sy;
                return root.innerHeight - timeAxisTop + 10;
            }
        } catch (_) { /* ignore */ }
        return 100;
    }

    function orderedElements() {
        const out = [];
        pinned.forEach((v) => {
            out.push(v.el);
        });
        for (let i = 0; i < transient.length; i++) {
            out.push(transient[i].el);
        }
        return out;
    }

    function applyGeo(el, bottomPx) {
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('left', '50%', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('transform', 'translateX(-50%)', 'important');
        el.style.setProperty('bottom', Math.round(bottomPx) + 'px', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('z-index', String(Z), 'important');
    }

    function relayout() {
        let off = 0;
        const b0 = baseBottomPx();
        const els = orderedElements();
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            try {
                const h = el.getBoundingClientRect().height || el.offsetHeight || 36;
                applyGeo(el, b0 + off);
                off += h + GAP;
            } catch (_) { /* ignore */ }
        }
    }

    let raf = 0;
    function scheduleRelayout() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            relayout();
        });
    }

    function removeTransientEl(el) {
        const i = transient.findIndex((x) => x.el === el);
        if (i !== -1) {
            const row = transient[i];
            if (row.t) {
                clearTimeout(row.t);
                row.t = null;
            }
            transient.splice(i, 1);
        }
        try {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (_) { /* ignore */ }
        scheduleRelayout();
    }

    function attachMount(el) {
        if (el && !el.parentNode) doc.body.appendChild(el);
    }

    const api = {
        relayout: scheduleRelayout,

        /** Same vertical anchor as stacked toasts (px from viewport bottom). For OHLC rollback hover tooltip, etc. */
        anchorBottomPx: baseBottomPx,

        setPinned(key, el) {
            if (!key || !el) return function () {};
            ensureToastCss();
            const prev = pinned.get(key);
            if (prev && prev.el && prev.el !== el) {
                try {
                    if (prev.el.parentNode) prev.el.parentNode.removeChild(prev.el);
                } catch (_) { /* ignore */ }
            }
            pinned.set(key, { el });
            attachMount(el);
            scheduleRelayout();
            requestAnimationFrame(() => {
                scheduleRelayout();
                requestAnimationFrame(scheduleRelayout);
            });
            return function () {
                api.clearPinned(key);
            };
        },

        clearPinned(key) {
            const row = pinned.get(key);
            if (!row) return;
            pinned.delete(key);
            try {
                if (row.el && row.el.parentNode) row.el.parentNode.removeChild(row.el);
            } catch (_) { /* ignore */ }
            scheduleRelayout();
        },

        /**
         * @param {HTMLElement} el
         * @param {{ duration?: number }} opts
         * @returns {function} dismiss
         */
        pushElement(el, opts) {
            ensureToastCss();
            const o = opts || {};
            const duration = Number.isFinite(Number(o.duration)) ? Number(o.duration) : 2400;
            const replaceKey = o.replaceKey != null && o.replaceKey !== '' ? String(o.replaceKey) : '';
            const row = { el: el, t: null, replaceKey: replaceKey };
            transient.unshift(row);
            attachMount(el);
            armTransientDismiss(row, duration);
            requestAnimationFrame(() => {
                try {
                    el.style.opacity = '0';
                    el.style.transition = 'opacity 0.12s ease';
                } catch (_) { /* ignore */ }
                requestAnimationFrame(() => {
                    try {
                        el.style.opacity = '1';
                    } catch (_) { /* ignore */ }
                    scheduleRelayout();
                    requestAnimationFrame(scheduleRelayout);
                });
            });
            return function dismiss() {
                if (row.t) {
                    clearTimeout(row.t);
                    row.t = null;
                }
                removeTransientEl(el);
            };
        },

        show(message, opts) {
            ensureToastCss();
            const o = opts || {};
            const type = o.type && ['success', 'error', 'warning', 'info'].includes(o.type) ? o.type : 'info';
            const dur = Number.isFinite(Number(o.duration))
                ? Number(o.duration)
                : (Number.isFinite(Number(o.timeoutMs)) ? Number(o.timeoutMs) : 2200);
            const replaceKey = o.replaceKey != null && o.replaceKey !== '' ? String(o.replaceKey) : '';

            if (replaceKey) {
                const existing = transient.find((x) => x && x.replaceKey === replaceKey && x.el);
                if (existing) {
                    setToastMessage(existing.el, message);
                    try {
                        existing.el.setAttribute('data-toast-type', type);
                        existing.el.style.opacity = '1';
                    } catch (_) { /* ignore */ }
                    armTransientDismiss(existing, dur);
                    scheduleRelayout();
                    return function dismiss() {
                        if (existing.t) {
                            clearTimeout(existing.t);
                            existing.t = null;
                        }
                        removeTransientEl(existing.el);
                    };
                }
            }

            const wrap = doc.createElement('div');
            wrap.className = 'tlr-toast-stack-msg';
            wrap.setAttribute('role', 'status');
            wrap.setAttribute('data-toast-type', type);
            if (replaceKey) wrap.setAttribute('data-toast-key', replaceKey);

            wrap.style.whiteSpace = 'normal';
            wrap.style.wordBreak = 'break-word';
            wrap.style.textAlign = 'left';
            wrap.style.pointerEvents = typeof o.onClick === 'function' ? 'auto' : 'none';

            wrap.appendChild(doc.createTextNode(sanitizeToastMessage(message)));

            if (typeof o.onClick === 'function') {
                wrap.style.cursor = 'default';
                wrap.addEventListener('click', function () {
                    try {
                        o.onClick();
                    } catch (e) {
                        console.error(e);
                    }
                });
            }

            return this.pushElement(wrap, { duration: dur, replaceKey: replaceKey });
        },

        remove(el) {
            if (!el) return;
            for (const [k, v] of pinned.entries()) {
                if (v.el === el) {
                    pinned.delete(k);
                    try {
                        if (el.parentNode) el.parentNode.removeChild(el);
                    } catch (_) { /* ignore */ }
                    scheduleRelayout();
                    return;
                }
            }
            removeTransientEl(el);
        },
    };

    root.addEventListener('resize', scheduleRelayout);
    root.addEventListener('scroll', scheduleRelayout, true);

    ensureToastCss();
    root.__TalariaToastStack = api;
})(typeof window !== 'undefined' ? window : globalThis);
