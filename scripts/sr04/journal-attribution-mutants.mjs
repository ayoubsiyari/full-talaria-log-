/**
 * journal-attribution-mutants.mjs
 *
 * Applies defects to BOTH shipped copies of order-manager.js on disk, runs the call-site suite, and
 * reports which NAMED cell killed each one. A mutant whose only killer is a source-text anchor is a
 * failure of the suite, not a pass. Every needle must match exactly once in each copy or the runner
 * reports NOT_APPLIED loudly rather than mutating an arbitrary site.
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
const SUITE = path.join('scripts', 'sr04', 'journal-attribution-call-site.test.mjs');

const MUTANTS = [
    {
        id: 'M1',
        what: 'never call the resolver — the exact state the Director found (correct and uncalled)',
        needle: 'const journalChart = this._resolveJournalContextChart(order);',
        replace: 'const journalChart = null;'
    },
    {
        id: 'M2',
        what: 'flag uses strict === true, so truthy values silently fail to disable',
        needle: 'if (window.__TALARIA_DISABLE_JOURNAL_ATTRIBUTION_V1) return null;',
        replace: 'if (window.__TALARIA_DISABLE_JOURNAL_ATTRIBUTION_V1 === true) return null;'
    },
    {
        id: 'M3',
        what: 'ticker follows the record but the MARK still comes from focus (the 1.08 vs 156 defect)',
        needle: `                    const cc = contextChart
                        ? this._getCurrentCandleForChart(contextChart)
                        : (typeof this.getCurrentCandle === 'function' ? this.getCurrentCandle() : null);`,
        replace: `                    const cc = typeof this.getCurrentCandle === 'function' ? this.getCurrentCandle() : null;`
    },
    {
        id: 'M4',
        what: 'scalars resolve against focus again while the row still names the traded pair',
        needle: `        const ticker = (contextChart && this._normalizeTicker(contextChart.currentSymbol))
            || this._getActiveTicker();`,
        replace: '        const ticker = this._getActiveTicker();'
    },
    {
        id: 'M5',
        what: 'focus consulted BEFORE the record, so the fallback order is inverted',
        needle: `        const symbol = order.ticker || order.symbol
            || (journalChart && this._normalizeTicker(journalChart.currentSymbol))
            || this._getActiveTicker();`,
        replace: `        const symbol = order.ticker || order.symbol || this._getActiveTicker()
            || (journalChart && this._normalizeTicker(journalChart.currentSymbol));`
    },
    {
        id: 'M6',
        what: 'resolver called with an empty chart source, so it can never match anything',
        needle: 'return resolve(order) || null;',
        replace: 'return resolve(order, []) || null;'
    },
    {
        id: 'M7',
        what: 'ambiguity resolved by guessing the focused chart instead of declining',
        needle: `        try {
            return resolve(order) || null;
        } catch (_e) {
            return null;
        }`,
        replace: `        try {
            return resolve(order) || this.chart || null;
        } catch (_e) {
            return null;
        }`
    },
    {
        id: 'NEG',
        what: 'negative control — needle that does not exist; MUST report NOT_APPLIED',
        needle: 'const journalChart = this._resolveOwningChartForJournalRow(order);',
        replace: 'const journalChart = null;',
        expectNotApplied: true
    }
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

    COPIES.forEach((p, i) => fs.writeFileSync(p, baseline[i].split(m.needle).join(m.replace)));
    const res = runSuite();
    restore();

    if (res.passed) {
        bad++;
        console.log(`${m.id}  SURVIVED  ${m.what}`);
        continue;
    }
    const cells = failingCells(res.out);
    const behavioural = cells.filter((c) => !/byte-identical|script list/i.test(c));
    if (behavioural.length === 0) {
        bad++;
        console.log(`${m.id}  KILLED ONLY BY AN ANCHOR — ${cells.join(' | ')}`);
    } else {
        console.log(`${m.id}  killed by: ${behavioural.join(' | ')}`);
    }
}

restore();
const after = crypto.createHash('sha256').update(COPIES.map((p) => fs.readFileSync(p, 'utf8')).join('\0')).digest('hex').slice(0, 16);
console.log(`\nrestored sha256:${after}  ${after === baselineHash ? 'MATCHES BASELINE' : 'RESTORE FAILED'}`);
if (after !== baselineHash) bad++;
console.log(bad === 0 ? '\nALL MUTANTS ACCOUNTED FOR' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);
