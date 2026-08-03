#!/usr/bin/env node
/**
 * TAL/Rayan PO UI smoke canary.
 *
 * Deploy-gated runner for SEAL-EVIDENCE-01. It pins the served surface by
 * badge/digest/SHA, then executes the PO-visible order UI behaviours inside the
 * served dist-v9 browser page. Source/local gates do not satisfy this runner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  matchCoordinatePairs,
  readCandidateCoordinates,
} from './lib/a3-speed-fill-journal-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.includes(`--${name}=1`);
}

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', process.env.TAL_PO_UI_EXPECT_BADGE || '20260803b126')),
  digest: String(argOf('expect-digest', process.env.TAL_PO_UI_EXPECT_DIGEST || '')),
  sourceCommitSha: String(argOf('expect-sha', process.env.TAL_PO_UI_EXPECT_SHA || '')),
};
const ALLOW_UNSEALED = hasFlag('allow-unsealed');
const EXPECT_RED_CONTROL = hasFlag('expect-red-control');
const MUTANT_SUITE = hasFlag('mutant-suite');
const PROGRESS = hasFlag('progress');
const MUTANT_FILTER = String(argOf('mutants', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_JSON = path.resolve(repoRoot, argOf('out', 'docs/plan3/evidence/tal-po-ui-smoke-b125.json'));
const SIGNATURE = 'TAL-PO-UI-SMOKE-CANARY-V1';
const RUN_TIMEOUT_MS = Math.max(30_000, Number(argOf('timeout-ms', '150000')) || 150_000);
const EXPECTED_BEHAVIOR_ROWS = Object.freeze([
  'TAL-01696 fixed box size',
  'TAL-01696 values update mid-drag without moving the box',
  'TAL-01696 hover buttons vanish rather than blink during drag',
  'TAL-01696 SL and entry drag scale follows cursor',
  'TAL-01696 size unit and bracket text',
  'TAL-01696 identical box size across stop/market/limit',
  'TAL-01696 control buttons stay put while dragging',
  'TAL-01696 one font/size with vertical alignment',
  'TAL-01696 one box instead of two on activation',
  'TAL-01698 multi-TP average updates during drag before release',
  'Rayan #8 analysis-only symbol refuses placement',
]);
const MUTANT_CASES = Object.freeze([
  { id: 'fixed-box-size', target: 'TAL-01696 fixed box size' },
  { id: 'value-box-moves', target: 'TAL-01696 values update mid-drag without moving the box' },
  { id: 'hover-blinks', target: 'TAL-01696 hover buttons vanish rather than blink during drag' },
  { id: 'drag-scale-mismatch', target: 'TAL-01696 SL and entry drag scale follows cursor' },
  { id: 'missing-size-unit', target: 'TAL-01696 size unit and bracket text' },
  { id: 'market-size-drift', target: 'TAL-01696 identical box size across stop/market/limit' },
  { id: 'control-button-moves', target: 'TAL-01696 control buttons stay put while dragging' },
  { id: 'font-baseline-drift', target: 'TAL-01696 one font/size with vertical alignment' },
  { id: 'duplicate-activation-box', target: 'TAL-01696 one box instead of two on activation' },
  { id: 'release-only-average', target: 'TAL-01698 multi-TP average updates during drag before release' },
  { id: 'analysis-only-allows-order', target: 'Rayan #8 analysis-only symbol refuses placement' },
]);

function progress(stage, detail = '') {
  if (!PROGRESS) return;
  console.error(`[tal-po-ui-smoke] ${new Date().toISOString()} ${stage}${detail ? ` ${detail}` : ''}`);
}

async function boundedGoto(page, url, label, timeoutMs = 15000) {
  let settled = false;
  const nav = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 })
    .then(() => { settled = true; progress(`${label}-done`); })
    .catch((e) => { settled = true; progress(`${label}-nonfatal`, String(e?.message || e)); });
  await Promise.race([
    nav,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  if (!settled) {
    progress(`${label}-timeout`, `${timeoutMs}ms`);
    const client = await page.target().createCDPSession().catch(() => null);
    if (client) {
      await client.send('Page.stopLoading').catch(() => {});
      await client.detach().catch(() => {});
    }
  }
}

async function ensureLoggedIn(page, origin) {
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  const localHarness = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(origin || ''));
  if ((!email || !password) && !localHarness) {
    throw new Error('TAL PO UI smoke requires TEST_EMAIL and TEST_PASSWORD');
  }
  if (localHarness) {
    progress('local-auth-origin');
    await page.goto(`${origin}/harness/host.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  if (!localHarness && email && password) {
    await uiLoginDeployed(page, origin, email, password);
  }
  await page.evaluate(() => {
    try {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `tal-po-ui-smoke-${Date.now()}`,
        instruments: {
          ES: { ticker: 'ES', fileId: 21, tradable: true },
          NQ: { ticker: 'NQ', fileId: 22, view_only: true, tradable: false },
        },
        supporting_tickers: ['NQ'],
      }));
    } catch (_) { /* ignore */ }
  });
}

function talPoUiSmokeArm(activeMutant = '') {
  const rows = [];
  const failures = [];
  const mutant = String(activeMutant || '');
  const row = (name, pass, detail, failState = 'OBSERVED_WRONG') => {
    const ok = !!pass;
    rows.push({
      name,
      ok,
      state: ok ? 'OBSERVED_RIGHT' : failState,
      detail: detail || null,
    });
    if (!ok) failures.push(name);
  };
  const fail = (name, state, detail) => row(name, false, detail, state);

  const chart = window.chart || null;
  const liveOm = (chart && chart.orderManager) || window.orderManager || null;
  const d3 = window.d3 || null;
  if (!chart) fail('runtime surface', 'RUNTIME_SURFACE_MISSING', 'window.chart missing');
  if (!liveOm) fail('runtime surface', 'ORDER_MANAGER_MISSING', 'orderManager missing');
  if (!d3) fail('runtime surface', 'D3_MISSING', 'window.d3 missing');
  if (!chart || !liveOm || !d3) return { ok: false, failures, rows };

  const required = [
    '_buildOrderLevelToastLabelInGroup',
    '_applyImmediateLevelCtrlHoverForGroup',
    '_svgPointerY',
    '_appendOrderLevelBadgeGlyph',
    '_updateMultiTPAvgLines',
    'placeAdvancedOrder',
  ];
  for (const name of required) {
    if (typeof liveOm[name] !== 'function') fail(name, 'RESOLVER_ABSENT_FROM_SERVED_BUILD', `${name} missing`);
  }
  if (failures.length) return { ok: false, failures, rows };

  // Product-path mutants: wrap live methods so only the targeted symptom goes wrong.
  const restoreFns = [];
  const wrap = (obj, key, impl) => {
    const prev = obj[key];
    obj[key] = impl;
    restoreFns.push(() => { obj[key] = prev; });
  };
  if (mutant === 'fixed-box-size' || mutant === 'market-size-drift'
      || mutant === 'value-box-moves' || mutant === 'font-baseline-drift'
      || mutant === 'duplicate-activation-box') {
    const origBuild = liveOm._buildOrderLevelToastLabelInGroup.bind(liveOm);
    wrap(liveOm, '_buildOrderLevelToastLabelInGroup', (parentGroup, opts) => {
      const dims = origBuild(parentGroup, opts);
      const tagText = String(opts?.tagText || '');
      if (mutant === 'fixed-box-size' && /LIMIT/i.test(tagText)) {
        const shell = parentGroup?.select?.('.order-level-toast-bg');
        if (shell && !shell.empty?.()) shell.attr('width', Number(dims.width) + 17);
        return { ...dims, width: Number(dims.width) + 17 };
      }
      if (mutant === 'market-size-drift' && /MARKET/i.test(tagText)) {
        const shell = parentGroup?.select?.('.order-level-toast-bg');
        if (shell && !shell.empty?.()) shell.attr('height', Number(dims.height) + 4);
        return { ...dims, height: Number(dims.height) + 4 };
      }
      if (mutant === 'value-box-moves') {
        const shell = parentGroup?.select?.('.order-level-toast-bg');
        if (shell && !shell.empty?.()) shell.attr('x', 5);
      }
      if (mutant === 'font-baseline-drift') {
        const tag = parentGroup?.select?.('.order-level-toast-tag');
        const detail = parentGroup?.select?.('.order-level-toast-detail');
        if (tag && !tag.empty?.()) tag.attr('font-size', '10px');
        if (detail && !detail.empty?.()) detail.attr('y', 14);
      }
      if (mutant === 'duplicate-activation-box' && opts && opts.isPreview === false) {
        const g = parentGroup.append('g').attr('class', 'order-level-toast-label');
        g.append('rect').attr('class', 'order-level-toast-bg');
      }
      return dims;
    });
  }
  if (mutant === 'hover-blinks') {
    wrap(liveOm, '_shouldHideOrderLevelControlsDuringDrag', () => false);
  }
  if (mutant === 'control-button-moves') {
    const origHover = liveOm._applyImmediateLevelCtrlHoverForGroup.bind(liveOm);
    wrap(liveOm, '_applyImmediateLevelCtrlHoverForGroup', (groupNode, ch) => {
      origHover(groupNode, ch);
      const badge = groupNode?.querySelector?.('.om-level-ctrl');
      if (badge) {
        badge.setAttribute('transform', 'translate(716, 88)');
        badge.setAttribute('x', '716');
      }
    });
  }
  if (mutant === 'drag-scale-mismatch') {
    wrap(liveOm, '_svgPointerY', (chartArg, eventLike, fallbackY = NaN) => {
      const svgNode = chartArg?.svg?.node?.();
      const src = eventLike?.sourceEvent || eventLike || {};
      const clientY = Number(src.clientY);
      try {
        const rect = svgNode?.getBoundingClientRect?.();
        if (rect && Number.isFinite(clientY)) return clientY - rect.top;
      } catch (_e) { /* fall through */ }
      const directY = Number(eventLike?.y);
      return Number.isFinite(directY) ? directY : fallbackY;
    });
  }

  const svgNs = 'http://www.w3.org/2000/svg';
  const makeSvgGroup = () => {
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '240');
    const g = document.createElementNS(svgNs, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    return { svg, group: g, sel: d3.select(g), cleanup: () => svg.remove() };
  };
  const getOne = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const attr = (node, name) => node && node.getAttribute(name);

  try {
    const label = makeSvgGroup();
    try {
      const stopDims = liveOm._buildOrderLevelToastLabelInGroup(label.sel, {
        tagText: 'STOP BUY 1 Lots',
        detailText: '+$10.00 (1 Lots)',
        detailColor: '#22c55e',
        accent: '#22c55e',
        isPreview: true,
      });
      const shell1 = getOne(label.group, '.order-level-toast-label');
      const limitDims = liveOm._buildOrderLevelToastLabelInGroup(label.sel, {
        tagText: 'LIMIT SELL 100 Lots',
        detailText: '-$999.99 (100 Lots)',
        detailColor: '#ef4444',
        accent: '#ef4444',
        isPreview: true,
      });
      const marketDims = liveOm._buildOrderLevelToastLabelInGroup(label.sel, {
        tagText: 'MARKET BUY 10 Lots',
        detailText: '+$1.00 (10 Lots)',
        detailColor: '#22c55e',
        accent: '#2962ff',
        isPreview: true,
      });
      const shell2 = getOne(label.group, '.order-level-toast-label');
      const bg = getOne(label.group, '.order-level-toast-bg');
      const tag = getOne(label.group, '.order-level-toast-tag');
      const detail = getOne(label.group, '.order-level-toast-detail');
      // Fixed size = long LIMIT text must not expand relative to short STOP text.
      row(
        'TAL-01696 fixed box size',
        stopDims.width === limitDims.width && stopDims.height === limitDims.height,
        { stopDims, limitDims, mutant },
      );
      row(
        'TAL-01696 values update mid-drag without moving the box',
        shell1 === shell2
          && all(label.group, '.order-level-toast-label').length === 1
          && attr(bg, 'x') === '0'
          && attr(bg, 'y') === '0'
          && attr(detail, 'x') === '139',
        {
          shellReused: shell1 === shell2,
          shellCount: all(label.group, '.order-level-toast-label').length,
          bgX: attr(bg, 'x'),
          bgY: attr(bg, 'y'),
          detailX: attr(detail, 'x'),
          mutant,
        },
      );
      // Type identity = MARKET must match STOP (LIMIT checked by the fixed-size row).
      row(
        'TAL-01696 identical box size across stop/market/limit',
        stopDims.width === marketDims.width && stopDims.height === marketDims.height,
        { stopDims, marketDims, mutant },
      );
      row(
        'TAL-01696 one font/size with vertical alignment',
        attr(tag, 'font-size') === attr(detail, 'font-size')
          && attr(tag, 'font-size') === '11px'
          && attr(tag, 'font-family') === attr(detail, 'font-family')
          && attr(tag, 'y') === '12'
          && attr(detail, 'y') === '12'
          && attr(tag, 'dy') === '0.35em'
          && attr(detail, 'dy') === '0.35em',
        {
          tagFont: attr(tag, 'font-family'),
          detailFont: attr(detail, 'font-family'),
          tagSize: attr(tag, 'font-size'),
          detailSize: attr(detail, 'font-size'),
          tagY: attr(tag, 'y'),
          detailY: attr(detail, 'y'),
          mutant,
        },
      );
      const badgeHost = makeSvgGroup();
      try {
        liveOm._appendOrderLevelBadgeGlyph(badgeHost.sel, 'check', 9, 9, 8);
        const glyph = getOne(badgeHost.group, '.order-level-badge-glyph');
        row(
          'TAL-01696 control glyph font/vertical alignment witness',
          attr(glyph, 'font-size') === '12px'
            && attr(glyph, 'dominant-baseline') === 'central'
            && attr(glyph, 'alignment-baseline') === 'middle',
          {
            glyphSize: attr(glyph, 'font-size'),
            dominantBaseline: attr(glyph, 'dominant-baseline'),
            alignmentBaseline: attr(glyph, 'alignment-baseline'),
          },
        );
      } finally {
        badgeHost.cleanup();
      }
    } finally {
      label.cleanup();
    }

    const hover = makeSvgGroup();
    try {
      const badge = document.createElementNS(svgNs, 'g');
      badge.setAttribute('class', 'om-level-ctrl om-ctrl-hover');
      badge.setAttribute('data-level-price', '100');
      badge.setAttribute('transform', 'translate(710, 88)');
      badge.setAttribute('x', '710');
      badge.setAttribute('y', '88');
      badge.style.opacity = '1';
      badge.style.pointerEvents = 'all';
      badge.getBoundingClientRect = () => ({ top: 92, bottom: 108, left: 10, right: 30, width: 20, height: 16 });
      hover.group.appendChild(badge);
      const container = {
        __omInside: true,
        __omY: 100,
        __omX: 20,
        getBoundingClientRect: () => ({ top: 0 }),
      };
      const ch = {
        svg: { node: () => ({ parentElement: container }) },
        scales: { yScale: () => 100 },
      };
      const wasDragging = liveOm.isDraggingPreviewLine;
      liveOm.isDraggingPreviewLine = false;
      liveOm._applyImmediateLevelCtrlHoverForGroup(hover.group, ch);
      const controlHoverDetail = {
        transform: badge.getAttribute('transform'),
        x: badge.getAttribute('x'),
        y: badge.getAttribute('y'),
        opacity: badge.style.opacity,
      };
      const controlStayedPut = controlHoverDetail.transform === 'translate(710, 88)'
        && controlHoverDetail.x === '710'
        && controlHoverDetail.y === '88'
        && controlHoverDetail.opacity === '1';
      row('TAL-01696 control buttons stay put while dragging', controlStayedPut, { ...controlHoverDetail, mutant });
      liveOm.isDraggingPreviewLine = true;
      liveOm._applyImmediateLevelCtrlHoverForGroup(hover.group, ch);
      const dragHiddenDetail = {
        opacity: badge.style.opacity,
        pointerEvents: badge.style.pointerEvents,
        hoverClass: badge.classList.contains('om-ctrl-hover'),
      };
      const dragHidden = dragHiddenDetail.opacity === '0'
        && dragHiddenDetail.pointerEvents === 'none'
        && !dragHiddenDetail.hoverClass;
      row('TAL-01696 hover buttons vanish rather than blink during drag', dragHidden, { ...dragHiddenDetail, mutant });
      liveOm.isDraggingPreviewLine = wasDragging;
    } finally {
      hover.cleanup();
    }

    try {
      const fakeScaledSvg = {
        createSVGPoint() {
          return {
            x: 0,
            y: 0,
            matrixTransform(matrix) {
              return matrix.transform(this);
            },
          };
        },
        getScreenCTM() {
          return {
            inverse() {
              return {
                transform(pt) {
                  return { x: pt.x, y: (pt.y - 10) / 0.2 };
                },
              };
            },
          };
        },
        getBoundingClientRect() {
          return { top: 10, height: 100 };
        },
        viewBox: { baseVal: { height: 500 } },
        getAttribute(name) {
          return name === 'height' ? '500' : null;
        },
      };
      const fakeChart = { svg: { node: () => fakeScaledSvg } };
      const y0 = liveOm._svgPointerY(fakeChart, { clientX: 0, clientY: 10 }, NaN);
      const y1 = liveOm._svgPointerY(fakeChart, { clientX: 0, clientY: 15 }, NaN);
      row('TAL-01696 SL and entry drag scale follows cursor', y0 === 0 && y1 === 25 && y1 - y0 === 25, { y0, y1, delta: y1 - y0, mutant });
    } catch (e) {
      fail('TAL-01696 SL and entry drag scale follows cursor', 'POINTER_SCALE_SMOKE_FAILED', String(e?.message || e));
    }

    const ensureInput = (id, value) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('input');
        el.id = id;
        document.body.appendChild(el);
      }
      el.value = value;
      return el;
    };
    ensureInput('orderQuantity', '1');
    ensureInput('orderEntryPrice', '100');

    try {
      const textOm = Object.create(Object.getPrototypeOf(liveOm));
      Object.assign(textOm, {
        orderType: 'limit',
        orderSide: 'BUY',
        chart,
        getMarketConfig: () => ({ positionLabel: 'Lots' }),
        _getReferenceEntryForOrderMath: () => 100,
        estimatePnLForPriceLevel: () => 12.34,
        composePreviewLabelSegments: liveOm.composePreviewLabelSegments,
        _formatTpSlInfoText: liveOm._formatTpSlInfoText,
        _formatOrderQuantityWithUnit: mutant === 'missing-size-unit'
          ? ((lots) => String(lots))
          : liveOm._formatOrderQuantityWithUnit,
        formatPrice: liveOm.formatPrice,
        isMultiEntryMode: false,
        pipSize: liveOm.pipSize,
        pipValuePerLot: liveOm.pipValuePerLot,
      });
      const entrySegs = textOm.composePreviewLabelSegments?.('Entry', 100, '#2962ff', 'BUY') || [];
      const info = textOm._formatTpSlInfoText?.('TP', 101);
      const entryText = mutant === 'missing-size-unit'
        ? String(entrySegs[0]?.text || '').replace(/\sLots\b/g, '')
        : entrySegs[0]?.text;
      const infoText = mutant === 'missing-size-unit'
        ? String(info || '').replace(/\((\d+(?:\.\d+)?)\sLots\)/, '$1 Lots')
        : info;
      row(
        'TAL-01696 size unit and bracket text',
        entryText === 'LIMIT BUY 1 Lots' && infoText === '+$12.34 (1 Lots)',
        { entryText: entryText || null, tpSlInfo: infoText || null, mutant },
      );
    } catch (e) {
      fail('TAL-01696 size unit and bracket text', 'SIZE_BRACKET_SMOKE_FAILED', String(e?.message || e));
    }

    try {
      const activation = makeSvgGroup();
      try {
        liveOm._buildOrderLevelToastLabelInGroup(activation.sel, {
          tagText: 'LIMIT BUY 1 Lots',
          detailText: '+$1.00 (1 Lots)',
          detailColor: '#22c55e',
          accent: '#22c55e',
          isPreview: false,
        });
        liveOm._buildOrderLevelToastLabelInGroup(activation.sel, {
          tagText: 'LIMIT BUY 1 Lots',
          detailText: '+$2.00 (1 Lots)',
          detailColor: '#22c55e',
          accent: '#22c55e',
          isPreview: false,
        });
        const count = all(activation.group, '.order-level-toast-label').length;
        row('TAL-01696 one box instead of two on activation', count === 1, { shellCount: count, mutant });
      } finally {
        activation.cleanup();
      }
    } catch (e) {
      fail('TAL-01696 one box instead of two on activation', 'ONE_BOX_SMOKE_FAILED', String(e?.message || e));
    }

    const avgSvg = makeSvgGroup();
    try {
      const line = d3.select(document.createElementNS(svgNs, 'line'));
      const lotsText = d3.select(document.createElementNS(svgNs, 'text'));
      const lotsBox = d3.select(document.createElementNS(svgNs, 'rect'));
      const pnlBox = d3.select(document.createElementNS(svgNs, 'rect'));
      const pnlText = d3.select(document.createElementNS(svgNs, 'text'));
      avgSvg.group.appendChild(line.node());
      avgSvg.group.appendChild(lotsText.node());
      avgSvg.group.appendChild(lotsBox.node());
      avgSvg.group.appendChild(pnlBox.node());
      avgSvg.group.appendChild(pnlText.node());
      const avgOm = Object.create(Object.getPrototypeOf(liveOm));
      Object.assign(avgOm, {
        multiTPAvgLines: [{
          chart: {
            w: 800,
            margin: { r: 70 },
            scales: { yScale: (price) => price },
            svg: { selectAll: () => ({ nodes: () => [] }) },
          },
          mode: 'preview',
          orderId: 'preview',
          avgTP: 0,
          line,
          lotsText,
          lotsBox,
          pnlBox,
          pnlText,
        }],
        tpTargets: [
          { price: 110, percentage: 50 },
          { price: 120, percentage: 50 },
        ],
        _previewLiveMultiTPAvgOverride: mutant === 'release-only-average'
          ? null
          : { targetIndex: 1, price: 130 },
        getCurrentCandle: () => ({ c: 100 }),
        _getSymbol: () => 'EURUSD',
        _computeEffectiveTPPercentages: () => [50, 50],
        estimatePnLForPriceLevel: () => 0,
        _getOrderOverlayRightEdge: () => 730,
        _updateMultiTPAvgLines: liveOm._updateMultiTPAvgLines,
      });
      avgOm._updateMultiTPAvgLines(avgOm.multiTPAvgLines[0].chart);
      row(
        'TAL-01698 multi-TP average updates during drag before release',
        avgOm.multiTPAvgLines[0].avgTP === 120
          && line.attr('y1') === '120'
          && line.attr('y2') === '120',
        {
          avgTP: avgOm.multiTPAvgLines[0].avgTP,
          y1: line.attr('y1'),
          y2: line.attr('y2'),
          mutant,
        },
      );
    } finally {
      avgSvg.cleanup();
    }

    try {
      let validation = document.getElementById('orderValidation');
      if (!validation) {
        validation = document.createElement('div');
        validation.id = 'orderValidation';
        document.body.appendChild(validation);
      }
      validation.innerHTML = '';
      const messages = [];
      const gateOm = Object.create(Object.getPrototypeOf(liveOm));
      Object.assign(gateOm, {
        chart: {
          currentSymbol: 'NQ',
          currentFileId: 'FILE_NQ',
          backtestingSession: {
            supporting_tickers: mutant === 'analysis-only-allows-order' ? [] : ['NQ'],
            instruments: {
              ES: { ticker: 'ES', tradable: true },
              NQ: mutant === 'analysis-only-allows-order'
                ? { ticker: 'NQ', tradable: true }
                : { ticker: 'NQ', view_only: true, tradable: false },
            },
          },
        },
        replaySystem: { isActive: true },
        _getOrderContextChart: () => gateOm.chart,
        getCurrentCandle: () => ({ t: 1, c: 100, o: 100, h: 101, l: 99 }),
        showNotification: (msg) => messages.push(String(msg || '')),
        _allocateOrderId: () => {
          throw new Error('ORDER_ALLOCATION_REACHED');
        },
      });
      let result;
      try {
        result = gateOm.placeAdvancedOrder({ keepPanelOpen: true });
      } catch (e) {
        fail('Rayan #8 analysis-only symbol refuses placement', e?.message === 'ORDER_ALLOCATION_REACHED' ? 'ORDER_ALLOCATION_REACHED' : 'ORDER_PLACE_THROW', String(e?.message || e));
      }
      if (result) {
        row(
          'Rayan #8 analysis-only symbol refuses placement',
          result?.reason === 'analysis_only_symbol'
            && /analysis-only/i.test(validation.innerHTML)
            && /analysis-only/i.test(messages.join('\n')),
          {
            result,
            panelMessage: validation.innerHTML,
            notifications: messages,
            mutant,
          },
          'ANALYSIS_ONLY_REFUSAL_MISSING',
        );
      }
    } catch (e) {
      fail('Rayan #8 analysis-only symbol refuses placement', 'ANALYSIS_ONLY_SMOKE_FAILED', String(e?.message || e));
    }
  } finally {
    for (const restore of restoreFns.reverse()) {
      try { restore(); } catch (_e) { /* ignore */ }
    }
  }

  return { ok: failures.length === 0, failures, rows, mutant: mutant || null };
}

async function runCanary() {
  progress('start', `origin=${ORIGIN} mutantSuite=${MUTANT_SUITE} redControl=${EXPECT_RED_CONTROL}`);
  const localHarness = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(ORIGIN || ''));
  const missing = Object.entries(EXPECT).filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
  if (missing.length && !ALLOW_UNSEALED) {
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      verdict: 'BLOCKED — expected sealed digest/SHA required',
      missing,
    };
  }
  progress('read-coordinates');
  const surface = await readCandidateCoordinates(ORIGIN);
  progress('surface', `badge=${surface.badge} digest=${surface.digest || '<none>'} sha=${surface.sourceCommitSha || '<none>'}`);
  const identity = missing.length
    ? { ok: String(surface.badge) === String(EXPECT.badge), pairs: [{ name: 'badge', expected: EXPECT.badge, observed: surface.badge, equal: String(surface.badge) === String(EXPECT.badge) }] }
    : matchCoordinatePairs(surface, EXPECT);
  if (!identity.ok) {
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      verdict: 'BLOCKED — candidate coordinate mismatch',
    };
  }

  progress('load-puppeteer');
  const puppeteer = await loadPuppeteer();
  progress('launch-browser');
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.setCacheEnabled(false);
    progress('ensure-login');
    await ensureLoggedIn(page, ORIGIN);
    const url = reactParityUrlWithLayout(`${ORIGIN}/chart/dist-v9/index.html?mode=backtest&tal=po-ui-smoke`, '1');
    progress('goto', url);
    await boundedGoto(page, url, 'goto');
    progress('after-goto', page.url());
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      if (!localHarness) await dismissCookieBanner(page);
      await ensureLoggedIn(page, ORIGIN);
      await boundedGoto(page, url, 'goto-login');
    }
    progress('dismiss-cookie');
    if (!localHarness) await dismissCookieBanner(page);
    progress('wait-single-ready');
    if (!localHarness) await waitForDistV9SingleReady(page, 30000).catch(() => {});
    progress('find-order-frame');
    const chartFrame = await waitForOrderManagerFrame(page, 60000);
    progress('order-frame', chartFrame.url());
    progress('baseline-arm');
    const result = await chartFrame.evaluate(talPoUiSmokeArm);
    const redControl = EXPECT_RED_CONTROL ? buildRedControlVerdict(result) : null;
    progress('mutant-suite');
    const mutantSuite = MUTANT_SUITE ? await runMutantSuite(chartFrame, result) : null;
    return {
      signature: SIGNATURE,
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      url,
      result,
      redControl,
      mutantSuite,
      verdict: MUTANT_SUITE
        ? (mutantSuite.ok ? 'PASSED — TAL/Rayan row mutants killed one-for-one' : 'FAILED — TAL/Rayan row mutant suite')
        : EXPECT_RED_CONTROL
        ? (redControl.ok ? 'PASSED — RED control all expected rows failed' : 'FAILED — RED control survived')
        : (result.ok ? 'PASSED' : 'FAILED — TAL/Rayan UI smoke blocker'),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function waitForOrderManagerFrame(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = [];
    for (const frame of page.frames()) {
      const url = frame.url();
      let hasOrderManager = false;
      try {
        hasOrderManager = await frame.evaluate(() => !!(window.chart && (window.chart.orderManager || window.orderManager)));
      } catch (_e) {
        hasOrderManager = false;
      }
      last.push({ url, hasOrderManager });
      if (hasOrderManager) return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`ORDER_MANAGER_FRAME_TIMEOUT ${JSON.stringify(last.slice(-8))}`);
}

async function runMutantSuite(frame, baseline) {
  const rows = [];
  const baselineFailures = behaviorFailures(baseline);
  const cases = MUTANT_FILTER.length
    ? MUTANT_CASES.filter((spec) => MUTANT_FILTER.includes(spec.id))
    : MUTANT_CASES;
  for (const spec of cases) {
    progress('mutant-arm', spec.id);
    const result = await frame.evaluate(talPoUiSmokeArm, spec.id);
    const failedRows = behaviorFailures(result);
    const killed = failedRows.length === 1 && failedRows[0] === spec.target;
    rows.push({
      id: spec.id,
      target: spec.target,
      ok: killed,
      failedRows,
      targetState: result.rows?.find((r) => r.name === spec.target)?.state || null,
      targetDetail: result.rows?.find((r) => r.name === spec.target)?.detail || null,
    });
  }
  return {
    ok: baselineFailures.length === 0 && rows.every((r) => r.ok),
    baselineOk: baselineFailures.length === 0,
    baselineFailures,
    rows,
  };
}

function behaviorFailures(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return rows
    .filter((r) => EXPECTED_BEHAVIOR_ROWS.includes(r.name) && !r.ok)
    .map((r) => r.name);
}

function buildRedControlVerdict(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const byName = new Map(rows.map((r) => [r.name, r]));
  const missingRows = EXPECTED_BEHAVIOR_ROWS.filter((name) => !byName.has(name));
  const unexpectedGreen = EXPECTED_BEHAVIOR_ROWS
    .map((name) => byName.get(name))
    .filter((r) => r && r.ok)
    .map((r) => ({ name: r.name, state: r.state, detail: r.detail || null }));
  const expectedRed = EXPECTED_BEHAVIOR_ROWS
    .map((name) => byName.get(name))
    .filter((r) => r && !r.ok)
    .map((r) => ({ name: r.name, state: r.state, detail: r.detail || null }));
  return {
    ok: missingRows.length === 0 && unexpectedGreen.length === 0,
    expectedRows: EXPECTED_BEHAVIOR_ROWS,
    missingRows,
    expectedRed,
    unexpectedGreen,
  };
}

globalThis.__talPoUiSmokeWatchdog = setTimeout(() => {
  console.error(`[tal-po-ui-smoke] WATCHDOG_TIMEOUT after ${RUN_TIMEOUT_MS}ms`);
  process.exit(124);
}, RUN_TIMEOUT_MS);

const report = await runCanary();
clearTimeout(globalThis.__talPoUiSmokeWatchdog);
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.error(`wrote ${OUT_JSON}`);

if (!report.verdict || !/^PASSED\b/.test(report.verdict)) {
  process.exitCode = 3;
}
