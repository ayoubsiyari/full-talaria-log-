#!/usr/bin/env node
/**
 * BASELINE-CENSUS — items 3 and 6 of the 09:15 queue in one boot.
 *
 * R-1 (item 3): resident bars per realm split three ways — before session start, within session up to
 * the playhead, and after the playhead. The PO reports that requesting a 3-year session also loads
 * every candle preceding it, for indicator warm-up, left-hand context and rollback. This counts that
 * directly instead of arguing about it, and the after-playhead bucket is the one nobody has named:
 * bars the user cannot legitimately see yet but which are resident anyway.
 *
 * Item 6: baseline composition by category at first paint, four panels, BEFORE any playback. One
 * table that adds to the total with a NAMED residual. Every term states whether it is a measurement
 * or a floor, because a composition table whose rows are floors and whose residual absorbs the
 * difference is worse than no table if that is not said out loud.
 *
 * Also settles the advisor's script question: is the ~92 MB of script source per realm a baseline term
 * or a growth term? Answered by counting Debugger.scriptParsed events after first paint — if nothing
 * re-evaluates mid-session, the count stays put and the mass is baseline.
 *
 * Baseline over slope: nothing here plays for hours. Two page loads, a few minutes.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.C_OUT
  || 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BASELINE-CENSUS-20260731.json';
const PLAY_PROBE_MIN = Number(process.env.C_PLAY_PROBE_MIN || 3);

/**
 * R-1 buckets. Session start is the replay start; the playhead is `currentIndex`. Bars are bucketed by
 * INDEX against those two marks rather than by timestamp, because index is what the arrays are keyed
 * on and a timestamp comparison would silently mis-bucket across a gap in market hours.
 */
function residencyCensusSource() {
  const ch = window.chart;
  if (!ch) return null;
  const rs = ch.replaySystem;
  const data = Array.isArray(ch.data) ? ch.data : null;
  const raw = Array.isArray(ch.rawData) ? ch.rawData : null;
  const master = Array.isArray(ch._panelFullRawData) ? ch._panelFullRawData : null;
  const tOf = (b) => (b && (b.t ?? b.time ?? b.timestamp ?? null)) ?? null;

  const playhead = rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null;
  // Where the replay session was told to begin. Several names have been used for it across builds, so
  // try each and record which one answered rather than assuming.
  const startCandidates = {
    replayStartIndex: rs?.replayStartIndex,
    startIndex: rs?.startIndex,
    _startIndex: rs?._startIndex,
    sessionStartIndex: rs?.sessionStartIndex,
    initialIndex: rs?.initialIndex,
  };
  let sessionStartIndex = null;
  let sessionStartField = null;
  for (const [k, v] of Object.entries(startCandidates)) {
    if (Number.isFinite(v)) { sessionStartIndex = v; sessionStartField = k; break; }
  }

  const total = data ? data.length : null;
  const bucket = (n, start, head) => {
    if (n == null) return null;
    const s = Number.isFinite(start) ? Math.max(0, Math.min(start, n)) : null;
    const h = Number.isFinite(head) ? Math.max(0, Math.min(head, n)) : null;
    return {
      total: n,
      beforeSessionStart: s != null ? s : null,
      withinSessionToPlayhead: (s != null && h != null) ? Math.max(0, h - s) : null,
      afterPlayhead: h != null ? Math.max(0, n - h) : null,
    };
  };

  return {
    realm: `${location.pathname}${location.search}`.slice(-52),
    timeframe: ch.currentTimeframe ? String(ch.currentTimeframe) : null,
    symbol: ch.currentSymbol || ch.symbol || null,
    replayActive: !!(rs && rs.isReplayMode),
    playhead,
    sessionStartIndex,
    sessionStartField,
    visibleStartIndex: Number.isFinite(ch.visibleStartIndex) ? ch.visibleStartIndex : null,
    visibleEndIndex: Number.isFinite(ch.visibleEndIndex) ? ch.visibleEndIndex : null,
    visibleBars: (Number.isFinite(ch.visibleStartIndex) && Number.isFinite(ch.visibleEndIndex))
      ? ch.visibleEndIndex - ch.visibleStartIndex : null,
    primary: bucket(total, sessionStartIndex, playhead),
    rawBars: raw ? raw.length : null,
    masterBars: master ? master.length : null,
    oldestResidentTime: tOf(data && data[0]),
    newestResidentTime: tOf(data && data[data.length - 1]),
    // What a bar object actually costs is needed to price the buckets. Sampled, not assumed.
    barShape: (() => {
      const b = data && data[Math.floor(data.length / 2)];
      if (!b || typeof b !== 'object') return null;
      const keys = Object.keys(b);
      return { keys: keys.length, keyNames: keys.slice(0, 14), isArray: Array.isArray(b) };
    })(),
  };
}

/** Decoded-image floor, the companion to the canvas floor. Same caveat: a floor, not a total. */
function imageCensusSource() {
  const imgs = [...document.querySelectorAll('img')];
  let bytes = 0;
  for (const im of imgs) bytes += (im.naturalWidth || 0) * (im.naturalHeight || 0) * 4;
  const bg = [...document.querySelectorAll('*')].slice(0, 4000)
    .filter((el) => {
      const s = el.currentStyle || window.getComputedStyle(el);
      return s && s.backgroundImage && s.backgroundImage !== 'none' && /url\(/.test(s.backgroundImage);
    }).length;
  return {
    images: imgs.length,
    decodedFloorMB: +(bytes / 1048576).toFixed(2),
    elementsWithBackgroundImage: bg,
  };
}

/** Script mass per realm from the resource timing entries: what was fetched and what it decodes to. */
function scriptMassSource() {
  const entries = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
  const scripts = entries.filter((e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name));
  let transfer = 0;
  let decoded = 0;
  for (const e of scripts) {
    transfer += e.transferSize || 0;
    decoded += e.decodedBodySize || 0;
  }
  return {
    scriptRequests: scripts.length,
    transferMB: +(transfer / 1048576).toFixed(2),
    decodedMB: +(decoded / 1048576).toFixed(2),
    fromCacheCount: scripts.filter((e) => (e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0).length,
  };
}

async function perFrame(page, fn) {
  const rows = [];
  for (const [i, f] of page.frames().entries()) {
    try {
      const r = await f.evaluate(fn);
      if (r) rows.push({ frameIndex: i, ...r });
    } catch { /* frame gone */ }
  }
  return rows;
}

/**
 * Item 4's mechanism half, measured on the one account I hold rather than blocked on a second.
 *
 * The static scan found `/api/journal` called with no bounding parameter, and the client then applies
 * `slice(0, 4)` for display — so the whole history can cross the wire and be parsed even though four
 * entries are shown. Journal entries can also carry a screenshot as an inline `data:` URL. That makes
 * journal hydration a candidate for baseline scaling with account age AND a candidate for the ~23 MB
 * per closed trade measured this morning.
 *
 * This records every account-scoped response with its byte count and, where it parses as JSON, how many
 * records and how many screenshot-shaped fields it carried.
 */
function attachAccountHydrationRecorder(page, sink) {
  const interesting = /\/api\/(journal|trade|order|position|account|portfolio|stat)/i;
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!interesting.test(url)) return;
      const buf = await res.buffer().catch(() => null);
      const row = {
        url: url.slice(-90),
        status: res.status(),
        bytes: buf ? buf.length : null,
        atIso: new Date().toISOString(),
        records: null,
        screenshotFields: null,
        screenshotBytes: null,
        largestRecordBytes: null,
      };
      if (buf && buf.length && /json/i.test(res.headers()['content-type'] || '')) {
        try {
          const j = JSON.parse(buf.toString('utf8'));
          const list = Array.isArray(j) ? j : (Array.isArray(j.list) ? j.list : (Array.isArray(j.entries) ? j.entries : null));
          if (list) {
            row.records = list.length;
            let shots = 0;
            let shotBytes = 0;
            let largest = 0;
            for (const rec of list) {
              const s = JSON.stringify(rec || {});
              largest = Math.max(largest, s.length);
              for (const k of ['screenshot', 'dataUrl', 'image', 'thumbnail', 'src']) {
                const v = rec && rec[k];
                if (typeof v === 'string' && v.length > 256) { shots += 1; shotBytes += v.length; }
              }
            }
            row.screenshotFields = shots;
            row.screenshotBytes = shotBytes;
            row.largestRecordBytes = largest;
          }
        } catch { /* not the shape we expected */ }
      }
      sink.push(row);
    } catch { /* response gone */ }
  });
}

const report = {
  signature: 'BASELINE-CENSUS-V1',
  ruling: 'cbfdb81f4 items 3 and 6, plus item 4 mechanism half',
  startedAtIso: new Date().toISOString(),
  gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
  measurementNotes: [
    'Every category below is labelled MEASURED or FLOOR. A floor understates, so the residual absorbs the shortfall and must not be read as "unexplained memory".',
    'Taken before any playback, so nothing here is a growth term.',
  ],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
const accountHydration = [];

(async () => {
  let session = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      speed: 60,
      // Zero trades: this is a baseline measurement and an order would make it a growth measurement.
      placeOrder: false,
      // First paint of a single chart, before the multichart layout is applied, is a separate and
      // cheaper baseline that the competitor comparison is actually against.
      // conf01-session calls this hook as onSingleReady(page), positionally. Destructuring it as
      // ({ page }) made `page` undefined, the hook threw, and boot swallowed it with a warning I did not
      // read — which is why the first census artifact had no singleChartFirstPaint and no
      // accountHydration section at all.
      onSingleReady: async (page) => {
        attachAccountHydrationRecorder(page, accountHydration);
        await sleep(6_000);
        report.singleChartFirstPaint = {
          residency: await perFrame(page, residencyCensusSource),
          images: await perFrame(page, imageCensusSource),
          scripts: await perFrame(page, scriptMassSource),
        };
        save();
      },
    });

    const { page, cdp, browserCdp, conf01 } = session;
    // MEAS-01: the build stamp is read off the running page, not assumed from the deploy.
    report.buildStamp = conf01?.buildId ?? null;
    report.conf01 = conf01 ?? null;

    // Count script parses from now on. If nothing re-evaluates during playback, the per-realm script
    // mass is a baseline term exactly as the advisor said, and this is what confirms which.
    let parsedAfterFirstPaint = 0;
    let parsedByHarness = 0;
    const parsedUrls = new Set();
    // Every page.evaluate() I make is itself a script parse. Counting those as product re-evaluation
    // is observer contamination, and the first version of this grader did exactly that: it reported
    // "27 scripts parsed during playback" when all of them were my own probe's stack frames.
    const isHarnessParse = (url) => !url
      || /puppeteer|[\\/]scripts[\\/]|\.mjs|__puppeteer|pptr:|%5C|%2F/i.test(url);
    try {
      await cdp.send('Debugger.enable');
      cdp.on('Debugger.scriptParsed', (e) => {
        const url = String(e.url || '');
        if (isHarnessParse(url)) { parsedByHarness += 1; return; }
        parsedAfterFirstPaint += 1;
        if (parsedUrls.size < 40) parsedUrls.add(url.slice(-60));
      });
    } catch { report.debuggerUnavailable = true; }

    await sleep(8_000);
    report.fourPanelFirstPaint = {
      state: await readConf01State(page).catch(() => null),
      residency: await perFrame(page, residencyCensusSource),
      images: await perFrame(page, imageCensusSource),
      scripts: await perFrame(page, scriptMassSource),
      gauges: await readSweepGauges(page, cdp, browserCdp, { cpuWindowMs: 6_000, forceGc: true, readOsFootprints }),
    };
    report.scriptParsesAtFirstPaintMark = parsedAfterFirstPaint;
    save();

    // Now play briefly, purely to answer "does anything re-evaluate mid-session".
    try {
      await page.evaluate(() => {
        const rs = window.chart?.replaySystem;
        if (rs && typeof rs.play === 'function') rs.play();
        else if (rs && typeof rs.startPlayback === 'function') rs.startPlayback();
      });
    } catch { /* leave it */ }
    await sleep(PLAY_PROBE_MIN * 60_000);
    report.afterShortPlayback = {
      minutesPlayed: PLAY_PROBE_MIN,
      state: await readConf01State(page).catch(() => null),
      residency: await perFrame(page, residencyCensusSource),
      scripts: await perFrame(page, scriptMassSource),
      gauges: await readSweepGauges(page, cdp, browserCdp, { cpuWindowMs: 6_000, forceGc: true, readOsFootprints }),
      scriptParsesTotal: parsedAfterFirstPaint,
      scriptParsesDuringPlayback: parsedAfterFirstPaint - (report.scriptParsesAtFirstPaintMark || 0),
      harnessParsesExcluded: parsedByHarness,
      newlyParsedUrls: [...parsedUrls].slice(0, 20),
    };
    save();
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    save();
    try { await session?.browser?.close?.(); } catch { /* already gone */ }
  }

  // ---- Grade: R-1 buckets ---------------------------------------------------
  const fp = report.fourPanelFirstPaint;
  if (fp?.residency?.length) {
    const rows = fp.residency.filter((r) => r.primary?.total);
    const sum = (f) => rows.reduce((t, r) => t + (f(r) || 0), 0);
    const totalBars = sum((r) => r.primary.total);
    const before = sum((r) => r.primary.beforeSessionStart);
    const within = sum((r) => r.primary.withinSessionToPlayhead);
    const after = sum((r) => r.primary.afterPlayhead);
    const visible = sum((r) => r.visibleBars);
    const startFieldsFound = [...new Set(rows.map((r) => r.sessionStartField).filter(Boolean))];
    report.r1 = {
      realms: rows.length,
      residentBarsTotal: totalBars,
      beforeSessionStart: before,
      withinSessionToPlayhead: within,
      afterPlayhead: after,
      visibleBarsTotal: visible,
      residentPerVisible: visible > 0 ? +(totalBars / visible).toFixed(1) : null,
      sessionStartFieldsFound: startFieldsFound,
      bucketsTrustworthy: startFieldsFound.length > 0,
      caveat: startFieldsFound.length
        ? null
        : 'No replay session-start index was exposed under any of the five names tried, so the before-session bucket could not be separated from the within-session one. The after-playhead bucket and the resident-per-visible ratio are unaffected and stand.',
    };
    report.r1.verdict = report.r1.afterPlayhead > report.r1.visibleBarsTotal
      ? `Bars after the playhead outnumber visible bars ${report.r1.afterPlayhead} to ${visible}: the chart holds future candles the user cannot legitimately see yet.`
      : 'Bars after the playhead do not exceed the visible window.';
  }

  // ---- Grade: item 6 composition with a named residual ----------------------
  const g = fp?.gauges;
  if (g?.footprint?.totalPrivateMB) {
    const heap = g.counters?.collected?.jsHeapMB ?? g.counters?.live?.jsHeapMB ?? null;
    const workerHeap = g.workers?.workerHeapTotalMB ?? null;
    const canvasFloor = g.canvas?.backingStoreFloorTotalMB ?? null;
    const imgFloor = (fp.images || []).reduce((t, r) => t + (r.decodedFloorMB || 0), 0);
    const gpuProc = g.footprint?.gpuProcessPrivateMB ?? null;
    const browserProc = g.footprint?.byType?.browser ?? null;
    const rendererProc = g.footprint?.pageRendererPrivateMB ?? null;
    const total = g.footprint.totalPrivateMB;
    const rows = [
      { category: 'JS heap, page isolate (post forced collection)', mb: heap, kind: 'MEASURED', process: 'renderer' },
      { category: 'JS heap, worker isolates', mb: workerHeap, kind: workerHeap == null ? 'UNMEASURED' : 'MEASURED', process: 'renderer' },
      { category: 'Canvas backing stores', mb: canvasFloor, kind: 'FLOOR', process: 'renderer+gpu' },
      { category: 'Decoded images', mb: +imgFloor.toFixed(2), kind: 'FLOOR', process: 'renderer' },
      { category: 'GPU process private total', mb: gpuProc, kind: 'MEASURED', process: 'gpu' },
      { category: 'Browser process private total', mb: browserProc, kind: 'MEASURED', process: 'browser' },
    ];
    // Renderer residual: what the renderer holds that the JS heap and the two floors do not explain.
    const rendererNamed = (heap || 0) + (workerHeap || 0) + (canvasFloor || 0) + imgFloor;
    report.composition = {
      totalFootprintMB: total,
      rendererFootprintMB: rendererProc,
      rows,
      rendererNamedMB: +rendererNamed.toFixed(2),
      rendererResidualMB: rendererProc != null ? +(rendererProc - rendererNamed).toFixed(2) : null,
      rendererResidualIs: 'non-JS renderer memory: PartitionAlloc/malloc, DOM and style structures, compiled code and external strings, layer tiles, and the shortfall of the two FLOOR rows above',
      allProcessResidualMB: +(total - rows.reduce((t, r) => t + (r.mb || 0), 0)).toFixed(2),
      dom: { elements: g.counters?.live?.elements ?? null, nodes: g.counters?.live?.nodes ?? null, listeners: g.counters?.live?.listeners ?? null, documents: g.counters?.live?.documents ?? null },
      caveat: 'Rows do not sum to the total by construction: two are floors and the renderer residual is a named remainder, not an unexplained one. The GPU and browser rows are whole-process figures and therefore include their own non-JS overhead.',
    };
  }

  // ---- Grade: item 4 mechanism — does account history hydrate at load? -------
  if (accountHydration.length) {
    const journal = accountHydration.filter((r) => /journal/i.test(r.url));
    const totalBytes = accountHydration.reduce((t, r) => t + (r.bytes || 0), 0);
    const shotBytes = accountHydration.reduce((t, r) => t + (r.screenshotBytes || 0), 0);
    const maxRecords = Math.max(0, ...accountHydration.map((r) => r.records || 0));
    report.accountHydration = {
      responses: accountHydration.length,
      journalResponses: journal.length,
      totalBytesAtLoad: totalBytes,
      totalMBAtLoad: +(totalBytes / 1048576).toFixed(2),
      largestRecordCount: maxRecords,
      screenshotBytesAtLoad: shotBytes,
      screenshotMBAtLoad: +(shotBytes / 1048576).toFixed(2),
      rows: accountHydration.slice(0, 30),
      verdict: journal.length === 0
        ? 'The journal is NOT fetched during chart load on this account, so account history is not a chart-baseline term by this route. It may still be a dashboard-baseline term.'
        : (maxRecords > 0
          ? `Account history DOES hydrate at load: ${maxRecords} records in one response, ${(totalBytes / 1048576).toFixed(2)} MB across ${accountHydration.length} account-scoped responses, of which ${(shotBytes / 1048576).toFixed(2)} MB is screenshot-shaped string data. Unbounded at the call site, so this scales with account age.`
          : `The journal is fetched at load (${journal.length} response(s), ${(totalBytes / 1048576).toFixed(2)} MB) but did not parse into a record list, so the per-record cost is unmeasured here.`),
      caveat: 'Measured on ONE account. Magnitude on a heavy account still needs credentials I do not hold; this establishes the mechanism and the shape, not the ceiling.',
    };
  }

  // ---- Grade: is script mass baseline or growth? -----------------------------
  const sp = report.afterShortPlayback;
  if (sp) {
    const before = (fp?.scripts || []).reduce((t, r) => t + (r.decodedMB || 0), 0);
    const after = (sp.scripts || []).reduce((t, r) => t + (r.decodedMB || 0), 0);
    report.scriptMass = {
      decodedMBAtFirstPaint: +before.toFixed(2),
      decodedMBAfterPlayback: +after.toFixed(2),
      requestsAtFirstPaint: (fp?.scripts || []).reduce((t, r) => t + (r.scriptRequests || 0), 0),
      requestsAfterPlayback: (sp.scripts || []).reduce((t, r) => t + (r.scriptRequests || 0), 0),
      scriptParsesDuringPlayback: sp.scriptParsesDuringPlayback ?? null,
      newlyParsedUrls: sp.newlyParsedUrls || [],
      verdict: (sp.scriptParsesDuringPlayback ?? 0) <= 2 && after - before < 1
        ? 'BASELINE TERM: nothing material re-evaluates during playback, so per-realm script mass is a fixed cost paid at load. The advisor is right and cross-realm sharing is a baseline fix, not a leak fix.'
        : `GROWTH TERM TOO: ${sp.scriptParsesDuringPlayback} scripts parsed during ${PLAY_PROBE_MIN} minutes of playback and decoded script bytes moved by ${(after - before).toFixed(2)} MB.`,
    };
  }
  save();

  const r1 = report.r1;
  const c = report.composition;
  console.error(`\n=== BASELINE CENSUS ${report.status} build=${report.buildStamp} ===`);
  if (r1) {
    console.error(`R-1 across ${r1.realms} realms: ${r1.residentBarsTotal} resident bars | before-session ${r1.beforeSessionStart} | within-to-playhead ${r1.withinSessionToPlayhead} | after-playhead ${r1.afterPlayhead} | visible ${r1.visibleBarsTotal} => ${r1.residentPerVisible} resident per visible`);
    console.error(`   ${r1.verdict}`);
    if (r1.caveat) console.error(`   CAVEAT ${r1.caveat}`);
  }
  if (c) {
    console.error(`\nCOMPOSITION total=${c.totalFootprintMB} MB renderer=${c.rendererFootprintMB} MB`);
    for (const row of c.rows) console.error(`   ${String(row.mb ?? 'n/a').padStart(8)} MB  ${row.kind.padEnd(10)} ${row.category}`);
    console.error(`   renderer named ${c.rendererNamedMB} MB, renderer residual ${c.rendererResidualMB} MB`);
  }
  if (report.scriptMass) console.error(`\nSCRIPT MASS: ${report.scriptMass.verdict}`);
  console.error(`\nartifact ${OUT}`);
  process.exit(0);
})();
