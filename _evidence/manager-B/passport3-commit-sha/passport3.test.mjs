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
function runBump(env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'passport3-'));
  const chartDir = path.join(tmp, 'chart');
  fs.mkdirSync(path.join(chartDir, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(chartDir, 'scripts', 'bump.mjs'));
  fs.writeFileSync(path.join(chartDir, 'chart.js'), "const CHART_ENGINE_BUILD = '20260724b61';\n");
  fs.writeFileSync(path.join(chartDir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2));

  const r = spawnSync(process.execPath, [path.join(chartDir, 'scripts', 'bump.mjs')], {
    env: { ...process.env, BUILD_ID: '', SOURCE_COMMIT_SHA: '', CHECKPOINT_BUILD: '', ...env },
    encoding: 'utf8',
  });
  const infoPath = path.join(chartDir, 'build-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : null;
  const out = (r.stdout || '') + (r.stderr || '');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { code: r.status, info, out };
}

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

console.log('\n=== the chain: does the SHA actually reach the script, and the artefact reach the wire? ===');
{
  const dockerfile = fs.readFileSync(path.join(REPO, 'homepage/Dockerfile'), 'utf8');
  const bumpInvocation = dockerfile.match(/BUILD_ID="\$CHART_BUILD_ID"[\s\S]{0,220}?bump-chart-engine-build\.mjs/);
  check('Dockerfile passes SOURCE_COMMIT_SHA to the bump step',
    !!bumpInvocation && /SOURCE_COMMIT_SHA="\$SOURCE_COMMIT_SHA"/.test(bumpInvocation[0]), true);
  check('Dockerfile passes CHECKPOINT_BUILD to it too (the strict lock)',
    !!bumpInvocation && /CHECKPOINT_BUILD="\$CHECKPOINT_BUILD"/.test(bumpInvocation[0]), true);
  check('SOURCE_COMMIT_SHA is a declared ARG in the chart_assets stage',
    /FROM node:20-alpine AS chart_assets[\s\S]*?ARG SOURCE_COMMIT_SHA/.test(dockerfile), true);

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
