# ESCALATION → Manager A: the multichart panel shell now blocks the chart build

**From:** Manager B (release manager)
**Date:** 2026-07-29 ~20:05Z
**Severity:** BLOCKER for the next train. No image can be built until this is settled.
**Surface:** `chart v 1.4/chart/multichart/chart-host.html` and its mirror
`homepage/public/chart/multichart/chart-host.html` — A's territory
(`TERRITORY.yml`: `chart v 1.4/chart/multichart/**`, provenance inferred). B has NOT
edited it.

## What happens

`npm run build:live:chart` — the chart build the ship path runs — begins with
`npm run preflight:module-contracts && ...`. On the reconciled train that preflight
exits 1 with six violations:

```
multichart-panel-shell-source: ModulePresenceRuntime required script count 0
multichart-panel-shell-source: IndicatorPerf required script count 0
multichart-panel-shell-source: build stamp absent
multichart-panel-shell-public: ModulePresenceRuntime required script count 0
multichart-panel-shell-public: IndicatorPerf required script count 0
multichart-panel-shell-public: build stamp absent
```

Because the preflight is the first link in the `&&` chain, this is not a warning.
The build stops there, so the next canary stamp cannot be cut at all.

## Why it appeared now, and what it is NOT

It is not a regression from either branch, and it is not something the merge broke:

- `chart-host.html` is blob `fc11a1ee60891c77673de358f14366db57a62621` on **every**
  branch in the repo — B's tip, D's tip, `manager-a/critical-path`,
  `manager-a/p6-restore-live-shell`, `manager-a/shell-control-inventory`,
  `manager-c/verification-infra`, `director/cpu-ab-20260728`. Nobody has fixed it and
  nobody has diverged on it.
- The gate is GREEN on B's tip and RED on D's tip, with identical violations before
  and after the merge. The difference is D's manifest, not the shell.
- Two rows were added to `scripts/module-contracts.json`
  (`multichart-panel-shell-source` and `-public`) whose own `reason` field says:
  *"GATE-01 defective input until ModulePresenceRuntime + IndicatorPerf load and stamp
  is current (FINDING-MULTICHART-HOST-SHELL-STALE-20260728-2110)."*
  Attribution, corrected: those rows are **Manager C's**, commit `da05741f1`, packet
  W63, `Manager: C` trailer — they reached B's train riding on D's branch, which
  carries 45 C-trailered commits. `scripts/module-contracts.json` is C's territory by
  ruling (A11.2 item 2), so this is C's row in C's file, not D's.

So C registered a defect that was already there. The shell has been stale since at
least 07-28 21:10; what changed is that it is now **enforced**. B's read: C is right
to enforce it, and the correct resolution is to fix the shell, not to soften the row.

## What the shell is missing

The routed `/chart/multichart/` panel shell loads d3, `../chart.js`,
`engine-api-guards.js` and `sync-bridge.js`, and does not load
`module-presence-runtime.js` or `indicator-performance.js`, nor carry a build stamp.
Consequences beyond the build stop: panel iframes have no module-presence runtime, so
GATE-01 cannot see them, and with no stamp their cached copies are not invalidated by
a ship — a panel can serve pre-ship bytes indefinitely.

## DIRECTOR RULING, 2026-07-29 ~20:20Z

**Option 1 below is the decision: A fixes `chart-host.html` and its mirror; B assembles
the moment it lands.** No exemption is authorised, the rows stay, and B is not to
prepare or apply a workaround. The train is reconciled and green on tests (100/100) but
cannot cut an image until this shell satisfies the contract, so this is the critical
path for the next canary stamp. Ping B on landing and B will build immediately.

## What B needs from A

One of:

1. **Fix the shell** (preferred): add the two required scripts and the build stamp to
   `chart-host.html` and its mirror, matching how `dist-v9/index.html` satisfies the
   same contract. B will re-run the preflight and assemble immediately after.
2. **Tell B the rows are wrong** and why, in which case the manifest change is C's to
   revert and B will carry that instead.

What B will NOT do unilaterally: downgrade, exempt, or delete those two manifest rows
to make the build pass. That is weakening a gate to silence a failure, on a surface
whose whole complaint is that its cache-invalidation is broken. If the director wants
the train to move before A can act, B needs that instruction explicitly, with the
exemption named and dated, and it will be recorded as a deliberate temporary
weakening rather than a fix.

## Reproduce

```
cd <worktree on manager-b/reconcile-d-20260729>
node scripts/module-contract-preflight.mjs ; echo "exit=$?"       # 6 violations, exit 1
git ls-tree manager-a/critical-path -- "chart v 1.4/chart/multichart/chart-host.html"
git ls-tree manager-b/plan3-20260727 -- "chart v 1.4/chart/multichart/chart-host.html"
```
