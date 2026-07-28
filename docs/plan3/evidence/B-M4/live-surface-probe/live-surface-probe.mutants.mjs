/**
 * Mutation + VER-04 for live-surface-probe.
 *
 * The claim under test is that the three-state contract is load-bearing rather than
 * decorative. Mutant 1 is the one that matters: an identity check that always says
 * "yes" turns the HTML-fallback case into ABSENT, which is the false incident this
 * tool exists to prevent.
 *
 * All file I/O goes through Buffer. Every mutant is restored in a finally and the
 * restoration is verified by SHA-256 before the run is allowed to report.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'live-surface-probe.mjs');
const TEST = path.join(HERE, 'live-surface-probe.test.mjs');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const original = fs.readFileSync(SRC);
const originalSha = sha(original);

function runSuite() {
    try {
        execFileSync('node', ['--test', TEST], { cwd: HERE, stdio: 'pipe' });
        return { pass: true, failing: [] };
    } catch (e) {
        const out = String(e.stdout || '') + String(e.stderr || '');
        return { pass: false, failing: [...out.matchAll(/^✖ (cell [^(]+)/gm)].map((m) => m[1].trim()) };
    }
}

function applyMutant({ find, replace }) {
    const src = original.toString('utf8');
    if (!src.includes(find)) throw new Error(`ANCHOR MISSING: ${find.slice(0, 70)}`);
    const mutated = src.replace(find, replace);
    if (mutated === src) throw new Error(`MUTANT NOT APPLIED: ${find.slice(0, 70)}`);
    fs.writeFileSync(SRC, Buffer.from(mutated, 'utf8'));
}

const MUTANTS = [
    {
        name: 'identity always succeeds — an HTML fallback is reported as the module',
        find: 'function establishModuleIdentity(res) {',
        replace: 'function establishModuleIdentity(res) {\n    return { identified: true };',
    },
    {
        name: 'identity always fails — nothing can ever be determined',
        find: '    return { identified: true };\n}\n\nasync function probeModule',
        replace: '    return { identified: false, reason: "x" };\n}\n\nasync function probeModule',
    },
    {
        name: 'UNDETERMINED collapsed into ABSENT on the module probe',
        find: "            : { state: UNDETERMINED, reason: identity.reason };",
        replace: "            : { state: ABSENT, reason: identity.reason };",
    },
    {
        name: 'the HTML-body check is dropped, so a login page is treated as JS',
        find: '    if (looksLikeHtml(res.contentType, res.body)) {\n        return {\n            identified: false,',
        replace: '    if (false && looksLikeHtml(res.contentType, res.body)) {\n        return {\n            identified: false,',
    },
    {
        name: 'summarise treats UNDETERMINED as a pass',
        find: '    if (states.includes(UNDETERMINED)) {\n        return { verdict: UNDETERMINED, exitCode: 3, deployGate: false, stampInert, incoherent };\n    }',
        replace: '    if (false) {\n        return { verdict: UNDETERMINED, exitCode: 3, deployGate: false, stampInert, incoherent };\n    }',
    },
    {
        name: 'an unauthenticated 401 on the session endpoint is reported ABSENT',
        find: "        finding.reachable = true;\n        return finding;\n    }\n    if (res.status !== 200) {",
        replace: "        finding.reachable = true;\n        finding.state = ABSENT;\n        return finding;\n    }\n    if (res.status !== 200) {",
    },
    {
        name: 'read-only enforcement removed',
        find: "    if (method !== 'GET' && method !== 'HEAD') {",
        replace: '    if (false) {',
    },
    {
        name: 'redaction disabled — the credential reaches the output',
        find: '    if (token) v = v.split(token).join(\'«redacted»\');',
        replace: '    if (false) v = v.split(token).join(\'«redacted»\');',
    },
    {
        name: 'the size floor is removed, so a stub reply is identified as the module',
        find: '    if (res.bytes < MIN_PLAUSIBLE_MODULE_BYTES) {',
        replace: '    if (false) {',
    },
    {
        name: 'inert-stamp check dropped — identical ?v= bodies never flagged',
        find: '    const identical = ok200[0].sha256 === ok200[1].sha256;',
        replace: '    const identical = false;',
    },
];

const results = [];
try {
    const baseline = runSuite();
    if (!baseline.pass) {
        console.error('ABORT: the suite does not pass before mutation.');
        console.error(baseline.failing.join('\n'));
        process.exit(3);
    }
    console.log('baseline: suite passes\n');

    for (const [i, m] of MUTANTS.entries()) {
        try {
            applyMutant(m);
            const r = runSuite();
            results.push({ n: i + 1, name: m.name, died: !r.pass, killers: r.failing });
        } finally {
            fs.writeFileSync(SRC, original);
        }
        const r = results.at(-1);
        console.log(`MUTANT ${r.n} — ${r.died ? 'DIED' : '*** SURVIVED ***'} — ${r.name}`);
        if (r.died) console.log(`    killed by: ${r.killers.join(', ') || '(unnamed)'}`);
    }

    const survived = results.filter((r) => !r.died).length;
    console.log(`\n${MUTANTS.length} designed / ${survived} survived`);

    // VER-04 half (a): a no-op stub must die.
    console.log('\n=== VER-04 ===');
    try {
        applyMutant({
            find: 'function establishModuleIdentity(res) {',
            replace: 'function establishModuleIdentity(res) {\n    return { identified: true };',
        });
        applyMutant2();
        const r = runSuite();
        console.log(`no-op stub (identity + tri-state removed): ${r.pass ? '*** SURVIVED ***' : 'DIES'} (as required)`);
    } finally {
        fs.writeFileSync(SRC, original);
    }

    // VER-04 half (b): an independent reimplementation of the two decision functions
    // must pass. Written from the contract rather than from the code — deliberately a
    // different shape: a list of disqualifying predicates evaluated in order instead
    // of a chain of early returns, and a precedence table instead of nested ifs.
    // VER-06 is the reason this is worth running: if the acceptance only accepts my
    // own shape, it is a description of this file rather than a specification.
    try {
        const src = original.toString('utf8');
        const identityStart = src.indexOf('function establishModuleIdentity(res) {');
        const identityEnd = src.indexOf('\nasync function probeModule');
        const reimplIdentity = `function establishModuleIdentity(res) {
    const disqualifiers = [
        [() => !res.ok, () => \`transport: \${res.transportError}\`],
        [() => res.status >= 300, () => \`HTTP \${res.status}\`],
        [() => looksLikeHtml(res.contentType, res.body), () => 'body is markup, not the module'],
        [() => res.bytes < MIN_PLAUSIBLE_MODULE_BYTES, () => \`only \${res.bytes} bytes\`],
        [() => !MODULE_IDENTITY_ANCHORS.every((a) => res.body.includes(a)),
            () => \`anchors absent: \${MODULE_IDENTITY_ANCHORS.filter((a) => !res.body.includes(a)).join()}\`],
    ];
    for (const [fails, why] of disqualifiers) {
        if (fails()) return { identified: false, reason: why() };
    }
    return { identified: true };
}
`;
        const summariseStart = src.indexOf('function summarise(findings, opts = {}) {');
        const summariseEnd = src.indexOf('\nfunction render(report)');
        // Contract-shaped reimpl: precedence table + deploy-gate hazards, not a copy of the chain.
        const reimplSummarise = `function summarise(findings, opts = {}) {
    const markerStates = [];
    const sessionStates = [];
    let stampInert = null;
    let stampInertChecked = false;
    let stampInertWaived = Boolean(opts.waiveStampInert);
    let buildId = null;
    for (const f of findings) {
        if (f.kind === 'module') Object.values(f.markers).forEach((m) => markerStates.push(m.state));
        else if (f.kind === 'session-endpoint') sessionStates.push(f.state);
        else if (f.kind === 'build-id') buildId = f;
        else if (f.kind === 'stamp-inert') {
            stampInertChecked = true;
            stampInert = f.stampInert;
            stampInertWaived = stampInertWaived || Boolean(f.waived);
        }
    }
    const deployGate = Boolean(opts.deployGate);
    const incoherent = Boolean(buildId && buildId.presentShellCount >= 1 && buildId.coherent === false);
    const noPresentShell = Boolean(buildId && buildId.perShell.length && buildId.presentShellCount === 0);
    const inertHazard = stampInertChecked && stampInert === true && !stampInertWaived;
    const inertUndetermined = stampInertChecked && stampInert === null;
    const base = { deployGate, stampInert, incoherent };
    if (markerStates.includes(ABSENT) || sessionStates.includes(ABSENT)) {
        return { ...base, verdict: ABSENT, exitCode: 1, deployHazards: [] };
    }
    if (deployGate) {
        const hazards = [];
        if (inertHazard) hazards.push('stampInert');
        if (incoherent) hazards.push('incoherentShells');
        if (markerStates.includes(UNDETERMINED) || sessionStates.includes(UNDETERMINED)
            || inertUndetermined || noPresentShell) {
            return { ...base, verdict: UNDETERMINED, exitCode: 3, deployHazards: hazards };
        }
        if (hazards.length) {
            return { ...base, verdict: UNDETERMINED, exitCode: 2, deployHazards: hazards,
                reason: 'deploy-gate hazard' };
        }
        return { ...base, verdict: PRESENT, exitCode: 0, deployHazards: [],
            stampInert: stampInertChecked ? stampInert : null, incoherent: false };
    }
    const seen = new Set([...markerStates, ...sessionStates]);
    if (buildId && buildId.perShell.length) {
        const judged = buildId.perShell.filter((s) => !s.ignoredForCoherence);
        if (judged.length) {
            seen.add(judged.every((s) => s.state === PRESENT) && !incoherent ? PRESENT : UNDETERMINED);
        }
    }
    if (inertHazard || inertUndetermined) seen.add(UNDETERMINED);
    for (const [verdict, exitCode] of [[ABSENT, 1], [UNDETERMINED, 3], [PRESENT, 0]]) {
        if (seen.has(verdict)) return { ...base, verdict, exitCode };
    }
    return { ...base, verdict: PRESENT, exitCode: 0 };
}
`;
        const rebuilt = src.slice(0, identityStart) + reimplIdentity + src.slice(identityEnd);
        const s2 = rebuilt.indexOf('function summarise(findings, opts = {}) {');
        const e2 = rebuilt.indexOf('\nfunction render(report)');
        if (identityStart < 0 || identityEnd < 0 || summariseStart < 0 || summariseEnd < 0 || s2 < 0 || e2 < 0) {
            throw new Error('VER-04 half (b): could not locate both functions to replace');
        }
        const final = rebuilt.slice(0, s2) + reimplSummarise + rebuilt.slice(e2);
        fs.writeFileSync(SRC, Buffer.from(final, 'utf8'));
        const r = runSuite();
        console.log(`independent reimplementation: ${r.pass ? 'PASSES' : '*** FAILS ***'} (as required)`);
        if (!r.pass) console.log(`    failing: ${r.failing.join(', ')}`);
    } finally {
        fs.writeFileSync(SRC, original);
    }
} finally {
    fs.writeFileSync(SRC, original);
    const restored = fs.readFileSync(SRC);
    const ok = sha(restored) === originalSha;
    const crlf = restored.toString('latin1').split('\r\n').length - 1;
    console.log(`\nrestore byte-identical: ${ok}   CRLF in restored source: ${crlf}`);
    if (!ok) process.exitCode = 3;
}

function applyMutant2() {
    const src = fs.readFileSync(SRC, 'utf8');
    const find = "            : { state: UNDETERMINED, reason: identity.reason };";
    if (!src.includes(find)) throw new Error('ANCHOR MISSING for stub half 2');
    fs.writeFileSync(SRC, Buffer.from(src.replace(find, "            : { state: ABSENT, reason: identity.reason };"), 'utf8'));
}
