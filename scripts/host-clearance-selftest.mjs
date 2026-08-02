/**
 * Self-test for the host clearance gate.
 *
 * BIND-01: a gate is not covered by a passing happy path. Each check below either drives a known-bad
 * reading and demonstrates the RED, or drives a known-good one and demonstrates the gate does not fire
 * on it. The fixture that matters is the one the Director actually measured at 14:29 — 6.2 GB free of
 * 23.7, with the IDE holding 6.3 GB and the lanes only 1.69 GB — because a gate that blames the lanes
 * for that condition sends people to kill the wrong processes.
 *
 * The live host is READ but never ASSERTED. A test that asserts today's machine state is green only
 * until someone closes an app, and I have already shipped one test that was green only because
 * production was broken.
 */

import { gradeHostClearance, readHostClearance } from './lib/host-clearance.mjs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const reading = (over) => ({
  readOk: true,
  systemTotalMB: 23700,
  systemFreeMB: 6200,
  systemHeadroomPercent: 26.2,
  byOwner: { ide: 6340, poApps: 2345, lanes: 1690, other: 800 },
  offenders: [
    { name: 'Cursor.exe', pid: 111, mb: 5095, owner: 'ide', ageHours: 6.1 },
    { name: 'brave.exe', pid: 222, mb: 1700, owner: 'poApps', ageHours: 9.0 },
    { name: 'Cursor.exe', pid: 333, mb: 639, owner: 'ide', ageHours: 6.1 },
    { name: 'Discord.exe', pid: 444, mb: 645, owner: 'poApps', ageHours: 9.0 },
  ],
  staleRunners: [],
  ...over,
});

console.log('HOST CLEARANCE gate self-test\n');

// 1. THE MEASURED CONDITION: 6.2 GB free of 23.7. Above the percent floor, below the MB floor.
{
  const g = gradeHostClearance(reading(), { minFreeMB: 8192, minFreePercent: 25 });
  check('the measured 14:29 condition REFUSES', g.ok === false && g.state === 'INSUFFICIENT_HEADROOM', `${g.ok} / ${g.state}`);
  check('it refuses on the absolute floor, not the percentage', /8192 MB floor|short by 1992/.test(g.why), g.why);
  check('it names the IDE as the largest consumer', g.action.some((a) => /IDE is holding 6340 MB/.test(a)), JSON.stringify(g.action.slice(0, 3)));
  check('it states the lanes are NOT the cause', g.action.some((a) => /lanes are holding 1690 MB/.test(a)), 'lane attribution missing');
  check('it lists specific processes with pids to close', g.action.some((a) => /Cursor\.exe pid 111: 5095 MB/.test(a)), JSON.stringify(g.action.slice(-4)));
}

// 2. A percentage-only gate would have PASSED that condition. This is why both floors exist.
{
  const g = gradeHostClearance(reading(), { minFreeMB: 0, minFreePercent: 25 });
  check('CONTROL: percent-only grading passes the very condition we must refuse', g.ok === true,
    'if this fails the fixture no longer demonstrates why the absolute floor is needed');
}

// 3. A genuinely clear host passes.
{
  const g = gradeHostClearance(reading({ systemFreeMB: 18000, systemHeadroomPercent: 75.9, byOwner: { ide: 900, poApps: 0, lanes: 300, other: 400 } }));
  check('a cleared host passes', g.ok === true && g.state === 'CLEAR', `${g.ok} / ${g.state}`);
  check('the pass states the floor it was measured against', /floor 8192 MB and 25%/.test(g.why), g.why);
}

// 4. The 1.2% condition that was actually survived once.
{
  const g = gradeHostClearance(reading({ systemFreeMB: 284, systemHeadroomPercent: 1.2 }));
  check('the 1.2% headroom condition REFUSES on both floors', g.ok === false && /1\.2% headroom/.test(g.why) && /284 MB free/.test(g.why), g.why);
}

// 5. An unreadable host is refused, not assumed clear.
{
  const g = gradeHostClearance({ readOk: false, why: 'powershell timed out' });
  check('an unreadable host REFUSES', g.ok === false && g.state === 'HOST_UNREADABLE', `${g.state}`);
  check('the refusal says unknown is not clear', /not assumed clear/.test(g.why), g.why);
  const g2 = gradeHostClearance(null);
  check('a missing reading REFUSES rather than throwing', g2.ok === false && g2.state === 'HOST_UNREADABLE');
}

// 6. Stale runners are named on a clear host, and never presented as a kill instruction to the gate.
{
  const stale = [{ pid: 9001, mb: 60, ageHours: 5.2, script: 'build-identity-watch.mjs' }];
  const clear = gradeHostClearance(reading({ systemFreeMB: 18000, systemHeadroomPercent: 75.9, staleRunners: stale }));
  check('a clear host still reports stale runners', clear.ok === true && /1 stale runner/.test(clear.note || ''), clear.note);
  const blocked = gradeHostClearance(reading({ staleRunners: stale }));
  check('a blocked host tells the operator to end the stale runner by pid', blocked.action.some((a) => /pid 9001 up 5\.2 h running build-identity-watch\.mjs/.test(a)), JSON.stringify(blocked.action));
  check('the gate explicitly refuses to kill it itself', blocked.action.some((a) => /do not let the gate kill it/.test(a)), 'kill-safety wording absent');
}

// 7. The live host, RECORDED and not asserted.
{
  const live = readHostClearance();
  const g = gradeHostClearance(live);
  check('the live host can be read and graded without throwing', typeof g.ok === 'boolean', JSON.stringify(g).slice(0, 120));
  console.log(`\n  LIVE (recorded, not asserted): ${live.systemFreeMB} MB free of ${live.systemTotalMB} (${live.systemHeadroomPercent}%) -> ${g.state}`);
  if (live.byOwner) console.log(`    by owner: ide ${live.byOwner.ide} MB, poApps ${live.byOwner.poApps} MB, lanes ${live.byOwner.lanes} MB, other ${live.byOwner.other} MB`);
  for (const s of (live.staleRunners || [])) console.log(`    stale: pid ${s.pid} up ${s.ageHours} h running ${s.script} (${s.mb} MB)`);
  for (const f of (live.offenders || []).slice(0, 6)) console.log(`    ${f.name} pid ${f.pid}: ${f.mb} MB [${f.owner}]`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
