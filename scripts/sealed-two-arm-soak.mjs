#!/usr/bin/env node
/**
 * SEALED TWO-ARM SOAK — the harness tomorrow's confirmation run starts from.
 *
 * Built to DETACH-01 and SOAK-SEAL, and shaped by every way tonight's runs died:
 *
 *  - DETACHED: launched so its parent is WmiPrvSE, not an editor's console. Two runs died to an editor
 *    crash cascading into the process tree.
 *  - APPEND AS TAKEN: every sample is an fsync'd JSONL line. Five hours of samples lived only in memory
 *    when the first run died.
 *  - HEARTBEAT: written per sample, write-then-rename, so a reader can tell ALIVE from COMPLETED from
 *    DEAD OR STALLED without a process to inspect.
 *  - AUTO-RESUME: a dead browser is re-booted and the run continues, but the resume is recorded as a
 *    SEGMENT BOUNDARY, because a new browser resets the very quantity the slope is measured over. Tonight's
 *    segment 2 taught this: continuing silently would have produced one series across two populations.
 *  - SEALED: badge AND digest of the served bytes captured at start and RE-VERIFIED every sample. A build
 *    re-cut under the same label mid-run voids the run instead of contaminating it.
 *  - PANEL TRUTH: liveness is judged on the PLAYHEAD, not the bar count. The bar-count route reads 1 of 4
 *    on a healthy CONF-01 and has produced a false void twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openRun, inspectRun } from './lib/detach01.mjs';
import { bootConf01Session, cycleTrades } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { reapOrphanedRenderers } from './lib/find-soak-port.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', 'trades');                 // trades | zerotrade
const HOURS = Number(argOf('hours', '10'));
const SAMPLE_MS = Number(argOf('sampleMs', '180000'));
const SPEED = Number(argOf('speed', '60'));
const CLOSES_PER_HOUR = Number(argOf('closesPerHour', '20'));
const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = argOf('out', path.join(EV, `SEALED-SOAK-${ARM.toUpperCase()}.jsonl`));
const EXPECT_DIGEST = argOf('expectDigest', '');    // set to pin the run to one build

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[soak:${ARM} ${new Date().toISOString()}] ${m}`);

// Identical to build-passport.mjs, in the same order. A digest is only comparable across tools if the path
// set is: my first version hashed four paths and produced a different digest for the same build than the
// passport's six, which would have looked like a seal break tomorrow.
const SEAL_PATHS = [
  '/chart/dist-v9/index.html',
  '/chart/dist-v9/assets/talaria-v9-live.js',
  '/chart/dist-v9/sw.js',
  '/chart/chart.js',
  '/chart/multichart-prod/multichart-manager.js',
  '/chart/modules/chart-window-limit.js',
];

async function passport() {
  const parts = [];
  let badge = null;
  for (const p of SEAL_PATHS) {
    try {
      const res = await fetch(`${ORIGIN}${p}`);
      const buf = Buffer.from(await res.arrayBuffer());
      parts.push(`${p}:${crypto.createHash('sha256').update(buf).digest('hex')}`);
      if (!badge) { const m = String(buf).match(/20\d{6}b\d+/); if (m) badge = m[0]; }
    } catch (err) { parts.push(`${p}:ERROR`); }
  }
  return { badge, digest: crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32), at: new Date().toISOString() };
}

/** Liveness by playhead, with bar count recorded alongside so the two routes can be compared. */
async function readPanels(page) {
  const rows = [];
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const ch = window.chart;
      if (!ch) return null;
      const rs = ch.replaySystem;
      return {
          isHost: window.top === window,
          // The engine field is currentTimeframe. conf01-session.mjs:58 already reads it correctly; this
          // script asked for ch.timeframe, which does not exist, so every segment marker recorded
          // [null,null,null,null] while asserting "4 panels with distinct datasets". A panel that silently
          // changed timeframe mid-run would have been invisible in the artifact that exists to catch it.
          tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : (ch.timeframe ?? null),
        bars: Array.isArray(ch.data) ? ch.data.length : 0,
        playhead: [rs?.replayTimestamp, rs?.currentTime, rs?.replayIndex].map(Number).find((v) => Number.isFinite(v)) ?? null,
      };
    }).catch(() => null);
    if (r) rows.push(r);
  }
  return rows;
}

const readClosed = (page) => page.evaluate(() => {
  const om = (window.chart && window.chart.orderManager) || window.orderManager;
  return om && Array.isArray(om.closedPositions) ? om.closedPositions.length : null;
}).catch(() => null);

const seal = await passport();
if (EXPECT_DIGEST && seal.digest !== EXPECT_DIGEST) {
  console.error(`REFUSING TO START: expected digest ${EXPECT_DIGEST}, served build is ${seal.digest} (badge ${seal.badge}). A soak that cannot name its build measures a question nobody can state.`);
  process.exit(2);
}

const run = openRun({
  name: `sealed-soak-${ARM}`,
  out: OUT,
  meta: {
    signature: 'SEALED-TWO-ARM-SOAK-V1',
    arm: ARM,
    armMeaning: ARM === 'zerotrade' ? 'CONF-05: four panels, E indicators, ZERO trades — bar-driven growth with the trade term absent by construction' : 'CONF-01: four panels, E indicators, governor holding ~20 closes/hour',
    bfcacheState: 'default (enabled) — a long-running session, no reset axis measured here.',
    seal,
    origin: ORIGIN,
    requestedSpeed: SPEED,
    plannedHours: HOURS,
    detach01: 'append-as-taken JSONL with fsync, heartbeat per sample, auto-resume across a browser death with the resume recorded as a segment boundary',
  },
});
log(`opened, resumed ${run.resumedSamples.length} samples, ${run.tornLinesSkipped} torn line(s) skipped, badge ${seal.badge} digest ${seal.digest}`);

let segment = run.resumedSamples.length ? (Math.max(...run.resumedSamples.map((r) => r.segment || 1)) + 1) : 1;
if (run.resumedSamples.length) {
  run.note({
    __segmentBoundary: true,
    segment,
    why: 'Resumed after the previous browser ended. A new browser resets resident bars and footprint, so samples before and after this line belong to DIFFERENT populations and must not be pooled into one slope.',
  });
}

const t0 = Date.now();
let session = null;
let nextGovernorAt = Date.now();
const governorEveryMs = 3_600_000 / Math.max(1, CLOSES_PER_HOUR);

try {
  while ((Date.now() - t0) / 3600000 < HOURS) {
    if (!session) {
      reapOrphanedRenderers();
      const eSel = loadConf05Indicators();
      log(`booting segment ${segment}`);
      session = await bootConf01Session({
        indicators: eSel.pairs,
        replaySpeed: SPEED,
        placeOrder: ARM !== 'zerotrade',
        label: `sealed-soak-${ARM}`,
      });
      const eff = await session.page.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        return rs ? (rs.speed ?? rs.playbackSpeed ?? null) : null;
      }).catch(() => null);
      const panels = await readPanels(session.page);
      run.note({
        __segmentStart: true,
        segment,
        requestedSpeed: SPEED,
        effectiveSpeed: eff,
        speedMismatch: eff != null && Number(eff) !== SPEED ? `Requested ${SPEED}, engine reports ${eff}. Every rate in this segment belongs to ${eff}.` : null,
        panels: panels.length,
        timeframes: panels.map((p) => p.tf),
      });
      if (panels.length < 4) {
        run.note({ __void: true, segment, why: `Only ${panels.length} chart frames at boot; CONF-01 requires 4.` });
        throw new Error('panel gate failed at boot');
      }
      log(`segment ${segment} up: ${panels.length} panels, effective speed ${eff}`);
    }

    await sleep(SAMPLE_MS);

    let before = null;
    let after = null;
    try {
      before = await readPanels(session.page);
      await sleep(20000);
      after = await readPanels(session.page);
    } catch (err) {
      log(`sample read failed (${String(err).slice(0, 80)}) — treating as a dead browser and resuming`);
    }

    if (!before || !after || !after.length) {
      run.note({ __browserLost: true, segment, at: new Date().toISOString(), why: 'Browser stopped answering. Auto-resuming into a new segment.' });
      try { await session.browser.close(); } catch { /* already gone */ }
      session = null;
      segment += 1;
      continue;
    }

    // Playhead liveness, with the bar-count route recorded beside it rather than instead of it.
    const live = after.filter((r, i) => (r.playhead != null && before[i]?.playhead != null && r.playhead !== before[i].playhead) || r.bars > (before[i]?.bars ?? 0)).length;
    const liveByBars = after.filter((r, i) => r.bars > (before[i]?.bars ?? 0)).length;

    const closed = await readClosed(session.page);
    if (ARM !== 'zerotrade' && Date.now() >= nextGovernorAt) {
      await cycleTrades(session.page, { open: 1, close: 1, holdMs: 800 }).catch(() => null);
      nextGovernorAt = Date.now() + governorEveryMs;
    }

    const nowSeal = await passport();
    const sealHeld = nowSeal.digest === seal.digest;

    run.append({
      segment,
      hours: +((Date.now() - t0) / 3600000).toFixed(4),
      residentBars: after.reduce((s, r) => s + r.bars, 0),
      perPanelBars: after.map((r) => r.bars),
      panelsLive: live,
      panelsLiveByBarCountOnly: liveByBars,
      closedTrades: closed,
      sealDigestNow: nowSeal.digest,
      sealHeld,
      sealNote: sealHeld ? null : 'BUILD CHANGED UNDER THE RUN. Every sample from here belongs to a different build and must not be pooled with earlier ones.',
    });

    if (!sealHeld) {
      run.note({ __void: true, segment, why: `Served build changed mid-run: ${seal.digest} -> ${nowSeal.digest}. Stopping rather than producing a series across two builds.` });
      log('SEAL BROKEN — stopping');
      break;
    }
    if (live < 4) {
      run.note({ __warning: true, segment, why: `Only ${live} of ${after.length} panels live by playhead (bar-count route says ${liveByBars}).` });
    }
  }
  run.finish({ completed: true, segments: segment });
} catch (err) {
  run.note({ __error: true, error: String(err && err.stack ? err.stack : err).slice(0, 600) });
  run.finish({ completed: false, segments: segment });
} finally {
  try { if (session?.browser) await session.browser.close(); } catch { /* gone */ }
}
log(`done: ${JSON.stringify(inspectRun(OUT))}`);
