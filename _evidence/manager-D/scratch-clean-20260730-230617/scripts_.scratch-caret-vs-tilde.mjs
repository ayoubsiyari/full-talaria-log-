import { execSync } from 'node:child_process';

const local = 'chart v 1.4/chart/modules/order-manager.js';
const needle = '__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1';
const c = '2cc949399';

function show(spec) {
  try {
    const blob = execSync(`git show ${spec}:"${local}"`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, len: blob.length, has: blob.includes(needle) };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message).slice(0, 120) };
  }
}

console.log('caret', show(`${c}^`));
console.log('tilde', show(`${c}~1`));
console.log('explicit', show('39108d12e'));
console.log('rev-parse caret', execSync(`git rev-parse ${c}^`, { encoding: 'utf8' }).trim());
console.log('rev-parse tilde', execSync(`git rev-parse ${c}~1`, { encoding: 'utf8' }).trim());
