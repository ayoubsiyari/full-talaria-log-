/**
 * Panel-B place gate helpers (candle-ready + new-order detection).
 * GREEN: node order-mc-place-gate.test.mjs
 */
function panelHasReadableCandle(panelChart) {
    if (!panelChart) return false;
    try {
        const rs = panelChart.replaySystem;
        if (rs && rs.isActive && rs.animatingCandle) {
            const ac = Number.parseFloat(
                rs.animatingCandle.close ?? rs.animatingCandle.c
            );
            if (Number.isFinite(ac)) return true;
        }
        const raw = panelChart.rawData;
        if (Array.isArray(raw) && raw.length > 0) {
            const bar = raw[raw.length - 1];
            const c = Number.parseFloat(bar && (bar.c ?? bar.close));
            if (Number.isFinite(c)) return true;
        }
        const data = panelChart.data;
        if (Array.isArray(data) && data.length > 0) {
            const bar = data[data.length - 1];
            const c = Number.parseFloat(bar && (bar.c ?? bar.close));
            if (Number.isFinite(c)) return true;
        }
    } catch (_) { /* ignore */ }
    return false;
}

function isPlaceGateReady(d, panelChart) {
    const replayOk = !!(d && d.replayActive);
    const candleOk = (d && d.candleReady === true) || panelHasReadableCandle(panelChart);
    return replayOk && candleOk;
}

function collectHostLiveOrderIds(om) {
    const ids = new Set();
    if (!om) return ids;
    for (const o of (om.openPositions || [])) {
        if (o && o.id != null) ids.add(o.id);
    }
    for (const o of (om.pendingOrders || [])) {
        if (o && o.id != null) ids.add(o.id);
    }
    return ids;
}

function findNewestHostOrderNotIn(om, beforeIds) {
    if (!om) return null;
    const lists = [om.openPositions, om.pendingOrders];
    let newest = null;
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (let i = list.length - 1; i >= 0; i -= 1) {
            const o = list[i];
            if (!o || o.id == null) continue;
            if (beforeIds && beforeIds.has(o.id)) continue;
            if (!newest || Number(o.id) > Number(newest.id)) newest = o;
        }
    }
    return newest;
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed += 1; return; }
    failed += 1;
    console.error(`FAIL: ${msg}`);
}

console.log('--- candle readable ---');
assert(!panelHasReadableCandle(null), 'null chart not ready');
assert(!panelHasReadableCandle({ data: [], rawData: [] }), 'empty series not ready');
assert(panelHasReadableCandle({ data: [{ c: 1.1 }] }), 'data close ready');
assert(panelHasReadableCandle({ rawData: [{ close: 1.2 }] }), 'raw close ready');
assert(
    panelHasReadableCandle({
        replaySystem: { isActive: true, animatingCandle: { c: 1.3 } },
    }),
    'animating candle ready'
);
assert(
    !panelHasReadableCandle({
        replaySystem: { isActive: true, animatingCandle: { c: 'x' } },
        data: [],
    }),
    'non-finite animating rejected'
);

console.log('--- place gate ready ---');
assert(
    !isPlaceGateReady({ replayActive: true, candleReady: false }, { data: [] }),
    'replay without candle blocks'
);
assert(
    !isPlaceGateReady({ replayActive: false, candleReady: true }, { data: [{ c: 1 }] }),
    'candle without replay blocks'
);
assert(
    isPlaceGateReady({ replayActive: true, candleReady: true }, { data: [] }),
    'bridge candleReady alone ok'
);
assert(
    isPlaceGateReady({ replayActive: true }, { data: [{ c: 1.05 }] }),
    'parent-side candle fallback when bridge omits field'
);

console.log('--- new order detection ---');
const om = {
    openPositions: [{ id: 1 }, { id: 2 }],
    pendingOrders: [{ id: 10 }],
};
const before = collectHostLiveOrderIds(om);
assert(before.size === 3, 'collects open+pending ids');
assert(findNewestHostOrderNotIn(om, before) === null, 'no new order when unchanged');
om.openPositions.push({ id: 3 });
const created = findNewestHostOrderNotIn(om, before);
assert(created && created.id === 3, 'detects newly opened order');
assert(
    findNewestHostOrderNotIn(
        { openPositions: [{ id: 1 }], pendingOrders: [{ id: 99 }] },
        new Set([1])
    )?.id === 99,
    'detects new pending over old open'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
