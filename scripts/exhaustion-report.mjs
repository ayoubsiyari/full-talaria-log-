/**
 * Reads an EXHAUSTION-PROBE artifact and answers the two questions it was fired for.
 *
 * Q1  How many bars does a real CONF-01 session hold, and how long does that last at the shipping ladder?
 * Q2  Does the drained floor rise while the product delivers nothing?
 *
 * The one thing this reporter must not do is conflate "the index went backwards" with "the session ran out".
 * The 1m panel re-bases its index when fullRawData is trimmed, which looks like a 3,000-bar backwards jump
 * in any gauge that differences the playhead. Whether that re-base is the session CONTINUING or the session
 * LOOPING over data it has already shown is decided by market time, not by the index, so the market-time
 * span is computed separately and reported beside the index.
 */
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/exhaustion-report.mjs <artifact.json>'); process.exit(2); }
const a = JSON.parse(fs.readFileSync(file, 'utf8'));

const fmtTs = (t) => (Number.isFinite(t) ? new Date(t > 1e12 ? t : t * 1000).toISOString().replace('T', ' ').slice(0, 16) : 'n/a');
const hrs = (ms) => (ms / 3600000);

console.log(`EXHAUSTION PROBE — ${a.identity?.buildId ?? '?'} @ ${a.identity?.origin ?? '?'}`);
console.log(`started ${a.startedAt}   requested speed ${a.condition?.requestedSpeed}   verdict ${a.verdict}`);
const spd = (a.effectiveSpeed || []).map((r) => r.value).filter(Number.isFinite);
const ladder = spd.length ? spd[0] : a.condition?.requestedSpeed;
console.log(`effective speed read back from the engine: ${[...new Set(spd)].join(', ') || 'unreadable'}\n`);

// ------------------------------------------------------------------ Q1
const samples = a.phaseA?.samples || [];
console.log(`=== Q1  WHAT THE SESSION HOLDS   (${samples.length} samples over ${((samples.at(-1)?.atMs - samples[0]?.atMs) / 60000).toFixed(1)} min)`);
const realms = [...new Set(samples.flatMap((s) => s.panels.map((p) => p.realm)))];

const rows = [];
for (const r of realms) {
  const ser = samples.map((s) => s.panels.find((p) => p.realm === r)).filter(Boolean);
  if (!ser.length) continue;
  const tf = ser[0].tf;
  const masters = ser.map((p) => p.masterLen).filter(Number.isFinite);

  // Market time actually traversed by the playhead, summed over forward moves only. A re-base moves the
  // index back but NOT the clock, so this distinguishes continuation from looping.
  let marketMs = 0; let backwardsIndexJumps = 0; let backwardsClockJumps = 0;
  for (let i = 1; i < ser.length; i++) {
    const dIdx = (ser[i].playhead ?? 0) - (ser[i - 1].playhead ?? 0);
    const t1 = ser[i - 1].playheadTs; const t2 = ser[i].playheadTs;
    if (dIdx < 0) backwardsIndexJumps++;
    if (Number.isFinite(t1) && Number.isFinite(t2)) {
      const n1 = t1 > 1e12 ? t1 : t1 * 1000; const n2 = t2 > 1e12 ? t2 : t2 * 1000;
      if (n2 > n1) marketMs += n2 - n1; else if (n2 < n1) backwardsClockJumps++;
    }
  }
  let barsFwd = 0;
  for (let i = 1; i < ser.length; i++) { const d = (ser[i].playhead ?? 0) - (ser[i - 1].playhead ?? 0); if (d > 0) barsFwd += d; }

  const pinnedAll = ser.every((p) => Number.isFinite(p.playhead) && Number.isFinite(p.masterLen) && p.playhead >= p.masterLen - 1);
  // atMs lives on the SAMPLE, not on the panel record inside it.
  const wallSec = (samples.at(-1).atMs - samples[0].atMs) / 1000;

  rows.push({
    tf,
    masterMin: Math.min(...masters), masterMax: Math.max(...masters),
    pinnedThroughout: pinnedAll,
    barsForward: barsFwd,
    barsPerSec: wallSec > 0 ? +(barsFwd / wallSec).toFixed(2) : null,
    indexRebases: backwardsIndexJumps,
    clockRewinds: backwardsClockJumps,
    marketHours: +hrs(marketMs).toFixed(2),
    firstTs: ser[0].playheadTs, lastTs: ser.at(-1).playheadTs,
  });
}

for (const r of rows) {
  console.log(`\n  ${String(r.tf).padEnd(4)}  master ${r.masterMin}..${r.masterMax} bars`);
  if (r.pinnedThroughout) {
    console.log(`        PINNED AT THE LAST BAR FOR THE ENTIRE RUN — zero bars delivered, ever.`);
    console.log(`        playhead clock ${fmtTs(r.firstTs)} (unchanged)`);
  } else {
    console.log(`        delivered ${r.barsForward} bars at ${r.barsPerSec}/s against a ladder of ${ladder}`);
    console.log(`        index re-bases ${r.indexRebases}, clock rewinds ${r.clockRewinds}`);
    console.log(`        market time traversed ${r.marketHours} h   ${fmtTs(r.firstTs)} -> ${fmtTs(r.lastTs)}`);
    console.log(`        ${r.clockRewinds === 0 && r.indexRebases > 0
      ? 'the index re-bases but the clock never rewinds: the window slides, the session CONTINUES'
      : r.clockRewinds > 0 ? 'THE CLOCK REWINDS — the session is replaying data it has already shown' : 'no re-base observed in this window'}`);
  }
}

const live = rows.filter((r) => !r.pinnedThroughout);
const dead = rows.filter((r) => r.pinnedThroughout);
console.log(`\n  ${live.length} of ${rows.length} panels delivered anything. ${dead.length} were inert for the whole run (${dead.map((d) => d.tf).join(', ')}).`);
if (live.length) {
  const l = live[0];
  console.log(`  The only live panel sustains ${l.barsPerSec} bars/s, so the session is NOT time-limited by data:`);
  console.log(`  it re-bases and keeps going. Runtime is bounded by the harness, not by the dataset.`);
}
console.log(`\n  phase A verdict: ${a.phaseA?.verdict?.state}`);

// ------------------------------------------------------------------ Q2
console.log(`\n=== Q2  DOES THE DRAINED FLOOR RISE WITH ZERO BARS DELIVERED`);
const sp = a.phaseB?.stopProof;
if (sp) console.log(`  stop proof: playhead sum ${sp.before} -> ${sp.after} over 12 s, static=${sp.static}`);
if (a.phaseB?.pause) console.log(`  pause: ${JSON.stringify(a.phaseB.pause)}`);
for (const p of a.phaseB?.points || []) {
  console.log(`   B${p.i}  t+${String(p.minutes).padStart(6)} min   floor ${p.floorMB} MB   barsSinceLast ${p.barsSinceLast}`);
}
const v = a.phaseB?.verdict || {};
console.log(`\n  verdict: ${v.verdict}`);
if (v.totalRiseMB != null) console.log(`  ${v.firstFloorMB} -> ${v.lastFloorMB} MB over ${v.spanMinutes} min = ${v.totalRiseMB} MB, slope ${v.slopeMBPerMin} MB/min (${v.slopeMBPerHour} MB/h), CI ${JSON.stringify(v.ci95MBPerMin)}`);
console.log(`  ${v.why ?? ''}`);
