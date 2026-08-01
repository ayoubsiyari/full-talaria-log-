#!/usr/bin/env node
/**
 * Proves TOOL-01 reaches a DETACHED child, through the real launchDetached path.
 *
 * Written as a file rather than an inline `node -e` because PowerShell mangles nested quoting, which has
 * already cost me one debugging cycle today and one self-test rewrite last night.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchDetached } from './lib/detach01.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
fs.mkdirSync(EV, { recursive: true });
const out = path.join(EV, 'DETACH-CAP-PROBE.json');
const logFile = path.join(EV, 'detach-cap-probe.log');
try { fs.unlinkSync(out); } catch { /* fresh */ }

const CAP = Number(process.argv[2] || 512);
const res = launchDetached('scripts/lib/detach-cap-probe.mjs', [out], { cwd: process.cwd(), heapCapMB: CAP, logFile });
console.log(`launch ok=${res.ok} launcherPid=${res.launcherPid}`);
console.log(`command: ${res.command}`);

const deadline = Date.now() + 30000;
while (!fs.existsSync(out) && Date.now() < deadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
}

if (!fs.existsSync(out)) {
  console.log('RESULT: probe never wrote');
  if (fs.existsSync(logFile)) console.log(`child log: ${fs.readFileSync(logFile, 'utf8').slice(0, 500)}`);
  process.exit(1);
}
const probe = JSON.parse(fs.readFileSync(out, 'utf8'));
const applied = probe.heapLimitMB <= CAP + 320 && probe.execArgv.some((a) => a.includes(`max-old-space-size=${CAP}`));
console.log(`child V8 heap limit: ${probe.heapLimitMB} MB (cap asked: ${CAP})`);
console.log(`child execArgv: ${JSON.stringify(probe.execArgv)}`);
console.log(`RESULT: ${applied ? 'CAP APPLIED IN THE DETACHED CHILD' : 'CAP DID NOT REACH THE CHILD'}`);
process.exit(applied ? 0 : 1);
