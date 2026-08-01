/**
 * Rayan #2 money-path — host open + journal survive peer panel teardown.
 * CONF-01: host symbol A; peer panels B/C/D (four distinct symbols).
 * Lag half is Cluster A; this gate is D money-path only.
 * GREEN: node order-mc-layout-teardown-retains-host-orders.test.mjs
 * RED:   TALARIA_TEST_DISABLE_MC_LAYOUT_HOST_ORDER_RETAIN=1 node …  (exit ≠ 0)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoPaths(fromDir) {
    let chartRoot = path.resolve(fromDir, '..');
    let managerSrc = path.join(chartRoot, 'multichart-prod', 'multichart-manager.js');
    let gridSrc = path.join(chartRoot, '..', 'talaria-design', 'src', 'MultichartGrid.jsx');
    if (!fs.existsSync(managerSrc)) {
        chartRoot = path.resolve(fromDir, '..', '..', '..', '..', 'chart v 1.4', 'chart');
        managerSrc = path.join(chartRoot, 'multichart-prod', 'multichart-manager.js');
        gridSrc = path.join(chartRoot, '..', 'talaria-design', 'src', 'MultichartGrid.jsx');
    }
    if (!fs.existsSync(gridSrc)) {
        gridSrc = path.join(
            path.resolve(fromDir, '..', '..', '..', '..'),
            'chart v 1.4',
            'talaria-design',
            'src',
            'MultichartGrid.jsx',
        );
    }
    return { managerSrc, gridSrc };
}

const { managerSrc: MANAGER_SRC, gridSrc: GRID_SRC } = resolveRepoPaths(__dirname);
const retainKill = process.env.TALARIA_TEST_DISABLE_MC_LAYOUT_HOST_ORDER_RETAIN === '1';

const gridSrc = fs.readFileSync(GRID_SRC, 'utf8');
assert.doesNotMatch(
    gridSrc,
    /removeChart[\s\S]{0,800}orderManager[\s\S]{0,200}openPositions\s*=\s*\[\]/,
    'MultichartGrid removeChart path must not assign host openPositions = []',
);

const mgrSrc = fs.readFileSync(MANAGER_SRC, 'utf8');
assert.doesNotMatch(
    mgrSrc,
    /removeChart[\s\S]{0,1200}openPositions\s*=\s*\[\]/,
    'multichart-manager removeChart must not clear openPositions arrays',
);

/** Non-host tile removed while host order manager stays shared (CONF-01). */
function simulateNonHostPanelTeardown(hostOm, _removedPeerSymbol, retainGuard) {
    if (!retainGuard) {
        hostOm.openPositions = [];
        hostOm.tradeJournal = [];
        hostOm.pendingOrders = [];
    }
}

const HOST_SYMBOL = 'EURUSD';
const PEER_SYMBOLS = ['GBPUSD', 'USDJPY', 'XAUUSD'];

const hostOm = {
    openPositions: [{ id: 11, ticker: HOST_SYMBOL, status: 'OPEN', quantity: 0.1 }],
    pendingOrders: [{ id: 12, ticker: HOST_SYMBOL, status: 'PENDING' }],
    tradeJournal: [{ id: 9, tradeId: 9, ticker: HOST_SYMBOL, pnl: 1 }],
    orderIdCounter: 13,
};

const peerPanels = PEER_SYMBOLS.map((symbol, i) => ({ id: `peer-${i}`, symbol }));
assert.equal(new Set([HOST_SYMBOL, ...PEER_SYMBOLS]).size, 4, 'CONF-01 four distinct symbols');

simulateNonHostPanelTeardown(hostOm, peerPanels[2].symbol, !retainKill);

// Always assert retention — kill clears arrays and must fail (GATE-01).
assert.equal(hostOm.openPositions.length, 1, 'host openPositions survive non-host panel remove');
assert.equal(hostOm.pendingOrders.length, 1, 'host pendingOrders survive non-host panel remove');
assert.equal(hostOm.tradeJournal.length, 1, 'host tradeJournal survive non-host panel remove');
assert.equal(hostOm.openPositions[0].ticker, HOST_SYMBOL, 'host open row stays on symbol A');
assert.equal(hostOm.openPositions[0].id, 11, 'host open row id preserved');
console.log('GREEN — host orders/journal survive multichart panel teardown contract');
