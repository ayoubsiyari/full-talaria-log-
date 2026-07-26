/**
 * M22 / H-S78B (BL-16) — dual-tree repo + harness resolution (read-only).
 * RED-PREP-ONLY-M21-1-LOCKED — no product edits.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const M22_HS78B_STATUS = 'RED-PREP-ONLY-M21-1-LOCKED';

const MARKERS = ['chart v 1.4', 'homepage'];

export function findRepoRoot(startDir = __dirname) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 24; i += 1) {
    if (MARKERS.every((m) => fs.existsSync(path.join(dir, m)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`M22-H-S78B: repo root not found from ${startDir}`);
}

export function hashFileSha256(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

export function hashBytesSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function relPosix(root, abs) {
  return path.relative(root, abs).replace(/\\/g, '/');
}

export function resolveM22ModuleDir(startDir = __dirname) {
  const root = findRepoRoot(startDir);
  const rel = 'tests/fixtures/m22-red-prep';
  return {
    root,
    abs: path.join(root, rel),
    rel: rel.replace(/\\/g, '/'),
  };
}

export function resolveDualTree(startDir = __dirname) {
  const root = findRepoRoot(startDir);
  const moduleDir = resolveM22ModuleDir(startDir);

  const v14ChartRoot = path.join(root, 'chart v 1.4', 'chart');
  const homeChartRoot = path.join(root, 'homepage', 'public', 'chart');
  const v14Harness = path.join(v14ChartRoot, 'multichart-prod', 'harness');
  const homeHarness = path.join(homeChartRoot, 'multichart-prod', 'harness');

  const bind = (key, chartRoot, harnessRoot) => ({
    key,
    chartRoot,
    harnessRoot,
    chartJs: path.join(chartRoot, 'chart.js'),
    replaySystemJs: path.join(chartRoot, 'modules', 'replay-system.js'),
    panelCmdBridge: path.join(chartRoot, 'multichart-prod', 'panel-cmd-bridge.js'),
    syncBridge: path.join(chartRoot, 'multichart-prod', 'sync-bridge.js'),
    serveMjs: path.join(harnessRoot, 'serve.mjs'),
    harnessLibMjs: path.join(harnessRoot, 'harness-lib.mjs'),
    scenariosMjs: path.join(harnessRoot, 'scenarios.mjs'),
    relChartRoot: relPosix(root, chartRoot),
    relHarnessRoot: relPosix(root, harnessRoot),
  });

  return {
    root,
    moduleDir,
    trees: {
      v14: bind('v14', v14ChartRoot, v14Harness),
      homepage: bind('homepage', homeChartRoot, homeHarness),
    },
  };
}

export function hashBinding(root, absPath) {
  const rel = relPosix(root, absPath);
  return {
    rel,
    exists: fs.existsSync(absPath),
    sha256: fs.existsSync(absPath) ? hashFileSha256(absPath) : null,
  };
}

export function buildDependencyPinlock(startDir = __dirname) {
  const dual = resolveDualTree(startDir);
  const { root, moduleDir } = dual;
  const m22Artifacts = [
    'm22-hs78b-dual-tree-root.mjs',
    'm22-hs78b-play-pan-optout-contract.mjs',
    'm22-hs78b-play-pan-optout-oracle.mjs',
    'm22-hs78b-play-pan-optout-runner.mjs',
    'm22-hs78b-play-pan-optout.red.test.mjs',
    'm22-hs78b-play-pan-optout-evidence-io.mjs',
    'm22-hs78b-harness-shim.mjs',
  ].map((name) => hashBinding(root, path.join(moduleDir.abs, name)));

  const plan3Docs = [
    'docs/plan3/M22-H-S78B-PLAY-PAN-OPTOUT-RED-PREP-REPORT.md',
    'docs/plan3/M22-H-S78B-PLAY-PAN-OPTOUT-FUTURE-HUNK-MANIFEST.json',
    'docs/plan3/evidence/M22-H-S78B-PLAY-PAN-OPTOUT-RED.PRELIMINARY.json',
  ].map((rel) => hashBinding(root, path.join(root, rel)));

  const treeDeps = Object.values(dual.trees).flatMap((t) => [
    hashBinding(root, t.chartJs),
    hashBinding(root, t.replaySystemJs),
    hashBinding(root, t.panelCmdBridge),
    hashBinding(root, t.syncBridge),
    hashBinding(root, t.serveMjs),
    hashBinding(root, t.harnessLibMjs),
    hashBinding(root, t.scenariosMjs),
  ]);

  return {
    status: M22_HS78B_STATUS,
    pinnedAt: new Date().toISOString(),
    m22Artifacts,
    plan3Docs,
    treeDeps,
    chartJsParity: {
      v14: hashBinding(root, dual.trees.v14.chartJs),
      homepage: hashBinding(root, dual.trees.homepage.chartJs),
      byteIdentical: (() => {
        const a = dual.trees.v14.chartJs;
        const b = dual.trees.homepage.chartJs;
        if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
        return hashFileSha256(a) === hashFileSha256(b);
      })(),
    },
  };
}
