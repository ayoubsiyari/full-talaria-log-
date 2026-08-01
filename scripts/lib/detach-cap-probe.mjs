/**
 * A one-shot child used by the DETACH-01 self-test to prove TOOL-01 is BOUND rather than present.
 *
 * It reports what V8 actually applied in a process launched through the real launchDetached path. A test
 * that greps detach01.mjs for the flag string would pass on a build where the flag is constructed and then
 * dropped; this cannot, because the number it writes comes from the child's own V8.
 */
import fs from 'node:fs';
import v8 from 'node:v8';

const out = process.argv[2];
fs.writeFileSync(out, JSON.stringify({
  heapLimitMB: Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024)),
  execArgv: process.execArgv,
  at: new Date().toISOString(),
}, null, 1));
