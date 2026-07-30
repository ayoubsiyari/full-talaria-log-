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

// ── Session-state request bodies ────────────────────────────────────────────
// The block above stops nginx spooling large RESPONSES. The other direction was still
// spooling: a live session state measured 636,776 bytes, against a default client body
// buffer of 8-16k, so every autosave of a working session wrote a temp file. Same disk,
// same 81% full, and far more frequent than the candle reads.

/** Byte offsets of the `location ^~ /api/sessions` block. */
function sessionsLocation(source) {
  const start = source.indexOf('location ^~ /api/sessions {');
  assert.notEqual(start, -1, 'missing location ^~ /api/sessions');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error('unbalanced braces in location ^~ /api/sessions');
}

const SS_BEGIN = 'TALARIA-SESSION-STATE-BODY-BUFFER BEGIN';
const SS_END = 'TALARIA-SESSION-STATE-BODY-BUFFER END';

export function assertSessionStateBodyBufferContract(source = readConf()) {
  const loc = sessionsLocation(source);
  const block = directivesOnly(source.slice(loc.start, loc.end));

  const m = block.match(/client_body_buffer_size\s+(\d+)([kmKM]?);/);
  assert.ok(m, 'location ^~ /api/sessions must size client_body_buffer_size: without it the '
    + 'default 8-16k spools every session-state write to disk');

  const unit = (m[2] || '').toLowerCase();
  const bytes = Number(m[1]) * (unit === 'm' ? 1024 * 1024 : unit === 'k' ? 1024 : 1);
  // The measured state was 636,776 bytes. A buffer at or below that spools the very write
  // this exists to keep in memory, so the gate holds the measurement, not the directive.
  assert.ok(bytes >= 636_776,
    `client_body_buffer_size must fit the measured 636,776-byte session state, got ${bytes}`);
  // Bounded on the other side too: this is per-request memory on a shared host.
  assert.ok(bytes <= 4 * 1024 * 1024,
    `client_body_buffer_size must stay bounded, got ${bytes}`);

  // The route must still be proxied and rate-limited: a body-buffer edit is an easy place
  // to lose one of those by accident.
  assert.match(block, /proxy_pass\s+http:\/\/trading-chart:8000;/,
    '/api/sessions must still proxy to the chart backend');
  assert.match(block, /limit_req\s+zone=/, '/api/sessions must keep its rate limits');

  // The markers ARE the kill-switch, so their absence is not cosmetic: without them the
  // switch script has nothing to strip and the landing has no rollback. Checked last so a
  // missing or mis-sized directive is reported as that, not as a marker problem.
  const begin = source.indexOf(SS_BEGIN);
  const end = source.indexOf(SS_END, begin === -1 ? 0 : begin);
  assert.notEqual(begin, -1, `missing ${SS_BEGIN} — the kill-switch has nothing to strip`);
  assert.notEqual(end, -1, `missing ${SS_END} — the kill-switch has nothing to strip`);
  assert.ok(begin > loc.start && end < loc.end,
    'the marked region must sit inside location ^~ /api/sessions');
  assert.ok(source.slice(begin, end).includes('client_body_buffer_size'),
    'client_body_buffer_size must sit INSIDE the marked region, or the switch cannot remove it');
  return true;
}

test('nginx.local.conf sizes the session-state request body buffer', () => {
  assert.equal(assertSessionStateBodyBufferContract(), true);
});

test('mutation: removing client_body_buffer_size goes RED', () => {
  const mutated = readConf().replace(/\n\s*client_body_buffer_size\s+1m;/, '');
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /must size client_body_buffer_size/);
});

test('mutation: a buffer too small for the measured state goes RED', () => {
  const mutated = readConf().replace(/client_body_buffer_size\s+1m;/, 'client_body_buffer_size 16k;');
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /must fit the measured/);
});

test('mutation: an unbounded buffer goes RED', () => {
  const mutated = readConf().replace(/client_body_buffer_size\s+1m;/, 'client_body_buffer_size 64m;');
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /must stay bounded/);
});

test('mutation: losing the rate limit on /api/sessions goes RED', () => {
  const source = readConf();
  const loc = sessionsLocation(source);
  const block = source.slice(loc.start, loc.end);
  const mutated = source.replace(block, block.replace(/\n\s*limit_req\s+zone=[^\n]*/g, ''));
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /must keep its rate limits/);
});

test('mutation: dropping the kill-switch markers goes RED', () => {
  const mutated = readConf().replace(`# ${SS_BEGIN}`, '# (markers removed)');
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /nothing to strip/);
});

test('mutation: moving the directive outside the marked region goes RED', () => {
  // Directive still present and correctly sized, but the switch could no longer remove it —
  // a rollback that silently does nothing is worse than no switch at all.
  const source = readConf();
  const mutated = source
    .replace(/\n\s*client_body_buffer_size 1m;/, '')
    .replace(`        # ${SS_END}`, `        # ${SS_END}\n        client_body_buffer_size 1m;`);
  assert.throws(() => assertSessionStateBodyBufferContract(mutated), /INSIDE the marked region/);
});
