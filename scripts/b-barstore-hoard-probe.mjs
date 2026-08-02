/**
 * Probe: what does the shared bar store retain, and what brings it down?
 *
 * Diagnostic for the PO's third release point. Lifts the real
 * `_createSharedBarStore()` body out of chart.js and drives it, so the numbers
 * below are the product's own policy rather than a reading of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART = path.resolve(__dirname, '../chart v 1.4/chart/chart.js');

const source = fs.readFileSync(CHART, 'utf8');
const header = '_createSharedBarStore() {';
const start = source.indexOf(header);
if (start < 0) {
  console.error('ANCHOR_BROKEN: _createSharedBarStore not found in chart.js');
  process.exit(2);
}
let depth = 0;
let end = -1;
for (let i = source.indexOf('{', start); i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  else if (source[i] === '}') {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
const body = source.slice(source.indexOf('{', start) + 1, end - 1);

const ctx = vm.createContext({ Map, Set, Array, Object, Number, String, Math, Date, JSON, Infinity });
const store = vm.runInContext(`(function(){${body}})()`, ctx);

const bars = (n, from = 0, step = 60000) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * step, o: 1, h: 2, l: 0, c: 1.5, v: 10 }));

const report = [];
const say = (label, value) => { report.push([label, value]); };

// 1. Does a second put replace the first, or union with it?
store.put('F1', '1m', bars(1000, 0));
const afterFirst = store.peek('F1')['1m'];
store.put('F1', '1m', bars(1000, 1000 * 60000));
const afterSecond = store.peek('F1')['1m'];
say('same file+tf, 1000 bars put twice (disjoint)', `${afterFirst} -> ${afterSecond} bars`);
say('  put() semantics', afterSecond > afterFirst ? 'UNION (accumulates)' : 'REPLACE');

// 2. Is the number of timeframes per file bounded?
const tfs = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '2d', '1w'];
for (const tf of tfs) store.put('F2', tf, bars(500));
const f2 = store.peek('F2');
say(`timeframes stored for one file after ${tfs.length} puts`, `${Object.keys(f2).length}`);
say('  per-file timeframe cap', Object.keys(f2).length >= tfs.length ? 'NONE — grows per tf visited' : 'capped');

// 3. Does eviction respect refcounts?
store.put('KEEP', '1m', bars(100));
store.retainFile('KEEP', 'owner-alive');
const before = !!store.peek('KEEP');
for (let i = 0; i < 14; i += 1) store.put(`FILL-${i}`, '1m', bars(10));
const after = !!store.peek('KEEP');
say('file explicitly retained by a live owner', before ? 'present before fill' : 'absent before fill');
say('  after pushing past the 12-file cap', after ? 'still present' : 'EVICTED despite a live ref');

// 4. What is the ceiling?
say('MAX_FILES', '12');
say('MAX_BARS_PER_TF', '200000');
say('  ceiling', '12 files x (uncapped tf count) x 200000 bars');

// 5. What brings it down?
store.releaseFile('F1', 'nobody');
say('releaseFile with an unknown owner on a never-retained file', store.peek('F1') ? 'retained' : 'DROPPED');

const w = Math.max(...report.map(([l]) => l.length));
for (const [l, v] of report) console.log(`  ${l.padEnd(w)}  ${v}`);
