/**
 * RUN-LOCK-01 — the precondition every Chrome-launching run holds before a
 * browser boots. Single implementation as of the 12:58+01:00 ruling; B's and E's local
 * locks retire into this one, and B's cells belong in the selftest beside it.
 *
 * THREE SCOPES, BECAUSE ONE KEY CANNOT DO THE JOB
 *
 * The ruling says to use the identity key rather than the artifact path. That is
 * right and it is not sufficient, and the accident it is meant to prevent is the
 * proof: between 12:04+01:00 and 12:27+01:00 C's `canonical-floor-retake` was sharing the
 * box with two `tal-po-ui-smoke-canary` launches. Those are DIFFERENT scripts
 * writing DIFFERENT files, so an identity lock and an artifact lock both grant
 * all three of them, and the floor reading is contaminated exactly as before.
 * What stops it is a lock nobody can hold twice regardless of who they are:
 *
 *   HOST      one Chrome-launching measurement on this machine, full stop.
 *             This is the scope that replaces "wait until the box is clear".
 *   IDENTITY  one live copy of a given instrument. Catches E at 11:03+01:00 and D at
 *             12:19+01:00, including auto-suffixing scripts where no filename collides.
 *   ARTIFACT  one writer per output path. Catches two different scripts pointed
 *             at one file, which identity alone lets through.
 *
 * All three are taken in that fixed order and released in reverse, so a refusal
 * at a later scope cannot leave an earlier one held.
 *
 * STATES — a refusal must never read as a crash, and must name what it hit:
 *   LOCK_ACQUIRED             all requested scopes held
 *   HOST_BUSY_REFUSED         another measurement owns the machine
 *   DUPLICATE_LAUNCH_REFUSED  a second live copy of this instrument
 *   ARTIFACT_WRITER_REFUSED   another process is writing this artifact
 *   LOCK_STALE_RECLAIMED      holder was dead; taken over, and said so
 *   LOCK_UNPARSEABLE_RECLAIMED  holder file was corrupt; taken over
 *   CONCURRENCY_OVERRIDDEN    forced by an operator; recorded in the artifact
 *
 * Refusal is exit 3, before the browser launches and before anything is written.
 * A wrong refusal costs a re-launch. A wrong start costs somebody's ninety
 * minutes, and has three times today.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const LOCK_DIR = path.join(REPO_ROOT, '.locks');

/** The one name every Chrome-launching run contends on. */
export const HOST_SCOPE_KEY = 'MEASUREMENT_HOST';

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else. Absence is ESRCH only.
    return err && err.code === 'EPERM';
  }
}

export function lockPathFor(name, scope = 'artifact') {
  const raw = scope === 'artifact' ? path.resolve(name) : String(name);
  const hash = crypto.createHash('sha1').update(`${scope}:${raw}`).digest('hex').slice(0, 10);
  const leaf = path.basename(raw).replace(/[^\w.-]+/g, '_').slice(0, 50) || scope;
  return path.join(LOCK_DIR, `${scope}.${leaf}.${hash}.lock`);
}

function readLock(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function heldFor(holder) {
  const t = holder && Date.parse(holder.startedAt || '');
  if (!Number.isFinite(t)) return null;
  const ms = Date.now() - t;
  return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`;
}

/**
 * One scope. Returns {ok, state, holder, lockFile, release}.
 */
function takeScope({ scope, name, script, artifact, allowConcurrent }) {
  const lockFile = lockPathFor(name, scope);
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const payload = () => JSON.stringify({
    scope,
    name: String(name),
    pid: process.pid,
    ppid: process.ppid,
    script,
    artifact: artifact ? path.resolve(artifact) : null,
    startedAt: new Date().toISOString(),
    argv: process.argv.slice(2),
  }, null, 2);

  let state = 'LOCK_ACQUIRED';
  for (;;) {
    try {
      // Exclusive create is the whole mechanism: atomic at the filesystem, so a
      // 53-millisecond race resolves the same way a 53-second one does.
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, payload());
      fs.closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const holder = readLock(lockFile);
      if (holder && holder.pid !== process.pid && isAlive(holder.pid)) {
        if (allowConcurrent) return { ok: true, state: 'CONCURRENCY_OVERRIDDEN', holder, lockFile, release() {} };
        return { ok: false, state: refusalFor(scope), holder, lockFile, release() {} };
      }
      // Dead or corrupt holder. Reclaim: a crashed run must not park the box or
      // an artifact permanently, which would make the cure worse than the fault.
      state = holder ? 'LOCK_STALE_RECLAIMED' : 'LOCK_UNPARSEABLE_RECLAIMED';
      try { fs.unlinkSync(lockFile); } catch { /* raced with another reclaimer */ }
    }
  }

  let released = false;
  return {
    ok: true,
    state,
    holder: null,
    lockFile,
    release() {
      if (released) return;
      released = true;
      const mine = readLock(lockFile);
      if (!mine || mine.pid === process.pid) {
        try { fs.unlinkSync(lockFile); } catch { /* already gone */ }
      }
    },
  };
}

/**
 * A refusal gate needs a stricter classifier than a warning does.
 *
 * C's queue classifier is deliberately broad, which is correct for "somebody
 * look at this" and wrong for "nobody may start". Run against this machine it
 * matched three orphaned `harness/serve.mjs` file servers and **three Cursor
 * helper processes** — the editor itself. Wired to a refusal that would block
 * every run on the box for as long as the IDE is open, which is a worse outage
 * than the contention it prevents.
 *
 * So: strict for refusing, broad for reporting, and the difference is shown
 * rather than resolved silently.
 */
const EDITOR_PROCESS = /[\\/](?:cursor|code|vscode)[\\/]resources[\\/]|[\\/]helpers[\\/]node\.exe/i;
const NOT_A_BROWSER_RUN = /(?:^|[\\/])(?:serve|measurement-queue|run-lock-status|mirror-parity-check|director-digest)\.mjs$|\.selftest\.mjs$/i;

/**
 * Which pids actually have a browser under them.
 *
 * Name-based classification cannot settle this and should not try: `.test.mjs`
 * covers both `ckpt-ship-tag-first` (no browser) and the browser runner gates
 * (very much a browser), so any guess from the filename is wrong in one
 * direction or the other. What contaminates a memory reading is a browser on the
 * box, so ask the box. Puppeteer spawns chrome.exe as a direct child of the node
 * process, which makes the parent pid sufficient.
 *
 * Returns null, not an empty set, when the query fails: "no browsers" and "could
 * not ask" must not be the same answer.
 */
export function browserOwningPids() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe' or Name='chromium.exe'\" "
      + '| Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],
    { encoding: 'utf8', timeout: 20000, windowsHide: true });
    const raw = (out || '').trim();
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    const arr = Array.isArray(list) ? list : [list];
    return new Set(arr.map((p) => Number(p.ParentProcessId)).filter(Number.isFinite));
  } catch {
    return null;
  }
}

export function classifyRunStrict(cmd) {
  const text = String(cmd || '');
  if (EDITOR_PROCESS.test(text)) return { measurement: false, why: 'editor or IDE helper process' };
  const hit = /(?:^|[\s"'])((?:[^\s"']*[\\/])?[\w.-]+\.mjs)(?=$|[\s"'])/.exec(text);
  if (!hit) return { measurement: false, why: 'no .mjs entry point on the command line' };
  const script = hit[1].replace(/\\/g, '/');
  const leaf = script.split('/').pop();
  if (NOT_A_BROWSER_RUN.test(script) || NOT_A_BROWSER_RUN.test(leaf)) {
    return { measurement: false, why: `${leaf} does not launch a browser`, script: leaf };
  }
  return { measurement: true, script: leaf };
}

/**
 * Runs that are on the box but hold no lock.
 *
 * Until every instrument adopts, a lock-only view of the machine is a FALSE
 * GREEN: at 13:0x the status CLI reported the box free while C's
 * `canonical-floor-retake` was mid-reading, because that script predates
 * adoption. Under the new precondition that false green is worse than the old
 * queue, since it grants permission rather than merely failing to warn.
 *
 * The detector is C's, imported rather than reimplemented, so "what counts as a
 * measurement process" has one definition. If it cannot be loaded or the scan
 * fails, that is reported as its own state and never as "clear".
 */
/**
 * The node processes on this box, read synchronously.
 *
 * Own query rather than C's, for one reason: C's is fine but reaching it needs a
 * dynamic import, which made the acquire path async, which made `await` load
 * bearing. B found a consumer that had adopted the lock and omitted the await, so
 * its unlocked-run scan raced the launch it was meant to refuse and it still
 * logged a clean lock. A guard whose correctness depends on one keyword being
 * remembered is the same class of defect as a queue depending on cooperation.
 * Synchronous here, and C's broader classifier stays as an advisory cross-check
 * in the status tool where async costs nothing.
 */
export function readNodeProcessesSync() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" "
      + '| Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'],
    { encoding: 'utf8', timeout: 20000, windowsHide: true });
    const raw = (out || '').trim();
    if (!raw) return [];
    const list = JSON.parse(raw);
    return (Array.isArray(list) ? list : [list])
      .map((p) => ({ pid: Number(p.ProcessId), cmd: String(p.CommandLine || '') }))
      .filter((p) => Number.isFinite(p.pid));
  } catch {
    return null;
  }
}

/**
 * Synchronous unlocked-run scan. Same states as the async form; no `await` to
 * forget. Refuses only on an observed browser, per classifyRunStrict.
 */
/**
 * What the scan has SEEN, not only what is true this instant.
 *
 * At 21:18–21:24+01:00 my reference series refused three arms because E's
 * `heap-cycle-browser.mjs` (pid 25764) held the box unlocked — and let two others
 * start, at 21:19:03 and 21:21:41, against the same live process. That instrument
 * opens and closes Chrome in a loop, so `browserOwningPids()` saw descendants at
 * some instants and none at others, and a run with no browser up right now is
 * demoted to advisory and does not block. The two arms that got through then ran
 * alongside E's next launch: exactly the contamination the host lock exists to
 * prevent, granted by the lock itself.
 *
 * A cycling instrument is between launches, not idle. So the observation is sticky:
 * a pid seen owning a browser once counts as a browser run for as long as it lives.
 * Dead pids are reaped, so the memory cannot accumulate into a permanent refusal.
 */
/**
 * One file per pid rather than one shared map. The map version failed a cell
 * within minutes: two runs scanning at once each read the file, added their own
 * observation and wrote it back, so whichever wrote second erased the other's.
 * A memory of who is on the box, which loses entries precisely when several
 * things are on the box, is worse than no memory at all.
 */
const OBSERVED_DIR = path.join(LOCK_DIR, 'observed-browser-pids');

export function rememberBrowserOwners(pids, procs) {
  const byPid = new Map((procs || []).map((p) => [p.pid, p]));
  try { fs.mkdirSync(OBSERVED_DIR, { recursive: true }); } catch { /* degrades to the instant view, never to a green */ }
  for (const pid of pids || []) {
    try {
      fs.writeFileSync(path.join(OBSERVED_DIR, `${pid}.json`), JSON.stringify({
        pid, at: new Date().toISOString(), cmd: (byPid.get(pid)?.cmd || '').slice(0, 160),
      }));
    } catch { /* one unwritable observation must not throw out of a scan */ }
  }
  const alive = new Set();
  let files = [];
  try { files = fs.readdirSync(OBSERVED_DIR).filter((f) => f.endsWith('.json')); } catch { return alive; }
  for (const f of files) {
    const pid = Number(f.replace(/\.json$/, ''));
    if (Number.isFinite(pid) && isAlive(pid)) alive.add(pid);
    else { try { fs.unlinkSync(path.join(OBSERVED_DIR, f)); } catch { /* raced another reaper */ } }
  }
  return alive;
}

export function foreignRunsSync({ ignorePids = [] } = {}) {
  const procs = readNodeProcessesSync();
  if (procs === null) {
    return { state: 'FOREIGN_SCAN_UNAVAILABLE', why: 'process scan failed', runs: [], advisory: [] };
  }
  const nowOwning = browserOwningPids();
  const everOwned = rememberBrowserOwners(nowOwning === null ? [] : [...nowOwning], procs);
  const withBrowser = nowOwning === null ? null : new Set([...nowOwning, ...everOwned]);
  const lockedPids = new Set(inspectLocks().filter((l) => l.alive).map((l) => l.pid));
  const skip = new Set([process.pid, process.ppid, ...ignorePids]);
  const runs = [];
  const advisory = [];
  for (const p of procs) {
    if (skip.has(p.pid) || lockedPids.has(p.pid)) continue;
    const strict = classifyRunStrict(p.cmd);
    if (!strict.measurement) continue;
    const hasBrowser = withBrowser === null ? null : withBrowser.has(p.pid);
    const seenBefore = everOwned.has(p.pid) && !(nowOwning && nowOwning.has(p.pid));
    const entry = {
      pid: p.pid,
      script: strict.script,
      hasBrowser: seenBefore ? 'previously' : hasBrowser,
      cmd: p.cmd.slice(0, 160),
    };
    if (hasBrowser !== false) {
      runs.push(seenBefore
        ? { ...entry, why: 'it owned a browser earlier and is still alive — a cycling instrument is between launches, not idle' }
        : entry);
    } else advisory.push({ ...entry, excludedBecause: 'no browser process is running under it, and none was ever observed' });
  }
  return { state: runs.length ? 'UNLOCKED_FOREIGN_RUN_DETECTED' : 'NO_FOREIGN_RUNS', runs, advisory };
}

export async function foreignRuns({ ignorePids = [] } = {}) {
  let mod;
  try {
    mod = await import('../measurement-queue.mjs');
  } catch (error) {
    return { state: 'FOREIGN_SCAN_UNAVAILABLE', why: `queue module did not load: ${String(error.message).slice(0, 120)}`, runs: [] };
  }
  if (typeof mod.readNodeProcesses !== 'function' || typeof mod.classifyProcess !== 'function') {
    return { state: 'FOREIGN_SCAN_UNAVAILABLE', why: 'queue module no longer exports readNodeProcesses/classifyProcess', runs: [] };
  }
  let procs;
  try {
    procs = mod.readNodeProcesses();
  } catch (error) {
    return { state: 'FOREIGN_SCAN_UNAVAILABLE', why: `process scan failed: ${String(error.message).slice(0, 120)}`, runs: [] };
  }
  const lockedPids = new Set(inspectLocks().filter((l) => l.alive).map((l) => l.pid));
  const skip = new Set([process.pid, process.ppid, ...ignorePids]);
  const candidates = procs.filter((p) => !skip.has(p.pid) && !lockedPids.has(p.pid));

  const withBrowser = browserOwningPids();
  const runs = [];
  const advisory = [];
  for (const p of candidates) {
    const strict = classifyRunStrict(p.cmd);
    const broad = !!mod.classifyProcess(p.cmd);
    const hasBrowser = withBrowser === null ? null : withBrowser.has(p.pid);
    const entry = {
      pid: p.pid,
      script: strict.script || (typeof mod.scriptNameOf === 'function' ? mod.scriptNameOf(p.cmd) : null),
      hasBrowser,
      cmd: p.cmd.slice(0, 160),
    };
    // Refuse on an observed browser. A named measurement with no browser under it
    // is reported and not blocked on: it may be a unit gate that shares a suffix
    // with the browser runners, and blocking those makes the gate the outage.
    // When the browser query itself failed, fall back to the name — an unknown
    // box is not a free one.
    if (strict.measurement && hasBrowser !== false) runs.push(entry);
    else if (strict.measurement) advisory.push({ ...entry, excludedBecause: 'no browser process is running under it' });
    // Matched the queue's broad test but not the refusal test. Kept visible so a
    // disagreement between the two instruments is data, not a silent drop.
    else if (broad) advisory.push({ ...entry, excludedBecause: strict.why });
  }
  return {
    state: runs.length ? 'UNLOCKED_FOREIGN_RUN_DETECTED' : 'NO_FOREIGN_RUNS',
    runs,
    advisory,
  };
}

function refusalFor(scope) {
  if (scope === 'host') return 'HOST_BUSY_REFUSED';
  if (scope === 'identity') return 'DUPLICATE_LAUNCH_REFUSED';
  return 'ARTIFACT_WRITER_REFUSED';
}

/**
 * @param {object} o
 * @param {string} [o.artifact]  output path; takes the ARTIFACT scope
 * @param {string} o.script      instrument identity; takes the IDENTITY scope
 * @param {boolean} [o.host]     take the HOST scope. Default true: anything that
 *                               boots a browser must, and it is the scope that
 *                               replaces waiting on the queue.
 * @param {boolean} [o.allowConcurrent]  operator override, recorded in artifacts
 * @param {number} [o.waitForHostMs]     poll rather than refuse immediately
 */
export function acquireRunLock({
  artifact = null,
  script = path.basename(process.argv[1] || 'unknown'),
  host = true,
  allowConcurrent = false,
  waitForHostMs = 0,
  vetoOnForeignRun = false,
}) {
  if (!artifact && !script) throw new Error('acquireRunLock: script identity or artifact path is required');
  const wanted = [];
  if (host) wanted.push({ scope: 'host', name: HOST_SCOPE_KEY });
  if (script) wanted.push({ scope: 'identity', name: script });
  if (artifact) wanted.push({ scope: 'artifact', name: artifact });

  const held = [];
  const releaseAll = () => { for (const h of held.reverse()) h.release(); held.length = 0; };
  const states = [];
  const deadline = Date.now() + Math.max(0, waitForHostMs);

  for (const w of wanted) {
    for (;;) {
      const got = takeScope({ ...w, script, artifact, allowConcurrent });
      if (got.ok) {
        held.push(got);
        if (got.state !== 'LOCK_ACQUIRED') states.push(`${w.scope}:${got.state}`);
        break;
      }
      // Waiting is only offered for the host scope. A second copy of the same
      // instrument, or a second writer of one artifact, is a mistake to report
      // rather than a queue to join.
      if (w.scope === 'host' && Date.now() < deadline) {
        sleepSync(2000);
        continue;
      }
      // Refusing at a later scope must not leave an earlier one held, or the
      // fix becomes the outage.
      releaseAll();
      return {
        // `ok` on both paths of the aggregate, because `takeScope` has always had
        // it and B wrote the obvious `if (!lock.ok)` against this function: every
        // successful acquisition read as a refusal, so a suite skipped its entire
        // end-to-end half while printing LOCK_ACQUIRED next to SKIP, and never
        // called release(). I then made the identical mistake in
        // box-availability.mjs hours after reading B's report. Two lanes, one
        // afternoon, one cause: an aggregate whose shape disagrees with the
        // function it wraps.
        ok: false,
        state: got.state,
        scope: w.scope,
        holder: got.holder,
        lockFile: got.lockFile,
        notes: states,
        release() {},
      };
    }
  }

  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
    process.once(sig, () => { releaseAll(); if (sig !== 'exit') process.exit(130); });
  }
  const lock = {
    ok: true,
    state: states.length ? states.join(', ') : 'LOCK_ACQUIRED',
    scopes: wanted.map((w) => w.scope),
    notes: states,
    holder: null,
    release: releaseAll,
  };

  /**
   * B's R6, moved into the module rather than copy-pasted into each caller:
   * `inspectLocks()` can read NONE while three lane processes are on the box, so
   * a lock records a claim without ever checking the room. With this on, the scan
   * may veto a lock we already hold — releasing immediately rather than sitting
   * on one while refusing to work.
   *
   * Off by default: it is a behaviour change to a mechanism every lane now
   * depends on, and turning it on silently is how a shared instrument stops being
   * trusted. `--veto-on-foreign-run` or `vetoOnForeignRun: true`.
   */
  if (vetoOnForeignRun) {
    const scan = foreignRunsSync();
    lock.foreignScan = scan.state;
    if (scan.state === 'UNLOCKED_FOREIGN_RUN_DETECTED') {
      releaseAll();
      return {
        ok: false,
        state: 'HOST_BUSY_UNLOCKED_RUN_REFUSED',
        scope: 'host',
        holder: { script: scan.runs[0].script, pid: scan.runs[0].pid },
        notes: [...states, `vetoed by foreign scan: ${scan.runs.map((r) => `${r.script}#${r.pid}`).join(', ')}`],
        foreignScan: scan.state,
        foreignRuns: scan.runs,
        release() {},
      };
    }
  }
  return lock;
}

function sleepSync(ms) {
  // Deliberately synchronous: this runs before any browser or server is booted,
  // so there is nothing to keep responsive, and an async wait would let module
  // top-level code proceed past the refusal.
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

/**
 * The form instruments should use: `acquireRunLockOrExit({...})`.
 *
 * Deliberately SYNCHRONOUS, including the unlocked-run scan. It was async for one
 * commit and that was long enough for a consumer to adopt it without `await`,
 * whereupon the scan raced the launch it was refusing and the run reported a
 * clean lock. `await` in front of it is harmless if you prefer it.
 */
export function acquireRunLockOrExit(opts) {
  const lock = acquireRunLock(opts);
  if (/_REFUSED$/.test(lock.state)) {
    const h = lock.holder || {};
    const who = `${h.script || 'another process'} (pid ${h.pid}${h.ppid ? `, shell ${h.ppid}` : ''})`;
    const age = heldFor(h);
    const because = {
      HOST_BUSY_REFUSED: 'a measurement already owns this machine — starting now contaminates both readings',
      DUPLICATE_LAUNCH_REFUSED: 'a second live copy of this instrument',
      ARTIFACT_WRITER_REFUSED: 'another process is already writing this artifact',
    }[lock.state];
    console.error(`[run-lock] ${lock.state} — ${because}.\n`
      + `           holder: ${who}${age ? `, held ${age}` : ''}${h.startedAt ? `, since ${h.startedAt}` : ''}\n`
      + `           ${h.artifact ? `its artifact: ${h.artifact}\n           ` : ''}`
      + `Nothing was written and no browser was launched.\n`
      + `           Wait for it, or --wait-for-host=<ms> to queue, `
      + `or --allow-concurrent to accept a contaminated reading deliberately.`);
    process.exit(3);
  }
  if (lock.notes && lock.notes.length) console.warn(`[run-lock] ${lock.notes.join(', ')}`);

  if (opts.host !== false && !opts.skipForeignScan) {
    const scan = foreignRunsSync();
    lock.foreignScan = scan.state;
    if (scan.state === 'UNLOCKED_FOREIGN_RUN_DETECTED') {
      const who = scan.runs.map((r) => `${r.script || 'unknown'} (pid ${r.pid})`).join(', ');
      if (!opts.allowConcurrent) {
        console.error(`[run-lock] UNLOCKED_FOREIGN_RUN_DETECTED — a measurement is on this box `
          + `without holding the lock, so the lock alone cannot see it: ${who}.\n`
          + `           Nothing was written and no browser was launched. That run predates RUN-LOCK-01 `
          + `or has not adopted it; the box is NOT free.\n`
          + `           Wait for it, or --allow-concurrent, or --skip-foreign-scan if you know it is not a browser run.`);
        process.exit(3);
      }
      console.warn(`[run-lock] CONCURRENCY_OVERRIDDEN over unlocked run(s): ${who}`);
    } else if (scan.state === 'FOREIGN_SCAN_UNAVAILABLE') {
      // Never reported as clear: an unavailable scan is an unknown box.
      console.warn(`[run-lock] FOREIGN_SCAN_UNAVAILABLE — ${scan.why}. `
        + `The lock is held, but nothing here can say whether an unadopted run is also on the box.`);
    }
  }
  return lock;
}

/** Parse the two flags every instrument should accept, so they agree. */
/**
 * A witness to stamp into the artifact, because acquiring the box is not holding it.
 *
 * The lock is checked once, at launch. Nothing stops a foreign run starting thirty
 * seconds later, and that is not hypothetical: two arms of my reference series ran
 * to completion beside E's heap-cycle-browser and their JSON looked exactly like the
 * clean ones. Reconstructing which readings were contaminated from a log at
 * 21:30+01:00 is not a protocol. Call this before and after the measurement and put
 * both in the report; then a contaminated reading identifies itself.
 *
 *   HOST_EXCLUSIVE            nothing foreign seen at either end
 *   HOST_SHARED_DURING_RUN    something foreign was seen — the reading is not citable
 *   HOST_EXCLUSIVITY_UNKNOWN  the scan could not run, which is not the same as clear
 */
export function hostExclusivityWitness(before = null) {
  const scan = foreignRunsSync();
  const now = { at: new Date().toISOString(), state: scan.state, runs: scan.runs.map((r) => ({ pid: r.pid, script: r.script })) };
  if (!before) return now;
  const sawForeign = [before, now].some((s) => s.state === 'UNLOCKED_FOREIGN_RUN_DETECTED');
  const unknown = [before, now].some((s) => s.state === 'FOREIGN_SCAN_UNAVAILABLE');
  return {
    before,
    after: now,
    state: sawForeign ? 'HOST_SHARED_DURING_RUN' : (unknown ? 'HOST_EXCLUSIVITY_UNKNOWN' : 'HOST_EXCLUSIVE'),
    citable: !sawForeign && !unknown,
    why: sawForeign
      ? `another measurement was on the box: ${[...before.runs, ...now.runs].map((r) => `${r.script}#${r.pid}`).join(', ')}`
      : (unknown ? 'the process scan failed at one end, so exclusivity was not established' : undefined),
  };
}

export function lockFlagsFromArgv(argv = process.argv) {
  const hit = argv.find((a) => a.startsWith('--wait-for-host='));
  return {
    allowConcurrent: argv.includes('--allow-concurrent'),
    waitForHostMs: hit ? Number(hit.split('=')[1]) || 0 : 0,
    host: !argv.includes('--no-host-lock'),
    skipForeignScan: argv.includes('--skip-foreign-scan'),
    vetoOnForeignRun: argv.includes('--veto-on-foreign-run'),
  };
}

/**
 * Atomic write. A run killed mid-write left a truncated report that parsed as
 * "no data" rather than "interrupted" — E lost an hour of diagnosis to that
 * read on top of the ninety minutes.
 */
export function writeArtifactAtomic(file, data) {
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
  return abs;
}

/**
 * Reclaim locks whose holder is dead. Refusals are only tolerable if a crash
 * cannot park the box, and the reclaim on acquire is not visible to someone
 * asking why they are blocked.
 */
export function reapStaleLocks() {
  const reaped = [];
  for (const l of inspectLocks()) {
    if (l.alive) continue;
    try { fs.unlinkSync(l.lockFile); reaped.push(l); } catch { /* raced */ }
  }
  return reaped;
}

/** Who holds the box right now, for status output and for C's queue. */
export function inspectLocks() {
  let files = [];
  try { files = fs.readdirSync(LOCK_DIR).filter((f) => f.endsWith('.lock')); } catch { return []; }
  return files.map((f) => {
    const full = path.join(LOCK_DIR, f);
    const holder = readLock(full);
    return {
      lockFile: full,
      scope: holder?.scope || 'unknown',
      name: holder?.name || null,
      pid: holder?.pid ?? null,
      script: holder?.script || null,
      startedAt: holder?.startedAt || null,
      heldFor: heldFor(holder),
      alive: holder ? isAlive(holder.pid) : false,
    };
  });
}
