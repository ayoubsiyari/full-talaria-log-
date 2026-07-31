#!/usr/bin/env bash
# Re-derive the ~86 ms from the raw recorded rows rather than from my own prose, because it is now
# the most load-bearing number on the project and it is about to be compared against C's CDP trace.
#
# Prints the arithmetic so the definition can be checked, not just the result.
set -uo pipefail
F=/root/b-k4/freeze-results.jsonl
echo "=== raw file ==="; ls -la "$F"; echo -n "runs recorded: "; wc -l < "$F"

node - "$F" <<'JS'
const fs = require('fs');
const rows = [];
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  for (const w of r.rows) rows.push({ label: r.label, speed: r.speed, windows: r.windows, ...w });
}
console.log('\n=== every recorded window-row ===');
console.log(['label', 'bars@arm', 'wallSec', 'longtasks', 'blockedMs', 'ms/s', 'longestTask', 'worstGap'].join('\t'));
for (const r of rows) {
  console.log([r.label, r.barsAtArm, r.wallSec, r.longtasks, r.totalBlockedMs,
    r.blockedMsPerSec, r.longestTaskMs, r.worstTimerGapMs].join('\t'));
}

// The plateau regime only: bars at arm above A's predicted pixel knee of 739.
const hi = rows.filter((r) => r.barsAtArm > 739 && r.longtasks > 0 && r.wallSec > 5);
console.log(`\n=== plateau regime (barsAtArm > 739): ${hi.length} rows ===`);

const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
const totalTasks = sum(hi, (r) => r.longtasks);
const totalBlocked = sum(hi, (r) => r.totalBlockedMs);
const totalWall = sum(hi, (r) => r.wallSec);

console.log(`total long tasks        ${totalTasks}`);
console.log(`total blocking ms       ${totalBlocked}   (this is SUM of (duration - 50) over tasks > 50ms)`);
console.log(`total wall seconds      ${totalWall.toFixed(1)}`);
console.log(`long tasks per second   ${(totalTasks / totalWall).toFixed(2)}`);
console.log(`blocking ms per second  ${(totalBlocked / totalWall).toFixed(1)}`);
console.log(`mean blocking per task  ${(totalBlocked / totalTasks).toFixed(1)} ms   (the part ABOVE 50ms)`);
console.log(`mean TASK DURATION      ${(50 + totalBlocked / totalTasks).toFixed(1)} ms   <-- this is the "86 ms"`);
console.log('');
console.log('So the 86 ms is: 50ms threshold + mean blocking beyond it. It is the mean DURATION of a');
console.log('task that already exceeded 50ms. It is NOT a measured per-data-event cost; calling it that');
console.log('assumes exactly one long task per replay event.');

console.log('\n=== how good is that assumption? tasks/s vs the replay event rate ===');
console.log('measured dataVersion bump rate during replay was ~7.25/s (what-is-the-resample-source.mjs)');
console.log(`long tasks per second is ${(totalTasks / totalWall).toFixed(2)}`);
console.log(`ratio tasks:events = ${((totalTasks / totalWall) / 7.25).toFixed(2)} long tasks per replay event`);

console.log('\n=== what the 50ms threshold hides ===');
console.log('Every task under 50ms contributes 0 to this metric, and the first 50ms of every task');
console.log('that does count is also discarded. Occupancy floor implied by the counted tasks alone:');
console.log(`  counted task time  = ${(totalBlocked + 50 * totalTasks).toFixed(0)} ms over ${totalWall.toFixed(0)} s`);
console.log(`                     = ${((totalBlocked + 50 * totalTasks) / totalWall).toFixed(1)} ms/s of main thread actually occupied`);
console.log(`  vs reported metric = ${(totalBlocked / totalWall).toFixed(1)} ms/s`);
console.log('  difference is the discarded 50ms per task, plus ALL sub-50ms tasks, which are invisible.');
JS
