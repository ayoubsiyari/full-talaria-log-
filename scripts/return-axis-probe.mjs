#!/usr/bin/env node
/**
 * RETURN-AXIS-PROBE — RESET-01's third axis, measured from a HEAVY session.
 *
 * The rejected measurement tested return from a nearly empty single-chart session: 369 MB footprint,
 * 17 MB heap. The Director's objection is exact — the question is not whether a light document is
 * released, it is whether a heavy one is, and a session that accumulated nothing cannot demonstrate
 * release. This run reaches a heavy `CONF-01` state first and only then takes an exit.
 *
 * THE THREE EXITS ARE DIFFERENT CODE PATHS, AND ONLY ONE OF THEM CAN USE THE BACK-FORWARD CACHE.
 *   - `reload`   — same URL replaces the same document. Chrome does not put a reloaded document in
 *                  bfcache, so this path measures OUR teardown with the cache out of the picture. It is
 *                  the path the PO named first and it has never been run.
 *   - `logout`   — cross-document navigation to /login/ in the same tab, so Back could return: this is
 *                  the ONLY one of the three that is bfcache-eligible, and therefore the only one where
 *                  running both arms tells us anything. Stated here rather than discovered later.
 *   - `tabclose` — the page is closed and a new one opened. The document is destroyed outright, so this
 *                  is the floor: anything still held after it is not the renderer's document.
 *
 * WHAT MAKES THIS READABLE RATHER THAN JUST A NUMBER
 * A reload may legitimately RESTORE the heavy session — chart.js has `applyPersistedState`,
 * `_queuePersistedIndicatorsRestore` and template restore paths. A high footprint on re-entry would then
 * be a faithfully restored four-panel session, not retained garbage, and calling it a leak would be the
 * same error as calling bfcache a leak. So every re-entry reading carries a STATE CENSUS — panels,
 * indicators, resident bars, closed trades — and the verdict is only allowed to say "retained" when the
 * footprint is high while the state census is not.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State, cycleTrades } from './lib/conf01-session.mjs';
import {
  dismissCookieBanner, uiLoginDeployed, waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const EXITS = String(argOf('exits', 'reload,logout,tabclose')).split(',').map((s) => s.trim()).filter(Boolean);
const ARM = String(argOf('arm', 'default'));
const HEAVY_MB = Number(argOf('heavy-mb', 1024));
const HEAVY_DEADLINE_MIN = Number(argOf('heavy-deadline-min', 55));
const SPEED = Number(argOf('speed', 5));
const OUT = argOf('out', `c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\RETURN-AXIS-${ARM.toUpperCase()}-20260731.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'RETURN-AXIS-PROBE-V1',
  ruling: 'RESET-01 — return is the third axis, tested from a heavy session against every exit',
  // Required field per RESET-01 point 3, declared like a build stamp.
  bfcacheState: ARM === 'nobfcache' ? 'DISABLED via --disable-features=BackForwardCache' : 'ENABLED (Chrome default, what real users run)',
  arm: ARM,
  exitsRequested: EXITS,
  heavyTargetMBAboveFirstPaint: HEAVY_MB,
  onlyLogoutIsBfcacheEligible: 'A reload replaces the same document and a tab close destroys it; neither is a back-forward cache path. The two arms can therefore only differ on the logout exit, and that is where the second arm is spent.',
  gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
  startedAtIso: new Date().toISOString(),
  exits: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

/** Footprint + counters + the state census that makes a footprint interpretable. */
async function readAll(page, cdp, browserCdp, label) {
  const g = await readSweepGauges(page, cdp, browserCdp, {
    cpuWindowMs: 4_000, readOsFootprints, forceGc: true,
  }).catch(() => ({}));
  const state = await readConf01State(page).catch(() => null);
  // Count what is actually mounted, per realm, so a restored session is not mistaken for retention.
  const census = await page.evaluate(() => {
    const out = { realms: 0, residentBars: 0, indicators: 0, canvases: 0, visibleBars: 0 };
    const wins = [window];
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      try { if (f.contentWindow) wins.push(f.contentWindow); } catch { /* cross-origin */ }
    }
    for (const w of wins) {
      try {
        const ch = w.chart;
        if (!ch) continue;
        out.realms += 1;
        if (Array.isArray(ch.data)) out.residentBars += ch.data.length;
        const ind = ch.indicators || ch.activeIndicators;
        if (Array.isArray(ind)) out.indicators += ind.length;
        else if (ind && typeof ind === 'object') out.indicators += Object.keys(ind).length;
        if (Number.isFinite(ch.visibleStartIndex) && Number.isFinite(ch.visibleEndIndex)) {
          out.visibleBars += Math.max(0, ch.visibleEndIndex - ch.visibleStartIndex);
        }
        out.canvases += w.document.querySelectorAll('canvas').length;
      } catch { /* realm gone */ }
    }
    return out;
  }).catch(() => null);

  return {
    label,
    atIso: new Date().toISOString(),
    footprintTotalMB: g.footprint?.totalPrivateMB ?? null,
    rendererMB: g.footprint?.pageRendererPrivateMB ?? null,
    gpuMB: g.footprint?.gpuProcessPrivateMB ?? null,
    heapPostGcMB: g.counters?.collected?.jsHeapMB ?? null,
    documents: g.counters?.live?.documents ?? null,
    nodes: g.counters?.live?.nodes ?? null,
    listeners: g.counters?.live?.listeners ?? null,
    stateCensus: census,
    closedTrades: state?.closedTrades ?? null,
    advancingPanels: state?.advancingPanels ?? null,
    buildStamp: await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null),
  };
}

/**
 * Footprint read straight from the OS, usable when no page exists.
 *
 * `collectFirst` matters more than it looks. The launch check compared a COLLECTED heavy reading against
 * UNCOLLECTED post-exit readings and produced a −75 MB "release", i.e. the exit appeared to ADD memory.
 * Every number that enters a comparison in this run is now collected first, so the differences are
 * between like and like. Collection is also the conservative choice: it measures what is genuinely
 * retained rather than what merely has not been swept yet.
 */
async function footprintOnly(browserCdp, cdp = null) {
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await sleep(1_500);
  }
  try {
    const info = await browserCdp.send('SystemInfo.getProcessInfo');
    const fps = await readOsFootprints((info.processInfo || []).map((p) => p.id));
    let total = 0; let renderer = 0; const byType = {};
    for (const p of info.processInfo || []) {
      const fp = fps[p.id];
      if (!fp) continue;
      total += fp.privateMB;
      const k = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : 'other');
      byType[k] = +((byType[k] || 0) + fp.privateMB).toFixed(1);
      if (/renderer/i.test(p.type) && fp.privateMB > renderer) renderer = fp.privateMB;
    }
    return { totalPrivateMB: +total.toFixed(1), pageRendererPrivateMB: +renderer.toFixed(1), byType };
  } catch { return {}; }
}

(async () => {
  let session = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      speed: SPEED,
      placeOrder: false,
      label: `return-axis-${ARM}`,
      extraArgs: ARM === 'nobfcache' ? ['--disable-features=BackForwardCache'] : [],
    });
    let { page } = session;
    const { cdp, browserCdp, conf01, browser } = session;
    report.buildStamp = conf01?.buildId ?? null;
    report.conf01 = {
      panels: conf01?.panels ?? null,
      distinctFileIds: conf01?.distinctFileIds ?? null,
      distinctTimeframes: conf01?.distinctTimeframes ?? null,
    };
    const origin = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');

    // ---- The reference point every re-entry is judged against ---------------
    report.session1FirstPaint = await readAll(page, cdp, browserCdp, 'session-1-first-paint');
    console.error(`[return] SESSION 1 FIRST PAINT foot=${report.session1FirstPaint.footprintTotalMB}MB heap=${report.session1FirstPaint.heapPostGcMB}MB docs=${report.session1FirstPaint.documents} bars=${report.session1FirstPaint.stateCensus?.residentBars} realms=${report.session1FirstPaint.stateCensus?.realms}`);
    const referenceMB = report.session1FirstPaint.footprintTotalMB;

    for (const exit of EXITS) {
      const row = { exit, startedAtIso: new Date().toISOString() };
      report.exits.push(row);
      save();

      // ---- Reach a heavy state: at least HEAVY_MB above first paint --------
      const heavyTarget = referenceMB + HEAVY_MB;
      const heavyDeadline = Date.now() + HEAVY_DEADLINE_MIN * 60_000;
      let last = null;
      let closes = 0;
      let nextTrade = Date.now();
      while (Date.now() < heavyDeadline) {
        if (Date.now() >= nextTrade) {
          const c = await cycleTrades(page, { open: 1, close: 1, holdMs: 0 }).catch(() => null);
          closes += c?.closed || 0;
          nextTrade = Date.now() + 180_000;
        }
        await sleep(60_000);
        const fp = await footprintOnly(browserCdp, cdp);
        last = fp.totalPrivateMB ?? last;
        console.error(`[return:${exit}] building heavy: ${last}MB / target ${heavyTarget.toFixed(0)}MB (+${(last - referenceMB).toFixed(0)} of ${HEAVY_MB}) closes=${closes}`);
        if (last != null && last >= heavyTarget) break;
      }
      row.heavyState = await readAll(page, cdp, browserCdp, `heavy-before-${exit}`);
      row.heavyClosedTradesAdded = closes;
      row.heavyAboveFirstPaintMB = row.heavyState.footprintTotalMB != null
        ? +(row.heavyState.footprintTotalMB - referenceMB).toFixed(1) : null;
      row.heavyTargetMet = (row.heavyAboveFirstPaintMB ?? 0) >= HEAVY_MB;
      if (!row.heavyTargetMet) {
        row.heavyShortfallNote = `Reached +${row.heavyAboveFirstPaintMB} MB against a +${HEAVY_MB} MB target inside ${HEAVY_DEADLINE_MIN} minutes. The exit is still measured, but this arm is weaker than the ruling asked for and the shortfall is stated rather than hidden.`;
      }
      save();
      console.error(`[return:${exit}] HEAVY foot=${row.heavyState.footprintTotalMB}MB (+${row.heavyAboveFirstPaintMB}) bars=${row.heavyState.stateCensus?.residentBars} trades=${row.heavyState.closedTrades} docs=${row.heavyState.documents}`);

      // ---- Take the exit ---------------------------------------------------
      const exitAt = Date.now();
      if (exit === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 }).catch((e) => { row.exitError = String(e?.message || e).slice(0, 160); });
      } else if (exit === 'logout') {
        await page.evaluate(async () => {
          try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
          window.location.href = '/login/';
        }).catch((e) => { row.exitError = String(e?.message || e).slice(0, 160); });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      } else if (exit === 'tabclose') {
        await page.close().catch((e) => { row.exitError = String(e?.message || e).slice(0, 160); });
      }

      // ---- Price what is still held with nothing heavy on screen ------------
      // This is the number RESET-01 asked for: what the outgoing document COSTS, not how many exist.
      await sleep(5_000);
      row.postExitImmediate = await footprintOnly(browserCdp, exit === 'tabclose' ? null : cdp);
      await sleep(15_000);
      row.postExitSettled = await footprintOnly(browserCdp, exit === 'tabclose' ? null : cdp);
      row.heldAfterExitAboveReferenceMB = row.postExitSettled?.totalPrivateMB != null
        ? +(row.postExitSettled.totalPrivateMB - referenceMB).toFixed(1) : null;
      row.releasedByExitMB = row.heavyState.footprintTotalMB != null && row.postExitSettled?.totalPrivateMB != null
        ? +(row.heavyState.footprintTotalMB - row.postExitSettled.totalPrivateMB).toFixed(1) : null;
      save();
      console.error(`[return:${exit}] post-exit ${row.postExitSettled?.totalPrivateMB}MB — released ${row.releasedByExitMB}MB of the ${row.heavyAboveFirstPaintMB}MB accumulated`);

      // ---- Re-enter and read first paint ------------------------------------
      if (exit === 'tabclose') {
        page = await browser.newPage();
        session.page = page;
      }
      const reEnterT0 = Date.now();
      try {
        if (exit === 'logout' || exit === 'tabclose') {
          await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          await dismissCookieBanner(page).catch(() => {});
          await uiLoginDeployed(page, origin, String(process.env.TEST_EMAIL || '').trim(), String(process.env.TEST_PASSWORD || '').trim());
          await waitForDistV9SingleReady(page, { timeout: 180_000 }).catch(() => {});
        }
        await sleep(10_000);
      } catch (e) { row.reEntryError = String(e?.message || e).slice(0, 200); }
      row.reEntrySeconds = +((Date.now() - reEnterT0) / 1000).toFixed(1);

      // A four-panel session takes tens of seconds to restore, and reading 10 s in would catch a
      // half-built page, understate its footprint and hand back a false RETURNS — the lenient direction,
      // which is the one that matters here. So the re-entry footprint is a TRAJECTORY, not a snapshot, and
      // the verdict uses the settled end of it. If the trajectory is still climbing at the last sample the
      // reading says so instead of pretending it settled.
      row.reEntryTrajectory = [];
      for (const atSec of [15, 45, 90]) {
        await sleep(atSec === 15 ? 5_000 : 30_000);
        const fp = await footprintOnly(browserCdp, exit === 'tabclose' ? null : cdp);
        row.reEntryTrajectory.push({ approxSecondsAfterReEntry: atSec, totalPrivateMB: fp.totalPrivateMB ?? null });
      }
      const traj = row.reEntryTrajectory.map((t) => t.totalPrivateMB).filter((v) => v != null);
      row.reEntryStillClimbing = traj.length >= 2 && (traj[traj.length - 1] - traj[traj.length - 2]) > 40;
      if (row.reEntryStillClimbing) {
        row.reEntryClimbNote = `Footprint was still rising ${(traj[traj.length - 1] - traj[traj.length - 2]).toFixed(0)} MB between the last two samples, so the settled value is a LOWER BOUND on what this re-entry costs.`;
      }

      // A closed tab needs its own CDP session for counters; footprint is process-level either way.
      let reCdp = cdp;
      if (exit === 'tabclose') { reCdp = await page.createCDPSession().catch(() => cdp); await reCdp.send('Performance.enable').catch(() => {}); }
      row.reEntryFirstPaint = await readAll(page, reCdp, browserCdp, `re-entry-after-${exit}`);

      // ---- The bar: does session N+1 start where session 1 started? --------
      const re = row.reEntryFirstPaint;
      row.returnDeltaMB = re.footprintTotalMB != null ? +(re.footprintTotalMB - referenceMB).toFixed(1) : null;
      const restored = {
        realms: re.stateCensus?.realms ?? null,
        residentBars: re.stateCensus?.residentBars ?? null,
        indicators: re.stateCensus?.indicators ?? null,
        closedTrades: re.closedTrades ?? null,
      };
      const ref = report.session1FirstPaint.stateCensus || {};
      // Restored state is only "restored" if it is materially heavier than session 1's first paint was.
      row.stateRestoredOnReEntry = (restored.residentBars ?? 0) > (ref.residentBars ?? 0) * 1.5
        || (restored.realms ?? 0) > (ref.realms ?? 0);
      row.interpretation = row.returnDeltaMB == null
        ? 'No footprint on re-entry; nothing can be concluded.'
        : (row.reEntryStillClimbing
          ? `INCONCLUSIVE at ${row.returnDeltaMB} MB above session 1: the footprint had not settled when the last sample was taken (${row.reEntryClimbNote}), so this is a lower bound and must not be graded as a pass.`
          : row.returnDeltaMB <= 100
          ? `RETURNS. Re-entry lands ${row.returnDeltaMB} MB from session 1's first paint after carrying +${row.heavyAboveFirstPaintMB} MB, so this exit releases what the session accumulated.`
          : (row.stateRestoredOnReEntry
            ? `HIGHER BY ${row.returnDeltaMB} MB, but the state census says the session was RESTORED (${restored.residentBars} resident bars against ${ref.residentBars} at session 1, ${restored.realms} realms against ${ref.realms}). That is the product deliberately rebuilding the session, NOT retained garbage, and it must not be called a leak. What it does mean is that a user's reload does not give them a cheap page.`
            : `DOES NOT RETURN: re-entry is ${row.returnDeltaMB} MB above session 1's first paint while the state census shows only ${restored.residentBars} resident bars and ${restored.realms} realm(s) — the memory came back without the session coming back. That is retention.`));
      save();
      console.error(`[return:${exit}] RE-ENTRY foot=${re.footprintTotalMB}MB delta=${row.returnDeltaMB}MB bars=${restored.residentBars} realms=${restored.realms} restored=${row.stateRestoredOnReEntry}`);
      console.error(`[return:${exit}] ${row.interpretation}`);

      // Rebuild a four-panel heavy state for the next exit only if there is one.
      if (EXITS.indexOf(exit) < EXITS.length - 1) {
        row.noteForNextExit = 'The next exit rebuilds heavy state from whatever the re-entry left mounted, which is the honest starting point for a user who keeps working after re-entering.';
      }
    }
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    save();
    try { await session?.browser?.close?.(); } catch { /* gone */ }
  }

  // ---- Grade -------------------------------------------------------------
  const rows = report.exits.filter((r) => r.returnDeltaMB != null);
  report.grade = {
    arm: ARM,
    bfcacheState: report.bfcacheState,
    referenceFirstPaintMB: report.session1FirstPaint?.footprintTotalMB ?? null,
    byExit: rows.map((r) => ({
      exit: r.exit,
      heavyAboveFirstPaintMB: r.heavyAboveFirstPaintMB,
      heavyTargetMet: r.heavyTargetMet,
      releasedByExitMB: r.releasedByExitMB,
      heldAfterExitAboveReferenceMB: r.heldAfterExitAboveReferenceMB,
      returnDeltaMB: r.returnDeltaMB,
      stateRestoredOnReEntry: r.stateRestoredOnReEntry,
      reEntryStillClimbing: !!r.reEntryStillClimbing,
      verdict: r.reEntryStillClimbing ? 'INCONCLUSIVE-NOT-SETTLED' : (r.returnDeltaMB <= 100 ? 'RETURNS' : (r.stateRestoredOnReEntry ? 'RESTORED-NOT-RETAINED' : 'DOES-NOT-RETURN')),
    })),
    exitsThatDoNotReturn: rows.filter((r) => r.returnDeltaMB > 100 && !r.stateRestoredOnReEntry && !r.reEntryStillClimbing).map((r) => r.exit),
    exitsInconclusive: rows.filter((r) => r.reEntryStillClimbing).map((r) => r.exit),
  };
  report.verdict = rows.length === 0
    ? `No exit produced a reading. ${report.void || ''}`
    : (report.grade.exitsThatDoNotReturn.length === 0
      ? `RETURN AXIS PASSES on this arm for ${rows.map((r) => r.exit).join(', ')} from a heavy session. ${report.grade.byExit.map((b) => `${b.exit} ${b.returnDeltaMB >= 0 ? '+' : ''}${b.returnDeltaMB} MB`).join(', ')} against session 1's first paint.`
      : `RETURN AXIS FAILS on ${report.grade.exitsThatDoNotReturn.join(', ')}: ${report.grade.byExit.filter((b) => b.verdict === 'DOES-NOT-RETURN').map((b) => `${b.exit} re-enters +${b.returnDeltaMB} MB above session 1 with the session NOT restored`).join('; ')}.`);
  save();

  console.error(`\n=== RETURN AXIS (${ARM}) ${report.status} build=${report.buildStamp} bfcache=${report.bfcacheState} ===`);
  console.error(`reference first paint: ${report.grade.referenceFirstPaintMB} MB`);
  for (const b of report.grade.byExit) {
    console.error(`  ${b.exit.padEnd(9)} heavy +${b.heavyAboveFirstPaintMB}MB (target met ${b.heavyTargetMet}) -> exit released ${b.releasedByExitMB}MB -> re-entry ${b.returnDeltaMB >= 0 ? '+' : ''}${b.returnDeltaMB}MB  ${b.verdict}`);
  }
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
