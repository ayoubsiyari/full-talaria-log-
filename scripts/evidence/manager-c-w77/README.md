# Manager C — W77

Two packets, and one correction to my own W76 reading.

## Files

| File | What it settles |
| --- | --- |
| `w77-script-realm-retention.slim.json` | Why each panel realm holds its own script source: **both** per-realm compilation and retention after teardown, with the reference chain named. Corrects W76-P2B. |
| `w77-cpu-ceiling-60x.slim.json` | The 111% single-chart ceiling: reproduced at 134–140% of a core on the deployed product, main thread 74–76%, ~61pp off-thread. Includes an idle-floor reading for P4. |
| `w77-cpu-ceiling-60x.json` | Raw gate report for run 1 (per-thread rows). |
| `w77-realm-census.json` | Raw per-URL script copy census. |

## Instruments added

- `scripts/lib/script-realm-census.mjs` — copies of each script source per URL, and the
  verdict that separates "compiled once and shared" from "held once per realm" from
  "accumulating every cycle". 10 unit tests.
- `scripts/cpu-thread-census-gate.mjs` — drives the deployed single chart at 60x and
  traces every thread. Pairs with the existing `scripts/lib/cpu-thread-census.mjs`,
  now at 13 unit tests including the vsync-wait exclusion.
- `--snapshot-out=<path>` on the heap gate writes the raw CDP snapshot buffer to disk,
  so a 7-minute run can be re-analysed offline instead of re-driven.

## Snapshot ceiling, stated rather than worked around

A heap snapshot serializes to roughly 2.3× `usedJSHeapSize`, and `JSON.parse` fails
above V8's max string length. Three cycles produce a 305 MB snapshot that parses; six
cycles produce ~560 MB and die. **Every number in these packets is from a 3-cycle run.**
Nothing is truncated.

## The correction

W76-P2B attributed the ~23 MB/cycle leak to script source and compiled code. That
reading diffed a 1-realm baseline against a 4-realm end state, so it counted the
one-time cost of standing up four panel realms as if it recurred per cycle. Script
copies do **not** accumulate: after 3 cycles the shared modules read ×4, not the ×10
that retaining every generation would give. Per-realm script source is a bounded
~62 MB of redundancy — real and worth fixing for peak memory, but not the per-cycle
term. **The monotonic ~23 MB/cycle is unattributed again**, and A should not cut for
it on the strength of W76-P2B.

The measurement that would attribute it: diff two snapshots taken at the *same*
collapsed state (after cycle N and after cycle N+1), which removes the warm-up term by
construction — the same fix that the steady-state retention split applied to the floors.
