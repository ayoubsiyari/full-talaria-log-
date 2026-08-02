/**
 * REJECTED AS A GATE — retained as reference material only. Do not cite as evidence.
 *
 * Renamed off the `.red.` convention per VER-03: a harness that cannot fail on a
 * product regression may not wear that name.
 *
 * Adversarial review (B-R4): 33 designed mutations, 21 survived. Disqualifying:
 *   - A decoy resolver inside `if (false) { ... }` passes while the REAL resolver
 *     is `Date.now()`. The harness extracts and evaluates dead code.
 *   - A shape-correct stub with no behaviour passes; so does `if (true) { return; }`
 *     inserted immediately before the resolver.
 *   - The oracle never asserts that any bar time is used: the `evalCandle` and
 *     `currentCandle` branches can both be deleted outright and it stays green.
 *   - `duration` is computed by the harness, not by product code, so despite the
 *     name nothing here tests a duration. The absurd-duration assertion also
 *     passes vacuously, because `null <= n` coerces to `0 <= n`.
 *   - The headline scenario (`currentCandle: null, evalCandle: null` with three
 *     finite-close bars) is unreachable in production, so its one kill proves
 *     nothing about the product.
 *
 * What was sound and should be carried into any rebuild: snippet extraction fails
 * closed on anchor drift and on a renamed method, and the `bgCloseTime === 0`
 * assertion is genuine — a truthiness regression dies on it.
 *
 * A rebuild must drive `closePositionAtPrice` itself rather than evaluate extracted
 * text, or dead code and stubs will keep passing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORDER_MANAGER = path.join(HERE, 'order-manager.js');
const FIXED_WALL_TIME = 1_800_000_000_000;
const DATA = [
    { t: 1_672_531_200_000, o: 1.0, h: 1.2, l: 0.9, c: 1.1 },
    { t: 1_672_534_800_000, o: 1.1, h: 1.3, l: 1.0, c: 1.2 },
    { t: 1_672_538_400_000, o: 1.2, h: 1.4, l: 1.1, c: 1.3 },
];
const OPEN_TIME = DATA[0].t;
const LAST_BAR_TIME = DATA.at(-1).t;
const LOADED_SPAN = LAST_BAR_TIME - OPEN_TIME;
const ABSURD_DURATION = LOADED_SPAN + 7 * 24 * 60 * 60 * 1000;

function readSource() {
    let source = fs.readFileSync(ORDER_MANAGER, 'utf8');
    if (process.env.M10_CORRUPT_SOURCE === 'missing-close-method') {
        source = source.replace(/\n(\s{4})closePositionAtPrice\(/, '\n$1closePositionAtPrice_CORRUPTED(');
    }
    return source;
}

function closePositionMethodIndex(source) {
    const methodMatch = /\n\s{4}closePositionAtPrice\(/.exec(source);
    const methodIndex = methodMatch ? methodMatch.index + 1 : -1;
    assert.notEqual(methodIndex, -1, 'source extraction failed: closePositionAtPrice is unreachable');
    return methodIndex;
}

function extractCloseTimeSnippet(source) {
    const methodIndex = closePositionMethodIndex(source);
    const start = source.indexOf('const currentCandle = this.getCurrentCandle();', methodIndex);
    assert.notEqual(start, -1, 'source extraction failed: current candle anchor is missing');
    const end = source.indexOf('const posTicker =', start);
    assert.notEqual(end, -1, 'source extraction failed: close-time boundary is missing');
    const snippet = source.slice(start, end);
    assert.match(snippet, /\bcloseTime\b/, 'source extraction failed: closeTime is not resolved in snippet');
    assert.doesNotMatch(snippet, /function\s+hardcoded|HARDCODED/i, 'test must not run hardcoded close-time logic');
    return snippet;
}

function makeResolver(source) {
    const snippet = extractCloseTimeSnippet(source);
    return new Function('position', 'bgCloseTime', 'DateShim', `
        const Date = DateShim;
        ${snippet}
        return closeTime;
    `);
}

function makeContext({ currentCandle = null, evalCandle = undefined, replayActive = true, data = DATA } = {}) {
    return {
        chart: { data, rawData: data, replaySystem: { isActive: replayActive } },
        replaySystem: { isActive: replayActive },
        _getOrderContextChart() {
            return this.chart;
        },
        _playbackReplaySystem() {
            return this.chart?.replaySystem || this.replaySystem || null;
        },
        getCurrentCandle() {
            return currentCandle;
        },
        _evalCandleForPosition() {
            return evalCandle;
        },
    };
}

function runScenario(source, scenario) {
    const resolver = makeResolver(source);
    const ctx = makeContext(scenario.context);
    const position = { id: 1, openTime: scenario.openTime ?? OPEN_TIME };
    const closeTime = resolver.call(ctx, position, scenario.bgCloseTime ?? null, { now: () => FIXED_WALL_TIME });
    return {
        closeTime,
        duration: Number.isFinite(closeTime) ? closeTime - position.openTime : null,
    };
}

function assertDurationClock(source) {
    const replayMissingCandle = runScenario(source, {
        name: 'replay missing candle uses loaded bar time',
        context: { replayActive: true, currentCandle: null, evalCandle: null, data: DATA },
    });
    assert.equal(
        replayMissingCandle.closeTime,
        LAST_BAR_TIME,
        'replay closeTime must fall back to the last loaded bar time, not wall clock',
    );
    assert.ok(
        replayMissingCandle.duration <= ABSURD_DURATION,
        `duration is absurd: ${replayMissingCandle.duration} > ${ABSURD_DURATION}`,
    );

    const zeroBg = runScenario(source, {
        name: 'bgCloseTime zero survives',
        bgCloseTime: 0,
        openTime: 0,
        context: { replayActive: true, currentCandle: { t: LAST_BAR_TIME }, evalCandle: { t: LAST_BAR_TIME }, data: DATA },
    });
    assert.equal(zeroBg.closeTime, 0, 'finite bgCloseTime=0 must not fall through via ||');
    assert.equal(zeroBg.duration, 0, 'bgCloseTime=0 duration should remain zero when openTime is zero');

    const replayNoBars = runScenario(source, {
        name: 'replay without any bar time stays unknown',
        context: { replayActive: true, currentCandle: null, evalCandle: null, data: [] },
    });
    assert.equal(replayNoBars.closeTime, null, 'active replay with no bar-clock source must not fabricate Date.now()');
    assert.equal(replayNoBars.duration, null, 'unknown replay closeTime must leave duration unknown');

    const liveNoBars = runScenario(source, {
        name: 'live without bars may use wall clock',
        context: { replayActive: false, currentCandle: null, evalCandle: null, data: [] },
    });
    assert.equal(liveNoBars.closeTime, FIXED_WALL_TIME, 'non-replay missing bar source may use Date.now()');
}

function replaceRequired(source, needle, replacement, label) {
    assert.ok(source.includes(needle), `mutation setup failed: ${label} needle was not found`);
    return source.replace(needle, replacement);
}

function mutationSources(source) {
    return [
        {
            name: 'bg-zero-falls-through',
            source: replaceRequired(source, 'Number.isFinite(bgCloseTimeNumber)', 'bgCloseTimeNumber', 'bg zero mutation'),
        },
        {
            name: 'last-bar-unreachable',
            source: replaceRequired(source, 'return lastBarTime;', 'return null;', 'last bar mutation'),
        },
        {
            name: 'replay-fabricates-wall-clock',
            source: replaceRequired(source, 'return replayActive ? null : Date.now();', 'return Date.now();', 'replay wall clock mutation'),
        },
        {
            name: 'live-wall-clock-disabled',
            source: replaceRequired(source, 'return replayActive ? null : Date.now();', 'return null;', 'live wall clock mutation'),
        },
    ];
}

function runMutations(source) {
    let survived = 0;
    const designed = mutationSources(source);
    for (const mutant of designed) {
        let killed = false;
        try {
            assertDurationClock(mutant.source);
        } catch (_err) {
            killed = true;
        }
        if (!killed) {
            survived++;
            console.error(`[mutation survived] ${mutant.name}`);
        }
    }
    return { designed: designed.length, survived };
}

function main() {
    const source = readSource();
    if (process.env.M10_INVERT_EXPECTATIONS === '1') {
        assert.throws(() => assertDurationClock(source), undefined, 'inverted proof expected fixed source to fail');
        return { designed: 0, survived: 0 };
    }

    assertDurationClock(source);
    const mutationResult = runMutations(source);
    assert.equal(mutationResult.survived, 0, 'one or more designed mutations survived');
    return mutationResult;
}

try {
    const { designed, survived } = main();
    console.log(`[b-m10-duration-clock] PASS mutation-survival: ${designed} designed, ${survived} survived`);
} catch (err) {
    console.error(`[b-m10-duration-clock] FAIL ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
}
