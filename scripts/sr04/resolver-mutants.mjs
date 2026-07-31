/**
 * Apply resolver mutants ON DISK to BOTH mirrors, run the suite, restore.
 * A mutant that does not apply exactly once per copy is reported NOT_APPLIED loudly
 * rather than silently counted as a kill.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const FILES = [
    path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js'),
];
const SUITE = 'scripts/sr04/trade-attribution-resolver.test.mjs';

const MUTANTS = [
    { id: 'M1 host-fallback',      find: '    return match || null;\n}',                       repl: '    return match || (typeof window !== "undefined" ? window.chart : null) || null;\n}' },
    { id: 'M2 guess-first-match',  find: '        if (match && match !== chart) return null;   // ambiguous — never guess', repl: '        if (match && match !== chart) return match;   // ambiguous — never guess' },
    { id: 'M3 killswitch-eq-true', find: 'window.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1) {', repl: 'window.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 === true) {' },
    { id: 'M4 resolve-by-focus',   find: '    const wanted = order.sourceFileId;',             repl: '    try { const a = window.getActiveChart && window.getActiveChart(); if (a) return a; } catch (_e) {}\n    const wanted = order.sourceFileId;' },
    { id: 'M5 drop-string-coerce', find: '        if (id == null || String(id) !== key) continue;', repl: '        if (id == null || id !== key) continue;' },
    { id: 'NEGATIVE-CONTROL',      find: 'this-needle-does-not-exist-anywhere-zzz',            repl: 'x', expectNotApplied: true },
];

const originals = FILES.map((f) => readFileSync(f, 'utf8'));
const baseHash = createHash('sha256').update(originals.join('')).digest('hex').slice(0, 16);
const results = [];

for (const m of MUTANTS) {
    let appliedPerFile = [];
    for (const [i, f] of FILES.entries()) {
        const src = originals[i];
        const n = src.split(m.find).length - 1;
        appliedPerFile.push(n);
        if (n === 1) writeFileSync(f, src.replace(m.find, m.repl));
    }
    const applied = appliedPerFile.every((n) => n === 1);
    if (!applied) {
        results.push({ id: m.id, status: m.expectNotApplied ? 'NOT_APPLIED (expected)' : 'NOT_APPLIED — NEEDLE BROKEN', counts: appliedPerFile });
        FILES.forEach((f, i) => writeFileSync(f, originals[i]));
        continue;
    }
    let killedBy = null, survived = false;
    try {
        execSync(`node --test ${SUITE}`, { cwd: ROOT, stdio: 'pipe' });
        survived = true;
    } catch (e) {
        const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
        killedBy = (out.match(/✖ (C\d+[^\n(]*)/g) || []).map((s) => s.replace('✖ ', '').trim());
    }
    FILES.forEach((f, i) => writeFileSync(f, originals[i]));
    results.push({ id: m.id, status: survived ? 'SURVIVED' : 'KILLED', killedBy });
}

const restoreHash = createHash('sha256').update(FILES.map((f) => readFileSync(f, 'utf8')).join('')).digest('hex').slice(0, 16);
console.log(JSON.stringify({ baseHash, restoreHash, restored: baseHash === restoreHash, results }, null, 2));
