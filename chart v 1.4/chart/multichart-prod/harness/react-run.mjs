/**
 * react-run.mjs — T0 step 8b runner for built-product React parity scenarios.
 *
 * Boots real dist-v9 MultichartGrid (mcLayout=2v) via react-parity-lib.
 * CLI flags: --runs=N, --only=H-R01,H-R12, --headful
 */

import { ensureBuiltReactStack, launchBrowser } from './react-parity-lib.mjs';
import { reactScenarioList } from './react-parity-scenarios.mjs';

function parseArgs(argv) {
  const args = { runs: 1, only: null, headful: false, migrationOn: false, phase1Off: false };
  for (const a of argv.slice(2)) {
    if (a === '--headful') args.headful = true;
    else if (a === '--migration-on') args.migrationOn = true;
    else if (a === '--phase1-off') args.phase1Off = true;
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

function verdictOf(result) {
  const checkFails = result.checks.failures();
  return {
    pass: checkFails.length === 0,
    checkFails,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const stack = await ensureBuiltReactStack();
  console.log(`[react-run] built-product url: ${stack.url}`);
  console.log(`[react-run] surface: ${stack.surface} build=${stack.buildId}`);
  console.log(`[react-run] mode: runs=${args.runs} only=${args.only ? args.only.join(',') : 'ALL'} migrationOn=${args.migrationOn} phase1Off=${args.phase1Off}`);

  const scenarios = reactScenarioList().filter((s) => !args.only || args.only.includes(s.id));
  if (!scenarios.length) {
    console.error('[react-run] no scenarios matched --only filter');
    await stack.close();
    process.exit(2);
  }

  const browser = await launchBrowser({ headful: args.headful });
  const verdicts = {};
  const notesById = {};
  for (const s of scenarios) verdicts[s.id] = [];

  try {
    for (let run = 1; run <= args.runs; run++) {
      console.log(`\n========== REACT RUN ${run}/${args.runs} ==========`);
      for (const s of scenarios) {
        const ctx = { browser, stack, migrationOn: args.migrationOn, phase1Off: args.phase1Off };
        let result;
        try {
          result = await s.run(ctx);
        } catch (err) {
          console.log(`[react-run] ${s.id} threw: ${(err && err.stack) || err}`);
          verdicts[s.id].push('FAIL');
          console.log(`RESULT ${s.id} FAIL`);
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        const v = verdictOf(result);
        verdicts[s.id].push(v.pass ? 'PASS' : 'FAIL');
        if (result.notes && result.notes.length) notesById[s.id] = result.notes;

        for (const c of result.checks.items) {
          console.log(`   [${c.ok ? ' ok ' : 'FAIL'}] ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
        }
        console.log(`RESULT ${s.id} ${v.pass ? 'PASS' : 'FAIL'}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    await browser.close();
    await stack.close();
  }

  console.log('\n================= REACT SUMMARY =================');
  let anyFail = false;
  const rows = [];
  for (const s of scenarios) {
    const vs = verdicts[s.id];
    const allPass = vs.every((v) => v === 'PASS');
    const allFail = vs.every((v) => v === 'FAIL');
    let cls;
    if (allPass) cls = 'PASS';
    else if (allFail) cls = 'FAIL-REAL-BUG';
    else cls = 'FAIL-FLAKE';
    if (cls !== 'PASS') anyFail = true;
    rows.push({ id: s.id, runs: vs.join(','), verdict: cls });
  }
  console.table(rows);
  for (const s of scenarios) {
    console.log(`FINAL ${s.id} ${rows.find((r) => r.id === s.id).verdict}`);
  }
  console.log('=================================================');

  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('[react-run] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
