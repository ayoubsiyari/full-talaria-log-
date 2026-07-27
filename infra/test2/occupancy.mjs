#!/usr/bin/env node
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chooseOccupancy } from './guard.mjs';

const statePath = process.env.TEST2_OCCUPANCY_STATE || '/var/lib/talaria-test2/occupancy.json';
const lockPath = `${statePath}.lock`;
const allowed = new Set(['blocking-train-candidate', 'parked-build-diagnosis', 'soak']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function locked(action) {
  await mkdir(dirname(statePath), { recursive: true });
  let lock;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { lock = await open(lockPath, 'wx', 0o600); break; } catch { await sleep(100); }
  }
  if (!lock) throw new Error('occupancy lock unavailable');
  try {
    let state = { jobs: [] };
    try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch {}
    const next = await action(state);
    const temporary = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, statePath);
    return next;
  } finally {
    await lock.close();
    await import('node:fs/promises').then(({ unlink }) => unlink(lockPath).catch(() => {}));
  }
}

async function main() {
  const [command, kind, id] = process.argv.slice(2);
  const state = await locked((current) => {
    if (command === 'acquire') {
      if (!allowed.has(kind) || !/^[a-z0-9-]+$/.test(id || '')) throw new Error('invalid occupancy request');
      const jobs = current.jobs.filter((job) => job.id !== id);
      jobs.push({ id, kind, state: 'queued', created: new Date().toISOString() });
      const winner = chooseOccupancy(jobs);
      for (const job of jobs) job.state = job.id === winner?.id ? 'running' : (job.kind === 'soak' ? 'paused' : 'queued');
      return { jobs, active: winner?.id || null };
    }
    if (command === 'release') {
      const jobs = current.jobs.filter((job) => job.id !== kind);
      const winner = chooseOccupancy(jobs);
      for (const job of jobs) job.state = job.id === winner?.id ? 'running' : (job.kind === 'soak' ? 'paused' : 'queued');
      return { jobs, active: winner?.id || null };
    }
    if (command === 'status') return current;
    throw new Error('usage: occupancy.mjs acquire <kind> <id> | release <id> | status');
  });
  console.log(JSON.stringify(state, null, 2));
}

main().catch((error) => { console.error(`TEST-2 OCCUPANCY: ${error.message}`); process.exitCode = 1; });
