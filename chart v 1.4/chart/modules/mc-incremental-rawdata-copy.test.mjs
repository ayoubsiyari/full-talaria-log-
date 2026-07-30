/**
 * Behavioural coverage for the multichart raw-data incremental copy path.
 *
 *   node --test "chart v 1.4/chart/modules/mc-incremental-rawdata-copy.test.mjs"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(CHART_MIRROR, 'utf8');
const BASELINE_HASH = sha256(SOURCE);
const MIRROR_BASELINE_HASH = sha256(MIRROR_SOURCE);

const METHOD_NAMES = [
  '_mcRawDataCopyDisabled',
  '_mcIncrementalRawDataCopyDisabled',
  '_mcRawDataCopyCacheSlot',
  '_mcRawDataCopyCache',
  '_mcRawDataCopyLimit',
  '_mcScalarCloneRawBar',
  '_mcCloneRawDataBars',
  '_mcRawDataCopyBoundaryTimestamp',
  '_mcCacheFullRawDataClone',
  '_mcIncrementalCloneRawDataBars',
  '_mcCopySamePairFullRawData',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}\n`);
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0];
}

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

function makeChart(text = SOURCE, flags = {}) {
  const context = vm.createContext({ console, Map, Number });
  context.globalThis = context;
  context.__flags = flags;
  vm.runInContext(`
class ChartHarness {
    constructor() {
        this._mcIncrementalRawDataCopyCache = null;
    }

${chartMethods(text)}
}
globalThis.window = Object.assign({}, globalThis.__flags);
globalThis.__chart = new ChartHarness();
`, context);
  return context.__chart;
}

function withCloneCounter(chart) {
  let count = 0;
  const original = chart._mcScalarCloneRawBar;
  chart._mcScalarCloneRawBar = function countedClone(value) {
    count += 1;
    return original.call(this, value);
  };
  return {
    count: () => count,
    reset: () => { count = 0; },
  };
}

function makeBars(count, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i,
    o: i,
    h: i + 1,
    l: i - 1,
    c: i + 0.5,
    nested: { parentOnly: true },
  }));
}

function expectedFullClone(source) {
  return source.map((bar) => ({
    t: bar.t,
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
  }));
}

function assertFullCloneShape(actual, source, label = 'copy') {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expectedFullClone(source), `${label} must match legacy full-clone output`);
  assert.notEqual(actual, source, `${label} array must be detached`);
  for (let i = 0; i < actual.length; i += 1) {
    assert.notEqual(actual[i], source[i], `${label} bar ${i} must be detached`);
  }
}

const cells = {
  'steady-growth': (text = SOURCE) => {
    const chart = makeChart(text);
    const counter = withCloneCounter(chart);
    const source = makeBars(10, 1000);
    let previous = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assertFullCloneShape(previous, source, 'initial steady copy');
    assert.equal(counter.count(), 10, 'initial copy clones the initial source once');

    for (let i = 0; i < 30; i += 1) {
      const oldLength = source.length;
      source.push({ t: 1000 + oldLength, o: oldLength, h: oldLength + 1, l: oldLength - 1, c: oldLength + 0.5 });
      const next = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
      assert.equal(next, previous, 'steady growth must retain the destination clone array');
      assertFullCloneShape(next, source, `steady copy ${i}`);
      for (let j = 0; j < oldLength; j += 1) {
        assert.equal(next[j], previous[j], `steady copy ${i} must retain cloned prefix object ${j}`);
      }
      assert.equal(counter.count(), source.length, 'steady growth must clone only newly appended bars');
      previous = next;
    }
  },

  'detachment-fast-path': (text = SOURCE) => {
    const chart = makeChart(text);
    const source = makeBars(2, 2000);
    chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    source.push({ t: 2002, o: 2, h: 3, l: 1, c: 2.5 });
    const copy = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assertFullCloneShape(copy, source, 'fast-path copy');
    source[2].c = 999;
    assert.equal(copy[2].c, 2.5, 'parent mutation after fast append must not affect copy');
    copy[2].o = -123;
    assert.equal(source[2].o, 2, 'copy mutation after fast append must not affect parent');
  },

  'prepend-falls-back': (text = SOURCE) => {
    const chart = makeChart(text);
    const source = makeBars(3, 3000);
    const first = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    source.unshift({ t: 2998, o: -2, h: -1, l: -3, c: -1.5 }, { t: 2999, o: -1, h: 0, l: -2, c: -0.5 });
    const copy = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assert.notEqual(copy, first, 'prepend must abandon the retained clone array');
    assertFullCloneShape(copy, source, 'prepend fallback copy');
  },

  'truncation-and-identity-fallback': (text = SOURCE) => {
    const chart = makeChart(text);
    const source = makeBars(4, 4000);
    const first = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    source.pop();
    const truncated = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assert.notEqual(truncated, first, 'truncation must full-clone into a fresh array');
    assertFullCloneShape(truncated, source, 'truncation fallback copy');

    const replacement = makeBars(5, 5000);
    const replaced = chart._mcCopySamePairFullRawData(replacement, 'panelFullRawData');
    assert.notEqual(replaced, truncated, 'different source identity must full-clone into a fresh array');
    assertFullCloneShape(replaced, replacement, 'identity fallback copy');

    const identityChart = makeChart(text);
    const firstSource = makeBars(2, 5100);
    const firstCopy = identityChart._mcCopySamePairFullRawData(firstSource, 'panelFullRawData');
    const sameBoundaryReplacement = [
      { t: 5100, o: 100, h: 101, l: 99, c: 100.5 },
      { t: 5101, o: 101, h: 102, l: 100, c: 101.5 },
      { t: 5102, o: 102, h: 103, l: 101, c: 102.5 },
    ];
    const identityCopy = identityChart._mcCopySamePairFullRawData(sameBoundaryReplacement, 'panelFullRawData');
    assert.notEqual(identityCopy, firstCopy, 'same-boundary different source identity must not append to a stale clone');
    assertFullCloneShape(identityCopy, sameBoundaryReplacement, 'same-boundary identity fallback copy');
  },

  'boundary-timestamp-mismatch': (text = SOURCE) => {
    const chart = makeChart(text);
    const source = makeBars(3, 6000);
    const first = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    source[2] = { t: 6999, o: 9, h: 10, l: 8, c: 9.5 };
    const copy = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assert.notEqual(copy, first, 'boundary mismatch must full-clone into a fresh array');
    assertFullCloneShape(copy, source, 'boundary fallback copy');
    assert.equal(copy[2].t, 6999, 'boundary fallback must not retain a stale prefix');
  },

  'two-destinations-isolated': (text = SOURCE) => {
    const chart = makeChart(text);
    const source = makeBars(2, 7000);
    const panelCopy = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    const replayCopy = chart._mcCopySamePairFullRawData(source, 'replay.fullRawData');
    assert.notEqual(panelCopy, replayCopy, 'different destination slots need independent clone arrays');
    panelCopy[0].c = -1;
    assert.equal(replayCopy[0].c, 0.5, 'mutating one destination copy must not affect the other');
    source.push({ t: 7002, o: 2, h: 3, l: 1, c: 2.5 });
    const nextReplay = chart._mcCopySamePairFullRawData(source, 'replay.fullRawData');
    const nextPanel = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assert.equal(nextReplay, replayCopy, 'replay slot should retain its own array');
    assert.equal(nextPanel, panelCopy, 'panel slot should retain its own array');
    assertFullCloneShape(nextReplay, source, 'replay slot copy');
    panelCopy[0].c = 0.5;
    assertFullCloneShape(nextPanel, source, 'panel slot copy');
  },

  'incremental-flag-truthy-full-clones': (text = SOURCE) => {
    for (const flagValue of [1, 'yes', {}, '0']) {
      const chart = makeChart(text, { __TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1: flagValue });
      const counter = withCloneCounter(chart);
      const source = makeBars(2, 8000);
      const first = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
      source.push({ t: 8002, o: 2, h: 3, l: 1, c: 2.5 });
      const second = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
      assert.notEqual(second, first, `truthy flag ${String(flagValue)} must force a fresh legacy clone`);
      assertFullCloneShape(second, source, `truthy flag ${String(flagValue)} copy`);
      assert.equal(counter.count(), 5, `truthy flag ${String(flagValue)} must full-clone every call`);
    }
  },

  'rawdata-copy-disable-alias-precedence': (text = SOURCE) => {
    const chart = makeChart(text, {
      __TALARIA_DISABLE_MC_RAWDATA_COPY_V1: 'yes',
      __TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1: false,
    });
    const source = makeBars(2, 9000);
    const copy = chart._mcCopySamePairFullRawData(source, 'panelFullRawData');
    assert.equal(copy, source, 'pre-existing rawdata copy disable flag must still alias');

    const chartBoth = makeChart(text, {
      __TALARIA_DISABLE_MC_RAWDATA_COPY_V1: 'yes',
      __TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1: 'yes',
    });
    const sourceBoth = makeBars(2, 9100);
    const copyBoth = chartBoth._mcCopySamePairFullRawData(sourceBoth, 'panelFullRawData');
    assert.equal(copyBoth, sourceBoth, 'pre-existing alias flag must take precedence over the new flag');
  },
};

test('steady growth clones only appended bars', () => {
  cells['steady-growth']();
  note('steady-growth', true);
});

test('fast path keeps parent and copy detached', () => {
  cells['detachment-fast-path']();
  note('detachment-fast-path', true);
});

test('prepend falls back to a full detached clone', () => {
  cells['prepend-falls-back']();
  note('prepend-falls-back', true);
});

test('truncation and different identity fall back', () => {
  cells['truncation-and-identity-fallback']();
  note('truncation-and-identity-fallback', true);
});

test('boundary timestamp mismatch falls back', () => {
  cells['boundary-timestamp-mismatch']();
  note('boundary-timestamp-mismatch', true);
});

test('two destination slots are isolated', () => {
  cells['two-destinations-isolated']();
  note('two-destinations-isolated', true);
});

test('new incremental kill-switch truthy values force full clones', () => {
  cells['incremental-flag-truthy-full-clones']();
  note('incremental-flag-truthy-full-clones', true);
});

test('pre-existing rawdata alias kill-switch still takes precedence', () => {
  cells['rawdata-copy-disable-alias-precedence']();
  note('rawdata-copy-disable-alias-precedence', true);
});

const mutants = [
  {
    name: 'drop-boundary-timestamp-check',
    killedBy: 'boundary-timestamp-mismatch',
    needle: '            && (prevLen === 0 || this._mcRawDataCopyBoundaryTimestamp(source, prevLen) === cache.lastTimestamp);',
    replacement: '            && true;',
  },
  {
    name: 'skip-prepend-fallback',
    killedBy: 'prepend-falls-back',
    needle: '            && (prevLen === 0 || this._mcRawDataCopyBoundaryTimestamp(source, prevLen) === cache.lastTimestamp);',
    replacement: '            && (prevLen === 0 || this._mcRawDataCopyBoundaryTimestamp(source, source.length) === cache.lastTimestamp);',
  },
  {
    name: 'reuse-one-cache-slot-for-all-destinations',
    killedBy: 'two-destinations-isolated',
    needle: '        return slotKey == null ? null : String(slotKey);',
    replacement: "        return slotKey == null ? null : '__single_rawdata_copy_slot__';",
  },
  {
    name: 'append-parent-object-into-result',
    killedBy: 'detachment-fast-path',
    needle: `        const out = cache.clone;
        for (let i = prevLen; i < source.length; i += 1) {
            const cloned = this._mcScalarCloneRawBar(source[i]);
            if (cloned && Number.isFinite(Number(cloned.t))) out.push(cloned);
        }`,
    replacement: `        const out = cache.clone;
        for (let i = prevLen; i < source.length; i += 1) {
            if (source[i] && Number.isFinite(Number(source[i].t))) out.push(source[i]);
        }`,
  },
  {
    name: 'off-by-one-tail-start',
    killedBy: 'steady-growth',
    needle: '        for (let i = prevLen; i < source.length; i += 1) {',
    replacement: '        for (let i = prevLen + 1; i < source.length; i += 1) {',
  },
  {
    name: 'invert-incremental-flag-polarity',
    killedBy: 'steady-growth',
    needle: '        if (this._mcIncrementalRawDataCopyDisabled()) return this._mcCloneRawDataBars(source);',
    replacement: '        if (!this._mcIncrementalRawDataCopyDisabled()) return this._mcCloneRawDataBars(source);',
  },
  {
    name: 'narrow-incremental-flag-to-true',
    killedBy: 'incremental-flag-truthy-full-clones',
    needle: '            return !!(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1);',
    replacement: '            return (typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1 === true);',
  },
  {
    name: 'remove-rawdata-alias-precedence',
    killedBy: 'rawdata-copy-disable-alias-precedence',
    needle: '        if (this._mcRawDataCopyDisabled()) return source;',
    replacement: '        if (false && this._mcRawDataCopyDisabled()) return source;',
  },
  {
    name: 'ignore-source-identity',
    killedBy: 'truncation-and-identity-fallback',
    needle: '            && cache.source === source',
    replacement: '            && true',
  },
  {
    name: 'ignore-source-truncation',
    killedBy: 'truncation-and-identity-fallback',
    needle: `        const canAppendTail = cache
            && cache.source === source
            && source.length >= prevLen
            && (prevLen === 0 || this._mcRawDataCopyBoundaryTimestamp(source, prevLen) === cache.lastTimestamp);`,
    replacement: `        const canAppendTail = cache
            && cache.source === source
            && (prevLen === 0 || source.length < prevLen || this._mcRawDataCopyBoundaryTimestamp(source, prevLen) === cache.lastTimestamp);`,
  },
  {
    name: 'do-not-advance-cached-length',
    killedBy: 'steady-growth',
    needle: '        cache.sourceLength = source.length;',
    replacement: '        cache.sourceLength = prevLen;',
  },
];

function countNeedle(text, needle) {
  return text.split(needle).length - 1;
}

function restoreMirrors() {
  fs.writeFileSync(CHART_JS, SOURCE);
  fs.writeFileSync(CHART_MIRROR, MIRROR_SOURCE);
}

test('mutant table kills named behavioural regressions and restores mirrors', () => {
  const survived = [];
  const notApplied = [];
  try {
    for (const mutant of mutants) {
      const primaryCount = countNeedle(SOURCE, mutant.needle);
      const mirrorCount = countNeedle(MIRROR_SOURCE, mutant.needle);
      if (primaryCount !== 1 || mirrorCount !== 1) {
        process.stdout.write(`NOT_APPLIED ${mutant.name} primary=${primaryCount} mirror=${mirrorCount}\n`);
        notApplied.push(mutant.name);
        continue;
      }

      const mutatedPrimary = SOURCE.replace(mutant.needle, mutant.replacement);
      const mutatedMirror = MIRROR_SOURCE.replace(mutant.needle, mutant.replacement);
      fs.writeFileSync(CHART_JS, mutatedPrimary);
      fs.writeFileSync(CHART_MIRROR, mutatedMirror);

      let killed = false;
      try {
        cells[mutant.killedBy](mutatedPrimary);
      } catch (error) {
        killed = true;
        process.stdout.write(`MUTANT ${mutant.name} KILLED_BY ${mutant.killedBy}: ${error.message}\n`);
      } finally {
        restoreMirrors();
      }

      assert.equal(sha256(fs.readFileSync(CHART_JS, 'utf8')), BASELINE_HASH, `${mutant.name} primary restored`);
      assert.equal(sha256(fs.readFileSync(CHART_MIRROR, 'utf8')), MIRROR_BASELINE_HASH, `${mutant.name} mirror restored`);

      if (!killed) {
        process.stdout.write(`SURVIVED ${mutant.name} expected=${mutant.killedBy}\n`);
        survived.push(mutant.name);
      }
    }
  } finally {
    restoreMirrors();
  }

  assert.deepEqual(notApplied, [], 'all mutants must apply to both mirrors exactly once');
  assert.deepEqual(survived, [], 'all mutants must be killed by the named behavioural cell');
  note('mutant-table', true, `${mutants.length} killed, 0 survived`);
});

test('mirror chart.js files are byte-identical', () => {
  const primary = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  assert.equal(sha256(primary), sha256(mirror));
  note('mirror-byte-identity', true, sha256(primary));
});
