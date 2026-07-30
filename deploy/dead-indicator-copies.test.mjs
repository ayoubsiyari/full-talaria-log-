/**
 * DEAD-INDICATOR-COPIES-V1 — one indicator implementation ships, not five.
 *
 * WHY THIS IS A GATE AND NOT A REPORT
 * `served-module-reachability.mjs` already classified four of these as ORPHAN — "named nowhere
 * in reached code". It printed that, correctly, under a heading literally called "INDICATOR
 * IMPLEMENTATIONS, classified", and nothing failed, so they shipped anyway for as long as anyone
 * cared to look. A finding that no build consults is a finding that decays. This is the same
 * result with an exit code attached.
 *
 * WHAT WAS REMOVED, and the evidence that it was safe (2026-07-30, four independent methods):
 *   1. full-text grep of the entire served tree      -> 0 referencing files (control: full.js = 13)
 *   2. nginx access log on the live canary            -> 0 requests (control: full.js = 10)
 *   3. served-module-reachability BFS                 -> ORPHAN, not NAMED-ONLY
 *                                                        (control: full.js = REACHED)
 *   4. CONF-01 harness boot after deletion            -> 4/4 panels live, getActiveChart present
 *
 * Method 3 is the one that matters most: NAMED-ONLY exists precisely to catch a computed loader
 * like `modules/${name}.js`, and none of these landed in it.
 *
 * `chart-indicators-full.js` is the implementation. It is asserted present, so that "no dead
 * copies" can never be satisfied by deleting all of them.
 *
 * Run: node --test deploy/dead-indicator-copies.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Source trees that become a served image. */
const SERVED_SOURCES = ['chart v 1.4/chart/modules', 'homepage/public/chart/modules'];

/** The single implementation every shell actually loads. */
const LIVE = 'chart-indicators-full.js';

/** Removed 2026-07-30; each is dead by all four methods in the header. */
const REMOVED = Object.freeze([
    'chart-indicators.js',
    'chart-indicators-readable.js',
    'chart-indicators-with-hma.js',
    'chart-indicators-working-backup-final.js',
    'indicator formuls.text',
]);

const presentDirs = SERVED_SOURCES.filter((d) => fs.existsSync(path.join(ROOT, d)));

test('CELL 1 — the trees this gate polices actually exist', () => {
    // Renaming a served tree must not silently turn this gate into a no-op.
    assert.deepEqual(presentDirs, SERVED_SOURCES,
        `expected both served module trees; missing: ${SERVED_SOURCES.filter((d) => !presentDirs.includes(d)).join(', ')}`);
});

test('CELL 2 — the live implementation is present in every served tree', () => {
    for (const dir of presentDirs) {
        assert.ok(fs.existsSync(path.join(ROOT, dir, LIVE)),
            `${dir}/${LIVE} is the implementation the shells load; it must not be removed`);
    }
});

test('CELL 3 — no removed dead copy has come back', () => {
    const back = [];
    for (const dir of presentDirs) {
        for (const name of REMOVED) {
            if (fs.existsSync(path.join(ROOT, dir, name))) back.push(`${dir}/${name}`);
        }
    }
    assert.deepEqual(back, [],
        `these were removed as unreferenced and have returned:\n  ${back.join('\n  ')}\n` +
        'If one is genuinely needed, wire it to a shell and take it off the REMOVED list ' +
        'with the load path recorded — do not just re-add the file.');
});

test('CELL 4 — exactly one chart-indicators implementation ships', () => {
    // The general form of the defect: the next backup will not be called
    // "working-backup-final", so name-matching the five we found is not enough.
    for (const dir of presentDirs) {
        const found = fs.readdirSync(path.join(ROOT, dir))
            .filter((f) => /^chart-indicators.*\.(js|mjs|cjs)$/i.test(f))
            .filter((f) => !/\.test\.mjs$/i.test(f));
        assert.deepEqual(found, [LIVE],
            `${dir} should ship exactly one indicator implementation, found: ${found.join(', ')}`);
    }
});

test('CELL 5 — MUTANT: a new differently-named backup is caught', () => {
    // Proves CELL 4 is doing the work, without touching the real tree.
    const simulated = ['chart-indicators-full.js', 'chart-indicators-v2-FINAL.js'];
    const found = simulated.filter((f) => /^chart-indicators.*\.(js|mjs|cjs)$/i.test(f));
    assert.notDeepEqual(found, [LIVE],
        'a second implementation under any name must fail CELL 4');
});
