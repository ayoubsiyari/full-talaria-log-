/**
 * Shows the probe selftest can fail.
 *
 * Each mutant breaks one thing the b126 canary got wrong, or one thing the fix
 * depends on, and the selftest must go RED. A mutant that survives means the
 * cells do not bind to the behaviour they claim to cover — which is the exact
 * class the PO has caught three times in twelve hours: a gate reading green
 * while its subject was absent, exempt, or never executed.
 *
 * Run: node scripts/lib/canary-realm-probes.mutants.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'canary-realm-probes.mjs'), 'utf8');
const selftest = path.join(here, 'canary-realm-probes.selftest.mjs');

const mutants = [
  {
    name: 'the runway gate never rewinds — the b126 defect itself',
    find: 'if (before.fromEnd != null && before.fromEnd < runway && typeof rs.seekTo === \'function\') {',
    replace: 'if (false && before.fromEnd != null && before.fromEnd < runway && typeof rs.seekTo === \'function\') {',
  },
  {
    name: 'fromEnd is off by one, so a parked realm reads as having a bar left',
    find: 'fromEnd: raw !== null && rs.currentIndex != null ? raw - 1 - rs.currentIndex : null,',
    replace: 'fromEnd: raw !== null && rs.currentIndex != null ? raw - rs.currentIndex : null,',
  },
  {
    name: 'the prototype fallback is reported as the product path, hiding the override',
    find: 'startedVia = rs.isPlaying ? \'prototype-fallback\' : \'would-not-start\';',
    replace: 'startedVia = rs.isPlaying ? \'instance-play\' : \'would-not-start\';',
  },
  {
    name: 'the window collapses back to one slice — the 8-second reading',
    find: 'const sliceCount = Math.max(1, Math.round(sampleMs / sliceMs));',
    replace: 'const sliceCount = 1;',
  },
  {
    name: 'a still realm carries no diagnosis, so its zero has no cause',
    find: 'diagnosis: (moved && b && b.playing) ? null : why(r.w),',
    replace: 'diagnosis: null,',
  },
  {
    name: 'the census misses an in-flight fetch, so an unsettled page reads settled',
    find: 'panLoading: !!(ch && ch._panLoading),',
    replace: 'panLoading: false,',
  },
  {
    name: 'a realm without a replay system is skipped instead of named',
    find: 'if (!rs) { out.push({ realm: r.name, state: \'NO_REPLAY_SYSTEM\' }); continue; }',
    replace: 'if (!rs) { continue; }',
  },
  {
    name: 'a seek that throws is swallowed and the realm reports PREPARED',
    find: 'state: seekThrew ? \'SEEK_THREW\' : \'PREPARED\',',
    replace: 'state: \'PREPARED\',',
  },
  {
    name: 'the session start is seeded at the tail — the pin this whole run is about',
    find: 'const at = Math.min(Math.max(0, Math.floor(bars.length * fractionIn)), bars.length - 1);',
    replace: 'const at = bars.length - 1;',
  },
  {
    name: 'the seeded start is not written where enterReplayMode reads it',
    find: 'ch.backtestingSession = { ...(ch.backtestingSession || {}), startDate };',
    replace: 'ch.__unusedBacktestingSession = { startDate };',
  },
];

let survived = 0;
for (const mutant of mutants) {
  if (!source.includes(mutant.find)) {
    console.log(`  ANCHOR_BROKEN  ${mutant.name}`);
    console.log('        The line this mutant edits is no longer in the module. That is not a pass:');
    console.log('        a mutant that cannot be applied proves nothing about the cells.');
    survived += 1;
    continue;
  }
  const file = path.join(here, `.mutant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`);
  fs.writeFileSync(file, source.replace(mutant.find, mutant.replace));
  let red = false;
  let detail = '';
  try {
    execFileSync(process.execPath, [selftest], {
      env: { ...process.env, CANARY_PROBES_MODULE: `./${path.basename(file)}` },
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (error) {
    red = true;
    const out = String(error.stdout || '');
    detail = (out.match(/^ {2}FAIL {2}.+$/gm) || []).slice(0, 2).map((s) => s.trim()).join(' | ');
  } finally {
    fs.rmSync(file, { force: true });
  }
  if (red) console.log(`  KILLED  ${mutant.name}\n          caught by: ${detail || 'a failing cell'}`);
  else {
    survived += 1;
    console.log(`  SURVIVED  ${mutant.name}`);
    console.log('        The selftest passed against a module that is wrong here. Add a cell.');
  }
}

console.log(`\n  ${mutants.length - survived}/${mutants.length} mutants killed`);
process.exitCode = survived ? 1 : 0;
