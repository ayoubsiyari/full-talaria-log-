#!/usr/bin/env node
/**
 * Drive the smoke grader's NEW gates against synthetic artifacts.
 *
 * The grader decides at 01:00 whether ten hours of machine time fires. Its gates were written down in
 * advance so it is not a judgement call at that hour — but a gate that has never seen a failing artifact
 * is a gate nobody has tested. Each new gate is shown a passing artifact and a failing one.
 *
 * It also catches the defect I put in the grader an hour ago: `notes` was unbound, so every one of these
 * gates would have thrown ReferenceError the moment the smoke finished — turning a green build into "the
 * grader crashed" at exactly the moment nobody has time to debug it.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const results = [];
const check = (n, p, d) => { results.push({ name: n, pass: p, detail: d }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const tmp = path.join(os.tmpdir(), `grader-selftest-${Date.now()}.jsonl`);

const buildArtifact = ({ rate = true, probe = 'MEASURED', offline = 'NO STORM', painted = 4, readback = false } = {}) => {
  const rows = [];
  rows.push({ __meta: true, arm: 'trades', seal: { badge: '20260802b122', digest: 'd'.repeat(32) }, sourceCommitSha: 'a'.repeat(40) });
  rows.push({ __segmentStart: true, segment: 1, panels: 4 });
  for (let i = 1; i <= 10; i++) {
    rows.push({
      n: i, segment: 1, hours: i * 0.03, residentBars: 7000 + i * 800,
      deliveredBarsPerSec: rate ? 10.2 : null,
      deliveredRateRoute: rate ? 'simulated-time' : null,
      deliveredRateWhy: rate ? null : 'host panel timeframe unreadable (null)',
      deliveredRateTimeframe: '1m',
      effectiveRateReadbackPresent: readback,
      footprintTotalMB: 1400 + i * 20, blockingMsPerSec: 300,
      seal: { digest: 'd'.repeat(32) }, sourceCommitSha: 'a'.repeat(40),
      // Fields the PRE-EXISTING gates require. Without them the baseline artifact fails for unrelated
      // reasons, every "bad input is refused" check below reads DO NOT FIRE for the wrong cause, and the
      // whole file becomes vacuous - the same shape as the binding test that let M8 through.
      sealHeld: true, sourceCommitHeld: true, closedTrades: i * 2,
      panelsLive: 4, host: { freeRamPercent: 50 }, loaf: { ok: true },
    });
  }
  if (probe) rows.push({ __pauseProbe: true, label: 'r3-checkpoint-trades', verdict: probe, runningMB: 1800, hoardFloorMB: 1400, frothPercentOfRunning: 22.2, why: probe === 'MEASURED' ? 'drained' : 'the pause was not verified in every realm' });
  if (offline) rows.push({ __offlineToggle: true, verdict: offline, why: offline === 'NO STORM' ? 'Outage verified. 0.1 req/s' : 'recovery 40 req/s against a 5 req/s bar' });
  rows.push({ __postRefreshPaint: true, panelsPainted: painted, chartsAfterRefresh: 4 });
  rows.push({ __storageDiff: true, startToEnd: { ok: true, originUsageDeltaMB: 12.5 }, startToPostRefresh: { ok: true, originUsageDeltaMB: 11.0 } });
  rows.push({ __final: true, completed: true, segments: 1 });
  return rows.map((r) => JSON.stringify(r)).join('\n');
};

const grade = (artifact) => {
  fs.writeFileSync(tmp, artifact);
  const r = spawnSync(process.execPath, ['--max-old-space-size=512', 'scripts/build-smoke-grade.mjs', `--file=${tmp}`, '--arm=trades', '--minSamples=8'], { encoding: 'utf8' });
  return `${r.stdout}${r.stderr}`;
};

try {
  const good = grade(buildArtifact());
  check('the grader RUNS to a verdict at all (the `notes` ReferenceError would have crashed it here)',
    /CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE/.test(good) && !/ReferenceError/.test(good),
    /ReferenceError/.test(good) ? 'ReferenceError — gates never executed' : (good.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  // THE CONTROL EVERY CHECK BELOW DEPENDS ON. If the healthy artifact does not clear, then every "bad
  // input is refused" result below is refusing for some unrelated reason and proves nothing.
  check('CONTROL: the healthy artifact CLEARS, so the refusals below mean something',
    !/DO NOT FIRE/.test(good), (good.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  check('a healthy artifact passes the delivered-rate gate',
    /10\.20-10\.20 bars\/s/.test(good), 'rate readable on 10/10');

  const noRate = grade(buildArtifact({ rate: false }));
  check('an artifact with NO readable delivery rate is refused (RATE-HOLD would be VOID after ten hours)',
    /DO NOT FIRE/.test(noRate), (noRate.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  const badProbe = grade(buildArtifact({ probe: 'VOID' }));
  check('a pause-probe that VOIDed is refused, because the memory bar is judged on its floor',
    /DO NOT FIRE/.test(badProbe), (badProbe.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  const storm = grade(buildArtifact({ offline: 'REQUEST STORM' }));
  check('a request storm on reconnect fails the build',
    /DO NOT FIRE/.test(storm), (storm.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  const blank = grade(buildArtifact({ painted: 1 }));
  check('a refresh that leaves three of four panels blank fails the build',
    /DO NOT FIRE/.test(blank), (blank.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);

  const noReadback = grade(buildArtifact({ readback: false }));
  check("A's absent read-back WARNs and never blocks, because it is a witness",
    !/DO NOT FIRE/.test(noReadback), (noReadback.match(/(CLEAR TO FIRE|FIRE WITH WARNINGS|DO NOT FIRE)/) || [])[0]);
} finally {
  try { fs.unlinkSync(tmp); } catch { /* nothing further */ }
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(EV, 'GRADER-GATES-SELFTEST.json'), JSON.stringify({
  signature: 'GRADER-GATES-SELFTEST-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — synthetic artifacts, no browser.',
  passed, total: results.length, results,
}, null, 1));
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
