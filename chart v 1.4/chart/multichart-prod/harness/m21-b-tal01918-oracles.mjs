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

/**
 * SUBJECT (stated explicitly, because the wrong subject is what blocked the
 * sibling packet):
 *
 *   PRIMARY subject — `chart.data[length - 1]`, sampled at the LAST tick on which
 *   that bucket still occupies the last slot. That is the bar the trim writes
 *   (chart.js: `const lastIdx = this.data.length - 1; … this.data[lastIdx] = trimmed;`)
 *   and, under candle-mode stepping, the bar a human sees holding a static value
 *   for a whole step and reads as finished. Its close is then compared against the
 *   independent full-bucket reference and against the value the same bucket holds
 *   once it is historical.
 *
 *   CONTROL subject — `chart.data[length - 2]`, i.e. any bar already historical
 *   when first sampled. The trim can structurally never write that slot, so this
 *   sub-check is a TAUTOLOGY. It is retained and reported ONLY to demonstrate the
 *   tautology numerically: it passes in exactly the cells where the primary
 *   subject records a double-digit pip move.
 */
export class BarImmutabilityOracle {
    constructor(label) {
        this.label = label;
        this.oracle = ORACLE_IMMUTABILITY;
        this.subject = 'chart.data[length-1] at the last tick the bucket occupies the last slot';
        this.controlSubject = 'chart.data[length-2] (structurally untouchable by the trim)';

        // primary
        this.lastSlot = new Map();    // bucketT -> { packed, cP, tick, playheadMs }
        this.settled = new Map();     // bucketT -> { packed, cP, tick }
        this.primaryChecked = 0;
        this.primaryViolations = [];
        this.primaryViolationCount = 0;
        this.movementPoints = [];     // settled.c - lastSlot.c, per bucket

        // control (tautology demonstrator)
        this.historicalFirstSeen = new Map();
        this.controlComparisons = 0;
        this.controlViolationCount = 0;

        this.ticks = 0;
    }

    /**
     * @param {Array<{t,oP,hP,lP,cP}>} series integer-point display series
     * @param {number} tick
     * @param {number} playheadMs
     */
    observe(series, tick, playheadMs) {
        this.ticks += 1;
        const lastIdx = series.length - 1;
        if (lastIdx < 0) return;

        // PRIMARY: overwrite each tick, so the map always holds the value at the
        // most recent tick this bucket occupied the last slot.
        const last = series[lastIdx];
        this.lastSlot.set(last.t, {
            packed: packOhlc(last), cP: last.cP, tick, playheadMs,
        });

        // PRIMARY: the moment a bucket stops being last, freeze what it settled to.
        for (let i = 0; i < lastIdx; i++) {
            const bar = series[i];
            if (this.settled.has(bar.t)) continue;
            this.settled.set(bar.t, { packed: packOhlc(bar), cP: bar.cP, tick });
        }

        // CONTROL: first-seen-while-historical, then re-checked forever.
        for (let i = 0; i < lastIdx; i++) {
            const bar = series[i];
            const packed = packOhlc(bar);
            const prior = this.historicalFirstSeen.get(bar.t);
            if (!prior) {
                this.historicalFirstSeen.set(bar.t, packed);
                continue;
            }
            this.controlComparisons += 1;
            if (prior !== packed) this.controlViolationCount += 1;
        }
    }

    /**
     * @param {Map<number, {cP:number, oP:number, hP:number, lP:number, t:number}>} refByT
     *        independent full-bucket reference (NOT product code)
     */
    finalize(refByT) {
        for (const [bucketT, settledRec] of this.settled) {
            const lastSlotRec = this.lastSlot.get(bucketT);
            if (!lastSlotRec) continue;
            const ref = refByT.get(bucketT) || null;
            this.primaryChecked += 1;
            const movement = settledRec.cP - lastSlotRec.cP;
            this.movementPoints.push(movement);
            const vsReference = ref ? lastSlotRec.cP - ref.cP : null;
            if (lastSlotRec.packed !== settledRec.packed
                || (ref && lastSlotRec.packed !== packOhlc(ref))) {
                this.primaryViolationCount += 1;
                if (this.primaryViolations.length < 20) {
                    this.primaryViolations.push({
                        bucketT,
                        lastOccupiedLastSlotAtTick: lastSlotRec.tick,
                        playheadMsAtThatTick: lastSlotRec.playheadMs,
                        displayedThen: lastSlotRec.packed,
                        settledTo: settledRec.packed,
                        independentFullBucket: ref ? packOhlc(ref) : null,
                        movementPoints: movement,
                        errorVsIndependentReferencePoints: vsReference,
                    });
                }
            }
        }
    }

    movementStats() {
        const a = this.movementPoints.filter((x) => x !== null);
        if (!a.length) return { n: 0, meanAbsPips: null, maxAbsPips: null };
        let sumAbs = 0;
        let maxAbs = 0;
        for (const p of a) {
            const ap = p < 0 ? -p : p;
            sumAbs += ap;
            if (ap > maxAbs) maxAbs = ap;
        }
        return {
            n: a.length,
            meanAbsPips: Math.round((sumAbs / a.length) / 10 * 100) / 100,
            maxAbsPips: Math.round(maxAbs / 10 * 100) / 100,
        };
    }

    result() {
        return {
            oracle: this.oracle,
            label: this.label,
            subject: this.subject,
            controlSubject: this.controlSubject,
            pass: this.primaryViolationCount === 0,
            ticks: this.ticks,
            bucketsChecked: this.primaryChecked,
            violationCount: this.primaryViolationCount,
            movement: this.movementStats(),
            violations: this.primaryViolations.slice(0, 6),
            tautologyControl: {
                subject: this.controlSubject,
                comparisons: this.controlComparisons,
                violationCount: this.controlViolationCount,
                pass: this.controlViolationCount === 0,
            },
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
