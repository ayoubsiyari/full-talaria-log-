import { execSync } from 'node:child_process';

const local = 'chart v 1.4/chart/modules/order-manager.js';
const needle = '__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1';
const c = '2cc949399';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const parents = run(`git rev-list --parents -n 1 ${c}`).trim().split(/\s+/);
console.log('rev-list', parents);
for (const p of parents.slice(1)) {
  const short = run(`git rev-parse --short ${p}`).trim();
  const blob = run(`git show ${p}:"${local}"`);
  console.log({ parent: short, len: blob.length, has: blob.includes(needle) });
}

// binary search: first commit on current branch containing needle
const log = run(`git log --format=%H -- "${local}"`).trim().split(/\n/);
console.log('om history commits', log.length);
let first = null;
for (const h of [...log].reverse()) {
  const blob = run(`git show ${h}:"${local}"`);
  if (blob.includes(needle)) {
    first = h;
    break;
  }
}
if (first) {
  const short = run(`git rev-parse --short ${first}`).trim();
  const parent = run(`git rev-parse ${first}^`).trim();
  const pblob = run(`git show ${parent}:"${local}"`);
  console.log({
    firstIntro: short,
    subject: run(`git log -1 --format=%s ${first}`).trim(),
    parentHas: pblob.includes(needle),
  });
}
