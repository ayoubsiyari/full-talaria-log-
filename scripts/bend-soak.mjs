#!/usr/bin/env node
/**
 * BEND-SOAK — the ten-hour soak, carrying two jobs.
 *
 * JOB 1 (the duration claim): a `DUR-01`-length span so the memory verdict rests on a real fit rather
 * than a chord.
 *
 * JOB 2 (added 11:06 by the Director): find where the concave bend SETTLES. That number, not the
 * 513 MB/h chord, is what says how far we are from the 50 MB/h bar.
 *
 * WHY THE TRADE RATE IS GOVERNED HERE AND WAS NOT IN B6
 * B6 placed an order on a cadence but let positions close on price action, so the CLOSE rate decayed
 * from 32.9/h to 15.0/h across the run. Memory is linear in closed trades and the trade rate was
 * halving, which is sufficient on its own to bend the memory-versus-time curve. B6 therefore cannot tell
 * a real saturation from its own decaying driver.
 *
 * This run closes trades on a fixed cadence through `closePositionAtPrice`, so closed trades accumulate
 * linearly in wall clock BY CONSTRUCTION, and the run becomes decisive either way:
 *
 *   - If memory is now STRAIGHT in time, the B6 bend was entirely the decaying trade rate. There is no
 *     plateau, the terminal rate equals the average rate, and the PO must be told the flattening they
 *     were hoping for does not exist.
 *   - If memory STILL bends with the driver held steady, the saturation is real and its asymptote is a
 *     genuine number. The local rate in the final hours is then what a long-running user experiences.
 *
 * WHAT THIS DESIGN GIVES UP, STATED UP FRONT
 * Holding closes linear in time makes closed trades and hours collinear, so this run CANNOT separate the
 * two drivers. It is not trying to — that separation is already done and published (+16.61 MB per closed
 * trade with hours held, CI[11.81, 21.42]). `UNIT-01` is satisfied the way the rule allows: the per-hour
 * figure is published together with the declared trade rate and speed that produced it.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State, cycleTrades } from './lib/conf01-session.mjs';
import { readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { fitTrend } from './lib/duration-trend.mjs';
import { ols2 } from './lib/ols2.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

// Configuration comes from ARGUMENTS, not environment variables. Two launches were lost to the
// environment today: a stale C_OUT left in a shell made one run overwrite another run's artifact, and
// in-process pipe redirection with nothing draining it killed the first ten-hour attempt before it wrote
// a single sample. Arguments are visible in the process list and cannot leak between launches.
const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BEND-SOAK-20260731.json');
const HOURS = Number(argOf('hours', 10));
const SAMPLE_MS = Number(argOf('sample-ms', 180_000));
const SPEED = Number(argOf('speed', 5));
/** Closes per hour, held steady. Above the 20+/h floor I warned the concavity would need. */
const TARGET_CLOSES_PER_HOUR = Number(argOf('closes-per-hour', 20));
/** The bar the PO is measured against. */
const BAR_MB_PER_HOUR = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'BEND-SOAK-V1',
  ruling: 'cbfdb81f4 item 11, plus the second job added at 11:06 — locate where the concave bend settles',
  jobs: [
    'DUR-01 length so the memory verdict is a fit, not a chord',
    'Locate the settled local rate, which is the number that says how far we are from the 50 MB/h bar',
  ],
  design: {
    hours: HOURS,
    sampleIntervalMs: SAMPLE_MS,
    speed: SPEED,
    targetClosesPerHour: TARGET_CLOSES_PER_HOUR,
    tradeGovernor: 'One open and one close per sample via closePositionAtPrice, so closed trades accumulate linearly in wall clock. The position closed is the OLDEST open one, so every closed trade was held across bar closes and carries real excursion samples.',
    whyGoverned: 'B6 let closes happen on price action and its close rate halved from 32.9/h to 15.0/h. Memory is linear in closed trades, so a decaying driver is sufficient by itself to bend the time curve. Holding the driver steady is what makes the bend question decidable.',
    collinearityAccepted: 'Closed trades and hours are collinear here BY DESIGN. This run cannot separate the two drivers and does not try; that separation is published already. UNIT-01 is met by declaring the trade rate and speed alongside every per-hour figure.',
    barMBPerHour: BAR_MB_PER_HOUR,
  },
  gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
  startedAtIso: new Date().toISOString(),
  samples: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

(async () => {
  let session = null;
  const trades = { opened: 0, closed: 0, governorTicks: 0, errors: [] };
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      speed: SPEED,
      placeOrder: false,
      label: 'bend-soak',
    });
    const { page, cdp, browserCdp, conf01, browser } = session;
    report.buildStamp = conf01?.buildId ?? null;
    // Today's baseline, per-bar and correlation findings are all on b116. A different stamp here means
    // tonight's numbers are NOT directly comparable to B6's and the comparison must be stated as
    // cross-build rather than quietly made.
    report.buildBoundary = report.buildStamp && !String(report.buildStamp).includes('b116')
      ? `Findings published today were measured on 20260730b116; this run is on ${report.buildStamp}. Any comparison against B6 or against the per-bar rate is CROSS-BUILD and must say so.`
      : null;
    report.conf01 = {
      panels: conf01?.panels ?? null,
      distinctFileIds: conf01?.distinctFileIds ?? null,
      distinctTimeframes: conf01?.distinctTimeframes ?? null,
    };

    const t0 = Date.now();
    const deadline = t0 + HOURS * 3_600_000;
    // Governor cadence derived from the target rate rather than assumed equal to the sample interval,
    // so the two can be tuned independently without silently changing the declared trade rate.
    const governorEveryMs = 3_600_000 / TARGET_CLOSES_PER_HOUR;
    let nextGovernorAt = t0;
    let n = 0;

    while (Date.now() < deadline) {
      n += 1;
      const now = Date.now();

      // The governor can only fire when the sample loop comes round, so a single close per pass makes the
      // achieved rate the SAMPLE rate, not the target rate: the smoke run asked for 20/h and delivered
      // 13.4/h. Execute every tick that is due instead, so the average rate is the declared one.
      if (now >= nextGovernorAt) {
        let due = Math.max(1, Math.floor((now - nextGovernorAt) / governorEveryMs) + 1);
        due = Math.min(due, 4); // never let a long stall dump a burst of trades into one sample
        for (let k = 0; k < due; k += 1) {
          trades.governorTicks += 1;
          const c = await cycleTrades(page, { open: 1, close: 1, holdMs: 0 }).catch((e) => ({ errors: [String(e?.message || e)] }));
          trades.opened += c?.opened || 0;
          trades.closed += c?.closed || 0;
          if (c?.errors?.length && trades.errors.length < 20) trades.errors.push(...c.errors.slice(0, 2));
        }
        nextGovernorAt = now + governorEveryMs;
      }

      // A ten-hour run on a tab that reached 1.5 GB in eighteen minutes may well be killed by the
      // renderer running out of memory. That is a RESULT, not a failure, but it has to be recorded as one
      // rather than surfacing as an unhandled rejection that discards the grade.
      let g = null;
      try {
        g = await readSweepGauges(page, cdp, browserCdp, {
          cpuWindowMs: 6_000, readOsFootprints, forceGc: true,
        });
      } catch (err) {
        const msg = String(err?.message || err);
        report.endedEarly = `gauges stopped answering at sample ${n} after ${((Date.now() - t0) / 3_600_000).toFixed(2)}h: ${msg.slice(0, 160)}`;
        report.likelyRendererDeath = /detached|closed|Target|crash|Session/i.test(msg);
        break;
      }
      const state = await readConf01State(page).catch(() => null);

      // A soak that quietly stops playing measures an idle chart for hours.
      let reArmed = false;
      if ((state?.advancingPanels ?? 0) < 1) {
        reArmed = await page.evaluate(() => {
          let armed = false;
          for (const w of [window, ...Array.from(document.querySelectorAll('iframe')).map((f) => { try { return f.contentWindow; } catch { return null; } })]) {
            const rs = w && w.chart && w.chart.replaySystem;
            if (rs && !rs.isPlaying && typeof rs.play === 'function') { try { rs.play(); armed = true; } catch { /* ignore */ } }
          }
          return armed;
        }).catch(() => false);
      }

      const hours = +((Date.now() - t0) / 3_600_000).toFixed(4);
      report.samples.push({
        sample: n,
        hours,
        closedTrades: state?.closedTrades ?? trades.closed,
        openPositions: state?.openPositions ?? null,
        governorClosed: trades.closed,
        footprintTotalMB: g.footprint?.totalPrivateMB ?? null,
        rendererMB: g.footprint?.pageRendererPrivateMB ?? null,
        gpuMB: g.footprint?.gpuProcessPrivateMB ?? null,
        heapPostGcMB: g.counters?.collected?.jsHeapMB ?? null,
        nodes: g.counters?.live?.nodes ?? null,
        listeners: g.counters?.live?.listeners ?? null,
        documents: g.counters?.live?.documents ?? null,
        residentBars: state?.totalBars ?? null,
        rendererCpuPercent: g.cpu?.rendererCpuPercent ?? null,
        reArmed,
      });
      save();
      const r = report.samples[report.samples.length - 1];
      console.error(`[bend] #${n} ${r.hours}h closed=${r.closedTrades} foot=${r.footprintTotalMB}MB heap=${r.heapPostGcMB}MB nodes=${r.nodes} cpu=${r.rendererCpuPercent}%${reArmed ? ' RE-ARMED' : ''}`);

      await sleep(SAMPLE_MS);
    }
    report.status = 'OK';
    try { await browser?.close?.(); } catch { /* gone */ }
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
    try { await session?.browser?.close?.(); } catch { /* gone */ }
  }

  report.trades = trades;
  const s = report.samples;

  // ---- Was the driver actually steady? This is the control B6 lacked. ------
  if (s.length >= 4) {
    const spanH = s[s.length - 1].hours;
    const totalClosed = (s[s.length - 1].closedTrades ?? 0) - (s[0].closedTrades ?? 0);
    const perHourBuckets = [];
    for (let h = 0; h < Math.ceil(spanH); h += 1) {
      const inBucket = s.filter((r) => r.hours >= h && r.hours < h + 1);
      if (inBucket.length < 2) continue;
      const closes = (inBucket[inBucket.length - 1].closedTrades ?? 0) - (inBucket[0].closedTrades ?? 0);
      const dh = inBucket[inBucket.length - 1].hours - inBucket[0].hours;
      perHourBuckets.push({
        hour: h + 1,
        closesPerHour: dh > 0 ? +(closes / dh).toFixed(1) : null,
        footprintFirstMB: inBucket[0].footprintTotalMB,
        footprintLastMB: inBucket[inBucket.length - 1].footprintTotalMB,
        localMBPerHour: dh > 0 && inBucket[0].footprintTotalMB != null && inBucket[inBucket.length - 1].footprintTotalMB != null
          ? +(((inBucket[inBucket.length - 1].footprintTotalMB - inBucket[0].footprintTotalMB) / dh).toFixed(1))
          : null,
        samples: inBucket.length,
      });
    }
    const rates = perHourBuckets.map((b) => b.closesPerHour).filter(Number.isFinite);
    const meanRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const sdRate = rates.length > 1
      ? Math.sqrt(rates.reduce((a, b) => a + (b - meanRate) ** 2, 0) / (rates.length - 1)) : null;
    report.driverSteadiness = {
      targetClosesPerHour: TARGET_CLOSES_PER_HOUR,
      observedClosesPerHour: rates,
      meanClosesPerHour: meanRate != null ? +meanRate.toFixed(1) : null,
      sdClosesPerHour: sdRate != null ? +sdRate.toFixed(2) : null,
      coefficientOfVariation: meanRate ? +(sdRate / meanRate).toFixed(3) : null,
      firstHourVsLastHour: rates.length >= 2 ? [rates[0], rates[rates.length - 1]] : null,
      b6ForComparison: 'B6 decayed 32.9/h -> 15.0/h, a factor of 2.2',
      steady: meanRate != null && sdRate != null && (sdRate / meanRate) < 0.25,
      verdictIfNotSteady: 'If the governor did NOT hold the rate steady, the bend question is NOT settled by this run either, and that must be said rather than fitted through.',
    };

    // ---- JOB 2: where does the local rate settle? --------------------------
    const localRates = perHourBuckets.map((b) => b.localMBPerHour).filter(Number.isFinite);
    const firstHalf = localRates.slice(0, Math.floor(localRates.length / 2));
    const lastHalf = localRates.slice(Math.floor(localRates.length / 2));
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const fhMean = mean(firstHalf);
    const lhMean = mean(lastHalf);
    // The settled rate is the mean of the final third, which is the regime a long session lives in.
    const finalThird = localRates.slice(Math.max(0, localRates.length - Math.max(2, Math.round(localRates.length / 3))));
    const settled = mean(finalThird);

    const pts = s.filter((r) => Number.isFinite(r.footprintTotalMB))
      .map((r) => ({ hours: r.hours, value: r.footprintTotalMB }));
    const chord = pts.length >= 4 ? fitTrend(pts, { label: 'footprint', minSpanHours: 0 }) : null;

    report.bend = {
      perHourBuckets,
      localMBPerHourByHour: localRates,
      firstHalfMeanMBPerHour: fhMean != null ? +fhMean.toFixed(1) : null,
      lastHalfMeanMBPerHour: lhMean != null ? +lhMean.toFixed(1) : null,
      settledMBPerHour: settled != null ? +settled.toFixed(1) : null,
      settledOverWindow: `mean of the final ${finalThird.length} hourly windows`,
      chordMBPerHour: chord?.perHour ?? null,
      chordCi: chord?.slopeCi95 ?? null,
      chordRSquared: chord?.rSquared ?? null,
      bendPresent: fhMean != null && lhMean != null ? (lhMean < fhMean * 0.75) : null,
      shape: (fhMean != null && lhMean != null)
        ? (lhMean < fhMean * 0.75
          ? 'CONCAVE — the local rate fell by more than a quarter between the first and second half, with the driver held steady, so the saturation is real'
          : (lhMean > fhMean * 1.25
            ? 'CONVEX — the local rate ROSE, which is worse than linear and must not be described as a plateau'
            : 'STRAIGHT — the local rate did not change materially with the driver held steady, so B6\'s bend was its decaying trade rate and there is NO plateau'))
        : null,
      // UNIT-01: the per-hour number never travels without its driver.
      unit01: {
        mbPerClosedTrade: totalClosed > 0 && pts.length >= 2
          ? +(((pts[pts.length - 1].value - pts[0].value) / totalClosed).toFixed(2))
          : null,
        closedTradesObserved: totalClosed,
        declaredWith: `${meanRate != null ? meanRate.toFixed(1) : '?'} closes/h at speed ${SPEED}, four panels, two indicators each`,
        note: 'Any per-hour figure from this run is only valid at the declared trade rate. At half the trade rate it is roughly half, because memory is linear in closed trades.',
      },
      versusTheBar: settled != null ? {
        barMBPerHour: BAR_MB_PER_HOUR,
        settledMBPerHour: +settled.toFixed(1),
        multipleOfBar: +(settled / BAR_MB_PER_HOUR).toFixed(1),
        readingForThePo: settled <= BAR_MB_PER_HOUR
          ? `At a steady ${meanRate != null ? meanRate.toFixed(1) : '?'} closes/h the settled rate is ${settled.toFixed(1)} MB/h, INSIDE the ${BAR_MB_PER_HOUR} MB/h bar.`
          : `At a steady ${meanRate != null ? meanRate.toFixed(1) : '?'} closes/h the settled rate is ${settled.toFixed(1)} MB/h — ${(settled / BAR_MB_PER_HOUR).toFixed(1)}x the ${BAR_MB_PER_HOUR} MB/h bar. The chord across the whole run reads ${chord?.perHour ?? '?'} MB/h, and the settled figure is the one a long session lives in.`,
      } : null,
    };

    // ---- Bars against trades, because bars turned out to be the bigger driver -
    // MONOTONIC-BARS-GATE measured +23.98 MB per thousand resident bars CI[22.75, 25.21] with trades held
    // at zero, and at a moderate workload that is ~1,084 MB/h against ~332 MB/h from trades. The per-trade
    // figure was fitted WITHOUT bars in the model and is therefore an upper bound. This run is the chance
    // to put both drivers in one model — but only if its own bar axis accumulated, which a soak that
    // re-arms playback cannot guarantee.
    const barRows = s.filter((r) => Number.isFinite(r.residentBars) && Number.isFinite(r.footprintTotalMB)
      && Number.isFinite(r.closedTrades));
    let barsMonotonic = barRows.length >= 4;
    for (let i = 1; i < barRows.length; i += 1) {
      if (barRows[i].residentBars < barRows[i - 1].residentBars) { barsMonotonic = false; break; }
    }
    report.barsVersusTrades = {
      barsMonotonic,
      reArmCount: s.filter((r) => r.reArmed).length,
      residentBarsFirst: barRows[0]?.residentBars ?? null,
      residentBarsLast: barRows[barRows.length - 1]?.residentBars ?? null,
      perThousandBarsFromTheCleanRun: 23.98,
      perThousandBarsCiFromTheCleanRun: [22.75, 25.21],
    };
    if (barsMonotonic) {
      const fit = ols2(
        barRows.map((r) => r.footprintTotalMB),
        barRows.map((r) => r.residentBars / 1000),
        barRows.map((r) => r.closedTrades),
      );
      if (fit && !fit.degenerate) { delete fit.resid; delete fit.fitted; }
      report.barsVersusTrades.twoDriverFit = fit;
      report.barsVersusTrades.reading = fit?.degenerate
        ? `Degenerate: ${fit.reason}. Bars and trades cannot be separated in this run.`
        : `With both drivers in one model: ${fit.perHour} MB per thousand bars CI[${fit.perHourCi?.join(', ')}] and ${fit.perClosedTrade} MB per closed trade CI[${fit.perClosedTradeCi?.join(', ')}], VIF ${fit.varianceInflation}. The per-trade figure published at 10:10 (+16.61 MB, bars omitted) should be read against this one, and if it falls, part of what looked like trade cost was bar cost.`;
    } else {
      report.barsVersusTrades.reading = `NO two-driver fit: the bar axis was not monotonic (${report.barsVersusTrades.reArmCount} re-arms), so bars cannot enter the model without carrying the same artifact that made me refuse the soak's negative per-bar slope. The clean per-bar rate stands on MONOTONIC-BARS-GATE instead.`;
    }

    report.verdict = report.bend.shape
      ? `${report.bend.shape.split('—')[0].trim()}. Settled local rate ${report.bend.settledMBPerHour} MB/h against a ${chord?.perHour ?? '?'} MB/h chord, at a ${report.driverSteadiness.steady ? 'STEADY' : 'NOT STEADY'} ${report.driverSteadiness.meanClosesPerHour} closes/h.`
      : 'Insufficient hourly windows to grade the bend.';
  } else {
    report.verdict = `Too few samples (${s.length}) to grade. ${report.void || ''}`;
  }
  save();

  console.error(`\n=== BEND SOAK ${report.status} build=${report.buildStamp} ===`);
  if (report.driverSteadiness) {
    console.error(`driver: target ${TARGET_CLOSES_PER_HOUR}/h, observed ${JSON.stringify(report.driverSteadiness.observedClosesPerHour)} (cv ${report.driverSteadiness.coefficientOfVariation}) steady=${report.driverSteadiness.steady}`);
  }
  if (report.bend) {
    console.error(`local MB/h by hour: ${JSON.stringify(report.bend.localMBPerHourByHour)}`);
    console.error(`first half ${report.bend.firstHalfMeanMBPerHour} -> last half ${report.bend.lastHalfMeanMBPerHour}, settled ${report.bend.settledMBPerHour}`);
    console.error(`shape: ${report.bend.shape}`);
    if (report.bend.versusTheBar) console.error(`\nPO: ${report.bend.versusTheBar.readingForThePo}`);
  }
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
