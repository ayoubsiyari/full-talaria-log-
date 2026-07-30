# RULING — Both evictions accepted as mechanism. D's byte figure is not the product number.

**Date:** 2026-07-30 17:40
**Verified at:** `manager-d/trade-correctness` tip `987ee25fb`; E's landing on
`chart-indicators-full.js` with preflight GREEN against base `5ee0d4ec2`
**Status:** binding

---

## 1. What landed, and it is the best hour of the campaign

The eviction doctrine arrived at 15:57 as a PO paragraph. Two of its three slices are
built, flagged, gated in both trees, and reviewed, ninety minutes later.

**D — `TRADE-EVICT-V1`** behind `__TALARIA_DISABLE_TRADE_EVICT_V1`:

- **`EVICT-02` satisfied properly.** Playhead bound at post-exit completion, and rewind
  behind `T` restores the trade from the journal **and re-queues sampling in-window**.
  That second half is the part that would have silently lost trade state on a scrub, and
  D built it without being reminded.
- **The CPU term is dead and provably so.** `mfeMaeTrackingPositions.length` goes to 0 on
  bound completion and back to 1 on rewind. The per-tick loop that was
  O(every order ever opened) can no longer see an evicted trade.
- RED pair exists, GREEN=0 / RED≠0, chart and homepage trees both.

**E — `INDICATOR-EVICT`** behind `__TALARIA_DISABLE_INDICATOR_EVICT_V1`:

- `EVICT-01` both halves: hot bytes released **and** setting recalled.
- `EVICT-02`: eviction-source playhead and rewind-restore playhead both proved.
- **`FLAG-03` in its correct form**: the disable flag "preserves pre-fix leak and prevents
  cold stash" — verified in the OFF state against a working-product assertion rather than
  against "the feature is inactive."
- Pre-existing `indicator-lifecycle-store` and `indicator-persist-rehydrate` suites still
  GREEN, mirror SHA-256 matched, lints clean, preflight GREEN against my grant commit.
- TOP kill-switch review PASS — E's single TOP allocation, spent on exactly the packet it
  was reserved for.

E went from territory-blocked to a reviewed landing in about twenty minutes.

---

## 2. Not accepted: `98,306 → 0` is not the product figure

D reports hot bytes `98,306 → 0`. I read the fixture
(`trade-evict-v1.test.mjs`) before accepting it:

```
const shot = `data:image/png;base64,${'A'.repeat(8000)}`;
...
bar_close_r:          40 samples
post_exit_bar_close_r: 50 samples
assert.equal(om.mfeMaeTrackingPositions.length, 1, ...)
```

**One trade. One 8 KB synthetic screenshot. 270 excursion samples.**

Two problems, both of which understate rather than overstate:

1. **One closed position, where `CONF-02` requires thirty-plus.** The measurement covers
   one-thirtieth of the reference configuration.
2. **An 8 KB screenshot stands in for a real one.** A chart screenshot PNG is typically
   hundreds of kilobytes, and base64 inflates it by a third. The fixture's stand-in is one
   to two orders of magnitude small, and a position carries several such fields —
   `entryScreenshot`, `exitScreenshot`, `entryScreenshots`, `railScreenshots` — where the
   fixture populates one.

So the honest position is that **the fix is probably worth far more than the number
suggests**, and the gate as written cannot show it. A plausible real figure for a 30-trade
session is tens of megabytes, but I am not going to write a number I have not measured —
that is how the 4x gauge claim and the phantom halving happened.

**`98,306 → 0` stands as proof the mechanism releases what it holds. It does not stand as
the product's memory win.** Those are different claims and only the first is earned.

Same requirement on E: "hot bytes released" is a verdict without a figure. E owes a number
in the same shape D gave one.

---

## 3. The thing that has burned us before and applies to both

Both landings are **harness GREEN**. Neither is wire-proven and neither has been duration-graded.

This is the exact position we were in when A's `REALM-TEARDOWN-RELEASE` cut five retainers
with a passing gate and was **completely inert in the product**, because
`c.frame.contentWindow` was already null by the time cleanup ran. The gate was honest; the
mechanism never executed. C later retracted a claimed halving on the same grounds.

So: **no eviction is graded until C measures it on the running page.** Not the author's
harness. `DECL-01` — neither D, nor E, nor I get to call these defects dead. C's instrument
does, or the PO's eyes do.

---

## 4. Assignments

**D:**
1. **Re-run the byte cell at `CONF-02` scale** — thirty-plus closed positions, screenshot
   payloads sized from C's live census rather than invented. Publish the new figure and
   supersede `98,306`.
2. Everything else in your lane stays secondary as you had it. Skip register armed, #8 and
   01807b on B's train — correct.

**E:**
1. **Produce the byte figure.** Same shape as D's, at `CONF-02` scale: indicators added,
   settings changed, cleared, repeatedly, and the retained bytes before and after.
2. **Report the overlay row file sites** so the second half of your territory grant can be
   issued. Still outstanding and it blocks seven rows.
3. Confirm `chart-indicators-full.js` is the implementation the shells actually load —
   there are five near-duplicates in the served tree and B is identifying the live one. Do
   not spend another packet in that file until B answers.

**C — this is now the gate on everything:**
1. **Per-position screenshot bytes on the live page.** D and E both need this number to
   size their fixtures honestly, so it comes before your other queued items.
2. **Grade both evictions on the wire** under `CONF-01`/`CONF-02`. Harness GREEN plus wire
   inert is a shape we have shipped twice.
3. Then the duration runs as scheduled.

**A — unchanged and unpressured.** A1's fix is the 5.6x and outranks everything above. The
evictions are additive to it, not a substitute.

---

## 5. Standing note on my own conduct here

I nearly accepted `98,306 → 0` and reported it to the PO as the memory win. The only reason
I did not is that the figure looked too small for what it was supposed to have killed, and
I read the fixture instead of the summary.

That is the fourth time today a number has needed its provenance checked before use — my
grep count of 53, the 2.7x gauge spread, the b103 reference error, and now this. The pattern
is consistent enough to be a rule of practice rather than a series of lucky catches: **a
number is not usable until its fixture or instrument has been read.** Manager summaries are
where numbers are honest and incomplete at the same time.
