#!/usr/bin/env node
/**
 * IDLE-WINDOW-REPORT — turns the idle arms into the one number C needs: how long
 * to wait before a memory reading is stable, per dpr.
 *
 * Reports MEASURED elapsed, not sample labels. The arena instrument labels its
 * samples by nominal interval (`idle+30s`), while consecutive samples are ~55 s
 * apart in wall time because each one costs a forced collection, a settle and an
 * OS process query. A protocol copied from the labels would wait 30 s where 55 s
 * was actually needed, and this row exists because C is about to build that wait
 * into every reading in the soak.
 *
 *   node scripts/idle-window-report.mjs
 *   node scripts/idle-window-report.mjs --files=a.json,b.json --stable=2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockOf } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

/** MB. Two consecutive readings within this of each other count as settled. */
const STABLE_BAND = Number(argOf('stable', '2.0'));
const DEFAULT = ['dpr1', 'dpr2', 'dpr2b'].map((a) => `docs/plan3/evidence/idle-transient-clean-${a}.json`);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Samples carry a label and a time; the time is what we trust. The figures sit
 * under `process`, and the first version of this reader looked for them beside
 * `at` — it parsed nothing and said TOO_FEW_SAMPLES, which reads like a short run
 * rather than a reader bound to the wrong shape. Hence NO_SAMPLES_PARSED below.
 */
export function samplesOf(report) {
  const list = Array.isArray(report?.samples) ? report.samples
    : Array.isArray(report?.arms) ? report.arms.flatMap((a) => a.samples || [])
      : [];
  return list.map((s) => {
    const p = s.process || s;
    return {
      at: new Date(s.at || s.timestamp || 0),
      label: s.label || s.phase || '',
      total: num(p.totalPrivateMB ?? p.total ?? p.totalMB),
      gpu: num(p.gpuPrivateMB ?? p.gpu),
      renderer: num(p.rendererPrivateMB ?? p.renderer),
    };
  }).filter((r) => Number.isFinite(r.at.getTime()) && r.at.getTime() > 0 && r.total !== null)
    .sort((a, b) => a.at - b.at);
}

export function analyse(rows) {
  if (rows.length === 0) return { state: 'NO_SAMPLES_PARSED', n: 0 };
  if (rows.length < 2) return { state: 'TOO_FEW_SAMPLES', n: rows.length };
  const t0 = rows[0].at.getTime();
  const seq = rows.map((r) => ({ ...r, elapsedS: Math.round((r.at.getTime() - t0) / 1000) }));
  let settledAt = null;
  for (let i = 1; i < seq.length; i += 1) {
    if (Math.abs(seq[i].total - seq[i - 1].total) <= STABLE_BAND) { settledAt = seq[i].elapsedS; break; }
  }
  const tail = seq.slice(Math.max(1, seq.length - 4));
  const drift = tail.length > 1 ? tail[tail.length - 1].total - tail[0].total : 0;
  return {
    state: settledAt === null ? 'NEVER_SETTLED_IN_WINDOW' : 'SETTLED',
    n: seq.length,
    firstToSecondDeltaMB: Number((seq[1].total - seq[0].total).toFixed(2)),
    gpuFirstToSecondMB: seq[0].gpu !== null && seq[1].gpu !== null ? Number((seq[1].gpu - seq[0].gpu).toFixed(2)) : null,
    settledAfterSeconds: settledAt,
    lastElapsedSeconds: seq[seq.length - 1].elapsedS,
    tailDriftMB: Number(drift.toFixed(2)),
    // The label the instrument prints against the elapsed time actually observed.
    labelVsMeasured: seq.slice(0, 3).map((s) => `${s.label || '?'}@${s.elapsedS}s`),
    seq: seq.map((s) => ({ elapsedS: s.elapsedS, label: s.label, total: s.total, gpu: s.gpu, renderer: s.renderer })),
  };
}

function main() {
  const files = (argOf('files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const rel of (files.length ? files : DEFAULT)) {
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) { console.log(`[idle-window] SUBJECT_ABSENT: ${rel}`); continue; }
    const report = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const a = analyse(samplesOf(report));
    out.push({ rel, dpr: report?.inputs?.dpr ?? null, ...a });
    console.log(`\n[idle-window] ${rel}  dpr=${report?.inputs?.dpr ?? '?'}  ${a.state}  n=${a.n}`);
    if (a.state === 'TOO_FEW_SAMPLES') continue;
    console.log(`   first->second: total ${a.firstToSecondDeltaMB >= 0 ? '+' : ''}${a.firstToSecondDeltaMB} MB`
      + `${a.gpuFirstToSecondMB === null ? '' : `, gpu ${a.gpuFirstToSecondMB >= 0 ? '+' : ''}${a.gpuFirstToSecondMB} MB`}`);
    console.log(`   settled after: ${a.settledAfterSeconds === null ? 'never within the window' : `${a.settledAfterSeconds}s measured`}`
      + `   tail drift: ${a.tailDriftMB >= 0 ? '+' : ''}${a.tailDriftMB} MB   window end: ${a.lastElapsedSeconds}s`);
    console.log(`   labels vs measured: ${a.labelVsMeasured.join('  ')}`);
  }
  if (out.length) {
    console.log(`\n[idle-window] ${out.length} arm(s) read at ${clockOf(new Date(), { seconds: true })}. `
      + 'Settle guidance is per dpr: quote the measured seconds, never the sample label.');
  }
  process.exitCode = out.length ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
