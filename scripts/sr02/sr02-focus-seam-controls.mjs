#!/usr/bin/env node
/**
 * SR-02 extension of E's focus/destroy correctness controls.
 *
 * E's suite (docs/plan3/evidence/E-FOCUS-DESTROY-CORRECTNESS-20260731/
 * focus-destroy-correctness.red.mjs, commit 083b87371 / 922b78365) is the
 * specification and is NOT replaced here — it is imported and re-run verbatim.
 *
 * WHY IT NEEDS EXTENDING. E's suite is a self-contained model oracle: its own
 * `limitation` field says "Model behavior oracle; wire into real single-realm
 * input routing and Chart.destroy once A lands product code." Measured: it
 * returns GREEN with exit 0 on the completely unmodified base, so it currently
 * has no teeth on product code and cannot be made to "go GREEN by fixing
 * anything". These cells add the missing source binding: they assert facts about
 * the REAL getActiveChart providers on disk, so they move when the code moves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_SR02_FOCUS_SEAM_SOURCE_BOUND_V1';

const PROVIDERS = [
  {
    id: 'SHIPPING-SHELL',
    rel: path.join('chart v 1.4', 'chart', 'dist-v9', 'index.html'),
    // brief said 1837-1842; measured 1840-1843 (1837 is the comment)
    expectFocusAware: false,
    note: 'build output of talaria-design (vite.config.live.js outDir) — not ours to edit',
  },
  {
    id: 'PANEL-SHELL',
    rel: path.join('chart v 1.4', 'chart', 'multichart-prod', 'chart-embed.html'),
    expectFocusAware: false,
    note: 'panel shell installs the same singleton-returning shim',
  },
  {
    id: 'REACT-GRID',
    rel: path.join('chart v 1.4', 'talaria-design', 'src', 'MultichartGrid.jsx'),
    expectFocusAware: true,
    note: 'installs multichartGetActiveChart, genuinely focus-aware, chains to previous provider',
  },
];

/**
 * INSTALL, not comparison. `window.getActiveChart === 'function'` is a CONSUMER
 * doing a typeof test; an earlier version of this matcher counted those as
 * installers and wrongly reported providers inside chart.js and
 * compare-overlay.js. The negative lookahead is what makes it an assignment.
 */
const INSTALL = /window\.getActiveChart\s*=(?!=)/;
/** A provider is a singleton shim if its body just returns window.chart. */
const SINGLETON_SHIM = /window\.getActiveChart\s*=\s*function\s*\w*\s*\(\s*\)\s*\{\s*return\s+window\.chart\s*\|\|\s*null;\s*\}/;
const FOCUS_AWARE = /getActiveChartForMultichart\s*\(/;
const GUARDED_INSTALL = /if\s*\(\s*typeof\s+window\.getActiveChart\s*!==\s*['"]function['"]\s*\)/;

export function auditProviders(root) {
  const rows = [];
  for (const p of PROVIDERS) {
    const abs = path.join(root, p.rel);
    if (!fs.existsSync(abs)) {
      rows.push({ ...p, present: false, status: 'MISSING' });
      continue;
    }
    const src = fs.readFileSync(abs, 'utf8');
    const installs = INSTALL.test(src);
    const line = installs ? src.slice(0, src.search(INSTALL)).split('\n').length : null;
    const singletonShim = SINGLETON_SHIM.test(src);
    const focusAware = FOCUS_AWARE.test(src) && installs;
    rows.push({
      id: p.id,
      rel: p.rel,
      present: true,
      installsProvider: installs,
      installLine: line,
      guardedInstall: GUARDED_INSTALL.test(src),
      singletonShim,
      focusAware,
      expectFocusAware: p.expectFocusAware,
      matchesExpectation: focusAware === p.expectFocusAware,
      note: p.note,
    });
  }
  return rows;
}

/** No provider may live in the engine — chart.js or chart/modules/*.js. */
export function auditEngineHasNoProvider(root) {
  const engineDir = path.join(root, 'chart v 1.4', 'chart');
  const targets = [path.join(engineDir, 'chart.js')];
  const modDir = path.join(engineDir, 'modules');
  if (fs.existsSync(modDir)) {
    for (const f of fs.readdirSync(modDir)) if (f.endsWith('.js')) targets.push(path.join(modDir, f));
  }
  const installers = [];
  let consumers = 0;
  for (const t of targets) {
    const src = fs.readFileSync(t, 'utf8');
    if (INSTALL.test(src)) installers.push(path.basename(t));
    consumers += (src.match(/getActiveChart\s*\(/g) || []).length;
  }
  return { filesScanned: targets.length, installers, consumerCallSites: consumers };
}

export function runSourceBoundControls(root) {
  const providers = auditProviders(root);
  const engine = auditEngineHasNoProvider(root);
  const cells = [];

  // POSITIVE CONTROL for the provider matcher. An empty result from the engine
  // scan means nothing unless the same matcher is shown to find a provider
  // somewhere. It must find the two shell shims and the React one.
  const found = providers.filter((p) => p.installsProvider).length;
  cells.push({
    cell: 'SEAM-PROVIDER-MATCHER-POSITIVE-CONTROL',
    status: found >= 3 ? 'GREEN' : 'RED',
    detail: { providersFound: found, rows: providers.map((p) => ({ id: p.id, installLine: p.installLine })) },
    reason: found >= 3 ? null
      : 'SEARCH BROKEN — the provider matcher cannot find the known providers, so '
        + 'its empty result for the engine proves nothing',
  });

  // The ruling this packet was nearly dispatched on claimed the seam "exists as
  // a convention with no provider". That is false: providers exist in host
  // pages. What is true is that none live in the engine.
  cells.push({
    cell: 'SEAM-PROVIDER-EXISTS-IN-HOST-NOT-ENGINE',
    status: (found >= 3 && engine.installers.length === 0) ? 'GREEN' : 'RED',
    detail: { hostProviders: found, engineInstallers: engine.installers, engineConsumerCallSites: engine.consumerCallSites },
    reason: (found >= 3 && engine.installers.length === 0) ? null
      : 'expected providers in host pages and none in the engine',
  });

  // The shipping shell's provider is a SINGLETON shim, so E's
  // FOCUS-MOUSE-WINDOW-CHART / FOCUS-KEYBOARD-WINDOW-CHART model breaks
  // correspond to a real deployed condition, not a hypothetical one.
  const shipping = providers.find((p) => p.id === 'SHIPPING-SHELL');
  cells.push({
    cell: 'SEAM-SHIPPING-PROVIDER-IS-SINGLETON-SHIM',
    status: (shipping && shipping.singletonShim && !shipping.focusAware) ? 'GREEN' : 'RED',
    detail: shipping,
    reason: (shipping && shipping.singletonShim && !shipping.focusAware) ? null
      : 'the shipping shell provider is not the singleton shim this packet documents',
  });

  // A focus-aware implementation already exists in the React layer.
  const react = providers.find((p) => p.id === 'REACT-GRID');
  cells.push({
    cell: 'SEAM-FOCUS-AWARE-PROVIDER-ALREADY-EXISTS',
    status: (react && react.focusAware) ? 'GREEN' : 'RED',
    detail: react,
    reason: (react && react.focusAware) ? null
      : 'no focus-aware provider found in the React layer',
  });

  // Every provider matches its expected focus-awareness.
  const mismatched = providers.filter((p) => p.present && !p.matchesExpectation);
  cells.push({
    cell: 'SEAM-PROVIDER-EXPECTATIONS-HOLD',
    status: mismatched.length ? 'RED' : 'GREEN',
    detail: { mismatched },
    reason: mismatched.length ? 'a provider changed its focus-awareness' : null,
  });

  return {
    signature: SIGNATURE,
    status: cells.every((c) => c.status === 'GREEN') ? 'GREEN' : 'RED',
    providers,
    engine,
    cells,
  };
}

// ── re-run E's suite verbatim, and record that it is source-independent ──
async function runEsSuite(root) {
  const p = path.join(root, 'docs', 'plan3', 'evidence',
    'E-FOCUS-DESTROY-CORRECTNESS-20260731', 'focus-destroy-correctness.red.mjs');
  if (!fs.existsSync(p)) return { present: false };
  const mod = await import(pathToFileURL(p).href);
  const report = mod.runFocusDestroyCorrectnessOracle();
  return {
    present: true,
    signature: mod.SIGNATURE,
    status: report.status,
    redControls: report.redControls.map((c) => ({ cell: c.cell, status: c.status })),
    greenControls: report.greenControls.map((c) => ({ cell: c.cell, status: c.status })),
    limitation: report.limitation,
    sourceIndependent: true,
    note: 'E\'s oracle reads no product source; it returns GREEN on the unmodified '
      + 'base. Kept as the behavioural specification, extended (not replaced) by '
      + 'the source-bound cells above.',
  };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const root = process.argv[2]
    || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
  const mine = runSourceBoundControls(root);
  const es = await runEsSuite(root);
  const out = { ...mine, eSuite: es };
  console.log(JSON.stringify({
    signature: out.signature,
    status: out.status,
    cells: out.cells.map((c) => ({ cell: c.cell, status: c.status, reason: c.reason })),
    providers: out.providers.map((p) => ({ id: p.id, installLine: p.installLine, singletonShim: p.singletonShim, focusAware: p.focusAware })),
    engine: out.engine,
    eSuite: es.present ? { status: es.status, sourceIndependent: es.sourceIndependent } : es,
  }, null, 2));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], `${JSON.stringify({ ...out, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  process.exit(out.status === 'GREEN' ? 0 : 1);
}
