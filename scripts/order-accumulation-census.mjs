/**
 * ORDER-ACCUMULATION-CENSUS-V1 — the two numbers A needs before it cuts
 * POST-EXIT-SAMPLING-CUT (FINDING-ORDER-EXCURSION-IS-A-TIME-LEAK, 15:55):
 *
 *   1. per-tick order-loop cost as a function of CLOSED-trade count
 *   2. retained bytes of screenshot / base64 fields per position
 *
 * Both under CONF-02: trades opened and closed continuously, not a handful of fresh
 * orders. The loop measured is `orderManager.updatePositions`, which the product
 * wires to `replaySystem.onUpdate` (order-manager.js:8330), so it runs once per
 * replay tick.
 *
 * WHAT THIS INSTRUMENT CAN SEE: wall time inside the order loop per call and as a
 * share of the main thread, call rate, closed/open counts from the product's own
 * arrays, characters retained in heavy fields, excursion sample counts.
 * WHAT IT CANNOT SEE: work the loop schedules for later (async persists), server-side
 * cost, and any per-order cost outside updatePositions.
 */
import fs from 'node:fs';

import {
  bootConf01Session, cycleTrades, installOrderLoopTimer, keepConf01Playing,
  measureHeavyFieldBytes, measureOrderLoopCost, probePanelAdvanceRates, readTradeState,
} from './lib/conf01-session.mjs';
import { fitTrend } from './lib/duration-trend.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Slope of cost against closed-trade count, with a CI, reusing the DUR-01 fitter. */
export function fitCostAgainstClosedCount(levels) {
  const points = levels
    .filter((l) => l.valid !== false && Number.isFinite(l.closed) && Number.isFinite(l.msPerCall))
    .map((l) => ({ hours: l.closed, value: l.msPerCall }));
  const fit = fitTrend(points, { label: 'order-loop ms per tick vs closed trades', flatBandPerHour: 0, minSpanHours: 0 });
  return {
    ...fit,
    perClosedTradeMsPerTick: fit.perHour,
    note: 'x axis is closed-trade count, not hours; "perHour" is milliseconds per tick per additional closed trade',
  };
}

export async function runOrderAccumulationCensus({
  levels = [0, 10, 20, 30, 45],
  windowMs = 12_000,
  holdMs = 12_000,
  speed = 60,
  outPath = null,
} = {}) {
  const session = await bootConf01Session({ replaySpeed: speed });
  const { browser, page, conf01 } = session;
  const report = {
    signature: 'ORDER-ACCUMULATION-CENSUS-V1',
    takenAt: new Date().toISOString(),
    authority: 'CONF-02 (order accumulation, >=30 closed positions), FINDING-ORDER-EXCURSION-IS-A-TIME-LEAK-20260730-1555',
    conf01Compliant: conf01.compliant,
    conf01Failed: conf01.failed,
    loopMeasured: 'orderManager.updatePositions, wired to replaySystem.onUpdate (order-manager.js:8330)',
    levels: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  try {
    report.hookInstalled = await installOrderLoopTimer(page);
    console.error(`[orders] hook=${JSON.stringify(report.hookInstalled)} compliant=${conf01.compliant}`);

    let closedSoFar = 0;
    for (const target of levels) {
      // Accumulate to the target closed count, opening and closing in small batches
      // so open positions never pile up and confound the loop cost.
      let guard = 0;
      while (closedSoFar < target && guard < 200) {
        const batch = Math.min(5, target - closedSoFar);
        const r = await cycleTrades(page, { open: batch, close: batch, holdMs });
        closedSoFar += r.closed;
        guard += 1;
        if (r.closed === 0) {
          console.error(`[orders] close made no progress: ${JSON.stringify(r).slice(0, 200)}`);
          break;
        }
        await sleep(400);
      }
      // Playback must be alive or the loop never ticks and the level is void. Re-arm,
      // verify by measured advance, and retry once before accepting a dead level.
      let armed = await keepConf01Playing(page, speed);
      await sleep(2_000);
      let advanceCheck = await probePanelAdvanceRates(page, { windowMs: 3_000, replaySpeed: speed });
      if (!(advanceCheck[0]?.barsPerSec > 0)) {
        armed = await keepConf01Playing(page, speed);
        await sleep(3_000);
        advanceCheck = await probePanelAdvanceRates(page, { windowMs: 3_000, replaySpeed: speed });
      }
      const playbackAlive = advanceCheck[0]?.barsPerSec > 0;

      const trades = await readTradeState(page);
      await installOrderLoopTimer(page).catch(() => null);
      const cost = await measureOrderLoopCost(page, { windowMs });
      const heavy = await measureHeavyFieldBytes(page);
      const advance = await probePanelAdvanceRates(page, { windowMs: 4_000, replaySpeed: speed });
      const closed = trades.managerClosed ?? trades.serviceClosed ?? closedSoFar;
      const level = {
        targetClosed: target,
        closed,
        open: trades.managerOpen ?? trades.serviceOpen ?? null,
        trades,
        msPerCall: cost.measured?.msPerCall ?? null,
        callsPerSec: cost.measured?.callsPerSec ?? null,
        percentOfMainThread: cost.totalPercentOfMainThread,
        maxMs: cost.measured?.maxMs ?? null,
        // The cost only answers the question if the timed frame is the one
        // carrying the closed trades; a ticking empty panel reads ~0.01 ms.
        measuredFrameClosed: cost.measured?.closedHere ?? null,
        measuredFrameExcursionSamples: cost.measured?.excursionSamplesHere ?? null,
        bookFrameTicking: cost.bookFrameTicking ?? false,
        perFrame: cost.perFrame,
        heavyFieldChars: heavy?.totalChars ?? null,
        heavyMB: heavy?.heavyMB ?? null,
        heavyCharsPerRow: heavy?.heavyCharsPerRow ?? null,
        rowsWithHeavy: heavy?.rowsWithHeavy ?? null,
        excursionSamples: heavy?.excursionSamples ?? null,
        hostBarsPerSec: advance[0]?.barsPerSec ?? null,
        hostFps: advance[0]?.framesPerSec ?? null,
        // A level measured with dead playback is void, and says so rather than
        // contributing a zero to the fit.
        playbackAlive,
        valid: playbackAlive
          && (cost.measured?.callsPerSec || 0) > 0
          && (cost.measured?.closedHere || 0) > 0
          && (heavy?.excursionSamples || 0) > 0,
        reArm: armed,
      };
      report.levels.push(level);
      save();
      console.error(`[orders] closed=${level.closed} open=${level.open} timedFrameClosed=${level.measuredFrameClosed} valid=${level.valid} loop=${level.msPerCall}ms/tick x${level.callsPerSec}/s = ${level.percentOfMainThread}% of main | heavy=${level.heavyMB}MB (${level.heavyCharsPerRow} chars/row, ${level.rowsWithHeavy} rows) excursion=${level.excursionSamples} | bars/s=${level.hostBarsPerSec} fps=${level.hostFps}`);
    }

    report.fit = fitCostAgainstClosedCount(report.levels);
    const first = report.levels[0];
    const last = report.levels[report.levels.length - 1];
    report.conclusion = {
      closedRange: [first?.closed ?? null, last?.closed ?? null],
      msPerTickRange: [first?.msPerCall ?? null, last?.msPerCall ?? null],
      mainThreadShareRange: [first?.percentOfMainThread ?? null, last?.percentOfMainThread ?? null],
      perClosedTradeMsPerTick: report.fit.perClosedTradeMsPerTick,
      slopeCi95: report.fit.slopeCi95,
      verdict: report.fit.verdict,
      screenshotTermMB: last?.heavyMB ?? null,
      screenshotTermVerdict: (last?.heavyMB ?? 0) >= 1
        ? 'real term: >= 1 MB retained in heavy fields'
        : 'footnote on this surface: under 1 MB retained in heavy fields',
    };
    save();
    return report;
  } finally {
    await browser.close().catch(() => {});
    save();
  }
}

const invokedDirectly = process.argv[1] && /order-accumulation-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'out') opts.outPath = v;
    else if (k === 'window-ms') opts.windowMs = Number(v);
    else if (k === 'levels') opts.levels = v.split(',').map(Number);
    else if (k === 'speed') opts.speed = Number(v);
    else if (k === 'hold-ms') opts.holdMs = Number(v);
  }
  const report = await runOrderAccumulationCensus(opts);
  console.error(`[orders] conclusion=${JSON.stringify(report.conclusion)}`);
}
