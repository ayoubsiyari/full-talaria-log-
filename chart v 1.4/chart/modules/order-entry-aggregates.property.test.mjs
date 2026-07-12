/**
 * RC-5 property tests — RED on legacy/gated-off paths, GREEN on computeOrderEntryAggregates V2.
 * Run: node order-entry-aggregates.property.test.mjs
 * Run legacy (RED): node order-entry-aggregates.property.test.mjs
 * Run V2 (GREEN):   TALARIA_ORDER_AGGREGATES_V2=1 node order-entry-aggregates.property.test.mjs
 * Run aggregate kill-switch: TALARIA_ORDER_AGGREGATES_V2=0 node order-entry-aggregates.property.test.mjs
 * Run type kill-switch:      TALARIA_ORDER_AGGREGATES_V2=1 TALARIA_ORDER_TYPE_RECLASSIFY_V2=0 node order-entry-aggregates.property.test.mjs
 */
import {
    computeOrderEntryAggregates,
    createLegacyAggregateState,
    legacyMoveEntry,
    legacyDeltaSyncSplitEntries,
    legacyReadAggregates,
    rebalanceLevelAmountsToTarget,
    checkAggregateInvariants,
} from './order-entry-aggregates.mjs';

const USE_V2 = process.env.TALARIA_ORDER_AGGREGATES_V2 !== '0'
    && (process.env.TALARIA_ORDER_AGGREGATES_V2 === '1' || process.env.TALARIA_ORDER_AGGREGATES_V2 === 'true');

const DEFAULT_OPTS = {
    side: 'BUY',
    slPrice: 1.0800,
    pipSize: 0.0001,
    pipValuePerLot: 10,
    positionSizeMode: 'risk-percent',
    totalRiskTarget: 100,
    currentPrice: 1.1000,
    markPrice: 1.0950,
    mainOrderType: 'limit',
    balance: 100000,
    riskPercent: 1,
};

/** Mulberry32 PRNG — deterministic sequences for RED evidence capture. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function cloneOpts(overrides = {}) {
    return { ...DEFAULT_OPTS, ...overrides };
}

function makeInitialLevels() {
    return [
        { id: 1, price: 1.0900, amount: 50, orderType: 'limit' },
        { id: 2, price: 1.0850, amount: 50, orderType: 'limit' },
    ];
}

function applyOpLegacy(state, op) {
    if (op.type === 'add') {
        const n = state.levels.length + 1;
        const base = Math.floor(100 / n);
        state.levels.push({
            id: op.id ?? (state.levels.length + 1),
            price: op.price ?? 1.0820,
            amount: base,
            orderType: 'limit',
        });
        rebalanceLevelAmountsToTarget(state.levels, state.opts);
        legacyDeltaSyncSplitEntries(state);
    } else if (op.type === 'delete') {
        state.levels = state.levels.filter((l) => l.id !== op.id);
        if (state.levels.length === 1) {
            state.levels[0].amount = 100;
            state.splitEntries = [];
            state.cachedAverage = state.levels[0].price;
        } else if (state.levels.length > 1) {
            rebalanceLevelAmountsToTarget(state.levels, state.opts);
            legacyDeltaSyncSplitEntries(state);
        }
    } else if (op.type === 'move') {
        legacyMoveEntry(state, op.id, op.price);
    } else if (op.type === 'rebalance') {
        rebalanceLevelAmountsToTarget(state.levels, state.opts);
        legacyDeltaSyncSplitEntries(state);
    }
}

function readAggregates(levels, opts, legacyState) {
    if (USE_V2) {
        const agg = computeOrderEntryAggregates(levels, opts);
        return {
            averageEntry: agg.averageEntry,
            minEntry: agg.minEntry,
            maxEntry: agg.maxEntry,
            riskSplitSum: agg.riskSplitSum,
            legs: agg.legs,
            mainLegId: agg.mainLegId,
            mainOrderType: opts.mainOrderType,
        };
    }
    return legacyReadAggregates(legacyState);
}

function runSequence(ops, opts, seed) {
    const levels = makeInitialLevels().map((l) => ({ ...l }));
    const legacyState = createLegacyAggregateState(levels, opts);
    const initialMainType = opts.mainOrderType;
    const trace = [];

    for (const op of ops) {
        if (USE_V2) {
            if (op.type === 'add') {
                levels.push({
                    id: op.id ?? (levels.length + 1),
                    price: op.price ?? 1.0820,
                    amount: Math.floor(100 / (levels.length + 1)),
                    orderType: 'limit',
                });
                rebalanceLevelAmountsToTarget(levels, opts);
            } else if (op.type === 'delete') {
                const remaining = levels.filter((l) => l.id !== op.id);
                levels.length = 0;
                levels.push(...remaining);
                if (levels.length === 1) levels[0].amount = 100;
                else rebalanceLevelAmountsToTarget(levels, opts);
            } else if (op.type === 'move') {
                const lvl = levels.find((l) => l.id === op.id);
                if (lvl) lvl.price = op.price;
            } else if (op.type === 'rebalance') {
                rebalanceLevelAmountsToTarget(levels, opts);
            }
        } else {
            applyOpLegacy(legacyState, op);
            levels.length = 0;
            levels.push(...legacyState.levels.map((l) => ({ ...l })));
        }

        const agg = readAggregates(levels, opts, legacyState);
        const violations = checkAggregateInvariants(agg, opts, initialMainType);
        if (violations.length) {
            trace.push({ op, violations, agg: summarizeAgg(agg) });
        }
    }
    return trace;
}

function summarizeAgg(agg) {
    return {
        averageEntry: +agg.averageEntry?.toFixed?.(6) ?? agg.averageEntry,
        riskSplitSum: agg.riskSplitSum,
        mainOrderType: agg.mainOrderType,
        legs: (agg.legs || []).map((l) => ({
            id: l.id, price: l.price, pct: l.percentage, type: l.orderType, pnl: +l.pnlAtMark?.toFixed?.(4),
        })),
    };
}

function randomOps(rng, count = 12) {
    const ops = [];
    let nextId = 3;
    let levels = [1, 2];
    for (let i = 0; i < count; i++) {
        const roll = rng();
        if (roll < 0.25 && levels.length < 4) {
            const price = 1.08 + rng() * 0.02;
            ops.push({ type: 'add', id: nextId++, price });
            levels.push(nextId - 1);
        } else if (roll < 0.45 && levels.length > 1) {
            const id = levels[Math.floor(rng() * levels.length)];
            ops.push({ type: 'delete', id });
            levels = levels.filter((x) => x !== id);
        } else if (roll < 0.85) {
            const id = levels[Math.floor(rng() * levels.length)];
            const price = 1.078 + rng() * 0.025;
            ops.push({ type: 'move', id, price });
        } else {
            ops.push({ type: 'rebalance' });
        }
    }
    return ops;
}

/** Deterministic RED seeds — move limit entry across market flips type; delta sync stale %. */
const KNOWN_RED_SEQUENCES = [
    {
        name: 'limit-main-crosses-market',
        ops: [{ type: 'move', id: 1, price: 1.1050 }],
    },
    {
        name: 'delete-then-delta-stale-split',
        ops: [
            { type: 'add', id: 3, price: 1.0830 },
            { type: 'delete', id: 3 },
            { type: 'rebalance' },
        ],
    },
    {
        name: 'move-below-mark-positive-pnl',
        ops: [{ type: 'move', id: 1, price: 1.0960 }],
    },
];

const ORDER_TYPE_RECLASSIFY_CASES = [
    {
        name: 'buy-zones-limit-market-stop',
        opts: cloneOpts({ side: 'BUY', currentPrice: 1.1000, markPrice: 1.1000 }),
        ops: [
            { type: 'move', id: 1, price: 1.0980 },
            { type: 'move', id: 1, price: 1.10005 },
            { type: 'move', id: 1, price: 1.1020 },
        ],
    },
    {
        name: 'sell-zones-limit-market-stop',
        opts: cloneOpts({ side: 'SELL', currentPrice: 1.1000, markPrice: 1.1000 }),
        ops: [
            { type: 'move', id: 1, price: 1.1020 },
            { type: 'move', id: 1, price: 1.09995 },
            { type: 'move', id: 1, price: 1.0980 },
        ],
    },
    {
        name: 'buy-zone-crossing-drag',
        opts: cloneOpts({ side: 'BUY', currentPrice: 1.1000, markPrice: 1.1000 }),
        ops: [
            { type: 'move', id: 1, price: 1.0975 },
            { type: 'move', id: 1, price: 1.1000 },
            { type: 'move', id: 1, price: 1.1030 },
            { type: 'move', id: 1, price: 1.0990 },
        ],
    },
    {
        name: 'multi-entry-legs-classify-independently',
        opts: cloneOpts({ side: 'BUY', currentPrice: 1.1000, markPrice: 1.1000 }),
        ops: [
            { type: 'move', id: 1, price: 1.0980 },
            { type: 'move', id: 2, price: 1.1020 },
            { type: 'add', id: 3, price: 1.1000 },
        ],
    },
];

function runPropertySuite() {
    const mode = USE_V2 ? 'V2 (computeOrderEntryAggregates)' : 'LEGACY (delta-mutated)';
    console.log(`\n=== RC-5 order-entry aggregate property tests [${mode}] ===\n`);

    let totalViolations = 0;
    const failingSequences = [];

    for (const seq of KNOWN_RED_SEQUENCES) {
        const trace = runSequence(seq.ops, cloneOpts(), 0);
        if (trace.length) {
            totalViolations += trace.length;
            failingSequences.push({ name: seq.name, ops: seq.ops, trace });
            console.log(`FAIL (known): ${seq.name}`);
            for (const t of trace) {
                console.log(`  op: ${JSON.stringify(t.op)}`);
                for (const v of t.violations) console.log(`    [${v.code}] ${v.msg}`);
                console.log(`    state: ${JSON.stringify(t.agg)}`);
            }
        } else {
            console.log(`pass (known): ${seq.name}`);
        }
    }

    for (const seq of ORDER_TYPE_RECLASSIFY_CASES) {
        const trace = runSequence(seq.ops, seq.opts, 0);
        if (trace.length) {
            totalViolations += trace.length;
            failingSequences.push({ name: seq.name, ops: seq.ops, trace });
            console.log(`FAIL (order-type): ${seq.name}`);
            for (const t of trace) {
                console.log(`  op: ${JSON.stringify(t.op)}`);
                for (const v of t.violations) console.log(`    [${v.code}] ${v.msg}`);
                console.log(`    state: ${JSON.stringify(t.agg)}`);
            }
        } else {
            console.log(`pass (order-type): ${seq.name}`);
        }
    }

    for (let seed = 1; seed <= 50; seed++) {
        const rng = mulberry32(seed);
        const ops = randomOps(rng, 10);
        const trace = runSequence(ops, cloneOpts({ markPrice: 1.0920 + (seed % 5) * 0.001 }), seed);
        if (trace.length) {
            totalViolations += trace.length;
            failingSequences.push({ seed, ops, trace: trace.slice(0, 2) });
        }
    }

    const randomFails = failingSequences.filter((s) => s.seed != null).length;
    console.log(`\nRandom seeds with violations: ${randomFails} / 50`);
    if (failingSequences.find((s) => s.seed === 7)) {
        const ex = failingSequences.find((s) => s.seed === 7);
        console.log('\nExample failing random sequence (seed=7):');
        console.log(JSON.stringify(ex, null, 2));
    }

    console.log(`\nTotal violation events: ${totalViolations}`);
    console.log(`Mode: ${mode}`);

    if (USE_V2) {
        if (totalViolations > 0) {
            console.error('\nERROR: V2 mode must be GREEN (0 violations)');
            process.exit(1);
        }
        console.log('\nGREEN — all invariants hold under computeOrderEntryAggregates V2');
        process.exit(0);
    }

    if (totalViolations === 0) {
        console.error('\nERROR: LEGACY mode must be RED (expected invariant violations)');
        process.exit(1);
    }
    console.log('\nRED — legacy delta model violates invariants (expected before fix)');
    process.exit(0);
}

runPropertySuite();
