/**
 * A/SR-06 — EVENT RATE: the missing unit-converter.
 *
 * Every per-event number published today (mine, B's) needs events/s to become a share
 * of the 708 ms/s occupancy. This evaluates the REAL getCandlePlaybackCadence extracted
 * from replay-system.js across the speed ladder, and establishes what an "event" is for
 * the pipeline — i.e. what actually invalidates the caches and forces the expensive path.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RS = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const CHART = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');

function extractMethod(src, name) {
    const re = new RegExp(`^\\s{4}${name}\\s*\\(`, 'm');
    const m = re.exec(src);
    if (!m) throw new Error(`extract failed: ${name}`);
    let i = src.indexOf('{', m.index), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
    }
    throw new Error(`unbalanced ${name}`);
}

const rsSrc = readFileSync(RS, 'utf8');
const cadenceSrc = extractMethod(rsSrc, 'getCandlePlaybackCadence');

const Harness = new Function(`
    "use strict";
    return class H {
        constructor(speed, opts) {
            this.speed = speed;
            this.isPlaying = true;
            this._sub = (opts && opts.subdivisions) || 1;
            this._orderMoney = !!(opts && opts.orderMoneyPath);
            this._batch = !(opts && opts.batchDisabled);
        }
        _getOrderExecutionCadenceMs() { return this._orderMoney ? 100 : null; }
        _isOrderMoneyPathBatchEnabled() { return this._batch; }
        _isFinestTfCandleCadenceFixEnabled() { return true; }
        _isFinestTfCadenceSubStepActive() { return this._sub > 1; }
        _finestTfCadenceSubdivisions() { return this._sub; }
        ${cadenceSrc}
    };
`)();

const SPEEDS = [1, 2, 5, 10, 30, 60, 120, 240];
const rows = [];
for (const speed of SPEEDS) {
    for (const [label, opts] of [
        ['plain', { subdivisions: 1 }],
        ['sub-tick x4', { subdivisions: 4 }],
        ['order money path', { subdivisions: 1, orderMoneyPath: true }],
    ]) {
        const c = new Harness(speed, opts).getCandlePlaybackCadence();
        const ticksPerSec = 1000 / c.intervalMs;
        rows.push({
            speed, mode: label,
            intervalMs: c.intervalMs,
            stepsPerTick: c.stepsPerTick,
            ticksPerSec: +ticksPerSec.toFixed(2),
            stepsPerSec: +(ticksPerSec * c.stepsPerTick).toFixed(2),
        });
    }
}

// What invalidates the pipeline caches? Count dataVersion bump sites on the replay path.
const chartSrc = readFileSync(CHART, 'utf8');
const bumpDefs = (chartSrc.match(/bumpDataVersion\s*\(/g) || []).length;
const rsBumps = (rsSrc.match(/bumpDataVersion\s*\(/g) || []).length;
const rsResample = (rsSrc.match(/\.resampleData\s*\(/g) || []).length;
// Positive control: a matcher that must find plenty, proving the scan sees content.
const control = (rsSrc.match(/this\.currentIndex/g) || []).length;

console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    cadence: rows,
    invalidation: {
        bumpDataVersion_in_chart_js: bumpDefs,
        bumpDataVersion_in_replay_system: rsBumps,
        direct_resampleData_calls_in_replay_system: rsResample,
        positive_control_currentIndex_hits: control,
    },
}, null, 2));
