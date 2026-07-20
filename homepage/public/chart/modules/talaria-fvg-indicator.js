/**
 * Talaria — FVG (ported from Talaria_FVG_v5.pine)
 * Multi-timeframe fair value gaps with session-day rules, live preview,
 * fpFVG tags, and mitigation — bar-by-bar parity with the Pine v5 script.
 */
(function (global) {
    'use strict';

    var TF_MS = {
        '1m': 60000, '2m': 120000, '3m': 180000, '4m': 240000, '5m': 300000,
        '10m': 600000, '15m': 900000, '30m': 1800000, '45m': 2700000,
        '1h': 3600000, '2h': 7200000, '4h': 14400000, '1d': 86400000
    };

    var _etFmtCache = null;
    function etParts(ms) {
        if (!_etFmtCache) {
            _etFmtCache = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
        var parts = _etFmtCache.formatToParts(new Date(ms));
        var out = { y: 0, m: 0, d: 0, h: 0, min: 0 };
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (p.type === 'year') out.y = parseInt(p.value, 10);
            else if (p.type === 'month') out.m = parseInt(p.value, 10);
            else if (p.type === 'day') out.d = parseInt(p.value, 10);
            else if (p.type === 'hour') out.h = parseInt(p.value, 10) % 24;
            else if (p.type === 'minute') out.min = parseInt(p.value, 10);
        }
        return out;
    }

    /**
     * Daily-candle day key matching Pine's timeframe.change("1D") on CME futures:
     * the day starts at 18:00 ET.
     */
    function sessionDayKey(ms) {
        var p = etParts(ms);
        var y = p.y, m = p.m, d = p.d;
        if (p.h < 18) {
            var dt = new Date(Date.UTC(y, m - 1, d));
            dt.setUTCDate(dt.getUTCDate() - 1);
            y = dt.getUTCFullYear();
            m = dt.getUTCMonth() + 1;
            d = dt.getUTCDate();
        }
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function tfToMs(tf) {
        if (!tf) return 60000;
        var key = String(tf).toLowerCase().trim();
        if (TF_MS[key] != null) return TF_MS[key];
        var m = key.match(/^(\d+)([mhdw])$/);
        if (!m) return 60000;
        var n = parseInt(m[1], 10);
        if (m[2] === 'm') return n * 60000;
        if (m[2] === 'h') return n * 3600000;
        if (m[2] === 'd') return n * 86400000;
        if (m[2] === 'w') return n * 604800000;
        return 60000;
    }

    function periodStart(t, tfMs) {
        return Math.floor(Number(t) / tfMs) * tfMs;
    }

    function defaultParams() {
        return {
            showDayLn: true,
            cDayLn: 'rgba(128,128,128,0.55)',
            sDayLn: 'dashed',
            wDayLn: 1,
            keepDays: 20,
            atrLen: 14,
            livePrev: true,
            dayEnd: 'freeze (stop extending)',
            maxLive: 150,
            on5: true, mult5: 0.0,
            cB5f: 'rgba(144,238,144,0.28)',
            cR5f: 'rgba(255,158,158,0.28)',
            on15: true, mult15: 2.0, first15: true,
            cF15: 'rgba(255,165,0,0.45)',
            cB15f: 'rgba(0,110,40,0.32)',
            cR15f: 'rgba(155,10,10,0.32)',
            on30: true, mult30: 1.5, first30: true,
            cF30: 'rgba(255,165,0,0.50)',
            cB30f: 'rgba(0,95,35,0.38)',
            cR30f: 'rgba(140,8,8,0.38)',
            mitBy: 'wick',
            mitDepth: 'full fill (100%)',
            hideMit: true,
            txtSizeS: 'small',
            txtColS: 'white',
            padBars: 10,
            showMid: false
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

    function makeStreamState(cfg) {
        return {
            enabled: cfg.enabled,
            tfOk: cfg.tfOk,
            tfMs: cfg.tfMs,
            mult: cfg.mult,
            tagFirst: cfg.tagFirst,
            tagAll: cfg.tagAll,
            tfTag: cfg.tfTag,
            bullFill: cfg.bullFill,
            bearFill: cfg.bearFill,
            firstFill: cfg.firstFill,
            cT1: null, cH1: null, cL1: null,
            cT2: null, cH2: null, cL2: null,
            cT3: null, cH3: null, cL3: null,
            runT: null, runH: null, runL: null, runC: null,
            finalized: false,
            atrV: null, prevC: null,
            firstDone: false,
            preview: null
        };
    }

    function resetStreamDay(st) {
        st.firstDone = false;
        st.cT1 = null; st.cH1 = null; st.cL1 = null;
        st.cT2 = null; st.cH2 = null; st.cL2 = null;
        st.cT3 = null; st.cH3 = null; st.cL3 = null;
        st.runT = null;
        st.finalized = false;
        st.preview = null;
    }

    function calculateTalariaFvg(data, params, ctx) {
        var p = mergeParams(params);
        var chartData = Array.isArray(data) ? data : [];
        var n = chartData.length;
        if (n < 3) return { boxes: [], dayLines: [], midLines: [], previews: [] };

        var chartTf = ctx && ctx.currentTimeframe ? ctx.currentTimeframe : '5m';
        var chartMs = tfToMs(chartTf);
        if (chartMs >= tfToMs('1d')) return { boxes: [], dayLines: [], midLines: [], previews: [] };

        var ok5 = chartMs <= tfToMs('5m');
        var ok15 = chartMs <= tfToMs('15m');
        var ok30 = chartMs <= tfToMs('30m');
        var atrLen = Math.max(1, Math.floor(Number(p.atrLen) || 14));
        var removeAtDayEnd = String(p.dayEnd).indexOf('remove') >= 0;
        var maxLive = Math.max(10, Math.min(400, Number(p.maxLive) || 150));
        var padBars = Math.max(3, Math.min(40, Number(p.padBars) || 10));
        var livePrev = p.livePrev !== false;

        var streams = [];
        if (p.on5 && ok5) {
            streams.push(makeStreamState({
                enabled: true, tfOk: true, tfMs: tfToMs('5m'),
                mult: Number(p.mult5) || 0, tagFirst: false, tagAll: false, tfTag: '5m',
                bullFill: p.cB5f, bearFill: p.cR5f, firstFill: p.cF15
            }));
        }
        if (p.on15 && ok15) {
            streams.push(makeStreamState({
                enabled: true, tfOk: true, tfMs: tfToMs('15m'),
                mult: Number(p.mult15) || 0, tagFirst: !!p.first15, tagAll: true, tfTag: '15m',
                bullFill: p.cB15f, bearFill: p.cR15f, firstFill: p.cF15
            }));
        }
        if (p.on30 && ok30) {
            streams.push(makeStreamState({
                enabled: true, tfOk: true, tfMs: tfToMs('30m'),
                mult: Number(p.mult30) || 0, tagFirst: !!p.first30, tagAll: true, tfTag: '30m',
                bullFill: p.cB30f, bearFill: p.cR30f, firstFill: p.cF30
            }));
        }

        var live = [];
        var frozen = [];
        var dayLines = [];
        var dayStartT = null;
        var prevDayKey = null;
        var laneCounter = 0;

        function indexAtOrBefore(t) {
            var lo = 0, hi = n - 1, ans = 0;
            while (lo <= hi) {
                var mid = (lo + hi) >> 1;
                if (chartData[mid].t <= t) { ans = mid; lo = mid + 1; }
                else hi = mid - 1;
            }
            return ans;
        }

        function killAt(idx) { live.splice(idx, 1); }

        function freezeAt(idx, rightIndex) {
            var b = live[idx];
            frozen.push({
                startIndex: b.startIndex,
                endIndex: rightIndex,
                top: b.top,
                bottom: b.bottom,
                dir: b.dir,
                tagged: b.tagged,
                tag: b.tag,
                fillColor: b.fillColor,
                showMid: !!p.showMid,
                provisional: false
            });
            live.splice(idx, 1);
        }

        function spawn(leftT, top, bot, dir, isFirst, tg, cBg, cFirstBg, barIndex) {
            live.push({
                startIndex: Math.max(0, indexAtOrBefore(leftT)),
                endIndex: barIndex,
                top: Math.max(top, bot),
                bottom: Math.min(top, bot),
                dir: dir,
                tagged: tg !== '',
                tag: tg,
                fillColor: isFirst ? cFirstBg : cBg,
                birthDay: dayStartT,
                lane: tg !== '' ? (laneCounter++ % 5) : 0
            });
        }

        function finalizeCandle(st, fT, fH, fL, fC, barIndex) {
            var tr = st.prevC == null
                ? (fH - fL)
                : Math.max(fH - fL, Math.max(Math.abs(fH - st.prevC), Math.abs(fL - st.prevC)));
            st.atrV = st.atrV == null ? tr : (st.atrV * (atrLen - 1) + tr) / atrLen;
            st.prevC = fC;
            st.cT1 = st.cT2; st.cH1 = st.cH2; st.cL1 = st.cL2;
            st.cT2 = st.cT3; st.cH2 = st.cH3; st.cL2 = st.cL3;
            st.cT3 = fT; st.cH3 = fH; st.cL3 = fL;
            st.preview = null;
            if (st.cH1 == null) return;

            var bullGap = st.cL3 > st.cH1;
            var bearGap = st.cH3 < st.cL1;
            var sz = bullGap ? (st.cL3 - st.cH1) : bearGap ? (st.cL1 - st.cH3) : null;
            var qual = sz != null && (st.mult === 0 || (st.atrV != null && sz >= st.mult * st.atrV));
            var oldDay = dayStartT != null && st.cT3 < dayStartT;
            var c1Today = dayStartT != null && st.cT1 >= dayStartT;
            var isFirst = (bullGap || bearGap) && c1Today && !st.firstDone && st.tagFirst;
            if (isFirst) st.firstDone = true;
            var tg = isFirst
                ? ('fpFVG · ' + st.tfTag)
                : (st.tagAll && qual ? ('FVG · ' + st.tfTag) : '');

            if (bullGap && (qual || isFirst) && !(oldDay && removeAtDayEnd)) {
                spawn(st.cT2, st.cL3, st.cH1, 1, isFirst, tg, st.bullFill, st.firstFill, barIndex);
                if (oldDay) freezeAt(live.length - 1, indexAtOrBefore(dayStartT));
            }
            if (bearGap && (qual || isFirst) && !(oldDay && removeAtDayEnd)) {
                spawn(st.cT2, st.cL1, st.cH3, -1, isFirst, tg, st.bearFill, st.firstFill, barIndex);
                if (oldDay) freezeAt(live.length - 1, indexAtOrBefore(dayStartT));
            }
        }

        function processStream(st, bar, barIndex, isConfirmed) {
            st.preview = null;
            if (!st.enabled || !st.tfOk) return;

            var pT = periodStart(bar.t, st.tfMs);
            var newPeriod = st.runT != null && pT !== st.runT;
            var complete = false;
            var fT = null, fH = null, fL = null, fC = null;

            // Path B — safety net
            if (newPeriod && !st.finalized) {
                complete = true;
                fT = st.runT; fH = st.runH; fL = st.runL; fC = st.runC;
            }

            if (st.runT == null || newPeriod) {
                st.runT = pT;
                st.runH = bar.h;
                st.runL = bar.l;
                st.finalized = false;
            } else {
                st.runH = Math.max(st.runH, bar.h);
                st.runL = Math.min(st.runL, bar.l);
            }
            st.runC = bar.c;

            // Path A — confirmed chart bar closes the source candle
            var barClose = bar.t + chartMs;
            var srcClose = (st.runT != null ? st.runT : pT) + st.tfMs;
            if (!complete && !st.finalized && isConfirmed && barClose >= srcClose) {
                complete = true;
                st.finalized = true;
                fT = st.runT; fH = st.runH; fL = st.runL; fC = st.runC;
                st.runT = null;
            }

            if (complete) finalizeCandle(st, fT, fH, fL, fC, barIndex);

            // Live preview on the running 3rd candle
            if (livePrev && st.runT != null && st.cH2 != null) {
                var pBull = st.runL > st.cH2;
                var pBear = st.runH < st.cL2;
                if (pBull || pBear) {
                    var pTop = pBull ? st.runL : st.cL2;
                    var pBot = pBull ? st.cH2 : st.runH;
                    var pSz = pTop - pBot;
                    var pQual = st.mult === 0 || (st.atrV != null && pSz >= st.mult * st.atrV);
                    var pFirst = st.tagFirst && !st.firstDone && dayStartT != null && st.cT2 >= dayStartT;
                    if (pQual || pFirst) {
                        st.preview = {
                            startIndex: indexAtOrBefore(st.cT3 != null ? st.cT3 : st.runT),
                            endIndex: barIndex,
                            top: Math.max(pTop, pBot),
                            bottom: Math.min(pTop, pBot),
                            fillColor: pFirst ? st.firstFill : (pBull ? st.bullFill : st.bearFill),
                            tag: '',
                            tagged: false,
                            provisional: true
                        };
                    }
                }
            }
        }

        for (var i = 0; i < n; i++) {
            var bar = chartData[i];
            var dayKey = sessionDayKey(bar.t);
            var newDay = prevDayKey == null || dayKey !== prevDayKey;
            var isLast = i === n - 1;
            // Mirror Pine barstate.isconfirmed: only the forming (last) bar is unconfirmed.
            var isConfirmed = !isLast;

            if (newDay) {
                dayStartT = bar.t;
                if (p.showDayLn && prevDayKey != null) {
                    dayLines.push({
                        index: i,
                        color: p.cDayLn,
                        style: p.sDayLn,
                        width: Number(p.wDayLn) || 1
                    });
                    while (dayLines.length > Math.max(1, Number(p.keepDays) || 20)) dayLines.shift();
                }
                // GATE 3a — rollover sweep
                if (prevDayKey != null) {
                    while (live.length > 0) {
                        if (removeAtDayEnd) killAt(0);
                        else freezeAt(0, Math.max(0, i - 1));
                    }
                    for (var rsi = 0; rsi < streams.length; rsi++) resetStreamDay(streams[rsi]);
                }
                prevDayKey = dayKey;
            }

            for (var s = 0; s < streams.length; s++) {
                processStream(streams[s], bar, i, isConfirmed);
            }

            if (isConfirmed) {
                var j = live.length - 1;
                while (j >= 0) {
                    var b = live[j];
                    // GATE 3b — birth-day check
                    if (dayStartT != null && b.birthDay !== dayStartT) {
                        if (removeAtDayEnd) killAt(j);
                        else freezeAt(j, indexAtOrBefore(dayStartT));
                    } else {
                        var top = b.top;
                        var bot = b.bottom;
                        var mid = (top + bot) / 2;
                        var probe = b.dir === 1
                            ? (p.mitBy === 'close' ? bar.c : bar.l)
                            : (p.mitBy === 'close' ? bar.c : bar.h);
                        var lvl = String(p.mitDepth).indexOf('50') >= 0
                            ? mid
                            : (b.dir === 1 ? bot : top);
                        var mit = b.dir === 1 ? probe <= lvl : probe >= lvl;
                        if (mit) {
                            if (p.hideMit) killAt(j);
                            else freezeAt(j, i);
                        } else {
                            b.endIndex = i;
                        }
                    }
                    j--;
                }
                while (live.length > maxLive) freezeAt(0, live[0].endIndex);
            } else {
                for (var k = 0; k < live.length; k++) live[k].endIndex = i;
            }
        }

        var last = n - 1;
        var boxes = frozen.slice();
        live.forEach(function (b) {
            var endIdx = b.endIndex;
            if (b.tagged) endIdx = b.endIndex + (1 + (b.lane || 0)) * padBars;
            boxes.push({
                startIndex: b.startIndex,
                endIndex: endIdx,
                top: b.top,
                bottom: b.bottom,
                dir: b.dir,
                tagged: b.tagged,
                tag: b.tag,
                fillColor: b.fillColor,
                showMid: !!p.showMid,
                provisional: false
            });
        });

        var midLines = [];
        if (p.showMid) {
            boxes.forEach(function (box) {
                midLines.push({
                    startIndex: box.startIndex,
                    endIndex: Math.min(last, box.endIndex),
                    price: (box.top + box.bottom) / 2,
                    color: box.fillColor
                });
            });
        }

        var previews = [];
        streams.forEach(function (st) {
            if (st.preview) previews.push(st.preview);
        });

        return {
            boxes: boxes,
            dayLines: dayLines,
            midLines: midLines,
            previews: previews,
            txtColS: p.txtColS,
            txtSizeS: p.txtSizeS,
            padBars: padBars,
            chartMs: chartMs
        };
    }

    function lineDash(style) {
        if (style === 'dotted') return [2, 3];
        if (style === 'dashed') return [6, 4];
        return [];
    }

    function attachDraw() {
        if (!global.Chart || !global.Chart.prototype) return;
        var proto = global.Chart.prototype;
        // Always refresh draw hook so preview boxes / tag-lane extension apply.
        proto.drawTalariaFvg = function (data, style, startIndex, endIndex) {
            if (!data) return;
            var ctx = this.ctx;
            var m = this.margin;
            var n = this.data ? this.data.length : 0;
            endIndex = endIndex == null ? n : Math.min(endIndex, n);
            var plotLayout = typeof this._getMainPricePlotLayout === 'function'
                ? this._getMainPricePlotLayout() : null;
            var plotBottom = plotLayout ? plotLayout.plotBottom : (this.h - m.b);
            var plotTop = plotLayout ? plotLayout.plotTop : m.t;
            var barW = typeof this.getBarWidth === 'function' ? this.getBarWidth() : 6;

            if (data.dayLines && data.dayLines.length) {
                data.dayLines.forEach(function (dl) {
                    if (dl.index < startIndex || dl.index > endIndex) return;
                    var x = this.dataIndexToPixel(dl.index);
                    if (x < m.l || x > this.w - m.r) return;
                    ctx.save();
                    ctx.strokeStyle = dl.color || 'rgba(128,128,128,0.55)';
                    ctx.lineWidth = dl.width || 1;
                    ctx.setLineDash(lineDash(dl.style));
                    ctx.beginPath();
                    ctx.moveTo(x, plotTop);
                    ctx.lineTo(x, plotBottom);
                    ctx.stroke();
                    ctx.restore();
                }, this);
            }

            if (data.midLines && data.midLines.length) {
                data.midLines.forEach(function (ln) {
                    if (ln.endIndex < startIndex || ln.startIndex > endIndex) return;
                    var x1 = this.dataIndexToPixel(Math.max(ln.startIndex, startIndex));
                    var x2 = this.dataIndexToPixel(Math.min(ln.endIndex, endIndex));
                    var y = this.yScale(ln.price);
                    ctx.save();
                    ctx.strokeStyle = ln.color || 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                    ctx.stroke();
                    ctx.restore();
                }, this);
            }

            function drawBoxList(list, allowPastEnd) {
                if (!list || !list.length) return;
                var txtCol = data.txtColS === 'black' ? '#000000' : '#ffffff';
                var fontSize = data.txtSizeS === 'tiny' ? 9
                    : data.txtSizeS === 'normal' ? 12
                    : data.txtSizeS === 'large' ? 14 : 11;
                ctx.font = '500 ' + fontSize + 'px Roboto, system-ui, sans-serif';

                list.forEach(function (box) {
                    if (box.startIndex > endIndex) return;
                    if (box.endIndex < startIndex && box.endIndex < n) return;
                    var si = Math.max(0, box.startIndex);
                    var eiClamped = Math.min(n - 1, Math.max(si, Math.min(box.endIndex, n - 1)));
                    var x1 = this.dataIndexToPixel(si);
                    var x2 = this.dataIndexToPixel(eiClamped);
                    if (allowPastEnd && box.endIndex > n - 1) {
                        x2 += (box.endIndex - (n - 1)) * Math.max(2, barW);
                    }
                    var yTop = this.yScale(Math.max(box.top, box.bottom));
                    var yBot = this.yScale(Math.min(box.top, box.bottom));
                    if (x2 < m.l || x1 > this.w - m.r) return;
                    var drawX1 = Math.max(x1, m.l);
                    var drawX2 = Math.min(x2, this.w - m.r);
                    var w = drawX2 - drawX1;
                    var h = yBot - yTop;
                    if (w <= 0 || h <= 0) return;
                    ctx.fillStyle = box.fillColor || 'rgba(144,238,144,0.28)';
                    ctx.fillRect(drawX1, yTop, w, h);
                    if (box.tag) {
                        ctx.fillStyle = txtCol;
                        ctx.textAlign = 'right';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(box.tag, drawX2 - 4, yTop + h / 2);
                        ctx.textAlign = 'left';
                    }
                }, this);
            }

            drawBoxList.call(this, data.boxes, true);
            drawBoxList.call(this, data.previews, false);
        };
    }

    attachDraw();

    global.TalariaFvgIndicator = {
        defaultParams: defaultParams,
        calculate: calculateTalariaFvg
    };
})(typeof window !== 'undefined' ? window : this);
