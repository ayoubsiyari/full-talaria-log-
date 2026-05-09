/**
 * topbar-button.js — adds a "Layouts ▼" dropdown to the live chart topbar.
 *
 * Loaded by dist-v9/index.html unconditionally (not gated on ?multichart=1).
 * Hides itself when:
 *   • Running inside an iframe (so it doesn't appear inside multichart panels)
 *   • The URL has ?multichart=1 (same condition; defensive)
 *   • The URL is already on /chart/multi (the shell has its own picker)
 *
 * UX: a small fixed-position dropdown anchored to the top-center of the page.
 * Clicking opens a list of layouts; picking one navigates to
 * /chart/multi?layout=<id>. Picking "1" returns to single-chart at /chart/.
 *
 * Why vanilla JS not React:
 *   The V9 React app's existing layout picker (right panel) calls
 *   window.panelManager.applyLayout(...), which has been deleted from
 *   production (see dist-v9/index.html — PANEL MANAGER BOOTSTRAP REMOVED
 *   comment). Wiring the React picker to the new shell would require
 *   editing TalariaV8bLive.jsx and rebuilding via `npm run build:live`.
 *   This vanilla-JS button is the zero-rebuild integration point: it ships
 *   the moment you redeploy the static asset. Phase 7.5 will repoint the
 *   React picker once the multichart UX is verified at scale.
 */

(function () {
    'use strict';

    // Don't render inside iframes (we'd duplicate ourselves inside every panel).
    try { if (window.self !== window.top) return; } catch (_) { return; }

    var loc = window.location;
    var search = loc.search || '';
    if (search.indexOf('multichart=1') !== -1) return;
    if (loc.pathname && loc.pathname.indexOf('/chart/multi') === 0) return;

    // Layouts the production shell currently supports. Bump this list when
    // shell.html grows new layouts.
    var LAYOUTS = [
        { id: '1',   label: 'Single chart',     icon: '◻' },
        { id: '2v',  label: '2 panels — split horizontal', icon: '⬌' },
        { id: '2h',  label: '2 panels — split vertical',   icon: '⬍' },
        { id: '3l',  label: '3 panels — left dominant',    icon: '◧' },
        { id: '3r',  label: '3 panels — right dominant',   icon: '◨' },
        { id: '2x2', label: '4 panels — grid',             icon: '⊞' },
    ];

    function inject() {
        // The React app may not have rendered yet; we attach to <body> with
        // position:fixed so we don't depend on any React-owned container.
        if (document.getElementById('mc-topbar-btn-host')) return;

        var host = document.createElement('div');
        host.id = 'mc-topbar-btn-host';
        host.style.cssText =
            'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
            'z-index:9999;font-family:DM Sans,system-ui,-apple-system,sans-serif;' +
            'font-size:12px;color:#d1d4dc;pointer-events:auto;';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'mc-topbar-btn';
        btn.textContent = 'Layouts ▾';
        btn.title = 'Open multichart — split the chart into 2, 3, or 4 panels. Each panel is a full Talaria chart with its own tools, indicators, drawings, and orders.';
        btn.style.cssText =
            'background:rgba(13,15,23,0.92);color:#d1d4dc;' +
            'border:1px solid #2a2e39;border-radius:4px;' +
            'padding:5px 12px;cursor:pointer;' +
            'font:inherit;font-weight:600;letter-spacing:0.3px;' +
            'box-shadow:0 2px 6px rgba(0,0,0,0.4);' +
            'backdrop-filter:blur(4px);' +
            'transition:background 0.12s,border-color 0.12s;';
        btn.addEventListener('mouseenter', function () {
            btn.style.background = 'rgba(26,58,110,0.95)';
            btn.style.borderColor = '#3a6db5';
        });
        btn.addEventListener('mouseleave', function () {
            btn.style.background = 'rgba(13,15,23,0.92)';
            btn.style.borderColor = '#2a2e39';
        });
        host.appendChild(btn);

        var menu = document.createElement('div');
        menu.id = 'mc-topbar-menu';
        menu.style.cssText =
            'display:none;position:absolute;top:100%;left:50%;' +
            'transform:translateX(-50%);margin-top:4px;' +
            'background:#0d0f17;border:1px solid #2a2e39;border-radius:4px;' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.6);' +
            'min-width:240px;padding:4px 0;';
        host.appendChild(menu);

        var menuOpen = false;
        function setMenuOpen(open) {
            menuOpen = open;
            menu.style.display = open ? 'block' : 'none';
        }

        for (var i = 0; i < LAYOUTS.length; i++) {
            (function (lay) {
                var item = document.createElement('div');
                item.style.cssText =
                    'padding:7px 14px;cursor:pointer;display:flex;' +
                    'align-items:center;gap:10px;' +
                    'transition:background 0.1s;color:#d1d4dc;' +
                    'font:inherit;font-size:12px;';
                var icon = document.createElement('span');
                icon.textContent = lay.icon;
                icon.style.cssText = 'color:#7aa2ff;font-size:16px;width:20px;text-align:center;';
                var label = document.createElement('span');
                label.textContent = lay.label;
                label.style.cssText = 'flex:1;';
                var idBadge = document.createElement('span');
                idBadge.textContent = lay.id;
                idBadge.style.cssText =
                    'color:#5c6370;font-family:JetBrains Mono,ui-monospace,monospace;' +
                    'font-size:10px;background:#1c1f2a;padding:1px 5px;border-radius:2px;';
                item.appendChild(icon);
                item.appendChild(label);
                item.appendChild(idBadge);
                item.addEventListener('mouseenter', function () { item.style.background = '#1a3a6e'; });
                item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
                item.addEventListener('click', function () {
                    setMenuOpen(false);
                    if (lay.id === '1') {
                        // Already on single chart — no navigation.
                        return;
                    }
                    try {
                        // Capture the user's current viewing context so each multichart panel
                        // boots with the same data they were just looking at — fixes the v1
                        // "open backtest with data, click 2 panels, data is gone" regression.
                        // Reads from window.chart (chart.js engine instance, see chart.js
                        // currentFileId / currentTimeframe assignments) and from /chart/ URL
                        // params for mode (backtest/propfirm/live) so the iframes boot in
                        // the matching mode (affects which API timeframe is requested).
                        var ctx = {};
                        try {
                            var c = window.chart;
                            if (c) {
                                if (c.currentFileId != null) ctx.fileId = String(c.currentFileId);
                                if (c.currentTimeframe) ctx.tf = String(c.currentTimeframe);
                            }
                        } catch (_) {}
                        try {
                            var p = new URLSearchParams(window.location.search);
                            var mode = p.get('mode');
                            if (mode === 'backtest' || mode === 'propfirm' || mode === 'live') {
                                ctx.mode = mode;
                            }
                        } catch (_) {}

                        var url = '/chart/multi?layout=' + encodeURIComponent(lay.id);
                        if (ctx.fileId) url += '&fileId=' + encodeURIComponent(ctx.fileId);
                        if (ctx.tf)     url += '&tf='     + encodeURIComponent(ctx.tf);
                        if (ctx.mode)   url += '&mode='   + encodeURIComponent(ctx.mode);
                        window.location.href = url;
                    } catch (e) {
                        console.error('[multichart-topbar] navigate failed:', e);
                    }
                });
                menu.appendChild(item);
            })(LAYOUTS[i]);
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
        });
        document.addEventListener('click', function () { setMenuOpen(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menuOpen) setMenuOpen(false);
        });

        document.body.appendChild(host);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject, { once: true });
    } else {
        inject();
    }
})();
