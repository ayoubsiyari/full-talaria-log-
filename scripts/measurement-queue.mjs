#!/usr/bin/env node
/**
 * MEASUREMENT-QUEUE-01 — one Chrome-launching run at a time, claimed on the board.
 *
 * WHY THIS EXISTS, FROM THE NIGHT IT COST US. Between 21:43 and 22:37 on 2026-08-02 the machine
 * carried roughly twenty of A's runs, seven of E's, D's 66-minute accumulation test and my
 * three-hour arena series, all concurrently, on a policy that said one at a time. Nothing enforced
 * it. My series died at sample 6 of 19 and every total-private number in it is against a basis that
 * five other Chromes were moving.
 *
 * TWO COORDINATION DEFECTS THIS IS BUILT AGAINST, both observed the same night:
 *   1. A watcher polled a PID that was never the run, reported ARENA_RUN_FINISHED 3.7 s after
 *      launch, and wrote only to stdout. It was present and never bound to what it claimed to
 *      observe. So this tool never infers "clear" from a signal; it looks at live processes.
 *   2. A watcher shell exited -1 while its node child kept running for another 66 minutes and
 *      produced a complete artifact. Everyone believed that test had crashed. So a claim here is
 *      held by a PID and released by that PID actually being gone, not by a shell's exit code.
 *
 * PRESENCE IS NOT BINDING (BIND-01). A claim file that everyone must remember to write is a
 * convention, and conventions are what failed. `preflight` therefore reports three distinct states
 * and never collapses them:
 *   QUEUE_CLEAR             no active claim and no foreign measurement process observed
 *   QUEUE_HELD              an active claim by another owner, its PID alive
 *   UNCLAIMED_RUN_DETECTED  no claim, but a measurement process IS running — someone skipped the
 *                           queue, and this must not read as clear
 *
 *   node scripts/measurement-queue.mjs status
 *   node scripts/measurement-queue.mjs claim --owner=D --run=pair-switch-accumulation --eta=15m
 *   node scripts/measurement-queue.mjs preflight --owner=D    # exit 2 unless D may run now
 *   node scripts/measurement-queue.mjs release --owner=D
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');
export const STATE_FILE = path.join(REPO_ROOT, '_evidence', 'queue', 'measurement-queue.json');
export const LOG_FILE = path.join(REPO_ROOT, 'docs', 'plan3', 'board', 'MEASUREMENT-QUEUE.md');

/** This tool, and anything that only reads artifacts, must not count as a running measurement. */
const NOT_A_MEASUREMENT = /measurement-queue\.mjs|-conform\.mjs|\.selftest\.mjs|--test\b/;
/**
 * A measurement is a repo script that drives a browser. Harness servers and long-lived watchers are
 * infrastructure: `build-identity-watch.mjs` has been up since 09:41 and blocking on it would mean
 * the queue is never clear. A gate that is always red is a gate everyone learns to bypass.
 */
const IS_MEASUREMENT = /\bscripts[\\/][\w.-]+\.mjs/;
const IS_INFRASTRUCTURE = /serve\.mjs|api[_-]server|harness[\\/]serve|[\w-]*watch[\w-]*\.mjs|[\w-]*-monitor\.mjs/;
/**
 * HEAVY work that launches no browser but ruins a reading anyway. Found by living it: the b125
 * vite build came up for decision while E's V8 attribution was mid-run, and "a build is not a
 * Chrome-launching run" is true and beside the point — a build saturates CPU and memory on the
 * same box, and memory pressure changes exactly the GC behaviour a V8 measurement is reading.
 * A queue scoped to browsers would have waved it through.
 */
const IS_HEAVY = /\bvite\b|\besbuild\b|\btsc\b|\bwebpack\b|npm(\.cmd)?\s+run\s+build|\brollup\b/;

export function classifyProcess(cmdLine) {
  const c = String(cmdLine || '');
  if (!c) return 'unknown';
  if (NOT_A_MEASUREMENT.test(c)) return 'tooling';
  if (IS_HEAVY.test(c)) return 'heavy';
  if (IS_INFRASTRUCTURE.test(c)) return 'infrastructure';
  if (IS_MEASUREMENT.test(c)) return 'measurement';
  return 'other';
}

export function scriptNameOf(cmdLine) {
  const m = /\bscripts[\\/]([\w.-]+\.mjs)/.exec(String(cmdLine || ''));
  return m ? m[1] : null;
}

/** Live node processes, `[{pid, cmd}]`. Injectable so the self-test needs no real machine. */
export function readNodeProcesses() {
  try {
    if (process.platform === 'win32') {
      const raw = execFileSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ], { encoding: 'utf8', maxBuffer: 1 << 24 });
      const parsed = JSON.parse(raw || 'null');
      const list = parsed == null ? [] : (Array.isArray(parsed) ? parsed : [parsed]);
      return list.map((p) => ({ pid: Number(p.ProcessId), cmd: String(p.CommandLine || '') }));
    }
    const raw = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 1 << 24 });
    return raw.split('\n').filter(Boolean).map((line) => {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      return m ? { pid: Number(m[1]), cmd: m[2] } : null;
    }).filter((p) => p && /node/.test(p.cmd));
  } catch {
    // A queue that cannot see the machine must not answer "clear".
    return null;
  }
}

export function pidAlive(pid, procs) {
  if (!pid) return false;
  if (procs) return procs.some((p) => p.pid === Number(pid));
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

export function readState(file = STATE_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { claim: null, history: [] }; }
}

export function writeState(state, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The whole decision, as a pure function so it is testable without a machine or a filesystem.
 * `procs === null` means the process list could not be read; that is its own refusal, never "clear".
 */
export function evaluate({ state, procs, owner = null, self = process.pid }) {
  if (procs === null) {
    return { state: 'MACHINE_UNREADABLE', mayRun: false, foreign: [], reason: 'could not read the process list; refusing to call the machine clear' };
  }
  const foreign = procs
    .filter((p) => p.pid !== self && ['measurement', 'heavy'].includes(classifyProcess(p.cmd)))
    .map((p) => ({ pid: p.pid, script: scriptNameOf(p.cmd), kind: classifyProcess(p.cmd) }));

  const claim = state?.claim || null;
  const claimLive = claim ? pidAlive(claim.pid, procs) : false;

  if (claim && !claimLive) {
    return {
      state: 'STALE_CLAIM', mayRun: foreign.length === 0, foreign, staleClaim: claim,
      reason: `claim by ${claim.owner} is stale — its pid ${claim.pid} is gone; reclaim it`,
    };
  }
  if (claim && claimLive && claim.owner !== owner) {
    return { state: 'QUEUE_HELD', mayRun: false, foreign, claim, reason: `held by ${claim.owner} running ${claim.run} since ${claim.at}` };
  }
  if (claim && claimLive && claim.owner === owner) {
    return { state: 'HELD_BY_YOU', mayRun: true, foreign, claim, reason: `you already hold the queue for ${claim.run}` };
  }
  if (foreign.length > 0) {
    return {
      state: 'UNCLAIMED_RUN_DETECTED', mayRun: false, foreign,
      reason: `no claim on file, but ${foreign.length} measurement process(es) are running: ${foreign.map((f) => `${f.script}#${f.pid}`).join(', ')}`,
    };
  }
  return { state: 'QUEUE_CLEAR', mayRun: true, foreign: [], reason: 'no claim, no measurement processes observed' };
}

function appendLog(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, ['# Measurement queue', '',
        'One Chrome-launching run at a time. Claim before you launch, release when you stop.',
        'Owned by C. `node scripts/measurement-queue.mjs status` is the source of truth; this log is the history.',
        '', '## Log', ''].join('\n'));
    }
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch { /* the log is a courtesy; never fail a claim because it could not be written */ }
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function arg(name, dflt = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}

function report(verdict) {
  console.log(`[queue] ${verdict.state} — ${verdict.reason}`);
  if (verdict.foreign?.length) {
    for (const f of verdict.foreign) console.log(`[queue]   running: ${f.script || 'unknown script'} (pid ${f.pid})`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cmd = process.argv[2] || 'status';
  const owner = arg('owner');
  const procs = readNodeProcesses();
  const state = readState();
  const verdict = evaluate({ state, procs, owner });

  if (cmd === 'status') {
    report(verdict);
    if (state.claim) console.log(`[queue] claim on file: ${state.claim.owner} / ${state.claim.run} / pid ${state.claim.pid} / since ${state.claim.at}`);
    process.exit(0);
  }
  if (cmd === 'preflight') {
    if (!owner) { console.error('[queue] preflight needs --owner='); process.exit(1); }
    report(verdict);
    process.exit(verdict.mayRun ? 0 : 2);
  }
  if (cmd === 'claim') {
    const run = arg('run');
    if (!owner || !run) { console.error('[queue] claim needs --owner= and --run='); process.exit(1); }
    if (!verdict.mayRun) { report(verdict); console.error('[queue] REFUSED — do not launch.'); process.exit(2); }
    const claim = { owner, run, pid: Number(arg('pid', process.ppid)) || process.ppid, eta: arg('eta'), at: stamp() };
    if (verdict.state === 'STALE_CLAIM') {
      state.history = [...(state.history || []), { ...verdict.staleClaim, endedAs: 'RECLAIMED_STALE', endedAt: stamp() }];
      appendLog(`- ${stamp()} · RECLAIMED_STALE · ${verdict.staleClaim.owner}/${verdict.staleClaim.run} pid ${verdict.staleClaim.pid} was gone`);
    }
    state.claim = claim;
    writeState(state);
    appendLog(`- ${stamp()} · CLAIM · ${owner} · ${run}${claim.eta ? ` · eta ${claim.eta}` : ''} · pid ${claim.pid}`);
    console.log(`[queue] CLAIMED by ${owner} for ${run} (pid ${claim.pid}). Release when you stop.`);
    process.exit(0);
  }
  if (cmd === 'release') {
    const claim = state.claim;
    if (!claim) { console.log('[queue] nothing to release.'); process.exit(0); }
    if (owner && claim.owner !== owner) { console.error(`[queue] REFUSED — the claim is ${claim.owner}'s, not ${owner}'s.`); process.exit(2); }
    state.history = [...(state.history || []), { ...claim, endedAs: 'RELEASED', endedAt: stamp() }];
    state.claim = null;
    writeState(state);
    appendLog(`- ${stamp()} · RELEASE · ${claim.owner} · ${claim.run}`);
    console.log(`[queue] released ${claim.owner}/${claim.run}.`);
    process.exit(0);
  }
  console.error(`[queue] unknown command "${cmd}" — use status | claim | preflight | release`);
  process.exit(1);
}
