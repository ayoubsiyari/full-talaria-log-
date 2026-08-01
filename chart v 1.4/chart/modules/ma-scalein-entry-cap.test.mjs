/**
 * MA-SCALECAP — the manual scale-in path must respect MAX_ENTRY_LEVELS.
 *
 * Product under test: order-manager.js `applyScaling()` (reached via
 * `scaleNextOrder`), which pushed into a scaled group's `entries` array with no
 * entry-level cap, while the pre-placement multi-entry ladder caps the same
 * invariant through `_canAddMoreMultiEntryLevels` / MAX_ENTRY_LEVELS.
 *
 * Kill-switch: __TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1 (default unset = cap ON).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/ma-scalein-entry-cap.test.mjs"
 *
 * Every cell is BEHAVIOURAL: it drives the real applyScaling /
 * createAggregateJournalEntry / _canAddMoreMultiEntryLevels and asserts on the
 * structures they produce. There are no source-text anchors anywhere in this
 * file, so a mutant that breaks the behaviour cannot be masked by the source
 * still containing the right words.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FLAG = '__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1';

// ─── Host stubs ────────────────────────────────────────────────────────────

function installDom() {
  global.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=scalecap' },
  };
  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {}, appendChild() {}, addEventListener() {},
    }),
    addEventListener() {},
    body: { appendChild() {} },
  };
  global.userStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };
}

installDom();
const OrderManager = require('./order-manager.js');

/** The cap the pre-placement multi-entry ladder already enforces. */
const MAX_ENTRY_LEVELS = 4;

// ─── Drivers ───────────────────────────────────────────────────────────────

/** applyScaling logs ~10 lines per call; keep the harness output readable. */
function quiet(fn) {
  const log = console.log;
  const warn = console.warn;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    return { value: fn(), lines };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

/**
 * Real prototype, no init(). Only the collaborators applyScaling and
 * createAggregateJournalEntry actually reach are stubbed.
 */
function makeManager() {
  const om = Object.create(OrderManager.prototype);
  om.openPositions = [];
  om.closedPositions = [];
  om.orders = [];
  om.scaledTrades = new Map();
  om.splitTrades = new Map();
  om.tradeJournal = [];
  om.tradeGroupIdCounter = 1;
  om.enablePositionScaling = true;
  om.scaleNextOrder = false;
  om.pipSize = 0.0001;
  om.pipValuePerLot = 10;
  om.drawSLTPLines = () => {};
  // Persistence enrichment is a separate concern; identity keeps these cells
  // pointed at the entries/entryScreenshots derivation under test.
  om._enrichJournalEntryForPersistence = (entry) => entry;
  om._getSessionDefaultTradeSetup = () => null;
  return om;
}

function makeOrder(i, opts = {}) {
  return {
    id: 100 + i,
    type: opts.side || 'BUY',
    status: 'OPEN',
    symbol: 'EURUSD',
    ticker: 'EURUSD',
    openPrice: 1.1 + i * 0.001,
    quantity: opts.quantity === undefined ? 1 : opts.quantity,
    openTime: 1_760_000_000_000 + i * 60_000,
    entryScreenshot: opts.shot === undefined ? `data:image/png;base64,SHOT-${100 + i}` : opts.shot,
  };
}

/**
 * Drive one scale-in exactly the way the product does: placeOrder calls
 * applyScaling BEFORE the order is registered into openPositions.
 */
function scaleIn(om, i, opts = {}) {
  const order = makeOrder(i, opts);
  const { lines } = quiet(() => om.applyScaling(order));
  om.openPositions.push(order);
  om.orders.push(order);
  return { order, lines };
}

/** n orders through the scale-in path; returns [order, ...]. */
function driveScaleIns(om, n, opts = {}) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(scaleIn(om, i, opts).order);
  return out;
}

/** The single group the drive produced (there is exactly one per side here). */
function onlyGroup(om) {
  const groups = [...om.scaledTrades.values()];
  assert.equal(groups.length, 1, 'expected exactly one scaled group');
  return groups[0];
}

function closeLegs(group, { pnl = 10 } = {}) {
  group.entries.forEach((e, i) => {
    e.status = 'CLOSED';
    e.closePrice = e.openPrice + 0.002;
    e.closeTime = e.openTime + 3_600_000;
    e.pnl = pnl + i;
    e.riskAmount = 50;
  });
  group.status = 'CLOSED';
}

function withFlag(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(global.window, FLAG);
  const prev = global.window[FLAG];
  global.window[FLAG] = value;
  try {
    return fn();
  } finally {
    if (had) global.window[FLAG] = prev;
    else delete global.window[FLAG];
  }
}

function clearFlag() {
  delete global.window[FLAG];
}

// ─── Cells ─────────────────────────────────────────────────────────────────

test('SC-C1 unbounded growth gate: 12 scale-ins cannot exceed MAX_ENTRY_LEVELS legs', () => {
  clearFlag();
  const om = makeManager();
  driveScaleIns(om, 12);
  const group = onlyGroup(om);
  assert.ok(
    group.entries.length <= MAX_ENTRY_LEVELS,
    `group.entries grew to ${group.entries.length}; MAX_ENTRY_LEVELS is ${MAX_ENTRY_LEVELS}`,
  );
});

test('SC-C2 cap boundary: the 4th leg is ACCEPTED', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS);
  const group = onlyGroup(om);
  assert.equal(group.entries.length, MAX_ENTRY_LEVELS);
  assert.equal(group.entries[MAX_ENTRY_LEVELS - 1], orders[MAX_ENTRY_LEVELS - 1]);
  assert.equal(orders[MAX_ENTRY_LEVELS - 1].tradeGroupId, group.groupId);
});

test('SC-C3 cap boundary: the 5th leg is REFUSED and the group stays at 4', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 1);
  const group = onlyGroup(om);
  assert.equal(group.entries.length, MAX_ENTRY_LEVELS);
  const fifth = orders[MAX_ENTRY_LEVELS];
  assert.ok(!group.entries.includes(fifth), '5th leg must not be a group member');
});

test('SC-C4 refused leg carries NO tradeGroupId (orphan / silent-drop guard)', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 3);
  const group = onlyGroup(om);
  for (const refused of orders.slice(MAX_ENTRY_LEVELS)) {
    assert.ok(!group.entries.includes(refused));
    assert.ok(
      refused.tradeGroupId === undefined || refused.tradeGroupId === null,
      `refused leg #${refused.id} was stamped tradeGroupId=${refused.tradeGroupId}; `
      + 'closePosition() branches on tradeGroupId and then trusts group.entries, '
      + 'so a stamped non-member leg is never journaled',
    );
  }
});

test('SC-C5 refused leg is routed down the STANDALONE close path', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 1);
  const refused = orders[MAX_ENTRY_LEVELS];
  // These two predicates are exactly what closePosition() consults.
  assert.equal(om.getScaledTradeInfo(refused), null);
  const { value: complete } = quiet(() => om.checkScaledGroupComplete(refused));
  assert.equal(complete, false);
});

test('SC-C6 refused leg is a WORKING position with its own usable fields', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 1);
  const refused = orders[MAX_ENTRY_LEVELS];
  assert.ok(om.openPositions.includes(refused), 'refused leg must still be an open position');
  assert.equal(refused.status, 'OPEN');
  assert.equal(refused.type, 'BUY');
  assert.equal(typeof refused.id, 'number');
  assert.ok(refused.openPrice > 0);
  assert.ok(refused.quantity > 0);
  assert.ok(refused.openTime > 0);
  assert.equal(typeof refused.entryScreenshot, 'string');
});

test('SC-C7 accepted legs keep a correct weighted average and total quantity', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 2, { quantity: 2 });
  const group = onlyGroup(om);
  const legs = orders.slice(0, MAX_ENTRY_LEVELS);
  const expectedQty = legs.reduce((s, e) => s + e.quantity, 0);
  const expectedAvg = legs.reduce((s, e) => s + e.openPrice * e.quantity, 0) / expectedQty;
  assert.equal(group.totalQuantity, expectedQty);
  assert.ok(Math.abs(group.avgEntry - expectedAvg) < 1e-12, `avgEntry ${group.avgEntry} vs ${expectedAvg}`);
  assert.equal(group.status, 'OPEN');
  assert.equal(group.side, 'BUY');
});

test('SC-C8 lazily-formed group (existing position had no groupId) also tops out at 4', () => {
  clearFlag();
  const om = makeManager();
  // A pre-existing open position that never went through applyScaling.
  const seed = makeOrder(0);
  om.openPositions.push(seed);
  om.orders.push(seed);
  for (let i = 1; i <= MAX_ENTRY_LEVELS + 2; i++) scaleIn(om, i);
  const group = onlyGroup(om);
  assert.equal(group.entries.length, MAX_ENTRY_LEVELS);
  assert.equal(group.entries[0], seed);
});

test('SC-C9 aggregate journal entryScreenshots is bounded by the same cap', () => {
  clearFlag();
  const om = makeManager();
  driveScaleIns(om, MAX_ENTRY_LEVELS + 4);
  const group = onlyGroup(om);
  closeLegs(group);
  const je = quiet(() => om.createAggregateJournalEntry(group)).value;
  assert.ok(Array.isArray(je.entryScreenshots));
  assert.ok(
    je.entryScreenshots.length <= MAX_ENTRY_LEVELS,
    `entryScreenshots grew to ${je.entryScreenshots.length}`,
  );
  assert.equal(je.numberOfEntries, MAX_ENTRY_LEVELS);
  assert.equal(je.scaledEntries.length, MAX_ENTRY_LEVELS);
});

test('SC-C10 entryScreenshots stays index- and orderId-aligned with entries', () => {
  clearFlag();
  const om = makeManager();
  driveScaleIns(om, MAX_ENTRY_LEVELS + 4);
  const group = onlyGroup(om);
  closeLegs(group);
  const je = quiet(() => om.createAggregateJournalEntry(group)).value;
  assert.equal(je.entryScreenshots.length, group.entries.length);
  group.entries.forEach((leg, i) => {
    assert.equal(je.entryScreenshots[i].orderId, leg.id, `entryScreenshots[${i}] mis-associated`);
    assert.equal(je.entryScreenshots[i].screenshot, leg.entryScreenshot);
    assert.equal(je.entryScreenshots[i].openPrice, leg.openPrice);
    assert.equal(je.entryScreenshots[i].openTime, leg.openTime);
  });
});

test('SC-C11 a REFUSED leg\'s screenshot never lands in the group aggregate', () => {
  clearFlag();
  const om = makeManager();
  const orders = driveScaleIns(om, MAX_ENTRY_LEVELS + 3);
  const group = onlyGroup(om);
  closeLegs(group);
  const je = quiet(() => om.createAggregateJournalEntry(group)).value;
  const shots = new Set(je.entryScreenshots.map((s) => s.screenshot));
  const ids = new Set(je.entryScreenshots.map((s) => s.orderId));
  for (const refused of orders.slice(MAX_ENTRY_LEVELS)) {
    assert.ok(!ids.has(refused.id), `refused leg #${refused.id} appears in entryScreenshots`);
    assert.ok(!shots.has(refused.entryScreenshot), `refused leg #${refused.id} shot mis-attributed`);
  }
});

test('SC-C12 every ACCEPTED leg with a screenshot is represented (no silent drop)', () => {
  clearFlag();
  const om = makeManager();
  driveScaleIns(om, MAX_ENTRY_LEVELS + 2);
  const group = onlyGroup(om);
  closeLegs(group);
  const je = quiet(() => om.createAggregateJournalEntry(group)).value;
  const ids = new Set(je.entryScreenshots.map((s) => s.orderId));
  for (const leg of group.entries) {
    assert.ok(leg.entryScreenshot, 'fixture legs all carry a screenshot');
    assert.ok(ids.has(leg.id), `accepted leg #${leg.id} lost its screenshot`);
  }
});

test('SC-C13 FLAG-02 TRUTHY semantics across all twelve values', () => {
  const OVER = MAX_ENTRY_LEVELS + 3; // 7 scale-ins
  const cases = [
    // truthy -> cap DISABLED (legacy unbounded arm)
    { v: 1, truthy: true, label: 'number 1' },
    { v: 'yes', truthy: true, label: "string 'yes'" },
    { v: 'true', truthy: true, label: "string 'true'" },
    { v: {}, truthy: true, label: 'empty object' },
    { v: [], truthy: true, label: 'empty array' },
    { v: '0', truthy: true, label: "STRING '0'" },
    // falsy -> cap ACTIVE
    { v: undefined, truthy: false, label: 'undefined' },
    { v: null, truthy: false, label: 'null' },
    { v: false, truthy: false, label: 'false' },
    { v: 0, truthy: false, label: 'number 0' },
    { v: '', truthy: false, label: 'empty string' },
    { v: NaN, truthy: false, label: 'NaN' },
  ];
  assert.equal(cases.length, 12);
  for (const c of cases) {
    const om = makeManager();
    withFlag(c.v, () => driveScaleIns(om, OVER));
    const group = onlyGroup(om);
    if (c.truthy) {
      assert.equal(
        group.entries.length, OVER,
        `${c.label} is TRUTHY: the cap must be OFF (got ${group.entries.length} legs, want ${OVER})`,
      );
    } else {
      assert.equal(
        group.entries.length, MAX_ENTRY_LEVELS,
        `${c.label} is FALSY: the cap must be ON (got ${group.entries.length} legs, want ${MAX_ENTRY_LEVELS})`,
      );
    }
  }
});

test('SC-C14 FLAG-03 working product on the OFF arm: a scale-in still produces a usable entry', () => {
  const om = makeManager();
  withFlag(1, () => {
    const first = scaleIn(om, 1).order;
    first.stopLoss = 1.0900;
    first.takeProfit = 1.2000;
    first.riskAmount = 75;
    first.sourceFileId = 'file-7';
    const second = scaleIn(om, 2, { quantity: 3 }).order;
    const group = onlyGroup(om);

    // The scale-in produced a real, usable second entry inside a real group.
    assert.ok(group.entries.includes(second), 'OFF arm must still group the scale-in');
    assert.equal(second.tradeGroupId, group.groupId);
    assert.equal(group.entries.length, 2);
    assert.equal(group.side, 'BUY');
    assert.equal(group.status, 'OPEN');

    // Expected fields on the new entry: risk plumbing inherited from the leg
    // it scaled into, and its own price/quantity intact.
    assert.equal(second.stopLoss, 1.0900);
    assert.equal(second.takeProfit, 1.2000);
    assert.equal(second.riskAmount, 75);
    assert.equal(second.sourceFileId, 'file-7');
    assert.equal(second.quantity, 3);
    assert.equal(second.status, 'OPEN');

    // Aggregate maths across both legs is correct, not merely present.
    const expQty = first.quantity + second.quantity;
    const expAvg = (first.openPrice * first.quantity + second.openPrice * second.quantity) / expQty;
    assert.equal(group.totalQuantity, expQty);
    assert.ok(Math.abs(group.avgEntry - expAvg) < 1e-12);

    // ...and it settles into a usable aggregate journal row.
    closeLegs(group);
    const je = quiet(() => om.createAggregateJournalEntry(group)).value;
    assert.equal(je.numberOfEntries, 2);
    assert.equal(je.entryScreenshots.length, 2);
    assert.equal(je.entryScreenshots[1].orderId, second.id);
    assert.ok(Math.abs(je.openPrice - expAvg) < 1e-12);
    assert.equal(je.quantity, expQty);
    assert.equal(je.isScaledTrade, true);
  });
});

test('SC-C15 FLAG-03 working product on the ON arm: accepted legs inherit SL/TP normally', () => {
  clearFlag();
  const om = makeManager();
  const first = scaleIn(om, 1).order;
  first.stopLoss = 1.0800;
  first.tpTargets = [
    { id: 1, price: 1.15, percentage: 50, hit: true },
    { id: 2, price: 1.18, percentage: 50, hit: false },
  ];
  const second = scaleIn(om, 2).order;
  const group = onlyGroup(om);
  assert.ok(group.entries.includes(second));
  assert.equal(second.stopLoss, 1.0800);
  assert.equal(second.tpTargets.length, 2);
  assert.deepEqual(second.tpTargets.map((t) => t.hit), [false, false], 'cloned targets reset hit');
  assert.equal(second.tpTargets[1].price, 1.18);
  assert.notEqual(second.tpTargets, first.tpTargets, 'targets must be cloned, not shared');
});

test('SC-C16 FLAG-01 the switch is read FRESH on every call, never memoised', () => {
  clearFlag();
  const om = makeManager();

  // Arm 1: cap ON — tops out at 4 and refuses the 5th.
  driveScaleIns(om, MAX_ENTRY_LEVELS + 1);
  const group = onlyGroup(om);
  assert.equal(group.entries.length, MAX_ENTRY_LEVELS, 'arm 1 (flag unset) must cap');

  // Arm 2: same module, same manager instance, flag flipped truthy mid-run.
  withFlag('0', () => {
    scaleIn(om, 20);
    scaleIn(om, 21);
  });
  assert.equal(
    group.entries.length, MAX_ENTRY_LEVELS + 2,
    'arm 2 (flag truthy) must be observed WITHOUT reloading the module',
  );

  // Arm 3: flag cleared again — the cap comes straight back.
  scaleIn(om, 22);
  assert.equal(
    group.entries.length, MAX_ENTRY_LEVELS + 2,
    'arm 3 (flag cleared) must cap again on the very next call',
  );
});

test('SC-C17 the cap defaults ON when there is no window at all', () => {
  clearFlag();
  const savedWindow = global.window;
  const om = makeManager();
  try {
    delete global.window;
    driveScaleIns(om, MAX_ENTRY_LEVELS + 2);
  } finally {
    global.window = savedWindow;
  }
  assert.equal(onlyGroup(om).entries.length, MAX_ENTRY_LEVELS);
});

test('SC-C18 the shared cap predicate agrees with the ladder at every boundary', () => {
  const om = makeManager();
  assert.equal(om._canAddMoreMultiEntryLevels(0), true);
  assert.equal(om._canAddMoreMultiEntryLevels(1), true);
  assert.equal(om._canAddMoreMultiEntryLevels(MAX_ENTRY_LEVELS - 1), true);
  assert.equal(om._canAddMoreMultiEntryLevels(MAX_ENTRY_LEVELS), false);
  assert.equal(om._canAddMoreMultiEntryLevels(MAX_ENTRY_LEVELS + 1), false);
});

test('SC-C19 a refusal is reported, not silent', () => {
  clearFlag();
  const om = makeManager();
  for (let i = 1; i <= MAX_ENTRY_LEVELS; i++) scaleIn(om, i);
  const { lines } = scaleIn(om, MAX_ENTRY_LEVELS + 1);
  const text = lines.join('\n');
  assert.ok(
    /standalone/i.test(text) && new RegExp(String(MAX_ENTRY_LEVELS)).test(text),
    `refusal must be announced with the cap and the outcome; got:\n${text}`,
  );
});

test('SC-C21 a REFUSED leg is standalone but NOT unprotected', () => {
  clearFlag();
  const om = makeManager();
  const first = scaleIn(om, 1).order;
  first.stopLoss = 1.0750;
  first.takeProfit = 1.2500;
  first.riskAmount = 120;
  first.originalRiskAmount = 130;
  first.sourceFileId = 'file-9';
  const drawn = [];
  om.drawSLTPLines = (o) => drawn.push(o.id);
  for (let i = 2; i <= MAX_ENTRY_LEVELS; i++) scaleIn(om, i);
  const refused = scaleIn(om, MAX_ENTRY_LEVELS + 1).order;

  const group = onlyGroup(om);
  assert.equal(group.entries.length, MAX_ENTRY_LEVELS, 'the cap still holds');
  assert.ok(!group.entries.includes(refused));
  assert.ok(refused.tradeGroupId === undefined || refused.tradeGroupId === null);

  // The user asked to add to a protected position; a refused leg must not be
  // left without a stop just because the group was full.
  assert.equal(refused.stopLoss, 1.0750);
  assert.equal(refused.takeProfit, 1.2500);
  assert.equal(refused.riskAmount, 120);
  assert.equal(refused.originalRiskAmount, 130);
  assert.equal(refused.sourceFileId, 'file-9');
  assert.ok(drawn.includes(refused.id), 'refused leg must get its SL/TP lines drawn');
});

test('SC-C22 refused-leg inheritance never overwrites the order\'s own levels', () => {
  clearFlag();
  const om = makeManager();
  const first = scaleIn(om, 1).order;
  first.stopLoss = 1.0750;
  first.takeProfit = 1.2500;
  for (let i = 2; i <= MAX_ENTRY_LEVELS; i++) scaleIn(om, i);
  const order = makeOrder(MAX_ENTRY_LEVELS + 1);
  order.stopLoss = 1.0500;
  order.takeProfit = 1.3000;
  quiet(() => om.applyScaling(order));
  om.openPositions.push(order);
  assert.equal(order.stopLoss, 1.0500);
  assert.equal(order.takeProfit, 1.3000);
});

test('SC-C20 the opposite-side scale-in is unaffected by a full BUY group', () => {
  clearFlag();
  const om = makeManager();
  driveScaleIns(om, MAX_ENTRY_LEVELS + 1);
  for (let i = 30; i <= 31; i++) scaleIn(om, i, { side: 'SELL' });
  const groups = [...om.scaledTrades.values()];
  const buy = groups.find((g) => g.side === 'BUY');
  const sell = groups.find((g) => g.side === 'SELL');
  assert.equal(buy.entries.length, MAX_ENTRY_LEVELS);
  assert.equal(sell.entries.length, 2, 'a full BUY group must not starve the SELL group');
});
