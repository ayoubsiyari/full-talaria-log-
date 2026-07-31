/**
 * SR-03 mirror sync + verify. `--check` verifies only; default copies canonical
 * -> homepage for the packet's touched files and then verifies every pair.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const CHECK_ONLY = process.argv.includes('--check');
const A = path.join(ROOT, 'chart v 1.4', 'chart');
const B = path.join(ROOT, 'homepage', 'public', 'chart');

const TOUCHED = [
  'chart.js',
  path.join('modules', 'economic-news-sidebar.js'),
  path.join('modules', 'favorites-manager.js'),
  path.join('modules', 'indicator-ui.js'),
  path.join('modules', 'screenshot-manager.js'),
];

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

if (!CHECK_ONLY) {
  for (const rel of TOUCHED) {
    fs.copyFileSync(path.join(A, rel), path.join(B, rel));
    console.log(`copied ${rel}`);
  }
}

// Verify EVERY mirrored product .js pair, not just the touched ones.
const all = ['chart.js', ...fs.readdirSync(path.join(A, 'modules'))
  .filter((f) => f.endsWith('.js')).map((f) => path.join('modules', f))];
let bad = 0;
for (const rel of all) {
  const pa = path.join(A, rel);
  const pb = path.join(B, rel);
  if (!fs.existsSync(pb)) { console.log(`MISSING MIRROR ${rel}`); bad++; continue; }
  const ha = sha(pa); const hb = sha(pb);
  if (ha !== hb) { console.log(`DIVERGENT ${rel}\n   A=${ha}\n   B=${hb}`); bad++; }
}
console.log(`\npairs checked=${all.length} divergent=${bad}`);
console.log('--- touched file hashes ---');
for (const rel of TOUCHED) console.log(`${sha(path.join(A, rel)).slice(0, 16)}  ${rel}`);
if (bad) process.exit(1);
console.log('ALL MIRRORS BYTE-IDENTICAL');
