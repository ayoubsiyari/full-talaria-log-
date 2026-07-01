#!/usr/bin/env node
/**
 * Bump CHART_ENGINE_BUILD in chart.js and patch version in package.json.
 * Usage: npm run version:bump
 * Override: BUILD_ID=20260629b2 npm run version:bump
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHART_JS = path.join(ROOT, 'chart.js');
const PKG_JSON = path.join(ROOT, 'package.json');

const BUILD_RE = /const CHART_ENGINE_BUILD = '([^']+)';/;

function defaultBuildId() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${ymd}b1`;
}

function incrementBuildId(id) {
    const m = /^(\d{8})([ab])(\d+)$/i.exec(String(id || '').trim());
    if (m) return `${m[1]}${m[2]}${parseInt(m[3], 10) + 1}`;
    return `${defaultBuildId()}2`;
}

function bumpPatchVersion(version) {
    const parts = String(version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    parts[2] += 1;
    return parts.join('.');
}

function main() {
    if (!fs.existsSync(CHART_JS)) {
        console.error('[bump-chart-engine-build] Missing chart.js');
        process.exit(1);
    }

    const before = fs.readFileSync(CHART_JS, 'utf8');
    const match = before.match(BUILD_RE);
    if (!match) {
        console.error('[bump-chart-engine-build] CHART_ENGINE_BUILD not found in chart.js');
        process.exit(1);
    }

    const nextBuild = process.env.BUILD_ID?.trim() || incrementBuildId(match[1]);
    const after = before.replace(BUILD_RE, `const CHART_ENGINE_BUILD = '${nextBuild}';`);
    fs.writeFileSync(CHART_JS, after, 'utf8');
    console.log('[bump-chart-engine-build] CHART_ENGINE_BUILD:', match[1], '→', nextBuild);

    if (fs.existsSync(PKG_JSON)) {
        const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
        const prev = pkg.version || '0.0.0';
        pkg.version = bumpPatchVersion(prev);
        fs.writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
        console.log('[bump-chart-engine-build] package.json version:', prev, '→', pkg.version);
    }
}

main();
