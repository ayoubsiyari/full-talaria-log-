/**
 * QW3-FLOOR-CENSUS — price, on drained floors and in MB/kbar, the two rows the Director named:
 *
 *   ROW 1  the floor with QW-3's resample-cache-keep ON versus OFF
 *   ROW 2  the floor with E's per-panel tick-path slot buffers included
 *
 * THE BLOCKER THIS SCRIPT EXISTS TO PROVE OR DISPROVE
 * --------------------------------------------------
 * A static read of the served bytes says NEITHER row can be A/B'd on b122: `_qw3ResampleCacheKeepEnabled`
 * and every one of E's slot identifiers return zero matches in the served `replay-system.js`, while the
 * file is unminified (so absence is absence, not renaming). If that is right, then setting
 * `__TALARIA_DISABLE_QW3_RESAMPLE_CACHE_KEEP_V1` against production changes nothing, both arms read the
 * same floor, and the run reports "keeping the cache is free" — a FALSE NULL that would unblock a soak on
 * a measurement that never touched the thing it named. This workstream has shipped that failure before
 * under the name "one layer short"; it does not get to ship it on the row that decides the unblock.
 *
 * BIND-01. A static byte count cannot separate the three states, so this probe separates them at runtime:
 *   RESOLVER_ABSENT_FROM_TREE      the method is not on the live object at all
 *   RESOLVER_PRESENT_BUT_UNCALLED  the method exists, the flag is never consulted
 *   RESOLVER_CALLED                the flag is consulted, so an A/B would bind
 *
 * The instrument is a COUNTING GETTER: the flag is installed as an accessor that increments on every read.
 * Zero reads across a live play leg is positive evidence of non-binding, not an absence argument.
 *
 * ANTI-VACUITY, and this is the part that makes the zero mean something. A counting getter that is simply
 * broken also reads zero. So a CONTROL flag is installed the same way in the same realms:
 * `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1`, which the served build demonstrably consults
 * (`_m20Q9DropConsumerResampleCache` calls `_m20Q9PrefixSliceFixEnabled()` and both survive in the served
 * bytes). If the control also reads zero, the mechanism is dead and this probe reports PROVES-NOTHING
 * rather than a verdict.
 *
 * WHAT IS MEASURABLE WITHOUT A DEPLOY
 * -----------------------------------
 * The FLAG is absent from b122 but the STRUCTURE it would retain is live: `chart-data-pipeline.js` is
 * served and carries `_resampleCache` (5 matches), `invalidateResampleCache` and `_panDisplayCache`. So
 * the resident price of KEEPING can be censused on the current build even though the keep path cannot be
 * switched on. Read at a drained instant, per panel:
 *   - is `_resampleCache.result` populated at the floor? (if it is already resident under the DROP build,
 *     keeping adds nothing to the floor; if it is null, keeping adds its full size)
 *   - how long is it, and are its elements ALIASES of the master bars or fresh objects? An aliased result
 *     costs one pointer per element; a resampled one costs a whole bar. Confusing the two is how this
 *     workstream previously mispriced `fullRawData`.
 *
 * Bytes per bar are CALIBRATED in-page against a real allocation rather than assumed from a struct guess.
 *
 * WHY TWO DRAINS. One drained census gives a level, and a level cannot be quoted in MB/kbar. Two drains at
 * different resident-bar counts give a slope, which is the unit the Director asked for. This is the same
 * shape as the two-drain hoard instrument, censusing structures instead of only footprint.
 *
 * STALL. b122 stops delivering after ~10-14 minutes. Bars are the denominator here, so a stall costs
 * precision, not validity — but a leg that delivered nothing cannot produce a slope at all, so the leg
 * asserts delivery and the run is VOID if the playhead did not move.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session, keepConf01Playing } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { pauseProbe } from './lib/pause-probe.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
const WARM_MS = Number(arg('warmMs', '180000'));
const LEG_MS = Number(arg('legMs', '420000'));
const FROTH_MS = Number(arg('frothMs', '60000'));
const OUT = arg('out', `_evidence/manager-C/qw3-floor-census-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const DISABLE_QW3 = /^(1|true|yes|on)$/i.test(String(arg('disableQw3', 'false')));
const LOCAL_HARNESS = /^(1|true|yes|on)$/i.test(String(arg('localHarness', 'false')));

const QW3_FLAG = '__TALARIA_DISABLE_QW3_RESAMPLE_CACHE_KEEP_V1';
const CONTROL_FLAG = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';

const log = (m) => console.log(`[qw3-census ${new Date().toISOString().slice(11, 19)}] ${m}`);

/** Install counting accessors for both flags in every reachable realm. */
async function installFlagCounters(page, qw3Flag, controlFlag) {
  return page.evaluate(([qw3, ctl]) => {
    const install = (w, name) => {
      try {
        if (w.__talariaFlagReadCounts && w.__talariaFlagReadCounts[name] !== undefined) return 'already';
        w.__talariaFlagReadCounts = w.__talariaFlagReadCounts || {};
        w.__talariaFlagReadCounts[name] = 0;
        const existing = Object.getOwnPropertyDescriptor(w, name);
        // Preserve whatever value was there; the probe must not change product behaviour, only observe it.
        let backing = existing ? (existing.get ? existing.get.call(w) : existing.value) : undefined;
        Object.defineProperty(w, name, {
          configurable: true,
          get() { w.__talariaFlagReadCounts[name]++; return backing; },
          set(v) { backing = v; },
        });
        return 'installed';
      } catch (e) { return 'failed:' + String(e).slice(0, 60); }
    };
    const realms = [];
    const visit = (w, label) => {
      realms.push({ realm: label, qw3: install(w, qw3), control: install(w, ctl) });
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) {
      try { visit(window.frames[i], 'frame' + i); } catch (_) { realms.push({ realm: 'frame' + i, qw3: 'cross-origin', control: 'cross-origin' }); }
    }
    return realms;
  }, [qw3Flag, controlFlag]);
}

async function readFlagCounters(page) {
  return page.evaluate(() => {
    const out = [];
    const rd = (w, label) => {
      try { out.push({ realm: label, counts: w.__talariaFlagReadCounts ? { ...w.__talariaFlagReadCounts } : null }); }
      catch (_) { out.push({ realm: label, counts: null }); }
    };
    rd(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { rd(window.frames[i], 'frame' + i); } catch (_) { /* cross-origin */ } }
    return out;
  });
}

/** BIND-01 runtime capability read plus the drained structural census. */
async function censusRealms(page) {
  return page.evaluate(() => {
    const collectCharts = (w) => {
      const seen = new Set();
      const charts = [];
      const push = (c, how) => {
        if (!c || typeof c !== 'object' || seen.has(c)) return;
        seen.add(c); charts.push({ chart: c, how });
      };
      try { push(w.chart, 'w.chart'); } catch (_) {}
      try {
        const mc = w.multichartManager;
        const list = mc && (mc.charts || mc._charts);
        if (Array.isArray(list)) list.forEach((c, i) => push(c && (c.chart || c), 'mc[' + i + ']'));
        else if (list && typeof list === 'object') Object.keys(list).forEach((k) => push(list[k] && (list[k].chart || list[k]), 'mc.' + k));
      } catch (_) {}
      return charts;
    };

    const sizeOfSeries = (arr) => (Array.isArray(arr) ? arr.length : (arr ? -1 : null));

    const out = { realms: [], calib: null };

    const visit = (w, label) => {
      const rec = { realm: label, caps: {}, charts: [] };
      let rs = null;
      try { rs = w.replaySystem || (w.chart && w.chart.replaySystem) || null; } catch (_) {}
      if (!rs) { try { const cs = collectCharts(w); rs = cs.length ? cs[0].chart.replaySystem : null; } catch (_) {} }
      rec.replaySystemPresent = !!rs;
      if (rs) {
        for (const m of ['_qw3ResampleCacheKeepEnabled', '_m20Q9DropConsumerResampleCache', '_m20Q9PrefixSliceFixEnabled',
          '_releaseTickPathScratchBuffers', '_getRetainedTickPathBuffer', 'generatePath', 'getAggregatedTickPath']) {
          rec.caps[m] = typeof rs[m];
        }
        for (const f of ['_retainedTickPathBuffers', '_tickPathScratch', '_aggregateTickPathScratch',
          '_independentPairPathScratch', '_pathWaypointScratch']) {
          let v = null; try { v = rs[f]; } catch (_) {}
          rec.caps[f] = v === undefined ? 'undefined'
            : v === null ? 'null'
              : Array.isArray(v) ? 'array[' + v.length + ']'
                : (v instanceof Map ? 'Map(' + v.size + ')' : typeof v);
        }
      }

      for (const { chart, how } of collectCharts(w)) {
        const e = { how };
        try {
          e.tf = chart.currentTimeframe ?? null;
          const master = chart.rawData || chart.fullData || chart.data || null;
          e.masterLen = sizeOfSeries(master);
          const p = chart.dataPipeline || null;
          e.pipelinePresent = !!p;
          if (p) {
            e.hasInvalidate = typeof p.invalidateResampleCache;
            const rc = p._resampleCache || null;
            e.resampleCachePresent = !!rc;
            if (rc) {
              e.cacheTf = rc.tf ?? null;
              e.cacheSourceLen = rc.sourceLen ?? null;
              e.resultPopulated = !!rc.result;
              e.resultLen = sizeOfSeries(rc.result);
              // ALIASING: a result whose elements ARE the master's bars costs one pointer each,
              // not one bar each. Sampled at three positions so a coincidental head match cannot decide it.
              if (Array.isArray(rc.result) && Array.isArray(master) && rc.result.length && master.length) {
                const probes = [0, Math.floor(rc.result.length / 2), rc.result.length - 1];
                const masterSet = new Set(master);
                e.aliasedSamples = probes.map((i) => masterSet.has(rc.result[i]));
                e.aliasedToMaster = e.aliasedSamples.every(Boolean);
              } else { e.aliasedToMaster = null; }
            }
            e.displaySeriesLen = sizeOfSeries(p._displayCache && p._displayCache.series);
            e.panDisplayPresent = !!p._panDisplayCache;
            e.panDisplayLen = p._panDisplayCache ? sizeOfSeries(p._panDisplayCache.series || p._panDisplayCache) : null;
          }
        } catch (err) { e.error = String(err).slice(0, 120); }
        rec.charts.push(e);
      }
      out.realms.push(rec);
    };

    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) {
      try { visit(window.frames[i], 'frame' + i); } catch (_) { out.realms.push({ realm: 'frame' + i, crossOrigin: true }); }
    }

    // CALIBRATION: bytes per retained bar, measured against a real allocation rather than a struct guess.
    try {
      const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : null);
      let sample = null;
      for (const r of out.realms) { for (const c of (r.charts || [])) { if (c.masterLen > 0) { sample = true; break; } } if (sample) break; }
      const proto = { t: 1, o: 1.5, h: 2.5, l: 0.5, c: 2.0, v: 1000 };
      const N = 200000;
      const before = mem();
      const hold = new Array(N);
      for (let i = 0; i < N; i++) hold[i] = { t: proto.t + i, o: proto.o, h: proto.h, l: proto.l, c: proto.c, v: proto.v };
      const after = mem();
      out.calib = (before != null && after != null && after > before)
        ? { n: N, deltaBytes: after - before, bytesPerBar: +(((after - before) / N)).toFixed(2), method: 'usedJSHeapSize delta over 200k six-field bar objects', pointerBytes: 8 }
        : { error: 'performance.memory unavailable or delta non-positive', before, after };
      hold.length = 0;
    } catch (err) { out.calib = { error: String(err).slice(0, 120) }; }

    return out;
  });
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const vals = [];
    const visit = (w) => {
      try {
        const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
        if (rs && Number.isFinite(rs.currentIndex)) vals.push(rs.currentIndex);
      } catch (_) {}
    };
    visit(window);
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) {} }
    return { atMs: Date.now(), indices: vals, sum: vals.reduce((a, b) => a + b, 0) };
  });
}

export function gradeBinding(counters, caps) {
  const sum = (name) => counters.reduce((a, r) => a + ((r.counts && r.counts[name]) || 0), 0);
  const qw3Reads = sum(QW3_FLAG);
  const ctlReads = sum(CONTROL_FLAG);
  const methodPresent = caps.some((c) => c === 'function');

  if (ctlReads === 0) {
    return {
      state: 'PROVES_NOTHING',
      qw3Reads, ctlReads,
      why: `the CONTROL flag ${CONTROL_FLAG} was also never read (${ctlReads}). The served build calls _m20Q9PrefixSliceFixEnabled(), so a zero there means the counting getter never bound — the mechanism is dead and the QW-3 zero carries no information.`,
    };
  }
  if (qw3Reads > 0) {
    return { state: 'RESOLVER_CALLED', qw3Reads, ctlReads, why: `the flag was consulted ${qw3Reads} times against a live control of ${ctlReads}. An A/B on this build WOULD bind.` };
  }
  return {
    state: methodPresent ? 'RESOLVER_PRESENT_BUT_UNCALLED' : 'RESOLVER_ABSENT_FROM_SERVED_BUILD',
    qw3Reads, ctlReads,
    why: methodPresent
      ? `_qw3ResampleCacheKeepEnabled exists on the live object but the flag was never read (${qw3Reads}) while the control was read ${ctlReads} times.`
      : `the flag was never read (${qw3Reads}) while the control was read ${ctlReads} times, and _qw3ResampleCacheKeepEnabled is not a function on any live replaySystem. The keep path is not in the served build, so an A/B here measures nothing and would report a FALSE NULL.`,
  };
}

async function main() {
  const started = new Date().toISOString();
  let harness = null;
  const origin = await (async () => {
    if (!LOCAL_HARNESS) return ORIGIN;
    harness = await startHarnessServer(0);
    return harness.url;
  })();
  const seal = await computeSeal(origin).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(origin).catch((e) => ({ error: String(e).slice(0, 120) }));
  const eSel = loadConf05Indicators();

  const artifact = {
    signature: 'QW3-FLOOR-CENSUS-V1',
    startedAt: started,
    identity: { buildId: seal.badge ?? null, sealDigest: seal.digest ?? null, sourceCommit: info.sourceCommitSha ?? null, origin },
    condition: { speed: SPEED, panels: 4, indicatorsPerPanel: 2, trades: 0, warmMs: WARM_MS, legMs: LEG_MS, drain: `pause-and-wait ${FROTH_MS / 1000}s, no forced GC`, qw3ResampleCacheKeepDisabled: DISABLE_QW3, localHarness: LOCAL_HARNESS },
    flags: { qw3: QW3_FLAG, control: CONTROL_FLAG },
    steps: [],
  };

  let session = null;
  try {
    log(`booting CONF-01 at speed ${SPEED} against ${origin} (build ${seal.badge ?? '?'}) ${DISABLE_QW3 ? 'with QW3_RESAMPLE_CACHE_KEEP disabled' : ''}`);
    session = await bootConf01Session({
      indicators: eSel.pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      label: DISABLE_QW3 ? 'qw3-floor-census-off' : 'qw3-floor-census-on',
      disableFlags: DISABLE_QW3 ? [QW3_FLAG] : [],
      originOverride: origin,
      skipLogin: LOCAL_HARNESS,
    });
    const page = session.page;
    const browser = session.browser;
    const fp = () => readFootprint(browser);

    artifact.steps.push({ step: 'boot', at: new Date().toISOString() });

    const install = await installFlagCounters(page, QW3_FLAG, CONTROL_FLAG);
    artifact.flagCounterInstall = install;
    log(`flag counters: ${JSON.stringify(install)}`);

    log(`warming ${WARM_MS / 1000}s so the flags get a live play window`);
    const phWarmStart = await readPlayhead(page);
    await new Promise((r) => setTimeout(r, WARM_MS));
    const phWarmEnd = await readPlayhead(page);

    const counters = await readFlagCounters(page);
    artifact.flagCounters = counters;

    // ---- DRAIN 1 + census A
    log('drain 1');
    const probeA = await pauseProbe(page, { readFootprint: fp, frothWaitMs: FROTH_MS, skipReclaim: true, label: 'drainA', log });
    const censusA = await censusRealms(page);
    const phA = await readPlayhead(page);
    artifact.probeA = probeA;
    artifact.censusA = censusA;
    artifact.playheadA = phA;

    const capList = [];
    for (const r of censusA.realms) { if (r.caps && r.caps._qw3ResampleCacheKeepEnabled) capList.push(r.caps._qw3ResampleCacheKeepEnabled); }
    artifact.binding = gradeBinding(counters, capList);
    log(`BIND-01: ${artifact.binding.state} — qw3Reads=${artifact.binding.qw3Reads} controlReads=${artifact.binding.ctlReads}`);

    // ---- play leg
    log('resume after drain 1');
    artifact.resumeAfterDrainA = await keepConf01Playing(page, SPEED).catch((e) => ({ error: String(e).slice(0, 300) }));
    const phLegStart = await readPlayhead(page);
    artifact.playheadLegStart = phLegStart;
    log(`play leg ${LEG_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, LEG_MS));
    const phLegEnd = await readPlayhead(page);
    artifact.playheadLegEnd = phLegEnd;

    // ---- DRAIN 2 + census B
    log('drain 2');
    const probeB = await pauseProbe(page, { readFootprint: fp, frothWaitMs: FROTH_MS, skipReclaim: true, label: 'drainB', log });
    const censusB = await censusRealms(page);
    const phB = await readPlayhead(page);
    artifact.probeB = probeB;
    artifact.censusB = censusB;
    artifact.playheadB = phB;
    artifact.warmup = { phWarmStart, phWarmEnd };

    artifact.finishedAt = new Date().toISOString();
    artifact.verdict = 'CAPTURED';
  } catch (err) {
    artifact.verdict = 'ERROR';
    artifact.error = String(err && err.stack ? err.stack : err).slice(0, 1500);
    log(`ERROR ${artifact.error.split('\n')[0]}`);
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch (_) {}
    try { if (harness) await harness.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

// Guarded so the grader can be exercised by a self-test without booting a browser. A grader that has
// never run until hour one of a live run is a grader that crashes at hour one; that has happened twice.
if (!process.argv.includes('--noRun')) main();
