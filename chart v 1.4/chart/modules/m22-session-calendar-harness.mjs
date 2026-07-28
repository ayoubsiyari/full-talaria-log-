/**
 * m22-session-calendar-harness.mjs — real-product harness for the session-calendar oracle.
 *
 * Packet: session-calendar-red · Manager A · Tier 3
 * Row: Session-calendar bucketing (canary blocker)
 *
 * FIDELITY CONTRACT
 * -----------------
 * The oracle must execute the REAL product bucketing code, never a copy of the
 * formula. This harness therefore:
 *
 *   1. Reads `chart v 1.4/chart/chart.js` and lifts the VERBATIM SOURCE TEXT of
 *      `parseTimeframe`, `_prepareBarsForResampling` and `_resampleDataFull` by
 *      brace-matching (`extractClassMethod`). Extraction is fail-closed: a
 *      missing site, a duplicate site, or a missing expected needle throws.
 *   2. Reads `chart v 1.4/chart/modules/chart-data-pipeline.js` verbatim, which
 *      carries the real `_tryIncrementalResample`.
 *   3. Evaluates all of it in ONE `node:vm` realm together with the real
 *      `session-calendar.js`, so the wired path resolves the real helper.
 *
 * chart.js cannot be `require`d (top-level `document` access, auto-init on
 * DOMContentLoaded, ~42k lines of browser-only surface). Method lifting into a
 * VM realm is the narrowest technique that still runs product bytes; it is the
 * "VM harness over the real file" option, scoped to the three functions under
 * test. The lifted text is hashed and published in the evidence packet so a
 * reviewer can diff it against the file.
 *
 * WIRING SIMULATION (in memory only — no product file is modified)
 * ---------------------------------------------------------------
 * `WIRING_PATCH` is the proposed product diff expressed as exact find/replace
 * pairs. `makeHarness({ mode: 'simulate-wired' })` applies it to the lifted text
 * so the oracle can demonstrate state 2 of the §A5 four-state proof ("passes on
 * fixed state") before Manager A authorises the product edit. Every pair must
 * match exactly once or the harness throws — so this doubles as a machine-checked
 * wiring instruction that cannot silently rot.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KILL_SWITCH = '__TALARIA_DISABLE_SESSION_CALENDAR_V1';
export const LABEL_CONVENTION = 'stamp-at-open/session-date-naming';

export function findRepoRoot(start = __dirname) {
    let dir = start;
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
            && fs.existsSync(path.join(dir, 'chart v 1.4'))
            && fs.existsSync(path.join(dir, 'homepage'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error(`repo root not found from ${start}`);
}

export const REPO_ROOT = findRepoRoot();
export const CHART_ROOT = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
export const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
export const EVIDENCE_DIR = path.join(REPO_ROOT, 'tests', 'evidence', 'session-calendar-red');

export const REL = {
    chart: 'chart v 1.4/chart/chart.js',
    pipeline: 'chart v 1.4/chart/modules/chart-data-pipeline.js',
    calendar: 'chart v 1.4/chart/modules/session-calendar.js',
    calendarMirror: 'homepage/public/chart/modules/session-calendar.js',
    contract: 'chart v 1.4/chart/modules/session-calendar.contract.json',
    // The instrument registry that owns symbol -> instrument-type resolution.
    // Already served by every chart shell; the wiring consumes it rather than
    // growing a second classifier.
    marketCalc: 'chart v 1.4/chart/modules/market-calculations.js',
    // Generated mirrors. The wiring is a FOUR-FILE change: both bucketing files
    // exist twice and the served copy is the homepage one.
    chartMirror: 'homepage/public/chart/chart.js',
    pipelineMirror: 'homepage/public/chart/modules/chart-data-pipeline.js',
};

/** Every file the wiring must land in, as (source, mirror) pairs. */
export const WIRING_FILE_PAIRS = [
    { id: 'chart.js', source: REL.chart, mirror: REL.chartMirror },
    { id: 'chart-data-pipeline.js', source: REL.pipeline, mirror: REL.pipelineMirror },
];

// Sources are immutable for the duration of a run; memoized so the oracle can
// build one VM realm per cell without re-reading and re-hashing 2 MB of chart.js.
const readCache = new Map();

export function readRepo(rel) {
    if (!readCache.has(rel)) readCache.set(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    return readCache.get(rel);
}

const shaCache = new Map();

export function sha256(text) {
    if (text.length > 4096) {
        if (!shaCache.has(text)) {
            shaCache.set(text, crypto.createHash('sha256').update(text, 'utf8').digest('hex'));
        }
        return shaCache.get(text);
    }
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/* ── verbatim method lifting ─────────────────────────────────────────────── */

const EXPECTED_NEEDLES = {
    parseTimeframe: ["'d': 24 * 60 * 60 * 1000", "'w': 7 * 24 * 60 * 60 * 1000"],
    _prepareBarsForResampling: ['out.sort((a, b) => a.t - b.t)'],
    _resampleDataFull: ['const monthMatch = normalizedTf.match(/^(\\d+)mo$/)', 'Date.UTC(bucketYear, bucketMonth, 1)'],
};

/**
 * Lift a class method's verbatim source text by brace matching, skipping
 * strings, template literals and comments. Fail-closed.
 *
 * KNOWN LIMITATION — RECORDED, NOT FIXED (Manager A, rejection 1).
 * The scanner does NOT skip REGEX LITERALS. A regex containing an unbalanced
 * brace or a `{n}` / `{n,m}` quantifier would be counted as structure and the
 * lift would end at the wrong place. It works today only because none of the
 * lifted methods contains such a literal — `_resampleDataFull` holds
 * `/^(\d+)mo$/` and `classifyTimeframe`-style patterns with no quantifier
 * braces. That is a property of the CURRENT source, not of this construction.
 *
 * Two things make the luck survivable rather than load-bearing:
 *   - `EXPECTED_NEEDLES` re-checks each lifted body for text that only appears
 *     at its very end, so a short lift throws rather than silently truncating.
 *   - `assertNoRegexBraceQuantifier` below fails the lift outright if a brace
 *     quantifier ever appears in a lifted body.
 * A real fix is a tokenizer, which is out of scope for this packet and is
 * reported to Manager A as a follow-up rather than attempted here.
 */
function assertNoRegexBraceQuantifier(name, text) {
    // Any `{n}`, `{n,}` or `{n,m}` in the lifted body is the shape that would
    // break brace matching. Fail closed if one ever appears.
    const m = text.match(/\{\d+(,\d*)?\}/);
    if (m) {
        throw new Error(
            `extractClassMethod(${name}): lifted body contains brace quantifier ${JSON.stringify(m[0])}; `
            + 'the brace matcher does not skip regex literals — see the note above and use a tokenizer',
        );
    }
}

export function extractClassMethod(source, name) {
    const re = new RegExp(`\\n(\\s{4})${name}\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
    const hits = [];
    let m;
    while ((m = re.exec(source)) !== null) hits.push(m);
    if (hits.length !== 1) {
        throw new Error(`extractClassMethod(${name}): ${hits.length} candidate sites, expected exactly 1`);
    }
    const start = hits[0].index + 1;
    let i = source.indexOf('{', start);
    let depth = 0;
    for (; i < source.length; i++) {
        const c = source[i];
        const n = source[i + 1];
        if (c === '/' && n === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && n === '*') { i = source.indexOf('*/', i) + 1; continue; }
        if (c === "'" || c === '"' || c === '`') {
            const q = c;
            i++;
            for (; i < source.length; i++) {
                if (source[i] === '\\') { i++; continue; }
                if (source[i] === q) break;
                if (q === '`' && source[i] === '$' && source[i + 1] === '{') {
                    let d = 1;
                    i += 2;
                    for (; i < source.length && d > 0; i++) {
                        if (source[i] === '{') d++;
                        else if (source[i] === '}') d--;
                    }
                    i--;
                }
            }
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                const text = source.slice(start, i + 1);
                for (const needle of (EXPECTED_NEEDLES[name] || [])) {
                    if (!text.includes(needle)) {
                        throw new Error(`extractClassMethod(${name}): lifted text lost needle ${JSON.stringify(needle)}`);
                    }
                }
                assertNoRegexBraceQuantifier(name, text);
                return text;
            }
        }
    }
    throw new Error(`extractClassMethod(${name}): unbalanced braces`);
}

/** Always present in chart.js; extraction fails closed if one goes missing. */
export const BASE_LIFTED_METHODS = ['parseTimeframe', '_prepareBarsForResampling', '_resampleDataFull'];

/**
 * Added to chart.js by the wiring (WIRING_PATCH.chartAdditions). Absent before
 * the wiring lands, lifted from the product afterwards. Keeping them here is
 * what makes `productIsWired()` a real transition instead of a crash: once
 * Manager A applies the patch, the synthetic host stops receiving injected
 * copies and starts running the product's own text.
 */
export const WIRED_LIFTED_METHODS = ['_sessionBucketStart', '_sessionInstrumentClass'];

export const LIFTED_METHODS = [...BASE_LIFTED_METHODS, ...WIRED_LIFTED_METHODS];

const liftCache = new Map();

export function liftChartMethods(chartSource = readRepo(REL.chart)) {
    const key = sha256(chartSource);
    if (!liftCache.has(key)) {
        const out = {};
        for (const name of BASE_LIFTED_METHODS) out[name] = extractClassMethod(chartSource, name);
        // Lifted only once the wiring is in the product. Before that the patch
        // injects them; after it, the product text is the single source.
        for (const name of WIRED_LIFTED_METHODS) {
            if (new RegExp(`\\n\\s{4}${name}\\s*\\(`).test(chartSource)) {
                out[name] = extractClassMethod(chartSource, name);
            }
        }
        liftCache.set(key, out);
    }
    return liftCache.get(key);
}

/** Method names actually available to build the synthetic host from `lifted`. */
export function liftedMethodNames(lifted) {
    return LIFTED_METHODS.filter((n) => typeof lifted[n] === 'string');
}

/* ── the proposed product wiring, as machine-checked find/replace pairs ──── */

/**
 * The properties `_sessionInstrumentClass` is permitted to read off the chart.
 * Cell N asserts every one of these is actually ASSIGNED in chart.js. The first
 * version of this patch read four properties that the product never sets, so
 * the wiring resolved an empty symbol, fell through to epoch alignment and
 * changed nothing — a green oracle over an unchanged defect. This list plus its
 * assertion is the structural guard against that recurring.
 */
export const SYMBOL_PROPERTIES_READ = ['currentSymbol'];

const SHARED_BUCKET_METHOD = `
    /**
     * Session-calendar bucket boundary — the SINGLE boundary implementation for
     * both resample paths (chart-data-pipeline.js _tryIncrementalResample calls
     * this same method). Correctness-class dependency per §A4c: if the module is
     * absent the legacy epoch floor is used and the loss is announced.
     */
    _sessionBucketStart(timestampMs, timeframe, timeframeMs) {
        const SC = (typeof SessionCalendar !== 'undefined' && SessionCalendar)
            || (typeof window !== 'undefined' && window.SessionCalendar)
            || null;
        if (!SC || typeof SC.bucketStart !== 'function') {
            if (typeof window !== 'undefined' && typeof window.__talariaMarkMissingModule === 'function') {
                window.__talariaMarkMissingModule('SessionCalendar');
            }
            return Math.floor(timestampMs / timeframeMs) * timeframeMs;
        }
        const instrumentClass = this._sessionInstrumentClass();
        if (!instrumentClass) {
            // Instrument identity not established. Keep today's grid — guessing a
            // session for an unidentified dataset would move displayed values on
            // no evidence — but ANNOUNCE it (§A4c): a chart showing epoch-aligned
            // days because it could not name its instrument is a degraded chart,
            // and the support passport must say so. Only announce for the
            // timeframes we would otherwise have changed; intraday loses nothing.
            if (SC.classifyTimeframe(timeframe).handled
                && typeof window !== 'undefined'
                && typeof window.__talariaMarkMissingModule === 'function') {
                window.__talariaMarkMissingModule('SessionCalendar.unresolved-instrument');
            }
            return SC.epochAlignedBucketStart(timestampMs, timeframeMs);
        }
        return SC.bucketStart(timestampMs, timeframe, {
            timeframeMs: timeframeMs,
            instrumentClass: instrumentClass,
        });
    }

    /**
     * Instrument class for session bucketing, or null when identity is unknown.
     *
     * \`currentSymbol\` is the ONLY symbol property chart.js assigns, but it holds
     * a DISPLAY LABEL, not a ticker: it can be \`EURUSD_FULL_1MIN_1MIN\`,
     * \`20251028_194229_GBPUSD\`, \`EUR/USD\`, \`FILE_1234\`, \`CHART\` or null.
     * Classification is therefore delegated to MarketCalculationEngine, which
     * already resolves exactly these shapes for P&L and is gated on
     * \`isRegistered()\` so an unrecognised label yields null instead of a guess.
     *
     * Memoised per symbol: the resample loop calls this once per bar, and
     * registry resolution splits and sorts the label on every call.
     */
    _sessionInstrumentClass() {
        const symbol = (typeof this.currentSymbol === 'string') ? this.currentSymbol : '';
        if (this._sessionClassCacheKey === symbol) return this._sessionClassCache;
        const SC = (typeof SessionCalendar !== 'undefined' && SessionCalendar)
            || (typeof window !== 'undefined' && window.SessionCalendar)
            || null;
        const engine = (typeof window !== 'undefined' && window.marketCalcEngine) || null;
        const resolved = (SC && typeof SC.classFromRegistry === 'function')
            ? SC.classFromRegistry(engine, symbol)
            : null;
        this._sessionClassCacheKey = symbol;
        this._sessionClassCache = resolved;
        return resolved;
    }
`;

export const WIRING_PATCH = {
    chartMethods: [
        {
            id: 'W1-full-seed-bucket',
            file: REL.chart,
            method: '_resampleDataFull',
            find: 'let currentBucketStart = Math.floor(prepared[0].t / timeframeMs) * timeframeMs;',
            replace: 'let currentBucketStart = this._sessionBucketStart(prepared[0].t, timeframe, timeframeMs);',
        },
        {
            id: 'W2-full-loop-bucket',
            file: REL.chart,
            method: '_resampleDataFull',
            find: 'const candleBucket = Math.floor(candle.t / timeframeMs) * timeframeMs;',
            replace: 'const candleBucket = this._sessionBucketStart(candle.t, timeframe, timeframeMs);',
        },
    ],
    chartAdditions: [
        { id: 'W3-shared-helper-method', file: REL.chart, source: SHARED_BUCKET_METHOD },
    ],
    pipeline: [
        {
            id: 'W4-incremental-bucket',
            file: REL.pipeline,
            method: '_tryIncrementalResample',
            find: 'const bucketStart = Math.floor(lastRaw.t / timeframeMs) * timeframeMs;',
            replace: 'const bucketStart = typeof chart._sessionBucketStart === \'function\'\n                ? chart._sessionBucketStart(lastRaw.t, tf, timeframeMs)\n                : Math.floor(lastRaw.t / timeframeMs) * timeframeMs;',
        },
        {
            // Pre-existing path divergence, independent of the session calendar:
            // the incremental branch assumes the appended bar is the newest and
            // silently folds an out-of-order arrival into the wrong bucket. Bail
            // to the full resample instead, which sorts. Required by requirement
            // (f) — the two paths must not disagree for any arrival order.
            //
            // The guard is a RUNNING MAXIMUM, not a comparison with the previous
            // element. Comparing with `source[source.length - 2]` passes a
            // staircase (one bar out of order, then a bar newer than its
            // immediate predecessor but still older than the true maximum) and
            // the two paths diverge anyway. The maximum is seeded by W5a on the
            // full-resample path and maintained here.
            id: 'W5b-incremental-running-max-bail',
            file: REL.pipeline,
            method: '_tryIncrementalResample',
            find: '            const timeframeMs = chart.parseTimeframe(tf);',
            replace: '            const cache = this._resampleCache;\n'
                + '            const maxRawT = cache ? cache.maxRawT : undefined;\n'
                + '            // Fail closed: an unseeded maximum cannot prove ordering.\n'
                + '            if (!Number.isFinite(maxRawT)) return null;\n'
                + '            if (lastRaw.t < maxRawT) return null;\n'
                + '            cache.maxRawT = lastRaw.t;\n\n'
                + '            const timeframeMs = chart.parseTimeframe(tf);',
        },
        {
            // Seed the running maximum wherever the cache is (re)written by a
            // full resample, so the first incremental append after any reset
            // compares against a real value rather than an inherited one.
            id: 'W5a-full-resample-seeds-running-max',
            file: REL.pipeline,
            method: 'getResampledSeries',
            find: '            cache.dataVersion = dv;\n            cache.result = full;\n            return full;',
            replace: '            cache.dataVersion = dv;\n'
                + '            cache.result = full;\n'
                + '            let seedMaxRawT = -Infinity;\n'
                + '            for (let i = 0; i < source.length; i++) {\n'
                + '                const st = source[i] && source[i].t;\n'
                + '                if (Number.isFinite(st) && st > seedMaxRawT) seedMaxRawT = st;\n'
                + '            }\n'
                + '            cache.maxRawT = seedMaxRawT;\n'
                + '            return full;',
        },
    ],
};

function applyPairs(text, pairs, label) {
    let out = text;
    for (const pair of pairs) {
        const occurrences = out.split(pair.find).length - 1;
        if (occurrences !== 1) {
            throw new Error(`${label}: patch ${pair.id} matched ${occurrences} sites, expected exactly 1`);
        }
        out = out.replace(pair.find, pair.replace);
    }
    return out;
}

/** True when the product source already carries the shared helper call. */
export function productIsWired(chartSource = readRepo(REL.chart), pipelineSource = readRepo(REL.pipeline)) {
    return chartSource.includes('_sessionBucketStart')
        && chartSource.includes('_sessionInstrumentClass')
        && pipelineSource.includes('_sessionBucketStart');
}

/**
 * Apply the whole wiring to a named file's text. Used both by the harness (for
 * `chart v 1.4`) and by the mirror cell (for `homepage/public/chart`), so the
 * oracle proves the patch lands on all FOUR files, not just the two it runs.
 */
export function patchFileText(rel, text) {
    const canonical = rel === REL.chartMirror ? REL.chart
        : rel === REL.pipelineMirror ? REL.pipeline
            : rel;
    let out = text;
    if (canonical === REL.chart) {
        out = applyPairs(out, WIRING_PATCH.chartMethods, rel);
        // Additions are appended to the class body in the real edit; for digest
        // purposes the marker is that the methods are absent beforehand.
        for (const addition of WIRING_PATCH.chartAdditions) {
            if (out.includes('_sessionBucketStart(timestampMs, timeframe, timeframeMs)')) {
                throw new Error(`${rel}: ${addition.id} already present`);
            }
        }
    } else if (canonical === REL.pipeline) {
        out = applyPairs(out, WIRING_PATCH.pipeline, rel);
    } else {
        throw new Error(`patchFileText: ${rel} is not a wiring target`);
    }
    return out;
}

/* ── harness ─────────────────────────────────────────────────────────────── */

export const MODES = {
    /** Real product source as committed. RED today. */
    PRODUCT: 'product',
    /** Real product source + in-memory WIRING_PATCH. §A5 state 2. */
    SIMULATE_WIRED: 'simulate-wired',
};

/**
 * Build a realm holding the real bucketing code.
 *
 * @param {{mode?:string, kill?:boolean, symbol?:string, corruptCalendar?:boolean}} options
 * @returns {{chart:object, pipeline:object, SC:object, sandbox:object, meta:object}}
 */
export function makeHarness(options = {}) {
    const {
        mode = MODES.PRODUCT,
        kill = false,
        symbol = 'EURUSD',
        corruptCalendar = false,
        // §A4c "capability loss without failure": the shell is served without
        // session-calendar.js at all. Simulated by not evaluating it in the realm,
        // which is exactly what a missing <script> tag produces.
        omitCalendar = false,
        // Same, for the instrument registry the wiring depends on.
        omitMarketCalc = false,
    } = options;

    const chartSource = readRepo(REL.chart);
    let pipelineSource = readRepo(REL.pipeline);
    let calendarSource = readRepo(REL.calendar);
    const lifted = liftChartMethods(chartSource);
    const alreadyWired = productIsWired(chartSource, pipelineSource);
    const liftedNames = liftedMethodNames(lifted);

    let methodsText = liftedNames.map((n) => lifted[n]).join('\n');
    let additions = '';
    let patched = false;

    if (mode === MODES.SIMULATE_WIRED && !alreadyWired) {
        methodsText = applyPairs(methodsText, WIRING_PATCH.chartMethods, 'chart.js');
        pipelineSource = applyPairs(pipelineSource, WIRING_PATCH.pipeline, 'chart-data-pipeline.js');
        additions = WIRING_PATCH.chartAdditions.map((a) => a.source).join('\n');
        patched = true;
    }

    if (corruptCalendar) {
        // §A5 state 3: deliberately corrupt the DEPENDENCY the oracle trusts.
        // A 17:00 anchor becomes 16:00 — a one-hour error the oracle must catch.
        const before = calendarSource;
        calendarSource = calendarSource.replace('dailyOpenMinute: 17 * 60,', 'dailyOpenMinute: 16 * 60,');
        if (calendarSource === before) throw new Error('corruptCalendar: anchor site not found');
    }

    const hostSource = `'use strict';
class TalariaResampleHost {
${methodsText}
${additions}
}
globalThis.TalariaResampleHost = TalariaResampleHost;
`;

    const missingModules = [];
    // Module load banners would interleave with assertion output; warnings and
    // errors still surface so a degraded realm cannot go unnoticed.
    const sandbox = { console: Object.assign(Object.create(console), { log: () => {} }) };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.__talariaMarkMissingModule = (id) => { missingModules.push(String(id)); };
    if (kill) sandbox[KILL_SWITCH] = true;
    vm.createContext(sandbox);
    if (!omitCalendar) {
        vm.runInContext(calendarSource, sandbox, { filename: 'session-calendar.vm.js' });
    }
    // The REAL instrument registry, in the same realm, exposed the way the
    // shells expose it (`window.marketCalcEngine`). The wiring resolves
    // instrument identity through this and nothing else.
    if (!omitMarketCalc) {
        vm.runInContext(readRepo(REL.marketCalc), sandbox, { filename: 'market-calculations.vm.js' });
    }
    vm.runInContext(pipelineSource, sandbox, { filename: 'chart-data-pipeline.vm.js' });
    vm.runInContext(hostSource, sandbox, { filename: 'chart.lifted-methods.vm.js' });

    // Count registry work so cell K can bound it: resolution is per-symbol, not
    // per-bar, and a regression to per-bar lookups is a hot-path cost defect.
    const registryCalls = { isRegistered: 0, getSpecs: 0 };
    const engine = sandbox.marketCalcEngine || null;
    if (engine) {
        for (const fn of ['isRegistered', 'getSpecs']) {
            const real = engine[fn].bind(engine);
            engine[fn] = (...args) => { registryCalls[fn] += 1; return real(...args); };
        }
    }

    const HostCtor = sandbox.TalariaResampleHost;
    const PipelineCtor = sandbox.ChartDataPipeline;
    if (typeof HostCtor !== 'function') throw new Error('harness: lifted host class missing');
    if (typeof PipelineCtor !== 'function') throw new Error('harness: real ChartDataPipeline missing');

    const chart = new HostCtor();
    chart.currentTimeframe = '1d';
    chart.dataVersion = 0;
    chart.data = [];
    chart.rawData = null;
    // `currentSymbol` and NOTHING ELSE. This is the only symbol property
    // chart.js assigns (13 assignment sites; zero for sessionCalendarSymbol /
    // currentPair / symbol / pair). An earlier harness set a property of its own
    // invention, which made a wiring that no-ops in the real product look
    // correct here. Cell N asserts this list matches the product's assignments.
    chart.currentSymbol = symbol;
    chart.bumpDataVersion = function () { this.dataVersion += 1; };

    const pipeline = new PipelineCtor(chart);
    chart.dataPipeline = pipeline;
    chart.resampleData = (data, tf) => pipeline.getResampledSeries(data, tf, chart.dataVersion);

    return {
        chart,
        pipeline,
        PipelineCtor,
        SC: sandbox.SessionCalendar || null,
        engine,
        registryCalls,
        sandbox,
        missingModules,
        meta: {
            mode,
            alreadyWired,
            patched,
            kill: !!kill,
            symbol,
            corruptCalendar: !!corruptCalendar,
            omitCalendar: !!omitCalendar,
            omitMarketCalc: !!omitMarketCalc,
            liftedFromProduct: liftedNames,
            liftedSha256: Object.fromEntries(liftedNames.map((n) => [n, sha256(lifted[n])])),
            chartSha256: sha256(chartSource),
            pipelineSha256: sha256(readRepo(REL.pipeline)),
            calendarSha256: sha256(readRepo(REL.calendar)),
        },
    };
}

/**
 * How many times chart.js ASSIGNS `this.<prop>`. Zero means the wiring would be
 * reading a property that does not exist — the exact defect that blocked the
 * first packet, made structurally checkable.
 */
export function chartAssignmentCount(prop, chartSource = readRepo(REL.chart)) {
    const re = new RegExp(`this\\.${prop}\\s*=[^=]`, 'g');
    return (chartSource.match(re) || []).length;
}

/** Properties the wiring's symbol resolver reads, scraped from the patch text. */
export function symbolPropertiesInPatch() {
    const source = WIRING_PATCH.chartAdditions.map((a) => a.source).join('\n');
    const body = source.slice(source.indexOf('_sessionInstrumentClass('));
    return [...new Set([...body.matchAll(/this\.(\w+)/g)].map((m) => m[1]))]
        .filter((p) => !p.startsWith('_session'));
}

/** Effective harness mode: PRODUCT unless simulation is requested and needed. */
export function resolveMode(requested) {
    const r = String(requested || '').toLowerCase();
    if (r === 'simulate-wired' || r === 'wired') return MODES.SIMULATE_WIRED;
    return MODES.PRODUCT;
}

/* ── deterministic fixtures ──────────────────────────────────────────────── */
//
// Prices are DYADIC RATIONALS: 1.25 + k/4096 with integer k. Every value is
// exactly representable in IEEE-754 double, and resampling performs only
// selection (first / last / max / min) plus integer volume sums. No rounding is
// possible anywhere, so the oracle compares with EXACT equality and declares
// epsilon = 0. No wall clock, no RNG, no UUID: `t` comes from the caller.

export const Q = (k) => 1.25 + k / 4096;

export function synthBar(i, t) {
    const a = (i * 37) % 1024;
    const b = (i * 53) % 1024;
    const hi = Math.max(a, b) + ((i * 11) % 64) + 1;
    const lo = Math.min(a, b) - ((i * 17) % 64) - 1;
    return { t, o: Q(a), h: Q(hi), l: Q(lo), c: Q(b), v: 1000 + ((i * 7) % 991) };
}

/**
 * FX weekend closures, hand-derived from the FX convention (market shuts
 * Friday 17:00 ET, reopens Sunday 17:00 ET) and written as explicit UTC
 * instants so the fixture never depends on the module under test.
 *
 * All windows below are in EST (UTC-5): Friday 22:00Z .. Sunday 22:00Z.
 */
export const FX_CLOSED_UTC = [
    [Date.UTC(2012, 11, 28, 22), Date.UTC(2012, 11, 30, 22)], // Fri 28 Dec 2012 .. Sun 30 Dec 2012
    [Date.UTC(2013, 0, 4, 22), Date.UTC(2013, 0, 6, 22)],     // Fri  4 Jan 2013 .. Sun  6 Jan 2013
    [Date.UTC(2013, 0, 11, 22), Date.UTC(2013, 0, 13, 22)],   // Fri 11 Jan 2013 .. Sun 13 Jan 2013
    [Date.UTC(2013, 0, 18, 22), Date.UTC(2013, 0, 20, 22)],   // Fri 18 Jan 2013 .. Sun 20 Jan 2013
    [Date.UTC(2013, 0, 25, 22), Date.UTC(2013, 0, 27, 22)],   // Fri 25 Jan 2013 .. Sun 27 Jan 2013
];

export function isFxClosed(t) {
    for (const [from, to] of FX_CLOSED_UTC) {
        if (t >= from && t < to) return true;
    }
    return false;
}

/** Weekend-aware FX raw bars — the shape the PO observed on 1H. */
export function fxBars(startMs, endMs, stepMs) {
    const out = [];
    let i = 0;
    for (let t = startMs; t < endMs; t += stepMs) {
        if (isFxClosed(t)) { i++; continue; }
        out.push(synthBar(i, t));
        i++;
    }
    return out;
}

/** Continuous 24/7 raw bars — used only where weekend realism is irrelevant. */
export function continuousBars(startMs, endMs, stepMs) {
    const out = [];
    let i = 0;
    for (let t = startMs; t < endMs; t += stepMs) {
        out.push(synthBar(i, t));
        i++;
    }
    return out;
}

/* ── PO-confirmed window (session 877, EURUSD, b75) ─────────────────────── */

export const PO_WINDOW = {
    /** Sun 30 Dec 2012 17:00 EST — session week open. */
    startMs: Date.UTC(2012, 11, 30, 22),
    /** Fri 25 Jan 2013 17:00 EST — session week close. */
    endMs: Date.UTC(2013, 0, 25, 22),
    stepMs: 3600000,
};

/** Literal expected constants, derived independently of session-calendar.js. */
export const EXPECTED = {
    /** Friday 4 Jan 2013's session: Thu 3 Jan 17:00 EST -> Fri 4 Jan 17:00 EST. */
    friday20130104: {
        openMs: Date.UTC(2013, 0, 3, 22),
        closeMs: Date.UTC(2013, 0, 4, 22),
        labelKey: '2013-01-04',
        labelWeekday: 'Fri',
    },
    /** Session weeks opening Sunday 17:00 EST, each named for the Monday. */
    weeks: [
        { openMs: Date.UTC(2012, 11, 30, 22), labelKey: '2012-12-31', labelWeekday: 'Mon' },
        { openMs: Date.UTC(2013, 0, 6, 22), labelKey: '2013-01-07', labelWeekday: 'Mon' },
        { openMs: Date.UTC(2013, 0, 13, 22), labelKey: '2013-01-14', labelWeekday: 'Mon' },
        { openMs: Date.UTC(2013, 0, 20, 22), labelKey: '2013-01-21', labelWeekday: 'Mon' },
    ],
    /** Labels that must NOT appear on the daily chart for the PO window. */
    forbiddenDailyLabels: ['2013-01-05', '2013-01-06', '2012-12-30'],
    /** Legacy epoch-week open the PO saw rendered as "Wed 2 Jan '13 19:00". */
    legacyEpochWeekOpenForJan4: Date.UTC(2013, 0, 3),
    /** DST transitions: local 17:00 anchor must hold; one 23h and one 25h day. */
    dst: {
        spring2013: {
            transitionLocalDate: '2013-03-10',
            shortSessionOpenMs: Date.UTC(2013, 2, 9, 22), // Sat 9 Mar 17:00 EST
            nextOpenMs: Date.UTC(2013, 2, 10, 21),        // Sun 10 Mar 17:00 EDT
            expectedSpanMs: 23 * 3600000,
        },
        fall2013: {
            transitionLocalDate: '2013-11-03',
            longSessionOpenMs: Date.UTC(2013, 10, 2, 21), // Sat 2 Nov 17:00 EDT
            nextOpenMs: Date.UTC(2013, 10, 3, 22),        // Sun 3 Nov 17:00 EST
            expectedSpanMs: 25 * 3600000,
        },
    },
};

/* ── display-layer emulation (independent of session-calendar.js) ────────── */
//
// What the crosshair shows: the bar's `t` rendered in the chart display zone.
// This is how the PO read "Sat 5 Jan '13 19:00" off the screen, so the RED
// assertions about a missing Friday / phantom Saturday are stated in these
// terms. It deliberately does NOT call the module under test.

const ET_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

export function renderedInEasternTime(ms) {
    const parts = ET_FORMATTER.formatToParts(new Date(ms));
    const get = (type) => (parts.find((p) => p.type === type) || {}).value;
    return {
        weekday: get('weekday'),
        key: `${get('year')}-${get('month')}-${get('day')}`,
        hhmm: `${get('hour')}:${get('minute')}`,
        stamp: `${get('weekday')} ${get('day')} ${get('month')} '${String(get('year')).slice(2)} ${get('hour')}:${get('minute')}`,
    };
}

/* ── serialization ───────────────────────────────────────────────────────── */

/** Canonical, exact, order-sensitive serialization of an OHLCV series. */
export function serializeSeries(series) {
    return (series || [])
        .map((b) => [b.t, b.o, b.h, b.l, b.c, b.v].join(','))
        .join('\n');
}

export function seriesSha256(series) {
    return sha256(serializeSeries(series));
}

/* ── evidence ────────────────────────────────────────────────────────────── */

export function writeEvidence(name, body) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = path.join(EVIDENCE_DIR, `${name}.json`);
    fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    return out;
}
