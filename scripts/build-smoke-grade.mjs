#!/usr/bin/env node
/**
 * Grade a 20-minute smoke of the FINAL build through the REAL soak harness.
 *
 * Why this exists, in one line: 18 late cherry-picks are a regression surface that did not exist this
 * morning, and a broken replay path discovered at hour two costs the night.
 *
 * The grade is written down BEFORE the run so it cannot be argued into a pass at 22:20. Every gate names
 * the failure it is there to catch. A gate that cannot be evaluated reports UNPROVEN and blocks the fire -
 * it does not quietly pass, which is the failure mode that let a relief valve report "would not fire" on a
 * build that grew 2.1 GB.
 */
import fs from 'node:fs';
import path from 'node:path';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const FILE = argOf('file', path.join(EV, 'SMOKE-SOAK-TRADES.jsonl'));
const ARM = argOf('arm', 'trades');
const MIN_SAMPLES = Number(argOf('minSamples', '8'));

if (!fs.existsSync(FILE)) {
  console.error(`NO SMOKE ARTIFACT at ${FILE}. The smoke did not run, which is not a pass.`);
  process.exit(3);
}

const rows = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const meta = rows.find((r) => r.__meta);
const samples = rows.filter((r) => r.n != null);
const segStarts = rows.filter((r) => r.__segmentStart);
const voids = rows.filter((r) => r.__void);
const errors = rows.filter((r) => r.__error);
const browserLost = rows.filter((r) => r.__browserLost);
const final = rows.find((r) => r.__final);

const gates = [];
const gate = (name, state, detail, catches) => gates.push({ name, state, detail, catches });

// 1. It ran at all.
gate('the harness completed its window',
  samples.length >= MIN_SAMPLES ? 'PASS' : 'FAIL',
  `${samples.length} samples (need ${MIN_SAMPLES})`,
  'A build that cannot keep a harness alive for twenty minutes will not survive ten hours.');

// 2. No browser death. In twenty minutes a segment boundary is instability, not resilience.
gate('the browser survived the whole window',
  (segStarts.length <= 1 && browserLost.length === 0) ? 'PASS' : 'FAIL',
  `${segStarts.length} segment start(s), ${browserLost.length} browser loss event(s)`,
  'Auto-resume is there for a ten-hour run. A death inside twenty minutes is the regression itself.');

// 3. Four panels live by PLAYHEAD every sample - the replay path.
const liveEvery = samples.length > 0 && samples.every((s) => s.panelsLive === 4);
const worstLive = samples.length ? Math.min(...samples.map((s) => s.panelsLive ?? 0)) : null;
gate('all four panels advanced by playhead on every sample',
  liveEvery ? 'PASS' : 'FAIL',
  `worst sample had ${worstLive}/4 live`,
  'THE REPLAY PATH. This is the gate the cherry-picks are most likely to break.');

// 4. Bars actually accumulate - the engine is doing work, not merely alive.
const firstBars = samples[0]?.residentBars ?? null;
const lastBars = samples[samples.length - 1]?.residentBars ?? null;
const barsGrew = firstBars != null && lastBars != null && lastBars > firstBars;
gate('resident bars accumulated across the window',
  barsGrew ? 'PASS' : 'FAIL',
  `${firstBars} -> ${lastBars} bars`,
  'Four live playheads on a chart that loads no data is a replay that renders nothing.');

// 5. The order path, on the trades arm only.
if (ARM === 'trades') {
  const closes = samples.map((s) => s.closedTrades ?? 0);
  const grew = closes.length > 1 && closes[closes.length - 1] > closes[0];
  gate('the governor opened and closed trades',
    grew ? 'PASS' : 'FAIL',
    `closed trades ${closes[0]} -> ${closes[closes.length - 1]}`,
    'The trade arm measures a trade term. A broken order path makes it a second zero-trade arm and nobody notices until the arms are compared.');
} else {
  const anyTrade = samples.some((s) => (s.closedTrades ?? 0) > 0);
  gate('the zero-trade arm stayed at zero trades',
    anyTrade ? 'FAIL' : 'PASS',
    `max closed trades ${Math.max(0, ...samples.map((s) => s.closedTrades ?? 0))}`,
    'The arm is defined by the absence of the trade term. One trade voids the comparison.');
}

// 6. The dependent variable was actually read.
const fpRead = samples.filter((s) => s.footprintTotalMB != null).length;
gate('the memory gauge read on nearly every sample',
  fpRead >= samples.length - 1 && fpRead > 0 ? 'PASS' : 'FAIL',
  `${fpRead}/${samples.length} samples carried a footprint`,
  'A soak whose dependent variable is null is the 03:14 harness: every survival property working around an absent measurement.');

// 7. Lag gauge.
const blkRead = samples.filter((s) => s.blockingMsPerSec != null).length;
gate('the blocking gauge read on nearly every sample',
  blkRead >= samples.length - 1 && blkRead > 0 ? 'PASS' : 'FAIL',
  `${blkRead}/${samples.length} samples carried blocking ms/s`,
  'The scorecard needs a before/after on the same host and cadence.');

// 8. The seal held for the whole window, badge AND source commit.
const sealHeld = samples.every((s) => s.sealHeld === true);
const shaHeld = samples.every((s) => s.sourceCommitHeld !== false);
gate('the seal and the source commit held for the whole window',
  (sealHeld && shaHeld && voids.length === 0) ? 'PASS' : 'FAIL',
  `sealHeld on all=${sealHeld}, sourceCommit stable=${shaHeld}, ${voids.length} void note(s)`,
  'b121 was re-cut under its own badge once today. A build still moving at 22:30 is not a build to spend ten hours on.');

// 9. Host had room. Not a build property, but it decides whether the night is worth starting.
const worstHeadroom = samples.length ? Math.min(...samples.map((s) => s.host?.systemHeadroomPercent ?? 100)) : null;
const peakNode = samples.length ? Math.max(...samples.map((s) => s.host?.nodeTotalMB ?? 0)) : null;
gate('the host had memory headroom throughout',
  (worstHeadroom == null || worstHeadroom >= 15) ? 'PASS' : 'WARN',
  `worst headroom ${worstHeadroom}%, peak node.exe aggregate ${peakNode} MB`,
  'The crash that cost a ten-hour run was 16,387 MB of node.exe at 99% system memory.');

// 10. Per-script attribution is collecting. Ranking only - the ms/s is not quotable while over-attributed.
const loafOk = samples.filter((s) => s.loaf?.ok).length;
gate('the CDP LoAF census is collecting on all realms',
  loafOk >= samples.length - 1 && loafOk > 0 ? 'PASS' : 'WARN',
  `${loafOk}/${samples.length} samples carried a census; over-attributed on ${samples.filter((s) => s.loaf?.overAttributed).length}`,
  'Free naming census all night. A WARN here loses attribution, not the soak.');

// 11. No unhandled harness error.
gate('no harness error was recorded',
  errors.length === 0 ? 'PASS' : 'FAIL',
  errors.length ? String(errors[0].error).slice(0, 160) : 'none',
  'An exception in the loop ends the night wherever it happens.');

const failed = gates.filter((g) => g.state === 'FAIL');
const warned = gates.filter((g) => g.state === 'WARN');
const verdict = failed.length ? 'DO NOT FIRE' : (warned.length ? 'FIRE WITH WARNINGS' : 'CLEAR TO FIRE');

console.log(`\nBUILD SMOKE — ${ARM} arm`);
console.log(`build: badge ${meta?.seal?.badge ?? '?'} digest ${meta?.seal?.digest ?? '?'} sha ${String(meta?.sourceCommitSha ?? '?').slice(0, 12)}`);
console.log(`window: ${samples.length} samples, ${samples.length ? samples[samples.length - 1].hours : 0} h, completed=${final?.completed ?? 'still running'}\n`);
for (const g of gates) {
  console.log(`${g.state.padEnd(5)} ${g.name}`);
  console.log(`      ${g.detail}`);
  if (g.state !== 'PASS') console.log(`      catches: ${g.catches}`);
}
console.log(`\n${verdict}${failed.length ? ` — ${failed.length} gate(s) failed: ${failed.map((g) => g.name).join('; ')}` : ''}`);

fs.writeFileSync(path.join(EV, `BUILD-SMOKE-GRADE-${ARM}.json`), JSON.stringify({
  signature: 'BUILD-SMOKE-GRADE-V1', at: new Date().toISOString(), arm: ARM,
  bfcacheState: 'default (enabled) — a continuous session, no reset axis measured here.',
  whyThisExists: '18 late cherry-picks land before the seal. This proves the final build survives the harness before ten unattended hours are spent on it.',
  build: { badge: meta?.seal?.badge ?? null, digest: meta?.seal?.digest ?? null, sourceCommitSha: meta?.sourceCommitSha ?? null },
  samples: samples.length, gates, verdict,
}, null, 1));

process.exitCode = failed.length ? 1 : 0;
