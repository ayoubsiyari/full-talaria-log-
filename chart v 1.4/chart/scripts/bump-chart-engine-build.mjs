#!/usr/bin/env node
/**
 * Image-build emitter. Usage: npm run version:bump
 * Override: BUILD_ID=20260629b2 npm run version:bump
 * Inspect without mutating: node bump-chart-engine-build.mjs --dry-run
 *
 * ── TWO PRODUCT SIDE EFFECTS. THIS SCRIPT IS NOT A VERIFIER. ────────────────────────────
 *
 * Running it writes to the tree in two places:
 *
 *   1. chart.js          — rewrites `const CHART_ENGINE_BUILD = '…'`
 *   2. build-info.json   — PASSPORT-3: buildId + sourceCommitSha
 *
 * Anything that wants to CHECK this emitter must pass --dry-run: a tree that moves when you
 * look at it cannot be sealed. --dry-run computes everything, writes nothing, and prints the
 * build-info it would emit.
 *
 * ── REMOVED 2026-08-01: the package.json patch bump ─────────────────────────────────────
 *
 * There was a third effect. Every invocation bumped chart/package.json's patch version
 * unconditionally, and C found six verifier runs had walked it 1.4.31 → 1.4.37 in a tree
 * that was supposed to be quiescent. It is gone rather than documented, for three reasons:
 *
 *   Nothing reads it. The only references to that version in the entire repository are the
 *   npm scripts that invoke THIS script. No consumer, no import, no served artefact.
 *
 *   It made builds non-reproducible. Build the same commit twice and you got two different
 *   trees, differing in a field carrying no information about either.
 *
 *   It was a false provenance signal, which is the precise thing PASSPORT-3 exists to
 *   remove. 1.4.37 next to 1.4.31 implies six releases; there were zero, and the committed
 *   value never left 1.4.31. Build identity is buildId plus sourceCommitSha, both of which
 *   are validated, both of which reach the wire. A third, weaker, unvalidated identity that
 *   advances when someone merely LOOKS at the emitter is worse than no identity at all.
 *
 * passport3.test.mjs asserts package.json is byte-identical after a real run, and that
 * assertion is shown going red when the bump is restored.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHART_JS = path.join(ROOT, 'chart.js');
const BUILD_INFO = path.join(ROOT, 'build-info.json');

const BUILD_RE = /const CHART_ENGINE_BUILD = '([^']+)';/;
// Same shape the checkpoint asserter enforces (scripts/lib/checkpoint-provenance.mjs SOURCE_SHA_RE).
// Duplicated rather than imported because that lib is copied to a different path inside the image.
const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;

function defaultBuildId() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${ymd}b1`;
}

function incrementBuildId(id) {
    const m = /^(\d{8})([ab])(\d+)$/i.exec(String(id || '').trim());
    if (m) return `${m[1]}${m[2]}${parseInt(m[3], 10) + 1}`;
    return `${defaultBuildId()}2`;
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * PRE-CUT INTEGRITY GATE. Runs before anything is written, including under --dry-run.
 *
 * Truncation hit two worktrees in one day: A lost both mirrors, and B found nine files chopped at
 * ~521 KB with chart.js at 10,398 lines. Both were caught by hand. What we cannot survive is shipping
 * it, because a ten-hour soak against corrupt bytes does not read as a fault - it reads as a product
 * verdict, and the wrong thing gets fixed.
 *
 * The existing layout assert compares the two mirrors byte-for-byte, but it runs AFTER
 * build:live:chart, which syncs canonical onto homepage. A truncated canonical is copied over the good
 * mirror and the two agree perfectly, so parity reports green on exactly this case. This gate is
 * absolute rather than relative: every script the browser loads must parse, and none may have lost a
 * quarter of its lines against its own committed state.
 *
 * It BLOCKS. A gate that reports and proceeds is a log line.
 */
function preCutIntegrityGate() {
    if (process.env.SKIP_PRECUT_INTEGRITY === '1') {
        console.warn('[bump-chart-engine-build] PRE-CUT INTEGRITY GATE SKIPPED by SKIP_PRECUT_INTEGRITY=1.');
        console.warn('[bump-chart-engine-build] This build is NOT covered against truncation. Do not soak against it.');
        return;
    }
    const gate = path.join(__dirname, 'pre-cut-integrity-gate.mjs');
    // From the repo the homepage mirror is two levels up and both mirrors get checked. Inside the
    // checkpoint image only the chart tree is present, so the canonical mirror is the root itself and
    // the gate reports the homepage mirror as simply absent rather than failing on it.
    //
    // Climb only when BOTH mirrors are up there, because the presence of one of them does not make a
    // directory the repo. Inside the homepage image the chart tree is /build/chart, so two levels up is
    // `/` — and /homepage/public/chart genuinely exists there, so testing the homepage mirror alone
    // elected `/` as the repo root. resolveMirrors() then looked for `chart v 1.4/chart` under `/`,
    // did not find it, and blocked the build reporting the canonical mirror missing. The tree was
    // intact; only the root was wrong. Requiring both means an unrecognised layout falls back to ROOT,
    // where resolveMirrors() sees a chart tree and scans it as the canonical mirror.
    const twoUp = path.resolve(ROOT, '../..');
    const repoRoot = (fs.existsSync(path.join(twoUp, 'chart v 1.4/chart'))
        && fs.existsSync(path.join(twoUp, 'homepage/public/chart')))
        ? twoUp
        : ROOT;
    // Fail closed. A gate that is absent has not passed, and the whole reason it exists is that a
    // missing check is indistinguishable from a passing one once the artifact ships.
    if (!fs.existsSync(gate)) {
        console.error('[bump-chart-engine-build] Pre-cut integrity gate is MISSING at', gate);
        console.error('[bump-chart-engine-build] Refusing to cut: an absent gate has not passed.');
        process.exit(1);
    }
    const res = spawnSync(process.execPath, [gate, `--repo=${repoRoot}`], { stdio: 'inherit' });
    if (res.error) {
        console.error('[bump-chart-engine-build] Pre-cut integrity gate could not run:', res.error.message);
        process.exit(1);
    }
    if (res.status !== 0) {
        console.error(`[bump-chart-engine-build] Pre-cut integrity gate BLOCKED the cut (exit ${res.status}).`);
        console.error('[bump-chart-engine-build] The tree is not fit to build. Restore the affected files first.');
        process.exit(1);
    }
}

function main() {
    if (!fs.existsSync(CHART_JS)) {
        console.error('[bump-chart-engine-build] Missing chart.js');
        process.exit(1);
    }

    const before = fs.readFileSync(CHART_JS, 'utf8');
    const match = before.match(BUILD_RE);
    if (!match) {
        console.error('[bump-chart-engine-build] CHART_ENGINE_BUILD not found in chart.js');
        process.exit(1);
    }

    preCutIntegrityGate();

    if (DRY_RUN) console.log('[bump-chart-engine-build] --dry-run: no file will be written');

    const nextBuild = process.env.BUILD_ID?.trim() || incrementBuildId(match[1]);
    const after = before.replace(BUILD_RE, `const CHART_ENGINE_BUILD = '${nextBuild}';`);
    if (!DRY_RUN) fs.writeFileSync(CHART_JS, after, 'utf8');
    console.log('[bump-chart-engine-build] (1/2) CHART_ENGINE_BUILD:', match[1], '→', nextBuild);

    writeBuildInfo(nextBuild);
}

/**
 * PASSPORT-3 — the third coordinate.
 *
 * The badge is a deploy parameter and the digest is a property of the served bytes. Neither names the
 * source that produced them, so two entirely different trees can deploy under adjacent badges and the
 * passport cannot tell them apart. `SOURCE_COMMIT_SHA` already exists as a build ARG, is already
 * validated as full 40-hex by the checkpoint asserter, and already lands as an OCI image label — but a
 * label needs `docker inspect`, and the soak harness reads the product over HTTP from a browser. So the
 * one thing missing is carrying the SHA into a served artefact.
 *
 * Emitted here rather than into chart.js because chart.js is A's single-writer spine and denied to B,
 * and because a standalone JSON is what a harness actually wants: no HTML parsing, no regex over a
 * bundle, one fetch.
 *
 * Fails the build rather than emitting a null. Under CHECKPOINT_BUILD the asserter has already refused
 * an invalid SHA before we get here; this is the second lock, on the artefact rather than the inputs,
 * because a passport carrying `sourceCommitSha: null` is worse than no passport — it looks like an
 * answer.
 */
function writeBuildInfo(buildId) {
    const sha = (process.env.SOURCE_COMMIT_SHA || '').trim().toLowerCase();
    const strict = String(process.env.CHECKPOINT_BUILD || '').trim() === '1';

    if (strict && !SOURCE_SHA_RE.test(sha)) {
        console.error('[bump-chart-engine-build] CHECKPOINT_BUILD=1 requires SOURCE_COMMIT_SHA as full'
            + ` 40-character hex; got ${sha ? `"${sha}"` : '(empty)'}.`);
        console.error('[bump-chart-engine-build] Refusing to emit build-info.json with an unknown source.');
        process.exit(1);
    }

    const info = {
        signature: 'TALARIA_BUILD_INFO_V1',
        buildId,
        sourceCommitSha: SOURCE_SHA_RE.test(sha) ? sha : null,
        checkpointBuild: strict,
        builtAt: new Date().toISOString(),
    };
    if (!DRY_RUN) fs.writeFileSync(BUILD_INFO, `${JSON.stringify(info, null, 2)}\n`, 'utf8');
    console.log('[bump-chart-engine-build] (2/2) build-info.json:', info.buildId, info.sourceCommitSha || '(no sha - non-checkpoint build)');
    if (DRY_RUN) console.log(JSON.stringify(info, null, 2));
}

main();
