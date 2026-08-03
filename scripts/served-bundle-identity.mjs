#!/usr/bin/env node
// SEAL-EVIDENCE-01: SERVED_SMOKE — fetches the live origin's actual bytes and
// hashes them, then compares against git blobs. This is byte identity of the
// served bundle, not evidence that any code path in it runs.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SERVED_SMOKE — raw bytes off the named origin, hashed and compared to git blobs; proves identity, not behaviour.');

/**
 * SERVED-BUNDLE-IDENTITY — which commit's bundle is the canary actually serving?
 *
 * Three commits claimed b126 on 2026-08-03: the served passport's
 * sourceCommitSha, the commit the source tag peels to, and the cut commit
 * carrying the dist bundle. A passport is a self-report — it says what the
 * builder was told, not what was compiled. The only thing that settles it is
 * hashing the served bytes and looking for that hash in the tree.
 *
 * Bytes are fetched as bytes. A decoded string comparison will call two
 * different files equal whenever they differ only in encoding or line endings.
 *
 *   node scripts/served-bundle-identity.mjs --base=http://host:3000 --commits=a,b,c
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const argOf = (n, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const BASE = (argOf('base', 'http://31.97.192.82:3000')).replace(/\/$/, '');
const COMMITS = (argOf('commits', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function getBytes(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type') || '', buf };
}

/** Candidate repo paths for a served /chart/... path. The tree keeps a canonical
 *  copy and a homepage mirror, and either could be the one that shipped. */
function repoPathsFor(servedPath) {
  const rel = servedPath.replace(/^\/chart\//, '');
  return [`chart v 1.4/chart/${rel}`, `homepage/public/chart/${rel}`];
}

function blobSha(commit, repoPath) {
  try {
    const buf = execFileSync('git', ['show', `${commit}:${repoPath}`], {
      maxBuffer: 512 * 1024 * 1024,
      encoding: 'buffer',
    });
    return { sha: sha(buf), bytes: buf.length };
  } catch {
    return null;
  }
}

const passport = await getBytes(`${BASE}/chart/build-info.json`);
console.log(`\n=== PASSPORT  ${BASE}/chart/build-info.json  [${passport.status} ${passport.type}]`);
let pj = null;
try { pj = JSON.parse(passport.buf.toString('utf8')); } catch { /* not json */ }
if (pj) {
  for (const k of ['buildId', 'sourceCommitSha', 'checkpointBuild', 'builtAt']) {
    console.log(`  ${k}: ${pj[k]}`);
  }
} else {
  console.log(`  NOT JSON — first 120 bytes: ${passport.buf.subarray(0, 120).toString('utf8')}`);
}

const indexPath = '/chart/dist-v9/index.html';
const index = await getBytes(BASE + indexPath);
console.log(`\n=== SERVED INDEX  ${indexPath}  [${index.status} ${index.type}]  ${index.buf.length} bytes`);
const html = index.buf.toString('utf8');
const assets = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]*assets\/[^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(assets)];
console.log(`  assets referenced: ${uniq.length}`);

const targets = [indexPath, ...uniq.map((a) => (a.startsWith('http') ? a : new URL(a, BASE + indexPath).pathname))];

const rows = [];
for (const t of targets) {
  const got = await getBytes(BASE + t);
  const servedSha = got.status === 200 ? sha(got.buf) : null;
  const row = { path: t, status: got.status, bytes: got.buf.length, servedSha, matches: [] };
  if (servedSha) {
    for (const c of COMMITS) {
      for (const rp of repoPathsFor(t)) {
        const b = blobSha(c, rp);
        if (b && b.sha === servedSha) row.matches.push(`${c.slice(0, 9)}:${rp.startsWith('homepage') ? 'mirror' : 'canonical'}`);
      }
    }
  }
  rows.push(row);
}

console.log('\n=== BYTE IDENTITY OF SERVED FILES vs COMMITTED BLOBS ===');
for (const r of rows) {
  console.log(`\n  ${r.path}`);
  console.log(`    served: ${r.status}  ${r.bytes} bytes  sha256 ${r.servedSha ? r.servedSha.slice(0, 24) : 'n/a'}`);
  if (!r.servedSha) { console.log('    NOT_SERVED'); continue; }
  console.log(`    match : ${r.matches.length ? r.matches.join(', ') : 'NO COMMIT IN THE LIST PRODUCES THESE BYTES'}`);
  if (!r.matches.length) {
    for (const c of COMMITS) {
      for (const rp of repoPathsFor(r.path)) {
        const b = blobSha(c, rp);
        console.log(`            ${c.slice(0, 9)} ${rp.startsWith('homepage') ? 'mirror   ' : 'canonical'} `
          + (b ? `${b.bytes} bytes sha256 ${b.sha.slice(0, 24)}` : 'ABSENT AT THIS COMMIT'));
      }
    }
  }
}

const decisive = rows.filter((r) => r.path.includes('/assets/') && r.servedSha);
const allMatchedSame = decisive.length
  && decisive.every((r) => r.matches.length)
  && new Set(decisive.map((r) => r.matches.map((m) => m.split(':')[0]).sort().join('|'))).size === 1;
console.log('\n=== VERDICT ===');
if (!decisive.length) console.log('  INDETERMINATE — no served asset bytes retrieved.');
else if (allMatchedSame) console.log(`  ONE BUNDLE. Every served asset is byte-identical to ${decisive[0].matches.join(' and ')}.`);
else console.log('  DIVERGENT — served assets do not all trace to the same committed bundle. See rows above.');
