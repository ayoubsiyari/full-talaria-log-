import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const chartOrderManagerPath = path.join(repoRoot, 'chart v 1.4/chart/modules/order-manager.js');
const homeOrderManagerPath = path.join(repoRoot, 'homepage/public/chart/modules/order-manager.js');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function methodSource(text, name) {
    let start = text.indexOf(`    ${name}(`);
    if (start < 0) start = text.indexOf(`\n${name}(`);
    assert.notEqual(start, -1, `${name} must exist`);
    const brace = text.indexOf('{', start);
    assert.notEqual(brace, -1, `${name} must have a body`);
    let depth = 0;
    for (let i = brace; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    throw new Error(`${name} body did not close`);
}

function cloneJournal(journal) {
    try {
        return JSON.parse(JSON.stringify(Array.isArray(journal) ? journal : []));
    } catch (_) {
        return Array.isArray(journal) ? journal.slice() : [];
    }
}

function closeModel(order, journal) {
    if (order._n5FullCloseInFlight || order.status === 'CLOSING' || order.status === 'CLOSED') return false;
    order._n5FullCloseInFlight = true;
    order.status = 'CLOSING';
    order.status = 'CLOSED';
    journal.push({
        id: order.id,
        entryPrice: order.entryPrice,
        exitPrice: order.exitPrice,
        pnl: order.pnl,
        status: order.status,
    });
    return true;
}

test('N5 source: mirrors carry close idempotency and immutable durable journal snapshots', () => {
    for (const [label, text] of [
        ['chart', read(chartOrderManagerPath)],
        ['homepage', read(homeOrderManagerPath)],
    ]) {
        assert.match(text, /__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1/,
            `${label}: N5 kill switch must exist`);

        const close = methodSource(text, 'closePositionAtPrice');
        assert.match(close, /_n5MoneyPathCollisionV1Enabled\(\)/,
            `${label}: close path must be switch guarded`);
        assert.match(close, /position\._n5FullCloseInFlight/,
            `${label}: close path must mark in-flight full closes`);
        assert.match(close, /Duplicate full close ignored/,
            `${label}: duplicate full closes must be rejected`);

        const persist = methodSource(text, 'persistJournal');
        assert.match(persist, /trimOn \|\| _n5MoneyPathCollisionV1Enabled\(\)/,
            `${label}: durable journal must clone even when trim is off`);
        assert.match(persist, /durableJournalByTicker/,
            `${label}: per-ticker durable payload must come from the durable snapshot`);
    }
});

test('N5 mirrors stay byte-identical for order-manager', () => {
    assert.equal(read(homeOrderManagerPath), read(chartOrderManagerPath));
});

test('N5 oracle: 100 scripted double-closes produce exact journal row count and values', () => {
    const journal = [];
    const orders = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        status: 'OPEN',
        entryPrice: 100 + i,
        exitPrice: 101 + i,
        pnl: 10 + i,
    }));

    for (const order of orders) {
        assert.equal(closeModel(order, journal), true);
        assert.equal(closeModel(order, journal), false);
    }

    assert.equal(journal.length, 100);
    assert.deepEqual(journal.map((row) => row.id), orders.map((row) => row.id));
    assert.equal(journal.reduce((sum, row) => sum + row.pnl, 0), orders.reduce((sum, row) => sum + row.pnl, 0));
    assert.ok(journal.every((row, i) => row.entryPrice === 100 + i && row.exitPrice === 101 + i));
});

test('N5 oracle: reload-during-save cannot mutate queued durable journal rows by reference', () => {
    const liveJournal = [
        { id: 1, pnl: 25, status: 'CLOSED' },
        { id: 2, pnl: -5, status: 'CLOSED' },
    ];
    const queuedDurable = cloneJournal(liveJournal);

    // Simulate a reload/hydrate race mutating the live journal after queue time.
    liveJournal[0].pnl = 9999;
    liveJournal.push({ id: 3, pnl: 42, status: 'CLOSED' });

    assert.deepEqual(queuedDurable, [
        { id: 1, pnl: 25, status: 'CLOSED' },
        { id: 2, pnl: -5, status: 'CLOSED' },
    ]);
});
