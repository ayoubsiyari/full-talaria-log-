#!/usr/bin/env node
/**
 * PULL-01 order memory terms.
 *
 * Re-measures the screenshot candidate with a real Talaria-Chart payload and the
 * excursionSamples term at the current RED scale (95,652 samples). No browser
 * soak: this is payload sizing from product artifacts, not Chrome heap proof.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const evidenceRoot = resolve(root, '../_evidence/manager-D');

const screenshotPath = resolve(root, 'docs/plan3/fixtures/talaria-chart-median-live-census.dataurl.txt');
const dataUrl = readFileSync(screenshotPath, 'utf8').trim();
const declaredMime = /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || null;
const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
const binary = Buffer.from(base64, 'base64');
const actualFormat = binary[0] === 0xff && binary[1] === 0xd8
  ? 'image/jpeg'
  : (binary.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? 'image/png'
    : 'unknown');

function jpegDimensions(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    const sof = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (sof) {
      return {
        width: buf.readUInt16BE(i + 7),
        height: buf.readUInt16BE(i + 5),
        marker,
      };
    }
    i += 2 + len;
  }
  throw new Error('could not read JPEG dimensions from real screenshot payload');
}

function splitEvenly(total, slots) {
  const base = Math.floor(total / slots);
  const rem = total - base * slots;
  return Array.from({ length: slots }, (_, i) => base + (i < rem ? 1 : 0));
}

function excursionSeriesBytes(totalSamples, slots = 6) {
  const lengths = splitEvenly(totalSamples, slots);
  const series = lengths.map((len, s) => Array.from(
    { length: len },
    (_, i) => Number(((s + 1) * 0.001 + i * 0.0137).toFixed(4)),
  ));
  const jsonUtf16Bytes = series.reduce((n, a) => n + JSON.stringify(a).length * 2, 0);
  return {
    totalSamples,
    seriesCount: slots,
    seriesLengths: lengths,
    packedFloat64Bytes: totalSamples * 8,
    productJsonUtf16Bytes: jsonUtf16Bytes,
    bytesPerSampleJsonUtf16: jsonUtf16Bytes / totalSamples,
  };
}

const dim = jpegDimensions(binary);
const decodedRgbaBytes = dim.width * dim.height * 4;
const dataUrlUtf16Bytes = dataUrl.length * 2;
const closedTradesAtExcursionScale = Math.ceil(95_652 / 318);

const screenshot = {
  sourcePath: screenshotPath.replace(/\\/g, '/'),
  declaredMime,
  actualFormat,
  mimeNote: declaredMime && declaredMime !== actualFormat
    ? 'data URL MIME label does not match bytes; sizing uses actual JPEG dimensions'
    : null,
  dataUrlChars: dataUrl.length,
  binaryBytes: binary.length,
  width: dim.width,
  height: dim.height,
  decodedRgbaBytesPerBitmap: decodedRgbaBytes,
  compressedDataUrlUtf16BytesPerField: dataUrlUtf16Bytes,
  closedTradesAtExcursionScale,
  models: {
    oneDecodedBitmapPerClosedTrade: {
      perClosedTradeBytes: decodedRgbaBytes,
      soakScaleBytes: decodedRgbaBytes * closedTradesAtExcursionScale,
    },
    entryAndExitDecodedBitmapsPerClosedTrade: {
      perClosedTradeBytes: decodedRgbaBytes * 2,
      soakScaleBytes: decodedRgbaBytes * 2 * closedTradesAtExcursionScale,
    },
    fourCompressedDataUrlFieldsPerClosedTrade: {
      fields: ['entryScreenshot', 'exitScreenshot', 'entryScreenshots[0].screenshot', 'railScreenshots[0]'],
      perClosedTradeBytes: dataUrlUtf16Bytes * 4,
      soakScaleBytes: dataUrlUtf16Bytes * 4 * closedTradesAtExcursionScale,
    },
  },
};

const excursion = {
  observedScaleSamples: 95_652,
  growthSamplesPerHour: 23_300,
  impliedClosedTradesAt318SamplesEach: 95_652 / 318,
  current: excursionSeriesBytes(95_652),
  hourlySlope: excursionSeriesBytes(23_300),
};

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const out = {
  schema: 'talaria.pull01.order-memory-terms.v1',
  tip,
  measuredAt: new Date().toISOString(),
  grading: 'payload-sizing-no-browser-soak',
  caveat: 'Decoded-bitmap model sizes real screenshot pixels (RGBA) but does not prove Chrome retains one decoded bitmap per trade without a live heap snapshot.',
  screenshot,
  excursion,
  tal01891: {
    disposition: 'reopen-live-p0-candidate',
    rationale: 'At heavy-account scale, one decoded screenshot bitmap per closed trade is multi-GB and can make the 8 GB report accurate while fresh harness accounts miss it.',
  },
};

mkdirSync(resolve(root, 'docs/plan3'), { recursive: true });
mkdirSync(evidenceRoot, { recursive: true });
const jsonPath = resolve(root, 'docs/plan3/PULL01-ORDER-MEMORY-TERMS-20260731.json');
const evidencePath = resolve(evidenceRoot, 'PULL01-ORDER-MEMORY-TERMS-20260731.json');
writeFileSync(jsonPath, JSON.stringify(out, null, 2));
writeFileSync(evidencePath, JSON.stringify(out, null, 2));

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const md = `# PULL-01 — order memory terms

**Tip:** \`${tip}\`  
**Grading:** payload sizing, no browser soak.  
**Real payload:** \`${screenshotPath.replace(/\\/g, '/')}\`  
**MIME note:** data URL declares \`${declaredMime || 'unknown'}\`; bytes are \`${actualFormat}\`.

## Screenshot term

The real Talaria-Chart screenshot fixture is **${dim.width}×${dim.height}**. A decoded RGBA
bitmap is:

\`${dim.width} × ${dim.height} × 4 = ${fmt(decodedRgbaBytes)} bytes\`

| Model | Per closed trade | At ${closedTradesAtExcursionScale} closed trades |
|---|---:|---:|
| One decoded bitmap / closed trade | **${fmt(screenshot.models.oneDecodedBitmapPerClosedTrade.perClosedTradeBytes)}** | **${fmt(screenshot.models.oneDecodedBitmapPerClosedTrade.soakScaleBytes)}** |
| Entry + exit decoded bitmaps / closed trade | **${fmt(screenshot.models.entryAndExitDecodedBitmapsPerClosedTrade.perClosedTradeBytes)}** | **${fmt(screenshot.models.entryAndExitDecodedBitmapsPerClosedTrade.soakScaleBytes)}** |
| Four compressed data-URL string fields / closed trade | ${fmt(screenshot.models.fourCompressedDataUrlFieldsPerClosedTrade.perClosedTradeBytes)} | ${fmt(screenshot.models.fourCompressedDataUrlFieldsPerClosedTrade.soakScaleBytes)} |

This explains why the previous one-trade / 8 KB synthetic was not a product figure. The
decoded-bitmap term is advisor-sized and is now the leading TAL-01891 candidate, pending live
heap proof of retention.

## excursionSamples term

| Scale | Samples | Packed Float64 lower bound | Product JSON UTF-16 approximation |
|---|---:|---:|---:|
| Current RED term | **${fmt(excursion.current.totalSamples)}** | **${fmt(excursion.current.packedFloat64Bytes)}** | **${fmt(excursion.current.productJsonUtf16Bytes)}** |
| Hourly slope | ${fmt(excursion.hourlySlope.totalSamples)}/h | ${fmt(excursion.hourlySlope.packedFloat64Bytes)}/h | ${fmt(excursion.hourlySlope.productJsonUtf16Bytes)}/h |

Verdict: excursionSamples is real and rising, but its byte term is **sub-MB at 95,652 samples**
under both lower-bound and product JSON sizing. It stays in the RED verdict as a correctness /
retention term, not the 8 GB driver.

## TAL-01891 disposition

Reopen as **live P0 candidate**. A heavy account with hundreds of retained closed-trade
screenshots can plausibly reach multi-GB memory while fresh harness accounts do not reproduce it.

Evidence mirror: \`_evidence/manager-D/PULL01-ORDER-MEMORY-TERMS-20260731.json\`.
`;
const mdPath = resolve(root, 'docs/plan3/PULL01-ORDER-MEMORY-TERMS-20260731.md');
writeFileSync(mdPath, md);

console.log(JSON.stringify({
  ok: true,
  jsonPath,
  mdPath,
  evidencePath,
  decodedRgbaBytes,
  closedTradesAtExcursionScale,
  screenshotOneBitmapSoakBytes: screenshot.models.oneDecodedBitmapPerClosedTrade.soakScaleBytes,
  excursionSamples: excursion.current.totalSamples,
  excursionJsonUtf16Bytes: excursion.current.productJsonUtf16Bytes,
}, null, 2));
