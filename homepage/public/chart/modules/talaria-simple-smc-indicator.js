/**
 * Talaria — Simple SMC (ported from Simple SMC Indicator Pine v5 © sunwoo101)
 * Fractals, liquidity sweeps, MSS, FVG boxes, and NY-session backgrounds.
 *
 * Perf: recent-bar window, wall-clock minute cache, capped geometry, replay-lite
 * draw (no labels / thinner primitives) so 60x play stays responsive.
 */
(function (global) {
    'use strict';

    // Geometry caps — keep draw cost bounded during pan/replay.
    var MAX_LINES = 80;
    var MAX_BOXES = 100;
    var MAX_LABELS = 50;
    var MAX_MARKERS = 120;
    var MAX_BANDS = 60;

    // Only scan the recent window (full history every bar advance freezes replay).
    var MAX_CALC_BARS = 3000;
    // Cap MSS extreme search so a stale fractal cannot become O(n²).
    var MAX_MSS_SPAN = 250;

    var _timeFmtCache = Object.create(null);
    // Persist across recalcs: replay only needs one new minute lookup per bar.
    var _wallCache = { tz: '', map: Object.create(null), size: 0 };

    function _timeFmt(tz) {
        var key = tz || 'America/New_York';
        if (!_timeFmtCache[key]) {
            _timeFmtCache[key] = new Intl.DateTimeFormat('en-GB', {
                timeZone: key, hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
        return _timeFmtCache[key];
    }

    function parseHm(str) {
        var s = String(str || '').trim();
        if (!s) return 0;
        if (s.indexOf(':') >= 0) {
            var parts = s.split(':');
            return parseInt(parts[0], 10) + (parseInt(parts[1] || '0', 10) / 60);
        }
        if (/^\d{3,4}$/.test(s)) {
            var padded = s.length === 3 ? ('0' + s) : s;
            return parseInt(padded.slice(0, 2), 10) + parseInt(padded.slice(2), 10) / 60;
        }
        var n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
    }

    function parseSessionRange(str) {
        var s = String(str || '2100-0100').trim();
        var m = s.match(/^(\d{1,2}:?\d{2})\s*-\s*(\d{1,2}:?\d{2})$/);
        if (m) return { start: parseHm(m[1]), end: parseHm(m[2]) };
        var parts = s.split('-');
        return { start: parseHm(parts[0]), end: parseHm(parts[1] || parts[0]) };
    }

    function wallDecimalRaw(ms, tz) {
        try {
            var parts = _timeFmt(tz).formatToParts(new Date(ms));
            var h = 0; var min = 0;
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
                else if (parts[i].type === 'minute') min = parseInt(parts[i].value, 10);
            }
            return h + min / 60;
        } catch (_) {
            var d = new Date(ms);
            return d.getUTCHours() + d.getUTCMinutes() / 60;
        }
    }

    function wallDecimal(ms, tz) {
        var keyTz = tz || 'America/New_York';
        var minute = Math.floor(Number(ms) / 60000);
        if (!Number.isFinite(minute)) return 0;
        if (_wallCache.tz !== keyTz) {
            _wallCache.tz = keyTz;
            _wallCache.map = Object.create(null);
            _wallCache.size = 0;
        }
        var hit = _wallCache.map[minute];
        if (hit != null) return hit;
        if (_wallCache.size > 24000) {
            _wallCache.map = Object.create(null);
            _wallCache.size = 0;
        }
        var v = wallDecimalRaw(ms, keyTz);
        _wallCache.map[minute] = v;
        _wallCache.size++;
        return v;
    }

    function inWindow(dec, start, end) {
        if (start <= end) return dec >= start && dec < end;
        return dec >= start || dec < end;
    }

    /** Pine color.new(c, transparency) → CSS rgba (transparency 0=opaque, 100=invisible). */
    function pineTrans(color, transparency) {
        var op = Math.max(0, Math.min(1, 1 - (Number(transparency) || 0) / 100));
        var s = String(color || '#ffffff').trim();
        if (s.indexOf('rgba') === 0) {
            var mA = s.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)/);
            if (mA) return 'rgba(' + mA[1] + ',' + mA[2] + ',' + mA[3] + ',' + op + ')';
            return s;
        }
        if (s.indexOf('rgb(') === 0) {
            var m = s.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + op + ')';
        }
        var named = {
            white: '#ffffff', black: '#000000', blue: '#2962ff', red: '#f23645',
            purple: '#9c27b0', yellow: '#ffeb3b', orange: '#ff9800'
        };
        if (named[s.toLowerCase()]) s = named[s.toLowerCase()];
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
            onlyDrawInSession: false,
            drawFractals: true,
            fractalPeriod: 2,
            fractalHighColor: 'rgba(255,255,255,0.5)',
            fractalLowColor: 'rgba(255,255,255,0.5)',
            drawLQSweeps: true,
            sweepColor: '#ffffff',
            drawMSS: true,
            bullishMSSColor: '#2962ff',
            bearishMSSColor: '#f23645',
            drawFVG: true,
            bullishFVGColor: 'rgba(255,255,255,0.5)',
            bearishFVGColor: 'rgba(255,255,255,0.5)',
            alertName: '1m XAUUSD',
            sweepAlerts: true,
            MSSAlerts: true,
            FVGAlerts: true,
            drawSession1: true,
            session1: '2100-0100',
            session1Color: pineTrans('#9c27b0', 80),
            drawSession2: true,
            session2: '0300-0600',
            session2Color: pineTrans('#ffeb3b', 80),
            drawSession3: true,
            session3: '0800-1000',
            session3Color: pineTrans('#2962ff', 80),
            drawSession4: true,
            session4: '1100-1300',
            session4Color: pineTrans('#ff9800', 80),
            tzStr: 'America/New_York'
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

    function trimTail(arr, max) {
        if (arr.length > max) return arr.slice(arr.length - max);
        return arr;
    }

    function calculateTalariaSimpleSmc(data, params, ctx) {
        var p = mergeParams(params);
        var bars = Array.isArray(data) ? data : [];
        var n = bars.length;
        var empty = { bands: [], lines: [], boxes: [], markers: [], labels: [], lite: false };
        if (n < 5) return empty;

        var replayPlaying = !!(ctx && ctx.replayPlaying);
        // During play: fewer primitives so 60x stays smooth — keep labels visible.
        var maxLines = replayPlaying ? 40 : MAX_LINES;
        var maxBoxes = replayPlaying ? 50 : MAX_BOXES;
        var maxLabels = replayPlaying ? 40 : MAX_LABELS;
        var maxMarkers = replayPlaying ? 60 : MAX_MARKERS;
        var maxBands = replayPlaying ? 30 : MAX_BANDS;
        var maxBars = replayPlaying ? 2000 : MAX_CALC_BARS;

        var nPer = Math.max(1, Math.min(20, Math.floor(Number(p.fractalPeriod) || 2)));
        var tz = p.tzStr || 'America/New_York';
        var s1 = parseSessionRange(p.session1);
        var s2 = parseSessionRange(p.session2);
        var s3 = parseSessionRange(p.session3);
        var s4 = parseSessionRange(p.session4);

        var bands = [];
        var lines = [];
        var boxes = [];
        var markers = [];
        var labels = [];

        var fractalHighBarIndex = null;
        var fractalLowBarIndex = null;
        var bullishMSSTargetBarIndex = null;
        var bearishMSSTargetBarIndex = null;

        var bandStart = null;
        var bandColor = null;

        function flushBand(endIdx) {
            if (bandStart == null || bandColor == null) return;
            bands.push({
                startIndex: bandStart,
                endIndex: Math.max(bandStart, endIdx),
                color: bandColor
            });
            bandStart = null;
            bandColor = null;
        }

        // Scan only recent window — indices stay absolute (start at offset).
        var offset = Math.max(0, n - maxBars);
        var startI = offset + 2 * nPer;

        function isFractalHigh(i, c) {
            var peak = bars[c].h;
            var k;
            for (k = 1; k <= nPer; k++) {
                if (!(bars[c + k].h < peak)) return false;
            }
            var f0 = true;
            var f1 = true;
            var f2 = true;
            var f3 = true;
            var f4 = true;
            for (k = 1; k <= nPer; k++) {
                if (c - k < 0 || !(bars[c - k].h < peak)) f0 = false;
                if (c - 1 < 0 || bars[c - 1].h > peak || c - k - 1 < 0 || !(bars[c - k - 1].h < peak)) f1 = false;
                if (c - 1 < 0 || bars[c - 1].h > peak || c - 2 < 0 || bars[c - 2].h > peak
                    || c - k - 2 < 0 || !(bars[c - k - 2].h < peak)) f2 = false;
                if (c - 1 < 0 || bars[c - 1].h > peak || c - 2 < 0 || bars[c - 2].h > peak
                    || c - 3 < 0 || bars[c - 3].h > peak
                    || c - k - 3 < 0 || !(bars[c - k - 3].h < peak)) f3 = false;
                if (c - 1 < 0 || bars[c - 1].h > peak || c - 2 < 0 || bars[c - 2].h > peak
                    || c - 3 < 0 || bars[c - 3].h > peak || c - 4 < 0 || bars[c - 4].h > peak
                    || c - k - 4 < 0 || !(bars[c - k - 4].h < peak)) f4 = false;
            }
            return f0 || f1 || f2 || f3 || f4;
        }

        function isFractalLow(i, c) {
            var trough = bars[c].l;
            var k;
            for (k = 1; k <= nPer; k++) {
                if (!(bars[c + k].l > trough)) return false;
            }
            var f0 = true;
            var f1 = true;
            var f2 = true;
            var f3 = true;
            var f4 = true;
            for (k = 1; k <= nPer; k++) {
                if (c - k < 0 || !(bars[c - k].l > trough)) f0 = false;
                if (c - 1 < 0 || bars[c - 1].l < trough || c - k - 1 < 0 || !(bars[c - k - 1].l > trough)) f1 = false;
                if (c - 1 < 0 || bars[c - 1].l < trough || c - 2 < 0 || bars[c - 2].l < trough
                    || c - k - 2 < 0 || !(bars[c - k - 2].l > trough)) f2 = false;
                if (c - 1 < 0 || bars[c - 1].l < trough || c - 2 < 0 || bars[c - 2].l < trough
                    || c - 3 < 0 || bars[c - 3].l < trough
                    || c - k - 3 < 0 || !(bars[c - k - 3].l > trough)) f3 = false;
                if (c - 1 < 0 || bars[c - 1].l < trough || c - 2 < 0 || bars[c - 2].l < trough
                    || c - 3 < 0 || bars[c - 3].l < trough || c - 4 < 0 || bars[c - 4].l < trough
                    || c - k - 4 < 0 || !(bars[c - k - 4].l > trough)) f4 = false;
            }
            return f0 || f1 || f2 || f3 || f4;
        }

        for (var i = offset; i < n; i++) {
            var dec = wallDecimal(bars[i].t, tz);
            var isSession1 = inWindow(dec, s1.start, s1.end);
            var isSession2 = inWindow(dec, s2.start, s2.end);
            var isSession3 = inWindow(dec, s3.start, s3.end);
            var isSession4 = inWindow(dec, s4.start, s4.end);

            var bg = null;
            if (isSession1) bg = p.session1Color;
            else if (isSession2) bg = p.session2Color;
            else if (isSession3) bg = p.session3Color;
            else if (isSession4) bg = p.session4Color;

            var drawSession = (isSession1 && p.drawSession1)
                || (isSession2 && p.drawSession2)
                || (isSession3 && p.drawSession3)
                || (isSession4 && p.drawSession4);

            if (bg && drawSession) {
                if (bandStart == null || bandColor !== bg) {
                    flushBand(i - 1);
                    bandStart = i;
                    bandColor = bg;
                }
            } else {
                flushBand(i - 1);
            }

            var sessionDraw = !p.onlyDrawInSession || (p.onlyDrawInSession && drawSession);

            if (i < startI) continue;

            // Drop stale pending levels so MSS search never scans unbounded history.
            if (fractalHighBarIndex != null && i - fractalHighBarIndex > MAX_MSS_SPAN) {
                fractalHighBarIndex = null;
            }
            if (fractalLowBarIndex != null && i - fractalLowBarIndex > MAX_MSS_SPAN) {
                fractalLowBarIndex = null;
            }
            if (bearishMSSTargetBarIndex != null && i - bearishMSSTargetBarIndex > MAX_MSS_SPAN) {
                bearishMSSTargetBarIndex = null;
            }
            if (bullishMSSTargetBarIndex != null && i - bullishMSSTargetBarIndex > MAX_MSS_SPAN) {
                bullishMSSTargetBarIndex = null;
            }

            var c = i - nPer;
            var highFound = isFractalHigh(i, c);
            var lowFound = isFractalLow(i, c);

            if (highFound) {
                fractalHighBarIndex = c;
                if (p.drawFractals && sessionDraw) {
                    markers.push({
                        index: c,
                        price: bars[c].h,
                        dir: 'down',
                        color: p.fractalHighColor
                    });
                }
            }
            if (lowFound) {
                fractalLowBarIndex = c;
                if (p.drawFractals && sessionDraw) {
                    markers.push({
                        index: c,
                        price: bars[c].l,
                        dir: 'up',
                        color: p.fractalLowColor
                    });
                }
            }

            // BSL sweep
            if (fractalHighBarIndex != null) {
                var fh = fractalHighBarIndex;
                var fhPrice = bars[fh].h;
                if (bars[i].h > fhPrice) {
                    if (p.drawLQSweeps && sessionDraw) {
                        lines.push({
                            startIndex: fh, endIndex: i, price: fhPrice,
                            color: p.sweepColor, width: 1
                        });
                        if (maxLabels > 0) {
                            labels.push({
                                index: fh, price: fhPrice, text: 'Swept',
                                color: p.sweepColor, yloc: 'above'
                            });
                        }
                    }
                    var lowestLowOffset = 1;
                    var span = Math.min(i - fh, MAX_MSS_SPAN);
                    for (var bi = 1; bi <= span; bi++) {
                        if (bars[i - bi].l < bars[i - lowestLowOffset].l) lowestLowOffset = bi;
                    }
                    bearishMSSTargetBarIndex = i - lowestLowOffset;
                    fractalHighBarIndex = null;
                }
            }

            // SSL sweep
            if (fractalLowBarIndex != null) {
                var fl = fractalLowBarIndex;
                var flPrice = bars[fl].l;
                if (bars[i].l < flPrice) {
                    if (p.drawLQSweeps && sessionDraw) {
                        lines.push({
                            startIndex: fl, endIndex: i, price: flPrice,
                            color: p.sweepColor, width: 1
                        });
                        if (maxLabels > 0) {
                            labels.push({
                                index: fl, price: flPrice, text: 'Swept',
                                color: p.sweepColor, yloc: 'below'
                            });
                        }
                    }
                    var highestHighOffset = 1;
                    var spanL = Math.min(i - fl, MAX_MSS_SPAN);
                    for (var si = 1; si <= spanL; si++) {
                        if (bars[i - si].h > bars[i - highestHighOffset].h) highestHighOffset = si;
                    }
                    bullishMSSTargetBarIndex = i - highestHighOffset;
                    fractalLowBarIndex = null;
                }
            }

            // Bearish MSS
            if (bearishMSSTargetBarIndex != null) {
                var bt = bearishMSSTargetBarIndex;
                var btPrice = bars[bt].l;
                if (bars[i].c < btPrice) {
                    if (p.drawMSS && sessionDraw) {
                        lines.push({
                            startIndex: bt, endIndex: i, price: btPrice,
                            color: p.bearishMSSColor, width: 2
                        });
                        if (maxLabels > 0) {
                            labels.push({
                                index: i, price: bars[i].h, text: 'MSS',
                                color: p.bearishMSSColor, yloc: 'above'
                            });
                        }
                    }
                    bearishMSSTargetBarIndex = null;
                }
            }

            // Bullish MSS
            if (bullishMSSTargetBarIndex != null) {
                var ut = bullishMSSTargetBarIndex;
                var utPrice = bars[ut].h;
                if (bars[i].c > utPrice) {
                    if (p.drawMSS && sessionDraw) {
                        lines.push({
                            startIndex: ut, endIndex: i, price: utPrice,
                            color: p.bullishMSSColor, width: 2
                        });
                        if (maxLabels > 0) {
                            labels.push({
                                index: i, price: bars[i].l, text: 'MSS',
                                color: p.bullishMSSColor, yloc: 'below'
                            });
                        }
                    }
                    bullishMSSTargetBarIndex = null;
                }
            }

            // FVG
            if (i >= 2 && sessionDraw && p.drawFVG) {
                if (bars[i].l > bars[i - 2].h && bars[i - 1].c > bars[i - 1].o) {
                    boxes.push({
                        startIndex: i - 2, endIndex: i,
                        top: bars[i].l, bottom: bars[i - 2].h,
                        fill: p.bullishFVGColor,
                        border: p.bullishFVGColor
                    });
                }
                if (bars[i].h < bars[i - 2].l && bars[i - 1].c < bars[i - 1].o) {
                    boxes.push({
                        startIndex: i - 2, endIndex: i,
                        top: bars[i].h, bottom: bars[i - 2].l,
                        fill: p.bearishFVGColor,
                        border: p.bearishFVGColor
                    });
                }
            }
        }

        flushBand(n - 1);

        return {
            bands: trimTail(bands, maxBands),
            lines: trimTail(lines, maxLines),
            boxes: trimTail(boxes, maxBoxes),
            markers: trimTail(markers, maxMarkers),
            labels: trimTail(labels, maxLabels),
            lite: replayPlaying
        };
    }

    function attachDraw() {
        if (!global.Chart || !global.Chart.prototype) return;
        var proto = global.Chart.prototype;
        if (proto.drawTalariaSimpleSmc) return;

        proto.drawTalariaSimpleSmc = function (data, style, startIndex, endIndex) {
            if (!data) return;
            var ctx = this.ctx;
            var m = this.margin;
            var n = this.data ? this.data.length : 0;
            endIndex = endIndex == null ? n : Math.min(endIndex, n);
            var plotLayout = typeof this._getMainPricePlotLayout === 'function'
                ? this._getMainPricePlotLayout() : null;
            var plotTop = plotLayout ? plotLayout.plotTop : m.t;
            var plotBottom = plotLayout ? plotLayout.plotBottom : (this.h - m.b);
            var plotL = m.l;
            var plotR = this.w - m.r;
            var lite = !!data.lite;
            var barW = typeof this.getBarWidth === 'function' ? this.getBarWidth() : 6;
            var halfW = Math.max(1, barW * 0.5);

            // Session backgrounds
            if (data.bands && data.bands.length) {
                for (var bi = 0; bi < data.bands.length; bi++) {
                    var bd = data.bands[bi];
                    if (bd.endIndex < startIndex || bd.startIndex > endIndex) continue;
                    var x1 = this.dataIndexToPixel(Math.max(bd.startIndex, startIndex));
                    var x2 = this.dataIndexToPixel(Math.min(bd.endIndex, endIndex)) + halfW;
                    if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
                    var left = Math.max(x1, plotL);
                    var right = Math.min(x2, plotR);
                    if (right <= left) continue;
                    ctx.fillStyle = bd.color || 'rgba(41,98,255,0.1)';
                    ctx.fillRect(left, plotTop, right - left, plotBottom - plotTop);
                }
            }

            // FVG boxes (skip border stroke while playing — fill is enough)
            if (data.boxes && data.boxes.length) {
                for (var xi = 0; xi < data.boxes.length; xi++) {
                    var bx = data.boxes[xi];
                    if (bx.endIndex < startIndex || bx.startIndex > endIndex) continue;
                    var bx1 = this.dataIndexToPixel(Math.max(bx.startIndex, startIndex));
                    var bx2 = this.dataIndexToPixel(Math.min(bx.endIndex, endIndex));
                    var yT = this.yScale(Math.max(bx.top, bx.bottom));
                    var yB = this.yScale(Math.min(bx.top, bx.bottom));
                    var leftB = Math.max(bx1, plotL);
                    var rightB = Math.min(bx2, plotR);
                    if (rightB <= leftB || yB <= yT) continue;
                    ctx.fillStyle = bx.fill || 'rgba(255,255,255,0.5)';
                    ctx.fillRect(leftB, yT, rightB - leftB, yB - yT);
                    if (!lite && bx.border) {
                        ctx.strokeStyle = bx.border;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(leftB + 0.5, yT + 0.5, rightB - leftB - 1, yB - yT - 1);
                    }
                }
            }

            // Sweep / MSS lines — no save/restore per segment
            if (data.lines && data.lines.length) {
                ctx.setLineDash([]);
                for (var li = 0; li < data.lines.length; li++) {
                    var ln = data.lines[li];
                    if (ln.endIndex < startIndex || ln.startIndex > endIndex) continue;
                    var y = this.yScale(ln.price);
                    if (y < plotTop - 2 || y > plotBottom + 2) continue;
                    var lx1 = this.dataIndexToPixel(Math.max(ln.startIndex, startIndex));
                    var lx2 = this.dataIndexToPixel(Math.min(ln.endIndex, endIndex));
                    if (lx2 < plotL || lx1 > plotR) continue;
                    ctx.strokeStyle = ln.color || '#ffffff';
                    ctx.lineWidth = ln.width || 1;
                    ctx.beginPath();
                    ctx.moveTo(Math.max(lx1, plotL), y);
                    ctx.lineTo(Math.min(lx2, plotR), y);
                    ctx.stroke();
                }
            }

            // Fractal markers
            if (data.markers && data.markers.length) {
                var size = 4;
                for (var mi = 0; mi < data.markers.length; mi++) {
                    var mk = data.markers[mi];
                    if (mk.index < startIndex || mk.index > endIndex) continue;
                    var mx = this.dataIndexToPixel(mk.index);
                    var my = this.yScale(mk.price);
                    if (mx < plotL || mx > plotR || my < plotTop || my > plotBottom) continue;
                    ctx.fillStyle = mk.color || 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    if (mk.dir === 'down') {
                        var ty = my - 6;
                        ctx.moveTo(mx, ty + size);
                        ctx.lineTo(mx - size, ty - size * 0.5);
                        ctx.lineTo(mx + size, ty - size * 0.5);
                    } else {
                        var by = my + 6;
                        ctx.moveTo(mx, by - size);
                        ctx.lineTo(mx - size, by + size * 0.5);
                        ctx.lineTo(mx + size, by + size * 0.5);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // Labels (Swept / MSS) — always draw when present; lite only skips FVG borders
            if (data.labels && data.labels.length) {
                ctx.font = lite
                    ? '500 10px Roboto, system-ui, sans-serif'
                    : '500 11px Roboto, system-ui, sans-serif';
                ctx.textAlign = 'center';
                for (var ti = 0; ti < data.labels.length; ti++) {
                    var lb = data.labels[ti];
                    if (lb.index < startIndex || lb.index > endIndex) continue;
                    var tx = this.dataIndexToPixel(lb.index);
                    var ty2 = this.yScale(lb.price);
                    if (tx < plotL || tx > plotR) continue;
                    ctx.fillStyle = lb.color || '#ffffff';
                    ctx.textBaseline = lb.yloc === 'below' ? 'top' : 'bottom';
                    ctx.fillText(lb.text || '', tx, ty2 + (lb.yloc === 'below' ? 8 : -8));
                }
            }
        };
    }

    function tryAttach() {
        attachDraw();
        if (global.Chart && global.Chart.prototype && global.Chart.prototype.drawTalariaSimpleSmc) return;
        if (typeof global.setTimeout === 'function') {
            global.setTimeout(tryAttach, 50);
        }
    }

    tryAttach();

    global.TalariaSimpleSmcIndicator = {
        defaultParams: defaultParams,
        calculate: calculateTalariaSimpleSmc
    };
})(typeof window !== 'undefined' ? window : this);
