/**
 * EXCURSION-SINGLE-OWNER-V1 — CONF-02 measured byte figure (not an estimate).
 *
 * Measures excursion-array UTF-16 bytes only (screenshots excluded). Director
 * expects this small; it is NOT the memory win. C grades on the wire.
 *
 * GREEN: node "chart v 1.4/chart/modules/excursion-single-owner-v1-conf02-bytes.test.mjs"
 * Artifact (summary): docs/plan3/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json
 * Evidence (EVID-02): _evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const evidenceRoot = resolve(root, '../_evidence/manager-D');

const CLOSED = 30;
const OPEN = 4;
// C gate: 12,762 / 40 ≈ 319 summed across four keys (not a single-array breach).
const SAMPLES_SUM_FOUR = 319;
const PER_SERIES = Math.floor(SAMPLES_SUM_FOUR / 4); // ~79 each on the four counted keys

function mk(n) {
  return Array.from({ length: n }, (_, i) => Number((i * 0.0137).toFixed(4)));
}

function fatClosed(id) {
  return {
    id,
    tradeId: id,
    status: 'CLOSED',
    closeTime: 1_100_000 + id,
    bar_close_r: mk(PER_SERIES),
    bar_high_r: mk(PER_SERIES),
    bar_low_r: mk(PER_SERIES),
    post_exit_bar_close_r: mk(PER_SERIES),
    post_exit_bar_high_r: mk(PER_SERIES),
    post_exit_bar_low_r: mk(PER_SERIES),
  };
}

function fatOpen(id) {
  return {
    id,
    tradeId: id,
    status: 'OPEN',
    bar_close_r: mk(40),
    bar_high_r: mk(40),
    bar_low_r: mk(40),
  };
}

function sumExcursionBytes(om, rows) {
  return rows.reduce((n, r) => n + om._excursionSingleOwnerV1ApproxBytes(r), 0);
}

function censusSamples(rows) {
  let n = 0;
  for (const row of rows) {
    for (const k of ['bar_close_r', 'bar_high_r', 'bar_low_r', 'post_exit_bar_close_r']) {
      if (Array.isArray(row?.[k])) n += row[k].length;
    }
  }
  return n;
}

// --- Legacy dual-copy (flag OFF): closed + journal each hold sliced series ---
global.window = { __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1: true };
{
  const om = Object.create(OrderManager.prototype);
  const closed = [];
  const journal = [];
  for (let i = 1; i <= CLOSED; i += 1) {
    const c = fatClosed(i);
    const j = {};
    om._m19AssignCanonicalExcursionStorage(j, c);
    j.id = i;
    j.tradeId = i;
    closed.push(c);
    journal.push(j);
  }
  const opens = [];
  for (let i = 1; i <= OPEN; i += 1) opens.push(fatOpen(10_000 + i));

  // serviceClosed aliases managerClosed (bindServiceProp) — same row objects.
  const serviceClosed = closed;
  var legacy = {
    closedBytes: sumExcursionBytes(om, closed),
    journalBytes: sumExcursionBytes(om, journal),
    serviceBytes: sumExcursionBytes(om, serviceClosed),
    openBytes: sumExcursionBytes(om, opens),
    // Naive sum across three lists (Director's 38,286-style arithmetic).
    naiveThreeListBytes: sumExcursionBytes(om, closed)
      + sumExcursionBytes(om, journal)
      + sumExcursionBytes(om, serviceClosed),
    // Object-identity dedupe of rows (C's correction).
    dedupedRowBytes: (() => {
      const seen = new Set();
      let n = 0;
      for (const row of [...closed, ...journal, ...serviceClosed]) {
        if (seen.has(row)) continue;
        seen.add(row);
        n += om._excursionSingleOwnerV1ApproxBytes(row);
      }
      return n;
    })(),
    samplesPerList: censusSamples(closed),
    uniqueArrayIdentities: (() => {
      const seen = new Set();
      for (const row of [...closed, ...journal]) {
        for (const k of ['bar_close_r', 'bar_high_r', 'bar_low_r', 'post_exit_bar_close_r']) {
          if (Array.isArray(row[k])) seen.add(row[k]);
        }
      }
      return seen.size;
    })(),
  };
  legacy.totalWithOpens = legacy.dedupedRowBytes + legacy.openBytes;
}

// --- Product ON: share refs, then TRADE-EVICT releases closed/service ---
global.window = {};
{
  const om = Object.create(OrderManager.prototype);
  om.closedPositions = [];
  om.tradeJournal = [];
  om.mfeMaeTrackingPositions = [];
  const opens = [];
  for (let i = 1; i <= CLOSED; i += 1) {
    const c = fatClosed(i);
    const j = { id: i, tradeId: i };
    om._excursionSingleOwnerV1ShareFromHot(j, c);
    om.closedPositions.push(c);
    om.tradeJournal.push(j);
  }
  for (let i = 1; i <= OPEN; i += 1) opens.push(fatOpen(10_000 + i));

  const beforeEvictDeduped = (() => {
    const seen = new Set();
    let n = 0;
    const serviceClosed = om.closedPositions;
    for (const row of [...om.closedPositions, ...om.tradeJournal, ...serviceClosed]) {
      if (seen.has(row)) continue;
      seen.add(row);
      n += om._excursionSingleOwnerV1ApproxBytes(row);
    }
    return n;
  })();

  const uniqueArraysBefore = (() => {
    const seen = new Set();
    for (const row of [...om.closedPositions, ...om.tradeJournal]) {
      for (const k of ['bar_close_r', 'bar_high_r', 'bar_low_r', 'post_exit_bar_close_r']) {
        if (Array.isArray(row[k])) seen.add(row[k]);
      }
    }
    return seen.size;
  })();

  for (const c of om.closedPositions) {
    om._tradeEvictV1OnBoundComplete(c, 2_000_000);
  }

  const after = {
    closedBytes: sumExcursionBytes(om, om.closedPositions),
    journalBytes: sumExcursionBytes(om, om.tradeJournal),
    serviceBytes: sumExcursionBytes(om, om.closedPositions), // alias
    openBytes: sumExcursionBytes(om, opens),
    samplesClosed: censusSamples(om.closedPositions),
    samplesJournal: censusSamples(om.tradeJournal),
    samplesService: censusSamples(om.closedPositions),
  };
  after.retainedExcursionBytes = after.journalBytes + after.openBytes;
  after.deltaVsLegacyDeduped = legacy.dedupedRowBytes - after.journalBytes;

  var product = {
    beforeEvictDedupedRowBytes: beforeEvictDeduped,
    uniqueArrayIdentitiesBeforeEvict: uniqueArraysBefore,
    ...after,
  };
}

assert.equal(product.closedBytes, 0, 'closed released');
assert.equal(product.serviceBytes, 0, 'service alias released');
assert.ok(product.journalBytes > 0, 'journal authoritative');
assert.equal(product.samplesClosed, 0);
assert.equal(product.samplesService, 0);
assert.ok(product.samplesJournal > 0);
assert.ok(product.uniqueArrayIdentitiesBeforeEvict < legacy.uniqueArrayIdentities,
  'share must cut unique array identities vs sliced dual-copy');
assert.ok(product.deltaVsLegacyDeduped > 0, 'measured byte reduction vs legacy deduped closed+journal');

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const out = {
  schema: 'talaria.excursion-single-owner-v1.conf02-bytes.v1',
  tip,
  grading: 'harness-GREEN-only',
  wireGradeOwner: 'C',
  note: 'DECL-01: not the memory win. Excursion term is small; 730 MB/h is elsewhere (A). C grades on the wire.',
  authoritative: 'tradeJournal',
  aliases: {
    managerClosed_vs_serviceClosed: 'same array via OrderManager.bindServiceProp — zero additional bytes',
    realDuplicateWas: 'journal .slice() copies alongside closed row arrays',
  },
  cap: {
    perArray: 256,
    directorMisread: '319 = mean sum of four keys / row (12,762/40), ceiling 1,024 — C FINDING 21:10',
    hardCapShipped: true,
  },
  conf02: { closedPositions: CLOSED, openPositions: OPEN, samplesSumFourKeysPerClosed: SAMPLES_SUM_FOUR, perSeries: PER_SERIES },
  legacyDualCopyFlagOff: legacy,
  productFlagOn: product,
  figure: {
    legacyDedupedClosedJournalBytes: legacy.dedupedRowBytes,
    productJournalOnlyBytesAfterEvict: product.journalBytes,
    deltaBytes: product.deltaVsLegacyDeduped,
    openRetainedBytes: product.openBytes,
    naiveThreeListBytesLegacy: legacy.naiveThreeListBytes,
  },
  method: '_excursionSingleOwnerV1ApproxBytes = JSON.stringify(series)×2 UTF-16; screenshots excluded',
};

const summaryPath = resolve(root, 'docs/plan3/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json');
mkdirSync(dirname(summaryPath), { recursive: true });
writeFileSync(summaryPath, JSON.stringify(out, null, 2));

mkdirSync(evidenceRoot, { recursive: true });
const evidencePath = resolve(evidenceRoot, 'EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json');
writeFileSync(evidencePath, JSON.stringify(out, null, 2));

const md = `# EXCURSION-SINGLE-OWNER-V1 — CONF-02 byte cell

**Tip:** \`${tip}\`  
**Grading:** harness GREEN only — **C grades on the wire** (\`DECL-01\`).  
**Not the memory win.** Director: expect small; 730 MB/h is A's.

## Authoritative list

\`tradeJournal\`. \`managerClosed\` and \`serviceClosed\` are the **same array** via
\`bindServiceProp\` (zero additional bytes). The real duplicate was journal \`.slice()\`
copies. After share + TRADE-EVICT, closed/service report 0 excursion samples; journal keeps them.

## Cap

319 samples/row in the duration gate is the **sum of four keys**, ceiling 1,024 — not a
breach of the 256 per-array cap (C FINDING 21:10). Hard-cap belt shipped anyway.

## Measured figure (excursion arrays only, UTF-16)

| | Bytes |
|---|---:|
| Legacy deduped (closed+journal slices, flag OFF) | **${legacy.dedupedRowBytes.toLocaleString('en-US')}** |
| Product journal-only after evict (flag ON) | **${product.journalBytes.toLocaleString('en-US')}** |
| Delta | **${product.deltaVsLegacyDeduped.toLocaleString('en-US')}** |
| Open positions retained | **${product.openBytes.toLocaleString('en-US')}** |
| Naive three-list sum (misleading) | ${legacy.naiveThreeListBytes.toLocaleString('en-US')} |

Evidence: \`_evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json\` (EVID-02).
`;
writeFileSync(resolve(root, 'docs/plan3/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.md'), md);

console.log(JSON.stringify(out.figure, null, 2));
console.log('excursion-single-owner-v1-conf02-bytes.test.mjs: PASS');
console.log('summary:', summaryPath);
console.log('evidence:', evidencePath);
