/**
 * A/SR-03 — on-disk mutation runner. Applies each mutant to BOTH mirrors,
 * runs the behavioural gate, and restores the baseline bytes verified by hash.
 *
 *   node "chart v 1.4/chart/modules/a-sr03-focus-routing.mutants.mjs"
 *
 * A mutant that does not match EXACTLY ONE site is reported NOT_APPLIED loudly
 * rather than mutating an arbitrary site. One negative control is expected to
 * be NOT_APPLIED; every other mutant must be APPLIED and must DIE, and must be
 * killed by a named behavioural cell (SR03-C15/C16 are source pins and do not
 * count as kills).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const TEST = path.join(__dirname, 'a-sr03-focus-routing.test.mjs');
const SOURCE_PINS = new Set(['SR03-C15', 'SR03-C16']);

const REL = {
  chart: 'chart.js',
  econ: path.join('modules', 'economic-news-sidebar.js'),
  favs: path.join('modules', 'favorites-manager.js'),
  indui: path.join('modules', 'indicator-ui.js'),
};
const pairOf = (rel) => [
  path.join(ROOT, 'chart v 1.4', 'chart', rel),
  path.join(ROOT, 'homepage', 'public', 'chart', rel),
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* Baseline snapshot of every file this runner can touch, both mirrors. */
const BASE = new Map();
for (const rel of Object.values(REL)) {
  const [a, b] = pairOf(rel);
  const ba = fs.readFileSync(a);
  const bb = fs.readFileSync(b);
  if (sha(ba) !== sha(bb)) {
    console.error(`FATAL: mirrors not byte-identical before mutation: ${rel}`);
    process.exit(2);
  }
  BASE.set(rel, ba);
}

function writeRetry(file, buf, attempts = 12) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { fs.writeFileSync(file, buf); return; } catch (err) {
      lastErr = err;
      if (err && ['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
        const t = Date.now(); while (Date.now() - t < 50 * (i + 1)) { /* spin */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function restoreAll() {
  for (const [rel, buf] of BASE) {
    for (const p of pairOf(rel)) writeRetry(p, buf);
  }
  for (const [rel, buf] of BASE) {
    for (const p of pairOf(rel)) {
      if (sha(fs.readFileSync(p)) !== sha(buf)) {
        console.error(`FATAL: restore SHA mismatch for ${p}`);
        process.exit(2);
      }
    }
  }
}

const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

function runSuite() {
  const r = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', TEST],
    { encoding: 'utf8', cwd: ROOT });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = [];
  for (const line of out.split('\n')) {
    const m = /^not ok \d+ - (.+)$/.exec(line);
    if (m) failed.push(m[1].trim());
  }
  return { code: r.status, failed, out };
}

const K = '__TALARIA_DISABLE_FOCUS_ROUTING_V1';

const mutants = [
  {
    id: 'M01', file: REL.econ,
    name: 'kill-switch compared with === true (the shipped defect: ablation arm becomes the treatment arm)',
    needle: `        if (window.${K}) {`,
    replace: `        if (window.${K} === true) {`,
  },
  {
    id: 'M02', file: REL.econ,
    name: 'kill-switch captured at registration instead of read per call',
    needle: `    window.__talariaActiveChartV1 = function talariaActiveChartV1() {
        // Re-read on EVERY call, never captured at registration, so the switch
        // can be flipped mid-session with no reload. Truthy disables.
        if (window.${K}) {`,
    replace: `    const _cachedKill = window.${K};
    window.__talariaActiveChartV1 = function talariaActiveChartV1() {
        if (_cachedKill) {`,
  },
  {
    id: 'M03', file: REL.econ,
    name: 'provider result discarded (focus routing silently inert)',
    needle: '                if (active) return active;',
    replace: '                if (false) return active;',
  },
  {
    id: 'M04', file: REL.econ,
    name: 'news sidebar mainChart() reverts to the window.chart || window.mainChart chain',
    needle: `    function mainChart() {
        return window.__talariaActiveChartV1();
    }`,
    replace: `    function mainChart() {
        return window.chart || window.mainChart || null;
    }`,
  },
  {
    id: 'M05', file: REL.econ,
    name: 'fallback chain survives BESIDE the provider (two competing notions of "the chart")',
    needle: '        return window.chart || null;\n    };',
    replace: '        return window.chart || window.mainChart || null;\n    };',
  },
  {
    id: 'M06', file: REL.favs,
    name: 'favourites activateTool() reverts to the chain (tool lands on the host)',
    needle: '        const chart = window.__talariaActiveChartV1();',
    replace: '        const chart = window.chart || window.mainChart;',
  },
  {
    id: 'M07', file: REL.indui,
    name: 'indicator UI init reverts to the chain',
    needle: '    const chartInstance = window.__talariaActiveChartV1();',
    replace: '    const chartInstance = window.chart || window.mainChart;',
  },
  {
    id: 'M08', file: REL.chart,
    name: 'hideSettingsMenu clears the settings stamp on the host again (stamp leaks on the focused chart)',
    needle: `        const settingsOwner = (typeof window !== 'undefined'
            && typeof window.__talariaActiveChartV1 === 'function')
            ? window.__talariaActiveChartV1()
            : (typeof window !== 'undefined' ? window.chart : null);`,
    replace: `        const settingsOwner = (typeof window !== 'undefined') ? window.chart : null;`,
  },
  {
    id: 'M09', file: REL.chart,
    name: '_findActivePanChart ignores the explicit owner and re-infers the gesture',
    needle: `        if (typeof window !== 'undefined' && !window.${K}) {
            const owner = window.__talariaGestureOwnerV1;
            if (isPan(owner)) return owner;
        }
`,
    replace: '',
  },
  {
    id: 'M10', file: REL.chart,
    name: 'gesture ownership is never released (pinned past pointerup)',
    needle: `        // SR-03: releasing the capture ends this instance's ownership of the gesture.
        if (typeof window !== 'undefined' && window.__talariaGestureOwnerV1 === this) {
            window.__talariaGestureOwnerV1 = null;
        }
`,
    replace: '',
  },
  {
    id: 'M11', file: REL.chart,
    name: 'ownership is never recorded at pointer capture',
    needle: "            if (typeof window !== 'undefined') window.__talariaGestureOwnerV1 = this;\n",
    replace: '',
  },
  {
    id: 'M12', file: REL.chart,
    name: 'THE TRAP: route chart.js:18419 host-identity test through the provider (x !== x)',
    needle: 'targetChart.isPanel && targetChart !== window.chart && typeof targetChart.loadPanelFileData',
    replace: 'targetChart.isPanel && targetChart !== window.__talariaActiveChartV1() && typeof targetChart.loadPanelFileData',
  },
  {
    id: 'M13', file: REL.chart,
    name: 'gesture-owner read ignores the kill-switch (OFF arm no longer ablates)',
    needle: `        if (typeof window !== 'undefined' && !window.${K}) {
            const owner = window.__talariaGestureOwnerV1;`,
    replace: `        if (typeof window !== 'undefined') {
            const owner = window.__talariaGestureOwnerV1;`,
  },
  {
    id: 'NEG', file: REL.chart, expectApply: false,
    name: 'NEGATIVE CONTROL — needle that must not exist anywhere',
    needle: 'window.__talariaActiveChartV2(/* sr03 negative control */)',
    replace: 'window.__talariaActiveChartV1()',
  },
];

console.log('=== A/SR-03 mutation set (on-disk, both mirrors) ===');
for (const [rel, buf] of BASE) console.log(`baseline ${sha(buf).slice(0, 16)}  ${rel}`);

{
  const base = runSuite();
  if (base.code !== 0) {
    console.error('FATAL: baseline gate is not green before mutation');
    console.error(base.failed.join('\n') || base.out.slice(-2000));
    process.exit(2);
  }
  console.log('baseline gate: GREEN\n');
}

const rows = [];
let bad = 0;
for (const m of mutants) {
  const expectApply = m.expectApply !== false;
  const src = BASE.get(m.file).toString('utf8');
  const n = countOf(src, m.needle);

  if (n !== 1) {
    const notApplied = `NOT_APPLIED (needle count=${n}, need exactly 1)`;
    if (expectApply) {
      console.log(`MUTANT ${m.id} — !!! ${notApplied} !!! — ${m.name}`);
      bad += 1;
      rows.push({ id: m.id, file: m.file, applied: false, outcome: 'NOT_APPLIED', killedBy: [], name: m.name });
    } else {
      console.log(`MUTANT ${m.id} — ${notApplied} — as expected — ${m.name}`);
      rows.push({ id: m.id, file: m.file, applied: false, outcome: 'NOT_APPLIED_EXPECTED', killedBy: [], name: m.name });
    }
    continue;
  }
  if (!expectApply) {
    console.log(`MUTANT ${m.id} — !!! NEGATIVE CONTROL APPLIED (needle found) !!! — ${m.name}`);
    bad += 1;
    rows.push({ id: m.id, file: m.file, applied: true, outcome: 'NEG_CONTROL_APPLIED', killedBy: [], name: m.name });
    continue;
  }

  const mutated = Buffer.from(src.replace(m.needle, m.replace), 'utf8');
  for (const p of pairOf(m.file)) writeRetry(p, mutated);

  let result;
  try { result = runSuite(); } finally { restoreAll(); }

  const killers = result.failed
    .map((f) => (/^(SR03-C\d+)/.exec(f) || [])[1])
    .filter(Boolean);
  const behavioural = [...new Set(killers)].filter((c) => !SOURCE_PINS.has(c));
  const died = result.code !== 0;
  const killedProperly = died && behavioural.length > 0;
  if (!killedProperly) bad += 1;

  const outcome = !died ? 'SURVIVED' : (behavioural.length ? 'DIED' : 'DIED_BY_PIN_ONLY');
  console.log(`MUTANT ${m.id} — ${outcome} — ${m.name}`);
  if (result.failed.length) {
    for (const f of result.failed) console.log(`    killed by cell: ${f}`);
  } else if (died) {
    console.log('    killed only by suite non-zero exit (parse/syntax) — not a named cell');
  }
  rows.push({ id: m.id, file: m.file, applied: true, outcome, killedBy: [...new Set(killers)], name: m.name });
}

restoreAll();
console.log('\nrestored to baseline; hashes verified');
for (const [rel, buf] of BASE) {
  const [a] = pairOf(rel);
  console.log(`  ${sha(fs.readFileSync(a)).slice(0, 16)}  ${rel}  ${sha(fs.readFileSync(a)) === sha(buf) ? 'MATCH' : 'MISMATCH'}`);
}

const outFile = path.join(ROOT, 'docs', 'plan3', 'evidence',
  'A-SR03-ROUTING-CONVERSION-20260731', 'mutants.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({
  signature: 'TALARIA_SR03_MUTANTS_V1', measuredAt: new Date().toISOString(), rows,
}, null, 2)}\n`);

console.log(`\n${mutants.length} designed / ${bad} unsatisfactory`);
if (bad) { console.error('REJECT: a mutant survived, was not applied, or was killed only by a source pin'); process.exit(1); }
console.log('ALL MUTANTS ACCOUNTED FOR');
