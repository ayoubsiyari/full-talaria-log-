/**
 * D-030 owning-panel-price RED + A6-4 store helpers.
 * GREEN: node order-owning-panel-price.test.mjs
 * RED (stopgap off): TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1=1 node order-owning-panel-price.test.mjs
 */
import {
    assertMarkWithinOwningSymbolRange,
    backgroundBarFromPeerCharts,
    legacyPositionNeedsBackgroundBar,
    markCloseFromPeerCharts,
    orderOwningPanelPriceV1Enabled,
    positionBelongsOnLocalChart,
    positionNeedsBackgroundBar,
    resolveOwningPanelMidMarkPrice,
    resolvePositionCloseMarkPrice,
} from './order-owning-panel-price.mjs';
import {
    buildHostOrderStoreSnapshot,
    filterSnapshotForPanel,
    shouldBlockIframeStoreMutation,
    shouldRoutePlaceOrderToHost,
} from './order-host-store.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed += 1;
        return;
    }
    failed += 1;
    console.error(`FAIL: ${msg}`);
}

function section(name) {
    console.log(`\n--- ${name} ---`);
}

const GBP_RANGE = { min: 1.55, max: 1.75 };
const EUR_RANGE = { min: 1.05, max: 1.45 };

const eurLocalChart = { currentSymbol: 'EUR/USD', currentFileId: 'file-eur' };
const gbpPanelFeed = { c: 1.64683, t: 1784276100000 };
const eurCandle = { c: 1.31315, t: 1784276100000 };

const gbpPosition = {
    id: 2,
    ticker: 'GBPUSD',
    symbol: 'GBP/USD',
    sourceFileId: 'file-gbp',
    openPrice: 1.64683,
};

const gbpPositionNoTicker = {
    id: 3,
    openPrice: 1.64683,
};

section('switch default ON');
assert(orderOwningPanelPriceV1Enabled({}), 'owning-panel-price default ON');
assert(!orderOwningPanelPriceV1Enabled({ __TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1: true }), 'OFF when disabled');

section('positionBelongsOnLocalChart');
assert(positionBelongsOnLocalChart(gbpPosition, { currentSymbol: 'GBP/USD', currentFileId: 'file-gbp' }), 'GBP on GBP chart');
assert(!positionBelongsOnLocalChart(gbpPosition, eurLocalChart), 'GBP not on EUR chart');
assert(!positionBelongsOnLocalChart({ id: 9 }, eurLocalChart), 'unknown ownership → not local');

section('cross-ticker RED — legacy uses peer feed when ownership unknown');
const legacyNeedsBg = legacyPositionNeedsBackgroundBar(gbpPositionNoTicker, 'EURUSD', eurLocalChart);
assert(!legacyNeedsBg, 'RED: legacy main-chart path when ticker+fileId both absent');
const legacyWithFile = legacyPositionNeedsBackgroundBar(gbpPosition, 'EURUSD', eurLocalChart);
assert(legacyWithFile, 'fileId mismatch still background in legacy');
const fixedNeedsBg = positionNeedsBackgroundBar(gbpPositionNoTicker, 'EURUSD', eurLocalChart, true);
assert(fixedNeedsBg, 'GREEN: fix forces background when ownership unknown on EUR doc');

section('owning-panel mark — GBP never reads EUR candle');
const deps = {
    localChart: eurLocalChart,
    getBackgroundBarForTicker: (ticker) => (ticker === 'GBPUSD' ? gbpPanelFeed : null),
    markFromPanelDataLastClose: (ticker) => (ticker === 'GBPUSD' ? 1.64683 : null),
    resolveBackgroundMarkPrice: () => null,
};

const legacyMid = resolvePositionCloseMarkPrice(gbpPosition, eurCandle, {
    fixOn: false,
    activeChartTicker: 'EURUSD',
    localChart: eurLocalChart,
    legacyResolveMidMarkPrice: () => eurCandle.c,
});

const fixedMid = resolvePositionCloseMarkPrice(gbpPosition, eurCandle, {
    fixOn: true,
    localChart: eurLocalChart,
    ...deps,
});

assert(Math.abs(legacyMid - 1.31315) < 1e-5, 'RED discriminator: legacy can return peer EUR price');
assert(Math.abs(fixedMid - 1.64683) < 1e-5, 'GREEN: owning feed GBP mark');

section('store-level property — one lifecycle one symbol feed');
const lifecycleMarks = [fixedMid, fixedMid, fixedMid];
for (const m of lifecycleMarks) {
    const chk = assertMarkWithinOwningSymbolRange(gbpPosition, m, GBP_RANGE);
    assert(chk.ok, `mark ${m} within GBP range`);
}
const peerLeak = assertMarkWithinOwningSymbolRange(gbpPosition, 1.31315, GBP_RANGE);
assert(!peerLeak.ok, 'EUR peer price rejected for GBP position');

section('resolveOwningPanelMidMarkPrice direct');
const mid = resolveOwningPanelMidMarkPrice(gbpPosition, eurCandle, deps);
assert(Math.abs(mid - 1.64683) < 1e-5, 'mid from owning bg bar not EUR candle');

section('local EUR position must not mark off focused GBP peer candle');
const eurPosition = {
    id: 10,
    ticker: 'EURUSD',
    symbol: 'EUR/USD',
    sourceFileId: 'file-eur',
    openPrice: 1.16837,
};
const gbpPeerCandle = { c: 1.35365, t: 1784276100000 };
const eurLocalCandle = { c: 1.16840, t: 1784276100000 };
const leaked = resolveOwningPanelMidMarkPrice(eurPosition, gbpPeerCandle, {
    localChart: eurLocalChart,
});
assert(Math.abs(leaked - 1.35365) < 1e-5, 'without localCandle, belongs-local still reads passed candle (caller bug)');
const fixedLocal = resolveOwningPanelMidMarkPrice(eurPosition, gbpPeerCandle, {
    localChart: eurLocalChart,
    localCandle: eurLocalCandle,
});
assert(Math.abs(fixedLocal - 1.16840) < 1e-5, 'GREEN: localCandle wins over focused GBP peer');
const EUR_SESSION = { min: 1.16, max: 1.18 };
assert(assertMarkWithinOwningSymbolRange(eurPosition, fixedLocal, EUR_SESSION).ok, 'EUR mark in EUR session range');
assert(!assertMarkWithinOwningSymbolRange(eurPosition, gbpPeerCandle.c, EUR_SESSION).ok, 'GBP peer rejected for EUR session');

section('MultichartGrid peer OHLC — GBP bar without panelManager / same TF');
const tPlay = 1784276100000;
const gbpBars = [
    { t: tPlay - 60000, o: 1.64, h: 1.65, l: 1.63, c: 1.645 },
    { t: tPlay, o: 1.645, h: 1.652, l: 1.644, c: 1.650 },
];
const peers = [
    { currentSymbol: 'EUR/USD', currentFileId: 'file-eur', rawData: [{ t: tPlay, o: 1.16, h: 1.17, l: 1.15, c: 1.168 }], data: [] },
    { currentSymbol: 'GBP/USD', currentFileId: 'file-gbp', currentTimeframe: '1m', rawData: gbpBars, data: gbpBars },
];
const gbpBg = backgroundBarFromPeerCharts(peers, {
    tickerNorm: 'GBPUSD',
    tMs: tPlay,
    preferredFileId: 'file-gbp',
});
assert(gbpBg && Math.abs(gbpBg.h - 1.652) < 1e-9, 'peer fileId match returns GBP bar (mixed TF ok)');
const gbpByTicker = backgroundBarFromPeerCharts(peers, { tickerNorm: 'GBP/USD', tMs: tPlay });
assert(gbpByTicker && gbpByTicker.c === 1.650, 'peer ticker match without preferredFileId');
const livePeers = [
    { currentSymbol: 'GBP/USD', currentFileId: 'file-gbp', rawData: gbpBars, liveBar: { t: tPlay, o: 1.645, h: 1.655, l: 1.644, c: 1.651 } },
];
const liveBg = backgroundBarFromPeerCharts(livePeers, { tickerNorm: 'GBPUSD', tMs: tPlay, preferredFileId: 'file-gbp' });
assert(liveBg && Math.abs(liveBg.h - 1.655) < 1e-9, 'live forming bar preferred when t matches');
assert(markCloseFromPeerCharts(peers, 'GBPUSD') === 1.650, 'mark close from peer last bar');
assert(backgroundBarFromPeerCharts([], { tickerNorm: 'GBPUSD', tMs: tPlay }) == null, 'empty peers → null');

section('A6-4 host snapshot helpers');
const snap = buildHostOrderStoreSnapshot({
    pendingOrders: [{ id: 1, ticker: 'EURUSD' }],
    openPositions: [gbpPosition, { id: 4, ticker: 'EURUSD', sourceFileId: 'file-eur' }],
    closedPositions: [],
    orders: [],
    balance: 10000,
    equity: 10000,
    initialBalance: 10000,
    orderIdCounter: 5,
    tradeGroupIdCounter: 1,
    orderService: { multiInstrumentSession: { current_time: 1784276100000 } },
}, 'sess-1', 3);

assert(snap.version === 3 && snap.openPositions.length === 2, 'snapshot builds');
const panelProj = filterSnapshotForPanel(snap, { symbol: 'GBP/USD', fileId: 'file-gbp' });
assert(panelProj.visibleOpen.length === 1 && panelProj.visibleOpen[0].id === 2, 'panel filter GBP only');

assert(shouldRoutePlaceOrderToHost(true, {}), 'host-place routes iframe to host when ON');
assert(!shouldRoutePlaceOrderToHost(true, { __TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1: true }), 'host-place OFF');
assert(shouldBlockIframeStoreMutation(true, {}), 'snapshot blocks iframe register when ON');

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
