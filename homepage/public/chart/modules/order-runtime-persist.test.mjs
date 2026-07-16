/**
 * A6-2 RC5 order persistence property tests.
 * GREEN:  node order-runtime-persist.test.mjs
 * RED:    TALARIA_ORDER_PERSISTENCE_V1=0 node order-runtime-persist.test.mjs
 */
import {
    applyRuntimeOrderPatchToStore,
    buildRuntimeOrderPatch,
    countDuplicateOrderIds,
    deserializeRuntimeOrderPatch,
    hasRestorableRuntimeOrders,
    orderPersistenceV1Enabled,
    persistenceBackendForFixEnabled,
    runtimeOrderStorageKey,
    serializeRuntimeOrderPatch,
} from './order-runtime-persist.mjs';

const ON = {};
const OFF = { __TALARIA_DISABLE_ORDER_PERSISTENCE_V1: true };

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed += 1; return; }
    failed += 1;
    console.error(`FAIL: ${msg}`);
}

console.log('\n--- switches ---');
assert(orderPersistenceV1Enabled(ON), 'persistence V1 default ON');
assert(!orderPersistenceV1Enabled(OFF), 'persistence V1 OFF when disabled');

console.log('\n--- serialize roundtrip ---');
const pending = [{ id: 1, orderType: 'limit', entryPrice: 1.095, stopLoss: 1.09, takeProfit: 1.11, status: 'PENDING' }];
const open = [{ id: 2, openPrice: 1.10, stopLoss: 1.08, takeProfit: 1.14, type: 'BUY', quantity: 1 }];
const patch = buildRuntimeOrderPatch(pending, open, { balance: 10000, equity: 10050, initialBalance: 10000 }, { orderIdCounter: 3, tradeGroupIdCounter: 1 });
const raw = serializeRuntimeOrderPatch(patch);
const restored = deserializeRuntimeOrderPatch(raw);
assert(restored?.pending_orders?.length === 1, 'pending roundtrip');
assert(restored?.open_positions?.[0]?.stopLoss === 1.08, 'open SL intact');
assert(restored?.open_positions?.[0]?.takeProfit === 1.14, 'open TP intact');
assert(hasRestorableRuntimeOrders(restored), 'has restorable orders');
assert(countDuplicateOrderIds(restored) === 0, 'no duplicate ids');

console.log('\n--- apply to store (F5 end-state) ---');
const store = { pendingOrders: [], openPositions: [], balance: 0, orderIdCounter: 1 };
applyRuntimeOrderPatchToStore(store, restored);
assert(store.pendingOrders.length === 1 && store.pendingOrders[0].entryPrice === 1.095, 'pending limit restored');
assert(store.openPositions.length === 1 && store.openPositions[0].openPrice === 1.10, 'open position restored');
assert(store.balance === 10000, 'balance restored');
assert(store.orderIdCounter === 3, 'counter restored');

console.log('\n--- session key scoping ---');
assert(runtimeOrderStorageKey(null).includes('no-session'), 'no-session key');
assert(runtimeOrderStorageKey('abc123').endsWith('abc123'), 'session-scoped key');

console.log('\n--- RED backend when switch OFF ---');
assert(persistenceBackendForFixEnabled(false, 'local') === 'local', 'legacy localStorage when fix OFF');
assert(persistenceBackendForFixEnabled(true, 'local') === 'session', 'sessionStorage when fix ON');

console.log('\n--- duplicate detection ---');
const dupPatch = buildRuntimeOrderPatch(
    [{ id: 5, entryPrice: 1.1 }],
    [{ id: 5, openPrice: 1.1 }],
    {}, {}
);
assert(countDuplicateOrderIds(dupPatch) === 1, 'duplicate id detected');

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
