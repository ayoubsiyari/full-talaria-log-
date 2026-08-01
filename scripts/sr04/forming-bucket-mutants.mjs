/** Apply forming-bucket mutants on disk to BOTH mirrors, run the suite, restore. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const FILES = [
    path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-data-pipeline.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'chart-data-pipeline.js'),
];
const SUITE = 'scripts/sr04/forming-bucket-refresh.test.mjs';

const MUTANTS = [
    { id: 'M1 no-walkback (last bar only)',
      find: '            let firstIdx = source.length - 1;\n            while (firstIdx > 0) {',
      repl: '            let firstIdx = source.length - 1;\n            while (false) {' },
    { id: 'M2 drop tail-bucket guard',
      find: '            if (!lastBucket || lastBucket.t !== bucketStart) return null;',
      repl: '            if (!lastBucket) return null;' },
    { id: 'M3 killswitch === true',
      find: '&& !!global.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1;',
      repl: '&& global.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1 === true;' },
    { id: 'M4 open from tail not bucket-first',
      find: 'out[out.length - 1] = { t: bucketStart, o: first.o, h, l, c: lastRaw.c, v };',
      repl: 'out[out.length - 1] = { t: bucketStart, o: lastRaw.o, h, l, c: lastRaw.c, v };' },
    { id: 'M5 stale close',
      find: 'out[out.length - 1] = { t: bucketStart, o: first.o, h, l, c: lastRaw.c, v };',
      repl: 'out[out.length - 1] = { t: bucketStart, o: first.o, h, l, c: first.c, v };' },
    { id: 'M6 skip dataVersion inequality',
      find: '                && cache.dataVersion !== dv\n',
      repl: '' },
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
