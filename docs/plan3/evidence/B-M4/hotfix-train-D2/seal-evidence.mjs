#!/usr/bin/env node
/**
 * EVID-01 seal for the D-2 hotfix train.
 *
 *   node seal-evidence.mjs seal          # write MANIFEST.json + SHA256SUMS, once
 *   node seal-evidence.mjs verify        # re-hash and compare; non-zero on drift
 *   node seal-evidence.mjs record-build --build-id=X --chart-digest=Y --homepage-digest=Z
 *
 * EVID-01: "a test may not write the evidence file that certifies it." This tool is
 * the only writer, it is never invoked by a test, and every write refuses to
 * overwrite an existing file. To re-seal you must delete the seal by hand, which is
 * a deliberate act that shows up in review — unlike a test that silently re-pins its
 * own evidence on every run, which is the failure this rule exists to prevent.
 *
 * All hashing is byte-level. Twice today a text-mode read/write silently converted
 * LF to CRLF and a `read() === original` check passed straight through it, because
 * the read translated the corruption back. Nothing here opens a file as text.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Ask git rather than counting '..' segments — an off-by-one here silently
// resolves every path to the wrong tree, which is how the first draft of this
// tool failed its own refusal test.
const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: HERE, encoding: 'utf8',
}).trim();

/** Source files this train actually ships. Hashes pin exactly what was reviewed. */
const PRODUCT = [
    'chart v 1.4/chart/modules/order-manager.js',
    'chart v 1.4/chart/api_server.py',
];

/** Acceptance + evidence that must not drift after sealing. */
const EVIDENCE = [
    'chart v 1.4/chart/modules/b-w16-hydration-guard.test.mjs',
    'chart v 1.4/chart/modules/b-w16-hydration-guard.mutants.mjs',
    'chart v 1.4/chart/modules/b-w18-killswitch.mutants.mjs',
    'chart v 1.4/chart/tests/test_b_w17_journal_sweep_guard.py',
    'docs/plan3/evidence/B-M4/hotfix-train-D2/DEPLOY-NOTE.md',
    'docs/plan3/evidence/B-M4/hotfix-train-D2/PO-VERIFICATION.md',
];

const MANIFEST = path.join(HERE, 'MANIFEST.json');
const SUMS = path.join(HERE, 'SHA256SUMS');
const BUILD_RECORD = path.join(HERE, 'BUILD-RECORD.json');

const sha256 = (abs) => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

function eol(abs) {
    const b = fs.readFileSync(abs);
    let crlf = 0;
    for (let i = 0; i < b.length - 1; i++) if (b[i] === 13 && b[i + 1] === 10) crlf++;
    return crlf;
}

function hashAll() {
    const out = {};
    for (const rel of [...PRODUCT, ...EVIDENCE]) {
        const abs = path.join(REPO, rel);
        if (!fs.existsSync(abs)) throw new Error(`missing file, cannot seal: ${rel}`);
        out[rel] = { sha256: sha256(abs), bytes: fs.statSync(abs).size, crlfPairs: eol(abs) };
    }
    return out;
}

const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();

function refuseIfPresent(file) {
    if (fs.existsSync(file)) {
        console.error(`REFUSED: ${path.basename(file)} already exists.`);
        console.error('EVID-01: a seal is written once and is immutable thereafter.');
        console.error('Delete it by hand if you genuinely intend to re-seal.');
        process.exit(2);
    }
}

const cmd = process.argv[2];

if (cmd === 'seal') {
    refuseIfPresent(MANIFEST);
    refuseIfPresent(SUMS);

    // `git status --porcelain` is NOT sufficient here: docs/ is gitignored in this
    // tree, so the very evidence files being sealed are invisible to it and the
    // check passes for the wrong reason. Assert the real property instead — every
    // sealed file is tracked AND identical to what is committed at HEAD.
    const unsealable = [];
    for (const rel of [...PRODUCT, ...EVIDENCE]) {
        try {
            git('ls-files', '--error-unmatch', '--', rel);
        } catch {
            unsealable.push(`${rel} — not tracked by git`);
            continue;
        }
        const committed = execFileSync('git', ['show', `HEAD:${rel}`], {
            cwd: REPO, maxBuffer: 1 << 28,
        });
        const onDisk = fs.readFileSync(path.join(REPO, rel));
        if (!committed.equals(onDisk)) unsealable.push(`${rel} — differs from HEAD`);
    }
    if (unsealable.length) {
        console.error('REFUSED: a seal must pin a committed tree.');
        for (const u of unsealable) console.error(`  ${u}`);
        process.exit(3);
    }

    const files = hashAll();
    const manifest = {
        train: 'D-2 standalone hotfix — trade-loss guards',
        incident: 'INCIDENT-TRADE-LOSS-PUBLIC-20260728.md',
        sealedAtUtc: new Date().toISOString(),
        sealedBy: 'Manager B',
        sourceCommitSha: git('rev-parse', 'HEAD'),
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        commits: git('log', '--format=%H %s', '2521a7484~1..HEAD').split('\n'),
        chartEngineBuildInSource: (() => {
            const js = fs.readFileSync(path.join(REPO, 'chart v 1.4/chart/chart.js'));
            const m = /const CHART_ENGINE_BUILD = '([^']+)'/.exec(js.toString('utf8'));
            return m ? m[1] : null;
        })(),
        buildId: null,
        buildIdNote:
            'null by design: the shipped build id does not exist until the image is '
            + 'built. homepage/Dockerfile stamps it only under CHECKPOINT_BUILD=1. '
            + 'Record it in BUILD-RECORD.json via `record-build` after the build.',
        killSwitches: {
            client: {
                name: 'window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1',
                defaultWhenUnset: 'guard ON',
            },
            backend: {
                name: 'JOURNAL_SWEEP_PARSE_GUARD_ENABLED',
                defaultWhenUnset: 'guard ON (true)',
            },
            deletionLogging: 'no kill-switch by design',
        },
        files,
    };

    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    const sums = Object.entries(files).map(([rel, v]) => `${v.sha256}  ${rel}`).join('\n');
    fs.writeFileSync(SUMS, `${sums}\n`);
    fs.writeFileSync(MANIFEST, fs.readFileSync(MANIFEST)); // byte round-trip, no text mode

    console.log(`SEALED at ${manifest.sourceCommitSha}`);
    for (const [rel, v] of Object.entries(files)) {
        console.log(`  ${v.sha256.slice(0, 16)}  crlf=${v.crlfPairs}  ${rel}`);
    }
    process.exit(0);
}

if (cmd === 'verify') {
    if (!fs.existsSync(MANIFEST)) { console.error('no MANIFEST.json to verify'); process.exit(2); }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    let bad = 0;
    for (const [rel, rec] of Object.entries(manifest.files)) {
        const abs = path.join(REPO, rel);
        if (!fs.existsSync(abs)) { console.error(`MISSING  ${rel}`); bad++; continue; }
        const now = sha256(abs);
        if (now !== rec.sha256) {
            console.error(`DRIFTED  ${rel}\n  sealed ${rec.sha256}\n  now    ${now}`);
            bad++;
        } else {
            console.log(`ok  ${rel}`);
        }
    }
    const head = git('rev-parse', 'HEAD');
    if (head !== manifest.sourceCommitSha) {
        console.error(`NOTE: HEAD ${head} != sealed ${manifest.sourceCommitSha}`);
    }
    console.log(bad ? `\nFAIL: ${bad} file(s) drifted from the seal` : '\nOK: all sealed files match');
    process.exit(bad ? 1 : 0);
}

if (cmd === 'record-build') {
    refuseIfPresent(BUILD_RECORD);
    const arg = (k) => {
        const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
        return hit ? hit.slice(k.length + 3) : null;
    };
    const buildId = arg('build-id');
    if (!buildId) {
        console.error('record-build requires --build-id=<id> (DEPLOY-01).');
        console.error('If the build produced no id, the build is not shippable — that is the point of DEPLOY-01.');
        process.exit(2);
    }
    const rec = {
        recordedAtUtc: new Date().toISOString(),
        buildId,
        sourceCommitSha: fs.existsSync(MANIFEST)
            ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).sourceCommitSha
            : git('rev-parse', 'HEAD'),
        tradingChartImageDigest: arg('chart-digest'),
        homepageImageDigest: arg('homepage-digest'),
        note: 'DEPLOY-01: written once, immutable. Also recorded in journal/MANAGER-B.md.',
    };
    fs.writeFileSync(BUILD_RECORD, `${JSON.stringify(rec, null, 2)}\n`);
    console.log(`BUILD RECORDED: ${buildId} @ ${rec.sourceCommitSha}`);
    process.exit(0);
}

console.error('usage: seal-evidence.mjs seal | verify | record-build --build-id=X');
process.exit(64);
