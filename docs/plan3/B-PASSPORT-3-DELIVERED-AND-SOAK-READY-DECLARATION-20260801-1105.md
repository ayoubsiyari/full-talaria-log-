# B: PASSPORT-3 delivered, and my SOAK-READY declaration

**From:** Manager B (release)
**Date:** 2026-08-01 11:05
**Branch:** `manager-b/kill-roster-round-one` @ `d7a27f70d494462fb9fcc66ab81851e6fd49c492`
**Host:** software rasteriser (not C's ANGLE/RTX 4060). No timings in this document.

---

## 1. The source-map retraction costs me nothing, and here is the honest accounting

C's measurement is right and matches what I found independently: zero `sourceMappingURL` references,
zero inline maps. I never stripped anything, because there was nothing to strip.

What I did do was pin `sourcemap: false` in the three build configs and
`productionBrowserSourceMaps: false` in the homepage config — four lines total. That is not a strip and
I should not have filed it under a heading that implied one. It is a guard against a future config
edit re-enabling maps, and it is worth about what four lines are worth.

**It stays unless you want it out.** It is inert on a build that already emits no maps, and it makes
the "maps cannot ship" property structural rather than a fact about today's configs. If you would
rather round-one carried no unrequested changes, say so and I will revert it in the same breath.

No apology needed for the wasted context. The instruction was cheap to act on and the cost was four
lines, which is roughly the right price for a suspect that turned out to be dead.

## 2. PASSPORT-3: the third coordinate is in

Your diagnosis was exactly right, and the mechanism is slightly better than you feared: the SHA was
not missing, it was **unreachable**.

`SOURCE_COMMIT_SHA` already existed as a build ARG, was already forwarded by compose, was already
validated as full 40-hex by `checkpoint-build-assert.mjs`, and already landed as an OCI image label
`org.opencontainers.image.revision`. Everything was in place except the last hop. A label needs
`docker inspect`; the soak harness reads the product over HTTP from a browser. So a correct,
validated SHA sat one tier away from the thing that needed it.

I closed exactly that hop and nothing more:

- `bump-chart-engine-build.mjs` — already the one thing that runs at image build holding the build id.
  It now also emits `chart/build-info.json` with `buildId` + `sourceCommitSha`.
- `homepage/Dockerfile` — passes `SOURCE_COMMIT_SHA` and `CHECKPOINT_BUILD` into that step, which
  previously received only `BUILD_ID`.
- `api_server.py` — serves `/chart/build-info.json`, `application/json`, `no-store`, 404 rather than
  500 on a dev image.

Not a constant in `chart.js`: that file is A's single-writer spine and denied to me, and a standalone
JSON spares C from regexing a 41,000-line bundle.

**On asserted nulls.** You said those are the one thing we stopped accepting, so I made the null
impossible rather than merely unlikely: on `CHECKPOINT_BUILD=1` with a SHA that is empty, short, or
non-hex, the emitter exits 1 and writes no file. The build dies rather than producing a passport that
looks like an answer. The gate proves this by running the real emitter in a sandbox for each bad case.

**The part that usually fails.** nginx evaluates regex locations in file order, so an earlier block
matching `.json` would have swallowed the route and left this present, bound, mirrored, gated, and
completely inert — the exact PROC-3 shape that nearly got me with HYG-1. `/chart/build-info.json` is
claimed by `^/(modules|uploads|chart|styles)/` with nothing earlier competing. The gate locks that
ordering so a future reorder fails loudly.

**What I have not done:** fetched it over HTTP. It does not exist until the cut. I have asked C to make
the first read a hard pre-flight precondition, before the ten hours start — if it 404s, I would much
rather eat a rebuild in pre-flight than void hour nine.

Gate: 30/30. Handoff to C with the exact fetch: `B-TO-C-THE-PASSPORT-THIRD-COORDINATE-IS-LIVE-...-1105.md`.

## 3. The cut: parameters held, not fired

```
BUILD_ID=20260802b121   CHECKPOINT_BUILD=1   SOURCE_COMMIT_SHA=<train tip at cut time>
```

Understood and held. One cut, at the end, after all five managers declare. Once C fires, I do not cut
for any reason — not for a one-line fix, not for a revert, not for anything. Two runs lost is two too
many and a third would be mine.

I will re-read the train tip SHA at cut time rather than reusing the value in this document, since
other managers' rows will land between now and then.

## 4. Standing correction applied, and it reproduces in my tree

I ran `scripts/roster-line-check.mjs`. It confirms the two-coordinate-system problem locally: of the
seven citations, only `replay-dashboard-sync.js:10` and `chart-indicators-full.js:8001` resolve, and
the offsets vary exactly as you described. My own rows are not among the mis-cited ones, but the rule
is adopted — symbol, never line.

## 5. The M21 salvage: checked for collision, and it is clean

You marked this awareness-only, but the salvage description says **pagehide/pageshow teardown**, which
is the same two events LIFE-3 rewires, so I checked rather than filing it.

- `87b6f7b17` is **not** an ancestor of my train tip. It lives only on
  `salvage/main-worktree-uncommitted-20260801`.
- My working tree contains **zero** occurrences of the M21 lifecycle symbols.
- My tree's `CHART_ENGINE_BUILD` reads `20260724b61`, matching your finding. The salvage moves it to
  `20260727b80`, so landing it would also move the source stamp.

**It will not be pulled into the train.** Recorded so it is not lost.

One note for whoever inherits it, from having just spent a day in these two events: if that work adds
its own `pageshow` handler it will now be running alongside LIFE-3's, and LIFE-3's behaviour is
conditional on `event.persisted`. Two handlers disagreeing about whether a restore happened is a
plausible way to reintroduce the false "kicked" overlay. That is a review note for the owner, not a
blocker, and not before the seal.

---

## SOAK-READY declaration, against the six conditions in §3 of the 09:35 ruling

| # | condition | B |
|---|---|---|
| 1 | owned rows committed and merged | **MET for commit, NOT MET for merge** |
| 2 | switches named | **MET** |
| 3 | gates discriminating | **MET** |
| 4 | clean worktree | **MET** |
| 5 | no in-flight product file writes | **MET** |
| 6 | PROC-3 passed | **MET** |

**I am not yet SOAK-READY, on condition 1 only.**

**1 — committed yes, merged no.** LIFE-3, HYG-1, KILL-04 and PASSPORT-3 are committed and pushed on
`manager-b/kill-roster-round-one` @ `d7a27f70d`. None are merged to the train, because merging is the
cut and the cut is held until the full roster declares. I read this condition as satisfied at the
moment the train is assembled; if you intend "merged" as a precondition rather than a consequence,
then condition 1 and the single-cut rule cannot both hold, and I need you to break the tie.

**2 — switches named.** `__TALARIA_BFCACHE_DEFEAT_V1` (client, default ON) with server-side
`TALARIA_DISABLE_BFCACHE_DEFEAT_V1`; `__TALARIA_SETTINGS_WRITE_BREAKER_V1` (client, default ON).
PASSPORT-3 has no switch by design — a passport you can turn off is not a passport.

**3 — gates discriminating.** LIFE-3 17/17, HYG-1 26/26, KILL-04 10/10, PASSPORT-3 30/30, PROC-3 30/30
across all four rows. Each fails against the pre-fix code or a synthetic defect, not just against
absence.

**4, 5 — clean.** `git status --porcelain` is empty. No in-flight writes to `chart v 1.4` or
`homepage`. C's rescued soak harness landed in `73c03f783`, so that hazard is closed too.

**6 — PROC-3 passed.** 30 green, 0 red, on present / bound / mirrored / discriminating.

### The conflict I still owe you an answer on

I declare last because the cut is mine, but condition 1 asks for merged rows and the cut *is* the
merge. I have declared everything I can control and named the one thing I cannot. Tell me which
reading you want and I will move immediately — I am not blocked on work, only on that ruling.

### LIFE-4 remains CHANGES REQUESTED

D's M8 hydration guard is unchanged since my review; the behavioural gate is still RED on the
null-session-equals-null-session path that grants full delete authority. It is a money-path row and I
am not downgrading the tier under wave pressure. D has not yet answered the reachability question.
**D's row is not SOAK-READY through me.**
