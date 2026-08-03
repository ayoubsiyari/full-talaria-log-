#!/usr/bin/env node
/**
 * Mutation arm for the reference assembler. Each mutant is a way this instrument
 * could publish a confident wrong number, and the cells must fail on it. A
 * refusal that can be deleted without any cell noticing is not a refusal.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.join(__dirname, 'competitor-reference-report.mjs');
const SELFTEST = path.join(__dirname, 'competitor-reference-report.selftest.mjs');
const original = fs.readFileSync(SUBJECT, 'utf8');

const MUTANTS = [
  {
    name: 'the panel-count check is dropped, so one chart may be set against four',
    find: '  if (expectPanels != null && arm.panels !== expectPanels) {',
    replace: '  if (false && expectPanels != null && arm.panels !== expectPanels) {',
  },
  {
    name: "comparability ignores panel count — the PO's exact objection, reinstated",
    find: '  if (a.panels !== b.panels) {',
    replace: '  if (false) {',
  },
  {
    name: 'dpr and settle mismatches are waved through',
    find: '    if (a[k] !== b[k]) reasons.push(`${k.toUpperCase()}_MISMATCH: ${a[k]} vs ${b[k]}`);',
    replace: '    if (false) reasons.push(`${k.toUpperCase()}_MISMATCH: ${a[k]} vs ${b[k]}`);',
  },
  {
    name: 'a page that drew nothing is read as a cheap competitor',
    find: '  if (census === 0) {',
    replace: '  if (false) {',
  },
  {
    name: 'a single run is promoted to a band — normal becomes a point again',
    find: "  const state = read.length === 1\n    ? 'SINGLE_OBSERVATION_NOT_A_BAND'",
    replace: "  const state = false\n    ? 'SINGLE_OBSERVATION_NOT_A_BAND'",
  },
  {
    name: 'the underpowered grade is dropped, so n=2 reads like n=3',
    find: "    : (read.length < BAND_MIN_N ? 'BAND_UNDERPOWERED' : 'BAND_READ');",
    replace: "    : 'BAND_READ';",
  },
  {
    name: 'a rejected run is counted in the interval, so a blank page becomes our floor',
    find: "  const read = asList(arms).filter((a) => a && a.state === 'ARM_READ');",
    replace: '  const read = asList(arms).filter((a) => a);',
  },
  {
    name: 'overlapping bands are reported as a difference of medians',
    find: '  const overlap = x.min <= y.max && y.min <= x.max;',
    replace: '  const overlap = false;',
  },
  {
    name: 'the gap is quoted from the far edges, overstating what the runs support',
    find: '  const gap = weAreHigher ? +(x.min - y.max).toFixed(2) : +(y.min - x.max).toFixed(2);',
    replace: '  const gap = weAreHigher ? +(x.max - y.min).toFixed(2) : +(y.max - x.min).toFixed(2);',
  },
  {
    name: 'the marginal is a total difference, not per added panel',
    find: "    perPanelMB: [+((y.min - x.max) / dPanels).toFixed(2), +((y.max - x.min) / dPanels).toFixed(2)],",
    replace: '    perPanelMB: [+(y.min - x.max).toFixed(2), +(y.max - x.min).toFixed(2)],',
  },
  {
    name: 'a zero panel step divides anyway',
    find: '  if (!(dPanels > 0)) return { state: \'PANEL_STEP_NOT_POSITIVE\', key, from: small.panels, to: big.panels };',
    replace: '  if (false) return { state: \'PANEL_STEP_NOT_POSITIVE\', key, from: small.panels, to: big.panels };',
  },
  {
    name: 'an inverted curve publishes a negative marginal — the 20:55+01:00 artefact, as a product claim',
    find: '  if (inversions.length) {',
    replace: '  if (false) {',
  },
  {
    name: 'the inversion test triggers on any overlap, suppressing curves that are merely noisy',
    find: '    if (lo && hi && hi.max < lo.min) {',
    replace: '    if (lo && hi && hi.max < lo.max) {',
  },
  {
    name: 'a curve is drawn through one point',
    find: '  if (steps.length >= 2) {',
    replace: '  if (steps.length >= 1) {',
  },
  {
    name: 'our own curve loses its label and reads as a comparison',
    find: "      label: 'OURS_ONLY_NOT_A_COMPARISON',\n      why: 'no competitor arm exists at 2 or 4 panels",
    replace: "      label: 'comparison',\n      why: 'no competitor arm exists at 2 or 4 panels",
  },
  {
    name: 'the fixed share is a point rather than a band',
    find: '        ? [+((one.min / four.max) * 100).toFixed(1), +((one.max / four.min) * 100).toFixed(1)]',
    replace: '        ? +((one.median / four.median) * 100).toFixed(1)',
  },
  {
    name: 'an incomplete pair still publishes a headline',
    find: '  if (!usable(bands.ours1up) || !usable(bands.tv1up)) {',
    replace: '  if (false) {',
  },
  {
    name: 'the coverage limit is widened to claim competitor multi-chart data',
    find: '      competitorPanelCountsMeasured: [1],',
    replace: '      competitorPanelCountsMeasured: [1, 2, 4],',
  },
];

let killed = 0;
let survived = 0;
const lines = [];
try {
  for (const m of MUTANTS) {
    if (!original.includes(m.find)) {
      lines.push(['ANCHOR_MISSING', m.name, `the anchor is not in the subject: ${m.find.slice(0, 70)}`]);
      survived++;
      continue;
    }
    fs.writeFileSync(SUBJECT, original.replace(m.find, m.replace));
    let out = '';
    let failed = false;
    try {
      out = execFileSync(process.execPath, [SELFTEST], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      failed = true;
      out = String((e.stdout || '') + (e.stderr || ''));
    }
    const caught = (out.match(/^\s*FAIL\s+(.+)$/gm) || []).map((s) => s.trim()).slice(0, 2);
    if (failed) { killed++; lines.push(['KILLED', m.name, caught.join(' | ')]); }
    else { survived++; lines.push(['SURVIVED', m.name, 'no cell noticed']); }
  }
} finally {
  fs.writeFileSync(SUBJECT, original);
}

for (const [state, name, why] of lines) {
  console.log(`  ${state}  ${name}${why ? `\n          caught by: ${why}` : ''}`);
}
console.log(`\n  ${killed}/${killed + survived} mutants killed`);
process.exitCode = survived ? 1 : 0;
