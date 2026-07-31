/**
 * teardown-mutants.mjs — defects applied to BOTH shipped copies on disk, killed by named cells.
 * A teardown suite is especially prone to passing on a no-op, so each mutant breaks release in a
 * different way and must die to a cell that dispatches an event rather than one that reads source.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COPIES = [
    path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'order-manager.js'),
    path.join(REPO, 'homepage', 'public', 'chart', 'modules', 'order-manager.js')
];
const SUITE = path.join('scripts', 'sr04', 'order-manager-teardown.test.mjs');

const MUTANTS = [
    {
        id: 'M1', what: 'destroy() drops the registry without removing anything (looks torn down, is not)',
        needle: `                rec.target.removeEventListener(rec.type, rec.handler, rec.options);`,
        replace: `                void rec;`
    },
    {
        id: 'M2', what: 'kill-switch uses === true, so truthy values fail to disable',
        needle: `        if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_MANAGER_TEARDOWN_V1) return;`,
        replace: `        if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_MANAGER_TEARDOWN_V1 === true) return;`
    },
    {
        id: 'M3', what: 'capture flag dropped on removal — the classic silent no-op teardown',
        needle: `                rec.target.removeEventListener(rec.type, rec.handler, rec.options);`,
        replace: `                rec.target.removeEventListener(rec.type, rec.handler);`
    },
    {
        id: 'M4', what: '_trackListener attaches but never records, so nothing is releasable',
        needle: `        this._managedListeners.push({ target, type, handler, options });`,
        replace: `        void options;`
    },
    {
        id: 'M5', what: 'observers dropped rather than disconnected',
        needle: `                if (typeof obs.disconnect === 'function') obs.disconnect();`,
        replace: `                void obs;`
    },
    {
        id: 'M6', what: 'destroy() replaces the journal teardown instead of composing with it',
        needle: `            if (typeof this._m20A1Teardown === 'function') this._m20A1Teardown();`,
        replace: `            void this;`
    },
    {
        id: 'M7', what: 'the dock listeners revert to untracked registration',
        needle: `        this._trackListener(window, 'resize', onReplayDockResize);`,
        replace: `        window.addEventListener('resize', onReplayDockResize);`
    },
    {
        id: 'NEG', what: 'negative control — needle that does not exist; MUST report NOT_APPLIED',
        needle: `        this._releaseAllManagedListeners();`,
        replace: `        void 0;`,
        expectNotApplied: true
    }
];

const baseline = COPIES.map((p) => fs.readFileSync(p, 'utf8'));
const baseHash = crypto.createHash('sha256').update(baseline.join('\0')).digest('hex').slice(0, 16);
const restore = () => COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i]));

function runSuite() {
    try {
        execFileSync('node', ['--test', SUITE], { cwd: REPO, encoding: 'utf8', stdio: 'pipe' });
        return { passed: true, out: '' };
    } catch (e) { return { passed: false, out: `${e.stdout || ''}${e.stderr || ''}` }; }
}

let bad = 0;
console.log(`baseline sha256:${baseHash}\n`);

for (const m of MUTANTS) {
    const counts = baseline.map((s) => s.split(m.needle).length - 1);
    if (counts.some((c) => c !== 1)) {
        if (!m.expectNotApplied) bad++;
        console.log(`${m.id}  NOT_APPLIED${m.expectNotApplied ? ' (expected)' : ' — MUTANT DID NOT RUN'}  counts=[${counts}]`);
        continue;
    }
    if (m.expectNotApplied) { bad++; console.log(`${m.id}  APPLIED BUT SHOULD NOT HAVE`); restore(); continue; }

    COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i].split(m.needle).join(m.replace)));
    const res = runSuite();
    restore();

    if (res.passed) { bad++; console.log(`${m.id}  SURVIVED  ${m.what}`); continue; }
    const cells = [...res.out.matchAll(/^✖ (.+?) \(/gm)].map((x) => x[1]);
    const behavioural = cells.filter((c) => !/byte-identical|routed through the registry/i.test(c));
    if (!behavioural.length) { bad++; console.log(`${m.id}  KILLED ONLY BY AN ANCHOR — ${cells.join(' | ')}`); }
    else console.log(`${m.id}  killed by: ${[...new Set(behavioural)].join(' | ')}`);
}

restore();
const after = crypto.createHash('sha256').update(COPIES.map((p) => fs.readFileSync(p, 'utf8')).join('\0')).digest('hex').slice(0, 16);
console.log(`\nrestored sha256:${after}  ${after === baseHash ? 'MATCHES BASELINE' : 'RESTORE FAILED'}`);
if (after !== baseHash) bad++;
console.log(bad === 0 ? '\nALL MUTANTS ACCOUNTED FOR' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);
