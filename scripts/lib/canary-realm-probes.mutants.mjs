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
  // GOVERNOR-REF-01. A launch gate that cannot be shown to refuse is a launch
  // gate that will let the wrong layout through, and the whole point of it is
  // that nobody will be watching when it matters.
  {
    name: 'GOVERNOR-REF-01 passes a mixed-timeframe layout — the PO defect itself',
    find: '  const offenders = read.filter((r) => r.chartTimeframeSeconds !== minDisplayedSeconds);',
    replace: '  const offenders = [];',
  },
  {
    name: 'GOVERNOR-REF-01 takes the coarsest displayed timeframe as the reference',
    find: '  const minDisplayedSeconds = Math.min(...refs);',
    replace: '  const minDisplayedSeconds = Math.max(...refs);',
  },
  {
    name: 'GOVERNOR-REF-01 skips an unreadable reference instead of refusing on it',
    find: '  if (unreadable.length) {',
    replace: '  if (false && unreadable.length) {',
  },
  {
    name: 'GOVERNOR-REF-01 folds the focus cause into the generic mismatch, losing the named state',
    find: '  if (Number.isFinite(probe.focusedTimeframeSeconds)\n    && probe.focusedTimeframeSeconds !== minDisplayedSeconds) {',
    replace: '  if (false && Number.isFinite(probe.focusedTimeframeSeconds)\n    && probe.focusedTimeframeSeconds !== minDisplayedSeconds) {',
  },
  {
    name: 'GOVERNOR-REF-01 treats an absent probe as a pass',
    find: "    return fail('NO_REALMS_READ', 'no realm exposed a replay system, so no reference could be read');",
    replace: "    return { state: 'REFERENCE_MATCHES_MIN_DISPLAYED', ok: true, why: 'nothing to check', offenders: [] };",
  },
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
    name: 'the session floor is never checked, so a clamped seek reads as a plain failed rewind',
    find: 'if (before.sessionStartIndex != null && before.sessionStartIndex > seekedTo) {',
    replace: 'if (false && before.sessionStartIndex != null && before.sessionStartIndex > seekedTo) {',
  },
  {
    name: 'seekHeld is asserted rather than verified',
    find: 'seekHeld = (rs.currentIndex ?? null) === seekedTo;',
    replace: 'seekHeld = true;',
  },
  {
    name: 'the series length is not carried per slice, so a replacement stays invisible',
    find: 'rawBars: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,\n        currentIndex: rs.currentIndex ?? null,',
    replace: 'rawBars: null,\n        currentIndex: null,',
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

  /* ------------------------- GOVERNOR-REF-01, focus held for a whole run --- */

  {
    // The defect my own first version had: focus checked at the two ends of the
    // window, so a click that lands while the workload arms sets the rate and
    // then sits perfectly still through the measurement.
    name: 'focus is checked across the window only, not from before the arm',
    find: '  const first = samples[0];\n  const moved = samples.find((s) => s.focusedPanel !== first.focusedPanel);',
    replace: '  const first = samples[samples.length - 2];\n  const moved = samples.slice(-2).find((s) => s.focusedPanel !== first.focusedPanel);',
  },
  {
    name: 'focus moving during the run is reported as held',
    find: "      state: 'FOCUS_MOVED_DURING_RUN',\n      ok: false,",
    replace: "      state: 'FOCUS_HELD',\n      ok: true,",
  },
  {
    name: 'unreadable focus is treated as held rather than refused',
    find: "      state: 'FOCUS_UNREADABLE',\n      ok: false,",
    replace: "      state: 'FOCUS_HELD',\n      ok: true,",
  },
  {
    // probeFocusAndGovernor reports its own failure as this string in the same
    // field a panel name goes in, so three equal failures satisfy equality.
    name: "the FOCUS_UNREADABLE sentinel is accepted as a panel name",
    find: "  const unreadable = samples.filter((s) => !s || s.focusedPanel == null || s.focusedPanel === 'FOCUS_UNREADABLE');",
    replace: '  const unreadable = samples.filter((s) => !s || s.focusedPanel == null);',
  },
  {
    name: 'an unsampled invariant passes for want of anything to disagree with',
    find: '  if (!Array.isArray(samples) || samples.length < 2) {',
    replace: '  if (!Array.isArray(samples) || samples.length < 0) {',
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
