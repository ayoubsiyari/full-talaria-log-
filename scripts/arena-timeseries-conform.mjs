#!/usr/bin/env node
/**
 * ARENA-TIMESERIES-CONFORM — checklist item 1, the "conform rather than build twice" half.
 *
 * The arena-over-time series is already running and is confirmed as checklist item 1. Rather than
 * re-cut the instrument to emit soak rows (which would throw away a multi-hour run), this reshapes
 * its artifact into the SOAK ROW FORMAT after the fact: one flat row per sample, arena columns beside
 * the total, TOTAL-01 travelling with every row, COV-01 remainder as its own labelled column.
 *
 * It runs on a PARTIAL artifact too, so the format can be proven populated while the run is still up.
 *
 * Usage:
 *   node scripts/arena-timeseries-conform.mjs --in=_evidence/manager-C/arena-timeseries-run1.json \
 *     [--out=..._soakrows.jsonl] [--summary=..._growth.json]
 */
import fs from 'node:fs';
import path from 'node:path';

import { arenaColumns, rankRowGrowth, quoteArenaDelta, ARENA_KEYS } from './lib/arena-columns.mjs';

const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const IN = argOf('in', '_evidence/manager-C/arena-timeseries-run1.json');
const OUT = argOf('out', IN.replace(/\.json$/, '.soakrows.jsonl'));
const SUMMARY = argOf('summary', IN.replace(/\.json$/, '.growth.json'));

/**
 * One arena sample -> one soak row.
 *
 * Column names match `sealed-two-arm-soak.mjs`'s row (`hours`, `residentBars`, `footprintTotalMB`)
 * so both series can be read by one reader and concatenated without a translation step.
 */
/**
 * Per-panel dataset identity for one sample, normalised.
 *
 * The host records `fileId` as a number and the peers as strings, so a raw comparison reports a
 * switch on every sample. Normalise before differencing or the switch counter is pure noise.
 */
export function panelFileIds(sample) {
  const panels = sample?.playhead?.panels || [];
  return panels.map((p) => (p?.fileId == null ? null : `${String(p.fileId)}@${p.tf ?? '?'}`));
}

/**
 * PAIR-SWITCH COUNT, derived retroactively.
 *
 * D's control found a bare pair switch grows renderer-private ~12.7 MB, which makes switch count a
 * candidate denominator alongside wall time and bars. This series is `same-symbol` and exercises no
 * switches BY DESIGN — but "designed to be zero" and "measured zero" are different claims, and only
 * the measured one can serve as a control for D's accumulation test. Every sample already recorded
 * each panel's fileId, so the count is recoverable without touching the running instrument.
 */
export function countSwitches(prevSample, sample) {
  const before = prevSample ? panelFileIds(prevSample) : null;
  const now = panelFileIds(sample);
  if (!before || before.length !== now.length) return { switches: null, changedPanels: null };
  let switches = 0;
  const changed = [];
  for (let i = 0; i < now.length; i++) {
    if (before[i] == null || now[i] == null) continue;
    if (before[i] !== now[i]) { switches += 1; changed.push(`${before[i]}->${now[i]}`); }
  }
  return { switches, changedPanels: changed.length ? changed.join('|') : null };
}

export function conformSample(sample, t0Ms, prevSample = null, cumulativeSwitchesBefore = 0) {
  const roots = sample?.pageRenderer?.allocators || null;
  const total = sample?.totalPrivateMB ?? null;
  const host = sample?.playhead?.host || {};
  const atMs = Date.parse(sample?.at || '') || null;
  const sw = countSwitches(prevSample, sample);

  return {
    // Soak row identity columns.
    segment: 1,
    hours: (atMs && t0Ms) ? +((atMs - t0Ms) / 3_600_000).toFixed(4) : null,
    at: sample?.at ?? null,
    sampleLabel: sample?.label ?? null,
    // The drain state of the reading. A drained row and a live row are different populations and
    // must never be fitted together; the column exists so a reader cannot mix them by accident.
    drained: !!sample?.drained,
    readingKind: sample?.drained ? 'forced-collection' : 'live-playing',
    // Delivery / workload columns.
    residentBars: host.residentBars ?? null,
    replayIndex: host.replayIndex ?? null,
    panelsAdvancing: sample?.playhead?.advancingPanels ?? null,
    // PAIR-SWITCH DENOMINATOR (D's slope candidate). Measured, not assumed.
    pairSwitchesSinceLastSample: sw.switches,
    pairSwitchesCumulative: sw.switches == null ? cumulativeSwitchesBefore : cumulativeSwitchesBefore + sw.switches,
    pairSwitchChanges: sw.changedPanels,
    panelDatasets: panelFileIds(sample).join(',') || null,
    // Memory series, same gauge names as the soak.
    footprintTotalMB: sample?.footprintTotalMB ?? null,
    rendererPrivateMB: sample?.rendererPrivateMB ?? null,
    gpuPrivateMB: sample?.gpuPrivateMB ?? null,
    jsHeapMB: sample?.jsHeapMB ?? null,
    // ARENA-COLUMNS + TOTAL-01 + COV-01 remainder.
    ...arenaColumns(roots, {
      totalPrivateMB: total,
      totalBasis: 'all-chrome-process-private',
    }),
    arenaDumpPid: sample?.pageRenderer?.pid ?? null,
  };
}

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`no artifact at ${IN}`);
    process.exitCode = 2;
    return;
  }
  const art = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const samples = Array.isArray(art.samples) ? art.samples : [];
  if (!samples.length) {
    console.error('artifact has no samples yet');
    process.exitCode = 3;
    return;
  }
  const t0Ms = Date.parse(samples[0].at) || null;
  const rows = [];
  let prev = null;
  let cumulative = 0;
  for (const s of samples) {
    const row = conformSample(s, t0Ms, prev, cumulative);
    cumulative = row.pairSwitchesCumulative ?? cumulative;
    rows.push(row);
    prev = s;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const live = rows.filter((r) => !r.drained);
  const drained = rows.filter((r) => r.drained);
  const rank = (series) => (series.length >= 2
    ? rankRowGrowth(series[0], series[series.length - 1])
    : { insufficient: true, samples: series.length });

  const coverage = rows.map((r) => r.arenaCoveragePct).filter((v) => v != null);
  const summary = {
    signature: 'ARENA-TIMESERIES-CONFORMED-V1',
    checklistItem: 1,
    source: IN,
    partial: art.partial ?? null,
    complete: !art.partial,
    identity: art.identity ?? null,
    rows: rows.length,
    liveRows: live.length,
    drainedRows: drained.length,
    hoursCovered: rows.length ? rows[rows.length - 1].hours : null,
    scope: {
      datasetMode: art.condition?.datasetMode ?? null,
      answers: 'growth-from-replay',
      doesNotAnswer: 'growth-from-switching — that is the pair-switch accumulation test, not this run',
    },
    // Switch denominator, MEASURED. A same-symbol run should be zero; proving it zero is what makes
    // this series usable as the control arm for D's pair-switch accumulation test.
    pairSwitches: {
      totalObserved: rows.length ? rows[rows.length - 1].pairSwitchesCumulative : null,
      perSampleMax: rows.reduce((m, r) => Math.max(m, r.pairSwitchesSinceLastSample ?? 0), 0),
      samplesWithASwitch: rows.filter((r) => (r.pairSwitchesSinceLastSample ?? 0) > 0).length,
      datasetsSeen: [...new Set(rows.map((r) => r.panelDatasets).filter(Boolean))],
      verdict: rows.length && rows[rows.length - 1].pairSwitchesCumulative === 0
        ? 'ZERO_SWITCHES_MEASURED — usable as the zero-switch control arm for the accumulation test'
        : 'SWITCHES OBSERVED — this series is no longer a clean zero-switch control; read growth per switch as well as per hour',
      note: 'Derived from per-panel fileId@tf recorded on every sample, so it is recoverable without re-running.',
    },
    // TOTAL-01: every growth figure below is produced by quoteArenaDelta, which refuses without totals.
    growthLive: rank(live),
    growthDrained: rank(drained),
    covenant: {
      total01: 'every arena delta above carries its total row; deltas without one are REFUSED, not estimated.',
      cov01: `named-arena coverage of total private ranges ${coverage.length ? Math.min(...coverage) : '?'}–${coverage.length ? Math.max(...coverage) : '?'}%. `
        + 'The remainder is the arenaUnattributedMB column. Calibration to >=95% is item 7 and needs E\'s parsed detail dumps.',
    },
  };
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));

  const g = summary.growthLive;
  console.log(`rows        ${rows.length} (live ${live.length}, drained ${drained.length}) -> ${OUT}`);
  console.log(`switches    ${summary.pairSwitches.totalObserved} observed across the run — ${summary.pairSwitches.verdict.split(' —')[0]}`);
  console.log(`coverage    ${coverage.length ? `${Math.min(...coverage)}–${Math.max(...coverage)}%` : 'n/a'} of total private named (COV-01 target >=95%)`);
  if (g && !g.insufficient) {
    console.log(`total move  ${g.totalDeltaMB} MB (basis ${g.totalBasis})`);
    console.log('growers (TOTAL-01 checked):');
    for (const q of g.growers) console.log(`  ${q.quotableSentence}`);
    if (!g.growers.length) console.log('  none above 0.5 MB');
  }
  console.log(`summary     ${SUMMARY}`);
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
