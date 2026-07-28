/**
 * TAL-01918 RED — the two limbs, kept deliberately independent.
 *
 *   m21-b-bar-immutability-oracle   a bar the product PRESENTS AS FINISHED never
 *                                   changes afterwards, and a bar whose window is
 *                                   incomplete is not presented as finished in the
 *                                   first place.
 *
 *                                   Stated this way on purpose. The previous
 *                                   revision asserted that the bar occupying the
 *                                   last slot must already equal its full bucket.
 *                                   No chart that draws a live candle can satisfy
 *                                   that, so the oracle could not pass on a correct
 *                                   product and its verdict tracked corpus
 *                                   volatility rather than product behaviour. The
 *                                   clauses below are marker-aware and
 *                                   completeness-gated, and clause A fails on a
 *                                   flat corpus, so no clause is a volatility meter.
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
 * SUBJECTS, stated explicitly — one per clause, each counted separately, because
 * a single blended verdict is how the two blocked packets went wrong.
 *
 *   CLAUSE A — presentation. Subject `chart.data[length - 1]` at EVERY tick at
 *   which its window is incomplete. Violation: no forming marker, i.e. the bar is
 *   bit-indistinguishable from a finished one. Structural and FIXTURE-INDEPENDENT:
 *   it fails identically on a flat corpus, so it is not a volatility meter.
 *
 *   CLAUSE B — mutation after a finished presentation. Subject: the value the
 *   product last showed for a bucket WHILE PRESENTING IT AS FINISHED (no marker).
 *   Violation: that value later differs. Marker-aware — a bar carrying a forming
 *   marker is never enrolled, so an aggregator that labels its live candle passes
 *   this clause, and the fix recommended in the report can turn this RED green.
 *
 *   CLAUSE C — settled immutability and settled exactness. Subject
 *   `chart.data[length - 2]` and beyond: every bucket once historical, on every
 *   subsequent tick. Violation: it changes, or it disagrees with the independent
 *   full-bucket reference. NOT a tautology — the pipeline full-resamples the whole
 *   series from the growing prefix on every tick (fullResampleCalls === ticks,
 *   incrementalHits === 0), so each historical bar is recomputed from scratch every
 *   time it is compared. This is the packet's genuine differential.
 *
 * The oracle passes iff A and B and C all pass. Behaviour on reference models:
 *   ideal aggregator, omits the partial bucket   → PASS (A,B,C)
 *   ideal aggregator, marks it isForming         → PASS (A,B,C)
 *   ideal aggregator, unmarked partial           → FAIL A and B
 *   flat corpus, unmarked partial                → FAIL A, pass B (magnitude zero)
 */
export class BarImmutabilityOracle {
    constructor(label) {
        this.label = label;
        this.oracle = ORACLE_IMMUTABILITY;
        this.subjects = {
            A: 'chart.data[length-1] at every tick its window is incomplete — presentation',
            B: 'the value last shown for a bucket while presenting it as finished (no marker)',
            C: 'every bucket once historical, on every subsequent tick — settled differential',
        };

        // clause A
        this.aChecked = 0;
        this.aViolations = 0;
        this.aBuckets = new Set();

        // clause B
        this.presentedFinished = new Map(); // bucketT -> { packed, cP, tick, playheadMs, complete }
        this.bChecked = 0;
        this.bViolations = 0;
        this.bSamples = [];
        this.movementPoints = [];

        // clause C
        this.settled = new Map();           // bucketT -> packed at first historical sighting
        this.cStabilityChecked = 0;
        this.cStabilityViolations = 0;
        this.cExactChecked = 0;
        this.cExactViolations = 0;
        this.cSamples = [];

        this.ticks = 0;
    }

    /**
     * @param {object} o
     * @param {Array<{t,oP,hP,lP,cP}>} o.series      integer-point display series
     * @param {number} o.tick
     * @param {number} o.playheadMs
     * @param {boolean} o.rawViewComplete            is the last bucket's window complete now
     * @param {{key:string,value:string}|null} o.formingMarker  marker on the last bar, if any
     * @param {Map<number,object>} o.refByT          independent full-bucket reference
     */
    observe({ series, tick, playheadMs, rawViewComplete, formingMarker, refByT }) {
        this.ticks += 1;
        const lastIdx = series.length - 1;
        if (lastIdx < 0) return;
        const last = series[lastIdx];

        // ── clause A ──
        if (!rawViewComplete) {
            this.aChecked += 1;
            if (!formingMarker) {
                this.aViolations += 1;
                this.aBuckets.add(last.t);
            }
        }

        // ── clause B enrolment ──
        if (!formingMarker) {
            this.presentedFinished.set(last.t, {
                packed: packOhlc(last), cP: last.cP, tick, playheadMs, complete: !!rawViewComplete,
            });
        }

        // ── clause C ──
        for (let i = 0; i < lastIdx; i++) {
            const bar = series[i];
            const packed = packOhlc(bar);
            const prior = this.settled.get(bar.t);
            if (prior === undefined) {
                this.settled.set(bar.t, packed);
                const ref = refByT.get(bar.t);
                if (ref) {
                    this.cExactChecked += 1;
                    if (packed !== packOhlc(ref)) {
                        this.cExactViolations += 1;
                        if (this.cSamples.length < 10) {
                            this.cSamples.push({
                                bucketT: bar.t, kind: 'exactness', tick,
                                product: packed, independentReference: packOhlc(ref),
                                closeDeltaPoints: bar.cP - ref.cP,
                            });
                        }
                    }
                }
                continue;
            }
            this.cStabilityChecked += 1;
            if (prior !== packed) {
                this.cStabilityViolations += 1;
                if (this.cSamples.length < 10) {
                    this.cSamples.push({ bucketT: bar.t, kind: 'stability', tick, was: prior, now: packed });
                }
            }
        }
    }

    /** @param {Map<number,object>} refByT independent full-bucket reference */
    finalize(refByT) {
        for (const [bucketT, rec] of this.presentedFinished) {
            const ref = refByT.get(bucketT);
            if (!ref) continue;                    // bucket never completed in the corpus
            this.bChecked += 1;
            const finalPacked = packOhlc(ref);
            const movement = ref.cP - rec.cP;
            this.movementPoints.push(movement);
            if (rec.packed !== finalPacked) {
                this.bViolations += 1;
                if (this.bSamples.length < 10) {
                    this.bSamples.push({
                        bucketT,
                        presentedAsFinishedAtTick: rec.tick,
                        playheadMsAtThatTick: rec.playheadMs,
                        windowCompleteAtThatTick: rec.complete,
                        remainderUnelapsedMs: rec.complete ? 0 : null,
                        displayedThen: rec.packed,
                        settledTo: finalPacked,
                        closeMovementPoints: movement,
                    });
                }
            }
        }
    }

    movementStats() {
        const a = this.movementPoints;
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
        const clauseA = { checked: this.aChecked, violations: this.aViolations, pass: this.aViolations === 0 };
        const clauseB = {
            checked: this.bChecked, violations: this.bViolations, pass: this.bViolations === 0,
            movement: this.movementStats(), samples: this.bSamples.slice(0, 4),
        };
        const clauseC = {
            stabilityChecked: this.cStabilityChecked, stabilityViolations: this.cStabilityViolations,
            exactnessChecked: this.cExactChecked, exactnessViolations: this.cExactViolations,
            pass: this.cStabilityViolations === 0 && this.cExactViolations === 0,
            samples: this.cSamples.slice(0, 4),
        };
        return {
            oracle: this.oracle,
            label: this.label,
            subjects: this.subjects,
            pass: clauseA.pass && clauseB.pass && clauseC.pass,
            ticks: this.ticks,
            clauseA, clauseB, clauseC,
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
