# FINDING — the logout staircase is Chrome's back-forward cache, and the reset is clean

**2026-07-31 11:55** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 item 7 · **Rules applied** `DECL-01`, `KILL-02`, `GATE-01`
**Instrument** `SESSION-RESET-V1`, two arms · **Artifacts**
`SESSION-RESET-20260731.json`, `SESSION-RESET-NOBFCACHE-20260731.json`

## Verdict first

**The reset is clean.** Logging out and back in does not accumulate. The staircase I measured first —
documents 3 → 6 → 9 and heap 17 → 32 → 46 MB across three cycles — is **Chrome's back-forward cache**
holding the outgoing document so that Back is instant. Disable it and the staircase vanishes completely.

I did not publish the first arm. The shape was clean, monotonic and exactly what a retained-realm leak
looks like, which is precisely why it needed a discriminating test before it became a finding.

## The A/B

Three logout→login cycles in one browser profile, same account, same build, first paint measured after a
forced collection.

| measured at first paint | bfcache ON (default) | bfcache OFF |
|---|---|---|
| **documents** | **3, 6, 9** | **2, 2, 2** |
| **JS heap MB** | **17.1, 31.6, 46.1** | **12.3, 13.7, 13.7** |
| footprint MB | 369.2, 445.2, 475.8 | 371.9, 393.2, 386.6 |
| first paint seconds | 17.1, 19.1, 19.1 | 17.3, 19.8, 19.1 |
| localStorage bytes | 1797, 1797, 1797 | 1797, 1797, 1797 |
| MB reclaimed on logout | −19.2, 3.4, 22.3 | **28.8, 37.1, 49.0** |
| **growth across 3 sessions** | **+106.6 MB** | **+14.7 MB** |
| verdict | not clean | **clean** |

With the cache disabled, documents are flat at 2, heap is flat at 13.7 MB, and footprint is
non-monotonic — 371.9 up to 393.2 then back down to 386.6 — which is noise, not growth. Logout returns
**28.8 to 49.0 MB** instead of essentially nothing.

## Why this matters beyond item 7

**This shape has now misled this plan twice.** The Director read a documents staircase as retained
iframes on 30 July and retracted it when the PO's full alternating cycle showed the counts falling back.
That retraction was right, and it was made without a mechanism. Now there is one, with a reproducible
A/B: **a rising, non-returning document count across navigations is the expected behaviour of a browser
feature.** Nobody needs to re-litigate it a third time, and any future documents staircase should be run
against `--disable-features=BackForwardCache` before it is called retention.

It also closes the loop on the item 7 source reading. Logout is a cross-document navigation, so the realm
*is* discarded — and with bfcache off the memory comes back too, 28.8 to 49.0 MB per cycle. Under default
Chrome it does not come back promptly, but that is the cache holding it deliberately, not our teardown
failing.

## What is now settled on item 7, in full

| question | answer | how |
|---|---|---|
| Does logout reload or is it same-document navigation? | **Reloads.** `location.href = /login/`, cross-document. | source |
| Does the realm survive? | **No.** | source, confirmed by documents returning to 2 with bfcache off |
| Does the memory come back? | **Yes, 28.8–49.0 MB per cycle**, once the browser cache is not holding it | measured, both arms |
| Storage bytes across three sessions? | **Flat. 1,797 bytes, identical in all six readings.** Storage is not a term. | measured |
| First-paint cost across sessions? | **Flat.** 17.1 → 19.1 s and 17.3 → 19.1 s. The 2 s step appears in BOTH arms, so it is warm-cache variance, not accumulation. | measured |
| Service worker pinning a stale shell? | **No.** 0 registrations, not controlled, and `sw.js` caches nothing. | source + measured |

**Item 7 is closed.** `X1` and `X2` are answered and nothing in them is a defect.

## One number that is not about the reset, and is worth keeping

First paint on a **single chart** is **17.1 seconds** to a settled, painted chart, and **369 MB** of
footprint. The four-panel figure from the same morning is **1,122 MB**. Neither is a leak and both are
baseline, which is where the priority now sits.

## For the Director

- Item 7 closed, no defect. Both halves of `X1` and all of `X2` answered.
- **Recommend adding one line to the harness standard**: any measurement that counts documents or
  compares heap across a navigation must state whether bfcache was enabled, exactly as `MEAS-01` requires
  a build stamp. An unstated bfcache turns a browser feature into a leak on paper, and it did.
- The 14.7 MB residual drift across three sessions in the clean arm is within the non-monotonic noise of
  the same series and I am **not** claiming it as growth. If anyone wants it settled, it needs ten cycles
  rather than three, and I would rather spend that machine time on the baseline.
