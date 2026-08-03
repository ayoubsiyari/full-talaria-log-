#!/usr/bin/env node
/**
 * COMPETITOR-REFERENCE-REPORT-V2
 *
 * Assembles the arena arms into the two things the four-up debate actually needs:
 *
 *   1. A like-for-like headline. TradingView free is one chart per layout, so
 *      setting it against our four-panel CONF-01 manufactures a 3-4x gap out of
 *      panel count and answers nothing about cost per chart. One-up against
 *      one-up, or refuse.
 *
 *   2. Our own 1 -> 2 -> 4 curve on the same probe and scenario. The marginal cost
 *      per added panel is the number no competitor can supply, because no free
 *      tier will render four charts. It is also the number that decides whether a
 *      four-up total is four charts or one chart plus fixed cost.
 *
 * NORMAL IS A BAND, NEVER A POINT. Our own idle series moved 411.59 -> 396.52 at
 * dpr 1 and 460.33 -> 489.58 at dpr 2 across one wait, in the same direction as
 * nothing. A single reading of a competitor is not that competitor's cost, and two
 * single readings differenced is not a gap. Every figure here is an interval with
 * an n on it, comparisons are made between intervals, and a gap is quoted from the
 * NEAREST edges so it is the smallest defensible difference rather than the
 * largest available one.
 *
 *   node scripts/competitor-reference-report.mjs \
 *     --ours-1up=a.json,b.json,c.json --tv-1up=d.json,e.json,f.json \
 *     --ours-2up=... --ours-4up=...
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampUtc } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The fields that have to agree before two numbers may be set side by side. */
export const COMPARABILITY_KEYS = ['dpr', 'width', 'height', 'settleMs'];
export const METRICS = ['totalPrivateMB', 'gpuPrivateMB', 'rendererPrivateMB'];
/** Below this an interval is reported but graded down; below 2 it is not a band. */
export const BAND_MIN_N = 3;

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
  /**
   * A page that never drew is the dangerous arm, not the missing one: a
   * TradingView tab blocked, timed out or showing a login wall still reports a
   * real process footprint, and that number would read as "the competitor is
   * cheap" when it means "the competitor never rendered". No canvases, no chart.
   */
  if (census === 0) {
    return { ...arm, state: 'ARM_DREW_NOTHING', why: 'the surface census found zero canvases, so no chart was rendered and the footprint is of an empty page' };
  }
  /**
   * A reading taken while another measurement was on the box. Two arms of the
   * 21:10+01:00 series did exactly this and looked identical to the clean ones —
   * the witness is only worth writing if something refuses on it, so this is that
   * something.
   */
  const witness = report.hostExclusivity;
  if (witness && witness.state === 'HOST_SHARED_DURING_RUN') {
    return { ...arm, state: 'ARM_HOST_SHARED', why: witness.why || 'another measurement was on the box during this reading' };
  }
  if (witness && witness.state === 'HOST_EXCLUSIVITY_UNKNOWN') {
    return { ...arm, state: 'ARM_HOST_EXCLUSIVITY_UNKNOWN', why: witness.why || 'exclusivity was not established, which is not the same as clear' };
  }
  return arm;
}

const asList = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(2);
};

/**
 * An interval over repeated runs of ONE arm. Carries its n and its spread,
 * because a band of three tight readings and a band of three wild ones are not
 * the same evidence and a reader cannot tell from the edges alone.
 */
export function bandOf(arms, { label = null } = {}) {
  const read = asList(arms).filter((a) => a && a.state === 'ARM_READ');
  const rejected = asList(arms).filter((a) => a && a.state !== 'ARM_READ')
    .map((a) => ({ state: a.state, why: a.why }));
  if (read.length === 0) {
    return { state: 'BAND_ABSENT', label, n: 0, rejected, why: 'no run of this arm produced a reading' };
  }
  const metrics = {};
  for (const k of METRICS) {
    const xs = read.map((a) => a[k]).filter((v) => Number.isFinite(v));
    metrics[k] = xs.length
      ? {
        min: Math.min(...xs), max: Math.max(...xs), median: median(xs), n: xs.length,
        spreadMB: +(Math.max(...xs) - Math.min(...xs)).toFixed(2),
        spreadPctOfMin: Math.min(...xs) ? +(((Math.max(...xs) - Math.min(...xs)) / Math.min(...xs)) * 100).toFixed(1) : null,
      }
      : null;
  }
  const state = read.length === 1
    ? 'SINGLE_OBSERVATION_NOT_A_BAND'
    : (read.length < BAND_MIN_N ? 'BAND_UNDERPOWERED' : 'BAND_READ');
  return {
    state,
    label: label ?? read[0].label,
    n: read.length,
    panels: read[0].panels,
    dpr: read[0].dpr,
    width: read[0].width,
    height: read[0].height,
    settleMs: read[0].settleMs,
    canvasCount: read[0].canvasCount,
    metrics,
    rejected,
    why: state === 'BAND_READ' ? undefined
      : (state === 'SINGLE_OBSERVATION_NOT_A_BAND'
        ? 'one run is a reading, not a range; it is reported so it is not lost, and it may not be quoted as a band'
        : `${read.length} runs is fewer than the ${BAND_MIN_N} this project requires before pricing anything`),
  };
}

/** Do two intervals overlap, and if not, what is the SMALLEST defensible gap? */
export function bandRelation(a, b, key) {
  const x = a.metrics?.[key];
  const y = b.metrics?.[key];
  if (!x || !y) return { state: 'METRIC_ABSENT', key };
  const overlap = x.min <= y.max && y.min <= x.max;
  if (overlap) {
    return { state: 'WITHIN_BAND', key, ours: [x.min, x.max], reference: [y.min, y.max], gapMB: 0 };
  }
  // Nearest edges, deliberately: quoting median-to-median or max-to-min would
  // report a difference larger than the observations can support.
  const weAreHigher = x.min > y.max;
  const gap = weAreHigher ? +(x.min - y.max).toFixed(2) : +(y.min - x.max).toFixed(2);
  return {
    state: weAreHigher ? 'ABOVE_BAND' : 'BELOW_BAND',
    key,
    ours: [x.min, x.max],
    reference: [y.min, y.max],
    gapMB: gap,
    basis: 'nearest edges, the smallest difference the two intervals support',
  };
}

/**
 * Marginal cost per added panel, as an interval. Computed from the extremes so
 * the answer is honest about what repeated runs actually bound: the smallest
 * marginal is the lowest bigger-arm reading minus the highest smaller-arm one.
 */
export function marginalBand(small, big, key) {
  const x = small.metrics?.[key];
  const y = big.metrics?.[key];
  if (!x || !y) return { state: 'METRIC_ABSENT', key };
  const dPanels = big.panels - small.panels;
  if (!(dPanels > 0)) return { state: 'PANEL_STEP_NOT_POSITIVE', key, from: small.panels, to: big.panels };
  return {
    state: 'MARGINAL_BAND',
    key,
    fromPanels: small.panels,
    toPanels: big.panels,
    perPanelMB: [+((y.min - x.max) / dPanels).toFixed(2), +((y.max - x.min) / dPanels).toFixed(2)],
    n: Math.min(x.n, y.n),
  };
}

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

export function buildReport({ ours1up, tv1up, ours2up, ours4up }) {
  const bands = {
    ours1up: bandOf(ours1up, { label: 'ours-1up' }),
    tv1up: bandOf(tv1up, { label: 'tradingview-1up' }),
    ours2up: bandOf(ours2up, { label: 'ours-2up' }),
    ours4up: bandOf(ours4up, { label: 'ours-4up' }),
  };
  const usable = (b) => b.state === 'BAND_READ' || b.state === 'BAND_UNDERPOWERED';

  const out = {
    signature: 'COMPETITOR-REFERENCE-REPORT-V2',
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
      normalIsABand: 'every figure is an interval with an n; no point value is published, and a gap is quoted from nearest edges',
    },
    bands,
  };

  if (!usable(bands.ours1up) || !usable(bands.tv1up)) {
    out.headline = {
      state: 'HEADLINE_PAIR_INCOMPLETE',
      why: `the like-for-like pair needs a band on both one-up arms; ours=${bands.ours1up.state} (n=${bands.ours1up.n}), tradingview=${bands.tv1up.state} (n=${bands.tv1up.n})`,
      refusedSubstitution: 'our 4-up total divided by four is not our 1-up cost: browser, GPU and network process overhead is fixed and does not scale with panel count',
    };
    return out;
  }

  const cmp = comparability(bands.ours1up, bands.tv1up);
  if (!cmp.comparable) {
    out.headline = { state: 'ARMS_NOT_COMPARABLE', why: cmp.reasons.join('; ') };
    return out;
  }

  const relations = {};
  for (const k of METRICS) relations[k] = bandRelation(bands.ours1up, bands.tv1up, k);
  out.headline = {
    state: 'HEADLINE_READ',
    basis: `one chart each, dpr ${bands.ours1up.dpr}, ${bands.ours1up.width}x${bands.ours1up.height}, `
      + `${bands.ours1up.settleMs}ms settle, same instrument — ours n=${bands.ours1up.n}, reference n=${bands.tv1up.n}`,
    normalBand: {
      source: 'TradingView free, one chart',
      n: bands.tv1up.n,
      totalPrivateMB: bands.tv1up.metrics.totalPrivateMB && [bands.tv1up.metrics.totalPrivateMB.min, bands.tv1up.metrics.totalPrivateMB.max],
      gpuPrivateMB: bands.tv1up.metrics.gpuPrivateMB && [bands.tv1up.metrics.gpuPrivateMB.min, bands.tv1up.metrics.gpuPrivateMB.max],
      note: 'NEVER_A_POINT',
    },
    oursBand: {
      n: bands.ours1up.n,
      totalPrivateMB: bands.ours1up.metrics.totalPrivateMB && [bands.ours1up.metrics.totalPrivateMB.min, bands.ours1up.metrics.totalPrivateMB.max],
      gpuPrivateMB: bands.ours1up.metrics.gpuPrivateMB && [bands.ours1up.metrics.gpuPrivateMB.min, bands.ours1up.metrics.gpuPrivateMB.max],
    },
    relations,
    verdict: relations.totalPrivateMB.state === 'WITHIN_BAND'
      ? 'PER_CHART_COST_INDISTINGUISHABLE_FROM_REFERENCE'
      : `PER_CHART_COST_${relations.totalPrivateMB.state} — ${relations.totalPrivateMB.gapMB} MB from the nearest edge`,
    underpowered: [bands.ours1up, bands.tv1up].some((b) => b.state === 'BAND_UNDERPOWERED')
      ? `at least one arm has n < ${BAND_MIN_N}; the interval is real but thin`
      : null,
  };

  /**
   * Our own curve. Labelled as ours in the key itself, because a field named
   * `comparison` gets read as one no matter what the prose beside it says.
   */
  const steps = [bands.ours1up, bands.ours2up, bands.ours4up].filter(usable);
  /**
   * A validity check the first real run earned. The 20:55+01:00 pass read our
   * 1-up at 564.3 MB total with 356.77 MB GPU and our 4-up at 448.87 MB with
   * 142.63 MB GPU — four charts cheaper than one, a marginal of -38.48 MB per
   * added panel and a fixed share of 125.7%. That is not a cheap four-up, it is
   * proof that at least one arm was not measuring a resident cost: 356 MB of GPU
   * for a single chart is a transient of the kind the settle protocol exists to
   * wait out. Publishing a negative marginal would have been publishing an
   * artefact of measurement as a property of the product.
   */
  const inversions = [];
  for (let i = 1; i < steps.length; i++) {
    const lo = steps[i - 1].metrics.totalPrivateMB;
    const hi = steps[i].metrics.totalPrivateMB;
    if (lo && hi && hi.max < lo.min) {
      inversions.push(`${steps[i].panels} panels (${hi.min}-${hi.max} MB) costs less than ${steps[i - 1].panels} `
        + `(${lo.min}-${lo.max} MB) across every observation`);
    }
  }
  if (inversions.length) {
    out.ourScalingCurve = {
      label: 'OURS_ONLY_NOT_A_COMPARISON',
      state: 'CURVE_NOT_MONOTONIC_IN_PANELS',
      why: `${inversions.join('; ')} — more panels cannot cost less, so at least one arm is measuring a transient `
        + 'rather than a resident cost. No marginal is published, because a negative marginal is a measurement '
        + 'artefact being reported as a property of the product.',
      curve: steps.map((s) => ({
        panels: s.panels,
        n: s.n,
        totalPrivateMB: s.metrics.totalPrivateMB && [s.metrics.totalPrivateMB.min, s.metrics.totalPrivateMB.max],
        gpuPrivateMB: s.metrics.gpuPrivateMB && [s.metrics.gpuPrivateMB.min, s.metrics.gpuPrivateMB.max],
      })),
      whatToDo: 'lengthen the settle, or repeat the inverted arms; the readings are kept above so the inversion is inspectable',
    };
    return out;
  }
  if (steps.length >= 2) {
    const marginals = [];
    for (let i = 1; i < steps.length; i++) {
      for (const k of ['totalPrivateMB', 'gpuPrivateMB']) marginals.push(marginalBand(steps[i - 1], steps[i], k));
    }
    const one = bands.ours1up.metrics.totalPrivateMB;
    const four = usable(bands.ours4up) ? bands.ours4up.metrics.totalPrivateMB : null;
    out.ourScalingCurve = {
      label: 'OURS_ONLY_NOT_A_COMPARISON',
      why: 'no competitor arm exists at 2 or 4 panels, so these figures have nothing to be compared against — they answer how OUR cost grows, which is what the four-up debate needs',
      panelsMeasured: steps.map((s) => s.panels),
      curve: steps.map((s) => ({
        panels: s.panels,
        n: s.n,
        totalPrivateMB: s.metrics.totalPrivateMB && [s.metrics.totalPrivateMB.min, s.metrics.totalPrivateMB.max],
        gpuPrivateMB: s.metrics.gpuPrivateMB && [s.metrics.gpuPrivateMB.min, s.metrics.gpuPrivateMB.max],
      })),
      marginals,
      fixedShareOfFourUpPct: one && four
        ? [+((one.min / four.max) * 100).toFixed(1), +((one.max / four.min) * 100).toFixed(1)]
        : null,
      fixedShareMeaning: 'the share of a four-up total that one chart already cost — the high end of this band is how much of a 4-up is not panels',
    };
  } else {
    out.ourScalingCurve = {
      label: 'OURS_ONLY_NOT_A_COMPARISON',
      state: 'CURVE_INCOMPLETE',
      why: `a curve needs at least two usable panel counts; have ${steps.map((s) => s.panels).join(', ') || 'none'}`,
    };
  }
  return out;
}

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const readJson = (p) => {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.error(`[reference-report] SUBJECT_ABSENT: ${abs}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
};

const groupOf = (name, expectPanels) => {
  const raw = argOf(name, null);
  if (!raw) return [];
  return raw.split(',').map((p) => p.trim()).filter(Boolean)
    .map((p) => armOf(readJson(p), { expectPanels }));
};

function main() {
  const report = buildReport({
    ours1up: groupOf('ours-1up', 1),
    tv1up: groupOf('tv-1up', 1),
    ours2up: groupOf('ours-2up', 2),
    ours4up: groupOf('ours-4up', 4),
  });
  const out = path.resolve(argOf('out', path.join(__dirname, '..', 'docs/plan3/evidence/competitor-reference-oneup.json')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[reference-report] ${report.headline.state} → ${out}`);
  process.exitCode = report.headline.state === 'HEADLINE_READ' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
