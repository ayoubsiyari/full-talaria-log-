/**
 * Detached launcher for EXHAUSTION-PROBE.
 *
 * The first attempt at this measurement died ten minutes in when its parent terminal was reaped — the third
 * time measurement time has been lost that way. launchDetached reparents to WmiPrvSE so nothing in the
 * editor can cascade into the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchDetached } from './lib/detach01.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const tag = arg('tag', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
const out = path.resolve(`_evidence/manager-C/exhaustion-probe-${tag}.json`);
const logFile = path.resolve(`_evidence/manager-C/exhaustion-probe-${tag}.log`);
fs.mkdirSync(path.dirname(out), { recursive: true });

const passthrough = process.argv.filter((a) => a.startsWith('--') && !a.startsWith('--tag='));
const res = launchDetached('scripts/exhaustion-probe.mjs', [`--out=${out}`, ...passthrough], { logFile, heapCapMB: 512 });

console.log(JSON.stringify({ launched: res.ok, launcherPid: res.launcherPid, error: res.error, out, logFile }, null, 2));
if (!res.ok) process.exitCode = 1;
