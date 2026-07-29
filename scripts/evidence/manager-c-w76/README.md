# Manager C — W76 evidence (slim)

Dataset-count calibration + CPU attribution correction. tier=mid model=cursor-grok-4.5

| File | What |
|---|---|
| `w76-dataset-count-calibration.slim.json` | **P0** Director's hypothesis CONFIRMED. 1 dataset plateaus (~0/cycle); 4 distinct datasets retain **23.28 ± 2.73 MB/cycle**, monotonic, forced-GC. Gap closed |
| `w76-cpu-ceiling-attribution-correction.slim.json` | **P3** W75's ceiling attribution retracted (named an M20-Q6 wrapper, not product code). CPU-THREAD-CENSUS-V1 landed; 111% run still OPEN |

## The one-line answer to the 20x gap

The harness pinned all four panels to one `fileId`. Four panels sharing one
dataset pipeline plateaus at ~221 MB and stops growing. Four **distinct**
symbols at 1m grow 23 MB/cycle and never plateau — same panel count, same
workload, same build, same instrument.

The PO reads ~13. The harness now reads 23.3, so it **overshoots** by ~1.8x
instead of under-reading by 20x.

## Two instrument corrections worth knowing

1. The "mean MB/cycle" this gate has reported is net growth ÷ N, and net growth
   is dominated by one-time four-panel expansion. That is how the same product
   yielded 0.69, 16, 24, 37 and 45 MB/cycle depending on GC policy, hold time and
   cycle count. `HEAP-CYCLE-STEADY-STATE-RETENTION` now separates warm-up from
   retention and requires growth to survive to the tail of the run.
2. Without a forced GC the floors swing ±80–94 MB on GC timing alone, with
   single deltas of −165 MB. No rate can be recovered from those runs; the
   PO-hand arms are directional only. Forced-GC floors are the gradable
   instrument — and the reason forced GC previously looked like an under-read was
   the dataset configuration, not the GC.
