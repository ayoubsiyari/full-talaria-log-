#!/usr/bin/env node
/**
 * SETTLE-COMPLIANCE-ROSTER — publishes which instruments take phase-clean readings and which do not,
 * so nobody has to read an instrument's source to decide whether its artifact is trustworthy.
 *
 * The failure this documents: `settle-protocol.mjs` V1 forced collection and never stopped the page.
 * 26 instruments inherited that. The four that got it right each wrote their own local `pauseAll`,
 * because no shared one existed. QUIESCE-01 fixes it centrally; this roster shows the propagation and
 * names what is still outstanding.
 *
 * STATES, kept distinct because they mean different things about the artifacts already on disk:
 *   QUIESCE_VIA_PROTOCOL  calls readUnderSettleProtocol and does not opt out — inherits the fix.
 *   QUIESCE_DECLARED_OFF  calls it with quiesceFirst:false AND a stated reason. Deliberately live.
 *   QUIESCE_LOCAL         pauses itself before collecting. Correct, predates the central fix.
 *   NOT_QUIESCENT         forces collection with no pause anywhere. Readings are phase-corrupt.
 *   NO_FORCED_COLLECTION  does not force collection; out of scope for this roster.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

const FORCES_GC = /collectGarbage|forceCollection|readUnderSettleProtocol/;
const USES_PROTOCOL = /readUnderSettleProtocol\s*\(/;
const OPTS_OUT = /quiesceFirst\s*:\s*false/;
const OPT_OUT_REASON = /quiesceOptOutReason\s*:\s*['"`]/;
const LOCAL_PAUSE = /pauseAll|pauseAllRealms|setPlaying\s*\([^)]*false|rs\.pause\s*\(/;

export function classify(source) {
  const s = String(source || '');
  if (!FORCES_GC.test(s)) return { state: 'NO_FORCED_COLLECTION', phaseClean: null };
  if (USES_PROTOCOL.test(s)) {
    if (OPTS_OUT.test(s)) {
      return OPT_OUT_REASON.test(s)
        ? { state: 'QUIESCE_DECLARED_OFF', phaseClean: false,
            note: 'deliberately measures a live page and says so; readings carry the reason' }
        : { state: 'NOT_QUIESCENT', phaseClean: false,
            note: 'opts out of quiescence without a stated reason' };
    }
    return { state: 'QUIESCE_VIA_PROTOCOL', phaseClean: true, note: 'inherits QUIESCE-01' };
  }
  if (LOCAL_PAUSE.test(s)) {
    return { state: 'QUIESCE_LOCAL', phaseClean: true,
      note: 'pauses itself; predates the central fix and could now delegate' };
  }
  return { state: 'NOT_QUIESCENT', phaseClean: false,
    note: 'forces collection with no pause; readings are two random-phase samples of a sawtooth' };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.mjs') && !e.name.includes('selftest')) out.push(p);
  }
  return out;
}

function main() {
  const rows = [];
  for (const file of walk(SCRIPTS)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const c = classify(fs.readFileSync(file, 'utf8'));
    if (c.state === 'NO_FORCED_COLLECTION') continue;
    rows.push({ instrument: rel, ...c });
  }
  rows.sort((a, b) => (a.state === b.state ? a.instrument.localeCompare(b.instrument) : a.state.localeCompare(b.state)));

  const tally = rows.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {});
  const artifact = {
    gate: 'SETTLE-COMPLIANCE-ROSTER',
    generatedAt: new Date().toISOString(),
    localOffset: '+01:00',
    protocol: 'SETTLE-PROTOCOL-V2 (QUIESCE-01)',
    tally,
    phaseCleanCount: rows.filter((r) => r.phaseClean === true).length,
    phaseCorruptCount: rows.filter((r) => r.phaseClean === false).length,
    howToReadAnArtifact: {
      QUIESCE_VIA_PROTOCOL: 'readings carry quiescent/heapRoseAcrossCollectionMB; grade with SETTLE-CRITERION-V2',
      QUIESCE_LOCAL: 'paused, but may not record it; check the artifact for a pause field before trusting absolutes',
      NOT_QUIESCENT: 'absolutes are one random-phase sample of a sawtooth; differences within one curve may survive',
    },
    rows,
  };

  const out = path.join(ROOT, '_evidence', 'manager-C', 'settle-compliance-roster.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(artifact, null, 2));

  console.log(`[settle-roster] ${rows.length} instruments force collection`);
  for (const [state, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state.padEnd(22)} ${n}`);
  }
  console.log(`[settle-roster] phase-clean ${artifact.phaseCleanCount} / phase-corrupt ${artifact.phaseCorruptCount}`);
  console.log(`[settle-roster] wrote ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
  return artifact.phaseCorruptCount > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
