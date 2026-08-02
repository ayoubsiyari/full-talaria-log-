# Competitor arena reference — protocol for Monday

**Owner: A. Budget: one hour. Instrument: `scripts/competitor-arena-reference.mjs` (written 2026-08-02, untested against a live competitor).**

## The question

Nobody on this team can say whether our GPU and renderer footprint for a multi-panel chart is pathological
or simply what this class of product costs. Without that baseline we cannot tell a leak from a floor, and
the 1,024 MB bar is unanchored. Competitor numbers are the empirical normal.

## What changed tonight, before anyone runs this

Our own four-panel floor is **not** 532.6 MB. Same probe, same boot, the only difference being a 20 s
settle with a second collection before reading:

| Reading | total private | GPU | renderer |
|---|---:|---:|---:|
| ~1 s after GC (the published method) | 531.84 (spread 21.4) | 182.12 | 258.76 |
| 20 s settle, then collect, then read | **420.70 (spread 2.49)** | **99.88** | 228.36 |

**111 MB of the published floor — 82 MB of it GPU — is allocator space that had been freed but not yet
returned to the OS.** The settled boot level also reproduces to 2.49 MB, so the settle does not merely lower
the number, it makes it a measurement.

### And the dpr under all of it is 1, not 2

No arena probe in this repo sets a device scale factor, so **every number we have published for the 4-up was
rendered at dpr 1**, while the advisor's 130–180 MB expectation describes a 4-up **at dpr 2**. Those are not
the same measurement, and the mismatch flatters us.

Self arm run through this instrument, `--self --panels=4`, n=1 per arm:

| dpr | canvas backing | GPU at load | GPU at idle+30s | total at idle+30s |
|---|---:|---:|---:|---:|
| 1 | 5.25 MB | 92.11 | 89.07 | 396.52 |
| 2 | 21.02 MB | 142.52 | **183.47** | 489.58 |

Backing scales exactly 4×, as it must. **At matched dpr 2 our GPU lands at 142–183 MB, inside the advisor's
130–180 MB band, not below it.** So the honest reading is that the four-panel GPU cost looks ordinary for the
pixels being pushed, and the earlier "we are below expectation" framing was an artifact of comparing our
dpr-1 measurement against a dpr-2 expectation.

### Corrected after replication: the drift is not a dpr effect, it is a transient with a phase

The n=1 arms above suggested dpr 2 drifts upward while dpr 1 drifts down. **Replication killed that reading.**
Five-point series over five minutes, two dpr-2 arms and a dpr-1 control:

| sample | dpr1 total | dpr1 GPU | dpr2-r1 total | dpr2-r1 GPU | dpr2-r2 total | dpr2-r2 GPU |
|---|---:|---:|---:|---:|---:|---:|
| loaded | 405.61 | 89.50 | 466.56 | 145.23 | 460.50 | 145.68 |
| idle+60s | **442.19** | **136.10** | **498.39** | **189.02** | **495.31** | **188.33** |
| idle+120s | 401.57 | 98.11 | 458.25 | 151.45 | 457.44 | 153.13 |
| idle+180s | 401.69 | 98.11 | 458.21 | 151.52 | 455.95 | 151.13 |
| idle+240s | 405.20 | 98.13 | 458.75 | 151.52 | 456.07 | 151.12 |
| idle+300s | 402.70 | 100.19 | 458.98 | 151.51 | 458.16 | 151.12 |

**Every arm humps by about 40 MB of GPU near the first minute and is flat by the second.** Both dpr values do
it. The apparent dpr contrast came from sampling at +30 s, where the two happen to sit at opposite phases of
the same transient.

**The sampling rule, which governs every arm of this row:**

- **Never sample between 30 s and 90 s after load, at any dpr.** That window runs up to 40 MB high.
- **The plateau arrives at ~120 s.** Sample at or after that, and prefer a series over a single point.
- **Settle is not monotonic decay.** It rises before it falls, so "take the later of two readings" is not a
  safeguard if both fall inside the hump.
- **A newly created surface starts its own transient.** Measuring the cost of adding panels or panes means
  waiting out the hump on the *new* surface too, not just on the page load.

**Steady states to quote**, replacing every earlier figure in this document:

| dpr | total private | GPU | canvas backing |
|---|---:|---:|---:|
| 1 | 402.70 | 100.19 | 4.35 MB |
| 2 | ~458.6 | 151.3 | 21.02 MB |

At dpr 2 the GPU steady state of 151.3 MB is **inside** the advisor's 130–180 MB band, and it is the most
reproducible number taken this session (151.51 and 151.12 across independent runs).

Three consequences for this row:

1. **Match dpr explicitly, and record it.** A competitor measured at dpr 2 against our dpr-1 history is a
   4× pixel difference masquerading as a product difference.
2. **The GPU side is probably honest**, which is the answer the row was commissioned to find. Competitor
   numbers now serve to confirm that rather than to discover it.
3. **Any competitor reading taken without the same settle is not comparable to ours.** Settle is on by
   default in the instrument and must not be turned off for convenience.

## Hold these constant, or the comparison is decoration

| Constant | Value | Why |
|---|---|---|
| Viewport | 1440 × 960 | what every one of our arena numbers was taken at |
| Device scale factor | 2 | GPU cost is per device pixel; dpr 1 vs 2 is a 4× difference |
| Panel count | 4, **verified from the surface census** | not assumed from the layout requested |
| Settle | 20 s + second collection | see above |
| First sample | **no earlier than 120 s after load** | the 30–90 s window runs ~40 MB high at every dpr |
| Concurrency | **one measured browser at a time** | process-private readings on a shared machine contend; never run two arms at once |
| Replicates | 3 per product | our own release deltas needed n=3 to show they were drift |
| Profile | fresh, `--disable-extensions` | extension renderers land in the same process total |
| Instrument | this script, both sides | the self arm must come from the same file |

## Credential blocker — resolve before Monday, not during the hour

**All three products gate multi-chart behind a paid plan.** Checked 2026-08-02:

| Product | 4-up requires | Notes |
|---|---|---|
| TradingView | **Plus** (~$25–30/mo). Basic free = **1 chart**, Essential = 2, Plus = 4, Premium = 8 | 1-up is free and needs no account |
| FX Replay | Intermediate ($17.99/mo, 2 multi-chart layouts) or Pro ($35/mo, up to 16) | free tier exists but is feature-limited; the 5-day trial **requires a card and auto-converts** |
| TradeZella | Essential from $29/mo; supports up to 8 charts | journal-first product; replay is a feature within it |

**If accounts are not available, the row still runs** — see the fallback. What must not happen is an hour
spent discovering the paywall.

## Fallback that preserves the science: per-panel normalisation

The question is *cost per chart*, not cost per layout. So:

1. Measure each competitor at the **highest panel count its plan allows** — 1-up on TradingView Basic
   costs nothing and needs no login.
2. Measure **our own product at 1, 2 and 4 panels** with the same script, giving our scaling curve.
3. Compare **GPU per panel** and **renderer per panel** at matched panel counts.

A 1-up comparison alone answers most of the question: if a competitor's single chart at dpr 2 costs ~25 MB
of GPU, then four panels at ~100 MB is the cost of the product, not a defect.

## Run

```bash
# Self arm first — this is the reference the others are read against.
node scripts/competitor-arena-reference.mjs --label=talaria-4up \
  --url="http://127.0.0.1:<harness-port>/harness/host.html?pair=same&panels=4&tf=1m&hostFile=25" \
  --panels=4

# Free, no login, no card:
node scripts/competitor-arena-reference.mjs --label=tradingview-1up \
  --url=https://www.tradingview.com/chart/ --panels=1 --headful --manual \
  --profile=.scratch/profiles/tv

# With a plan, arrange the 2x2 by hand then press Enter:
node scripts/competitor-arena-reference.mjs --label=tradingview-4up \
  --url=https://www.tradingview.com/chart/ --panels=4 --headful --manual \
  --profile=.scratch/profiles/tv
```

`--manual` holds at a prompt so the layout can be arranged by hand; `--profile` persists the login so the
second and third replicates skip it.

## Caveats to publish alongside any number

- **Rendering model differs.** TradingView renders with a different stack than our layered 2D canvases. The
  census records `webglContexts` and `canvasBackingMB` so that difference is visible rather than silent. A
  WebGL product being cheaper on GPU would not by itself mean we have a defect.
- **Process accounting is whole-browser.** Report renderer and GPU separately as well as total; a product
  that splits work across more renderers is not automatically heavier.
- **Their data volume is not ours.** They stream a live feed; we hold a replay master. Compare the arena,
  not the workload.
- **Three samples, and publish the spread.** A single reading on this rig has been wrong twice today.
