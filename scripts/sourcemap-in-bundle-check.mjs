#!/usr/bin/env node
/**
 * Investigation queue: "source-map-in-bundle — one look."
 *
 * The suspicion is that shipped bundles carry inline source maps, which would inflate every byte the browser
 * downloads, parses and holds as script source - and script source residency is one of the few remaining
 * homes for the per-bar arena I have not fully accounted for.
 *
 * One pass. Boards the roster or is written down UNPROVEN with the blocking question named.
 */
import fs from 'node:fs';

const ORIGIN = 'http://31.97.192.82:3000';
const PATHS = [
  '/chart/dist-v9/assets/talaria-v9-live.js',
  '/chart/chart.js',
  '/chart/modules/chart-indicators-full.js',
  '/chart/modules/order-manager.js',
  '/chart/modules/replay-system.js',
  '/chart/modules/indicator-ui.js',
  '/chart/multichart-prod/multichart-manager.js',
  '/chart/dist-v9/sw.js',
];

const report = {
  signature: 'SOURCEMAP-IN-BUNDLE-CHECK-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — HTTP fetch of served bytes, no browser.',
  origin: ORIGIN,
  question: 'Do the served bundles carry inline source maps (data: URI) or external sourceMappingURL comments, and what do they cost?',
  files: [],
};

let totalBytes = 0;
let totalMapBytes = 0;

for (const p of PATHS) {
  const row = { path: p };
  try {
    const res = await fetch(ORIGIN + p);
    const text = await res.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    row.status = res.status;
    row.kb = +(bytes / 1024).toFixed(1);
    totalBytes += bytes;

    // Inline map: //# sourceMappingURL=data:application/json;base64,....
    const inline = text.match(/\/\/[#@]\s*sourceMappingURL=data:[^\s'"]+/);
    const external = text.match(/\/\/[#@]\s*sourceMappingURL=(?!data:)([^\s'"]+)/);
    row.inlineSourceMap = !!inline;
    row.externalSourceMapRef = external ? external[1].slice(0, 80) : null;
    if (inline) {
      const mapBytes = Buffer.byteLength(inline[0], 'utf8');
      row.inlineMapKb = +(mapBytes / 1024).toFixed(1);
      row.inlineMapShareOfFilePercent = +((mapBytes / bytes) * 100).toFixed(1);
      totalMapBytes += mapBytes;
    }
    // sourcesContent inside an inline map is what actually duplicates the whole source tree.
    row.carriesSourcesContent = /"sourcesContent"\s*:/.test(text);
    if (external) {
      try {
        const mapUrl = external[1].startsWith('http') ? external[1] : `${ORIGIN}${p.replace(/[^/]+$/, '')}${external[1]}`;
        const mres = await fetch(mapUrl);
        row.externalMapStatus = mres.status;
        if (mres.ok) {
          const mtext = await mres.text();
          row.externalMapKb = +(Buffer.byteLength(mtext, 'utf8') / 1024).toFixed(1);
          row.externalMapServed = true;
        } else {
          row.externalMapServed = false;
        }
      } catch (err) { row.externalMapStatus = `fetch failed: ${String(err.message).slice(0, 50)}`; }
    }
  } catch (err) {
    row.error = String(err.message).slice(0, 80);
  }
  report.files.push(row);
}

const inlineCount = report.files.filter((f) => f.inlineSourceMap).length;
const externalRefs = report.files.filter((f) => f.externalSourceMapRef);
const externalServed = externalRefs.filter((f) => f.externalMapServed === true);

report.totals = {
  filesChecked: report.files.length,
  totalServedKb: +(totalBytes / 1024).toFixed(1),
  filesWithInlineMaps: inlineCount,
  inlineMapKb: +(totalMapBytes / 1024).toFixed(1),
  inlineMapShareOfBytesPercent: totalBytes ? +((totalMapBytes / totalBytes) * 100).toFixed(2) : 0,
  filesReferencingExternalMaps: externalRefs.length,
  externalMapsActuallyServed: externalServed.length,
};

report.verdict = inlineCount > 0
  ? `BOARDS THE ROSTER: ${inlineCount} of ${report.files.length} served files carry INLINE source maps worth ${report.totals.inlineMapKb} KB (${report.totals.inlineMapShareOfBytesPercent}% of served bytes). Inline maps are parsed and held as script source by the renderer, so this is resident cost on every realm, multiplied by four in CONF-01.`
  : externalServed.length > 0
    ? `UNPROVEN, AND THE BLOCKING QUESTION IS NAMED: no inline maps, but ${externalServed.length} file(s) reference an EXTERNAL map that the server does actually serve. External maps are NOT downloaded unless devtools is open, so they cost users nothing and cost my measurements nothing - I run headless without devtools. Blocking question: does any lane measure with devtools open? If so their byte counts include maps and mine do not.`
    : `NOT PRESENT — the suspect is dead. Zero inline source maps across ${report.files.length} served files totalling ${report.totals.totalServedKb} KB${externalRefs.length ? `, and the ${externalRefs.length} external reference(s) are not served (404), so nothing is fetchable even with devtools open` : ', and zero sourceMappingURL references of any kind'}. Script residency is not inflated by maps and this cannot be part of the per-bar arena.`;

fs.writeFileSync('c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SOURCEMAP-IN-BUNDLE-20260801.json', JSON.stringify(report, null, 1));
for (const f of report.files) {
  console.log(`${String(f.kb ?? '?').padStart(8)} KB  inline=${f.inlineSourceMap ? 'YES' : 'no '}  ext=${f.externalSourceMapRef ? (f.externalMapServed ? 'SERVED' : 'ref-only') : 'no'}  ${f.path}`);
}
console.log(`\n${JSON.stringify(report.totals, null, 1)}\n\n${report.verdict}`);
