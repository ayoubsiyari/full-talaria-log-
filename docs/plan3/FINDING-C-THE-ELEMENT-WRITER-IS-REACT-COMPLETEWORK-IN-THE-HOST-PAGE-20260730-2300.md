# FINDING — The element writer named: React's commit path in the HOST page, 28.7 elements per closed trade

**2026-07-30 23:00** · Manager C · to A and Director · answers the attribution question in
`RULING-ATTRIBUTION-BEFORE-CONFIRMATION-...-2145` (2a60e2cb3)

**The attribution run completed before the death loop started.** It has 25 clean samples over
24.1 minutes on deployed **b113** (stamp read off the running page), CONF-01 compliant, four
distinct fileIds at 1m/5m/15m/1h, four indicators per panel, 4/4 panels advancing at the final
sample, and 73 closed positions accumulated. `GATE-01` **PASS: the planted leaking writer was
named and ranked first.** Artifact:
`_evidence\manager-C\ELEMENT-WRITER-ATTRIBUTION-V1-20260730-2205.json`.

## The writer

| rank | writer | per closed trade | 95% CI | live count |
| --- | --- | --- | --- | --- |
| 1 | `R3 < O_ < R_` @ `talaria-v9-live.js:40` | **+28.70** | [28.42, 28.97] | 191 -> 2,280 |
| 2 | `SVGDefsElement` via `Vn.select` @ `d3.min.js:2` | +1.98 | [1.96, 1.99] | 4 -> 146 |
| 3 | `SVGFilterElement` via `Vn.select` @ `d3.min.js:2` | +1.98 | [1.96, 1.99] | 4 -> 146 |
| 4-7 | `talariaAppendIndicatorLegendRow` @ `indicator-ui.js:2970/2975/2994/3071` | +0.10 each | [0.05, 0.16] | 0 -> 8 each |
| 8 | `talariaFillLegendLoadingDots` @ `indicator-ui.js:2866` | +0.11 | [0.01, 0.20] | 8 -> 16 |

Sum of the named writers is **~32.9 elements per closed trade**. The duration gate's regrade,
a completely independent measurement on different samples, gave **+31.7 per closed trade
CI [10.9, 52.5]**. Two instruments, two datasets, same answer: **the element climb is fully
accounted for, and one writer carries 87% of it.**

## The demangle: it is React's render loop, and the frames are not a bug in my tool

Done statically from the **deployed** bundle, byte-matched at 1,720,325 (the local copy is
1,716,061, so local line numbers would have been wrong — the artifact records the check):

| minified | React function | evidence in the body |
| --- | --- | --- |
| `R_(t)` | **performUnitOfWork** | calls `W_(t.alternate, t, ms)` (beginWork), sets `memoizedProps`, then `O_` |
| `O_(t)` | **completeUnitOfWork** | walks `n.return`, handles flag 32768, calls `R3` |
| `R3(t,n,i)` | **completeWork** | switches on `n.tag`, touches `stateNode` and `memoizedProps` |

Artifact: `_evidence\manager-C\DEMANGLE-BUNDLE-FRAMES-V1-20260730-2255.json`.

**This has a consequence for what my tool can and cannot tell you, and I would rather state it
than let A hunt in the wrong place.** React creates host instances inside `completeWork`,
*after* the component that rendered them has already returned. A component's own frame is
therefore **never** on the stack at `document.createElement` time. So "the call site is React"
is the true and complete answer from a creation stack, and no amount of extra stack depth will
produce a component name.

The component *is* recoverable — from the fiber React attaches to each node (`__reactFiber$*`),
walking `fiber.return` and reading `type.displayName || type.name`. I have added exactly that to
the census as a second, independent ranking (component owners, fitted per closed trade the same
way), plus a `reactOwnedElements` count per realm. It reads at census time, retains nothing, and
costs no extra memory. **It is code-complete and unrun, because the machine has no headroom.**

## Where it happens: the HOST page, not the panel realms

From the final sample's per-realm census, netting out my own planted writer (46,080 elements,
40 per 5 s in each of four realms):

| realm | live elements | pre-instrumentation | product growth after netting the plant |
| --- | --- | --- | --- |
| host `index.html?mode=backtest&mcLayout=1` | 17,047 | 2,824 | **~2,700** |
| panel (x3, `embedRev=ohlc2`) | 12,258 / 12,250 / 12,249 | 687 each | **~40 each** |

**The accumulation is in the host document.** The panels are essentially flat. Combined with
"+28.7 per closed trade", the shape is a host-page React tree that renders something per closed
position and keeps every one of them attached — a trade list, journal, or history view without
virtualisation or a cap. That is a different defect from a teardown bug: nothing is failing to
be cleaned up on close; the app is rendering an unbounded list.

**A: this also retires the rewind hypothesis as the element cause** (a rewind would give a
time-driven climb; this is trade-driven), and it is not E's separate-panel overlay rebuild path
either, because the panels are not where the elements accumulate. The two d3 writers
(`SVGDefsElement`, `SVGFilterElement` at 2/trade each, always in equal numbers) look like a
`defs`/`filter` pair added per rendered item and never reused — that is the glow-filter shape,
and it is small but strictly monotonic.

## What I got wrong, and my share of the death loop

The Director diagnosed the silent deaths as OOM on a machine that has held 2.7-3.6 GB free all
evening. I confirm it from this side and I contributed two things to it:

1. **My W96 supervisor kept relaunching.** Its `for /L` loop had four attempts, and my kill
   filter matched `node.exe` but not the `cmd.exe` running the loop, so segments kept restarting
   underneath the attribution run. Two ~3 GB sessions at once on a machine with ~3 GB free is
   the whole mechanism. That is a defect in my own supervisor, not a mystery.
2. **My GATE-01 synthetic writer planted 46,080 elements** — 86% of the run's total element
   count. It earned its keep by proving the instrument ranks a known leaker first, but it must
   not run again now that it has: the re-run uses `--no-synthetic`, which removes most of the
   session's growth and most of its memory cost.

Also voided: `ELEMENT-WRITER-ATTRIBUTION-V1-20260730-2200.json`, retained as
`...-2200-VOID-page-died.json`. Its page died mid-run (elements 5,468 -> 0, closed -> null), so
its trend of -19,634/h is an artefact of the page disappearing, not a measurement. Its
`GATE-01` self-report is "PASS (named, not first)" for the same reason. **Do not quote it.**

Duration segment 2 also died at sample #3 (`Performance.getMetrics: Session closed`) — same
cause, recorded, and it is the fifth loss. Per the ruling, the duration gate yields; it will be
re-run after A's fix, when it has to be re-run anyway.

## What I am doing next, and what I am not

**Not starting anything heavy until the Director confirms headroom.** Free RAM is 3.03 GB with
zero Chrome processes running, which means the shortfall is not mine to reclaim.

When there is room, the re-run is deliberately cheap and fails loudly instead of vanishing:
`--no-synthetic`, 12 samples at 60 s, and an explicit `--max-old-space-size` so an OOM is an
error message rather than a disappearance. Its single job is to convert
"React `completeWork` in the host page" into a component name from the fiber walk.
