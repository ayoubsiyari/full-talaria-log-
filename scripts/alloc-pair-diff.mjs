#!/usr/bin/env node
/**
 * ARENA DIFF — what grows per bar, by allocator, on a zero-trade session.
 *
 * SEAL STATUS: this pair was taken on an UNSEALED build. The working tree carries uncommitted changes to
 * chart.js, multichart-manager.js and serve.mjs (A's release cuts and E's pan work, behind kill-switches),
 * so no ABSOLUTE figure here may be quoted against a sealed build. What survives is COMPOSITION - the
 * share of growth each arena carries - because the patches in question are listener-release and pan
 * behaviour, not bar storage, and a share is far more robust to them than a level.
 *
 * Zero trades throughout, verified via orderManager.closedPositions, so this is bar-driven growth with
 * the trade term absent by construction rather than by assumption.
 */
import fs from 'node:fs';

const P = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const OUT = P + 'ARENA-DIFF-ZERO-TRADE-20260801.json';
const read = (f) => JSON.parse(fs.readFileSync(P + f, 'utf8'));

const a = read('ZERO-TRADE-ALLOC-A.json');
const b = read('ZERO-TRADE-ALLOC-B.json');
const prof = read('ZERO-TRADE-PROFILE-20260801.json');

/** The heaviest process by v8 is the page renderer; the pair is void if it is not the same process. */
function heaviest(dump) {
  const procs = dump?.allocatorDump?.processes || [];
  let best = null;
  for (const p of procs) {
    const v8 = p.allocatorsMB?.v8 || 0;
    if (!best || v8 > (best.allocatorsMB?.v8 || 0)) best = p;
  }
  return best;
}
const ha = heaviest(a);
const hb = heaviest(b);

const report = {
  signature: 'ARENA-DIFF-ZERO-TRADE-V1',
  artifactFile: 'ARENA-DIFF-ZERO-TRADE-20260801.json',
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — background memory-infra dumps, read-only.',
  sealStatus: {
    sealed: false,
    label: 'UNSEALED-BUILD COMPOSITION EVIDENCE — NO ABSOLUTE FIGURES',
    undeclaredChanges: ['chart.js', 'multichart-manager.js', 'harness/serve.mjs (chart-window-limit.js is a line-ending rewrite with zero content change)'],
    owner: "A and E, behind __TALARIA_DISABLE_* kill-switches. Not authored by C; C holds no product-file edits.",
    whyCompositionSurvives: 'The undeclared changes are listener-release, panel-destroy and pan/crosshair behaviour. They can move the LEVEL of retained memory. They do not plausibly relocate bar storage from one allocator to another, so the SHARE each arena carries of per-bar growth is the quotable quantity and the megabyte levels are not.',
  },
  tradesInThisPair: 0,
  pairIdentity: {
    pidA: ha?.pid ?? null,
    pidB: hb?.pid ?? null,
    samePid: ha?.pid != null && ha.pid === hb?.pid,
  },
};

if (!report.pairIdentity.samePid) {
  report.voided = `VOID: the heaviest renderer changed pid between dumps (${ha?.pid} -> ${hb?.pid}), so the diff spans two processes.`;
} else {
  const at = new Date(a.at).getTime();
  const bt = new Date(b.at).getTime();
  const t0 = new Date(prof.at).getTime();
  const minAt = (t) => (t - t0) / 60000;
  const barsAt = (min) => {
    const s = prof.samples || [];
    let best = null;
    for (const r of s) if (!best || Math.abs(r.minutes - min) < Math.abs(best.minutes - min)) best = r;
    return best ? best.residentTotal : null;
  };
  const barsA = barsAt(minAt(at));
  const barsB = b.window?.barsAfter ?? barsAt(minAt(bt));
  const dBars = barsB - barsA;

  const keys = [...new Set([...Object.keys(ha.allocatorsMB || {}), ...Object.keys(hb.allocatorsMB || {})])];
  const rows = keys.map((k) => {
    const from = ha.allocatorsMB?.[k] ?? 0;
    const to = hb.allocatorsMB?.[k] ?? 0;
    return { allocator: k, fromMB: from, toMB: to, growthMB: +(to - from).toFixed(1) };
  }).sort((x, y) => y.growthMB - x.growthMB);

  const totalGrowth = rows.reduce((s, r) => s + r.growthMB, 0);
  for (const r of rows) {
    r.shareOfGrowthPercent = totalGrowth > 0 ? +((r.growthMB / totalGrowth) * 100).toFixed(1) : null;
    r.kbPerBar = dBars > 0 ? +((r.growthMB * 1024) / dBars).toFixed(2) : null;
  }

  report.window = {
    fromISO: a.at,
    toISO: b.at,
    hoursApart: +((bt - at) / 3600000).toFixed(2),
    barsFrom: barsA,
    barsTo: barsB,
    barsDelivered: dBars,
  };
  report.rows = rows;
  report.totals = {
    growthMB: +totalGrowth.toFixed(1),
    kbPerBar: dBars > 0 ? +((totalGrowth * 1024) / dBars).toFixed(2) : null,
    mbPerThousandBars: dBars > 0 ? +((totalGrowth / dBars) * 1000).toFixed(2) : null,
  };

  const v8 = rows.find((r) => r.allocator === 'v8');
  const blink = rows.find((r) => r.allocator === 'blink_gc');
  const pa = rows.find((r) => r.allocator === 'partition_alloc');
  report.prediction = {
    writtenBefore: 'v8 carries essentially all growth; if partition_alloc climbs instead, bar data lives outside V8.',
    graded: v8 && v8.shareOfGrowthPercent >= 80
      ? `CONFIRMED: v8 carries ${v8.shareOfGrowthPercent}% of growth.`
      : `NOT CONFIRMED AS WRITTEN: v8 carries ${v8?.shareOfGrowthPercent}% of growth, so "essentially all" is wrong. blink_gc ${blink?.shareOfGrowthPercent}% and partition_alloc ${pa?.shareOfGrowthPercent}% together carry ${(+(blink?.shareOfGrowthPercent || 0) + +(pa?.shareOfGrowthPercent || 0)).toFixed(1)}%, which is not a rounding error and is the part of the arena question I had not answered.`,
  };
  report.headline = `Per bar, on a zero-trade session: ${report.totals.kbPerBar} KB/bar total, of which v8 ${v8?.kbPerBar} KB, blink_gc ${blink?.kbPerBar} KB, partition_alloc ${pa?.kbPerBar} KB. COMPOSITION ONLY - unsealed build.`;
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
