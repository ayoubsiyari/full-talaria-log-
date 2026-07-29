#!/usr/bin/env node
/**
 * REALM-SURVIVAL-V1 gate.
 *
 * Fails when a torn-down multichart panel realm is still reachable from product
 * references. Realms held only by our own inspector session are reported and NOT
 * graded — see scripts/lib/realm-survival.mjs for why that distinction is the
 * whole point of the instrument.
 *
 * usage:
 *   node --max-old-space-size=10240 scripts/realm-survival-gate.mjs \
 *     --snapshot=<file.heapsnapshot> [--json] [--allow-survivors=N]
 *
 * Snapshot ceiling: a 3-cycle run produces ~310-360 MB and parses; a 6-cycle run
 * produces ~560 MB and exceeds V8's max string length, so it cannot be read at
 * all. Keep runs at 3 cycles and say so rather than truncating silently.
 *
 * kill switch: TALARIA_DISABLE_REALM_SURVIVAL_V1=1 reports SKIPPED and exits 0.
 */

import fs from 'node:fs';

import {
  summarizeRealmSurvival,
  assessRealmSurvival,
  formatRealmSurvival,
  realmSurvivalEnabled,
  REALM_SURVIVAL_SIGNATURE,
  REALM_SURVIVAL_DISABLE_ENV,
} from './lib/realm-survival.mjs';

export function parseRealmSurvivalArgs(argv = []) {
  const options = { snapshot: null, json: false, allowedPeerSurvivors: 0 };
  for (const arg of argv) {
    if (arg.startsWith('--snapshot=')) options.snapshot = arg.slice('--snapshot='.length);
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--allow-survivors=')) {
      options.allowedPeerSurvivors = Number(arg.split('=')[1]) || 0;
    }
  }
  return options;
}

export function runRealmSurvivalGate({ snapshot, allowedPeerSurvivors = 0, env = process.env } = {}) {
  if (!realmSurvivalEnabled(env)) {
    return {
      signature: REALM_SURVIVAL_SIGNATURE,
      status: 'SKIPPED',
      ok: true,
      reason: `${REALM_SURVIVAL_DISABLE_ENV}=1 — instrument disabled by kill switch`,
    };
  }
  if (!snapshot || !fs.existsSync(snapshot)) {
    return {
      signature: REALM_SURVIVAL_SIGNATURE,
      status: 'RED',
      ok: false,
      reason: `snapshot not found: ${snapshot || '(none given)'}`,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(snapshot));
  } catch (error) {
    const bytes = fs.statSync(snapshot).size;
    return {
      signature: REALM_SURVIVAL_SIGNATURE,
      status: 'RED',
      ok: false,
      reason: `snapshot unparseable at ${(bytes / 1048576).toFixed(1)} MB `
        + `(V8 max string length binds above ~500 MB — use 3 cycles): ${error?.message || error}`,
    };
  }
  const census = summarizeRealmSurvival(parsed);
  const assessment = assessRealmSurvival(census, { allowedPeerSurvivors });
  return {
    signature: REALM_SURVIVAL_SIGNATURE,
    status: assessment.ok ? 'GREEN' : 'RED',
    ok: assessment.ok,
    snapshot,
    snapshotBytes: fs.statSync(snapshot).size,
    census: {
      realmsFound: census.realmsFound,
      identity: census.identity,
      counts: census.counts,
      survivors: (census.peerProductRetained || []).map((r) => ({
        label: r.label, panel: r.panel, cycle: r.cycle, fileId: r.fileId, path: r.path,
      })),
      inspectorRetained: (census.peerInspectorRetained || []).map((r) => r.label),
    },
    assessment,
    text: formatRealmSurvival(census, assessment),
  };
}

const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  const options = parseRealmSurvivalArgs(process.argv.slice(2));
  const result = runRealmSurvivalGate(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.status}: ${result.text || result.reason}`);
  process.exit(result.ok ? 0 : 1);
}
