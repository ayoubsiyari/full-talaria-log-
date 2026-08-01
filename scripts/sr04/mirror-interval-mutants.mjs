/**
 * mirror-interval-mutants.mjs — do the HYG-2 cells actually bite?
 *
 * Each mutant is a plausible wrong version of the stacked-timer guard. A surviving mutant means the
 * oracle would have let that version ship. Both mirrors are mutated together so that byte-identity
 * (R12) is never the only killer. Source is restored after every mutant.
 *
 * Run: node scripts/sr04/mirror-interval-mutants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = 'chart v 1.4/chart/modules/replay-system.js';
const MIRROR_REL = 'homepage/public/chart/modules/replay-system.js';
const TEST = 'scripts/sr04/mirror-interval-guard.test.mjs';

const INSTALLER = `    _installManagedTimer(key, kind, fn, ms) {
        const install = () => (kind === 'interval' ? setInterval(fn, ms) : setTimeout(fn, ms));
        if (_mirrorIntervalGuardDisabled()) return install();
        let clearError = null;
        try {
            this._clearManagedTimer(key);
        } catch (error) {
            clearError = error;
        }
        const handle = install();
        this._managedTimerLedger()[key] = { kind, handle };
        if (clearError) {
            console.warn('⚠️ Managed timer clear failed for', key, clearError);
        }
        return handle;
    }`;

const REALIGN_CLEAR = `            this._clearManagedTimer('enterReplayRealign');`;
const REALIGN_INSTALL = `                this._setManagedTimeout(
                    'enterReplayRealign',`;

const MUTANTS = [
    {
        id: 'M1',
        why: 'clear-but-never-reinstall — one live timer, and the product silently stops working',
        edits: [[INSTALLER, `    _installManagedTimer(key, kind, fn, ms) {
        const install = () => (kind === 'interval' ? setInterval(fn, ms) : setTimeout(fn, ms));
        if (_mirrorIntervalGuardDisabled()) return install();
        if (this._managedTimers && this._managedTimers[key]) {
            this._clearManagedTimer(key);
            return null;
        }
        const handle = install();
        this._managedTimerLedger()[key] = { kind, handle };
        return handle;
    }`]],
    },
    {
        id: 'M2',
        why: 'reinstall-but-never-clear — records the handle but leaves the old timer running',
        edits: [[INSTALLER, `    _installManagedTimer(key, kind, fn, ms) {
        const install = () => (kind === 'interval' ? setInterval(fn, ms) : setTimeout(fn, ms));
        if (_mirrorIntervalGuardDisabled()) return install();
        const handle = install();
        this._managedTimerLedger()[key] = { kind, handle };
        return handle;
    }`]],
    },
    {
        id: 'M3',
        why: 'inverted flag polarity — the kill-switch turns the guard ON instead of off',
        edits: [[
            '        if (_mirrorIntervalGuardDisabled()) return install();',
            '        if (!_mirrorIntervalGuardDisabled()) return install();',
        ]],
    },
    {
        id: 'M4',
        why: 'strict === true on the switch, so 1 / "yes" silently fail to disable, and a '
            + 'host-page flag never reaches the panel realm',
        edits: [[
            '        if (_mirrorIntervalGuardDisabled()) return install();',
            `        if (typeof window !== 'undefined'
            && window.__TALARIA_MIRROR_INTERVAL_GUARD_V1 === true) {
            return install();
        }`,
        ]],
    },
    {
        id: 'M5',
        why: 'guard keyed on the wrong field — the realign chain and the follow poll share one '
            + 'key, so two different timers clobber each other',
        edits: [
            [REALIGN_CLEAR, `            this._clearManagedTimer('followBtnPoll');`],
            [REALIGN_INSTALL, `                this._setManagedTimeout(
                    'followBtnPoll',`],
        ],
    },
];

const abs = path.join(REPO, ...REL.split('/'));
const absMirror = path.join(REPO, ...MIRROR_REL.split('/'));
const original = fs.readFileSync(abs, 'utf8');
const originalMirror = fs.readFileSync(absMirror, 'utf8');

if (original !== originalMirror) {
    console.error('FATAL: the two mirrors differ before mutation — fix that first.');
    process.exit(2);
}
for (const m of MUTANTS) {
    for (const [find] of m.edits) {
        if (!original.includes(find)) {
            console.error(`FATAL: ${m.id} anchor not found verbatim:\n${find}`);
            process.exit(2);
        }
    }
}

let killed = 0;
const survivors = [];

console.log('Mutating the HYG-2 stacked-timer guard; the oracle should kill each.\n');

for (const m of MUTANTS) {
    let mutated = original;
    for (const [find, replace] of m.edits) mutated = mutated.replace(find, replace);
    if (mutated === original) {
        console.log(`  ${m.id}  SKIPPED (no-op substitution)`);
        continue;
    }
    fs.writeFileSync(abs, mutated);
    fs.writeFileSync(absMirror, mutated);
    let out = '';
    let ok = true;
    try {
        out = execFileSync(process.execPath, ['--test', TEST],
            { cwd: REPO, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 1024 * 64 });
    } catch (e) {
        ok = false;
        out = `${e.stdout || ''}${e.stderr || ''}`;
    }
    const failing = [...out.matchAll(/✖ (R\d+)/g)].map((x) => x[1]);
    if (ok) {
        survivors.push(m);
        console.log(`  ${m.id}  SURVIVED  <-- ${m.why}`);
    } else {
        killed++;
        console.log(`  ${m.id}  killed by ${failing.join(', ') || '(suite error)'}\n        ${m.why}`);
    }
    fs.writeFileSync(abs, original);
    fs.writeFileSync(absMirror, originalMirror);
}

const restored = fs.readFileSync(abs, 'utf8') === original
    && fs.readFileSync(absMirror, 'utf8') === originalMirror;
console.log(`\n${killed}/${MUTANTS.length} killed; source restored: ${restored ? 'yes' : 'NO — CHECK GIT'}`);
if (survivors.length) {
    console.log('\nSurvivors mean the oracle would have shipped these:');
    for (const s of survivors) console.log(`  ${s.id}: ${s.why}`);
}
process.exit(survivors.length || !restored ? 1 : 0);
