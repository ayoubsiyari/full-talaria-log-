/**
 * TOOL-01: a hard heap cap on every long-running harness process.
 *
 * The crash cause is named: 16,387 MB of Node across three processes at 99% system memory. Node's default
 * old-space limit is derived from total system RAM - 4,288 MB on this host - so three harness processes can
 * each grow into multiple gigabytes before V8 feels any pressure at all, and the first thing to die is not
 * necessarily the process at fault.
 *
 * A flag on a command line is a REQUEST. This module makes it a CONDITION: the process verifies the flag
 * was given AND that V8 applied it, and refuses to run long otherwise. That is the same silent-no-op class
 * as a PowerShell .Replace() against a non-matching anchor, an option passed to a function that does not
 * accept it, and a repo grep standing in for an HTTP request - all three of which have already cost this
 * project a run.
 */
import v8 from 'node:v8';

export const DEFAULT_CAP_MB = 1024;

export function currentHeapLimitMB() {
  return Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
}

/**
 * Refuses to continue when the cap is absent or inert. Call at the top of any process expected to live for
 * hours, BEFORE it opens a browser or a run file.
 */
export function assertHeapCap({ capMB = DEFAULT_CAP_MB, label = 'harness', exitCode = 4 } = {}) {
  const limitMB = currentHeapLimitMB();

  // TWO checks, because either alone is wrong, and my first pass was wrong in BOTH directions.
  //
  // A threshold alone gives FALSE POSITIVES: heap_size_limit is old-space PLUS the young generation, so
  // --max-old-space-size=1024 reports 1216 MB. My first tolerance of 1.15x refused a CORRECTLY capped
  // process - a gate that blocks valid work, which is as much a defect as one that passes invalid work.
  //
  // A threshold alone also gives FALSE NEGATIVES at large caps: this host's uncapped default is 4288 MB,
  // so a --heapCapMB=4096 run would sail through the threshold having never been given the flag at all.
  //
  // So: the flag must be PRESENT (read exactly, not inferred), and the limit it produced must be PLAUSIBLE.
  const flagRe = /^--max[-_]old[-_]space[-_]size=(\d+)$/;
  const fromArgv = process.execArgv.map((a) => flagRe.exec(a)).find(Boolean);
  const fromEnv = String(process.env.NODE_OPTIONS || '').split(/\s+/).map((a) => flagRe.exec(a)).find(Boolean);
  const declared = fromArgv ? Number(fromArgv[1]) : (fromEnv ? Number(fromEnv[1]) : null);

  const YOUNG_GEN_HEADROOM_MB = 320;

  if (declared == null) {
    console.error('REFUSING TO RUN LONG WITHOUT A HEAP CAP (TOOL-01).');
    console.error(`  ${label}: no --max-old-space-size flag. V8 reports an uncapped old-space limit of ${limitMB} MB.`);
    console.error(`  Relaunch as:  node --max-old-space-size=${capMB} <script> ...`);
    console.error('  16,387 MB of Node across three processes at 99% system memory is the crash this prevents.');
    process.exit(exitCode);
  }
  if (declared > capMB) {
    console.error(`REFUSING TO RUN LONG (TOOL-01): heap cap ${declared} MB exceeds the ${capMB} MB this process asked for.`);
    process.exit(exitCode);
  }
  if (limitMB > declared + YOUNG_GEN_HEADROOM_MB) {
    console.error(`REFUSING TO RUN LONG (TOOL-01): --max-old-space-size=${declared} was passed but V8 reports ${limitMB} MB.`);
    console.error('  The flag was accepted and did not take effect, so this would run uncapped under a correct-looking launch line.');
    process.exit(exitCode);
  }

  return { ok: true, limitMB, capMB, declaredMB: declared, label };
}

/**
 * A cap stops a process growing without bound; it does not stop it dying AT the cap. Over ten hours that
 * distinction matters, so this watches heap pressure and calls back before V8 starts thrashing, letting the
 * caller finish its artifact and exit cleanly rather than being killed mid-write.
 */
export function watchHeap({ capMB = DEFAULT_CAP_MB, warnAtPercent = 80, everyMs = 60000, onPressure }) {
  let warned = false;
  const timer = setInterval(() => {
    const used = process.memoryUsage();
    const heapMB = Math.round(used.heapUsed / (1024 * 1024));
    const pct = (heapMB / capMB) * 100;
    if (pct >= warnAtPercent && !warned) {
      warned = true;
      onPressure?.({
        heapUsedMB: heapMB,
        rssMB: Math.round(used.rss / (1024 * 1024)),
        capMB,
        percentOfCap: +pct.toFixed(1),
        why: `Harness heap at ${heapMB} MB of a ${capMB} MB cap (${pct.toFixed(0)}%). Finishing cleanly beats being killed mid-write.`,
      });
    }
    if (pct < warnAtPercent * 0.8) warned = false; // re-arm once it recovers
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
