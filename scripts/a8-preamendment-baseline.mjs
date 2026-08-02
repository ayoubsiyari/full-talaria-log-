/**
 * A8 PRE-AMENDMENT BASELINE — the cost of the build that contains no animation-contract code.
 *
 * A8 cost-neutrality compares the animation contract against a build without it. That build is the
 * current tree and it stops existing the moment A or E lands, so this captures it once and for all:
 * heap slope, allocation rate and blocking ms/s at speed 10, step=TF.
 *
 * IDENTITY IS THE POINT. A cost-neutrality comparison is only as good as the claim that this tree
 * lacks the thing being priced, so the artifact records the seal digest, the capability digest and the
 * source commit, and censuses the amendment's identifiers to show they are absent. "Pre-amendment" is
 * then a measured property of the artifact rather than a note about when it was taken.
 *
 *   node --max-old-space-size=1024 scripts/a8-preamendment-baseline.mjs --minutes=25
 */
import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { measureBlocking, measureAllocationRate } from './lib/cost-gauges.mjs';
import { deliveredRate } from './lib/rate-hold.mjs';
import { fitTrend } from './lib/duration-trend.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { capabilityDigest } from './lib/served-capability.mjs';
import { assertHeapCap } from './lib/heap-cap.mjs';

const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith(`--${n}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MINUTES = Number(arg('minutes', '25'));
const SPEED = Number(arg('speed', '10'));
const SAMPLE_EVERY_MS = Number(arg('everyMs', '60000'));
const ORIGIN = String(arg('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = arg('out', path.join(EV, `a8-preamendment-baseline-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));

// TOOL-01: a long-running harness process runs under a hard cap.
assertHeapCap({ capMB: 1024, label: 'a8-preamendment-baseline' });

/**
 * The amendment's vocabulary. Absence of every one of these is what makes this THE pre-amendment tree.
 *
 * Deliberately wider than the contract itself - a token that turns out to pre-date the amendment is
 * recorded with its count rather than treated as a failure, because the useful output is the census,
 * not a pass mark. The post-amendment build runs the same list and the two are compared.
 */
const AMENDMENT_TOKENS = [
  'animationContract', 'ANIMATION_CONTRACT', 'animation-contract',
  'puppet', 'Puppet',
  'resolveBar',
  'newsreader', 'Newsreader',
  'subMinute', 'subTimeframe', 'subMinuteStep', 'subTimeframeStep', 'setStepSeconds',
  '__TALARIA_ANIMATION', 'SIM_TAG', 'simTag',
];
// NOT amendment tokens: stepMs / stepSeconds already exist in pre-amendment replay-system.js as the
// TF-step duration path (_resolveReplayStepTimeframeMs). Counting them would falsify preAmendment on
// the very tree this baseline exists to preserve.

const CENSUS_FILES = [
  '/chart/modules/replay-system.js',
  '/chart/chart.js',
  '/chart/modules/chart-indicators-full.js',
  '/chart/modules/order-manager.js',
  '/chart/multichart-prod/multichart-manager.js',
];

async function censusAmendmentTokens(origin) {
  const out = [];
  for (const rel of CENSUS_FILES) {
    try {
      const res = await fetch(`${origin}${rel}`, { redirect: 'follow' });
      const ct = String(res.headers.get('content-type') || '');
      const body = await res.text();
      // A 200 of HTML is the SPA fallback, and counting zero tokens in an error page would read as
      // "absent" for the strongest possible reason: the file was never looked at.
      if (!res.ok || /text\/html/i.test(ct)) {
        out.push({ file: rel, readable: false, status: res.status, contentType: ct.slice(0, 40), why: 'not served as script — census cannot speak for this file' });
        continue;
      }
      const hits = {};
      for (const t of AMENDMENT_TOKENS) {
        const n = body.split(t).length - 1;
        if (n > 0) hits[t] = n;
      }
      out.push({ file: rel, readable: true, bytes: body.length, tokensFound: hits, clean: Object.keys(hits).length === 0 });
    } catch (err) {
      out.push({ file: rel, readable: false, why: String(err && err.message).slice(0, 90) });
    }
  }
  return out;
}

(async () => {
  const startedAt = new Date().toISOString();
  console.log(`A8 PRE-AMENDMENT BASELINE  speed=${SPEED} step=TF  ${MINUTES} min  origin ${ORIGIN}`);

  // ---- identity, before anything can move ------------------------------------------------------
  // computeSeal names the build `badge` and carries no commit; the SHA comes from build-info. Reading
  // the wrong field names here would have written null into the one artifact whose point is identity.
  const seal = await computeSeal(ORIGIN);
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ ok: false, why: String(e && e.message).slice(0, 80) }));
  if (!seal.ok || !seal.digest) { console.error(`REFUSING: could not seal the origin (${ORIGIN}). A baseline with no build identity cannot anchor an A8 comparison.`); process.exit(2); }
  if (!info.ok || !info.sourceCommitSha) { console.error(`REFUSING: no source commit from ${ORIGIN} (${info.why || info.state}). PASSPORT-3: the tree must be nameable, not just the bytes.`); process.exit(3); }
  const capability = await capabilityDigest(ORIGIN).catch((e) => ({ digest: null, why: String(e && e.message).slice(0, 80) }));
  const census = await censusAmendmentTokens(ORIGIN);
  const cleanFiles = census.filter((c) => c.readable && c.clean).length;
  const readable = census.filter((c) => c.readable).length;

  console.log(`  build ${seal.badge || '?'}  sha ${String(info.sourceCommitSha || '?').slice(0, 8)}  digest ${String(seal.digest || '?').slice(0, 8)}  capability ${String(capability.digest || '?').slice(0, 8)}`);
  console.log(`  amendment-token census: ${cleanFiles}/${readable} readable files carry none of the ${AMENDMENT_TOKENS.length} tokens`);
  for (const c of census.filter((x) => !x.readable || !x.clean)) {
    console.log(`    ${c.file}: ${c.readable ? `tokens ${JSON.stringify(c.tokensFound)}` : `UNREADABLE — ${c.why}`}`);
  }

  const eSel = await loadConf05Indicators();
  let session = null;
  const samples = [];
  let prevPanel = null;

  try {
    session = await bootConf01Session({
      indicators: eSel.pairs,
      replaySpeed: SPEED,
      placeOrder: false,          // zero trades: the animation contract is a bar-delivery cost, and a
                                  // trade term would sit on top of the quantity being baselined.
      label: 'a8-preamendment-baseline',
    });
    const page = session.page;
    const cdp = await page.target().createCDPSession();

    // step=TF is the pre-amendment condition and there is nothing to set - sub-TF stepping is the
    // feature that does not exist yet. Recorded as an observation so the artifact says so out loud.
    const stepProbe = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { readable: false };
      return {
        readable: true,
        hasStepSeconds: typeof rs.stepSeconds !== 'undefined' || typeof rs.getStepSeconds === 'function',
        hasSubTimeframeStep: typeof rs.setStepSeconds === 'function' || typeof rs.subTimeframeStep !== 'undefined',
        timeframe: (window.chart && window.chart.timeframe) || null,
      };
    }).catch(() => ({ readable: false }));
    console.log(`  step=TF confirmed by absence: sub-TF stepping API present = ${stepProbe.hasSubTimeframeStep === true}`);

    const t0 = Date.now();
    const deadline = t0 + MINUTES * 60_000;
    let n = 0;

    while (Date.now() < deadline) {
      n += 1;
      const atMs = Date.now();
      const hours = (atMs - t0) / 3_600_000;

      const fp = await readFootprint(session.browser).catch(() => ({}));
      const blocking = await measureBlocking(page, 5000);
      const alloc = await measureAllocationRate(cdp, 10000);

      const panel = await page.evaluate(() => {
        const c = window.chart;
        const rs = c && c.replaySystem;
        const tf = (c && c.timeframe) || '1m';
        const secs = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[tf] || 60;
        return {
          replayTimestamp: rs && rs.currentTime != null ? rs.currentTime : (rs && rs.replayTimestamp) || null,
          replayIndex: rs && rs.currentIndex != null ? rs.currentIndex : null,
          residentBars: (c && c.data && c.data.length) || null,
          tf, tfSec: secs,
          jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
        };
      }).catch(() => ({}));

      const cur = { atMs, replayTimestamp: panel.replayTimestamp, replayIndex: panel.replayIndex };
      const rate = prevPanel ? deliveredRate(prevPanel, cur, { baseTimeframeSec: panel.tfSec || 60 }) : { ok: false };
      prevPanel = cur;

      const s = {
        n, hours: +hours.toFixed(4),
        footprintTotalMB: fp.footprintTotalMB ?? null,
        rendererMB: fp.rendererMB ?? null,
        jsHeapMB: panel.jsHeapMB ?? null,
        residentBars: panel.residentBars ?? null,
        marketSecPerWallSec: rate.ok ? rate.marketSecPerWallSec : null,
        barsPerSec: rate.ok ? rate.barsPerSec : null,
        barsPerSecDenominatorSec: rate.ok ? rate.barsPerSecDenominatorSec : null,
        ...blocking,
        allocMBPerSec: alloc.allocMBPerSec ?? null,
        allocBytesPerSec: alloc.allocBytesPerSec ?? null,
        allocNote: alloc.allocNote ?? null,
      };
      samples.push({ ...s, allocTopCallers: alloc.allocTopCallers || null });

      console.log(`  [${String(n).padStart(2)}] ${(hours * 60).toFixed(1)}m  fp ${s.footprintTotalMB ?? '?'} MB  heap ${s.jsHeapMB ?? '?'} MB  bars ${s.residentBars ?? '?'}  block ${s.blockingMsPerSec ?? '?'} ms/s  alloc ${s.allocMBPerSec ?? '?'} MB/s  rate ${s.marketSecPerWallSec ?? '?'} mkt-s/s`);

      const spent = Date.now() - atMs;
      if (Date.now() < deadline) await sleep(Math.max(0, SAMPLE_EVERY_MS - spent));
    }
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch { /* nothing to close */ }
  }

  // ---- fits ------------------------------------------------------------------------------------
  const ok = samples.filter((s) => Number.isFinite(s.footprintTotalMB) && Number.isFinite(s.hours));
  const heapVsTime = fitTrend(ok.map((s) => ({ hours: s.hours, value: s.footprintTotalMB })));
  const withBars = samples.filter((s) => Number.isFinite(s.footprintTotalMB) && Number.isFinite(s.residentBars));
  // UNIT-01: the per-bar form is the quotable one; MB/h is inseparable from the delivery rate.
  const heapVsBars = withBars.length >= 6
    ? fitTrend(withBars.map((s) => ({ hours: s.residentBars / 1000, value: s.footprintTotalMB })))
    : { note: `only ${withBars.length} samples carry both footprint and resident bars` };

  const med = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
  const blockingMed = med(samples.map((s) => s.blockingMsPerSec));
  const allocMed = med(samples.map((s) => s.allocMBPerSec));
  const rateMed = med(samples.map((s) => s.marketSecPerWallSec));

  /**
   * fitTrend names its slope `perHour` whatever the x axis actually is, so a fit over thousands-of-bars
   * returns a per-bar quantity in a field called perHour. That exact mislabelling reached a published
   * artifact once. Read it out here and rename it to what it measures; never pass the raw field on.
   */
  const slopeOf = (fit, unit) => (fit && Number.isFinite(fit.perHour) ? {
    slope: fit.perHour, unit,
    ci95: fit.slopeCi95 ?? null,
    rSquared: fit.rSquared ?? null,
    runsZ: fit.runsZScore ?? null,
    straightEnough: fit.straightEnough ?? null,
    quadraticGain: fit.quadraticGain ?? null,
    extrapolable: fit.extrapolable ?? null,
    n: fit.n ?? null,
  } : { slope: null, unit, why: (fit && fit.note) || 'fit produced no slope' });

  const barSlope = slopeOf(heapVsBars, 'MB per 1,000 resident bars');
  const timeSlope = slopeOf(heapVsTime, 'MB per hour');

  const artifact = {
    signature: 'TALARIA_A8_PREAMENDMENT_BASELINE_V1',
    startedAt, finishedAt: new Date().toISOString(),
    condition: { speed: SPEED, step: 'TF', panels: 4, indicatorsPerPanel: 2, trades: 0, origin: ORIGIN, sampleEveryMs: SAMPLE_EVERY_MS },
    identity: {
      buildId: seal.badge ?? null,
      sourceCommit: info.sourceCommitSha ?? null,
      builtAt: info.builtAt ?? null,
      sealDigest: seal.digest ?? null,
      capabilityDigest: capability.digest ?? null,
      amendmentTokenCensus: census,
      amendmentTokensSearched: AMENDMENT_TOKENS,
      preAmendment: census.every((c) => !c.readable || c.clean) && census.some((c) => c.readable),
    },
    headline: {
      unit: 'market-seconds delivered per wall-second',
      medianBlockingMsPerSec: blockingMed,
      medianAllocMBPerSec: allocMed,
      medianMarketSecPerWallSec: rateMed,
      heapSlopePerThousandBars: barSlope,
      heapSlopePerHour: { ...timeSlope, caveat: 'MB/h is inseparable from the delivery rate this run happened to achieve; quote the per-thousand-bars form.' },
    },
    fits: { heapVsTime, heapVsBars },
    samples,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));

  console.log('\n=== A8 PRE-AMENDMENT BASELINE ===');
  console.log(`  build ${artifact.identity.buildId}  sha ${String(artifact.identity.sourceCommit).slice(0, 8)}  preAmendment=${artifact.identity.preAmendment}`);
  console.log(`  heap slope   ${barSlope.slope ?? '?'} MB per 1,000 resident bars  CI ${JSON.stringify(barSlope.ci95 ?? null)}  extrapolable=${barSlope.extrapolable ?? '?'} (runs z ${barSlope.runsZ ?? '?'})`);
  console.log(`               ${timeSlope.slope ?? '?'} MB/h  [rate-bound, do not quote alone]`);
  console.log(`  alloc rate   ${allocMed ?? '?'} MB/s median`);
  console.log(`  blocking     ${blockingMed ?? '?'} ms/s median`);
  console.log(`  delivery     ${rateMed ?? '?'} market-s/wall-s median`);
  console.log(`  samples ${samples.length}  ->  ${OUT}`);
})().catch((err) => { console.error('BASELINE FAILED:', err && err.stack || err); process.exitCode = 1; });
