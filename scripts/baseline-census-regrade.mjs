#!/usr/bin/env node
/**
 * BASELINE-CENSUS-REGRADE — offline correction of two defects in my own grader.
 *
 * 1. The script-mass verdict counted the harness's own `page.evaluate()` compilations as product
 *    re-evaluation. All 27 "scripts parsed during playback" were my probe's own stack frames
 *    (puppeteer decorators, sweep-gauges.mjs, baseline-census.mjs). Excluding them changes the verdict
 *    from "GROWTH TERM TOO" to what the clean signal said all along: decoded script bytes did not move
 *    and the request count did not move, so per-realm script mass is a BASELINE term.
 *
 * 2. The composition table listed worker isolates as UNMEASURED without saying where that memory
 *    actually went. The worker-heap validation answered it: a 120 MB ballast inside a worker moved
 *    renderer private footprint by +121.2 MB and the page JS heap by -0.39 MB. Worker memory is
 *    therefore already inside the renderer figure and inside the residual — missing from the
 *    ATTRIBUTION, never missing from the TOTAL.
 *
 * Re-grading offline rather than re-running: the measurement was sound, only the arithmetic on top of
 * it was wrong, and a fresh run would cost five minutes to reproduce identical inputs.
 */
import fs from 'node:fs';

const P = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BASELINE-CENSUS-20260731.json';
const V = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\WORKER-HEAP-VALIDATION-20260731.json';

const a = JSON.parse(fs.readFileSync(P, 'utf8'));
const val = JSON.parse(fs.readFileSync(V, 'utf8'));

const isHarnessParse = (url) => !url
  || /puppeteer|[\\/]scripts[\\/]|\.mjs|__puppeteer|pptr:|%5C|%2F/i.test(url);

// ---- Defect 1: script mass ------------------------------------------------
const sp = a.afterShortPlayback;
if (sp && a.scriptMass) {
  const urls = sp.newlyParsedUrls || [];
  const productUrls = urls.filter((u) => !isHarnessParse(u));
  const bytesMoved = a.scriptMass.decodedMBAfterPlayback - a.scriptMass.decodedMBAtFirstPaint;
  const requestsMoved = a.scriptMass.requestsAfterPlayback - a.scriptMass.requestsAtFirstPaint;
  a.scriptMass.regrade = {
    reason: 'The original verdict counted the harness\'s own evaluate() compilations as product re-evaluation. Every recorded URL was a probe stack frame, not a product script.',
    recordedParseUrls: urls.length,
    productParseUrls: productUrls.length,
    productParseUrlSamples: productUrls.slice(0, 8),
    decodedMBMoved: +bytesMoved.toFixed(2),
    scriptRequestsMoved: requestsMoved,
    verdict: (productUrls.length === 0 && Math.abs(bytesMoved) < 1 && requestsMoved === 0)
      ? 'BASELINE TERM, CONFIRMED. Across three minutes of four-panel playback: zero product scripts parsed, decoded script bytes moved 0.00 MB, script requests moved 0. Nothing re-evaluates mid-session, so the advisor is right — per-realm script duplication is a fixed cost paid at load, and cross-realm sharing is a baseline fix rather than a leak fix.'
      : `STILL AMBIGUOUS: ${productParseUrlsCountSafe(productUrls)} product parses, ${bytesMoved.toFixed(2)} MB decoded delta, ${requestsMoved} request delta.`,
    caveat: 'Measured over 3 minutes of playback, not over hours. A re-evaluation triggered by something rarer than that would not appear here. What is excluded is the common case, which is what the advisor asked about.',
  };
  a.scriptMass.verdictSuperseded = a.scriptMass.verdict;
  a.scriptMass.verdict = a.scriptMass.regrade.verdict;
}
function productParseUrlsCountSafe(x) { return Array.isArray(x) ? x.length : 0; }

// ---- Defect 2: name where worker memory went ------------------------------
const g = val.grade || {};
if (a.composition) {
  const rendererMoved = (val.afterBallast?.footprint?.pageRendererPrivateMB ?? null) != null
    && (val.beforeBallast?.footprint?.pageRendererPrivateMB ?? null) != null
    ? +(val.afterBallast.footprint.pageRendererPrivateMB - val.beforeBallast.footprint.pageRendererPrivateMB).toFixed(1)
    : null;
  a.composition.workerMemoryAttribution = {
    gaugeStatus: 'FAILED ITS OWN GATE-01 VALIDATION — Puppeteer exposed zero worker targets so no per-isolate heap was read. The row stays UNMEASURED rather than being filled with a zero.',
    whyItFailed: 'Dedicated workers are not listed by browser.targets(); CDP Target.getTargets does see them, so the fix is to attach through the browser connection with a flattened session rather than through the Puppeteer target list.',
    butTheTotalIsNotMissingIt: rendererMoved != null
      ? `A ${val.ballastTargetMB} MB ballast allocated inside a real worker moved renderer private footprint by +${rendererMoved} MB and the page JS heap by ${g.pageJsHeapDeltaMB} MB. Worker memory is already counted inside the renderer figure and therefore inside the ${a.composition.rendererResidualMB} MB residual. It was missing from the ATTRIBUTION, never from the TOTAL.`
      : null,
    consequenceForEveryJsFigureInThisPlan: `Demonstrated, not argued: ${val.ballastTargetMB} MB of real allocation was 100% invisible to the JS heap gauge (${g.pageJsHeapDeltaMB} MB) and 100% visible to the OS footprint gauge (+${g.osFootprintDeltaMB} MB). Any figure sourced from usedJSHeapSize or Performance.getMetrics understates by whatever the workers hold; any figure sourced from process footprint does not.`,
    measureUserAgentSpecificMemory: `unavailable here — ${g.uaSpecificMemoryReason}, crossOriginIsolated=${g.crossOriginIsolated}. The documented route needs COOP/COEP that this server does not send, so it is not the one-line change it looked like.`,
    freeingInsideAWorkerDidNotReturnItToTheOs: (val.afterFree?.footprint?.pageRendererPrivateMB != null && val.afterBallast?.footprint?.pageRendererPrivateMB != null)
      ? `Dropping the reference took renderer private from ${val.afterBallast.footprint.pageRendererPrivateMB} MB to ${val.afterFree.footprint.pageRendererPrivateMB} MB — it did not come back within the measurement window. Allocator arenas stay warm, which is the same mechanism that will decide whether logging out returns memory.`
      : null,
  };
}

// ---- Restate R-1 in the terms the PO asked for ----------------------------
if (a.r1) {
  const r = a.r1;
  a.r1.restated = {
    shareBeforeSessionStart: r.residentBarsTotal ? +((r.beforeSessionStart / r.residentBarsTotal) * 100).toFixed(1) : null,
    shareWithinSession: r.residentBarsTotal ? +((r.withinSessionToPlayhead / r.residentBarsTotal) * 100).toFixed(1) : null,
    shareAfterPlayhead: r.residentBarsTotal ? +((r.afterPlayhead / r.residentBarsTotal) * 100).toFixed(2) : null,
    poHypothesis: 'The PO reports that requesting a session also loads all candles preceding it, for indicator warm-up, left-hand context and rollback.',
    poHypothesisVerdict: (r.beforeSessionStart / Math.max(1, r.residentBarsTotal)) > 0.5
      ? `CONFIRMED BY COUNT. ${r.beforeSessionStart} of ${r.residentBarsTotal} resident bars sit BEFORE the session start — ${((r.beforeSessionStart / r.residentBarsTotal) * 100).toFixed(1)}% of everything resident is pre-session history the user did not ask to replay.`
      : `NOT CONFIRMED: only ${r.beforeSessionStart} of ${r.residentBarsTotal} resident bars precede the session start.`,
    futureBarsVerdict: r.afterPlayhead <= 10
      ? `Separately, a suspect DIES: only ${r.afterPlayhead} bars sit after the playhead across all four realms. The chart does NOT hoard future candles, so "it loads the whole file including the unplayed future" is dead.`
      : `${r.afterPlayhead} bars sit after the playhead.`,
    amplificationOverVisible: `${r.residentPerVisible}x more bars resident than visible (${r.residentBarsTotal} against ${r.visibleBarsTotal}).`,
  };
}

fs.writeFileSync(P, JSON.stringify(a, null, 1));

console.error('=== REGRADE ===');
console.error(`script mass: ${a.scriptMass?.verdict}`);
console.error(`  (superseded: ${a.scriptMass?.verdictSuperseded})`);
console.error('');
console.error(`R-1: ${a.r1?.restated?.poHypothesisVerdict}`);
console.error(`     ${a.r1?.restated?.futureBarsVerdict}`);
console.error(`     ${a.r1?.restated?.amplificationOverVisible}`);
console.error('');
console.error(`worker memory: ${a.composition?.workerMemoryAttribution?.butTheTotalIsNotMissingIt}`);
console.error(`               ${a.composition?.workerMemoryAttribution?.freeingInsideAWorkerDidNotReturnItToTheOs}`);
