#!/usr/bin/env node
/**
 * SWEEP-SUMMARY — the deliverable SWEEP-01 names: "the fitted relationship stated in words".
 *
 * The words are generated from the numbers and from the predictions each sweep declared BEFORE it
 * ran, so the shape decides between mechanisms. Nothing here is written by hand afterwards, which
 * is the whole point of declaring predictions up front.
 *
 * Anything VOID is listed with its reason and no apology. Dead hypotheses are named, because a
 * dead hypothesis is a good night's work.
 */
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const STAMP = '20260731';

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const n1 = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : '?');
const ci = (a) => (Array.isArray(a) && a.length === 2 ? `CI[${n1(a[0])},${n1(a[1])}]` : '');
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '?');

/** A point's headline degradation number: the slope of CPU-ms/bar against thousands of bars. */
const slopeOf = (p) => p?.cpuMsPerBarSlopePerKbar ?? null;

function wordsS3(art) {
  const pts = (art.pointSummaries || []).filter((p) => p.status === 'OK');
  const zero = pts.find((p) => Number(p.value) === 0);
  const top = pts.filter((p) => Number(p.value) > 0).sort((a, b) => Number(b.value) - Number(a.value))[0];
  if (!zero || !top) return { words: 'S3 could not be stated: the zero-indicator control or the top dose is missing.', died: [], survived: [] };
  const zs = slopeOf(zero);
  const ts = slopeOf(top);
  const curve = art.grade?.curves?.cpuMsPerBarSlopePerKbar;
  const rises = curve && curve.verdict === 'CLIMBS';
  const zeroDegrades = Number.isFinite(zs) && zs > 0 && (zero.cpuMsPerBarSlopeVerdict === 'CLIMBS');
  const share = (Number.isFinite(zs) && Number.isFinite(ts) && ts > 0) ? (ts - zs) / ts : null;

  const died = [];
  const survived = [];
  let words;
  if (zeroDegrades && rises) {
    died.push('"the indicator recalc path is the whole of Monster 2" — it degrades just as clearly with zero indicators loaded');
    survived.push('"there are two drivers, one indicator-gated and one not" — the curve rises with dose AND has a large non-zero intercept');
    words = `Degradation rises with indicator count — ${n1(curve.slopePerUnitKnob)} extra CPU-ms per bar per thousand bars for each indicator added ${ci(curve.ci)} — but it does NOT vanish at zero indicators: the control still degrades at ${n1(zs)} ms/bar per thousand bars, which is ${pct(1 - share)} of the ${n1(ts)} measured at ${top.value} indicators. Indicators are an amplifier, not the cause.`;
  } else if (!zeroDegrades && rises) {
    died.push('"there is an indicator-independent driver" — the zero-indicator control is flat');
    survived.push('"the recalc path is the driver" — dose-response with a flat control is as clean as this gets');
    words = `Degradation scales with indicator count and disappears entirely without them: ${n1(curve.slopePerUnitKnob)} per indicator ${ci(curve.ci)}, and the zero-indicator control is flat. Monster 2 is the recalc path.`;
  } else if (!rises) {
    died.push('"indicator count drives Monster 2" — the curve is flat across 0/1/2/4');
    words = `Degradation does not move with indicator count: the fit across 0/1/2/4 is ${curve ? `${n1(curve.slopePerUnitKnob)} per indicator ${ci(curve.ci)}, verdict ${curve.verdict}` : 'unavailable'}. Whatever drives the decay does not care how many indicators are loaded.`;
  } else {
    words = 'S3 produced a shape that matches none of its declared predictions, which is itself worth reporting rather than smoothing over.';
  }
  return { words, died, survived, table: pts.map((p) => `${p.value} ind: slope ${n1(slopeOf(p))} ${ci(p.cpuMsPerBarSlopeCi)}, level ${n1(p.cpuMsPerBarMean)} ms/bar, ${n1(p.footprintMBPerMin)} MB/min`) };
}

function wordsS1(art) {
  const pts = (art.pointSummaries || []).filter((p) => p.status === 'OK');
  if (pts.length < 3) return { words: 'S1 could not be stated: fewer than three usable speed points.', died: [], survived: [] };
  // Per-minute degradation vs per-bar degradation is the discriminator. cpuMsPerBar is already
  // per bar; the per-minute figure is that slope times bars per minute.
  const rows = pts.map((p) => ({
    speed: Number(p.value),
    barsPerMin: Number.isFinite(p.barsPerSecMean) ? p.barsPerSecMean * 60 : null,
    slopePerKbar: slopeOf(p),
    footprintMBPerMin: p.footprintMBPerMin,
    level: p.cpuMsPerBarMean,
  }));
  const withBars = rows.filter((r) => Number.isFinite(r.barsPerMin) && Number.isFinite(r.slopePerKbar));
  const slow = withBars[0];
  const fast = withBars.at(-1);
  const barsRatio = (slow && fast && slow.barsPerMin > 0) ? fast.barsPerMin / slow.barsPerMin : null;
  const mem = art.grade?.curves?.footprintMBPerMin;
  const perBarFlat = withBars.length >= 3
    && Math.max(...withBars.map((r) => r.slopePerKbar)) / Math.max(1e-9, Math.min(...withBars.map((r) => r.slopePerKbar))) < 3;

  const died = [];
  const survived = [];
  let words;
  const memRises = mem && mem.verdict === 'CLIMBS';
  if (memRises && barsRatio && barsRatio > 2) {
    died.push('"the cost is a timer or animation loop that does not care how fast bars arrive" — memory growth per MINUTE rises with speed');
    survived.push('"the cost is per-bar work" — faster play means more bars per minute and proportionally more growth');
    words = `Degradation scales with bars played, not with wall time. Memory growth per minute rises with replay speed (${n1(mem.slopePerUnitKnob)} MB/min for each 1x of speed ${ci(mem.ci)}), while the per-bar cost stays ${perBarFlat ? 'roughly constant' : 'within a factor of a few'} across ${slow.speed}x to ${fast.speed}x. At ${fast.speed}x the chart advances ${n1(barsRatio)}x more bars per minute than at ${slow.speed}x and pays proportionally.`;
  } else if (mem && !memRises) {
    died.push('"the cost is per-bar work" — growth per minute is flat across a 60x range of bar rates');
    survived.push('"the cost is a timer, subscription or animation loop" — it bills by the second regardless of bars');
    words = `Degradation scales with wall time, not with bars played. Growth per minute is flat from ${slow.speed}x to ${fast.speed}x (${n1(mem.slopePerUnitKnob)} MB/min per 1x ${ci(mem.ci)}) even though ${fast.speed}x advances ${n1(barsRatio)}x more bars per minute. Something bills by the clock.`;
  } else {
    words = `S1 fitted memory growth against speed as ${mem ? `${n1(mem.slopePerUnitKnob)} MB/min per 1x ${ci(mem.ci)} (${mem.verdict})` : 'unavailable'}, which does not cleanly separate the two declared mechanisms.`;
  }
  return { words, died, survived, table: rows.map((r) => `${r.speed}x: ${n1(r.barsPerMin)} bars/min, slope ${n1(r.slopePerKbar)} ms/bar per kbar, ${n1(r.footprintMBPerMin)} MB/min`) };
}

function wordsS5(art) {
  const pts = (art.pointSummaries || []).filter((p) => p.status === 'OK');
  const rows = pts.map((p) => ({ limit: Number(p.value), cold: p.coldRead })).filter((r) => r.cold);
  if (rows.length < 2) return { words: 'S5 could not be stated: the cold reads at first paint are missing.', died: [], survived: [] };
  const resident = rows.map((r) => r.cold.residentBars).filter(Number.isFinite);
  const spread = resident.length ? Math.max(...resident) / Math.max(1, Math.min(...resident)) : null;
  const limitSpread = Math.max(...rows.map((r) => r.limit)) / Math.min(...rows.map((r) => r.limit));
  const died = [];
  const survived = [];
  let words;
  if (spread != null && spread < 1.3) {
    died.push('"the chart hydrates all the history it can reach at load" — resident bars at first paint are pinned regardless of how much is requested');
    survived.push('"the chart windows its initial fetch" — which means the first-paint floor is NOT a retention defect');
    words = `Resident memory at first paint does not scale with available history. Asking for ${limitSpread}x more history changes resident bars by only ${n1(spread)}x (${resident.join(' / ')} bars), so the chart windows what it loads and the first-paint floor is a design cost rather than over-hydration.`;
  } else if (spread != null) {
    survived.push('"the chart hydrates everything it can reach" — resident bars track the requested limit');
    died.push('"the chart windows to the viewport at load"');
    words = `Resident memory at first paint DOES scale with available history: ${limitSpread}x more requested history gives ${n1(spread)}x the resident bars (${resident.join(' / ')}), so the chart hydrates what it can reach and the load path is a fixable canary-relevant defect.`;
  } else words = 'S5 produced no usable resident-bar readings at first paint.';
  return { words, died, survived, table: rows.map((r) => `limit ${r.limit}: ${r.cold.residentBars} resident, ${r.cold.rawBars} raw, ${r.cold.heapMB} MB heap, requested=${r.cold.requestedLimit}`) };
}

function wordsS2(art) {
  const pts = (art.pointSummaries || []).filter((p) => p.status === 'OK');
  if (pts.length < 3) return { words: 'S2 could not be stated: fewer than three usable panel-count points.', died: [], survived: [] };
  const rows = pts.map((p) => ({
    panels: Number(p.value),
    level: p.cpuMsPerBarMean,
    slope: slopeOf(p),
    mem: p.footprintMBPerMin,
    perPanelMem: Number.isFinite(p.footprintMBPerMin) ? +(p.footprintMBPerMin / Number(p.value)).toFixed(2) : null,
  }));
  const one = rows.find((r) => r.panels === 1);
  const four = rows.find((r) => r.panels === 4) || rows.at(-1);
  const ratio = (one && four && one.perPanelMem > 0) ? four.perPanelMem / one.perPanelMem : null;
  const died = [];
  const survived = [];
  let words;
  if (ratio != null && ratio > 1.25) {
    survived.push('"cross-panel coupling" — per-panel cost RISES with panel count, so panels are not independent');
    died.push('"panels are independent and we simply pay four times" — a linear model cannot produce a rising per-panel cost');
    words = `Cost per panel rises with panel count: ${n1(one.perPanelMem)} MB/min per panel at one panel against ${n1(four.perPanelMem)} at ${four.panels}, a factor of ${n1(ratio)}. Multichart is superlinear, so there is cross-panel coupling on top of the per-panel cost — a different defect with a different fix.`;
  } else if (ratio != null && ratio < 0.8) {
    died.push('"cross-panel coupling" — per-panel cost FALLS as panels are added, meaning fixed overhead dominates');
    words = `Cost per panel FALLS as panels are added: ${n1(one.perPanelMem)} MB/min per panel at one against ${n1(four.perPanelMem)} at ${four.panels}. The multichart cost is dominated by a fixed overhead paid once, not by coupling between panels.`;
  } else if (ratio != null) {
    died.push('"cross-panel coupling" — scaling is linear within measurement error');
    survived.push('"panels are independent" — we pay N times for one defect, so fixing the per-panel cost fixes multichart');
    words = `Panels scale linearly: per-panel cost is ${n1(one.perPanelMem)} MB/min at one panel and ${n1(four.perPanelMem)} at ${four.panels}, a factor of ${n1(ratio)}. Panels are independent, so the multichart problem is the single-panel problem paid ${four.panels} times.`;
  } else words = 'S2 produced no usable per-panel comparison.';
  return { words, died, survived, table: rows.map((r) => `${r.panels} panel(s): ${n1(r.mem)} MB/min total, ${n1(r.perPanelMem)} MB/min per panel, ${n1(r.level)} ms/bar`) };
}

function wordsS4(art) {
  const pts = (art.pointSummaries || []).filter((p) => p.status === 'OK');
  const same = pts.find((p) => p.value === 'same-pair');
  const dist = pts.find((p) => p.value === 'distinct-pair');
  if (!same || !dist) return { words: 'S4 could not be stated: one of the two arms is missing.', died: [], survived: [] };
  const memRatio = (Number.isFinite(same.footprintMBPerMin) && same.footprintMBPerMin > 0 && Number.isFinite(dist.footprintMBPerMin))
    ? dist.footprintMBPerMin / same.footprintMBPerMin : null;
  const barRatio = (Number.isFinite(same.cpuMsPerBarMean) && same.cpuMsPerBarMean > 0 && Number.isFinite(dist.cpuMsPerBarMean))
    ? dist.cpuMsPerBarMean / same.cpuMsPerBarMean : null;
  const died = [];
  const survived = [];
  let words;
  if (memRatio != null && (memRatio > 1.5 || (barRatio ?? 0) > 1.5)) {
    survived.push('"the same-pair guards are the story" — different-pair is materially worse, so CONF-03 has teeth');
    words = `Four different pairs cost ${n1(memRatio)}x the memory growth and ${n1(barRatio)}x the per-bar time of four copies of the same pair (${n1(dist.footprintMBPerMin)} against ${n1(same.footprintMBPerMin)} MB/min). The twenty _multichartSamePairAsHost guards are doing real work, and every optimisation behind them is inert in the configuration users actually run.`;
  } else if (memRatio != null) {
    died.push('"the same-pair optimised paths are worth protecting" — same-pair and different-pair measure within a factor of 1.5');
    words = `Same-pair and different-pair are close: ${n1(dist.footprintMBPerMin)} against ${n1(same.footprintMBPerMin)} MB/min, a factor of ${n1(memRatio)}. The optimised same-pair paths were never worth much, so we can stop protecting them.`;
  } else words = 'S4 produced no usable comparison.';
  return { words, died, survived, table: pts.map((p) => `${p.value}: ${n1(p.footprintMBPerMin)} MB/min, ${n1(p.cpuMsPerBarMean)} ms/bar, slope ${n1(slopeOf(p))}`) };
}

const WORDERS = { S3: wordsS3, S1: wordsS1, S5: wordsS5, S2: wordsS2, S4: wordsS4 };

function standingWords(id, art) {
  if (!art) return null;
  if (art.status === 'VOID') return `VOID — ${art.reason}`;
  const t = art.trends || {};
  const fmt = (f, unit) => (f ? `${n1(f.perMin ?? f.perHour ?? f.perCycle ?? f.slope)} ${unit} (${f.verdict})` : 'unavailable');
  if (id === 'idle') {
    return `Idle, not playing, ${art.samples?.length ?? 0} samples: renderer CPU ${n1(art.means?.rendererCpuPercent)}%, memory ${fmt(t.footprintMBPerMin, 'MB/min')}, elements ${fmt(t.elementsPerMin, '/min')}. ${t.footprintMBPerMin?.verdict === 'CLIMBS' ? 'An idle chart that is not playing still grows, which has nothing to do with replay.' : 'An idle chart is flat, so the floor is a design cost and not a leak.'}`;
  }
  if (id === 'background') {
    return `Backgrounded with Chrome throttling left ON: renderer CPU ${n1(art.means?.rendererCpuPercent)}%, memory ${fmt(t.footprintMBPerMin, 'MB/min')}, ${n1(art.means?.footprintMB)} MB resident mean. ${(art.means?.rendererCpuPercent ?? 0) > 5 ? 'A hidden tab still burns CPU with nothing advancing, which reproduces the shape of the PO reading.' : 'A hidden tab is quiet here, so the PO 18.8% is not reproducible headless and I am not going to explain it from this run.'}`;
  }
  if (id === 'teardown') {
    const c = art.cycles || [];
    const f = c[0]?.footprint?.pageRendererPrivateMB;
    const l = c.at(-1)?.footprint?.pageRendererPrivateMB;
    return `Ten open/close cycles, floor read after each close: ${n1(f)} MB to ${n1(l)} MB, ${fmt(t.footprintMBPerCycle, 'MB/cycle')}; post-GC heap ${fmt(t.postGcHeapMBPerCycle, 'MB/cycle')}, documents ${fmt(t.documentsPerCycle, '/cycle')}, listeners ${fmt(t.listenersPerCycle, '/cycle')}. ${t.footprintMBPerCycle?.verdict === 'CLIMBS' ? 'The floor does not come back down: residue confirmed on a clean measurement.' : 'The floor returns: the residue hypothesis is dead on a clean measurement.'}`;
  }
  if (id === 'seekrewind') {
    const k = art.correctness || {};
    return `${k.seeksAttempted} backward seeks: ${k.seeksThatMovedBackwards} moved the playhead, ${k.seeksThatFailed} failed outright, playback stopped ${k.timesPlaybackStopped} times and needed re-arming ${k.timesNeededReArm} times. Elements ${fmt(t.elementsPerSeek, '/seek')}. ${k.timesPlaybackStopped > 0 ? 'Seeking backward can stop playback dead, which is the duration-gate defect reproduced on demand.' : 'Playback survived every seek.'}`;
  }
  if (id === 'pancold') {
    const v = art.verdict || {};
    return `${v.pansAttempted} pans back into cold history, ${v.pansThatFailed} failed: data returned every pan = ${v.dataReturnedEveryPan}. Resident bars ${v.residentBarsFirst} to ${v.residentBarsLast}, anything released = ${v.anythingReleased}. ${v.anythingReleased === false ? 'Panning into cold history only adds; nothing is released on the pan path either.' : ''}`;
  }
  if (id === 'torture') {
    return `Upper bound, four panels, four indicators, drawings ${art.setup?.drawings ?? '?'}, orders accumulating, tick mode, 60x: renderer CPU ${n1(art.means?.rendererCpuPercent)}%, ${n1(art.means?.footprintMB)} MB renderer private, memory ${fmt(t.footprintMBPerMin, 'MB/min')}, elements ${fmt(t.elementsPerMin, '/min')}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------

const lines = [];
const allDied = [];
const allSurvived = [];
const voids = [];
const inProgress = [];

const sweepManifest = read(path.join(EVIDENCE, `SWEEP-QUEUE-MANIFEST-${STAMP}.json`));
const standingManifest = read(path.join(EVIDENCE, `STANDING-QUEUE-MANIFEST-${STAMP}.json`));

for (const id of ['S3', 'S1', 'S5', 'S2', 'S4']) {
  const art = read(path.join(EVIDENCE, `SWEEP-${id}-${STAMP}.json`));
  const entry = sweepManifest?.sweeps?.find((s) => s.id === id);
  if (!art) {
    if (entry?.status === 'RUNNING') inProgress.push(`${id} — running now`);
    else if (entry) voids.push(`${id} — ${entry.status}${entry.reason ? `: ${entry.reason}` : ''} (no artifact)`);
    else inProgress.push(`${id} — queued, not started`);
    continue;
  }
  if (art.grade?.sweepVoid) {
    voids.push(`${id} — VOID: the negative control was the worst point, so the knob or the held-fixed workload is wrong and the sweep cannot be believed`);
    continue;
  }
  const w = WORDERS[id](art);
  // RUNNING is not VOID. Reporting an in-progress point as a death is how a good run gets written
  // up as a bad one.
  const dead = (art.points || []).filter((p) => p.status === 'VOID');
  const running = (art.points || []).filter((p) => p.status === 'RUNNING');
  lines.push({
    id,
    knob: art.sweep?.knob,
    question: art.sweep?.question,
    words: w.words,
    table: w.table || [],
    voidPoints: dead.map((p) => `${p.value}: ${p.reason || 'unknown'}`),
    runningPoints: running.map((p) => p.value),
    control: art.grade?.negativeControl,
  });
  allDied.push(...w.died.map((d) => `${id}: ${d}`));
  allSurvived.push(...w.survived.map((d) => `${id}: ${d}`));
  for (const p of dead) voids.push(`${id} point ${art.sweep?.knob}=${p.value} — ${p.reason || 'unknown'}`);
}

const standingLines = [];
for (const id of ['teardown', 'seekrewind', 'pancold', 'idle', 'background', 'torture']) {
  const art = read(path.join(EVIDENCE, `STANDING-${id.toUpperCase()}-${STAMP}.json`));
  const entry = standingManifest?.scenarios?.find((s) => s.id === id);
  if (!art) {
    if (entry?.status === 'RUNNING') inProgress.push(`${id} — running now`);
    else if (entry) voids.push(`${id} — ${entry.status}${entry.reason ? `: ${entry.reason}` : ''}`);
    else inProgress.push(`${id} — queued, not started`);
    continue;
  }
  const w = standingWords(id, art);
  if (w) standingLines.push({ id, words: w });
  if (art.status === 'VOID') voids.push(`${id} — ${art.reason}`);
}

const md = [];
md.push(`# SWEEP-01 — the curves, stated in words`);
md.push('');
md.push(`**Generated ${new Date().toISOString()}** · ruling 3df92902c · point duration 12 min, derived in \`SWEEP-POINT-DURATION-${STAMP}.json\``);
md.push('');
md.push('## The fitted relationships');
md.push('');
for (const l of lines) {
  md.push(`**${l.id} — ${l.knob}.** ${l.words}`);
  md.push('');
}
if (!lines.length) md.push('_No sweep has produced a gradeable artifact yet._');
md.push('');
if (allDied.length) {
  md.push('## Hypotheses that died');
  md.push('');
  for (const d of allDied) md.push(`- ${d}`);
  md.push('');
}
if (allSurvived.length) {
  md.push('## Hypotheses that survived');
  md.push('');
  for (const s of allSurvived) md.push(`- ${s}`);
  md.push('');
}
if (standingLines.length) {
  md.push('## Standing scenarios');
  md.push('');
  for (const s of standingLines) { md.push(`**${s.id}.** ${s.words}`); md.push(''); }
}
if (voids.length) {
  md.push('## VOID');
  md.push('');
  for (const v of voids) md.push(`- ${v}`);
  md.push('');
}
if (inProgress.length) {
  md.push('## Still running or queued');
  md.push('');
  for (const v of inProgress) md.push(`- ${v}`);
  md.push('');
}
md.push('## Numbers behind the words');
md.push('');
for (const l of lines) {
  md.push(`**${l.id}** — ${l.question}`);
  for (const t of l.table) md.push(`  - ${t}`);
  if (l.control) md.push(`  - negative control (${l.knob}=${l.control.value}): level ${n1(l.control.cpuMsPerBarMean)} ms/bar, slope verdict ${l.control.slopeVerdict}, degraded=${l.control.degraded}, inverted=${l.control.isTheWorstPoint}`);
  md.push('');
}
md.push('## Scope of every gauge in this file');
md.push('');
md.push('Main-thread share by category is NOT collected — that needs a trace costing more than a sweep point, and renderer CPU percent is reported instead, which is a different number. Renders-per-React-commit is NOT collected; paints/sec and paints/bar are the proxies. Everything else in the SWEEP-01 gauge list is read at every point.');
md.push('');

const outPath = path.join(EVIDENCE, `SWEEP-SUMMARY-${STAMP}.md`);
fs.writeFileSync(outPath, md.join('\n'));
console.error(`wrote ${outPath}`);
console.error(`\n${lines.map((l) => `${l.id}: ${l.words}`).join('\n\n')}`);
console.error(`\nDIED:\n${allDied.map((d) => `  ${d}`).join('\n') || '  (none yet)'}`);
console.error(`\nVOID:\n${voids.map((v) => `  ${v}`).join('\n') || '  (none)'}`);
