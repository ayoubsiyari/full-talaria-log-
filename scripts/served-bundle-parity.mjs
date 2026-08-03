/**
 * SEAL-EVIDENCE-01 precondition: are the local bytes a run boots the same bytes
 * the site serves?
 *
 * The read-back canary boots `chart v 1.4/chart/dist-v9/index.html` through a
 * local harness. That is a source surface. Calling its result evidence about
 * deployed b126 requires this check first, and requires it on the assets the
 * entry pulls in rather than on the entry alone — b124 was retired for a mixed
 * surface where the entry looked right.
 *
 *   node scripts/served-bundle-parity.mjs --base=http://31.97.192.82:3000
 *
 * States: BYTE_IDENTICAL, BYTES_DIFFER (exit 1), ASSET_ABSENT_LOCAL,
 * ASSET_ABSENT_SERVED, FETCH_FAILED (exit 2). No browser, so no run lock.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeArtifactAtomic } from './lib/run-lock.mjs';
import { stampUtc, clockOf } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const BASE = argOf('base', 'http://31.97.192.82:3000').replace(/\/$/, '');
const ENTRY = argOf('entry', 'chart/dist-v9/index.html');
const OUT = argOf('out', path.join(REPO_ROOT, 'docs/plan3/evidence/served-bundle-parity.json'));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const localPathFor = (assetUrl) => {
  const rel = assetUrl.replace(/^\//, '').replace(/[?#].*$/, '');
  // The site serves `chart/...`; the tree holds it under `chart v 1.4/`.
  return path.join(REPO_ROOT, 'chart v 1.4', rel);
};

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return { bytes: Buffer.from(await res.arrayBuffer()) };
}

/** Script and stylesheet references, in document order, deduped. */
function assetsOf(html, entryUrl) {
  const dir = entryUrl.replace(/\/[^/]*$/, '');
  const out = [];
  const push = (raw) => {
    if (!raw || /^(?:https?:)?\/\//.test(raw) || raw.startsWith('data:')) return;
    const abs = raw.startsWith('/') ? raw.slice(1) : `${dir}/${raw}`.replace(/\/\.\//g, '/');
    if (!out.includes(abs)) out.push(abs);
  };
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel=["']?stylesheet[^>]*href=["']([^"']+)["']/gi)) push(m[1]);
  return out;
}

async function main() {
  const entryUrl = `${BASE}/${ENTRY}`;
  const served = await fetchBytes(entryUrl);
  if (served.error) {
    console.error(`[parity] FETCH_FAILED ${entryUrl} — ${served.error}`);
    process.exit(2);
  }
  const entryLocal = localPathFor(ENTRY);
  if (!fs.existsSync(entryLocal)) {
    console.error(`[parity] ASSET_ABSENT_LOCAL ${entryLocal}`);
    process.exit(2);
  }
  const rows = [];
  const record = (asset, state, extra = {}) => { rows.push({ asset, state, ...extra }); };

  const localEntry = fs.readFileSync(entryLocal);
  record(ENTRY, sha(localEntry) === sha(served.bytes) ? 'BYTE_IDENTICAL' : 'BYTES_DIFFER',
    { served: sha(served.bytes).slice(0, 16), local: sha(localEntry).slice(0, 16), bytes: served.bytes.length });

  for (const asset of assetsOf(served.bytes.toString('utf8'), ENTRY)) {
    const lp = localPathFor(asset);
    if (!fs.existsSync(lp)) { record(asset, 'ASSET_ABSENT_LOCAL'); continue; }
    const s = await fetchBytes(`${BASE}/${asset}`);
    if (s.error) { record(asset, 'ASSET_ABSENT_SERVED', { why: s.error }); continue; }
    const l = fs.readFileSync(lp);
    record(asset, sha(l) === sha(s.bytes) ? 'BYTE_IDENTICAL' : 'BYTES_DIFFER',
      { served: sha(s.bytes).slice(0, 16), local: sha(l).slice(0, 16), bytes: s.bytes.length });
  }

  const differ = rows.filter((r) => r.state === 'BYTES_DIFFER');
  const missing = rows.filter((r) => r.state.startsWith('ASSET_ABSENT'));
  const verdict = differ.length ? 'BYTES_DIFFER' : missing.length ? 'INCOMPLETE_COMPARISON' : 'BYTE_IDENTICAL';

  for (const r of rows) {
    console.log(`[parity] ${r.state.padEnd(19)} ${r.asset}${r.served ? `  served=${r.served} local=${r.local}` : ''}`);
  }
  console.log(`[parity] ${verdict} — ${rows.length} asset(s), ${differ.length} differing, ${missing.length} missing, at ${clockOf(new Date(), { seconds: true })}`);

  writeArtifactAtomic(OUT, JSON.stringify({
    rule: 'SEAL-EVIDENCE-01 provenance match',
    at: stampUtc(),
    atLocal: clockOf(new Date(), { seconds: true }),
    base: BASE,
    entry: ENTRY,
    verdict,
    // Says what this does and does not establish, so a reader cannot promote it.
    establishes: 'the local bytes a harness boots are the bytes the site serves',
    doesNotEstablish: 'any runtime behaviour; that needs the run itself',
    rows,
  }, null, 2));
  process.exitCode = verdict === 'BYTE_IDENTICAL' ? 0 : verdict === 'BYTES_DIFFER' ? 1 : 2;
}

main().catch((e) => { console.error(`[parity] FETCH_FAILED — ${e && e.message}`); process.exit(2); });
