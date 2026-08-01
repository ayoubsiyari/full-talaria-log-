/**
 * Apply resolver mutants ON DISK to BOTH mirrors of modules/trade-attribution.js,
 * run the suite, restore. A mutant that does not apply exactly once per copy is
 * reported NOT_APPLIED loudly rather than silently counted as a kill.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const FILES = [
    path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'trade-attribution.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'trade-attribution.js'),
];
const SUITE = 'scripts/sr04/trade-attribution-resolver.test.mjs';

const MUTANTS = [
    { id: 'M1 host-fallback',
      find: '        return match || null;\n    }',
      repl: '        return match || charts[0] || null;\n    }' },
    { id: 'M2 guess-first-match',
      find: '            if (match && match !== chart) return null;   // ambiguous — never guess',
      repl: '            if (match && match !== chart) return match;   // ambiguous — never guess' },
    { id: 'M3 killswitch === true',
      find: '            && global.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1) {',
      repl: '            && global.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1 === true) {' },
    { id: 'M4 drop string coercion',
      find: '            if (id == null || String(id) !== key) continue;',
      repl: '            if (id == null || id !== key) continue;' },
    { id: 'M5 injected source ignored (always window walk)',
      find: '            if (typeof chartSource === \'function\') charts = chartSource();',
      repl: '            if (false) charts = chartSource();' },
    { id: 'M6 default source no longer walks frames',
      find: '                    if (frame.contentWindow) _talariaCollectChartsForAttribution(frame.contentWindow, out, seen);',
      repl: '                    if (false) _talariaCollectChartsForAttribution(frame.contentWindow, out, seen);' },
    { id: 'NEGATIVE-CONTROL', find: 'needle-that-cannot-exist-zzz', repl: 'x', expectNotApplied: true },
];

const originals = FILES.map((f) => readFileSync(f, 'utf8'));
const baseHash = createHash('sha256').update(originals.join('')).digest('hex').slice(0, 16);
const results = [];

for (const m of MUTANTS) {
    const counts = FILES.map((f, i) => originals[i].split(m.find).length - 1);
    if (!counts.every((n) => n === 1)) {
        results.push({ id: m.id, status: m.expectNotApplied ? 'NOT_APPLIED (expected)' : 'NOT_APPLIED — NEEDLE BROKEN', counts });
        FILES.forEach((f, i) => writeFileSync(f, originals[i]));
        continue;
    }
    FILES.forEach((f, i) => writeFileSync(f, originals[i].replace(m.find, m.repl)));
    let status = 'SURVIVED', killedBy = null;
    try {
        execSync(`node --test ${SUITE}`, { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
        const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
        killedBy = [...new Set((out.match(/✖ (C\d+[^\n(]*)/g) || []).map((s) => s.replace('✖ ', '').trim()))];
        status = 'KILLED';
    }
    FILES.forEach((f, i) => writeFileSync(f, originals[i]));
    results.push({ id: m.id, status, killedBy });
}

const restoreHash = createHash('sha256').update(FILES.map((f) => readFileSync(f, 'utf8')).join('')).digest('hex').slice(0, 16);
console.log(JSON.stringify({ baseHash, restoreHash, restored: baseHash === restoreHash, results }, null, 2));
