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
const BRIDGE_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'panel-cmd-bridge.js');
const BRIDGE_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'panel-cmd-bridge.js');
const SWITCH = '__TALARIA_DISABLE_MC_RAWDATA_COPY_V1';
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const BRIDGE_SOURCE = fs.readFileSync(BRIDGE_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label} anchor count`);
  return text.replace(from, to);
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

const METHODS = [
  '_mcRawDataCopyDisabled',
  '_mcRawDataCopyLimit',
  '_mcScalarCloneRawBar',
  '_mcCloneRawDataBars',
  '_mcCopySamePairFullRawData',
  '_mcDetachFullRawDataCopy',
  '_multichartMirrorHostTfSwitchIfReady',
  '_multichartMirrorViewportFromHost',
  '_syncReplayMasterFromParentIfCovers',
  '_multichartDetachViewportFromHost',
  '_takeParentNativeMasterSmartWindow',
];

function chartMethods(text = SOURCE) {
  return METHODS.map((name) => methodSource(text, name)).join('\n');
}

function makeBars(count, start = 1_700_000_000_000) {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * 60_000,
    o: i,
    h: i + 2,
    l: i - 2,
    c: i + 1,
    v: i * 10,
    nested: { retained: false },
  }));
}

function makeEnv(text = SOURCE) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Math,
    Number,
    String,
    Array,
    Object,
    Date,
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
  });
  context.globalThis = context;
  vm.runInContext(`
globalThis.window = { parent: null };
window.parent = window;
class Chart {
    constructor() {
        this.currentFileId = 'PAIR';
        this.currentTimeframe = '1m';
        this._nativeRawFetchTf = '1m';
        this.data = [];
        this.rawData = [];
        this._panelFullRawData = null;
        this.replaySystem = {
            isActive: true,
            syncCurrentIndexFromReplayTimestamp() {},
            updateChartData() {},
        };
        this.zoomLevel = { candleWidthIndex: 0 };
        this.margin = { l: 0, r: 0 };
        this.w = 1000;
        this.offsetX = 0;
    }

${chartMethods(text)}

    _isMultichartEmbedPanel() { return true; }
    _isIndependentMultichartPair() { return false; }
    _multichartSamePairAsHost(fileId) { return String(fileId || '') === 'PAIR'; }
    _multichartFinerSamePairPanelSelfOwns() { return false; }
    _multichartGetHostChart() { return window.parent && window.parent.chart; }
    _barsMatchTimeframe() { return true; }
    _warmBtTfCacheFromParent() {}
    _captureMultichartMirrorPrependSnapshot() { return null; }
    _applyMultichartMirrorPrependCompensation() { return null; }
    _userOwnsReleasedViewport() { return false; }
    _finishTfSwitchViewportRestore() {}
    _endTimeframeSwitching() {}
    _scheduleIndicatorsAfterTimeframe() {}
    _syncIndicatorsAfterMultichartDataShare() {}
    _logTfSwitch() {}
    render() {}
    _commitTimeframeChange(tf) { this.currentTimeframe = tf; }
    parseTimeframe(tf) { return String(tf || '').toLowerCase() === '1m' ? 60000 : 0; }
    _replayRawHasWallClockPrefix() { return true; }
    _ensureFinerPanelOwnerCoversPlayhead() {}
    _reseedReplayFullRawFromLoadedData() {
        const seed = Array.isArray(this._panelFullRawData) && this._panelFullRawData.length
            ? this._panelFullRawData
            : this.rawData;
        if (!this.replaySystem || !Array.isArray(seed) || !seed.length) return false;
        this.replaySystem.fullRawData = [...seed];
        this.replaySystem.rawTimeframe = this._nativeRawFetchTf || this.currentTimeframe;
        this.replaySystem._fullRawDataMatchesTF = false;
        return true;
    }
    initReplaySystem() {
        this.replaySystem = {
            isActive: true,
            syncCurrentIndexFromReplayTimestamp() {},
            updateChartData() {},
        };
    }
    getCandleSpacing() { return 5; }
    getVisibleEndIndex() { return this.data.length - 1; }
    constrainOffset() {}
}
globalThis.Chart = Chart;
`, context);

  const parent = new context.Chart();
  const panel = new context.Chart();
  context.window.parent = { chart: parent };
  return { context, window: context.window, parent, panel };
}

function seedParent(parent, count = 4) {
  parent.currentFileId = 'PAIR';
  parent.currentTimeframe = '1m';
  parent._nativeRawFetchTf = '1m';
  parent.data = makeBars(count);
  parent.rawData = parent.data;
  parent._panelFullRawData = makeBars(count, 1_710_000_000_000);
  parent.replaySystem = {
    isActive: true,
    fullRawData: makeBars(count, 1_720_000_000_000),
    rawTimeframe: '1m',
    _fullRawDataMatchesTF: true,
    replayTimestamp: 1_720_000_000_000,
    userHasPanned: false,
    autoScrollEnabled: true,
    tickProgress: 0.25,
    tickElapsedMs: 100,
    animatingCandle: { t: 1_720_000_000_000 },
  };
  parent._serverCursors = {
    firstTs: parent.replaySystem.fullRawData[0].t,
    lastTs: parent.replaySystem.fullRawData[parent.replaySystem.fullRawData.length - 1].t,
    hasMoreLeft: true,
    hasMoreRight: false,
  };
  parent.totalCandles = count;
}

function assertDistinctScalarCopy(copy, source, label) {
  assert.notEqual(copy, source, `${label}: array identity must break`);
  assert.equal(copy.length, source.length, `${label}: length should be preserved within cap`);
  assert.notEqual(copy[0], source[0], `${label}: bar object identity must break`);
  assert.equal(copy[0].t, source[0].t, `${label}: t scalar preserved`);
  assert.equal(copy[0].o, source[0].o, `${label}: o scalar preserved`);
  assert.equal(copy[0].h, source[0].h, `${label}: h scalar preserved`);
  assert.equal(copy[0].l, source[0].l, `${label}: l scalar preserved`);
  assert.equal(copy[0].c, source[0].c, `${label}: c scalar preserved`);
  assert.equal(copy[0].v, source[0].v, `${label}: v scalar preserved`);
  assert.equal('nested' in copy[0], false, `${label}: nested junk must not be cloned`);
}

function assertMirrorHostTfSwitchCopies(text = SOURCE, flagValue = undefined) {
  const { window, parent, panel } = makeEnv(text);
  seedParent(parent);
  if (flagValue === undefined) {
    delete window[SWITCH];
  } else {
    window[SWITCH] = flagValue;
  }

  const ok = panel._multichartMirrorHostTfSwitchIfReady('1m', { fromHostFanout: true });
  assert.equal(ok, true);

  if (flagValue) {
    note('flag-on-host-tf-panel-alias', panel._panelFullRawData === parent._panelFullRawData);
    note('flag-on-host-tf-replay-alias', panel.replaySystem.fullRawData === parent.replaySystem.fullRawData);
    assert.equal(panel._panelFullRawData, parent._panelFullRawData);
    assert.equal(panel.replaySystem.fullRawData, parent.replaySystem.fullRawData);
    return;
  }

  assertDistinctScalarCopy(panel._panelFullRawData, parent._panelFullRawData, 'host-tf panel master');
  assertDistinctScalarCopy(panel.replaySystem.fullRawData, parent.replaySystem.fullRawData, 'host-tf replay master');
  assert.notEqual(panel._panelFullRawData[0], panel.replaySystem.fullRawData[0],
    'panel and replay clones must not share bar objects with each other');
}

function assertMirrorViewportCopies(text = SOURCE, flagValue = undefined) {
  const { window, parent, panel } = makeEnv(text);
  seedParent(parent);
  if (flagValue === undefined) {
    delete window[SWITCH];
  } else {
    window[SWITCH] = flagValue;
  }

  const ok = panel._multichartMirrorViewportFromHost();
  assert.equal(ok, true);

  if (flagValue) {
    assert.equal(panel.replaySystem.fullRawData[0], parent.replaySystem.fullRawData[0],
      'flag-on viewport path restores legacy shallow replay bars');
    assert.equal(panel._panelFullRawData[0], parent._panelFullRawData[0],
      'flag-on viewport path restores legacy shallow bar ownership');
    return;
  }

  assertDistinctScalarCopy(panel._panelFullRawData, parent._panelFullRawData, 'viewport panel master');
  assertDistinctScalarCopy(panel.replaySystem.fullRawData, parent.replaySystem.fullRawData, 'viewport replay master');
}

function assertSyncFromParentCopies(text = SOURCE, flagValue = undefined) {
  const { window, parent, panel } = makeEnv(text);
  seedParent(parent);
  const targetTs = parent.replaySystem.fullRawData[1].t;
  panel.replaySystem.replayTimestamp = targetTs;
  if (flagValue === undefined) {
    delete window[SWITCH];
  } else {
    window[SWITCH] = flagValue;
  }

  const ok = panel._syncReplayMasterFromParentIfCovers(targetTs);
  assert.equal(ok, true);

  if (flagValue) {
    assert.equal(panel._panelFullRawData, parent._panelFullRawData,
      'flag-on sync-from-parent restores panel master alias');
    assert.equal(panel.replaySystem.fullRawData[0], parent._panelFullRawData[0],
      'flag-on sync-from-parent restores shallow replay bar alias');
    return;
  }

  assertDistinctScalarCopy(panel._panelFullRawData, parent._panelFullRawData, 'sync-from-parent panel master');
  assert.notEqual(panel.replaySystem.fullRawData, parent._panelFullRawData,
    'sync-from-parent replay array must not alias parent panel master');
  assert.notEqual(panel.replaySystem.fullRawData[0], parent._panelFullRawData[0],
    'sync-from-parent replay bars must not alias parent panel bars');
  assert.equal('nested' in panel.replaySystem.fullRawData[0], false,
    'sync-from-parent replay bars must stay scalar-only');
}

function assertParentNativeBootCopies(text = SOURCE, flagValue = undefined) {
  const { window, parent, panel } = makeEnv(text);
  seedParent(parent);
  parent._panelFullRawData = null;
  if (flagValue === undefined) {
    delete window[SWITCH];
  } else {
    window[SWITCH] = flagValue;
  }

  const result = panel._takeParentNativeMasterSmartWindow('PAIR');
  assert.ok(result);
  assert.equal(result.candles, panel._panelFullRawData);

  if (flagValue) {
    assert.equal(result.candles, parent.replaySystem.fullRawData);
    return;
  }

  assertDistinctScalarCopy(result.candles, parent.replaySystem.fullRawData, 'parent-native master');
}

function assertDetachCopiesBarObjects(text = SOURCE, flagValue = undefined) {
  const { window, panel } = makeEnv(text);
  const panelMaster = makeBars(4);
  const replayMaster = makeBars(4, 1_730_000_000_000);
  panel._panelFullRawData = panelMaster;
  panel.replaySystem.fullRawData = replayMaster;
  if (flagValue === undefined) {
    delete window[SWITCH];
  } else {
    window[SWITCH] = flagValue;
  }

  panel._multichartDetachViewportFromHost();

  assert.notEqual(panel._panelFullRawData, panelMaster);
  assert.notEqual(panel.replaySystem.fullRawData, replayMaster);
  if (flagValue) {
    assert.equal(panel._panelFullRawData[0], panelMaster[0], 'flag-on detach restores shallow slice');
    assert.equal(panel.replaySystem.fullRawData[0], replayMaster[0], 'flag-on replay detach restores shallow slice');
    return;
  }
  assertDistinctScalarCopy(panel._panelFullRawData, panelMaster, 'detach panel master');
  assertDistinctScalarCopy(panel.replaySystem.fullRawData, replayMaster, 'detach replay master');
}

function assertSwitchFourState(text = SOURCE) {
  const { window, panel } = makeEnv(text);
  const bars = makeBars(2);

  delete window[SWITCH];
  assert.notEqual(panel._mcCopySamePairFullRawData(bars), bars, 'absent flag defaults to copy');

  window[SWITCH] = false;
  assert.notEqual(panel._mcCopySamePairFullRawData(bars), bars, 'false flag still copies');

  window[SWITCH] = true;
  assert.equal(panel._mcCopySamePairFullRawData(bars), bars, 'true flag restores alias');

  window[SWITCH] = 'truthy';
  assert.equal(panel._mcCopySamePairFullRawData(bars), bars, 'truthy flag restores alias');

  window[SWITCH] = 0;
  assert.notEqual(panel._mcCopySamePairFullRawData(bars), bars, 'per-call falsy toggle copies again');
}

function assertCloneBound(text = SOURCE) {
  const { panel } = makeEnv(text);
  const source = makeBars(200005);
  const cloned = panel._mcCopySamePairFullRawData(source);
  if (cloned.length === 200000) note('clone-bound-200000', true, `bars=${cloned.length}`);
  assert.equal(panel._mcRawDataCopyLimit(), 200000);
  assert.equal(cloned.length, 200000);
  assert.equal(cloned[0].t, source[5].t, 'cap keeps the latest 200000 bars');
  assert.notEqual(cloned[0], source[5]);
  assert.equal('nested' in cloned[0], false);
}

function cloneBarsLikeChart(source, flagValue) {
  if (flagValue) return source;
  return source.slice(Math.max(0, source.length - 200000)).map((bar) => {
    const out = {};
    for (const key of Object.keys(bar || {})) {
      const value = bar[key];
      if (value == null || typeof value !== 'object') out[key] = value;
    }
    return out;
  }).filter((bar) => Number.isFinite(Number(bar.t)));
}

function makeBridgeEnv({ flagValue = undefined, useChartHelper = true } = {}) {
  const parent = {};
  seedParent(parent);
  const targetTs = parent.replaySystem.replayTimestamp;
  const chart = {
    currentFileId: 'PAIR',
    currentTimeframe: '1m',
    rawData: makeBars(2, 1_740_000_000_000),
    data: makeBars(2, 1_740_000_000_000),
    _panelFullRawData: null,
    offsetX: 0,
    candleWidth: 5,
    replaySystem: {
      isActive: true,
      isPlaying: false,
      fullRawData: makeBars(1, 1_750_000_000_000),
      rawTimeframe: '1m',
      replayTimestamp: targetTs,
      currentIndex: 0,
      userHasPanned: true,
      autoScrollEnabled: false,
      applyMultichartMirrorFrame() { return false; },
      goToReplayTimestamp(ts) { this.replayTimestamp = ts; },
    },
    _tryExtendReplayMasterFromParent() { return false; },
    _captureMultichartMirrorPrependSnapshot() { return null; },
    _applyMultichartMirrorPrependCompensation() { return null; },
    bumpDataVersion() {},
    render() {},
  };
  if (useChartHelper) {
    chart._mcCopySamePairFullRawData = (source) => cloneBarsLikeChart(source, flagValue);
  }

  const posts = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Math,
    Number,
    String,
    Array,
    Object,
    Date,
    Error,
    Promise,
    Set,
    URLSearchParams,
    location: { search: '?panelId=B' },
    chart,
    parent: {
      chart: parent,
      postMessage(message) { posts.push(message); },
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); return 1; },
  });
  context.window = context;
  context.globalThis = context;
  if (flagValue !== undefined) context[SWITCH] = flagValue;
  vm.runInContext(BRIDGE_SOURCE, context);
  return { context, parent, chart, posts };
}

async function assertBridgeReplayEnterCopies(flagValue = undefined, useChartHelper = true) {
  const { context, parent, chart } = makeBridgeEnv({ flagValue, useChartHelper });
  await context.MultichartCmdBridge.applyCommand('replayEnter', {
    timestamp: parent.replaySystem.replayTimestamp,
  });

  if (flagValue) {
    assert.equal(chart.replaySystem.fullRawData, parent.replaySystem.fullRawData,
      'flag-on bridge replayEnter restores replay master alias');
    assert.equal(chart._panelFullRawData, parent._panelFullRawData,
      'flag-on bridge replayEnter restores panel master alias');
    return;
  }

  assertDistinctScalarCopy(chart.replaySystem.fullRawData, parent.replaySystem.fullRawData,
    'bridge replayEnter replay master');
  assertDistinctScalarCopy(chart._panelFullRawData, parent._panelFullRawData,
    'bridge replayEnter panel master');
}

function assertSourceShape(text = SOURCE) {
  assert.ok(text.includes(SWITCH), 'reserved switch is wired');
  assert.equal(methodSource(text, '_mcRawDataCopyDisabled').includes('hasOwnProperty'), false,
    'switch must not use hasOwnProperty');
  assert.equal((text.match(/_mcCopySamePairFullRawData\(/g) || []).length, 10,
    'nine call sites plus method definition should route same-pair copies');
  assert.equal((text.match(/_mcDetachFullRawDataCopy\(/g) || []).length, 3,
    'two detach call sites plus method definition should route detach copies');
}

function assertBridgeSourceShape(text = BRIDGE_SOURCE) {
  assert.ok(text.includes(SWITCH), 'bridge uses the same rawdata copy switch');
  assert.equal((text.match(/copySamePairFullRawDataForBridge\(/g) || []).length, 4,
    'bridge helper plus three rejected handoffs should route same-pair copies');
  assert.equal(/fullRawData\s*=\s*prs\.fullRawData/.test(text), false,
    'bridge must not directly alias parent replay fullRawData');
  assert.equal(/_panelFullRawData\s*=\s*pc\._panelFullRawData/.test(text), false,
    'bridge must not directly alias parent panel full raw data');
}

function acceptanceOracle(text = SOURCE) {
  assertSourceShape(text);
  assertMirrorHostTfSwitchCopies(text);
  assertMirrorViewportCopies(text);
  assertSyncFromParentCopies(text);
  assertParentNativeBootCopies(text);
  assertDetachCopiesBarObjects(text);
  assertSwitchFourState(text);
  assertCloneBound(text);
}

test('Leak D: same-pair fullRawData handoffs own bounded scalar copies by default', () => {
  assertMirrorHostTfSwitchCopies();
  assertMirrorViewportCopies();
  assertSyncFromParentCopies();
  assertParentNativeBootCopies();
  note('default-breaks-same-pair-identity', true);
});

test('Leak D: detach copies break mutable bar identity', () => {
  assertDetachCopiesBarObjects();
  note('detach-breaks-bar-identity', true);
});

test('Leak D: rawdata copy switch is four-state, truthy, and per-call', () => {
  assertSwitchFourState();
  assertMirrorHostTfSwitchCopies(SOURCE, true);
  assertMirrorViewportCopies(SOURCE, 'legacy');
  assertSyncFromParentCopies(SOURCE, true);
  assertParentNativeBootCopies(SOURCE, 1);
  assertDetachCopiesBarObjects(SOURCE, true);
  note('switch-four-state-truthiness', true);
});

test('Leak D: scalar clone is capped and drops nested payloads', () => {
  assertCloneBound();
});

test('Leak D: structural call-site and neuter-red coverage', () => {
  acceptanceOracle();
  assertBridgeSourceShape();

  const mutants = [
    {
      name: 'same-pair-helper-returns-alias',
      source: replaceOne(
        SOURCE,
        'return this._mcRawDataCopyDisabled() ? source : this._mcCloneRawDataBars(source);',
        'return source;',
        'same-pair helper mutant',
      ),
    },
    {
      name: 'detach-helper-restores-shallow-slice',
      source: replaceOne(
        SOURCE,
        'return this._mcRawDataCopyDisabled() ? source.slice() : this._mcCloneRawDataBars(source);',
        'return source.slice();',
        'detach helper mutant',
      ),
    },
    {
      name: 'nested-fields-retained',
      source: replaceOne(
        SOURCE,
        '    _mcScalarCloneRawBar(value) {\n        if (!value || typeof value !== \'object\') return null;\n        const out = {};\n        for (const k of Object.keys(value)) {\n            const v = value[k];\n            if (v == null || typeof v !== \'object\') out[k] = v;\n        }\n        return out;\n    }',
        '    _mcScalarCloneRawBar(value) {\n        if (!value || typeof value !== \'object\') return null;\n        const out = {};\n        for (const k of Object.keys(value)) {\n            const v = value[k];\n            out[k] = v;\n        }\n        return out;\n    }',
        'nested clone mutant',
      ),
    },
    {
      name: 'strict-true-switch',
      source: replaceOne(
        SOURCE,
        'return !!(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_RAWDATA_COPY_V1);',
        'return !!(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_RAWDATA_COPY_V1 === true);',
        'strict switch mutant',
      ),
    },
    {
      name: 'cap-removed',
      source: replaceOne(
        SOURCE,
        'const start = Number.isFinite(limit) && limit > 0\n            ? Math.max(0, source.length - limit)\n            : 0;',
        'const start = 0;',
        'cap mutant',
      ),
    },
    {
      name: 'viewport-panel-site-aliased',
      source: (() => {
        const needle = 'this._panelFullRawData = this._mcCopySamePairFullRawData(parent._panelFullRawData);';
        assert.equal(SOURCE.split(needle).length - 1, 3, 'parent panel alias mutant anchor count');
        return SOURCE.split(needle).join('this._panelFullRawData = parent._panelFullRawData;');
      })(),
    },
    {
      name: 'sync-from-parent-master-site-aliased',
      source: replaceOne(
        SOURCE,
        '            if (Array.isArray(parent._panelFullRawData) && parent._panelFullRawData.length > 0) {\n                this._panelFullRawData = this._mcCopySamePairFullRawData(parent._panelFullRawData);\n            } else {\n                this._panelFullRawData = this._mcCopySamePairFullRawData(master);\n            }',
        '            if (Array.isArray(parent._panelFullRawData) && parent._panelFullRawData.length > 0) {\n                this._panelFullRawData = parent._panelFullRawData;\n            } else {\n                this._panelFullRawData = master.slice();\n            }',
        'sync-from-parent mutant',
      ),
    },
  ];

  for (const mutant of mutants) {
    assert.throws(() => acceptanceOracle(mutant.source), undefined, `${mutant.name} must be killed`);
    note(`mutant-killed:${mutant.name}`, true);
  }

  const bridgeMutants = [
    {
      name: 'bridge-replay-site-aliased',
      source: replaceOne(
        BRIDGE_SOURCE,
        'rs.fullRawData = copySamePairFullRawDataForBridge(ch, prs.fullRawData);',
        'rs.fullRawData = prs.fullRawData;',
        'bridge replay mutant',
      ),
    },
    {
      name: 'bridge-panel-site-aliased',
      source: replaceOne(
        BRIDGE_SOURCE,
        'ch._panelFullRawData = copySamePairFullRawDataForBridge(ch, pc._panelFullRawData);',
        'ch._panelFullRawData = pc._panelFullRawData;',
        'bridge panel mutant',
      ),
    },
  ];

  for (const mutant of bridgeMutants) {
    assert.throws(() => assertBridgeSourceShape(mutant.source), undefined, `${mutant.name} must be killed`);
    note(`mutant-killed:${mutant.name}`, true);
  }
});

test('Leak D: homepage chart.js mirror is byte-identical', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${sha256(chart)}`);
  assert.equal(sha256(chart), sha256(mirror));
});

test('Leak D: bridge replayEnter same-pair mirrors own scalar copies', async () => {
  await assertBridgeReplayEnterCopies();
  await assertBridgeReplayEnterCopies(true);
  note('bridge-replayEnter-breaks-parent-identity', true);
});

test('Leak D: homepage panel-cmd-bridge mirror is byte-identical', () => {
  const bridge = fs.readFileSync(BRIDGE_JS);
  const mirror = fs.readFileSync(BRIDGE_MIRROR);
  note('bridge-mirror-byte-identical', bridge.equals(mirror), `sha256=${sha256(bridge)}`);
  assert.equal(sha256(bridge), sha256(mirror));
});
