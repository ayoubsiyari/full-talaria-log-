/**
 * talaria-version-reload.js — host-only "A new version is available — Reload" prompt.
 *
 * When a newer chart build has been deployed while this tab stays open on an
 * older build, show a small, non-intrusive, DISMISSIBLE toast on the HOST page
 * (never inside a multichart panel iframe) with a Reload button that does a HARD
 * escape: it unregisters ALL service worker registrations and deletes ALL caches
 * BEFORE reloading, so a service worker actively controlling the page can no
 * longer serve the stale cached bundle (a plain location.reload() cannot escape
 * a controlling SW and re-shows the toast forever). Additive UI only — it does
 * not steal focus, block interaction, or auto-reload. This retires the recurring
 * "panels run old cached code after a deploy" stale-tab problem.
 *
 * RELOAD SAFETY: every SW/Cache API is feature-detected and guarded
 * (navigator.serviceWorker may be undefined in an insecure context / sandboxed
 * frame → "Cannot read properties of undefined (reading 'getRegistrations')").
 * When those APIs are absent the handler falls back to a plain hard reload; it
 * never throws and ALWAYS reaches a reload even if teardown rejects. The SW
 * caching strategy (sw.js install/activate/fetch) is UNCHANGED — this is purely
 * the client-side button handler.
 *
 * RETIRED (default OFF): the prompt is no longer shown. Opt back in only for
 * harness/tests via window.__TALARIA_MC_ENABLE_VERSION_RELOAD_PROMPT === true.
 * Legacy kill switch __TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT still forces OFF.
 *
 * MECHANISM: the loaded build id is window.__TALARIA_CHART_BUILD_ID (embedded in
 * the host HTML head — the existing source of truth). The deployed build id is
 * read by fetching a CONCRETE ASSET the service worker does NOT navigation-
 * fallback-cache — /chart/sw.js, whose SW_VERSION ("talaria-chart-<build>") is
 * kept in lockstep with the HTML build id by bump-dist-v9-cache.mjs — fresh
 * (cache:'no-store' + a UNIQUE cache-busting query) and extracting its build id.
 * A confident, non-empty MISMATCH shows the toast; a MATCH (or a network hiccup)
 * shows nothing. No new server endpoint / deploy config is introduced.
 * Triggered on window focus + a low-frequency safety-net interval.
 *
 * WHY NOT THE HOST DOCUMENT (b94 field failure): the previous version fetched the
 * host document (location.pathname) with cache:'no-store'. cache:'no-store' only
 * controls the HTTP cache — it does NOT bypass an active service worker. A caching
 * SW with a navigation fallback serves the STALE cached index.html for ANY
 * navigation-shaped URL regardless of query, so the staleness detector compared
 * stale-vs-stale (b94==b94) and never fired. /chart/sw.js is a concrete .js asset
 * (not a navigation), so it is never navigation-fallback-served; combined with a
 * unique cache-buster + no-store the request reaches the network for the truly-
 * deployed build id. The SW caching strategy is UNCHANGED (no postMessage
 * handshake, no strategy edit).
 */
(function (root) {
    'use strict';
    var doc = root.document;
    if (!doc) return;

    var TOAST_KEY = 'talaria-version-reload';
    var TOAST_ATTR = 'data-talaria-version-reload';
    // sessionStorage survives reload/cancel within the tab — in-memory _dismissedFor alone
    // let focus/visibility checks re-nag immediately after dismiss (TAL-01564).
    var DISMISS_STORAGE_KEY = 'talaria_vr_dismissed_for';
    // Low-frequency safety-net poll (window focus is the primary trigger).
    var POLL_MS = 15 * 60 * 1000;

    function killed() {
        if (root.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT === true) return true;
        // Default OFF — product no longer shows "A new version is available".
        return root.__TALARIA_MC_ENABLE_VERSION_RELOAD_PROMPT !== true;
    }

    // HOST-only: never run inside a multichart panel iframe.
    function isPanel() {
        try {
            if (root.__TALARIA_EMBED_LITE) return true;
            var p = new URLSearchParams(root.location.search);
            if (p.get('multichart') === '1') return true;
        } catch (_) { /* ignore */ }
        try {
            if (root.top && root.top !== root.self) return true;
        } catch (_) {
            // Cross-origin framing throws — treat as framed → do not show.
            return true;
        }
        return false;
    }

    function loadedBuildId() {
        var v = root.__TALARIA_CHART_BUILD_ID;
        return v != null ? String(v).trim() : '';
    }

    /**
     * Extract a build id from deployed asset text. Order: sw.js SW_VERSION first
     * (the marker we fetch), then the HTML __TALARIA_CHART_BUILD_ID assignment,
     * then a ?v= asset fallback — so the parser works against sw.js OR a document.
     */
    function parseBuildId(html) {
        if (!html) return '';
        var sw = /SW_VERSION\s*=\s*['"]talaria-chart-([^'"]+)['"]/.exec(html);
        if (sw && sw[1]) return sw[1].trim();
        var m = /__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/.exec(html);
        if (m && m[1]) return m[1].trim();
        var m2 = /\/chart\/[^"'?\s]+\?v=([^"'#\s&]+)/.exec(html);
        return m2 && m2[1] ? m2[1].trim() : '';
    }

    // Monotonic per-tab sequence so every version-check URL is unique even when
    // two checks fire within the same millisecond (Date.now() alone can collide).
    var _vrcSeq = 0;

    /**
     * Fetch the deployed build-id marker fresh and return its build id ('' on
     * failure). Targets /chart/sw.js — a concrete asset the SW does NOT
     * navigation-fallback-cache — with cache:'no-store' + a UNIQUE cache-buster so
     * the request cannot be satisfied from the HTTP cache OR a caching SW and must
     * reach the network for the truly-deployed build id.
     */
    function fetchDeployedId() {
        var url;
        var bust = '?__vrc=' + Date.now() + '-' + (++_vrcSeq);
        try {
            url = root.location.origin + '/chart/sw.js' + bust;
        } catch (_) {
            url = '/chart/sw.js' + bust;
        }
        return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
            .then(function (r) { return r && r.ok ? r.text() : ''; })
            .then(function (t) { return parseBuildId(t); })
            .catch(function () { return ''; });
    }

    // Deployed id the user explicitly dismissed → do not re-nag for the same id.
    var _dismissedFor = null;
    var _checkInFlight = null;

    function readDismissedFor() {
        if (_dismissedFor) return _dismissedFor;
        try {
            var raw = sessionStorage.getItem(DISMISS_STORAGE_KEY);
            if (raw != null && String(raw).trim() !== '') {
                _dismissedFor = String(raw).trim();
                return _dismissedFor;
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    function writeDismissedFor(deployedId) {
        _dismissedFor = deployedId ? String(deployedId).trim() : null;
        try {
            if (_dismissedFor) sessionStorage.setItem(DISMISS_STORAGE_KEY, _dismissedFor);
            else sessionStorage.removeItem(DISMISS_STORAGE_KEY);
        } catch (_) { /* ignore */ }
    }

    function toastStack() {
        return root.__TalariaToastStack || null;
    }

    function clearToast() {
        var ts = toastStack();
        if (ts && typeof ts.clearPinned === 'function') {
            try { ts.clearPinned(TOAST_KEY); } catch (_) { /* ignore */ }
        }
        var existing = doc.querySelector('[' + TOAST_ATTR + ']');
        if (existing && existing.parentNode) {
            try { existing.parentNode.removeChild(existing); } catch (_) { /* ignore */ }
        }
    }

    // Final step of the reload: a cache-busting navigation (so the HTTP cache
    // also can't re-serve stale), falling back to a plain reload. Never throws.
    function reloadNow() {
        try {
            var u = new URL(root.location.href);
            u.searchParams.set('__vr', String(Date.now()));
            root.location.replace(u.toString());
        } catch (_) {
            try { root.location.reload(); } catch (__) { /* ignore */ }
        }
    }

    /**
     * HARD escape then reload. A plain reload cannot escape a service worker that
     * is actively controlling the page and serving a stale cached bundle, so tear
     * down the SW + caches first:
     *   1. unregister ALL service worker registrations,
     *   2. delete ALL caches,
     *   3. THEN reload.
     * Every API is feature-detected and guarded — navigator.serviceWorker may be
     * undefined (insecure context / sandboxed frame) and caches may be absent; in
     * that case fall back to a plain hard reload. Wrapped so it never throws, and
     * uses Promise.allSettled so it ALWAYS reaches reloadNow() even if any
     * unregister / cache-delete rejects. Does NOT touch the SW caching strategy.
     */
    function hardReload() {
        var tasks = [];
        try {
            var nav = root.navigator;
            if (nav && ('serviceWorker' in nav) && nav.serviceWorker &&
                typeof nav.serviceWorker.getRegistrations === 'function') {
                tasks.push(
                    nav.serviceWorker.getRegistrations().then(function (regs) {
                        return Promise.allSettled((regs || []).map(function (r) {
                            return (r && typeof r.unregister === 'function')
                                ? r.unregister()
                                : Promise.resolve();
                        }));
                    }).catch(function () { /* ignore — still reload */ })
                );
            }
        } catch (_) { /* ignore — still reload */ }

        try {
            if (('caches' in root) && root.caches &&
                typeof root.caches.keys === 'function') {
                tasks.push(
                    root.caches.keys().then(function (keys) {
                        return Promise.allSettled((keys || []).map(function (k) {
                            try { return root.caches.delete(k); }
                            catch (_) { return Promise.resolve(false); }
                        }));
                    }).catch(function () { /* ignore — still reload */ })
                );
            }
        } catch (_) { /* ignore — still reload */ }

        // No SW/Cache APIs available (insecure context / sandboxed frame) →
        // plain hard reload without throwing.
        if (!tasks.length) { reloadNow(); return; }

        // Let unregister + cache-delete settle before navigation — an immediate
        // reload can re-attach a controlling SW still serving stale HTML (TAL-01564).
        function settleThenReload() {
            try {
                return new Promise(function (resolve) {
                    root.setTimeout(resolve, 80);
                });
            } catch (_) {
                return Promise.resolve();
            }
        }

        try {
            Promise.allSettled(tasks)
                .then(settleThenReload, settleThenReload)
                .then(reloadNow, reloadNow);
        } catch (_) {
            reloadNow();
        }
    }

    function buildToastEl(deployedId) {
        var light = doc.body && doc.body.classList.contains('light-mode');
        var wrap = doc.createElement('div');
        wrap.setAttribute(TOAST_ATTR, deployedId || '1');
        wrap.setAttribute('role', 'status');
        Object.assign(wrap.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: light ? '#E8EBF6' : '#0F1119',
            border: '1px solid ' + (light ? 'rgba(0,5,40,0.26)' : 'rgba(140,160,255,0.12)'),
            color: light ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.92)',
            fontFamily: "'Exo 2',sans-serif",
            fontSize: '11px',
            fontWeight: '600',
            padding: '6px 8px 6px 14px',
            borderRadius: '2px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
            maxWidth: 'min(92vw, 380px)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
        });

        var stripe = doc.createElement('div');
        Object.assign(stripe.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            bottom: '0',
            width: '3px',
            pointerEvents: 'none',
            background: 'linear-gradient(180deg,transparent,' + (light ? '#2F55E8' : '#4A6AFF') + ',transparent)',
        });
        wrap.appendChild(stripe);

        var label = doc.createElement('span');
        label.textContent = 'A new version is available';
        label.style.pointerEvents = 'none';
        wrap.appendChild(label);

        var reload = doc.createElement('button');
        reload.type = 'button';
        reload.textContent = 'Reload';
        Object.assign(reload.style, {
            cursor: 'pointer',
            font: 'inherit',
            fontWeight: '700',
            color: '#ffffff',
            background: light ? '#2F55E8' : '#4A6AFF',
            border: '0',
            borderRadius: '2px',
            padding: '3px 10px',
            pointerEvents: 'auto',
        });
        reload.addEventListener('click', function () { hardReload(); });
        wrap.appendChild(reload);

        var dismiss = doc.createElement('button');
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.textContent = '\u00D7';
        Object.assign(dismiss.style, {
            cursor: 'pointer',
            font: 'inherit',
            fontSize: '14px',
            lineHeight: '1',
            color: 'inherit',
            background: 'transparent',
            border: '0',
            opacity: '0.7',
            padding: '2px 4px',
            pointerEvents: 'auto',
        });
        dismiss.addEventListener('click', function () {
            writeDismissedFor(deployedId || null);
            clearToast();
        });
        wrap.appendChild(dismiss);

        return wrap;
    }

    function showToast(deployedId) {
        if (deployedId && deployedId === readDismissedFor()) return null;
        var el = buildToastEl(deployedId);
        var ts = toastStack();
        if (ts && typeof ts.setPinned === 'function') {
            ts.setPinned(TOAST_KEY, el);
        } else {
            // Fallback fixed placement if the shared toast stack isn't present.
            Object.assign(el.style, {
                position: 'fixed',
                left: '50%',
                bottom: '18px',
                transform: 'translateX(-50%)',
                zIndex: '100060',
            });
            doc.body.appendChild(el);
        }
        return el;
    }

    /**
     * Compare loaded vs deployed build id.
     * @returns {Promise<boolean>} true when the prompt is shown for a confident
     * mismatch; false when versions match, feature is disabled, or there is no
     * confident comparison (missing id / network hiccup).
     */
    function check() {
        if (killed() || isPanel()) { clearToast(); return Promise.resolve(false); }
        var loaded = loadedBuildId();
        if (!loaded) return Promise.resolve(false);
        if (_checkInFlight) return _checkInFlight;
        _checkInFlight = fetchDeployedId().then(function (deployed) {
            if (killed() || isPanel()) { clearToast(); return false; }
            if (!deployed) return false;                    // no false alarm on network hiccup
            if (deployed === loaded) {
                clearToast();
                writeDismissedFor(null);
                return false;
            }
            if (deployed === readDismissedFor()) return false;   // user already dismissed this id
            showToast(deployed);
            return true;
        }).catch(function () { return false; }).finally(function () {
            _checkInFlight = null;
        });
        return _checkInFlight;
    }

    var _pollTimer = null;
    var _started = false;

    function onVisibility() {
        if (doc.visibilityState === 'visible') check();
    }

    function start() {
        if (_started || killed() || isPanel()) return;
        _started = true;
        try { root.addEventListener('focus', check); } catch (_) { /* ignore */ }
        try { doc.addEventListener('visibilitychange', onVisibility); } catch (_) { /* ignore */ }
        try { _pollTimer = root.setInterval(check, POLL_MS); } catch (_) { /* ignore */ }
        // Deferred initial check so it never blocks or steals boot.
        try { root.setTimeout(check, 4000); } catch (_) { /* ignore */ }
    }

    function stop() {
        _started = false;
        try { root.removeEventListener('focus', check); } catch (_) { /* ignore */ }
        try { doc.removeEventListener('visibilitychange', onVisibility); } catch (_) { /* ignore */ }
        if (_pollTimer) {
            try { root.clearInterval(_pollTimer); } catch (_) { /* ignore */ }
            _pollTimer = null;
        }
    }

    root.__TalariaVersionReload = {
        check: check,
        start: start,
        stop: stop,
        clear: clearToast,
        fetchDeployedId: fetchDeployedId,
        parseBuildId: parseBuildId,
        readDismissedFor: readDismissedFor,
        writeDismissedFor: writeDismissedFor,
        _key: TOAST_KEY,
        _attr: TOAST_ATTR,
        _dismissStorageKey: DISMISS_STORAGE_KEY,
    };

    // Tear down any leftover toast from an older build, then only auto-start
    // when explicitly re-enabled (harness/tests).
    try { clearToast(); } catch (_) { /* ignore */ }
    if (!killed()) {
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
