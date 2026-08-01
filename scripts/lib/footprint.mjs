/**
 * THE footprint gauge. One implementation, imported by everything.
 *
 * OS private working set summed over every process the browser owns, via SystemInfo.getProcessInfo ->
 * Get-Process. Not performance.memory (one isolate, live objects only, blind to V8's committed arena)
 * and not a CDP heap number. This is the gauge behind the 2,747.6 / 2,709.3 MB matched-bars comparison,
 * so every figure taken through it is directly comparable to the published ones.
 *
 * It lives here rather than inside a script because the soak and N1 must read the SAME gauge: a
 * heavy-vs-fresh comparison across two subtly different implementations would measure the difference
 * between the implementations. Two copies of the seal list already produced two digests for one build
 * once tonight, and that is the same mistake one level down.
 *
 * The renderer split rides along because 96.8% of renderer memory sits in ONE process here, and a total
 * that silently became four-way would change what the number means without changing its value.
 */
import { readOsFootprints } from '../process-memory-census.mjs';

export async function readFootprint(browser) {
  try {
    const cdp = await browser.target().createCDPSession();
    const info = await cdp.send('SystemInfo.getProcessInfo');
    await cdp.detach().catch(() => {});
    const procs = info.processInfo || [];
    const fps = await readOsFootprints(procs.map((p) => p.id));
    let total = 0;
    let pageRenderer = 0;
    let rendererCount = 0;
    const byType = {};
    for (const p of procs) {
      const fp = fps[p.id];
      if (!fp) continue;
      total += fp.privateMB;
      const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
      byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
      if (/renderer/i.test(p.type)) {
        rendererCount += 1;
        if (fp.privateMB > pageRenderer) pageRenderer = fp.privateMB;
      }
    }
    // A footprint of zero is what this platform returns when the read fails, and zero is a number that
    // would fit a slope quite happily. Null it instead.
    if (!(total > 0)) return { footprintTotalMB: null, footprintReadFailed: true };
    return {
      footprintTotalMB: +total.toFixed(1),
      footprintByType: byType,
      pageRendererMB: +pageRenderer.toFixed(1),
      rendererProcesses: rendererCount,
      processesSeen: procs.length,
    };
  } catch (err) {
    return { footprintTotalMB: null, footprintReadFailed: String(err && err.message).slice(0, 90) };
  }
}
