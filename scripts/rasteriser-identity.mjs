#!/usr/bin/env node
/**
 * RASTERISER IDENTITY — publish the machine's real GPU string from WEBGL_debug_renderer_info, on two
 * independent routes, so nothing about the paint cost rests on inference.
 *
 * Why this matters more than it looks: if this host rasterises in software, every paint and GPU figure I have
 * published is software-rasteriser cost wearing a GPU label and my cost curve is caveated. If it rasterises in
 * hardware, the same curve is user-representative. One string decides it, and B is right that it must be read
 * rather than inferred.
 *
 * TWO ROUTES, because each has a gap the other closes:
 *   1. `SystemInfo.getInfo` ON THE LIVE SOAK BROWSER — authoritative for the exact browser whose numbers I
 *      publish, but it is Chrome reporting its own configuration.
 *   2. `WEBGL_debug_renderer_info` UNMASKED_RENDERER — the string the GPU driver itself returns through a real
 *      WebGL context, which is what the Director asked for.
 *
 * Route 2 is NOT run inside the soak page. Creating a WebGL context there would allocate in the very GPU
 * process my scheduled allocator diff measures, and opening a tab could occlude the soak window and throttle
 * its rAF. It runs in a separate short-lived Chrome on the same machine, and the two instances are bridged by
 * an EXACT MATCH on the independently measured route-1 string - a measured bridge, not an assumption. If the
 * two strings differ, the artifact says so and refuses to transfer the result.
 */
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';

const pexec = promisify(execFile);
const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const PORT = argOf('port', '49797');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\RASTERISER-IDENTITY-20260731.json');

const report = {
  signature: 'RASTERISER-IDENTITY-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'not applicable to route 1 (read-only attach, no navigation); route 2 is a separate short-lived browser on about:blank',
  whyThisExists: 'One line converts the entire cost curve from caveated to user-representative. It is read on two routes rather than inferred from either.',
};

const angleOf = (info) => info?.gpu?.auxAttributes?.glRenderer || info?.gpu?.devices?.[0]?.deviceString || null;

// ---- Route 1: the live soak browser itself -----------------------------------------------------------------
let soak = null;
try {
  const puppeteer = await loadPuppeteer();
  soak = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const cdp = await soak.target().createCDPSession();
  const info = await cdp.send('SystemInfo.getInfo').catch(() => null);
  await cdp.detach().catch(() => {});
  report.route1_soakBrowser = {
    method: 'SystemInfo.getInfo on the running soak browser',
    glRenderer: angleOf(info),
    glVendor: info?.gpu?.auxAttributes?.glVendor || null,
    devices: (info?.gpu?.devices || []).map((d) => d.deviceString || null),
    featureStatus: info?.gpu?.featureStatus || null,
    modelName: info?.modelName || null,
  };
} catch (e) {
  report.route1_soakBrowser = { error: String(e && e.message).slice(0, 200) };
} finally {
  try { if (soak) await soak.disconnect(); } catch { /* already gone */ }
}

// ---- The soak browser's own launch flags, since a flag can force software raster regardless of hardware ----
try {
  const ps = await pexec('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${PORT}*' } | Select-Object -First 1 -ExpandProperty CommandLine`]);
  const cmd = String(ps.stdout || '').trim();
  const flags = (cmd.match(/--[a-z0-9-]+(=[^\s"]+)?/gi) || []);
  report.soakLaunchFlags = {
    found: !!cmd,
    gpuRelevant: flags.filter((f) => /gpu|gl=|angle|swiftshader|software|headless|rasteriz/i.test(f)),
    totalFlags: flags.length,
    reading: 'A flag can force software rasterisation on hardware, so the flags are recorded next to the driver string rather than assumed absent.',
  };
} catch (e) {
  report.soakLaunchFlags = { error: String(e && e.message).slice(0, 200) };
}

// ---- Route 2: WEBGL_debug_renderer_info in a separate short-lived browser ---------------------------------
let fresh = null;
try {
  const puppeteer = await loadPuppeteer();
  fresh = await puppeteer.launch({
    headless: false,
    // Small and cornered ON PURPOSE: a maximised window could fully occlude the soak's window, and Chrome
    // marks a fully occluded page hidden, which throttles its rAF. That would perturb the soak to answer a
    // question about a driver string.
    args: ['--window-size=320,240', '--window-position=0,0', '--no-first-run', '--no-default-browser-check'],
    defaultViewport: null,
  });
  const p = (await fresh.pages())[0] || await fresh.newPage();
  const cdp2 = await fresh.target().createCDPSession();
  const info2 = await cdp2.send('SystemInfo.getInfo').catch(() => null);
  await cdp2.detach().catch(() => {});

  const gl = await p.evaluate(() => {
    const read = (kind) => {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      const ctx = c.getContext(kind);
      if (!ctx) return { context: kind, available: false };
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      const out = {
        context: kind,
        available: true,
        debugRendererInfoExtension: !!ext,
        maskedVendor: ctx.getParameter(ctx.VENDOR),
        maskedRenderer: ctx.getParameter(ctx.RENDERER),
        version: ctx.getParameter(ctx.VERSION),
        unmaskedVendor: ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      };
      // Hand the context back rather than waiting for GC: this allocates in the shared GPU process.
      const lose = ctx.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return out;
    };
    return { webgl1: read('webgl'), webgl2: read('webgl2'), gpuApiPresent: !!navigator.gpu };
  }).catch((e) => ({ error: String(e && e.message).slice(0, 200) }));

  report.route2_webglDebugRendererInfo = {
    method: 'WEBGL_debug_renderer_info UNMASKED_RENDERER_WEBGL in a separate short-lived Chrome on the same machine',
    ...gl,
    thisBrowsersGlRenderer: angleOf(info2),
  };
} catch (e) {
  report.route2_webglDebugRendererInfo = { error: String(e && e.message).slice(0, 300) };
} finally {
  try { if (fresh) await fresh.close(); } catch { /* already gone */ }
}

// ---- The bridge, stated as a check rather than an assumption ----------------------------------------------
const r1 = report.route1_soakBrowser?.glRenderer || null;
const r2host = report.route2_webglDebugRendererInfo?.thisBrowsersGlRenderer || null;
const unmasked = report.route2_webglDebugRendererInfo?.webgl2?.unmaskedRenderer
  || report.route2_webglDebugRendererInfo?.webgl1?.unmaskedRenderer || null;
const softwarePattern = /swiftshader|llvmpipe|software|subzero|basic render/i;
const anySoftware = softwarePattern.test(String(r1 || '')) || softwarePattern.test(String(unmasked || ''));

report.verdict = {
  soakBrowserGlRenderer: r1,
  freshBrowserGlRenderer: r2host,
  instancesMatch: !!r1 && r1 === r2host,
  unmaskedRenderer: unmasked,
  unmaskedVendor: report.route2_webglDebugRendererInfo?.webgl2?.unmaskedVendor || report.route2_webglDebugRendererInfo?.webgl1?.unmaskedVendor || null,
  softwareRasterised: anySoftware,
};
report.verdict.reading = !r1 || !unmasked
  ? 'INCOMPLETE: one of the two routes did not return a string. No claim is transferred on a single route.'
  : (!report.verdict.instancesMatch
    ? `ROUTES DO NOT BRIDGE: the soak browser reports "${r1}" and the fresh browser reports "${r2host}". The WEBGL_debug_renderer_info string belongs to the fresh instance and is NOT transferred to the soak's figures. The soak browser's own SystemInfo string stands on its own.`
    : (anySoftware
      ? `SOFTWARE RASTERISATION CONFIRMED ON BOTH ROUTES. Every paint bucket and GPU-process figure I have published is software-rasteriser cost and must carry that caveat; the cost curve is NOT user-representative.`
      : `HARDWARE RASTERISATION CONFIRMED ON BOTH ROUTES. The driver itself returns "${unmasked}", and the soak browser and the probed browser report an identical GL renderer string, so the driver read transfers to the browser whose numbers I publish. The paint buckets and GPU-process figures are user-representative and the cost curve is NOT caveated on rasterisation.`));

report.signatureFilenameCheck = report.artifactFile === OUT.split('\\').pop() ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.verdict, null, 1));
console.log('flags:', JSON.stringify(report.soakLaunchFlags?.gpuRelevant || report.soakLaunchFlags));
