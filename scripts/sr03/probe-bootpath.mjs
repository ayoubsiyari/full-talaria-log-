import fs from 'node:fs';

const ROOT = process.argv[2] || process.cwd();
const shells = [
  'chart v 1.4/chart/dist-v9/index.html',
  'chart v 1.4/chart/multichart-prod/chart-embed.html',
];
for (const s of shells) {
  const src = fs.readFileSync(`${ROOT}/${s}`, 'utf8');
  const scripts = [...src.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)].map((m) => m[1]);
  const nonMod = scripts.filter((x) => !x.includes('modules/'));
  console.log(`=== ${s} ===`);
  console.log(`script src total: ${scripts.length}  non-modules/: ${nonMod.length}`);
  for (const n of nonMod) console.log(`   ${n}`);
  console.log(`settings-panel mentioned anywhere: ${/settings-panel/.test(src)}`);
  console.log('');
}
