#!/usr/bin/env node
/**
 * GATE-BINDING-AUDIT-01 — does each enforcement entry point have a caller that is not its own test?
 *
 * WHY THIS EXISTS. Under SEAL-EVIDENCE-01 I audited my own lane by hand and found three gates that
 * were written, self-tested, reported complete, and never called by anything that runs:
 *   - ABBA drift control: self-test only.
 *   - CONF-01 runway: bound, but the caller passed the default 0, so the branch was dead.
 *   - TOTAL-01: bound on one reporting path and absent from the soak's.
 * All three had passing tests. Tests prove a function works; they say nothing about whether the
 * product calls it. That is BIND-01's `RESOLVER_PRESENT_BUT_UNCALLED` applied to our own harness,
 * and a hand audit that found it once will not find it again in a month.
 *
 * WHAT THIS IS NOT. It counts CALLERS, not correctness. A symbol with a caller can still be passed
 * a neutered argument — exactly the runway case, where `requiredRunwayMs` defaulted to 0 and the
 * branch never executed. So a BOUND verdict here is necessary and not sufficient, and the report
 * says so rather than reading as a clean bill of health. Arguments are checked by the `armedBy`
 * field: a gate may declare a token that must appear at a call site for the gate to be armed.
 *
 * STATES, kept distinct because they send you to different places:
 *   BOUND                at least one non-test caller, and any armedBy token is present.
 *   BOUND_VIA_CLI        no importer, but the module is a command AND something automated invokes
 *                        it (an npm script). Command-line gates are real gates.
 *   CLI_ONLY_NO_PIPELINE the module is a command and NOTHING invokes it — no npm script, no runner.
 *                        It works when a human remembers to type it, which is not a gate. Kept
 *                        separate from SELF_TEST_ONLY because the fix is different: wire it into a
 *                        pipeline rather than find it a caller. Added after this audit's first run
 *                        called INSTRUMENT-01 unbound when it is a working CLI I had run by hand —
 *                        a false red is as broken as a false green, and reporting one while auditing
 *                        for the other would be the same disease wearing my coat.
 *   ARMED_BY_ABSENT      called, but the argument that arms it appears nowhere. The dead-branch case.
 *   SELF_TEST_ONLY       the only callers are tests. The gate does not run in production.
 *   SYMBOL_ABSENT        the symbol is not exported from the module named. A broken manifest entry —
 *                        reported separately so a typo in this file never reads as a missing gate.
 *
 * Usage:  node scripts/gate-binding-audit.mjs [--json]
 * Exit 0 every gate bound. Exit 2 a gate is unbound or unarmed. Exit 1 the audit could not run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GATE_BINDING_SIGNATURE = 'GATE-BINDING-AUDIT-01';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A file is a test if it is a selftest, a .test.mjs, or lives under a tests/ directory. */
export function isTestFile(file) {
  const f = String(file).replace(/\\/g, '/');
  return /(^|\/)tests?\//.test(f)
    || /\.test\.mjs$/.test(f)
    || /selftest/i.test(f)
    || /\.mutants\.mjs$/.test(f);
}

/**
 * The enforcement points of my lane. Each entry is a promise that something refuses, so each one
 * has to be reachable from a run. Adding a gate here is how it becomes auditable; a gate absent
 * from this list is not covered, which is why `--json` reports the count.
 */
export const C_LANE_GATES = [
  {
    id: 'TOTAL-01',
    symbol: 'quoteArenaDelta',
    module: 'scripts/lib/arena-columns.mjs',
    refuses: 'a single-arena delta quoted without its total row at both endpoints',
  },
  {
    // The binding that matters for CLOCK-01 is the EMITTER, not the audit. An audit finds bare
    // numbers after they are written; an emitter that carries its offset means they are never
    // written bare. My lane's 14 instruments printed `toISOString().slice(11,19)` — UTC with the
    // marker deliberately sliced off — so the gate here is that the emitter has callers at all.
    id: 'CLOCK-01-EMIT',
    symbol: 'clockOf',
    module: 'scripts/lib/clock.mjs',
    refuses: 'a log line, artifact field or board number written without the clock that produced it',
  },
  {
    id: 'ARM-EQUALITY-01',
    symbol: 'assertArmsComparable',
    module: 'scripts/lib/arm-equality.mjs',
    refuses: 'firing a two-arm soak whose arms differ in anything beyond the trade knob — and, '
      + 'separately, a pair with no contrast at all, whose delta is zero by construction',
  },
  {
    id: 'BASIS-GUARD-01',
    symbol: 'ratio',
    module: 'scripts/lib/basis-guard.mjs',
    refuses: 'cross-basis borrowing — a figure measured on one quantity, scope or method used against '
      + 'another, which produced the 59.84% coverage reading and nearly killed three canvas reclaims',
  },
  {
    id: 'QUIESCE-01',
    symbol: 'quiesce',
    module: 'scripts/lib/settle-protocol.mjs',
    refuses: 'a forced collection on a live, allocating page — the omission 26 instruments inherited '
      + 'from this module, now the default here rather than a habit in each caller',
  },
  {
    id: 'PHASE-SURVIVAL-01',
    // The entry point the sweep actually calls. Naming the inner `assessSurvival` here reported
    // SELF_TEST_ONLY while a real caller existed — binding to the wrong name is indistinguishable
    // from not binding, which is the third time today this audit has been right and I have not.
    symbol: 'sweepPublishedSet',
    module: 'scripts/lib/phase-survival.mjs',
    refuses: 'a phase-corrupt published reading being kept or killed by judgement call rather than '
      + 'by a stated criterion, and an unmeasured amplitude being borrowed from another quantity',
  },
  {
    id: 'SETTLE-CRITERION-V2',
    symbol: 'assessSettled',
    module: 'scripts/lib/settle-criterion.mjs',
    refuses: 'a procedurally-compliant reading being taken for a settled one — a live page during '
      + 'collection, a heap that rose across it, a single point with no curve, or a curve still moving',
  },
  {
    id: 'BAR-BASIS-01',
    symbol: 'assessAgainstBar',
    module: 'scripts/lib/bar-basis.mjs',
    refuses: 'the hoard floor and the canonical floor being graded against one bar on two different '
      + 'bases, so both read green while disagreeing — and, separately, an unsettled reading being '
      + 'compared against a bar that binds at settled post-GC',
  },
  {
    id: 'KNOWN-WEAKNESS-01',
    symbol: 'assessHeadline',
    module: 'scripts/lib/known-weakness.mjs',
    refuses: 'a headline being published from a rung whose own artifact records a knownWeakness that '
      + 'nobody dispositioned — and, separately, a one-word sign-off standing in for a decision',
  },
  {
    id: 'COV-01-BASIS',
    // The instruments call `captureDetailedDump`; `coverageAcrossProcesses` is its internal and was
    // the symbol this gate first named, which made it read SELF_TEST_ONLY while genuinely bound.
    // Presence is not binding, and neither is binding to the wrong name.
    symbol: 'captureDetailedDump',
    module: 'scripts/lib/detailed-dump-capture.mjs',
    refuses: 'one renderer\'s arenas being divided by every Chrome process\'s private memory and the '
      + 'shortfall read as unnamed memory — and, separately, overlapping roots summing past the total '
      + 'and reading as excellent coverage',
  },
  {
    id: 'COV-01-VALIDITY',
    symbol: 'assessQuotability',
    module: 'scripts/lib/memory-validity.mjs',
    refuses: 'an authoritative memory number being quoted with under 95% named coverage — and, '
      + 'separately, a broken coverage instrument being reported as a low-coverage reading',
  },
  {
    id: 'ORPHAN-SERVER-01',
    symbol: 'censusOf',
    module: 'scripts/orphan-server-census.mjs',
    refuses: 'a leftover local file server being reported as gone on the strength of a board line '
      + 'written hours earlier, and an unreadable process list being reported as a clean box',
  },
  {
    id: 'RUN-GROUP-01',
    symbol: 'groupRuns',
    module: 'scripts/measurement-queue.mjs',
    refuses: 'an orchestrator and the arms it spawned being counted as separate unclaimed runs — '
      + 'the false alarm that would fire on every correctly paired ABBA arm',
  },
  {
    id: 'CLOCK-01-AUDIT',
    symbol: 'scanText',
    module: 'scripts/clock-01-audit.mjs',
    refuses: 'a bare wall-clock number surviving in prose, a verdict line or a commit message',
  },
  {
    id: 'TOTAL-01-RANK',
    symbol: 'rankRowGrowth',
    module: 'scripts/lib/arena-columns.mjs',
    refuses: 'arena growth ranking that has not been through the total-row check',
  },
  {
    id: 'SETTLE-PROTOCOL',
    symbol: 'gradeSettle',
    module: 'scripts/lib/settle-protocol.mjs',
    refuses: 'a floor read without a settle and a forced collection behind it',
  },
  {
    id: 'CONF01-COMMON-WINDOW',
    symbol: 'assertCommonWindow',
    module: 'scripts/lib/heap-cycle-dataset-config.mjs',
    refuses: 'arming a session whose panels do not share the host session start',
  },
  {
    id: 'CONF01-RUNWAY',
    symbol: 'computeRequiredRunwayMs',
    module: 'scripts/lib/heap-cycle-dataset-config.mjs',
    refuses: 'nothing on its own — it supplies the runway the window gate grades against',
    // The defect this catches: bound but called with the neutral default, so the branch is dead.
    armedBy: 'requiredRunwayMs',
  },
  {
    id: 'FLOOR-CURVE',
    symbol: 'gradeSettleCurve',
    module: 'scripts/lib/floor-curve.mjs',
    refuses: 'a floor quoted from a curve that had not flattened, and any reading off a session that rose',
  },
  {
    id: 'DRIFT-ABBA',
    symbol: 'abbaSequence',
    module: 'scripts/lib/abba-drift.mjs',
    refuses: 'an effect quoted from an unpaired arm, where drift is indistinguishable from effect',
  },
  {
    id: 'FORCED-GC-FLOOR',
    symbol: 'forcedGcPauseProbe',
    module: 'scripts/lib/forced-gc-pause-probe.mjs',
    refuses: 'a floor measured by pause-and-wait alone',
  },
  {
    id: 'INSTRUMENT-01',
    symbol: 'checkInstrument',
    module: 'scripts/instrument-provenance.mjs',
    refuses: 'citing a result whose instrument is uncommitted or dirty',
  },
];

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error && typeof error.stdout === 'string') return error.stdout; // grep exit 1 = no matches
    throw error;
  }
};

/**
 * This module's own path. It must never count as a caller of anything.
 *
 * FOUND THE HARD WAY, an hour after shipping this audit: DRIFT-ABBA flipped from SELF_TEST_ONLY to
 * BOUND with `called by: scripts/gate-binding-audit.mjs`. Nothing had been wired. The manifest below
 * NAMES `abbaSequence`, the caller search is a text search, and so the audit certified a dead gate on
 * the strength of its own entry for it. A check that passes because it exists is the precise defect
 * this file was written to detect, and it had it. Excluded by path rather than by cleverness.
 */
export const SELF_MODULE = 'scripts/gate-binding-audit.mjs';

/** Files under scripts/ that mention a symbol, excluding the module that defines it and this audit. */
export function callersOf(symbol, module, { grep = null, selfModule = SELF_MODULE } = {}) {
  const out = (grep || ((s) => git(['grep', '-l', '--', s, 'HEAD', '--', 'scripts'])))(symbol);
  const norm = (f) => String(f).replace(/\\/g, '/');
  return String(out)
    .split(/\r?\n/)
    .map((l) => l.replace(/^HEAD:/, '').trim())
    .filter(Boolean)
    .filter((f) => norm(f) !== norm(module))
    .filter((f) => norm(f) !== norm(selfModule));
}

/**
 * Callers in the WORKING TREE rather than HEAD. Only consulted when HEAD has none, to tell an
 * uncommitted binding apart from an absent one.
 */
export function defaultWorktreeCallers(symbol, module) {
  const norm = (f) => String(f).replace(/\\/g, '/');
  let out = '';
  // --untracked matters: a caller in a brand-new file is the commonest form of "written but not
  // committed", and plain `git grep` does not see it at all.
  try { out = git(['grep', '-l', '--untracked', '--', symbol, '--', 'scripts']); } catch { return []; }
  return String(out)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => norm(f) !== norm(module))
    .filter((f) => norm(f) !== norm(SELF_MODULE));
}

/** Does this module run as a command? Both spellings of the main-module guard, plus a shebang. */
export function isCliModule(source) {
  const s = String(source || '');
  return /^#!/.test(s)
    || /invokedDirectly/.test(s)
    || /process\.argv\[1\]/.test(s)
    || /import\.meta\.main/.test(s);
}

/** npm scripts that invoke a module path. This is what makes a CLI gate automated rather than manual. */
export function npmScriptsInvoking(modulePath, read) {
  const raw = read('package.json');
  if (!raw) return [];
  let scripts;
  try { scripts = (JSON.parse(raw).scripts) || {}; } catch { return []; }
  const needle = String(modulePath).replace(/\\/g, '/').replace(/^scripts\//, '');
  return Object.entries(scripts)
    .filter(([, cmd]) => String(cmd).replace(/\\/g, '/').includes(needle))
    .map(([name]) => name);
}

/**
 * Decide one gate. `grep` and `readFile` are injectable so the audit is testable without a repo —
 * an audit whose own tests need a live git tree is the thing it is auditing.
 */
export function judgeGate(gate, { grep = null, readFile = null, worktreeCallers = defaultWorktreeCallers } = {}) {
  const read = readFile || ((p) => {
    try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; }
  });

  const source = read(gate.module);
  if (source == null || !source.includes(gate.symbol)) {
    return {
      ...gate,
      state: 'SYMBOL_ABSENT',
      ok: false,
      callers: [],
      why: source == null
        ? `${gate.module} could not be read — a broken manifest entry, not a missing gate.`
        : `${gate.symbol} is not in ${gate.module} — the manifest names a symbol that does not exist.`,
    };
  }

  const all = callersOf(gate.symbol, gate.module, { grep });
  const production = all.filter((f) => !isTestFile(f));
  const tests = all.filter((f) => isTestFile(f));

  if (production.length === 0) {
    // A command-line gate has no importer by design. Judging it by importers alone produces a false
    // red, so the question becomes whether anything AUTOMATED invokes it.
    if (isCliModule(source)) {
      const invokers = npmScriptsInvoking(gate.module, read);
      if (invokers.length > 0) {
        return {
          ...gate, state: 'BOUND_VIA_CLI', ok: true, callers: [], testCallers: tests, invokers,
        };
      }
      return {
        ...gate,
        state: 'CLI_ONLY_NO_PIPELINE',
        ok: false,
        callers: [],
        testCallers: tests,
        why: `${gate.module} is a command and nothing invokes it — no npm script, no runner. `
          + `It refuses ${gate.refuses} only when someone remembers to type it, which is a habit rather `
          + 'than a gate. Wire it into a pipeline; it does not need a caller.',
      };
    }
    /**
     * BOUND_BUT_UNCOMMITTED. The caller scan reads HEAD on purpose: a gate is bound when the
     * committed tree calls it, because that is the tree that gets built and shipped. But a binding
     * that exists in the working tree and not in HEAD is a DIFFERENT FACT from no binding at all —
     * one needs a commit, the other needs the work doing — and reporting them identically sent me
     * looking for a missing caller that was already written. Presence is not binding, binding is not
     * correctness, and committed is not the same as written.
     */
    const inWorktree = worktreeCallers
      ? worktreeCallers(gate.symbol, gate.module).filter((f) => !isTestFile(f))
      : [];
    if (inWorktree.length > 0) {
      return {
        ...gate,
        state: 'BOUND_BUT_UNCOMMITTED',
        ok: false,
        callers: [],
        worktreeCallers: inWorktree,
        testCallers: tests,
        why: `${gate.symbol} is called by ${inWorktree.join(', ')} in the WORKING TREE but by nothing `
          + 'in HEAD. The binding is written and not committed, so it does not exist in the tree that '
          + `gets built. It refuses ${gate.refuses} on this machine only. Commit it.`,
      };
    }
    return {
      ...gate,
      state: 'SELF_TEST_ONLY',
      ok: false,
      callers: production,
      testCallers: tests,
      why: `${gate.symbol} is called by ${tests.length} test file(s) and nothing that runs, in HEAD `
        + `or in the working tree. It refuses ${gate.refuses} — but only in its own tests.`,
    };
  }

  if (gate.armedBy) {
    const armed = production.filter((f) => (read(f) || '').includes(gate.armedBy));
    if (armed.length === 0) {
      return {
        ...gate,
        state: 'ARMED_BY_ABSENT',
        ok: false,
        callers: production,
        testCallers: tests,
        why: `${gate.symbol} has ${production.length} caller(s), but none mentions '${gate.armedBy}', `
          + 'so it is being called with the neutral default and its branch never executes. '
          + 'Called is not the same as armed.',
      };
    }
    return {
      ...gate, state: 'BOUND', ok: true, callers: production, testCallers: tests, armedIn: armed,
    };
  }

  return {
    ...gate, state: 'BOUND', ok: true, callers: production, testCallers: tests,
  };
}

export function auditGates(gates = C_LANE_GATES, deps = {}) {
  const rows = gates.map((g) => judgeGate(g, deps));
  return {
    signature: GATE_BINDING_SIGNATURE,
    total: rows.length,
    bound: rows.filter((r) => r.state === 'BOUND').length,
    unbound: rows.filter((r) => !r.ok).length,
    ok: rows.every((r) => r.ok),
    rows,
  };
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const report = auditGates();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[gate-binding] ${report.bound}/${report.total} gates bound to a non-test caller\n`);
    for (const r of report.rows) {
      console.log(`  ${r.ok ? 'ok' : 'XX'} ${r.id.padEnd(22)} ${r.state}`);
      if (!r.ok) console.log(`       -> ${r.why}`);
      else if (r.state === 'BOUND_VIA_CLI') console.log(`       invoked by npm script: ${r.invokers.join(', ')}`);
      else console.log(`       called by: ${r.callers.join(', ')}`);
    }
    console.log('\n  A BOUND verdict means the symbol has a caller outside its tests. It does NOT mean the');
    console.log('  gate has ever refused anything, nor that the caller passes it a meaningful argument.');
    console.log('  This is a necessary condition for a gate to be live, not proof that it is.');
  }
  process.exitCode = report.ok ? 0 : 2;
}
