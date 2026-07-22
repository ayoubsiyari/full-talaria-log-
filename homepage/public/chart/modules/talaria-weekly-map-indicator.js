/**
 * Talaria — Weekly Map (ported from Talaria_Weekly_Map_v2_3 / v2.4 pine)
 * Fixed 1h engine: PWH/PWL/mid, weekend gap, Friday range, weekly open, OWR + info box.
 */
(function (global) {
    'use strict';

    var HOUR_MS = 3600000;
    var PINE_SUN = 1;
    var PINE_THU = 5;

    var _partsFmtCache = Object.create(null);
    function _partsFmt(tz) {
        var key = tz || 'America/New_York';
        if (!_partsFmtCache[key]) {
            _partsFmtCache[key] = new Intl.DateTimeFormat('en-US', {
                timeZone: key,
                year: 'numeric', month: '2-digit', day: '2-digit',
                weekday: 'short',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        }
        return _partsFmtCache[key];
    }

    function wallParts(ms, tz) {
        var out = { y: 1970, m: 1, d: 1, h: 0, min: 0, dow: PINE_SUN };
        try {
            var parts = _partsFmt(tz).formatToParts(new Date(ms));
            var wd = '';
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p.type === 'year') out.y = parseInt(p.value, 10);
                else if (p.type === 'month') out.m = parseInt(p.value, 10);
                else if (p.type === 'day') out.d = parseInt(p.value, 10);
                else if (p.type === 'hour') out.h = parseInt(p.value, 10) % 24;
                else if (p.type === 'minute') out.min = parseInt(p.value, 10);
                else if (p.type === 'weekday') wd = p.value;
            }
            // Pine dayofweek: Sun=1 … Sat=7
            var map = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
            out.dow = map[wd] || PINE_SUN;
        } catch (_) {
            var d = new Date(ms);
            out.y = d.getUTCFullYear();
            out.m = d.getUTCMonth() + 1;
            out.d = d.getUTCDate();
            out.h = d.getUTCHours();
            out.min = d.getUTCMinutes();
            out.dow = d.getUTCDay() + 1;
        }
        return out;
    }

    function fadeColor(hexOrRgb, opacityPct) {
        var op = Math.max(0, Math.min(100, Number(opacityPct) || 100)) / 100;
        var s = String(hexOrRgb || '#ffffff').trim();
        if (s.indexOf('rgba') === 0) {
            var mA = s.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)/);
            if (mA) return 'rgba(' + mA[1] + ',' + mA[2] + ',' + mA[3] + ',' + op + ')';
            return s;
        }
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

    /** Pine color.new(c, transparency) → CSS with remaining opacity. */
    function pineTrans(color, transparency) {
        return fadeColor(color, 100 - (Number(transparency) || 0));
    }

    function defaultParams() {
        return {
            tzStr: 'America/New_York',
            dayShift: 6,
            avgWeeks: 14,
            rNarrowX: 0.60,
            rWideX: 1.30,
            gapGiantX: 0.35,
            gapMicroP: 0.20,
            showC: true,
            showR: true,
            showG: true,
            showOut: true,
            showDay: true,
            tblPos: 'top_right',
            txtSize: 'normal',
            cTxt: '#ffffff',
            cellOpacity: 85,
            cLong: '#089981',
            cShort: '#f23645',
            cNeut: '#787b86',
            cEntry: '#2962ff',
            cExit: '#ff9800',
            showPW: true,
            cPWH: '#008080', sPWH: 'solid',
            cPWL: '#008080', sPWL: 'solid',
            cPWM: '#6e7684', sPWM: 'dotted',
            wPW: 1,
            showGapLv: true,
            cFri: '#606a78', sFri: 'dashed',
            cHalf: '#2962ff', sHalf: 'solid',
            wGap: 2,
            showGapBox: true,
            cBoxUp: 'rgba(0,128,128,0.12)',
            cBoxDn: 'rgba(136,14,79,0.12)',
            cBoxGi: 'rgba(242,54,69,0.20)',
            showFR: true,
            cFR: '#ff9800', sFR: 'solid', wFR: 2,
            showFarFR: false,
            dimFR: true,
            showWO: true,
            cWO: '#b8860b', sWO: 'dashed', wWO: 1,
            dimWO: true,
            showOWR: true,
            cOWR: '#9c27b0', sOWR: 'solid', wOWR: 2,
            showRetr: false,
            showLad: true,
            ladSteps: 3,
            cLad: '#00838f',
            showOWRBox: true,
            cOWRBox: 'rgba(156,39,176,0.10)',
            showLbl: true,
            lblSizeStr: 'normal',
            lblOff: 1,
            lblStagger: 8,
            mergeK: 0.03
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

    function bucket1h(bars) {
        if (!Array.isArray(bars) || !bars.length) return [];
        var out = [];
        var cur = null;
        var start = 0;
        for (var i = 0; i < bars.length; i++) {
            var b = bars[i];
            var t = Number(b.t);
            if (!Number.isFinite(t)) continue;
            var bucket = Math.floor(t / HOUR_MS) * HOUR_MS;
            if (!cur || bucket !== start) {
                if (cur) out.push(cur);
                start = bucket;
                cur = { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 };
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

    function buildEngineBars(chartData, ctx) {
        var raw = ctx && Array.isArray(ctx.rawData) && ctx.rawData.length ? ctx.rawData : chartData;
        if (ctx && typeof ctx.resample === 'function' && raw && raw.length) {
            try {
                var rs = ctx.resample(raw, '1h');
                if (Array.isArray(rs) && rs.length) return rs;
            } catch (_) { /* fall through */ }
        }
        return bucket1h(raw || chartData);
    }

    function indexAtOrBefore(bars, t) {
        var n = bars.length;
        if (!n) return 0;
        var lo = 0, hi = n - 1, ans = 0;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (bars[mid].t <= t) { ans = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        return ans;
    }

    function avgArr(arr) {
        if (!arr || !arr.length) return null;
        var s = 0;
        for (var i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
    }

    function cellBg(color, opacityPct) {
        return fadeColor(color, opacityPct);
    }

    function runWeeklyEngine(h1, p) {
        var tz = p.tzStr || 'America/New_York';
        var dayShiftMs = (Number(p.dayShift) || 0) * HOUR_MS;
        var avgWeeks = Math.max(5, Math.min(30, Math.floor(Number(p.avgWeeks) || 14)));

        var lastDKey = null;
        var lastDow = 2;
        var wkHi = null, wkLo = null;
        var dayHi = null, dayLo = null;
        var pwH = null, pwL = null, pwM = null;
        var friClose = null, friHi = null, friLo = null;
        var wkOpen = null;
        var dayIdx = 0;
        var owrHi = null, owrLo = null;
        var gapHalf = false, gapFilled = false, owrFinal = false;
        var gapPct = null, gapX = null, pwRngX = null, avgRng = null;
        var gapUp = false, outsideUp = false, isOutside = false, frTouched = false;
        var wkStartT = null, owrEndT = null, owrHiT = null, owrLoT = null;
        var lastTradeClose = null;
        var wkRanges = [];
        var dowE = 2;

        var snap = null;

        for (var i = 0; i < h1.length; i++) {
            var bar = h1[i];
            var tSh = bar.t + dayShiftMs;
            var wp = wallParts(tSh, tz);
            var dKey = wp.y * 10000 + wp.m * 100 + wp.d;
            var dow = wp.dow;
            var limbo = dow === PINE_SUN;
            var newDay = !limbo && dKey !== (lastDKey == null ? dKey : lastDKey);
            var newWeek = newDay && dow <= lastDow;

            if (!limbo) lastDKey = dKey;
            if (newDay) lastDow = dow;

            if (newDay && !newWeek) {
                dayHi = bar.h;
                dayLo = bar.l;
                dayIdx += 1;
                if (dayIdx === 3) owrFinal = true;
            }

            if (newWeek) {
                pwH = wkHi;
                pwL = wkLo;
                pwM = (wkHi != null && wkLo != null) ? (wkHi + wkLo) / 2 : null;
                friClose = lastTradeClose;
                friHi = dayHi;
                friLo = dayLo;
                avgRng = avgArr(wkRanges);
                pwRngX = (avgRng == null || pwH == null || pwL == null) ? null : (pwH - pwL) / avgRng;
                if (pwH != null && pwL != null) {
                    wkRanges.push(pwH - pwL);
                    if (wkRanges.length > avgWeeks) wkRanges.shift();
                }
                var avgRngG = avgArr(wkRanges);
                wkOpen = bar.o;
                wkHi = bar.h;
                wkLo = bar.l;
                dayHi = bar.h;
                dayLo = bar.l;
                dayIdx = 1;
                owrHi = null; owrLo = null; owrHiT = null; owrLoT = null;
                owrFinal = false; owrEndT = null;
                wkStartT = bar.t;
                gapPct = friClose == null ? null : 100 * Math.abs(wkOpen - friClose) / friClose;
                gapX = (avgRngG == null || friClose == null) ? null : Math.abs(wkOpen - friClose) / avgRngG;
                gapUp = friClose != null && wkOpen > friClose;
                isOutside = friHi != null && friLo != null && (wkOpen > friHi || wkOpen < friLo);
                outsideUp = friHi != null && wkOpen > friHi;
                frTouched = false;
                gapHalf = false;
                gapFilled = false;
            }

            if (!limbo) {
                wkHi = wkHi == null ? bar.h : Math.max(wkHi, bar.h);
                wkLo = wkLo == null ? bar.l : Math.min(wkLo, bar.l);
                dayHi = dayHi == null ? bar.h : Math.max(dayHi, bar.h);
                dayLo = dayLo == null ? bar.l : Math.min(dayLo, bar.l);
                if (dayIdx <= 2) {
                    owrEndT = bar.t;
                    if (owrHi == null || bar.h >= owrHi) { owrHi = bar.h; owrHiT = bar.t; }
                    if (owrLo == null || bar.l <= owrLo) { owrLo = bar.l; owrLoT = bar.t; }
                }
                if (gapPct != null && friClose != null && !gapFilled && wkOpen != null) {
                    var gHalfP = (wkOpen + friClose) / 2;
                    if (gapUp) {
                        if (bar.l <= gHalfP) gapHalf = true;
                        if (bar.l <= friClose) { gapFilled = true; gapHalf = true; }
                    } else {
                        if (bar.h >= gHalfP) gapHalf = true;
                        if (bar.h >= friClose) { gapFilled = true; gapHalf = true; }
                    }
                }
                if (isOutside && !frTouched) {
                    if (outsideUp && bar.l <= friHi) frTouched = true;
                    if (!outsideUp && bar.h >= friLo) frTouched = true;
                }
                lastTradeClose = bar.c;
                dowE = dow;
            }

            snap = {
                wkOpen: wkOpen, wkStartT: wkStartT, dayIdx: dayIdx, dowE: dowE,
                pwH: pwH, pwL: pwL, pwM: pwM, pwRngX: pwRngX, avgRng: avgRng,
                gapPct: gapPct, gapX: gapX, gapUp: gapUp,
                friClose: friClose, friHi: friHi, friLo: friLo,
                isOutside: isOutside, outsideUp: outsideUp, frTouched: frTouched,
                gapHalf: gapHalf, gapFilled: gapFilled,
                owrHi: owrHi, owrLo: owrLo, owrHiT: owrHiT, owrLoT: owrLoT,
                owrEndT: owrEndT, owrFinal: owrFinal
            };
        }
        return snap;
    }

    function classify(st, p) {
        if (!st) {
            return {
                compassAbove: false, regime: '—', gapBand: '—',
                entryWin: false, exitWin: false
            };
        }
        var compassAbove = st.pwM != null && st.wkOpen != null && st.wkOpen > st.pwM;
        var regime = st.pwRngX == null ? '—'
            : st.pwRngX <= Number(p.rNarrowX) ? 'NARROW→EXP'
                : st.pwRngX >= Number(p.rWideX) ? 'WIDE→TRAP' : 'MID';
        var gapBand = '—';
        if (st.gapPct != null) {
            var giant = st.gapX != null && st.gapX >= Number(p.gapGiantX);
            gapBand = st.gapPct < Number(p.gapMicroP) ? 'MICRO'
                : giant ? 'GIANT·NO FADE' : 'TRADEABLE';
        }
        return {
            compassAbove: compassAbove,
            regime: regime,
            gapBand: gapBand,
            entryWin: st.dayIdx <= 2,
            exitWin: st.dowE >= PINE_THU
        };
    }

    function calculateTalariaWeeklyMap(data, params, ctx) {
        var p = mergeParams(params);
        var chart = Array.isArray(data) ? data : [];
        var n = chart.length;
        if (n < 2) {
            return { lines: [], boxes: [], labels: [], infoCells: [], infoMeta: p };
        }

        var h1 = buildEngineBars(chart, ctx);
        if (h1.length < 2) h1 = bucket1h(chart);
        var st = runWeeklyEngine(h1, p);
        var cls = classify(st, p);
        if (!st || st.pwH == null) {
            return {
                lines: [], boxes: [], labels: [],
                infoCells: [],
                infoMeta: {
                    tblPos: p.tblPos,
                    tblLayout: 'headers — horizontal',
                    txtSize: p.txtSize,
                    cTxt: p.cTxt,
                    cellOpacity: Number(p.cellOpacity) || 85
                },
                labelMeta: { size: p.lblSizeStr, lblOff: p.lblOff, mergeK: p.mergeK, stagger: p.lblStagger, avgR: 0 }
            };
        }

        var lastIdx = n - 1;
        var startIdx = st.wkStartT != null ? indexAtOrBefore(chart, st.wkStartT) : 0;
        var lines = [];
        var boxes = [];
        var labels = [];

        function pushLine(price, color, style, width, fromIdx, label) {
            if (!Number.isFinite(price)) return;
            lines.push({
                price: price,
                color: color,
                style: style || 'solid',
                width: width || 1,
                startIndex: fromIdx != null ? fromIdx : startIdx,
                endIndex: lastIdx,
                label: label || ''
            });
        }

        function pushLabel(price, text, color) {
            if (!Number.isFinite(price) || !text) return;
            labels.push({ price: price, text: text, color: color });
        }

        if (p.showPW) {
            pushLine(st.pwH, p.cPWH, p.sPWH, p.wPW, startIdx, 'PWH');
            pushLine(st.pwL, p.cPWL, p.sPWL, p.wPW, startIdx, 'PWL');
            pushLine(st.pwM, p.cPWM, p.sPWM, p.wPW, startIdx, 'MID');
            if (p.showLbl) {
                pushLabel(st.pwH, 'PWH', p.cPWH);
                pushLabel(st.pwL, 'PWL', p.cPWL);
                pushLabel(st.pwM, 'MID', p.cPWM);
            }
        }

        if (p.showGapLv && cls.gapBand === 'TRADEABLE' && st.friClose != null && st.wkOpen != null) {
            pushLine(st.friClose, p.cFri, p.sFri, p.wGap, startIdx, 'FRI-C');
            pushLine((st.wkOpen + st.friClose) / 2, p.cHalf, p.sHalf, p.wGap, startIdx, 'GAP-50');
            if (p.showLbl) {
                pushLabel(st.friClose, 'FRI-C', p.cFri);
                pushLabel((st.wkOpen + st.friClose) / 2, 'GAP-50', p.cHalf);
            }
        }

        if (p.showGapBox && (cls.gapBand === 'TRADEABLE' || cls.gapBand === 'GIANT·NO FADE')
            && st.wkOpen != null && st.friClose != null) {
            var bc = cls.gapBand === 'GIANT·NO FADE' ? p.cBoxGi : (st.gapUp ? p.cBoxUp : p.cBoxDn);
            boxes.push({
                startIndex: startIdx,
                endIndex: lastIdx,
                top: Math.max(st.wkOpen, st.friClose),
                bottom: Math.min(st.wkOpen, st.friClose),
                fill: bc
            });
        }

        if (p.showFR && st.isOutside) {
            var frCol = (p.dimFR && st.frTouched) ? pineTrans(p.cFR, 75) : p.cFR;
            if (st.outsideUp) {
                pushLine(st.friHi, frCol, p.sFR, p.wFR, startIdx, 'FRI-H');
                if (p.showLbl) {
                    pushLabel(st.friHi, 'FRI-H' + (st.frTouched ? ' ✕' : ''),
                        (p.dimFR && st.frTouched) ? pineTrans(p.cFR, 60) : p.cFR);
                }
                if (p.showFarFR) {
                    pushLine(st.friLo, pineTrans(p.cFR, 70), p.sFR, 1, startIdx, 'FRI-L');
                    if (p.showLbl) pushLabel(st.friLo, 'FRI-L', pineTrans(p.cFR, 60));
                }
            } else {
                pushLine(st.friLo, frCol, p.sFR, p.wFR, startIdx, 'FRI-L');
                if (p.showLbl) {
                    pushLabel(st.friLo, 'FRI-L' + (st.frTouched ? ' ✕' : ''),
                        (p.dimFR && st.frTouched) ? pineTrans(p.cFR, 60) : p.cFR);
                }
                if (p.showFarFR) {
                    pushLine(st.friHi, pineTrans(p.cFR, 70), p.sFR, 1, startIdx, 'FRI-H');
                    if (p.showLbl) pushLabel(st.friHi, 'FRI-H', pineTrans(p.cFR, 60));
                }
            }
        }

        if (p.showWO && st.wkOpen != null) {
            var woCol = (p.dimWO && st.dayIdx > 2) ? pineTrans(p.cWO, 80) : p.cWO;
            pushLine(st.wkOpen, woCol, p.sWO, p.wWO, startIdx, 'W-OPEN');
            if (p.showLbl) {
                pushLabel(st.wkOpen, st.dayIdx > 2 ? 'W-OPEN ✕' : 'W-OPEN',
                    st.dayIdx > 2 ? pineTrans(p.cWO, 60) : p.cWO);
            }
        }

        if (p.showOWR && st.owrFinal && st.owrHi != null && st.owrLo != null) {
            var owrStartIdx = st.owrHiT != null ? indexAtOrBefore(chart, st.owrHiT) : startIdx;
            var owrLoStartIdx = st.owrLoT != null ? indexAtOrBefore(chart, st.owrLoT) : startIdx;
            var owrEndIdx = st.owrEndT != null ? indexAtOrBefore(chart, st.owrEndT) : lastIdx;
            if (p.showOWRBox) {
                boxes.push({
                    startIndex: startIdx,
                    endIndex: owrEndIdx,
                    top: st.owrHi,
                    bottom: st.owrLo,
                    fill: p.cOWRBox
                });
            }
            pushLine(st.owrHi, p.cOWR, p.sOWR, p.wOWR, owrStartIdx, 'OWR-H');
            pushLine(st.owrLo, p.cOWR, p.sOWR, p.wOWR, owrLoStartIdx, 'OWR-L');
            if (p.showLbl) {
                pushLabel(st.owrHi, 'OWR-H', p.cOWR);
                pushLabel(st.owrLo, 'OWR-L', p.cOWR);
            }
            var rng = st.owrHi - st.owrLo;
            var ladFrom = owrEndIdx;
            var steps = Math.max(1, Math.min(5, Math.floor(Number(p.ladSteps) || 3)));
            if (p.showLad && rng > 0) {
                for (var k = 1; k <= steps; k++) {
                    var up = st.owrHi + k * 0.1 * rng;
                    var dn = st.owrLo - k * 0.1 * rng;
                    pushLine(up, pineTrans(p.cLad, 40), 'dotted', 1, ladFrom, '+0.' + k + 'x');
                    pushLine(dn, pineTrans(p.cLad, 40), 'dotted', 1, ladFrom, '-0.' + k + 'x');
                    if (p.showLbl) {
                        pushLabel(up, '+0.' + k + 'x', pineTrans(p.cLad, 30));
                        pushLabel(dn, '-0.' + k + 'x', pineTrans(p.cLad, 30));
                    }
                }
            }
            if (p.showRetr && rng > 0) {
                var r25h = st.owrHi - 0.25 * rng;
                var r25l = st.owrLo + 0.25 * rng;
                pushLine(r25h, pineTrans(p.cLad, 20), 'dashed', 1, ladFrom, 'RT-25');
                pushLine(r25l, pineTrans(p.cLad, 20), 'dashed', 1, ladFrom, 'RT-25');
                if (p.showLbl) {
                    pushLabel(r25h, 'RT-25', pineTrans(p.cLad, 15));
                    pushLabel(r25l, 'RT-25', pineTrans(p.cLad, 15));
                }
            }
        }

        var op = Number(p.cellOpacity) || 85;
        var infoCells = [];
        if (p.showC && st.pwM != null) {
            var cc = cls.compassAbove ? p.cLong : p.cShort;
            infoCells.push({
                name: 'C',
                value: cls.compassAbove ? 'ABOVE→PWH' : 'BELOW→PWL',
                bg: cellBg(cc, op)
            });
        }
        if (p.showR && cls.regime !== '—') {
            var rc = cls.regime === 'NARROW→EXP' ? p.cLong
                : cls.regime === 'WIDE→TRAP' ? p.cShort : p.cNeut;
            var rTxt = st.pwRngX != null
                ? cls.regime + ' ' + st.pwRngX.toFixed(2) + 'x'
                : cls.regime;
            infoCells.push({ name: 'R', value: rTxt, bg: cellBg(rc, op) });
        }
        if (p.showG && st.gapPct != null) {
            var gc = cls.gapBand === 'TRADEABLE' ? p.cLong
                : cls.gapBand === 'GIANT·NO FADE' ? p.cShort : p.cNeut;
            var gX = st.gapX != null ? ' (' + st.gapX.toFixed(2) + 'x)' : '';
            var gStat = st.gapFilled ? ' · FILLED ✕' : st.gapHalf ? ' · 50% ✓' : '';
            infoCells.push({
                name: 'G',
                value: (st.gapUp ? '▲' : '▼') + st.gapPct.toFixed(2) + '%' + gX + ' ' + cls.gapBand + gStat,
                bg: cellBg(gc, op)
            });
        }
        if (p.showOut) {
            var oc = st.isOutside ? p.cExit : p.cNeut;
            infoCells.push({
                name: 'OPEN',
                value: st.isOutside ? (st.outsideUp ? 'OUT ▲' : 'OUT ▼') : 'IN',
                bg: cellBg(oc, op)
            });
        }
        if (p.showDay) {
            var dc = cls.entryWin ? p.cEntry : cls.exitWin ? p.cExit : p.cNeut;
            var dTxt = cls.entryWin ? 'ENTRY Mon–Tue' : cls.exitWin ? 'EXIT Thu–Fri' : 'HOLD';
            infoCells.push({ name: 'DAY', value: dTxt, bg: cellBg(dc, op) });
        }

        return {
            lines: lines,
            boxes: boxes,
            labels: p.showLbl ? labels : [],
            labelMeta: {
                size: p.lblSizeStr,
                lblOff: Number(p.lblOff) || 0,
                mergeK: Number(p.mergeK) || 0,
                stagger: Number(p.lblStagger) || 8,
                avgR: st.avgRng || 0
            },
            infoCells: infoCells,
            infoMeta: {
                tblPos: p.tblPos,
                tblLayout: 'headers — horizontal',
                txtSize: p.txtSize,
                cTxt: p.cTxt,
                cellOpacity: op
            }
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
        if (proto.drawTalariaWeeklyMap) return;

        // Reuse Ratio+Gap painter when present (identical geometry contract).
        proto.drawTalariaWeeklyMap = function (data, style, startIndex, endIndex) {
            if (typeof this.drawTalariaRatioGap === 'function') {
                return this.drawTalariaRatioGap(data, style, startIndex, endIndex);
            }
            if (!data || !this.ctx) return;
            var ctx = this.ctx;
            var m = this.margin;
            var n = this.data ? this.data.length : 0;
            endIndex = endIndex == null ? n : Math.min(endIndex, n);
            var plotL = m.l;
            var plotR = this.w - m.r;

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

            if (data.lines && data.lines.length) {
                data.lines.forEach(function (ln) {
                    if (ln.startIndex > endIndex) return;
                    var y = this.yScale(ln.price);
                    var x1 = this.dataIndexToPixel(Math.max(ln.startIndex, startIndex));
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

            if (data.infoCells && data.infoCells.length && typeof this._drawTalariaRatioInfoCells === 'function') {
                this._drawTalariaRatioInfoCells(data.infoCells, data.infoMeta || {});
            }
        };
    }

    var _attachTries = 0;
    function tryAttach() {
        attachDraw();
        if (global.Chart && global.Chart.prototype && global.Chart.prototype.drawTalariaWeeklyMap) return;
        if (_attachTries++ < 40 && typeof setTimeout === 'function') setTimeout(tryAttach, 50);
    }
    tryAttach();

    global.TalariaWeeklyMapIndicator = {
        defaultParams: defaultParams,
        calculate: calculateTalariaWeeklyMap
    };
})(typeof window !== 'undefined' ? window : this);
