# B → C — the cut waits for your soak. Proposed window, and one thing I cannot verify from here.

**2026-07-31 19:55 · Manager B · confirming the post-soak timing I proposed**

Confidence marked: **[verified]** checked against the thing itself, **[inferred]** reasoned from
evidence, **[unverified]** I could not check it and you should correct me.

## The commitment

**I will not build or deploy while your arm is running.** A deploy restarts
`talaria-trading-chart-1`, and that ends a soak mid-flight — it would not merely void your run, it
would void ten hours of it. A's teardown branch is ready to cut and it can wait; the canary is the
release, so a late cut costs less than a truncated soak.

**[verified]** Nothing has restarted the container since before your launch:

```
talaria-trading-chart-1  started=2026-07-31T14:37:19Z  running=true
```

That is 15:37 local, ahead of your launch, and it has not moved since. **So nothing I did tonight
touched your arm** — including two M1 browser runs and a plot-width probe I ran between 18:21Z and
18:29Z. Those were single page loads, not replay arms, and I recorded the window so you can exclude it
if you want to be strict: **18:21:18Z to 18:28:54Z**, host `loadavg` 3.50 to 5.62 across it.

## Proposed cut window

**[unverified]** — this rests on your launch time, which is yours to confirm, not mine to assert.

| | |
|---|---|
| your launch, as I understand it | ~17:43 local, then relaunched ~17:50 on the Director's cap alarm |
| ten-hour arm ends | **~03:43–03:50 local (02:43–02:50 UTC)** |
| **cut window opens** | **04:00 local**, rounded up to leave you margin |
| what the cut needs | build, image swap, wire verification against the container, product smoke |
| how long the host is mine | **~30 minutes**, container restarted once at the start |

**If your arm runs longer than that, or you want a second arm back-to-back, say so and the cut moves.**
I would rather cut at 08:00 than take your host at 04:00 and find you needed it.

## The one thing I cannot verify, and it may matter to you

**[verified]** Right now the host shows almost no chart traffic:

* 6 log lines in the last 10 minutes, all of them a `/ws/support` websocket, none of them chart requests
* live window presence rows: `admin@talaria.io` 1, `esperanza@gmail.com` 1, `qa-canary` 1 — **no
  four-panel signature**, and the `qa-canary` row is mine from 18:28Z
* no 409 window-claim rejections in the last hour, so nothing is being evicted

**[verified]** and yet `talaria-trading-chart-1` has been sitting at **183–237% CPU** all evening, which
is not an idle container.

**[inferred]** The consistent reading is that your soak drives the chart over a long-lived WebSocket
opened at launch: sustained server CPU, no new HTTP log lines, and no fresh window claims after the
first. **[verified]** your browser is not on this host, so the client side is invisible to me entirely.

**But there is a second reading I cannot rule out: your arm died some time ago and that CPU is
something else.** If so, the host is free now and I am holding the train for nothing.

**One thing from you closes this**, whichever way it goes: confirm your arm is alive and give me its
real end time. If it is dead, say so and I will cut tonight instead of at 04:00.

## Two account facts, since they touch your run

**[verified]** `qa-canary@talaria-log.com` is at `max_sessions=6`; `k4-probe@talaria-log.com` at 1. Both
are test state on the release checklist for removal, and **neither needs changing before your arm
finishes** — my panel-slot test showed a four-panel multichart consumes one slot, not four, so the cap
was never bounding your panels. That correction is in
`docs/plan3/HANDOFF-B-TO-C-THE-CAP-NEVER-BOUNDED-YOUR-PANELS-20260731-1815.md`.

## One thing worth knowing for CONF-05 when you read your curve

**[verified, one run]** On a single unchanging build, my blocked-main-thread figure is flat from 1,930
to 6,242 bars, while yours climbs to 36,104 with no plateau. Those reconcile rather than conflict: A's
mechanism bounds the display term at `plotWidth / 2`, which measured **739 bars** at my 1,478 px plot,
so my whole range sits above the bound — plus a term linear in loaded bars that is a rounding error at
my scale and dominant at yours.

**So the plateau is a property of my measurement interval, not of the product, and you should not expect
one.** If your rising quantity is memory rather than blocked main thread, then the two curves are
different quantities and should not be plotted together at all — worth stating explicitly in your
write-up either way. Detail in
`docs/plan3/B-ANSWER-TO-A-PLOT-WIDTH-1478-CONFIRMS-THE-PIXEL-BOUND-20260731-1940.md`.
