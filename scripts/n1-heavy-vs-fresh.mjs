#!/usr/bin/env node
/**
 * N1 — heavy account vs fresh account, same build, same host, same configuration.
 *
 * WHY THIS IS NOW LOAD-BEARING RATHER THAN A DARK ROOM. The 1,122 MB first-paint reading is what
 * breaches the 1,024 MB bar before a single bar is replayed, and the PO is being asked to rule on it.
 * If that figure is partly the accumulated history of one heavily-used test account, then it is not the
 * product floor and the ruling is against the wrong baseline. Two accounts on one build is the only
 * measurement that separates those.
 *
 * MY OWN PREDICTION, STATED BEFORE THE RUN SO IT CAN FALSIFY ME. My API census at CONF-01 boot found all
 * 246 calls collapsing into six shapes, five of them market data, with the ONLY account-dependent payload
 * being /api/files at 28.9 KB. On that basis the two accounts should open within noise of each other, and
 * a materially lower fresh baseline means that census missed a surface. Either result is worth the run;
 * the one I would rather not have is a difference I cannot attribute.
 *
 * BOTH ARMS ARE PAUSE-PROBED so froth cannot pollute the comparison. A raw first-paint total contains an
 * unknown amount of transient, and comparing two raw totals compares two unknown transients as well as
 * two accounts.
 *
 * Credentials come from the environment and are NEVER written to the artifact — arms are labelled
 * heavy/fresh and the account is identified by a truncated hash, so the evidence is reproducible without
 * carrying a secret.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { pauseProbe } from './lib/pause-probe.mjs';
import { readStorageCensus } from './lib/storage-census.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { clockOf } from './lib/clock.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const OUT = path.join(EV, 'N1-HEAVY-VS-FRESH.json');
const argOf = (n, d) => { const p = process.argv.find((a) => a.startsWith(`--${n}=`)); return p ? p.split('=').slice(1).join('=') : d; };
const FROTH_MS = Number(argOf('frothMs', '60000'));
const RECLAIM_MS = Number(argOf('reclaimMs', '600000'));
const SPEED = Number(argOf('speed', '60'));

const log = (m) => console.log(`[${clockOf(new Date(), { seconds: true })}] ${m}`);
const tag = (email) => crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 8);

const HEAVY = { label: 'heavy', email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD };
const FRESH = { label: 'fresh', email: process.env.TEST_EMAIL_FRESH, password: process.env.TEST_PASSWORD_FRESH };

for (const a of [HEAVY, FRESH]) {
  if (!a.email || !a.password) {
    console.error(`REFUSING: the ${a.label} account has no credential in the environment. A one-armed heavy measurement is not a comparison.`);
    process.exit(2);
  }
}
if (HEAVY.email === FRESH.email) {
  console.error('REFUSING: both arms resolve to the same account. That would compare a session with itself and read as "no account effect".');
  process.exit(2);
}

async function runArm(acct) {
  log(`=== ${acct.label.toUpperCase()} arm: booting CONF-01 ===`);
  // conf01-session reads TEST_EMAIL/TEST_PASSWORD from the environment at call time, so the arm is
  // selected by swapping them here. No shared-library change, and no credential in any argument list.
  const savedE = process.env.TEST_EMAIL;
  const savedP = process.env.TEST_PASSWORD;
  process.env.TEST_EMAIL = acct.email;
  process.env.TEST_PASSWORD = acct.password;

  let session = null;
  const arm = { label: acct.label, accountTag: tag(acct.email), startedAt: new Date().toISOString() };
  try {
    session = await bootConf01Session({ replaySpeed: SPEED, headless: true });

    // FIRST PAINT. Read immediately after the boot gate passes and BEFORE any replay advance, because
    // that is the quantity under dispute: what a user carries the moment the chart is on screen.
    const firstPaint = await readFootprint(session.browser);
    arm.firstPaintFootprintMB = firstPaint.footprintTotalMB;
    arm.firstPaintByType = firstPaint.footprintByType;
    arm.firstPaintRendererMB = firstPaint.pageRendererMB;
    log(`${acct.label}: first paint ${arm.firstPaintFootprintMB} MB (renderer ${arm.firstPaintRendererMB})`);

    // The configuration must be PROVEN identical across arms or the comparison is between two workloads.
    const panels = await session.page.evaluate(() => {
      const out = [];
      const visit = (w, isHost) => {
        try {
          const ch = w.chart; if (!ch) return;
          out.push({
            isHost,
            tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
            fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
            bars: Array.isArray(ch.data) ? ch.data.length : 0,
            indicators: (() => { try { return (ch.indicators || ch.activeIndicators || []).length ?? null; } catch { return null; } })(),
          });
        } catch (_) { /* a realm may carry no chart */ }
      };
      visit(window, true);
      for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], false); } catch (_) { /* cross-origin */ } }
      return out;
    }).catch(() => []);
    arm.panels = panels;
    arm.panelCount = panels.length;
    arm.residentBars = panels.reduce((s, p) => s + (p.bars || 0), 0);
    arm.timeframes = panels.map((p) => p.tf);
    arm.datasets = panels.map((p) => p.fileId);
    log(`${acct.label}: ${arm.panelCount} panels, ${arm.residentBars} resident bars, tf ${arm.timeframes.join('/')}`);

    // What the account actually carries, so a difference can be ATTRIBUTED rather than just observed.
    arm.accountSurface = await session.page.evaluate(async () => {
      const out = {};
      try {
        const res = await fetch('/api/files', { cache: 'no-store' });
        const txt = await res.text();
        out.filesPayloadBytes = txt.length;
        try { const j = JSON.parse(txt); out.filesCount = Array.isArray(j) ? j.length : (Array.isArray(j?.files) ? j.files.length : null); } catch { out.filesCount = null; }
      } catch (e) { out.filesError = String(e).slice(0, 80); }
      try {
        const om = window.orderManager || window.chart?.orderManager;
        out.closedPositions = Array.isArray(om?.closedPositions) ? om.closedPositions.length : null;
        out.openPositions = Array.isArray(om?.openPositions) ? om.openPositions.length : null;
      } catch (e) { out.orderError = String(e).slice(0, 60); }
      // Every resource the page pulled, bucketed - the account-dependent bytes hide here if anywhere.
      try {
        const rs = performance.getEntriesByType('resource');
        out.resourceCount = rs.length;
        out.resourceBytes = rs.reduce((s, r) => s + (r.transferSize || 0), 0);
        const api = rs.filter((r) => /\/api\//.test(r.name));
        out.apiCount = api.length;
        out.apiBytes = api.reduce((s, r) => s + (r.transferSize || 0), 0);
      } catch (e) { out.resourceError = String(e).slice(0, 60); }
      return out;
    }).catch((e) => ({ evalError: String(e).slice(0, 100) }));
    log(`${acct.label}: /api/files ${arm.accountSurface.filesPayloadBytes ?? '?'} bytes, ${arm.accountSurface.apiCount ?? '?'} api calls / ${arm.accountSurface.apiBytes ?? '?'} bytes`);

    arm.storage = await readStorageCensus(session.page).catch((e) => ({ error: String(e).slice(0, 120) }));

    // PAUSE-PROBE. At first paint replay is not playing, so the pause is a confirmation rather than a
    // change - the probe verifies that state in every realm and would VOID if a realm reported playing.
    log(`${acct.label}: pause-probe (${FROTH_MS / 1000}s froth, ${RECLAIM_MS / 60000} min reclaim)`);
    arm.pauseProbe = await pauseProbe(session.page, {
      readFootprint: () => readFootprint(session.browser),
      frothWaitMs: FROTH_MS,
      reclaimWaitMs: RECLAIM_MS,
      label: `n1-${acct.label}`,
      log: (m) => log(`  ${m}`),
    }).catch((e) => ({ verdict: 'VOID', why: `probe threw: ${String(e).slice(0, 160)}` }));
    arm.hoardFloorMB = arm.pauseProbe.hoardFloorMB ?? null;
    arm.frothPercent = arm.pauseProbe.frothPercentOfRunning ?? null;
    log(`${acct.label}: hoard floor ${arm.hoardFloorMB} MB (${arm.frothPercent}% froth), probe ${arm.pauseProbe.verdict}`);

    arm.ok = true;
  } catch (err) {
    arm.ok = false;
    arm.error = String(err && err.stack ? err.stack : err).slice(0, 500);
    log(`${acct.label}: FAILED — ${String(err).slice(0, 160)}`);
  } finally {
    try { await session?.browser?.close(); } catch { /* nothing further */ }
    process.env.TEST_EMAIL = savedE;
    process.env.TEST_PASSWORD = savedP;
  }
  arm.finishedAt = new Date().toISOString();
  return arm;
}

const seal = await computeSeal(ORIGIN);
const info = await readBuildInfo(ORIGIN);
log(`build under test: ${seal.badge} digest ${seal.digest.slice(0, 12)} sha ${String(info.sourceCommitSha).slice(0, 12)}`);

// Heavy first, then fresh. Sequential and never concurrent: two browsers on one host make each the
// other's contention, which is the defect that made salvage segment 2 unpoolable.
const heavy = await runArm(HEAVY);
const fresh = await runArm(FRESH);

const sealAfter = await computeSeal(ORIGIN);
const buildHeld = sealAfter.digest === seal.digest;

const d = (a, b) => (a != null && b != null ? +(a - b).toFixed(1) : null);
const bothOk = heavy.ok && fresh.ok;
const firstPaintGap = d(heavy.firstPaintFootprintMB, fresh.firstPaintFootprintMB);
const hoardGap = d(heavy.hoardFloorMB, fresh.hoardFloorMB);
const barsGap = heavy.residentBars != null && fresh.residentBars != null ? heavy.residentBars - fresh.residentBars : null;

// The bar is 1,024 MB. "Material" has to be defined against something, and the only thing that matters
// here is whether the fresh account changes the ruling - so material means large enough to move the
// first-paint reading across the bar, or a tenth of it, whichever is smaller.
const MATERIAL_MB = 100;
let verdict;
let reading;
if (!bothOk) {
  verdict = 'VOID';
  reading = `An arm failed (${heavy.ok ? 'fresh' : 'heavy'}), so there is no comparison. ${(heavy.ok ? fresh.error : heavy.error || '').slice(0, 200)}`;
} else if (!buildHeld) {
  verdict = 'VOID';
  reading = 'The served build changed between the two arms, so the arms are not the same build.';
} else if (firstPaintGap == null) {
  verdict = 'VOID';
  reading = 'A first-paint footprint did not read.';
} else if (Math.abs(firstPaintGap) < MATERIAL_MB) {
  verdict = 'THE BASELINE IS PRODUCT FLOOR, NOT ACCOUNT HISTORY';
  reading = `Fresh opens at ${fresh.firstPaintFootprintMB} MB against heavy at ${heavy.firstPaintFootprintMB} MB — ${Math.abs(firstPaintGap)} MB apart, under the ${MATERIAL_MB} MB materiality bar. A brand-new account with no trading history carries essentially the same first-paint cost, so the figure the PO is ruling on is the product's floor and the ruling is against the right baseline.`;
} else if (firstPaintGap > 0) {
  verdict = 'THE BASELINE IS INFLATED BY ACCOUNT HISTORY — THE RULING IS AGAINST THE WRONG NUMBER';
  reading = `Fresh opens ${Math.abs(firstPaintGap)} MB LOWER than heavy (${fresh.firstPaintFootprintMB} vs ${heavy.firstPaintFootprintMB} MB). The disputed first-paint baseline carries test-account history, and the product floor a real new user meets is the fresh figure.`;
} else {
  verdict = 'FRESH OPENS HIGHER THAN HEAVY — UNEXPLAINED';
  reading = `Fresh opens ${Math.abs(firstPaintGap)} MB ABOVE heavy, which no account-history story predicts. Suspect run-order or host drift before reading this as an account effect.`;
}

const report = {
  signature: 'N1-HEAVY-VS-FRESH-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — two independent browser sessions, each freshly launched and closed; no back/forward navigation.',
  build: { origin: ORIGIN, badge: seal.badge, digest: seal.digest, sourceCommitSha: info.sourceCommitSha ?? null, digestHeldAcrossBothArms: buildHeld },
  gauge: 'lib/footprint.mjs — OS private working set over every browser process, the same gauge behind the 2,747.6 / 2,709.3 MB comparison and the 1,122 MB first-paint figure now in dispute.',
  materialityBarMB: MATERIAL_MB,
  predictionMadeBeforeTheRun: 'My CONF-01 API census found the only account-dependent payload at boot to be /api/files at 28.9 KB, so I predicted the two accounts would open within noise. A materially lower fresh baseline falsifies that census.',
  verdict,
  reading,
  firstPaint: {
    heavyMB: heavy.firstPaintFootprintMB, freshMB: fresh.firstPaintFootprintMB,
    gapMB: firstPaintGap, material: firstPaintGap != null && Math.abs(firstPaintGap) >= MATERIAL_MB,
  },
  hoardFloor: {
    heavyMB: heavy.hoardFloorMB, freshMB: fresh.hoardFloorMB, gapMB: hoardGap,
    heavyFrothPercent: heavy.frothPercent, freshFrothPercent: fresh.frothPercent,
    note: 'Post-drain floor from the pause-probe on each arm. The bar is judged on hoard, so this pair is the one that matters for a memory ruling; the first-paint pair is the one that matters for the baseline dispute.',
  },
  configurationParity: {
    heavyPanels: heavy.panelCount, freshPanels: fresh.panelCount,
    heavyBars: heavy.residentBars, freshBars: fresh.residentBars, barsGap,
    heavyTimeframes: heavy.timeframes, freshTimeframes: fresh.timeframes,
    warning: barsGap != null && Math.abs(barsGap) > 500
      ? `The arms differ by ${barsGap} resident bars. At 23.98 MB per thousand bars that alone accounts for about ${(Math.abs(barsGap) / 1000 * 23.98).toFixed(0)} MB of any gap, and it is NOT an account effect.`
      : null,
  },
  accountSurface: { heavy: heavy.accountSurface, fresh: fresh.accountSurface },
  storage: { heavy: heavy.storage, fresh: fresh.storage },
  arms: { heavy, fresh },
  credentialHandling: 'Both accounts read from the environment. Neither address nor password appears in this artifact; arms are identified by a truncated SHA-256 of the address.',
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log(`\n${'='.repeat(78)}`);
console.log('N1 — HEAVY vs FRESH');
console.log(`${'='.repeat(78)}`);
console.log(`  build ${seal.badge}  sha ${String(info.sourceCommitSha).slice(0, 12)}  digest held across arms: ${buildHeld}\n`);
console.log(`  FIRST PAINT   heavy ${String(heavy.firstPaintFootprintMB).padStart(8)} MB     fresh ${String(fresh.firstPaintFootprintMB).padStart(8)} MB     gap ${firstPaintGap} MB`);
console.log(`  HOARD FLOOR   heavy ${String(heavy.hoardFloorMB).padStart(8)} MB     fresh ${String(fresh.hoardFloorMB).padStart(8)} MB     gap ${hoardGap} MB`);
console.log(`  resident bars heavy ${String(heavy.residentBars).padStart(8)}        fresh ${String(fresh.residentBars).padStart(8)}        gap ${barsGap}`);
console.log(`\n  VERDICT: ${verdict}`);
console.log(`  ${reading}\n`);
if (report.configurationParity.warning) console.log(`  CAVEAT: ${report.configurationParity.warning}\n`);
console.log(`  written to ${OUT}\n`);
