#!/usr/bin/env node
/**
 * ACCOUNT-HYDRATION-SCAN — item 4's mechanism half, decidable on one account.
 *
 * Item 4 as written needs a heavy account and a fresh one, and I hold one set of credentials. But the
 * question behind it — "does baseline scale with account history?" — has a mechanism answer that does
 * not need two accounts: does the app fetch account-scoped history at load, and is that fetch BOUNDED?
 *
 * An unbounded fetch means baseline scales with account age by construction, which is what A would need
 * in order to cut. A bounded fetch means account age cannot be the 8 GB in TAL-01891 and the cohort
 * question shrinks to a magnitude question.
 *
 * Static scan only: no run, no account, no machine time.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'chart v 1.4/chart';
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ACCOUNT-HYDRATION-SCAN-20260731.json';

const ACCOUNT_SCOPED = /(journal|trade|order|position|history|account|portfolio|stat)/i;
const LIMIT_HINT = /(limit|per_?page|page|offset|cursor|top|count|size|max|since|from|after)=/i;

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.ckpt|_scratch|\.git/.test(p)) walk(p); }
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
};
walk(ROOT);

const endpoints = new Map();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/["'`](\/api\/[A-Za-z0-9/_-]+)([^"'`]{0,90})/g)) {
    const url = m[1];
    if (!ACCOUNT_SCOPED.test(url)) continue;
    const tail = m[2] || '';
    const rec = endpoints.get(url) || { url, files: new Set(), sampleTails: new Set(), hasLimitParam: false };
    rec.files.add(path.basename(f));
    if (tail.trim()) rec.sampleTails.add(tail.slice(0, 70));
    if (LIMIT_HINT.test(tail)) rec.hasLimitParam = true;
    endpoints.set(url, rec);
  }
}

const rows = [...endpoints.values()].map((r) => ({
  url: r.url,
  seenIn: [...r.files].slice(0, 6),
  hasLimitParamAtCallSite: r.hasLimitParam,
  sampleTails: [...r.sampleTails].slice(0, 3),
})).sort((a, b) => a.url.localeCompare(b.url));

const unbounded = rows.filter((r) => !r.hasLimitParamAtCallSite);

const report = {
  signature: 'ACCOUNT-HYDRATION-SCAN-V1',
  ruling: 'cbfdb81f4 item 4, mechanism half',
  method: 'Static scan of the served chart tree for account-scoped /api/ call sites and whether the call site carries any bounding parameter (limit, page, offset, cursor, since, max).',
  limitations: [
    'A call site with no bounding parameter is not proof of an unbounded RESPONSE: the server may cap it. This names candidates for A to check server-side, it does not measure payloads.',
    'Conversely a bounding parameter at the call site may be set to a very large value, so its presence is not proof of a small fetch.',
    'This says nothing about magnitude. Only a heavy account can do that, and that is the escalation that stands.',
  ],
  filesScanned: files.length,
  accountScopedEndpoints: rows.length,
  endpointsWithNoBoundingParamAtCallSite: unbounded.length,
  rows,
  verdict: unbounded.length
    ? `${unbounded.length} of ${rows.length} account-scoped endpoints are called with NO bounding parameter at the call site: ${unbounded.slice(0, 6).map((r) => r.url).join(', ')}. Each is a candidate for baseline scaling with account age and needs a server-side cap check, which is A's to make.`
    : 'Every account-scoped endpoint carries a bounding parameter at its call site, so baseline scaling with account age is not supported by the client code and TAL-01891 is unlikely to be account size.',
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.error(`scanned ${files.length} files, ${rows.length} account-scoped endpoints, ${unbounded.length} with no bounding parameter at the call site\n`);
for (const r of rows) {
  console.error(`  ${r.hasLimitParamAtCallSite ? 'BOUNDED  ' : 'UNBOUNDED'} ${r.url}   [${r.seenIn.join(', ')}]`);
}
console.error(`\n${report.verdict}`);
console.error(`artifact ${OUT}`);
