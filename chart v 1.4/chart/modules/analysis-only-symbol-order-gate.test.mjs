/**
 * Analysis-only symbol order gate — supporting symbols are view-only.
 * GREEN: node --test analysis-only-symbol-order-gate.test.mjs
 *
 * BIND-01 states:
 * - RESOLVER_ABSENT_FROM_TREE: refusal helper is missing.
 * - RESOLVER_PRESENT_BUT_UNCALLED: placement reaches allocation on a supporting ticker.
 * - RESOLVER_CALLED_BUT_WRONG: helper is called but does not block or omits panel message.
 * - RAIL_CANNOT_SHOW_REFUSAL: the panel message lands in a hidden mount the shipped
 *   V9 rail never reads, so the refusal is invisible to the user.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

global.window = {};

const require = createRequire(import.meta.url);

const surfaces = [
    ['chart', './order-manager.js'],
    ['homepage', '../../../homepage/public/chart/modules/order-manager.js'],
];

function installDom() {
    const validation = {
        className: '',
        innerHTML: '',
    };
    global.document = {
        getElementById(id) {
            if (id === 'orderValidation') return validation;
            if (id === 'orderQuantity') return { value: '1' };
            if (id === 'orderEntryPrice') return { value: '100' };
            return null;
        },
    };
    return validation;
}

function makeManager(OrderManager, ticker, validationMessages) {
    const om = Object.create(OrderManager.prototype);
    om.chart = {
        currentSymbol: ticker,
        currentFileId: `FILE_${ticker}`,
        backtestingSession: {
            supporting_tickers: ['NQ'],
            instruments: {
                ES: { ticker: 'ES', tradable: true },
                NQ: { ticker: 'NQ', view_only: true, tradable: false },
            },
        },
    };
    om.replaySystem = { isActive: true };
    om._getOrderContextChart = () => om.chart;
    om.getCurrentCandle = () => ({ t: 1, c: 100, o: 100, h: 101, l: 99 });
    om.showNotification = (msg) => validationMessages.push(String(msg || ''));
    om._allocateOrderId = () => {
        throw new Error('RESOLVER_PRESENT_BUT_UNCALLED: allocation was reached for analysis-only ticker');
    };
    return om;
}

const states = [];

for (const [name, path] of surfaces) {
    const OrderManager = require(path);
    assert.equal(
        typeof OrderManager.prototype._refuseAnalysisOnlyOrderIfNeeded,
        'function',
        `${name}: RESOLVER_ABSENT_FROM_TREE`,
    );

    const messages = [];
    const validation = installDom();
    const blocked = makeManager(OrderManager, 'NQ', messages);
    const result = blocked.placeAdvancedOrder({ keepPanelOpen: true });

    assert.equal(result?.reason, 'analysis_only_symbol', `${name}: RESOLVER_CALLED_BUT_WRONG: did not block supporting ticker`);
    assert.match(validation.innerHTML, /analysis-only/i, `${name}: RESOLVER_CALLED_BUT_WRONG: panel message missing`);
    assert.match(messages.join('\n'), /analysis-only/i, `${name}: RESOLVER_CALLED_BUT_WRONG: notification message missing`);

    const primaryMessages = [];
    installDom();
    const primary = makeManager(OrderManager, 'ES', primaryMessages);
    assert.equal(
        primary._refuseAnalysisOnlyOrderIfNeeded('ES'),
        false,
        `${name}: RESOLVER_CALLED_BUT_WRONG: primary trading symbol was refused`,
    );

    states.push(`${name}: RESOLVER_CALLED_AND_RIGHT`);
}

// The native #orderValidation box is off-screen under the V9 shell, so the block
// above only proves the engine spoke, not that anyone heard it. The rail that
// actually ships has to mirror that box out and render it.
const here = path.dirname(fileURLToPath(import.meta.url));
const shellCandidates = [
    path.join(here, '..', '..', 'talaria-design', 'src', 'TalariaV8bLive.jsx'),
    path.join(here, '..', '..', '..', '..', 'chart v 1.4', 'talaria-design', 'src', 'TalariaV8bLive.jsx'),
];
const shellPath = shellCandidates.find((p) => existsSync(p));
assert.ok(shellPath, 'RAIL_CANNOT_SHOW_REFUSAL: live shell source not found from either surface');
const shell = readFileSync(shellPath, 'utf8');
assert.match(
    shell,
    /getElementById\("orderValidation"\)/,
    'RAIL_CANNOT_SHOW_REFUSAL: live shell never reads #orderValidation',
);
assert.match(
    shell,
    /order-validation--error/,
    'RAIL_CANNOT_SHOW_REFUSAL: live shell does not distinguish the error state',
);
assert.match(
    shell,
    /data-v9-order-validation="1"/,
    'RAIL_CANNOT_SHOW_REFUSAL: live shell has no element that renders the refusal',
);
states.push('rail: REFUSAL_REACHES_THE_RAIL');

console.log(`GREEN — analysis-only order gate bound (${states.join(' | ')})`);
