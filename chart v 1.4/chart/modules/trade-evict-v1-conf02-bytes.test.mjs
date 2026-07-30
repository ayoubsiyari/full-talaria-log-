/**
 * TRADE-EVICT-V1 — EVICT-01 byte cell at CONF-02 scale.
 *
 * Supersedes the one-trade / 8 KB synthetic figure (98,306 → 0).
 *
 * Payload sizing:
 *  - Screenshots: median live Talaria-Chart capture (n=22 product exports),
 *    because C's CONF-02 harness measured 0 screenshot chars via submitOrder
 *    (FINDING-C-CONF02 …-1730 — unmeasurable, not zero product cost).
 *  - Excursion: C's live ~318 samples/closed trade (CI[206,430]).
 *  - Count: CONF-02 ≥30 closed positions.
 *
 * GREEN: node trade-evict-v1-conf02-bytes.test.mjs
 * Artifact: docs/plan3/TRADE-EVICT-V1-CONF02-BYTES-20260730.json
 *
 * Harness GREEN only — C grades on the wire (DECL-01).
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const __dirname = dirname(fileURLToPath(import.meta.url));
// modules/ → chart/ → chart v 1.4/ → repo root
const root = resolve(__dirname, '../../..');

const SEED_PATHS = [
  resolve(root, 'docs/plan3/fixtures/TRADE-EVICT-V1-CONF02-SCREENSHOT-SEED.json'),
  resolve(root, 'docs/plan3/TRADE-EVICT-V1-CONF02-SCREENSHOT-SEED.json'),
];

function loadSeed() {
  for (const p of SEED_PATHS) {
    if (existsSync(p)) return { seed: JSON.parse(readFileSync(p, 'utf8')), path: p };
  }
  throw new Error('CONF-02 screenshot seed missing');
}

function makeDataUrl(chars) {
  const prefix = 'data:image/jpeg;base64,';
  if (chars <= prefix.length) return 'data:image/jpeg;base64,A';
  return prefix + 'A'.repeat(chars - prefix.length);
}

function distributeExcursionSamples(total) {
  // C: ~318 samples/trade across in-trade + post-exit series (four M19-B arrays × tails).
  const per = Math.max(1, Math.floor(total / 6));
  const mk = (n) => Array.from({ length: n }, (_, i) => i * 0.01);
  return {
    bar_close_r: mk(per),
    bar_high_r: mk(per),
    bar_low_r: mk(per),
    post_exit_bar_close_r: mk(per),
    post_exit_bar_high_r: mk(per),
    post_exit_bar_low_r: mk(Math.max(1, total - per * 5)),
  };
}

function fatClosed(id, shot, excursion) {
  return {
    id,
    tradeId: id,
    ticker: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'][id % 4],
    type: id % 2 ? 'BUY' : 'SELL',
    status: 'CLOSED',
    openTime: 1_000_000 + id * 60_000,
    closeTime: 1_100_000 + id * 60_000,
    openPrice: 1.1,
    closePrice: 1.105,
    quantity: 0.1,
    pnl: 10,
    mfe: 1.107,
    mae: 1.098,
    entryScreenshot: shot,
    exitScreenshot: shot,
    entryScreenshots: [{ screenshot: shot }],
    railScreenshots: [shot],
    ...excursion,
    post_checkpoints: [{ bar: 50, t: 1_200_000 + id }],
    trail_sl_path: [1.1, 1.101, 1.102],
    postExitTrackingMode: 'candles',
    postExitTrackingCandles: 50,
    post_exit_anchor_time: 1_100_000 + id * 60_000,
    mfeMaeTrackingEndTime: 1_200_000 + id * 60_000,
  };
}

const { seed, path: seedPath } = loadSeed();
const CLOSED = Number(seed.conf02?.closedPositions || 30);
const SAMPLE_N = Number(seed.cCensus?.excursionSamplesPerClosedTrade || 318);
const SHOT_CHARS = Number(seed.productScreenshotSeed?.dataUrlChars || 265167);
assert.ok(CLOSED >= 30, 'CONF-02 requires ≥30 closed positions');
assert.ok(SHOT_CHARS > 50_000, 'screenshot seed must be product-sized, not the 8 KB synthetic');

const shot = makeDataUrl(SHOT_CHARS);
assert.equal(shot.length, SHOT_CHARS, 'seed data-URL length must match census char count');
const excursion = distributeExcursionSamples(SAMPLE_N);

global.window = {};
const om = Object.create(OrderManager.prototype);
om.tradeJournal = [];
om.closedPositions = [];
om.mfeMaeTrackingPositions = [];
om.postExitTrackingMode = 'candles';
om.postExitTrackingCandles = 50;
om.persistJournal = () => {};
om.updateJournalTab = () => {};
om.drawMfeMaeMarkers = () => {};
om.showNotification = () => {};
om._finalizeExcursionScalars = () => {};
om._m19MaxExcursionR = () => 0;

let bytesBefore = 0;
for (let i = 1; i <= CLOSED; i += 1) {
  const closed = fatClosed(i, shot, excursion);
  const journal = {
    ...closed,
    tradeId: i,
    entryScreenshot: shot,
    exitScreenshot: shot,
    entryScreenshots: [{ screenshot: shot }],
    railScreenshots: [shot],
    bar_close_r: closed.bar_close_r.slice(),
    bar_high_r: closed.bar_high_r.slice(),
    bar_low_r: closed.bar_low_r.slice(),
    post_exit_bar_close_r: closed.post_exit_bar_close_r.slice(),
    post_exit_bar_high_r: closed.post_exit_bar_high_r.slice(),
    post_exit_bar_low_r: closed.post_exit_bar_low_r.slice(),
  };
  om.closedPositions.push(closed);
  om.tradeJournal.push(journal);
  bytesBefore += om._tradeEvictV1ApproxHotBytes(closed);
}

const perTradeBefore = Math.round(bytesBefore / CLOSED);
let bytesAfter = 0;
let released = 0;
const boundT = 2_000_000;
for (const closed of om.closedPositions) {
  const r = om._tradeEvictV1OnBoundComplete(closed, boundT);
  if (r.released) released += 1;
  bytesAfter += om._tradeEvictV1ApproxHotBytes(closed);
}

assert.equal(released, CLOSED, 'every CONF-02 closed position must release');
assert.ok(bytesAfter < bytesBefore, 'EVICT-01: retained hot bytes must fall');
assert.ok(bytesBefore > 1_000_000, 'CONF-02 scale must exceed the superseded 98,306 figure by orders of magnitude');

// Cold retrieval still intact on journal (step-1 half of EVICT-01).
assert.ok(om.tradeJournal.every((j) => typeof j.entryScreenshot === 'string' && j.entryScreenshot.length > 1000));
assert.ok(om.tradeJournal.every((j) => Array.isArray(j.bar_close_r) && j.bar_close_r.length > 0));

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const out = {
  schema: 'talaria.trade-evict-v1.conf02-bytes.v1',
  tip,
  supersedes: {
    figure: '98306 → 0',
    why: 'one trade × 8 KB synthetic screenshot × thin excursion — understated CONF-02 product cost',
  },
  grading: 'harness-GREEN-only',
  wireGradeOwner: 'C',
  note: 'DECL-01: not wire-proven. C grades TRADE-EVICT-V1 on the running page under CONF-01/CONF-02.',
  seedPath: seedPath.replace(/\\/g, '/'),
  conf02: {
    closedPositions: CLOSED,
    excursionSamplesPerTradeFromC: SAMPLE_N,
    screenshotDataUrlChars: SHOT_CHARS,
    screenshotFieldsPerPosition: seed.conf02?.fieldsPerPosition || [],
  },
  bytes: {
    before: bytesBefore,
    after: bytesAfter,
    delta: bytesBefore - bytesAfter,
    perClosedTradeBefore: perTradeBefore,
    perClosedTradeAfter: Math.round(bytesAfter / CLOSED),
  },
  method: '_tradeEvictV1ApproxHotBytes (UTF-16 char×2 for strings; JSON×2 for arrays)',
};

const outPath = resolve(root, 'docs/plan3/TRADE-EVICT-V1-CONF02-BYTES-20260730.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));

const mdPath = resolve(root, 'docs/plan3/TRADE-EVICT-V1-CONF02-BYTES-20260730.md');
writeFileSync(mdPath, `# TRADE-EVICT-V1 — CONF-02 EVICT-01 byte cell

**Supersedes:** \`98,306 → 0\` (one-trade / 8 KB synthetic fixture).  
**Tip:** \`${tip}\`  
**Grading:** harness GREEN only — **C grades on the wire** (\`DECL-01\`).

## Figure

| | Bytes |
|---|---:|
| Before eviction (${CLOSED} closed) | **${bytesBefore.toLocaleString('en-US')}** |
| After eviction | **${bytesAfter.toLocaleString('en-US')}** |
| Delta | **${(bytesBefore - bytesAfter).toLocaleString('en-US')}** |
| Per closed trade (before) | **${perTradeBefore.toLocaleString('en-US')}** |

## Payload provenance

| Input | Source |
|---|---|
| Closed count | CONF-02 ≥30 |
| Excursion samples/trade | C live census **${SAMPLE_N}** (FINDING-C-CONF02 …-1730) |
| Screenshot field size | Median product \`Talaria-Chart-*\` capture → **${SHOT_CHARS.toLocaleString('en-US')}** data-URL chars (C harness measured 0 via submitOrder — unmeasurable, not zero) |
| Fields/position | entryScreenshot, exitScreenshot, entryScreenshots[0], railScreenshots[0] |

## Not claimed

This is not a wire duration grade. REALM-TEARDOWN-RELEASE passed its harness and was inert in product; the same rule applies here until C measures the running page.
`);

console.log(JSON.stringify({
  ok: true,
  before: bytesBefore,
  after: bytesAfter,
  delta: bytesBefore - bytesAfter,
  perTradeBefore,
  closed: CLOSED,
  outPath,
  mdPath,
}, null, 2));
console.log(`GREEN — CONF-02 EVICT-01 bytes ${bytesBefore} → ${bytesAfter} (supersedes 98306)`);
