#!/usr/bin/env node
/** Confirm chart-embed fallback literal is at tip stamp in both trees + deploy-gate covers it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const TIP = '20260728b81';
const FALLBACK_RE = /window\.__TALARIA_CHART_BUILD_ID = p\.get\('v'\) \|\| '([^']+)'/;
const DEPLOY_DECLARED_RE =
  /__TALARIA_CHART_BUILD_ID\s*=\s*(?:p\.get\('v'\)\s*\|\|\s*)?'([^']+)'/;

const embedPaths = [
  'chart v 1.4/chart/multichart-prod/chart-embed.html',
  'homepage/public/chart/multichart-prod/chart-embed.html',
];

const rows = [];
for (const rel of embedPaths) {
  const body = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const fallback = FALLBACK_RE.exec(body)?.[1] || null;
  const declared = DEPLOY_DECLARED_RE.exec(body)?.[1] || null;
  rows.push({
    rel,
    fallback,
    deployGateDeclared: declared,
    atTip: fallback === TIP && declared === TIP,
    hasIndicatorPerf: /indicator-performance\.js/.test(body),
    hasModulePresence: /module-presence-runtime\.js/.test(body),
    d3FromCdn: /cdnjs\.cloudflare\.com/.test(body),
    engineScriptStamped: /\/chart\/chart\.js\?v=/.test(body),
  });
}

const bump = fs.readFileSync(
  path.join(REPO, 'chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs'),
  'utf8',
);
const probe = fs.readFileSync(
  path.join(REPO, 'docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs'),
  'utf8',
);
const defaultShellsMatch = /const DEFAULT_SHELLS = \[([\s\S]*?)\];/.exec(probe)?.[1] || '';
const embedInDefaultShells = defaultShellsMatch.includes('/chart/multichart-prod/chart-embed.html');
const engineCheckDefaultOnDeployGate = probe.includes(
  'if (out.engineBuildCheck === null) out.engineBuildCheck = out.deployGate;',
);
const bumpRewritesFallback =
  bump.includes('function bumpChartEmbedHtml') &&
  bump.includes('bumpChartEmbedHtml(distBuildId)') &&
  bump.includes('homepage/public/chart/multichart-prod/chart-embed.html') &&
  bump.includes('DEFAULT_BUILD_RE') &&
  /p\.get\('v'\) \|\| '\$\{buildId\}'/.test(bump);

const report = {
  tip: TIP,
  observedAt: new Date().toISOString(),
  closure: 'CLOSURE-PANEL-SHELL-HEALTHY-20260728-2205',
  embeds: rows,
  bump: {
    bumpChartEmbedHtmlDefined: bump.includes('function bumpChartEmbedHtml'),
    calledWithDistBuildId: bump.includes('bumpChartEmbedHtml(distBuildId)'),
    rewritesBothTrees: bump.includes('homepage/public/chart/multichart-prod/chart-embed.html'),
    patternMatchesFallbackLiteral: bumpRewritesFallback,
  },
  deployGate: {
    embedInDefaultShells,
    engineBuildCheckOnWithDeployGate: engineCheckDefaultOnDeployGate,
    declaredRegexExtractsFallback: rows.every((r) => r.deployGateDeclared === TIP),
  },
  pass:
    rows.every((r) => r.atTip) &&
    bumpRewritesFallback &&
    embedInDefaultShells &&
    engineCheckDefaultOnDeployGate,
};

report.verdict = report.pass
  ? 'PASS — both trees at b81; bump rewrites fallback; deploy-gate default shells include embed + engine↔shell'
  : 'FAIL — residual open';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'observations');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  `embed-fallback-bump-check-${report.observedAt.replace(/[:.]/g, '-')}.json`,
);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outFile, ...report }, null, 2));
process.exitCode = report.pass ? 0 : 2;
