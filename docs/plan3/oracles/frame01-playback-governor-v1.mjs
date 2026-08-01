import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SWITCH = '__TALARIA_FRAME_GOV_V1';
const DEFECT = 'FRAME-01-PLAYBACK-GOVERNOR-EXEMPTION';
const VACUITY = 'VAC-01';
const FOCUSED_INTERVAL_MS = 1000 / 30;

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    const mirror = path.join(cursor, 'homepage', 'public', 'chart', 'chart.js');
    if (fs.existsSync(chart) && fs.existsSync(mirror)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`ANCHOR_BROKEN: method ${name} missing`);
  return match[0].replace(/\n+$/, '\n');
}

function makePlaybackHarness(source) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.window.parent = sandbox.window;
  sandbox.window.top = sandbox.window;
  vm.createContext(sandbox);

  const body = [
    methodSource(source, '_frameGovEnabled'),
    methodSource(source, '_isReplayPlaybackRendering'),
    methodSource(source, '_isInteractionFastRender'),
    methodSource(source, '_frameGovInputFastPathActive'),
    methodSource(source, '_frameGovPaintIntervalMs'),
    methodSource(source, '_frameGovShouldPaint'),
  ].join('\n');

  vm.runInContext(`
const FRAME_GOV_SWITCH = '${SWITCH}';
const FRAME_GOV_FOCUSED_INTERVAL_MS = 1000 / 30;
const FRAME_GOV_NONFOCUSED_INTERVAL_MS = 1000 / 15;
class Chart {
    constructor() {
        this.replaySystem = { isActive: true, isPlaying: true };
        this._pendingCrosshairMoveEvent = null;
        this._crosshairTooltipRaf = null;
        this._chartPanRenderLoopActive = false;
        this._wheelBurstFinalPass = false;
        this._axisZoomFinalizePass = false;
        this._separatePanelResizeFinalizePass = false;
        this.drag = null;
        this._frameGovLastPaintAt = 1000;
    }
    _getMultichartPanelId() { return 'A'; }
    _getFocusedMultichartPanelId() { return 'A'; }
    _isPanSyncFollowBurst() { return false; }
    _isChartViewPanning() { return false; }
    _isWheelZoomBurst() { return false; }
    _isAxisZoomDragging() { return false; }
    _isSeparatePanelResizing() { return false; }
    _isChartPanDragging() { return false; }
${body}
}
globalThis.chart = new Chart();
`, sandbox);

  return sandbox.chart;
}

function evaluateSource(source, label) {
  const chart = makePlaybackHarness(source);
  const replayPlayback = chart._isReplayPlaybackRendering();
  const inputFast = chart._frameGovInputFastPathActive();
  const paintIntervalMs = chart._frameGovPaintIntervalMs();
  const paintsAt16ms = chart._frameGovShouldPaint(1016);
  const cappedDuringPlayback = replayPlayback
    && !inputFast
    && paintIntervalMs >= FOCUSED_INTERVAL_MS
    && paintsAt16ms === false;

  return {
    label,
    replayPlayback,
    inputFast,
    paintIntervalMs,
    paintsAt16ms,
    expectedFocusedIntervalMs: FOCUSED_INTERVAL_MS,
    status: cappedDuringPlayback ? 'GREEN' : 'RED',
  };
}

export function runFrame01PlaybackGovernorOracle() {
  const root = findRoot(path.dirname(fileURLToPath(import.meta.url)));
  const files = [
    ['canonical', path.join(root, 'chart v 1.4', 'chart', 'chart.js')],
    ['homepageMirror', path.join(root, 'homepage', 'public', 'chart', 'chart.js')],
  ];
  const results = files.map(([label, file]) => evaluateSource(fs.readFileSync(file, 'utf8'), label));
  const status = results.every((result) => result.status === 'GREEN') ? 'GREEN' : 'RED';
  return {
    oracle: 'frame01-playback-governor-v1',
    defect: DEFECT,
    vacuityClass: VACUITY,
    status,
    requirement: 'Replay playback must be governed by the FRAME-01 focused/non-focused cadence tier, not classified as input-fast.',
    redMeaning: 'Playback is classified input-fast, so the frame governor interval is 0 and the 30 fps cap does not apply during the soak workload.',
    results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runFrame01PlaybackGovernorOracle();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'GREEN') process.exitCode = 1;
}
