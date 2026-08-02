/**
 * Price the two rows from the QW3-FLOOR-CENSUS artifact, in MB/kbar on the drained floor.
 *
 * ROW 1 (QW-3 resample-cache-keep) is priced from MEASURED structure: the census read every consumer
 * pipeline's `_resampleCache.result` length, its aliasing against the master, and the display caches, at a
 * drained instant, with bytes-per-bar CALIBRATED in-page. The number produced is a CEILING on what keeping
 * can cost, because it assumes the drop build would have freed the whole cache — and the census shows it
 * does not: the cache is populated at the floor under the drop build too.
 *
 * ROW 2 (E's per-panel slot buffers) cannot be measured on b122 — every identifier is absent from the
 * served bytes and undefined on the live object. It is priced STRUCTURALLY from tree source instead, which
 * is legitimate here only because the structure is bounded by construction: a fixed set of slot keys, each
 * one array of `ticksPerCandle` numbers. A measurement would confirm a constant. This is labelled derived,
 * not measured, everywhere it appears.
 *
 * UNIT WARNING carried into the output: a BOUNDED structure has no MB/kbar. Dividing a constant by resident
 * bars produces a figure that shrinks as the run lengthens, so quoting it without the constant beside it
 * invites exactly the unit error this workstream has already withdrawn two headlines for.
 */

import fs from 'fs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const IN = arg('in', '_evidence/manager-C/qw3-floor-census-run1.json');
const FLOOR_SLOPE = Number(arg('floorSlope', '22.89')); // the measured two-drain retention, MB/kbar

const a = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MB = 1024 * 1024;

const bytesPerBar = (() => {
  const vals = ['censusA', 'censusB'].map((k) => a[k]?.calib?.bytesPerBar).filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
})();

function tally(census) {
  let masterBars = 0; let resultBars = 0; let displayBars = 0; let panels = 0;
  let anyAliased = false; let allPopulated = true;
  for (const r of census.realms || []) {
    for (const e of r.charts || []) {
      if (!Number.isFinite(e.masterLen) || e.masterLen <= 0) continue;
      panels++;
      masterBars += e.masterLen;
      if (Number.isFinite(e.resultLen) && e.resultLen > 0) resultBars += e.resultLen;
      if (Number.isFinite(e.displaySeriesLen) && e.displaySeriesLen > 0) displayBars += e.displaySeriesLen;
      if (e.aliasedToMaster === true) anyAliased = true;
      if (!e.resultPopulated) allPopulated = false;
    }
  }
  return { panels, masterBars, resultBars, displayBars, anyAliased, allPopulated };
}

const A = tally(a.censusA || { realms: [] });
const B = tally(a.censusB || { realms: [] });

// Delivery across the leg decides whether a SLOPE is available or only a LEVEL.
const phA = a.playheadA?.indices || [];
const phB = a.playheadB?.indices || [];
const barsDelivered = phA.length && phA.length === phB.length
  ? phB.reduce((s, v, i) => s + (v - phA[i]), 0) : null;
const exhausted = (a.censusB?.realms || []).flatMap((r) => r.charts || [])
  .filter((e) => Number.isFinite(e.masterLen) && Number.isFinite(a.playheadB?.indices?.[0]));

const cachedBars = B.resultBars + B.displayBars;
const cacheMB = bytesPerBar ? (cachedBars * bytesPerBar) / MB : null;
const cacheMBPerKbar = cacheMB != null && B.masterBars > 0 ? cacheMB / (B.masterBars / 1000) : null;

// ROW 2, derived from tree source. A packed double array costs 8 bytes an element plus a small header.
const TICKS = 72;               // this.ticksPerCandle = 72  (replay-system.js:660)
const ARR_HEADER = 32;
const arrBytes = (n) => n * 8 + ARR_HEADER;
const SLOT_KEYS = ['default', 'animatingCandle', 'savedTickState', 'restoreAnimatingCandle'];
const perPanelSlotBytes =
  SLOT_KEYS.length * arrBytes(TICKS)      // _retainedTickPathBuffers
  + arrBytes(TICKS)                       // _tickPathScratch
  + arrBytes(TICKS)                       // _independentPairPathScratch
  + arrBytes(12)                          // _pathWaypointScratch (open + events + close)
  + arrBytes(60 * TICKS);                 // _aggregateTickPathScratch, worst case 1h over 1m
const slotsMB = (perPanelSlotBytes * (B.panels || 4)) / MB;
const slotsMBPerKbar = B.masterBars > 0 ? slotsMB / (B.masterBars / 1000) : null;

// Adjacent, pre-existing, and bounded the same way — included so it is not mistaken for E's cost.
const TICK_PATH_FIFO_MAX = 512;          // _tickPathCacheMaxEntries() (replay-system.js:7898)
const tickPathCacheMB = (TICK_PATH_FIFO_MAX * arrBytes(TICKS) * (B.panels || 4)) / MB;

const pct = (x) => (x != null && FLOOR_SLOPE > 0 ? +((x / FLOOR_SLOPE) * 100).toFixed(3) : null);
const r = (x, n = 4) => (x == null ? null : +x.toFixed(n));

const out = {
  signature: 'QW3-FLOOR-PRICE-V1',
  source: IN,
  build: a.identity?.buildId ?? null,
  binding: a.binding ?? null,
  calibration: { bytesPerBar: r(bytesPerBar, 2), method: a.censusA?.calib?.method ?? null },
  floorReference: { measuredRetentionMBPerKbar: FLOOR_SLOPE, source: 'two-drain hoard measurement, drained floors' },

  delivery: {
    playheadA: phA, playheadB: phB, barsDeliveredAcrossLeg: barsDelivered,
    floorA_MB: a.probeA?.hoardFloorMB ?? null,
    floorB_MB: a.probeB?.hoardFloorMB ?? null,
    floorDelta_MB: (a.probeA?.hoardFloorMB != null && a.probeB?.hoardFloorMB != null)
      ? +(a.probeB.hoardFloorMB - a.probeA.hoardFloorMB).toFixed(1) : null,
    slopeAvailable: barsDelivered > 0,
    note: barsDelivered === 0
      ? 'ZERO bars delivered across the leg and every playhead sits at masterLen-1, so no MB/kbar SLOPE is available from this run. The rows below are LEVEL ratios read at a drained instant, which is sufficient here only because both structures are bounded or proportional by construction.'
      : null,
  },

  row1_qw3ResampleCacheKeep: {
    measured: true,
    populatedAtDrainedFloorUnderDropBuild: B.allPopulated,
    aliasedToMaster: B.anyAliased,
    resampleResultBars: B.resultBars,
    displayCacheBars: B.displayBars,
    residentMasterBars: B.masterBars,
    cacheMB: r(cacheMB, 3),
    ceilingMBPerKbar: r(cacheMBPerKbar, 4),
    percentOfMeasuredFloorSlope: pct(cacheMBPerKbar),
    reading: B.allPopulated
      ? 'The consumer resample cache is ALREADY RESIDENT at the drained floor under the build that drops it, on all panels. Keeping it therefore adds at most the cache itself, and in steady state adds nothing at all.'
      : 'The cache was empty at the drained floor, so keeping it would add its full size to the floor.',
  },

  row2_ePerPanelSlotBuffers: {
    measured: false,
    reason: 'every slot identifier is absent from the served replay-system.js and undefined on the live replaySystem in all four realms; this is derived from tree source.',
    ticksPerCandle: TICKS,
    slotKeys: SLOT_KEYS,
    perPanelBytes: perPanelSlotBytes,
    panels: B.panels || 4,
    totalMB: r(slotsMB, 4),
    mbPerKbarAtThisResidency: r(slotsMBPerKbar, 5),
    percentOfMeasuredFloorSlope: pct(slotsMBPerKbar),
    unitWarning: 'BOUNDED, so MB/kbar is not a property of this structure — the figure above shrinks as the run lengthens and must never be quoted without the constant beside it.',
  },

  adjacent_tickPathCache: {
    note: 'pre-existing, not E\'s, and bounded by the M19 FIFO at 512 entries. Included so it is not attributed to the slot work.',
    maxEntries: TICK_PATH_FIFO_MAX, totalMB: r(tickPathCacheMB, 3),
  },
};

console.log(JSON.stringify(out, null, 2));
const dest = IN.replace(/\.json$/, '-priced.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.error(`\npriced -> ${dest}`);
