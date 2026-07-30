/**
 * FREEZE-GATE-V1 — one entry point for the gate that decides freeze, with a
 * kill-switch back to the previous gate.
 *
 * CKPT-01 requires a kill-switch on a risky landing, and swapping the gate that
 * decides freeze is a risky landing: if the new gate is wrong, the freeze decision is
 * wrong. So the swap is flippable.
 *
 *   TALARIA_FREEZE_GATE unset or 'conf01'  -> CONF01-DURATION-GATE-V1 (the new bar)
 *   TALARIA_FREEZE_GATE=single-pair        -> the retained SINGLE-PAIR-SOAK-V1
 *
 * FLAG-01: the ABSENT property is tested — with the variable unset, the CONF-01 gate
 *          runs. That is the state the freeze actually uses.
 * FLAG-02: flippable without reload or rebuild — it is an environment variable read
 *          per invocation, and the OFF path runs RETAINED BYTES from
 *          .ckpt/<checkpoint>/ rather than a rebuild from source.
 * FLAG-03: the OFF state is verified against a working-product assertion — the old
 *          gate must produce a report with samples and a fitted trend, not merely
 *          fail to start the new one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const FREEZE_GATE_SIGNATURE = 'FREEZE-GATE-V1';
export const FREEZE_GATE_ENV = 'TALARIA_FREEZE_GATE';
export const FREEZE_GATE_DEFAULT = 'conf01';

/**
 * Resolve which gate runs. Anything unrecognised is an error rather than a silent
 * fallback: a mistyped kill-switch that quietly runs the new gate would be the worst
 * of both states.
 */
export function resolveFreezeGate(env = process.env, { retainedRoot = '.ckpt' } = {}) {
  const raw = String(env[FREEZE_GATE_ENV] ?? '').trim().toLowerCase();
  const mode = raw === '' ? FREEZE_GATE_DEFAULT : raw;
  if (mode === 'conf01') {
    return {
      mode,
      flagState: raw === '' ? 'ABSENT (default)' : 'explicit',
      script: 'scripts/conf01-duration-gate.mjs',
      signature: 'CONF01-DURATION-GATE-V1',
      source: 'working tree',
      isTheBar: true,
    };
  }
  if (mode === 'single-pair') {
    const dirs = fs.existsSync(retainedRoot)
      ? fs.readdirSync(retainedRoot).filter((d) => d.startsWith('pre-conf01-gate-swap')).sort()
      : [];
    const retained = dirs.length ? path.join(retainedRoot, dirs[dirs.length - 1]) : null;
    return {
      mode,
      flagState: 'explicit OFF',
      script: retained ? path.join(retained, 'scripts', 'single-pair-soak.mjs') : null,
      signature: 'SINGLE-PAIR-SOAK-V1',
      source: retained ? `retained artifact ${retained}` : 'MISSING retained artifact',
      retainedRoot: retained,
      isTheBar: false,
      caveat: 'same-pair carries no acceptance weight under CONF-01; this is the rollback path, not a substitute bar',
    };
  }
  throw new Error(
    `${FREEZE_GATE_ENV}=${JSON.stringify(raw)} is not a known gate (expected 'conf01' or 'single-pair')`,
  );
}

function runNode(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const invokedDirectly = process.argv[1] && /freeze-gate\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const resolved = resolveFreezeGate();
  console.error(`[freeze-gate] mode=${resolved.mode} flag=${resolved.flagState} signature=${resolved.signature} source=${resolved.source} isTheBar=${resolved.isTheBar}`);
  if (!resolved.script || !fs.existsSync(resolved.script)) {
    console.error(`[freeze-gate] script missing: ${resolved.script}`);
    process.exit(2);
  }
  const passthrough = process.argv.slice(2);
  process.exit(await runNode(resolved.script, passthrough));
}
