/**
 * B-W16 mutation + VER-04 runner.
 *
 *   node "chart v 1.4/chart/modules/b-w16-hydration-guard.mutants.mjs"
 *
 * Generates variants of order-manager.js into a scratch dir and runs
 * b-w16-hydration-guard.test.mjs against each via BW16_TARGET.
 * A mutant DIES when the acceptance fails against it.
 *
 * BW16_BASELINE must point at a pre-fix copy of order-manager.js (VER-04 halves).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'order-manager.js');
const TEST = path.join(__dirname, 'b-w16-hydration-guard.test.mjs');
const BASELINE = process.env.BW16_BASELINE || '';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bw16-variants-'));

const fixed = fs.readFileSync(SRC, 'utf8');

// ── anchors in the fixed source ───────────────────────────────────────────────
const GUARD = `            // B-W16: guard BOTH durable exits (A1 rehydrate + legacy unmarked) with one
            // branch. Admit-list, not a deny-list: an unset or unrecognised provenance
            // is "we do not know", which must never open a durable write. 'hydrated'
            // only vouches for the session it was established for — this instance
            // outlives a session switch (see _m19CommitJournalArray).
            const journalVouchedFor = this._journalProvenance === 'locally-authored'
                || (this._journalProvenance === 'hydrated'
                    && this._journalProvenanceSession === (sessionId != null ? String(sessionId) : null));
            // B-W18 rollback lever: when the kill is engaged this branch is skipped
            // entirely and the durable write proceeds exactly as it did pre-B-W16 —
            // same return shape, no suppression, no warning. The guard condition
            // itself is unchanged.
            if (_bW16HydrationGuardEnabled() && !journalVouchedFor) {
                console.warn("📔 durable journal write suppressed: this session's journal was never hydrated from the server; the in-memory journal may be incomplete and writing it would delete server-side trades. Keeping last durable state.");
                return Promise.resolve({ hotQueued, durableQueued: false, reason: 'journal-unhydrated' });
            }
`;
// The provenance test plus the branch head, as it now reads with the B-W18
// rollback lever in front of it. Mutants that rewrite the condition replace this.
const GUARD_COND = `const journalVouchedFor = this._journalProvenance === 'locally-authored'
                || (this._journalProvenance === 'hydrated'
                    && this._journalProvenanceSession === (sessionId != null ? String(sessionId) : null));
            // B-W18 rollback lever: when the kill is engaged this branch is skipped
            // entirely and the durable write proceeds exactly as it did pre-B-W16 —
            // same return shape, no suppression, no warning. The guard condition
            // itself is unchanged.
            if (_bW16HydrationGuardEnabled() && !journalVouchedFor) {`;
const HOT_BLOCK_OPEN = `        if (this.chart && typeof this.chart.scheduleSessionStateSave === 'function') {\n`;
const LEGACY_EXIT = `            // Unmarked full journal — server must replace, not prefer-richer.\n`;
const ALLOWLIST_IF = `        if (reason === 'session-state-hydrate') {`;

function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`anchor missing for ${label}`);
  return hay;
}
must(fixed, GUARD, 'guard');
must(fixed, GUARD_COND, 'guard-cond');
must(fixed, HOT_BLOCK_OPEN, 'hot-block');
must(fixed, LEGACY_EXIT, 'legacy-exit');
must(fixed, ALLOWLIST_IF, 'allowlist');

const mutants = [
  {
    n: 1,
    name: 'default flipped to \'hydrated\'',
    apply: (s) => s.replace(`this._journalProvenance = 'unhydrated';`, `this._journalProvenance = 'hydrated';`),
  },
  {
    n: 2,
    name: 'guard moved to the hot path instead of the durable path',
    apply: (s) => s.replace(GUARD, '').replace(HOT_BLOCK_OPEN, HOT_BLOCK_OPEN + GUARD),
  },
  {
    n: 3,
    name: 'guard condition replaced with an emptiness test (durableJournal.length > 0)',
    apply: (s) => s.replace(
      GUARD_COND,
      `if (_bW16HydrationGuardEnabled() && !(Array.isArray(durableJournal) && durableJournal.length > 0)) {`,
    ),
  },
  {
    n: 4,
    name: 'allowlist widened so \'local-backup-hydrate\' also sets \'hydrated\'',
    apply: (s) => s.replace(
      ALLOWLIST_IF,
      `        if (reason === 'session-state-hydrate' || reason === 'local-backup-hydrate') {`,
    ),
  },
  {
    n: 5,
    name: 'guard relocated below the A1 rowsHaveRefs block (legacy exit only)',
    apply: (s) => s.replace(GUARD, '').replace(LEGACY_EXIT, GUARD + LEGACY_EXIT),
  },
  {
    n: 6,
    name: 'over-blocking: provenance never set to \'hydrated\' (suppresses forever)',
    apply: (s) => s.replace(`            this._journalProvenance = 'hydrated';\n`, ''),
  },
  {
    n: 7,
    name: 'return shape changed to durableQueued: true',
    apply: (s) => s.replace(
      `return Promise.resolve({ hotQueued, durableQueued: false, reason: 'journal-unhydrated' });`,
      `return Promise.resolve({ hotQueued, durableQueued: true, reason: 'journal-unhydrated' });`,
    ),
  },
  {
    n: 8,
    name: 'allowlist comparison loosened to a substring match on reason',
    apply: (s) => s.replace(
      ALLOWLIST_IF,
      `        if (typeof reason === 'string' && reason.includes('hydrate')) {`,
    ),
  },
  {
    n: 9,
    // Manager-added after review: the packet originally shipped this deny-list
    // form, which lets an unset/unrecognised provenance write durably.
    name: 'admit-list reverted to a deny-list (=== \'unhydrated\'), fails OPEN on unknown provenance',
    apply: (s) => s.replace(
      GUARD_COND,
      `if (_bW16HydrationGuardEnabled() && (this._journalProvenance === 'unhydrated'
                || (this._journalProvenance === 'hydrated'
                    && this._journalProvenanceSession !== (sessionId != null ? String(sessionId) : null)))) {`,
    ),
  },
];

function runAcceptance(file) {
  const r = spawnSync(process.execPath, [TEST], {
    env: { ...process.env, BW16_TARGET: file },
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = out.split('\n').filter((l) => l.startsWith('FAIL ')).map((l) => l.slice(5).split(' —')[0]);
  return { code: r.status, failed, out };
}

function write(tag, source) {
  const f = path.join(OUT, `${tag}.js`);
  fs.writeFileSync(f, source, 'utf8');
  return f;
}

let survived = 0;
console.log('=== B-W16 mutation set ===');
for (const m of mutants) {
  const mutated = m.apply(fixed);
  if (mutated === fixed) {
    console.log(`MUTANT ${m.n} — NOT APPLIED (anchor did not change): ${m.name}`);
    survived += 1;
    continue;
  }
  const { code, failed } = runAcceptance(write(`mutant-${m.n}`, mutated));
  const died = code !== 0;
  if (!died) survived += 1;
  console.log(`MUTANT ${m.n} — ${died ? 'DIED' : 'SURVIVED'} — ${m.name}`);
  if (died) console.log(`    killed by: ${failed.join(', ')}`);
}
console.log(`\n${mutants.length} designed / ${survived} survived`);

// ── VER-04 ────────────────────────────────────────────────────────────────────
console.log('\n=== VER-04 ===');
if (!BASELINE || !fs.existsSync(BASELINE)) {
  console.log('SKIPPED — BW16_BASELINE not set to a pre-fix order-manager.js');
} else {
  const base = fs.readFileSync(BASELINE, 'utf8');

  // (a) no-op stub: the change does nothing at all.
  const stub = runAcceptance(write('ver04-noop-stub', base));
  console.log(`no-op stub: ${stub.code !== 0 ? 'DIES' : 'PASSES (VACUOUS ACCEPTANCE)'}`);
  console.log(`    failing cells: ${stub.failed.join(', ')}`);

  // (b) faithful independent reimplementation, written from BRIEF §3's prose
  //     against the pre-fix source: different init site, switch-based allowlist,
  //     inverted admit-list guard, different session-field name and wording.
  const CTOR_ANCHOR = `        this.chart = chart;\n        this.replaySystem = replaySystem;\n`;
  const FUNNEL_ANCHOR = `        this.tradeJournal = Array.isArray(next) ? next : []; // M19-D-JOURNAL-WRITE:commit\n`;
  const DURABLE_ANCHOR = `        if (this.chart && typeof this.chart.queueCriticalSessionStateSave === 'function') {\n`;
  // B-W18 widened the acceptance with kill-switch cells, so the reimplementation
  // must implement the switch too or VER-04 is being claimed against a stale spec.
  // Deliberately a different shape from the product code: a Set, inverted
  // polarity (`killed` rather than `enabled`), and a `typeof !== 'object'` test.
  const MODULE_ANCHOR = `function _orderPersistenceV1Enabled() {\n`;
  for (const [a, l] of [[CTOR_ANCHOR, 'ctor'], [FUNNEL_ANCHOR, 'funnel'],
    [DURABLE_ANCHOR, 'durable'], [MODULE_ANCHOR, 'module']]) {
    if (!base.includes(a)) throw new Error(`reimpl anchor missing: ${l}`);
  }
  const reimpl = base
    .replace(MODULE_ANCHOR,
      `const BW16_KILL_WORDS = new Set(['1', 'true', 'yes', 'on']);\n`
      + `function _bW16GuardKilled() {\n`
      + `    if (typeof window !== 'object' || window === null) return false;\n`
      + `    const raw = window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1;\n`
      + `    if (raw === undefined || raw === null) return false;\n`
      + `    return BW16_KILL_WORDS.has(\`\${raw}\`.trim().toLowerCase());\n`
      + `}\n\n`
      + MODULE_ANCHOR)
    .replace(CTOR_ANCHOR, CTOR_ANCHOR
      + `        this._journalProvenance = 'unhydrated';\n`
      + `        this._journalHydratedForSession = null;\n`)
    .replace(FUNNEL_ANCHOR, FUNNEL_ANCHOR
      + `        switch (reason) {\n`
      + `            case 'session-state-hydrate': {\n`
      + `                let sid;\n`
      + `                try {\n`
      + `                    sid = this.chart ? this.chart.getActiveTradingSessionId() : undefined;\n`
      + `                } catch (err) { sid = undefined; }\n`
      + `                this._journalProvenance = 'hydrated';\n`
      + `                this._journalHydratedForSession = (sid === undefined || sid === null) ? null : \`\${sid}\`;\n`
      + `                break;\n`
      + `            }\n`
      + `            default:\n`
      + `                break;\n`
      + `        }\n`)
    .replace(DURABLE_ANCHOR, DURABLE_ANCHOR
      + `            const admitted = ['hydrated', 'locally-authored'];\n`
      + `            const activeSid = (sessionId === undefined || sessionId === null) ? null : \`\${sessionId}\`;\n`
      + `            const staleAcrossSessions = this._journalProvenance === 'hydrated'\n`
      + `                && this._journalHydratedForSession !== activeSid;\n`
      + `            const notVouched = admitted.indexOf(this._journalProvenance) < 0 || staleAcrossSessions;\n`
      + `            if (notVouched && !_bW16GuardKilled()) {\n`
      + `                console.warn('📔 Durable journal write suppressed — journal provenance is not vouched for; writing it could delete server-side trades. Last durable state kept.');\n`
      + `                return Promise.resolve({ hotQueued, durableQueued: false, reason: 'journal-unhydrated' });\n`
      + `            }\n`);
  const rr = runAcceptance(write('ver04-reimpl', reimpl));
  console.log(`independent reimplementation: ${rr.code === 0 ? 'PASSES' : 'FAILS'}`);
  if (rr.code !== 0) console.log(`    failing cells: ${rr.failed.join(', ')}`);
}

console.log(`\nvariants: ${OUT}`);
