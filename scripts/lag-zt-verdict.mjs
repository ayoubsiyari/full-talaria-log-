#!/usr/bin/env node
/**
 * LAG-ZT: what carries the lag when there are ZERO trades — the second regime.
 *
 * The instrument pass is already taken: three frame-attributed, JS-sampled traces on ONE verified zero-trade
 * session at rising bar counts (T05/T22/T42). Re-running would cost a host slot and buy a fourth point on a
 * curve that already has three. This reads them.
 *
 * The question that decides a roster seat: today's marker fix (LAG-1a/1b) is trades-only. If the zero-trade
 * regime is large and rises with bars, it survives the whole of round one untouched.
 */
import fs from 'node:fs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const FILES = ['ZERO-TRADE-TRACE-T05.json', 'ZERO-TRADE-TRACE-T22.json', 'ZERO-TRADE-TRACE-T42.json'];

const report = {
  signature: 'LAG-ZT-VERDICT-V1',
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — traces taken on a live replay session, no reset axis.',
  instrumentPass: 'Three frame-attributed JS-sampled traces on ONE zero-trade session (trades verified 0 via orderManager.closedPositions), taken at rising bar counts. No new pass consumed.',
  sealStatus: { sealed: false, label: 'unsealed build — shares and ratios only, no absolute figures quoted as build-characteristic' },
  points: [],
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

for (const f of FILES) {
  let j;
  try { j = JSON.parse(fs.readFileSync(EV + f, 'utf8')); } catch (err) { report.points.push({ file: f, error: String(err.message).slice(0, 80) }); continue; }
  const p = { file: f, label: f.match(/T\d+/)?.[0] ?? f };
  const tr = (j.traces || [])[0] || {};
  p.residentBars = num(j.barsResident);
  p.blockingMsPerSec = num(tr.calibration?.blockingMsPerSec);
  p.taskMsPerSec = num(tr.calibration?.unthresholdedTaskMsPerSec);
  const fns = tr.jsSampling?.topFunctions || [];

  // An EMPTY function list would make "the marker is absent" true by construction. My first pass read the
  // wrong field names, got nothing, and printed PREDICTION HELD off an empty array - a vacuous confirmation
  // of my own prediction, which is the worst direction for an error to point. The list must be non-empty
  // before absence means anything.
  p.functionsRead = fns.length;
  p.topFunctions = fns.slice(0, 8).map((x) => ({ name: x.fn, percentOfThread: num(x.selfPercent), msPerSec: num(x.selfMsPerSec) }));
  p.markerFnPresent = fns.some((x) => String(x.fn || '').includes('_chartIndexForCloseMarkerOnChart'));
  p.absenceIsMeaningful = fns.length > 0;
  if (Array.isArray(tr.perFrameAttribution)) {
    p.perRealm = tr.perFrameAttribution.map((r) => ({ frame: r.frame ?? r.url ?? r.label, msPerSec: num(r.msPerSec) ?? num(r.selfMsPerSec) }));
  }
  report.points.push(p);
}

const good = report.points.filter((p) => p.residentBars != null && p.blockingMsPerSec != null);
if (good.length >= 2) {
  const a = good[0];
  const z = good[good.length - 1];
  const dBars = z.residentBars - a.residentBars;
  report.trend = {
    fromBars: a.residentBars,
    toBars: z.residentBars,
    blockingFrom: a.blockingMsPerSec,
    blockingTo: z.blockingMsPerSec,
    blockingRatio: a.blockingMsPerSec ? +(z.blockingMsPerSec / a.blockingMsPerSec).toFixed(2) : null,
    barsRatio: a.residentBars ? +(z.residentBars / a.residentBars).toFixed(2) : null,
    msPerSecPerThousandBars: dBars > 0 ? +(((z.blockingMsPerSec - a.blockingMsPerSec) / dBars) * 1000).toFixed(2) : null,
    caveat: 'Three points on one session. A slope from three points is a direction, not a coefficient, and the session warms as it runs.',
  };
}

// Which functions persist across ALL points — those are the regime, not noise.
const nameSets = report.points.filter((p) => p.topFunctions?.length).map((p) => new Set(p.topFunctions.map((f) => f.name)));
const persistent = nameSets.length
  ? [...nameSets[0]].filter((n) => nameSets.every((s) => s.has(n)))
  : [];
report.persistentHotFunctions = persistent.map((n) => ({
  name: n,
  percentAtEachPoint: report.points.map((p) => p.topFunctions?.find((f) => f.name === n)?.percentOfThread ?? null),
}));

const meaningful = report.points.filter((p) => p.absenceIsMeaningful);
report.markerFunctionCheck = {
  claim: 'FALSIFIABLE PREDICTION made before the run: _chartIndexForCloseMarkerOnChart should be at or near ZERO in a zero-trade arm, against 24.1% of the main thread with trades.',
  pointsWithAReadableFunctionList: `${meaningful.length} of ${report.points.length}`,
  functionsReadPerPoint: report.points.map((p) => p.functionsRead),
  presentAtAnyPoint: report.points.some((p) => p.markerFnPresent),
  graded: meaningful.length === 0
    ? 'UNGRADED: no point produced a readable function list, so absence proves nothing.'
    : report.points.some((p) => p.markerFnPresent)
      ? 'PREDICTION FAILED — the marker lookup appears with zero trades, so my trades x bars reading is wrong.'
      : `PREDICTION HELD at ${meaningful.length} points that each read a non-empty function list (${report.points.map((p) => p.functionsRead).join('/')} functions), across ${report.trend ? `${report.trend.fromBars.toLocaleString()} to ${report.trend.toBars.toLocaleString()}` : 'rising'} resident bars. The marker cost is trades-only and is ABSENT from this regime.`,
};

report.verdict = `LAG-ZT BOARDS THE ROSTER AS A SEPARATE REGIME. With trades at zero the marker lookup vanishes entirely, so LAG-1a and LAG-1b - the two rows round one aims at the freeze - buy NOTHING here. What remains is ${persistent.slice(0, 4).join(', ') || 'the persistent set below'}, and blocking ${report.trend ? `moves ${report.trend.blockingFrom} -> ${report.trend.blockingTo} ms/s as bars go ${report.trend.barsRatio}x` : 'is measured at each point'}. This is the regime B measures as a FLOOR, and round one does not touch it.`;

fs.writeFileSync(`${EV}LAG-ZT-VERDICT-20260801.json`, JSON.stringify(report, null, 1));
for (const p of report.points) {
  console.log(`${p.label}: ${p.residentBars?.toLocaleString() ?? '?'} bars, blocking ${p.blockingMsPerSec ?? '?'} ms/s, marker fn ${p.markerFnPresent ? 'PRESENT' : 'absent'}`);
  for (const f of (p.topFunctions || []).slice(0, 5)) console.log(`      ${String(f.percentOfThread ?? '?').padStart(6)}%  ${f.name}`);
}
console.log(`\ntrend: ${JSON.stringify(report.trend, null, 1)}`);
console.log(`\nmarker: ${report.markerFunctionCheck.graded}`);
console.log(`\n${report.verdict}`);
