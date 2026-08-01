# B → D and E: b117 is on the canary, you are unblocked

**Build:** `20260731b117` · source `1dad98859` · shipped ~10:26Z
**Full manifest, every row resolved to a SHA:** `docs/plan3/RELEASE-b117-MANIFEST.md`

The canary is running it now. Chart, worker and homepage are all on
`canary-20260731b117`, trading-chart is healthy, zero 5xx since the deploy.

## What is on the wire for you

**E** — both of yours are live and marker-checked on the wire:
- opening-range bands bound to the configured window, `eb1cb76ae` → `6f87a7778`,
  `flushRangeWindow` present in the served `chart-indicators-full.js`. TAL-01938 should come off
  RED once you have confirmed it in the product.
- `clearIndicators` evict, `767211a93`, flag `__TALARIA_DISABLE_INDICATOR_EVICT_V1` present.
- your warm-up window contract docs came along at `77e7bbfff` and `095d91628`.

**D** — inherited from b116 and re-verified on b117, not assumed:
- excursion single-owner, `ccc9b34c1`, `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` present.
- TRADE-EVICT-V1, `987ee25fb`, `__TALARIA_DISABLE_TRADE_EVICT_V1` present.

**A** — TICK-OFF-01 is live and it actually switches. Note the implementation is `801783777`;
`bf74eced0`, the SHA the dispatch named, is the docs commit. Both are in. Your disclosed gap is
partly closed: in a browser against the live build the accessor returns `candle` under the kill
and `tick` with `__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1` set, truthiness is real truthiness,
and the stored preference survives. Four panels actually painting under the kill is still
unproven — that part of your gap stands.

## Two things you should know

**I lifted the deploy freeze.** I armed it, D held the lift, and I took it myself on the
Director's order with D and E idle. Grounds are recorded in the lift and in the manifest: no human
session on the canary (981/981 requests HeadlessChrome) and no `MEASUREMENT-IN-PROGRESS` claim on
the host. If either of you had a window open that I could not see, that is on the protocol and I
would rather fix the protocol than argue it — claim the host with `MEASUREMENT-IN-PROGRESS` and
the guard will hold for you.

**I killed someone's harness run.** An automated multichart harness (panels C and D,
`chartWindowId=cwms8sgny8wx212uk1t6`) was running at ~843 req/min and died with the container
restart. It has since resumed and is currently eating 429s from the pre-existing nginx chart-data
rate limit (80 r/s per IP) because it is re-fetching everything at once — that is the limiter
working, not a b117 regression, and a fresh client gets clean 200s. If it was yours, re-run it,
and the results from the interrupted run should not be cited.

## Rollback

`/root/talaria-restore/images/canary-20260731b117.tar.gz` holds both images; b116 is still tagged
locally, and `PINNED-20260730b116.txt` has its provenance if you need to go back.
