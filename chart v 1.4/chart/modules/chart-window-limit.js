/**
 * Limit concurrent Talaria chart windows / PWA apps using users.max_sessions.
 * Over-cap policy: kick-oldest (newest window wins).
 * Multichart panel iframes (panelId=…) do not claim a slot — they inherit the
 * host window id and still send X-Talaria-Chart-Window-Id on heavy API calls.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'talaria_chart_window_id';
    var HEADER_NAME = 'X-Talaria-Chart-Window-Id';
    var HEARTBEAT_MS = 25000;
    var KICKED_MESSAGE = 'This chart was opened elsewhere — reload to take over.';
    /** Set when the windows API is missing/misrouted (e.g. nginx 405) so we stop spamming. */
    var apiUnavailable = false;
    var fetchPatched = false;
    var wsPatched = false;
    var claimPromise = null;
    var everClaimed = false;

    function isMultichartPanel() {
        try {
            var p = new URLSearchParams(window.location.search || '');
            if (p.get('panelId')) return true;
        } catch (_e) { /* ignore */ }
        return false;
    }

    function shouldClaim() {
        return !isMultichartPanel();
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

    function resolveSharedClientId() {
        try {
            var p = new URLSearchParams(window.location.search || '');
            var fromUrl = (p.get('chartWindowId') || p.get('chart_window_id') || '').trim();
            if (fromUrl && fromUrl.length >= 8) return fromUrl.slice(0, 64);
        } catch (_e) { /* ignore */ }
        try {
            if (window.parent && window.parent !== window) {
                var parentApi = window.parent.__talariaChartWindowLimit;
                if (parentApi && typeof parentApi.getClientId === 'function') {
                    var fromParent = parentApi.getClientId();
                    if (fromParent && String(fromParent).length >= 8) {
                        return String(fromParent).slice(0, 64);
                    }
                }
            }
        } catch (_e2) { /* cross-origin */ }
        return null;
    }

    function parseDetail(res, data) {
        var d = data && data.detail;
        if (d && typeof d === 'object') return d;
        if (typeof d === 'string') {
            try { return JSON.parse(d); } catch (_e) { return { message: d }; }
        }
        return { message: (data && data.message) || ('Window limit (' + res.status + ')') };
    }

    function isKickedDetail(detail) {
        var code = detail && detail.code;
        return code === 'chart_window_kicked' || code === 'chart_window_unknown';
    }

    function showBlockedOverlay(detail) {
        var msg = (detail && detail.message) || KICKED_MESSAGE;
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
        title.textContent = 'Chart opened elsewhere';
        title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:10px;';
        var body = document.createElement('div');
        body.setAttribute('data-wlim-msg', '1');
        body.textContent = msg;
        body.style.cssText = 'font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:18px;';
        card.appendChild(title);
        card.appendChild(body);
        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = 'Reload to take over';
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
        try {
            window.dispatchEvent(new CustomEvent('talaria-chart-window-blocked', {
                detail: detail || { message: msg },
            }));
        } catch (_e2) { /* ignore */ }
        stopHeavyWork();
    }

    function removeBlockedOverlay() {
        var el = document.getElementById('talariaWindowLimitOverlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        try { window.__talariaChartWindowBlocked = false; } catch (_e) { /* ignore */ }
    }

    function stopHeavyWork() {
        try {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        } catch (_e) { /* ignore */ }
        try {
            var chart = window.chart;
            if (chart) {
                if (typeof chart.stopReplay === 'function') chart.stopReplay();
                else if (chart.replaySystem && typeof chart.replaySystem.pause === 'function') {
                    chart.replaySystem.pause();
                } else if (chart.replaySystem && typeof chart.replaySystem.stop === 'function') {
                    chart.replaySystem.stop();
                }
            }
        } catch (_e2) { /* ignore */ }
    }

    var clientId = null;
    var heartbeatTimer = null;
    var claimInFlight = false;

    function release() {
        if (!shouldClaim() || !clientId) return;
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

    /**
     * LIFE-3 — bfcache defeat. Marker: LIFE-3-BFCACHE-DEFEAT-V1.
     *
     * The chart document must never be stored in the back/forward cache. Two reasons, and the second is
     * the one that put this on the roster:
     *
     *   1. Correctness. `pagehide` releases the window claim unconditionally today. A page frozen into
     *      bfcache is NOT torn down - it comes back. So we hand back our slot, the row is deleted, and
     *      the restored page's next heartbeat gets 409 chart_window_unknown with everClaimed already
     *      true, which shows the user "This chart was opened elsewhere - reload to take over" for the
     *      crime of pressing Back.
     *   2. Memory. A bfcached chart keeps its entire heap and its decoded bitmaps resident while
     *      invisible. At the measured ~24 MB per thousand resident bars that is a parked ghost with the
     *      full weight of a live engine, which is one of the few mechanisms that would produce a floor.
     *
     * The primary defeat is `Cache-Control: no-store` on the document, applied server-side - a page
     * served no-store is not bfcache-eligible. Everything below is the safety net for when that header
     * does not arrive (a proxy rewrites it, a route is missed, a browser disagrees), and it is also the
     * instrument that tells us the primary defeat failed instead of failing silently.
     *
     * Switch: window.__TALARIA_BFCACHE_DEFEAT_V1 === false restores the old unconditional release.
     * Default ON, per RELEASE-01 - the switch is an incident brake and the OFF arm for attribution.
     */
    function bfcacheDefeatEnabled() {
        try {
            return window.__TALARIA_BFCACHE_DEFEAT_V1 !== false;
        } catch (_e) {
            return true;
        }
    }

    /** Observability: counts survive a bfcache round trip because the document itself does. */
    var bfcacheStats = { captured: 0, restored: 0, lastCapturedAt: 0, lastRestoredAt: 0, reclaimed: 0 };

    function onPageHide(event) {
        var persisted = !!(event && event.persisted);
        if (persisted && bfcacheDefeatEnabled()) {
            // Frozen, not closed. Releasing here is precisely what makes the restored page look kicked,
            // so hold the slot and let the server-side heartbeat cutoff reclaim it if we never return.
            bfcacheStats.captured += 1;
            bfcacheStats.lastCapturedAt = Date.now();
            try {
                console.warn('[LIFE-3-BFCACHE-DEFEAT-V1] document entered bfcache despite no-store; '
                    + 'holding the window claim so the restore is not mistaken for a takeover');
            } catch (_e) { /* ignore */ }
            return;
        }
        release();
    }

    function onPageShow(event) {
        if (!(event && event.persisted)) return;   // ordinary load; nothing to repair
        if (!bfcacheDefeatEnabled()) return;
        bfcacheStats.restored += 1;
        bfcacheStats.lastRestoredAt = Date.now();
        try {
            console.warn('[LIFE-3-BFCACHE-DEFEAT-V1] restored from bfcache - the no-store defeat did not '
                + 'hold on this route. Re-validating the window claim.');
        } catch (_e) { /* ignore */ }
        // The claim may have expired against the server cutoff while we were frozen, so re-establish it
        // rather than waiting for the next heartbeat to fail and show a false takeover overlay.
        if (!shouldClaim()) return;
        bfcacheStats.reclaimed += 1;
        // Clear the in-flight dedupe first. `claim()` returns the existing promise when one is pending,
        // which is right for concurrent boot callers and wrong here: a claim that was in flight when the
        // document froze settled against a server state that no longer exists, and reusing its promise
        // means the restore issues no request at all. Found by the behavioural gate, not by reading.
        claimInFlight = false;
        claimPromise = null;
        try {
            claim(false);
        } catch (_e2) { /* ignore */ }
    }

    function markApiUnavailable(status) {
        if (apiUnavailable) return;
        // 405 = wrong upstream (method not allowed); 404 = route missing.
        if (status !== 404 && status !== 405) return;
        apiUnavailable = true;
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        try {
            console.warn(
                '[chart-window-limit] /api/chart/windows/* unavailable (HTTP '
                + status + '); window-limit checks paused for this page.'
            );
        } catch (_e) { /* ignore */ }
    }

    function handleKicked(detail) {
        showBlockedOverlay(detail || { code: 'chart_window_kicked', message: KICKED_MESSAGE });
    }

    function heartbeat() {
        if (apiUnavailable || !clientId || window.__talariaChartWindowBlocked) return;
        if (!shouldClaim()) return;
        fetch('/api/chart/windows/heartbeat', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
            cache: 'no-store',
        }).then(function (res) {
            if (res.status === 401) return;
            if (res.status === 404 || res.status === 405) {
                markApiUnavailable(res.status);
                return;
            }
            if (res.status === 409) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    var detail = parseDetail(res, data);
                    if (isKickedDetail(detail) || everClaimed) {
                        handleKicked(detail);
                        return;
                    }
                    // Rare: never claimed successfully — try reclaim once.
                    claim(true);
                });
            }
        }).catch(function () { /* ignore transient */ });
    }

    function claim(isRetry) {
        if (!shouldClaim()) {
            return Promise.resolve(true);
        }
        if (apiUnavailable) return Promise.resolve(true);
        if (claimInFlight && claimPromise) return claimPromise;
        claimInFlight = true;
        clientId = getOrCreateClientId();
        claimPromise = fetch('/api/chart/windows/claim', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
            cache: 'no-store',
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.ok && data && data.ok !== false) {
                    everClaimed = true;
                    removeBlockedOverlay();
                    if (!heartbeatTimer) {
                        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
                    }
                    return true;
                }
                if (res.status === 409) {
                    var detail = parseDetail(res, data);
                    // Legacy block-new response — treat as kicked/takeover UX.
                    if (detail.code === 'chart_window_limit') {
                        handleKicked({
                            code: 'chart_window_kicked',
                            message: detail.message || KICKED_MESSAGE,
                        });
                        return false;
                    }
                    if (isKickedDetail(detail) && !isRetry) {
                        // Unexpected on claim; retry once after release race.
                        return claim(true);
                    }
                    handleKicked(detail);
                    return false;
                }
                if (res.status === 401) return false;
                if (res.status === 404 || res.status === 405) {
                    markApiUnavailable(res.status);
                    return true;
                }
                // Soft-fail: do not brick chart on unexpected server errors during bootstrap.
                return true;
            });
        }).catch(function () {
            return true;
        }).then(function (ok) {
            claimInFlight = false;
            return ok;
        });
        return claimPromise;
    }

    function ensureClaimed() {
        if (!shouldClaim()) return Promise.resolve(true);
        if (window.__talariaChartWindowBlocked) return Promise.resolve(false);
        if (everClaimed && clientId) return Promise.resolve(true);
        if (claimPromise) return claimPromise;
        return claim(false);
    }

    function isGatedUrl(url) {
        try {
            var u = typeof url === 'string' ? url : (url && url.url) || '';
            if (!u) return false;
            // Relative or same-origin absolute.
            var path = u;
            if (/^https?:\/\//i.test(u)) {
                var parsed = new URL(u, window.location.href);
                if (parsed.origin !== window.location.origin) return false;
                path = parsed.pathname || '';
            } else {
                try {
                    path = new URL(u, window.location.href).pathname || u;
                } catch (_e) {
                    path = u;
                }
            }
            if (path.indexOf('/api/file/') === 0) return true;
            if (/^\/api\/sessions\/\d+\/state\/?$/.test(path)) return true;
            return false;
        } catch (_e2) {
            return false;
        }
    }

    function withWindowHeader(init) {
        var headers;
        if (init && init.headers) {
            if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                headers = new Headers(init.headers);
            } else if (Array.isArray(init.headers)) {
                headers = new Headers(init.headers);
            } else {
                headers = new Headers(init.headers);
            }
        } else {
            headers = new Headers();
        }
        if (clientId && !headers.has(HEADER_NAME)) {
            headers.set(HEADER_NAME, clientId);
        }
        var next = init ? Object.assign({}, init) : {};
        next.headers = headers;
        if (next.credentials == null) next.credentials = 'include';
        return next;
    }

    function installFetchPatch() {
        if (fetchPatched || typeof window.fetch !== 'function') return;
        fetchPatched = true;
        var originalFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (!isGatedUrl(url)) {
                return originalFetch(input, init);
            }
            if (window.__talariaChartWindowBlocked) {
                return Promise.resolve(new Response(
                    JSON.stringify({
                        detail: {
                            code: 'chart_window_kicked',
                            message: KICKED_MESSAGE,
                        },
                    }),
                    { status: 409, headers: { 'Content-Type': 'application/json' } }
                ));
            }
            return ensureClaimed().then(function (ok) {
                if (!ok || window.__talariaChartWindowBlocked) {
                    return new Response(
                        JSON.stringify({
                            detail: {
                                code: 'chart_window_kicked',
                                message: KICKED_MESSAGE,
                            },
                        }),
                        { status: 409, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                if (!clientId) {
                    clientId = isMultichartPanel()
                        ? (resolveSharedClientId() || getOrCreateClientId())
                        : getOrCreateClientId();
                }
                return originalFetch(input, withWindowHeader(init)).then(function (res) {
                    if (res.status === 409) {
                        res.clone().json().catch(function () { return {}; }).then(function (data) {
                            var detail = parseDetail(res, data);
                            if (isKickedDetail(detail) || !detail.code) {
                                handleKicked(detail);
                            }
                        });
                    }
                    return res;
                });
            });
        };
    }

    function installWebSocketPatch() {
        if (wsPatched || typeof window.WebSocket !== 'function') return;
        wsPatched = true;
        var OriginalWS = window.WebSocket;
        window.WebSocket = function (url, protocols) {
            var finalUrl = url;
            try {
                if (typeof url === 'string' && url.indexOf('/ws/chart/') !== -1 && clientId) {
                    var u = new URL(url, window.location.href);
                    if (!u.searchParams.get('chart_window_id')) {
                        u.searchParams.set('chart_window_id', clientId);
                    }
                    finalUrl = u.toString();
                }
            } catch (_e) { /* ignore */ }
            if (protocols === undefined) return new OriginalWS(finalUrl);
            return new OriginalWS(finalUrl, protocols);
        };
        window.WebSocket.prototype = OriginalWS.prototype;
        try {
            Object.keys(OriginalWS).forEach(function (k) {
                try { window.WebSocket[k] = OriginalWS[k]; } catch (_e2) { /* ignore */ }
            });
            window.WebSocket.CONNECTING = OriginalWS.CONNECTING;
            window.WebSocket.OPEN = OriginalWS.OPEN;
            window.WebSocket.CLOSING = OriginalWS.CLOSING;
            window.WebSocket.CLOSED = OriginalWS.CLOSED;
        } catch (_e3) { /* ignore */ }
    }

    function boot() {
        installFetchPatch();
        installWebSocketPatch();

        if (isMultichartPanel()) {
            clientId = resolveSharedClientId();
            if (!clientId) {
                // Host may still be claiming — retry briefly for parent id.
                var tries = 0;
                var timer = setInterval(function () {
                    tries += 1;
                    clientId = resolveSharedClientId();
                    if (clientId || tries > 40) clearInterval(timer);
                }, 50);
            }
            return;
        }

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
            var waitTimer = setInterval(function () {
                n += 1;
                if (window.__talariaUserId || n > 80) {
                    clearInterval(waitTimer);
                    start();
                }
            }, 50);
        }

        // LIFE-3: pagehide must distinguish "closing" from "freezing"; beforeunload only ever means the
        // former, so it keeps the unconditional release.
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('pageshow', onPageShow);
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

    // Install patches immediately so early chart fetches wait on claim.
    installFetchPatch();
    installWebSocketPatch();
    if (shouldClaim()) {
        clientId = getOrCreateClientId();
    } else {
        clientId = resolveSharedClientId();
    }

    window.__talariaChartWindowLimit = {
        claim: function () { return claim(false); },
        release: release,
        getClientId: function () {
            if (clientId) return clientId;
            if (isMultichartPanel()) {
                clientId = resolveSharedClientId();
                return clientId;
            }
            return getOrCreateClientId();
        },
        ensureClaimed: ensureClaimed,
        isBlocked: function () { return !!window.__talariaChartWindowBlocked; },
        /** LIFE-3-BFCACHE-DEFEAT-V1 — non-zero `captured`/`restored` means the no-store defeat failed. */
        bfcacheStats: function () {
            return {
                enabled: bfcacheDefeatEnabled(),
                captured: bfcacheStats.captured,
                restored: bfcacheStats.restored,
                reclaimed: bfcacheStats.reclaimed,
                lastCapturedAt: bfcacheStats.lastCapturedAt,
                lastRestoredAt: bfcacheStats.lastRestoredAt,
            };
        },
    };
})();
