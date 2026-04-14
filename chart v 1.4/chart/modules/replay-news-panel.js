/**
 * Replay / backtest forex news panel (TradingView-style): headlines for the current virtual period.
 * Depends on CustomEvent 'replayVirtualTimeChanged' from replay-system.js and /api/chart/replay-news.
 */
(function () {
    'use strict';

    var PANEL_ID = 'replayForexNewsPanel';
    var DEBOUNCE_MS = 450;
    var WINDOW_HALF_MS = 36 * 60 * 60 * 1000; // ±36h around virtual time (captures session + prior day)

    var state = {
        root: null,
        listEl: null,
        badgeEl: null,
        titleEl: null,
        timer: null,
        lastKey: '',
        collapsed: false
    };

    function normalizeSymbol(sym) {
        if (!sym) return '';
        return String(sym).replace(/[^a-zA-Z]/g, '').toUpperCase();
    }

    function ensureDom() {
        if (state.root && document.body.contains(state.root)) return;
        var root = document.createElement('div');
        root.id = PANEL_ID;
        root.setAttribute('aria-label', 'Forex news for replay period');
        root.innerHTML = [
            '<div class="replay-news-inner">',
            '  <div class="replay-news-head">',
            '    <button type="button" class="replay-news-toggle" title="Collapse">News</button>',
            '    <span class="replay-news-badge"></span>',
            '    <span class="replay-news-title">Replay period</span>',
            '  </div>',
            '  <div class="replay-news-body">',
            '    <ul class="replay-news-list"></ul>',
            '    <div class="replay-news-hint"></div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(root);
        state.root = root;
        state.listEl = root.querySelector('.replay-news-list');
        state.badgeEl = root.querySelector('.replay-news-badge');
        state.titleEl = root.querySelector('.replay-news-title');
        var hint = root.querySelector('.replay-news-hint');
        var btn = root.querySelector('.replay-news-toggle');
        btn.addEventListener('click', function () {
            state.collapsed = !state.collapsed;
            root.classList.toggle('replay-news-collapsed', state.collapsed);
            btn.textContent = state.collapsed ? 'News +' : 'News';
        });
        if (!document.getElementById('replay-news-panel-styles')) {
            var st = document.createElement('style');
            st.id = 'replay-news-panel-styles';
            st.textContent = [
                '#' + PANEL_ID + '{position:fixed;z-index:12050;right:12px;width:min(360px,calc(100vw - 24px));',
                'max-height:min(42vh,420px);bottom:calc(var(--replay-toolbar-height, 152px) + 12px);',
                'font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#e8e4dc;',
                'background:rgba(10,12,15,0.94);border:1px solid rgba(255,255,255,0.08);border-radius:10px;',
                'box-shadow:0 12px 40px rgba(0,0,0,0.45);display:none;flex-direction:column;overflow:hidden;}',
                '#' + PANEL_ID + '.replay-news-visible{display:flex!important;}',
                '#' + PANEL_ID + '.replay-news-collapsed .replay-news-body{display:none;}',
                '.replay-news-inner{display:flex;flex-direction:column;min-height:0;flex:1;}',
                '.replay-news-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);}',
                '.replay-news-toggle{background:#1a1d24;border:1px solid rgba(255,255,255,0.12);color:#c8f060;',
                'border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;}',
                '.replay-news-badge{font-size:10px;color:#a8a5b0;}',
                '.replay-news-title{font-size:10px;color:#b0acb8;flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
                '.replay-news-body{padding:8px 10px 10px;overflow:auto;min-height:0;flex:1;}',
                '.replay-news-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}',
                '.replay-news-list li{margin:0;padding:0;border-left:2px solid rgba(200,240,96,0.35);padding-left:8px;}',
                '.replay-news-list .rn-time{font-size:9px;color:#8a8694;margin-bottom:4px;font-variant-numeric:tabular-nums;}',
                '.replay-news-list .rn-head{font-size:11px;font-weight:600;color:#e8e4dc;line-height:1.35;}',
                '.replay-news-list .rn-src{font-size:9px;color:#7a7680;margin-top:4px;}',
                '.replay-news-list a.rn-link{color:#60a5fa;text-decoration:none;}',
                '.replay-news-list a.rn-link:hover{text-decoration:underline;}',
                '.replay-news-hint{font-size:9px;color:#8a8694;margin-top:8px;line-height:1.4;}',
                'body.light-mode #' + PANEL_ID + '{background:rgba(248,249,251,0.96);color:#111;border-color:rgba(0,0,0,0.08);}',
                'body.light-mode .replay-news-list .rn-head{color:#111;}'
            ].join('');
            document.head.appendChild(st);
        }
    }

    function formatUtc(tsSec) {
        try {
            var d = new Date(tsSec * 1000);
            return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
        } catch (e) {
            return '';
        }
    }

    function setVisible(show) {
        ensureDom();
        if (!state.root) return;
        state.root.classList.toggle('replay-news-visible', !!show);
    }

    function fetchNews(ts, symbol) {
        var token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            if (state.badgeEl) state.badgeEl.textContent = 'Sign in for news';
            if (state.listEl) state.listEl.innerHTML = '';
            return;
        }
        var start = ts - WINDOW_HALF_MS;
        var end = ts + WINDOW_HALF_MS;
        var url = '/api/chart/replay-news?start_ts=' + encodeURIComponent(String(start)) +
            '&end_ts=' + encodeURIComponent(String(end)) +
            '&symbol=' + encodeURIComponent(normalizeSymbol(symbol));
        fetch(url, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'include'
        }).then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
        }).then(function (_ref) {
            var ok = _ref.ok;
            var status = _ref.status;
            var data = _ref.j;
            if (status === 401 || status === 403) {
                throw new Error(
                    status === 403
                        ? 'Subscription required for replay news (journal access).'
                        : 'Sign in to load replay news.'
                );
            }
            if (!ok || !data || !data.success) {
                throw new Error((data && data.error) || 'News request failed');
            }
            render(data, ts);
        }).catch(function (err) {
            if (state.badgeEl) state.badgeEl.textContent = 'Error';
            if (state.listEl) state.listEl.innerHTML = '';
            var hint = state.root && state.root.querySelector('.replay-news-hint');
            if (hint) hint.textContent = String(err.message || err);
        });
    }

    function render(data, virtualTs) {
        var items = data.items || [];
        var src = data.source || '';
        if (state.badgeEl) {
            state.badgeEl.textContent = src === 'finnhub' ? 'Live (Finnhub)' :
                (src === 'demo' || src === 'demo_fallback') ? (src === 'demo_fallback' ? 'Demo (no headlines in range)' : 'Demo') : src;
        }
        if (state.titleEl) {
            state.titleEl.textContent = 'Virtual ' + formatUtc(Math.floor(virtualTs / 1000));
        }
        var hint = state.root && state.root.querySelector('.replay-news-hint');
        if (hint) hint.textContent = data.message || '';

        if (!state.listEl) return;
        state.listEl.innerHTML = '';
        if (!items.length) {
            state.listEl.innerHTML = '<li style="border:none;padding:4px;color:#a8a5b0;">No headlines in this window.</li>';
            return;
        }
        items.forEach(function (it) {
            var li = document.createElement('li');
            var t = document.createElement('div');
            t.className = 'rn-time';
            t.textContent = formatUtc(it.datetime) + (it.demo ? ' · demo' : '');
            var h = document.createElement('div');
            h.className = 'rn-head';
            if (it.url) {
                var a = document.createElement('a');
                a.className = 'rn-link';
                a.href = it.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = it.headline || '';
                h.appendChild(a);
            } else {
                h.textContent = it.headline || '';
            }
            var s = document.createElement('div');
            s.className = 'rn-src';
            s.textContent = (it.source || '') + (it.related ? ' · ' + it.related : '');
            li.appendChild(t);
            li.appendChild(h);
            li.appendChild(s);
            state.listEl.appendChild(li);
        });
    }

    function onVirtualTime(detail) {
        var ts = detail && detail.timestamp;
        if (!Number.isFinite(ts)) return;
        var sym = detail.symbol || '';
        var key = ts + '|' + normalizeSymbol(sym);
        if (key === state.lastKey) return;
        state.lastKey = key;

        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(function () {
            fetchNews(ts, sym);
        }, DEBOUNCE_MS);
    }

    window.addEventListener('replayVirtualTimeChanged', function (ev) {
        var chart = window.chart;
        var replay = chart && chart.replaySystem;
        if (!replay || !replay.isActive) {
            setVisible(false);
            return;
        }
        ensureDom();
        setVisible(true);
        onVirtualTime(ev.detail || {});
    });

    // Hide when leaving replay
    setInterval(function () {
        var chart = window.chart;
        var replay = chart && chart.replaySystem;
        if (!replay || !replay.isActive) {
            setVisible(false);
        }
    }, 800);
})();
