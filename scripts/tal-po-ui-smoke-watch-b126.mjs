#!/usr/bin/env node
/**
 * Watch for b126, then fire the sealed TAL/Rayan PO UI smoke canary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCandidateCoordinates } from './lib/a3-speed-fill-journal-parity.mjs';
import {
  groupRuns,
  readNodeProcesses,
} from './measurement-queue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.includes(`--${name}=1`);
}

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT_BADGE = String(argOf('expect-badge', process.env.TAL_PO_UI_EXPECT_BADGE || '20260803b126'));
const EVERY_MS = Math.max(5000, Number(argOf('everyMs', '30000')) || 30000);
const OUT_JSONL = path.resolve(repoRoot, argOf('watch-out', 'docs/plan3/evidence/tal-po-ui-smoke-watch-b126.jsonl'));
const CANARY_OUT = path.resolve(repoRoot, argOf('canary-out', 'docs/plan3/evidence/tal-po-ui-smoke-b126.json'));
const CANARY_SCRIPT = path.resolve(repoRoot, argOf('canary-script', path.join(__dirname, 'tal-po-ui-smoke-canary.mjs')));
const QUEUE_SCRIPT = path.join(__dirname, 'measurement-queue.mjs');
const QUEUE_OWNER = String(argOf('queue-owner', 'D'));
const QUEUE_RUN = String(argOf('queue-run', 'TAL-PO-UI-SMOKE'));
const QUEUE_ETA = String(argOf('queue-eta', '5m'));
const FORCE_PREFLIGHT_EXIT = argOf('force-preflight-exit', '');
const STOP_AFTER_BLOCKS = Math.max(0, Number(argOf('stop-after-blocks', '0')) || 0);
const EXCLUSIVE_QUEUE = hasFlag('exclusive-queue') || argOf('queue-mode', '') === 'exclusive';
const AUTHORITATIVE_READ_RE = /(?:v8-|v8_|heap|detailed-dump|canonical-floor|floor-retake|sealed-two-arm-soak|fire-sealed-soak|arena|competitor-reference|footprint|memory|soak)/i;

function append(row) {
  fs.mkdirSync(path.dirname(OUT_JSONL), { recursive: true });
  fs.appendFileSync(OUT_JSONL, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queueCommand(args) {
  if (args[0] === 'preflight' && FORCE_PREFLIGHT_EXIT) {
    const code = Number(FORCE_PREFLIGHT_EXIT) || 2;
    return {
      ok: code === 0,
      stdout: `[queue] FORCED_PREFLIGHT_EXIT_${code} — watcher retry proof\n`,
      stderr: '',
      code,
    };
  }
  try {
    const stdout = execFileSync(process.execPath, [QUEUE_SCRIPT, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1 << 20,
    });
    return { ok: true, stdout, stderr: '', code: 0 };
  } catch (e) {
    return {
      ok: false,
      stdout: String(e?.stdout || ''),
      stderr: String(e?.stderr || e?.message || ''),
      code: Number(e?.status ?? 1),
    };
  }
}

function claimQueueOrBlock(surface) {
  const preflight = queueCommand(['preflight', `--owner=${QUEUE_OWNER}`]);
  if (!preflight.ok) {
    append({ event: 'QUEUE_BLOCKED_PREFLIGHT', surface, preflight });
    console.error(`TAL_PO_UI_SMOKE_BLOCKED_QUEUE preflight code=${preflight.code} ${String(preflight.stdout || preflight.stderr).replace(/\s+/g, ' ').slice(0, 240)}`);
    return { ok: false, stage: 'preflight', detail: preflight };
  }
  const claim = queueCommand([
    'claim',
    `--owner=${QUEUE_OWNER}`,
    `--run=${QUEUE_RUN}`,
    `--eta=${QUEUE_ETA}`,
    `--pid=${process.pid}`,
  ]);
  if (!claim.ok) {
    append({ event: 'QUEUE_BLOCKED_CLAIM', surface, claim });
    console.error(`TAL_PO_UI_SMOKE_BLOCKED_QUEUE claim code=${claim.code} ${String(claim.stdout || claim.stderr).replace(/\s+/g, ' ').slice(0, 240)}`);
    return { ok: false, stage: 'claim', detail: claim };
  }
  append({ event: 'QUEUE_CLAIMED', surface, claim: claim.stdout, owner: QUEUE_OWNER, run: QUEUE_RUN, pid: process.pid });
  console.error(`TAL_PO_UI_SMOKE_QUEUE_CLAIMED owner=${QUEUE_OWNER} run=${QUEUE_RUN} pid=${process.pid}`);
  return { ok: true, claim };
}

function releaseQueue() {
  const release = queueCommand(['release', `--owner=${QUEUE_OWNER}`]);
  append({ event: release.ok ? 'QUEUE_RELEASED' : 'QUEUE_RELEASE_FAILED', release });
  console.error(release.ok
    ? `TAL_PO_UI_SMOKE_QUEUE_RELEASED owner=${QUEUE_OWNER}`
    : `TAL_PO_UI_SMOKE_QUEUE_RELEASE_FAILED code=${release.code}`);
  return release;
}

function authoritativeReadBlocker() {
  const procs = readNodeProcesses();
  if (procs === null) {
    return {
      ok: false,
      state: 'MACHINE_UNREADABLE',
      reason: 'could not read live node processes; refusing to call authoritative-read state clear',
    };
  }
  const groups = groupRuns(procs, { self: process.pid });
  const blockers = [];
  for (const group of groups) {
    const haystack = [
      group.rootScript,
      ...(group.members || []).map((m) => m.script),
      ...(group.members || []).map((m) => m.cmd),
    ].filter(Boolean).join(' ');
    if (AUTHORITATIVE_READ_RE.test(haystack)) {
      blockers.push({
        rootPid: group.rootPid,
        rootScript: group.rootScript,
        members: group.members,
      });
    }
  }
  if (blockers.length) {
    return {
      ok: false,
      state: 'AUTHORITATIVE_READ_ACTIVE',
      blockers,
      reason: blockers.map((b) => `${b.rootScript || 'node'}#${b.rootPid}`).join(' | '),
    };
  }
  return { ok: true, state: 'NO_AUTHORITATIVE_READ_ACTIVE' };
}

function runCanary(surface) {
  return new Promise((resolve) => {
    let queue = null;
    if (EXCLUSIVE_QUEUE) {
      queue = claimQueueOrBlock(surface);
      if (!queue.ok) {
        resolve({ ok: false, blocked: true, queue });
        return;
      }
    } else {
      const blocker = authoritativeReadBlocker();
      if (!blocker.ok) {
        append({ event: 'CONTENTION_TOLERANT_BLOCKED', surface, blocker });
        console.error(`TAL_PO_UI_SMOKE_BLOCKED_CONTENTION_TOLERANT ${blocker.state} ${blocker.reason || ''}`);
        resolve({ ok: false, blocked: true, contention: blocker });
        return;
      }
      append({ event: 'CONTENTION_TOLERANT_CLEAR', surface, blocker });
      console.error('TAL_PO_UI_SMOKE_CONTENTION_TOLERANT_CLEAR no authoritative read active; not claiming queue');
    }
    const args = [
      CANARY_SCRIPT,
      '--origin', ORIGIN,
      '--expect-badge', surface.badge,
      '--expect-digest', surface.digest,
      '--expect-sha', surface.sourceCommitSha,
      '--out', CANARY_OUT,
    ];
    append({ event: 'RUN_START', args: args.slice(1), surface });
    console.error(`TAL_PO_UI_SMOKE_FIRED badge=${surface.badge} digest=${surface.digest} sha=${surface.sourceCommitSha}`);
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      const s = String(d);
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = String(d);
      stderr += s;
      process.stderr.write(s);
    });
    child.on('close', (code, signal) => {
      const ok = code === 0;
      if (queue) releaseQueue();
      append({
        event: ok ? 'RUN_PASSED' : 'RUN_FAILED',
        code,
        signal,
        canaryOut: CANARY_OUT,
        stdoutTail: stdout.slice(-2000),
        stderrTail: stderr.slice(-2000),
      });
      console.error(ok ? 'TAL_PO_UI_SMOKE_PASSED' : `TAL_PO_UI_SMOKE_FAILED code=${code} signal=${signal || ''}`);
      resolve({ ok, code, signal });
    });
  });
}

append({
  event: 'WATCH_START',
  origin: ORIGIN,
  expectBadge: EXPECT_BADGE,
  everyMs: EVERY_MS,
  canaryOut: CANARY_OUT,
  mode: EXCLUSIVE_QUEUE ? 'exclusive-queue' : 'contention-tolerant',
});
console.error(`TAL_PO_UI_SMOKE_WATCH_START badge=${EXPECT_BADGE} origin=${ORIGIN} everyMs=${EVERY_MS} mode=${EXCLUSIVE_QUEUE ? 'exclusive-queue' : 'contention-tolerant'}`);

let fired = false;
let blockedCount = 0;
while (!fired) {
  let surface = null;
  try {
    surface = await readCandidateCoordinates(ORIGIN);
  } catch (e) {
    append({ event: 'POLL_ERROR', error: String(e && e.message || e) });
    console.error(`TAL_PO_UI_SMOKE_WAIT error=${String(e && e.message || e).slice(0, 160)}`);
    await sleep(EVERY_MS);
    continue;
  }
  const badgeOk = String(surface.badge || '') === EXPECT_BADGE;
  const sealed = !!(surface.digest && surface.sourceCommitSha);
  append({ event: badgeOk ? (sealed ? 'MATCH_SEALED' : 'MATCH_UNSEALED') : 'WAIT', surface });
  if (badgeOk && sealed) {
    const result = await runCanary(surface);
    if (result.blocked) {
      blockedCount += 1;
      append({ event: 'BLOCKED_RETRY', blockedCount, stopAfterBlocks: STOP_AFTER_BLOCKS });
      if (STOP_AFTER_BLOCKS > 0 && blockedCount >= STOP_AFTER_BLOCKS) {
        console.error(`TAL_PO_UI_SMOKE_RETRY_PROOF blockedCount=${blockedCount}`);
        process.exitCode = 0;
        break;
      }
      await sleep(EVERY_MS);
      continue;
    }
    fired = true;
    process.exitCode = result.ok ? 0 : 2;
    break;
  }
  console.error(`TAL_PO_UI_SMOKE_WAIT observed=${surface.badge || '-'} sealed=${sealed ? 'yes' : 'no'}`);
  await sleep(EVERY_MS);
}
