import fs from 'node:fs';

const ROOT = process.argv[2] || process.cwd();
const B = `${ROOT}/chart v 1.4/chart`;

const SITES = [
  // POLICY 1
  ['P1', 'modules/economic-news-sidebar.js', 255, 266],
  ['P1', 'modules/economic-news-sidebar.js', 1360, 1370],
  ['P1', 'modules/economic-news-sidebar.js', 1572, 1592],
  ['P1', 'modules/favorites-manager.js', 622, 634],
  ['P1', 'modules/indicator-ui.js', 4004, 4016],
  ['P1', 'modules/indicator-ui.js', 4958, 4970],
  ['P1', 'modules/indicator-ui.js', 6241, 6253],
  ['P1', 'modules/compare-overlay.js', 279, 292],
  ['P1', 'modules/compare-overlay.js', 317, 330],
  ['P1', 'modules/screenshot-manager.js', 1698, 1714],
  ['P1', 'chart.js', 17206, 17222],
  ['P1', 'chart.js', 18412, 18426],
  // POLICY 2
  ['P2', 'chart.js', 19318, 19342],
  ['P2', 'chart.js', 5344, 5362],
  ['P2', 'chart.js', 25746, 25764],
  // POLICY 4 (comment-only / no touch)
  ['P4', 'chart.js', 17242, 17256],
  ['P4', 'chart.js', 42884, 42896],
  // POLICY 5
  ['P5', 'modules/chart-indicators-full.js', 2198, 2212],
  ['P5', 'modules/chart-indicators-full.js', 2298, 2311],
  ['P5', 'modules/chart-indicators-full.js', 3137, 3150],
  ['P5', 'modules/chart-indicators-full.js', 4956, 4970],
  ['P5', 'modules/indicator-ui.js', 3092, 3114],
];

for (const [pol, file, a, b] of SITES) {
  const L = fs.readFileSync(`${B}/${file}`, 'utf8').split(/\r?\n/);
  console.log(`===== ${pol} ${file} [${a}-${b}] =====`);
  for (let i = a - 1; i < b; i++) console.log(`${i + 1}: ${L[i] ?? ''}`);
  console.log('');
}
