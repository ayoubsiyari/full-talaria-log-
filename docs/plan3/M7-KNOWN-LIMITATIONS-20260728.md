# Known limitations — canary release

**Gate M7. Owner: Director. Status: DRAFT, 2026-07-28 14:20.**

Written for experienced traders in the canary cohort. **Every item here is a measured defect we have chosen to ship with, disclosed deliberately.** Nothing is softened, and nothing is claimed as fixed that is not.

**Ticket routing:** each item carries an `Area` tag. Reports matching a tag auto-cluster to that row instead of opening new tickets, so please quote the tag if you report one of these.

---

## 1. The chart uses more CPU than competing products — `Area: perf-cpu-floor`

**What you will see.** The chart consumes noticeable CPU even when sitting completely still, and CPU rises sharply at high replay speeds.

**Measured, on the same machine, same instrument, same browser:**

| | Talaria | Competitor |
|---|---|---|
| Idle | 8–20% | 0.4–1.8% |
| Replay 1x | 34% | 1.8% |
| Replay 10x | 115% | 76–80% |

**What we know.** The gap is a **near-constant overhead of roughly 33–36 CPU points regardless of what the chart is doing.** Ten times the replay work changes the gap by about three points. Our per-tick replay cost is roughly competitive; a fixed background cost is not.

**Cause, partially identified.** The chart runs an animation loop sixty times a second that never stops, whether or not anything has changed. Removing it entirely is worth **1.3–3.4 CPU points** — real, but a minority of the gap. **The majority of the idle cost remains unexplained and we are not claiming otherwise.**

**Not fixed in this release.** A safe fix requires re-routing 28 separate redraw triggers; done carelessly, parts of the chart silently stop repainting, which is worse than the cost.

## 2. Memory grows the longer a session stays open — `Area: perf-memory-leak`

**What you will see.** A long-lived tab grows from roughly 300 MB to well over 1 GB. The chart becomes progressively less responsive, and **it does not recover when you close a multichart or return to 1x speed.** Reloading the page resets it.

**Cause, fully identified.** When parts of the application are torn down, **entire page documents are left in memory instead of being released** — held by a UI framework root that is never shut down. Each abandoned document brings its whole contents with it. In one measured session there were **four abandoned documents holding roughly 19,800 dead page elements**.

**This is the cause of the "multichart makes everything slow afterwards" behaviour** several of you have reported. It is not your imagination and it is not fixed by closing panels.

**Workaround that genuinely works: reload the page.** It clears everything and costs you nothing but a few seconds.

**Not fixed in this release.** The defect is in framework-managed lifecycle code with no test coverage. **It is the first item scheduled after the canary** — it is now the best-understood defect in the product.

**Explicitly refuted, so nobody chases it:** this is **not** caused by stored data. Client storage is 582 kB against a competitor's 4.3 MB. Clearing browser data helps only because it forces a fresh page load.

## 3. Replay speed is capped at 10x — `Area: replay-speed-cap`

Deliberate. Above 10x, CPU cost rose steeply for no usable benefit. **High speed is expensive in every product we measured** — the competitor reaches 76–80% CPU at 10x. If the cap blocks a real workflow, tell us.

## 4. Multichart performance ceiling — `Area: perf-multichart`

Two panels roughly double memory and CPU; more panels scale worse. Panels also **leave the residue described in item 2**, so a session that has used multichart stays degraded until reload. **Treat multichart as a heavier mode and reload after extended use.**

## 5. Bar bucketing on non-24-hour instruments — `Area: session-calendar`

Daily and weekly bars have been bucketed by UTC midnight rather than by the instrument's own trading session. On FX this can produce a **phantom Saturday candle** and misaligned weekly bars. A corrected session calendar is in progress; **check this row before reporting a bar-boundary discrepancy.**

## 6. Trade journal — fixed in this release, disclosed anyway — `Area: trade-loss-hydration`

**Not a limitation. A defect that existed and is fixed, disclosed because it affected data.**

Between **3 July and this release**, if the app could not reach the server — or merely got a slow response — it could conclude a session had no trades and **save that emptiness over your real journal.** The deletion was not logged, so **we cannot determine from our side whether it affected you.**

**Fixed:** the client now refuses to save a journal it cannot vouch for, and every deletion is now recorded so this can never again be a question we cannot answer.

**If you noticed a session's history shorten at any point since 3 July, please tell us** — it will not be recoverable, but it tells us the real blast radius.

**If a session's journal ever looks empty or short: stop, and do not place, close, or reload.** That was the action that made the loss permanent.

---

## Standing commitments

- **We will not report a performance improvement without a measured before-and-after** on a fixed protocol, with the variance stated. Run-to-run noise on idle CPU is about 4.5 points, so **we will not claim any improvement smaller than that.**
- **We will not describe a defect as fixed until it is verified on the deployed build**, not merely on a branch.
- Where we do not know a cause, this document says so.
