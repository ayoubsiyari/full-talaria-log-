#!/usr/bin/env node
/**
 * PASSPORT-3 verified END TO END rather than in principle.
 *
 * Two halves, because only one of them can be run before B cuts:
 *
 *   --mode=contract  Runs B's REAL emitter (bump-chart-engine-build.mjs) to produce build-info.json,
 *                    serves those exact bytes over HTTP, and requires my reader to accept them. This is
 *                    the half nobody has watched work: every observation so far has been of the FAILING
 *                    branch (b120 serves the app shell with a 200), so a green at B's cut would be the
 *                    first time the success path had ever executed. It also drives the emitter's
 *                    non-checkpoint path, so the NULL_SHA trap my own file names is observed, not assumed.
 *
 *   --mode=live      Points the same reader at the real origin. Before the cut this must report
 *                    SPA_FALLBACK; at the cut it must report OK with a non-null 40-hex SHA. Run it at the
 *                    cut and the transition is witnessed rather than inferred.
 *
 * The reader under test is the one the soak imports. No second implementation.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { readBuildInfo } from './lib/build-info.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const MODE = argOf('mode', 'contract');
const ORIGIN = argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const GOOD_SHA = 'a'.repeat(8) + 'b'.repeat(8) + 'c'.repeat(8) + 'd'.repeat(8) + 'e'.repeat(8);

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

/** Serve one directory, so the reader is exercised over real HTTP rather than off disk. */
function serve(dir, { contentType = 'application/json' } = {}) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, path.basename(rel));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server,
    port: server.address().port,
    // Awaited, not fire-and-forget. Calling close() and then process.exit() while handles are still
    // closing aborts the process with a libuv assertion AFTER every check has passed - an exit code that
    // contradicts the result it is reporting, which is worse than a plain failure because it looks like one.
    close: () => new Promise((done) => server.close(done)),
  })));
}

const report = { signature: 'PASSPORT3-VERIFY-V1', at: new Date().toISOString(), mode: MODE, bfcacheState: 'not applicable — HTTP contract verification, no browser.' };

if (MODE === 'contract') {
  const chartDir = path.join(process.cwd(), 'chart v 1.4', 'chart');
  const emitter = path.join(chartDir, 'scripts', 'bump-chart-engine-build.mjs');
  const artefact = path.join(chartDir, 'build-info.json');
  const saved = fs.existsSync(artefact) ? fs.readFileSync(artefact, 'utf8') : null;
  // B's emitter has THREE product side effects, not one: it rewrites chart.js's build constant AND bumps
  // the version in package.json. My first pass restored only chart.js, and six emitter runs walked
  // package.json from 1.4.31 to 1.4.37 in a tree that is supposed to be quiescent. Every file the emitter
  // can touch is captured and put back, and the run asserts it afterwards.
  const TOUCHED = ['chart.js', 'package.json'].map((f) => path.join(chartDir, f));
  const savedProduct = new Map(TOUCHED.filter((f) => fs.existsSync(f)).map((f) => [f, fs.readFileSync(f, 'utf8')]));

  const runEmitter = (env) => {
    const r = spawnSync(process.execPath, [emitter], {
      env: { ...process.env, BUILD_ID: '', SOURCE_COMMIT_SHA: '', CHECKPOINT_BUILD: '', ...env },
      encoding: 'utf8', cwd: chartDir, timeout: 60000,
    });
    let info = null;
    try { info = JSON.parse(fs.readFileSync(artefact, 'utf8')); } catch { /* stays null */ }
    return { code: r.status, out: String(r.stdout || '') + String(r.stderr || ''), info };
  };

  try {
    // 1. A CHECKPOINT build carries the SHA. These are B's bytes, not a fixture I invented.
    try { fs.unlinkSync(artefact); } catch { /* fresh */ }
    const good = runEmitter({ CHECKPOINT_BUILD: '1', BUILD_ID: '20260802b199', SOURCE_COMMIT_SHA: GOOD_SHA });
    check("B's emitter produces build-info.json for a checkpoint build", good.code === 0 && !!good.info, `exit ${good.code}`);

    const s1 = await serve(path.dirname(artefact));
    const okRead = await readBuildInfo(`http://127.0.0.1:${s1.port}`);
    await s1.close();
    check('THE SUCCESS PATH EXECUTES: my reader accepts those exact bytes over HTTP',
      okRead.ok === true && okRead.state === 'OK', `state=${okRead.state}`);
    check('and it recovers the SHA the build was given, not a truncated or upper-cased variant',
      okRead.sourceCommitSha === GOOD_SHA, `sha=${String(okRead.sourceCommitSha).slice(0, 16)}…`);
    check('and the buildId travels with it, so badge and source are one record',
      okRead.buildId === '20260802b199' && okRead.checkpointBuild === true, `buildId=${okRead.buildId} checkpoint=${okRead.checkpointBuild}`);
    report.successPath = okRead;

    // 2. THE TRAP, observed rather than asserted: a non-checkpoint build emits a null SHA, and a reader
    //    that trusted res.ok would report a healthy passport naming no source at all.
    try { fs.unlinkSync(artefact); } catch { /* fresh */ }
    const dev = runEmitter({ CHECKPOINT_BUILD: '', SOURCE_COMMIT_SHA: '' });
    check('a non-checkpoint build still emits, with the SHA recorded as null', dev.code === 0 && dev.info && dev.info.sourceCommitSha === null, `sha=${dev.info ? JSON.stringify(dev.info.sourceCommitSha) : 'no artefact'}`);
    const s2 = await serve(path.dirname(artefact));
    const nullRead = await readBuildInfo(`http://127.0.0.1:${s2.port}`);
    await s2.close();
    check('THE NULL TRAP IS CAUGHT: a well-formed passport naming no source is REFUSED, not accepted',
      nullRead.ok === false && nullRead.state === 'NULL_SHA', `state=${nullRead.state}`);
    report.nullTrap = nullRead;

    // 3. The live failure shape, served deliberately: 200 + HTML is what b120 does right now.
    const htmlDir = fs.mkdtempSync(path.join(EV, 'spa-'));
    fs.writeFileSync(path.join(htmlDir, 'build-info.json'), '<!DOCTYPE html><html><body>login</body></html>');
    const s3 = await serve(htmlDir, { contentType: 'text/html' });
    const spaRead = await readBuildInfo(`http://127.0.0.1:${s3.port}`);
    await s3.close();
    fs.rmSync(htmlDir, { recursive: true, force: true });
    check('a 200 carrying HTML is refused as SPA_FALLBACK, which is exactly what the live origin does',
      spaRead.ok === false && spaRead.state === 'SPA_FALLBACK', `state=${spaRead.state}`);

    // 4. Absent artefact.
    const emptyDir = fs.mkdtempSync(path.join(EV, 'empty-'));
    const s4 = await serve(emptyDir);
    const missing = await readBuildInfo(`http://127.0.0.1:${s4.port}`);
    await s4.close();
    fs.rmSync(emptyDir, { recursive: true, force: true });
    check('a 404 is reported as NOT_DEPLOYED, distinct from every other failure',
      missing.ok === false && missing.state === 'NOT_DEPLOYED', `state=${missing.state}`);
  } finally {
    if (saved != null) fs.writeFileSync(artefact, saved); else { try { fs.unlinkSync(artefact); } catch { /* never existed */ } }
    for (const [f, s] of savedProduct) fs.writeFileSync(f, s);

    // Asserted, not hoped: a verifier that leaves a product file modified during quiescence is a hazard,
    // and "I restored it" is the kind of claim this programme requires evidence for.
    const stillDirty = spawnSync('git', ['status', '--porcelain', '--', ...TOUCHED, artefact], { encoding: 'utf8' });
    const dirty = String(stillDirty.stdout || '').trim();
    check('the verifier leaves no product file modified', dirty === '', dirty || 'chart.js, package.json and build-info.json all restored');
  }
} else {
  const live = await readBuildInfo(ORIGIN);
  report.live = live;
  console.log(`origin: ${ORIGIN}`);
  console.log(`state:  ${live.state}`);
  console.log(`sha:    ${live.sourceCommitSha ?? '(none)'}`);
  console.log(`build:  ${live.buildId ?? '(none)'}`);
  if (live.why) console.log(`why:    ${live.why}`);
  check('the third coordinate is served as JSON', live.state !== 'SPA_FALLBACK' && live.state !== 'NOT_DEPLOYED', live.state);
  check('it carries a non-null 40-hex source commit', live.ok === true && /^[a-f0-9]{40}$/.test(String(live.sourceCommitSha)), live.sourceCommitSha ?? 'null');
}

const passed = results.filter((r) => r.pass).length;
report.results = results;
report.passed = passed;
report.total = results.length;
report.verdict = MODE === 'contract'
  ? (passed === results.length
    ? "CONTRACT VERIFIED AGAINST B'S OWN EMITTER. The success path has now executed: real emitted bytes, over HTTP, accepted, SHA recovered intact. All four failure shapes - null SHA, SPA fallback, 404, malformed - are refused with distinct states. What remains unverified at B's cut is exactly one thing: whether the deployed front door serves the file at all."
    : 'CONTRACT NOT VERIFIED — see failures.')
  : (passed === results.length
    ? `LIVE VERIFIED: ${ORIGIN} serves the third coordinate, sourceCommitSha ${report.live?.sourceCommitSha}.`
    : `LIVE NOT SERVED: ${report.live?.state}. ${report.live?.why ?? ''}`);
fs.mkdirSync(EV, { recursive: true });
fs.writeFileSync(path.join(EV, `PASSPORT3-VERIFY-${MODE.toUpperCase()}.json`), JSON.stringify(report, null, 1));
console.log(`\n${passed}/${results.length} — ${report.verdict}`);
// process.exit() here aborts on Windows with a libuv assertion while handles from the local servers and
// the spawned emitter are still tearing down - AFTER every check has passed. Setting exitCode and letting
// the loop drain gives a truthful code, which is the whole point of a verifier.
process.exitCode = passed === results.length ? 0 : 1;
