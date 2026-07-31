import fs from 'node:fs';

const ROOT = process.argv[2] || process.cwd();
const TOUCH = ['economic-news-sidebar.js', 'favorites-manager.js', 'indicator-ui.js',
  'compare-overlay.js', 'screenshot-manager.js', 'chart-indicators-full.js'];

for (const s of ['chart v 1.4/chart/dist-v9/index.html', 'chart v 1.4/chart/multichart-prod/chart-embed.html']) {
  const src = fs.readFileSync(`${ROOT}/${s}`, 'utf8');
  const scripts = [...src.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)].map((m) => m[1].split('?')[0]);
  console.log(`===== ${s} =====`);
  const idxChart = scripts.findIndex((x) => /\/chart\.js$/.test(x));
  console.log(`chart.js index: ${idxChart} of ${scripts.length}`);
  for (const t of TOUCH) {
    const i = scripts.findIndex((x) => x.endsWith(`/${t}`));
    console.log(`  ${t.padEnd(28)} index=${i}  ${i === -1 ? 'NOT LOADED' : (idxChart === -1 ? 'chart.js absent' : (i > idxChart ? 'AFTER chart.js OK' : 'BEFORE chart.js !!'))}`);
  }
  console.log('');
}
