/**
 * Talaria custom indicators — sandboxed compute(bars, params) via Web Worker.
 * Not Pine Script; JavaScript API versioned for persisted session state.
 *
 * Contract (API_VERSION):
 * - User script must define: function compute(bars, params) { ... return result; }
 * - bars: { open, high, low, close, volume, time } — parallel arrays, same length as chart data
 * - result: { overlay: boolean, plots: Plot[] }
 * - Plot: { type: 'line'|'histogram', values: (number|null)[], color?, lineWidth?, name?, baseline? }
 * - values length must match bar count (extra points are truncated server-side in worker)
 * - Main thread: Worker message { id, script, bars, params, timeout }; response { ok, result|error }
 * - Session persistence: script source stored in indicator params up to MAX_SCRIPT_CHARS (truncate + flag)
 */
(function (global) {
    'use strict';

    var API_VERSION = 1;
    var MAX_SCRIPT_CHARS = 48000;
    var DEFAULT_TIMEOUT_MS = 12000;
    var MAX_PLOTS = 16;

    var workerUrl = null;
    var worker = null;
    var queue = [];
    var busy = false;

    function getWorkerSource() {
        return (
            "self.onmessage=function(e){" +
            "var id=e.data.id,script=e.data.script,bars=e.data.bars,params=e.data.params||{},timeout=e.data.timeout||12000;" +
            "function fail(msg){self.postMessage({id:id,ok:false,error:String(msg)});}" +
            "function pad(arr,len){if(!Array.isArray(arr))return null;var o=arr.slice(0,len);while(o.length<len)o.push(null);return o;}" +
            "function validate(r,barLen){" +
            "if(!r||typeof r!=='object')return{ok:false,err:'Result must be an object'};" +
            "if(typeof r.overlay!=='boolean')return{ok:false,err:'overlay must be boolean'};" +
            "if(!Array.isArray(r.plots))return{ok:false,err:'plots must be an array'};" +
            "if(r.plots.length>" +
            String(MAX_PLOTS) +
            ")return{ok:false,err:'Too many plots'};" +
            "for(var pi=0;pi<r.plots.length;pi++){" +
            "var p=r.plots[pi];if(!p)return{ok:false,err:'Invalid plot'};" +
            "if(p.type!=='line'&&p.type!=='histogram')return{ok:false,err:'plot.type must be line or histogram'};" +
            "if(!Array.isArray(p.values))return{ok:false,err:'plot.values must be an array'};" +
            "p.values=pad(p.values,barLen);if(!p.values)return{ok:false,err:'plot.values invalid'};" +
            "}" +
            "return{ok:true,result:r};" +
            "}" +
            "try{" +
            "if(typeof script!=='string'||script.length>" +
            String(MAX_SCRIPT_CHARS) +
            ")throw new Error('Script too long');" +
            "if(!bars||typeof bars.close!=='object')throw new Error('Invalid bars');" +
            "var barLen=bars.close.length;" +
            "var fn=new Function('bars','params','\"use strict\";\\n' + script + '\\nif (typeof compute !== \"function\") throw new Error(\"Define function compute(bars, params)\");\\nreturn compute(bars, params);');" +
            "var raw=fn(bars,params);" +
            "var v=validate(raw,barLen);" +
            "if(!v.ok)return fail(v.err);" +
            "self.postMessage({id:id,ok:true,result:v.result});" +
            "}catch(err){fail(err&&err.message?err.message:err);}" +
            "};"
        );
    }

    function ensureWorker() {
        if (worker && workerUrl) return worker;
        if (!workerUrl) {
            var blob = new Blob([getWorkerSource()], { type: 'text/javascript' });
            workerUrl = URL.createObjectURL(blob);
        }
        worker = new Worker(workerUrl);
        worker.onmessage = onWorkerMessage;
        worker.onerror = function (err) {
            dispatchFailure(null, err && err.message ? err.message : 'Worker error');
        };
        return worker;
    }

    function dispatchFailure(id, msg) {
        var item = id != null ? dequeueById(id) : dequeueHead();
        while (!item && queue.length) {
            item = dequeueHead();
        }
        if (item && item.reject) {
            item.reject(new Error(msg || 'Unknown error'));
        }
        busy = false;
        pump();
    }

    function dequeueById(id) {
        for (var i = 0; i < queue.length; i++) {
            if (queue[i].id === id) {
                return queue.splice(i, 1)[0];
            }
        }
        return null;
    }

    function dequeueHead() {
        return queue.shift() || null;
    }

    function onWorkerMessage(e) {
        var d = e.data || {};
        var id = d.id;
        var item = dequeueById(id);
        if (!item) {
            busy = false;
            pump();
            return;
        }
        clearTimeout(item.timer);
        busy = false;
        if (d.ok) {
            item.resolve(d.result);
        } else {
            item.reject(new Error(d.error || 'Compute failed'));
        }
        pump();
    }

    function pump() {
        if (busy || queue.length === 0) return;
        var item = queue[0];
        busy = true;
        var w = ensureWorker();
        try {
            w.postMessage({
                id: item.id,
                script: item.script,
                bars: item.bars,
                params: item.params,
                timeout: item.timeoutMs
            });
        } catch (err) {
            busy = false;
            queue.shift();
            item.reject(err);
            pump();
        }
    }

    /**
     * @param {string} script - Must define compute(bars, params) { return { overlay, plots } }
     * @param {object} bars - { open, high, low, close, volume, time } arrays same length
     * @param {object} params - user params
     * @param {number} [timeoutMs]
     * @returns {Promise<object>}
     */
    function runCompute(script, bars, params, timeoutMs) {
        return new Promise(function (resolve, reject) {
            var id = 'ci_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            var item = {
                id: id,
                script: script,
                bars: bars,
                params: params || {},
                timeoutMs: timeoutMs || DEFAULT_TIMEOUT_MS,
                resolve: resolve,
                reject: reject
            };
            item.timer = setTimeout(function () {
                var found = dequeueById(id);
                if (found) {
                    clearTimeout(found.timer);
                    busy = false;
                    try {
                        if (worker) worker.terminate();
                    } catch (e) {}
                    worker = null;
                    found.reject(new Error('Custom indicator timed out'));
                    pump();
                }
            }, item.timeoutMs + 500);
            queue.push(item);
            pump();
        });
    }

    function looksLikePineScript(source) {
        if (!source || typeof source !== 'string') return false;
        var s = source.trim();
        if (/^\/\/\s*@version\s*=/m.test(s)) return true;
        if (/\bindicator\s*\(\s*["']/.test(s) && /\bta\.\w+\s*\(/.test(s)) return true;
        if (/\bstrategy\s*\(/.test(s)) return true;
        var score = 0;
        if (/\bta\.(ema|rsi|sma|wma|macd|crossover|crossunder|barssince)\s*\(/i.test(s)) score += 2;
        if (/\binput\.(int|float|bool|string|source)\s*\(/.test(s)) score += 2;
        if (/\bplot\s*\([^)]*\b(color|style|linewidth)\b/i.test(s)) score += 1;
        return score >= 3;
    }

    function validateCustomScriptSource(source) {
        var str = source == null ? '' : String(source);
        if (!str.trim()) {
            return { ok: false, error: 'Script is empty.' };
        }
        if (looksLikePineScript(str)) {
            return {
                ok: false,
                error: 'This looks like Pine Script, which Talaria does not run. Use JavaScript: define function compute(bars, params) { return { overlay: true|false, plots: [...] }; }'
            };
        }
        return { ok: true };
    }

    function serializeBarsFromChartData(data) {
        var n = data ? data.length : 0;
        var open = new Array(n);
        var high = new Array(n);
        var low = new Array(n);
        var close = new Array(n);
        var volume = new Array(n);
        var time = new Array(n);
        for (var i = 0; i < n; i++) {
            var row = data[i];
            open[i] = row.o;
            high[i] = row.h;
            low[i] = row.l;
            close[i] = row.c;
            volume[i] = row.v != null ? row.v : 0;
            time[i] = row.t != null ? row.t : i;
        }
        return { open: open, high: high, low: low, close: close, volume: volume, time: time };
    }

    global.TalariaCustomIndicators = {
        API_VERSION: API_VERSION,
        MAX_SCRIPT_CHARS: MAX_SCRIPT_CHARS,
        MAX_PLOTS: MAX_PLOTS,
        DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
        runCompute: runCompute,
        serializeBarsFromChartData: serializeBarsFromChartData,
        looksLikePineScript: looksLikePineScript,
        validateCustomScriptSource: validateCustomScriptSource
    };
})(typeof window !== 'undefined' ? window : this);
