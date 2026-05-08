#!/usr/bin/env node
/**
 * Chart client production bundle (Step 2–3 of pipeline):
 * - Part 1: modules from drawing-tools-base … alert-system (before inline init scripts).
 * - Part 2: custom-indicators-runtime … indicator-ui (after inline blocks).
 * - Minify with Terser, no source maps.
 * - Writes dist/chart-app-part1.min.js, dist/chart-app-part2.min.js, dist/index.html
 *
 * Source HTML for markers: legacy-index.html (monolith with CHART_CLIENT_* markers). Root
 * index.html is a small stub for humans only — it is not used for this bundle.
 *
 * Dev: no dist/ → api_server may serve dist-v9 or legacy-index.html with separate <script> tags.
 * Prod: run `npm run build:chart-client` (Docker/CI) so dist/ exists.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { minify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Local deferred scripts before inline screenshot/alert/fullscreen blocks. */
const CHART_CLIENT_PART1 = [
  'modules/drawing-tools-base.js',
  'modules/drawing-tools-lines.js',
  'modules/drawing-tools-shapes.js',
  'modules/drawing-tools-fibonacci.js',
  'modules/drawing-tools-text.js',
  'modules/drawing-tools-emoji.js',
  'modules/drawing-tools-image.js',
  'modules/emoji-picker.js',
  'modules/emoji-picker-simple.js',
  'modules/drawing-tools-advanced-volume.js',
  'modules/drawing-tools-advanced.js',
  'modules/drawing-tools-extended.js',
  'modules/drawing-tools-patterns.js',
  'modules/drawing-tools-fib-gann.js',
  'modules/drawing-tools-channels.js',
  'modules/drawing-tools-ui.js',
  'modules/color-picker.js',
  'modules/drawing-toolbar.js',
  'modules/undo-redo-manager.js',
  'modules/preferences-sync.js',
  'modules/preferences-init.js',
  'modules/drawing-tools-manager.js',
  'modules/favorites-manager.js',
  'modules/keyboard-shortcuts.js',
  // modules/panel-manager.js removed — multi-panel layout system has been
  // deleted. window.panelManager will be undefined; the surrounding code in
  // chart.js / modules already null-checks for that, so the panel feature
  // is silently disabled. See also: removal of initPanelChart /
  // renderPanelChart / panelTimeframeChanged listeners in the index HTMLs
  // and the layout-selector UI in TalariaV8bLive.jsx.
  'settings-panel.js',
  'settings-panel-ext.js',
  'modules/timeframe-favorites.js',
  'modules/propfirm-tracker.js',
  'modules/compare-overlay.js',
  'modules/timezone-manager.js',
  'chart.js',
  'modules/replay-system.js',
  'modules/chart-env.defaults.js',
  'modules/chart-env.generated.js',
  'modules/economic-news-sidebar.js',
  'modules/order-event-bus.js',
  'modules/order-service.js',
  'modules/market-calculations.js',
  'modules/order-manager.js',
  'modules/screenshot-manager.js',
  'modules/alert-system.js',
];

const CHART_CLIENT_PART2 = [
  'modules/custom-indicators-runtime.js',
  'modules/chart-indicators-full.js',
  'modules/indicator-ui.js',
];

const MARK = {
  begin: '<!-- CHART_CLIENT_SCRIPTS_BEGIN -->',
  end: '<!-- CHART_CLIENT_SCRIPTS_END -->',
  begin2: '<!-- CHART_CLIENT_SCRIPTS_PART2_BEGIN -->',
  end2: '<!-- CHART_CLIENT_SCRIPTS_PART2_END -->',
};

async function minifyFiles(relPaths, label) {
  const parts = [];
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`Missing [${label}]: ${rel}`);
      process.exit(1);
    }
    parts.push(fs.readFileSync(abs, 'utf8'));
  }
  const raw = parts.join('\n;\n');
  const result = await minify(raw, {
    compress: { dead_code: true, drop_console: false, passes: 1 },
    mangle: true,
    format: { comments: false },
    sourceMap: false,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  return result.code || '';
}

function replaceBetweenMarkers(html, begin, end, insertion) {
  const i = html.indexOf(begin);
  const j = html.indexOf(end);
  if (i === -1 || j === -1 || j <= i) {
    throw new Error(`Invalid markers: ${begin} / ${end}`);
  }
  return html.slice(0, i + begin.length) + '\n' + insertion + '\n' + html.slice(j);
}

async function main() {
  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const code1 = await minifyFiles(CHART_CLIENT_PART1, 'part1');
  const code2 = await minifyFiles(CHART_CLIENT_PART2, 'part2');

  const h1 = crypto.createHash('sha256').update(code1).digest('hex').slice(0, 12);
  const h2 = crypto.createHash('sha256').update(code2).digest('hex').slice(0, 12);

  const out1 = path.join(distDir, 'chart-app-part1.min.js');
  const out2 = path.join(distDir, 'chart-app-part2.min.js');
  fs.writeFileSync(out1, code1, 'utf8');
  fs.writeFileSync(out2, code2, 'utf8');
  console.log(`Wrote ${out1} (${(code1.length / 1024).toFixed(1)} KB, v=${h1})`);
  console.log(`Wrote ${out2} (${(code2.length / 1024).toFixed(1)} KB, v=${h2})`);

  const indexPath = path.join(ROOT, 'legacy-index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  for (const [k, v] of Object.entries(MARK)) {
    if (!html.includes(v)) {
      console.error(`legacy-index.html missing marker: ${v}`);
      process.exit(1);
    }
  }

  const tag1 = `    <script defer src="dist/chart-app-part1.min.js?v=${h1}"></script>`;
  const tag2 = `    <script defer src="dist/chart-app-part2.min.js?v=${h2}"></script>`;

  html = replaceBetweenMarkers(html, MARK.begin, MARK.end, tag1);
  html = replaceBetweenMarkers(html, MARK.begin2, MARK.end2, tag2);

  const outHtml = path.join(distDir, 'index.html');
  fs.writeFileSync(outHtml, html, 'utf8');
  console.log(`Wrote ${outHtml}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
