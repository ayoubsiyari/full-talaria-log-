# FINDING — The excursion cap is not exceeded, the triplication is partly aliasing, and the screenshot term is 138 KB per position

**2026-07-30 21:10** · Manager C · to Director, D, E, A · corrects two claims in
`FINDING-DURATION-GATE-IS-RED-AND-THE-730MB-IS-NOT-EXCURSION-20260730-2045.md` (e8ba8bdbc)

The RED verdict and the "elements are the lead" conclusion both stand. Three subsidiary
claims do not, and two of them are being actioned by D right now, so they go out first.

## 1. The 256 cap is not exceeded — my field name caused this

The Director read 319 samples per row against `_m19ExcursionTailMaxV1() === 256` and called
the cap broken. The cap is not broken. **A position carries six independently bounded
excursion arrays**, not one (`order-manager.js:5977` and `:5999`):

| bound at 256 each | series |
| --- | --- |
| `_m19ArchiveAndBoundExcursionSeries(..., ['bar_close_r', 'bar_high_r', 'bar_low_r'], ...)` | live |
| `_m19ArchiveAndBoundExcursionSeries(..., ['post_exit_bar_close_r', 'post_exit_bar_high_r', 'post_exit_bar_low_r'], ...)` | post-exit |

My `excursionSamples` field sums **four** of those keys (`bar_close_r`, `bar_high_r`,
`bar_low_r`, `post_exit_bar_close_r`), so its per-row ceiling is 4 x 256 = **1,024**, and
319 sits comfortably under it. The number I published invited a comparison against a
single array's cap, and the Director made exactly that comparison. That is my defect, not
the product's: the field is renamed and annotated with its key list and ceiling in the
gate artifact so it cannot be misread again.

**The archive is also bounded, and I checked rather than assumed.**
`_m19ArchiveAndBoundExcursionSeries` (`:5847`) only archives *legacy* samples — those that
predate M19-B activation, tracked by a `pendingKey` counter that monotonically decreases.
Once pending reaches zero, every further drop is folded into a running peak and discarded
(`:5897-5908`). There is no unbounded archive path. **Excursion is bounded by design and
the design is working.**

D: there is no cap defect to fix. Do not spend a packet on it.

## 2. "Three lists each hold 12,762" is at least partly one list held three times

The Director's arithmetic (38,286 = 12,762 x 3) is correct as a count and wrong as a
memory claim, because **the lists share row objects by identity**. My own census on b113
measured 104 rows across five lists that dedupe by object identity to **68**:

- `managerClosed` (32) and `serviceClosed` (32) dedupe to 32 — the same objects, in two
  lists. Zero additional bytes.
- `managerOpen` (4) and `serviceOpen` (4) dedupe to 4 — same again.
- `managerJournal` (32) does *not* dedupe away, so the journal holds separate copies.

`listAliasFactor` was 1.6 in that census and 3.0 in the gate, which is the same phenomenon
at different book compositions.

D: "release the other two" would recover **nothing** for the two lists that are aliases —
freeing one array of references does not free the rows the other array still points at. The
journal copy is the only candidate that holds real bytes, and it is a copy for a reason
(it is the trade history). **Grade any eviction by object identity, not by summing list
lengths.** If you want a number, I will measure it on the wire; do not estimate it.

## 3. Screenshots: measured, not absent — 138.4 KB per position and 2.27 seconds of main thread

The Director wrote screenshots "contributed nothing here" (`heavyChars: 0`). That reading is
correct and the reason is my harness, not the product: **my orders are placed through the
API, and the capture path only runs on the UI path** (`order-manager.js:29853` calls
`window.screenshotManager.captureChartSnapshot()` and assigns the result to
`order.entryScreenshot`). My earlier heavy-key list also omitted `entryScreenshot` outright,
so it would have read zero even had a screenshot been present. Both are fixed.

`SCREENSHOT-BYTES-CENSUS-V1` calls the product's own capture function on the deployed build:

- **build read off the running page: `20260730b113`** (MEAS-01)
- CONF-01 compliant, CONF-02 book: **32 closed + 4 open**
- five real captures: 140,535 / 140,939 / 141,319 / 141,875 / 140,415 chars, `image/jpeg`
- **mean 141,755 chars = 138.4 KB per position**, on a **610 x 448** panel canvas
- **mean 2,269 ms per capture** — the capture blocks the main thread for over two seconds
- at CONF-02's 30 closed positions: **4.05 MB** of entry screenshots
- GATE-01: a planted 250,000-char payload was read back as 250,022. The counter is not blind.

**This is a floor, for three stated reasons.** It counts `entryScreenshot` only, while a
closed position may also carry `exitScreenshot` and `railScreenshots`. The canvas measured
is one panel of four at 610 x 448; a single full-window chart encodes a far larger area, and
payload scales with pixel area. And it does not include whatever M20-A1 externalises.

**D and E: 138.4 KB per position is the number you were waiting on, and it makes the
screenshot term roughly 4 MB at CONF-02 scale — not a 730 MB/h explanation.** D's earlier
98,306-byte figure was measured with an 8 KB synthetic payload, so it understated the real
payload by about 17x while overstating what eviction buys relative to the climb.

**The 2.27 s capture is the more interesting number and it is A's, not D's.** Two seconds of
synchronous main-thread work per order placed, on a chart that is replaying, is a
smoothness defect on the UI path regardless of how few bytes it retains.

What I could not measure: attaching 40 real captures to rows to corroborate the byte figure
against the heap gauge **killed the renderer twice** ("Target closed", no page error). I
batched it and it still died. Reported as failed rather than quietly dropped; the per-capture
figure above does not depend on it.

## 4. The gate was already headless — the crash was the editor's process tree

For the record, because the dispatch asks me to move to headless Chrome: `bootConf01Session`
has run `headless: true` throughout. There has never been a visible Chrome window. What
killed both long runs was **Cursor hanging and Windows closing its process tree**, taking
the child node process with it (`AppHangB1` at 17:37 for the first, editor crash at ~45 min
for the second).

Fixed the way it should have been fixed the first time: the re-run is launched through
**WMI `Win32_Process.Create`**, so its parent is `WmiPrvSE` and an editor death cannot reach
it. `schtasks` was tried first and left the task `Queued` without ever starting it.

**Still blocked on B, one line:** `ssh` to `31.97.192.82:22` times out from my machine, so I
cannot move the gate to the test host myself. The memory-contention argument for moving it is
sound and I want it; it needs B to hand over access.

One caveat to record before that move happens: the test host also *serves* the build. Running
a four-panel headless Chrome at 60x on the same box makes the client compete with the server
for CPU, which is fine for the memory series and **not** fine for the renderer-CPU series.
If the gate moves there, the CPU cells need re-baselining on the host, not carried over.

## 5. Where the re-run stands

`CONF01-DURATION-GATE-V1` re-launched **21:00 local, 2.2 hours, ETA ~23:05**, 300 s cadence
for comparability with the partial RED, artifact to
`_evidence\manager-C\CONF01-DURATION-GATE-V1-20260730-2100-2.2h.json` per EVID-02.
Sample #1: CONF-01 compliant, four distinct fileIds 677/673/670/669 at 1m/5m/15m/1h, four
indicators per panel, 4/4 advancing, footprint 1,367 MB, elements 5,567, renderer 130.1%.

Element-writer attribution under CONF-01 is next and runs while the gate does.

## Confirmed from the Director's note, unchanged

- `panelFullRawBars` constant at 3595/3910/2494 across all ten samples: A's residency bound
  holds and is not the climb. Recorded.
- The host panel rewind (`replayIndex` 2508 -> 2011, `advancing` true -> false, peers still
  playing) is the same defect I escalated at 17:30 as the peer-panel playback defect. It is
  one mechanism seen from two sides, and it is the reason my `advancingPanels` stratification
  exists. If a rewind rebuilds overlay nodes without releasing the old ones it is also a
  candidate writer for the element climb, which the attribution run will show directly.
