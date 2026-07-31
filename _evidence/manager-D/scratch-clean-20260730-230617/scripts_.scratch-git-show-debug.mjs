import { execSync } from 'node:child_process';

const local = 'chart v 1.4/chart/modules/order-manager.js';
const needle = '__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1';
const c = '2cc949399';

function git(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    return `ERR:${e.stderr || e.message}`;
  }
}

const cmds = [
  `git show ${c}:"${local}"`,
  `git show ${c}:${JSON.stringify(local)}`,
  `git show ${c} -- ${JSON.stringify(local)}`,
];
for (const q of cmds) {
  const out = git(q);
  console.log({
    cmd: q,
    len: out.length,
    has: out.includes(needle),
    start: out.slice(0, 80).replace(/\n/g, '\\n'),
  });
}

const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const found = git(`git log --reverse -G ${JSON.stringify(escaped)} --format=%H -1 -- ${JSON.stringify(local)}`);
console.log('found', found.trim());
const parent = git(`git show ${c}^:"${local}"`);
console.log('parentHas', parent.includes(needle), 'parentLen', parent.length);
