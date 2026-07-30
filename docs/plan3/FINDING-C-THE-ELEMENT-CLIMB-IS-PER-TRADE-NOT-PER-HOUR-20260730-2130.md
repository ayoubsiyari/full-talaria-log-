# FINDING — The element climb is per closed trade, not per hour, and the partial verdict is UNRESOLVED not RED

**2026-07-30 21:30** · Manager C · to Director and A · re-grades the artifact preserved at
`_evidence\manager-C\CONF01-DURATION-GATE-V1-20260730-1533-RED-partial.json`

I re-graded the Director's preserved partial through `CONF01-DURATION-REGRADE-V1` — the same
samples, my corrected grader, no new browser time. Three results, and the second one is the
one A should act on tonight.

## 1. The verdict downgrades: RED -> UNRESOLVED, and the climb gets *steeper*

DUR-01 requires a two-hour span. The partial has **0.748 h**, so no series can return a
definitive verdict and the honest grade is **UNRESOLVED** with the climbs marked
**PROVISIONAL**. The Director's RED was read off my own gate before that rule was wired in;
I am not letting a 45-minute span carry a shipping verdict, even one that agrees with me.

The magnitude, however, sharpens rather than softens once the samples are made homogeneous.
Stratifying on playback state (four samples where all four panels were advancing, six
stalled or partial) gives:

| metric | all samples (Director) | fully-advancing stratum |
| --- | --- | --- |
| total footprint | +730.8 MB/h, CI [30.1, 1431.6] | **+1,066.6 MB/h, CI [700.3, 1432.8]** |
| page renderer footprint | +735.0 MB/h, CI [120.4, 1349.7] | **+1,042.1 MB/h, CI [573.9, 1510.4]** |

The Director's objection to the interval was right and stratification is what answers it: the
lower bound moves from +30 MB/h to **+700 MB/h**. The stalled samples were diluting the
slope, because a panel that has stopped advancing has stopped allocating. **The sign is not
in doubt and the lower bound is now far from zero — but the span still owes DUR-01 two hours,
which the run now in flight provides.**

## 2. THE LEAD: elements track CLOSED TRADES, not time — 31.7 elements per closed trade

This is the answer to "attribute the element growth", and it arrives from data already
collected rather than from the attribution run.

- `elementsPerClosedTrade`: **CLIMBS, +31.7 elements per closed trade, CI [10.9, 52.5]**
- `elements` against time: +1,333.5/h (advisory — accumulation is expected under CONF-02)

Those two are the same fact. Closed trades went 5 -> 40 across 0.748 h, roughly 47 trades/h,
and 47 x 31.7 = ~1,490 elements/h, which contains the observed +1,333/h. **The entire element
climb is accounted for by trade count.** Nothing is left over for a time-driven writer.

A: the writer is on the **order path**, and it adds about **32 elements per position that
never come back when the position closes**. That is a much smaller search than "find what
adds elements" — order lines, entry/exit markers, labels, and the rail are the candidates,
and the test is whether closing a position removes the nodes it created. I will name the exact
call site with `ELEMENT-WRITER-ATTRIBUTION-V1` (GATE-01 passed, waiting only for the duration
gate to finish so two sessions do not contend for the window claim), but you do not have to
wait for me to start auditing order-close teardown.

Note this also reframes the Director's rewind hypothesis. A rewind rebuilding overlay nodes
would give a **time**-driven climb; what the data shows is a **trade**-driven one. The rewind
is still a live defect, but it is not the element writer.

## 3. The excursion cap is confirmed inside its bound, from the same data

`excursionSamplesPerClosedTrade`: **BOUNDED, 317.7 per closed trade, CI [205.7, 429.7]**,
against a ceiling of 1,024 (four counted arrays x 256). This corroborates
`FINDING-C-EXCURSION-CAP-IS-NOT-EXCEEDED-...-2110` from an independent direction: excursion
is bounded per position and the bound is holding. D has no cap defect to chase.

Also from the same regrade, for the record:

- `heavyFieldMB`: **BOUNDED at 0** — screenshots absent from this configuration, because
  API-placed orders never run the capture path. The real per-position cost is 138.4 KB,
  measured separately on the product's own capture function.
- `listeners`: **FALLS** -1,813/h — listener cleanup is working, not leaking.
- `nodesAfterGc`, `rendererCpuPercent`, `gpuCpuPercent`, `orderLoopMsPerTick`:
  INDETERMINATE or INSUFFICIENT at this span. Not evidence of flatness; evidence of a short run.

## Status of the re-run

Segment 1 launched **21:03**, 2.2 hours, CONF-01 compliant on b113 with four distinct
fileIds at 1m/5m/15m/1h and four indicators per panel, ETA ~**23:15**.

It runs under a supervisor that records each attempt's exit code, beside a machine watcher
sampling free memory and the process census every 30 s. That is because **four duration runs
have now been lost**, the most recent one silently twelve minutes in with no exception, no
browser disconnect, no node error and no Windows event — cause unknown, and I would rather
say so than invent one. The supervisor exists so a fifth loss produces a diagnosis.

Artifacts are going to `_evidence\manager-C\` and will be copied to the shared evidence root
at `talaria1\_evidence\manager-C\` on completion, where the preserved partial lives.
