/**
 * MEM-1a / EVICT-03 mutation suite.
 *
 * Each mutant breaks the shipped fix in a way a plausible refactor might, in BOTH
 * mirrors at once so the byte-identity cell is never the sole killer. A surviving
 * mutant means the oracle is decorative for that failure mode.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const MIRRORS = [
    'chart v 1.4/chart/modules/replay-system.js',
    'homepage/public/chart/modules/replay-system.js',
];
const ORACLE = 'scripts/sr04/evict-behind-playhead.test.mjs';

const MUTANTS = [
    {
        id: 'M1 no-money-floor',
        why: 'evicts past an open position entry bar — changes fill and SL/TP evaluation',
        from: 'if (hit >= 0 && hit < start) start = hit;',
        to: 'if (false) start = hit;',
    },
    {
        id: 'M2 inverted-polarity',
        why: 'the kill-switch enables instead of disabling',
        from: "return _talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1');",
        to: "return !_talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1');",
    },
    {
        id: 'M3 strict-true-read',
        why: 'strict === true, so 1 or "yes" silently fail to disable',
        from: "return _talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1');",
        to: "return _talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1') === true;",
    },
    {
        id: 'M4 no-amortisation',
        why: 'trims on every tick — allocation cost exceeds the residency reclaimed',
        from: 'if (start < EVICT_SLACK_BARS) return;',
        to: 'if (start < 1) return;',
        all: true,
    },
    {
        id: 'M5 playhead-not-rebased',
        why: 'currentIndex left absolute after a trim — the playhead teleports',
        from: 'this.currentIndex = playhead - start;',
        to: 'this.currentIndex = playhead;',
    },
    {
        id: 'M6 session-start-not-rebased',
        why: 'sessionStartIndex left absolute — session-relative reads address the wrong bar',
        from: 'this.sessionStartIndex = Math.max(0, sessionStart - start);',
        to: 'this.sessionStartIndex = sessionStart;',
    },
    {
        id: 'M7 session-start-negative',
        why: 'drops the zero clamp, so an evicted session start indexes below the array',
        from: 'this.sessionStartIndex = Math.max(0, sessionStart - start);',
        to: 'this.sessionStartIndex = sessionStart - start;',
    },
    {
        id: 'M8 unreadable-entry-treated-as-safe',
        why: 'an open position with no readable openTime stops blocking eviction',
        from: 'if (sawUnreadable) return NaN;',
        to: 'if (sawUnreadable) return null;',
    },
    {
        id: 'M9 one-exit-unhooked',
        why: 'only one of the advance path exits evicts, so the sub-step path never reclaims',
        from: '            this._evictBehindPlayhead();\n            return;',
        to: '            return;',
    },
    {
        id: 'NEG negative-control',
        why: 'needle that does not exist — MUST report NOT_APPLIED',
        from: 'this._evictBehindPlayheadThatDoesNotExist();',
        to: 'void 0;',
        expectNotApplied: true,
    },
];

const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const baseline = MIRRORS.map(digest);
const original = MIRRORS.map((p) => readFileSync(p, 'utf8'));

function restore() {
    MIRRORS.forEach((p, i) => writeFileSync(p, original[i]));
}

function oracleFails() {
    try {
        execFileSync(process.execPath, ['--test', ORACLE], { stdio: 'pipe', encoding: 'utf8' });
        return null;
    } catch (err) {
        const out = String(err.stdout || '') + String(err.stderr || '');
        const named = [...out.matchAll(/^✖ (R\d+[^(]*)/gm)].map((m) => m[1].trim());
        return named.length ? named : ['(oracle failed)'];
    }
}

let killed = 0;
let applied = 0;
const rows = [];

for (const m of MUTANTS) {
    let count = 0;
    MIRRORS.forEach((p, i) => {
        const text = original[i];
        if (!text.includes(m.from)) return;
        const next = m.all ? text.split(m.from).join(m.to) : text.replace(m.from, m.to);
        writeFileSync(p, next);
        count += 1;
    });

    if (count === 0) {
        restore();
        const ok = Boolean(m.expectNotApplied);
        rows.push(`  ${m.id.padEnd(34)} ${ok ? 'NOT_APPLIED (expected)' : '*** NEEDLE MISSING ***'}`);
        if (!ok) process.exitCode = 1;
        continue;
    }
    if (m.expectNotApplied) {
        restore();
        rows.push(`  ${m.id.padEnd(34)} *** APPLIED BUT SHOULD NOT HAVE ***`);
        process.exitCode = 1;
        continue;
    }

    applied += 1;
    const failures = oracleFails();
    restore();

    if (failures) {
        killed += 1;
        rows.push(`  ${m.id.padEnd(34)} KILLED   by ${[...new Set(failures)].slice(0, 3).join(' | ')}`);
    } else {
        rows.push(`  ${m.id.padEnd(34)} *** SURVIVED ***  ${m.why}`);
        process.exitCode = 1;
    }
}

const restored = MIRRORS.map(digest).every((h, i) => h === baseline[i]);
console.log('MEM-1a / EVICT-03 mutants\n');
console.log(rows.join('\n'));
console.log(`\nkilled ${killed}/${applied} applied mutants; source restored: ${restored ? 'yes' : 'NO'}`);
if (!restored) process.exitCode = 1;
