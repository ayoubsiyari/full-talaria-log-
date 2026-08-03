#!/usr/bin/env node
/**
 * Mutation arm for the reference assembler. Each mutant is a way this instrument
 * could produce a confident wrong comparison, and the cells must fail on it. A
 * refusal that can be deleted without any cell noticing is not a refusal.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.join(__dirname, 'competitor-reference-report.mjs');
const SELFTEST = path.join(__dirname, 'competitor-reference-report.selftest.mjs');
const original = fs.readFileSync(SUBJECT, 'utf8');

const MUTANTS = [
  {
    name: 'the panel-count check is dropped, so one chart may be set against four',
    find: "  if (expectPanels != null && arm.panels !== expectPanels) {",
    replace: "  if (false && expectPanels != null && arm.panels !== expectPanels) {",
  },
  {
    name: 'comparability ignores panel count — the PO\'s exact objection, reinstated',
    find: '  if (a.panels !== b.panels) {',
    replace: '  if (false) {',
  },
  {
    name: 'dpr and settle mismatches are waved through',
    find: '    if (a[k] !== b[k]) reasons.push(`${k.toUpperCase()}_MISMATCH: ${a[k]} vs ${b[k]}`);',
    replace: '    if (false) reasons.push(`${k.toUpperCase()}_MISMATCH: ${a[k]} vs ${b[k]}`);',
  },
  {
    name: 'an incomplete pair still publishes a headline',
    find: "  if (ours1up.state !== 'ARM_READ' || tv1up.state !== 'ARM_READ') {",
    replace: "  if (false) {",
  },
  {
    name: 'the coverage limit is dropped from the artifact',
    find: "      competitorPanelCountsMeasured: [1],",
    replace: "      competitorPanelCountsMeasured: [1, 4],",
  },
  {
    name: 'our own four-up loses its label and reads as a comparison',
    find: "      label: 'OURS_ONLY_NOT_A_COMPARISON',",
    replace: "      label: 'comparison',",
  },
  {
    name: 'a page that drew nothing is read as a cheap competitor',
    find: '  if (census === 0) {',
    replace: '  if (false) {',
  },
  {
    name: 'an errored arm is read as a reading',
    find: "  if (report.error) return { state: 'ARM_ERRORED', why: String(report.error).split('\\n')[0] };",
    replace: '  if (false) return null;',
  },
  {
    name: 'the marginal cost per added panel is a plain difference, not per panel',
    find: '      ? +((ours4up.totalPrivateMB - ours1up.totalPrivateMB) / (ours4up.panels - ours1up.panels)).toFixed(2)',
    replace: '      ? +(ours4up.totalPrivateMB - ours1up.totalPrivateMB).toFixed(2)',
  },
];

let killed = 0;
let survived = 0;
const lines = [];
try {
  for (const m of MUTANTS) {
    if (!original.includes(m.find)) {
      lines.push(['ANCHOR_MISSING', m.name, `the anchor is not in the subject: ${m.find.slice(0, 60)}`]);
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
