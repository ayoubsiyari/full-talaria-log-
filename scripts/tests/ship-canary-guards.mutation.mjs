/**
 * ANTI-VACUITY for ship-canary-guards.test.mjs.
 *
 * A green suite proves the tests ran, not that they would notice anything. This removes one guard
 * from `scripts/ship-canary.sh` at a time and requires the suite to turn RED for each. A guard whose
 * removal leaves the suite green is being described, not tested.
 *
 * This is not decoration. On its first run two of six mutations were MISSED:
 *
 *   - `PROVENANCE_WRONG build-id` deleted, suite still green — the assertion matched the bare token
 *     `/PROVENANCE_WRONG/`, and the revision message still contained it.
 *   - the default freeze-check branch replaced by `true`, suite still green — the assertion matched
 *     `/deploy-freeze-guard\.sh check/`, and the override branch still mentioned it. So a ship with
 *     no override could have stopped consulting the freeze and nothing would have complained. That
 *     is the same defect b126 shipped through.
 *
 * Both assertions were narrowed to name the specific comparison. Re-run this after ANY edit to
 * ship-canary.sh or its suite:  npm run test:ship-canary-mutation
 *
 * INERT is also a failure. It means the mutation's own pattern no longer matches the script, so the
 * mutation tested nothing — a silently retired check, which is the thing this file exists to catch.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHIP = path.join(REPO, 'scripts', 'ship-canary.sh');
const SUITE = 'scripts/tests/ship-canary-guards.test.mjs';

/** [label, pattern to remove, replacement that keeps the script syntactically valid] */
const MUTATIONS = [
  ['freeze check removed from the default path',
    /bash \/opt\/talaria\/deploy\/deploy-freeze-guard\.sh check \|\| fail "FREEZE_ACTIVE"/,
    'true'],
  ['boundary dropped from the .iframe grep',
    /grep -cE '\\\.iframe\\b' \/tmp\/w-bun\.js/,
    "grep -cE '\\.iframe' /tmp/w-bun.js"],
  ['build target exported -> unset (the b126 tag clobber)',
    /export TRADING_CHART_IMAGE="talaria-trading-chart:\$TAG"/,
    'unset TRADING_CHART_IMAGE'],
  ['post-build build-id assertion removed',
    /\[ "\$L" = "\$BUILD_ID" \]/,
    'true'],
  ['post-build revision assertion removed',
    /\[ "\$R" = "\$SHA" \]/,
    'true'],
  ['DEPLOY-IN-PROGRESS traps removed',
    /trap 'rm -f \/root\/talaria-restore\/DEPLOY-IN-PROGRESS' EXIT/g,
    ': # no trap'],
  ['tag-collision refusal removed',
    /fail "TAG_EXISTS \$r:\$TAG — pick a new build id, or delete that tag deliberately"/,
    'echo reusing'],
];

const original = readFileSync(SHIP, 'utf8');
let ok = true;

try {
  for (const [label, pattern, replacement] of MUTATIONS) {
    const mutated = original.replace(pattern, replacement);
    if (mutated === original) {
      console.log(`  INERT  ${label} — pattern no longer matches; this mutation tested nothing`);
      ok = false;
      continue;
    }
    writeFileSync(SHIP, mutated);
    const r = spawnSync('node', ['--test', '--test-concurrency=1', SUITE],
      { cwd: REPO, encoding: 'utf8', timeout: 300_000 });
    const red = r.status !== 0;
    console.log(`  ${red ? 'CAUGHT' : 'MISSED'} ${label}`);
    if (!red) ok = false;
  }
} finally {
  // Restore unconditionally: an aborted mutation run must not leave a sabotaged ship script on disk.
  writeFileSync(SHIP, original);
}

const restored = readFileSync(SHIP, 'utf8') === original;
console.log(restored ? '\nship-canary.sh restored byte-for-byte' : '\nWARNING: ship-canary.sh NOT restored');
console.log(ok && restored
  ? 'ANTI_VACUITY_OK — every guard removal turns the suite red'
  : 'ANTI_VACUITY_FAIL — a guard is described but not tested, or the script was not restored');
process.exitCode = ok && restored ? 0 : 1;
