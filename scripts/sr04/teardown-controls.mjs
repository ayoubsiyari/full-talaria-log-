/**
 * teardown-controls.mjs — controls for the two census results that would otherwise be taken on trust.
 *
 * A. "zero self-re-arming rAF loops" is an empty result, and an empty result is unproven until the
 *    same detector finds a known instance elsewhere. chart.js animate() is the known instance.
 * B. removeEventListener only detaches when the CAPTURE FLAG also matches. The matcher ignored the
 *    third argument, so a pair agreeing on target/type/handler but disagreeing on capture would be
 *    reported as covered while leaking. This checks every matched pair for that disagreement.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskSource, scanListeners, classifyHandler } from './teardown-handler-match.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/* ---------------------------------------------------------- A. re-arm detector control */

function countSelfRearmingRaf(src) {
    const masked = maskSource(src);
    let n = 0;
    const re = /\brequestAnimationFrame\s*\(/g;
    let m;
    while ((m = re.exec(masked))) {
        const open = masked.indexOf('(', m.index);
        let depth = 0;
        let close = open;
        for (let i = open; i < masked.length; i++) {
            const c = masked[i];
            if (c === '(' || c === '{' || c === '[') depth++;
            else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) { close = i; break; } }
        }
        if (/requestAnimationFrame\s*\(/.test(masked.slice(open + 1, close))) n++;
    }
    return n;
}

// Synthetic fixture first: the detector must see a loop that is unambiguously there.
const FIXTURE = `
function loop() { requestAnimationFrame(() => { step(); requestAnimationFrame(loop); }); }
function once() { requestAnimationFrame(() => { paint(); }); }
`;
const fixtureFound = countSelfRearmingRaf(FIXTURE);

const CHART = 'chart v 1.4/chart/chart.js';
const chartRearm = countSelfRearmingRaf(read(CHART));
const OM = 'chart v 1.4/chart/modules/order-manager.js';
const omRearm = countSelfRearmingRaf(read(OM));

console.log('=== A. self-re-arming rAF detector control ===');
console.log(`  synthetic fixture (1 loop + 1 one-shot) ... detector found ${fixtureFound}  ${fixtureFound === 1 ? 'OK' : 'BROKEN'}`);
console.log(`  chart.js (known animate() loop) .......... detector found ${chartRearm}  ${chartRearm > 0 ? 'OK — detector sees real loops' : 'BROKEN — control found nothing'}`);
console.log(`  order-manager.js ......................... ${omRearm}`);
console.log(omRearm === 0 && chartRearm > 0 && fixtureFound === 1
    ? '  VERDICT: the zero is real. order-manager schedules frames, it does not own a frame loop.'
    : '  VERDICT: INCONCLUSIVE — do not report the zero.');

/* ---------------------------------------------------------- B. capture-flag agreement */

/** Re-scan capturing the third argument, which decides whether a remove actually detaches. */
function sitesWithCapture(src) {
    const masked = maskSource(src);
    const out = [];
    for (const kind of ['addEventListener', 'removeEventListener']) {
        const re = new RegExp(`\\.${kind}\\s*\\(`, 'g');
        let m;
        while ((m = re.exec(masked))) {
            const open = masked.indexOf('(', m.index);
            let depth = 0;
            let close = open;
            for (let i = open; i < masked.length; i++) {
                const c = masked[i];
                if (c === '(' || c === '[' || c === '{') depth++;
                else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { close = i; break; } }
            }
            const inner = masked.slice(open + 1, close);
            const args = [];
            let d = 0;
            let s = 0;
            for (let i = 0; i < inner.length; i++) {
                const c = inner[i];
                if (c === '(' || c === '[' || c === '{') d++;
                else if (c === ')' || c === ']' || c === '}') d--;
                else if (c === ',' && d === 0) { args.push(inner.slice(s, i)); s = i + 1; }
            }
            args.push(inner.slice(s));
            const third = (args[2] || '').trim();
            // Normalised: absent/false/{} without capture:true all mean bubble phase.
            const capture = /^true$/.test(third) || /capture\s*:\s*true/.test(third);
            const rawFirst = src.slice(open + 1, close).split(',')[0] || '';
            out.push({
                kind,
                line: src.slice(0, m.index).split('\n').length,
                type: rawFirst.replace(/^\s*['"`]|['"`]\s*$/g, '').trim(),
                handler: (args[1] || '').replace(/\s+/g, ' ').trim(),
                capture
            });
        }
    }
    return out;
}

const withCap = sitesWithCapture(read(OM));
const addsC = withCap.filter((s) => s.kind === 'addEventListener');
const removesC = withCap.filter((s) => s.kind === 'removeEventListener');

console.log('\n=== B. capture-flag agreement on paired listeners ===');
let mismatches = 0;
for (const r of removesC) {
    const partners = addsC.filter((a) => a.type === r.type && a.handler === r.handler);
    for (const a of partners) {
        if (a.capture !== r.capture) {
            mismatches++;
            console.log(`  MISMATCH '${r.type}' handler=${r.handler.slice(0, 40)}  add L${a.line} capture=${a.capture}  remove L${r.line} capture=${r.capture}`);
        }
    }
}
console.log(`  capture-flag mismatches among textually paired listeners: ${mismatches}`);
console.log(`  (capture-using sites: ${addsC.filter((a) => a.capture).length} adds, ${removesC.filter((r) => r.capture).length} removes)`);

/* ---------------------------------------------------------- C. stash-on-object idiom */

console.log('\n=== C. handlers stashed on a foreign object rather than on `this` ===');
const stashed = [...read(OM).matchAll(/(\w+)\._(\w+)\s*=\s*(\w+)\s*;/g)]
    .filter((m) => removesC.some((r) => r.handler.includes(`_${m[2]}`)));
for (const m of stashed) {
    console.log(`  ${m[1]}._${m[2]} = ${m[3]}   — reachable only via that object, so a manager-level teardown cannot see it`);
}
console.log(`  ${stashed.length} such site(s)`);
