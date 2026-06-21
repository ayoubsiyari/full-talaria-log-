/**
 * Replay / backtest forex news (TradingView-style): headlines for the current virtual period.
 * Recent headlines: /api/finnhub/news (FINNHUB_API_KEY).
 * Historical (backtest dates): /api/news/historical via Marketaux (MARKETAUX_API_TOKEN).
 */
(function () {
    'use strict';

    var PANEL_ID = 'replayForexNewsPanel';
    var DEBOUNCE_MS = 450;
    var WINDOW_HALF_MS = 36 * 60 * 60 * 1000;
    var MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
    /** Prefer Marketaux when the replay window ends more than this far in the past. */
    var HISTORICAL_CUTOFF_MS = 3 * 24 * 60 * 60 * 1000;

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

    function symbolKeywords(symbol) {
        var s = normalizeSymbol(symbol);
        if (s.length >= 6 && /^[A-Z]+$/.test(s)) {
            return [s.slice(0, 3), s.slice(3, 6)];
        }
        return [];
    }

    function itemMatchesSymbol(item, symbol) {
        var keys = symbolKeywords(symbol);
        if (!keys.length) return true;
        var rel = String(item.related || '').toUpperCase();
        var head = String(item.headline || '').toUpperCase();
        var blob = rel + ' ' + head;
        for (var i = 0; i < keys.length; i++) {
            if (blob.indexOf(keys[i]) !== -1) return true;
        }
        return false;
    }

    function normalizeItem(raw, demo) {
        var ts = raw.datetime;
        var tsInt = parseInt(ts, 10);
        if (!Number.isFinite(tsInt)) tsInt = 0;
        var iso = '';
        if (tsInt > 0) {
            try {
                iso = new Date(tsInt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
            } catch (e) { /* ignore */ }
        }
        return {
            id: raw.id,
            datetime: tsInt,
            datetime_iso: iso,
            headline: String(raw.headline || '').slice(0, 500),
            summary: String(raw.summary || '').slice(0, 2000),
            source: String(raw.source || ''),
            url: String(raw.url || ''),
            related: String(raw.related || ''),
            demo: !!demo
        };
    }

    function fetchFinnhubForexWindow(startSec, endSec, symbol, skipSymbolFilter) {
        var sym = skipSymbolFilter ? '' : symbol;
        return new Promise(function (resolve, reject) {
            var out = [];
            var minId = null;
            var seen = {};
            var page = 0;

            function step() {
                if (page >= 12) {
                    out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                    resolve(out.slice(0, 100));
                    return;
                }
                page++;
                var url = '/api/finnhub/news?category=forex';
                if (minId != null) url += '&minId=' + encodeURIComponent(String(minId));
                fetch(url, { method: 'GET', mode: 'cors', credentials: 'include' })
                    .then(function (r) {
                        return r.json().then(function (data) {
                            if (!r.ok) {
                                var d = data && data.detail;
                                throw new Error(typeof d === 'string' ? d : ((data && data.error) || ('HTTP ' + r.status)));
                            }
                            return data;
                        });
                    })
                    .then(function (data) {
                        if (!Array.isArray(data) || data.length === 0) {
                            out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                            resolve(out.slice(0, 100));
                            return;
                        }
                        var ids = [];
                        for (var i = 0; i < data.length; i++) {
                            var it = data[i];
                            if (!it || typeof it !== 'object') continue;
                            var iid = it.id;
                            var sk = String(iid);
                            if (seen[sk]) continue;
                            seen[sk] = true;
                            ids.push(iid);
                            var tsInt = parseInt(it.datetime, 10);
                            if (!Number.isFinite(tsInt)) continue;
                            if (tsInt >= startSec && tsInt <= endSec) {
                                var norm = normalizeItem(it, false);
                                if (itemMatchesSymbol(norm, sym)) out.push(norm);
                            }
                        }
                        if (!ids.length) {
                            out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                            resolve(out.slice(0, 100));
                            return;
                        }
                        var numericIds = ids.map(function (x) { return parseInt(x, 10) || 0; });
                        var nextMin = Math.max.apply(null, numericIds);
                        if (minId != null && nextMin <= minId) {
                            out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                            resolve(out.slice(0, 100));
                            return;
                        }
                        minId = nextMin;
                        var times = data.map(function (x) {
                            return parseInt(x.datetime, 10);
                        }).filter(function (x) { return Number.isFinite(x); });
                        if (times.length) {
                            var mx = Math.max.apply(null, times);
                            if (mx < startSec) {
                                out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                                resolve(out.slice(0, 100));
                                return;
                            }
                        }
                        step();
                    })
                    .catch(reject);
            }
            step();
        });
    }

    function fetchHistoricalNewsWindow(startSec, endSec, symbol) {
        var url = '/api/news/historical?from=' + encodeURIComponent(String(startSec))
            + '&to=' + encodeURIComponent(String(endSec))
            + '&limit=50';
        var sym = normalizeSymbol(symbol);
        if (sym) url += '&symbol=' + encodeURIComponent(sym);
        return fetch(url, { method: 'GET', mode: 'cors', credentials: 'include' })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) {
                        var d = data && data.detail;
                        throw new Error(typeof d === 'string' ? d : ((data && data.error) || ('HTTP ' + r.status)));
                    }
                    return data;
                });
            })
            .then(function (data) {
                var raw = (data && data.items) || [];
                var out = [];
                for (var i = 0; i < raw.length; i++) {
                    var norm = normalizeItem(raw[i], false);
                    if (itemMatchesSymbol(norm, symbol)) out.push(norm);
                }
                if (!out.length && raw.length && sym) {
                    for (var j = 0; j < raw.length; j++) out.push(normalizeItem(raw[j], false));
                }
                out.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
                return out.slice(0, 100);
            });
    }

    function buildDemoNews(startMs, endMs, symbol) {
        var pair = normalizeSymbol(symbol) || 'EURUSD';
        if (pair.length < 6) pair = (pair + 'USDXXX').slice(0, 6);
        var startSec = Math.floor(startMs / 1000);
        var endSec = Math.floor(endMs / 1000);
        var mid = new Date(((startSec + endSec) / 2) * 1000);
        var dayKey = mid.toISOString().slice(0, 10);
        var seed = dayKey + ':' + pair;
        var h = 0;
        for (var c = 0; c < seed.length; c++) h = ((h << 5) - h) + seed.charCodeAt(c) | 0;
        var templates = [
            'FX focus: {p} positioning into the London fix',
            'Rate expectations drive {p} as data flow crosses the tape',
            'Liquidity pockets and session flows around {p}',
            'Cross-asset moves spill into {p} spot',
            'Central bank rhetoric keeps {p} two-way'
        ];
        var p = pair.slice(0, 3) + '/' + pair.slice(3, 6);
        var items = [];
        var base = startSec + Math.max(0, Math.floor((endSec - startSec) / 6));
        for (var i = 0; i < templates.length; i++) {
            var jitter = ((h >> (i * 4)) & 0x7fff) % 3600;
            var ts = Math.min(Math.max(base + jitter - 1800, startSec), endSec);
            items.push(normalizeItem({
                id: 'demo-' + dayKey + '-' + i,
                datetime: ts,
                headline: templates[i].replace(/\{p\}/g, p),
                summary: 'Demo headline — set FINNHUB_API_KEY and/or MARKETAUX_API_TOKEN on the chart API server.',
                source: 'Talaria (demo)',
                url: '',
                related: pair.slice(0, 3) + ',' + pair.slice(3, 6)
            }, true));
        }
        items.sort(function (a, b) { return (b.datetime || 0) - (a.datetime || 0); });
        return items;
    }

    function buildPayload(startMs, endMs, symbol) {
        var msgParts = [];
        if (endMs <= startMs) {
            return { success: false, items: [], source: 'none', message: 'invalid window' };
        }
        var span = endMs - startMs;
        if (span > MAX_WINDOW_MS) {
            endMs = startMs + MAX_WINDOW_MS;
            msgParts.push('Window limited to 31 days per request.');
        }
        var startSec = Math.floor(startMs / 1000);
        var endSec = Math.floor(endMs / 1000);

        var source = 'none';
        var items = [];
        var preferHistorical = endMs < (Date.now() - HISTORICAL_CUTOFF_MS);

        function finishWithDemo() {
            if (!items || !items.length) {
                items = buildDemoNews(startMs, endMs, symbol);
                if (source === 'none') {
                    source = 'demo';
                    msgParts.push(
                        'Set FINNHUB_API_KEY and/or MARKETAUX_API_TOKEN on the chart API server (or sign in if the API returns 401).'
                    );
                } else {
                    source = 'demo_fallback';
                }
            }
            return {
                success: true,
                items: items,
                source: source,
                message: msgParts.length ? msgParts.join(' ') : null
            };
        }

        if (preferHistorical) {
            return fetchHistoricalNewsWindow(startSec, endSec, symbol)
                .then(function (hist) {
                    items = hist || [];
                    if (items.length) {
                        source = 'marketaux';
                        return finishWithDemo();
                    }
                    msgParts.push('No Marketaux headlines in this time range. Trying Finnhub…');
                    return fetchFinnhubForexWindow(startSec, endSec, symbol, false);
                })
                .then(function (finnhubOrPayload) {
                    if (finnhubOrPayload && finnhubOrPayload.success) return finnhubOrPayload;
                    if (Array.isArray(finnhubOrPayload) && finnhubOrPayload.length) {
                        items = finnhubOrPayload;
                        source = 'finnhub';
                        return finishWithDemo();
                    }
                    if (!items.length && normalizeSymbol(symbol)) {
                        return fetchFinnhubForexWindow(startSec, endSec, '', true);
                    }
                    return null;
                })
                .then(function (second) {
                    if (second && second.success) return second;
                    if (Array.isArray(second) && second.length && !items.length) {
                        items = second;
                        source = 'finnhub';
                    }
                    if (!items.length) {
                        msgParts.push(
                            'No headlines in this time range. Showing demo lines.'
                        );
                    }
                    return finishWithDemo();
                });
        }

        return fetchFinnhubForexWindow(startSec, endSec, symbol, false)
            .then(function (first) {
                items = first || [];
                if (!items.length && normalizeSymbol(symbol)) {
                    return fetchFinnhubForexWindow(startSec, endSec, '', true);
                }
                return null;
            })
            .then(function (second) {
                if (second && second.length) items = second;
                if (items && items.length) {
                    source = 'finnhub';
                    return finishWithDemo();
                }
                msgParts.push('No Finnhub forex headlines in this window. Trying Marketaux…');
                return fetchHistoricalNewsWindow(startSec, endSec, symbol);
            })
            .then(function (histOrPayload) {
                if (histOrPayload && histOrPayload.success) return histOrPayload;
                if (Array.isArray(histOrPayload) && histOrPayload.length) {
                    items = histOrPayload;
                    source = 'marketaux';
                }
                if (!items.length) {
                    msgParts.push(
                        'No headlines in this time range (Finnhub is often recent-only). Showing demo lines.'
                    );
                }
                return finishWithDemo();
            });
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
                'border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:default;}',
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

    function render(data, virtualTs) {
        var items = data.items || [];
        var src = data.source || '';
        if (state.badgeEl) {
            state.badgeEl.textContent = src === 'finnhub' ? 'Live (Finnhub)' :
                src === 'marketaux' ? 'Historical (Marketaux)' :
                (src === 'demo' || src === 'demo_fallback') ?
                    (src === 'demo_fallback' ? 'Demo (no headlines in range)' : 'Demo') : src;
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

    function fetchNews(ts, symbol) {
        var start = ts - WINDOW_HALF_MS;
        var end = ts + WINDOW_HALF_MS;
        if (state.badgeEl) state.badgeEl.textContent = 'Loading…';

        buildPayload(start, end, symbol)
            .then(function (data) {
                if (!data.success) throw new Error(data.message || 'Failed');
                render(data, ts);
            })
            .catch(function (err) {
                if (state.badgeEl) state.badgeEl.textContent = 'Error';
                if (state.listEl) state.listEl.innerHTML = '';
                var hint = state.root && state.root.querySelector('.replay-news-hint');
                var msg = String(err && err.message ? err.message : err);
                if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
                    msg += ' — Is the chart API running at the same origin? Set FINNHUB_API_KEY / MARKETAUX_API_TOKEN on the server.';
                }
                if (hint) hint.textContent = msg;
                var demo = {
                    success: true,
                    items: buildDemoNews(start, end, symbol),
                    source: 'demo',
                    message: msg + ' Showing demo headlines.'
                };
                render(demo, ts);
                if (state.badgeEl) state.badgeEl.textContent = 'Demo (error)';
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

    setInterval(function () {
        var chart = window.chart;
        var replay = chart && chart.replaySystem;
        if (!replay || !replay.isActive) {
            setVisible(false);
        }
    }, 800);
})();
