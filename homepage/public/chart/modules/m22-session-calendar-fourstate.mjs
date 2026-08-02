#!/usr/bin/env node
/**
 * m22-session-calendar-fourstate.mjs — §A5 test-integrity driver.
 *
 * Manager: A · Packet: session-calendar-red · Tier: 3
 *
 * Produces the §A5 evidence for the session-calendar RED oracle in one run:
 *
 *   §A5.3 four-state proof
 *     broken   real product as committed              -> MUST FAIL
 *     fixed    product + in-memory WIRING_PATCH       -> MUST PASS
 *     corrupt  fixed, helper's 17:00 anchor -> 16:00  -> MUST FAIL
 *     inverted fixed, every value assertion inverted  -> MUST FAIL
 *
 *   §A5.4 3x repeat at authoring, plus one run on a different clock.
 *     The alternate-clock runs set the process TZ, which is a real hazard for
 *     this module: a session calendar that leaked the host zone would pass on
 *     one machine and fail on another.
 *
 * Usage: node "chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs"
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { REPO_ROOT, readBuildSha, writeEvidence, productIsWired } from './m22-session-calendar-harness.mjs';

const ORACLE = 'chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs';

const PRODUCT_WIRED = productIsWired();
const STATES = [
    {
        state: 'broken',
        expect: PRODUCT_WIRED ? 'pass' : 'fail',
        why: PRODUCT_WIRED
            ? 'product carries session-calendar wiring — live tree must stay green'
            : 'real product as committed — the defect must be caught',
    },
    { state: 'fixed', expect: 'pass', why: 'product + WIRING_PATCH (or already-wired product) — the oracle must be satisfiable' },
    { state: 'corrupt', expect: 'fail', why: 'helper anchor corrupted 17:00 -> 16:00 — a 1h input error must be caught' },
    { state: 'inverted', expect: 'fail', why: 'every value assertion inverted — the oracle must flip' },
];

// §A5.4: three repeats on the authoring clock, plus alternate clocks. The host
// clock cannot be changed here, so the timezone (the variable this module is
// actually sensitive to) is varied instead, and the limitation is recorded.
// The independent reviewer of rejection 1 ran four zones this driver did not,
// including opposite-DST-phase and fractional-offset zones, and reproduced
// identical results. Those zones are adopted here so the claim is carried by
// the packet's own evidence rather than by the review notes.
const CLOCKS = [
    { id: 'host-tz', env: {}, repeats: 3 },
    { id: 'tz-utc', env: { TZ: 'UTC' }, repeats: 1 },
    { id: 'tz-asia-tokyo', env: { TZ: 'Asia/Tokyo' }, repeats: 1 },
    // UTC+14: the host local date differs from UTC for most of the day.
    { id: 'tz-pacific-kiritimati', env: { TZ: 'Pacific/Kiritimati' }, repeats: 1 },
    // Fractional fixed offset (+05:45), no DST.
    { id: 'tz-asia-kathmandu', env: { TZ: 'Asia/Kathmandu' }, repeats: 1 },
    // Southern hemisphere: DST runs in the OPPOSITE phase to America/New_York,
    // so a host-zone leak would show up as a sign flip rather than a constant.
    { id: 'tz-america-santiago', env: { TZ: 'America/Santiago' }, repeats: 1 },
    // Fractional offset AND a 30-minute DST shift (+10:30 / +11:00) in the
    // opposite phase — the most hostile combination available.
    { id: 'tz-australia-lord-howe', env: { TZ: 'Australia/Lord_Howe' }, repeats: 1 },
    // Fractional offset with a full-hour DST shift (+12:45 / +13:45).
    { id: 'tz-pacific-chatham', env: { TZ: 'Pacific/Chatham' }, repeats: 1 },
];

function runOnce(state, clock) {
    const result = spawnSync(
        process.execPath,
        ['--test', '--test-concurrency=1', ORACLE],
        {
            cwd: REPO_ROOT,
            env: { ...process.env, ...clock.env, M22_SC_STATE: state },
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    const failLine = out.match(/\[m22-session-calendar\] state=\S+ verdict=(\S+) \(expected (\S+)\) failed=(\d+)\/(\d+)/);
    const failures = [...out.matchAll(/^FAIL \[([^\]]+)\] (\S+) — (.*)$/gm)]
        .map((m) => ({ cell: m[1], name: m[2], detail: m[3] }));
    return {
        state,
        clock: clock.id,
        exitCode: result.status,
        verdict: failLine ? failLine[1] : 'UNKNOWN',
        failedCount: failLine ? Number(failLine[3]) : null,
        totalCount: failLine ? Number(failLine[4]) : null,
        failures,
    };
}

const runs = [];
for (const { state, expect, why } of STATES) {
    for (const clock of CLOCKS) {
        for (let repeat = 1; repeat <= clock.repeats; repeat++) {
            const run = runOnce(state, clock);
            const observed = run.exitCode === 0 ? 'pass' : 'fail';
            const ok = observed === expect;
            runs.push({ ...run, repeat, expect, observed, ok, why });
            process.stdout.write(
                `${ok ? 'OK  ' : 'BAD '} state=${state} clock=${clock.id} repeat=${repeat} `
                + `observed=${observed} expected=${expect} failed=${run.failedCount}/${run.totalCount}\n`,
            );
        }
    }
}

const byState = {};
for (const { state } of STATES) {
    const forState = runs.filter((r) => r.state === state);
    byState[state] = {
        expect: forState[0].expect,
        why: forState[0].why,
        runs: forState.length,
        allAsExpected: forState.every((r) => r.ok),
        deterministic: new Set(forState.map((r) => `${r.observed}:${r.failedCount}`)).size === 1,
        failedCounts: [...new Set(forState.map((r) => r.failedCount))],
    };
}

const summary = {
    packet: 'session-calendar-red',
    manager: 'A',
    row: 'Session-calendar bucketing (canary blocker)',
    tier: 3,
    ruling: '§A5 test-integrity policy',
    // The per-state files carry this; the summary did not, which made the
    // top-level proof artifact the one thing that could not be tied to a tree.
    buildSha: readBuildSha(),
    fourStateProof: byState,
    fourStateProofHolds: Object.values(byState).every((s) => s.allAsExpected),
    repeatPolicy: '3x on the authoring clock per state, plus 7 alternate timezones per state',
    determinismHolds: Object.values(byState).every((s) => s.deterministic),
    alternateClockOrHost: {
        done: 'timezone varied across UTC; Asia/Tokyo; Pacific/Kiritimati (UTC+14, host local date'
            + ' differs from UTC for most of the day); Asia/Kathmandu (+05:45 fractional, no DST);'
            + ' America/Santiago (southern-hemisphere DST, opposite phase to America/New_York);'
            + ' Australia/Lord_Howe (+10:30/+11:00 — fractional offset AND a 30-minute DST shift in'
            + ' the opposite phase); Pacific/Chatham (+12:45/+13:45 fractional with full-hour DST)',
        notDone: 'a physically different host was not available to this worker',
        whyThatIsAcceptableHere:
            'The module resolves every boundary through the IANA zone database for an EXPLICIT zone'
            + ' (America/New_York), never through the host default zone, and the oracle takes no'
            + ' input from the wall clock. Host timezone is the only environment variable that could'
            + ' plausibly change the result, and it is varied. A second physical host would add'
            + ' ICU-version coverage, which remains unverified.',
    },
    nondeterminismBan: 'asserted structurally by oracle cell L',
    epsilon: 0,
    runs,
};

const out = writeEvidence('m22-session-calendar-fourstate', summary);
process.stdout.write(`\nfour-state proof holds: ${summary.fourStateProofHolds}\n`);
process.stdout.write(`determinism holds: ${summary.determinismHolds}\n`);
process.stdout.write(`EVIDENCE -> ${out}\n`);
process.exitCode = summary.fourStateProofHolds && summary.determinismHolds ? 0 : 1;
void path;
