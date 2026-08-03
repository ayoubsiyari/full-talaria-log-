/**
 * TAL-01865 — every drawing load path must resolve market-time anchors.
 *
 * Writing is already market-time: BaseDrawing.toJSON() emits {timestamp, price}
 * with coordinateSystem:'timestamp'. The gap was on the read side.
 *
 * importDrawings() called toolInfo.class.fromJSON(item) with no chart argument,
 * no pointsFromTimestamps conversion and no timestamp re-attachment — the only
 * load path that did none of the three. Since exportDrawings() writes timestamp
 * points, a round trip handed the tool points with no x/y at all.
 *
 * The structural half: the per-tool fromJSON implementations disagree about
 * rebuilding timestampPoints (four do, seven do not), so the re-attachment has
 * to live in one shared entry point. These cells hold that line — if a fourth
 * load path appears and skips it, the single-entry-point cell goes red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SANDBOX_SIM — product source is executed here in a synthetic realm against stubs this gate wrote. Green means the logic behaves against those stubs, NOT that the shipped product does. A row can be green here and inert in the browser.');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const ROOT = findRoot(__dirname);
const MGR = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/modules/drawing-tools-manager.js');
const MGR_MIRROR = path.resolve(findRoot(__dirname), 'homepage/public/chart/modules/drawing-tools-manager.js');

const mgrSrc = fs.readFileSync(MGR, 'utf8');

function lift(source, header, label) {
  const start = source.indexOf(header);
  if (start < 0) {
    const bare = header.trim().split('(')[0];
    const state = source.includes(bare) ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: ${label || header}`);
  }
  // Skip the parameter list before looking for the body, or a default value
  // like `options = {}` is mistaken for the opening brace.
  const paren = source.indexOf('(', start);
  let pd = 0;
  let afterParams = -1;
  for (let i = paren; i < source.length; i += 1) {
    if (source[i] === '(') pd += 1;
    else if (source[i] === ')') { pd -= 1; if (pd === 0) { afterParams = i + 1; break; } }
  }
  const open = source.indexOf('{', afterParams);
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`ANCHOR_BROKEN: ${label || header} — unbalanced braces`);
  return null;
}

const HELPER = lift(mgrSrc, '    _deserializeDrawingFromPayload(', '_deserializeDrawingFromPayload');

/**
 * A tool whose fromJSON ignores coordinateSystem entirely — the seven-tool
 * majority (TextTool, PinTool, CalloutTool, ...). If the helper is doing its
 * job, even this tool ends up with timestamp anchors.
 */
/** Copy sandbox objects into this realm so deepEqual compares values, not prototypes. */
const plain = (v) => JSON.parse(JSON.stringify(v));

function makeManager({ barsStartAt = 0 } = {}) {
  const ctx = vm.createContext({
    Array, Object, Number, String, Math, console,
    // Bars shift by barsStartAt: the same timestamp resolves to a different index.
    CoordinateUtils: {
      pointsFromTimestamps: (tsPoints) => tsPoints.map((p) => ({
        x: (p.timestamp - 1700000000000) / 60000 - barsStartAt,
        y: p.price,
      })),
    },
  });
  const proto = vm.runInContext(`({ ${HELPER} })`, ctx);

  return Object.assign(Object.create(proto), {
    chart: { currentTimeframe: '1m' },
    toolRegistry: {
      trendline: {
        class: {
          fromJSON(data) {
            // Deliberately naive: copies points, ignores coordinateSystem.
            return { type: data.type, id: data.id, points: data.points };
          },
        },
      },
    },
    _getDrawingConversionData: () => [],
    _getTimestampConversionOptions: () => ({}),
    _applyLoadedDrawingLockState() {},
    _syncDrawingPointsFromTimestamps() {},
  });
}

/** What exportDrawings() actually writes, per BaseDrawing.toJSON(). */
const exported = () => ({
  id: 'd1',
  type: 'trendline',
  coordinateSystem: 'timestamp',
  points: [
    { timestamp: 1700000000000 + 10 * 60000, price: 1.2345 },
    { timestamp: 1700000000000 + 20 * 60000, price: 1.2400 },
  ],
});

test('DRAWIMPORT: mutant — the pre-fix import leaves points with no x/y', () => {
  // Literal pre-fix body: fromJSON(item), no chart, no conversion, no re-attach.
  const item = exported();
  const drawing = { type: item.type, id: item.id, points: item.points };
  assert.ok(
    drawing.points.every((p) => p.x === undefined && p.y === undefined),
    'mutant produced usable coordinates; the gate is not discriminating',
  );
  assert.equal(drawing.timestampPoints, undefined, 'mutant somehow attached anchors');
});

test('DRAWIMPORT: green — the shared entry point resolves x/y from the anchors', () => {
  const mgr = makeManager();
  const drawing = mgr._deserializeDrawingFromPayload(exported(), []);
  assert.ok(drawing, 'deserialise returned nothing');
  assert.deepEqual(
    drawing.points.map((p) => [p.x, p.y]),
    [[10, 1.2345], [20, 1.24]],
    'points were not resolved to bar indices',
  );
});

test('DRAWIMPORT: green — anchors are re-attached even for a tool that ignores them', () => {
  const mgr = makeManager();
  const drawing = mgr._deserializeDrawingFromPayload(exported(), []);
  assert.deepEqual(
    plain(drawing.timestampPoints),
    [
      { timestamp: 1700000000000 + 10 * 60000, price: 1.2345 },
      { timestamp: 1700000000000 + 20 * 60000, price: 1.24 },
    ],
    'the seven-tool majority still loses its market-time anchors',
  );
});

test('DRAWIMPORT: DEF-04 mechanism — a bar shift moves the index, not the anchor', () => {
  // Same payload, bars reloaded with five fewer leading bars. An index-pinned
  // line would reappear five bars off; a time-pinned one must not.
  const before = makeManager({ barsStartAt: 0 })._deserializeDrawingFromPayload(exported(), []);
  const after = makeManager({ barsStartAt: 5 })._deserializeDrawingFromPayload(exported(), []);

  assert.deepEqual(Array.from(before.points, (p) => p.x), [10, 20]);
  assert.deepEqual(Array.from(after.points, (p) => p.x), [5, 15], 'indices did not track the bar shift');
  assert.deepEqual(
    plain(before.timestampPoints),
    plain(after.timestampPoints),
    'the market-time anchor drifted with the bars — this is the DEF-04 failure',
  );
});

test('DRAWIMPORT: a price of exactly 0 is not swallowed', () => {
  // The replaced call sites used `p.price || p.y`, so a zero price silently fell
  // through to the index-space y. Guarding the regression rather than the bug.
  const mgr = makeManager();
  const item = exported();
  item.points = [{ timestamp: 1700000000000, price: 0, y: 999 }];
  const drawing = mgr._deserializeDrawingFromPayload(item, []);
  assert.equal(drawing.timestampPoints[0].price, 0, 'a zero price fell through to y');
});

test('DRAWIMPORT: an unknown tool type is skipped rather than thrown', () => {
  const mgr = makeManager();
  const item = exported();
  item.type = 'no-such-tool';
  assert.equal(mgr._deserializeDrawingFromPayload(item, []), null);
});

test('DRAWIMPORT: bound — importDrawings goes through the shared entry point', () => {
  const importFn = lift(mgrSrc, '    importDrawings(', 'importDrawings');
  assert.match(
    importFn,
    /_deserializeDrawingFromPayload\(item, conversionData\)/,
    'importDrawings does not use the shared deserialiser',
  );
  assert.doesNotMatch(
    importFn,
    /\.class\.fromJSON\(/,
    'importDrawings still calls fromJSON directly',
  );
});

test('DRAWIMPORT: bound — no load path calls fromJSON directly any more', () => {
  // Two call sites are legitimate and no more: the shared load deserialiser, and
  // the copy/paste path, which deliberately offsets anchors in timestamp space
  // (RC-3) and so must not share the load path.
  const sites = mgrSrc.match(/\.class\.fromJSON\(/g) || [];
  assert.equal(
    sites.length,
    2,
    `expected the load deserialiser plus the clone path, found ${sites.length} fromJSON call sites`,
  );
  const helper = lift(mgrSrc, '    _deserializeDrawingFromPayload(', 'helper');
  assert.match(helper, /\.class\.fromJSON\(item, this\.chart\)/, 'the load call site is not the helper');
  const clone = lift(mgrSrc, '    _createDrawingFromClonePayload(', 'clone path');
  assert.match(clone, /\.class\.fromJSON\(data, this\.chart\)/, 'the second site is not the clone path');

  for (const fn of ['loadDrawings(', 'loadDrawingsFromData(', 'importDrawings(']) {
    const header = mgrSrc.includes(`    async ${fn}`) ? `    async ${fn}` : `    ${fn}`;
    const body = lift(mgrSrc, header, fn);
    assert.doesNotMatch(body, /\.class\.fromJSON\(/, `${fn} still deserialises on its own`);
    assert.match(body, /_deserializeDrawingFromPayload\(/, `${fn} does not use the shared deserialiser`);
  }
});

test('DRAWIMPORT: bound — the entry point converts, re-attaches and syncs', () => {
  const helper = lift(mgrSrc, '    _deserializeDrawingFromPayload(', 'helper');
  assert.match(helper, /CoordinateUtils\.pointsFromTimestamps\(/, 'no timestamp conversion');
  assert.match(helper, /drawing\.timestampPoints = originalTimestampPoints/, 'no anchor re-attachment');
  assert.match(helper, /_syncDrawingPointsFromTimestamps\(drawing\)/, 'no point sync');
  assert.match(helper, /drawing\.chart = this\.chart/, 'chart reference not set');
});

test('DRAWIMPORT: mirror is byte-identical', () => {
  assert.equal(fs.readFileSync(MGR_MIRROR, 'utf8'), mgrSrc, 'drawing-tools-manager mirror drifted');
});
