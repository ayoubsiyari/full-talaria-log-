#!/usr/bin/env node
/**
 * COPY-ABSENCE-01 — count the silent half of the COPY allowlist class.
 *
 * The loud case is closed. `session-calendar.js` was absent from the image, a
 * module contract referenced it, and the build failed visibly; BUILD-CONTEXT-01
 * now asserts every contract mirror reaches a COPY directive. But the contract
 * net is SIX PATHS across three modules. A file the image does not carry that no
 * contract references is absent in production and silent everywhere, and until
 * this instrument existed there was no detector for it at all.
 *
 * WHY IT IS NOT A DOCKERFILE SIMULATION
 *   Absence from the homepage image is not sufficient for a 404. nginx serves
 *   `location ^~ /chart/ { try_files $uri $uri/ @chart_upstream; }`, so a miss
 *   proxies to the trading-chart FastAPI container, which holds a wholesale copy
 *   of the chart tree and serves it through an allowlist of root basenames plus a
 *   fixed set of mounts. A file is only truly gone when BOTH layers decline it.
 *   Simulating that stack from two Dockerfiles, a .dockerignore, a strip script
 *   and a mount table would be a model of production, and a model is what
 *   SEAL-EVIDENCE-01 says cannot bless served bytes. So the oracle is the served
 *   surface itself: ask the deployed build for every URL its own shells
 *   reference, and report what it answers.
 *
 * WHAT IT MEASURES
 *   1. Every shell discovered under the pinned roots (reusing RUN-LOCK-01-era
 *      `servable-shell-discovery.mjs`, not a second parser).
 *   2. Narrowed to shells that are servable in production per the inventory,
 *      because harness shells and `*.test.mjs` are stripped ON PURPOSE and
 *      counting them would inflate the number with intended absences.
 *   3. Every `<script src>` those shells load, resolved to a served URL.
 *   4. Fetched from --base. Non-200 is absence, observed rather than modelled.
 *   5. Each absence classified by whether ANY contract references it.
 *
 * States, and none may be reached by looking at nothing:
 *   CENSUS_CLEAN               every referenced URL is carried
 *   SILENT_ABSENT              carried by nothing and named by no contract (exit 1)
 *   LOUD_ABSENT                absent but contract-referenced, so a gate covers it
 *   SHELL_PARSE_INCOMPLETE     a shell the tokenizer could not fully read (exit 1)
 *   SHELL_NOT_IN_INVENTORY     discovered but unaudited, so scope is unknown
 *   NO_REFERENCES_FOUND        nothing was checked; not a pass
 *   BASE_UNREACHABLE           the door is shut; not a pass (exit 2)
 *
 *   node scripts/copy-absence-census.mjs --base=http://31.97.192.82:3000
 *   node scripts/copy-absence-census.mjs --base=... --out=<path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverShells } from './lib/servable-shell-discovery.mjs';
import { writeArtifactAtomic } from './lib/run-lock.mjs';
import { both, stampUtc } from './lib/clock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const BASE = argOf('base', 'http://31.97.192.82:3000').replace(/\/$/, '');
// Overridable so the selftest can point the WHOLE pipeline -- discovery,
// contracts, the nginx and strip declarations, the fetch -- at a temporary tree
// and a local server. Without that, the anti-vacuity arm could only test the
// classifier, and "0 silent absences" would rest on an unproven claim that the
// discovery and fetch layers work at all.
const ROOT = path.resolve(argOf('repo-root', REPO_ROOT));
const OUT = argOf('out', path.join(ROOT, 'docs/plan3/evidence/copy-absence-census.json'));

/**
 * Repo path -> the URL production serves it at, or null when the path is not a
 * served location. Returning null rather than a guess matters: a wrong mapping
 * invents a 404 and the report becomes noise nobody trusts.
 */
function servedUrlForShell(repoPath) {
  const p = repoPath.replace(/\\/g, '/');
  for (const [prefix, url] of [
    ['chart v 1.4/chart/', '/chart/'],
    ['homepage/public/chart/', '/chart/'],
    ['homepage/out/chart/', '/chart/'],
  ]) {
    if (p.startsWith(prefix)) return `${url}${p.slice(prefix.length)}`;
  }
  return null;
}

/** Resolve a `<script src>` against the shell's served directory. */
function resolveRef(raw, shellUrl) {
  if (!raw) return null;
  const src = String(raw).trim();
  if (!src || /^(?:https?:)?\/\//.test(src)) return null;
  if (/^(?:data|blob|javascript):/i.test(src)) return null;
  const clean = src.replace(/[?#].*$/, '');
  if (!clean) return null;
  if (clean.startsWith('/')) return clean;
  const dir = shellUrl.replace(/\/[^/]*$/, '');
  const joined = `${dir}/${clean}`;
  // Collapse ./ and ../ without pulling in a URL parser that would need an origin.
  const out = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return `/${out.join('/')}`;
}

function loadContracts() {
  const file = path.join(ROOT, 'scripts/module-contracts.json');
  if (!fs.existsSync(file)) return { paths: new Set(), inventory: new Map(), absent: true };
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const paths = new Set();
  for (const m of json.modules || []) {
    if (m.source) paths.add(m.source.replace(/\\/g, '/'));
    for (const mir of m.mirrors || []) paths.add(mir.replace(/\\/g, '/'));
    if (m.script) paths.add(m.script); // the served URL form, e.g. /chart/modules/x.js
  }
  const inventory = new Map();
  for (const i of json.inventory || []) {
    inventory.set((i.path || '').replace(/\\/g, '/'), i);
    if (i.path) paths.add(i.path.replace(/\\/g, '/'));
  }
  return { paths, inventory, absent: false };
}

/**
 * Does any contract name this URL? Checked against both the served form and the
 * two repo mirror paths it could correspond to, because contracts are written in
 * repo paths and the browser asks in URLs.
 */
function contractNames(url, contracts) {
  const rest = url.replace(/^\/chart\//, '');
  const candidates = [
    url,
    `chart v 1.4/chart/${rest}`,
    `homepage/public/chart/${rest}`,
    `homepage/out/chart/${rest}`,
  ];
  return candidates.filter((c) => contracts.paths.has(c));
}

/**
 * Who, if anyone, DECLARED that this URL is absent?
 *
 * Read carefully: this does not predict absence, it explains an absence already
 * observed over HTTP. The oracle stays the served surface. Without this step the
 * census cries wolf on intended 404s -- nginx returns 404 for two harness
 * prefixes on purpose -- and an instrument that reports intended behaviour as a
 * defect is one nobody reads by the third run.
 */
function declaredAbsence(url) {
  const out = [];
  const conf = path.join(ROOT, 'homepage/nginx.local.conf');
  if (fs.existsSync(conf)) {
    const text = fs.readFileSync(conf, 'utf8');
    const re = /location\s+(=|\^~|~\*?)?\s*([^\s{]+)\s*\{[^}]*?return\s+404/gis;
    for (const m of text.matchAll(re)) {
      const [, op, pattern] = m;
      const hit = op === '=' ? url === pattern : url.startsWith(pattern);
      if (hit) out.push(`nginx.local.conf: location ${op || ''} ${pattern} returns 404`);
    }
  }
  const strip = path.join(ROOT, 'deploy/strip-nonserved-chart-assets.sh');
  if (fs.existsSync(strip)) {
    const text = fs.readFileSync(strip, 'utf8');
    if (/multichart-prod\/harness/.test(text) && url.includes('/multichart-prod/harness/')) {
      out.push('strip-nonserved-chart-assets.sh: removes multichart-prod/harness');
    }
    for (const suffix of ['.test.mjs', '.bak', '.backup', '.map']) {
      if (url.endsWith(suffix) && text.includes(`'*${suffix}'`)) {
        out.push(`strip-nonserved-chart-assets.sh: deletes *${suffix}`);
      }
    }
  }
  return out;
}

async function head(url) {
  // GET, not HEAD: nginx and FastAPI can differ on HEAD for static files, and a
  // method the server treats specially would measure the method, not the file.
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return { status: res.status, contentType: res.headers.get('content-type') || null };
  } catch (err) {
    return { status: 0, error: String(err && err.message ? err.message : err) };
  }
}

async function main() {
  const contracts = loadContracts();
  // `discoverShells` throws on a missing root, and `homepage/out` is a build
  // product absent from a clean checkout. Skipping it silently would shrink the
  // denominator without saying so, so absent roots are named and reported.
  const wantRoots = (argOf('roots', 'chart v 1.4,homepage/public,homepage/out')).split(',').map((s) => s.trim()).filter(Boolean);
  const rootsPresent = wantRoots.filter((r) => fs.existsSync(path.join(ROOT, ...r.split('/'))));
  const rootsAbsent = wantRoots.filter((r) => !rootsPresent.includes(r));
  const { shells, roots } = discoverShells({ root: ROOT, roots: rootsPresent });

  const inScope = [];
  const skipped = [];
  const unaudited = [];
  const parseIncomplete = [];

  for (const shell of shells) {
    const url = servedUrlForShell(shell.path);
    const inv = contracts.inventory.get(shell.path);
    if (!shell.parseComplete) {
      // Under-counting risk, reported as its own state. A shell the parser could
      // not finish contributes an unknown number of references, and a census with
      // an unknown denominator must say so rather than print a confident total.
      parseIncomplete.push({ path: shell.path, reasons: shell.parseIncompleteReasons });
    }
    if (/(?:^|\/)node_modules\//.test(shell.path)) { skipped.push({ path: shell.path, why: 'VENDOR' }); continue; }
    if (!url) { skipped.push({ path: shell.path, why: 'NOT_A_SERVED_LOCATION' }); continue; }
    if (!inv) {
      // Measured, NOT excluded. The first run of this census scoped itself to the
      // inventory and reported 0 of 0 problems while 21 of 34 discovered shells --
      // index.html, index.v9.html, backtesting.html, sessions.html,
      // multichart-shell.html among them -- sat outside the scope that produced the
      // green. A census whose denominator excludes the product is the same green as
      // a gate that never executed, so these are counted in their own bucket with
      // their weaker warrant stated rather than dropped.
      unaudited.push({ path: shell.path, servedUrl: url });
      inScope.push({ ...shell, servedUrl: url, surface: null, scope: 'UNAUDITED_SHELL' });
      continue;
    }
    if (inv.status !== 'owned-stamped' || inv.servable !== true) {
      skipped.push({ path: shell.path, why: `INVENTORY_${String(inv.status).toUpperCase()}`, servable: inv.servable });
      continue;
    }
    inScope.push({ ...shell, servedUrl: url, surface: inv.surface, scope: 'INVENTORY_SERVABLE' });
  }

  // Referenced URL -> which shells ask for it, and under which warrant. A URL
  // reached from an inventory-servable shell is the strong case; one reached only
  // from an unaudited shell is still a real reference, just a weaker warrant.
  const refs = new Map();
  const add = (u, shell, via) => {
    if (!u) return;
    if (!refs.has(u)) refs.set(u, { by: [], scopes: new Set(), via: new Set() });
    const e = refs.get(u);
    if (!e.by.includes(shell.path)) e.by.push(shell.path);
    e.scopes.add(shell.scope);
    e.via.add(via);
  };
  for (const shell of inScope) {
    for (const src of shell.scriptSrcs || []) add(resolveRef(src, shell.servedUrl), shell, 'script-src');
    // Beyond <script src>, in the same documents. `scriptSrcs` alone missed
    // stylesheets, module preloads and worker entries, and a worker entry that
    // 404s is a feature that silently never starts rather than a page that
    // visibly breaks -- the exact shape this census is looking for.
    const abs = path.join(ROOT, ...shell.path.split('/'));
    if (!fs.existsSync(abs)) continue;
    const html = fs.readFileSync(abs, 'utf8');
    const passes = [
      [/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, 'link-href'],
      [/importScripts\(\s*["']([^"']+)["']/gi, 'importScripts'],
      [/new\s+Worker\(\s*["']([^"']+)["']/gi, 'new-Worker'],
      [/new\s+SharedWorker\(\s*["']([^"']+)["']/gi, 'new-SharedWorker'],
      [/serviceWorker\.register\(\s*["']([^"']+)["']/gi, 'sw-register'],
    ];
    for (const [re, via] of passes) {
      for (const m of html.matchAll(re)) {
        if (via === 'link-href' && !/rel=["']?(?:stylesheet|modulepreload|preload)/i.test(m[0])) continue;
        add(resolveRef(m[1], shell.servedUrl), shell, via);
      }
    }
  }
  const warrantOf = (u) => (refs.get(u).scopes.has('INVENTORY_SERVABLE')
    ? 'INVENTORY_SERVABLE' : 'UNAUDITED_SHELL');

  console.log(`COPY-ABSENCE-01 · ${both()}`);
  console.log(`  base            ${BASE}`);
  console.log(`  roots           ${roots.join(', ')}`);
  if (rootsAbsent.length) console.log(`  ROOT_ABSENT     ${rootsAbsent.join(', ')} (build product, not in this checkout — coverage is reduced by whatever it holds)`);
  console.log(`  shells found    ${shells.length}`);
  console.log(`  measured        ${inScope.length} shells (${inScope.length - unaudited.length} inventory-servable + ${unaudited.length} unaudited)`);
  console.log(`  skipped         ${skipped.length} (vendor, not a served location, or inventory says excluded/removed/not-servable)`);
  console.log(`  referenced URLs ${refs.size}`);
  console.log('');

  // The door first. Every absence below is meaningless if the base is down, and a
  // census that reports 40 absences against a shut door is worse than no census.
  const doorUrl = `${BASE}/chart/build-info.json`;
  const door = await head(doorUrl);
  /**
   * A refusal is a result and has to be citable, so it gets an artifact like any
   * other state. Exiting with a message and no file leaves the reader with nothing
   * to quote and the next run with nothing to diff -- and it is why the "shell the
   * inventory calls not-servable" case produced a null artifact.
   */
  const refuse = (refusalState, why, extra = {}) => {
    console.log(`\n  [copy-absence-01] ${refusalState}`);
    writeArtifactAtomic(OUT, `${JSON.stringify({
      signature: 'TALARIA_COPY_ABSENCE_CENSUS_V1',
      evidenceClass: 'REFUSED — no census was taken; this artifact records why, so the absence of a count is not mistaken for a count of zero',
      generatedAt: stampUtc(),
      generatedAtLocal: both(),
      base: BASE,
      state: refusalState,
      why,
      roots,
      rootsAbsent,
      /**
       * NULL, not zeroes. The first version of this wrote `silentAbsent: 0` and a
       * reader -- or a script -- taking that field at face value would quote "zero
       * silent absences" from a run that never looked. A refusal must not be able to
       * masquerade as a clean result in the one field anybody greps for.
       */
      notACensus: true,
      counts: null,
      discovered: { shellsFound: shells.length, referencesExtracted: refs.size },
      ...extra,
    }, null, 2)}\n`);
    console.log(`  artifact      ${path.relative(ROOT, OUT)}`);
  };

  if (door.status === 0 || door.status >= 500) {
    console.log(`  BASE_UNREACHABLE ${doorUrl} -> ${door.status || door.error}`);
    console.log('  Refusing to report absences against a base that is not answering.');
    refuse('BASE_UNREACHABLE', `${doorUrl} answered ${door.status || door.error}`,
      { door: { url: doorUrl, status: door.status } });
    return 2;
  }
  console.log(`  door            ${doorUrl} -> HTTP ${door.status}`);

  if (refs.size === 0) {
    console.log('\n  NO_REFERENCES_FOUND — nothing was checked, so nothing passed.');
    refuse('NO_REFERENCES_FOUND',
      'no shell in scope referenced a single resource, so this run can say nothing about absence',
      { door: { url: doorUrl, status: door.status }, skipped, unaudited });
    return 1;
  }

  const results = [];
  const urls = [...refs.keys()].sort();
  const CONCURRENCY = 6;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const got = await Promise.all(batch.map(async (u) => ({ url: u, ...(await head(`${BASE}${u}`)) })));
    for (const r of got) {
      const named = contractNames(r.url, contracts);
      const carried = r.status >= 200 && r.status < 400;
      const declared = carried ? [] : declaredAbsence(r.url);
      const state = carried ? 'CARRIED'
        : declared.length && named.length ? 'ABSENT_DECLARED_CONTRACT_CONFLICT'
          : declared.length ? 'ABSENT_DECLARED'
            : named.length ? 'LOUD_ABSENT' : 'SILENT_ABSENT';
      results.push({
        url: r.url,
        status: r.status,
        contentType: r.contentType || null,
        error: r.error || null,
        referencedBy: refs.get(r.url).by,
        via: [...refs.get(r.url).via].sort(),
        warrant: warrantOf(r.url),
        contractNames: named,
        declaredBy: declared,
        state,
      });
    }
  }

  const silent = results.filter((r) => r.state === 'SILENT_ABSENT');
  const loud = results.filter((r) => r.state === 'LOUD_ABSENT');
  const declaredAbs = results.filter((r) => r.state === 'ABSENT_DECLARED');
  const conflict = results.filter((r) => r.state === 'ABSENT_DECLARED_CONTRACT_CONFLICT');
  const carried = results.filter((r) => r.state === 'CARRIED');

  console.log(`\n  CARRIED          ${carried.length}`);
  console.log(`  ABSENT_DECLARED  ${declaredAbs.length}  (absent on purpose, and something says so)`);
  console.log(`  LOUD_ABSENT      ${loud.length}  (a contract names it, so a gate can fail)`);
  console.log(`  CONFLICT         ${conflict.length}  (declared absent AND contract-referenced)`);
  console.log(`  SILENT_ABSENT    ${silent.length}  (absent in production, declared by nothing, named by nothing)\n`);

  for (const r of declaredAbs) {
    console.log(`  ABSENT_DECLARED  HTTP ${r.status}  ${r.url}`);
    console.log(`                   declared by: ${r.declaredBy.join(' | ')}`);
  }
  for (const r of conflict) {
    console.log(`  CONFLICT       HTTP ${r.status}  ${r.url}`);
    console.log(`                 declared: ${r.declaredBy.join(' | ')}`);
    console.log(`                 contract: ${r.contractNames.join(', ')}`);
  }
  for (const r of loud) {
    console.log(`  LOUD_ABSENT    HTTP ${r.status}  ${r.url}`);
    console.log(`                 named by: ${r.contractNames.join(', ')}`);
  }
  for (const r of silent) {
    console.log(`  SILENT_ABSENT  HTTP ${r.status}  ${r.url}   [${r.warrant}]`);
    console.log(`                 referenced by: ${r.referencedBy.join(', ')}`);
  }
  const silentStrong = silent.filter((r) => r.warrant === 'INVENTORY_SERVABLE').length;
  if (silent.length) {
    console.log(`\n  of ${silent.length} silent absences, ${silentStrong} are reached from an `
      + `inventory-servable shell and ${silent.length - silentStrong} only from an unaudited one.`);
  }
  if (parseIncomplete.length) {
    console.log('\n  SHELL_PARSE_INCOMPLETE — these contribute an unknown number of references:');
    for (const s of parseIncomplete) console.log(`    ${s.path}  ${(s.reasons || []).join('; ')}`);
  }
  if (unaudited.length) {
    console.log('\n  SHELL_NOT_IN_INVENTORY — discovered, unaudited, excluded from the count:');
    for (const s of unaudited) console.log(`    ${s.path}`);
  }

  const state = silent.length ? 'SILENT_ABSENT'
    : conflict.length ? 'ABSENT_DECLARED_CONTRACT_CONFLICT'
      : parseIncomplete.length ? 'SHELL_PARSE_INCOMPLETE'
        : loud.length ? 'LOUD_ABSENT' : 'CENSUS_CLEAN';
  console.log(`\n  [copy-absence-01] ${state}`);

  writeArtifactAtomic(OUT, `${JSON.stringify({
    signature: 'TALARIA_COPY_ABSENCE_CENSUS_V1',
    evidenceClass: 'SERVED_RUNTIME — every verdict is an HTTP answer from the deployed build, not a model of the Dockerfiles',
    generatedAt: stampUtc(),
    generatedAtLocal: both(),
    base: BASE,
    state,
    roots,
    rootsAbsent,
    door: { url: doorUrl, status: door.status },
    counts: {
      shellsFound: shells.length,
      measured: inScope.length,
      inventoryServable: inScope.length - unaudited.length,
      unaudited: unaudited.length,
      skipped: skipped.length,
      referencedUrls: refs.size,
      carried: carried.length,
      absentDeclared: declaredAbs.length,
      loudAbsent: loud.length,
      conflict: conflict.length,
      silentAbsent: silent.length,
      contractPaths: contracts.paths.size,
    },
    limits: [
      'References are extracted from shell DOCUMENTS only: <script src>, <link rel=stylesheet|modulepreload|preload>, importScripts(), new Worker/SharedWorker, serviceWorker.register(). A path assembled inside JavaScript at runtime -- a template literal, a module name from a table, a fetch() built from variables -- is NOT followed, so the true class is at least this size and may be larger.',
      'Shells absent from the inventory are excluded from the count and listed as SHELL_NOT_IN_INVENTORY.',
      'A 200 proves the URL is served now, from this base. It does not prove the bytes are correct; that is served-bundle-parity.',
    ],
    silentAbsent: silent,
    loudAbsent: loud,
    absentDeclared: declaredAbs,
    conflict,
    carried: carried.map((r) => ({ url: r.url, status: r.status })),
    parseIncomplete,
    unaudited,
    skipped,
  }, null, 2)}\n`);
  console.log(`  artifact      ${path.relative(ROOT, OUT)}`);

  /**
   * `process.exit()` used to be called here, and on Windows it ABORTED instead of
   * exiting: with undici's sockets still open, tearing the loop down mid-close trips
   * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` in libuv and the process
   * dies with 3221226505. That landed on the SILENT_ABSENT path specifically -- the
   * one path where this gate has something to report -- so a real find surfaced to
   * any caller as a crash rather than as a refusal, and `exit === 1` never happened.
   *
   * Returning a code and letting the loop drain is the fix. It also means the caller
   * sees the artifact written above, which an abort could truncate.
   */
  return silent.length || parseIncomplete.length ? 1 : 0;
}

export { resolveRef, servedUrlForShell, declaredAbsence, contractNames, loadContracts };

// Importable without running, so the selftest can exercise the pure parts directly
// as well as driving the whole pipeline as a child process.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  // exitCode, never exit(): the loop is left to drain its sockets on its own. See the
  // note at the end of main() -- forcing it killed the process on the one path that
  // had a finding to report.
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => { console.error(err); process.exitCode = 2; });
}
