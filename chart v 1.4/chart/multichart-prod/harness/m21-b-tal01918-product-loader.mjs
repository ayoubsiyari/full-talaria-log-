/**
 * TAL-01918 RED — product loader.
 *
 * Loads REAL product code, never a re-implementation:
 *   - chart.js resample/trim/walk-forward methods are extracted verbatim by
 *     source span and installed on a class built from that exact text. Every
 *     extracted span is SHA-256 pinned and emitted into evidence.
 *   - chart-data-pipeline.js and replay-system.js are required directly
 *     (both export cleanly under Node).
 *
 * No product file is written by this harness.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const CHART_DIR = path.resolve(__dirname, '..', '..');
export const CHART_JS = path.join(CHART_DIR, 'chart.js');
export const MODULES_DIR = path.join(CHART_DIR, 'modules');

export const KILL_SWITCH_Q9 = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';
export const DIAG_GLOBAL = '__TALARIA_TRIM_WINDOW_DIAG';

/**
 * Methods lifted verbatim from chart.js. Order is irrelevant (class body).
 * Each must be a 4-space-indented class method terminated by a bare `    }`.
 */
export const EXTRACTED_METHODS = [
    '_getReplayPlayheadMs',
    '_getNativeRawStepMs',
    '_getBarPeriodEndMs',
    '_aggregateFinerBarsWalkForward',
    '_getWalkForwardOhlcToPlayhead',
    '_trimBarOhlcToReplayPlayhead',
    '_trimLastDataBarToReplayPlayhead',
    '_measureRawDataStepMs',
    '_prepareBarsForResampling',
    '_resampleDataFull',
    'resampleData',
    'parseTimeframe',
];

export function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function bracesBalanced(text) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth < 0) return false;
    }
    return depth === 0;
}

/**
 * Extract one 4-space-indented class method by exact source span.
 * Start: first line matching /^    <name>\(/. End: first following line that is
 * exactly `    }`. Validated by brace balance and by successful compilation.
 */
export function extractMethodSource(src, name) {
    const lines = src.split('\n');
    const head = new RegExp(`^    ${name.replace(/[$]/g, '\\$')}\\(`);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (head.test(lines[i])) { start = i; break; }
    }
    if (start < 0) throw new Error(`chart.js: method not found: ${name}`);
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i] === '    }') { end = i; break; }
    }
    if (end < 0) throw new Error(`chart.js: unterminated method: ${name}`);
    const text = lines.slice(start, end + 1).join('\n');
    if (!bracesBalanced(text)) {
        throw new Error(`chart.js: brace-unbalanced extraction for ${name}`);
    }
    return { name, text, startLine: start + 1, endLine: end + 1, sha256: sha256(text) };
}

/**
 * Build a class whose bodies are the verbatim chart.js method sources.
 * The only added member is `_m21bBarWindowProbe` (name reserved for this brief),
 * a harness-owned read-only probe. It is added AFTER construction of the class
 * so it can never shadow a product method.
 */
export function loadProductChartSurface() {
    const src = fs.readFileSync(CHART_JS, 'utf8');
    const spans = EXTRACTED_METHODS.map((n) => extractMethodSource(src, n));
    const body = spans.map((s) => s.text).join('\n\n');
    // eslint-disable-next-line no-new-func -- first-party repo source, SHA-256 pinned below.
    const Ctor = new Function(`"use strict";\nreturn class ProductChartSurface {\n${body}\n};`)();

    if (Object.prototype.hasOwnProperty.call(Ctor.prototype, '_m21bBarWindowProbe')) {
        throw new Error('name collision: product already defines _m21bBarWindowProbe');
    }
    /**
     * Harness probe (reserved name). Returns the current last-display-bar window
     * facts WITHOUT touching product state. Pure read.
     */
    Ctor.prototype._m21bBarWindowProbe = function _m21bBarWindowProbe() {
        const data = Array.isArray(this.data) ? this.data : [];
        if (!data.length) return null;
        const lastIdx = data.length - 1;
        const bar = data[lastIdx];
        const tfMs = this.parseTimeframe(this.currentTimeframe);
        const bucketStart = Number(bar.t);
        const rec = {
            lastIdx,
            bucketStart,
            bucketEndExclusive: bucketStart + tfMs,
            tfMs,
            playheadMs: this._getReplayPlayheadMs(),
            barKeys: Object.keys(bar).slice().sort(),
            walkForwardOnNativeTf: null,
        };
        const diag = globalThis[DIAG_GLOBAL];
        if (diag && Array.isArray(diag.probes)) diag.probes.push(rec);
        return rec;
    };

    return {
        Ctor,
        spans,
        chartJsSha256: sha256(src),
        chartJsBytes: Buffer.byteLength(src, 'utf8'),
    };
}

function withWindowStub(fn) {
    const g = globalThis;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    if (!had) g.window = {};
    try { return fn(); } finally {
        if (had) g.window = prev; else delete g.window;
    }
}

export function loadChartDataPipeline() {
    const p = path.join(MODULES_DIR, 'chart-data-pipeline.js');
    delete require.cache[require.resolve(p)];
    return require(p);
}

export function loadReplaySystem() {
    const p = path.join(MODULES_DIR, 'replay-system.js');
    return withWindowStub(() => {
        delete require.cache[require.resolve(p)];
        return require(p);
    });
}

export function readModuleSource(rel) {
    return fs.readFileSync(path.join(MODULES_DIR, rel), 'utf8');
}

export function readChartJsSource() {
    return fs.readFileSync(CHART_JS, 'utf8');
}

/** Run `fn` with the M20-Q9 kill-switch forced to `value` (true = fix disabled). */
export function withQ9KillSwitch(value, fn) {
    const g = globalThis;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    g.window = Object.assign({}, prev, { [KILL_SWITCH_Q9]: value });
    try { return fn(); } finally {
        if (had) g.window = prev; else delete g.window;
    }
}
