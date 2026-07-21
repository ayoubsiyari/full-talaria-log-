/**
 * Limit concurrent Talaria chart windows / PWA apps using users.max_sessions.
 * Multichart panel iframes (panelId=…) do not consume a slot — only the host window does.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'talaria_chart_window_id';
    var HEARTBEAT_MS = 25000;

    function isMultichartPanel() {
        try {
            var p = new URLSearchParams(window.location.search || '');
            if (p.get('panelId')) return true;
        } catch (_e) { /* ignore */ }
        return false;
    }

    function shouldEnforce() {
        if (isMultichartPanel()) return false;
        return true;
    }

    function getOrCreateClientId() {
        try {
            var existing = sessionStorage.getItem(STORAGE_KEY);
            if (existing && existing.length >= 8) return existing;
        } catch (_e) { /* ignore */ }
        var id = '';
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                id = window.crypto.randomUUID().replace(/-/g, '');
            }
        } catch (_e2) { /* ignore */ }
        if (!id || id.length < 8) {
            id = 'cw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        }
        id = String(id).slice(0, 64);
        try { sessionStorage.setItem(STORAGE_KEY, id); } catch (_e3) { /* ignore */ }
        return id;
    }

    function parseDetail(res, data) {
        var d = data && data.detail;
        if (d && typeof d === 'object') return d;
        if (typeof d === 'string') {
            try { return JSON.parse(d); } catch (_e) { return { message: d }; }
        }
        return { message: (data && data.message) || ('Window limit (' + res.status + ')') };
    }

    function showBlockedOverlay(detail) {
        var maxS = detail && detail.max_sessions != null ? detail.max_sessions : null;
        var msg = (detail && detail.message) ||
            'Chart window limit reached. Close another Talaria chart window or app, then reload.';
        var existing = document.getElementById('talariaWindowLimitOverlay');
        if (existing) {
            var t = existing.querySelector('[data-wlim-msg]');
            if (t) t.textContent = msg;
            return;
        }
        var el = document.createElement('div');
        el.id = 'talariaWindowLimitOverlay';
        el.setAttribute('role', 'alertdialog');
        el.setAttribute('aria-modal', 'true');
        el.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483000',
            'background:rgba(8,10,14,0.92)', 'color:#e8edf5',
            'display:flex', 'align-items:center', 'justify-content:center',
            'padding:24px', 'font-family:Segoe UI,system-ui,sans-serif',
        ].join(';');
        var card = document.createElement('div');
        card.style.cssText = [
            'max-width:420px', 'width:100%', 'background:#12161e',
            'border:1px solid rgba(255,255,255,0.1)', 'padding:28px 24px',
            'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
        ].join(';');
        var title = document.createElement('div');
        title.textContent = 'Chart window limit';
        title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:10px;';
        var body = document.createElement('div');
        body.setAttribute('data-wlim-msg', '1');
        body.textContent = msg;
        body.style.cssText = 'font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:18px;';
        if (maxS != null) {
            var meta = document.createElement('div');
            meta.textContent = 'Your plan allows ' + maxS + ' concurrent chart window' + (maxS === 1 ? '' : 's') + '.';
            meta.style.cssText = 'font-size:12px;opacity:0.65;margin-bottom:18px;';
            card.appendChild(title);
            card.appendChild(body);
            card.appendChild(meta);
        } else {
            card.appendChild(title);
            card.appendChild(body);
        }
        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = 'Try again';
        reloadBtn.style.cssText = [
            'cursor:pointer', 'border:0', 'padding:8px 14px',
            'background:#2962ff', 'color:#fff', 'font-weight:600', 'font-size:13px',
        ].join(';');
        reloadBtn.onclick = function () { window.location.reload(); };
        var dashBtn = document.createElement('button');
        dashBtn.type = 'button';
        dashBtn.textContent = 'Back to dashboard';
        dashBtn.style.cssText = [
            'cursor:pointer', 'border:1px solid rgba(255,255,255,0.18)',
            'padding:8px 14px', 'background:transparent', 'color:#e8edf5',
            'font-weight:600', 'font-size:13px',
        ].join(';');
        dashBtn.onclick = function () { window.location.href = '/dashboard'; };
        actions.appendChild(reloadBtn);
        actions.appendChild(dashBtn);
        card.appendChild(actions);
        el.appendChild(card);
        (document.body || document.documentElement).appendChild(el);
        try { window.__talariaChartWindowBlocked = true; } catch (_e) { /* ignore */ }
    }

    function removeBlockedOverlay() {
        var el = document.getElementById('talariaWindowLimitOverlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        try { window.__talariaChartWindowBlocked = false; } catch (_e) { /* ignore */ }
    }

    var clientId = null;
    var heartbeatTimer = null;
    var claimInFlight = false;

    function release() {
        if (!clientId) return;
        var payload = JSON.stringify({ client_id: clientId });
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([payload], { type: 'application/json' });
                // POST — sendBeacon cannot reliably send DELETE.
                navigator.sendBeacon('/api/chart/windows/release', blob);
                return;
            }
        } catch (_e) { /* fall through */ }
        try {
            fetch('/api/chart/windows/release', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
            }).catch(function () { /* ignore */ });
        } catch (_e2) { /* ignore */ }
    }

    function heartbeat() {
        if (!clientId || window.__talariaChartWindowBlocked) return;
        fetch('/api/chart/windows/heartbeat', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
            cache: 'no-store',
        }).then(function (res) {
            if (res.status === 401) return;
            if (res.status === 409) {
                // Slot lost — try reclaim (may show limit overlay).
                claim(true);
            }
        }).catch(function () { /* ignore transient */ });
    }

    function claim(isRetry) {
        if (claimInFlight) return Promise.resolve(false);
        claimInFlight = true;
        clientId = getOrCreateClientId();
        return fetch('/api/chart/windows/claim', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
            cache: 'no-store',
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.ok && data && data.ok !== false) {
                    removeBlockedOverlay();
                    if (!heartbeatTimer) {
                        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
                    }
                    return true;
                }
                if (res.status === 409) {
                    var detail = parseDetail(res, data);
                    if (detail.code === 'chart_window_unknown' && !isRetry) {
                        return claim(true);
                    }
                    showBlockedOverlay(detail);
                    return false;
                }
                if (res.status === 401) return false;
                // Soft-fail: do not brick chart on unexpected server errors.
                return true;
            });
        }).catch(function () {
            return true;
        }).then(function (ok) {
            claimInFlight = false;
            return ok;
        });
    }

    function boot() {
        if (!shouldEnforce()) return;
        clientId = getOrCreateClientId();
        var started = false;
        function start() {
            if (started) return;
            started = true;
            claim(false);
        }
        if (window.__talariaUserId) {
            start();
        } else {
            var n = 0;
            var timer = setInterval(function () {
                n += 1;
                if (window.__talariaUserId || n > 80) {
                    clearInterval(timer);
                    start();
                }
            }, 50);
        }

        window.addEventListener('pagehide', release);
        window.addEventListener('beforeunload', release);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') heartbeat();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.__talariaChartWindowLimit = {
        claim: function () { return claim(false); },
        release: release,
        getClientId: function () { return clientId || getOrCreateClientId(); },
    };
})();
