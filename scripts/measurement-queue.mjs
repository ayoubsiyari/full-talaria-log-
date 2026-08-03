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
import { stampUtc } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');
export const STATE_FILE = path.join(REPO_ROOT, '_evidence', 'queue', 'measurement-queue.json');
/** How long a just-made claim is protected while its pid catches up. See CLAIM-GRACE-01. */
export const CLAIM_GRACE_MS = 120_000;
export const LOG_FILE = path.join(REPO_ROOT, 'docs', 'plan3', 'board', 'MEASUREMENT-QUEUE.md');

/** This tool, and anything that only reads artifacts, must not count as a running measurement. */
const NOT_A_MEASUREMENT = /measurement-queue\.mjs|-conform\.mjs|\.selftest\.mjs|--test\b|tal-po-ui-smoke-(?:watch-b126|mutant-suite-live|canary)\.mjs|tal-po-ui-wait-single-ready-diagnostic\.mjs/;
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
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ], { encoding: 'utf8', maxBuffer: 1 << 24 });
      const parsed = JSON.parse(raw || 'null');
      const list = parsed == null ? [] : (Array.isArray(parsed) ? parsed : [parsed]);
      return list.map((p) => ({ pid: Number(p.ProcessId), ppid: Number(p.ParentProcessId) || null, cmd: String(p.CommandLine || '') }));
    }
    const raw = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 1 << 24 });
    return raw.split('\n').filter(Boolean).map((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return m ? { pid: Number(m[1]), ppid: Number(m[2]) || null, cmd: m[3] } : null;
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

/**
 * Do two queue entries name the same run?
 *
 * Reservations and claims are typed by different people at different hours and drift in case and
 * punctuation — D reserved `daily-boundary-canary` and claimed `A3-DAILY-BOUNDARY-CANARY`. Exact
 * equality would treat those as different runs and never consume the reservation; bare owner
 * matching treats *every* run by that owner as the same one, which is the defect this closes.
 */
export function sameRun(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * RUN-GROUP-01 — a run is a process TREE, not a process.
 *
 * A correctly designed measurement is often several processes. A's idle-transient re-take is an
 * orchestrator that `spawnSync`s `competitor-arena-reference.mjs` once per arm — dpr=1, then dpr=2,
 * then a repeat — so at any instant there are two node processes and exactly one measurement, and
 * the arms are strictly sequential because the spawn is synchronous. A paired ABBA arm has the same
 * shape by construction: two processes, one experiment. D's watcher plus the suite it fires is the
 * same again.
 *
 * Counting processes reported that as two unclaimed runs and raised an alarm at A four times today,
 * once by me. Worse than the false alarm is what it trains: a check that goes red on every correctly
 * built drift-control run is a check people learn to scroll past, and then it is not there on the
 * day two owners really are on the box. That is the always-red-gate failure this file already warns
 * about for infrastructure, arriving by a second door.
 *
 * The rule: a process whose ancestry reaches another tracked node process belongs to that
 * ancestor's run. The group's root is the topmost tracked ancestor. Ancestry is used rather than
 * script names because it is a fact about the machine — a name-based rule would need updating every
 * time someone writes a new orchestrator, and would be wrong until they did.
 *
 * @param {Array<{pid:number, ppid?:number|null, cmd:string}>} procs
 * @returns {Array<{rootPid:number, rootScript:string|null, kind:string, members:Array}>}
 */
export function groupRuns(procs, { self = process.pid } = {}) {
  const list = (procs || []).filter((p) => p && p.pid !== self);
  const byPid = new Map(list.map((p) => [p.pid, p]));

  const rootOf = (proc) => {
    let cur = proc;
    const seen = new Set([cur.pid]);
    // Climb while the parent is itself a tracked node process. A parent outside the set (a shell,
    // the editor, PID 1) ends the climb: that is where this run began.
    while (cur.ppid && byPid.has(cur.ppid) && !seen.has(cur.ppid)) {
      seen.add(cur.ppid);
      cur = byPid.get(cur.ppid);
    }
    return cur;
  };

  const groups = new Map();
  for (const p of list) {
    const root = rootOf(p);
    if (!groups.has(root.pid)) {
      groups.set(root.pid, {
        rootPid: root.pid,
        rootScript: scriptNameOf(root.cmd),
        rootKind: classifyProcess(root.cmd),
        members: [],
      });
    }
    groups.get(root.pid).members.push({ pid: p.pid, script: scriptNameOf(p.cmd), kind: classifyProcess(p.cmd) });
  }

  return [...groups.values()].map((g) => ({
    ...g,
    // The group's kind is the most serious thing in it. An orchestrator classed as `other` that
    // spawns a measurement is still a measurement run, and must not be waved through because its
    // root looked harmless.
    //
    // The one exception is a `tooling` root — a `.selftest.mjs` or a `--test` runner. A test
    // spawning the script it tests is what tests DO: D's `copy-absence-census.selftest.mjs` forks
    // `copy-absence-census.mjs`, and reading that as an unclaimed run put two false alarms on the
    // board within a minute of this grouping going in. That name is already trusted for the process
    // itself by NOT_A_MEASUREMENT, so trusting it for the tree moves no boundary.
    kind: g.rootKind === 'tooling' ? 'tooling'
      : g.members.some((m) => m.kind === 'measurement') ? 'measurement'
        : g.members.some((m) => m.kind === 'heavy') ? 'heavy'
          : g.members.some((m) => m.kind === 'infrastructure') ? 'infrastructure'
            : g.rootKind,
  }));
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
  const claim = state?.claim || null;

  /**
   * RUN-GROUP-01. Processes are grouped by ancestry first, so an orchestrator and the arms it
   * spawns count as ONE run. `foreign` keeps its old per-process shape for callers that read it,
   * but the DECISION below is taken on groups.
   */
  const allGroups = groupRuns(procs, { self });
  const claimPids = claim?.pid ? new Set([Number(claim.pid)]) : new Set();
  const foreignGroups = allGroups
    .filter((g) => ['measurement', 'heavy'].includes(g.kind))
    // A group containing the claim's own pid is the claimant's run, however many processes it has.
    .filter((g) => !g.members.some((m) => claimPids.has(m.pid)));
  const foreign = foreignGroups.flatMap((g) => g.members
    .filter((m) => ['measurement', 'heavy'].includes(m.kind))
    .map((m) => ({ pid: m.pid, script: m.script, kind: m.kind, rootPid: g.rootPid })));
  const claimLive = claim ? pidAlive(claim.pid, procs) : false;
  const reservations = Array.isArray(state?.reservations) ? state.reservations : [];
  const head = reservations[0] || null;

  /**
   * CLAIM-GRACE-01. E claimed at 14:22:36Z for a 100-minute run and lost the box 28 seconds later:
   * pid 18972 was already gone, the claim read STALE, and D reclaimed it correctly by the rules as
   * written. E had been waiting since ~12:00Z at that point.
   *
   * The cause is that a claim's liveness is keyed to a pid recorded BEFORE the run exists. The
   * default is `process.ppid` — the shell — so a claimant who claims from one shell and launches
   * from another, or whose launcher exits after handing off, is dead on arrival. Nothing about the
   * measurement failed; the bookkeeping did.
   *
   * A young claim is therefore treated as settling rather than stale. It costs the queue two
   * minutes in the genuine crash case and saves a hundred-minute slot in the handoff case, and the
   * asymmetry is not close. A claim with no parseable timestamp gets no grace.
   */
  const claimAgeMs = claim?.at ? (Date.now() - Date.parse(String(claim.at).replace(' ', 'T'))) : NaN;
  if (claim && !claimLive && Number.isFinite(claimAgeMs) && claimAgeMs >= 0 && claimAgeMs < CLAIM_GRACE_MS) {
    return {
      state: 'CLAIM_SETTLING', mayRun: claim.owner === owner, foreign, claim,
      reason: `claim by ${claim.owner} for ${claim.run} is ${Math.round(claimAgeMs / 1000)}s old and its pid ${claim.pid} is not visible yet — `
        + `within the ${Math.round(CLAIM_GRACE_MS / 1000)}s grace window, so it is settling, not stale. `
        + `If the run really died, ${claim.owner} should release it or wait out the window.`,
    };
  }
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
  if (foreignGroups.length > 0) {
    // Counted in RUNS. Saying "2 processes" where there is one experiment is what taught people to
    // scroll past this line, and the arms are named beneath the root rather than promoted beside it.
    const describe = (g) => {
      const arms = g.members.filter((m) => m.pid !== g.rootPid);
      const armText = arms.length ? ` (+${arms.length} arm${arms.length > 1 ? 's' : ''}: ${arms.map((a) => `${a.script}#${a.pid}`).join(', ')})` : '';
      return `${g.rootScript}#${g.rootPid}${armText}`;
    };
    return {
      state: 'UNCLAIMED_RUN_DETECTED',
      mayRun: false,
      foreign,
      foreignGroups,
      reason: `no claim on file, but ${foreignGroups.length} unclaimed run${foreignGroups.length > 1 ? 's' : ''} `
        + `(${foreign.length} process${foreign.length > 1 ? 'es' : ''}): ${foreignGroups.map(describe).join(' | ')}`,
    };
  }
  /**
   * An ANNOUNCED order loses to an AUTOMATED claimant. D's daily-boundary canary fires on a 30 s
   * poll with no human in the loop, so the instant a deploy lands it wins any race against a
   * manager who has to read the board and type. A free queue plus a posted order is still a
   * scramble; the order has to be part of the predicate.
   */
  if (head && head.owner !== owner) {
    return {
      state: 'NOT_YOUR_TURN', mayRun: false, foreign, head, reservations,
      reason: `queue is free but reserved: ${head.owner}/${head.run} is next. Order: ${reservations.map((r, i) => `${i + 1}. ${r.owner}/${r.run}`).join('  ')}`,
    };
  }
  return {
    state: 'QUEUE_CLEAR', mayRun: true, foreign: [], head,
    reason: head ? `clear and you are next (${head.owner}/${head.run})` : 'no claim, no measurement processes observed',
  };
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

/**
 * CLOCK-01. This was `toISOString().replace('T',' ').slice(0,19)` — UTC with the `Z` **sliced off**,
 * so it did not merely omit an offset, it removed the one the platform had already supplied. It is
 * the emitter behind 48 of the 54 bare numbers in `MEASUREMENT-QUEUE.md`, and that file is the one
 * every lane reads to decide who ran when. A UTC log sitting beside board prose written in `+01:00`
 * is exactly how a consistent sequence gets read in two clocks — `12:05:22` here against `13:05`
 * there is one instant that looks like an hour of drift.
 *
 * `stampUtc` keeps the log in UTC, which is right for a machine-ordered record, and restores the
 * marker that says so.
 */
const stamp = () => stampUtc();

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
  /**
   * ADOPT-01 — record a claim for a run that is ALREADY RUNNING.
   *
   * `claim` refuses while an unclaimed run is on the box, which is correct for a launch and a deadlock
   * for a record: once a run starts unclaimed, there is no way to make the queue match the machine
   * short of killing the run. That is not hypothetical — it is why unclaimed runs stay unclaimed, and
   * it made the Director's 19:35+01:00 instruction "claim it now" literally impossible to obey.
   *
   * An adopted claim is NOT a claim. A claim made before a launch means someone checked the box was
   * free; an adopted one means someone noticed afterwards. Recording them identically would let a run
   * that jumped the queue read, a week later, exactly like one that waited its turn — so `adopted` and
   * `adoptedAt` are carried on the record and the log line says ADOPT rather than CLAIM.
   *
   * It refuses to adopt a pid that is not alive: a retroactive claim on a dead process is fiction.
   */
  if (cmd === 'adopt') {
    const run = arg('run');
    const pid = Number(arg('pid'));
    if (!owner || !run || !pid) { console.error('[queue] adopt needs --owner=, --run= and --pid='); process.exit(1); }
    if (!procs || !procs.some((p) => p.pid === pid)) {
      console.error(`[queue] REFUSED — pid ${pid} is not a live node process. Adopting a dead run records a fiction;`);
      console.error('  if it has already finished, it belongs in the board narrative, not in the live queue.');
      process.exit(2);
    }
    if (state.claim && pidAlive(state.claim.pid, procs)) {
      console.error(`[queue] REFUSED — ${state.claim.owner}/${state.claim.run} already holds a live claim (pid ${state.claim.pid}).`);
      console.error('  Adopting over a live claim would silently transfer the box. Release it first, or say so on the board.');
      process.exit(2);
    }
    state.claim = { owner, run, pid, eta: arg('eta'), at: stamp(), adopted: true, adoptedAt: stamp() };
    writeState(state);
    appendLog(`- ${stamp()} · ADOPT · ${owner} · ${run} · pid ${pid} · run was already live and unclaimed`);
    console.log(`[queue] ADOPTED ${owner}/${run} (pid ${pid}) — recorded as a retroactive claim, not as a claim.`);
    console.log('[queue] The queue now matches the machine. It does NOT mean the box was checked before this run started.');
    process.exit(0);
  }
  if (cmd === 'reserve') {
    const run = arg('run');
    if (!owner || !run) { console.error('[queue] reserve needs --owner= and --run='); process.exit(1); }
    const entry = { owner, run, note: arg('note'), at: stamp() };
    // `--front` is for a PRECONDITION rather than a queue slot: the b125 deploy is not competing
    // with the runs behind it, it is the thing they are all waiting on.
    const front = process.argv.includes('--front');
    // `--position=N` is 1-based and exists because the ordering decision is often "after the thing
    // that gates it, ahead of everything else" — which is neither the front nor the back.
    const wanted = Number(arg('position', '0'));
    const rs = [...(state.reservations || [])];
    let position;
    if (front) {
      rs.unshift(entry);
      position = 1;
    } else if (Number.isFinite(wanted) && wanted >= 1) {
      const at = Math.min(Math.max(1, Math.floor(wanted)), rs.length + 1);
      rs.splice(at - 1, 0, entry);
      position = at;
    } else {
      rs.push(entry);
      position = rs.length;
    }
    state.reservations = rs;
    writeState(state);
    appendLog(`- ${stamp()} · RESERVE · ${owner} · ${run} · position ${position}${front ? ' (front)' : ''}`);
    console.log(`[queue] reserved position ${position} for ${owner}/${run}.`);
    console.log(`[queue] order: ${rs.map((r, i) => `${i + 1}. ${r.owner}/${r.run}`).join('  ')}`);
    process.exit(0);
  }
  if (cmd === 'cancel') {
    const run = arg('run');
    if (!owner || !run) { console.error('[queue] cancel needs --owner= and --run='); process.exit(1); }
    const rs = [...(state.reservations || [])];
    const idx = rs.findIndex((r) => r.owner === owner && sameRun(r.run, run));
    if (idx === -1) {
      console.error(`[queue] no reservation matching ${owner}/${run}.`);
      console.error(`[queue] order: ${rs.map((r, i) => `${i + 1}. ${r.owner}/${r.run}`).join('  ') || '(empty)'}`);
      process.exit(2);
    }
    const [dropped] = rs.splice(idx, 1);
    state.reservations = rs;
    writeState(state);
    const why = arg('why');
    appendLog(`- ${stamp()} · CANCEL · ${dropped.owner} · ${dropped.run} · was position ${idx + 1}${why ? ` · ${why}` : ''}`);
    console.log(`[queue] cancelled ${dropped.owner}/${dropped.run} (was position ${idx + 1}).`);
    console.log(`[queue] order: ${rs.map((r, i) => `${i + 1}. ${r.owner}/${r.run}`).join('  ') || '(empty)'}`);
    process.exit(0);
  }
  /**
   * PROMOTE-01. The queue could reserve, cancel and list, but never REORDER — so acting on a
   * priority ruling meant cancelling other lanes' reservations and retyping their notes, which is
   * how a scheduling note gets lost. Moving an entry is now its own operation and leaves every other
   * entry's text untouched.
   *
   * It records who ordered the move. A promotion with no stated authority is a queue-jump, and the
   * difference should be legible to the lane that just got moved down.
   */
  if (cmd === 'promote') {
    const rs = state.reservations || [];
    const run = arg('run');
    const idx = rs.findIndex((r) => r.owner === owner && (!run || r.run === run));
    if (idx === -1) {
      console.error(`[queue] REFUSED — no reservation for ${owner}${run ? `/${run}` : ''} to promote.`);
      process.exit(2);
    }
    const to = Math.max(1, Math.min(rs.length, Number(arg('to', '1')))) - 1;
    if (idx === to) { console.log(`[queue] ${owner}/${rs[idx].run} is already at position ${to + 1}.`); process.exit(0); }
    const authority = arg('by', null);
    if (!authority) {
      console.error('[queue] REFUSED — --by=<who ordered it> is required. A promotion without a '
        + 'named authority is indistinguishable from a queue-jump, and the lane being moved down '
        + 'is entitled to see which it was.');
      process.exit(2);
    }
    const [moved] = rs.splice(idx, 1);
    moved.promotedFrom = idx + 1;
    moved.promotedBy = authority;
    moved.promotedAt = stamp();
    rs.splice(to, 0, moved);
    state.reservations = rs;
    writeState(state);
    appendLog(`- ${stamp()} · PROMOTE · ${owner} · ${moved.run} · ${idx + 1} -> ${to + 1} · by ${authority}`);
    console.log(`[queue] promoted ${owner}/${moved.run} from ${idx + 1} to ${to + 1} on ${authority}'s order.`);
    rs.forEach((r, i) => console.log(`[queue] ${i + 1}. ${r.owner} · ${r.run}${r.note ? ` — ${r.note}` : ''}`));
    process.exit(0);
  }
  if (cmd === 'order') {
    const rs = state.reservations || [];
    if (!rs.length) console.log('[queue] no reservations; first to claim wins.');
    rs.forEach((r, i) => console.log(`[queue] ${i + 1}. ${r.owner} · ${r.run}${r.note ? ` — ${r.note}` : ''}`));
    process.exit(0);
  }
  if (cmd === 'release') {
    const claim = state.claim;
    if (!claim) { console.log('[queue] nothing to release.'); process.exit(0); }
    if (owner && claim.owner !== owner) { console.error(`[queue] REFUSED — the claim is ${claim.owner}'s, not ${owner}'s.`); process.exit(2); }
    state.history = [...(state.history || []), { ...claim, endedAs: 'RELEASED', endedAt: stamp() }];
    state.claim = null;
    /**
     * Releasing consumes your reservation, so the next owner becomes the head automatically — but
     * only if the run you just released is the run that was reserved.
     *
     * MATCHING ON OWNER ALONE WAS A REAL BLOCKER, NOT A THEORETICAL ONE. A stale
     * `D/daily-boundary-canary` entry sat at D's slot after that canary had already run and
     * released. Any later D run would have consumed it, so D's timer-driven watcher could have
     * spent D's turn on the wrong run and left the PO-ordered mutant suite behind an empty slot.
     * D read the queue correctly and refused to launch rather than gamble on it.
     */
    const rs = state.reservations || [];
    if (rs.length && rs[0].owner === claim.owner && sameRun(rs[0].run, claim.run)) {
      const done = rs.shift();
      state.reservations = rs;
      appendLog(`- ${stamp()} · TURN_DONE · ${done.owner} · ${done.run} · next: ${rs[0] ? `${rs[0].owner}/${rs[0].run}` : 'open'}`);
    } else if (rs.length && rs[0].owner === claim.owner) {
      // Visible, not silent: the turn is neither consumed nor quietly kept.
      appendLog(`- ${stamp()} · TURN_KEPT · ${claim.owner} ran "${claim.run}" but the reservation at the head is "${rs[0].run}" — not consumed. Cancel it if it is stale.`);
      console.log(`[queue] NOTE — you ran "${claim.run}" but your reservation is "${rs[0].run}". Reservation kept, not consumed.`);
      console.log('[queue]        If that reservation is stale: measurement-queue.mjs cancel --owner=%s --run=%s', claim.owner, rs[0].run);
    }
    writeState(state);
    appendLog(`- ${stamp()} · RELEASE · ${claim.owner} · ${claim.run}`);
    console.log(`[queue] released ${claim.owner}/${claim.run}.${state.reservations?.[0] ? ` Next: ${state.reservations[0].owner}/${state.reservations[0].run}.` : ''}`);
    process.exit(0);
  }
  console.error(`[queue] unknown command "${cmd}" — use status | claim | preflight | release | reserve | cancel | order`);
  process.exit(1);
}
