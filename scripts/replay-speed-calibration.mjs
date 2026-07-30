/**
 * REPLAY-SPEED-CALIBRATION-V1 — what speed has this campaign actually been
 * measuring at?
 *
 * The product's own arithmetic (chart.js: rawCandlesPerSecond = replaySystem.speed
 * / timeframeSeconds) makes "speed 60" one bar per second on a 1m chart, i.e. 60x
 * real time. The harness measured 17.6 bars/s while asking for 60, which implies
 * the setting never landed and every CPU and allocation figure taken at "60x" was
 * taken roughly seventeen times faster than the PO's session.
 *
 * This probe reads the speed field the product holds, tries every setter it
 * exposes, and reports the measured bars/second against the arithmetic. Nothing
 * here is asserted from the API surface: each arm is measured.
 */
import fs from 'node:fs';

import { bootConf01Session, probePanelAdvanceRates } from './lib/conf01-session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function applySpeed(page, { setter, value }) {
  const results = [];
  for (const frame of page.frames()) {
    const got = await frame.evaluate((how, v) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return null;
      const before = Number(rs.speed);
      try {
        if (how === 'field') rs.speed = v;
        else if (typeof rs[how] === 'function') rs[how](v);
        else return { applied: false, reason: `${how} missing`, before, after: Number(rs.speed) };
      } catch (error) {
        return { applied: false, reason: String(error?.message || error), before, after: Number(rs.speed) };
      }
      return { applied: true, before, after: Number(rs.speed) };
    }, setter, value).catch(() => null);
    if (got) results.push(got);
  }
  return results;
}

export async function runReplaySpeedCalibration({ outPath = null, targetSpeed = 60 } = {}) {
  // Boot as the campaign has always booted, so arm 1 reports the status quo.
  const session = await bootConf01Session({ replaySpeed: targetSpeed });
  const { browser, page, conf01 } = session;
  const report = {
    signature: 'REPLAY-SPEED-CALIBRATION-V1',
    takenAt: new Date().toISOString(),
    conf01Compliant: conf01.compliant,
    conf01Failed: conf01.failed,
    targetSpeed,
    productArithmetic: 'chart.js:24826 rawCandlesPerSecond = replaySystem.speed / timeframeSeconds',
    arms: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };

  const measure = async (label, note) => {
    const rows = await probePanelAdvanceRates(page, { windowMs: 8_000, replaySpeed: targetSpeed });
    const arm = { label, note, panels: rows };
    report.arms.push(arm);
    save();
    console.error(`[speed] ${label}: ${rows.map((r) => `${r.timeframe} speedField=${r.speedField} setters=[${(r.speedSetters || []).join('|')}] ${r.barsPerSec}bars/s (expect ${r.expectedBarsPerSec}) sim=${r.simSecPerWallSec}s/s atEnd=${r.atEnd}`).join(' || ')}`);
    return arm;
  };

  try {
    await measure('as-armed', `harness asked for setSpeed(${targetSpeed}) during arming`);

    for (const setter of ['setSpeed', 'field']) {
      const applied = await applySpeed(page, { setter, value: targetSpeed });
      await sleep(3_000);
      await measure(`after ${setter}(${targetSpeed})`, JSON.stringify(applied.slice(0, 4)));
    }

    // If the field is what governs, a deliberately slow setting must show up as a
    // proportionally slower bar rate. That is the check that proves control rather
    // than coincidence.
    const slow = 6;
    await applySpeed(page, { setter: 'field', value: slow });
    await sleep(3_000);
    await measure(`after field=${slow}`, 'proportionality check: 10x slower must read 10x fewer bars/s');

    const host = (arm) => (arm?.panels || []).find((p) => p.timeframe === '1m');
    const asArmed = host(report.arms[0]);
    const afterSet = host(report.arms[report.arms.length - 2]);
    const afterSlow = host(report.arms[report.arms.length - 1]);
    report.conclusion = {
      asArmedBarsPerSec: asArmed?.barsPerSec ?? null,
      asArmedSpeedField: asArmed?.speedField ?? null,
      asArmedEffectiveMultipleOfRequested: asArmed?.rateRatio ?? null,
      afterExplicitSetBarsPerSec: afterSet?.barsPerSec ?? null,
      afterSlowSetBarsPerSec: afterSlow?.barsPerSec ?? null,
      speedIsControllable: afterSlow?.barsPerSec != null && afterSet?.barsPerSec != null
        ? afterSlow.barsPerSec < afterSet.barsPerSec * 0.5
        : null,
    };
    save();
    return report;
  } finally {
    await browser.close().catch(() => {});
    save();
  }
}

const invokedDirectly = process.argv[1] && /replay-speed-calibration\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const report = await runReplaySpeedCalibration({ outPath: outArg ? outArg.slice(6) : null });
  console.error(`[speed] conclusion=${JSON.stringify(report.conclusion)}`);
}
