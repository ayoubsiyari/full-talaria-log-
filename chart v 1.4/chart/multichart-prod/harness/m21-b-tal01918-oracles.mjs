/**
 * TAL-01918 RED — the two limbs, kept deliberately independent.
 *
 *   m21-b-bar-immutability-oracle   once a display bucket is finalised (a later
 *                                   bucket exists), its OHLC never changes again
 *                                   for the rest of the replay.
 *
 *   m21-b-last-bar-window-oracle    the last bar's OHLC equals an independently
 *                                   computed aggregation over the FULL bucket
 *                                   [bucketStart, bucketEnd) where that range is
 *                                   complete in the raw data; where it is not,
 *                                   the bar is explicitly marked forming rather
 *                                   than presented as a finished value.
 *
 * A pass on the first is NEVER reported as a pass on the second. They are
 * separate accumulators, separate result objects, separate assertions.
 *
 * All comparisons are integer point arithmetic (1 point = 1e-5). No float
 * equality appears in any assertion payload (§A5).
 */

export const ORACLE_IMMUTABILITY = 'm21-b-bar-immutability-oracle';
export const ORACLE_LAST_BAR_WINDOW = 'm21-b-last-bar-window-oracle';

/**
 * Property names that would constitute an explicit "this bar is still forming"
 * marker on a display bar. Superset on purpose: the limb must not fail merely
 * because we guessed the product's spelling.
 */
export const FORMING_MARKER_KEYS = [
    'forming', 'isForming', 'isPartial', 'partial', 'incomplete',
    'complete', 'isComplete', 'closed', 'isClosed', 'final', 'isFinal',
    '__forming', '_forming', 'state', 'barState',
];

export function packOhlc(b) {
    return `${b.t}|${b.oP}|${b.hP}|${b.lP}|${b.cP}`;
}

export function findFormingMarker(bar) {
    for (const k of FORMING_MARKER_KEYS) {
        if (Object.prototype.hasOwnProperty.call(bar, k)) {
            return { key: k, value: String(bar[k]) };
        }
    }
    return null;
}

/* ────────────────────────── limb 1 ────────────────────────── */

export class BarImmutabilityOracle {
    constructor(label) {
        this.label = label;
        this.oracle = ORACLE_IMMUTABILITY;
        this.finalized = new Map();   // bucketT -> { packed, tick }
        this.violations = [];
        this.ticks = 0;
        this.finalizedCount = 0;
        this.comparisons = 0;
    }

    /**
     * @param {Array<{t,oP,hP,lP,cP}>} series integer-point display series
     * @param {number} tick
     */
    observe(series, tick) {
        this.ticks += 1;
        const lastIdx = series.length - 1;
        for (let i = 0; i <= lastIdx; i++) {
            const bar = series[i];
            const isLast = i === lastIdx;
            const packed = packOhlc(bar);
            const prior = this.finalized.get(bar.t);
            if (prior) {
                this.comparisons += 1;
                if (prior.packed !== packed && this.violations.length < 50) {
                    this.violations.push({
                        bucketT: bar.t,
                        finalizedAtTick: prior.tick,
                        changedAtTick: tick,
                        was: prior.packed,
                        now: packed,
                        deltaClosePoints: bar.cP - Number(prior.packed.split('|')[4]),
                    });
                }
                continue;
            }
            if (!isLast) {
                // First tick at which this bucket is no longer the last bar.
                this.finalized.set(bar.t, { packed, tick });
                this.finalizedCount += 1;
            }
        }
    }

    result() {
        return {
            oracle: this.oracle,
            label: this.label,
            pass: this.violations.length === 0,
            ticks: this.ticks,
            finalizedBuckets: this.finalizedCount,
            postFinalizationComparisons: this.comparisons,
            violationCount: this.violations.length,
            violations: this.violations.slice(0, 10),
        };
    }
}

/* ────────────────────────── limb 2 ────────────────────────── */

export class LastBarWindowOracle {
    constructor(label) {
        this.label = label;
        this.oracle = ORACLE_LAST_BAR_WINDOW;
        this.ticks = 0;
        this.valueChecked = 0;
        this.valueFailureCount = 0;
        this.valueFailures = [];
        this.presentationChecked = 0;
        this.presentationFailureCount = 0;
        this.presentationFailures = [];
        // Stronger reading of "complete in the raw data": the bucket's full range
        // exists in the underlying master even though the playhead slice hides it.
        this.masterCompleteChecked = 0;
        this.masterCompleteValueFailureCount = 0;
        this.formingMarkersSeen = new Map();
        this.closeErrorPoints = [];      // presented.c - fullBucket.c
        this.firstFailure = null;
    }

    /**
     * @param {object} r
     * @param {number} r.tick
     * @param {{t,oP,hP,lP,cP}} r.presented        last display bar, integer points
     * @param {{t,oP,hP,lP,cP}|null} r.fullBucket  reference over [start,end), master
     * @param {boolean} r.rawViewComplete          bucket fully present in chart.rawData
     * @param {boolean} r.masterComplete           bucket fully present in the master
     * @param {object|null} r.formingMarker
     * @param {number} r.playheadMs
     */
    observe(r) {
        this.ticks += 1;
        if (r.formingMarker) {
            const k = r.formingMarker.key;
            this.formingMarkersSeen.set(k, (this.formingMarkersSeen.get(k) || 0) + 1);
        }
        if (r.fullBucket && r.masterComplete) {
            this.closeErrorPoints.push(r.presented.cP - r.fullBucket.cP);
            this.masterCompleteChecked += 1;
            if (packOhlc(r.presented) !== packOhlc(r.fullBucket)) {
                this.masterCompleteValueFailureCount += 1;
            }
        }

        if (r.rawViewComplete) {
            // Range is complete in the raw data → the value must be the full
            // bucket aggregation.
            this.valueChecked += 1;
            if (!r.fullBucket || packOhlc(r.presented) !== packOhlc(r.fullBucket)) {
                const rec = {
                    kind: 'value',
                    tick: r.tick,
                    bucketT: r.presented.t,
                    playheadMs: r.playheadMs,
                    presented: packOhlc(r.presented),
                    expected: r.fullBucket ? packOhlc(r.fullBucket) : null,
                    closeErrorPoints: r.fullBucket ? r.presented.cP - r.fullBucket.cP : null,
                };
                this.valueFailureCount += 1;
                if (this.valueFailures.length < 20) this.valueFailures.push(rec);
                if (!this.firstFailure) this.firstFailure = rec;
            }
            return;
        }

        // Range is NOT complete in the raw data → the bar must be explicitly
        // marked forming rather than presented as a finished value.
        this.presentationChecked += 1;
        if (!r.formingMarker) {
            const rec = {
                kind: 'presentation',
                tick: r.tick,
                bucketT: r.presented.t,
                playheadMs: r.playheadMs,
                presented: packOhlc(r.presented),
                expectedFullBucket: r.fullBucket ? packOhlc(r.fullBucket) : null,
                closeErrorPoints: r.fullBucket ? r.presented.cP - r.fullBucket.cP : null,
                markerKeysSearched: FORMING_MARKER_KEYS.length,
            };
            this.presentationFailureCount += 1;
            if (this.presentationFailures.length < 20) this.presentationFailures.push(rec);
            if (!this.firstFailure) this.firstFailure = rec;
        }
    }

    errorStats() {
        const a = this.closeErrorPoints;
        if (!a.length) return { n: 0, meanAbsPips: null, maxAbsPips: null, signedSumPips: null };
        let sumAbs = 0;
        let maxAbs = 0;
        let sum = 0;
        for (const p of a) {
            const ap = p < 0 ? -p : p;
            sumAbs += ap;
            sum += p;
            if (ap > maxAbs) maxAbs = ap;
        }
        return {
            n: a.length,
            meanAbsPips: Math.round((sumAbs / a.length) / 10 * 100) / 100,
            maxAbsPips: Math.round(maxAbs / 10 * 100) / 100,
            signedSumPips: Math.round(sum / 10 * 100) / 100,
        };
    }

    result() {
        const failures = this.valueFailureCount + this.presentationFailureCount;
        return {
            oracle: this.oracle,
            label: this.label,
            pass: failures === 0,
            ticks: this.ticks,
            valueChecked: this.valueChecked,
            valueFailureCount: this.valueFailureCount,
            presentationChecked: this.presentationChecked,
            presentationFailureCount: this.presentationFailureCount,
            masterCompleteChecked: this.masterCompleteChecked,
            masterCompleteValueFailureCount: this.masterCompleteValueFailureCount,
            formingMarkersSeen: Object.fromEntries(this.formingMarkersSeen),
            errorStats: this.errorStats(),
            firstFailure: this.firstFailure,
            valueFailures: this.valueFailures.slice(0, 5),
            presentationFailures: this.presentationFailures.slice(0, 5),
        };
    }
}
