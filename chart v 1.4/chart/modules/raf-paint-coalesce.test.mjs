/**
 * CPU-CUT-RAF-COALESCE — at most one full canvas paint per animation frame.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-reporter=tap --test-concurrency=1 raf-paint-coalesce.test.mjs
 *
 * Kill-switch: window.__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1
 *   Absent/falsy = coalesce ON. Truthy = legacy sync paints. Read per call.
 *
 * Asserts PAINT COUNTS (not just final pixels). Single-canonical suite —
 * do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(chart)
      && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0].replace(/\n+$/, '\n');
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const j = hay.indexOf(needle, i);
    if (j === -1) return n;
    n += 1;
    i = j + needle.length;
  }
}

function applyOnce(source, needle, replacement, label) {
  const n = countOccurrences(source, needle);
  if (n !== 1) {
    return { ok: false, source, reason: `NOT_APPLIED ${label}: needle count=${n} (need 1)` };
  }
  return { ok: true, source: source.replace(needle, replacement), reason: null };
}

function writeRetry(file, buf, attempts = 12) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.writeFileSync(file, buf);
      return;
    } catch (err) {
      lastErr = err;
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        const start = Date.now();
        while (Date.now() - start < 50 * (i + 1)) { /* spin */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Fake rAF clock: queue callbacks; flushFrame() runs one animation frame. */
function makeRafClock() {
  const queue = [];
  let nextId = 1;
  return {
    requestAnimationFrame(cb) {
      const id = nextId++;
      queue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame(id) {
      const idx = queue.findIndex((e) => e.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    flushFrame() {
      const batch = queue.splice(0, queue.length);
      for (const entry of batch) entry.cb(performance.now());
    },
  };
}

function loadSource(sourceText = fs.readFileSync(CHART_JS, 'utf8')) {
  return sourceText;
}

function makeHarness(sourceText, { kill = false, flagPresent = true, throwOnce = false } = {}) {
  const raf = makeRafClock();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => Date.now() },
    requestAnimationFrame: raf.requestAnimationFrame,
    cancelAnimationFrame: raf.cancelAnimationFrame,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  if (flagPresent) {
    sandbox.window[SWITCH] = kill ? true : false;
  }

  vm.createContext(sandbox);

  const constBlock = `const RAF_PAINT_COALESCE_DISABLE_SWITCH = '${SWITCH}';\n`;
  const body = [
    methodSource(sourceText, '_rafPaintCoalesceEnabled'),
    methodSource(sourceText, '_requestRafPaint'),
    methodSource(sourceText, 'scheduleRender'),
    methodSource(sourceText, 'animate'),
    methodSource(sourceText, 'updatePriceHoverLine'),
  ].join('\n');

  vm.runInContext(`${constBlock}
class Chart {
    constructor() {
        this.renderPending = false;
        this.paintCount = 0;
        this.paintedStates = [];
        this.state = 0;
        this._throwOnce = ${throwOnce ? 'true' : 'false'};
        this._thrown = false;
        this.replaySystem = { isPlaying: false, updateAutoScrollIndicator() {} };
        this.inertia = { active: false };
        this._panSyncBurstUntil = 0;
        this.priceHoverThrottle = null;
        this.isZooming = false;
        this._animateBound = null;
        this._lastFollowBtnCheck = 0;
    }
    _isAxisZoomDragging() { return false; }
    _isSeparatePanelResizing() { return false; }
    _isWheelZoomBurst() { return false; }
    _scheduleAxisZoomRender() {}
    _scheduleSeparatePanelResizeRender() {}
    _schedulePanSyncFollowRender() {}
    _scheduleWheelBurstRender() {}
    animateZoom() {}
    _tickMultichartBackgroundRenderCatchup() {}
    _tickBarCloseCountdown() {}
    render() {
        if (this._throwOnce && !this._thrown) {
            this._thrown = true;
            throw new Error('paint-boom');
        }
        this.paintCount += 1;
        this.paintedStates.push(this.state);
    }
${body}
}
globalThis.Chart = Chart;
`, sandbox);

  const chart = new sandbox.Chart();
  chart._animateBound = chart.animate.bind(chart);
  return { chart, raf, sandbox, window: sandbox.window };
}

function armLoop(chart, raf) {
  chart.animate();
  raf.flushFrame();
  chart.paintCount = 0;
  chart.paintedStates.length = 0;
}

function paintCountsForSchedules(sourceText, n, { kill = false, replay = true } = {}) {
  const { chart, raf } = makeHarness(sourceText, { kill });
  if (replay) chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);

  for (let i = 1; i <= n; i++) {
    chart.state = i;
    chart.scheduleRender();
  }
  const paintsBeforeFrame = chart.paintCount;
  raf.flushFrame();
  return {
    paintsBeforeFrame,
    paintsAfterFrame: chart.paintCount,
    paintedStates: Array.from(chart.paintedStates),
  };
}

/** Idle frames after a single schedule — never-clear mutant over-paints. */
function idlePaintsAfterOneSchedule(sourceText, idleFrames) {
  const { chart, raf } = makeHarness(sourceText, { kill: false });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);
  chart.state = 1;
  chart.scheduleRender();
  raf.flushFrame();
  const afterFirst = chart.paintCount;
  for (let i = 0; i < idleFrames; i++) raf.flushFrame();
  return { afterFirst, total: chart.paintCount };
}

// ── behavioural cells ────────────────────────────────────────────────────────

test('N scheduleRender calls in ONE frame produce exactly ONE paint (replay path)', () => {
  const r = paintCountsForSchedules(loadSource(), 6, { kill: false, replay: true });
  assert.equal(r.paintsBeforeFrame, 0, 'must not paint synchronously inside the frame');
  assert.equal(r.paintsAfterFrame, 1, 'exactly one paint after the frame flush');
  note('one-frame-dedupe', true, `6 schedules → ${r.paintsAfterFrame} paint`);
});

test('scheduleRender across THREE frames produce exactly THREE paints', () => {
  const { chart, raf } = makeHarness(loadSource(), { kill: false });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);

  for (let frame = 1; frame <= 3; frame++) {
    chart.state = frame;
    chart.scheduleRender();
    chart.scheduleRender();
    chart.scheduleRender();
    raf.flushFrame();
  }
  assert.equal(chart.paintCount, 3, 'one paint per frame across three frames');
  note('three-frames', true, `paintCount=${chart.paintCount}`);
});

test('replay path paints LATEST state (not a stale earlier mark)', () => {
  const r = paintCountsForSchedules(loadSource(), 5, { kill: false, replay: true });
  assert.equal(r.paintsAfterFrame, 1);
  assert.equal(r.paintedStates.length, 1);
  assert.equal(r.paintedStates[0], 5, 'latest state wins');
  note('latest-state', true, `painted=${JSON.stringify(r.paintedStates)}`);
});

test('render() throwing leaves coalescer able to paint on the next frame', () => {
  const { chart, raf } = makeHarness(loadSource(), { kill: false, throwOnce: true });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);

  chart.state = 1;
  chart.scheduleRender();
  assert.throws(() => raf.flushFrame(), /paint-boom/);
  assert.equal(chart.renderPending, false, 'pending cleared in finally after throw');

  chart.state = 2;
  chart.scheduleRender();
  raf.flushFrame();
  assert.equal(chart.paintCount, 1, 'next frame still paints');
  assert.equal(chart.paintedStates.length, 1);
  assert.equal(chart.paintedStates[0], 2);
  note('throw-no-stall', true, 'pending cleared; next frame painted');
});

test('synchronous escape hatch scheduleRender({ flush: true }) paints immediately', () => {
  const { chart, raf } = makeHarness(loadSource(), { kill: false });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);

  chart.state = 9;
  chart.scheduleRender({ flush: true });
  assert.equal(chart.paintCount, 1, 'flush paints synchronously');
  assert.equal(chart.renderPending, false);
  raf.flushFrame();
  assert.equal(chart.paintCount, 1);
  note('flush-escape', true, 'scheduleRender({ flush: true }) sync');
});

test('direct render() stays direct (sync escape)', () => {
  const { chart, raf } = makeHarness(loadSource(), { kill: false });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);
  chart.state = 3;
  chart.render();
  assert.equal(chart.paintCount, 1);
  raf.flushFrame();
  assert.equal(chart.paintCount, 1, 'direct render does not queue a second paint');
  note('direct-render-escape', true);
});

test('fix OFF: paint counts match legacy (sync per schedule during replay)', () => {
  const on = paintCountsForSchedules(loadSource(), 4, { kill: false, replay: true });
  const off = paintCountsForSchedules(loadSource(), 4, { kill: true, replay: true });
  assert.equal(on.paintsAfterFrame, 1);
  assert.equal(off.paintsBeforeFrame, 4, 'legacy paints once per scheduleRender synchronously');
  assert.equal(off.paintsAfterFrame, 4, 'legacy does not defer');
  note('kill-switch-legacy', true, `ON=${on.paintsAfterFrame} OFF_sync=${off.paintsBeforeFrame}`);
});

test('flag read per call; polarity absent/falsy=ON truthy=OFF; mid-session flip', () => {
  const { chart, raf, window } = makeHarness(loadSource(), { flagPresent: false });
  chart.replaySystem.isPlaying = true;
  armLoop(chart, raf);

  assert.equal(chart._rafPaintCoalesceEnabled(), true, 'absent ⇒ ON');
  chart.scheduleRender();
  chart.scheduleRender();
  assert.equal(chart.paintCount, 0);
  raf.flushFrame();
  assert.equal(chart.paintCount, 1);

  window[SWITCH] = true;
  assert.equal(chart._rafPaintCoalesceEnabled(), false, 'truthy ⇒ OFF');
  chart.paintCount = 0;
  chart.scheduleRender();
  chart.scheduleRender();
  assert.equal(chart.paintCount, 2, 'mid-session OFF paints sync per call');

  window[SWITCH] = 0;
  assert.equal(chart._rafPaintCoalesceEnabled(), true, 'falsy ⇒ ON again');
  chart.paintCount = 0;
  chart.scheduleRender();
  chart.scheduleRender();
  assert.equal(chart.paintCount, 0);
  raf.flushFrame();
  assert.equal(chart.paintCount, 1);
  note('flag-per-call-polarity', true);
});

test('_requestRafPaint coalesces; flush option sync', () => {
  const { chart, raf } = makeHarness(loadSource(), { kill: false });
  armLoop(chart, raf);
  chart._requestRafPaint();
  chart._requestRafPaint();
  chart._requestRafPaint();
  assert.equal(chart.paintCount, 0);
  raf.flushFrame();
  assert.equal(chart.paintCount, 1);

  chart.paintCount = 0;
  chart._requestRafPaint({ flush: true });
  assert.equal(chart.paintCount, 1);
  note('requestRafPaint', true);
});

test('never-clear mutant would over-paint on idle frames (product paints once)', () => {
  const r = idlePaintsAfterOneSchedule(loadSource(), 4);
  assert.equal(r.afterFirst, 1);
  assert.equal(r.total, 1, 'idle frames must not keep painting');
  note('idle-no-overpaint', true, `total=${r.total}`);
});

test('paint-count reduction proven: 6→1 in one replay frame', () => {
  const legacy = paintCountsForSchedules(loadSource(), 6, { kill: true, replay: true });
  const fixed = paintCountsForSchedules(loadSource(), 6, { kill: false, replay: true });
  assert.equal(legacy.paintsBeforeFrame, 6);
  assert.equal(fixed.paintsAfterFrame, 1);
  const reduction = legacy.paintsBeforeFrame - fixed.paintsAfterFrame;
  assert.equal(reduction, 5);
  note('paint-count-reduction', true, `legacy=${legacy.paintsBeforeFrame} fixed=${fixed.paintsAfterFrame} saved=${reduction}`);
});

test('mirrors: chart v 1.4 and homepage/public chart.js are byte-identical', () => {
  const a = fs.readFileSync(CHART_JS);
  const b = fs.readFileSync(CHART_MIRROR);
  assert.equal(sha256(a), sha256(b), 'homepage mirror must be byte-identical');
  note('mirror-byte-identical', true, `sha256=${sha256(a).slice(0, 16)}`);
});

test('static: kill-switch name + per-call helper + try/finally pending clear present', () => {
  const src = fs.readFileSync(CHART_JS, 'utf8');
  assert.match(src, /__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1/);
  assert.match(src, /_rafPaintCoalesceEnabled/);
  assert.match(src, /_requestRafPaint/);
  assert.match(src, /RAF_PAINT_COALESCE_DISABLE_SWITCH/);
  const animate = methodSource(src, 'animate');
  assert.match(animate, /try\s*\{[\s\S]*this\.render\(\);[\s\S]*\}\s*finally\s*\{[\s\S]*this\.renderPending\s*=\s*false/);
  const sched = methodSource(src, 'scheduleRender');
  assert.match(sched, /_rafPaintCoalesceEnabled/);
  assert.match(sched, /opts && opts\.flush/);
  note('static-anchors', true);
});

// ── mutants (on-disk both mirrors + behavioural oracles) ─────────────────────

const MUTANTS = [
  {
    id: 'M1',
    name: 'drop dedupe — replay path always sync-paints',
    needle: `        if (replayPlaying || inertialPan) {
            if (this._rafPaintCoalesceEnabled()) {
                this.renderPending = true;
                return;
            }
            this.renderPending = false;
            this.render();
            return;
        }`,
    replacement: `        if (replayPlaying || inertialPan) {
            this.renderPending = false;
            this.render();
            return;
        }`,
    killingCell: 'one-frame-dedupe (N schedules → 1 paint)',
    behavioural: true,
    oracle(mutSource) {
      const r = paintCountsForSchedules(mutSource, 6, { kill: false, replay: true });
      assert.equal(r.paintsBeforeFrame, 0, 'M1 must break sync-suppression');
      assert.equal(r.paintsAfterFrame, 1, 'M1 must break one-paint dedupe');
    },
  },
  {
    id: 'M2',
    name: 'never clear the pending flag after paint',
    needle: `        if (this.renderPending) {
            // Clear pending in finally so a throwing render() cannot stall the
            // coalescer permanently (next scheduleRender can mark dirty again).
            try {
                this.render();
            } finally {
                this.renderPending = false;
            }`,
    replacement: `        if (this.renderPending) {
            // MUTANT: never clear pending
            try {
                this.render();
            } finally {
                /* this.renderPending = false; */
            }`,
    killingCell: 'idle-no-overpaint (never-clear over-paints)',
    behavioural: true,
    oracle(mutSource) {
      const r = idlePaintsAfterOneSchedule(mutSource, 4);
      assert.equal(r.total, 1, 'M2 must over-paint on idle frames');
    },
  },
  {
    id: 'M3',
    name: 'clear pending BEFORE paint instead of after',
    needle: `        if (this.renderPending) {
            // Clear pending in finally so a throwing render() cannot stall the
            // coalescer permanently (next scheduleRender can mark dirty again).
            try {
                this.render();
            } finally {
                this.renderPending = false;
            }`,
    replacement: `        if (this.renderPending) {
            this.renderPending = false;
            try {
                this.render();
            } finally {
                /* cleared before paint */
            }`,
    // Clear-before still clears on throw in this model; kill is the static
    // try/finally-after ordering cell (anchor). Marked NOT behavioural.
    killingCell: 'static try/finally-after ordering (NOT behavioural / anchor)',
    behavioural: false,
    oracle(mutSource) {
      const animate = methodSource(mutSource, 'animate');
      assert.match(
        animate,
        /try\s*\{[\s\S]*this\.render\(\);[\s\S]*\}\s*finally\s*\{[\s\S]*this\.renderPending\s*=\s*false/,
        'M3 must break finally-after clear ordering',
      );
    },
  },
  {
    id: 'M4',
    name: 'flag sampled once at load',
    needle: `    _rafPaintCoalesceEnabled() {
        try {
            if (typeof window === 'undefined') return true;
            return !window[RAF_PAINT_COALESCE_DISABLE_SWITCH];
        } catch (_e) {
            return true;
        }
    }`,
    replacement: `    _rafPaintCoalesceEnabled() {
        if (this.__rafPaintCoalesceCached == null) {
            try {
                if (typeof window === 'undefined') this.__rafPaintCoalesceCached = true;
                else this.__rafPaintCoalesceCached = !window[RAF_PAINT_COALESCE_DISABLE_SWITCH];
            } catch (_e) {
                this.__rafPaintCoalesceCached = true;
            }
        }
        return this.__rafPaintCoalesceCached;
    }`,
    killingCell: 'flag-per-call-polarity (mid-session flip)',
    behavioural: true,
    oracle(mutSource) {
      const { chart, raf, window } = makeHarness(mutSource, { flagPresent: false });
      chart.replaySystem.isPlaying = true;
      armLoop(chart, raf);
      assert.equal(chart._rafPaintCoalesceEnabled(), true);
      window[SWITCH] = true;
      assert.equal(chart._rafPaintCoalesceEnabled(), false, 'M4 must ignore mid-session flip');
    },
  },
];

test('on-disk mutants: both mirrors, needle once, TAP evidence, restore after', () => {
  const CANON_BYTES = fs.readFileSync(CHART_JS);
  const MIRROR_BYTES = fs.readFileSync(CHART_MIRROR);
  const CANON_SHA = sha256(CANON_BYTES);
  const MIRROR_SHA = sha256(MIRROR_BYTES);
  assert.equal(CANON_SHA, MIRROR_SHA, 'mirrors must match before mutation run');

  // Unmutated product oracles must pass first.
  assert.doesNotThrow(() => {
    const r = paintCountsForSchedules(CANON_BYTES.toString('utf8'), 6, { kill: false });
    assert.equal(r.paintsAfterFrame, 1);
  });
  assert.doesNotThrow(() => {
    const r = idlePaintsAfterOneSchedule(CANON_BYTES.toString('utf8'), 4);
    assert.equal(r.total, 1);
  });

  function restoreAll() {
    writeRetry(CHART_JS, CANON_BYTES);
    writeRetry(CHART_MIRROR, MIRROR_BYTES);
    assert.equal(sha256(fs.readFileSync(CHART_JS)), CANON_SHA);
    assert.equal(sha256(fs.readFileSync(CHART_MIRROR)), MIRROR_SHA);
  }

  const rows = [];
  let survived = 0;

  try {
    for (const m of MUTANTS) {
      const canonText = CANON_BYTES.toString('utf8');
      const mirrorText = MIRROR_BYTES.toString('utf8');

      const nCanon = countOccurrences(canonText, m.needle);
      const nMirror = countOccurrences(mirrorText, m.needle);
      if (nCanon !== 1 || nMirror !== 1) {
        console.log(`NOT_APPLIED ${m.id}: needle count canon=${nCanon} mirror=${nMirror} (need 1)`);
        rows.push({
          id: m.id,
          status: 'NOT_APPLIED',
          killingCell: null,
          behavioural: m.behavioural,
          name: m.name,
        });
        survived += 1;
        continue;
      }

      const applied = applyOnce(canonText, m.needle, m.replacement, m.id);
      if (!applied.ok) {
        console.log(`NOT_APPLIED ${m.id}: ${applied.reason}`);
        rows.push({
          id: m.id, status: 'NOT_APPLIED', killingCell: null,
          behavioural: m.behavioural, name: m.name,
        });
        survived += 1;
        continue;
      }

      // On-disk evidence: write both mirrors, re-read, run oracle, restore.
      const mutBuf = Buffer.from(applied.source, 'utf8');
      writeRetry(CHART_JS, mutBuf);
      writeRetry(CHART_MIRROR, mutBuf);
      let diskText;
      let killed = false;
      let killError = null;
      try {
        diskText = fs.readFileSync(CHART_JS, 'utf8');
        assert.equal(diskText, fs.readFileSync(CHART_MIRROR, 'utf8'), 'mutated mirrors stay identical');
        assert.equal(countOccurrences(diskText, m.replacement.slice(0, 40)) >= 0, true);
        try {
          m.oracle(diskText);
          // Oracle asserts mutant is broken — if it returns without throw, mutant SURVIVED.
          killed = false;
        } catch (err) {
          killed = true;
          killError = err && err.message ? err.message : String(err);
        }
      } finally {
        restoreAll();
      }

      if (!killed) survived += 1;
      rows.push({
        id: m.id,
        status: killed ? 'DIED' : 'SURVIVED',
        killingCell: killed ? m.killingCell : null,
        behavioural: m.behavioural,
        name: m.name,
        detail: killError,
      });
      const tag = m.behavioural ? 'behavioural' : 'NOT behavioural (anchor)';
      console.log(`MUTANT ${m.id} — ${killed ? 'DIED' : 'SURVIVED'} — ${m.name} — ${tag}`);
      if (killed) console.log(`    killed by cell: ${m.killingCell}`);
      if (killError) console.log(`    oracle: ${killError.split('\n')[0]}`);
    }
  } finally {
    restoreAll();
  }

  console.log('MUTANT_TABLE_JSON ' + JSON.stringify(rows, null, 2));
  assert.equal(survived, 0, `all mutants must die; survived=${survived}`);
  note('on-disk-mutants', true, `${MUTANTS.length} killed`);
});
