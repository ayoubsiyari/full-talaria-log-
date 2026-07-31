import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (/^(node_modules|\.git)$/.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
console.log('=== every WRITE to mainChart across the whole repo ===');
let n = 0;
for (const p of walk(ROOT)) {
  const L = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  L.forEach((l, i) => {
    if (/\bmainChart\s*=(?!=)/.test(l)) {
      n++;
      console.log(`${p.replace(ROOT, '').replace(/\\/g, '/')}:${i + 1}  ${l.trim().slice(0, 120)}`);
    }
  });
}
console.log(`TOTAL mainChart writes = ${n}`);
