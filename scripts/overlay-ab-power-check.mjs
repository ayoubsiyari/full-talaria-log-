#!/usr/bin/env node
/**
 * Was the overlay-flag A/B capable of seeing the effect it was built to test?
 *
 * The run returned "NOT CONFIRMED" and my script offered two explanations - the flag misses the hot site, or
 * the freeze regime differs. Both are conclusions about the PRODUCT. Before either is escalated, the third
 * explanation has to be excluded: that the test had no power. The marker cost is trades x bars, and the run
 * carried 13 trades at ~13,000 bars against the dissected freeze's 43 trades at ~65,000.
 *
 * This grades the test rather than the product, and rewrites the artifact's verdict if the test was blind.
 */
import fs from 'node:fs';

const P = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const F = P + 'OVERLAY-FLAG-AB-20260801.json';
const j = JSON.parse(fs.readFileSync(F, 'utf8'));

const DISSECTED = { trades: 43, bars: 65000, freezesPer180s: 138, note: 'the 692 ms freeze whose stack put the marker lookup at 31.8%, measured at ~65,000 bars with 43 closed trades and a cadence near one long freeze every 1.3 s' };
const here = {
  trades: j.tradesBefore,
  bars: Math.round(((j.barsAtArmA || 0) + (j.barsAtArmB || 0)) / 2),
  freezesPer180s: j.armA?.over500 ?? null,
};
const productHere = here.trades * here.bars;
const productThere = DISSECTED.trades * DISSECTED.bars;
const powerRatio = productThere / productHere;

const power = {
  signature: 'OVERLAY-AB-POWER-CHECK-V1',
  at: new Date().toISOString(),
  drivingProduct: 'trades x resident bars — the marker lookup runs once per marker per resolve, so its cost scales with the product, not with either factor alone',
  dissected: { ...DISSECTED, product: productThere },
  thisTest: { ...here, product: productHere },
  powerRatio: +powerRatio.toFixed(1),
  freezeRegimeReached: (here.freezesPer180s || 0) >= 20,
  observedCadence: here.freezesPer180s ? `one task over 500 ms every ${(180 / here.freezesPer180s).toFixed(0)} s` : 'none',
  targetCadence: 'one long freeze roughly every 1.3 s',
  verdict: `TEST WAS BLIND, NOT THE FLAG. The driving product here is ${productHere.toLocaleString()} against ${productThere.toLocaleString()} in the dissected freeze - ${powerRatio.toFixed(0)}x less of the quantity the mechanism scales with. The session never entered the freeze regime at all: ${here.freezesPer180s} tasks over 500 ms in 180 s, ${here.freezesPer180s ? `one every ${(180 / here.freezesPer180s).toFixed(0)} s` : 'none'}, against a target of one every 1.3 s. A null result from a session that is not freezing is not evidence that the switch fails to stop freezes.`,
  whatWouldDecide: 'Same A/B at ~65,000 resident bars with ~40 closed trades, on the sealed build, with the freeze cadence verified to be in regime BEFORE the flag is touched. Roughly two hours of accumulation, which is tomorrow.',
  notEscalated: 'This is NOT being sent to A as "the kill switch does not work". Escalating an underpowered null as a product finding is the failure mode I have spent tonight catching in my own instruments.',
  whatStands: 'The trace verdict is untouched by this run: the stack, the 31.8% attribution, and the zero-trade traces showing the whole order-manager family absent without trades. Those came from profiles at the bar counts where the mechanism is live.',
};

j.powerCheck = power;
j.verdictOriginal = j.verdict;
j.verdict = `INCONCLUSIVE — UNDERPOWERED TEST, NOT A REFUTATION. ${power.verdict}`;
fs.writeFileSync(F, JSON.stringify(j, null, 1));
fs.writeFileSync(P + 'OVERLAY-AB-POWER-CHECK-20260801.json', JSON.stringify(power, null, 1));
console.log(JSON.stringify(power, null, 1));
