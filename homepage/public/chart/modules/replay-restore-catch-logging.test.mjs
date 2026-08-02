import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const chartPath = path.join(repoRoot, 'chart v 1.4/chart/chart.js');
const homePath = path.join(repoRoot, 'homepage/public/chart/chart.js');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function methodSource(text, name) {
    const marker = `    ${name}(`;
    const start = text.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist`);
    const sigEnd = text.indexOf(') {', start);
    assert.notEqual(sigEnd, -1, `${name} must have a method body`);
    const brace = sigEnd + 2;
    let depth = 0;
    for (let i = brace; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    throw new Error(`${name} body did not close`);
}

test('replay restore catch logging: chart mirrors stay byte-identical', () => {
    assert.equal(read(homePath), read(chartPath));
});

test('replay restore catch logging: restore path logs sync/update failures once with counts', () => {
    const text = read(chartPath);
    const helper = methodSource(text, '_logReplayRestoreCatchOnce');
    assert.match(helper, /_replayRestoreCatchCounts/, 'helper must track per-instance counts');
    assert.match(helper, /__talariaReplayRestoreCatchCounts/, 'helper must expose soak-readable counts');
    assert.match(helper, /count !== 1/, 'helper must log once per site');
    assert.match(helper, /console\.warn\('\[replay-restore\] caught replay restore failure'/,
        'helper must surface the formerly silent fault');

    const mirror = methodSource(text, '_multichartMirrorHostTfSwitchIfReady');
    assert.doesNotMatch(mirror,
        /syncCurrentIndexFromReplayTimestamp\(replay\.replayTimestamp\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\/\* ignore \*\/\s*\}/,
        'syncCurrentIndexFromReplayTimestamp must not be silently swallowed');
    assert.doesNotMatch(mirror,
        /updateChartData\(false\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\/\* ignore \*\/\s*\}/,
        'updateChartData must not be silently swallowed');
    assert.match(mirror, /_logReplayRestoreCatchOnce\('syncCurrentIndexFromReplayTimestamp'/,
        'sync failure must route through log-once helper');
    assert.match(mirror, /_logReplayRestoreCatchOnce\('updateChartData'/,
        'update failure must route through log-once helper');
});
