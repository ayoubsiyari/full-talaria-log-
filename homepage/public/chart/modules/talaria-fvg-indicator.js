/**
 * Talaria — FVG (ported from Talaria_FVG.pine)
 * Multi-timeframe fair value gaps with session-day rules, fpFVG tags, and mitigation.
 */
(function (global) {
    'use strict';

    var TF_MS = {
        '1m': 60000, '2m': 120000, '3m': 180000, '4m': 240000, '5m': 300000,
        '10m': 600000, '15m': 900000, '30m': 1800000, '45m': 2700000,
        '1h': 3600000, '2h': 7200000, '4h': 14400000, '1d': 86400000
    };

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

    function indexAtOrBefore(times, t) {
        var lo = 0;
        var hi = times.length - 1;
        var ans = 0;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (times[mid] <= t) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return ans;
    }

    function dayKeyUtc(ms) {
        return new Date(ms).toISOString().slice(0, 10);
    }

    function computeAtrSeries(bars, len) {
        var n = bars.length;
        var out = new Array(n).fill(null);
        if (n < 2) return out;
        var tr = new Array(n).fill(0);
        for (var i = 1; i < n; i++) {
            var h = bars[i].h;
            var l = bars[i].l;
            var pc = bars[i - 1].c;
            tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
        var p = Math.max(1, Math.floor(len || 14));
        var sum = 0;
        var count = 0;
        for (var j = 1; j < n; j++) {
            sum += tr[j];
            count++;
            if (count < p) continue;
            if (count === p) {
                out[j] = sum / p;
            } else {
                out[j] = ((out[j - 1] * (p - 1)) + tr[j]) / p;
            }
        }
        return out;
    }

    function resampleOhlc(source, targetTf, resampleFn) {
        if (!Array.isArray(source) || !source.length) return [];
        if (typeof resampleFn === 'function') {
            try {
                var viaChart = resampleFn(source, targetTf);
                if (Array.isArray(viaChart) && viaChart.length) return viaChart;
            } catch (_) { /* fallback below */ }
        }
        var bucketMs = tfToMs(targetTf);
        if (!bucketMs) return source.slice();
        var out = [];
        var cur = null;
        for (var i = 0; i < source.length; i++) {
            var b = source[i];
            var t = Number(b.t);
            if (!Number.isFinite(t)) continue;
            var slot = Math.floor(t / bucketMs) * bucketMs;
            if (!cur || cur.t !== slot) {
                if (cur) out.push(cur);
                cur = { t: slot, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 };
            } else {
                cur.h = Math.max(cur.h, b.h);
                cur.l = Math.min(cur.l, b.l);
                cur.c = b.c;
                cur.v = (cur.v || 0) + (b.v || 0);
            }
        }
        if (cur) out.push(cur);
        return out;
    }

    function buildDailyOpens(bars) {
        var opens = [];
        var prev = null;
        for (var i = 0; i < bars.length; i++) {
            var dk = dayKeyUtc(bars[i].t);
            if (dk !== prev) {
                opens.push({ day: dk, time: bars[i].t, index: i });
                prev = dk;
            }
        }
        return opens;
    }

    function dayStartForTime(dailyOpens, t) {
        var ds = null;
        for (var i = 0; i < dailyOpens.length; i++) {
            if (dailyOpens[i].time <= t) ds = dailyOpens[i];
            else break;
        }
        return ds ? ds.time : null;
    }

    function processTfStream(cfg) {
        var bars = cfg.bars;
        var chartTimes = cfg.chartTimes;
        var mult = cfg.mult;
        var tagFirst = cfg.tagFirst;
        var tagAll = cfg.tagAll;
        var tfTag = cfg.tfTag;
        var dailyOpens = cfg.dailyOpens;
        var atr = computeAtrSeries(bars, cfg.atrLen);
        var events = [];
        var cT1 = null; var cH1 = null; var cL1 = null;
        var cT2 = null; var cH2 = null; var cL2 = null;
        var cT3 = null; var cH3 = null; var cL3 = null;
        var firstDoneByDay = Object.create(null);
        var prevT = null;
        for (var i = 1; i < bars.length; i++) {
            var sT = bars[i].t;
            var sH = bars[i].h;
            var sL = bars[i].l;
            var newSrc = prevT != null && sT !== prevT;
            prevT = sT;
            if (!newSrc || i < 1) continue;
            var compT = bars[i - 1].t;
            var compH = bars[i - 1].h;
            var compL = bars[i - 1].l;
            cT1 = cT2; cH1 = cH2; cL1 = cL2;
            cT2 = cT3; cH2 = cH3; cL2 = cL3;
            cT3 = compT; cH3 = compH; cL3 = compL;
            if (!cfg.enabled || !cfg.tfOk || cH1 == null) continue;
            var bullGap = cL3 > cH1;
            var bearGap = cH3 < cL1;
            var sz = bullGap ? (cL3 - cH1) : bearGap ? (cL1 - cH3) : null;
            var atrRef = atr[i - 1];
            var qual = sz != null && (mult === 0 || (atrRef != null && sz >= mult * atrRef));
            var dayStart = dayStartForTime(dailyOpens, cT3);
            var c1Today = dayStart != null && cT1 >= dayStart;
            var dayKey = dayStart != null ? dayKeyUtc(dayStart) : '';
            var isFirst = (bullGap || bearGap) && c1Today && !firstDoneByDay[dayKey] && tagFirst;
            if (isFirst) firstDoneByDay[dayKey] = true;
            var tg = isFirst ? ('fpFVG · ' + tfTag) : (tagAll && qual ? ('FVG · ' + tfTag) : '');
            // Gap is confirmed once candle-3 has fully closed; mitigation is only
            // judged on chart bars AFTER that — never on the pattern's own candles.
            var activateTime = cT3 + cfg.streamTfMs;
            if (bullGap && (qual || isFirst)) {
                events.push({
                    leftTime: cT2,
                    leftIndex: indexAtOrBefore(chartTimes, cT2),
                    activateTime: activateTime,
                    top: cL3,
                    bottom: cH1,
                    dir: 1,
                    tagged: tg !== '',
                    tag: tg,
                    isFirst: isFirst,
                    fillKey: isFirst ? 'first' : 'bull'
                });
            }
            if (bearGap && (qual || isFirst)) {
                events.push({
                    leftTime: cT2,
                    leftIndex: indexAtOrBefore(chartTimes, cT2),
                    activateTime: activateTime,
                    top: cL1,
                    bottom: cH3,
                    dir: -1,
                    tagged: tg !== '',
                    tag: tg,
                    isFirst: isFirst,
                    fillKey: isFirst ? 'first' : 'bear'
                });
            }
        }
        return events;
    }

    function defaultParams() {
        return {
            showDayLn: true,
            cDayLn: 'rgba(128,128,128,0.55)',
            sDayLn: 'dashed',
            wDayLn: 1,
            keepDays: 20,
            atrLen: 14,
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

    function calculateTalariaFvg(data, params, ctx) {
        var p = mergeParams(params);
        var chartData = Array.isArray(data) ? data : [];
        var n = chartData.length;
        if (n < 3) return { boxes: [], dayLines: [], midLines: [] };

        var chartTf = ctx && ctx.currentTimeframe ? ctx.currentTimeframe : '5m';
        var chartMs = tfToMs(chartTf);
        var isIntraday = chartMs < tfToMs('1d');
        if (!isIntraday) return { boxes: [], dayLines: [], midLines: [] };

        var source = (ctx && Array.isArray(ctx.rawData) && ctx.rawData.length) ? ctx.rawData : chartData;
        var resampleFn = ctx && ctx.resample;
        var chartTimes = new Array(n);
        for (var ti = 0; ti < n; ti++) chartTimes[ti] = chartData[ti].t;

        var dailyBars = resampleOhlc(source, '1d', resampleFn);
        var dailyOpens = buildDailyOpens(dailyBars);

        var ok5 = chartMs <= tfToMs('5m');
        var ok15 = chartMs <= tfToMs('15m');
        var ok30 = chartMs <= tfToMs('30m');

        var streams = [];
        if (p.on5 && ok5) {
            streams.push(processTfStream({
                enabled: true, tfOk: true, bars: resampleOhlc(source, '5m', resampleFn),
                chartTimes: chartTimes, mult: Number(p.mult5) || 0, tagFirst: false, tagAll: false,
                tfTag: '5m', dailyOpens: dailyOpens, atrLen: p.atrLen, streamTfMs: tfToMs('5m'),
                bullFill: p.cB5f, bearFill: p.cR5f, firstFill: p.cF15
            }));
        }
        if (p.on15 && ok15) {
            streams.push(processTfStream({
                enabled: true, tfOk: true, bars: resampleOhlc(source, '15m', resampleFn),
                chartTimes: chartTimes, mult: Number(p.mult15) || 0, tagFirst: !!p.first15, tagAll: true,
                tfTag: '15m', dailyOpens: dailyOpens, atrLen: p.atrLen, streamTfMs: tfToMs('15m'),
                bullFill: p.cB15f, bearFill: p.cR15f, firstFill: p.cF15
            }));
        }
        if (p.on30 && ok30) {
            streams.push(processTfStream({
                enabled: true, tfOk: true, bars: resampleOhlc(source, '30m', resampleFn),
                chartTimes: chartTimes, mult: Number(p.mult30) || 0, tagFirst: !!p.first30, tagAll: true,
                tfTag: '30m', dailyOpens: dailyOpens, atrLen: p.atrLen, streamTfMs: tfToMs('30m'),
                bullFill: p.cB30f, bearFill: p.cR30f, firstFill: p.cF30
            }));
        }

        var spawns = [];
        streams.forEach(function (evs) {
            evs.forEach(function (e) { spawns.push(e); });
        });
        // Activate boxes in the order their gap candles close.
        spawns.sort(function (a, b) {
            return a.activateTime - b.activateTime || a.leftIndex - b.leftIndex;
        });

        var live = [];
        var boxes = [];
        var dayLines = [];
        var midLines = [];
        var removeAtDayEnd = String(p.dayEnd).indexOf('remove') >= 0;
        var maxLive = Math.max(10, Math.min(400, Number(p.maxLive) || 150));
        var laneCounter = 0;

        function killAt(idx) {
            live.splice(idx, 1);
        }

        function freezeBox(b, rightIndex) {
            boxes.push({
                startIndex: b.startIndex,
                endIndex: rightIndex,
                top: b.top,
                bottom: b.bottom,
                dir: b.dir,
                tagged: b.tagged,
                tag: b.tag,
                fillColor: b.fillColor,
                showMid: !!p.showMid
            });
            if (p.showMid) {
                midLines.push({
                    startIndex: b.startIndex,
                    endIndex: rightIndex,
                    price: (b.top + b.bottom) / 2,
                    color: b.fillColor
                });
            }
        }

        function spawnBox(ev, spawnIndex) {
            var fill;
            if (ev.isFirst) {
                fill = ev.tag.indexOf('30m') >= 0 ? p.cF30 : p.cF15;
            } else if (ev.dir === 1) {
                fill = ev.tag.indexOf('30m') >= 0 ? p.cB30f : ev.tag.indexOf('15m') >= 0 ? p.cB15f : p.cB5f;
            } else {
                fill = ev.tag.indexOf('30m') >= 0 ? p.cR30f : ev.tag.indexOf('15m') >= 0 ? p.cR15f : p.cR5f;
            }
            live.push({
                startIndex: Math.max(0, ev.leftIndex),
                endIndex: spawnIndex,
                top: Math.max(ev.top, ev.bottom),
                bottom: Math.min(ev.top, ev.bottom),
                dir: ev.dir,
                tagged: ev.tagged,
                tag: ev.tag,
                fillColor: fill,
                lane: ev.tagged ? (laneCounter++ % 5) : 0
            });
        }

        var spawnPtr = 0;
        var prevDay = dayKeyUtc(chartData[0].t);
        for (var i = 0; i < n; i++) {
            var dk = dayKeyUtc(chartData[i].t);
            if (dk !== prevDay) {
                if (p.showDayLn) {
                    dayLines.push({ index: i, color: p.cDayLn, style: p.sDayLn, width: Number(p.wDayLn) || 1 });
                    if (dayLines.length > Math.max(1, Number(p.keepDays) || 20)) dayLines.shift();
                }
                var li = live.length - 1;
                while (li >= 0) {
                    if (removeAtDayEnd) killAt(li);
                    else {
                        freezeBox(live[li], Math.max(0, i - 1));
                        killAt(li);
                    }
                    li--;
                }
                prevDay = dk;
            }

            // Box goes live only once its gap candle has closed (activateTime),
            // so the pattern's own candles can never self-mitigate it.
            while (spawnPtr < spawns.length && chartData[i].t >= spawns[spawnPtr].activateTime) {
                spawnBox(spawns[spawnPtr], i);
                spawnPtr++;
            }

            var j = live.length - 1;
            while (j >= 0) {
                var b = live[j];
                var top = b.top;
                var bot = b.bottom;
                var mid = (top + bot) / 2;
                var probe = b.dir === 1
                    ? (p.mitBy === 'close' ? chartData[i].c : chartData[i].l)
                    : (p.mitBy === 'close' ? chartData[i].c : chartData[i].h);
                var lvl = String(p.mitDepth).indexOf('50') >= 0 ? mid : (b.dir === 1 ? bot : top);
                var mit = b.dir === 1 ? probe <= lvl : probe >= lvl;
                if (mit) {
                    if (p.hideMit) killAt(j);
                    else {
                        freezeBox(b, i);
                        killAt(j);
                    }
                } else {
                    b.endIndex = i;
                }
                j--;
            }

            while (live.length > maxLive) {
                freezeBox(live[0], live[0].endIndex);
                live.shift();
            }
        }

        var last = n - 1;
        var padMs = (Number(p.padBars) || 10) * chartMs;
        live.forEach(function (b) {
            var endIdx = b.endIndex;
            if (b.tagged) {
                var extraBars = (1 + (b.lane || 0)) * (Number(p.padBars) || 10);
                endIdx = Math.min(last, b.endIndex + extraBars);
            }
            boxes.push({
                startIndex: b.startIndex,
                endIndex: endIdx,
                top: b.top,
                bottom: b.bottom,
                dir: b.dir,
                tagged: b.tagged,
                tag: b.tag,
                fillColor: b.fillColor,
                showMid: !!p.showMid
            });
            if (p.showMid) {
                midLines.push({
                    startIndex: b.startIndex,
                    endIndex: endIdx,
                    price: (b.top + b.bottom) / 2,
                    color: b.fillColor
                });
            }
        });

        return {
            boxes: boxes,
            dayLines: dayLines,
            midLines: midLines,
            txtColS: p.txtColS,
            txtSizeS: p.txtSizeS
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
        if (proto.drawTalariaFvg) return;

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

            if (!data.boxes || !data.boxes.length) return;
            var txtCol = data.txtColS === 'black' ? '#000000' : '#ffffff';
            var fontSize = data.txtSizeS === 'tiny' ? 9 : data.txtSizeS === 'normal' ? 12 : data.txtSizeS === 'large' ? 14 : 11;
            ctx.font = '500 ' + fontSize + 'px Roboto, system-ui, sans-serif';

            data.boxes.forEach(function (box) {
                if (box.endIndex < startIndex || box.startIndex > endIndex) return;
                var si = Math.max(0, box.startIndex);
                var ei = Math.min(n - 1, box.endIndex);
                var x1 = this.dataIndexToPixel(si);
                var x2 = this.dataIndexToPixel(ei);
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
        };
    }

    attachDraw();

    global.TalariaFvgIndicator = {
        defaultParams: defaultParams,
        calculate: calculateTalariaFvg
    };
})(typeof window !== 'undefined' ? window : this);
