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
