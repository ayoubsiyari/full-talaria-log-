#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  ['chart-source', 'chart v 1.4/chart'],
  ['design-source', 'chart v 1.4/talaria-design'],
  ['homepage-public', 'homepage/public/chart'],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeSrc(src) {
  return src.replace(/[?&]v=[^&#"']+/g, '?v={BUILD}');
}

function scriptsFrom(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>/gi;
  for (const match of html.matchAll(re)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];
    if (src) scripts.push(src);
  }
  const dynamic = [
    ...html.matchAll(/(?:inject|__loadHostOnlyScript)\(\s*["']([^"']+\.js)["']\s*\)/g),
    ...html.matchAll(/["'](\/chart\/[^"']+\.js)["'][,\]]/g),
  ].map((match) => match[1]);
  return [...scripts, ...dynamic];
}

function buildStamps(html) {
  return [...new Set(html.match(/\d{8}b\d+/g) || [])].sort();
}

function isChartShell(rel, html) {
  return /(?:chart\.js|TALARIA_CHART_BUILD_ID|multichart|lightweight-charts|chartCanvas|Talaria Chart)/i.test(html)
    && !/(?:browser-preflight|lwc-proto-dryrun-client)/i.test(rel);
}

const records = [];
for (const [rootKind, relativeRoot] of roots) {
  const absoluteRoot = path.join(repo, relativeRoot);
  for (const file of walk(absoluteRoot).filter((candidate) => candidate.toLowerCase().endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(repo, file).replaceAll(path.sep, '/');
    if (!isChartShell(rel, html)) continue;
    const scripts = scriptsFrom(html);
    const normalizedOrder = scripts.map(normalizeSrc);
    records.push({
      rootKind,
      path: rel,
      url: rootKind === 'homepage-public'
        ? `/${path.relative(path.join(repo, 'homepage/public'), file).replaceAll(path.sep, '/')}`
        : rootKind === 'chart-source'
          ? `/chart/${path.relative(absoluteRoot, file).replaceAll(path.sep, '/')}`
          : null,
      bytes: Buffer.byteLength(html),
      fileSha256: sha256(html),
      buildStamps: buildStamps(html),
      scriptCount: scripts.length,
      loaderOrderSha256: sha256(normalizedOrder.join('\n')),
      loaderOrder: scripts,
    });
  }
}

records.sort((a, b) => a.path.localeCompare(b.path));
const output = {
  schema: 'talaria.chart-shell-audit.v1',
  generatedFrom: 'working-tree',
  note: 'Digest is diagnostic only; dynamic script discovery is intentionally conservative.',
  records,
};

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
if (outArg) {
  const out = path.resolve(repo, outArg.slice('--out='.length));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`wrote ${records.length} chart-shell records to ${path.relative(repo, out)}`);
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
