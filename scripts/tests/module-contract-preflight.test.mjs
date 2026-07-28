import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateModuleContracts } from '../module-contract-preflight.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/module-contracts.json'), 'utf8'));

function mutateSurface(id, transform) {
  const target = manifest.inventory.find((entry) => entry.id === id);
  return (file) => {
    const html = fs.readFileSync(file, 'utf8');
    return path.resolve(file) === path.resolve(root, target.path) ? transform(html) : html;
  };
}

const MULTICHART_PANEL_SHELL_IDS = [
  'multichart-panel-shell-source',
  'multichart-panel-shell-public',
];

const DEFECTIVE_MULTICHART_HOST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>frozen defective multichart host</title>
  <script src="../chart.js"></script>
  <script src="./engine-api-guards.js?v=20260524a10"></script>
  <script src="./sync-bridge.js?v=20260524a10"></script>
</head>
<body></body>
</html>
`;

function manifestWithoutMultichartPanelShells() {
  const next = structuredClone(manifest);
  next.inventory = next.inventory.filter((entry) => !MULTICHART_PANEL_SHELL_IDS.includes(entry.id));
  return next;
}

function manifestWithOnlySurface(surface) {
  const next = structuredClone(manifest);
  next.inventory = [surface];
  return next;
}

test('GATE-01: frozen defective /chart/multichart/chart-host.html is RED for presence independent of stamp', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'multichart-panel-shell-source'));
  assert.throws(
    () => validateModuleContracts({
      manifest: manifestWithOnlySurface(surface),
      root,
      readFile: mutateSurface(surface.id, () => DEFECTIVE_MULTICHART_HOST_HTML),
    }),
    /ModulePresenceRuntime required script count 0.*IndicatorPerf required script count 0.*build stamp absent/i,
  );
});

test('known-good owned surfaces (excluding multichart panel shells) satisfy contracts', () => {
  const result = validateModuleContracts({
    manifest: manifestWithoutMultichartPanelShells(),
    root,
  });
  assert.equal(result.ok, true);
  assert.equal(result.checked.length, 10);
});

test('permanent fault injection proves missing duplicate and order RED', () => {
  const id = 'chart-host';
  const tag = '<script defer src="/chart/modules/indicator-performance.js?v=20260727b80"></script>';
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) => html.replace(tag, '')),
  }), /required script count 0|must precede/);
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) => html.replace(tag, `${tag}\n${tag}`)),
  }), /required script count 2/);
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) =>
      html.replace(tag, '').replace(
        '<script defer src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>',
        '<script defer src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>\n' + tag,
      )),
  }), /must precede/);
});

test('surface vocabulary is closed and servable shells cannot relabel out of correctness contracts', () => {
  const relabelled = manifestWithoutMultichartPanelShells();
  relabelled.inventory.find((entry) => entry.id === 'chart-host').surface = 'harness';
  assert.throws(
    () => validateModuleContracts({ manifest: relabelled, root }),
    /chart-host: declared surface harness conflicts with host evidence/,
  );

  const invalid = manifestWithoutMultichartPanelShells();
  invalid.inventory.find((entry) => entry.id === 'chart-host').surface = 'free-text';
  assert.throws(() => validateModuleContracts({ manifest: invalid, root }), /chart-host: invalid surface free-text/);
});

test('path and engine-load evidence cannot be relabelled away from contracts', () => {
  for (const servable of [false, undefined]) {
    const relabelled = manifestWithoutMultichartPanelShells();
    const row = relabelled.inventory.find((entry) => entry.id === 'chart-host');
    row.surface = 'harness';
    if (servable === undefined) {
      delete row.servable;
    } else {
      row.servable = servable;
    }
    assert.throws(
      () => validateModuleContracts({ manifest: relabelled, root }),
      /chart-host: declared surface harness conflicts with host evidence/,
    );
  }

  const stringServable = manifestWithoutMultichartPanelShells();
  const host = stringServable.inventory.find((entry) => entry.id === 'chart-host');
  host.surface = 'harness';
  host.servable = 'true';
  assert.throws(() => validateModuleContracts({ manifest: stringServable, root }), /chart-host: servable must be boolean/);

  const sneakyPanel = manifestWithoutMultichartPanelShells();
  const panel = sneakyPanel.inventory.find((entry) => entry.id === 'chart-panel');
  panel.surface = 'harness';
  panel.servable = false;
  assert.throws(
    () => validateModuleContracts({ manifest: sneakyPanel, root }),
    /chart-panel: declared surface harness conflicts with panel evidence/,
  );
});

test('commented script tags and dead paths arrays do not satisfy module presence', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'chart-host'));
  const decoyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="/chart/chart.js?v=20260727b80"></script>
      <!-- <script src="/chart/modules/module-presence-runtime.js?v=20260727b80"></script> -->
      <script>
        const paths = [
          "/chart/modules/module-presence-runtime.js",
          "/chart/modules/indicator-performance.js"
        ];
        // __loadHostOnlyScript("/chart/modules/module-presence-runtime.js")
        /* inject("/chart/modules/indicator-performance.js") */
      </script>
      <script src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>
    </head>
    <body></body>
    </html>
  `;
  assert.throws(
    () => validateModuleContracts({
      manifest: manifestWithOnlySurface(surface),
      root,
      readFile: mutateSurface(surface.id, () => decoyHtml),
    }),
    /ModulePresenceRuntime required script count 0.*IndicatorPerf required script count 0/,
  );
});

test('inert script containers and non-executable script types do not satisfy module presence', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'chart-host'));
  const decoyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="/chart/chart.js?v=20260727b80"></script>
      <noscript><script src="/chart/modules/module-presence-runtime.js?v=20260727b80"></script></noscript>
      <template><script src="/chart/modules/indicator-performance.js?v=20260727b80"></script></template>
      <script type="text/template">inject("/chart/modules/module-presence-runtime.js");</script>
      <script type="application/json">{"src":"/chart/modules/indicator-performance.js"}</script>
      <script src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>
    </head>
    <body></body>
    </html>
  `;
  assert.throws(
    () => validateModuleContracts({
      manifest: manifestWithOnlySurface(surface),
      root,
      readFile: mutateSurface(surface.id, () => decoyHtml),
    }),
    /ModulePresenceRuntime required script count 0.*IndicatorPerf required script count 0/,
  );
});

test('never-executed loader calls do not satisfy module presence', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'chart-host'));
  const decoyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="/chart/chart.js?v=20260727b80"></script>
      <script>
        function neverCalled() {
          inject("/chart/modules/module-presence-runtime.js");
        }
        (function () {
          return;
          __loadHostOnlyScript("/chart/modules/indicator-performance.js");
        })();
      </script>
      <script src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>
    </head>
    <body></body>
    </html>
  `;
  assert.throws(
    () => validateModuleContracts({
      manifest: manifestWithOnlySurface(surface),
      root,
      readFile: mutateSurface(surface.id, () => decoyHtml),
    }),
    /ModulePresenceRuntime required script count 0.*IndicatorPerf required script count 0/,
  );
});

test('paths arrays consumed only by unreachable loops do not satisfy module presence', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'chart-host'));
  const decoyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="/chart/chart.js?v=20260727b80"></script>
      <script>
        (function () {
          var paths = [
            "/chart/modules/module-presence-runtime.js",
            "/chart/modules/indicator-performance.js"
          ];
          if (0) {
            for (var i = 0; i < paths.length; i++) {
              document.write('<script defer src="' + paths[i] + '"><\\/script>');
            }
          }
          while (false) {
            document.write('<script defer src="' + paths[0] + '"><\\/script>');
          }
        })();
      </script>
      <script src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>
    </head>
    <body></body>
    </html>
  `;
  assert.throws(
    () => validateModuleContracts({
      manifest: manifestWithOnlySurface(surface),
      root,
      readFile: mutateSurface(surface.id, () => decoyHtml),
    }),
    /ModulePresenceRuntime required script count 0.*IndicatorPerf required script count 0/,
  );
});

test('executed loader calls can satisfy module presence without raw dead literals', () => {
  const surface = structuredClone(manifest.inventory.find((entry) => entry.id === 'chart-host'));
  const loaderHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script>__loadHostOnlyScript("/chart/modules/module-presence-runtime.js");</script>
      <script src="/chart/chart.js?v=20260727b80"></script>
      <script>inject("/chart/modules/indicator-performance.js");</script>
      <script src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>
    </head>
    <body></body>
    </html>
  `;
  const result = validateModuleContracts({
    manifest: manifestWithOnlySurface(surface),
    root,
    readFile: mutateSurface(surface.id, () => loaderHtml),
  });
  assert.equal(result.ok, true);
  assert.equal(result.checked.length, 2);
});

test('servable inventory mutation and exclusion controls RED', () => {
  const goodManifest = manifestWithoutMultichartPanelShells();
  const missing = structuredClone(goodManifest);
  missing.inventory.find((entry) => entry.id === 'chart-host').path = 'missing.html';
  assert.throws(() => validateModuleContracts({ manifest: missing, root }), /owned surface missing/);
  const falseExclusion = structuredClone(goodManifest);
  const row = falseExclusion.inventory.find((entry) => entry.id === 'chart-host');
  row.status = 'excluded';
  row.reason = 'fault';
  assert.throws(() => validateModuleContracts({ manifest: falseExclusion, root }), /cannot be servable/);
  const removalPending = structuredClone(goodManifest);
  const removed = removalPending.inventory.find((entry) => entry.id === 'accidental-public-live-copy');
  removed.status = 'removal-pending';
  removed.servable = true;
  assert.throws(
    () => validateModuleContracts({ manifest: removalPending, root }),
    /deploy blocked until accidental public surface is removed/,
  );
  const reappeared = structuredClone(goodManifest);
  reappeared.inventory.find((entry) => entry.id === 'accidental-public-live-copy').path =
    'chart v 1.4/talaria-design/live/index.html';
  assert.throws(() => validateModuleContracts({ manifest: reappeared, root }), /removed surface still exists/);
});
test('alternate host path and clock remain deterministic', () => {
  const goodManifest = manifestWithoutMultichartPanelShells();
  const alternateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-contract-'));
  for (const entry of goodManifest.inventory.filter((item) => item.status === 'owned-stamped')) {
    const destination = path.join(alternateRoot, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, entry.path), destination);
  }
  for (const contract of goodManifest.modules) {
    for (const relative of [contract.source, ...(contract.mirrors || [])]) {
      const destination = path.join(alternateRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relative), destination);
    }
  }
  const before = Date.now;
  Date.now = () => 1;
  try {
    assert.deepEqual(
      validateModuleContracts({ manifest: goodManifest, root: alternateRoot }).checked,
      validateModuleContracts({ manifest: goodManifest, root: alternateRoot }).checked,
    );
  } finally {
    Date.now = before;
    fs.rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test('four-state anti-lying proof (known-good surfaces)', () => {
  const goodManifest = manifestWithoutMultichartPanelShells();
  const green = () => validateModuleContracts({ manifest: goodManifest, root }).ok;
  assert.equal(green(), true, 'fixed state passes');
  assert.throws(() => validateModuleContracts({
    manifest: goodManifest,
    root,
    readFile: mutateSurface('chart-panel', (html) => html.replace('/chart/modules/indicator-performance.js', '/chart/modules/missing.js')),
  }), /required script count 0|must precede/, 'broken/corrupted state fails');
  assert.throws(() => assert.equal(green(), false), /true !== false/, 'inverted assertion flips');
});