# FINDING — The duration gate is RED, and the 730 MB/h is not excursion

**2026-07-30 20:45** · Director · A, C, D actioned · supersedes the excursion-memory framing

## The gate ran and returned a verdict

C's `CONF01-DURATION-GATE-V1` started 15:33Z, planned 2.2 hours, and died at roughly
45 minutes when the PO's editor crashed. It captured 10 samples at 5-minute intervals and
reached CONF-02 scale (40 closed trades, front-loaded then accumulating). That is enough
for a slope.

**Verdict: RED.** `DURATION-TREND-V1` reports climbing:

| metric | slope | 95% CI |
| --- | --- | --- |
| total footprint | +730.8 MB/h | [30.1, 1431.6] |
| page renderer footprint | +735.0 MB/h | [120.4, 1349.7] |
| DOM elements | +1333.5 /h | [290.7, 2376.2] |
| excursionSamples | +45530.1 /h | [33872.5, 57187.6] |

The confidence intervals are wide because the run was cut short. The sign is not in doubt;
the magnitude is. C re-runs to full length before any number here is quoted as final.

CONF-01 compliance is confirmed by the gate itself: four panels, four distinct fileIds
(677/673/670/669), four distinct timeframes (1m/5m/15m/1h), four indicators per panel,
orders open, playback advancing. This measurement carries acceptance weight.

## The excursion number is real, and it is not the memory monster

I framed excursion as the memory suspect. The gate's own data does not support that, and I
withdraw the framing. What it does show is two distinct defects:

**Triplication.** At the final sample, three separate lists each report *exactly* 12,762
excursion samples for the same 40 trades:

- `managerClosed`: 40 rows, 12,762 samples
- `managerJournal`: 40 rows, 12,762 samples
- `serviceClosed`: 40 rows, 12,762 samples

Total 38,286 = 12,762 x 3. The same excursion path is retained in three places at once.

**The cap is exceeded.** `_m19ExcursionTailMaxV1()` returns 256. Observed is 319 samples
per row (12,762 / 40), up from 61 per row at the first sample. Either the cap is not applied
on this path or it bounds a different array than the one being counted.

Both are defects and both are killed. But 38,286 small sample objects is single-digit MB
unless each sample is far larger than anyone expects. **Excursion is not 730 MB/h.** D
produces the byte figure rather than anyone estimating it.

## Screenshots are refuted for this run

`heavyChars: 0`, `heavyMB: 0`, `rowsWithHeavy: 0` on every list at every sample. The
per-order base64 screenshot hypothesis from
`FINDING-ORDER-EXCURSION-IS-A-TIME-LEAK-NOT-A-MEMORY-LEAK` contributed nothing here. It is
not cleared in general — it is absent from this configuration.

## Where the 730 MB/h actually points

Unattributed. The strongest available signal is **DOM elements +1333/h paired with renderer
footprint +735 MB/h**. Renderer footprint covering DOM, layout and paint structures makes
element growth the leading candidate for the same slope.

Two things are ruled out as the source by this gate's own state block:

- `panelFullRawBars` held constant at 3595 / 3910 / 2494 across all 10 samples. A's
  residency bound is holding. Base-series retention is not the climb.
- `heavyMB` was zero throughout. Screenshots are not the climb.

`rawBars` did grow per panel, but that is replay advancing the playhead, which is expected.

## Incidental: the host panel rewound and stopped

Not what the gate was looking for, recorded because it is a live correctness defect.

Between the first and last sample the host panel (fileId 677, EURUSD, 1m) went:

- `replayIndex` **2508 -> 2011**, backwards
- `replayTimestamp` 1773252480000 -> 1773222660000, earlier in wall time
- `bars` 2508 -> 2012
- `advancing` true -> false, `advancedSimMs` 1800000 -> 0

while panels 673, 670 and 669 continued advancing normally. The host rewound roughly 500
bars and stopped, and the other three kept playing. This is the same family as the PO's
report that pressing play moved only some panels, and as the reported jump-to-earlier-time
on timeframe downshift. It is a candidate cause of DOM element churn if a rewind rebuilds
overlay nodes without releasing the old ones.

## Dispatch

**C — gates move off the PO's machine.** The 2.2h gate holds a four-panel multichart at 60x
for over two hours. The product under test is the memory subject itself, climbing 730 MB/h.
On a 24 GB machine alongside five editor windows at roughly 7 GB, this crashes the editor
and every crash costs a full run. The gate measures the build deployed to the test host, so
it does not need to run locally. Move it to headless Chrome on the test host; B holds host
access. Then re-run to full 2.2h length and tighten those confidence intervals. Attribute
the element growth to a writer under CONF-01: that is now the top instrument question.

**D — kill the excursion triplication, flagged.** Three retained copies of one excursion
path is wrong regardless of byte count. Establish which of the three lists is authoritative,
release the other two, and find why per-row samples reach 319 against a 256 cap. Produce the
byte figure at CONF-02 scale. Do not claim a memory win until C grades it on the wire.

**A — DOM element growth under CONF-01.** +1333 elements/h against +735 MB/h renderer is the
leading candidate for the actual climb. Find the writer that adds elements without releasing
them. The host rewind above is a plausible trigger and worth checking first. Your residency
bound is confirmed holding and is not the source.

## Rules applied

`DUR-01` (acceptance is a slope, not an instant) is what produced this verdict; a single
reading would have shown nothing. `CONF-01` and `CONF-02` compliance is machine-checked in
the artifact. `DECL-01` holds: nothing here is declared dead by the Director. `EVID-02`
applies to the re-run — the artifact goes to `_evidence\manager-C\`, not the workspace.
