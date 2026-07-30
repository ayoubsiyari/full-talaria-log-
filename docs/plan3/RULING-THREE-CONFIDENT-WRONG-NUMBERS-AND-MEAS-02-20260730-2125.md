# RULING — Three confident wrong numbers, and MEAS-02

**2026-07-30 21:25** · Director · binds all managers and the PO's own testing

## B confirmed the wire, then found something worse

`20260730b113` is live and proven off the running page: 65 stamped references in the served
shell, 167 stamped requests in the access log, stamp baked into the image, container
`talaria-homepage:canary-20260730b113` up since 13:23. All four window-claim P0 markers are
present in the served `chart-window-limit.js` — `CONTROL_TIMEOUT_MS`, `controlFetch`,
`AbortController`, `__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1`. `MEAS-01` satisfied.
Canary untouched: HTTP 200, 8 containers up, 36 GB free, no recreate.

While proving C's setup on the host, B found **three instrument traps, each of which returns
a confidently wrong number rather than an error.** This is the same failure class that has
cost this plan more time than any defect: capability loss without failure.

### Trap 1 — the wrong accessor reads as a broken harness

`getActiveChart()` is the real accessor. A probe reading `window.chart` reports `bars: 0`.
Zero is indistinguishable from a harness that never attached, so a probe can silently
measure nothing and be believed.

### Trap 2 — top-page request listeners do not see iframe traffic

`page.on('request')` on the top page does not observe data requests made inside panel
iframes. B flagged that this is the same shape as its own earlier "zero fetches during play"
result in B-0204 and has re-opened it for re-check, unprompted. That is the correct instinct
and it is recorded as such.

### Trap 3 — `performance.memory` is per-realm

`performance.memory` reports the JS heap of **the realm it is called in**. With four panels
each holding 28 MB, a main-frame reading says 28 while the true total is 112. B identifies
this as the error behind the old 131-192 MB figures.

## What this invalidates, and what survives

**The 730 MB/h survives.** C's duration gate does not use `performance.memory`. It reads
OS-level process private memory broken out by process type. First and last sample:

| | first | last | delta over ~45 min |
| --- | --- | --- | --- |
| total private | 1352.3 MB | 1932.5 MB | +580 MB |
| page renderer private | 890.4 MB | 1451.5 MB | +561 MB |
| renderer (by type) | 946.1 MB | 1506.6 MB | +561 MB |
| gpu | 298.1 MB | 316.9 MB | +19 MB |
| browser | 60.5 MB | 61.7 MB | +1 MB |

This is realm-agnostic and process-wide, so Trap 3 does not reach it. It also locates the
climb: **the renderer process accounts for effectively all of it.** GPU and browser are flat.
That corroborates the DOM/layout/paint reading and E's detached-overlay lead.

**The PO's own console readings were undercounting.** The PO has been reading
`performance.memory` in the top-frame console. In multichart that is one realm out of five,
and it is JS heap only — it never included DOM, layout, paint or GPU. The PO's numbers were
correct about *direction* and badly low about *magnitude*. Absolute figures from those runs
are withdrawn; the trend observations stand.

**Anything else resting on the three traps is unproven until re-checked.** B has taken B-0204.
The old 131-192 MB figures are withdrawn.

## Ruling — MEAS-02

**A probe does not produce a number until it has demonstrated it is reading a live value at
the right scope.**

Three specific obligations:

1. **Prove liveness.** A probe reports a known non-zero value from a known source before its
   real measurement counts. A reading of zero is presumed to be a detached probe, not a
   measurement of zero, until proven otherwise.
2. **Name the scope.** Any per-realm or per-frame API is either summed across every realm, or
   replaced with a process-level metric. A multi-realm page measured in one realm is a wrong
   number, not a partial one.
3. **Use the real accessor.** Probes go through the accessor the product uses. Convenience
   globals are not evidence.

`MEAS-02` sits beside `GATE-01`: a gate must be shown RED on a known defect, and now a probe
must be shown live on a known value. Both exist because this plan has repeatedly been misled
by instruments that succeeded at measuring nothing.

## Dispatch

**B — cut the train, it is now the schedule.** Three lanes are blocked on it: E's
`INDICATOR-EVICT` is not on the wire, D's TAL-01896 needs a build, and Rayan #8 is off-wire
and is a money-path freeze gate. Train carries Rayan #8's markers, TAL-01807b, TAL-01896,
E's `clearIndicators` fix, and D's excursion single-owner fix. Cut it rather than batch
further. Then finish the B-0204 re-check you opened.

**C — apply MEAS-02 to every gauge during the re-baseline.** Your duration gate is clean on
this and is now the reference instrument. Confirm no other gauge in the pack reads
`performance.memory`, uses `window.chart`, or listens for requests on the top page. Then run
the gate to full length on the host.

**A — the renderer is the whole climb.** Browser and GPU are flat; renderer went 946 to
1507 MB. Combined with E's narrowing to detached overlays in the separate-panel rebuild
paths, that is as tight as the lead is going to get before you dig.

**D and E — no action, informational.** Neither of your byte figures used a trapped API.

## The PO is owed a correction

The PO ran many heap tests on our instruction and reported numbers in good faith. Those
numbers were read through Trap 3. The PO must be told plainly that the readings undercounted,
that this is our error and not theirs, and that the tests were still useful because the trend
was real.
