#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const ORDER_MANAGER_PATH = path.resolve(root, 'chart v 1.4/chart/modules/order-manager.js');
const ORDER_MANAGER_MIRROR_PATH = path.resolve(root, 'homepage/public/chart/modules/order-manager.js');

export const ENTRY_LEVELS_CAP_SIGNATURE = 'TALARIA_ENTRY_LEVELS_CAP_V1';
export const ENTRY_LEVELS_CAP_SWITCH = '__TALARIA_ENTRY_LEVELS_CAP_V1';
export const ENTRY_LEVELS_CAP = 4;

function withWindowSwitch(value, fn) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prevWindow = globalThis.window;
  globalThis.window = { [ENTRY_LEVELS_CAP_SWITCH]: value };
  try {
    return fn();
  } finally {
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
}

function withQuietConsole(fn) {
  const prevLog = console.log;
  const prevWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = prevLog;
    console.warn = prevWarn;
  }
}

function makeOrder(id, type = 'BUY') {
  return {
    id,
    type,
    status: 'OPEN',
    quantity: 1,
    openPrice: 100 + id,
    openTime: 1700000000000 + id,
    scaleWithExisting: true,
  };
}

function makeOrderManager(existingCount) {
  const OrderManager = require(ORDER_MANAGER_PATH);
  const om = Object.create(OrderManager.prototype);
  om.openPositions = [];
  om.orders = [];
  om.scaledTrades = new Map();
  om.tradeGroupIdCounter = 10;
  om.notifications = [];
  om.showNotification = (message, type) => om.notifications.push({ message, type });
  om.drawSLTPLines = () => {};

  const entries = [];
  const groupId = 7;
  for (let i = 0; i < existingCount; i++) {
    const order = makeOrder(i + 1);
    order.tradeGroupId = groupId;
    entries.push(order);
    om.openPositions.push(order);
  }
  if (entries.length) {
    om.scaledTrades.set(groupId, {
      groupId,
      entries,
      side: 'BUY',
      openTime: entries[0].openTime,
      totalQuantity: entries.length,
      avgEntry: 100,
      status: 'OPEN',
    });
  }
  return { om, groupId };
}

function runScalingScenario({ existingCount, capSwitch }) {
  return withWindowSwitch(capSwitch, () => withQuietConsole(() => {
    const { om, groupId } = makeOrderManager(existingCount);
    const order = makeOrder(99);
    const beforeCount = om.scaledTrades.get(groupId)?.entries?.length || 0;
    const result = om.applyScaling(order);
    const resolvedGroupId = order.tradeGroupId ?? groupId;
    const group = om.scaledTrades.get(resolvedGroupId);
    const afterCount = group?.entries?.length || 0;
    return {
      existingCount,
      capSwitch,
      beforeCount,
      afterCount,
      resultReturnedGroup: !!result,
      newOrderAcceptedIntoGroup: group?.entries?.includes(order) === true,
      newOrderTradeGroupId: order.tradeGroupId ?? null,
      notifications: om.notifications,
      realOrdersOnOrderManager: om.openPositions.length === existingCount
        && om.openPositions.every((row) => row.status === 'OPEN' && row.type === 'BUY'),
    };
  }));
}

function sourceChecks() {
  const chartSource = fs.readFileSync(ORDER_MANAGER_PATH, 'utf8');
  const mirrorSource = fs.readFileSync(ORDER_MANAGER_MIRROR_PATH, 'utf8');
  return {
    mirrorsByteIdentical: chartSource === mirrorSource,
    switchPresent: chartSource.includes(ENTRY_LEVELS_CAP_SWITCH),
    capHelperPresent: chartSource.includes('_canAddMoreScaledEntryLevels'),
    scalingPathBound: /applyScaling\s*\([^)]*\)[\s\S]*?_canAddMoreScaledEntryLevels[\s\S]*?group\.entries\.push\(order\)/.test(chartSource),
  };
}

export function runEntryLevelsCapGate() {
  const source = sourceChecks();
  const zeroTrade = runScalingScenario({ existingCount: 0, capSwitch: true });
  const capOn = runScalingScenario({ existingCount: ENTRY_LEVELS_CAP, capSwitch: true });
  const capOff = runScalingScenario({ existingCount: ENTRY_LEVELS_CAP, capSwitch: false });
  const belowCap = runScalingScenario({ existingCount: ENTRY_LEVELS_CAP - 1, capSwitch: true });

  const cells = [
    {
      name: 'ENTRY-CAP-SOURCE-PRESENT-BOUND-MIRRORED',
      status: source.mirrorsByteIdentical && source.switchPresent && source.capHelperPresent && source.scalingPathBound ? 'GREEN' : 'RED',
      source,
    },
    {
      name: 'ENTRY-CAP-ZERO-TRADE-REGIME',
      status: zeroTrade.afterCount === 1 && zeroTrade.newOrderAcceptedIntoGroup === true ? 'GREEN' : 'RED',
      metrics: zeroTrade,
    },
    {
      name: 'ENTRY-CAP-TRADE-HEAVY-REGIME',
      status: capOn.beforeCount === ENTRY_LEVELS_CAP
        && capOn.afterCount === ENTRY_LEVELS_CAP
        && capOn.newOrderAcceptedIntoGroup === false
        && capOn.realOrdersOnOrderManager === true
        ? 'GREEN'
        : 'RED',
      metrics: capOn,
    },
    {
      name: 'NC-ENTRY-CAP-BYPASS-PATH-RED',
      status: capOff.afterCount === ENTRY_LEVELS_CAP + 1 && capOff.newOrderAcceptedIntoGroup === true ? 'GREEN' : 'RED',
      reportStatus: capOff.afterCount === ENTRY_LEVELS_CAP + 1 ? 'RED' : 'GREEN',
      metrics: capOff,
    },
    {
      name: 'ENTRY-CAP-BELOW-CAP-STILL-SCALES',
      status: belowCap.afterCount === ENTRY_LEVELS_CAP && belowCap.newOrderAcceptedIntoGroup === true ? 'GREEN' : 'RED',
      metrics: belowCap,
    },
  ];
  const status = cells.every((cell) => cell.status === 'GREEN') ? 'GREEN' : 'RED';
  return {
    signature: ENTRY_LEVELS_CAP_SIGNATURE,
    switchName: ENTRY_LEVELS_CAP_SWITCH,
    cap: ENTRY_LEVELS_CAP,
    status,
    cells,
    regimes: {
      zeroTrade,
      tradeHeavy: capOn,
      bypassControl: capOff,
      belowCap,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = runEntryLevelsCapGate();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
