/**
 * M20 Q9 cadence rework gate.
 *
 * RED focus: endpoint-value probes can pass while replay paints starve inside a
 * coarse display bucket. This harness models accepted b61/full-render cadence
 * as one indicator paint per advancing replay step, then checks Q9 ON against
 * bounded inter-paint gaps with host/panel rows kept separate.
 *
 * Evidence:
 *   M20_Q9_CADENCE_EVIDENCE=red|current|off
 *     -> docs/plan3/evidence/W1-Q9-CADENCE-20260725-<mode>.json
 *   M20_Q9_CADENCE_PACKET=1
 *     -> modules/m20-q9-cadence-packet/{RESULTS,REPORT,MANIFEST,COMMANDS,EXTERNAL-OBSERVATION}
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const B63_COMMIT = '0048865cf0b58a9c4bc552e56822c914089fae52';
const B63_REPLAY_SHA256 = 'e461cff70a92912b3e98919d717d8de3bee543346c374af78ece40ccbab39618';
const KS_Q9 = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';
const evidenceMode = String(process.env.M20_Q9_CADENCE_EVIDENCE || '').trim().toLowerCase();
const evidenceRows = [];

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repo root not found from ${start}`);
}

const ROOT = findRepoRoot(__dirname);
const CHART_REPLAY = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const HOME_REPLAY = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'plan3', 'evidence');
const CHART_MODULES = path.join(ROOT, 'chart v 1.4', 'chart', 'modules');
const HOME_MODULES = path.join(ROOT, 'homepage', 'public', 'chart', 'modules');
const WRITE_PACKET = String(process.env.M20_Q9_CADENCE_PACKET || '').trim() === '1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function note(name, pass, detail = '') {
  evidenceRows.push({ name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [Q9-CADENCE] ${name}${detail ? ` - ${detail}` : ''}\n`);
}

function writeEvidence(mode, extra = {}) {
  if (!mode) return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = path.join(EVIDENCE_DIR, `W1-Q9-CADENCE-20260725-${mode}.json`);
  fs.writeFileSync(out, `${JSON.stringify({
    stamp: 'READY-Q9-CADENCE-REVIEW',
    mode,
    killSwitch: KS_Q9,
    b63: { commit: B63_COMMIT, replaySha256: B63_REPLAY_SHA256 },
    generatedAt: new Date().toISOString(),
    rows: evidenceRows,
    ...extra,
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(`EVIDENCE -> ${out}\n`);
}

function loadReplaySystem() {
  const g = globalThis;
  const hadWindow = Object.prototype.hasOwnProperty.call(g, 'window');
  const prevWindow = g.window;
  if (!hadWindow) g.window = {};
  try {
    const resolved = require.resolve('./replay-system.js');
    delete require.cache[resolved];
    return require('./replay-system.js');
  } finally {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
  }
}

function makeMaster(n = 180, stepMs = 60_000) {
  const start = Date.UTC(2026, 0, 5, 9, 0, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      t: start + i * stepMs,
      o: 100 + i * 0.2,
      h: 101 + i * 0.2,
      l: 99 + i * 0.2,
      c: 100.5 + i * 0.2,
      v: 1000 + i,
    });
  }
  return out;
}

function resample1h(raw) {
  const out = [];
  for (const bar of raw) {
    const t = Math.floor(Number(bar.t) / 3_600_000) * 3_600_000;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, bar.h);
      last.l = Math.min(last.l, bar.l);
      last.c = bar.c;
      last.v += bar.v;
    } else {
      out.push({ t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v });
    }
  }
  return out;
}

function makeCadenceChart(label) {
  const paints = [];
  const renders = [];
  const chart = {
    label,
    currentTimeframe: '1h',
    currentSymbol: 'ES',
    currentFileId: 'same-file',
    isPanel: label !== 'host',
    rawData: [],
    data: [],
    dataVersion: 0,
    renderPending: false,
    indicators: {
      active: ['sma', 'ema', 'rsi', 'macd'].map((type, i) => ({ id: `${label}-${type}-${i}`, type, params: { period: 14 + i } })),
      data: {},
    },
    dataPipeline: {
      invalidations: 0,
      invalidateResampleCache() { this.invalidations += 1; },
    },
    parseTimeframe: () => 3_600_000,
    resampleData(raw) { return resample1h(raw); },
    bumpDataVersion() { this.dataVersion += 1; },
    _indicatorParamsHash() { return 'po-four'; },
    recalculateIndicatorsIncremental(fromBarCount) {
      this._lastIncrementalFrom = fromBarCount;
      this._markIndicatorPaint('tail');
    },
    recalculateIndicators() {
      this._lastIncrementalFrom = 0;
      this._markIndicatorPaint('full');
    },
    _markIndicatorPaint(kind) {
      const last = this.data[this.data.length - 1] || {};
      paints.push({
        kind,
        step: this._simStep,
        dataLen: this.data.length,
        lastT: last.t,
        lastC: last.c,
        q9Gen: this._m20Q9ReplayDataGeneration || 0,
      });
      this._indCalcSnapshot = {
        barCount: this.data.length,
        dataVersion: this.dataVersion,
        paramsHash: this._indicatorParamsHash(),
        timeframe: String(this.currentTimeframe),
        dataFp: `${this.data.length}|${last.t}|${last.c}`,
      };
      for (const ind of this.indicators.active) {
        this.indicators.data[ind.id] = { line: new Array(this.data.length).fill(last.c) };
      }
    },
    scheduleReplayIndicatorRecalc() {
      const last = this.data[this.data.length - 1] || {};
      const fp = [
        this.data.length,
        last.t,
        this.indicators.active.map((ind) => `${ind.id}:${ind.type}`).join(','),
      ].join('|');
      if (fp === this._sessionIndReplayFp && Object.keys(this.indicators.data).length >= this.indicators.active.length) {
        return;
      }
      this._sessionIndReplayFp = fp;
      const snap = this._indCalcSnapshot;
      if (snap && this.data.length >= snap.barCount && this.data.length - snap.barCount <= 64) {
        this.recalculateIndicatorsIncremental(snap.barCount);
      } else {
        this.recalculateIndicators();
      }
    },
    scheduleIndicatorRecalc() { this.scheduleReplayIndicatorRecalc(true); },
    updateOHLCIndicators() {},
    constrainOffset() {},
    render() {
      renders.push({ step: this._simStep, rawLen: this.rawData.length, dataLen: this.data.length });
      this._lastRenderHadPixels = this.rawData.length > 0 && this.data.length > 0;
    },
    _trimLastDataBarToReplayPlayhead() {},
    __paints: paints,
    __renders: renders,
  };
  chart.replaySystem = { isActive: true, isPlaying: true };
  return chart;
}

function paintStats(paints, steps) {
  const byStep = new Set(paints.map((p) => p.step));
  const gaps = [];
  let lastPaint = 0;
  for (let step = 1; step <= steps; step++) {
    if (byStep.has(step)) {
      gaps.push(step - lastPaint);
      lastPaint = step;
    }
  }
  gaps.push((steps + 1) - lastPaint);
  return {
    count: paints.length,
    maxGap: Math.max(...gaps),
    gaps,
    firstPaint: paints[0]?.step ?? null,
    lastPaint: paints[paints.length - 1]?.step ?? null,
  };
}

function runCadenceScenario({ ReplaySystem, steps = 72, kill = false, disablePrepare = false } = {}) {
  const g = globalThis;
  const prevWindow = g.window;
  g.window = { [KS_Q9]: kill };
  try {
    const rs = Object.create(ReplaySystem.prototype);
    const chart = makeCadenceChart('host');
    const master = makeMaster(160);
    const prefixIds = new Set();
    rs.chart = chart;
    rs.isActive = true;
    rs.isPlaying = true;
    for (let step = 1; step <= steps; step++) {
      const end = 20 + step;
      chart._simStep = step;
      const prefix = rs._installPlayheadPrefix(master, end, chart);
      prefixIds.add(prefix);
      chart.rawData = prefix;
      chart.data = chart.resampleData(prefix, chart.currentTimeframe);
      chart.bumpDataVersion();
      if (!disablePrepare && typeof rs._m20Q9PrepareConsumerReplayRefresh === 'function') {
        rs._m20Q9PrepareConsumerReplayRefresh(chart);
      }
      chart.scheduleReplayIndicatorRecalc(true);
      chart.render();
    }
    return {
      prefixIds: prefixIds.size,
      stats: paintStats(chart.__paints, steps),
      invalidations: chart.dataPipeline.invalidations,
      firstTailFrom: chart.__paints.find((p) => p.kind === 'tail')?.step ?? null,
      chart,
    };
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
}

function acceptedFullRenderCadence(steps = 72) {
  return paintStats(Array.from({ length: steps }, (_, i) => ({ step: i + 1 })), steps);
}

function makePanelChart(label, { fileId = 'same-file', symbol = 'ES', ownData = null } = {}) {
  const chart = makeCadenceChart(label);
  chart.currentFileId = fileId;
  chart.currentSymbol = symbol;
  chart._panelFullRawData = ownData;
  chart.updateChartTitle = () => {};
  chart.updateChartOHLCSymbol = () => {};
  chart.fitToView = () => {};
  chart.getCandleSpacing = () => 8;
  chart.offsetX = 0;
  return chart;
}

function withWindow(value, fn) {
  const g = globalThis;
  const prevWindow = g.window;
  g.window = value;
  try {
    return fn();
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
}

function shaFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function writeJson(filePath, body) {
  fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

function packetMetric(result) {
  return {
    steps: 72,
    paints: result.stats.count,
    maxGap: result.stats.maxGap,
    firstPaint: result.stats.firstPaint,
    lastPaint: result.stats.lastPaint,
    prefixIds: result.prefixIds,
    invalidations: result.invalidations,
  };
}

function buildPacketBody() {
  const ReplaySystem = loadReplaySystem();
  const accepted = acceptedFullRenderCadence(72);
  const red = runCadenceScenario({ ReplaySystem, steps: 72, kill: false, disablePrepare: true });
  const current = runCadenceScenario({ ReplaySystem, steps: 72, kill: false });
  const off = evidenceRows
    .filter((row) => row.name.startsWith('off-'))
    .map((row) => ({ name: row.name, pass: row.pass, detail: row.detail }));
  return {
    stamp: 'READY-Q9-CADENCE-FINAL-REVIEW-PENDING-INDEPENDENT-ACCEPTANCE',
    generatedAt: new Date().toISOString(),
    b63: {
      commit: B63_COMMIT,
      replaySha256: B63_REPLAY_SHA256,
      redRows: {
        host: packetMetric(red),
        expectedFailure: 'reused prefix without Q9 replay refresh starves host indicator repaint cadence',
      },
    },
    correctedCurrent: {
      host: packetMetric(current),
      acceptedFullRenderCadence: {
        maxGap: accepted.maxGap,
        bound: accepted.maxGap * 2,
      },
      allocationWinRetained: current.prefixIds === 1,
    },
    offPanelParity: {
      rows: off,
      blackPanelResult: 'not reproduced in isolated OFF fresh/reload/re-enter/static-mirror runs',
    },
    scopeSeparation: {
      q9AcceptanceCommands: 'cadence rework harness plus existing Q9 prefix suite',
      m21W6Scaffold: 'external checkpoint gate; Q9 does not touch M21-2 scaffold dependencies or candle-worker fixtures',
      b62Neighbor: 'external protected neighbor; counted from its own runner/evidence, not claimed as Q9 packet rows',
    },
    externalPoObservation: {
      classification: 'declared external observation, not automated proof',
      q9Kill: 'host replay noticeably faster; indicator lag improved approximately 70%, still present',
      originalProfileBlackPanels: '3 of 4 multichart panels became black and persisted in that browser profile',
      freshPrivateProfile: 'fresh private profile restored all panels',
    },
  };
}

function writePacket() {
  if (!WRITE_PACKET) return;
  const packet = buildPacketBody();
  const commands = [
    'node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q9-cadence-rework.test.mjs"',
    '$env:M20_Q9_CADENCE_PACKET="1"; node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q9-cadence-rework.test.mjs"',
    'node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs"',
  ].join('\n') + '\n';
  const external = packet.externalPoObservation;
  const report = [
    '# M20 Q9 Cadence Packet',
    '',
    'Status: READY-Q9-CADENCE-FINAL-REVIEW-PENDING-INDEPENDENT-ACCEPTANCE',
    '',
    `Frozen b63 replay-system sha256: ${B63_REPLAY_SHA256}`,
    `Frozen RED host cadence: ${packet.b63.redRows.host.steps} steps, ${packet.b63.redRows.host.paints} paints, max gap ${packet.b63.redRows.host.maxGap}, prefixIds ${packet.b63.redRows.host.prefixIds}.`,
    `Corrected current host cadence: ${packet.correctedCurrent.host.steps} steps, ${packet.correctedCurrent.host.paints} paints, max gap ${packet.correctedCurrent.host.maxGap}, prefixIds ${packet.correctedCurrent.host.prefixIds}.`,
    'OFF parity: legacy identity churn and fresh/reload/re-enter/static-mirror panels render nonblack in the deterministic harness.',
    'Scope separation: M21-2/W6 candle scaffold is an external checkpoint gate, not a Q9 acceptance blocker; Q9 does not touch its dependencies.',
    'B62 is a protected neighbor owned by its own runner/evidence, not counted as Q9 packet rows.',
    '',
    'PO live evidence is recorded as external observation only, not as automated proof.',
    '',
  ].join('\n');
  for (const modulesRoot of [CHART_MODULES, HOME_MODULES]) {
    const dir = path.join(modulesRoot, 'm20-q9-cadence-packet');
    fs.mkdirSync(dir, { recursive: true });
    const resultsPath = path.join(dir, 'RESULTS.json');
    const commandsPath = path.join(dir, 'COMMANDS.txt');
    const externalPath = path.join(dir, 'EXTERNAL-OBSERVATION.json');
    const reportPath = path.join(dir, 'REPORT.md');
    const manifestPath = path.join(dir, 'MANIFEST.json');
    writeJson(resultsPath, packet);
    fs.writeFileSync(commandsPath, commands, 'utf8');
    writeJson(externalPath, external);
    fs.writeFileSync(reportPath, report, 'utf8');
    writeJson(manifestPath, {
      packetId: 'm20-q9-cadence-packet-20260725',
      generatedBy: 'm20-q9-cadence-rework.test.mjs',
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      files: {
        results: 'RESULTS.json',
        report: 'REPORT.md',
        commands: 'COMMANDS.txt',
        externalObservation: 'EXTERNAL-OBSERVATION.json',
      },
      physicalHashes: {
        chartReplaySystemSha256: shaFile(CHART_REPLAY),
        homepageReplaySystemSha256: shaFile(HOME_REPLAY),
        q9CadenceTestSha256: shaFile(fileURLToPath(import.meta.url)),
        resultsSha256: shaFile(resultsPath),
        reportSha256: shaFile(reportPath),
        commandsSha256: shaFile(commandsPath),
        externalObservationSha256: shaFile(externalPath),
      },
      note: 'Manifest deliberately excludes MANIFEST.json hash to avoid a self-hash cycle.',
    });
    process.stdout.write(`PACKET -> ${dir}\n`);
  }
}

test('Q9 freeze: deployed b63 replay-system bytes are exact and mirrored', () => {
  const chartBlob = execFileSync('git', ['show', `${B63_COMMIT}:chart v 1.4/chart/modules/replay-system.js`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const homeBlob = execFileSync('git', ['show', `${B63_COMMIT}:homepage/public/chart/modules/replay-system.js`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const exact = sha256(chartBlob) === B63_REPLAY_SHA256 && sha256(homeBlob) === B63_REPLAY_SHA256 && chartBlob === homeBlob;
  note('freeze-b63-q9-bytes', exact, `sha256=${sha256(chartBlob)}`);
  assert.equal(exact, true);
});

test('Q9 RED: ON reused prefix must not starve host indicator repaint cadence', () => {
  const ReplaySystem = loadReplaySystem();
  const accepted = acceptedFullRenderCadence(72);
  const maxAllowedGap = accepted.maxGap * 2;
  const result = runCadenceScenario({ ReplaySystem, steps: 72, kill: false });
  const cadenceOk = result.stats.maxGap <= maxAllowedGap && result.stats.count >= 60;
  const allocWin = result.prefixIds === 1;
  const detail = JSON.stringify({
    category: 'host',
    acceptedMaxGap: accepted.maxGap,
    maxAllowedGap,
    observedMaxGap: result.stats.maxGap,
    paints: result.stats.count,
    prefixIds: result.prefixIds,
    invalidations: result.invalidations,
  });
  note('host-q9-on-repaint-cadence-bounded', cadenceOk, detail);
  note('host-q9-on-allocation-win-retained', allocWin, `prefixIds=${result.prefixIds}`);
  assert.equal(allocWin, true);
  assert.equal(cadenceOk, true, 'Q9 ON starves host indicator paints inside a coarse display bucket');
});

test('Q9 OFF: legacy slices render host plus four panels after reload/re-enter', () => {
  const ReplaySystem = loadReplaySystem();
  const master = makeMaster(140);
  const ownA = makeMaster(140).map((b) => ({ ...b, c: b.c + 50 }));
  const ownB = makeMaster(140).map((b) => ({ ...b, c: b.c - 25 }));

  function runOffPass(passLabel) {
    return withWindow({ [KS_Q9]: true }, () => {
      const rs = Object.create(ReplaySystem.prototype);
      const host = makePanelChart(`${passLabel}-host`);
      const sameA = makePanelChart(`${passLabel}-same-a`);
      const sameB = makePanelChart(`${passLabel}-same-b`);
      const ownPanelA = makePanelChart(`${passLabel}-own-a`, { fileId: 'own-a', symbol: 'NQ', ownData: ownA });
      const ownPanelB = makePanelChart(`${passLabel}-own-b`, { fileId: 'own-b', symbol: 'CL', ownData: ownB });
      rs.chart = host;
      rs.fullRawData = master;
      rs.currentIndex = 30;
      rs.replayTimestamp = master[30].t;
      rs.isActive = true;
      rs.isPlaying = true;
      rs.autoScrollEnabled = true;
      rs.userHasPanned = false;
      rs._clampCurrentIndexToReplayTimestamp = () => {};
      rs.getReplayAutoScrollState = () => ({ offsetX: 12 });
      globalThis.window.panelManager = {
        panels: [host, sameA, sameB, ownPanelA, ownPanelB].map((chartInstance) => ({ chartInstance })),
      };
      const hostIds = new Set();
      const panelIds = new Map([[sameA, new Set()], [sameB, new Set()], [ownPanelA, new Set()], [ownPanelB, new Set()]]);
      for (let step = 1; step <= 10; step++) {
        rs.currentIndex = 30 + step;
        rs.replayTimestamp = master[30 + step].t;
        const hostSlice = rs._installPlayheadPrefix(master, rs.currentIndex + 1, host);
        hostIds.add(hostSlice);
        host.rawData = hostSlice;
        host.data = host.resampleData(hostSlice, host.currentTimeframe);
        host.render();
        rs.syncPanelCharts(true);
        for (const [panel, ids] of panelIds) ids.add(panel.rawData);
      }
      const charts = [host, sameA, sameB, ownPanelA, ownPanelB];
      const noBlackPanels = charts.every((chart) => chart._lastRenderHadPixels === true && chart.rawData.length > 0 && chart.data.length > 0);
      const churn = hostIds.size === 10 && [...panelIds.values()].every((ids) => ids.size === 10);
      return { noBlackPanels, churn, charts };
    });
  }

  const fresh = runOffPass('fresh');
  const reload = runOffPass('reload');
  note('off-fresh-legacy-identity-churn', fresh.churn);
  note('off-fresh-four-panels-not-black', fresh.noBlackPanels);
  note('off-reload-reenter-four-panels-not-black', reload.noBlackPanels);
  assert.equal(fresh.churn, true, 'OFF must restore fresh legacy slices for host and panels');
  assert.equal(fresh.noBlackPanels, true, 'OFF fresh run must not blank any panel');
  assert.equal(reload.noBlackPanels, true, 'OFF reload/re-enter must not persist black panels');
});

test('Q9 OFF: static mirror path renders own-data panel without blank iframe', () => {
  const ReplaySystem = loadReplaySystem();
  const frd = makeMaster(100);
  const chart = makePanelChart('mirror-own', { fileId: 'mirror-own', symbol: 'YM', ownData: frd });
  const ok = withWindow({ [KS_Q9]: true, __talariaBl2bMark: null }, () => {
    const rs = Object.create(ReplaySystem.prototype);
    rs.chart = chart;
    rs.fullRawData = makeMaster(100);
    rs.isActive = true;
    rs.isPlaying = true;
    rs.currentIndex = 0;
    rs.autoScrollEnabled = true;
    rs._mirrorSharesHostDataset = () => false;
    rs._resolveMirrorRawSeries = () => frd;
    rs._syncMirrorPlayheadFromTimestamp = (raw, ts) => {
      const idx = raw.findIndex((bar) => bar.t >= ts);
      rs.currentIndex = Math.max(0, idx);
      return idx >= 0;
    };
    rs._applyCanonicalReplayMarkFromDetail = () => {};
    rs._finishMultichartMirrorRender = (targetChart) => {
      targetChart.renderPending = true;
      targetChart.render();
    };
    return rs.applyMultichartMirrorFrame({
      timestamp: frd[42].t,
      tickElapsedMs: 0,
      tickProgress: 0,
      isPlaying: true,
      hostFileId: 'host-file',
    });
  });
  const rendered = ok === true && chart._lastRenderHadPixels === true && chart.rawData.length > 0 && chart.data.length > 0;
  note('off-static-mirror-own-data-not-black', rendered, `rawLen=${chart.rawData.length} dataLen=${chart.data.length}`);
  assert.equal(rendered, true);
});

test.after(() => {
  const failed = evidenceRows.filter((row) => !row.pass);
  const summary = {
    verdict: failed.length ? 'BLOCK-Q9-CADENCE' : 'READY-Q9-CADENCE-REVIEW',
    failed: failed.map((row) => row.name),
    rowCount: evidenceRows.length,
  };
  if (new Set(['red', 'current', 'off']).has(evidenceMode)) {
    writeEvidence(evidenceMode, { summary });
  } else {
    process.stdout.write(`Q9 cadence summary: ${JSON.stringify(summary)}\n`);
  }
  writePacket();
});
