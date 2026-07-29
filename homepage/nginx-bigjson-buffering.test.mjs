// Gate for the BIGJSON-NO-TEMP-FILE block in homepage/nginx.local.conf.
//
// This config is bind-mounted into the live canary, so a hand edit here changes
// production behaviour with no build and no review. The block it guards is easy
// to break in ways that look harmless:
//   - dropping proxy_pass from the nested location (nginx does not inherit it,
//     so the route silently stops proxying and serves static 404s);
//   - "simplifying" it to proxy_buffering off, which sounds like the same thing
//     but hands slow-client backpressure straight to the uvicorn workers;
//   - adding an add_header, which drops every inherited add_header including the
//     security headers;
//   - widening it over /tile/, which needs buffering for proxy_cache to work.
//
// Each of those has a cell below. Measurement behind the choice of directives:
// docs/plan3/evidence/B-M4/release/NGINX-BIGJSON-TEMP-FILE-20260729.md
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONF_PATH = path.resolve(__dirname, 'nginx.local.conf');
const BEGIN = 'TALARIA-BIGJSON-NO-TEMP-FILE BEGIN';
const END = 'TALARIA-BIGJSON-NO-TEMP-FILE END';

function readConf() {
  return fs.readFileSync(CONF_PATH, 'utf8');
}

/** The marked block, or throws. Callers get the block only, never the whole file. */
export function extractBlock(source) {
  const start = source.indexOf(BEGIN);
  assert.notEqual(start, -1, `missing ${BEGIN}`);
  const end = source.indexOf(END, start);
  assert.notEqual(end, -1, `missing ${END}`);
  return source.slice(start, end + END.length);
}

/** Byte offsets of the enclosing `location ^~ /api/file/` block. */
function fileApiLocation(source) {
  const start = source.indexOf('location ^~ /api/file/ {');
  assert.notEqual(start, -1, 'missing location ^~ /api/file/');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error('unbalanced braces in location ^~ /api/file/');
}

/** Comment lines out, so a rule that names a directive cannot satisfy or trip it. */
function directivesOnly(block) {
  return block.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

export function assertBigJsonBufferingContract(source = readConf()) {
  const block = directivesOnly(extractBlock(source));
  const loc = fileApiLocation(source);
  const blockStart = source.indexOf(BEGIN);

  // Nesting: outside the /api/file/ location the block would either not match or
  // would lose every inherited header, timeout and rate limit.
  assert.ok(blockStart > loc.start && blockStart < loc.end,
    'block must be nested inside location ^~ /api/file/');

  const routes = block.match(/location\s+~\s+\^\/api\/file\/\[0-9\]\+\/\(([^)]+)\)\$/);
  assert.ok(routes, 'block must scope itself to a route regex');
  const covered = routes[1].split('|');
  for (const route of ['smart', 'candles', 'bars', 'candles\\.msgpack']) {
    assert.ok(covered.includes(route), `route ${route} must be covered`);
  }
  assert.ok(!covered.some((r) => r.includes('tile')),
    'tiles must not be covered: proxy_cache needs buffering and temp files');

  assert.match(block, /proxy_pass\s+http:\/\/trading-chart:8000;/,
    'nested location must restate proxy_pass — nginx does not inherit it');
  assert.match(block, /proxy_max_temp_file_size\s+0;/,
    'temp files must be disabled: that is the whole point of the block');
  assert.match(block, /proxy_buffers\s+\d+\s+\d+k;/,
    'memory buffers must be sized so a normal candle response fits');

  assert.ok(!/proxy_buffering\s+off;/.test(block),
    'must not disable buffering: measured to give no first-byte win and it exposes '
    + 'the backend workers to slow clients');
  assert.ok(!/add_header/.test(block),
    'no add_header here: it would drop the inherited security headers');

  // The tile cache must survive untouched.
  const enclosing = source.slice(loc.start, loc.end);
  assert.match(enclosing, /proxy_cache\s+tiles;/, 'tile caching must remain');
  return true;
}

test('nginx.local.conf carries the big-JSON no-temp-file contract', () => {
  assert.equal(assertBigJsonBufferingContract(), true);
});

test('mutation: dropping proxy_pass from the nested location goes RED', () => {
  const mutated = readConf().replace(
    /(TALARIA-BIGJSON-NO-TEMP-FILE BEGIN[\s\S]*?)proxy_pass\s+http:\/\/trading-chart:8000;/,
    '$1',
  );
  assert.throws(() => assertBigJsonBufferingContract(mutated), /does not inherit/);
});

test('mutation: swapping the fix for proxy_buffering off goes RED', () => {
  const mutated = readConf().replace(
    /proxy_max_temp_file_size 0;/,
    'proxy_buffering off;',
  );
  assert.throws(() => assertBigJsonBufferingContract(mutated), /temp files must be disabled/);
});

test('mutation: adding an add_header inside the block goes RED', () => {
  const mutated = readConf().replace(
    /(proxy_max_temp_file_size 0;)/,
    '$1\n            add_header X-Talaria-Stream on;',
  );
  assert.throws(() => assertBigJsonBufferingContract(mutated), /security headers/);
});

test('mutation: widening the block over tiles goes RED', () => {
  const mutated = readConf().replace(
    /\(smart\|candles\|bars\|candles\\\.msgpack\)/,
    '(smart|candles|bars|tile)',
  );
  assert.throws(() => assertBigJsonBufferingContract(mutated), /candles\\\.msgpack|tiles must not/);
});

test('mutation: removing the tile cache goes RED', () => {
  const mutated = readConf().replace(/proxy_cache\s+tiles;/, '');
  assert.throws(() => assertBigJsonBufferingContract(mutated), /tile caching must remain/);
});

test('mutation: moving the block outside the /api/file/ location goes RED', () => {
  const source = readConf();
  const block = extractBlock(source);
  const mutated = `${source.replace(block, '')}\n# relocated\n${block}\n`;
  assert.throws(() => assertBigJsonBufferingContract(mutated), /must be nested inside/);
});
