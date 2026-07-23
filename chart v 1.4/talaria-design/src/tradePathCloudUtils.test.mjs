/**
 * M19-B Rev 4 — trade-path cloud consumer wiring (archive ‖ tail exactly once).
 *
 * GREEN:
 *   node --test --test-concurrency=1 "chart v 1.4/talaria-design/src/tradePathCloudUtils.test.mjs"
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCURSION_SERIES_KEYS,
  buildTradeCloudPath,
  extractPathFieldsFromJournal,
  parseNumArray,
  resolveExcursionSeries,
} from "./tradePathCloudUtils.js";

function seq(n, start = 0, step = 1) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(start + i * step);
  return out;
}

function freezeDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) || (v && typeof v === "object")) freezeDeep(v);
  }
  return obj;
}

test("parseNumArray: arrays and JSON-string arrays", () => {
  assert.deepEqual(parseNumArray([1, "2", 3]), [1, 2, 3]);
  assert.deepEqual(parseNumArray("[1,2,3]"), [1, 2, 3]);
  assert.deepEqual(parseNumArray("not-json"), []);
  assert.deepEqual(parseNumArray(null), []);
  assert.deepEqual(parseNumArray({ length: 2 }), []);
});

test("canonical: all six fields reconstruct archive + tail exactly once", () => {
  const archiveN = 100;
  const tailN = 40;
  const row = {};
  for (const spec of EXCURSION_SERIES_KEYS) {
    const arch = seq(archiveN, 1000);
    const tail = seq(tailN, 2000);
    row[spec.snake] = tail.slice();
    row[spec.archSnake] = arch.slice();
  }
  const fields = extractPathFieldsFromJournal(row);
  assert.equal(EXCURSION_SERIES_KEYS.length, 6);
  for (const spec of EXCURSION_SERIES_KEYS) {
    const expected = row[spec.archSnake].concat(row[spec.snake]);
    assert.deepEqual(fields[spec.snake], expected);
    assert.equal(fields[spec.snake].length, archiveN + tailN);
    // No missing/dup vs archive‖tail.
    assert.deepEqual(fields[spec.snake].slice(0, archiveN), row[spec.archSnake]);
    assert.deepEqual(fields[spec.snake].slice(archiveN), row[spec.snake]);
  }
});

test("camelCase + JSON-string arrays reconstruct the same six series", () => {
  const arch = seq(20, 1);
  const tail = seq(10, 100);
  const row = {
    barCloseR: JSON.stringify(tail),
    barCloseRArchive: JSON.stringify(arch),
    barHighR: tail.slice(),
    barHighRArchive: arch.slice(),
    barLowR: JSON.stringify(tail),
    barLowRArchive: arch.slice(),
    postExitBarCloseR: tail.slice(),
    postExitBarCloseRArchive: JSON.stringify(arch),
    postExitBarHighR: JSON.stringify(tail),
    postExitBarHighRArchive: JSON.stringify(arch),
    postExitBarLowR: tail.slice(),
    postExitBarLowRArchive: arch.slice(),
  };
  const fields = extractPathFieldsFromJournal(row);
  const once = arch.concat(tail);
  for (const spec of EXCURSION_SERIES_KEYS) {
    assert.deepEqual(fields[spec.snake], once);
  }
});

test("legacy rows without archives remain unchanged", () => {
  const full = seq(80, 0.1, 0.1);
  const row = {
    bar_close_r: full.slice(),
    bar_high_r: full.map((v) => v + 1),
    bar_low_r: full.map((v) => v - 1),
    post_exit_bar_close_r: seq(12, 9),
    post_exit_bar_high_r: seq(12, 10),
    post_exit_bar_low_r: seq(12, 8),
  };
  const fields = extractPathFieldsFromJournal(row);
  assert.deepEqual(fields.bar_close_r, full);
  assert.deepEqual(fields.bar_high_r, row.bar_high_r);
  assert.deepEqual(fields.bar_low_r, row.bar_low_r);
  assert.deepEqual(fields.post_exit_bar_close_r, row.post_exit_bar_close_r);
  assert.deepEqual(fields.post_exit_bar_high_r, row.post_exit_bar_high_r);
  assert.deepEqual(fields.post_exit_bar_low_r, row.post_exit_bar_low_r);
});

test("already-projected rows (full bar_*, no archive) remain unchanged", () => {
  const projected = seq(356, 0); // legacy prefix + live already merged
  const row = {
    bar_close_r: projected.slice(),
    bar_high_r: projected.map((v) => v + 2),
    bar_low_r: projected.map((v) => v - 2),
    post_exit_bar_close_r: seq(30, 1),
    // empty archive must not alter projected series
    bar_close_r_archive: [],
    barHighRArchive: [],
  };
  const fields = extractPathFieldsFromJournal(row);
  assert.deepEqual(fields.bar_close_r, projected);
  assert.deepEqual(fields.bar_high_r, row.bar_high_r);
  assert.deepEqual(fields.post_exit_bar_close_r, row.post_exit_bar_close_r);
});

test("malformed archive/tail inputs do not throw and degrade safely", () => {
  const tail = seq(5, 1);
  const row = {
    bar_close_r: tail,
    bar_close_r_archive: "{not-json",
    bar_high_r: "also-bad",
    bar_high_r_archive: { oops: true },
    bar_low_r: null,
    bar_low_r_archive: "null",
    post_exit_bar_close_r: "[1,2,bad]",
    post_exit_bar_close_r_archive: undefined,
    post_exit_bar_high_r: [1, NaN, 2],
    post_exit_bar_high_r_archive: "[3,4]",
    post_exit_bar_low_r: "[]",
    post_exit_bar_low_r_archive: "[5]",
  };
  assert.doesNotThrow(() => extractPathFieldsFromJournal(row));
  const fields = extractPathFieldsFromJournal(row);
  // Bad archive → tail only.
  assert.deepEqual(fields.bar_close_r, tail);
  assert.deepEqual(fields.bar_high_r, []);
  // Finite filter drops NaN; archive‖tail when archive parses.
  assert.deepEqual(fields.post_exit_bar_high_r, [3, 4, 1, 2]);
  assert.deepEqual(fields.post_exit_bar_low_r, [5]);
});

test("no-mutation: extract/resolve/build leave source row intact", () => {
  const arch = seq(30, 1);
  const tail = seq(20, 100);
  const row = freezeDeep({
    bar_close_r: tail.slice(),
    bar_close_r_archive: arch.slice(),
    bar_high_r: tail.slice(),
    bar_high_r_archive: arch.slice(),
    bar_low_r: JSON.stringify(tail),
    bar_low_r_archive: JSON.stringify(arch),
    post_exit_bar_close_r: tail.slice(),
    post_exit_bar_close_r_archive: arch.slice(),
    post_exit_bar_high_r: tail.slice(),
    post_exit_bar_high_r_archive: arch.slice(),
    post_exit_bar_low_r: tail.slice(),
    post_exit_bar_low_r_archive: arch.slice(),
  });
  const before = JSON.stringify(row);
  assert.doesNotThrow(() => {
    extractPathFieldsFromJournal(row);
    resolveExcursionSeries(row, EXCURSION_SERIES_KEYS[0]);
    buildTradeCloudPath(row, 20, 20);
  });
  assert.equal(JSON.stringify(row), before);
  assert.equal(row.bar_close_r.length, 20);
  assert.equal(row.bar_close_r_archive.length, 30);
});

test("buildTradeCloudPath includes preserved legacy archive prefix", () => {
  const archive = Array.from({ length: 120 }, () => 5);
  const tail = Array.from({ length: 40 }, () => 0);
  const postArch = Array.from({ length: 80 }, () => 2);
  const postTail = Array.from({ length: 30 }, () => 0);
  const canonical = {
    bar_close_r: tail,
    bar_close_r_archive: archive,
    post_exit_bar_close_r: postTail,
    post_exit_bar_close_r_archive: postArch,
  };
  const fullyMerged = {
    bar_close_r: archive.concat(tail),
    post_exit_bar_close_r: postArch.concat(postTail),
  };
  const pathCanon = buildTradeCloudPath(canonical, 50, 50);
  const pathMerged = buildTradeCloudPath(fullyMerged, 50, 50);
  assert.ok(pathCanon);
  assert.deepEqual(pathCanon, pathMerged);

  // Tail-only (pre-Rev4 bug) would drop the legacy prefix signal.
  const pathTailOnly = buildTradeCloudPath(
    { bar_close_r: tail, post_exit_bar_close_r: postTail },
    50,
    50,
  );
  assert.notDeepEqual(pathCanon, pathTailOnly);

  // In-trade half must carry archive=5 influence (not all zeros from live tail).
  const inPart = pathCanon.slice(0, 50);
  const meanIn = inPart.reduce((a, b) => a + b, 0) / inPart.length;
  assert.ok(meanIn > 2, `expected archive prefix in cloud path, meanIn=${meanIn}`);
  // First cloud samples come from archive head.
  assert.ok(inPart[0] > 4.5);
});
