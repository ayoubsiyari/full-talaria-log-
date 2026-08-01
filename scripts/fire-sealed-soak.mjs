#!/usr/bin/env node
/**
 * Fire the sealed two-arm soak. Everything is fixed except --expectDigest, which cannot be known until
 * B cuts.
 *
 * This is a launcher, and the reason it exists as its own file with its own checks is that the last
 * launcher in this codebase had never once run: launchDetached built its PowerShell command with
 * JSON.stringify, produced backslash-escaped quotes PowerShell does not parse, and returned a silent
 * ok=false. Every "detached" run to date was actually a WMI call typed at the shell by hand. So this
 * script does not trust its own launch - it waits for the heartbeat to appear and reports the child's
 * real pid, and a launch that produces no heartbeat is a FAILURE here rather than a discovery ten hours
 * later against an empty file.
 *
 * SEQUENCING: the arms run SEQUENTIALLY, not together. B measured the host at 85% CPU with one arm up,
 * and two concurrent arms would make each the other's contention - the defect that marked segment 2 of
 * the salvaged soak. This script refuses to start the second arm while the first is live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchDetached, inspectRun } from './lib/detach01.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', '');
const DIGEST = argOf('expectDigest', '');
const HOURS = argOf('hours', '10');
const SPEED = argOf('speed', '60');
const ORIGIN = argOf('origin', 'http://31.97.192.82:3000');
const HEAP_CAP = argOf('heapCapMB', '1024');
const ALLOW_CONCURRENT = process.argv.includes('--allowConcurrent');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

const ARMS = {
  trades: { closesPerHour: '20', out: path.join(EV, 'SEALED-SOAK-TRADES.jsonl') },
  zerotrade: { closesPerHour: '0', out: path.join(EV, 'SEALED-SOAK-ZEROTRADE.jsonl') },
};

if (!ARMS[ARM]) {
  console.error('usage: fire-sealed-soak.mjs --arm=trades|zerotrade --expectDigest=<digest from B\'s cut>');
  process.exit(2);
}
if (!DIGEST) {
  console.error('REFUSED: --expectDigest is empty.');
  console.error('  This is the single blank in the staged command and it is deliberately not defaulted.');
  console.error('  An unpinned soak records ten hours against whatever bytes happened to be served, which');
  console.error('  is exactly what SOAK-SEAL exists to prevent. Fill it from B\'s cut and re-run.');
  process.exit(2);
}

// Refuse to stack arms. inspectRun reads the heartbeat, so a live run is detectable across processes.
if (!ALLOW_CONCURRENT) {
  for (const [name, cfg] of Object.entries(ARMS)) {
    if (name === ARM) continue;
    const st = inspectRun(cfg.out, { staleSec: 900 });
    if (st.state === 'RUNNING' || st.state === 'LIVE') {
      console.error(`REFUSED: the ${name} arm is ${st.state}. The arms run sequentially - two concurrent arms`);
      console.error('  contend for one host and each becomes the other\'s confound. Wait for it to finish.');
      process.exit(2);
    }
  }
}

const cfg = ARMS[ARM];
const logFile = cfg.out.replace(/\.jsonl$/, '.log');
const args = [
  `--arm=${ARM}`, `--hours=${HOURS}`, `--speed=${SPEED}`,
  `--closesPerHour=${cfg.closesPerHour}`, `--origin=${ORIGIN}`,
  `--out=${cfg.out}`, `--expectDigest=${DIGEST}`,
  '--requireSha=1',                       // PASSPORT-3: refuse rather than record a null for ten hours
  `--heapCapMB=${HEAP_CAP}`,              // TOOL-01
];

console.log(`arm:      ${ARM}`);
console.log(`digest:   ${DIGEST}`);
console.log(`out:      ${cfg.out}`);
console.log(`command:  node --max-old-space-size=${HEAP_CAP} scripts/sealed-two-arm-soak.mjs ${args.join(' ')}`);

for (const f of [cfg.out, logFile, cfg.out.replace(/\.jsonl$/, '.heartbeat.json')]) {
  if (fs.existsSync(f)) fs.renameSync(f, `${f}.prior-${Date.now()}`);
}

const res = launchDetached('scripts/sealed-two-arm-soak.mjs', args, { cwd: process.cwd(), logFile, heapCapMB: Number(HEAP_CAP) });
if (!res.ok) {
  console.error(`\nLAUNCH FAILED: ${res.error}`);
  process.exit(1);
}
console.log(`\nlaunched via ${res.launcherPid ? `WMI, launcher pid ${res.launcherPid}` : 'WMI'}`);

// Do not report success on the launch call alone - that is precisely the assumption that hid a launcher
// which had never worked. Wait for the run to prove itself by writing a heartbeat.
const deadline = Date.now() + 180000;
let seen = null;
while (Date.now() < deadline) {
  const st = inspectRun(cfg.out, { staleSec: 900 });
  if (st.state !== 'NEVER STARTED') { seen = st; break; }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!seen) {
  console.error('\nLAUNCH UNPROVEN: no heartbeat appeared within 180 s.');
  console.error(`  Read ${logFile} - the child may have refused on the digest (exit 2), the source commit`);
  console.error('  (exit 3), or the heap cap (exit 4), each of which is a correct refusal, not a crash.');
  process.exit(1);
}
console.log(`heartbeat: ${seen.state}, child pid ${seen.pid ?? '(unreported)'}`);
console.log('\nSoak is live and detached. It survives this shell closing.');
process.exitCode = 0;
