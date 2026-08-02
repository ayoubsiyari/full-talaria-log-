#!/usr/bin/env node
/**
 * REBUILD-CONSTRAINT — does a surface actually carry tonight's work?
 *
 * The canary served 20260802b122 / source 1c69bebb4 all day. That commit is
 * from 10:13 and my tip is 123 commits past it, so nothing observed there can
 * be cited about tonight. "The rebuild must carry these commits" is only useful
 * if it is checkable on the surface rather than asserted from a branch name, so
 * every required row below has a marker that is greppable in SERVED bytes.
 *
 * Two arms, because two different things can go wrong.
 *
 *  SURFACE   Is the marker in the bytes being served? Discrimination is against
 *            the DEPLOYED baseline, not the commit's parent: a marker must be
 *            absent at 1c69bebb4 and present at the tip, which is exactly the
 *            claim "the canary does not carry this".
 *
 *  PROVENANCE Is the bundle explained by the commit that carries it? The V9
 *            build compiles the working TREE, not the commit, and we share a
 *            filesystem. At c0c013b9c the committed bundle contains
 *            __TALARIA_DISABLE_PANEL_STATE_PERSIST_V1 while that string is in
 *            ZERO source files at that commit — it was compiled out of another
 *            manager's uncommitted work. Such a bundle cannot be reproduced
 *            from its own source SHA, which makes the passport's third
 *            coordinate describe a tree that never built these bytes.
 *
 *   node scripts/rebuild-constraint-check.mjs                      # check the tree
 *   node scripts/rebuild-constraint-check.mjs --base=http://host   # check a surface
 *   node scripts/rebuild-constraint-check.mjs --provenance         # tree explains bundle?
 *   node scripts/rebuild-constraint-check.mjs --provenance --rev=c0c013b9c
 *   node scripts/rebuild-constraint-check.mjs --discriminating     # prove the markers
 *
 * Exit 0 pass. Exit 2 a required row is missing or unexplained: the surface must
 * not be cited. Exit 1 the check itself could not run — a harness or door
 * failure, which is not a verdict on the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isBuildInput } from './clean-build-tree-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** The surface the canary serves and the mirror that backs it. */
const SERVED = {
  engine: ['/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
  pipeline: ['/chart/modules/chart-data-pipeline.js', 'homepage/public/chart/modules/chart-data-pipeline.js'],
  chart: ['/chart/chart.js', 'homepage/public/chart/chart.js'],
  bundle: ['/chart/dist-v9/assets/talaria-v9-live.js', 'homepage/public/chart/dist-v9/assets/talaria-v9-live.js'],
};

/** The commit the canary is serving, and the baseline every marker must beat. */
const DEPLOYED_BASELINE = '1c69bebb4';

const ROWS = [
  {
    id: 'A-DAILY-BUCKETING',
    owner: 'A',
    commit: 'c0c013b9c',
    what: 'session-day daily bucketing, FX at 17:00 New York',
    // Not `_replayBucketStart`: that method already existed at the deployed
    // commit and A only taught it the session open, so it does not discriminate.
    checks: [
      { surface: 'engine', re: /chart\._sessionBucketStart/ },
      { surface: 'pipeline', re: /maxRawT/ },
    ],
  },
  {
    id: 'D-M24-ORDER-COUNTERS',
    owner: 'D',
    commit: '47b1c5f05',
    what: 'order counters preserved across the quota backup retry',
    checks: [
      { surface: 'chart', re: /order_counters\s*=\s*\{[\s\S]{0,200}?tradeGroupIdCounter/ },
    ],
  },
  {
    id: 'B-SHELL-PLAY-01',
    owner: 'B',
    commit: '419bb433f',
    what: 'play override forwards to its receiver; no phantom start broadcast',
    // Built bytes only. A's step=1s retest cannot read this from source.
    checks: [
      { surface: 'bundle', re: /__shellPlayOverrideInert/ },
    ],
  },
  {
    id: 'B-PANEL-SLICE',
    owner: 'B',
    commit: '419bb433f',
    what: 'TAL-01865 per-panel symbol/tf/chart-type/scale/zoom/focus restore',
    checks: [
      { surface: 'bundle', re: /__TALARIA_DISABLE_PANEL_STATE_PERSIST_V1/ },
    ],
  },
  {
    id: 'B-TOOLBAR-PINS',
    owner: 'B',
    commit: '419bb433f',
    what: 'TAL-01865 pinned timeframes and drawing tools survive refresh',
    checks: [
      { surface: 'bundle', re: /talaria_v9_tf_pinned/ },
    ],
  },
];

/**
 * Strings that must be traceable to source in the same tree that carries the
 * bundle. Each is the compiled form of a row above; if the bundle has it and
 * the tree does not, the bundle was built from somebody's uncommitted disk.
 */
const PROVENANCE = [
  '__TALARIA_DISABLE_PANEL_STATE_PERSIST_V1',
  'talaria_v9_tf_pinned',
  '__shellPlayOverrideInert',
  'panelsById',
];

const args = process.argv.slice(2);
const flag = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const BASE = flag('base') ? flag('base').replace(/\/$/, '') : null;
const BASELINE = flag('baseline') || DEPLOYED_BASELINE;
const REV = flag('rev') || 'HEAD';
const MODE = args.includes('--discriminating') ? 'discriminating'
  : args.includes('--provenance') ? 'provenance' : 'surface';

async function readSurface(key) {
  const [servedPath, localPath] = SERVED[key];
  if (BASE) {
    const url = `${BASE}${servedPath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    // A door answering HTML for a .js path is the wrong door, not a bad build.
    if (/text\/html/i.test(ct)) throw new Error(`${url} -> content-type ${ct} (wrong door, not a bad build)`);
    return { body };
  }
  const p = path.join(ROOT, localPath);
  if (!fs.existsSync(p)) throw new Error(`missing ${localPath}`);
  return { body: fs.readFileSync(p, 'utf8') };
}

function blobAt(rev, localPath) {
  try {
    return execFileSync('git', ['show', `${rev}:${localPath}`], {
      encoding: 'buffer', maxBuffer: 1 << 28, cwd: ROOT,
    }).toString('utf8');
  } catch {
    return null;
  }
}

function sourceFilesAt(rev, needle) {
  try {
    const out = execFileSync(
      'git',
      ['grep', '-l', '--fixed-strings', needle, rev, '--', ':!*dist-v9*', ':!*dist/*'],
      { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26 },
    );
    return out.trim() ? out.trim().split('\n').map((l) => l.replace(`${rev}:`, '')) : [];
  } catch {
    return [];
  }
}

/** A marker earns its place only by being absent on the surface we cannot cite. */
function proveDiscriminating() {
  console.log(`\nMARKER DISCRIMINATION — absent at deployed ${BASELINE}, present at ${REV}\n`);
  let bad = 0;
  for (const row of ROWS) {
    for (const chk of row.checks) {
      const [, localPath] = SERVED[chk.surface];
      const before = blobAt(BASELINE, localPath);
      const after = blobAt(REV, localPath);
      if (before == null || after == null) {
        console.log(`  ?? ${row.id} ${chk.surface} — could not read both sides`);
        bad += 1;
        continue;
      }
      const hitBefore = chk.re.test(before);
      const hitAfter = chk.re.test(after);
      const ok = hitAfter && !hitBefore;
      if (!ok) bad += 1;
      console.log(
        `  ${ok ? 'ok' : 'XX'} ${row.id.padEnd(22)} ${chk.surface.padEnd(9)} `
        + `deployed=${hitBefore ? 'PRESENT' : 'absent '} tip=${hitAfter ? 'present' : 'ABSENT '}  ${String(chk.re)}`,
      );
    }
  }
  if (bad) {
    console.log(`\n${bad} marker(s) do not discriminate. Fix the marker before trusting the check.`);
    return 2;
  }
  console.log('\nEvery marker is absent on the deployed surface and present at the tip:');
  console.log('the canary genuinely does not carry these rows.');
  return 0;
}

/** Is the bundle explained by the tree that carries it? */
function proveProvenance() {
  console.log(`\nBUNDLE PROVENANCE at ${REV} — compiled strings must trace to source in the same tree\n`);
  const [, bundlePath] = SERVED.bundle;
  const bundle = blobAt(REV, bundlePath);
  if (bundle == null) {
    console.log(`  cannot read the bundle at ${REV}`);
    return 1;
  }
  // A board note or a gate that mentions the string must not be allowed to
  // explain a compiled byte. Shared with the clean-tree guard so the set this
  // check calls "source" is exactly the set that guard refuses to build dirty:
  // if they drifted apart, one tool would clear work the other had flagged.
  const isProductSource = isBuildInput;

  let unexplained = 0;
  for (const marker of PROVENANCE) {
    if (!bundle.includes(marker)) {
      console.log(`  -- ${marker}\n       not in the bundle at ${REV}; nothing to explain`);
      continue;
    }
    const files = sourceFilesAt(REV, marker);
    const owners = files.filter(isProductSource);
    if (owners.length) {
      console.log(`  ok ${marker}`);
      console.log(`       in the bundle and owned by ${owners.map((f) => f.split(/[\\/]/).pop()).join(', ')}`);
      continue;
    }
    unexplained += 1;
    console.log(`  XX ${marker}`);
    console.log(`       IN THE BUNDLE but no product source at ${REV} carries it`);
    console.log(`       files mentioning it: ${files.length ? files.join(', ') : 'NONE'}`);
  }
  if (unexplained) {
    console.log(`\n${unexplained} compiled string(s) are not explained by this tree.`);
    console.log('This bundle cannot be reproduced from its own source SHA: the build read a');
    console.log("working tree containing another lane's uncommitted work. The passport's");
    console.log('source coordinate names a tree that never produced these bytes.');
    return 2;
  }
  console.log('\nEvery compiled string traces to source in the same tree: the bundle is');
  console.log('reproducible from this commit.');
  return 0;
}

async function checkSurface() {
  console.log(`\nREBUILD CONSTRAINT — ${BASE || `tree @ ${ROOT}`}\n`);
  const cache = new Map();
  let missing = 0;
  let unreadable = 0;

  for (const row of ROWS) {
    const results = [];
    for (const chk of row.checks) {
      if (!cache.has(chk.surface)) {
        try { cache.set(chk.surface, await readSurface(chk.surface)); }
        catch (e) { cache.set(chk.surface, { error: String(e.message || e) }); }
      }
      const s = cache.get(chk.surface);
      if (s.error) { results.push({ state: 'UNREADABLE', detail: s.error }); continue; }
      results.push({ state: chk.re.test(s.body) ? 'present' : 'ABSENT', detail: `${chk.surface} ${String(chk.re)}` });
    }
    const verdict = results.some((r) => r.state === 'UNREADABLE') ? 'UNREADABLE'
      : results.every((r) => r.state === 'present') ? 'CARRIED' : 'NOT CARRIED';
    if (verdict === 'NOT CARRIED') missing += 1;
    if (verdict === 'UNREADABLE') unreadable += 1;
    console.log(`  ${verdict === 'CARRIED' ? 'ok' : 'XX'} ${row.id.padEnd(22)} ${row.commit}  ${verdict}`);
    console.log(`       ${row.owner}: ${row.what}`);
    results.filter((r) => r.state !== 'present').forEach((r) => console.log(`       -> ${r.state}: ${r.detail}`));
  }

  if (unreadable) {
    console.log(`\n${unreadable} row(s) unreadable — harness or door failure, not a verdict on the build.`);
    return 1;
  }
  if (missing) {
    console.log(`\n${missing} row(s) NOT CARRIED. Nothing on this surface can be cited about tonight's work.`);
    return 2;
  }
  console.log('\nEvery required row is carried. This surface can be cited.');
  return 0;
}

const code = MODE === 'discriminating' ? proveDiscriminating()
  : MODE === 'provenance' ? proveProvenance()
    : await checkSurface();
process.exit(code);
