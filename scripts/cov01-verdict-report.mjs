#!/usr/bin/env node
/**
 * COV-01, re-derived from artifacts on disk.
 *
 * WHY THIS EXISTS. The verdict is emitted at the end of a soak arm, which means the only way to
 * obtain it was to complete a twenty-hour pair. A number you can only get by spending twenty hours is
 * a number nobody re-checks, and at packet review the question "does COV-01 pass" would have been
 * answered by quoting a log line rather than by recomputing it. The four moments are files; the
 * verdict is a pure function of them; so it should be one command.
 *
 * This adds no measurement and no new basis. It reads the same artifacts the sampler writes and calls
 * the same `assessCov01` the sampler calls — if this and the run report ever disagree, one of them is
 * reading a different directory and that is worth knowing too.
 *
 *   node scripts/cov01-verdict-report.mjs --dumpDir <dir> [--json]
 *
 * Exit 0 when COV-01 is green, exit 4 when it is measured but not quotable or unmeasured, matching
 * the convention the floor gate already uses so a caller cannot mistake "not proven" for "fine".
 */
import fs from 'node:fs';
import { assessCov01, loadMoments, COV01_MOMENTS } from './lib/cov01-verdict.mjs';

const argOf = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const dumpDir = argOf('dumpDir');
if (!dumpDir) {
  console.error('[cov01] REFUSED_NO_DUMP_DIR — pass --dumpDir <dir> containing the four detailed-dump artifacts');
  process.exit(2);
}
if (!fs.existsSync(dumpDir)) {
  // Distinct from "the directory is there and the moments are not": one is a typo, the other is a finding.
  console.error(`[cov01] DUMP_DIR_ABSENT — ${dumpDir} does not exist. This is not a COV-01 result.`);
  process.exit(2);
}

const moments = loadMoments(dumpDir);
const verdict = assessCov01({ moments });

if (argOf('json') !== null || process.argv.includes('--json')) {
  console.log(JSON.stringify({ dumpDir, verdict, moments }, null, 2));
} else {
  console.log(`[cov01] ${verdict.state} — ${verdict.pass ? 'quotable' : 'NOT quotable'}`);
  console.log(`        floor ${verdict.floorPct}%, graded on the worst of ${COV01_MOMENTS.length} moments`);
  for (const m of moments) {
    console.log(m.present
      ? `        ${m.moment.padEnd(17)} ${String(m.coveragePct ?? '--').padStart(6)}%  ${m.processCount ?? '?'} processes  ${m.totalBasis ?? 'no basis'}`
      : `        ${m.moment.padEnd(17)}     --  ABSENT — ${m.why}`);
  }
  if (verdict.perMoment) {
    console.log(`        worst ${verdict.worstMoment.moment} at ${verdict.worstMoment.coveragePct}%, spread ${verdict.spreadPct} points`);
    console.log(`        mean ${verdict.meanPct}% — recorded, never graded on`);
  }
  if (verdict.why) console.log(`        ${verdict.why}`);
}

process.exit(verdict.pass ? 0 : 4);
