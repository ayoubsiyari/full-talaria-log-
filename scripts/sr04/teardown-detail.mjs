/**
 * teardown-detail.mjs — the three things the aggregate census hides.
 *
 * 1. Remove calls that pair with no add. A removeEventListener whose reference never matches is a
 *    silent no-op that makes a file LOOK torn down, which is worse than an obvious gap.
 * 2. Self-re-arming rAF loops. An uncancelled one-shot fires once into a dead object; an uncancelled
 *    SELF-RE-ARMING loop runs forever and pins the whole realm. Same count, different severity.
 * 3. Whether a pending one-shot closes over anything, since that decides leak vs misfire.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskSource, scanListeners, scanTimers, classifyHandler } from './teardown-handler-match.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = process.argv[2] || path.join('chart v 1.4', 'chart', 'modules', 'order-manager.js');
const src = fs.readFileSync(path.join(REPO, REL), 'utf8');
const masked = maskSource(src);
const lines = src.split('\n');

const listeners = scanListeners(src);
const adds = listeners.filter((s) => s.kind === 'addEventListener');
const removes = listeners.filter((s) => s.kind === 'removeEventListener');
const norm = (s) => `${s.target}|${s.type}|${s.handler}`;
const addKeys = new Set(adds.map(norm));

console.log('=== 1. REMOVE CALLS THAT PAIR WITH NO ADD (candidate no-ops) ===');
const orphanRemoves = removes.filter((r) => !addKeys.has(norm(r)));
console.log(`  ${orphanRemoves.length} of ${removes.length} remove sites have no add with the same target+type+handler\n`);
for (const r of orphanRemoves) {
    const sameTypeAdds = adds.filter((a) => a.type === r.type);
    console.log(`  L${r.line}  ${r.target}.removeEventListener('${r.type}', ${r.handler})`);
    if (!sameTypeAdds.length) {
        console.log(`      no add for '${r.type}' anywhere in this file`);
    } else {
        for (const a of sameTypeAdds.slice(0, 3)) {
            console.log(`      add L${a.line}: ${a.target}.${a.type} handler=${a.handler.slice(0, 62)} [${classifyHandler(a.handler)}]`);
        }
    }
}

console.log('\n=== 2. requestAnimationFrame: SELF-RE-ARMING vs ONE-SHOT ===');
const timers = scanTimers(src).filter((t) => t.api === 'requestAnimationFrame');
let reArming = 0;
let oneShot = 0;
const reArmingSites = [];
// Offsets are resolved by scanning for the call itself. Deriving them from a line number lands at
// the END of that line and finds a paren further down the file — which reported a confident zero.
const rafOffsets = [...masked.matchAll(/\brequestAnimationFrame\s*\(/g)].map((m) => m.index);
for (let ti = 0; ti < timers.length; ti++) {
    const t = timers[ti];
    const callIdx = rafOffsets.find((o) => masked.slice(0, o).split('\n').length === t.line);
    if (callIdx === undefined) continue;
    const open = masked.indexOf('(', callIdx);
    let depth = 0;
    let close = open;
    for (let i = open; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '{' || c === '[') depth++;
        else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) { close = i; break; } }
    }
    const body = src.slice(open, close);
    const selfArms = /requestAnimationFrame\s*\(/.test(body);
    if (selfArms) { reArming++; reArmingSites.push({ line: t.line, retained: t.retained, slot: t.slot }); }
    else oneShot++;
}
console.log(`  self-re-arming (pins the realm until cancelled) .. ${reArming}`);
console.log(`  one-shot (fires once into a dead object) ......... ${oneShot}`);
for (const s of reArmingSites) {
    console.log(`    L${String(s.line).padStart(6)}  id retained=${s.retained}  slot=${s.slot || '(none)'}   ${lines[s.line - 1].trim().slice(0, 88)}`);
}

console.log('\n=== 3. UNCANCELLABLE setTimeout: what the pending callback holds ===');
const st = scanTimers(src).filter((t) => t.api === 'setTimeout' && !t.retained);
let touchesThis = 0;
for (const t of st) {
    const seg = lines.slice(t.line - 1, t.line + 14).join('\n');
    if (/\bthis\./.test(seg)) touchesThis++;
}
console.log(`  ${st.length} uncancellable setTimeout sites; ${touchesThis} reference \`this\` in the scheduled body`);
console.log('  (a pending one-shot over `this` keeps the manager alive for its delay and then runs');
console.log('   against a torn-down object — a misfire hazard, and only a leak while it is pending)');

console.log('\n=== 4. WHAT _m20A1Teardown ACTUALLY COVERS ===');
const tIdx = masked.indexOf('\n    _m20A1Teardown');
if (tIdx === -1) console.log('  not found');
else {
    let depth = 0;
    let end = tIdx;
    for (let i = masked.indexOf('{', tIdx); i < masked.length; i++) {
        const c = masked[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(tIdx, end + 1);
    const startLine = src.slice(0, tIdx).split('\n').length + 1;
    console.log(`  L${startLine}, ${body.split('\n').length} lines`);
    console.log(`    removeEventListener .... ${(body.match(/removeEventListener/g) || []).length}`);
    console.log(`    clearTimeout/Interval .. ${(body.match(/clear(Timeout|Interval)/g) || []).length}`);
    console.log(`    cancelAnimationFrame ... ${(body.match(/cancelAnimationFrame/g) || []).length}`);
    console.log(`    disconnect() ........... ${(body.match(/\.disconnect\s*\(/g) || []).length}`);
    const callers = (masked.match(/_m20A1Teardown\s*\(/g) || []).length - 1;
    console.log(`    call sites elsewhere ... ${callers}`);
}

console.log('\n=== 5. OBSERVERS ===');
for (const o of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const made = (masked.match(new RegExp(`new ${o}\\b`, 'g')) || []).length;
    console.log(`  ${o.padEnd(22)} constructed=${made}`);
}
console.log(`  .disconnect() calls in file: ${(masked.match(/\.disconnect\s*\(/g) || []).length}`);
