/**
 * Permanent regression: legacy-index cache stamping must cover BOTH
 * relative (`modules/...`) and absolute (`/chart/modules/...`) script paths.
 * The failed P3-CKPT-001 / 20260722b01 preflight left
 * `/chart/modules/chart-window-limit.js?v=20260721b03` stale while relative
 * scripts advanced — layout proof correctly rejected mixed ids.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  stampLegacyHtml,
  uniqueCacheIds,
} from '../../chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const FIXTURE = `
<!doctype html>
<html><head>
  <link rel="stylesheet" href="modules/v9-chrome.css?v=20260720b21">
  <link rel="stylesheet" href="/chart/fonts/talaria-fonts.css?v=20260720b21">
  <script defer src="/chart/modules/chart-window-limit.js?v=20260721b03"></script>
</head><body>
  <script defer src="modules/drawing-tools-base.js?v=20260722b01"></script>
  <script defer src="chart.js?v=20260722b01"></script>
  <script defer src="settings-panel.js?v=20260722b01"></script>
  <script defer src="/chart/chart.js?v=20260721b03"></script>
</body></html>
`;

test('legacy stamp covers relative and absolute script src paths', () => {
  const stamped = stampLegacyHtml(FIXTURE, '20260722b10', { stampLinks: false });
  assert.match(stamped, /src="\/chart\/modules\/chart-window-limit\.js\?v=20260722b10"/);
  assert.match(stamped, /src="\/chart\/chart\.js\?v=20260722b10"/);
  assert.match(stamped, /src="modules\/drawing-tools-base\.js\?v=20260722b10"/);
  assert.match(stamped, /src="chart\.js\?v=20260722b10"/);
  assert.match(stamped, /src="settings-panel\.js\?v=20260722b10"/);
  assert.equal(
    /chart-window-limit\.js\?v=20260721b03/.test(stamped),
    false,
    'absolute stale b03 must be rewritten',
  );
  // Without link stamping, CSS ids may remain — script ids must be uniform.
  const scriptIds = [
    ...stamped.matchAll(/<script\b[^>]*\ssrc="[^"]+\?v=([^"&#]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual([...new Set(scriptIds)], ['20260722b10']);
});

test('checkpoint link stamp yields a single cache id across scripts and links', () => {
  const stamped = stampLegacyHtml(FIXTURE, '20260722b10', { stampLinks: true });
  assert.deepEqual(uniqueCacheIds(stamped), ['20260722b10']);
  assert.match(stamped, /href="modules\/v9-chrome\.css\?v=20260722b10"/);
  assert.match(stamped, /href="\/chart\/fonts\/talaria-fonts\.css\?v=20260722b10"/);
});

test('b01 preflight mixed-id regression: absolute leftover alone fails uniqueness', () => {
  // Reconstruct the exact failure class: relative scripts advanced, absolute left stale.
  const mixed = FIXTURE
    .replace(/modules\/drawing-tools-base\.js\?v=[^"]+/g, 'modules/drawing-tools-base.js?v=20260722b01')
    .replace(/src="chart\.js\?v=[^"]+"/g, 'src="chart.js?v=20260722b01"')
    .replace(/settings-panel\.js\?v=[^"]+/g, 'settings-panel.js?v=20260722b01');
  // Absolute paths intentionally still at b03 (old regex miss).
  assert.deepEqual(
    uniqueCacheIds(mixed).sort(),
    ['20260720b21', '20260721b03', '20260722b01'].sort(),
  );
  const fixed = stampLegacyHtml(mixed, '20260722b01', { stampLinks: true });
  assert.deepEqual(uniqueCacheIds(fixed), ['20260722b01']);
});
