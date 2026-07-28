import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PO_CPU_AB_TIMEOUT_MS,
  PO_CPU_AB_SIGNATURE,
  runPoCpuAbBenchmarkGate,
  runPoCpuAbBenchmarkPreflight,
} from './lib/po-cpu-ab-benchmark.mjs';

export function parsePoCpuAbBenchmarkArgs(argv = process.argv.slice(2)) {
  const options = {
    timeoutMs: DEFAULT_PO_CPU_AB_TIMEOUT_MS,
    requireBrowser: false,
    short: false,
    mutant: false,
    acceptanceOnly: false,
  };
  for (const arg of argv) {
    if (arg === '--require-browser') options.requireBrowser = true;
    else if (arg === '--short' || arg === '--ci-short') options.short = true;
    else if (arg === '--mutant') options.mutant = true;
    else if (arg === '--acceptance-only') options.acceptanceOnly = true;
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg.startsWith('--p2-ms=')) {
      const p2IdleMs = Number(arg.slice('--p2-ms='.length));
      options.timings = { ...(options.timings || {}), p2IdleMs, shortened: true };
      options.short = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  if (options.timings?.p2IdleMs != null
      && (!Number.isFinite(options.timings.p2IdleMs) || options.timings.p2IdleMs < 0)) {
    throw new Error('invalid --p2-ms');
  }
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result;
  try {
    const options = parsePoCpuAbBenchmarkArgs();
    result = options.acceptanceOnly || options.mutant
      ? await runPoCpuAbBenchmarkGate(options)
      : await runPoCpuAbBenchmarkPreflight(options);
  } catch (error) {
    result = {
      ok: false,
      status: 'RED',
      signature: PO_CPU_AB_SIGNATURE,
      error: String(error?.message || error),
    };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
