# TRAIN READINESS — A's teardown branch is landable now; routing is gated on the 36-site ruling

**2026-07-31 19:45 · Manager B · queue item 4, prepared rather than waited on**

Dry-run only. Nothing shipped, nothing deployed, no host touched — this is a git verification so the
train can be cut on one word instead of starting from discovery.

## Landable now: `manager-a/order-manager-single-realm-20260731` — 4 commits, applies clean

| SHA | subject |
|---|---|
| `b253e46a8` | SR-01: scope order-manager DOM lookups to the owning instance, **add `destroy()`** |
| `eb5610898` | test(SR-01): mutant runner for GATE-01, with stale-needle self-test |
| `afe150c02` | SR-01: scope `document.querySelector/All` to the instance root as well |
| `1aed3a32b` | tools(SR-01): commit the codemod + AST-identity verifier used for this pass |

**Cherry-picked all four onto my tip in a scratch branch: no conflicts.** 11 files, +4,239 / −2,318.
Scratch branch deleted, my tree left clean and verified clean afterwards.

**This is the item D's release stop is waiting on.** D's posture is `destroyStop: true` — "release waits
on `Chart.destroy()` and product non-stub traps" — and `b253e46a8` is what adds `destroy()`. So cutting
this train converts D's stop into a testable condition rather than a blocker.

**One thing to handle at cut time, flagged now.** The branch touches **two copies** of the same module:

```
chart v 1.4/chart/modules/order-manager.js
homepage/public/chart/modules/order-manager.js
```

A build that updates one and not the other ships a split brain, and the marker would be present in
whichever copy someone happens to grep. **At cut time I will verify the change on the wire from the
container rather than from the repo**, which is the standing rule, and confirm both copies carry it.

## Not landable yet: `manager-a/focus-routing-20260731`

| SHA | subject | state |
|---|---|---|
| `e1504033c` | SR-02: classify `window.chart` on the booted path, fix panel resize propagation | code, ready |
| `88f87af40` | A/SR-02: publish the 36 ambiguous routing sites for one-pass ruling | **gating** |
| `350707826` | A/MONSTER-2: plateau is pixel-bounded; the cache has a second branch | docs, answered separately |

**Held because the ruling names the 36 routing decisions as the gating item on routing**, and A escalated
them as yours or the PO's rather than the lane's. Shipping `e1504033c` before those are decided means
shipping a routing classification that the ruling may change. If you would rather have the resize
propagation fix early, it can be split from the classification — say so and I will check whether they
separate cleanly.

`350707826` is A's plateau report; my answer to it is
`docs/plan3/B-ANSWER-TO-A-PLOT-WIDTH-1478-CONFIRMS-THE-PIXEL-BOUND-20260731-1940.md`. It is
documentation and carries no product risk, so it can ride any train.

## Not a train item: `manager-a/single-realm-spike-20260731`

Five commits, all under
`chart v 1.4/chart/multichart-prod/harness/spike-single-realm/` — harness, census tooling and the spike
report. No product code. Nothing to ship.

## What I need before cutting

1. Your word that the teardown branch goes, given the routing half is held.
2. **Host availability.** C's ten-hour soak owns the test host until ~03:43. A build and deploy is not a
   heavy measurement, but it restarts the container, which would end C's arm. So this cuts either after
   the soak or with C's explicit agreement to take the interruption.

That second point is the eighth `FLOW-01` condition applied to myself: state the shared capacity a run
needs and confirm it is free. A deploy needs the container, and right now C has it.
