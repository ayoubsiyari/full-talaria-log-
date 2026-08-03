#!/usr/bin/env node
/**
 * ORPHAN-SERVER-01 — is a leftover local file server on this box right now?
 *
 * Why this exists rather than another sentence on a board. On 2026-08-03 A's board recorded at
 * 13:17+01:00 that three `harness/serve.mjs` copies (pids 2104, 24904, 26776) were parked on the
 * machine. I reaped all three at 14:40+01:00 and said so. The order to reap them was then reissued
 * three more times, because **a board line that reports machine state has no expiry**: it keeps
 * reading as a live condition long after the condition is gone, and every reader who scans the
 * boards regenerates the same instruction. Answering it in prose a fourth time cannot fix that; the
 * question has to stop being a claim and start being a command anyone can run.
 *
 * These servers matter because they are not inert. Each one holds a port and a resident set on the
 * box that every memory reading is taken on, and leftover copies from dead runs have been polluting
 * readings since 2026-08-02.
 *
 * States, and none of them is a bare boolean:
 *   NO_HARNESS_SERVERS  nothing matching is alive. The box is clean.
 *   ORPHANS_PRESENT     a server is alive whose parent process is gone — nothing owns it, so nothing
 *                       will clean it up. Exit 3.
 *   SERVERS_PRESENT     servers are alive and still parented by a live process. Someone is probably
 *                       using them; reaping these is a decision, not housekeeping. Exit 0 with names.
 *   SCAN_UNAVAILABLE    the process list could not be read. Exit 2 — never reported as clean, since
 *                       "I could not look" and "there is nothing there" are the same colour to a
 *                       reader and must not be the same state.
 *
 * Usage:
 *   node scripts/orphan-server-census.mjs            # report
 *   node scripts/orphan-server-census.mjs --reap     # kill the orphans it names
 *   node scripts/orphan-server-census.mjs --out=path # write the evidence artifact
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNodeProcesses } from './measurement-queue.mjs';
import { clockOf, stampUtc } from './lib/clock.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A local file server started to feed an instrument. Deliberately narrow: this names things it
 * intends to recommend killing, so a broad match here is a foot-gun rather than a safety net.
 */
export const IS_LOCAL_SERVER = /harness[\\/]serve\.mjs|\bserve\.mjs\b/;

/**
 * @param {Array<{pid:number, ppid?:number|null, cmd:string}>|null} procs
 */
export function censusOf(procs) {
  if (procs === null || procs === undefined) {
    return { state: 'SCAN_UNAVAILABLE', servers: [], orphans: [], exit: 2,
      reason: 'could not read the process list; refusing to report the box clean' };
  }
  const alive = new Set(procs.map((p) => p.pid));
  const servers = procs
    .filter((p) => IS_LOCAL_SERVER.test(String(p.cmd || '')))
    .map((p) => ({
      pid: p.pid,
      ppid: p.ppid ?? null,
      // Orphaned = the process that started it is gone. On Windows a dead parent's pid simply is not
      // in the table; `ppid: null` means we were told nothing, which is not evidence of an orphan.
      orphaned: p.ppid != null && !alive.has(p.ppid),
      cmd: String(p.cmd || ''),
    }));

  if (servers.length === 0) {
    return { state: 'NO_HARNESS_SERVERS', servers: [], orphans: [], exit: 0,
      reason: 'no local file server is alive on this box' };
  }
  const orphans = servers.filter((s) => s.orphaned);
  if (orphans.length > 0) {
    return { state: 'ORPHANS_PRESENT', servers, orphans, exit: 3,
      reason: `${orphans.length} server(s) alive with no live parent: ${orphans.map((o) => o.pid).join(', ')}` };
  }
  return { state: 'SERVERS_PRESENT', servers, orphans: [], exit: 0,
    reason: `${servers.length} server(s) alive and still parented; reaping them is a decision, not housekeeping` };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const verdict = censusOf(readNodeProcesses());
  const at = clockOf(new Date(), { seconds: true });
  console.log(`[orphan-server] ${verdict.state} — ${verdict.reason}  (${at})`);
  for (const s of verdict.servers) {
    console.log(`[orphan-server]   pid ${s.pid} parent ${s.ppid ?? 'unknown'}${s.orphaned ? ' ORPHANED' : ''}`);
  }

  if (process.argv.includes('--reap') && verdict.orphans.length) {
    for (const o of verdict.orphans) {
      try { process.kill(o.pid); console.log(`[orphan-server]   reaped ${o.pid}`); }
      catch (e) { console.log(`[orphan-server]   could not reap ${o.pid}: ${e.message}`); }
    }
  }

  const out = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
  if (out) {
    const file = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      instrument: 'orphan-server-census.mjs',
      gate: 'ORPHAN-SERVER-01',
      observedAt: at,
      observedAtUtc: stampUtc(),
      ...verdict,
    }, null, 2)}\n`);
    console.log(`[orphan-server] wrote ${path.relative(REPO_ROOT, file)}`);
  }
  process.exit(verdict.exit);
}
