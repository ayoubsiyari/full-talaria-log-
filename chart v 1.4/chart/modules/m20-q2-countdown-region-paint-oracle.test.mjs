/**
 * M20-Q2 countdown region-paint oracle — ghost / overdraw risk (W3 independent).
 *
 * NEW file — does NOT edit W4's m20-q1-q2-q8-idle-drains.test.mjs.
 * Dual-tree mirror required under homepage/public/chart/modules/.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q2-countdown-region-paint-oracle.test.mjs"
 *
 * Evidence:
 *   M20_Q2_ORACLE_EVIDENCE=red|green|kill → docs/plan3/evidence/W3-M20-Q2-ORACLE-*
 *
 * Status: PRELIMINARY-PENDING-FABLE-SIGNOFF
 * Role: independent W4 verification input (geometry re-anchor contract).
 *
 * Contract under test:
 *   - Stable same-geometry repaint MAY direct-paint the countdown/price badge.
 *   - Changed price-y / axis / rect / spread MUST full re-anchor (scheduleRender)
 *     and MUST record zero direct paints for that tick (prevents ghost/overdraw).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');
const HOMEPAGE_CHART = path.resolve(__dirname, '../../../homepage/public/chart');
const EVIDENCE_DIR = path.resolve(__dirname, '../../../docs/plan3/evidence');

const KS_Q2 = '__TALARIA_DISABLE_M20_Q2_COUNTDOWN_IDLE_RENDER_V1';
const evidenceMode = String(process.env.M20_Q2_ORACLE_EVIDENCE || '').toLowerCase();
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function read(relFromChart) {
  return fs.readFileSync(path.join(CHART_ROOT, relFromChart), 'utf8');
}

function readHome(rel) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, rel), 'utf8');
}

function extractMethodBody(src, methodName, maxLen = 2500) {
  const re = new RegExp(`\\r?\\n\\s*${methodName}\\s*\\([^)]*\\)\\s*\\{`);
  const m = src.match(re);
  if (!m || m.index == null) return '';
  return src.slice(m.index, m.index + maxLen);
}

/** Geometry fingerprint that must invalidate direct region paint. */
function fingerprintGeometry(g) {
  return [
    Number(g.priceY),
    Number(g.axisX),
    Number(g.rectX),
    Number(g.rectY),
    Number(g.rectW),
    Number(g.rectH),
    Number(g.spread),
  ].map((n) => (Number.isFinite(n) ? n.toFixed(3) : 'NaN')).join('|');
}

/**
 * Desired Q2 region-paint policy (oracle model — product should converge here).
 * Returns { mode: 'skip'|'direct'|'reanchor', directPaint, fullRender }.
 */
function decideCountdownPaint(state, next) {
  const fixOn = state.fixOn !== false;
  if (!fixOn) {
    return { mode: 'reanchor', directPaint: 0, fullRender: 1, reason: 'kill-switch-legacy' };
  }
  if (state.hidden) {
    return { mode: 'skip', directPaint: 0, fullRender: 0, reason: 'hidden' };
  }
  const nextFp = fingerprintGeometry(next.geometry);
  const text = String(next.text ?? '');
  const prevText = String(state.lastText ?? '');
  const prevFp = state.lastGeometryFp || null;
  const regionPainted = !!state.regionPainted;

  if (text === prevText && regionPainted && nextFp === prevFp) {
    return { mode: 'skip', directPaint: 0, fullRender: 0, reason: 'unchanged' };
  }

  const appearFlip = (!!prevText) !== (!!text);
  const geometryChanged = prevFp != null && nextFp !== prevFp;

  // Appear/disappear OR any price-y/axis/rect/spread change → full re-anchor.
  // Direct paint on changed geometry is the ghost/overdraw failure mode.
  if (appearFlip || geometryChanged) {
    return {
      mode: 'reanchor',
      directPaint: 0,
      fullRender: 1,
      reason: appearFlip ? 'appear-flip' : 'geometry-changed',
    };
  }

  // Stable geometry + text tick → direct region paint allowed.
  return { mode: 'direct', directPaint: 1, fullRender: 0, reason: 'stable-geometry-text-tick' };
}

function applyDecision(state, next, decision) {
  if (decision.mode === 'skip') return state;
  const nextFp = fingerprintGeometry(next.geometry);
  if (decision.mode === 'reanchor') {
    return {
      ...state,
      lastText: String(next.text ?? ''),
      lastGeometryFp: nextFp,
      regionPainted: false, // full render will re-establish
    };
  }
  return {
    ...state,
    lastText: String(next.text ?? ''),
    lastGeometryFp: nextFp,
    regionPainted: true,
  };
}

// ─── Static product gap scan (independent of W4 idle-drain suite) ───────────

test('Q2 oracle static: product must fingerprint geometry before direct paint', () => {
  const src = read('chart.js');
  const home = readHome('chart.js');
  const tickBody = extractMethodBody(src, '_tickBarCloseCountdown', 2200);
  const paintBody = extractMethodBody(src, '_paintBarCloseCountdownRegion', 1200);
  const homeTick = extractMethodBody(home, '_tickBarCloseCountdown', 2200);

  const hasTick = tickBody.length > 0 && homeTick.length > 0;
  const hasPaint = paintBody.length > 0;
  const hasKill = src.includes(KS_Q2) && home.includes(KS_Q2);

  // Desired: geometry fingerprint fields referenced near the tick/paint path.
  const geoKeys = ['priceY', 'axisX', 'rect', 'spread', 'GeometryFp', 'geometryFp', '_countdownGeometry'];
  const tickMentionsGeo = geoKeys.some((k) => tickBody.includes(k));
  const paintMentionsGeo = geoKeys.some((k) => paintBody.includes(k));
  const hasGeometryGate = tickMentionsGeo || paintMentionsGeo
    || /_countdownGeometryFp|_lastCountdownGeometry|_fingerprintCountdown/.test(src);

  // Appear/disappear re-anchor exists today — necessary but not sufficient.
  const hasAppearFlip = /prevHad\s*!==\s*nextHad/.test(tickBody)
    || /prevHad\s*!=\s*nextHad/.test(tickBody);

  // Direct paint without geometry gate = ghost/overdraw risk when price-y moves.
  const directPaintUngated = hasPaint
    && /drawCurrentPriceLabel\s*\(/.test(paintBody)
    && !hasGeometryGate;

  note('Q2-oracle', 'dual-tree-tick-present', hasTick);
  note('Q2-oracle', 'kill-switch-present', hasKill, KS_Q2);
  note('Q2-oracle', 'appear-flip-reanchor-present', hasAppearFlip,
    hasAppearFlip ? 'prevHad!==nextHad' : 'missing');
  note('Q2-oracle', 'geometry-fingerprint-gate-present', hasGeometryGate,
    hasGeometryGate ? 'geometry gate found' : 'no priceY/axis/rect/spread fingerprint');
  note('Q2-oracle', 'direct-paint-ungated-ghost-risk-RED', directPaintUngated,
    directPaintUngated
      ? 'drawCurrentPriceLabel without geometry re-anchor gate (expected RED gap)'
      : 'gated');
  note('Q2-oracle', 'homepage-mirror-parity',
    hasKill && (hasAppearFlip === /prevHad\s*!==\s*nextHad/.test(homeTick)));

  assert.equal(hasTick, true, 'Q2 tick helper missing — cannot oracle');
  // Desired GREEN: geometry gate present. Today this should FAIL (= useful RED for W4).
  assert.equal(hasGeometryGate, true,
    'Q2 missing geometry fingerprint gate (priceY/axis/rect/spread) — ghost/overdraw risk');
});

// ─── Behavioral oracle (desired contract; harness-owned) ───────────────────

test('Q2 oracle: stable same-geometry may direct-paint', () => {
  let state = {
    fixOn: true,
    hidden: false,
    lastText: '00:42',
    lastGeometryFp: fingerprintGeometry({
      priceY: 120, axisX: 900, rectX: 860, rectY: 100, rectW: 70, rectH: 36, spread: 0.2,
    }),
    regionPainted: true,
  };
  const next = {
    text: '00:41',
    geometry: {
      priceY: 120, axisX: 900, rectX: 860, rectY: 100, rectW: 70, rectH: 36, spread: 0.2,
    },
  };
  const d = decideCountdownPaint(state, next);
  note('Q2-oracle', 'stable-geometry-allows-direct',
    d.mode === 'direct' && d.directPaint === 1 && d.fullRender === 0,
    `mode=${d.mode} reason=${d.reason}`);
  assert.equal(d.mode, 'direct');
  assert.equal(d.directPaint, 1);
  assert.equal(d.fullRender, 0);
  state = applyDecision(state, next, d);
  assert.equal(state.regionPainted, true);
});

test('Q2 oracle: price-y change forces re-anchor and zero direct paint', () => {
  const baseGeo = {
    priceY: 120, axisX: 900, rectX: 860, rectY: 100, rectW: 70, rectH: 36, spread: 0.2,
  };
  let state = {
    fixOn: true,
    hidden: false,
    lastText: '00:40',
    lastGeometryFp: fingerprintGeometry(baseGeo),
    regionPainted: true,
  };
  const next = {
    text: '00:39',
    geometry: { ...baseGeo, priceY: 148 }, // price moved → badge Y moved
  };
  const d = decideCountdownPaint(state, next);
  note('Q2-oracle', 'price-y-change-reanchor-zero-direct',
    d.mode === 'reanchor' && d.directPaint === 0 && d.fullRender === 1,
    `mode=${d.mode} direct=${d.directPaint} full=${d.fullRender} reason=${d.reason}`);
  assert.equal(d.mode, 'reanchor');
  assert.equal(d.directPaint, 0, 'changed price-y must not direct-paint (ghost risk)');
  assert.equal(d.fullRender, 1);
});

test('Q2 oracle: axis / rect / spread changes each force re-anchor', () => {
  const baseGeo = {
    priceY: 200, axisX: 880, rectX: 840, rectY: 180, rectW: 72, rectH: 34, spread: 0.15,
  };
  const cases = [
    { name: 'axis-x', patch: { axisX: 910 } },
    { name: 'rect', patch: { rectX: 830, rectW: 80 } },
    { name: 'spread', patch: { spread: 0.45 } },
  ];
  let allOk = true;
  for (const c of cases) {
    const state = {
      fixOn: true,
      hidden: false,
      lastText: '00:30',
      lastGeometryFp: fingerprintGeometry(baseGeo),
      regionPainted: true,
    };
    const d = decideCountdownPaint(state, {
      text: '00:29',
      geometry: { ...baseGeo, ...c.patch },
    });
    const ok = d.mode === 'reanchor' && d.directPaint === 0 && d.fullRender === 1;
    allOk = allOk && ok;
    note('Q2-oracle', `geometry-${c.name}-reanchor-zero-direct`, ok,
      `mode=${d.mode} direct=${d.directPaint}`);
    assert.equal(d.directPaint, 0, `${c.name} change must zero direct paint`);
    assert.equal(d.mode, 'reanchor', `${c.name} change must re-anchor`);
  }
  note('Q2-oracle', 'axis-rect-spread-matrix', allOk);
});

test('Q2 oracle: anti-ghost sequence — move then tick must not stack direct paints', () => {
  const geoA = {
    priceY: 100, axisX: 900, rectX: 860, rectY: 80, rectW: 70, rectH: 36, spread: 0.1,
  };
  const geoB = { ...geoA, priceY: 160 };
  let state = {
    fixOn: true,
    hidden: false,
    lastText: '00:20',
    lastGeometryFp: fingerprintGeometry(geoA),
    regionPainted: true,
  };
  let directTotal = 0;
  let fullTotal = 0;

  // 1) price moves → must re-anchor
  {
    const d = decideCountdownPaint(state, { text: '00:20', geometry: geoB });
    directTotal += d.directPaint;
    fullTotal += d.fullRender;
    state = applyDecision(state, { text: '00:20', geometry: geoB }, d);
    // After full render commits, region is re-established at new geometry:
    state.regionPainted = true;
    assert.equal(d.directPaint, 0);
  }
  // 2) stable geometry text tick → direct OK once
  {
    const d = decideCountdownPaint(state, { text: '00:19', geometry: geoB });
    directTotal += d.directPaint;
    fullTotal += d.fullRender;
    state = applyDecision(state, { text: '00:19', geometry: geoB }, d);
  }
  // 3) spread widens → re-anchor again, no direct
  {
    const geoC = { ...geoB, spread: 0.55, rectW: 84 };
    const d = decideCountdownPaint(state, { text: '00:19', geometry: geoC });
    directTotal += d.directPaint;
    fullTotal += d.fullRender;
    assert.equal(d.directPaint, 0);
    assert.equal(d.mode, 'reanchor');
  }

  const ok = directTotal === 1 && fullTotal === 2;
  note('Q2-oracle', 'anti-ghost-sequence', ok,
    `directTotal=${directTotal} fullTotal=${fullTotal} (expect direct=1 full=2)`);
  assert.equal(directTotal, 1);
  assert.equal(fullTotal, 2);
});

test('Q2 oracle: kill-switch / hidden discrimination', () => {
  const geo = {
    priceY: 110, axisX: 900, rectX: 860, rectY: 90, rectW: 70, rectH: 36, spread: 0.2,
  };
  const base = {
    lastText: '00:10',
    lastGeometryFp: fingerprintGeometry(geo),
    regionPainted: true,
  };

  const kill = decideCountdownPaint({ ...base, fixOn: false, hidden: false }, {
    text: '00:09',
    geometry: geo,
  });
  note('Q2-oracle', 'kill-switch-forces-full',
    kill.mode === 'reanchor' && kill.directPaint === 0 && kill.fullRender === 1,
    `mode=${kill.mode}`);
  assert.equal(kill.fullRender, 1);
  assert.equal(kill.directPaint, 0);

  const hidden = decideCountdownPaint({ ...base, fixOn: true, hidden: true }, {
    text: '00:09',
    geometry: geo,
  });
  note('Q2-oracle', 'hidden-skips-all-paint',
    hidden.mode === 'skip' && hidden.directPaint === 0 && hidden.fullRender === 0);
  assert.equal(hidden.mode, 'skip');

  // switch-OFF desired contract (stable direct) goes RED
  const desiredDirectUnderKill = kill.mode === 'direct';
  note('Q2-oracle', 'switch-off-desired-contract-RED', desiredDirectUnderKill === false,
    `mode=${kill.mode}`);
  assert.equal(desiredDirectUnderKill, false);
});

// ─── Product vs oracle gap note (W4 verification input) ────────────────────

test('Q2 oracle gap summary for W4', () => {
  const src = read('chart.js');
  const tickBody = extractMethodBody(src, '_tickBarCloseCountdown', 2200);
  const hasGeometryGate = /priceY|axisX|_countdownGeometry|geometryFp|spread/.test(tickBody)
    || /_countdownGeometryFp|_lastCountdownGeometry|_fingerprintCountdown/.test(src);
  const hasAppearFlip = /prevHad\s*!==\s*nextHad/.test(tickBody);
  const gap = {
    worker: 'W3',
    consumer: 'W4',
    status: 'PRELIMINARY-PENDING-FABLE-SIGNOFF',
    finding: hasGeometryGate
      ? 'geometry gate present — verify anti-ghost sequence GREEN'
      : 'Q2 region paint can direct-draw after price-y/axis/rect/spread change without re-anchor (ghost/overdraw)',
    requiredProductHunkHint: [
      'In _tickBarCloseCountdown (or paint helper): compute fingerprint {priceY, axisX, rect, spread}',
      'If fingerprint !== last: scheduleRender(); directPaint=0; clear regionPainted',
      'If fingerprint stable and text changed: allow _paintBarCloseCountdownRegion',
    ],
    appearFlipPresent: hasAppearFlip,
    geometryGatePresent: hasGeometryGate,
  };
  note('Q2-oracle', 'w4-verification-gap-recorded', true, gap.finding);
  note('Q2-oracle', 'geometry-gate-GREEN', hasGeometryGate,
    hasGeometryGate ? 'present' : 'ABSENT — W4 follow-up');
  // Soft for suite usefulness: record gap; hard-assert only on recording.
  assert.equal(typeof gap.finding, 'string');
  // Keep a hard RED signal aligned with the static test when gate absent.
  if (!hasGeometryGate) {
    assert.equal(hasGeometryGate, true, 'W4 verification: geometry re-anchor gate still absent');
  }
});

// ─── Evidence writer ───────────────────────────────────────────────────────

test('evidence writer', { skip: !evidenceMode }, () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = '20260724';
  const out = path.join(EVIDENCE_DIR, `W3-M20-Q2-ORACLE-${stamp}-${evidenceMode}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);
  let verdict = failed.length ? 'RED' : 'GREEN';
  if (evidenceMode === 'kill') {
    const disc = evidenceRows.filter((r) => String(r.name).includes('switch-off'));
    const discOk = disc.length > 0 && disc.every((r) => r.pass);
    verdict = discOk ? 'RED' : 'FAIL-DISCRIMINATION';
  }
  if (evidenceMode === 'red') {
    // Product geometry gate rows failing ⇒ useful RED; behavioral oracle stubs should pass.
    const productGate = evidenceRows.filter((r) =>
      r.name === 'geometry-fingerprint-gate-present'
      || r.name === 'geometry-gate-GREEN');
    const productFail = productGate.some((r) => !r.pass);
    const ghostRiskNoted = evidenceRows.some((r) =>
      r.name === 'direct-paint-ungated-ghost-risk-RED' && r.pass);
    verdict = (productFail || ghostRiskNoted) ? 'RED' : 'UNEXPECTED-GREEN';
  }
  const payload = {
    worker: 'W3',
    mode: evidenceMode,
    stamp,
    status: 'PRELIMINARY-PENDING-FABLE-SIGNOFF',
    role: 'independent-W4-verification-input',
    killSwitches: { Q2: KS_Q2 },
    contract: {
      stableSameGeometry: 'direct-paint-allowed',
      changedPriceYAxisRectSpread: 'full-reanchor-and-zero-direct-paint',
    },
    rows: evidenceRows,
    summary: {
      total: evidenceRows.length,
      pass: evidenceRows.length - failed.length,
      fail: failed.length,
    },
    verdict,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote evidence ${out} verdict=${payload.verdict}\n`);
});
