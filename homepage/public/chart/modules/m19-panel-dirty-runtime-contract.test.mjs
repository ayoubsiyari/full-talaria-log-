/**
 * M19-A Fix — runtime-only panel/dock contract proofs.
 *
 * GREEN:
 *   node --test "chart v 1.4/chart/modules/m19-panel-dirty-runtime-contract.test.mjs"
 *
 * Proves:
 *   1) real dock renderer present (not stubbed)
 *   2) instrumented innerHTML setters
 *   3) runtime-only path performs zero innerHTML writes
 *   4) parity vs structural rebuild for live fields
 *   5) true rAF coalesce: 100 schedules → 1 runtime callback
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function parseAttrs(tagOpen) {
  const attrs = {};
  const re = /([^\s=]+)(?:="([^"]*)"|='([^']*)')?/g;
  let m;
  const body = tagOpen.replace(/^<\/?[\w-]+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) {
    attrs[m[1]] = m[2] != null ? m[2] : (m[3] != null ? m[3] : '');
  }
  return attrs;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Stack-based HTML fragment parser (handles nested div/span/strong/tr/td/button). */
function parseHtmlToEls(html) {
  const root = makeEl('fragment');
  const stack = [root];
  const s = String(html || '');
  const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)>|<(![^>]*)>|<(br|hr|img|input|meta|link)(\s[^>]*)?\/?>|<([a-zA-Z][\w-]*)(\s[^>]*)?>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(s))) {
    const parent = stack[stack.length - 1];
    if (m[1]) {
      // closing tag
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName.toLowerCase() === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (m[2] != null) continue; // doctype / comment-like
    if (m[3]) {
      const el = makeEl(m[3]);
      Object.assign(el.attrs, parseAttrs(`<${m[3]}${m[4] || ''}>`));
      if (el.attrs.id) el.id = el.attrs.id;
      parent.children.push(el);
      continue;
    }
    if (m[5]) {
      const tag = m[5];
      const el = makeEl(tag);
      Object.assign(el.attrs, parseAttrs(`<${tag}${m[6] || ''}>`));
      if (el.attrs.id) el.id = el.attrs.id;
      parent.children.push(el);
      const voidish = /^(br|hr|img|input|meta|link)$/i.test(tag);
      if (!voidish) stack.push(el);
      continue;
    }
    if (m[7] != null) {
      const text = decodeEntities(m[7]);
      if (!text) continue;
      // Prefer attaching text to leaf; if parent already has children, create a text node.
      if (parent.children.length === 0 && !parent._html) {
        parent._text = (parent._text || '') + text;
      } else {
        const t = makeEl('#text');
        t._text = text;
        parent.children.push(t);
      }
    }
  }
  return root.children;
}

function walk(el, acc = []) {
  acc.push(el);
  for (const c of el.children || []) walk(c, acc);
  return acc;
}

function matchSel(el, sel) {
  if (!el || el.tagName === '#TEXT') return false;
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  const role = sel.match(/\[data-m19-role="([^"]+)"\]/);
  const oid = sel.match(/\[data-m19-order-id="([^"]+)"\]/);
  if (role && el.getAttribute('data-m19-role') !== role[1]) return false;
  if (oid && el.getAttribute('data-m19-order-id') !== oid[1]) return false;
  if (role || oid) return true;
  return false;
}

function makeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    attrs: {},
    children: [],
    _text: '',
    _html: '',
    innerHTMLWrites: 0,
    style: { display: '', color: '', width: '', setProperty() {} },
    classList: {
      _s: new Set(),
      add(...xs) { xs.forEach((x) => el.classList._s.add(x)); },
      remove(...xs) { xs.forEach((x) => el.classList._s.delete(x)); },
      contains(x) { return el.classList._s.has(x); },
      toggle(x, force) {
        if (force === true) el.classList._s.add(x);
        else if (force === false) el.classList._s.delete(x);
        else if (el.classList._s.has(x)) el.classList._s.delete(x);
        else el.classList._s.add(x);
      },
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
    },
    getAttribute(k) {
      if (k === 'id') return this.id || null;
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      return walk(this).filter((n) => n !== this && matchSel(n, sel));
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      if (this.tagName === '#TEXT') return this._text;
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._text;
    },
    set(v) {
      this._text = String(v);
      this.children = [];
      this._html = '';
    },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this.innerHTMLWrites += 1;
      global.__m19InnerHtmlWrites = (global.__m19InnerHtmlWrites || 0) + 1;
      global.__m19InnerHtmlWriteSites = global.__m19InnerHtmlWriteSites || [];
      global.__m19InnerHtmlWriteSites.push({
        id: this.id || null,
        role: this.getAttribute('data-m19-role'),
        preview: String(v).slice(0, 80),
      });
      this._html = String(v);
      this.children = parseHtmlToEls(v);
      this._text = '';
    },
  });
  return el;
}

function installContractDom() {
  global.__m19InnerHtmlWrites = 0;
  global.__m19InnerHtmlWriteSites = [];
  const byId = new Map();
  const ensure = (id) => {
    if (!byId.has(id)) {
      const n = makeEl('div');
      n.id = id;
      n.setAttribute('id', id);
      byId.set(id, n);
    }
    return byId.get(id);
  };

  const dock = ensure('multiInstrumentOpenPositionsDock');
  const dockBody = makeEl('div');
  dockBody.id = 'miDockBody';
  dockBody.setAttribute('id', 'miDockBody');
  const dockMeta = makeEl('div');
  dockMeta.id = 'miDockMeta';
  dockMeta.setAttribute('id', 'miDockMeta');
  dock.children = [dockMeta, dockBody];
  dock.querySelector = (sel) => {
    if (sel === '#miDockBody') return dockBody;
    if (sel === '#miDockMeta') return dockMeta;
    return walk(dock).find((n) => n !== dock && matchSel(n, sel)) || null;
  };
  dock.querySelectorAll = (sel) => walk(dock).filter((n) => n !== dock && matchSel(n, sel));
  byId.set('miDockBody', dockBody);
  byId.set('miDockMeta', dockMeta);

  [
    'accountBalance', 'initialBalance', 'unrealizedPnL', 'realizedPnL',
    'replayMetaBalance', 'replayMetaBalance2', 'replayMetaBalanceAll',
    'replayMetaUnrealized', 'replayMetaUnrealized2',
    'replayMetaRealized', 'replayMetaRealized2',
    'openPositionsList', 'noPositionsMsg', 'bottomOpenPositionsBody',
    'allTradesBody', 'pendingOrdersList', 'noPendingMsg',
    'bottomPendingOrdersBody', 'replayPositionsBody',
    'bottomPendingCountMeta', 'bottomPositionsCountMeta',
    'replayMetaOpenCount', 'replayMetaClosedCount',
    'replayMetaTotalTrades', 'replayMetaPendingAll', 'replayMetaOpenAll', 'replayMetaClosedAll',
  ].forEach(ensure);

  global.document = {
    getElementById: (id) => ensure(id),
    createElement: (tag) => makeEl(tag || 'div'),
    body: makeEl('body'),
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    querySelector(sel) {
      if (sel.startsWith('#')) return ensure(sel.slice(1));
      for (const n of byId.values()) {
        if (matchSel(n, sel)) return n;
        const hit = n.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      for (const n of byId.values()) {
        if (matchSel(n, sel)) out.push(n);
        out.push(...n.querySelectorAll(sel));
      }
      return out;
    },
    addEventListener() {},
  };

  const rafQueue = [];
  global.requestAnimationFrame = (fn) => {
    const id = rafQueue.length + 1;
    rafQueue.push({ id, fn });
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    const i = rafQueue.findIndex((x) => x.id === id);
    if (i >= 0) rafQueue.splice(i, 1);
  };
  global.__m19FlushRaf = () => {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const item of batch) item.fn(0);
  };
  global.__m19RafQueueLength = () => rafQueue.length;

  global.window = {
    __TALARIA_DISABLE_M19_PANEL_DIRTY_V1: false,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=m19-contract' },
    chart: null,
  };
  return { byId, dockBody, dockMeta };
}

function seedOm(OrderManager, { byId }) {
  const om = Object.create(OrderManager.prototype);
  om.balance = 10000;
  om.initialBalance = 10000;
  om.equity = 10012.5;
  om.openPositions = [{
    id: 7,
    type: 'BUY',
    ticker: 'EURUSD',
    symbol: 'EURUSD',
    quantity: 1,
    openPrice: 1.1,
    openTime: 1_720_000_000_000,
    unrealizedPnL: 12.5,
    riskAmount: 100,
    stopLoss: 1.09,
    takeProfit: 1.12,
    autoBreakeven: false,
  }];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.tradeJournal = [];
  om.orderService = {
    equity: 10012.5,
    estimateTradeMargin: () => 250,
    multiInstrumentSession: { current_time: 1_720_000_060_000 },
  };
  om.replaySystem = { replayTimestamp: 1_720_000_060_000 };
  om.chart = {
    latestCandle: { c: 1.10125, close: 1.10125 },
    data: [{ c: 1.10125, close: 1.10125 }],
    replaySystem: om.replaySystem,
  };
  om.format24Hour = (t) => String(t ?? '');
  om.getScaledTradeInfo = () => null;
  om._historyPanelEntryCount = () => 1;
  om._historyPanelTpLegCount = () => 0;
  om._historyPanelBreakdownHtml = () => '—';
  om.updateScalingCheckboxAvailability = () => {};
  om.updateAnalyticsPanel = () => {};
  om.persistRuntimeOrderState = () => {};
  om._isUpdatingPanels = false;
  om._pendingPositionsPanelRefresh = false;
  om._positionsPanelRuntimeRaf = null;
  byId.get('noPositionsMsg').style = { display: 'none' };
  byId.get('noPendingMsg').style = { display: 'none' };
  window.chart = { orderManager: om, ...om.chart };
  return om;
}

installContractDom();
const OrderManager = require('./order-manager.js');

test('real dock renderer is present on OrderManager prototype', () => {
  assert.equal(typeof OrderManager.prototype.renderCrossInstrumentPositionsDock, 'function');
  const src = OrderManager.prototype.renderCrossInstrumentPositionsDock.toString();
  assert.match(src, /innerHTML/);
  assert.match(src, /data-m19-role="dock-row"/);
  assert.match(src, /data-m19-role="dock-pnl-dollar"/);
});

test('runtime-only path: zero innerHTML writes; dock/card/table formats preserved', () => {
  const dom = installContractDom();
  const om = seedOm(OrderManager, dom);
  assert.equal(
    om.renderCrossInstrumentPositionsDock,
    OrderManager.prototype.renderCrossInstrumentPositionsDock,
    'must use real dock renderer (not stubbed)',
  );

  global.__m19InnerHtmlWrites = 0;
  global.__m19InnerHtmlWriteSites = [];
  OrderManager.prototype.updatePositionsPanel.call(om);
  const structuralWrites = global.__m19InnerHtmlWrites;
  assert.ok(structuralWrites > 0, 'structural rebuild must write innerHTML');

  const cardDollarBefore = document.querySelector('[data-m19-role="card-pnl-dollar"][data-m19-order-id="7"]');
  const cardPctBefore = document.querySelector('[data-m19-role="card-pnl-percent"][data-m19-order-id="7"]');
  const tablePnlBefore = document.querySelector('[data-m19-role="table-pnl"][data-m19-order-id="7"]');
  const tableMarkBefore = document.querySelector('[data-m19-role="table-mark"][data-m19-order-id="7"]');
  const dockPnlBefore = document.querySelector('[data-m19-role="dock-pnl-dollar"][data-m19-order-id="7"]');
  const dockRBefore = document.querySelector('[data-m19-role="dock-r"][data-m19-order-id="7"]');
  const dockMarginBefore = document.querySelector('[data-m19-role="dock-margin"][data-m19-order-id="7"]');
  const dockTimeBefore = document.querySelector('[data-m19-role="dock-time"][data-m19-order-id="7"]');
  assert.ok(cardDollarBefore && cardPctBefore, 'card dollar+percent roles stamped');
  assert.ok(tablePnlBefore && tableMarkBefore, 'table roles stamped');
  assert.ok(dockPnlBefore && dockRBefore && dockMarginBefore && dockTimeBefore, 'dock roles stamped');
  assert.equal(cardDollarBefore.textContent, '+$12.50');
  assert.equal(cardPctBefore.textContent, '12.50%');
  assert.equal(tablePnlBefore.textContent, '+$12.50');
  assert.equal(dockPnlBefore.textContent, '+$12.50');
  assert.equal(dockRBefore.textContent, '+0.13R');

  om.openPositions[0].unrealizedPnL = 25;
  om.equity = 10025;
  om.orderService.equity = 10025;
  om.chart.latestCandle = { c: 1.10250, close: 1.10250 };
  global.__m19InnerHtmlWrites = 0;
  global.__m19InnerHtmlWriteSites = [];
  OrderManager.prototype._updatePositionsPanelRuntimeOnly.call(om);
  assert.equal(global.__m19InnerHtmlWrites, 0, 'runtime-only must perform zero innerHTML writes');
  assert.deepEqual(global.__m19InnerHtmlWriteSites, []);

  assert.equal(cardDollarBefore.textContent, '+$25.00');
  assert.equal(cardPctBefore.textContent, '25.00%');
  assert.equal(tablePnlBefore.textContent, '+$25.00');
  assert.equal(tableMarkBefore.textContent, '1.10250');
  assert.equal(dockPnlBefore.textContent, '+$25.00');
  assert.equal(dockRBefore.textContent, '+0.25R');
  assert.equal(dockMarginBefore.textContent, '2.5%');
  assert.ok(dockTimeBefore.textContent.length > 0, 'dock time patched');
  assert.equal(document.getElementById('unrealizedPnL').textContent, '+$25.00');
});

test('parity: runtime-only live fields match a fresh structural rebuild', () => {
  const dom = installContractDom();
  const om = seedOm(OrderManager, dom);
  om.openPositions[0].unrealizedPnL = 40;
  om.equity = 10040;
  om.orderService.equity = 10040;
  om.chart.latestCandle = { c: 1.10400, close: 1.10400 };

  OrderManager.prototype.updatePositionsPanel.call(om);
  const roleMap = {
    cardDollar: 'card-pnl-dollar',
    cardPct: 'card-pnl-percent',
    tablePnl: 'table-pnl',
    tableMark: 'table-mark',
    dockPnl: 'dock-pnl-dollar',
    dockR: 'dock-r',
    dockMargin: 'dock-margin',
    dockTime: 'dock-time',
  };
  const snap = (role) => {
    const el = document.querySelector(`[data-m19-role="${role}"][data-m19-order-id="7"]`);
    return el ? el.textContent : null;
  };
  const structural = {
    cardDollar: snap('card-pnl-dollar'),
    cardPct: snap('card-pnl-percent'),
    tablePnl: snap('table-pnl'),
    tableMark: snap('table-mark'),
    dockPnl: snap('dock-pnl-dollar'),
    dockR: snap('dock-r'),
    dockMargin: snap('dock-margin'),
    dockTime: snap('dock-time'),
    unrealized: document.getElementById('unrealizedPnL').textContent,
    balance: document.getElementById('accountBalance').textContent,
  };
  for (const v of Object.values(structural)) {
    assert.ok(v != null && v !== '', `structural field present: ${v}`);
  }

  for (const key of Object.keys(roleMap)) {
    const el = document.querySelector(`[data-m19-role="${roleMap[key]}"][data-m19-order-id="7"]`);
    if (el) el.textContent = 'STALE';
  }
  document.getElementById('unrealizedPnL').textContent = 'STALE';
  document.getElementById('accountBalance').textContent = 'STALE';

  global.__m19InnerHtmlWrites = 0;
  OrderManager.prototype._updatePositionsPanelRuntimeOnly.call(om);
  assert.equal(global.__m19InnerHtmlWrites, 0);

  assert.equal(snap('card-pnl-dollar'), structural.cardDollar);
  assert.equal(snap('card-pnl-percent'), structural.cardPct);
  assert.equal(snap('table-pnl'), structural.tablePnl);
  assert.equal(snap('table-mark'), structural.tableMark);
  assert.equal(snap('dock-pnl-dollar'), structural.dockPnl);
  assert.equal(snap('dock-r'), structural.dockR);
  assert.equal(snap('dock-margin'), structural.dockMargin);
  assert.equal(snap('dock-time'), structural.dockTime);
  assert.equal(document.getElementById('unrealizedPnL').textContent, structural.unrealized);
  assert.equal(document.getElementById('accountBalance').textContent, structural.balance);
});

test('true rAF coalesce: 100 schedules before flush → exactly one runtime callback', () => {
  const dom = installContractDom();
  const om = seedOm(OrderManager, dom);
  let liteCalls = 0;
  const realLite = OrderManager.prototype._updatePositionsPanelRuntimeOnly;
  om._updatePositionsPanelRuntimeOnly = function (...args) {
    liteCalls += 1;
    return realLite.apply(this, args);
  };
  om._positionsPanelRuntimeRaf = null;
  for (let i = 0; i < 100; i++) {
    OrderManager.prototype._schedulePositionsPanelRuntimeUpdate.call(om);
  }
  assert.equal(global.__m19RafQueueLength(), 1, 'only one rAF pending');
  assert.equal(liteCalls, 0, 'callback must not run before flush');
  global.__m19FlushRaf();
  assert.equal(liteCalls, 1, 'exactly one runtime callback after flush');
  assert.equal(om._positionsPanelRuntimeRaf, null);
});
