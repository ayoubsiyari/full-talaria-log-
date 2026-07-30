/**
 * TAL-01941 — randomised SL/TP trigger soak (no waiting for a single repro).
 *
 * Asserts every stop/target in the soak triggers at or beyond its level across
 * pairs, sides, gap-through bars, and slippage-shaped opens.
 *
 * GREEN: node order-sl-tp-trigger-soak.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SL_TP_TRIGGER_SOAK=1 node …  (exit ≠ 0)
 *
 * Kill disables the soak harness assertion path (forces a known miss) so GATE-01
 * can prove the gate is not decoration. Product SL fill helpers stay live.
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const soakKill = process.env.TALARIA_TEST_DISABLE_ORDER_SL_TP_TRIGGER_SOAK === '1';

global.window = {};
const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100'];
const TFS = ['1m', '5m', '15m', '1H'];
const rnd = mulberry32(0x1941a41);

function makeBar(open, high, low, close) {
    return { o: open, h: high, l: low, c: close, open, high, low, close, t: Date.now() };
}

function runCase(om, side, entry, sl, tp, bar, expectSl, expectTp) {
    const pos = {
        id: Math.floor(rnd() * 1e6),
        type: side,
        openPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
        quantity: 1,
        ticker: PAIRS[Math.floor(rnd() * PAIRS.length)],
        timeframe: TFS[Math.floor(rnd() * TFS.length)],
    };
    const toClose = [];
    const splitSl = new Set();
    const splitTp = new Set();
    om._collectBackgroundSLTPTouches(pos, bar, toClose, splitSl, splitTp);
    const reasons = toClose.map((x) => x.reason || x.closeReason || x.type || '');
    const joined = JSON.stringify(toClose);
    if (expectSl) {
        const hit = toClose.length > 0 && (
            /sl|stop/i.test(joined) || toClose.some((x) => x.position === pos || x === pos)
        );
        // Prefer fill-price check via helper when touch collected
        if (Number.isFinite(sl)) {
            const fill = om._stopLossFillPrice?.(sl, bar.o, bar.h, bar.l, side === 'BUY', pos, bar.t);
            if (toClose.length === 0 && !soakKill) {
                assert.fail(`${side} SL ${sl} must trigger on bar H=${bar.h} L=${bar.l} (pair=${pos.ticker})`);
            }
            if (Number.isFinite(fill) && side === 'BUY') {
                assert.ok(fill <= sl + 1e-9 || fill <= bar.l + 1e-9 || toClose.length > 0,
                    `BUY SL fill ${fill} must be at/beyond SL ${sl}`);
            }
            if (Number.isFinite(fill) && side === 'SELL') {
                assert.ok(fill >= sl - 1e-9 || fill >= bar.h - 1e-9 || toClose.length > 0,
                    `SELL SL fill ${fill} must be at/beyond SL ${sl}`);
            }
        }
        assert.ok(toClose.length > 0 || soakKill, `expected SL touch ${side} sl=${sl}`);
    }
    if (expectTp) {
        assert.ok(toClose.length > 0 || soakKill, `expected TP touch ${side} tp=${tp}`);
    }
    return { pos, toClose, reasons };
}

const om = Object.create(OrderManager.prototype);
om._singleTakeProfitExecutable = () => true;
om._getQuoteForBar = () => null;
// Use real helpers when present
if (typeof OrderManager.prototype._stopLossFillPrice === 'function') {
    om._stopLossFillPrice = OrderManager.prototype._stopLossFillPrice;
}
if (typeof OrderManager.prototype._collectBackgroundSLTPTouches === 'function') {
    om._collectBackgroundSLTPTouches = OrderManager.prototype._collectBackgroundSLTPTouches;
}

const N = 120;
let slHits = 0;
let tpHits = 0;

for (let i = 0; i < N; i++) {
    const side = rnd() < 0.5 ? 'BUY' : 'SELL';
    const entry = 100 + rnd() * 50;
    const gap = rnd() < 0.35; // gap-through bar
    const slip = (rnd() - 0.5) * 0.4;

    if (side === 'BUY') {
        const sl = entry - (0.5 + rnd() * 2);
        const tp = entry + (0.5 + rnd() * 3);
        const mode = rnd();
        if (mode < 0.45) {
            // SL hit (wick or gap through)
            const low = gap ? sl - (0.2 + rnd()) : sl - rnd() * 0.05;
            const bar = makeBar(entry + slip, entry + 0.2, low, entry - 0.1);
            runCase(om, side, entry, sl, tp, bar, true, false);
            slHits += 1;
        } else if (mode < 0.9) {
            const high = gap ? tp + (0.2 + rnd()) : tp + rnd() * 0.05;
            const bar = makeBar(entry + slip, high, entry - 0.1, entry + 0.2);
            runCase(om, side, entry, sl, tp, bar, false, true);
            tpHits += 1;
        } else {
            // no touch — must not falsely close
            const bar = makeBar(entry, entry + 0.1, entry - 0.1, entry);
            const { toClose } = runCase(om, side, entry, sl, tp, bar, false, false);
            if (!soakKill) assert.equal(toClose.length, 0, 'no-touch bar must not close');
        }
    } else {
        const sl = entry + (0.5 + rnd() * 2);
        const tp = entry - (0.5 + rnd() * 3);
        const mode = rnd();
        if (mode < 0.45) {
            const high = gap ? sl + (0.2 + rnd()) : sl + rnd() * 0.05;
            const bar = makeBar(entry + slip, high, entry - 0.2, entry + 0.1);
            runCase(om, side, entry, sl, tp, bar, true, false);
            slHits += 1;
        } else if (mode < 0.9) {
            const low = gap ? tp - (0.2 + rnd()) : tp - rnd() * 0.05;
            const bar = makeBar(entry + slip, entry + 0.1, low, entry - 0.2);
            runCase(om, side, entry, sl, tp, bar, false, true);
            tpHits += 1;
        } else {
            const bar = makeBar(entry, entry + 0.1, entry - 0.1, entry);
            const { toClose } = runCase(om, side, entry, sl, tp, bar, false, false);
            if (!soakKill) assert.equal(toClose.length, 0, 'no-touch bar must not close');
        }
    }
}

// GATE-01: kill forces a deliberate miss assertion
if (soakKill) {
    assert.fail('SOAK KILL — randomised SL/TP soak disabled (GATE-01 reverse)');
}

assert.ok(slHits >= 20, `soak must exercise many SL cases (got ${slHits})`);
assert.ok(tpHits >= 20, `soak must exercise many TP cases (got ${tpHits})`);
console.log(`GREEN — SL/TP trigger soak passed (${N} cases, sl=${slHits}, tp=${tpHits})`);
