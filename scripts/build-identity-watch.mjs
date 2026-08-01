#!/usr/bin/env node
/**
 * Watch the origin's BUILD IDENTITY — badge, digest and source commit — and record every transition.
 *
 * Two jobs. It tells me the moment b122 lands so the smoke can fire without me polling by hand, and it
 * keeps an independent record of re-cuts. The b121 re-cut (same buildId, sha a17e00e8 -> c0585e68, seven
 * hours apart) was only caught because I happened to read the passport twice. That should not depend on
 * happening to look.
 *
 * A transition is written whenever ANY of the three moves, and the badge is recorded but never treated as
 * identity: a badge that holds while the SHA moves is the interesting case, not the quiet one.
 *
 * Deliberately cheap — six conditional GETs every two minutes against a host that must stay idle for the
 * soak. It is not a measurement and must never contend with one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';

const argOf = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split('=').slice(1).join('=');
const ORIGIN = argOf('origin', 'http://31.97.192.82:3000');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = argOf('out', path.join(EV, 'BUILD-IDENTITY-WATCH.jsonl'));
const EVERY_MS = Number(argOf('everyMs', '120000'));
const WATCH_FOR = argOf('watchFor', '');   // e.g. b122 — logs an ARRIVED record, does not stop the watch

const append = (rec) => {
  const fd = fs.openSync(OUT, 'a');
  try { fs.writeSync(fd, `${JSON.stringify(rec)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};

if (!fs.existsSync(OUT)) {
  append({
    __meta: true, signature: 'BUILD-IDENTITY-WATCH-V1', startedAt: new Date().toISOString(), origin: ORIGIN,
    bfcacheState: 'not applicable — HTTP fetch only, no browser.',
    rule: 'A badge is not a build identity. The gates are the digest and the source commit SHA; the badge is recorded for reading only.',
  });
}

let last = null;
process.on('SIGTERM', () => { append({ stoppedAt: new Date().toISOString(), why: 'SIGTERM' }); process.exit(0); });

for (;;) {
  const at = new Date().toISOString();
  let rec;
  try {
    const seal = await computeSeal(ORIGIN, { timeoutMs: 20000 });
    const info = await readBuildInfo(ORIGIN);
    rec = {
      at, badge: seal.badge, digest: seal.digest, sealOk: seal.ok,
      sourceCommitSha: info.ok ? info.sourceCommitSha : null,
      buildInfoState: info.state,
    };
  } catch (err) {
    rec = { at, unreachable: true, why: String(err).slice(0, 200) };
  }

  const key = `${rec.badge}|${rec.digest}|${rec.sourceCommitSha}|${rec.unreachable ? 'down' : 'up'}`;
  if (key !== last) {
    const changed = [];
    if (last) {
      const [pb, pd, ps] = last.split('|');
      if (pb !== String(rec.badge)) changed.push(`badge ${pb} -> ${rec.badge}`);
      if (pd !== String(rec.digest)) changed.push(`digest ${String(pd).slice(0, 12)} -> ${String(rec.digest).slice(0, 12)}`);
      if (ps !== String(rec.sourceCommitSha)) changed.push(`SOURCE COMMIT ${String(ps).slice(0, 12)} -> ${String(rec.sourceCommitSha).slice(0, 12)}`);
    }
    // The case the ruling is about: the label held and the tree underneath it did not.
    const recut = last && changed.length && !changed.some((c) => c.startsWith('badge'))
      && changed.some((c) => c.startsWith('SOURCE COMMIT'));
    append({
      ...rec, __transition: true, changed: changed.length ? changed : ['first reading'],
      recutUnderSameBadge: !!recut,
      note: recut ? 'RE-CUT UNDER THE SAME BADGE: the buildId did not move and the source tree did. A digest-only or badge-only seal would call these one build.' : null,
      arrived: WATCH_FOR && String(rec.badge || '').includes(WATCH_FOR) ? WATCH_FOR : null,
    });
    console.log(`${at}  ${changed.join('; ') || 'first reading'}  [${rec.badge} ${String(rec.digest).slice(0, 12)} ${String(rec.sourceCommitSha).slice(0, 12)}]${recut ? '  <-- RE-CUT UNDER SAME BADGE' : ''}`);
    last = key;
  }
  await new Promise((r) => setTimeout(r, EVERY_MS));
}
