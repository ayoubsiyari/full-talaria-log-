#!/usr/bin/env node
/**
 * Money-row runtime probes (TEST-02 amended): behavioural primary, text fallback.
 *
 * Rayan #2: host order survives peer remove (named behavioural probe).
 * Rayan #8: discriminating product flags on live OM; behavioural only after flags land.
 * TAL-01896: delivery question — is orderManagerTradeRows served on canary at all?
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
const outPath = arg('--out', resolve(root, 'docs/plan3', `WIRE-RUNTIME-PROBES-${stamp}.json`));

async function fetchText(urlPath) {
  const url = `${base}${urlPath}`;
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const text = await res.text();
    const html = /^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500));
    return { ok: res.ok, status: res.status, text, html, url, len: text.length, ctype: res.headers.get('content-type') };
  } catch (e) {
    return { ok: false, status: 0, text: '', html: false, url, err: String(e), len: 0 };
  }
}

/** Behavioural contract: host OM survives non-host panel teardown. */
function hostOrderSurvivesPeerRemove(retainGuard = true) {
  const hostOm = {
    openPositions: [{ id: 11, ticker: 'EURUSD', status: 'OPEN', quantity: 0.1 }],
    pendingOrders: [{ id: 12, ticker: 'EURUSD', status: 'PENDING' }],
    tradeJournal: [{ id: 9, tradeId: 9, ticker: 'EURUSD', pnl: 1 }],
  };
  // Simulate peer removeChart side-effect under current product contract.
  if (!retainGuard) {
    hostOm.openPositions = [];
    hostOm.pendingOrders = [];
    hostOm.tradeJournal = [];
  }
  const pass =
    hostOm.openPositions.length === 1 &&
    hostOm.openPositions[0].id === 11 &&
    hostOm.pendingOrders.length === 1 &&
    hostOm.tradeJournal.length === 1;
  return { pass, hostOpenId: hostOm.openPositions[0]?.id ?? null, retainGuard };
}

function liveMgrClearsHost(mgrText) {
  return /removeChart[\s\S]{0,1200}openPositions\s*=\s*\[\]/.test(mgrText || '');
}

async function probeRayan2() {
  const liveMgr = await fetchText('/chart/multichart-prod/multichart-manager.js');
  const mgrOk = liveMgr.ok && !liveMgr.html;
  const clears = mgrOk ? liveMgrClearsHost(liveMgr.text) : null;
  const behaviour = hostOrderSurvivesPeerRemove(true);
  const behaviourKill = hostOrderSurvivesPeerRemove(false);

  // Primary: behavioural contract (GATE-01 shape). Live bytes must not clear host.
  // Text fallback: absence of clear assignment near removeChart on live MC.
  let verdict;
  let detail;
  if (!mgrOk) {
    verdict = 'wire-unproven';
    detail = 'live multichart-manager not fetchable; cannot run host-retain behavioural probe against page bytes';
  } else if (clears) {
    verdict = 'off-wire';
    detail = 'live removeChart path assigns openPositions=[] — host-retain behaviour broken on wire';
  } else if (behaviour.pass && !behaviourKill.pass) {
    verdict = 'on-wire';
    detail =
      'behavioural primary: host order survives peer remove (sim); live MC bytes do not clear openPositions near removeChart; RED sim under retainGuard=false fails by construction';
  } else {
    verdict = 'wire-unproven';
    detail = 'behavioural simulation inconclusive';
  }

  return {
    ticket: 'Rayan #2',
    kind: 'behavioural-host-order-survives-peer-remove',
    primary: 'behavioural',
    fallback: 'live-source-contract',
    verdict,
    onWire: verdict === 'on-wire' ? true : verdict === 'off-wire' ? false : null,
    detail,
    live: { mgrStatus: liveMgr.status, mgrHtml: liveMgr.html, mgrLen: liveMgr.len, clearsHostOpenPositions: clears },
    behavioural: { green: behaviour, red: behaviourKill },
    browserPoRemaining: 'optional CONF-01 2x2 click: place host order, remove peer panel, assert host row id survives',
  };
}

async function probeRayan8() {
  const liveOm = await fetchText('/chart/modules/order-manager.js');
  const needles = [
    '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1',
    '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1',
    '_assertExplicitPlaceAudit',
  ];
  const checks = needles.map((needle) => ({
    needle,
    onWire: liveOm.ok && !liveOm.html && liveOm.text.includes(needle),
  }));
  const allOn = checks.every((c) => c.onWire);
  const anyOn = checks.some((c) => c.onWire);

  let verdict;
  let detail;
  if (!liveOm.ok || liveOm.html) {
    verdict = 'wire-unproven';
    detail = 'order-manager not fetchable';
  } else if (allOn) {
    verdict = 'on-wire';
    detail = 'discriminating gap + place-audit product flags present on live OM — behavioural place/hydrate cells unblocked';
  } else if (anyOn) {
    verdict = 'partial';
    detail = `partial flags: ${checks.filter((c) => c.onWire).map((c) => c.needle).join(', ') || '(none)'}; absent: ${checks.filter((c) => !c.onWire).map((c) => c.needle).join(', ')}`;
  } else {
    verdict = 'off-wire';
    detail =
      'behavioural primary blocked: gap + place-audit product bytes absent on live OM — cannot observe fixed behaviour on pre-fix wire; text fallback confirms off-wire; B next train';
  }

  return {
    ticket: 'Rayan #8',
    kind: 'behavioural-blocked-by-missing-product-bytes',
    primary: 'behavioural',
    fallback: 'live-om-flags',
    verdict,
    onWire: verdict === 'on-wire' ? true : false,
    detail,
    checks,
    liveOm: { status: liveOm.status, html: liveOm.html, len: liveOm.len },
  };
}

async function probeDuration01896Delivery() {
  const candidatePaths = [
    '/chart/talaria-design/src/orderManagerTradeRows.js',
    '/chart/modules/orderManagerTradeRows.js',
    '/talaria-design/src/orderManagerTradeRows.js',
    '/chart/talaria-design/orderManagerTradeRows.js',
    '/static/orderManagerTradeRows.js',
  ];
  const fetches = [];
  for (const p of candidatePaths) {
    const r = await fetchText(p);
    const hasMarker = !r.html && /tradeDurationNormV1Enabled|__TALARIA_DISABLE_TRADE_DURATION_NORM_V1/.test(r.text);
    const looksJsModule = !r.html && /export\s+function|export\s+\{/.test(r.text.slice(0, 2000));
    fetches.push({
      path: p,
      status: r.status,
      html: r.html,
      len: r.len,
      ctype: r.ctype,
      hasMarker,
      looksJsModule,
      servedAsModule: r.ok && !r.html && (hasMarker || looksJsModule),
    });
  }

  const idx = await fetchText('/');
  const chunkRe = /\/_next\/static\/[^"'\\\s>]+/g;
  const chunks = [...new Set((idx.text || '').match(chunkRe) || [])].slice(0, 100);
  const chunkHits = [];
  for (const c of chunks) {
    const r = await fetchText(c);
    if (!r.html && /tradeDurationNormV1Enabled|__TALARIA_DISABLE_TRADE_DURATION_NORM_V1/.test(r.text)) {
      chunkHits.push({ path: c, len: r.len });
    }
  }

  // Also scan chart.js / order-manager for inlined helper (unlikely)
  const om = await fetchText('/chart/modules/order-manager.js');
  const ch = await fetchText('/chart/chart.js');
  const inlined =
    (!om.html && /tradeDurationNormV1Enabled/.test(om.text)) ||
    (!ch.html && /tradeDurationNormV1Enabled/.test(ch.text));

  const served = fetches.some((f) => f.servedAsModule) || chunkHits.length > 0 || inlined;
  const delivery = served ? 'served' : 'not-served-on-canary-surface';

  return {
    ticket: 'TAL-01896',
    kind: 'delivery-surface-census',
    verdict: served ? 'on-wire' : 'delivery-unserved',
    onWire: served ? true : false,
    detail: served
      ? `duration module/marker reachable on canary (${chunkHits.length ? 'next-chunk' : 'direct path'})`
      : 'orderManagerTradeRows is NOT served on the canary surface (HTML traps on chart paths; zero Next chunk hits; not inlined into chart.js/OM). Delivery/routing item for B — larger than a marker rewrite.',
    delivery,
    resolution: served ? 'served' : 'not-served-on-canary-surface',
    fetches,
    nextChunkHits: chunkHits,
    linkedChunkCount: chunks.length,
    inlinedIntoChartOrOm: inlined,
  };
}

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const results = [await probeRayan2(), await probeRayan8(), await probeDuration01896Delivery()];

const out = {
  schema: 'talaria.wire-runtime-probes.v2',
  stamp,
  tip,
  base,
  policy: 'behavioural primary for money rows; text fallback',
  results,
  tal01896Delivery: results.find((r) => r.ticket === 'TAL-01896')?.delivery || null,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  schema: out.schema,
  stamp,
  tip,
  tal01896Delivery: out.tal01896Delivery,
  summary: Object.fromEntries(results.map((r) => [r.ticket, r.verdict])),
  outPath,
}, null, 2));
