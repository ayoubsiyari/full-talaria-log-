/**
 * STYLE-WRITER-CENSUS-V1 — name the writer behind the stylesheet invalidations.
 *
 * "62 invalidations per second" and "35 setProperty sites in chart.js" are two
 * different facts, and the gap between them is which sites actually FIRE at
 * runtime and which of those invalidate the whole document rather than one
 * element. A custom property written on :root invalidates every element that
 * inherits it; the same call on a leaf element invalidates one node. Counting
 * call sites cannot tell those apart. This hooks the writes and records both.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - every CSSStyleDeclaration.setProperty / removeProperty / cssText write, every
 *     style attribute write, and every insertRule / deleteRule, in the host and in
 *     every frame, hooked BEFORE app scripts run
 *   - the CALL SITE (file:line:col from the stack) and the PROPERTY written
 *   - the TARGET: document root, head/body, or a leaf element — which is what
 *     decides the invalidation's blast radius
 *   - Chrome's own recalc work over the same window, so the writer count is tied
 *     to actual style cost rather than asserted against it
 * WHAT IT CANNOT SEE:
 *   - writes from CSS animations, transitions or the UA stylesheet: those need no
 *     JavaScript and appear only in the recalc figures
 *   - stack frames stripped by minification beyond file:line
 */
import fs from 'node:fs';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { summarizeTraceThreadCpu } from './lib/cpu-thread-census.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Blast radius, not call count, is what A needs to aim at.
 * A custom property on the document root re-resolves every inheriting element.
 */
export function classifyBlastRadius({ target, property }) {
  const isCustom = typeof property === 'string' && property.startsWith('--');
  if (target === 'stylesheet') return isCustom ? 'document-wide-custom-property' : 'document-wide-rule';
  if (target === ':root' || target === 'html') {
    return isCustom ? 'document-wide-custom-property' : 'document-wide-root-inline';
  }
  if (target === 'body' || target === 'head') return 'subtree-body';
  return 'single-element';
}

/** Rank writers by rate, and say what each one's radius is. */
export function summariseWriters(records, windowMs) {
  const bySite = new Map();
  for (const r of records || []) {
    const key = `${r.site}|${r.property}|${r.target}`;
    const prev = bySite.get(key) || {
      site: r.site,
      property: r.property,
      target: r.target,
      api: r.api,
      count: 0,
      distinctElements: new Set(),
    };
    prev.count += r.count != null ? r.count : 1;
    if (r.elementKey) prev.distinctElements.add(r.elementKey);
    bySite.set(key, prev);
  }
  const seconds = windowMs > 0 ? windowMs / 1000 : 0;
  const rows = [...bySite.values()].map((r) => ({
    site: r.site,
    api: r.api,
    property: r.property,
    target: r.target,
    blastRadius: classifyBlastRadius(r),
    count: r.count,
    perSecond: seconds > 0 ? +(r.count / seconds).toFixed(2) : null,
    distinctElements: r.distinctElements.size || null,
  })).sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const documentWide = rows.filter((r) => r.blastRadius.startsWith('document-wide'));
  return {
    windowMs,
    totalWrites: total,
    totalPerSecond: seconds > 0 ? +(total / seconds).toFixed(2) : null,
    documentWideWrites: documentWide.reduce((s, r) => s + r.count, 0),
    documentWidePerSecond: seconds > 0
      ? +(documentWide.reduce((s, r) => s + r.count, 0) / seconds).toFixed(2)
      : null,
    writers: rows.slice(0, 25),
  };
}

/**
 * Installed via evaluateOnNewDocument so it is in place before any app script.
 * Records are aggregated in-page: one entry per site+property+target, because a
 * per-call array would itself become the memory defect we are measuring.
 */
const HOOK_SOURCE = () => {
  const store = new Map();
  window.__styleWriterCensus = { store, enabled: true };
  const siteOf = () => {
    const stack = new Error().stack || '';
    const lines = stack.split('\n');
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || /__styleWriterCensus|styleWriterHook/.test(line)) continue;
      const m = line.match(/((?:https?:\/\/[^\s)]+|[a-zA-Z0-9_.-]+\.m?js)(?::\d+){1,2})/);
      if (m) return m[1].replace(/^https?:\/\/[^/]+/, '');
      if (i >= 3) return line.trim().slice(0, 120);
    }
    return '(unknown)';
  };
  const targetOf = (decl) => {
    try {
      const el = decl && decl.parentRule ? null : (decl && decl.__ownerElement) || null;
      if (el === null && decl && decl.parentRule) return 'stylesheet';
      const owner = el || (decl && decl.ownerNode) || null;
      if (!owner) return 'unknown';
      if (owner === document.documentElement) return ':root';
      if (owner === document.body) return 'body';
      if (owner === document.head) return 'head';
      return (owner.tagName || 'node').toLowerCase()
        + (owner.id ? `#${owner.id}` : '')
        + (owner.classList && owner.classList.length ? `.${owner.classList[0]}` : '');
    } catch (_) { return 'unknown'; }
  };
  const record = (api, property, target, elementKey) => {
    if (!window.__styleWriterCensus.enabled) return;
    const key = `${siteOf()}|${api}|${property}|${target}`;
    const row = store.get(key);
    if (row) { row.count += 1; if (elementKey) row.elements.add(elementKey); return; }
    store.set(key, {
      site: key.split('|')[0], api, property, target, count: 1, elements: new Set(elementKey ? [elementKey] : []),
    });
  };

  // Inline style objects do not expose their element, so tag it on first access.
  const styleGetter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')
    || Object.getOwnPropertyDescriptor(Element.prototype, 'style');
  if (styleGetter && styleGetter.get) {
    Object.defineProperty(HTMLElement.prototype, 'style', {
      configurable: true,
      get() {
        const decl = styleGetter.get.call(this);
        try { if (decl && !decl.__ownerElement) decl.__ownerElement = this; } catch (_) {}
        return decl;
      },
    });
  }

  const proto = CSSStyleDeclaration.prototype;
  const origSet = proto.setProperty;
  proto.setProperty = function styleWriterHookSet(prop, value, priority) {
    const target = targetOf(this);
    record('setProperty', String(prop), target, target);
    return origSet.call(this, prop, value, priority);
  };
  const origRemove = proto.removeProperty;
  proto.removeProperty = function styleWriterHookRemove(prop) {
    const target = targetOf(this);
    record('removeProperty', String(prop), target, target);
    return origRemove.call(this, prop);
  };
  const cssTextDesc = Object.getOwnPropertyDescriptor(proto, 'cssText');
  if (cssTextDesc && cssTextDesc.set) {
    Object.defineProperty(proto, 'cssText', {
      configurable: true,
      get: cssTextDesc.get,
      set(v) {
        const target = targetOf(this);
        record('cssText', '(bulk)', target, target);
        return cssTextDesc.set.call(this, v);
      },
    });
  }
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function styleWriterHookAttr(name, value) {
    if (String(name).toLowerCase() === 'style') {
      const key = (this.tagName || 'node').toLowerCase() + (this.id ? `#${this.id}` : '');
      record('setAttribute(style)', '(bulk)', this === document.documentElement ? ':root' : key, key);
    }
    return origSetAttr.call(this, name, value);
  };
  for (const api of ['insertRule', 'deleteRule']) {
    const orig = CSSStyleSheet.prototype[api];
    if (typeof orig !== 'function') continue;
    CSSStyleSheet.prototype[api] = function styleWriterHookRule(...args) {
      record(api, String(args[0] ?? '').slice(0, 60), 'stylesheet', 'stylesheet');
      return orig.apply(this, args);
    };
  }
};

const DRAIN = () => {
  const census = window.__styleWriterCensus;
  if (!census) return [];
  return [...census.store.values()].map((r) => ({
    site: r.site, api: r.api, property: r.property, target: r.target, count: r.count, elements: r.elements.size,
  }));
};
const RESET = () => {
  if (window.__styleWriterCensus) window.__styleWriterCensus.store.clear();
  return true;
};

async function drainAllFrames(page) {
  const out = [];
  for (const f of page.frames()) {
    const rows = await f.evaluate(DRAIN).catch(() => []);
    for (const r of rows) {
      out.push({
        ...r,
        elementKey: `${f === page.mainFrame() ? 'host' : 'panel'}:${r.target}`,
        frame: f === page.mainFrame() ? 'host' : 'panel',
      });
    }
  }
  return out;
}

/** Chrome's own style cost over the same window, so the writers tie to real work. */
async function measureRecalcWork(browserCdp, windowMs) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['blink', 'devtools.timeline', 'toplevel'] },
  });
  const started = Date.now();
  await sleep(windowMs);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - started;
  const census = summarizeTraceThreadCpu(events, { wallMs, topEventsPerThread: 25 });
  const main = (census.threads || []).find((t) => t.threadName === 'CrRendererMain');
  const pick = (re) => (main?.topEvents || []).filter((e) => re.test(e.name))
    .map((e) => ({ name: e.name, selfMs: e.selfMs, count: e.count, percentOfCore: e.percentOfCore }));
  return {
    wallMs,
    styleAndLayout: pick(/Style|Layout|Recalc|UpdateLayoutTree/i),
    mainThreadPercent: census.mainThreadPercent,
  };
}

/**
 * If the recalc rate exceeds the JS write rate, something other than a style
 * write is invalidating. Chrome's invalidation tracking names the reason and the
 * node, and carries the JS stack for layout invalidations, which is the call site
 * A actually needs.
 */
async function measureInvalidationReasons(browserCdp, windowMs) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'disabled-by-default-devtools.timeline.invalidationTracking',
        'devtools.timeline',
      ],
    },
  });
  const started = Date.now();
  await sleep(windowMs);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - started;

  const byReason = new Map();
  const stacks = new Map();
  for (const ev of events) {
    const name = String(ev?.name || '');
    if (!/InvalidationTracking/.test(name)) continue;
    const d = ev.args?.data || {};
    const key = `${name}|${d.reason || '(no reason)'}|${d.nodeName || d.nodeId || '(no node)'}`;
    byReason.set(key, (byReason.get(key) || 0) + 1);
    const frames = Array.isArray(d.stackTrace) ? d.stackTrace : [];
    for (const f of frames.slice(0, 2)) {
      const site = `${(f.url || '').replace(/^https?:\/\/[^/]+/, '')}:${f.lineNumber}:${f.columnNumber}${f.functionName ? ` (${f.functionName})` : ''}`;
      stacks.set(site, (stacks.get(site) || 0) + 1);
    }
  }
  const seconds = wallMs / 1000;
  const rows = [...byReason.entries()]
    .map(([key, count]) => {
      const [event, reason, node] = key.split('|');
      return { event, reason, node, count, perSecond: +(count / seconds).toFixed(1) };
    })
    .sort((a, b) => b.count - a.count);
  return {
    wallMs,
    totalInvalidationRecords: rows.reduce((s, r) => s + r.count, 0),
    topReasons: rows.slice(0, 15),
    topStacks: [...stacks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([site, count]) => ({ site, count, perSecond: +(count / seconds).toFixed(1) })),
  };
}

function parseArgs(argv) {
  const o = { out: null, windowMs: 15_000, speed: 60 };
  for (const a of argv) {
    if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--window-ms=')) o.windowMs = Number(a.split('=')[1]) || 15_000;
    else if (a.startsWith('--speed=')) o.speed = Number(a.split('=')[1]) || 60;
  }
  return o;
}

export async function runStyleWriterCensus({ windowMs = 15_000, speed = 60, outPath = null } = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('census requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });
  const arms = [];
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify({ partial: true, arms }, null, 1)); };
  try {
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await uiLoginDeployed(page, origin, email, password);
    await page.evaluate(() => {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `style-census-${Date.now()}`,
        instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
      }));
    });
    // Before any app script in any frame.
    await page.evaluateOnNewDocument(HOOK_SOURCE);
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page).catch(() => {});
    await waitForDistV9SingleReady(page, 180_000);
    await sleep(8_000);

    // Arm 1: boot cost. Everything written up to first idle, not reset.
    arms.push({ label: 'boot-to-idle', ...summariseWriters(await drainAllFrames(page), windowMs) });
    save();

    // Arm 2: idle. No interaction, no replay.
    for (const f of page.frames()) await f.evaluate(RESET).catch(() => {});
    await sleep(windowMs);
    arms.push({ label: 'idle', ...summariseWriters(await drainAllFrames(page), windowMs) });
    save();

    // Arm 3: replay playing, which is where the 62/s was observed.
    const armed = await page.evaluate((s) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { ok: false };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        return { ok: !!rs.isPlaying, active: !!rs.isActive };
      } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
    }, speed);
    await sleep(4_000);
    for (const f of page.frames()) await f.evaluate(RESET).catch(() => {});
    const recalcPromise = measureRecalcWork(browserCdp, windowMs);
    const recalc = await recalcPromise;
    const replayWriters = summariseWriters(await drainAllFrames(page), recalc.wallMs);
    arms.push({
      label: `replay-${speed}x`, armed, ...replayWriters, recalcWork: recalc,
    });
    save();

    // Separate window so invalidation tracking's own overhead cannot inflate the
    // recalc figures reported above.
    arms.push({ label: `invalidation-reasons-replay-${speed}x`, ...(await measureInvalidationReasons(browserCdp, windowMs)) });
    save();

    return { signature: 'STYLE-WRITER-CENSUS-V1', arms };
  } finally {
    await browser.close().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && /style-writer-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runStyleWriterCensus({ ...opts, outPath: opts.out });
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
  for (const arm of report.arms) {
    console.error(`[style] ${arm.label}: ${arm.totalWrites} writes (${arm.totalPerSecond}/s), document-wide ${arm.documentWideWrites} (${arm.documentWidePerSecond}/s)`);
    for (const w of arm.writers.slice(0, 8)) {
      console.error(`   ${w.count.toString().padStart(6)}  ${w.perSecond}/s  ${w.api}(${w.property})  target=${w.target}  radius=${w.blastRadius}  site=${w.site}`);
    }
  }
}
