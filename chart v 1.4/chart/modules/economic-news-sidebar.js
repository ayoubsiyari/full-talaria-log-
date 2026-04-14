/**
 * Economic calendar (News sidebar) — Finnhub data via chart API (token on server: FINNHUB_API_KEY).
 */
(function () {
    'use strict';

    var state = {
        events: [],
        tab: 'upcoming',
        query: '',
        loaded: false,
        loading: false,
        error: null,
        countdownTimer: null
    };

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseTime(raw) {
        if (raw == null) return null;
        if (typeof raw === 'number') {
            return raw < 1e12 ? raw * 1000 : raw;
        }
        var str = String(raw).trim();
        var d = Date.parse(str);
        if (!Number.isNaN(d)) return d;
        if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(str) && /\d{4}-\d{2}-\d{2}/.test(str)) {
            d = Date.parse(str.replace(' ', 'T') + 'Z');
            if (!Number.isNaN(d)) return d;
        }
        return null;
    }

    function countryCode(raw) {
        var c = String(raw || '').trim().toUpperCase();
        if (c === 'USA' || c === 'UNITED STATES') return 'US';
        if (c === 'UK' || c === 'UNITED KINGDOM') return 'GB';
        if (c.length === 2) return c;
        if (c.length > 2) return c.slice(0, 2);
        return '';
    }

    function flagEmoji(code) {
        var c = countryCode(code);
        if (!c || c.length !== 2) return '🌐';
        if (c === 'EU') return '🇪🇺';
        var A = 0x1f1e6;
        var a = c.charCodeAt(0) - 65;
        var b = c.charCodeAt(1) - 65;
        if (a < 0 || a > 25 || b < 0 || b > 25) return '🌐';
        return String.fromCodePoint(A + a, A + b);
    }

    function impactClass(raw) {
        var im = raw;
        if (typeof im === 'number') {
            if (im >= 3) return 'high';
            if (im === 2) return 'medium';
            return 'low';
        }
        var s = String(im || '').toLowerCase();
        if (s.indexOf('high') !== -1 || s === '3') return 'high';
        if (s.indexOf('medium') !== -1 || s === '2') return 'medium';
        if (s.indexOf('low') !== -1 || s === '1') return 'low';
        return 'medium';
    }

    function fmtVal(v, unit) {
        if (v === null || v === undefined || v === '') return '-';
        if (typeof v === 'number' && !Number.isFinite(v)) return '-';
        var u = unit ? String(unit) : '';
        if (typeof v === 'number') {
            if (u === '%' || u === 'percent') return v + '%';
            return String(v);
        }
        return String(v);
    }

    function prevValueClass(str) {
        var n = parseFloat(String(str).replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(n)) return '';
        if (n > 0) return 'positive';
        if (n < 0) return 'negative';
        return '';
    }

    function normalizeRaw(raw) {
        var t = parseTime(raw.time || raw.date || raw.datetime);
        if (t == null) return null;
        var ev = raw.event || raw.name || raw.title || 'Economic event';
        var country = raw.country || raw.currency || '';
        var unit = raw.unit || raw.unitType || '';
        var est = raw.estimate != null ? raw.estimate : raw.forecast;
        var prev = raw.prev != null ? raw.prev : raw.previous;
        return {
            t: t,
            event: ev,
            country: country,
            impact: impactClass(raw.impact),
            actual: fmtVal(raw.actual, unit),
            forecast: fmtVal(est, unit),
            previous: fmtVal(prev, unit),
            prevRaw: prev,
            unit: unit
        };
    }

    function timeParts(ms) {
        var d = new Date(ms);
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        var y = d.getFullYear();
        var mo = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return { clock: hh + ':' + mm, dateStr: y + '.' + mo + '.' + day };
    }

    function formatCountdown(msUntil) {
        if (msUntil <= 0) return '—';
        var sec = Math.floor(msUntil / 1000);
        var s = sec % 60;
        var m = Math.floor(sec / 60) % 60;
        var h = Math.floor(sec / 3600) % 24;
        var d = Math.floor(sec / 86400);
        var parts = [];
        if (d > 0) parts.push(d + 'd');
        if (h > 0 || d > 0) parts.push(h + 'h');
        parts.push(m + 'm');
        parts.push(s + 's');
        return '- ' + parts.join(' ');
    }

    function filterEvents() {
        var q = state.query.trim().toLowerCase();
        var now = Date.now();
        var list = state.events.filter(function (e) {
            var upcoming = e.t >= now;
            if (state.tab === 'upcoming' && !upcoming) return false;
            if (state.tab === 'previous' && upcoming) return false;
            if (!q) return true;
            var hay = (e.event + ' ' + e.country).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
        return list;
    }

    function renderItem(e) {
        var now = Date.now();
        var tp = timeParts(e.t);
        var upcoming = e.t >= now;
        var cd = upcoming ? formatCountdown(e.t - now) : '—';
        var flag = flagEmoji(e.country);
        var prevCls = prevValueClass(e.previous);

        var impactBars = '';
        var ic = e.impact;
        if (ic === 'high') {
            impactBars = '<div class="news-impact high"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        } else if (ic === 'medium') {
            impactBars = '<div class="news-impact medium"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        } else {
            impactBars = '<div class="news-impact low"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        }

        var actualShow = upcoming ? '-' : e.actual;

        return (
            '<div class="news-item" data-event-ms="' + e.t + '">' +
            '<div class="news-item-header">' +
            '<span class="news-time">' + escapeHtml(tp.clock) + '</span>' +
            '<span class="news-countdown">' + escapeHtml(cd) + '</span>' +
            '</div>' +
            '<div class="news-item-title">' +
            '<span class="news-flag">' + flag + '</span>' +
            impactBars +
            '<span class="news-event-name">' + escapeHtml(e.event) + '</span>' +
            '</div>' +
            '<div class="news-event-date">' + escapeHtml(tp.dateStr) + '</div>' +
            '<div class="news-values">' +
            '<span class="news-value"><span class="news-value-label">Actual:</span> <span class="news-value-data">' + escapeHtml(String(actualShow)) + '</span></span>' +
            '<span class="news-value"><span class="news-value-label">Forecast:</span> <span class="news-value-data">' + escapeHtml(e.forecast) + '</span></span>' +
            '<span class="news-value"><span class="news-value-label">Previous:</span> <span class="news-value-data' + (prevCls ? ' ' + prevCls : '') + '">' + escapeHtml(e.previous) + '</span></span>' +
            '</div></div>'
        );
    }

    function allNewsItemRoots() {
        return document.querySelectorAll('[id="newsItems"]');
    }

    function setNewsItemsHtml(html) {
        var roots = allNewsItemRoots();
        for (var i = 0; i < roots.length; i++) {
            roots[i].innerHTML = html;
        }
    }

    function render() {
        if (!allNewsItemRoots().length) return;

        if (state.loading) {
            setNewsItemsHtml('<div class="news-loading" style="padding:24px;text-align:center;color:#6a6a7a;">Loading economic calendar…</div>');
            return;
        }
        if (state.error) {
            setNewsItemsHtml('<div style="padding:20px;color:#ef4444;font-size:13px;">' + escapeHtml(state.error) + '</div>');
            return;
        }
        var list = filterEvents();
        if (!list.length) {
            setNewsItemsHtml('<div style="padding:24px;text-align:center;color:#6a6a7a;">No events in this view.</div>');
            return;
        }
        setNewsItemsHtml(list.map(renderItem).join(''));
    }

    function tickCountdowns() {
        var now = Date.now();
        var nodes = document.querySelectorAll('[id="newsItems"] .news-item[data-event-ms]');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var ms = parseInt(node.getAttribute('data-event-ms'), 10);
            if (!Number.isFinite(ms)) continue;
            var cd = node.querySelector('.news-countdown');
            if (!cd) continue;
            if (ms >= now) {
                cd.textContent = formatCountdown(ms - now);
            } else {
                cd.textContent = '—';
            }
        }
    }

    function startCountdownLoop() {
        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.countdownTimer = setInterval(tickCountdowns, 1000);
    }

    function stopCountdownLoop() {
        if (state.countdownTimer) {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
        }
    }

    function detailFromJson(j, status) {
        if (!j || typeof j !== 'object') return 'HTTP ' + status;
        var d = j.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d) && d.length && d[0].msg) {
            return d.map(function (x) { return x.msg; }).join(' ');
        }
        if (j.error) return String(j.error);
        return 'HTTP ' + status;
    }

    async function loadCalendar() {
        state.loading = true;
        state.error = null;
        render();

        try {
            var from = new Date();
            from.setDate(from.getDate() - 7);
            var to = new Date();
            to.setDate(to.getDate() + 21);
            var fromStr = from.toISOString().slice(0, 10);
            var toStr = to.toISOString().slice(0, 10);
            var url = '/api/finnhub/calendar/economic?from=' + encodeURIComponent(fromStr) + '&to=' + encodeURIComponent(toStr);
            var r = await fetch(url, { method: 'GET', credentials: 'include' });
            var j = await r.json().catch(function () { return {}; });
            if (!r.ok) {
                throw new Error(detailFromJson(j, r.status));
            }
            if (j.error) throw new Error(j.error);
            var rawList = j.economicCalendar || j.data || [];
            if (!Array.isArray(rawList)) rawList = [];
            var out = [];
            for (var i = 0; i < rawList.length; i++) {
                var n = normalizeRaw(rawList[i]);
                if (n) out.push(n);
            }
            out.sort(function (a, b) { return a.t - b.t; });
            state.events = out;
            state.loaded = true;
        } catch (err) {
            state.error = (err && err.message) ? String(err.message) : 'Failed to load calendar';
            state.events = [];
        } finally {
            state.loading = false;
            render();
            startCountdownLoop();
        }
    }

    var tabsWired = false;
    var searchDebounce = null;
    var boundSearchInputs = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function syncTabClasses() {
        document.querySelectorAll('.news-tab[data-tab]').forEach(function (el) {
            el.classList.toggle('active', el.getAttribute('data-tab') === state.tab);
        });
    }

    function wireTabs() {
        if (tabsWired) return;
        tabsWired = true;
        var active = document.querySelector('.news-tab.active');
        if (active && active.getAttribute('data-tab')) {
            state.tab = active.getAttribute('data-tab');
        }
        document.addEventListener('click', function (e) {
            var tab = e.target && e.target.closest ? e.target.closest('.news-tab') : null;
            if (!tab || !tab.getAttribute('data-tab')) return;
            if (!tab.closest('#newsContent')) return;
            var t = tab.getAttribute('data-tab');
            state.tab = t;
            syncTabClasses();
            render();
        });
    }

    function onSearchInput(e) {
        var input = e.target;
        state.query = input.value || '';
        document.querySelectorAll('[id="newsSearchInput"]').forEach(function (inp) {
            if (inp !== input) inp.value = state.query;
        });
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function () {
            render();
        }, 200);
    }

    function bindNewsSearchInputs() {
        document.querySelectorAll('[id="newsSearchInput"]').forEach(function (input) {
            if (boundSearchInputs) {
                if (boundSearchInputs.has(input)) return;
                boundSearchInputs.add(input);
            } else if (input.getAttribute('data-news-search-bound')) {
                return;
            } else {
                input.setAttribute('data-news-search-bound', '1');
            }
            input.value = state.query;
            input.addEventListener('input', onSearchInput);
        });
    }

    window.loadEconomicNewsSidebar = function () {
        wireTabs();
        syncTabClasses();
        bindNewsSearchInputs();
        if (!state.loaded) {
            loadCalendar();
        } else {
            render();
            startCountdownLoop();
        }
    };

    window.refreshEconomicNewsSidebar = function () {
        state.loaded = false;
        loadCalendar();
    };

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopCountdownLoop();
        else if (state.loaded) startCountdownLoop();
    });
})();
