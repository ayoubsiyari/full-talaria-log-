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
    /**
     * Ceiling on the window-limit control POSTs (claim / heartbeat / release).
     *
     * A server that accepts one of these and then goes quiet holds a socket open for the
     * life of the browser. HTTP/1.1 caps sockets per origin per BROWSER, not per tab, so a
     * handful of silent control POSTs starve every request to the origin — including the
     * static images of a tab that has not loaded yet. These three are our own small POSTs
     * and answer in milliseconds when the server is healthy, so a low ceiling costs nothing
     * and converts "hangs until the browser is closed" into a counted failure.
     */
    var CONTROL_TIMEOUT_MS = 10000;
    /**
     * Ceiling on how long a gated fetch may wait for the claim gate to open, independent of
     * the ceiling above. Belt and braces: it holds even if some future path reaches the gate
     * without going through a bounded control POST. Deliberately NOT applied to the gated
     * request itself — chart data downloads are legitimately slow and aborting them would
     * turn a working chart into a broken one.
     */
    var GATE_WAIT_TIMEOUT_MS = 12000;
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
    var heartbeatInFlight = false;
    /** window.fetch as it was before the patch; see controlFetch. */
    var pristineFetch = null;

    function release() {
        if (!shouldClaim() || !clientId) return;
        var payload = JSON.stringify({ client_id: clientId });
        // Prefer bounded controlFetch over sendBeacon. sendBeacon cannot be aborted, so a
        // silent /release held a socket for the life of the browser and the CONTROL_TIMEOUT_MS
        // ceiling never applied — the incomplete half of the P0 that markers alone could not
        // close (Director 2026-07-30 21:45 / TEST-02). keepalive still outlives the page; the
        // AbortController bound in controlFetch is what makes the socket releasable while this
        // document is alive (reload / second-tab race). sendBeacon remains a last-resort
        // fallback when fetch itself is unavailable.
        try {
            if (pristineFetch || typeof window.fetch === 'function') {
                controlFetch('/api/chart/windows/release', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                }).catch(function () { /* ignore */ });
                return;
            }
        } catch (_e) { /* fall through to beacon */ }
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/chart/windows/release', blob);
            }
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
     * fetch() for the window-limit control POSTs, with a hard ceiling and a definite outcome.
     *
     * On timeout the request is ABORTED, not merely ignored: the socket must actually close,
     * otherwise the promise settles while the connection stays wedged in the browser's shared
     * per-origin pool and the starvation continues invisibly. The abort surfaces as a
     * rejection, which every caller here already handles as "never answered".
     */
    function controlFetch(url, init) {
        // The pristine fetch, never the patched one: the control POSTs are not gated URLs
        // today, so the patch would pass them through, but a widened gate must not be able to
        // make the claim wait on itself.
        var base = pristineFetch || window.fetch;
        if (talariaDisableFlagTruthy('__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1')) {
            return base(url, init);
        }
        var controller = null;
        try {
            if (typeof AbortController === 'function') controller = new AbortController();
        } catch (_e) { /* no AbortController: fall through to the plain request */ }
        var next = init ? Object.assign({}, init) : {};
        if (controller) next.signal = controller.signal;
        var timer = null;
        var timedOut = false;
        var settle = function () {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        };
        try {
            timer = setTimeout(function () {
                timedOut = true;
                try {
                    if (controller) controller.abort();
                } catch (_e2) { /* already gone */ }
            }, CONTROL_TIMEOUT_MS);
        } catch (_e3) { /* no timers: the request is unbounded, as it was before */ }
        return base(url, next).then(function (res) {
            settle();
            return res;
        }, function (err) {
            settle();
            if (timedOut) {
                warnOnce(
                    '[chart-window-limit] ' + url + ' did not answer within '
                    + CONTROL_TIMEOUT_MS + 'ms; request aborted so it cannot hold a socket. '
                    + 'Counted as a failed server write.'
                );
            }
            throw err;
        });
    }

    var warnedMessages = null;
    /** Loud, but once per message: a stalled endpoint retries and must not storm the console. */
    function warnOnce(message) {
        try {
            if (!warnedMessages) warnedMessages = {};
            if (warnedMessages[message]) return;
            warnedMessages[message] = true;
            console.warn(message);
        } catch (_e) { /* diagnostics must never break the claim path */ }
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
        // Without this guard a stalled endpoint gets a fresh socket every HEARTBEAT_MS and the
        // pool dies by accumulation rather than by any single hung request.
        if (heartbeatInFlight) return;
        heartbeatInFlight = true;
        var done = function () { heartbeatInFlight = false; };
        return controlFetch('/api/chart/windows/heartbeat', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
            cache: 'no-store',
        }).then(function (res) {
            done();
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
        }).catch(function () {
            done();
            /* ignore transient */
        });
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
        }, function () {
            // A rejected claim must not become the cached answer for every later gated fetch:
            // clear the in-flight state so the next one gets a fresh attempt, and soft-open so
            // a dead windows API cannot brick the chart.
            claimInFlight = false;
            claimPromise = null;
            noteClaimFailure(0);
            return true;
        });
        return claimPromise;
    }

    function sendClaimRequest(isRetry, retryOnce) {
        clientId = getOrCreateClientId();
        return controlFetch('/api/chart/windows/claim', {
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
        return withGateTimeout(claimPromise ? claimPromise : claim(false));
    }

    /**
     * Guarantee that waiting on the claim gate ends, whatever the gate does.
     *
     * The bounded control POSTs above are the fix; this is the floor under it. Any gated
     * fetch that reaches the gate gets an answer within GATE_WAIT_TIMEOUT_MS even if the
     * claim promise never settles for a reason nobody has thought of yet. Timing out opens
     * the gate rather than closing it: a windows API we cannot reach is not evidence that
     * this window lost its slot, and failing closed here would show an empty chart.
     */
    function withGateTimeout(promise) {
        if (talariaDisableFlagTruthy('__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1')) {
            return promise;
        }
        if (typeof setTimeout !== 'function') return promise;
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                warnOnce(
                    '[chart-window-limit] claim gate did not answer within '
                    + GATE_WAIT_TIMEOUT_MS + 'ms; opening the gate so requests are not held. '
                    + 'Counted as a failed server write.'
                );
                noteClaimFailure(0);
                resolve(true);
            }, GATE_WAIT_TIMEOUT_MS);
            var finish = function (value) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(value);
            };
            promise.then(finish, function () { finish(true); });
        });
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
        pristineFetch = originalFetch;
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
