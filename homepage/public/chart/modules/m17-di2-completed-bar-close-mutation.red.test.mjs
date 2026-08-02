/**
 * M17-DI2 / TAL-01918: completed replay bars must not be mutated by current-price reads.
 *
 * RED today:
 *   node --test "chart v 1.4/chart/modules/m17-di2-completed-bar-close-mutation.red.test.mjs"
 *
 * The defect path is in chart.js resolveEffectiveCurrentPrice(): an embed panel reads
 * the host canonical replay mark and writes it into this.data[last].c/h/l. That method
 * is a price-label/current-price read path, so it must not mutate completed bars.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const chartJsPath = path.resolve(moduleDir, '../chart.js');
const source = fs.readFileSync(chartJsPath, 'utf8');

function methodBody(name) {
  const match = new RegExp(`\\n\\s*${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} method declaration must exist`);
  const start = match.index;
  const brace = source.indexOf('{', start);
  assert.notEqual(brace, -1, `${name} opening brace must exist`);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  throw new Error(`${name} body not closed`);
}

function mutationWrites(body) {
  return [
    /\blast\.c\s*=/,
    /\blast\.h\s*=/,
    /\blast\.l\s*=/,
    /\bthis\.data\s*\[[^\]]+\]\s*=/,
  ].filter((rx) => rx.test(body)).map(String);
}

test('resolveEffectiveCurrentPrice is read-only with respect to chart data bars', () => {
  const body = methodBody('resolveEffectiveCurrentPrice');
  assert.deepEqual(
    mutationWrites(body),
    [],
    'current-price / price-label reads must not write last.c/h/l or replace this.data slots',
  );
});

test('canonical replay mark application does not patch completed chart.data bars', () => {
  const body = fs.readFileSync(path.resolve(moduleDir, 'replay-system.js'), 'utf8');
  const start = body.indexOf('_applyCanonicalReplayMarkFromDetail(detail)');
  assert.notEqual(start, -1, '_applyCanonicalReplayMarkFromDetail must exist');
  const slice = body.slice(start, body.indexOf('_buildMultichartReplayFrameDetail', start));
  assert.deepEqual(
    mutationWrites(slice),
    [],
    'canonical replay mark sync must not mutate completed chart.data OHLC',
  );
});
