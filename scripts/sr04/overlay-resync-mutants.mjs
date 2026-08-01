/**
 * overlay-resync-mutants.mjs  —  roster row LAG-1b
 *
 * Applies plausible wrong versions of the render-path overlay-resync gate to BOTH shipped
 * copies of chart.js, runs the cell suite, and reports which NAMED cell killed each one.
 * A mutant whose only killer is a source-text assertion is a failure of the suite, not a
 * pass, so anchor cells are excluded from the verdict. Every needle must match exactly
 * once in each copy or the runner reports NOT_APPLIED rather than mutating a random site.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COPIES = [
    path.join(REPO, 'chart v 1.4', 'chart', 'chart.js'),
    path.join(REPO, 'homepage', 'public', 'chart', 'chart.js'),
];
const SUITE = path.join('scripts', 'sr04', 'overlay-resync-dirty.test.mjs');

const FLAG_READ = "        if (_talariaDisableFlagTruthy('__TALARIA_OVERLAY_RESYNC_DIRTY_V1')) return null;";

const MUTANTS = [
    {
        id: 'M1',
        what: 'inverted flag polarity — the switch turns the fix ON instead of off',
        needle: FLAG_READ,
        replace: "        if (!_talariaDisableFlagTruthy('__TALARIA_OVERLAY_RESYNC_DIRTY_V1')) return null;",
    },
    {
        id: 'M2',
        what: 'strict === true read, so 1 / "yes" set by an operator silently fail to disable',
        needle: FLAG_READ,
        replace: "        if (typeof window !== 'undefined' && window.__TALARIA_OVERLAY_RESYNC_DIRTY_V1 === true) return null;",
    },
    {
        id: 'M3',
        what: 'indeterminate state SKIPS instead of calling — stale order lines on doubt',
        needle: [
            '                if (overlayResyncKey === null',
            '                    || overlayResyncKey !== this._overlayResyncDirtyKeyLast) {',
        ].join('\n'),
        replace: '                if (overlayResyncKey !== this._overlayResyncDirtyKeyLast) {',
    },
    {
        id: 'M4',
        what: 'key omits offsetX — a horizontal pan looks idle',
        needle: '                this.offsetX,\n                this.w,\n',
        replace: '                this.w,\n',
    },
    {
        id: 'M5',
        what: 'key omits order-collection identity — a same-length rebuild looks idle',
        needle: 'key += `;${this._overlayCollectionToken(collection)}:${collection.length}`;',
        replace: 'key += `;${collection.length}`;',
    },
    {
        id: 'M6',
        what: 'key omits the visible bar range — scrolling one bar looks idle',
        needle: [
            '                visible.length,',
            '                first ? first.t : 0,',
            '                last ? last.t : 0,',
        ].join('\n'),
        replace: '                visible.length,',
    },
    {
        id: 'M7',
        what: 'key omits the per-order level digest — a dragged stop / host mark looks idle',
        needle: [
            '                    key += `|${row.orderId ?? row.id}:${row.openPrice ?? row.entryPrice}`',
            '                        + `:${row.stopLoss}:${row.takeProfit}:${row.quantity}`',
            '                        + `:${row._miLastMarkPrice}`;',
        ].join('\n'),
        replace: "                    key += '|row';",
    },
    {
        id: 'M8',
        what: 'key omits the tip candle close — unrealised P&L freezes between pans',
        needle: '                tip ? tip.t : 0,\n                tip ? tip.c : 0,\n',
        replace: '                tip ? tip.t : 0,\n',
    },
    {
        id: 'M9',
        what: 'stored key never updated, so the gate can only ever skip nothing',
        needle: '                    this._overlayResyncDirtyKeyLast = overlayResyncKey;\n',
        replace: '',
    },
    {
        id: 'NEG',
        what: 'negative control — needle that does not exist; MUST report NOT_APPLIED',
        needle: '        if (this._overlayResyncDirtyCheckDisabled()) return null;',
        replace: '        return null;',
        expectNotApplied: true,
    },
];

const baseline = COPIES.map((p) => fs.readFileSync(p, 'utf8'));
const baselineHash = crypto.createHash('sha256').update(baseline.join('\0')).digest('hex').slice(0, 16);

function restore() {
    COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i]));
}

function runSuite() {
    try {
        execFileSync('node', ['--test', SUITE], { cwd: REPO, encoding: 'utf8', stdio: 'pipe' });
        return { passed: true, out: '' };
    } catch (e) {
        return { passed: false, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
}

function failingCells(out) {
    return [...out.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]);
}

let bad = 0;
let killed = 0;
let applied = 0;
console.log(`baseline sha256:${baselineHash}\n`);

for (const m of MUTANTS) {
    const counts = baseline.map((src) => src.split(m.needle).length - 1);
    if (counts.some((c) => c !== 1)) {
        const verdict = m.expectNotApplied ? 'NOT_APPLIED (expected)' : 'NOT_APPLIED — MUTANT DID NOT RUN';
        if (!m.expectNotApplied) bad++;
        console.log(`${m.id}  ${verdict}  needle counts=[${counts}]  ${m.what}`);
        continue;
    }
    if (m.expectNotApplied) {
        bad++;
        console.log(`${m.id}  APPLIED BUT SHOULD NOT HAVE — negative control is not negative`);
        restore();
        continue;
    }

    applied++;
    COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i].split(m.needle).join(m.replace)));
    const res = runSuite();
    restore();

    if (res.passed) {
        bad++;
        console.log(`${m.id}  SURVIVED  ${m.what}`);
        continue;
    }
    const cells = failingCells(res.out);
    const behavioural = cells.filter((c) => !/byte-identical|source anchor/i.test(c));
    if (behavioural.length === 0) {
        bad++;
        console.log(`${m.id}  KILLED ONLY BY AN ANCHOR — ${cells.join(' | ')}`);
        continue;
    }
    killed++;
    console.log(`${m.id}  killed by: ${behavioural.join(' | ')}`);
}

restore();
const after = crypto
    .createHash('sha256')
    .update(COPIES.map((p) => fs.readFileSync(p, 'utf8')).join('\0'))
    .digest('hex')
    .slice(0, 16);
console.log(`\nkilled ${killed}/${applied} applied mutants`);
console.log(`restored sha256:${after}  ${after === baselineHash ? 'MATCHES BASELINE' : 'RESTORE FAILED'}`);
if (after !== baselineHash) bad++;
console.log(bad === 0 ? '\nALL MUTANTS ACCOUNTED FOR' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);
