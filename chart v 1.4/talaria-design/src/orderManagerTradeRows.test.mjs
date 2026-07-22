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

test("pending fills do not force-open the trade card", () => {
  global.window = {};
  const manager = Object.create(OrderManager.prototype);
  assert.equal(manager._shouldAutoOpenTradeCardOnPendingFill(), false);

  global.window = { __TALARIA_DISABLE_PENDING_FILL_NO_AUTO_CARD_V1: true };
  assert.equal(manager._shouldAutoOpenTradeCardOnPendingFill(), true,
    "kill-switch reconstructs the old blocking popup");
});
