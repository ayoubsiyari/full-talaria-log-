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

    /**
     * Realm-climbing truthiness read (B-0185): this module loads in the host AND in
     * every panel iframe, so a switch the PO types on the page in front of him must
     * be visible from the panel realm or the control is inert.
     */
    function talariaDisableFlagTruthy(flagName) {
        var killed = function (w) {
            try {
                return !!(w && w[flagName]);
            } catch (_e) {
                return false;
            }
        };
        if (killed(window)) return true;
        try {
            var parent = (window.parent && window.parent !== window) ? window.parent : null;
            if (killed(parent)) return true;
            var top = (window.top && window.top !== window && window.top !== parent)
                ? window.top
                : null;
            if (killed(top)) return true;
        } catch (_e) { /* parent chain unreachable; own-realm read above stands */ }
        return false;
    }

    /**
     * Count a failed claim into the support passport's failed-write ledger.
     *
     * Why the claim and not the fetches it blocks: a claim that does not succeed makes
     * `ensureClaimed()` resolve false, and the fetch patch then answers every gated URL
     * (/api/file/*, /api/sessions/N/state) with a synthetic 409 that never reaches the
     * network. Nothing in the product says so, no server log records it, and the chart
     * simply has no data — the same silent shape as the prefs 500. The claim is a POST,
     * so a non-OK claim genuinely is a failed server write; the blocked reads downstream
     * are consequences and counting each of them would storm the counter.
     *
     * Kill: window.__TALARIA_DISABLE_CLAIM_FAILURE_LEDGER_V1 (climbing).
     */
    function noteClaimFailure(status) {
        if (talariaDisableFlagTruthy('__TALARIA_DISABLE_CLAIM_FAILURE_LEDGER_V1')) return;
        try {
            if (typeof window.__talariaNoteServerWriteFailure === 'function') {
                window.__talariaNoteServerWriteFailure(
                    '/api/chart/windows/claim',
                    Number(status) || 0
                );
            }
        } catch (_e) { /* diagnostics must never break the claim path */ }
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

    /**
     * Issue one claim request. Split out from `claim()` so the release-race retry can
     * make a FRESH request.
     *
     * The bug this removes: the retry used to call `claim(true)`, which hit the
     * single-flight guard (`claimInFlight` is still true while we are inside the
     * handler) and returned `claimPromise` — the very chained promise whose resolution
     * that handler was computing. A promise awaiting its own descendant never settles,
     * and this is not the self-resolution case the spec detects, so it does not even
     * reject. `ensureClaimed()` then hands that permanently-pending promise to the fetch
     * patch, and every gated URL (`/api/file/*`, `/api/sessions/N/state`) hangs forever
     * with no error, no console line and no server log — the chart just has no data.
     * It needs a 409 with a kicked detail on the first claim, which is what a reload or
     * a second window produces before the old window's release lands, so it fires on
     * some loads and not others.
     *
     * Kill: window.__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1 (climbing) restores the
     * self-referential retry.
     */
    function sendClaim(isRetry) {
        if (talariaDisableFlagTruthy('__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1')) {
            return sendClaimRequest(isRetry, function () { return claim(true); });
        }
        return sendClaimRequest(isRetry, function () { return sendClaim(true); });
    }

    function claim(isRetry) {
        if (!shouldClaim()) {
            return Promise.resolve(true);
        }
        if (apiUnavailable) return Promise.resolve(true);
        if (claimInFlight && claimPromise) return claimPromise;
        claimInFlight = true;
        claimPromise = sendClaim(!!isRetry).then(function (ok) {
            claimInFlight = false;
            return ok;
        });
        return claimPromise;
    }

    function sendClaimRequest(isRetry, retryOnce) {
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
                    everClaimed = true;
                    removeBlockedOverlay();
                    if (!heartbeatTimer) {
                        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
                    }
                    // Deliberately does NOT clear the failed-write ledger: that record is
                    // shared with the preferences write path, and a healthy claim is no
                    // evidence that saving settings works.
                    return true;
                }
                if (res.status === 409) {
                    var detail = parseDetail(res, data);
                    // Legacy block-new response — treat as kicked/takeover UX.
                    if (detail.code === 'chart_window_limit') {
                        noteClaimFailure(res.status);
                        handleKicked({
                            code: 'chart_window_kicked',
                            message: detail.message || KICKED_MESSAGE,
                        });
                        return false;
                    }
                    if (isKickedDetail(detail) && !isRetry) {
                        // Unexpected on claim; retry once after release race. Not counted —
                        // the retry's own outcome is the one worth reporting.
                        return retryOnce();
                    }
                    noteClaimFailure(res.status);
                    handleKicked(detail);
                    return false;
                }
                if (res.status === 401) {
                    // Fails CLOSED: every gated fetch now gets a synthetic 409 without
                    // touching the network, so the chart has no data and no server log
                    // records why. Counted so the passport says so.
                    noteClaimFailure(res.status);
                    return false;
                }
                if (res.status === 404 || res.status === 405) {
                    markApiUnavailable(res.status);
                    noteClaimFailure(res.status);
                    return true;
                }
                // Soft-fail: do not brick chart on unexpected server errors during bootstrap.
                noteClaimFailure(res.status);
                return true;
            });
        }).catch(function () {
            // No response at all (offline, DNS, abort). Status 0 = "never answered".
            noteClaimFailure(0);
            return true;
        });
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
    };
})();
