/**
 * TICK-OFF-01 mutant runner.
 *
 *   node scripts/tick-off-mutants.mjs
 *
 * Applies each mutant to BOTH product copies of replay-system.js, runs the
 * suite in TAP mode, and records which NAMED BEHAVIOURAL cell died.
 *
 * Rules this runner enforces, each of which cost me hours when it was missing:
 *  - the needle must occur EXACTLY ONCE in each mirror, or the mutant is
 *    reported NOT_APPLIED loudly rather than silently mutating something else;
 *  - both mirrors are mutated, so the byte-identity cell stays green and does
 *    not inflate the kill count;
 *  - the suite's own hygiene cell (E01) is excluded when attributing a kill;
 *  - files are restored and the restore is VERIFIED by sha256.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COPIES = [
  path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js'),
  path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js'),
];
const SUITE = 'chart v 1.4/chart/modules/tick-off-candle-only-playback.test.mjs';
/** Not a behavioural cell — a mirror-hygiene cell. Never credit it with a kill. */
const HYGIENE_CELLS = ['E01'];

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const GATE = "        if (this._isCandleOnlyPlaybackEnabled()) return 'candle';\n";
const HELPER_RETURN = "        return typeof window === 'undefined'\n"
  + '            || !window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1;';

const MUTANTS = [
  {
    id: 'M1', why: 'switch is a no-op — the gate is gone entirely',
    find: GATE, replace: '',
  },
  {
    id: 'M2', why: "FLAG-02 defect: strict '!== true' instead of truthiness",
    find: HELPER_RETURN,
    replace: "        return typeof window === 'undefined'\n"
      + '            || window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1 !== true;',
  },
  {
    id: 'M3', why: 'polarity inverted — forces tick instead of candle',
    find: GATE,
    replace: "        if (this._isCandleOnlyPlaybackEnabled()) return 'tick';\n",
  },
  {
    id: 'M4', why: 'flag ignored — kill cannot be lifted, no ablation arm',
    find: HELPER_RETURN, replace: '        return true;',
  },
  {
    id: 'M5', why: 'sampled once at first call instead of read per call',
    find: HELPER_RETURN,
    replace: '        if (this.__ccSampled === undefined) {\n'
      + "            this.__ccSampled = typeof window === 'undefined'\n"
      + '                || !window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1;\n'
      + '        }\n'
      + '        return this.__ccSampled;',
  },
  {
    id: 'M6', why: 'flag read inverted — setting the switch ENABLES the kill',
    find: HELPER_RETURN,
    replace: "        return typeof window === 'undefined'\n"
      + '            || !!window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1;',
  },
  {
    id: 'M7', why: 'gate moved below the stored-mode read (dead code)',
    find: GATE + "        return this.playbackMode === 'candle' ? 'candle' : 'tick';\n",
    replace: "        return this.playbackMode === 'candle' ? 'candle' : 'tick';\n"
      + GATE,
  },
  {
    id: 'NEG', why: 'NEGATIVE CONTROL — needle absent, must report NOT_APPLIED',
    find: "        if (this._isCandleOnlyPlaybackEnabledXYZ()) return 'candle';\n",
    replace: '        // never\n',
  },
];

const baseline = COPIES.map((p) => fs.readFileSync(p, 'utf8'));
const baseSha = baseline.map(sha);
if (baseSha[0] !== baseSha[1]) {
  console.error('ABORT: mirrors already divergent at baseline');
  process.exit(2);
}
console.log(`baseline sha256 (both copies): ${baseSha[0].slice(0, 16)}\n`);

function restore() {
  COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i]));
}

function runSuite() {
  try {
    const out = execFileSync(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', SUITE],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 },
    );
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

/** TAP `not ok N - <name>` lines, minus the suite's own hygiene cells. */
function failedCells(out) {
  const names = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^not ok \d+ - (.+)$/.exec(line.trim());
    if (m) names.push(m[1].trim());
  }
  return names.filter((n) => !HYGIENE_CELLS.some((h) => n.startsWith(h)));
}

const results = [];
for (const m of MUTANTS) {
  const counts = baseline.map((src) => src.split(m.find).length - 1);
  if (counts.some((c) => c !== 1)) {
    const applied = m.id === 'NEG' && counts.every((c) => c === 0);
    console.log(
      `${m.id}  NOT_APPLIED  needle counts [${counts.join(', ')}] — ${m.why}`
      + (applied ? '   (expected for the negative control)' : '   *** UNEXPECTED — re-anchor this mutant ***'),
    );
    results.push({ id: m.id, status: applied ? 'NOT_APPLIED_EXPECTED' : 'NOT_APPLIED_UNEXPECTED', killers: [] });
    continue;
  }

  COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i].replace(m.find, m.replace)));
  const mutatedSha = COPIES.map((p) => sha(fs.readFileSync(p, 'utf8')));
  const mirrorsStillEqual = mutatedSha[0] === mutatedSha[1];

  const { code, out } = runSuite();
  const killers = failedCells(out);
  restore();

  const status = killers.length ? 'KILLED' : (code === 0 ? 'SURVIVED' : 'KILLED_BUT_UNATTRIBUTED');
  results.push({ id: m.id, status, killers, mirrorsStillEqual });
  console.log(`${m.id}  ${status.padEnd(24)} ${m.why}`);
  if (killers.length) killers.forEach((k) => console.log(`      killed by: ${k}`));
  if (!mirrorsStillEqual) console.log('      WARNING: mirrors diverged under mutation');
}

restore();
const afterSha = COPIES.map((p) => sha(fs.readFileSync(p, 'utf8')));
const restored = afterSha[0] === baseSha[0] && afterSha[1] === baseSha[1];

console.log('\n──────── summary ────────');
const killed = results.filter((r) => r.status === 'KILLED').length;
const survived = results.filter((r) => r.status === 'SURVIVED');
const unexpected = results.filter((r) => r.status === 'NOT_APPLIED_UNEXPECTED');
console.log(`killed:    ${killed} / ${MUTANTS.length - 1} behavioural mutants`);
console.log(`survived:  ${survived.length}${survived.length ? ' → ' + survived.map((s) => s.id).join(', ') : ''}`);
console.log(`neg ctrl:  ${results.find((r) => r.id === 'NEG')?.status}`);
console.log(`restored:  ${restored ? 'YES — sha256 matches baseline in both copies' : 'NO *** FIX BY HAND ***'}`);
if (unexpected.length) console.log(`re-anchor: ${unexpected.map((u) => u.id).join(', ')}`);
process.exit(survived.length || unexpected.length || !restored ? 1 : 0);
