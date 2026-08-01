#!/usr/bin/env node
/**
 * Exercise the SMOKE TRANSFER GATE.
 *
 * The ruling: pin the digest and the SHA, never the badge, and a SHA that moves after the smoke passes is
 * a new build whose smoke does not transfer. That rule is only real if the refusals actually fire, so
 * each one is driven here against the live origin with a planted smoke grade — the same discipline that
 * found a launcher which had never once launched.
 *
 * Every case restores the grade file it touched. A leftover synthetic grade would be worse than no test:
 * it would authorise a ten-hour run against a build nobody smoked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ORIGIN = 'http://31.97.192.82:3000';
const GRADE = path.join(EV, 'BUILD-SMOKE-GRADE-trades.json');
const BACKUP = `${GRADE}.selftest-backup`;

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const fire = (args) => spawnSync(process.execPath, ['--max-old-space-size=1024', 'scripts/fire-sealed-soak.mjs', ...args], { encoding: 'utf8', cwd: process.cwd() });

const live = await computeSeal(ORIGIN);
const liveInfo = await readBuildInfo(ORIGIN);
console.log(`live origin: badge ${live.badge}, digest ${live.digest}, sha ${liveInfo.ok ? liveInfo.sourceCommitSha : `UNREADABLE (${liveInfo.state})`}\n`);

const writeGrade = (digest, sha, verdict = 'CLEAR TO FIRE') => fs.writeFileSync(GRADE, JSON.stringify({
  signature: 'BUILD-SMOKE-GRADE-V1', at: new Date().toISOString(), arm: 'trades',
  synthetic: 'WRITTEN BY smoke-transfer-selftest — not a real smoke result',
  build: { badge: live.badge, digest, sourceCommitSha: sha }, gates: [], verdict,
}, null, 1));

if (fs.existsSync(GRADE)) fs.copyFileSync(GRADE, BACKUP);

try {
  // 1. There is no way to pin by badge, and asking is refused by name.
  {
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, `--expectBadge=${live.badge}`, '--dryRun']);
    check('a badge cannot be used as a build identity (--expectBadge refused)',
      r.status === 2 && /A badge is not a build identity/.test(r.stderr), `exit ${r.status}`);
  }

  // 2. No smoke at all is not a pass.
  {
    if (fs.existsSync(GRADE)) fs.rmSync(GRADE);
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, '--dryRun']);
    check('a real firing with NO smoke grade is refused',
      r.status === 5 && /no smoke grade/.test(r.stderr), `exit ${r.status}`);
  }

  // 3. A smoke that failed does not authorise a night.
  {
    writeGrade(live.digest, liveInfo.sourceCommitSha, 'DO NOT FIRE');
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, '--dryRun']);
    check('a smoke graded DO NOT FIRE blocks the firing',
      r.status === 5 && /graded DO NOT FIRE/.test(r.stderr), `exit ${r.status}`);
  }

  // 4. THE RULING. Same bytes, same badge, DIFFERENT SOURCE COMMIT -> new build, smoke does not transfer.
  {
    writeGrade(live.digest, 'a17e00e8854fa7644c18269cd538daba247e7051');
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, '--dryRun']);
    check('a SHA that moved after the smoke is a NEW BUILD and the smoke does not transfer',
      r.status === 5 && /THE SOURCE MOVED/.test(r.stderr) && /badge is not a build identity/.test(r.stderr),
      `exit ${r.status} — this is the 22:00 ruling, driven`);
  }

  // 5. Different bytes are refused too, on the digest half.
  {
    writeGrade('ffffffffffffffffffffffffffffffff', liveInfo.sourceCommitSha);
    const r = fire(['--arm=trades', '--expectDigest=ffffffffffffffffffffffffffffffff', '--dryRun']);
    check('a digest that moved after the smoke is refused',
      r.status === 5 && /Different bytes/.test(r.stderr), `exit ${r.status}`);
  }

  // 6. A smoke grade missing the SHA cannot transfer on the badge alone.
  {
    fs.writeFileSync(GRADE, JSON.stringify({ signature: 'BUILD-SMOKE-GRADE-V1', arm: 'trades', build: { badge: live.badge, digest: live.digest, sourceCommitSha: null }, verdict: 'CLEAR TO FIRE' }, null, 1));
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, '--dryRun']);
    check('a smoke grade carrying a badge but no SHA cannot transfer',
      r.status === 5 && /not a build identity|does not carry both/.test(r.stderr), `exit ${r.status}`);
  }

  // 7. THE SUCCESS PATH, and it must pin the SHA it validated rather than whatever is live at boot.
  {
    writeGrade(live.digest, liveInfo.sourceCommitSha);
    const r = fire(['--arm=trades', `--expectDigest=${live.digest}`, '--dryRun']);
    const out = `${r.stdout}${r.stderr}`;
    check('a matching digest AND SHA transfers', r.status === 0, `exit ${r.status}`);

    // Asserted against the COMMAND LINE the child would receive, not against a log message. The first
    // version of this check matched the SHA anywhere in stdout — which the gate prints whether or not the
    // flag is ever passed — so a mutant that computed --expectSha and dropped it went UNCAUGHT. A test
    // that reads the narration instead of the binding is the vacuous shape I have already published on.
    const cmd = (out.split('\n').find((l) => l.startsWith('command:')) || '');
    check('the run is pinned to that SHA — --expectSha reaches the child on the command line',
      cmd.includes(`--expectSha=${String(liveInfo.sourceCommitSha).toLowerCase()}`),
      cmd ? cmd.replace(/^command:\s*/, '').slice(0, 150) : 'NO COMMAND LINE PRINTED');
  }
} finally {
  if (fs.existsSync(BACKUP)) { fs.copyFileSync(BACKUP, GRADE); fs.rmSync(BACKUP); }
  else if (fs.existsSync(GRADE)) fs.rmSync(GRADE);
  const leftover = fs.existsSync(GRADE) ? JSON.parse(fs.readFileSync(GRADE, 'utf8')).synthetic : null;
  check('no synthetic smoke grade was left behind', !leftover, leftover ? 'A SYNTHETIC GRADE REMAINS' : 'clean');
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(EV, 'SMOKE-TRANSFER-SELFTEST.json'), JSON.stringify({
  signature: 'SMOKE-TRANSFER-SELFTEST-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — HTTP and process exit codes only, no browser.',
  rule: 'Pin the digest and the SHA, never the badge. A SHA that changes after the smoke passes is a new build and the smoke does not transfer.',
  liveOrigin: { badge: live.badge, digest: live.digest, sourceCommitSha: liveInfo.ok ? liveInfo.sourceCommitSha : null },
  passed, total: results.length, results,
}, null, 1));
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
