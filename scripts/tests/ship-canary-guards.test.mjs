/**
 * SHIP-CANARY-GUARDS — pin the four ways the 2026-08-04 b127 ship went wrong.
 *
 * HONEST SCOPE, STATED FIRST
 * This file mixes two kinds of test and the difference matters more than the count:
 *
 *   BEHAVIOURAL   the script is executed and its refusal observed. Covers argument validation and
 *                 the grep boundary that wrongly refused a correct build.
 *   SOURCE_LEVEL  the script's text is asserted, because the check it encodes only runs against a
 *                 live VPS over SSH and there is no host in a unit test.
 *
 * A SOURCE_LEVEL assertion proves the guard is written, not that it fires. Saying so here is the
 * whole point: today's root cause was `.scratch/pkg1-served-bytes-check.mjs` claiming to read
 * "the bytes nginx serves" while reading local disk, and a rail fix that lived in a component no
 * file imported. An instrument that overstates its subject is worse than a missing one, because
 * people stop looking.
 *
 * Negative assertions run against the script with full-line comments STRIPPED. The first draft of
 * this file failed because it matched the header's own description of the defect — a test that
 * cannot tell an explanation from an instruction would force the explanation to be deleted, which
 * is the wrong direction.
 *
 * THE FOUR DEFECTS PINNED
 *   1. `unset TRADING_CHART_IMAGE` + tag from `:latest` — .env pins those names to the PREVIOUS
 *      build and compose reads .env, so the build wrote b127 bytes into b126's tag.
 *   2. The deploy freeze was never consulted; b126 shipped through an armed freeze unrecorded.
 *   3. An aborted run left DEPLOY-IN-PROGRESS set on the host.
 *   4. `grep -c '\.iframe'` matched the legitimate `.iframes` collection and refused a good build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SHIP = path.join(REPO, 'scripts', 'ship-canary.sh');
const src = readFileSync(SHIP, 'utf8');

/** The script minus full-line comments, so "must not contain" cannot trip on prose. */
const code = src
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

/**
 * Resolve a usable bash and learn whether it needs /mnt/c paths. On Windows `bash` is normally the
 * WSL shim, which cannot open `C:\...`. A missing bash SKIPS loudly; it never silently passes.
 */
function probeBash() {
  for (const cmd of ['bash', 'C:\\Program Files\\Git\\bin\\bash.exe']) {
    const r = spawnSync(cmd, ['-c', 'if [ -d /mnt/c ]; then echo wsl; else echo native; fi'],
      { encoding: 'utf8', timeout: 20_000 });
    if (r.status === 0 && r.stdout) return { cmd, wsl: r.stdout.trim() === 'wsl' };
  }
  return null;
}
const BASH = probeBash();
const skip = BASH ? false : 'no usable bash on this machine';

/** Windows path -> the form this bash can actually open. */
function bashPath(p) {
  if (!BASH?.wsl) return p.replace(/\\/g, '/');
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p.replace(/\\/g, '/');
}

function runShip(args) {
  const r = spawnSync(BASH.cmd, [bashPath(SHIP), ...args],
    { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Count matches of a grep pattern against content fed on stdin, so no file paths are involved. */
function grepCount(pattern, content) {
  const r = spawnSync(BASH.cmd, ['-c', `grep -cE '${pattern}' || true`],
    { input: content, encoding: 'utf8', timeout: 20_000 });
  return Number((r.stdout || '0').trim());
}

test('ship-canary.sh exists and is the single parameterised ship path', () => {
  assert.ok(existsSync(SHIP), 'scripts/ship-canary.sh is missing');
  assert.match(code, /--build-id=/, 'takes a build id rather than being copied per build');
  assert.match(code, /--source=/, 'takes a source ref rather than hardcoding a commit');
});

test('BEHAVIOURAL: refuses a malformed build id', { skip }, () => {
  const r = runShip(['--build-id=nope', '--source=HEAD']);
  assert.notEqual(r.code, 0, 'a malformed build id must not be accepted');
  assert.match(r.out, /invalid or missing --build-id/);
});

test('BEHAVIOURAL: refuses a missing source ref', { skip }, () => {
  const r = runShip(['--build-id=20260804b127']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /missing --source/);
});

test('BEHAVIOURAL: refuses when the source ref cannot be verified', { skip }, () => {
  const r = runShip(['--build-id=20260804b127', '--source=definitely-not-a-ref-9f3a']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /does not resolve to a commit/);
});

test('BEHAVIOURAL: --force and --provenance-guard-off are refused by name', { skip }, () => {
  for (const flag of ['--force', '--provenance-guard-off']) {
    const r = runShip(['--build-id=20260804b127', '--source=HEAD', flag]);
    assert.notEqual(r.code, 0, `${flag} must be refused`);
    assert.match(r.out, /prohibited/);
  }
});

/**
 * Defect 4, and the only host-side assertion reproducible without a host. The bundle legitimately
 * contains an `.iframes` array used to suppress pointer events during panel drag; the defect was a
 * reader of `entry.iframe`, which after minification appears as `<var>.frame`.
 */
test('BEHAVIOURAL: the .iframe assertion tells .iframes from a real .iframe reader', { skip }, () => {
  const fixed = 'n.iframes.push({el:i});o.frame&&o.frame.contentWindow.postMessage(1);\n';
  const regressed = 'n.iframes.push({el:i});o.iframe&&o.iframe.contentWindow.postMessage(1);\n';

  assert.equal(grepCount('\\.iframe\\b', fixed), 0,
    'a bundle carrying only .iframes must pass — the broad form refused a correct b127 build');
  assert.equal(grepCount('\\.iframe\\b', regressed), 1,
    'a bundle that really reads .iframe must still be caught, or the guard is now decorative');

  // Prove the boundary-less form is genuinely unsafe, so nobody "simplifies" it back.
  assert.equal(grepCount('\\.iframe', fixed), 1,
    'without \\b the pattern matches .iframes — the boundary is load-bearing, not cosmetic');
});

/**
 * The test above proves the pattern behaves; it says nothing about which pattern the script uses.
 * Without this, the boundary could be dropped from ship-canary.sh and every test would stay green
 * — a gap of exactly the kind this file is supposed to be about.
 */
test('SOURCE_LEVEL defect 4: every .iframe grep in the script carries the boundary', () => {
  const greps = code.match(/grep[^\n]*\\\.iframe[^\n]*/g) || [];
  assert.ok(greps.length >= 1, 'the bundle regression check is missing entirely');
  for (const g of greps) {
    assert.match(g, /\\\.iframe\\b/,
      `a boundary-less .iframe grep would refuse correct builds: ${g.trim()}`);
  }
});

test('SOURCE_LEVEL defect 1: the build target is exported and asserted, never unset', () => {
  assert.doesNotMatch(code, /unset\s+TRADING_CHART_IMAGE/,
    "unsetting leaves .env's pin to the PREVIOUS build in force — this is the b126-tag clobber");
  assert.match(code, /export TRADING_CHART_IMAGE="talaria-trading-chart:\$TAG"/);
  assert.match(code, /export HOMEPAGE_IMAGE="talaria-homepage:\$TAG"/);
  assert.match(code, /BUILD_TARGET_WRONG/,
    'compose config must be asserted to resolve to the target tag BEFORE building');
  assert.doesNotMatch(code, /docker tag talaria-trading-chart:latest/,
    ':latest no longer exists; tagging from it is what killed the b127 attempt');
});

test('SOURCE_LEVEL defect 1b: provenance is asserted after the build', () => {
  assert.match(code, /io\.talaria\.checkpoint\.build-id/,
    'the built image must be checked to carry the build id we asked for');
  assert.match(code, /org\.opencontainers\.image\.revision/,
    'and the source commit, so a stale layer cache cannot ship as a new build');
  // Both comparisons, named separately. A bare /PROVENANCE_WRONG/ match passed while the build-id
  // comparison had been deleted, because the revision one still mentioned the token.
  assert.match(code, /\[ "\$L" = "\$BUILD_ID" \]/,
    'the build-id label must actually be COMPARED, not merely read');
  assert.match(code, /\[ "\$R" = "\$SHA" \]/,
    'and the revision label likewise');
  assert.match(code, /PROVENANCE_WRONG build-id/);
  assert.match(code, /PROVENANCE_WRONG revision/);
});

test('SOURCE_LEVEL defect 2: the deploy freeze is consulted before the build', () => {
  // The un-overridden path specifically. A bare /deploy-freeze-guard\.sh check/ match stayed green
  // when that branch was replaced with `true`, because the override branch still mentioned it —
  // so the default, no-override ship could have stopped checking with the suite none the wiser.
  assert.match(code, /deploy-freeze-guard\.sh check \|\| fail "FREEZE_ACTIVE"/,
    'the default path must check the freeze AND refuse on it; b126 shipped through an armed freeze');
  assert.match(code, /TALARIA_FREEZE_OVERRIDE/,
    'override must exist, because an unbreakable freeze gets bypassed by not calling the script');
  assert.doesNotMatch(code, /--ignore-freeze|--no-freeze/,
    'but not as a bare flag on the ship command, which is how freezes stop meaning anything');

  const freezeAt = code.indexOf('deploy-freeze-guard.sh check');
  const buildAt = code.indexOf('docker compose build');
  assert.ok(freezeAt > 0, 'freeze check not found in executable lines');
  assert.ok(buildAt > 0, 'build not found in executable lines');
  assert.ok(freezeAt < buildAt,
    'the freeze must be checked before the build, not after minutes of compute');
});

test('SOURCE_LEVEL defect 2b: a claimed host is respected', () => {
  assert.match(code, /MEASUREMENT-IN-PROGRESS/);
  assert.match(code, /MEASUREMENT_ACTIVE/,
    "deploying into a soak voids it; the interlock is the soak's only protection");
});

test('SOURCE_LEVEL defect 3: DEPLOY-IN-PROGRESS is always cleared', () => {
  const trap = /trap 'rm -f \/root\/talaria-restore\/DEPLOY-IN-PROGRESS' EXIT/g;
  assert.match(code, trap,
    "b127's first attempt aborted and left the flag set, so the host claimed a deploy that was not running");
  const traps = code.match(trap) || [];
  assert.ok(traps.length >= 2,
    `every remote block that can abort after the flag is set needs the trap (found ${traps.length})`);
});

test('SOURCE_LEVEL: the rollback target is derived from the running image, not LIVE-PIN', () => {
  assert.match(src, /never from LIVE-PIN/,
    'LIVE-PIN read 20260731b120 while b126 was live; trusting it names the wrong rollback');
  assert.match(code, /docker inspect -f '\{\{\.Config\.Image\}\}' talaria-homepage-1/);
});

test('SOURCE_LEVEL: an existing tag is refused rather than reused or overwritten', () => {
  assert.match(code, /TAG_EXISTS/,
    'two different sets of bytes answering to one build id is exactly the b126/b127 confusion');
});

test('SOURCE_LEVEL: the source tar is not staged in /tmp', () => {
  assert.match(src, /WSL reclaims \/tmp/,
    'the reason must stay written down or someone will "tidy" it back into /tmp');
  assert.doesNotMatch(code, /^TAR="\/tmp/m);
});

test('SOURCE_LEVEL: the ship ends by pointing at the outside-the-host check', () => {
  assert.match(code, /gate:served-build-agreement/,
    "every in-host check shares the host's blind spots; the PO is served from outside");
});

test('SOURCE_LEVEL: the production/grade stack is observed, never targeted', () => {
  assert.match(code, /talaria-grade-homepage/);
  assert.doesNotMatch(code, /talaria-log\.com/,
    'no deploy path may reference the production domain');
});
