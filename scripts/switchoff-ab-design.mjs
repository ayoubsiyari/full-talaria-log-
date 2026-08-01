#!/usr/bin/env node
/**
 * Design the switch-off A/B: one hour with the roster switches on, one hour with them off, at the new
 * envelope. Every fix has a kill-switch, so this recovers the attribution we gave up when the roster
 * landed as one batch — without paying for a second ten-hour baseline.
 *
 * The design is emitted from the SEALED BYTES rather than from the roster document, because a switch that
 * is named in a ruling and absent from the build cannot be flipped. Doing this the other way round would
 * produce a run that reports "switches off" while flipping nothing, and a null result from a flag that
 * was never read is indistinguishable from a fix that did not matter. I have already published one such
 * null tonight — the order-overlay kill-switch that guards one of four call sites.
 */
import fs from 'node:fs';
import path from 'node:path';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ORIGIN = process.env.TEST_VPS_URL || 'http://31.97.192.82:3000';
const ROSTER = 'docs/plan3/RULING-KILL-ROSTER-ROUND-ONE-ADMITTED-20260801-0915.md';
const FILES = [
  '/chart/chart.js',
  '/chart/multichart-prod/multichart-manager.js',
  '/chart/modules/chart-window-limit.js',
  '/chart/dist-v9/assets/talaria-v9-live.js',
];

const rosterSwitches = [...new Set((fs.readFileSync(ROSTER, 'utf8').match(/__TALARIA_[A-Z0-9_]+/g) || []))].sort();

const served = new Map();
for (const f of FILES) {
  try {
    const res = await fetch(`${ORIGIN}${f}`, { signal: AbortSignal.timeout(45000) });
    const text = await res.text();
    for (const m of text.match(/__TALARIA_[A-Z0-9_]+/g) || []) {
      if (!served.has(m)) served.set(m, []);
      if (!served.get(m).includes(f)) served.get(m).push(f);
    }
  } catch (err) { console.error(`  could not read ${f}: ${String(err).slice(0, 80)}`); }
}

const present = rosterSwitches.filter((s) => served.has(s));
const absent = rosterSwitches.filter((s) => !served.has(s));

// A switch whose name appears only once is a DECLARATION with no consumer - the shape that produced my
// order-overlay null, where the flag guarded one of four call sites. Count of files is a weak proxy but
// it is the honest one available without parsing the bundle.
const design = {
  signature: 'SWITCHOFF-AB-DESIGN-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — reads served bytes over HTTP, no browser.',
  origin: ORIGIN,
  rosterDoc: ROSTER,

  scope: {
    rosterSwitchesNamed: rosterSwitches.length,
    presentInSealedBytes: present.length,
    absentFromSealedBytes: absent.length,
    present,
    absent,
    verdict: absent.length
      ? `ONLY ${present.length} OF ${rosterSwitches.length} ROSTER SWITCHES EXIST IN THE BUILD NOW SERVED. An A/B run today would flip ${present.length} flags and silently no-op ${absent.length}, then report the difference as the roster's contribution.`
      : 'All roster switches are present; the A/B can cover the whole roster.',
  },

  design: {
    shape: 'Two one-hour arms, back to back on the same host and the same sealed build, differing ONLY in the switch block. Sequential, never concurrent — two concurrent arms make each the other\'s contention, which is the defect that made salvage segment 2 unpoolable.',
    envelope: 'The new envelope: 10 bars/s verified by read-back, not by the slider label. My own soak ran at 60 under a 5 label for two segments because the speed argument was silently discarded.',
    armA: 'Roster switches at their shipped defaults (fixes ON).',
    armB: 'Every roster switch present in the build set to its disabling value (fixes OFF).',
    injection: 'CDP addScriptToEvaluateOnNewDocument, before any product script runs, in every realm. No product bytes change, so the digest is identical across both arms and the seal still describes what was measured.',
    readBack: 'Each switch is READ BACK in every realm after boot and recorded. An arm that could not set a flag is VOID for that flag, not silently averaged in. This is the whole lesson of the order-overlay null.',
    primaryOutcome: 'RATE-HOLD delivered bars/s, compared between arms.',
    secondaryOutcomes: ['hoard floor from the end-of-arm pause-probe on each arm', 'blocking ms/s', 'MB per thousand delivered bars', 'LoAF per-script attribution difference'],
    duration: '1 h per arm, 2 h total.',
  },

  whatItCanAndCannotAnswer: {
    can: 'The AGGREGATE contribution of the roster switches present in the build, at the true envelope, on one host, in two hours.',
    cannot: 'Per-switch attribution. Fourteen switches in two arms gives one contrast, not fourteen. Isolating a single switch costs one arm per switch.',
    honestClaim: 'A difference between arms prices the roster as a BLOCK. A null prices the block as no better than the tolerance of a one-hour arm, which is not the same as proving each fix worthless.',
  },

  hazards: [
    'A switch that is read once at boot behaves differently from one read per call. The order-overlay flag is read LIVE per call, so timing was not its excuse; another switch may need to be set before first paint or it will do nothing. Injection therefore runs on new document, not after load.',
    'Turning fixes OFF may make the build slower AND less memory-hungry at once, because a degraded delivery rate allocates less. Compare per thousand DELIVERED bars, never per hour, or the arm that works worse will look better.',
    'One hour is short. Warm-up occupies the first minutes, so both arms need a settled window and the same one.',
  ],

  blockedOn: absent.length
    ? `${absent.length} of the roster's switches are not in the served build. Running the A/B now would price a third of the roster and report it as the roster. It waits for the build that carries them.`
    : null,
};

fs.writeFileSync(path.join(EV, 'SWITCHOFF-AB-DESIGN.json'), JSON.stringify(design, null, 1));

console.log('\nSWITCH-OFF A/B — DESIGN\n');
console.log(`  roster names ${rosterSwitches.length} switches; the served build carries ${present.length}\n`);
console.log('  PRESENT and flippable today:');
for (const s of present) console.log(`    + ${s}  [${served.get(s).length} file(s)]`);
console.log('\n  ABSENT from the served build — cannot be flipped, would silently no-op:');
for (const s of absent) console.log(`    - ${s}`);
console.log(`\n  ${design.scope.verdict}`);
if (design.blockedOn) console.log(`\n  BLOCKED: ${design.blockedOn}`);
console.log(`\n  Design written to SWITCHOFF-AB-DESIGN.json\n`);
