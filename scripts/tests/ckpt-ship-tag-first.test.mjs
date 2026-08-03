#!/usr/bin/env node
// SEAL-EVIDENCE-01: RUNTIME_TOOL — runs the real scripts/ckpt-ship.sh against a
// real throwaway git repo and remote. It exercises the precondition block only;
// it proves nothing about deploy-test-checkpoint.sh or about any built image.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_TOOL — real bash + real git against a scratch remote; covers ckpt-ship preconditions only.');

/**
 * TAG-FIRST-01 gate for scripts/ckpt-ship.sh.
 *
 * The defect this locks down: on 2026-08-03 the ship script refused with
 * "HEAD has no pushed upstream" while checking out a tag — and a tag checkout is
 * a detached HEAD, which can never have an upstream. The operator built from the
 * tip by hand instead, and b126 ended up described by a tag cut after the image
 * rather than produced by one.
 *
 * So the load-bearing cell is a DETACHED HEAD reaching the build stage. A cell
 * that only proves the happy branch case would have passed before the fix.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SHIP = path.join(REPO, 'scripts/ckpt-ship.sh');
const BUILD_ID = '20260803b999';

let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`); fail += 1;
  }
};

const sh = (cwd, cmd) => execFileSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Build a scratch repo + bare remote, optionally tagged. Returns paths. */
function scaffold({
  annotated = true, pushTag = true, detached = true, tag = true,
  extraTag = null, tagName = `roster-${BUILD_ID}-source`,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ckptship-'));
  const work = path.join(root, 'work');
  const state = path.join(root, 'state');
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(path.join(state, '20260803b998'), { recursive: true });
  // A prior accepted manifest, so rollback discovery is not what refuses.
  fs.writeFileSync(path.join(state, '20260803b998', 'CKPT-1.provenance.json'), '{}');

  // Remotes are addressed relatively and --state-root is read back from the
  // shell itself. The shell here is Linux while the paths are Windows, and a
  // hand-built absolute path is interpreted as an ssh host ("C:" resolves as a
  // hostname) or simply does not exist on the other side of the translation.
  const stateAbs = `${sh(root, 'pwd -P').trim()}/state`;

  sh(root, 'git init --bare -q remote.git');
  sh(work, 'git init -q -b main .');
  sh(work, 'git config user.email t@t && git config user.name t');
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  fs.copyFileSync(SHIP, path.join(work, 'scripts/ckpt-ship.sh'));
  // Stand-in for the builder: reaching it means every precondition passed.
  fs.writeFileSync(path.join(work, 'scripts/deploy-test-checkpoint.sh'),
    '#!/usr/bin/env bash\necho REACHED_BUILDER "$@"\nexit 0\n');
  fs.writeFileSync(path.join(work, 'README'), 'x');
  sh(work, 'git add -A && git commit -q -m init');
  sh(work, 'git remote add origin ../remote.git && git push -q origin main');

  if (tag) {
    if (annotated) sh(work, `git tag -a "${tagName}" -m "src"`);
    else sh(work, `git tag "${tagName}"`);
    if (pushTag) sh(work, `git push -q origin "${tagName}"`);
    if (detached) sh(work, `git checkout -q --detach "${tagName}"`);
  }
  if (extraTag) {
    sh(work, `git tag -a "${extraTag}" -m "src2"`);
    sh(work, `git push -q origin "${extraTag}"`);
  }
  return { root, work, state: stateAbs, tagName };
}

function runShip(work, state, extra = '') {
  const env = 'TMUX=1 TEST_CHECKPOINT_STATE_ROOT=' + JSON.stringify(state);
  try {
    const out = sh(work, `${env} bash scripts/ckpt-ship.sh --checkpoint=CKPT-2 --build-id=${BUILD_ID} --plan ${extra} 2>&1`);
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

console.log('\nTAG-FIRST-01 — ckpt-ship.sh must not fail closed into a hand-build\n');

cell('THE REGRESSION: a DETACHED HEAD at the tag reaches the builder', () => {
  const { work, state } = scaffold({ detached: true });
  const r = runShip(work, state);
  assert.doesNotMatch(r.out, /no pushed upstream/,
    'the upstream precondition fired on a tag checkout again — this is the exact '
    + 'refusal that produced the b126 hand-build');
  assert.match(r.out, /REACHED_BUILDER/, `never reached the builder:\n${r.out}`);
  assert.match(r.out, /detached HEAD/, 'should say plainly that detached is expected here');
});

cell('the tag, not HEAD, is what is handed to the builder', () => {
  const { work, state, tagName } = scaffold({ detached: true });
  const r = runShip(work, state);
  assert.match(r.out, new RegExp(`--source-tag=${tagName}`),
    'the builder must be given the tag; that is the whole provenance claim');
});

cell('RED: an unpushed tag is refused — the builder cannot fetch what is local-only', () => {
  const { work, state } = scaffold({ pushTag: false, detached: true });
  const r = runShip(work, state);
  assert.notEqual(r.code, 0, 'must refuse');
  assert.doesNotMatch(r.out, /REACHED_BUILDER/, 'must not reach the builder');
  assert.match(r.out, /one pushed annotated|not a pushed annotated|exists locally but is not pushed/i,
    `wrong refusal:\n${r.out}`);
});

cell('RED: --source-tag cannot smuggle in an unpushed tag', () => {
  // Previously an explicit --source-tag was taken on trust and handed straight
  // to the builder, so the rule above had a documented way around it.
  const { work, state, tagName } = scaffold({ pushTag: false, detached: true });
  const r = runShip(work, state, `--source-tag=${tagName}`);
  assert.notEqual(r.code, 0, 'an explicit unpushed tag must be refused too');
  assert.doesNotMatch(r.out, /REACHED_BUILDER/);
  assert.match(r.out, /not a pushed annotated tag/i);
});

cell('RED: a lightweight tag is refused — no tagger, no date, nothing to audit', () => {
  const { work, state } = scaffold({ annotated: false, detached: true });
  const r = runShip(work, state);
  assert.notEqual(r.code, 0, 'must refuse a lightweight tag');
  assert.doesNotMatch(r.out, /REACHED_BUILDER/);
});

cell('RED: --source-tag naming a different build is refused', () => {
  const { work, state } = scaffold({ detached: true, tagName: 'roster-20260803b998-source' });
  const r = runShip(work, state, '--source-tag=roster-20260803b998-source');
  assert.notEqual(r.code, 0);
  assert.match(r.out, /does not name build/);
});

cell('on a branch with a missing upstream, it repairs rather than refuses', () => {
  const { work, state } = scaffold({ detached: false });
  sh(work, 'git checkout -q main && git branch --unset-upstream 2>/dev/null || true');
  const r = runShip(work, state);
  assert.match(r.out, /REACHED_BUILDER/, `a missing upstream must not block the ship:\n${r.out}`);
  assert.match(r.out, /set missing upstream|has no upstream/);
});

// ---------------------------------------------------------------------------
// The second fail-closed path. Removing the upstream precondition fixed the
// refusal that fired on 2026-08-03, but the no-tag case still died printing
// `git tag -a` for a human to run -- and telling someone to do the safe thing
// manually, at the moment they are under pressure, is what produced b126.
// ---------------------------------------------------------------------------

cell('THE INVERSION: with no tag at all, --tag-prefix creates it, pushes it, and builds', () => {
  const { work, state } = scaffold({ tag: false });
  const r = runShip(work, state, '--tag-prefix=roster');
  assert.match(r.out, /TAG FIRST: creating annotated tag roster-/, `no creation notice:\n${r.out}`);
  assert.match(r.out, /REACHED_BUILDER/, `did not reach the builder:\n${r.out}`);
  assert.equal(r.code, 0);
});

cell('the tag it creates is ANNOTATED, is on the remote, and peels to the built commit', () => {
  const { root, work, state } = scaffold({ tag: false });
  const head = sh(work, 'git rev-parse HEAD').trim();
  runShip(work, state, '--tag-prefix=roster');
  const name = `roster-${BUILD_ID}-source`;
  // Read the REMOTE, because a tag that exists only locally cannot be fetched.
  const peeled = sh(root, `git -C remote.git rev-parse "${name}^{commit}"`).trim();
  const type = sh(root, `git -C remote.git cat-file -t "${name}"`).trim();
  assert.equal(type, 'tag', 'must be an annotated tag object, not a lightweight ref');
  assert.equal(peeled, head, 'the tag must name the commit that was built');
});

cell('RED: no tag and no --tag-prefix refuses, and the message forbids the hand-build', () => {
  const { work, state } = scaffold({ tag: false });
  const r = runShip(work, state);
  assert.notEqual(r.code, 0, 'must refuse rather than build something untagged');
  assert.match(r.out, /no --tag-prefix was given/);
  // The refusal has to say the hand-build is prohibited, or it invites the exact
  // workaround it exists to prevent.
  assert.match(r.out, /DO NOT build from the tip by hand/);
  assert.doesNotMatch(r.out, /REACHED_BUILDER/);
});

cell('RED: --tag-prefix and --source-tag together are refused, not silently ranked', () => {
  const { work, state, tagName } = scaffold();
  const r = runShip(work, state, `--tag-prefix=roster --source-tag=${tagName}`);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /mutually exclusive/);
});

cell('RED: a malformed --tag-prefix is refused before anything is created or pushed', () => {
  const { root, work, state } = scaffold({ tag: false });
  // Quoted deliberately: an unquoted space would split into two argv entries and
  // the cell would pass on "unknown argument" without ever reaching the validator.
  const r = runShip(work, state, "'--tag-prefix=bad/prefix'");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /--tag-prefix must be alphanumeric/, `wrong refusal:\n${r.out}`);
  const tags = sh(root, 'git -C remote.git tag -l').trim();
  assert.equal(tags, '', `nothing may be pushed on a rejected prefix, found: ${tags}`);
});

cell('RED: two tags for one build id refuses and names both rather than picking', () => {
  const { work, state } = scaffold({ detached: false, extraTag: `other-${BUILD_ID}-source` });
  const r = runShip(work, state);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /found 2:/);
  assert.match(r.out, /other-/);
});

cell('ANTI-VACUITY: removing the creation branch makes the inversion cell fail', () => {
  const { work, state } = scaffold({ tag: false });
  const ship = path.join(work, 'scripts/ckpt-ship.sh');
  const src = fs.readFileSync(ship, 'utf8');
  // Put back the old behaviour: refuse instead of creating the tag.
  const mutant = src.replace(
    /\[\[ -n "\$TAG_PREFIX" \]\] \|\| die \\/,
    '[[ -z "$TAG_PREFIX" ]] || die \\',
  );
  assert.notEqual(mutant, src, 'the mutation must actually apply, or this cell proves nothing');
  fs.writeFileSync(ship, mutant);
  const r = runShip(work, state, '--tag-prefix=roster');
  assert.notEqual(r.code, 0, 'with creation disabled the ship must refuse');
  assert.doesNotMatch(r.out, /TAG FIRST: creating annotated tag/);
});

cell('ANTI-VACUITY: restoring the old precondition makes the detached cell fail', () => {
  // If reinstating the original two lines does not break cell one, then cell one
  // is not measuring the fix and its green means nothing.
  const { work, state } = scaffold({ detached: true });
  const p = path.join(work, 'scripts/ckpt-ship.sh');
  const src = fs.readFileSync(p, 'utf8');
  const anchor = 'HEAD_SHA="$(git rev-parse HEAD)"';
  assert.ok(src.includes(anchor), 'mutation anchor not found — gate is broken, not passing');
  fs.writeFileSync(p, src.replace(anchor,
    `${anchor}\nUPSTREAM_SHA="$(git rev-parse '@{u}' 2>/dev/null)" || die "HEAD has no pushed upstream"`));
  // Commit the mutation, or the clean-tree precondition refuses first and this
  // cell grades the wrong guard — which is how it read green on the first run.
  sh(work, 'git add -A && git commit -q -m mutant');
  const r = runShip(work, state);
  assert.match(r.out, /no pushed upstream/,
    'the old precondition should have refused the tag checkout; if it did not, '
    + 'this gate is not exercising the code path that broke');
  assert.doesNotMatch(r.out, /REACHED_BUILDER/);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

