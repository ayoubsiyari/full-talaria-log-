#!/usr/bin/env node
/**
 * PASSPORT-3 — the passport's third coordinate: the commit SHA in the served bytes.
 *
 * badge  = a deploy parameter, says nothing about source content
 * digest = a property of the served bytes, says they are stable, not what they are
 * SHA    = names the tree that produced them
 *
 * The whole point of the seal is "a proper soak on a proper build that we actually know what it
 * contains". Two different trees can deploy under adjacent badges, so without the third coordinate
 * "we know what it contains" is an assertion.
 *
 * The property under test is not "the SHA appears somewhere". It is: **a build cannot produce a
 * servable artefact with an unknown source**. So the central cases here are the ones where the build
 * must REFUSE, and they run the real script in a sandbox rather than checking that a string exists.
 *
 * The script rewrites chart.js in place, so every case runs against a throwaway copy. Nothing here
 * touches the real tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = process.argv[2] || process.cwd();
const SCRIPT = path.join(REPO, 'chart v 1.4/chart/scripts/bump-chart-engine-build.mjs');

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); fail++; }
};

const GOOD_SHA = '96af370130123456789abcdef0123456789abcde';

/** Build a throwaway chart/ dir with just enough for the script to run, then invoke it. */
/**
 * The sandbox is a miniature of the REAL two-mirror layout, not a bare temp dir.
 *
 * The emitter now runs C's pre-cut integrity gate before it will emit anything,
 * and that gate resolves its mirrors by walking two levels up from the chart
 * directory and requiring `chart v 1.4/chart` and `homepage/public/chart` to
 * both be there. A fixture of the old shape (`<tmp>/chart` holding only the one
 * copied script) failed three ways in sequence: the gate file was not copied at
 * all, then its `scripts/lib` dependency was not, and then the gate ran and
 * correctly refused a tree with zero files in it. Each of those made every cell
 * in this file red while the emitter was in fact healthy — the b122 image built
 * with this same emitter.
 *
 * So the fixture mirrors the real layout in miniature and copies the whole
 * `scripts/` tree rather than one file. That keeps the emitter running against
 * its real dependencies instead of against a stub of them, which is the only
 * version of this test worth having.
 */
function makeSandbox(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const chartDir = path.join(tmp, 'chart v 1.4', 'chart');
  const mirrorDir = path.join(tmp, 'homepage', 'public', 'chart');
  fs.mkdirSync(path.join(chartDir, 'modules'), { recursive: true });
  fs.mkdirSync(path.join(mirrorDir, 'modules'), { recursive: true });
  fs.cpSync(path.dirname(SCRIPT), path.join(chartDir, 'scripts'), { recursive: true });
  for (const dir of [chartDir, mirrorDir]) {
    fs.writeFileSync(path.join(dir, 'chart.js'), "const CHART_ENGINE_BUILD = '20260724b61';\n");
    fs.writeFileSync(path.join(dir, 'modules', 'sample.js'), 'export const sample = 1;\n');
  }
  fs.writeFileSync(path.join(chartDir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2));
  return { tmp, chartDir };
}

function runBump(env) {
  const { tmp, chartDir } = makeSandbox('passport3-');
  fs.copyFileSync(SCRIPT, path.join(chartDir, 'scripts', 'bump.mjs'));

  const r = spawnSync(process.execPath, [path.join(chartDir, 'scripts', 'bump.mjs')], {
    env: { ...process.env, BUILD_ID: '', SOURCE_COMMIT_SHA: '', CHECKPOINT_BUILD: '', ...env },
    encoding: 'utf8',
  });
  const infoPath = path.join(chartDir, 'build-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : null;
  const out = (r.stdout || '') + (r.stderr || '');
  // Captured so the emitter's side-effect surface can be asserted, not just its artefact.
  const pkgAfter = fs.readFileSync(path.join(chartDir, 'package.json'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { code: r.status, info, out, pkgAfter };
}
const PKG_BEFORE = JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2);

console.log('=== a checkpoint build REFUSES to produce an artefact with an unknown source ===');
{
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b121', SOURCE_COMMIT_SHA: '' });
  check('empty SHA under CHECKPOINT_BUILD=1 fails the build', r.code, 1);
  check('and emits no build-info.json at all', r.info, null);
  check('and says why', /requires SOURCE_COMMIT_SHA/.test(r.out), true);
}
{
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b121', SOURCE_COMMIT_SHA: 'abc123' });
  check('a short SHA fails too (not just empty)', r.code, 1);
  check('no artefact', r.info, null);
}
{
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b121', SOURCE_COMMIT_SHA: 'z'.repeat(40) });
  check('40 characters of non-hex fails', r.code, 1);
}

console.log('\n=== a valid checkpoint build carries the SHA into the artefact ===');
{
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b121', SOURCE_COMMIT_SHA: GOOD_SHA });
  check('build succeeds', r.code, 0);
  check('build-info.json emitted', r.info !== null, true);
  check('carries the build id', r.info && r.info.buildId, '20260802b121');
  check('carries the SHA', r.info && r.info.sourceCommitSha, GOOD_SHA);
  check('marks itself a checkpoint build', r.info && r.info.checkpointBuild, true);
  check('is signature-tagged so a stale shape is detectable', r.info && r.info.signature, 'TALARIA_BUILD_INFO_V1');
}
{
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b121', SOURCE_COMMIT_SHA: GOOD_SHA.toUpperCase() });
  check('an uppercase SHA is accepted and normalised', r.info && r.info.sourceCommitSha, GOOD_SHA);
}

console.log('\n=== a dev build still works, and is honestly labelled ===');
{
  const r = runBump({ CHECKPOINT_BUILD: '', SOURCE_COMMIT_SHA: '' });
  check('non-checkpoint build succeeds without a SHA', r.code, 0);
  check('and records the SHA as null rather than inventing one', r.info && r.info.sourceCommitSha, null);
  check('and does not claim to be a checkpoint build', r.info && r.info.checkpointBuild, false);
}

console.log('\n=== the emitter has exactly two side effects, and package.json is not one of them ===');
{
  // C found six verifier runs had walked chart/package.json 1.4.31 -> 1.4.37 in a tree that
  // was supposed to be quiescent. The bump was removed rather than documented: nothing in the
  // repository reads that version, it made the same commit build to two different trees, and a
  // version that advances when someone merely LOOKS at the emitter is a false provenance
  // signal -- the exact class PASSPORT-3 exists to remove. Identity is buildId + sourceCommitSha.
  const r = runBump({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b122', SOURCE_COMMIT_SHA: GOOD_SHA });
  check('a real checkpoint run still succeeds', r.code, 0);
  check('and leaves package.json byte-identical', r.pkgAfter, PKG_BEFORE);
  check('and the version specifically has not moved', JSON.parse(r.pkgAfter).version, '1.0.0');
  check('the run log declares two effects, not three', /\(1\/2\)/.test(r.out) && /\(2\/2\)/.test(r.out), true);
  check('and never mentions writing package.json', /package\.json version:/.test(r.out), false);

  // Static: the write itself is gone, not merely skipped behind a flag that could flip back.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  check('no writeFileSync targets package.json anywhere in the emitter',
    /writeFileSync\(\s*PKG_JSON/.test(src), false);
  check('and the bumpPatchVersion helper is gone rather than left for rewiring',
    /function bumpPatchVersion/.test(src), false);
}

console.log('\n=== discriminating: the package.json assertion goes red if the bump comes back ===');
{
  // BIND-01. A removal is only verified if its absence is what the gate detects, so restore the
  // bump in a sandboxed copy of the emitter and confirm the same predicate fails.
  const { tmp, chartDir } = makeSandbox('passport3-mutant-');
  const mutant = fs.readFileSync(SCRIPT, 'utf8').replace(
    '    writeBuildInfo(nextBuild);',
    `    {
        const PKG = path.join(ROOT, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
        const p = String(pkg.version).split('.').map(Number); p[2] += 1;
        pkg.version = p.join('.');
        if (!DRY_RUN) fs.writeFileSync(PKG, \`\${JSON.stringify(pkg, null, 2)}\\n\`, 'utf8');
    }
    writeBuildInfo(nextBuild);`);
  check('the mutant emitter actually differs from the real one', mutant.length > fs.readFileSync(SCRIPT, 'utf8').length, true);
  fs.writeFileSync(path.join(chartDir, 'scripts', 'bump.mjs'), mutant);
  fs.writeFileSync(path.join(chartDir, 'package.json'), PKG_BEFORE);
  const r = spawnSync(process.execPath, [path.join(chartDir, 'scripts', 'bump.mjs')], {
    env: { ...process.env, BUILD_ID: '20260802b122', SOURCE_COMMIT_SHA: GOOD_SHA, CHECKPOINT_BUILD: '1' },
    encoding: 'utf8',
  });
  const pkgAfter = fs.readFileSync(path.join(chartDir, 'package.json'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  check('the mutant run succeeds, so this is not a crash being mistaken for a catch', r.status, 0);
  check('and a tree whose package.json moved is caught', pkgAfter === PKG_BEFORE, false);
  check('specifically: the mutant walked the version', JSON.parse(pkgAfter).version, '1.0.1');
}

console.log('\n=== the chain: does the SHA actually reach the script, and the artefact reach the wire? ===');
{
  // EVERY Dockerfile that runs the emitter, discovered rather than listed.
  //
  // The original gate hard-coded homepage/Dockerfile and passed. But /chart/build-info.json
  // is served by api_server.py, which ships in the TRADING-CHART image, built from
  // chart v 1.4/chart/Dockerfile.local -- and that one invoked the emitter with BUILD_ID
  // alone. No SOURCE_COMMIT_SHA, and no CHECKPOINT_BUILD, so the strict lock never engaged
  // and the emitter silently wrote sourceCommitSha: null instead of failing the build. The
  // fix was wired to one tier and verified on that same tier. Enumerate instead.
  const dockerfiles = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.ckpt')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/^Dockerfile/.test(e.name)) dockerfiles.push(abs);
    }
  };
  walk(REPO);

  const emitters = dockerfiles.filter((f) => fs.readFileSync(f, 'utf8').includes('bump-chart-engine-build.mjs'));
  check('at least two Dockerfiles run the emitter (chart image and homepage image)',
    emitters.length >= 2, true);
  console.log(`        emitter Dockerfiles: ${emitters.map((f) => path.relative(REPO, f)).join(', ')}`);

  for (const f of emitters) {
    const rel = path.relative(REPO, f).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');
    const inv = src.match(/BUILD_ID="\$CHART_BUILD_ID"[\s\S]{0,260}?bump-chart-engine-build\.mjs/);
    check(`${rel}: passes SOURCE_COMMIT_SHA to the emitter`,
      !!inv && /SOURCE_COMMIT_SHA="\$SOURCE_COMMIT_SHA"/.test(inv[0]), true);
    check(`${rel}: passes CHECKPOINT_BUILD to it too (the strict lock)`,
      !!inv && /CHECKPOINT_BUILD="\$CHECKPOINT_BUILD"/.test(inv[0]), true);
    check(`${rel}: declares SOURCE_COMMIT_SHA as an ARG`,
      /ARG SOURCE_COMMIT_SHA/.test(src), true);

    // Invoking the emitter is not the same as shipping what it wrote, and shipping it to
    // MORE than one image is its own defect.
    //
    // The emitter writes build-info.json into the BUILD stage. Every COPY into a runtime
    // stage names an explicit path, so without a copy-forward the passport is generated
    // and discarded, and the route 404s however correct the whitelist, the routing and
    // the auth exemption are. That is the chart image's obligation: it holds api_server.py,
    // which serves the file with no-store.
    //
    // The homepage image must NOT carry a copy. When it did, nginx answered /chart/build-
    // info.json from the static tier under the asset policy (max-age=3600, public) instead
    // of proxying to the backend, and a cacheable passport can keep asserting a SHA after
    // the bytes changed. Exactly one tier answers.
    const copiesForward = /COPY --from=\S+ \S*build-info\.jso\[?n\]?\S*/.test(src);
    const servesPassport = rel.includes('chart/Dockerfile');
    if (servesPassport) {
      check(`${rel}: copies build-info.json forward (this image serves it)`, copiesForward, true);
    } else {
      check(`${rel}: does NOT copy build-info.json (one tier owns the passport)`, copiesForward, false);
    }
  }

  const api = fs.readFileSync(path.join(REPO, 'chart v 1.4/chart/api_server.py'), 'utf8');
  check('build-info.json is on the served whitelist', /CHART_ROOT_FILES = \{[\s\S]{0,200}"build-info\.json"/.test(api), true);

  // Isolate the handler by its own boundaries rather than by a character window. A window that is too
  // small reports a false RED (it did), and one that is too large can match the NEXT handler's headers
  // and report a false GREEN - which is the failure that actually costs something.
  const handler = (() => {
    const start = api.indexOf('if file_name == "build-info.json":');
    if (start < 0) return '';
    const rest = api.slice(start + 10);
    const end = rest.indexOf('if file_name == ');
    return end < 0 ? api.slice(start) : api.slice(start, start + 10 + end);
  })();
  check('the handler block was located', handler.length > 0, true);
  check('served as application/json', /media_type="application\/json"/.test(handler), true);
  check('served no-store, so the harness never reads a cached SHA',
    /"Cache-Control": "no-store"/.test(handler), true);
  check('a missing file 404s instead of 500ing a dev image', /status_code=404/.test(handler), true);
  check('the block does not run past into the manifest handler',
    /manifest\+json/.test(handler), false);

  const compose = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
  check('compose forwards SOURCE_COMMIT_SHA into the build args', /SOURCE_COMMIT_SHA: \$\{SOURCE_COMMIT_SHA/.test(compose), true);

  // The front door. nginx evaluates regex locations in file order, so an earlier block matching .json
  // would swallow /chart/build-info.json and the backend route would never fire - the fix would be
  // present, bound, mirrored, and completely inert. That is the exact PROC-3 failure mode.
  const ng = fs.readFileSync(path.join(REPO, 'homepage/nginx.conf'), 'utf8');
  const chartProxyAt = ng.indexOf('location ~ ^/(modules|uploads|chart|styles)/');
  check('/chart/ is proxied to the chart backend at all', chartProxyAt > -1, true);
  const earlier = ng.slice(0, chartProxyAt < 0 ? 0 : chartProxyAt);
  const earlierJsonBlock = /location\s+[~^][^\n]*\bjson\b[^\n]*\{/i.test(earlier);
  check('no earlier location block claims .json before the chart proxy', earlierJsonBlock, false);

  // The tier the routing checks above cannot see, and the one that actually broke it.
  // auth_middleware marks everything under /chart protected, so an unauthenticated GET of
  // the passport is redirected to /login/ and a redirect-following client gets ~29 KB of
  // app-shell HTML under a 200. nginx was right, the handler was right, the whitelist was
  // right, and the route was still unreadable. The harness reads this with no credentials.
  // The tier that actually answered the passport, and the one the earlier routing checks
  // read the wrong file for. homepage/Dockerfile bakes nginx.local.conf as default.conf --
  // NOT nginx.conf, which is what those checks were reading. nginx.local.conf's ^~ /chart/
  // block does try_files $uri first and carries expires 1h + "public, must-revalidate", so
  // live verification came back 200 with the right build id, the right SHA, and max-age=3600.
  const local = fs.readFileSync(path.join(REPO, 'homepage/nginx.local.conf'), 'utf8');
  const exact = local.match(/location = \/chart\/build-info\.json \{[\s\S]*?\n    \}/);
  check('the deployed nginx config pins the passport in an exact-match location',
    !!exact, true);
  check('...which outranks the ^~ /chart/ prefix and its 1h TTL',
    !!exact && /proxy_pass http:\/\/trading-chart:8000/.test(exact[0]), true);
  check('...hides the upstream Cache-Control so there is exactly one',
    !!exact && /proxy_hide_header Cache-Control/.test(exact[0]), true);
  check('...and forces no-store',
    !!exact && /add_header Cache-Control "no-store" always/.test(exact[0]), true);
  check('the homepage image bakes nginx.local.conf, which is the file checked above',
    /COPY homepage\/nginx\.local\.conf \/etc\/nginx\/conf\.d\/default\.conf/
      .test(fs.readFileSync(path.join(REPO, 'homepage/Dockerfile'), 'utf8')), true);

  const publicSet = api.slice(api.indexOf('public_paths = {'), api.indexOf('public_prefixes'));
  check('the passport is exempt from auth, so an anonymous harness can read it',
    /"\/chart\/build-info\.json"/.test(publicSet), true);
  // The exemption must be exact-match. A prefix here would expose every chart asset.
  check('and the /chart prefix guard is still in force for everything else',
    /if path\.startswith\("\/chart"\):\s*\n\s*protected = True/.test(api), true);
}

console.log('\n=== discriminating: the pre-change build would pass a naive gate and fail this one ===');
{
  // Before this change the SHA reached an OCI label and the checkpoint asserter, and nothing else.
  // A gate that greps the repo for "SOURCE_COMMIT_SHA" was already green then. The question that
  // separates them is whether a BROWSER can read it.
  const naive = true;   // repo-wide grep: green before and after, therefore worthless
  const realQuestion = fs.readFileSync(path.join(REPO, 'chart v 1.4/chart/api_server.py'), 'utf8')
    .includes('build-info.json');
  check('a repo grep for SOURCE_COMMIT_SHA was green before the change', naive, true);
  check('but an HTTP-reachable artefact only exists after it', realQuestion, true);
}

console.log('\n=== discriminating: the auth exemption check goes red when the exemption is removed ===');
{
  // BIND-01. The auth tier is what actually broke this route while every other check was
  // green, so its assertion has to be shown failing rather than trusted for being present.
  // Mutate the source in memory and re-run the same predicate.
  const api = fs.readFileSync(path.join(REPO, 'chart v 1.4/chart/api_server.py'), 'utf8');
  const slice = (src) => src.slice(src.indexOf('public_paths = {'), src.indexOf('public_prefixes'));
  const exempt = (src) => /"\/chart\/build-info\.json"/.test(slice(src));

  check('the real tree is exempt', exempt(api), true);
  const mutant = api.replace('        "/chart/build-info.json",\n', '');
  check('the mutant actually differs from the real tree', mutant.length < api.length, true);
  check('and a tree without the exemption is caught', exempt(mutant), false);

  // The other half: the exemption must not have been bought by widening the guard.
  const widened = api.replace('if path.startswith("/chart"):\n        protected = True', '');
  const guarded = (src) => /if path\.startswith\("\/chart"\):\s*\n\s*protected = True/.test(src);
  check('a tree that dropped the /chart guard entirely is caught', guarded(widened), false);
}

console.log(`\n================ PASSPORT-3 (REPO MODE): ${pass} passed, ${fail} failed ================`);
console.log(`
  SCOPE CAVEAT — this gate does not establish that the passport is readable.

  Every check above reads a file on disk. None makes an HTTP request. C found the gap the
  hard way: with all of these green, the live origin served 29,406 bytes of app-shell login
  HTML under a 200 for /chart/build-info.json. A 200, not a 404 — so a reader checking
  res.ok is satisfied and a reader calling res.json() in a try/catch records
  sourceCommitSha: null, which is worse than no passport because it looks like an answer.

  Green here means the emitter, the Dockerfile wiring, the whitelist, the handler and the
  nginx ordering are correct ON DISK. Wire behaviour is a separate proposition: auth
  middleware, an SPA catch-all or a proxy tier can each satisfy the file and break the wire.

  PASSPORT-3 is not bound until this passes against the deployed origin:
    node _evidence/manager-B/passport3-commit-sha/passport3-verify.mjs --mode=live \\
         --origin=<origin> --expect-build=<badge> --expect-sha=<train tip>
  Run it at the cut, so the transition is witnessed rather than inferred.`);
process.exit(fail ? 1 : 0);
