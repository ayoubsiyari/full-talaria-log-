#!/usr/bin/env node
/**
 * COMPETITOR-REFERENCE-REPORT-V1
 *
 * Assembles the arena arms into the one comparison that answers the question the
 * reference exists for: is our per-chart footprint abnormal, or is that what
 * charting costs? The answer needs like against like, and the trap is arithmetic
 * rather than measurement — TradingView free is one chart per layout, so setting
 * it against our four-panel CONF-01 manufactures a 3-4x gap out of panel count
 * and says nothing about cost per chart.
 *
 * So this refuses to build a headline out of mismatched panel counts. It will not
 * divide a 4-up by four and call it a 1-up, it will not compare arms taken at
 * different dpr, viewport or settle, and it says which of those it refused on.
 *
 * Our 4-up arm is reported beside the headline as OUR OWN scaling curve, labelled
 * as ours, never as a competitor comparison.
 *
 *   node scripts/competitor-reference-report.mjs \
 *     --ours-1up=<artifact> --tv-1up=<artifact> [--ours-4up=<artifact>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampUtc } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The fields that have to agree before two numbers may be set side by side. */
export const COMPARABILITY_KEYS = ['dpr', 'width', 'height', 'settleMs'];

export function armOf(report, { expectPanels } = {}) {
  if (!report) return { state: 'ARM_ABSENT' };
  if (report.error) return { state: 'ARM_ERRORED', why: String(report.error).split('\n')[0] };
  const s = report.summary;
  if (!s) return { state: 'ARM_HAS_NO_SUMMARY', why: 'the run did not reach its summary, so it has no reading' };
  const census = s.canvasCount != null ? s.canvasCount : null;
  const arm = {
    state: 'ARM_READ',
    label: report.label ?? s.label ?? null,
    panels: s.panelsRequested ?? null,
    dpr: s.dpr ?? report.inputs?.dpr ?? null,
    width: report.inputs?.viewport?.width ?? null,
    height: report.inputs?.viewport?.height ?? null,
    settleMs: report.inputs?.settleMs ?? null,
    canvasCount: census,
    totalPrivateMB: s.totalPrivateMB ?? null,
    rendererPrivateMB: s.rendererPrivateMB ?? null,
    gpuPrivateMB: s.gpuPrivateMB ?? null,
    idleSlope: s.idleSlope ?? null,
  };
  if (expectPanels != null && arm.panels !== expectPanels) {
    return { ...arm, state: 'ARM_WRONG_PANEL_COUNT', why: `expected a ${expectPanels}-panel arm, this artifact is ${arm.panels}` };
  }
  return arm;
}

/**
 * Are two arms allowed to be set against each other? Panel count first, because
 * that is the mismatch that produces a confident wrong answer rather than an
 * obviously missing one.
 */
export function comparability(a, b) {
  const reasons = [];
  if (a.panels !== b.panels) {
    reasons.push(`PANEL_COUNT_MISMATCH: ${a.panels} vs ${b.panels} — this is the mismatch that manufactures a gap out of layout size`);
  }
  for (const k of COMPARABILITY_KEYS) {
    if (a[k] !== b[k]) reasons.push(`${k.toUpperCase()}_MISMATCH: ${a[k]} vs ${b[k]}`);
  }
  return { comparable: reasons.length === 0, reasons };
}

export function buildReport({ ours1up, tv1up, ours4up: fourUpArg }) {
  // Normalised once, because the headline path reads it and the 4-up arm is the
  // optional one: an absent curve must not crash the comparison it sits beside.
  const ours4up = fourUpArg || { state: 'ARM_ABSENT' };
  const out = {
    signature: 'COMPETITOR-REFERENCE-REPORT-V1',
    at: stampUtc(),
    coverage: {
      competitorArms: 'TradingView free, one chart per layout, one-up only',
      competitorPanelCountsMeasured: [1],
      notMeasured: [
        'no multi-chart competitor data at any panel count',
        'paid tiers not purchased, so competitor multi-chart layouts were never reachable',
        'TradeZella and FX Replay dropped by the PO — absent, not a null result',
      ],
      readingRule: 'this is a ONE-CHART reference. It does not license any statement about competitor multi-chart cost.',
    },
    arms: { ours1up, tv1up, ours4up },
  };

  if (ours1up.state !== 'ARM_READ' || tv1up.state !== 'ARM_READ') {
    out.headline = {
      state: 'HEADLINE_PAIR_INCOMPLETE',
      why: `the like-for-like pair needs both one-up arms; ours=${ours1up.state}, tradingview=${tv1up.state}`,
      // Stated explicitly because the tempting substitute is exactly the error.
      refusedSubstitution: 'our 4-up total divided by four is not our 1-up cost: browser, GPU and network process overhead is fixed and does not scale with panel count',
    };
    return out;
  }

  const cmp = comparability(ours1up, tv1up);
  if (!cmp.comparable) {
    out.headline = { state: 'ARMS_NOT_COMPARABLE', why: cmp.reasons.join('; ') };
    return out;
  }

  const delta = (k) => +(ours1up[k] - tv1up[k]).toFixed(2);
  const ratio = (k) => (tv1up[k] ? +(ours1up[k] / tv1up[k]).toFixed(2) : null);
  out.headline = {
    state: 'HEADLINE_READ',
    basis: `one chart each, dpr ${ours1up.dpr}, ${ours1up.width}x${ours1up.height}, ${ours1up.settleMs}ms settle, same instrument`,
    ours: { totalPrivateMB: ours1up.totalPrivateMB, gpuPrivateMB: ours1up.gpuPrivateMB, rendererPrivateMB: ours1up.rendererPrivateMB, canvases: ours1up.canvasCount },
    tradingview: { totalPrivateMB: tv1up.totalPrivateMB, gpuPrivateMB: tv1up.gpuPrivateMB, rendererPrivateMB: tv1up.rendererPrivateMB, canvases: tv1up.canvasCount },
    deltaMB: { total: delta('totalPrivateMB'), gpu: delta('gpuPrivateMB'), renderer: delta('rendererPrivateMB') },
    ratio: { total: ratio('totalPrivateMB'), gpu: ratio('gpuPrivateMB'), renderer: ratio('rendererPrivateMB') },
  };

  if (ours4up.state === 'ARM_READ') {
    const perAdded = ours4up.panels > ours1up.panels
      ? +((ours4up.totalPrivateMB - ours1up.totalPrivateMB) / (ours4up.panels - ours1up.panels)).toFixed(2)
      : null;
    out.ourScalingCurve = {
      label: 'OURS_ONLY_NOT_A_COMPARISON',
      why: 'there is no competitor arm at this panel count, so this figure has nothing to be compared against',
      oneUp: { panels: ours1up.panels, totalPrivateMB: ours1up.totalPrivateMB, gpuPrivateMB: ours1up.gpuPrivateMB },
      fourUp: { panels: ours4up.panels, totalPrivateMB: ours4up.totalPrivateMB, gpuPrivateMB: ours4up.gpuPrivateMB },
      marginalMBPerAddedPanel: perAdded,
      marginalGpuMBPerAddedPanel: ours4up.panels > ours1up.panels
        ? +((ours4up.gpuPrivateMB - ours1up.gpuPrivateMB) / (ours4up.panels - ours1up.panels)).toFixed(2)
        : null,
      // The interesting number: how much of a 4-up is fixed cost rather than panels.
      fixedShareOfFourUpPct: ours4up.totalPrivateMB
        ? +((ours1up.totalPrivateMB / ours4up.totalPrivateMB) * 100).toFixed(1)
        : null,
    };
  }
  return out;
}

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const readJson = (p) => {
  if (!p) return null;
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    // Named rather than thrown: a missing arm is a coverage fact, not a crash.
    console.error(`[reference-report] SUBJECT_ABSENT: ${abs}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
};

function main() {
  const report = buildReport({
    ours1up: armOf(readJson(argOf('ours-1up', null)), { expectPanels: 1 }),
    tv1up: armOf(readJson(argOf('tv-1up', null)), { expectPanels: 1 }),
    ours4up: argOf('ours-4up', null) ? armOf(readJson(argOf('ours-4up', null)), { expectPanels: 4 }) : undefined,
  });
  const out = path.resolve(argOf('out', path.join(__dirname, '..', 'docs/plan3/evidence/competitor-reference-oneup.json')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[reference-report] ${report.headline.state} → ${out}`);
  process.exitCode = report.headline.state === 'HEADLINE_READ' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
