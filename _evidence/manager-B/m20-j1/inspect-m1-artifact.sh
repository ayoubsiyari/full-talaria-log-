#!/usr/bin/env bash
# Read D's M1 artifact back and surface the fields that explain the verdict, so the handoff to D
# carries the reason rather than only the status.
set -uo pipefail
cd /root/m1-b120-brun || exit 1
A=_evidence/manager-D/M1-B120-REAL-APP-HARNESS-20260731.json
echo "=== artifact exists ==="; ls -la "$A"

node - "$A" <<'JS'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

console.log('\n=== verdict / provenance ===');
console.log('signature        ', r.signature);
console.log('measuredAt       ', r.measuredAt);
console.log('expectedBuild    ', r.expectedBuild);
console.log('buildId          ', r.buildId);
console.log('finalUrl         ', r.finalUrl);
console.log('authProvided     ', r.authProvided);
console.log('verdict          ', r.verdict.status, '-', r.verdict.reason);

console.log('\n=== auth route (the part that was failing for D) ===');
const ar = r.authRoute || {};
console.log('ready            ', JSON.stringify(ar.ready));
console.log('journal          ', JSON.stringify(ar.journal && {
  path: ar.journal.path, status: ar.journal.status,
  trades: ar.journal.trades, tradesWithScreenshot: ar.journal.tradesWithScreenshot,
}));
if (ar.error) console.log('authRoute.error  ', ar.error);

console.log('\n=== process footprint ===');
console.log(JSON.stringify(r.processes, null, 2));

console.log('\n=== image surface ===');
const s = r.surface;
for (const k of ['imageCount', 'fullResolutionImages', 'thumbnailImages', 'dataUrlImages',
  'journalLikeImages', 'decodedPixelFloorBytes', 'maxImageDecodedBytes', 'stable', 'stableSamples']) {
  console.log(String(k).padEnd(22), s[k]);
}
console.log('decodedPixelFloor MB  ', (s.decodedPixelFloorBytes / 1048576).toFixed(2));

const hist = {};
for (const x of s.rows) hist[x.srcKind] = (hist[x.srcKind] || 0) + 1;
console.log('\nsrcKind histogram     ', JSON.stringify(hist));

console.log('\n=== the single full-resolution image (would have forced RED had the journal surface been detected) ===');
console.log(JSON.stringify(s.rows.filter((x) => x.naturalWidth >= 1000 || x.naturalHeight >= 700), null, 2));

console.log('\n=== frames present ===');
const frames = {};
for (const x of s.rows) frames[x.frameUrl] = (frames[x.frameUrl] || 0) + 1;
for (const [u, n] of Object.entries(frames)) console.log(String(n).padStart(4), u);

console.log('\n=== sample of the 160 thumbnail-sized images ===');
console.log(JSON.stringify(s.rows.filter((x) => x.naturalWidth > 0 && x.naturalWidth <= 320).slice(0, 3), null, 2));
JS
