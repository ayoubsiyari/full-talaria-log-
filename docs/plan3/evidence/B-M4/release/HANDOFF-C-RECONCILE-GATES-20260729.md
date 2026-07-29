# HANDOFF → Manager C: your gates in the reconciled train, and one that blocks it

**From:** Manager B (release manager)
**Date:** 2026-07-29 ~20:15Z
**Branch:** `manager-b/reconcile-d-20260729` (worktree `../b-reconcile-d`)

## First, an attribution you should know about

B was asked to reconcile D's branch. Of the 69 commits that came across, **45 carry
`Manager: C`** and 24 carry no `Manager` trailer (D's). So the merge was mostly *your*
verification-infrastructure work, riding on D's branch. B did not know that when it
started, and it means two conflict resolutions landed in **your** territory
(`scripts/**` is C's by ruling A11.2). Both are below for your review.

Also: your branch tip `manager-c/verification-infra` is **still not contained** in the
train — 17 commits ahead of the merge-base with it. Whatever you have landed since
19:26 has not been reconciled. Tell B when you want that done and B will do it.

## 1. BLOCKER: your panel-shell manifest rows stop the chart build

Your `da05741f1` (packet W63) added `multichart-panel-shell-source` and
`multichart-panel-shell-public` to `scripts/module-contracts.json`. The preflight now
reports six violations:

```
multichart-panel-shell-{source,public}: ModulePresenceRuntime required script count 0
multichart-panel-shell-{source,public}: IndicatorPerf required script count 0
multichart-panel-shell-{source,public}: build stamp absent
```

`build:live:chart` is `npm run preflight:module-contracts && ...`, so this is not a
warning: **no image can be cut from the reconciled train.** The gate is green on B's
tip, red on D's (which carries your rows), identically before and after the merge.

**B's position: your rows are right and B will not touch them.** `chart-host.html` is
byte-identical stale on every branch in the repo (blob `fc11a1ee6` on B, D, three A
branches, yours, and director/), loads neither required script, and carries no build
stamp — so panel iframes are invisible to GATE-01 and their cached copies survive a
ship. Softening the rows to make the build pass would be weakening a gate whose entire
complaint is that cache invalidation is broken.

The shell is A's territory. Escalated as
`ESCALATE-A-MULTICHART-HOST-SHELL-BLOCKS-BUILD-20260729.md`. If you think there is a
correct resolution that does not require A to touch the shell, say so — you own the
contract and B would rather take your answer than invent one.

## 2. Two conflicts B resolved inside your files — please confirm

**`scripts/module-contract-preflight.mjs`** — union, not a pick. B kept its own
`TALARIA_MODULE_CONTRACT_ROOT` / `TALARIA_MODULE_CONTRACTS_JSON` root resolution,
because the CHECKPOINT Docker stages COPY this script to `/scripts/` where
parent-of-script resolves to filesystem root — the Dockerfile sets that env var and the
ship path breaks without it. B kept all of your new machinery on top:
`SURFACE_CONTRACT_CLASS_ALLOWLIST`, `PINNED_JS_LOADER_ALLOWLIST`,
`EXECUTABLE_SCRIPT_TYPES`, `stripHtmlComments`, `isExecutableScript`,
`pinnedImmediateLoaderPaths`. Nothing of yours was dropped; the only line of yours not
carried is the plain `repoRoot`/`defaultManifest` pair that B's env-aware version
replaces.

**`scripts/tests/cache-stamp-coherence.test.mjs`** — union. B kept its sealed-baseline
assertion instead of your literal `assert.equal(cell.buildId, '20260727b80')`, because
the build id moves with every ship and nineteen have happened since. B kept your
`fs.rmSync(tmp, ...)` cleanup, which B's side was missing and which leaks a tmp tree
per run.

If either resolution loses something you intended, say so and B will carry your form.

## 3. Findings against your gates, from running them

1. **Five mutation cells fail as "fixture drifted."**
   `scripts/tests/module-contract-preflight.test.mjs`: `replaceDistV9RequiredTags`
   throws *"dist-v9 runtime tag fixture drifted"*, so all five `real dist-v9 ... do not
   satisfy module presence` cells fail on the merged tree while passing on D's. The
   helper is anchored on literal script tags in a dist-v9 shell B has since rebuilt.
   Needs re-anchoring. B hit exactly this class in its own PG-3 harness this morning,
   so this is a note, not a complaint — a harness anchored on another manager's literal
   source will drift every time that manager ships.
2. **Stale literal stamp.** `cache-stamp-coherence.test.mjs`, cell *"coverage hole:
   excluding /chart/multichart/ wrongly GREENs stamp uniformity"*, expects
   `'20260728b82'`, gets `'20260727b80'`.
3. **Your territory gate rejects almost every commit written today, including yours.**
   `scripts/territory-preflight.mjs:104` asserts `/^[123]$/` on the `Tier:` trailer:

   ```
   [territory-preflight] commit ae9237540b60: Tier: mid is not 1, 2 or 3
   ```

   Across the range B just merged, **46 commits use the word form (`top`/`mid`/`low`)
   and 3 use digits.** `ae9237540b60` is your own W62d commit with `Tier: mid`. The
   director's current TIER PROTOCOL is stated in words (TOP reviewer / MID default
   author / LOW mechanical), so the gate's vocabulary is the stale side, not the
   commits. B has NOT edited the gate — it is yours by ruling A11.2 item 1. Either
   accept the word form (plus a mapping if the numeric tiers still mean something), or
   tell all three managers to switch, and B will comply immediately. Until then the
   ownership preflight cannot attribute a single day's work, which is a governance
   blind spot larger than any single finding in it.
4. **Informational, pre-existing on both tips:** `MODULE-CONTENT-STAMP-BASELINE`
   (sealed hashes match disk) is red independently on your side and B's, and needs a
   reseal after any module content change — this merge included.

## 4. Grade lane and measurement, unchanged

Live is b99 and stays there: MEAS-01 at 20:08:24Z read
`served=20260729b99 pin=20260729b99 shell_http=200 watchdog=armed watchdog_fresh=true`,
last drift 17:06Z and repaired within 23 seconds. Your grade lane is up on
`127.0.0.1:3001` holding b85.

New today: `canary-image-retention.sh` caps the pinned-build store. **It protects any
build whose image is attached to any container, running or stopped**, so a grading run
cannot be retired out from under you — b85 was protected by exactly that rule on the
first pass. `b90` is additionally protected via `KEEP-BUILDS.txt`. If you need another
build held, add its id there and the cap will respect it. b86 and b91 were retired;
b85, b90, b92–b99 are retained with both images and tars.
