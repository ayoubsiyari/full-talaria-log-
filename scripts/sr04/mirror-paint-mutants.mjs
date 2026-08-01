/**
 * mirror-paint-mutants.mjs — do the REGIME-01 cadence cells actually bite?
 *
 * Each mutant is a plausible wrong version of the host mirror paint fix. A surviving mutant means
 * the oracle would have let that version ship. Run: node scripts/sr04/mirror-paint-mutants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = 'chart v 1.4/chart/modules/replay-system.js';
const MIRROR_REL = 'homepage/public/chart/modules/replay-system.js';
const TEST = 'scripts/sr04/mirror-paint-cadence.test.mjs';

const FIXED = `            if (_mcMirrorPaintCoalesceDisabled() && !(passivePlay || lightPass)) {
                chart.renderPending = true;
            } else {
                chart.renderPending = false;
            }
            chart.render();`;

const MUTANTS = [
    {
        id: 'M1',
        why: 'never fixed at all — flag set true then paint, the original double paint',
        body: `            chart.renderPending = true;
            chart.render();`
    },
    {
        id: 'M2',
        why: 'flag polarity inverted — kill-switch turns the fix ON instead of off',
        body: `            if (!_mcMirrorPaintCoalesceDisabled() && !(passivePlay || lightPass)) {
                chart.renderPending = true;
            } else {
                chart.renderPending = false;
            }
            chart.render();`
    },
    {
        id: 'M3',
        why: 'clears AFTER the paint — loses a scheduleRender raised during the paint',
        body: `            chart.render();
            chart.renderPending = false;`
    },
    {
        id: 'M4',
        why: 'stops painting entirely and leans on the coalescer (the PURGE-2 shape)',
        body: `            chart.renderPending = true;`
    },
    {
        id: 'M5',
        why: 'strict === true on the switch, so 1 / "yes" silently fail to disable',
        body: `            if (typeof window !== 'undefined'
                    && window.__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1 === true
                    && !(passivePlay || lightPass)) {
                chart.renderPending = true;
            } else {
                chart.renderPending = false;
            }
            chart.render();`
    },
    {
        id: 'M6',
        why: 'fix applies only when no orders exist — greens LAG-ZT and leaves the trade arm broken',
        body: `            const _hasOrders = !!(chart.orderManager && chart.orderManager.orders
                && chart.orderManager.orders.length);
            if (_hasOrders && !(passivePlay || lightPass)) {
                chart.renderPending = true;
            } else {
                chart.renderPending = false;
            }
            chart.render();`
    }
];

const abs = path.join(REPO, REL);
const absMirror = path.join(REPO, MIRROR_REL);
const original = fs.readFileSync(abs, 'utf8');
const originalMirror = fs.readFileSync(absMirror, 'utf8');

if (!original.includes(FIXED)) {
    console.error('FATAL: fixed block not found verbatim — mutants cannot be applied.');
    process.exit(2);
}

let killed = 0;
const survivors = [];

console.log('Mutating the host mirror paint block; the cadence oracle should kill each.\n');

for (const m of MUTANTS) {
    const mutated = original.replace(FIXED, m.body);
    if (mutated === original) {
        console.log(`  ${m.id}  SKIPPED (no-op substitution)`);
        continue;
    }
    fs.writeFileSync(abs, mutated);
    fs.writeFileSync(absMirror, mutated);   // keep mirrors equal so R8 is not the only killer
    let out = '';
    let ok = true;
    try {
        out = execFileSync(process.execPath, ['--test', TEST],
            { cwd: REPO, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 1024 * 64 });
    } catch (e) {
        ok = false;
        out = `${e.stdout || ''}${e.stderr || ''}`;
    }
    const failing = [...out.matchAll(/✖ (R\d+)/g)].map((x) => x[1]);
    if (ok) {
        survivors.push(m);
        console.log(`  ${m.id}  SURVIVED  <-- ${m.why}`);
    } else {
        killed++;
        console.log(`  ${m.id}  killed by ${failing.join(', ') || '(suite error)'}   ${m.why}`);
    }
    fs.writeFileSync(abs, original);
    fs.writeFileSync(absMirror, originalMirror);
}

const restored = fs.readFileSync(abs, 'utf8') === original
    && fs.readFileSync(absMirror, 'utf8') === originalMirror;
console.log(`\n${killed}/${MUTANTS.length} killed; source restored: ${restored ? 'yes' : 'NO — CHECK GIT'}`);
if (survivors.length) {
    console.log('\nSurvivors mean the oracle would have shipped these:');
    for (const s of survivors) console.log(`  ${s.id}: ${s.why}`);
}
process.exit(survivors.length || !restored ? 1 : 0);
