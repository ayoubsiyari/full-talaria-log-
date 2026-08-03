#!/usr/bin/env node
/**
 * Mutants for HOST-SCOPE-01. Each is a way the mechanism could go back to being
 * voluntary, or the audit could go back to counting prose. The cells must fail on
 * every one, because a guard nothing tests is exactly what today produced.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SELFTEST = path.join(__dirname, 'host-scope-adoption-audit.selftest.mjs');

const SUBJECTS = {
  audit: path.join(__dirname, 'host-scope-adoption-audit.mjs'),
  lock: path.join(__dirname, 'lib', 'run-lock.mjs'),
  browser: path.join(__dirname, 'lib', 'heap-cycle-browser.mjs'),
};
const originals = Object.fromEntries(Object.entries(SUBJECTS).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const MUTANTS = [
  {
    subject: 'browser',
    name: 'the launch binding is removed — host scope becomes voluntary again',
    find: '  scoped.launch = async (...args) => {',
    replace: '  scoped.launch = puppeteer.launch.bind(puppeteer); scoped.__unusedLaunch = async (...args) => {',
  },
  {
    subject: 'browser',
    name: 'withHostScope stops being idempotent, so a double wrap double-acquires',
    find: "if (!puppeteer || typeof puppeteer.launch !== 'function' || puppeteer.__talariaHostScoped) return puppeteer;",
    replace: "if (!puppeteer || typeof puppeteer.launch !== 'function') return puppeteer;",
  },
  {
    subject: 'browser',
    name: 'wrapping drops everything except launch, breaking every caller',
    find: '  const scoped = Object.create(puppeteer);',
    replace: '  const scoped = {};',
  },
  {
    subject: 'lock',
    name: 'the queue file path points outside the repo again — the guard goes inert while green',
    find: "export const QUEUE_STATE_FILE = path.join(REPO_ROOT, '_evidence', 'queue', 'measurement-queue.json');",
    replace: "export const QUEUE_STATE_FILE = path.resolve(LOCK_DIR, '..', '..', '_evidence', 'queue', 'measurement-queue.json');",
  },
  {
    subject: 'lock',
    name: 'the queue claim is never consulted, so only the lock file protects the box',
    find: '  if (claim && live.alive && owner && claim.owner !== owner) {',
    replace: '  if (false) {',
  },
  {
    subject: 'lock',
    name: "claim liveness goes back to one pid — tonight's reclaim becomes legal again",
    find: '  const token = norm(claim.run);',
    replace: "  const token = '';",
  },
  {
    subject: 'lock',
    name: 'the run token matches the whole command line again — a claim named "node" parks the box',
    find: '      const leaf = /([\\w.-]+)\\.mjs/i.exec(p.cmd);\n      if (!leaf) return false;',
    replace: '      const leaf = [p.cmd, p.cmd];',
  },
  {
    subject: 'lock',
    name: 'a two-character run token is trusted to identify a script',
    find: '  if (token.length >= 6) {',
    replace: '  if (token.length >= 1) {',
  },
  {
    subject: 'lock',
    name: 'a failed process scan is treated as an empty box',
    find: "    return { state: 'CLAIM_LIVENESS_UNKNOWN', alive: true, why: 'the process scan failed, and an unreadable box is not an empty one' };",
    replace: "    return { state: 'CLAIM_LIVENESS_UNKNOWN', alive: false, why: 'the process scan failed' };",
  },
  {
    subject: 'lock',
    name: 'a dead run keeps the box forever, so a crash parks the queue',
    find: "  return { state: 'CLAIM_STALE', alive: false, why: `pid ${claim.pid} is gone and no process of ${claim.run} is running` };",
    replace: "  return { state: 'CLAIM_STALE', alive: true, why: 'stale' };",
  },
  {
    subject: 'audit',
    name: 'comments are no longer stripped — the audit counts prose again (14 holes)',
    find: "    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ')",
    replace: '    .replace(/^$/g, \' \')',
  },
  {
    subject: 'audit',
    name: 'string literals are stripped again — every real bypass vanishes (0 holes)',
    find: '  return String(text)',
    replace: "  return String(text).replace(/'(?:\\\\.|[^'\\\\])*'/g, \"''\")",
  },
  {
    subject: 'audit',
    name: 'a require without a launch counts as a hole — JSDoc types become defects',
    find: '  const bypassesRequire = direct && launches && !wraps && rel !== CHOKEPOINT;',
    replace: '  const bypassesRequire = direct && !wraps && rel !== CHOKEPOINT;',
  },
  {
    subject: 'audit',
    name: 'a wrapped require is still called a bypass, so adoption can never read total',
    find: '  if (wraps && !usesLoader) states.push(\'SCOPED_VIA_WRAPPER\');',
    replace: '  if (false) states.push(\'SCOPED_VIA_WRAPPER\');',
  },
  {
    subject: 'audit',
    name: 'killing chrome counts as launching it',
    find: '(?![^\'"`]*(?:taskkill|pkill|killall|\\bkill\\b))',
    replace: '',
  },
  {
    subject: 'audit',
    name: 'the chokepoint is treated as a hole in itself',
    find: '&& rel !== CHOKEPOINT;',
    replace: ';',
  },
  {
    subject: 'audit',
    name: 'an exemption needs no reason and no declaration in the file',
    find: 'const EXEMPT = /^[\\s*#/>|-]*HOST-SCOPE-AUDIT-EXEMPT:\\s*(.+)$/m;',
    replace: 'const EXEMPT = /HOST-SCOPE-AUDIT-EXEMPT()/;',
  },
];

let killed = 0;
let survived = 0;
const lines = [];
try {
  for (const m of MUTANTS) {
    const file = SUBJECTS[m.subject];
    const original = originals[m.subject];
    if (!original.includes(m.find)) {
      lines.push(['ANCHOR_MISSING', m.name, `not in ${m.subject}: ${m.find.slice(0, 60)}`]);
      survived++;
      continue;
    }
    fs.writeFileSync(file, original.replace(m.find, m.replace));
    let failed = false;
    let out = '';
    try {
      out = execFileSync(process.execPath, [SELFTEST], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      failed = true;
      out = String((e.stdout || '') + (e.stderr || ''));
    }
    fs.writeFileSync(file, original);
    const caught = (out.match(/^✖ (.+?) \(/gm) || []).map((s) => s.replace(/^✖ /, '').replace(/ \($/, '')).slice(0, 2);
    if (failed) { killed++; lines.push(['KILLED', m.name, caught.join(' | ')]); }
    else { survived++; lines.push(['SURVIVED', m.name, 'no cell noticed']); }
  }
} finally {
  for (const [k, p] of Object.entries(SUBJECTS)) fs.writeFileSync(p, originals[k]);
}

for (const [state, name, why] of lines) {
  console.log(`  ${state}  ${name}${why ? `\n          ${why}` : ''}`);
}
console.log(`\n  ${killed}/${killed + survived} mutants killed`);
process.exitCode = survived ? 1 : 0;
