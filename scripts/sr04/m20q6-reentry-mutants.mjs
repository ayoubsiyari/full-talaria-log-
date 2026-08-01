/**
 * m20q6-reentry-mutants.mjs — does m20q6-reentry-guard.test.mjs actually hold the guard down?
 *
 * Each mutant rewrites the shipped `m20Q6CaptureEffects` in BOTH mirrors, runs the oracle, and
 * restores the original bytes. Both mirrors are mutated together on purpose: the oracle has a
 * byte-identity cell, so mutating only the canonical copy would kill every mutant through that
 * cell and tell us nothing about the guard.
 *
 * LAG-4 asks for a `=== true` strict-read mutant. The guard reads no kill-switch — see the report
 * for why one was not added — so there is no flag read to strict-compare. `strict-true-read` below
 * is the adapted form: the same strict-equality-against-a-non-boolean mistake, applied to the depth
 * counter the guard does read. It is labelled adapted rather than passed off as the original.
 *
 * Usage: node scripts/sr04/m20q6-reentry-mutants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORACLE = 'scripts/sr04/m20q6-reentry-guard.test.mjs';
const TARGETS = [
    path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'replay-system.js'),
    path.join(REPO, 'homepage', 'public', 'chart', 'modules', 'replay-system.js'),
];

const GUARD_HEAD = `        if (!state || state.captureDepth > 0) {
            return fn();
        }
`;

const FIXED_PROLOGUE = `        const priorOwnerRoot = state.captureOwnerRoot || null;
        const explicitOwnerRoot = (extraTargets || []).find((target) => (
            target && target.id === 'replayToolbarClone'
        ));
        const session = {
            records: [],
            targets: new WeakSet(),
            schedulerScopes: new WeakSet(),
        };
        if (explicitOwnerRoot) state.captureOwnerRoot = explicitOwnerRoot;
        state.captureDepth += 1;
`;

const PRE_FIX_PROLOGUE = `        state.captureDepth += 1;
        const priorOwnerRoot = state.captureOwnerRoot || null;
        const explicitOwnerRoot = (extraTargets || []).find((target) => (
            target && target.id === 'replayToolbarClone'
        ));
        if (explicitOwnerRoot) state.captureOwnerRoot = explicitOwnerRoot;
        const session = {
            records: [],
            targets: new WeakSet(),
            schedulerScopes: new WeakSet(),
        };
`;

const MUTANTS = [
    {
        id: 'no-finally-release',
        why: 'guard set but never released — one capture per instance, then silence',
        find: `            state.captureDepth -= 1;
            state.captureOwnerRoot = priorOwnerRoot;`,
        replace: `            state.captureOwnerRoot = priorOwnerRoot;`,
    },
    {
        id: 'inverted-polarity',
        why: 'guard suppresses when idle and captures when nested',
        find: GUARD_HEAD,
        replace: `        if (!state || state.captureDepth === 0) {
            return fn();
        }
`,
    },
    {
        id: 'strict-true-read (adapted)',
        why: 'strict equality against a non-boolean — the guard never fires',
        find: GUARD_HEAD,
        replace: `        if (!state || state.captureDepth === true) {
            return fn();
        }
`,
    },
    {
        id: 'outer-suppressed',
        why: 'the OUTER capture is skipped and the inner one runs — effects raised by the outer operation are lost',
        find: GUARD_HEAD,
        replace: `        if (!state) {
            return fn();
        }
        if (state.captureDepth < 1) {
            state.captureDepth += 1;
            try {
                return fn();
            } finally {
                state.captureDepth -= 1;
            }
        }
`,
    },
    {
        id: 'increment-outside-try',
        why: 'reverts the LAG-4 fix — a throwing extraTargets getter wedges the guard on',
        find: FIXED_PROLOGUE,
        replace: PRE_FIX_PROLOGUE,
    },
];

function readAll() {
    return TARGETS.map((file) => ({ file, bytes: fs.readFileSync(file) }));
}

function restore(originals) {
    for (const { file, bytes } of originals) fs.writeFileSync(file, bytes);
}

function applyMutant(originals, mutant) {
    for (const { file, bytes } of originals) {
        const src = bytes.toString('utf8');
        const first = src.indexOf(mutant.find);
        if (first === -1) throw new Error(`${mutant.id}: pattern not found in ${path.basename(file)}`);
        if (src.indexOf(mutant.find, first + 1) !== -1) {
            throw new Error(`${mutant.id}: pattern is not unique in ${path.basename(file)}`);
        }
        fs.writeFileSync(file, src.slice(0, first) + mutant.replace + src.slice(first + mutant.find.length));
    }
}

function runOracle() {
    const result = spawnSync(process.execPath, ['--test', ORACLE], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 1 << 28,
    });
    return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

const originals = readAll();
let baseline;
const results = [];

try {
    baseline = runOracle();
    if (baseline.code !== 0) {
        console.error('BASELINE IS RED — mutation results would be meaningless.\n');
        console.error(baseline.out);
        process.exit(2);
    }
    console.log('baseline: GREEN\n');

    for (const mutant of MUTANTS) {
        applyMutant(originals, mutant);
        const run = runOracle();
        restore(originals);

        const failing = (run.out.match(/^# fail (\d+)$/m) || [])[1]
            ?? (run.out.match(/^\u2139 fail (\d+)$/m) || [])[1]
            ?? '?';
        results.push({ id: mutant.id, why: mutant.why, killed: run.code !== 0, failing });
    }
} finally {
    restore(originals);
}

const killed = results.filter((r) => r.killed);
const survivors = results.filter((r) => !r.killed);

console.log('mutant                        verdict   failing cells');
console.log('----------------------------- --------- -------------');
for (const r of results) {
    console.log(`${r.id.padEnd(29)} ${(r.killed ? 'KILLED' : 'SURVIVED').padEnd(9)} ${r.failing}`);
    console.log(`    ${r.why}`);
}
console.log(`\nkilled ${killed.length}/${results.length}`);

if (survivors.length) {
    console.log('\nSURVIVORS:');
    for (const r of survivors) console.log(`  - ${r.id}: ${r.why}`);
    process.exit(1);
}
