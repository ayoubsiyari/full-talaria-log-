# FINDING (C) — Candle mode is clean on all three cheap tests, the recalc multiplier is not there, and a correction to my own x-axis

**2026-07-31 01:00** · Manager C · answers tests 1–3 of `RULING-PO-NAMES-THE-TICK-ANIMATION...-2350.md` (606defe033)
**tier=mid** · instrument `REPLAY-MODE-TRUTH-V1` · build read off the running page: **20260730b115**

## Test 1 — mode truth: NO P0, and mode agreement held for sixteen minutes

Read from the running instances, host and three panels, at play-start, two minutes, ten
minutes and fifteen:

| checkpoint | host `getPlaybackMode` / `getPlaybackLoopKind` | panels `getPlaybackMode` | panels `getPlaybackLoopKind` | P0 |
| --- | --- | --- | --- | --- |
| play-start | candle / candle | candle, candle, candle | null, null, null | no |
| 2 min | candle / candle | candle, candle, candle | null, null, null | no |
| 10 min | candle / candle | candle, candle, candle | null, null, null | no |
| 15 min | candle / candle | candle, candle, candle | null, null, null | no |

**No panel was ever in tick while the host was in candle**, and there were zero
`getPlaybackLoopKind()`-versus-`getPlaybackMode()` disagreements. The hypothesised race did
not occur in sixteen minutes of four-panel play on the deployed build.

**Panel loop kind is null by design, not by fault.** `getPlaybackLoopKind()` returns null
when the instance is not itself playing, and peers do not run their own loop: the bridge sets
`ch._multichartPassivePlayActive = true` and drives them from the host's
`replayVirtualTimeChanged`, one event per host candle advance. So the panels have a *mode* but
no *loop* — which is worth knowing, because it means a peer's mode matters far less than the
ruling assumed. The tick animation is driven by the loop the peer does not run.

## Test 0 (free, and it comes first) — every measurement I have published was candle mode

The harness has never called `setPlaybackMode`, so I read the mode **before setting anything**.
Raw `playbackMode` was the string `'candle'` in all four realms, and
`_shouldUseTickAnimation()` returned false in all four. My b114 decay run was therefore a
**candle-mode** measurement, the same mode the PO's tests were in. That is a caveat I was
carrying and can now discharge with a number rather than an assumption.

### Why it is candle, from the deployed bundle — and the coupling nobody has stated

The `ReplaySystem` constructor default really is `'tick'` (L68), but on the V9 surface React
overrides it on mount and then **re-asserts it every 250 ms** on a poller. The deployed
`talaria-v9-live.js` holds:

```js
[Ts, Bb] = useState("candle")   // playback mode selector state
[Ma, YL] = useState("Auto")     // INTERVAL selector state
```

and computes the mode it pushes down as:

```js
const f = (u && u !== "Auto") || d === "candle" ? "candle" : "tick";
```

Two consequences, both of which change the risk picture:

1. **A user who never touches the selector gets candle, not tick**, on this surface. The
   class default is tick; the shipped UI default is candle and it wins. This contradicts the
   closing concern in the ruling, and it is measured on the deployed build rather than argued.
2. **A non-`Auto` INTERVAL forces candle regardless of what the mode selector says.** The mode
   the engine runs is a function of *two* controls, only one of which is labelled "mode". This
   is exactly why `CONF-04` is right: the mode must be read from the instance, because the UI
   cannot tell you what the engine is doing.

Tick mode is therefore *harder* to reach than feared, not easier — but it is still unprofiled,
and my tick run must verify the mode survives that 250 ms poller before claiming to have
measured it. I have added that check rather than assuming a `setPlaybackMode('tick')` sticks.

## Test 2 — recalc cadence is ~1 per candle, not frame rate. The multiplier is not there.

`_scheduleReplayIndicatorRecalc` wrapped in all four realms, counted against candles advanced,
32 windows over sixteen minutes:

- **host: exactly 1.00 recalcs per advanced candle**, every single window
- the one peer whose index advances: 1.02–2.09, settling at ~1.05
- **mean across all realms and windows: 1.12**

At 60x a frame-rate cadence would read in the tens. It reads one. **In candle mode the
per-frame recalc multiplier does not exist**, and I am saying that as loudly as the ruling
asked me to say the opposite if it were flat.

## Test 3 — recalc cost does NOT grow with bars played

Same wrapper, timing every call. p50 recalc duration **0.714 ms early (≤3 min) → 0.750 ms late
(≥12 min)**, across a bar range of 2,753 → 13,090, verdict **BOUNDED**. The fit against bars
does not climb.

So the slice-length term the ruling predicted is **not in the recalc path**. It is in the paint
path I named at 00:10: `_m19iB62WindowFp`, called from `_m19iExactTailPaintFp` with
`tailStart = 0`, which is what actually grows with bars played. Two candidate O(n) terms were
on the table; this test removes one of them and leaves the one with the +33% kill-switch A/B
behind it.

## A correction to my own W98 finding, and it is the important part of this document

My decay run reported "four panels advancing" from a gauge that accepts advance by index **or**
by simulated time **or** by resident bar count. Re-reading the artifact per realm:

| realm | timeframe | replay index, first sample → last |
| --- | --- | --- |
| host | 1m | 3,254 → 15,060 (**+11,806**) |
| peer | 5m | 1,595 → 1,595 (**0**) |
| peer | 15m | 1,910 → 1,910 (**0**) |
| peer | 1h | 494 → 494 (**0**) |

**Only the host advanced its replay index.** So `elapsedBarsAllPanels`, which I summed across
realms and used as the x-axis, was in practice *host bars plus three constants*. The slope
`+3.46 CPU-ms per bar per 1,000 bars` is therefore **per host bar with three peers resident**,
not per bar across four advancing panels. The slope, its CI, the pinned-CPU arithmetic and the
profile diff all stand — the x-axis was monotonic and dominated by host advance — but the
label was wrong and the configuration statement was too generous.

This is also the honest explanation of why I measured a 1.5x decay where the PO felt 30x: three
of my four panels were not doing per-candle work at all. Whether the peers were advancing by
*timestamp* while their index stayed frozen is not settled by that artifact, because I did not
record per-peer simulated time. The A/B now running records index advance, simulated-time
advance and resident-bar advance per realm, so the next artifact will state it per panel
instead of collapsing it into one number.

## What is still open from this branch

- **Test 4** (two indicators versus zero, fifteen minutes each) is running now. One thing to
  know before its result lands: `_m19iExactTailPaint` **also** early-returns when no indicators
  are active, so a decay that vanishes at zero indicators is consistent with *both* the recalc
  hypothesis and my fingerprint finding. Test 4 can establish indicator-dependence; it cannot
  by itself name the recalc path. Tests 2 and 3 above, and the fingerprint's own kill-switch
  A/B, are the discriminators.
- **Tick mode under CONF-01**, unprofiled, with the mode-held-after-settle check attached.
- **Mode selected after play starts** (the `restartPlayback: false` drain path) — not yet run;
  this run selected before play.

## Artifacts

- `_evidence\manager-C\REPLAY-MODE-TRUTH-V1-20260731-0040.json` — 32 recalc windows, 4 mode checkpoints
- `scripts\replay-mode-truth.mjs` (GATE-01: planted tick-while-host-candle reads P0, clean input does not, loop-kind mismatch caught)
- `scripts\indicator-decay-ab.mjs`, and `--mode=` with a settle check added to `scripts\replay-decay-hunt.mjs`
