import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { buildLiveTradeRowsFromOrderManager } from "./orderManagerTradeRows.js";

const require = createRequire(import.meta.url);
const OrderManager = require("../../chart/modules/order-manager.js");

test("open replay trade duration uses the owning order manager clock", () => {
  global.window = {};
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  const replayNow = openTime + 90 * 60_000;
  const order = {
    id: 3,
    ticker: "GBPUSD",
    type: "BUY",
    status: "OPEN",
    openTime,
    openPrice: 1.29527,
    quantity: 0.95,
    unrealizedPnL: -5.7,
  };
  const om = {
    chart: { replaySystem: { isActive: true, replayTimestamp: replayNow } },
    openPositions: [order],
    pendingOrders: [],
    closedPositions: [],
    tradeJournal: [],
    formatPrice: (value) => Number(value).toFixed(5),
    formatQuantity: (value) => Number(value).toFixed(2),
  };

  const [row] = buildLiveTradeRowsFromOrderManager(
    om,
    { gn: "#0f0", rd: "#f00", tm: "#888" },
  );

  assert.equal(row.dur, "1h 30m",
    "historical replay orders must never measure duration against Date.now()");
});

test("closed replay trade without a close timestamp does not borrow wall time", () => {
  global.window = {};
  const realNow = Date.now;
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  Date.now = () => openTime + 139_271 * 60 * 60_000;
  try {
    const om = {
      replaySystem: { replayTimestamp: openTime + 2 * 60 * 60_000 },
      openPositions: [],
      pendingOrders: [],
      closedPositions: [{
        id: 4,
        ticker: "GBPUSD",
        type: "BUY",
        status: "CLOSED",
        openTime,
        closePrice: 1.296,
        openPrice: 1.295,
        quantity: 1,
        pnl: 10,
      }],
      tradeJournal: [],
      formatPrice: (value) => Number(value).toFixed(5),
      formatQuantity: (value) => Number(value).toFixed(2),
    };

    const [row] = buildLiveTradeRowsFromOrderManager(
      om,
      { gn: "#0f0", rd: "#f00", tm: "#888" },
    );

    assert.equal(row.dur, "—", "closed rows missing a replay close timestamp must not use Date.now()");
  } finally {
    Date.now = realNow;
  }
});

test("journal-only closed row normalizes numeric timestamp strings", () => {
  global.window = {};
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  const closeTime = openTime + 150 * 60_000;
  const om = {
    replaySystem: { replayTimestamp: closeTime },
    openPositions: [],
    pendingOrders: [],
    closedPositions: [],
    tradeJournal: [{
      id: 5,
      tradeId: 5,
      ticker: "GBPUSD",
      type: "BUY",
      openTime: String(openTime),
      closeTime: String(closeTime),
      entryPrice: 1.295,
      closePrice: 1.296,
      quantity: 1,
      pnl: 10,
    }],
    formatPrice: (value) => Number(value).toFixed(5),
    formatQuantity: (value) => Number(value).toFixed(2),
  };

  const [row] = buildLiveTradeRowsFromOrderManager(
    om,
    { gn: "#0f0", rd: "#f00", tm: "#888" },
  );

  assert.equal(row.dur, "2h 30m", "numeric timestamp strings should stay in replay epoch-ms domain");
});

test("duration kill-switch preserves legacy journal-only replay clock fallback", () => {
  const realNow = Date.now;
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  const replayNow = openTime + 2 * 60 * 60_000;
  global.window = {
    __TALARIA_DISABLE_TRADE_DURATION_NORM_V1: true,
    chart: { replaySystem: { replayTimestamp: replayNow } },
  };
  Date.now = () => openTime + 139_271 * 60 * 60_000;
  try {
    const om = {
      replaySystem: { replayTimestamp: replayNow },
      openPositions: [],
      pendingOrders: [],
      closedPositions: [],
      tradeJournal: [{
        id: 6,
        tradeId: 6,
        ticker: "GBPUSD",
        type: "BUY",
        openTime,
        entryPrice: 1.295,
        closePrice: 1.296,
        quantity: 1,
        pnl: 10,
      }],
      formatPrice: (value) => Number(value).toFixed(5),
      formatQuantity: (value) => Number(value).toFixed(2),
    };

    const [row] = buildLiveTradeRowsFromOrderManager(
      om,
      { gn: "#0f0", rd: "#f00", tm: "#888" },
    );

    assert.equal(row.dur, "2h 0m", "switch OFF must preserve legacy rowNowMs fallback, not Date.now()");
  } finally {
    Date.now = realNow;
    global.window = {};
  }
});

test("duration kill-switch keeps legacy Date.parse handling for numeric strings", () => {
  global.window = { __TALARIA_DISABLE_TRADE_DURATION_NORM_V1: true };
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  const closeTime = openTime + 150 * 60_000;
  const om = {
    replaySystem: { replayTimestamp: closeTime },
    openPositions: [],
    pendingOrders: [],
    closedPositions: [],
    tradeJournal: [{
      id: 7,
      tradeId: 7,
      ticker: "GBPUSD",
      type: "BUY",
      openTime: String(openTime),
      closeTime: String(closeTime),
      entryPrice: 1.295,
      closePrice: 1.296,
      quantity: 1,
      pnl: 10,
    }],
    formatPrice: (value) => Number(value).toFixed(5),
    formatQuantity: (value) => Number(value).toFixed(2),
  };

  const [row] = buildLiveTradeRowsFromOrderManager(
    om,
    { gn: "#0f0", rd: "#f00", tm: "#888" },
  );

  assert.equal(row.dur, "0h 0m", "switch OFF keeps the legacy numeric-string Date.parse path");
  global.window = {};
});

test("pending fills do not force-open the trade card", () => {
  global.window = {};
  const manager = Object.create(OrderManager.prototype);
  assert.equal(manager._shouldAutoOpenTradeCardOnPendingFill(), false);

  global.window = { __TALARIA_DISABLE_PENDING_FILL_NO_AUTO_CARD_V1: true };
  assert.equal(manager._shouldAutoOpenTradeCardOnPendingFill(), true,
    "kill-switch reconstructs the old blocking popup");
});
