# Canary disk: retention cap set, and where the pressure actually is

**Date:** 2026-07-29 ~20:05Z
**Host:** 31.97.192.82 (SSH on 443)
**Owner:** Manager B

## The premise needed correcting first

The instruction was to cap retention because "disk is 81% with twelve 320MB tars, and
those tars are the rollback path". The tars are the rollback path and the cap was
worth setting, but they are not what is filling the disk. Measured:

| consumer | size | share of 193G |
|---|---|---|
| `talaria_chart_uploads` docker volume | **90 G** | 47% |
| `/opt/talaria-tooling-*` (28 dirs, one per tooling rev) | ~21 G | 11% |
| docker images (of which ~19 G is the 12 pinned canary pairs) | 28.8 G | 15% |
| docker build cache (10.55 G reclaimable) | 11.4 G | 6% |
| `talaria_questdb_data` | 5.2 G | 3% |
| **`/root/talaria-restore` incl. all twelve tars** | **3.7 G** | **1.9%** |

Twelve × 320 MB is 3.86 GB. Deleting every tar on the box would move 81% to 79%.

The per-build cost is also mostly not the tar. Each retained build is:

```
talaria-trading-chart:canary-<id>   1.46 GB
talaria-homepage:canary-<id>        0.159 GB
images/canary-<id>.tar.gz           0.32 GB
                                    ~1.94 GB per build, +1 per ship
```

So a policy that capped tars alone would leave 84% of the cost behind in the image
store. The cap retires a build as a unit — both images and the tar together.

## The cap

`canary-image-retention.sh`, installed at `/root/talaria-restore/`.

Protected, and never deleted regardless of the cap:

1. the build in `LIVE-PIN.txt` — what the PO is measuring;
2. any build whose image is used by **any** container, running or stopped. This is what
   stops the policy from pulling C's grade lane out from under a grading run; `b85` was
   protected by exactly this rule on the first pass;
3. any build id in `KEEP-BUILDS.txt`;
4. the newest `KEEP` builds (default 8).

If applying the policy would leave fewer than `FLOOR` (default 4) retained builds it
refuses and changes nothing. A retention policy that can empty the rollback store is a
worse failure than a full disk. Dry run is the default; `--apply` deletes; every
decision and deletion is logged to `RETENTION.log`.

`KEEP-BUILDS.txt` currently protects `20260729b90` — the 14:46 live floor the PO
measured for over two hours, and the build whose FIX1 kill-switch polarity the TOP
re-review turned on. It is the only superseded build with PO qualitative data attached,
so it stays until C has graded b99 and the comparison is no longer wanted.

Wired into `canary-checkpoint-one-action.sh` immediately after `LIVE-PIN.txt` is
written, so the cap is enforced at the one moment the store grows, and the build that
just shipped is protected as `live-pin` on its first pass. Non-fatal by construction: a
retention failure must never fail a ship that already succeeded.

### First application

```
2026-07-29T20:02:42Z RETIRED 20260726b75
2026-07-29T20:02:42Z RETIRED 20260729b86
2026-07-29T20:02:42Z RETIRED 20260729b91
2026-07-29T20:02:42Z APPLIED retired=20260726b75,20260729b86,20260729b91 retained=10
```

81% → 79%, 38 G → 41 G free. `b75` was an orphan: a 07-26 trading-chart image with no
homepage pair and no tar. `b86` and `b91` were burst builds superseded inside the same
hour. Second run logged `NOOP retained=10`, so the policy is idempotent.

Steady state at cap 8 is ~15.5 G of images + tars, versus unbounded growth of 1.94 G
per ship before today.

## Hazard worth writing down

`docker system prune -af` would reclaim ~28 G and destroy **every pinned canary image**
along with it, because none of them are attached to a running container except the live
pin and whatever the grade lane holds. The tars would still allow a reload, but C's
grading capability would go down without warning and the rollback path would slow from
seconds to minutes. Do not use blanket prunes on this host. `docker builder prune -af`
is the safe one — cache only, no images, ~10.5 G — but it makes the next ship rebuild
from scratch, so it is not something to run inside an active shipping window.

## Escalations, not B's to act on

1. **`talaria_chart_uploads` at 90 G is the actual capacity risk.** It is user upload
   data mounted into `trading-chart`, it is 47% of the disk, and nothing B does to
   images or tars changes its trajectory. Whoever owns upload retention needs a policy;
   at current total usage the box has ~41 G of headroom and this volume is the only
   thing large enough to consume it.
2. **`/opt/talaria-tooling-*` accumulates one directory per tooling rev, 28 of them for
   ~21 G**, with `.seal` files beside them and one `.FAILED-ACCEPTANCE.txt`. There is no
   cleanup. Three of the newest are 1.6–1.7 G each. This wants the same treatment as
   the image store: keep the sealed live rev plus N, drop the rest. B has not touched it
   because the sealing convention belongs to whoever built it.
