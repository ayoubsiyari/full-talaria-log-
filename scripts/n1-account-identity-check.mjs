#!/usr/bin/env node
/**
 * Did the two N1 arms actually run two different accounts?
 *
 * N1's result is a NULL: the fresh account opens within noise of the heavy one. A null has an obvious
 * alternative explanation that would produce exactly the same numbers - both arms silently ran the SAME
 * account, because a cookie survived, a login quietly fell back, or the credential swap did not take.
 * Publishing "accounts do not matter" off a run that used one account twice is the vacuous result I have
 * already published once tonight and had to withdraw.
 *
 * So this asks the SERVER who it thinks is logged in, per arm, and compares. It never prints an address:
 * identity is reported as a truncated SHA-256, and the test is that the two hashes DIFFER and that each
 * matches the hash of the credential its arm was given.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// HOST-SCOPE-01: through the shared loader, so `launch` takes the box first.
import rawPuppeteer from 'puppeteer';
import { uiLoginDeployed, withHostScope } from './lib/heap-cycle-browser.mjs';

const puppeteer = withHostScope(rawPuppeteer, { script: 'n1-account-identity-check.mjs' });
import { clockOf } from './lib/clock.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const tag = (s) => (s ? crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex').slice(0, 8) : null);
const log = (m) => console.log(`[${clockOf(new Date(), { seconds: true })}] ${m}`);

const ARMS = [
  { label: 'heavy', email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD },
  { label: 'fresh', email: process.env.TEST_EMAIL_FRESH, password: process.env.TEST_PASSWORD_FRESH },
];
for (const a of ARMS) if (!a.email || !a.password) { console.error(`REFUSING: ${a.label} has no credential in the environment.`); process.exit(2); }

async function identify(arm) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const out = { label: arm.label, expectedTag: tag(arm.email) };
  try {
    const page = await browser.newPage();
    await uiLoginDeployed(page, ORIGIN, arm.email, arm.password);
    await new Promise((r) => setTimeout(r, 3000));

    // Ask several places and record which answered, rather than trusting one field that may read null.
    // "Null is not zero" has cost me two wrong readings already.
    const found = await page.evaluate(async () => {
      const emails = [];
      const rx = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
      const routes = [];
      for (const url of ['/api/auth/me', '/api/auth/user', '/api/user', '/api/me', '/api/account', '/api/profile']) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) { routes.push({ url, status: res.status }); continue; }
          const txt = await res.text();
          const m = txt.match(rx) || [];
          routes.push({ url, status: res.status, emailsFound: m.length });
          for (const e of m) emails.push({ from: url, value: e });
        } catch (e) { routes.push({ url, error: String(e).slice(0, 60) }); }
      }
      for (const store of ['localStorage', 'sessionStorage']) {
        try {
          const s = window[store];
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            const m = String(s.getItem(k) || '').match(rx) || [];
            for (const e of m) emails.push({ from: `${store}:${k}`, value: e });
          }
        } catch (_) { /* storage may be blocked */ }
      }
      try {
        const m = String(document.body?.innerText || '').match(rx) || [];
        for (const e of m) emails.push({ from: 'document', value: e });
      } catch (_) { /* no body yet */ }
      return { emails, routes };
    });

    out.routesTried = found.routes;
    // Hash immediately; the plaintext never leaves this function.
    const seen = new Map();
    for (const e of found.emails) {
      const t = tag(e.value);
      if (!seen.has(t)) seen.set(t, []);
      seen.get(t).push(e.from);
    }
    out.identitiesSeen = [...seen.entries()].map(([t, froms]) => ({ tag: t, sources: [...new Set(froms)].slice(0, 4), matchesThisArmsCredential: t === out.expectedTag }));
    out.confirmed = out.identitiesSeen.some((i) => i.matchesThisArmsCredential);
    out.sourceCount = found.emails.length;
    log(`${arm.label}: expected ${out.expectedTag}, server-side identity ${out.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'} (${out.identitiesSeen.length} distinct identity/identities seen)`);
  } catch (err) {
    out.error = String(err).slice(0, 200);
    log(`${arm.label}: FAILED — ${out.error}`);
  } finally {
    try { await browser.close(); } catch { /* nothing further */ }
  }
  return out;
}

const results = [];
for (const a of ARMS) results.push(await identify(a));

const [heavy, fresh] = results;
const tagsDiffer = heavy.expectedTag !== fresh.expectedTag;
const bothConfirmed = !!heavy.confirmed && !!fresh.confirmed;
const noCrossContamination = !heavy.identitiesSeen?.some((i) => i.tag === fresh.expectedTag)
  && !fresh.identitiesSeen?.some((i) => i.tag === heavy.expectedTag);

let verdict;
if (!tagsDiffer) verdict = 'VOID — both arms were given the same credential';
else if (!bothConfirmed) verdict = 'UNCONFIRMED — the application did not expose an identity I could read, so N1 rests on the credential swap alone';
else if (!noCrossContamination) verdict = 'VOID — one arm saw the other account, so a session leaked between arms';
else verdict = 'CONFIRMED — the two arms ran two different accounts';

const report = {
  signature: 'N1-ACCOUNT-IDENTITY-CHECK-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — one fresh browser per arm, closed after reading; no navigation history.',
  origin: ORIGIN,
  verdict,
  whyThisRuns: "N1's finding is a null. A null looks identical whether the accounts genuinely behave the same or the harness ran one account twice, and only this distinguishes them.",
  tagsDiffer, bothConfirmed, noCrossContamination,
  arms: results,
  credentialHandling: 'No address or password appears here. Identity is a truncated SHA-256 of the lower-cased address, so the comparison is reproducible without the secret.',
};
fs.writeFileSync(path.join(EV, 'N1-ACCOUNT-IDENTITY-CHECK.json'), JSON.stringify(report, null, 1));
console.log(`\n  VERDICT: ${verdict}\n`);
process.exitCode = verdict.startsWith('CONFIRMED') ? 0 : 1;
