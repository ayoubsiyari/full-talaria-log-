# FINDING — memory residue and lag are the same fault line: independent datasets (2026-07-29 18:10)

## The two measurements

**Memory, 2026-07-29 01:45** (`FINDING-RESIDUE-IS-SYMBOL-TF-CONDITIONED`), panel count, indicator
count, replay speed and duration all held constant:

| Configuration | Residue |
|---|---|
| 4 panels, same pair, same TF | ~67 MB |
| 4 panels, distinct tickers and TFs | ~367 MB |

**Lag, 2026-07-29 18:04** (PO, on b99, four panels):

| Configuration | Behaviour |
|---|---|
| all four same symbol, same TF | plays nicely |
| each panel distinct symbol and TF | laggy, most panels pause for too long |

**The same variable governs both.** Not panel count. Not indicator count. Not speed. The number of
**distinct datasets**.

## Why this is one mechanism and not two

Four panels on `EURUSD 1m` need one dataset; they mirror the host. Four panels on four pairs need
four independent datasets, each separately fetched, covered, seeked and painted. Every
panel-count-based hypothesis we pursued this week — parent-side per-panel state, panel-id-keyed
purges, engine graphs — missed for the same reason: **they were keyed on the wrong thing.**

A's Cluster C probe independently landed on the same path from the lag side: independent-pair panels
starve when `ensureReplayDataCoversTimestamp` keeps a cover promise **in flight** while
`replayTimestamp` advances. Paint goes to zero; state keeps moving. That is exactly the PO's ES/NQ
report — pause makes the frozen panel snap to where the host got to.

So Cluster C is not a cosmetic panel bug. It is the visible symptom of the architecture that also
produces 5.5x the memory residue.

## What this retires

- **Client-side storage as a hoarding vector.** PO's Application panel on the canary: 637 kB
  IndexedDB, 637 kB total, against a 1,677 MB quota. Storage growth is not a term. Closed.
- **Panel-count framing.** Any future hypothesis keyed on "per panel" should be treated as suspect
  unless it explains why identical panels cost 67 MB and distinct ones cost 367 MB.

## What it does not yet settle

- Whether the residual ~13 MB/cycle survives *because* of the independent-dataset path or
  independently of it. Ten leak shots did not move that number (b85 ~13.3, b99 ~12.8), and several
  of those shots capped caches. **Capping caches did not change the leak**, which argues the
  residual is not cache-shaped.
- `workers: +1` per multichart cycle, still unattributed, still holding its own invisible heap.
- Whether restoring aggressive prefetch changes the diverse-symbol lag. The PO ran a console command
  during this test; which one is unconfirmed. If the four hoarding flags were set and the lag
  persisted, the cache-starvation theory is refuted and the independent-dataset pipeline is the
  whole story.

## Consequence for priority

Cluster C is promoted. It was ranked as a six-ticket panel-freeze bug; it is now the entry point to
the mechanism behind both the lag and the majority of the memory residue. A is already on it with
the correct probe.

The right next question is not "which cache leaks" but **"what does the independent-dataset pipeline
allocate and retain per dataset, and why does its cover promise stall."**

## Note on the PO's architectural theory

The PO proposed that the charts were built to hoard for speed, that we never wrote the eviction
side, and that today's caps have starved them. The first two are confirmed by A's own shots —
LEAK-F/G/H/I/J are literally cap-and-gate additions to uncapped caches. The third does not survive:
a single chart played smoothly on the same build with the same caps, and the two measured lag
mechanisms are scheduling faults, not cache misses. The eventual deliberate cache layer with
declared budgets and real eviction remains the right destination, but it should be designed *after*
the independent-dataset pipeline is understood, or it will be built around the wrong key.
