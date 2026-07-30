#!/usr/bin/env node
/**
 * TEST-02 runtime / live-source probes for money rows that static markers
 * cannot discriminate (Rayan #2, Rayan #8) plus TAL-01896 duration surface.
 *
 * Observes live canary bytes (and, where possible, behavioural contracts).
 *
 * Usage:
 *   node scripts/wire-runtime-money-probes.mjs --base http://31.97.192.82:3000 --stamp 20260730b113
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const stamp = arg('--stamp', '20260730b113');
const base = (arg('--base', 'http://31.97.192.82:3000') || '').replace(/\/$/, '');
const pretestDir = arg('--pretest-dir', resolve(root, 'artifacts', 'wire-pretest'));
const outPath = arg('--out', resolve(root, 'docs/plan3', `WIRE-RUNTIME-PROBES-${stamp}.json`));

async function fetchText(urlPath) {
  const url = `${base}${urlPath}`;
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const text = await res.text();
    const html = /^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500));
    return { ok: res.ok, status: res.status, text, html, url, len: text.length };
  } catch (e) {
    return { ok: false, status: 0, text: '', html: false, url, err: String(e), len: 0 };
  }
}

function pretestHas(rel, needle) {
  const p = join(pretestDir, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').includes(needle);
}

function sourceContractRetain(mgrText, gridText) {
  const mgrBad = /removeChart[\s\S]{0,1200}openPositions\s*=\s*\[\]/.test(mgrText || '');
  const gridBad = /removeChart[\s\S]{0,800}orderManager[\s\S]{0,200}openPositions\s*=\s*\[\]/.test(gridText || '');
  return { mgrBad, gridBad, pass: !mgrBad && !gridBad };
}

/** Behavioural host-retain simulation (same contract as the unit gate). */
function simulateHostRetain(retainGuard) {
  const hostOm = {
    openPositions: [{ id: 11, ticker: 'EURUSD', status: 'OPEN', quantity: 0.1 }],
    pendingOrders: [{ id: 12, ticker: 'EURUSD', status: 'PENDING' }],
    tradeJournal: [{ id: 9, tradeId: 9, ticker: 'EURUSD', pnl: 1 }],
  };
  if (!retainGuard) {
    hostOm.openPositions = [];
    hostOm.pendingOrders = [];
    hostOm.tradeJournal = [];
  }
  return {
    open: hostOm.openPositions.length,
    pending: hostOm.pendingOrders.length,
    journal: hostOm.tradeJournal.length,
    pass: hostOm.openPositions.length === 1 && hostOm.pendingOrders.length === 1 && hostOm.tradeJournal.length === 1,
  };
}

async function probeRayan2() {
  const liveMgr = await fetchText('/chart/multichart-prod/multichart-manager.js');
  const liveGrid = await fetchText('/chart/talaria-design/src/MultichartGrid.jsx');
  const b103Mgr = existsSync(join(pretestDir, 'b103/multichart-manager.js'))
    ? readFileSync(join(pretestDir, 'b103/multichart-manager.js'), 'utf8')
    : '';
  const b103Grid = existsSync(join(pretestDir, 'b103/MultichartGrid.jsx'))
    ? readFileSync(join(pretestDir, 'b103/MultichartGrid.jsx'), 'utf8')
    : '';

  const liveContract = sourceContractRetain(
    liveMgr.ok && !liveMgr.html ? liveMgr.text : '',
    liveGrid.ok && !liveGrid.html ? liveGrid.text : '',
  );
  const b103Contract = sourceContractRetain(b103Mgr, b103Grid);
  const sim = simulateHostRetain(true);

  // Textual source-absence is NOT discriminating — b103 already passes.
  const textualDiscriminates = b103Contract.pass === false && liveContract.pass === true;

  let verdict = 'wire-unproven';
  let detail = '';
  if (!liveMgr.ok || liveMgr.html) {
    verdict = 'wire-unproven';
    detail = 'live multichart-manager not fetchable as module';
  } else if (!textualDiscriminates) {
    // Behavioural contract holds on live bytes AND on b103 — cannot certify "fix landed".
    // Publish a runtime probe result that documents the live page contract + simulation,
    // but keep verdict wire-unproven until a browser PO observes peer-panel remove.
    verdict = 'wire-unproven';
    detail =
      'runtime source-contract holds on live MC bytes, but identical contract already holds on b103 — not discriminating; needs browser PO (host order survives peer removeChart)';
  } else {
    verdict = 'on-wire';
    detail = 'live source-contract passes and fails on b103 (discriminating)';
  }

  return {
    ticket: 'Rayan #2',
    kind: 'runtime-source-contract+simulate',
    verdict,
    onWire: verdict === 'on-wire' ? true : null,
    detail,
    live: {
      mgrStatus: liveMgr.status,
      mgrHtml: liveMgr.html,
      mgrLen: liveMgr.len,
      gridStatus: liveGrid.status,
      gridHtml: liveGrid.html,
      contractPass: liveContract.pass,
    },
    b103: { contractPass: b103Contract.pass },
    simulation: sim,
    textualDiscriminates,
  };
}

async function probeRayan8() {
  const liveOm = await fetchText('/chart/modules/order-manager.js');
  const needles = [
    '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1',
    '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1',
    '_assertExplicitPlaceAudit',
    '_m24ReconcileOrderIdCounter',
  ];
  const checks = [];
  for (const needle of needles) {
    const onWire = liveOm.ok && !liveOm.html && liveOm.text.includes(needle);
    const onB103 = pretestHas('b103/order-manager.js', needle);
    const discriminating = onB103 === false;
    checks.push({ needle, onWire, onB103, discriminating });
  }
  const disc = checks.filter((c) => c.discriminating);
  const discOn = disc.filter((c) => c.onWire);
  const discOff = disc.filter((c) => !c.onWire);

  let verdict = 'off-wire';
  let detail = '';
  if (!liveOm.ok || liveOm.html) {
    verdict = 'wire-unproven';
    detail = 'order-manager not fetchable';
  } else if (discOn.length && !discOff.length) {
    verdict = 'on-wire';
    detail = 'gap + place-audit discriminating flags on live OM';
  } else if (discOn.length && discOff.length) {
    verdict = 'partial';
    detail = `discriminating on-wire: ${discOn.map((c) => c.needle).join(', ')}; absent: ${discOff.map((c) => c.needle).join(', ')}`;
  } else if (discOff.length) {
    verdict = 'off-wire';
    detail =
      'gap reconcile + explicit-place audit flags absent on live OM (discriminating vs b103) — route to B next train; no browser substitute for missing product bytes';
  } else {
    verdict = 'wire-unproven';
    detail = 'no discriminating markers available';
  }

  // Optional behavioural probe description for when flags land:
  const behavioural = {
    whenDeployed: [
      'CONF-01 2x2; place host order; hydrate; assert order id counter does not gap-skip under kill off',
      'explicit place path: reject self-open without place audit when flag on',
    ],
    runnableNow: false,
    reason: 'product flags absent on wire — behavioural probe would observe pre-fix behaviour',
  };

  return {
    ticket: 'Rayan #8',
    kind: 'live-om-discriminating-flags',
    verdict,
    onWire: verdict === 'on-wire' ? true : false,
    detail,
    checks,
    behavioural,
    liveOm: { status: liveOm.status, html: liveOm.html, len: liveOm.len },
  };
}

async function probeDuration01896() {
  const paths = [
    '/chart/talaria-design/src/orderManagerTradeRows.js',
    '/chart/modules/orderManagerTradeRows.js',
    '/talaria-design/src/orderManagerTradeRows.js',
  ];
  const fetches = [];
  for (const p of paths) {
    const r = await fetchText(p);
    fetches.push({
      path: p,
      status: r.status,
      html: r.html,
      hasMarker: !r.html && /__TALARIA_DISABLE_TRADE_DURATION_NORM_V1|tradeDurationNormV1Enabled/.test(r.text),
      len: r.len,
    });
  }

  // Scan homepage-linked /_next chunks for the marker (better-marker candidate).
  const idx = await fetchText('/');
  const chunkRe = /\/_next\/static\/[^"'\\\s>]+/g;
  const chunks = [...new Set((idx.text || '').match(chunkRe) || [])].slice(0, 80);
  const chunkHits = [];
  for (const c of chunks) {
    const r = await fetchText(c);
    if (!r.html && /__TALARIA_DISABLE_TRADE_DURATION_NORM_V1|tradeDurationNormV1Enabled/.test(r.text)) {
      chunkHits.push(c);
    }
  }

  const onB103 = pretestHas('b103/orderManagerTradeRows.js', '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1');
  const anyFetchable = fetches.some((f) => f.hasMarker) || chunkHits.length > 0;

  // Resolution (named, binding for D):
  // Kill-switch already present in b103 tree → not "needs a build" for product invention.
  // Canary does not expose TradeRows as a fetchable chart module; SPA/HTML trap on guessed URLs.
  // If bundled into a served Next chunk, that chunk IS the better marker; else still needs better marker
  // (runtime journal duration observation) and B ship of an auditable path on next train.
  let resolution;
  let verdict;
  let detail;
  if (chunkHits.length) {
    resolution = 'needs-a-better-marker';
    verdict = onB103 ? 'wire-unproven' : 'on-wire';
    detail = `duration marker found in Next chunk(s): ${chunkHits.join(', ')}; still vacuous vs b103=${onB103} — use chunk path as audit surface; browser duration cell remains PO`;
  } else if (anyFetchable) {
    resolution = 'needs-a-better-marker';
    verdict = 'wire-unproven';
    detail = 'fetchable but vacuous on b103 pretest — marker does not discriminate post-b103 work';
  } else {
    resolution = 'needs-a-better-marker';
    verdict = 'wire-unproven';
    detail =
      'duration-norm kill-switch exists in tip AND b103 TradeRows source, but is not on a fetchable canary module (HTML trap / not shipped at /chart/.../orderManagerTradeRows.js). Not "needs a build" for missing product — needs a better marker (served bundle path or live journal duration probe). Still routed to B next train for auditable ship.';
  }

  return {
    ticket: 'TAL-01896',
    kind: 'duration-surface-resolution',
    verdict,
    onWire: null,
    detail,
    resolution, // needs-a-better-marker | needs-a-build
    onB103Tree: onB103,
    fetches,
    nextChunkHits: chunkHits,
    linkedChunkCount: chunks.length,
  };
}

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const results = [await probeRayan2(), await probeRayan8(), await probeDuration01896()];

const out = {
  schema: 'talaria.wire-runtime-probes.v1',
  stamp,
  tip,
  base,
  results,
  tal01896Resolution: results.find((r) => r.ticket === 'TAL-01896')?.resolution || null,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  schema: out.schema,
  stamp,
  tip,
  base,
  tal01896Resolution: out.tal01896Resolution,
  summary: Object.fromEntries(results.map((r) => [r.ticket, r.verdict])),
  outPath,
}, null, 2));
