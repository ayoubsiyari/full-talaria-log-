/**
 * dashboard-sync-mutants.mjs — do the LAG-2 cells actually bite?
 *
 * Each mutant is a plausible wrong version of the dashboard-sync coalescer. A survivor means the
 * oracle would have let that version ship. Run: node scripts/sr04/dashboard-sync-mutants.mjs
 *
 * The gate cell in the suite reads its pre-change bytes from git, so mutating the working tree
 * cannot accidentally green it by moving the baseline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = 'chart v 1.4/chart/modules/replay-dashboard-sync.js';
const MIRROR_REL = 'homepage/public/chart/modules/replay-dashboard-sync.js';
const TEST = 'scripts/sr04/dashboard-sync-coalesce.test.mjs';

const FLAG_READER = `    function coalesceDisabled() {
        var read = window._talariaDisableFlagTruthy;
        if (typeof read !== 'function') return false;
        try {
            return !!read('__TALARIA_DASHBOARD_SYNC_COALESCE_V1');
        } catch (_e) {
            return false;
        }
    }`;

const DELIVER = `    function deliver() {
        frameHandle = null;
        if (!writePending) return;
        writePending = false;
        var det = pendingDetail;
        pendingDetail = null;
        var chart = targetChart();
        if (chart) chart._onReplayVirtualTimeForDashboard(det);
    }`;

const ENQUEUE = `            pendingDetail = det;
            writePending = true;
            deadlineAt = Date.now() + DEBOUNCE_MS;
            if (deadlineTimer === null) {
                deadlineTimer = setTimeout(onDeadline, DEBOUNCE_MS);
            }`;

const LEGACY_LISTENER = `(function () {
    if (typeof window === 'undefined') return;
    var timer = null;
    window.addEventListener(
        'replayVirtualTimeChanged',
        function (ev) {
            var chart = window.chart;
            if (!chart || typeof chart._onReplayVirtualTimeForDashboard !== 'function') return;
            var det = ev && ev.detail ? ev.detail : {};
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                chart._onReplayVirtualTimeForDashboard(det);
            }, 1200);
        },
        false
    );
})();
`;

const MUTANTS = [
    {
        id: 'M1',
        why: 'never fixed — the pre-change per-tick clearTimeout re-arm',
        fullFile: LEGACY_LISTENER,
    },
    {
        id: 'M2',
        why: 'flag polarity inverted — the kill-switch turns the coalescer ON instead of off',
        find: FLAG_READER,
        body: `    function coalesceDisabled() {
        var read = window._talariaDisableFlagTruthy;
        if (typeof read !== 'function') return false;
        try {
            return !read('__TALARIA_DASHBOARD_SYNC_COALESCE_V1');
        } catch (_e) {
            return false;
        }
    }`,
    },
    {
        id: 'M3',
        why: 'strict === true on the switch, so 1 / "yes" silently fail to disable',
        find: FLAG_READER,
        body: `    function coalesceDisabled() {
        return window.__TALARIA_DASHBOARD_SYNC_COALESCE_V1 === true;
    }`,
    },
    {
        id: 'M4',
        why: 'own-window read — a switch set on the host never reaches the panel realm',
        find: FLAG_READER,
        body: `    function coalesceDisabled() {
        return !!window.__TALARIA_DASHBOARD_SYNC_COALESCE_V1;
    }`,
    },
    {
        id: 'M5',
        why: 'switch sampled once at init instead of read per call',
        find: FLAG_READER,
        body: `    var sampledDisabled = null;
    function coalesceDisabled() {
        if (sampledDisabled === null) {
            var read = window._talariaDisableFlagTruthy;
            sampledDisabled = typeof read === 'function'
                && !!read('__TALARIA_DASHBOARD_SYNC_COALESCE_V1');
        }
        return sampledDisabled;
    }`,
    },
    {
        id: 'M6',
        why: 'coalescer DROPS the final write — deadline extended past delivery, nothing ever lands',
        find: DELIVER,
        body: `    function deliver() {
        frameHandle = null;
        if (!writePending) return;
        writePending = false;
        var det = pendingDetail;
        pendingDetail = null;
        if (deadlineAt > Date.now() - DEBOUNCE_MS) return;
        var chart = targetChart();
        if (chart) chart._onReplayVirtualTimeForDashboard(det);
    }`,
    },
    {
        id: 'M7',
        why: 'pending flag gates the ENQUEUE, so the burst delivers its FIRST detail — stale time forever',
        find: ENQUEUE,
        body: `            if (writePending) return;
            pendingDetail = det;
            writePending = true;
            deadlineAt = Date.now() + DEBOUNCE_MS;
            if (deadlineTimer === null) {
                deadlineTimer = setTimeout(onDeadline, DEBOUNCE_MS);
            }`,
    },
    {
        id: 'M8',
        why: 'looks coalesced but still re-arms through clearTimeout every tick',
        find: ENQUEUE,
        body: `            pendingDetail = det;
            writePending = true;
            deadlineAt = Date.now() + DEBOUNCE_MS;
            if (deadlineTimer !== null) clearTimeout(deadlineTimer);
            deadlineTimer = setTimeout(onDeadline, DEBOUNCE_MS);`,
    },
    {
        id: 'M9',
        why: 'kill-switch arm is a dead branch — disabling the fix disables the feature',
        find: `            if (coalesceDisabled()) {
                if (legacyTimer) clearTimeout(legacyTimer);
                legacyTimer = setTimeout(function () {
                    legacyTimer = null;
                    chart._onReplayVirtualTimeForDashboard(det);
                }, DEBOUNCE_MS);
                return;
            }`,
        body: `            if (coalesceDisabled()) return;`,
    },
];

const abs = path.join(REPO, REL);
const absMirror = path.join(REPO, MIRROR_REL);
const original = fs.readFileSync(abs, 'utf8');
const originalMirror = fs.readFileSync(absMirror, 'utf8');

for (const m of MUTANTS) {
    if (m.fullFile) continue;
    if (!original.includes(m.find)) {
        console.error(`FATAL: ${m.id} anchor not found verbatim — mutants cannot be applied.`);
        process.exit(2);
    }
}

let killed = 0;
const survivors = [];

console.log('Mutating the dashboard-sync coalescer; the LAG-2 oracle should kill each.\n');

for (const m of MUTANTS) {
    const mutated = m.fullFile ? m.fullFile : original.replace(m.find, m.body);
    if (mutated === original) {
        console.log(`  ${m.id}  SKIPPED (no-op substitution)`);
        continue;
    }
    fs.writeFileSync(abs, mutated);
    fs.writeFileSync(absMirror, mutated);   // keep mirrors equal so R14 is not the only killer
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
        console.log(`  ${m.id}  killed by ${failing.join(', ') || '(suite error)'}`);
        console.log(`        ${m.why}`);
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
