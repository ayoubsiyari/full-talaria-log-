#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const PROJECT = 'talaria-test2';
const WORKLOADS = ['chart-test2', 'worker-test2', 'questdb-test2'];
const STATE = process.env.TEST2_GUARD_STATE || '/var/lib/talaria-test2/guard-state.json';
const CHECK_MS = Number(process.env.TEST2_GUARD_INTERVAL_MS || 15000);
const CPU_LIMIT = 85;
const MIN_AVAILABLE_KIB = 2 * 1024 * 1024;
const RESUME_STREAK = 3;
const CPU_SUSTAINED_STREAK = 4;

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const compose = (...args) => docker('compose', '--project-name', PROJECT, '-f', process.env.TEST2_COMPOSE_FILE, ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function chooseOccupancy(jobs) {
  const rank = { 'blocking-train-candidate': 3, 'parked-build-diagnosis': 2, soak: 1 };
  return [...jobs].filter((job) => job.state !== 'done')
    .sort((a, b) => (rank[b.kind] || 0) - (rank[a.kind] || 0) || a.created.localeCompare(b.created))[0] || null;
}

export function transition(state, signal) {
  const next = { ...state, healthyStreak: signal.safe ? state.healthyStreak + 1 : 0 };
  next.cpuHighStreak = signal.cpu > CPU_LIMIT ? state.cpuHighStreak + 1 : 0;
  const unsafe = !signal.test1Healthy || signal.availableKiB < MIN_AVAILABLE_KIB
    || next.cpuHighStreak >= CPU_SUSTAINED_STREAK;
  if (unsafe) return { ...next, paused: true, healthyStreak: 0 };
  if (state.paused && next.healthyStreak < RESUME_STREAK) return { ...next, paused: true };
  return { ...next, paused: false };
}

async function signal(previousCpu) {
  const meminfo = await readFile('/proc/meminfo', 'utf8');
  const availableKiB = Number(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0);
  const stat = await readFile('/proc/stat', 'utf8');
  const cpu = stat.match(/^cpu\s+(.+)$/m)?.[1].trim().split(/\s+/).map(Number) || [];
  const total = cpu.reduce((sum, value) => sum + value, 0);
  const idle = (cpu[3] || 0) + (cpu[4] || 0);
  const deltaTotal = total - (previousCpu?.total || total);
  const deltaIdle = idle - (previousCpu?.idle || idle);
  const utilization = deltaTotal ? 100 * (1 - deltaIdle / deltaTotal) : 0;
  let test1Healthy = false;
  try {
    const response = await fetch(process.env.TEST1_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    test1Healthy = response.ok;
  } catch {}
  return {
    reading: { test1Healthy, availableKiB, cpu: utilization,
      safe: test1Healthy && availableKiB >= MIN_AVAILABLE_KIB && utilization <= CPU_LIMIT },
    cpu: { total, idle },
  };
}

async function applyPause(paused) {
  const listed = compose('ps', '-q', ...WORKLOADS);
  if (listed.status !== 0) throw new Error(listed.stderr.trim() || 'could not resolve TEST-2 workloads');
  const ids = listed.stdout.trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return;
  const result = docker(paused ? 'pause' : 'unpause', ...ids);
  if (result.status !== 0) throw new Error(result.stderr.trim());
}

export async function failClosed(pause, cause) {
  await pause(true);
  return { paused: true, healthyStreak: 0, cpuHighStreak: 0,
    lastError: String(cause?.message || cause), updatedAt: new Date().toISOString() };
}

async function main() {
  if (!process.env.TEST2_COMPOSE_FILE || !process.env.TEST1_HEALTH_URL) {
    throw new Error('TEST2_COMPOSE_FILE and TEST1_HEALTH_URL are required');
  }
  let state = { paused: true, healthyStreak: 0, cpuHighStreak: 0 };
  try { state = { ...state, ...JSON.parse(await readFile(STATE, 'utf8')) }; } catch {}
  // Startup is fail-closed: workloads remain paused until three fresh safe samples.
  await applyPause(true);
  state.paused = true;
  state.healthyStreak = 0;
  await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  let stopping = false;
  const stop = async (signalName) => {
    if (stopping) return;
    stopping = true;
    try {
      state = await failClosed(applyPause, signalName);
      await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
    } finally {
      process.exitCode = 0;
    }
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
  let previousCpu;
  while (!stopping) {
    try {
      const current = await signal(previousCpu);
      previousCpu = current.cpu;
      const next = transition(state, current.reading);
      if (next.paused !== state.paused) await applyPause(next.paused);
      state = { ...next, lastSignal: current.reading, lastError: null, updatedAt: new Date().toISOString() };
      await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
    } catch (error) {
      state = await failClosed(applyPause, error);
      await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
      console.error(`TEST-2 GUARD PAUSED AFTER ERROR: ${error.message}`);
    }
    await sleep(CHECK_MS);
  }
}

if (process.argv[1]?.endsWith('guard.mjs')) {
  main().catch(async (error) => {
    try { await applyPause(true); } catch (pauseError) {
      console.error(`TEST-2 GUARD EMERGENCY PAUSE FAILED: ${pauseError.message}`);
    }
    console.error(`TEST-2 GUARD FAIL-CLOSED: ${error.message}`);
    process.exitCode = 1;
  });
}
