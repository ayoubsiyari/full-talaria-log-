/**
 * Cluster G / SEL-01 pending TP teardown — user-path GATE-01.
 * Cancel/remove pending order #1 must not tear down order #12 TP controls
 * (prefix collision: pending-tp-1 ⊂ pending-tp-12).
 *
 * GREEN: node order-sel01-exact-teardown.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SEL01_EXACT_TEARDOWN=1 node …
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SEL01_EXACT_TEARDOWN === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1: disabled,
};
global.document = { getElementById: () => null };

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function classAttr(node) {
    return String(node.className || '');
}

function matchesSimple(sel, node) {
    const attr = classAttr(node);
    if (sel.startsWith('[class*=')) {
        const parts = [...sel.matchAll(/\[class\*="([^"]+)"\]/g)].map((m) => m[1]);
        return parts.length > 0 && parts.every((p) => attr.includes(p));
    }
    const classes = sel.split('.').filter(Boolean);
    const have = new Set(attr.split(/\s+/).filter(Boolean));
    return classes.every((c) => have.has(c));
}

function makeSvg(nodes) {
    return {
        selectAll(selector) {
            const sels = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
            const hit = nodes.filter((n) => !n._removed && sels.some((s) => matchesSimple(s, n)));
            return {
                remove() {
                    hit.forEach((n) => { n._removed = true; });
                    return this;
                },
            };
        },
    };
}

const nodes = [
    { className: 'pending-tp-delete pending-tp-1', orderId: 1, kind: 'delete' },
    { className: 'pending-tp-delete pending-tp-12', orderId: 12, kind: 'delete' },
    { className: 'pending-tp-pct-control pending-tp-1', orderId: 1, kind: 'pct' },
    { className: 'pending-tp-pct-control pending-tp-12', orderId: 12, kind: 'pct' },
    { className: 'pending-tp-pct-dec pending-tp-1', orderId: 1, kind: 'pct-dec' },
    { className: 'pending-tp-pct-dec pending-tp-12', orderId: 12, kind: 'pct-dec' },
];

const om = Object.create(OrderManager.prototype);
om.orderLines = [];
om.pendingTargetLines = [];
om._collectLayoutCharts = () => [{ svg: makeSvg(nodes) }];

// Selector shape (still asserted).
const pctSelector = om._pendingTpPctControlsSelector(1);
const deleteSelector = om._pendingTpDeleteSelector(1);
if (!disabled) {
    assert.equal(pctSelector.includes('[class*='), false, 'pct controls selector avoids prefix substring matching');
    assert.equal(deleteSelector.includes('[class*='), false, 'delete selector avoids prefix substring matching');
    assert.ok(pctSelector.includes('.pending-tp-pct-control.pending-tp-1'), 'pct controls select exact order class');
    assert.equal(pctSelector.includes('pending-tp-12'), false, 'order 1 selector does not name order 12');
    assert.equal(deleteSelector, '.pending-tp-delete.pending-tp-1', 'delete selector is exact compound class');
} else {
    assert.ok(pctSelector.includes('[class*='), 'kill restores substring pct selector');
}

// User path: remove pending #1 while #12 TP controls exist.
om.removePendingOrderLine(1);

const alive12Pct = nodes.filter((n) => n.orderId === 12 && n.kind.startsWith('pct') && !n._removed);
const dead1Pct = nodes.filter((n) => n.orderId === 1 && n.kind.startsWith('pct') && n._removed);
const alive12Delete = nodes.filter((n) => n.orderId === 12 && n.kind === 'delete' && !n._removed);

assert.ok(dead1Pct.length >= 1, 'order #1 TP pct controls are torn down');
assert.equal(
    alive12Pct.length,
    2,
    'SEL-01: removing pending #1 must leave order #12 TP pct controls intact',
);
assert.equal(alive12Delete.length, 1, 'order #12 TP delete control remains');

console.log(disabled
    ? 'RED — substring teardown collides pending-tp-1 with pending-tp-12'
    : 'GREEN — removePendingOrderLine(#1) tears down #1 TP controls without touching #12');
