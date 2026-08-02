/**
 * Self-test for the HOARD-CENSUS walker and diff, run against a synthetic object graph in node.
 *
 * The walker is the whole instrument: if it silently fails to reach a collection, the census reports a
 * clean bill of health for a hoarding build, which is the most expensive wrong answer available here. The
 * traps it is checked against are the ones that would actually bite in the product — a 40,000-element bar
 * array that must be recorded by length and never element-walked, a reference cycle, a timestamp-keyed Map
 * that must be classified as such, and a depth-limited graph.
 */

process.argv.push('--noRun');
const { WALK, diffMoments } = await import('./hoard-census.mjs');

let pass = 0; let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

const bar = (t) => ({ t, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });

function buildFakeWindow() {
  const tsMap = new Map();
  for (let i = 0; i < 5000; i++) tsMap.set(1754000000000 + i * 60000, bar(1754000000000 + i * 60000));

  const fifo = {};
  for (let i = 0; i < 512; i++) fifo[String(1754000000000 + i * 60000)] = [1, 2, 3];

  const bigBars = new Array(40000);
  for (let i = 0; i < 40000; i++) bigBars[i] = bar(i);

  const w = {
    chart: {
      currentTimeframe: '1m',
      rawData: bigBars,
      dataPipeline: { _resampleCache: { result: bigBars.slice(0, 4000) } },
      replaySystem: {
        isPlaying: true,
        currentIndex: 3999,
        fullRawData: bigBars.slice(0, 3800),
        _derivedByBarSeen: tsMap,
        tickPathCache: fifo,
      },
    },
    frames: { length: 0 },
  };
  w.chart.replaySystem.chart = w.chart; // cycle
  w.window = w;
  return w;
}

globalThis.window = buildFakeWindow();

console.log('HOARD-CENSUS walker self-test\n');

const res = WALK({ minEntries: 64, nodeCap: 120000, depthCap: 10, timeBudgetMs: 10000 });
const host = res.realms.find((r) => r.realm === 'host');
const byPath = new Map((host.collections || []).map((c) => [c.path, c]));

check('walk completed without truncation', !res.anyTruncated, `truncated=${res.anyTruncated}`);
check('cycle did not hang the walk', host.visited > 0 && host.visited < 500, `visited=${host.visited}`);

const ts = [...byPath.values()].find((c) => c.kind === 'Map' && c.entries === 5000);
check('timestamp-keyed Map found', !!ts, JSON.stringify([...byPath.keys()].slice(0, 8)));
check('Map classified as timestampMs', !!ts && ts.keyKinds.includes('timestampMs'), ts ? JSON.stringify(ts.keyKinds) : 'n/a');
check('Map values recognised as bar-like', !!ts && ts.valueIsBarLike === true, ts ? String(ts.valueIsBarLike) : 'n/a');
check('retainer path reported for the Map', !!ts && ts.path.includes('replaySystem') && ts.path.includes('_derivedByBarSeen'), ts ? ts.path : 'n/a');

const big = [...byPath.values()].find((c) => c.entries === 40000);
check('40k bar array recorded by length', !!big, 'not found');
check('40k bar array NOT element-walked', host.visited < 500, `visited=${host.visited}`);

const fifoRec = [...byPath.values()].find((c) => c.entries === 512);
check('512-entry keyed object recorded as a collection', !!fifoRec, 'not found');
check('keyed object not key-walked', host.visited < 500, `visited=${host.visited}`);

check('context carries resident and playhead',
  host.context.residentBars === 3800 && host.context.playheadIndex === 3999,
  JSON.stringify(host.context));

// REGRESSION, learned the expensive way on run 1: a throwing accessor aborted an entire realm and the
// census reported four empty realms as a clean walk. One hostile node must cost one node, not the realm.
{
  const hostile = buildFakeWindow();
  Object.defineProperty(hostile, 'landmine', { enumerable: true, get() { throw new TypeError('.for is not iterable'); } });
  hostile.proxied = new Proxy({}, { get() { throw new TypeError('trap'); }, ownKeys() { throw new TypeError('trap'); } });
  globalThis.window = hostile;
  let threw = null; let out = null;
  try { out = WALK({ minEntries: 64, nodeCap: 120000, depthCap: 10, timeBudgetMs: 10000 }); } catch (e) { threw = e; }
  const h = out && out.realms.find((r) => r.realm === 'host');
  check('hostile accessor does not throw out of the walk', threw === null, String(threw));
  check('hostile realm still produces a census', !!h && Array.isArray(h.collections), JSON.stringify(h).slice(0, 120));
  check('hostile realm still finds the timestamp Map',
    !!h && h.collections.some((c) => c.kind === 'Map' && c.entries === 5000),
    h ? JSON.stringify(h.collections.map((c) => c.entries)) : 'n/a');
  globalThis.window = buildFakeWindow();
}

// The walk must actually be bounded by its caps, not merely finish quickly on a small graph.
const capped = WALK({ minEntries: 64, nodeCap: 3, depthCap: 10, timeBudgetMs: 10000 });
check('nodeCap truncates and SAYS SO', capped.anyTruncated === true, `truncated=${capped.anyTruncated}`);

// Diff semantics: HELD is the finding, GONE is the healthy case.
const A = { realms: [{ realm: 'host', collections: [{ path: 'a', kind: 'Map', entries: 100, keyKinds: ['timestampMs'], valueIsBarLike: true }, { path: 'b', kind: 'Array', entries: 200, keyKinds: ['index'], valueIsBarLike: false }] }] };
const B = { realms: [{ realm: 'host', collections: [{ path: 'a', kind: 'Map', entries: 100, keyKinds: ['timestampMs'], valueIsBarLike: true }] }] };
const d = diffMoments(A, B);
const rowA = d.find((r) => r.key === 'host|a');
const rowB = d.find((r) => r.key === 'host|b');
check('unchanged collection reads HELD', rowA && rowA.released === 'HELD', JSON.stringify(rowA));
check('released collection reads GONE', rowB && rowB.released === 'GONE' && rowB.after === 0, JSON.stringify(rowB));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
