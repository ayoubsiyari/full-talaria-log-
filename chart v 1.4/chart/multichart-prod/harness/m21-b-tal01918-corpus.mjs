/**
 * TAL-01918 RED — deterministic EURUSD-shaped 1m corpus.
 *
 * §A5 compliance:
 *   - no wall clocks, no Math.random, no UUIDs, no rAF.
 *   - the price path is a FIXTURE, produced by a pinned integer recurrence with
 *     a constant seed; `corpusChecksum()` is asserted by the test so any drift
 *     in the generator is a hard failure rather than a silent re-roll.
 *   - all prices are held as INTEGER point counts (1 point = 1e-5 = 0.1 pip) and
 *     only divided by 1e5 at the product boundary, so every comparison in an
 *     assertion payload is integer arithmetic, never float equality.
 */

export const POINT = 1e-5;          // EURUSD 5th decimal
export const POINTS_PER_PIP = 10;
export const MINUTE_MS = 60_000;

const SEED = 0x2f6e2b1;
const STEP_HALF_RANGE = 17;         // ±1.7 pip per 1m step → ~1.0 pip 1m sigma

function lcgNext(state) {
    return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

/**
 * @param {number} bars   number of 1m bars
 * @param {number} startPoints  first open, in points (1.30000 → 130000)
 * @param {number} t0Ms   timestamp of bar 0 (must be minute-aligned and
 *                        aligned to the coarsest bucket under test)
 */
export function buildCorpusPoints(bars, startPoints = 130_000, t0Ms = 0) {
    let s = SEED;
    let close = startPoints;
    const rows = [];
    for (let i = 0; i < bars; i++) {
        const open = close;
        s = lcgNext(s);
        const delta = (s % (2 * STEP_HALF_RANGE + 1)) - STEP_HALF_RANGE;
        close = open + delta;
        s = lcgNext(s);
        const wickUp = s % 9;
        s = lcgNext(s);
        const wickDn = s % 9;
        const hi = Math.max(open, close) + wickUp;
        const lo = Math.min(open, close) - wickDn;
        s = lcgNext(s);
        const vol = 100 + (s % 400);
        rows.push({
            t: t0Ms + i * MINUTE_MS,
            oP: open,
            hP: hi,
            lP: lo,
            cP: close,
            v: vol,
        });
    }
    return rows;
}

/** Product-facing float bars. Exactly representable round-trip is asserted. */
export function toProductBars(pointRows) {
    return pointRows.map((r) => ({
        t: r.t,
        o: r.oP * POINT,
        h: r.hP * POINT,
        l: r.lP * POINT,
        c: r.cP * POINT,
        v: r.v,
    }));
}

/** Float price → integer points. Lossless for our grid; verified by selftest. */
export function toPoints(price) {
    return Math.round(price / POINT);
}

export function pointsToPips(points) {
    return points / POINTS_PER_PIP;
}

/** Stable checksum over the integer corpus (pins the fixture). */
export function corpusChecksum(pointRows) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < pointRows.length; i++) {
        const r = pointRows[i];
        a = (a + r.oP + r.hP * 3 + r.lP * 5 + r.cP * 7 + r.v * 11 + i) >>> 0;
        b = (b ^ ((a << 5) | (a >>> 27))) >>> 0;
    }
    return `${a.toString(16)}:${b.toString(16)}:${pointRows.length}`;
}

/** Round-trip selftest: every generated price survives float→points exactly. */
export function verifyLosslessGrid(pointRows) {
    const bars = toProductBars(pointRows);
    for (let i = 0; i < bars.length; i++) {
        const r = pointRows[i];
        const b = bars[i];
        if (toPoints(b.o) !== r.oP) return { ok: false, i, field: 'o' };
        if (toPoints(b.h) !== r.hP) return { ok: false, i, field: 'h' };
        if (toPoints(b.l) !== r.lP) return { ok: false, i, field: 'l' };
        if (toPoints(b.c) !== r.cP) return { ok: false, i, field: 'c' };
    }
    return { ok: true, i: -1, field: '' };
}

/**
 * A perfectly flat corpus: every bar identical, zero volatility.
 *
 * Its whole job is to separate structural findings from fixture artefacts. Any
 * clause that still fails here is fixture-independent; any clause that goes quiet
 * here was measuring the price process rather than the product.
 */
export function buildFlatCorpusPoints(n, price = 130_000, t0 = 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ t: t0 + i * MINUTE_MS, oP: price, hP: price, lP: price, cP: price });
    }
    return out;
}

/**
 * Bucket-start conventions, kept SEPARATE from the aggregation so the two can be
 * differentially tested against each other.
 *
 * `epochFloorBucketStart` is the product's convention (chart.js `_resampleDataFull`:
 * `Math.floor(candle.t / timeframeMs) * timeframeMs`). `calendarBucketStart` is an
 * independent UTC-calendar implementation that anchors weeks to Monday and days to
 * UTC midnight. For every timeframe whose period divides a UTC day they agree; for
 * 1w they do not, because the Unix epoch was a Thursday.
 */
export function epochFloorBucketStart(t, tfMs) {
    return Math.floor(t / tfMs) * tfMs;
}

export function calendarBucketStart(t, tfMs) {
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    if (tfMs === WEEK) {
        const d = new Date(t);
        const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        // getUTCDay(): 0=Sun … 6=Sat. Anchor to Monday.
        const dow = new Date(midnight).getUTCDay();
        const backDays = (dow + 6) % 7;
        return midnight - backDays * DAY;
    }
    if (tfMs === DAY) {
        const d = new Date(t);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    if (DAY % tfMs === 0) {
        const d = new Date(t);
        const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return midnight + Math.floor((t - midnight) / tfMs) * tfMs;
    }
    return Math.floor(t / tfMs) * tfMs;
}

/**
 * Reference full-bucket aggregation in integer points.
 *
 * NOT product code and NOT a call into product code: this is a separate
 * implementation written for this packet. The blocked sibling's truth column ran
 * through `_resampleDataFull`, so any defect inside bucket arithmetic cancelled on
 * both sides. This one cannot cancel, and the 1w differential below demonstrates
 * that it genuinely sees a bucketing defect the shared-implementation approach
 * structurally cannot.
 */
export function referenceBucketsPoints(pointRows, tfMs, bucketStartFn = epochFloorBucketStart) {
    const out = [];
    let cur = null;
    for (const r of pointRows) {
        const bt = bucketStartFn(r.t, tfMs);
        if (!cur || cur.t !== bt) {
            if (cur) out.push(cur);
            cur = { t: bt, oP: r.oP, hP: r.hP, lP: r.lP, cP: r.cP, v: r.v, n: 1 };
        } else {
            if (r.hP > cur.hP) cur.hP = r.hP;
            if (r.lP < cur.lP) cur.lP = r.lP;
            cur.cP = r.cP;
            cur.v += r.v;
            cur.n += 1;
        }
    }
    if (cur) out.push(cur);
    return out;
}
