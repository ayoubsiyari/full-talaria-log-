/**
 * SEAL-EVIDENCE-01 — what does each gate in a lane actually observe?
 *
 * Source evidence cannot bless served bytes. Three failures in twelve hours
 * shared one shape: a check that passed while the thing it named was never
 * exercised. FRAME-01 green with replay exempt, two mirrored gates green while
 * never executing, two panel-state gates that parsed nothing.
 *
 * A gate reading `chart v 1.4/chart/modules/replay-system.js` proves what the
 * SOURCE says. It cannot prove what the sealed bundle does, for three separate
 * reasons: the bundle is compiled from that source and may not match it (b124),
 * the source may be gated off by a flag whose shipped default the gate never
 * reads, and the served surface may be an older deploy entirely (b122 today).
 *
 * Classification is by what the file reaches for, not by what it claims:
 *   SERVED_RUNTIME          drives a browser against a served build
 *   SERVED_BYTES_STATIC     reads the compiled bundle, but does not run it
 *   STATIC_ONLY_SOURCE_GATE reads source only
 *
 * And two hazards that cut across all three:
 *   CONFIGURED_INTENT   asserts a kill-switch default from source text rather
 *                       than observing the behaviour it selects
 *   NO_REFUSAL_STATE    no named state for "I could not run", so a failure to
 *                       execute is indistinguishable from a subject defect
 *
 *   node scripts/seal-evidence-classify.mjs
 *   node scripts/seal-evidence-classify.mjs --lane=A --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** A-lane rows and the gate each one would be presented with at the seal. */
const LANES = {
  A: [
    ['ORDER-01B step ladder / speed as steps per wall-second', 'chart v 1.4/chart/modules/order-01b-market-cursor.test.mjs'],
    ['ORDER-01B forming renderer on the step clock', 'chart v 1.4/chart/modules/forming-renderer-step-clock.test.mjs'],
    ['ORDER-01B tick-path deletion / candle-only playback', 'chart v 1.4/chart/modules/tick-off-candle-only-playback.test.mjs'],
    ['ORDER-01B 1d tick-speed routing', 'chart v 1.4/chart/modules/b75-po-v5-1d-tick-speed-routing.red.test.mjs'],
    ['ORDER-01B timeframe downshift anchor', 'chart v 1.4/chart/modules/tf-downshift-anchor.test.mjs'],
    ['A2 resolveBar transcript', 'chart v 1.4/chart/modules/a2-resolvebar-transcript.test.mjs'],
    ['A3 speed/fill journal parity', 'chart v 1.4/chart/modules/a3-speed-fill-journal-parity.test.mjs'],
    ['A3 daily bucketing on session day (17:00 NY)', 'chart v 1.4/chart/modules/a3-daily-money-path-boundary.test.mjs'],
    ['TZ-01 tool labels follow the selected timezone', 'chart v 1.4/chart/modules/tz01-tool-label-timezone.test.mjs'],
    ['TZ-01 drawing market-time persistence', 'chart v 1.4/chart/modules/drawing-market-time-persist.test.mjs'],
    ['SHELL-PLAY override receiver (handed to B)', 'chart v 1.4/chart/modules/shell-play-override-receiver.test.mjs'],
    ['__talariaEffectiveRate read-back (market-s per wall-s)', 'scripts/order01b-readback-canary.mjs'],
    ['ORDER-01B play at the loaded edge', 'scripts/order01b-edge-play-probe.mjs'],
  ],
};

const SIGNALS = {
  browser: [/puppeteer/, /heap-cycle-browser/, /bootLayout/, /react-parity-lib/, /page\.goto/, /newPage\(/],
  servedBundle: [/dist-v9/, /talaria-v9-live/],
  sourceRead: [/readFileSync\([^)]*\.jsx?['"`]/, /readFileSync\(\s*[A-Z_]+\s*[,)]/, /chart v 1\.4\/chart\/modules/, /homepage\/public\/chart/],
  refusal: [/GATE_VACUOUS/, /ANCHOR_BROKEN/, /_ABSENT/, /_NOT_RUN/, /PARSE_CHECKER/, /throw new Error\(`?['"`]?[A-Z][A-Z0-9_]{4,}/],
  killSwitchText: [/__TALARIA_[A-Z0-9_]+/],
  provenance: [/captureProvenance/, /headSha/, /buildIdOnDisk/],
};
const hit = (src, list) => list.some((re) => re.test(src));

function classify(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return { rel, missing: true };
  const src = fs.readFileSync(full, 'utf8');
  const browser = hit(src, SIGNALS.browser);
  const bundle = hit(src, SIGNALS.servedBundle);
  const evidence = browser ? 'SERVED_RUNTIME' : bundle ? 'SERVED_BYTES_STATIC' : 'STATIC_ONLY_SOURCE_GATE';
  return {
    rel,
    evidence,
    // A gate that reads a flag name out of source is describing what the code
    // is configured to do. Only running it shows what it does.
    configuredIntent: !browser && hit(src, SIGNALS.killSwitchText),
    hasRefusalState: hit(src, SIGNALS.refusal),
    hasProvenance: hit(src, SIGNALS.provenance),
    mirrored: fs.existsSync(path.join(ROOT, rel.replace('chart v 1.4/chart/', 'homepage/public/chart/'))),
  };
}

function main() {
  const lane = (process.argv.find((a) => a.startsWith('--lane=')) || '--lane=A').slice(7);
  const rows = LANES[lane];
  if (!rows) throw new Error(`no manifest for lane ${lane}`);
  const out = rows.map(([row, rel]) => ({ row, ...classify(rel) }));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ lane, at: new Date().toISOString(), rows: out }, null, 2));
    return;
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('EVIDENCE', 24) + pad('INTENT?', 9) + pad('REFUSAL?', 10) + 'ROW');
  for (const r of out) {
    if (r.missing) { console.log(`${pad('GATE_ABSENT_FROM_TREE', 24)}${pad('-', 9)}${pad('-', 10)}${r.row}  (${r.rel})`); continue; }
    console.log(
      pad(r.evidence, 24)
      + pad(r.configuredIntent ? 'yes' : '-', 9)
      + pad(r.hasRefusalState ? 'yes' : 'NONE', 10)
      + r.row,
    );
  }
  const tally = {};
  for (const r of out) tally[r.missing ? 'GATE_ABSENT_FROM_TREE' : r.evidence] = (tally[r.missing ? 'GATE_ABSENT_FROM_TREE' : r.evidence] || 0) + 1;
  console.log('\n' + Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('   '));
  console.log(`no refusal state: ${out.filter((r) => !r.missing && !r.hasRefusalState).length}`);
  console.log(`asserts configured intent without running it: ${out.filter((r) => r.configuredIntent).length}`);
}

main();
