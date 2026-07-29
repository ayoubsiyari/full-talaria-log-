# Manager C — W78

Both items the Director ordered, plus a correction to W77's correction.

| File | What it settles |
| --- | --- |
| `w78-per-cycle-attribution.slim.json` | The ~23 MB/cycle is attributed: **one whole panel realm's script set retained per cycle**, 20.87 of 23.53 MB. Measured at two identical collapsed states one cycle apart. |
| `w78-off-thread-breakdown.slim.json` | The off-thread 62pp named: raster, not shader; ~124 frames/sec each costing a full style recalc, layout, compositor-tree rebuild and re-raster. Four cut targets for A. |
| `w78-esd-cycle2.json`, `w78-esd-cycle3.json` | Raw per-snapshot ExternalStringData and per-URL script censuses that the diff is built from. |

## Instruments added

- `--steady-state-diff` on the heap gate: snapshots the collapsed state after each of
  the last two cycles, so per-cycle growth excludes the one-time realm warm-up.
- `assessScriptRealmGrowth()`: diffs two censuses directly, so no assumption about how
  many realms a cycle creates enters the verdict. This is what caught W77's error.
- `selfTimeByEventName()`: per-thread cost by self time, so a wrapper like `RunTask`
  cannot absorb credit for its children — the same failure mode as the m20Q6 wrapper
  in W75.

## Snapshot ceiling, stated again

Snapshots serialize to ~2.3× `usedJSHeapSize` and `JSON.parse` fails above V8's max
string length. The two snapshots here are **304 MB (cycle 2) and 353 MB (cycle 3), both
parse**; six cycles produces ~560 MB and dies. All numbers are from a **3-cycle** run.

## The correction to W77

W77 retracted W76-P2B's script-source attribution on the falsifier "×4 after three
cycles, not ×10". That expectation assumed a leak would retain all three peer realms
every cycle (1 + 3×3). The real rate is **one realm per cycle**, which produces exactly
1 + 3 = 4 copies at three cycles — indistinguishable from bounded retention in a single
snapshot.

The two-snapshot diff separates them decisively: 52 URLs held ×3 at cycle 2 become 53
held ×4 at cycle 3. Every module gains one copy per cycle.

So W76-P2B's attribution was right, my W77 retraction of it was wrong, and the rate is
now measured rather than inferred. What survives from W77 unchanged: the ×4 duplication,
the 61.7 MB of standing redundancy, the retainer chain naming, and the refutation of
cache-shaped retention — non-script external strings are flat at 0.50 MB across the
cycle.
