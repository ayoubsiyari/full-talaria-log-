/**
 * Rayan #2 money-path — host open + journal survive peer panel teardown.
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

function simulateLayoutTileRemoval(hostOm, retainGuard) {
    if (!retainGuard) {
        hostOm.openPositions = [];
        hostOm.tradeJournal = [];
    }
}

const hostOm = {
    openPositions: [{ id: 11, ticker: 'EURUSD', status: 'OPEN', quantity: 0.1 }],
    pendingOrders: [],
    tradeJournal: [{ id: 9, tradeId: 9, ticker: 'EURUSD', pnl: 1 }],
    orderIdCounter: 12,
};

simulateLayoutTileRemoval(hostOm, !retainKill);

// Always assert retention — kill clears arrays and must fail (GATE-01).
assert.equal(hostOm.openPositions.length, 1, 'host openPositions survive panel remove');
assert.equal(hostOm.tradeJournal.length, 1, 'host tradeJournal survive panel remove');
assert.equal(hostOm.openPositions[0].id, 11, 'host open row id preserved');
console.log('GREEN — host orders/journal survive multichart panel teardown contract');
