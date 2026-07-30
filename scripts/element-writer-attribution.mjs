#!/usr/bin/env node
/**
 * ELEMENT-WRITER-ATTRIBUTION-V1 — name the JS that creates the elements which
 * accumulate under CONF-01.
 *
 * The duration gate says elements climb +1,333/h alongside renderer footprint
 * +735 MB/h, and "elements" is not something A can cut. This attributes every LIVE
 * element to the call site that created it, so the climb has a writer's name on it.
 *
 * METHOD, and its limits stated up front because the last two element claims died of
 * unstated limits:
 *   - `createElement`, `createElementNS`, the `innerHTML` setter and
 *     `insertAdjacentHTML` are wrapped in every realm. Each element created is
 *     associated, in a WeakMap, with a compressed stack signature of its creator.
 *     A WeakMap rather than an expando so the instrument does not itself retain
 *     what it is measuring.
 *   - A census then walks the live DOM and tallies elements BY CREATOR. This counts
 *     what is still attached, so a writer that creates and releases scores zero and
 *     only genuine accumulation shows up.
 *   - Elements created before instrumentation is installed have no signature and are
 *     reported as `pre-instrumentation`. Elements the HTML parser produced from a
 *     string are attributed to the code that set the string, not to the parser.
 *   - Detached-but-uncollected elements are NOT counted here; that is deliberate.
 *     Performance Monitor's Nodes counter includes them, which is why my own W91
 *     node comparison was unsafe. This instrument counts attached elements only and
 *     says so.
 *
 * GATE-01: a synthetic writer appends elements every interval and never releases
 * them. If the instrument cannot name that writer as the top climber, its verdict on
 * the product's writers is not trusted.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';
import {
  bootConf01Session, cycleTrades, keepConf01Playing, readConf01State, readTradeState,
} from './lib/conf01-session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Installed in every realm. Returns what it managed to wrap. */
function instrumentationSource() {
  return (() => {
    if (window.__ewa) return { already: true, realm: window.__ewa.realm };
    const state = {
      realm: `${location.pathname}${location.hash}`.slice(-60),
      sigs: new WeakMap(),
      created: new Map(),
      syntheticInstalled: false,
    };
    window.__ewa = state;

    // Two frames past the wrapper is the product's own call site; more frames make
    // signatures too specific to aggregate, fewer make them useless.
    // Frames belonging to this instrument, dropped by NAME. Dropping by file was
    // impossible: injected code and product code share the same <anonymous> origin.
    // Frames belonging to this instrument, dropped by NAME with any receiver prefix
    // ("at HTMLDocument.wrappedCreate"). Dropping by file is impossible: injected
    // code and product code can share an origin.
    const OWN = /\bat (?:[\w$.]+\.)?(signature|note|wrappedCreate|wrappedInnerHtml|wrappedAdjacent|census)\b/;
    const signature = () => {
      const raw = new Error().stack || '';
      state.lastRawStack = raw.split('\n').slice(0, 8).join('\n');
      const frames = [];
      for (const line of raw.split('\n').slice(1)) {
        if (OWN.test(line)) continue;
        // Take the LAST line:column in the frame. An injected frame's URL contains
        // percent-encoded parentheses, which is what defeated the first parser and
        // sent every product signature to 'unknown'.
        const loc = /:(\d+):(\d+)\)?\s*$/.exec(line);
        if (!loc) continue;
        let fn = (/\bat (?:async )?([^\s(]+)/.exec(line) || [])[1] || '?';
        if (fn.includes('/') || fn.includes(':')) fn = '?';
        const before = line.slice(0, loc.index);
        let file = 'injected';
        if (!/pptr:evaluate/.test(before)) {
          const tail = before.replace(/^.*?\(/, '').replace(/^\s*at\s+/, '').trim();
          file = (tail.split('/').pop() || tail).split('?')[0].replace(/[()]/g, '') || 'anon';
        }
        frames.push(`${fn}@${file}:${loc[1]}`);
        if (frames.length >= 3) break;
      }
      return frames.length ? frames.join(' < ') : 'unknown';
    };

    const note = (el, sig) => {
      if (!el || typeof el !== 'object') return;
      try { state.sigs.set(el, sig); } catch { /* non-extensible */ }
      state.created.set(sig, (state.created.get(sig) || 0) + 1);
    };

    const wrapped = [];
    const docProto = Object.getPrototypeOf(document) || Document.prototype;
    for (const proto of new Set([docProto, Document.prototype])) {
      for (const name of ['createElement', 'createElementNS']) {
        const orig = proto[name];
        if (typeof orig !== 'function' || orig.__ewaWrapped) continue;
        const wrap = function wrappedCreate(...args) {
          const el = orig.apply(this, args);
          note(el, signature());
          return el;
        };
        wrap.__ewaWrapped = true;
        try { proto[name] = wrap; wrapped.push(name); } catch { /* frozen */ }
      }
    }

    // The parser path: attribute the whole produced subtree to whoever set the string.
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (desc?.set && !desc.set.__ewaWrapped) {
      const origSet = desc.set;
      const set = function wrappedInnerHtml(value) {
        const sig = signature();
        origSet.call(this, value);
        try {
          note(this, sig);
          for (const el of this.querySelectorAll('*')) note(el, sig);
        } catch { /* detached */ }
      };
      set.__ewaWrapped = true;
      try {
        Object.defineProperty(Element.prototype, 'innerHTML', { ...desc, set });
        wrapped.push('innerHTML');
      } catch { /* frozen */ }
    }

    const origAdj = Element.prototype.insertAdjacentHTML;
    if (typeof origAdj === 'function' && !origAdj.__ewaWrapped) {
      const wrap = function wrappedAdjacent(pos, str) {
        const sig = signature();
        const before = this.children.length;
        const r = origAdj.call(this, pos, str);
        try {
          for (const el of this.querySelectorAll('*')) if (!state.sigs.has(el)) note(el, sig);
        } catch { /* detached */ }
        void before;
        return r;
      };
      wrap.__ewaWrapped = true;
      try { Element.prototype.insertAdjacentHTML = wrap; wrapped.push('insertAdjacentHTML'); } catch { /* frozen */ }
    }

    // React creates host instances in completeWork, AFTER the component that
    // rendered them has returned, so no component name can ever appear in a
    // createElement stack. The owning component is recoverable from the fiber React
    // attaches to the node instead: walk fiber.return and name the first few
    // function/class components. This is read at census time, so it costs nothing
    // during the run and retains nothing.
    const fiberOwners = (el) => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (!key) return null;
      let fiber = el[key];
      const names = [];
      let hops = 0;
      while (fiber && hops < 40 && names.length < 3) {
        const t = fiber.type;
        const name = typeof t === 'function' ? (t.displayName || t.name)
          : (t && typeof t === 'object' ? (t.displayName || t.name || null) : null);
        if (name && !names.includes(name)) names.push(name);
        fiber = fiber.return;
        hops += 1;
      }
      return names.length ? names.join(' < ') : null;
    };

    state.census = () => {
      const live = new Map();
      const owners = new Map();
      let unattributed = 0;
      let reactOwned = 0;
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const sig = state.sigs.get(el);
        if (sig) live.set(sig, (live.get(sig) || 0) + 1);
        else unattributed += 1;
        // Owner census is independent of creator attribution: an element can be
        // React-owned and pre-instrumentation at the same time.
        let owner = null;
        try { owner = fiberOwners(el); } catch { owner = null; }
        if (owner) {
          reactOwned += 1;
          owners.set(owner, (owners.get(owner) || 0) + 1);
        }
      }
      return {
        realm: state.realm,
        totalElements: all.length,
        preInstrumentation: unattributed,
        reactOwnedElements: reactOwned,
        attributed: [...live.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
          .map(([sig, count]) => ({ sig, count, createdEver: state.created.get(sig) || 0 })),
        componentOwners: [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
          .map(([owner, count]) => ({ owner, count })),
      };
    };

    return { already: false, realm: state.realm, wrapped };
  })();
}

/** GATE-01's known-defective writer: leaks elements on purpose, from a named site. */
function syntheticWriterSource(perTick) {
  return ((n) => {
    const st = window.__ewa;
    if (!st) return { ok: false, reason: 'instrumentation absent' };
    if (st.syntheticInstalled) return { ok: true, already: true };
    st.syntheticInstalled = true;
    const sink = document.createElement('div');
    sink.id = 'ewa-synthetic-sink';
    sink.style.display = 'none';
    document.body.appendChild(sink);
    st.syntheticTimer = setInterval(function ewaSyntheticLeakWriter() {
      for (let i = 0; i < n; i += 1) sink.appendChild(document.createElement('span'));
    }, 5_000);
    return { ok: true, perTick: n };
  })(perTick);
}

async function installEverywhere(page, fn, arg) {
  const results = [];
  for (const frame of page.frames()) {
    try {
      const r = arg === undefined ? await frame.evaluate(fn) : await frame.evaluate(fn, arg);
      results.push({ url: frame.url().slice(-60), ...r });
    } catch (e) {
      results.push({ url: frame.url().slice(-60), error: String(e?.message || e).slice(0, 120) });
    }
  }
  return results;
}

async function censusEverywhere(page) {
  const out = [];
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(() => (window.__ewa ? window.__ewa.census() : null));
      if (r) out.push({ url: frame.url().slice(-60), ...r });
    } catch { /* frame gone mid-census */ }
  }
  return out;
}

/** Sum one signature's live count across all realms, so a per-panel writer aggregates. */
function foldSignatures(census) {
  const fold = new Map();
  const owners = new Map();
  let total = 0;
  let pre = 0;
  for (const realm of census) {
    total += realm.totalElements || 0;
    pre += realm.preInstrumentation || 0;
    for (const a of realm.attributed || []) {
      fold.set(a.sig, (fold.get(a.sig) || 0) + a.count);
    }
    for (const o of realm.componentOwners || []) {
      owners.set(o.owner, (owners.get(o.owner) || 0) + o.count);
    }
  }
  return { total, preInstrumentation: pre, bySig: fold, byOwner: owners };
}

export async function runElementWriterAttribution({
  minutes = 20, intervalMs = 60_000, speed = 60, closedTarget = 30,
  synthetic = true, syntheticPerTick = 40, outPath = null,
} = {}) {
  const { browser, page, cdp, conf01 } = await bootConf01Session({ replaySpeed: speed });
  const report = {
    signature: 'ELEMENT-WRITER-ATTRIBUTION-V1',
    startedAtIso: new Date().toISOString(),
    plan: { minutes, intervalMs, speed, closedTarget, synthetic, syntheticPerTick },
    conf01: { compliant: conf01?.compliant, failed: conf01?.failed, datasets: conf01?.observedDatasets },
    counts: 'ATTACHED elements only; detached-uncollected nodes are excluded and are what Performance Monitor Nodes includes',
    samples: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return { scriptVersion: s ? s[1] : null, href: location.href };
    }).catch(() => null);
    console.error(`[ewa] build=${JSON.stringify(report.build)} conf01=${conf01?.compliant}`);

    report.instrumented = await installEverywhere(page, instrumentationSource);
    const realms = report.instrumented.filter((r) => !r.error).length;
    console.error(`[ewa] instrumented ${realms} realms: ${report.instrumented.map((r) => (r.error ? 'ERR' : (r.wrapped || []).length + 'w')).join(',')}`);

    if (synthetic) {
      report.synthetic = await installEverywhere(page, syntheticWriterSource, syntheticPerTick);
      console.error(`[ewa] GATE-01 synthetic writer installed in ${report.synthetic.filter((r) => r.ok).length} realms at ${syntheticPerTick}/5s`);
    }
    save();

    const startedAt = Date.now();
    let n = 0;
    while ((Date.now() - startedAt) / 60_000 < minutes) {
      n += 1;
      try {
        await keepConf01Playing(page, speed);
        const churn = await cycleTrades(page, { open: 3, close: 3, holdMs: 1_200 });
        const census = await censusEverywhere(page);
        const folded = foldSignatures(census);
        const trades = await readTradeState(page);
        const state = await readConf01State(page, { advanceWindowMs: 2_000 });
        report.samples.push({
          n,
          minutes: +((Date.now() - startedAt) / 60_000).toFixed(3),
          hours: +((Date.now() - startedAt) / 3_600_000).toFixed(4),
          totalElements: folded.total,
          preInstrumentation: folded.preInstrumentation,
          closed: trades?.managerClosed ?? null,
          advancing: state?.advancingPanels ?? null,
          bySig: [...folded.bySig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
            .map(([sig, count]) => ({ sig, count })),
          byOwner: [...folded.byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
            .map(([owner, count]) => ({ owner, count })),
          perRealm: census.map((c) => ({
            realm: c.url, total: c.totalElements, pre: c.preInstrumentation, reactOwned: c.reactOwnedElements,
          })),
          churned: churn?.closed ?? null,
        });
        console.error(`[ewa] #${n} ${((Date.now() - startedAt) / 60_000).toFixed(1)}min elements=${folded.total} pre=${folded.preInstrumentation} closed=${trades?.managerClosed} advancing=${state?.advancingPanels} top=${report.samples.at(-1).bySig.slice(0, 2).map((s) => `${s.sig.split(' < ')[0]}:${s.count}`).join(' ')}`);
      } catch (e) {
        report.samples.push({ n, error: String(e?.message || e).slice(0, 200) });
        console.error(`[ewa] #${n} FAILED: ${String(e?.message || e).slice(0, 160)}`);
      }
      save();
      const spent = Date.now() - startedAt;
      if (n * intervalMs > spent) await sleep(n * intervalMs - spent);
    }

    // Fit a slope per signature (DUR-01 shape: a writer is guilty of a TREND, not of
    // a single high count) and rank by elements per hour.
    const good = report.samples.filter((s) => !s.error && Number.isFinite(s.totalElements));
    const sigs = new Set();
    for (const s of good) for (const b of s.bySig) sigs.add(b.sig);
    const trends = [];
    for (const sig of sigs) {
      const series = good.map((s) => ({
        hours: s.hours,
        value: (s.bySig.find((b) => b.sig === sig)?.count) ?? 0,
      }));
      const t = fitTrend(series, { label: sig, flatBandPerHour: 60, minSpanHours: 0.25 });
      // The climb is known to track CLOSED TRADES, not time (+31.7 elements per closed
      // trade from the duration regrade), so each writer is also fitted against trade
      // count. A writer whose slope is flat per hour but steep per trade is still the
      // culprit; only the trade axis separates the two.
      const perTrade = fitTrend(
        good.filter((s) => Number.isFinite(s.closed))
          .map((s) => ({ hours: s.closed, value: (s.bySig.find((b) => b.sig === sig)?.count) ?? 0 })),
        { label: `${sig} per closedTrade`, flatBandPerHour: 1, minSpanHours: 0 },
      );
      trends.push({
        sig,
        slopePerHour: t.perHour,
        ci: t.slopeCi95,
        verdict: t.verdict,
        slopePerClosedTrade: perTrade.perHour ?? null,
        ciPerClosedTrade: perTrade.slopeCi95 ?? null,
        verdictPerClosedTrade: perTrade.verdict,
        first: series[0]?.value,
        last: series.at(-1)?.value,
      });
    }
    trends.sort((a, b) => (b.slopePerHour ?? 0) - (a.slopePerHour ?? 0));
    report.trends = trends;
    report.totalTrend = fitTrend(good.map((s) => ({ hours: s.hours, value: s.totalElements })),
      { label: 'totalElements', flatBandPerHour: 60, minSpanHours: 0.25 });

    // The same fit over React component owners. This is the ranking A can act on:
    // a call site inside React's completeWork names the framework, not the feature.
    const ownerNames = new Set();
    for (const s of good) for (const o of (s.byOwner || [])) ownerNames.add(o.owner);
    const ownerTrends = [];
    for (const owner of ownerNames) {
      const series = good.map((s) => ({
        hours: s.hours,
        closed: s.closed,
        value: (s.byOwner?.find((o) => o.owner === owner)?.count) ?? 0,
      }));
      const t = fitTrend(series, { label: owner, flatBandPerHour: 60, minSpanHours: 0.25 });
      const perTrade = fitTrend(
        series.filter((p) => Number.isFinite(p.closed)).map((p) => ({ hours: p.closed, value: p.value })),
        { label: `${owner} per closedTrade`, flatBandPerHour: 1, minSpanHours: 5 },
      );
      ownerTrends.push({
        owner,
        slopePerHour: t.perHour,
        ci: t.slopeCi95,
        verdict: t.verdict,
        slopePerClosedTrade: perTrade.perHour,
        ciPerClosedTrade: perTrade.slopeCi95,
        first: series[0]?.value,
        last: series.at(-1)?.value,
      });
    }
    ownerTrends.sort((a, b) => (b.slopePerClosedTrade ?? b.slopePerHour ?? 0) - (a.slopePerClosedTrade ?? a.slopePerHour ?? 0));
    report.componentOwnerTrends = ownerTrends.slice(0, 15);

    const syntheticTrend = trends.find((t) => /ewaSyntheticLeakWriter/.test(t.sig));
    report.gate01 = synthetic
      ? {
        namedSyntheticWriter: !!syntheticTrend,
        syntheticSlopePerHour: syntheticTrend?.slopePerHour ?? null,
        syntheticRank: syntheticTrend ? trends.indexOf(syntheticTrend) + 1 : null,
        verdict: syntheticTrend && trends.indexOf(syntheticTrend) === 0
          ? 'PASS: the planted leaking writer is named and ranked first'
          : (syntheticTrend ? 'PASS (named, not first)' : 'FAIL: planted writer not named'),
      }
      : { skipped: true };

    // The product's own climbers, with the planted one removed.
    report.productClimbers = trends.filter((t) => !/ewaSyntheticLeakWriter/.test(t.sig)).slice(0, 10);
    console.error(`[ewa] GATE-01: ${report.gate01?.verdict}`);
    console.error(`[ewa] total elements ${report.totalTrend?.perHour}/h ${JSON.stringify(report.totalTrend?.slopeCi95)}`);
    report.productClimbersPerTrade = trends.filter((t) => !/ewaSyntheticLeakWriter/.test(t.sig))
      .slice().sort((a, b) => (b.slopePerClosedTrade ?? 0) - (a.slopePerClosedTrade ?? 0)).slice(0, 10);
    for (const t of report.productClimbers.slice(0, 5)) {
      console.error(`[ewa]   ${t.slopePerHour}/h  ${t.slopePerClosedTrade}/trade  ${t.first}->${t.last}  ${t.sig}`);
    }
    console.error('[ewa] ranked by PER CLOSED TRADE:');
    for (const t of report.productClimbersPerTrade.slice(0, 5)) {
      console.error(`[ewa]   ${t.slopePerClosedTrade}/trade CI${JSON.stringify(t.ciPerClosedTrade)}  ${t.first}->${t.last}  ${t.sig}`);
    }
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

/**
 * GATE-01 offline: prove the instrument names a known leaking writer on a blank page,
 * without booting CONF-01. A second CONF-01 session contends for the window claim that
 * already hangs on this build and would jeopardise a running duration gate, so the
 * instrument earns its trust off the wire and is then used on it.
 */
export async function selfTestElementWriterAttribution({ intervals = 4, intervalMs = 6_000 } = {}) {
  const { loadPuppeteer } = await import('./lib/heap-cycle-browser.mjs');
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const out = { signature: 'ELEMENT-WRITER-ATTRIBUTION-V1/self-test', startedAtIso: new Date().toISOString(), samples: [] };
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body><div id="host"></div><script>
      // A quiet writer that creates and REMOVES: must not be reported as a climber.
      window.churnWriter = function churnWriter() {
        const host = document.getElementById('host');
        for (let i = 0; i < 30; i += 1) { const d = document.createElement('div'); host.appendChild(d); }
        while (host.firstChild) host.removeChild(host.firstChild);
      };
      // A writer that builds through innerHTML and keeps the result.
      window.htmlWriter = function htmlWriter() {
        const d = document.createElement('div');
        d.innerHTML = '<span><b>x</b></span><span><i>y</i></span>';
        document.body.appendChild(d);
      };
      setInterval(() => { window.churnWriter(); window.htmlWriter(); }, 1000);
    </script></body>`);
    await page.evaluate(instrumentationSource);
    await page.evaluate(syntheticWriterSource, 40);
    await sleep(6_000);
    out.rawStackSample = await page.evaluate(() => window.__ewa?.lastRawStack || null);
    const t0 = Date.now();
    for (let i = 0; i < intervals; i += 1) {
      await sleep(intervalMs);
      const folded = foldSignatures(await censusEverywhere(page));
      out.samples.push({
        hours: +((Date.now() - t0) / 3_600_000).toFixed(5),
        totalElements: folded.total,
        bySig: [...folded.bySig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([sig, count]) => ({ sig, count })),
      });
    }
    const sigs = new Set(out.samples.flatMap((s) => s.bySig.map((b) => b.sig)));
    out.trends = [...sigs].map((sig) => {
      const t = fitTrend(out.samples.map((s) => ({ hours: s.hours, value: s.bySig.find((b) => b.sig === sig)?.count ?? 0 })),
        { label: sig, flatBandPerHour: 60, minSpanHours: 0 });
      return { sig, slopePerHour: t.perHour };
    }).sort((a, b) => (b.slopePerHour ?? 0) - (a.slopePerHour ?? 0));
    const synth = out.trends.find((t) => /ewaSyntheticLeakWriter/.test(t.sig));
    const html = out.trends.find((t) => /htmlWriter/.test(t.sig));
    const churn = out.trends.find((t) => /churnWriter/.test(t.sig));
    out.gate01 = {
      namesPlantedLeaker: !!synth,
      plantedRankedFirst: !!synth && out.trends.indexOf(synth) === 0,
      attributesParserPath: !!html && (html.slopePerHour ?? 0) > 0,
      ignoresCreateAndRelease: !churn || Math.abs(churn.slopePerHour ?? 0) < 60,
    };
    out.gate01.verdict = (out.gate01.namesPlantedLeaker && out.gate01.plantedRankedFirst
      && out.gate01.attributesParserPath && out.gate01.ignoresCreateAndRelease)
      ? 'PASS' : 'FAIL';
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'interval-ms') o.intervalMs = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'closed-target') o.closedTarget = Number(v);
    else if (k === 'synthetic-per-tick') o.syntheticPerTick = Number(v);
    else if (k === 'no-synthetic') o.synthetic = false;
    else if (k === 'self-test') o.selfTest = true;
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /element-writer-attribution\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const out = await selfTestElementWriterAttribution();
    if (args.outPath) fs.writeFileSync(args.outPath, JSON.stringify(out, null, 1));
    console.error(`[ewa/self-test] GATE-01 ${out.gate01.verdict}: ${JSON.stringify(out.gate01)}`);
    for (const t of out.trends.slice(0, 6)) console.error(`[ewa/self-test]   ${t.slopePerHour}/h  ${t.sig}`);
  } else {
    await runElementWriterAttribution(args);
  }
}
