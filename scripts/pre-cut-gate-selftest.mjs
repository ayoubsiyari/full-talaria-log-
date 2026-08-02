#!/usr/bin/env node
/**
 * Self-test for the pre-cut integrity gate, driven against REAL corrupted trees rather than assertions
 * about what the code would do.
 *
 * Every case builds a throwaway repo with both mirrors and a real commit, so the HEAD baseline the gate
 * relies on is a real baseline. The corruption is then applied to the working tree exactly as it arrived
 * in production - the file is chopped - and the gate is asked to block.
 *
 * The control runs FIRST and must PASS. A blocking gate that blocks everything is not a gate, and my own
 * grader self-test reported DO-NOT-FIRE on a healthy artifact for two runs before I noticed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { checkMirrors, parseCheck } from '../chart v 1.4/chart/scripts/lib/mirror-integrity.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/** A file big enough that a 25% chop is unmistakable, and shaped like the real thing. */
function bigScript(fnCount) {
  const parts = ['// synthetic product file', "'use strict';"];
  for (let i = 0; i < fnCount; i++) {
    parts.push(`function talariaThing${i}(a, b) {`, `  const x = a + b + ${i};`, '  if (x > 0) { return x; }', '  return 0;', '}');
  }
  return parts.join('\n') + '\n';
}

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'precut-'));
  for (const m of ['chart v 1.4/chart', 'homepage/public/chart']) {
    for (const d of ['', 'modules', 'multichart-prod', 'workers']) fs.mkdirSync(path.join(root, m, d), { recursive: true });
    fs.writeFileSync(path.join(root, m, 'chart.js'), bigScript(400));
    fs.writeFileSync(path.join(root, m, 'sw.js'), bigScript(20));
    fs.writeFileSync(path.join(root, m, 'modules', 'replay-system.js'), bigScript(200));
    // A real ES module, because a gate that flags every module as a syntax error gets switched off.
    fs.writeFileSync(path.join(root, m, 'modules', 'order-manager.js'), `export const OM = 1;\nimport * as x from './replay-system.js';\nexport function f() { return x; }\n`);
    fs.writeFileSync(path.join(root, m, 'multichart-prod', 'multichart-manager.js'), bigScript(60));
    fs.writeFileSync(path.join(root, m, 'workers', 'indicator-worker.js'), bigScript(30));
  }
  git(root, 'init', '-q');
  git(root, '-c', 'user.email=c@local', '-c', 'user.name=c', 'add', '-A');
  git(root, '-c', 'user.email=c@local', '-c', 'user.name=c', 'commit', '-q', '-m', 'baseline');
  return root;
}
const rm = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* temp */ } };
const CANON = (r, ...p) => path.join(r, 'chart v 1.4', 'chart', ...p);

// ---------------------------------------------------------------- 1. CONTROL: healthy tree passes.
{
  const r = makeTree();
  const res = checkMirrors({ repoRoot: r });
  check('CONTROL: an intact tree is NOT blocked', !res.blocked, res.blocked ? `blocked for: ${res.reasons[0]}` : `${res.summary.totalFilesChecked} files checked, baseline ${res.summary.baselineSource}`);
  check('CONTROL: the control actually inspected files (not a vacuous pass)', res.summary.totalFilesChecked >= 12, `${res.summary.totalFilesChecked} files`);
  check('CONTROL: a real ES module is not misreported as a syntax error', res.checks.filter((c) => /order-manager/.test(c.path)).every((c) => c.parses), 'parsed as module via the fallback');
  rm(r);
}

// ------------------------------------------- 2. The production failure: chopped mid-statement.
{
  const r = makeTree();
  const f = CANON(r, 'chart.js');
  const buf = fs.readFileSync(f);
  fs.writeFileSync(f, buf.subarray(0, Math.floor(buf.length * 0.25)));   // chopped at ~25%, as observed
  const res = checkMirrors({ repoRoot: r });
  const hit = res.reasons.find((x) => /chart\.js/.test(x));
  check('a chart.js chopped to 25% BLOCKS the cut', res.blocked && !!hit, hit ? hit.slice(0, 120) : 'NOT BLOCKED');
  rm(r);
}

// ------------------------- 3. The nastier one: truncated on a clean boundary, so it still parses.
{
  const r = makeTree();
  const f = CANON(r, 'chart.js');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const keep = lines.slice(0, Math.floor(lines.length * 0.25));
  while (keep.length && !/^}$/.test(keep[keep.length - 1])) keep.pop();   // cut at a function end
  fs.writeFileSync(f, keep.join('\n') + '\n');
  const parses = parseCheck(f);
  const res = checkMirrors({ repoRoot: r });
  const hit = res.reasons.find((x) => /chart\.js/.test(x));
  check('a truncation that still PARSES is caught by size against committed', parses.ok && res.blocked && /lines against/.test(hit || ''), parses.ok ? (hit || 'NOT BLOCKED').slice(0, 130) : 'file did not parse, so this case did not test the size net');
  rm(r);
}

// ------------------------------------------------------------------------ 4. Zero bytes.
{
  const r = makeTree();
  fs.writeFileSync(CANON(r, 'modules', 'replay-system.js'), '');
  const res = checkMirrors({ repoRoot: r });
  check('a zero-byte product file BLOCKS the cut', res.blocked && res.reasons.some((x) => /ZERO BYTES/.test(x)), (res.reasons.find((x) => /ZERO BYTES/.test(x)) || 'not blocked').slice(0, 110));
  rm(r);
}

// -------------------------------------- 5. The vacuous pass: nothing to check must never be green.
{
  const r = makeTree();
  fs.rmSync(CANON(r), { recursive: true, force: true });
  fs.mkdirSync(CANON(r), { recursive: true });
  const res = checkMirrors({ repoRoot: r });
  check('an EMPTY canonical mirror BLOCKS rather than passing with zero checks', res.blocked && res.reasons.some((x) => /zero loadable scripts|ZERO files/.test(x)), (res.reasons[0] || 'not blocked').slice(0, 120));
  rm(r);
}

// -------------------------------------------------------------- 6. Canonical mirror absent entirely.
{
  const r = makeTree();
  fs.rmSync(path.join(r, 'chart v 1.4'), { recursive: true, force: true });
  const res = checkMirrors({ repoRoot: r });
  check('a MISSING canonical mirror BLOCKS the cut', res.blocked && res.reasons.some((x) => /missing entirely/.test(x)), (res.reasons[0] || 'not blocked').slice(0, 120));
  rm(r);
}

// ------------------------------- 7. One-sided truncation of the HOMEPAGE mirror is caught too.
{
  const r = makeTree();
  const f = path.join(r, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
  const buf = fs.readFileSync(f);
  fs.writeFileSync(f, buf.subarray(0, Math.floor(buf.length * 0.2)));
  const res = checkMirrors({ repoRoot: r });
  check('a truncated HOMEPAGE mirror BLOCKS, not just the canonical one', res.blocked && res.reasons.some((x) => /homepage\/public\/chart\/modules\/replay-system/.test(x)), (res.reasons.find((x) => /homepage/.test(x)) || 'not blocked').slice(0, 120));
  rm(r);
}

// ---------- 8. Real edits must NOT block, or the gate gets disabled the first week it is on.
{
  const r = makeTree();
  const f = CANON(r, 'chart.js');
  fs.appendFileSync(f, bigScript(50));                       // a large addition
  const res = checkMirrors({ repoRoot: r });
  check('a large ADDITION does not block', !res.blocked, res.blocked ? res.reasons[0] : 'growth is not a truncation signature');
  rm(r);
}
{
  const r = makeTree();
  const f = CANON(r, 'chart.js');
  // A deletion of WHOLE functions, so the file still parses. Chopping at an arbitrary line and pasting a
  // brace on the end produces a syntax error, which would re-test the parse net and leave the size net
  // for ordinary edits unexercised - the case that decides whether this gate survives its first week.
  fs.writeFileSync(f, bigScript(360));   // 400 -> 360 functions, a clean 10% deletion
  const res = checkMirrors({ repoRoot: r });
  const c = res.checks.find((x) => /chart v 1\.4\/chart\/chart\.js$/.test(x.path));
  check('a 10% deletion does not block but is WARNED', !res.blocked && !!c?.warn, c?.warn || (res.blocked ? `blocked: ${res.reasons[0]}` : 'no warning recorded'));
  rm(r);
}

// --------------------------------------- 9. The CLI must actually exit non-zero, not merely report.
{
  const r = makeTree();
  const buf = fs.readFileSync(CANON(r, 'chart.js'));
  fs.writeFileSync(CANON(r, 'chart.js'), buf.subarray(0, Math.floor(buf.length * 0.25)));
  let code = 0;
  try {
    execFileSync(process.execPath, [path.join(process.cwd(), 'chart v 1.4', 'chart', 'scripts', 'pre-cut-integrity-gate.mjs'), `--repo=${r}`, `--evidence=${path.join(r, 'ev')}`, '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) { code = err.status; }
  check('the CLI EXITS 1 on a corrupt tree (blocks, does not merely report)', code === 1, `exit ${code}`);

  const r2 = makeTree();
  let code2 = 1;
  try {
    execFileSync(process.execPath, [path.join(process.cwd(), 'chart v 1.4', 'chart', 'scripts', 'pre-cut-integrity-gate.mjs'), `--repo=${r2}`, `--evidence=${path.join(r2, 'ev')}`, '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
    code2 = 0;
  } catch (err) { code2 = err.status; }
  check('the CLI EXITS 0 on an intact tree', code2 === 0, `exit ${code2}`);
  rm(r); rm(r2);
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(EV, 'PRE-CUT-GATE-SELFTEST.json'), JSON.stringify({
  signature: 'PRE-CUT-GATE-SELFTEST-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — throwaway file trees, no browser.',
  whatThisProves: 'The gate blocks a chopped file whether or not it still parses, blocks zero-byte and missing mirrors, refuses to pass when it has checked nothing, catches a one-sided homepage truncation, and does NOT block ordinary edits. Each case is a real corrupted tree with a real git baseline, and the CLI exit code is driven rather than asserted.',
  passed, total: results.length, results,
}, null, 1));
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
