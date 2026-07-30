/**
 * Verify the claim that ONE bottom-panel trade row renders ~28-31 host elements.
 *
 * This matters because it is an INDEPENDENT corroboration of C's +28.7 per closed
 * trade, from source, and it would restore a reading I disputed at 23:15.
 * Verify rather than take on report.
 *
 * Method limit stated up front: this counts JSX host tags textually. Tags inside
 * a conditional (&&, ternary) are counted separately so the unconditional floor
 * and the conditional ceiling are both visible. It cannot evaluate which
 * conditionals are true at runtime.
 *
 * Static only.
 */
import fs from 'node:fs';

const F = 'chart v 1.4/talaria-design/src/TalariaV8bLive.jsx';
const lines = fs.readFileSync(F, 'utf8').split('\n');

// Region reported as the row body.
const START = 38241; // key={r.id}
const END = 38428;
const region = lines.slice(START - 1, END);

console.log(`=== ${F} lines ${START}..${END} (${region.length} lines) ===`);
console.log(`anchor line ${START}: ${lines[START - 1].trim().slice(0, 90)}`);

const HOST = ['div', 'span', 'svg', 'path', 'button', 'img', 'input', 'a', 'circle', 'rect', 'line', 'g'];
const openTag = (tag) => new RegExp(`<${tag}(?=[\\s/>])`, 'g');

let uncond = 0; let cond = 0;
const perTag = {};
region.forEach((raw) => {
  const l = raw;
  // A line is "conditional" if the tag sits after a && or ? on the same line,
  // or the line opens a conditional block.
  const conditional = /&&\s*\(?\s*$|&&\s*</.test(l) || /\?\s*\(?\s*</.test(l) || /^\s*\{\s*\w[\w.?[\]]*\s*&&/.test(l);
  for (const tag of HOST) {
    const n = (l.match(openTag(tag)) || []).length;
    if (!n) continue;
    perTag[tag] = (perTag[tag] || 0) + n;
    if (conditional) cond += n; else uncond += n;
  }
});

console.log('\nhost tags in region:');
for (const [t, n] of Object.entries(perTag).sort((a, b) => b[1] - a[1])) {
  console.log(`  <${t.padEnd(7)} ${String(n).padStart(3)}`);
}
const total = Object.values(perTag).reduce((a, b) => a + b, 0);
console.log(`\n  TOTAL host tags in region : ${total}`);
console.log(`  on a plainly-conditional line : ${cond}`);
console.log(`  otherwise                     : ${uncond}`);

console.log('\n=== POSITIVE CONTROL: the tag matcher works ===');
const whole = lines.join('\n');
for (const t of ['div', 'span', 'svg']) {
  console.log(`  whole file <${t} = ${(whole.match(openTag(t)) || []).length}`);
}

console.log('\n=== is the key stable? ===');
for (const n of [38241, 38931]) {
  console.log(`  line ${n}: ${(lines[n - 1] || '').trim().slice(0, 110)}`);
}

console.log('\n=== the 800ms re-render poll ===');
for (let i = 12570; i <= 12585; i += 1) {
  const l = lines[i - 1] || '';
  if (/setInterval|order:closed|bump/.test(l)) console.log(`  ${i}: ${l.trim().slice(0, 110)}`);
}

console.log('\n=== does the bottom panel stay mounted when collapsed? ===');
for (let i = 37940; i <= 37960; i += 1) {
  const l = lines[i - 1] || '';
  if (/btmOpen|height|overflow/.test(l)) console.log(`  ${i}: ${l.trim().slice(0, 130)}`);
}
