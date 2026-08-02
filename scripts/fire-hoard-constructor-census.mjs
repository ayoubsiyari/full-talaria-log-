/**
 * Detached launcher for HOARD-CONSTRUCTOR-CENSUS.
 * Snapshot + detailed dumps take long enough that a parent-terminal reap would waste the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchDetached } from './lib/detach01.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const tag = arg('tag', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
const outDir = path.resolve(`_evidence/manager-C/hoard-constructor-${tag}`);
const logFile = path.resolve(`_evidence/manager-C/hoard-constructor-${tag}.log`);
fs.mkdirSync(outDir, { recursive: true });

const passthrough = process.argv.filter((a) => a.startsWith('--') && !a.startsWith('--tag='));
const res = launchDetached(
  'scripts/hoard-constructor-census.mjs',
  [`--outDir=${outDir}`, ...passthrough],
  { logFile, heapCapMB: 2048 },
);

console.log(JSON.stringify({ launched: res.ok, launcherPid: res.launcherPid, error: res.error, outDir, logFile }, null, 2));
if (!res.ok) process.exitCode = 1;
