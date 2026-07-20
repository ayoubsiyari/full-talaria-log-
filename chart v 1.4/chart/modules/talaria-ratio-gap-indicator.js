/**
 * Talaria — Ratio + Gap (ported from Talaria_Ratio_Gap.pine)
 * NY-session ratios, PDR/GAP/OR/IB levels, and info-box cells.
 */
(function (global) {
    'use strict';

    function parseHm(str) {
        if (!str) return 0;
        var parts = String(str).split(':');
        return parseInt(parts[0], 10) + (parseInt(parts[1] || '0', 10) / 60);
    }

    // Reuse Intl formatters — creating one per bar freezes the UI on large datasets.
    var _timeFmtCache = Object.create(null);
    var _dateFmtCache = Object.create(null);
    function _timeFmt(tz) {
        var key = tz || 'America/New_York';
        if (!_timeFmtCache[key]) {
            _timeFmtCache[key] = new Intl.DateTimeFormat('en-GB', {
                timeZone: key, hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
        return _timeFmtCache[key];
    }
    function _dateFmt(tz) {
        var key = tz || 'America/New_York';
        if (!_dateFmtCache[key]) {
            _dateFmtCache[key] = new Intl.DateTimeFormat('en-CA', {
                timeZone: key, year: 'numeric', month: '2-digit', day: '2-digit'
            });
        }
        return _dateFmtCache[key];
    }

    function wallDecimal(ms, tz) {
        try {
            var parts = _timeFmt(tz).formatToParts(new Date(ms));
            var h = 0; var m = 0;
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10);
                else if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
            }
            return h + m / 60;
        } catch (_) {
            var d = new Date(ms);
            return d.getUTCHours() + d.getUTCMinutes() / 60;
        }
    }

    function sessDateKey(ms, tz) {
        try {
            return _dateFmt(tz).format(new Date(ms)).replace(/-/g, '');
        } catch (_) {
            return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
        }
    }

    function inWindow(dec, start, end) {
        if (start <= end) return dec >= start && dec < end;
        return dec >= start || dec < end;
    }

    function fadeColor(hexOrRgb, opacityPct) {
        var op = Math.max(0, Math.min(100, Number(opacityPct) || 100)) / 100;
        var s = String(hexOrRgb || '#ffffff').trim();
        if (s.indexOf('rgba') === 0) return s;
        if (s.indexOf('rgb(') === 0) {
            var m = s.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + op + ')';
        }
        var hex = s.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
        if (hex.length === 6) {
            var r = parseInt(hex.slice(0, 2), 16);
            var g = parseInt(hex.slice(2, 4), 16);
            var b = parseInt(hex.slice(4, 6), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',' + op + ')';
        }
        return 'rgba(255,255,255,' + op + ')';
    }

    function defaultParams() {
        return {
            sessStr: '09:30-16:00',
            tzStr: 'America/New_York',
            avgLen: 14,
            tblPos: 'bottom_right',
            tblLayout: 'headers — horizontal',
            txtSize: 'large',
            cTxt: '#ffffff',
            cellOpacity: 90,
            colorOn: true,
            cNarrow: '#26a69a',
            cWide: '#ef5350',
            cNeut: '#787b86',
            cIn: '#2962ff',
            cOut: '#ff9800',
            showPDR: true, pdrLines: true, pdrCell: true, pdrIOCell: true,
            showPDRTg: false, showDead: true, deadPct: 10,
            rngNarrow: 0.6, rngWide: 1.3,
            cPDHi: '#008080', sPDHi: 'solid', cPDLi: '#008080', sPDLi: 'solid',
            cMidi: '#787b86', sMidi: 'dotted',
            cPTgi: '#ff00ff', sPTgi: 'dotted', cDeadi: 'rgba(128,128,128,0.12)',
            wPrev: 1,
            showGapSect: true, gapLines: true, gapCell: true, showOpen: true,
            gapSmall: 0.25, gapLarge: 0.75,
            cPCi: '#ff9800', sPCi: 'dashed', cG50i: '#ff9800', sG50i: 'dotted',
            cOPi: '#00ffff', sOPi: 'solid', wGap: 1,
            showOR: true, orLines: true, orCell: true, showORTg: false,
            orNarrow: 0.20, orWide: 0.55,
            cORi: '#2962ff', sORi: 'solid', cOTgi: '#9c27b0', sOTgi: 'dotted', wOR: 1,
            orStr: '09:30-09:45',
            showIB: false, ibLines: true, ibCell: true, showIBTg: false,
            ibNarrow: 0.30, ibWide: 0.80,
            cIBi: '#000080', sIBi: 'dashed', cTgti: '#9c27b0', sTgti: 'dotted', wIB: 1,
            ibStr: '09:30-10:30',
            showLbl: true, lblSizeS: 'normal', lblOff: 2, mergeK: 0.05, lblStagger: 10,
            keepSess: 0, lvlOpacity: 100
        };
    }

    function mergeParams(params) {
        var d = defaultParams();
        var p = params || {};
        var out = Object.assign({}, d);
        Object.keys(d).forEach(function (k) {
            if (p[k] !== undefined) out[k] = p[k];
        });
        return out;
    }

    function parseSessionRange(str) {
        var parts = String(str || '09:30-16:00').split('-');
        return { start: parseHm(parts[0]), end: parseHm(parts[1] || parts[0]) };
    }

    function calculateTalariaRatioGap(data, params) {
        var p = mergeParams(params);
        var bars = Array.isArray(data) ? data : [];
        var n = bars.length;
        if (n < 2) return { lines: [], boxes: [], labels: [], infoCells: [], infoMeta: p };

        var sess = parseSessionRange(p.sessStr);
        var orWin = parseSessionRange(p.orStr);
        var ibWin = parseSessionRange(p.ibStr);
        var tz = p.tzStr || 'America/New_York';
        var chartMs = 60000;
        if (bars.length > 1 && bars[1].t > bars[0].t) chartMs = bars[1].t - bars[0].t;

        var ranges = [];
        var prevHi = null; var prevLo = null; var prevCl = null;
        var curHi = null; var curLo = null; var curCl = null;
        var todayOpen = null;
        var ibHi = null; var ibLo = null; var orHi = null; var orLo = null;
        var sessStartIdx = null;
        var prevSessDate = null;
        var prevInSess = false;
        var ibDone = false; var orDone = false;

        var lines = [];
        var boxes = [];
        var histLines = [];
        var sessions = [];
        var curSess = null;

        function pushLine(price, color, style, width, startIdx, endIdx, label) {
            if (!Number.isFinite(price)) return;
            lines.push({
                price: price, color: fadeColor(color, p.lvlOpacity),
                style: style, width: width || 1,
                startIndex: startIdx, endIndex: endIdx, label: label || ''
            });
        }

        for (var i = 0; i < n; i++) {
            var dec = wallDecimal(bars[i].t, tz);
            var inSess = inWindow(dec, sess.start, sess.end);
            var inOR = inWindow(dec, orWin.start, orWin.end);
            var inIB = inWindow(dec, ibWin.start, ibWin.end);
            var sd = sessDateKey(bars[i].t, tz);
            var newDate = prevSessDate != null && sd !== prevSessDate;
            var newSess = inSess && (!prevInSess || newDate);

            if (newSess) {
                if (curSess) { curSess.endIdx = i - 1; sessions.push(curSess); }
                if (curHi != null && curLo != null) ranges.push(curHi - curLo);
                if (ranges.length > (Number(p.avgLen) || 14) + 1) ranges.shift();
                prevHi = curHi;
                prevLo = curLo;
                prevCl = curCl;
                todayOpen = bars[i].o;
                ibHi = null; ibLo = null; orHi = null; orLo = null;
                ibDone = false; orDone = false;
                sessStartIdx = i;
                curHi = bars[i].h;
                curLo = bars[i].l;
                curCl = bars[i].c;
                curSess = {
                    startIdx: i, endIdx: n - 1,
                    prevHi: prevHi, prevLo: prevLo, prevCl: prevCl,
                    todayOpen: todayOpen, orHi: null, orLo: null, ibHi: null, ibLo: null
                };
            } else if (inSess) {
                if (curHi == null) {
                    curHi = bars[i].h;
                    curLo = bars[i].l;
                } else {
                    curHi = Math.max(curHi, bars[i].h);
                    curLo = Math.min(curLo, bars[i].l);
                }
                curCl = bars[i].c;
            }

            if (inIB && inSess) {
                ibHi = ibHi == null ? bars[i].h : Math.max(ibHi, bars[i].h);
                ibLo = ibLo == null ? bars[i].l : Math.min(ibLo, bars[i].l);
            }
            if (inOR && inSess) {
                orHi = orHi == null ? bars[i].h : Math.max(orHi, bars[i].h);
                orLo = orLo == null ? bars[i].l : Math.min(orLo, bars[i].l);
            }

            if (inSess && !inIB && ibHi != null && !ibDone) ibDone = true;
            if (inSess && !inOR && orHi != null && !orDone) orDone = true;

            if (curSess) {
                curSess.orHi = orHi; curSess.orLo = orLo;
                curSess.ibHi = ibHi; curSess.ibLo = ibLo;
            }

            prevInSess = inSess;
            prevSessDate = sd;
        }
        if (curSess) sessions.push(curSess);

        var avgLen = Math.max(5, Number(p.avgLen) || 14);
        var yRange = ranges.length ? ranges[ranges.length - 1] : null;
        var avgR = null;
        if (ranges.length > 1) {
            var cnt = Math.min(avgLen, ranges.length - 1);
            var sum = 0;
            for (var ri = 0; ri < cnt; ri++) sum += ranges[ranges.length - 2 - ri];
            avgR = sum / cnt;
        }
        var ratio = yRange != null && avgR > 0 ? yRange / avgR : null;
        var gapPts = todayOpen != null && prevCl != null ? todayOpen - prevCl : null;
        var gapRatio = gapPts != null && avgR > 0 ? Math.abs(gapPts) / avgR : null;
        var gapUp = gapPts != null && gapPts > 0;
        var openInside = todayOpen != null && prevHi != null && prevLo != null
            && todayOpen <= prevHi && todayOpen >= prevLo;
        var midPx = prevHi != null && prevLo != null ? (prevHi + prevLo) / 2 : null;
        var g50Px = gapPts != null && todayOpen != null ? todayOpen - gapPts / 2 : null;
        var orRatio = orDone && avgR > 0 && orHi != null && orLo != null ? (orHi - orLo) / avgR : null;
        var ibRatio = ibDone && avgR > 0 && ibHi != null && ibLo != null ? (ibHi - ibLo) / avgR : null;

        var endIdx = n - 1;
        var startIdx = sessStartIdx != null ? sessStartIdx : 0;

        if (p.showPDR && p.pdrLines && prevHi != null) {
            pushLine(prevHi, p.cPDHi, p.sPDHi, p.wPrev, startIdx, endIdx, 'PDH');
            pushLine(prevLo, p.cPDLi, p.sPDLi, p.wPrev, startIdx, endIdx, 'PDL');
            pushLine(midPx, p.cMidi, p.sMidi, p.wPrev, startIdx, endIdx, 'MID');
        }
        if (p.showPDR && p.showDead && prevHi != null && midPx != null) {
            var pdrR = prevHi - prevLo;
            var half = pdrR * (Number(p.deadPct) || 10) / 200;
            boxes.push({
                startIndex: startIdx, endIndex: endIdx,
                top: midPx + half, bottom: midPx - half,
                fill: p.cDeadi
            });
        }
        if (p.showGapSect && p.gapLines && prevCl != null) {
            pushLine(prevCl, p.cPCi, p.sPCi, p.wGap, startIdx, endIdx, 'Y-CLOSE (fill)');
            pushLine(g50Px, p.cG50i, p.sG50i, p.wGap, startIdx, endIdx, 'GAP 50%');
        }
        if (p.showGapSect && p.showOpen && todayOpen != null) {
            pushLine(todayOpen, p.cOPi, p.sOPi, p.wGap, startIdx, endIdx, 'OPEN');
        }
        if (p.showOR && p.orLines && orDone && orHi != null) {
            pushLine(orHi, p.cORi, p.sORi, p.wOR, startIdx, endIdx, 'OR-H');
            pushLine(orLo, p.cORi, p.sORi, p.wOR, startIdx, endIdx, 'OR-L');
        }
        if (p.showOR && p.showORTg && orDone && orHi != null) {
            var orR = orHi - orLo;
            pushLine(orHi + 0.3 * orR, p.cOTgi, p.sOTgi, p.wOR, startIdx, endIdx, '+0.3× OR');
            pushLine(orHi + 0.5 * orR, p.cOTgi, p.sOTgi, p.wOR, startIdx, endIdx, '+0.5× OR');
            pushLine(orLo - 0.3 * orR, p.cOTgi, p.sOTgi, p.wOR, startIdx, endIdx, '−0.3× OR');
            pushLine(orLo - 0.5 * orR, p.cOTgi, p.sOTgi, p.wOR, startIdx, endIdx, '−0.5× OR');
        }
        if (p.showIB && p.ibLines && ibDone && ibHi != null) {
            pushLine(ibHi, p.cIBi, p.sIBi, p.wIB, startIdx, endIdx, 'IB-H');
            pushLine(ibLo, p.cIBi, p.sIBi, p.wIB, startIdx, endIdx, 'IB-L');
        }
        if (p.showIB && p.showIBTg && ibDone && ibHi != null) {
            var ibR = ibHi - ibLo;
            pushLine(ibHi + 0.3 * ibR, p.cTgti, p.sTgti, p.wIB, startIdx, endIdx, '+0.3× IB');
            pushLine(ibHi + 0.5 * ibR, p.cTgti, p.sTgti, p.wIB, startIdx, endIdx, '+0.5× IB');
            pushLine(ibLo - 0.3 * ibR, p.cTgti, p.sTgti, p.wIB, startIdx, endIdx, '−0.3× IB');
            pushLine(ibLo - 0.5 * ibR, p.cTgti, p.sTgti, p.wIB, startIdx, endIdx, '−0.5× IB');
        }
        if (p.showPDR && p.showPDRTg && openInside && prevHi != null) {
            var pdrR2 = prevHi - prevLo;
            pushLine(prevHi + 0.3 * pdrR2, p.cPTgi, p.sPTgi, p.wPrev, startIdx, endIdx, '+0.3× PDR');
            pushLine(prevHi + 0.5 * pdrR2, p.cPTgi, p.sPTgi, p.wPrev, startIdx, endIdx, '+0.5× PDR');
            pushLine(prevLo - 0.3 * pdrR2, p.cPTgi, p.sPTgi, p.wPrev, startIdx, endIdx, '−0.3× PDR');
            pushLine(prevLo - 0.5 * pdrR2, p.cPTgi, p.sPTgi, p.wPrev, startIdx, endIdx, '−0.5× PDR');
        }

        // Keep past sessions' levels frozen within their own span (Pine `keepSess`).
        var keepSess = Math.max(0, Math.min(25, Number(p.keepSess) || 0));
        if (keepSess > 0 && sessions.length > 1) {
            function pushHist(price, color, style, width, s, e) {
                if (!Number.isFinite(price)) return;
                histLines.push({
                    price: price, color: fadeColor(color, p.lvlOpacity),
                    style: style, width: width || 1,
                    startIndex: s, endIndex: e, label: ''
                });
            }
            var past = sessions.slice(0, sessions.length - 1);
            var fromIdx = Math.max(0, past.length - keepSess);
            for (var hs = fromIdx; hs < past.length; hs++) {
                var S = past[hs];
                var s0 = S.startIdx; var e0 = S.endIdx;
                var hMid = (S.prevHi != null && S.prevLo != null) ? (S.prevHi + S.prevLo) / 2 : null;
                var hGapPts = (S.todayOpen != null && S.prevCl != null) ? S.todayOpen - S.prevCl : null;
                var hG50 = (hGapPts != null && S.todayOpen != null) ? S.todayOpen - hGapPts / 2 : null;
                if (p.showPDR && p.pdrLines && S.prevHi != null) {
                    pushHist(S.prevHi, p.cPDHi, p.sPDHi, p.wPrev, s0, e0);
                    pushHist(S.prevLo, p.cPDLi, p.sPDLi, p.wPrev, s0, e0);
                    pushHist(hMid, p.cMidi, p.sMidi, p.wPrev, s0, e0);
                }
                if (p.showGapSect && p.gapLines && S.prevCl != null) {
                    pushHist(S.prevCl, p.cPCi, p.sPCi, p.wGap, s0, e0);
                    pushHist(hG50, p.cG50i, p.sG50i, p.wGap, s0, e0);
                }
                if (p.showGapSect && p.showOpen && S.todayOpen != null) {
                    pushHist(S.todayOpen, p.cOPi, p.sOPi, p.wGap, s0, e0);
                }
                if (p.showOR && p.orLines && S.orHi != null) {
                    pushHist(S.orHi, p.cORi, p.sORi, p.wOR, s0, e0);
                    pushHist(S.orLo, p.cORi, p.sORi, p.wOR, s0, e0);
                }
                if (p.showIB && p.ibLines && S.ibHi != null) {
                    pushHist(S.ibHi, p.cIBi, p.sIBi, p.wIB, s0, e0);
                    pushHist(S.ibLo, p.cIBi, p.sIBi, p.wIB, s0, e0);
                }
            }
        }

        var labels = [];
        if (p.showLbl) {
            lines.forEach(function (ln) {
                if (!ln.label) return;
                labels.push({
                    price: ln.price,
                    text: ln.label,
                    color: ln.color
                });
            });
        }

        var ct = 100 - (Number(p.cellOpacity) || 90);
        function cellBg(val, narrow, wide, useTh) {
            if (!p.colorOn || val == null || !useTh) return fadeColor(p.cNeut, ct);
            if (val <= narrow) return fadeColor(p.cNarrow, ct);
            if (val >= wide) return fadeColor(p.cWide, ct);
            return fadeColor(p.cNeut, ct);
        }

        var infoCells = [];
        if (p.showPDR && p.pdrCell) {
            infoCells.push({
                name: 'RANGE',
                value: ratio == null ? '…' : ratio.toFixed(2) + '×',
                bg: cellBg(ratio, Number(p.rngNarrow), Number(p.rngWide), true)
            });
        }
        if (p.showGapSect && p.gapCell) {
            var arrow = gapPts == null ? '' : (gapUp ? ' ▲' : ' ▼');
            infoCells.push({
                name: 'GAP',
                value: gapRatio == null ? '…' : gapRatio.toFixed(2) + '×' + arrow,
                bg: cellBg(gapRatio, Number(p.gapSmall), Number(p.gapLarge), true)
            });
        }
        if (p.showPDR && p.pdrIOCell) {
            infoCells.push({
                name: 'OPEN',
                value: prevHi == null ? '…' : (openInside ? 'IN' : 'OUT'),
                bg: prevHi == null ? fadeColor(p.cNeut, ct) : fadeColor(openInside ? p.cIn : p.cOut, ct)
            });
        }
        if (p.showOR && p.orCell) {
            var orThOn = Number(p.orNarrow) > 0 || Number(p.orWide) > 0;
            infoCells.push({
                name: 'OR',
                value: orRatio == null ? '…' : orRatio.toFixed(2) + '×',
                bg: cellBg(orRatio, Number(p.orNarrow), Number(p.orWide), orThOn)
            });
        }
        if (p.showIB && p.ibCell) {
            infoCells.push({
                name: 'IB',
                value: ibRatio == null ? '…' : ibRatio.toFixed(2) + '×',
                bg: cellBg(ibRatio, Number(p.ibNarrow), Number(p.ibWide), true)
            });
        }

        return {
            lines: lines.concat(histLines),
            boxes: boxes,
            labels: labels,
            labelMeta: {
                size: p.lblSizeS,
                lblOff: Number(p.lblOff) || 0,
                mergeK: Number(p.mergeK) || 0,
                stagger: Number(p.lblStagger) || 10,
                avgR: avgR
            },
            infoCells: infoCells,
            infoMeta: {
                tblPos: p.tblPos,
                tblLayout: p.tblLayout,
                txtSize: p.txtSize,
                cTxt: p.cTxt,
                cellOpacity: Number(p.cellOpacity) || 90
            }
        };
    }

    function lineDash(style) {
        if (style === 'dotted') return [2, 3];
        if (style === 'dashed') return [6, 4];
        return [];
    }

    function tableAnchor(pos, chartW, chartH, margin, panelW, panelH) {
        var pad = 10;
        var plotL = margin.l;
        var plotR = chartW - margin.r;
        var plotT = margin.t;
        var plotB = chartH - margin.b;
        var p = String(pos || 'bottom_right').replace(/_/g, ' ');
        p = p.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        var x = plotL + pad;
        var y = plotT + pad;
        if (p.indexOf('Right') >= 0) x = plotR - pad - panelW;
        else if (p.indexOf('Center') >= 0) x = (plotL + plotR - panelW) / 2;
        if (p.indexOf('Bottom') >= 0) y = plotB - pad - panelH;
        else if (p.indexOf('Middle') >= 0) y = (plotT + plotB - panelH) / 2;
        return { x: Math.max(plotL + 4, x), y: Math.max(plotT + 4, y) };
    }

    function attachDraw() {
        if (!global.Chart || !global.Chart.prototype) return;
        var proto = global.Chart.prototype;
        if (proto.drawTalariaRatioGap) return;

        proto.drawTalariaRatioGap = function (data, style, startIndex, endIndex) {
            if (!data) return;
            var ctx = this.ctx;
            var m = this.margin;
            var n = this.data ? this.data.length : 0;
            endIndex = endIndex == null ? n : Math.min(endIndex, n);

            if (data.boxes && data.boxes.length) {
                data.boxes.forEach(function (bx) {
                    if (bx.endIndex < startIndex || bx.startIndex > endIndex) return;
                    var x1 = this.dataIndexToPixel(Math.max(bx.startIndex, startIndex));
                    var x2 = this.dataIndexToPixel(Math.min(bx.endIndex, endIndex));
                    var yT = this.yScale(Math.max(bx.top, bx.bottom));
                    var yB = this.yScale(Math.min(bx.top, bx.bottom));
                    ctx.fillStyle = bx.fill || 'rgba(128,128,128,0.12)';
                    ctx.fillRect(Math.max(x1, m.l), yT, Math.min(x2, this.w - m.r) - Math.max(x1, m.l), yB - yT);
                }, this);
            }

            var plotL = m.l;
            var plotR = this.w - m.r;
            var plotLayout = typeof this._getMainPricePlotLayout === 'function'
                ? this._getMainPricePlotLayout() : null;
            var plotTop = plotLayout ? plotLayout.plotTop : m.t;
            var plotBottom = plotLayout ? plotLayout.plotBottom : (this.h - m.b);

            if (data.lines && data.lines.length) {
                data.lines.forEach(function (ln) {
                    if (ln.startIndex > endIndex) return;
                    var y = this.yScale(ln.price);
                    if (y < plotTop - 2 || y > plotBottom + 2) return;
                    var x1 = this.dataIndexToPixel(Math.max(ln.startIndex, startIndex));
                    // Lines stop at the current/last bar (like TradingView), not the axis.
                    var x2 = this.dataIndexToPixel(Math.min(ln.endIndex, endIndex));
                    if (x2 < plotL || x1 > plotR) return;
                    ctx.save();
                    ctx.strokeStyle = ln.color || '#ffffff';
                    ctx.lineWidth = ln.width || 1;
                    ctx.setLineDash(lineDash(ln.style));
                    ctx.beginPath();
                    ctx.moveTo(Math.max(x1, plotL), y);
                    ctx.lineTo(Math.min(x2, plotR), y);
                    ctx.stroke();
                    ctx.restore();
                }, this);
            }

            if (data.labels && data.labels.length) {
                var lm = data.labelMeta || {};
                var fontSize = lm.size === 'tiny' ? 9 : lm.size === 'small' ? 10
                    : lm.size === 'large' ? 14 : lm.size === 'huge' ? 17 : 12;
                ctx.font = '600 ' + fontSize + 'px Roboto, system-ui, sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                var candleSp = (typeof this.getCandleSpacing === 'function')
                    ? Number(this.getCandleSpacing()) : NaN;
                if (!Number.isFinite(candleSp) || candleSp <= 0) {
                    candleSp = (Number(this.candleWidth) || 6) + 2;
                }
                var offBars = Number(lm.lblOff);
                if (!Number.isFinite(offBars)) offBars = 2;
                var staggerBars = Number(lm.stagger);
                if (!Number.isFinite(staggerBars) || staggerBars < 1) staggerBars = 10;
                var mergeK = Number(lm.mergeK) || 0;
                var avgR = Number(lm.avgR) || 0;
                // Price proximity → pixel band: labels closer than mergeK×avgR stagger.
                var mergePx = 0;
                if (mergeK > 0 && avgR > 0) {
                    mergePx = Math.abs(this.yScale(0) - this.yScale(mergeK * avgR));
                }
                var placed = [];
                data.labels.forEach(function (lb) {
                    var y = this.yScale(lb.price);
                    if (y < plotTop + 1 || y > plotBottom - 1) return;
                    placed.push({ text: lb.text, color: lb.color, y: y, tw: ctx.measureText(lb.text).width });
                }, this);
                placed.sort(function (a, b) { return a.y - b.y; });
                // Anchor labels to the RIGHT of the last bar + lblOff bars (TradingView-like).
                var lastBarX = Math.min(this.dataIndexToPixel(n - 1), plotR);
                var maxTw = 0;
                for (var mi = 0; mi < placed.length; mi++) maxTw = Math.max(maxTw, placed[mi].tw);
                var anchorX = Math.min(lastBarX + 8 + offBars * candleSp, plotR - 2 - maxTw);
                if (anchorX < plotL + 2) anchorX = plotL + 2;
                var gap = Math.max(4, staggerBars * candleSp);
                var lineH = fontSize + 4;
                var vPad = Math.max(lineH / 2, mergePx / 2);
                // Greedy 2-D placement: stagger right by lblStagger bars, then wrap down.
                var rects = [];
                function findConflict(x, y, tw) {
                    for (var r = 0; r < rects.length; r++) {
                        var q = rects[r];
                        var vOverlap = Math.abs(y - (q.top + q.bottom) / 2) < (vPad + lineH / 2);
                        var hOverlap = !(x >= q.right || x + tw <= q.left);
                        if (vOverlap && hOverlap) return q;
                    }
                    return null;
                }
                for (var li = 0; li < placed.length; li++) {
                    var it = placed[li];
                    var tw = it.tw;
                    var x = anchorX;
                    var y = it.y;
                    var guard = 0;
                    while (guard++ < 60) {
                        var c = findConflict(x, y, tw);
                        if (!c) {
                            if (x + tw <= plotR - 2) break;
                            y += lineH; x = anchorX;
                        } else {
                            x = c.right + gap;
                            if (x + tw > plotR - 2) { y += lineH; x = anchorX; }
                        }
                    }
                    if (y > plotBottom - 2) y = plotBottom - 2;
                    ctx.fillStyle = it.color || '#ffffff';
                    ctx.fillText(it.text, x, y);
                    rects.push({ left: x, right: x + tw, top: y - lineH / 2, bottom: y + lineH / 2 });
                }
            }

            if (data.infoCells && data.infoCells.length && typeof this._drawTalariaRatioInfoCells === 'function') {
                this._drawTalariaRatioInfoCells(data.infoCells, data.infoMeta || {});
            }
        };

        proto._drawTalariaRatioInfoCells = function (cells, meta) {
            if (!cells || !cells.length) return;
            var ctx = this.ctx;
            var m = this.margin;
            var layout = meta.tblLayout || 'headers — horizontal';
            var isVertical = layout.indexOf('vertical') >= 0;
            var isCompact = layout.indexOf('compact') >= 0;
            var txtSize = meta.txtSize === 'tiny' ? 10 : meta.txtSize === 'small' ? 11
                : meta.txtSize === 'huge' ? 16 : meta.txtSize === 'normal' ? 12 : 14;
            var hdrSize = Math.max(9, txtSize - 2);
            var cTxt = meta.cTxt || '#ffffff';
            var op = Math.max(0, Math.min(100, Number(meta.cellOpacity) || 90)) / 100;
            var hdrBg = 'rgba(30,41,59,' + op + ')';
            var txtColor = cTxt;
            var pad = 12;
            var cols = cells.length;

            ctx.save();
            ctx.textBaseline = 'middle';

            // Measure to size cells to their content (no clipping, TV-like).
            ctx.font = '700 ' + txtSize + 'px Roboto, system-ui, sans-serif';
            var valW = cells.map(function (c) { return ctx.measureText(c.value).width; });
            ctx.font = '600 ' + hdrSize + 'px Roboto, system-ui, sans-serif';
            var nameW = cells.map(function (c) { return ctx.measureText(c.name).width; });

            var cellH = 22;
            var cellW;
            var panelW; var panelH;
            if (isVertical) {
                var maxName = Math.max.apply(null, nameW);
                var maxVal = Math.max.apply(null, valW);
                cellW = Math.ceil(Math.max(maxName, maxVal)) + pad * 2;
                panelW = cellW + 8;
                panelH = cols * cellH + 8;
            } else {
                var perCol = cells.map(function (_, i) {
                    return Math.ceil(Math.max(nameW[i], valW[i])) + pad;
                });
                cellW = Math.max.apply(null, perCol);
                cellW = Math.max(cellW, isCompact ? 58 : 52);
                panelW = cols * cellW + 8;
                panelH = (isCompact ? cellH : cellH * 2) + 8;
            }

            var anchor = tableAnchor(meta.tblPos, this.w, this.h, m, panelW, panelH);
            var px = anchor.x; var py = anchor.y;

            // Panel background.
            ctx.fillStyle = 'rgba(13,17,23,0.92)';
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
            ctx.fill();
            ctx.stroke();

            var gx = px + 4;
            var gy = py + 4;

            function drawCell(x, y, w, h, bg, text, font, isHdr) {
                ctx.fillStyle = bg;
                ctx.fillRect(x, y, w - 2, h - 2);
                ctx.font = font;
                ctx.fillStyle = isHdr ? cTxt : txtColor;
                ctx.textAlign = 'center';
                ctx.fillText(text, x + (w - 2) / 2, y + (h - 2) / 2 + 0.5);
            }

            var hdrFont = '600 ' + hdrSize + 'px Roboto, system-ui, sans-serif';
            var valFont = '700 ' + txtSize + 'px Roboto, system-ui, sans-serif';

            cells.forEach(function (cell, ci) {
                if (isVertical) {
                    var vy = gy + ci * cellH;
                    // name label (left) + value chip (right) share one row
                    drawCell(gx, vy, cellW * 0.42, cellH, hdrBg, cell.name, hdrFont, true);
                    drawCell(gx + cellW * 0.42, vy, cellW * 0.58, cellH, cell.bg || hdrBg, cell.value, valFont, false);
                } else if (isCompact) {
                    var cx = gx + ci * cellW;
                    var prefix = cell.name === 'RANGE' ? 'R ' : cell.name === 'GAP' ? 'G ' : cell.name + ' ';
                    drawCell(cx, gy, cellW, cellH, cell.bg || hdrBg, prefix + cell.value, valFont, false);
                } else {
                    var hx = gx + ci * cellW;
                    drawCell(hx, gy, cellW, cellH, hdrBg, cell.name, hdrFont, true);
                    drawCell(hx, gy + cellH, cellW, cellH, cell.bg || hdrBg, cell.value, valFont, false);
                }
            });

            ctx.restore();
        };
    }

    attachDraw();

    global.TalariaRatioGapIndicator = {
        defaultParams: defaultParams,
        calculate: calculateTalariaRatioGap
    };
})(typeof window !== 'undefined' ? window : this);
