/**
 * Talaria bottom toast stack — same shell as path hint / V9 toolbar tips (Exo 2, #0F1119, left accent).
 * Items anchor just above the chart time axis and stack upward so nothing overlaps.
 *
 * API: window.__TalariaToastStack.show(message, opts), .pushElement(el, opts),
 *      .setPinned(key, el), .clearPinned(key), .remove(el), .relayout()
 */
(function (root) {
    'use strict';
    const doc = root.document;
    if (!doc) return;

    const GAP = 10;
    const Z = 100060;

    /** @type {Map<string, { el: HTMLElement }>} */
    const pinned = new Map();
    /** @type {{ el: HTMLElement, t: ReturnType<typeof setTimeout>|null }[]} */
    const transient = [];

    function theme() {
        const light = doc.body && doc.body.classList.contains('light-mode');
        return {
            light,
            bg: light ? '#E8EBF6' : '#0F1119',
            brH: light ? 'rgba(0,5,40,0.26)' : 'rgba(140,160,255,0.12)',
            tx: light ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.92)',
            acL: light ? '#2F55E8' : '#4A6AFF',
        };
    }

    function accentForType(type, th) {
        const t = type && ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        const m = {
            success: th.light ? '#059669' : '#22c55e',
            error: '#ef4444',
            warning: '#f59e0b',
            info: th.acL,
        };
        return m[t];
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

        setPinned(key, el) {
            if (!key || !el) return function () {};
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
            const o = opts || {};
            const duration = Number.isFinite(Number(o.duration)) ? Number(o.duration) : 2400;
            const row = { el: el, t: null };
            transient.unshift(row);
            attachMount(el);
            row.t = setTimeout(() => {
                try {
                    el.style.opacity = '0';
                    el.style.transition = 'opacity 0.18s ease';
                } catch (_) { /* ignore */ }
                setTimeout(() => removeTransientEl(el), 200);
            }, duration);
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
            const o = opts || {};
            const th = theme();
            const type = o.type || 'info';
            const stripeColor = accentForType(type, th);

            const wrap = doc.createElement('div');
            wrap.className = 'tlr-toast-stack-msg';
            wrap.setAttribute('role', 'status');

            Object.assign(wrap.style, {
                background: th.bg,
                border: '1px solid ' + th.brH,
                color: th.tx,
                fontFamily: "'Exo 2',sans-serif",
                fontSize: '11px',
                fontWeight: '600',
                padding: '5px 11px 5px 14px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                maxWidth: 'min(92vw, 380px)',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                textAlign: 'center',
                boxSizing: 'border-box',
                pointerEvents: typeof o.onClick === 'function' ? 'auto' : 'none',
                lineHeight: '1.35',
            });

            const stripe = doc.createElement('div');
            Object.assign(stripe.style, {
                position: 'absolute',
                left: '0',
                top: '0',
                bottom: '0',
                width: '3px',
                pointerEvents: 'none',
                background: 'linear-gradient(180deg,transparent,' + stripeColor + ',transparent)',
            });
            wrap.appendChild(stripe);
            wrap.appendChild(doc.createTextNode(String(message != null ? message : '')));

            if (typeof o.onClick === 'function') {
                wrap.style.cursor = 'default';
                if (o.title) wrap.title = String(o.title);
                wrap.addEventListener('click', function () {
                    try {
                        o.onClick();
                    } catch (e) {
                        console.error(e);
                    }
                });
            }

            const dur = Number.isFinite(Number(o.duration))
                ? Number(o.duration)
                : (Number.isFinite(Number(o.timeoutMs)) ? Number(o.timeoutMs) : 2200);
            return this.pushElement(wrap, { duration: dur });
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

    root.__TalariaToastStack = api;
})(typeof window !== 'undefined' ? window : globalThis);
